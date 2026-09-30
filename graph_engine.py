"""Graph Engine Module for Cryptocurrency Laundering Trail Tracing.

Utilizes NetworkX to construct, traverse, and analyze transaction graphs.
Integrates with IngestionEngine from data_ingestor.py to perform breadth-first
search (BFS) multi-hop tracing, terminal VASP/mixer detection, cycle prevention,
and shortest-path identification to nearest exchanges.
"""

from collections import deque
from copy import deepcopy
import sys
from typing import Any, Dict, List, Optional, Set, Tuple

import networkx as nx

from data_ingestor import IngestionEngine, MOCK_LEDGER
from vasp_registry import identify_entity


class BlockchainGraphTracer:
    """Multi-hop blockchain graph tracer powered by NetworkX.

    Performs BFS traversal originating from a suspect wallet, annotates graph
    nodes with entity metadata and risk classifications, enforces terminal
    conditions for VASP hot vaults and sanctioned mixers, and calculates
    shortest paths to reachable exchanges.
    """

    def __init__(self, ingestor: IngestionEngine):
        """Initializes the graph tracer.

        Args:
            ingestor: An instance of IngestionEngine for retrieving outbound transfers.
        """
        self.ingestor = ingestor
        self.graph: nx.DiGraph = nx.DiGraph()
        self.terminal_targets: List[Dict[str, Any]] = []
        self.visited: Set[str] = set()
        self.root_address: Optional[str] = None

    def trace_path(
        self,
        root_address: str,
        max_hops: int = 5,
        min_amount_threshold: float = 0.01,
    ) -> Dict[str, Any]:
        """Performs BFS graph traversal starting from root_address.

        Workflow:
          1. Initializes directed graph (nx.DiGraph).
          2. Uses a BFS queue storing (current_address, current_hop_depth).
          3. Maintains a visited set to prevent cyclic laundering loops.
          4. For each address, retrieves outbound transactions using ingestor.
          5. Adds edges and node metadata (label, entity_type, risk_tier, nodetype,
             hop_distance) to the NetworkX graph.
          6. Terminal Condition: If a destination node is identified as 'vasp_hot'
             or 'mixer', records it as a terminal target and halts further expansion
             from that node.
          7. Respects max_hops to terminate traversal depth.

        Args:
            root_address: The suspect wallet address to initiate tracing from.
            max_hops: Maximum hop depth from root (default: 5).
            min_amount_threshold: Minimum transaction value in crypto to traverse (default: 0.01).

        Returns:
            Dictionary containing traversal summary and graph metrics.
        """
        if not root_address or not isinstance(root_address, str):
            raise ValueError("A valid root address string is required.")

        self.root_address = root_address.strip()
        self.graph = nx.DiGraph()
        self.terminal_targets = []
        self.visited = set()

        # Identify root entity metadata
        root_entity = identify_entity(self.root_address)
        self.graph.add_node(
            self.root_address,
            label=root_entity.get("name", "Root Suspect"),
            entity_type=root_entity.get("entity_type", "Unknown"),
            risk_tier=root_entity.get("risk_tier", "Unknown"),
            nodetype=root_entity.get("nodetype", "unattributed"),
            hop_distance=0,
            is_root=True,
            is_terminal=False,
            compliance_email=root_entity.get("compliance_email"),
            fiu_registered=root_entity.get("fiu_registered", False),
        )

        # BFS queue stores: (current_address, current_hop_depth)
        queue: deque[Tuple[str, int]] = deque([(self.root_address, 0)])
        self.visited.add(self.root_address.lower())

        while queue:
            current_addr, current_hop = queue.popleft()

            # Respect max_hops threshold
            if current_hop >= max_hops:
                continue

            # Retrieve outbound transfers for current address
            outbound_txs = self.ingestor.get_outbound_transactions(current_addr)

            for tx in outbound_txs:
                amount = float(tx.get("amount_crypto", 0.0))

                # Filter out transactions below the minimum amount threshold
                if amount < min_amount_threshold:
                    continue

                dest_addr = tx.get("to_address", "").strip()
                if not dest_addr:
                    continue

                dest_entity = tx.get("destination_entity") or identify_entity(dest_addr)
                dest_nodetype = dest_entity.get("nodetype", "unattributed")
                dest_name = dest_entity.get("name", dest_addr)

                # Add destination node with metadata if not yet present
                if not self.graph.has_node(dest_addr):
                    self.graph.add_node(
                        dest_addr,
                        label=dest_name,
                        entity_type=dest_entity.get("entity_type", "Unknown"),
                        risk_tier=dest_entity.get("risk_tier", "Unknown"),
                        nodetype=dest_nodetype,
                        hop_distance=current_hop + 1,
                        is_root=False,
                        is_terminal=False,
                        compliance_email=dest_entity.get("compliance_email"),
                        fiu_registered=dest_entity.get("fiu_registered", False),
                    )
                else:
                    # Update hop distance to minimum seen
                    existing_hop = self.graph.nodes[dest_addr].get("hop_distance", current_hop + 1)
                    if (current_hop + 1) < existing_hop:
                        self.graph.nodes[dest_addr]["hop_distance"] = current_hop + 1

                # Add directed edge representing the transaction
                self.graph.add_edge(
                    current_addr,
                    dest_addr,
                    tx_hash=tx.get("tx_hash", ""),
                    amount_crypto=amount,
                    timestamp=int(tx.get("timestamp", 0)),
                    from_address=current_addr,
                    to_address=dest_addr,
                )

                # -----------------------------------------------------------
                # Terminal Condition: vasp_hot or mixer
                # -----------------------------------------------------------
                # If destination is a known hot vault or privacy mixer, mark as
                # terminal target and do not expand outgoing edges further.
                if dest_nodetype in ("vasp_hot", "mixer"):
                    self.graph.nodes[dest_addr]["is_terminal"] = True
                    target_info = {
                        "address": dest_addr,
                        "label": dest_name,
                        "nodetype": dest_nodetype,
                        "risk_tier": dest_entity.get("risk_tier"),
                        "hop_distance": current_hop + 1,
                        "tx_hash": tx.get("tx_hash"),
                        "amount_crypto": amount,
                        "timestamp": tx.get("timestamp"),
                    }
                    if target_info not in self.terminal_targets:
                        self.terminal_targets.append(target_info)
                    # Halt traversal along this branch (do not enqueue)
                    continue

                # Enqueue unvisited intermediate nodes if within max_hops
                dest_norm = dest_addr.lower()
                if dest_norm not in self.visited:
                    self.visited.add(dest_norm)
                    if (current_hop + 1) < max_hops:
                        queue.append((dest_addr, current_hop + 1))

        return {
            "root_address": self.root_address,
            "max_hops": max_hops,
            "min_amount_threshold": min_amount_threshold,
            "total_nodes": self.graph.number_of_nodes(),
            "total_edges": self.graph.number_of_edges(),
            "terminal_targets": self.terminal_targets,
            "visited_count": len(self.visited),
        }

    def find_nearest_vasps(
        self,
        root_address: str,
        terminal_only: bool = True,
    ) -> List[Dict[str, Any]]:
        """Finds all reachable VASPs and ranks them by hop distance and timestamp.

        Traverses the graph to identify reachable nodes labeled as 'vasp_hot'
        or 'vasp_deposit'. Computes the shortest path using NetworkX and calculates
        the total transferred volume along that path.

        Args:
            root_address: The origin wallet address.
            terminal_only: If True, restricts to terminal nodes (vasp_hot endpoints
                           or un-swept deposits). If False, includes intermediate
                           deposit proxies.

        Returns:
            Ranked list of VASP matches sorted by shortest hop distance and timestamp.
        """
        if self.graph.number_of_nodes() == 0 or root_address not in self.graph:
            return []

        reachable_vasps: List[Dict[str, Any]] = []

        for node in self.graph.nodes:
            if node == root_address:
                continue

            node_attrs = self.graph.nodes[node]
            nodetype = node_attrs.get("nodetype", "")

            # Filter for VASP entities (hot vaults or deposit proxies)
            if nodetype in ("vasp_hot", "vasp_deposit"):
                # If terminal_only is requested, ensure node is terminal or leaf
                is_terminal = node_attrs.get("is_terminal", False) or (self.graph.out_degree(node) == 0)
                if terminal_only and not is_terminal and nodetype != "vasp_hot":
                    continue

                if nx.has_path(self.graph, root_address, node):
                    path = nx.shortest_path(self.graph, source=root_address, target=node)
                    hop_distance = len(path) - 1

                    # Compute total transferred volume and transfer timestamp along the path
                    total_volume = 0.0
                    path_timestamps: List[int] = []
                    for i in range(len(path) - 1):
                        u, v = path[i], path[i + 1]
                        edge_data = self.graph.get_edge_data(u, v, default={})
                        total_volume += float(edge_data.get("amount_crypto", 0.0))
                        ts = edge_data.get("timestamp")
                        if ts:
                            path_timestamps.append(int(ts))

                    latest_timestamp = max(path_timestamps) if path_timestamps else 0

                    reachable_vasps.append({
                        "vasp_address": node,
                        "label": node_attrs.get("label", node),
                        "entity_type": node_attrs.get("entity_type", "Centralized Exchange"),
                        "nodetype": nodetype,
                        "risk_tier": node_attrs.get("risk_tier", "Low"),
                        "hop_distance": hop_distance,
                        "path": path,
                        "path_str": " -> ".join(path),
                        "total_volume_crypto": round(total_volume, 4),
                        "transfer_timestamp": latest_timestamp,
                        "is_terminal": is_terminal,
                        "compliance_email": node_attrs.get("compliance_email"),
                        "fiu_registered": node_attrs.get("fiu_registered", False),
                    })

        # Rank by shortest hop distance, then by earliest transfer timestamp
        reachable_vasps.sort(key=lambda item: (item["hop_distance"], item["transfer_timestamp"]))
        return reachable_vasps


# ---------------------------------------------------------------------------
# Standalone Execution / Verification Check
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

    print("=" * 80)
    print(" BLOCKCHAIN GRAPH TRACER - NETWORKX BFS MULTI-HOP ENGINE")
    print("=" * 80)

    # Initialize IngestionEngine and BlockchainGraphTracer
    ingestor = IngestionEngine(mode="mock")
    tracer = BlockchainGraphTracer(ingestor)

    target_root = "0x_suspect_theft_initiator"
    print(f"\n[+] Executing BFS Path Trace from root: {target_root}")
    summary = tracer.trace_path(target_root, max_hops=5, min_amount_threshold=0.01)

    print(f"    * Total Nodes Traversed : {summary['total_nodes']}")
    print(f"    * Total Edges Traversed : {summary['total_edges']}")
    print(f"    * Visited Addresses     : {summary['visited_count']}")
    print(f"    * Terminal Targets Hit  : {len(summary['terminal_targets'])}")

    print("\n[+] Terminal Targets Enforced (Halting Conditions):")
    for target in summary["terminal_targets"]:
        print(f"    - [{target['nodetype'].upper()}] {target['label']} ({target['address']})")
        print(f"      Hop: {target['hop_distance']} | Risk: {target['risk_tier']} | Amount: {target['amount_crypto']} ETH")

    print("\n[+] Finding Nearest Reachable VASPs:")
    vasp_rankings = tracer.find_nearest_vasps(target_root)
    for idx, vasp in enumerate(vasp_rankings, start=1):
        print(f"\n  #{idx} Nearest VASP: {vasp['label']}")
        print(f"     Hop Distance  : {vasp['hop_distance']}")
        print(f"     Shortest Path : {vasp['path_str']}")
        print(f"     Total Volume  : {vasp['total_volume_crypto']} ETH")
        print(f"     FIU Status    : Registered ({vasp['compliance_email']})")

    print("\n" + "=" * 80)
    print(" VERIFICATION RESULT:")
    if vasp_rankings:
        nearest = vasp_rankings[0]
        expected_path = "0x_suspect_theft_initiator -> 0x_mule_account_alpha -> 0x_peeling_layer_01 -> 0x_dep_coindcx_user_4492 -> CoinDCX Main Inflow Vault"
        print(f" Shortest Path Matches Expected : {nearest['path_str'] == expected_path}")
        print(f" Nearest VASP Hop Count         : {nearest['hop_distance']} (Expected: 4)")
    print("=" * 80)
