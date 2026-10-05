"""VASP Attribution Scoring Engine for Cryptocurrency Laundering Traces.

Evaluates an identified laundering trail from a root suspect address to an
identified Virtual Asset Service Provider (VASP) endpoint.

Implements a deterministic confidence scoring model incorporating:
  1. Hop Distance Decay (D_h = alpha^(hop_count - 1), default alpha = 0.85).
  2. Value Preservation Factor (V_p = amount_received / amount_sent).
  3. Velocity & Continuity Factor (T_c based on inter-hop timestamp cadence).
  4. Heuristic adjustments:
     - Direct Sweep Bonus (+0.10) for confirmed VASP consolidation routines.
     - Mixer Proximity Penalty (-0.05 to -0.10) for mixer/privacy contamination.
"""

from copy import deepcopy
import sys
from typing import Any, Dict, List, Optional, Tuple

import networkx as nx

from data_ingestor import IngestionEngine
from graph_engine import BlockchainGraphTracer
from heuristics import LaunderingHeuristics
from vasp_registry import identify_entity


class VASPAttributionScorer:
    """Evaluates the attribution confidence of a cryptocurrency laundering trail."""

    def __init__(
        self,
        default_alpha: float = 0.85,
        weight_hop: float = 0.35,
        weight_value: float = 0.35,
        weight_velocity: float = 0.30,
        direct_sweep_bonus: float = 0.10,
        mixer_proximity_penalty: float = 0.05,
    ):
        """Initializes the attribution scorer with weighting and penalty parameters.

        Args:
            default_alpha: Geometric decay factor per intermediate hop (default: 0.85).
            weight_hop: Weight for Hop Distance Decay sub-score (default: 0.35).
            weight_value: Weight for Value Preservation sub-score (default: 0.35).
            weight_velocity: Weight for Velocity & Continuity sub-score (default: 0.30).
            direct_sweep_bonus: Confidence bonus for confirmed VASP rapid sweep (default: 0.10).
            mixer_proximity_penalty: Confidence deduction for parallel mixer contamination (default: 0.05).
        """
        self.alpha = default_alpha
        self.weight_hop = weight_hop
        self.weight_value = weight_value
        self.weight_velocity = weight_velocity
        self.direct_sweep_bonus = direct_sweep_bonus
        self.mixer_proximity_penalty = mixer_proximity_penalty

    # -----------------------------------------------------------------------
    # Core Deterministic Factor Calculations
    # -----------------------------------------------------------------------
    def calculate_hop_decay(self, hop_count: int) -> float:
        """Calculates geometric hop distance decay: D_h = alpha^(hop_count - 1).

        Args:
            hop_count: Total hops from root to destination (e.g. 1 hop = direct transfer).

        Returns:
            Decay factor in range (0.0, 1.0].
        """
        if hop_count <= 1:
            return 1.0
        return round(float(self.alpha ** (hop_count - 1)), 4)

    def calculate_value_preservation(
        self,
        amount_sent: float,
        amount_received: float,
    ) -> float:
        """Calculates value preservation factor: V_p = amount_received / amount_sent.

        Args:
            amount_sent: Initial crypto volume dispatched from root suspect wallet.
            amount_received: Crypto volume received by the destination VASP node.

        Returns:
            Preservation ratio in range [0.0, 1.0].
        """
        if amount_sent <= 0:
            return 0.0
        ratio = amount_received / amount_sent
        return round(float(min(1.0, max(0.0, ratio))), 4)

    def calculate_velocity_continuity(
        self,
        path_txs: List[Dict[str, Any]],
    ) -> Tuple[float, List[int]]:
        """Calculates velocity and continuity based on inter-hop timestamp deltas.

        Tight transitions (< 6 hours = 21,600s) indicate programmatic, rapid
        layering with high continuity (score ~1.0). Delays spanning days or weeks
        incur progressive penalties.

        Args:
            path_txs: Chronologically ordered list of transaction dicts along the path.

        Returns:
            Tuple of (continuity_score in [0.0, 1.0], list of inter-hop time deltas in seconds).
        """
        if not path_txs or len(path_txs) <= 1:
            return 1.0, []

        hop_scores: List[float] = []
        deltas: List[int] = []

        for i in range(len(path_txs) - 1):
            t_curr = int(path_txs[i].get("timestamp", 0))
            t_next = int(path_txs[i + 1].get("timestamp", 0))
            delta = t_next - t_curr
            deltas.append(delta)

            # Negative time implies anomalous or out-of-order ledger entry
            if delta < 0:
                hop_scores.append(0.30)
            elif delta <= 21600:  # < 6 hours: High continuity programmatic transfer
                hop_scores.append(1.0)
            elif delta <= 86400:  # 6 - 24 hours: Moderate continuity
                hop_scores.append(0.85)
            elif delta <= 604800:  # 1 - 7 days: Delay penalty
                hop_scores.append(0.65)
            else:  # > 1 week: High latency penalty
                hop_scores.append(0.40)

        continuity_score = sum(hop_scores) / len(hop_scores) if hop_scores else 1.0
        return round(float(continuity_score), 4), deltas

    # -----------------------------------------------------------------------
    # Main Scoring Pipeline
    # -----------------------------------------------------------------------
    def score_trail(
        self,
        trail_path: List[str],
        path_txs: Optional[List[Dict[str, Any]]] = None,
        root_amount: Optional[float] = None,
        graph: Optional[nx.DiGraph] = None,
        has_mixer_parallel: bool = False,
    ) -> Dict[str, Any]:
        """Evaluates an identified laundering path and produces a confidence score.

        Args:
            trail_path: Ordered list of wallet addresses from root suspect to VASP.
            path_txs: List of transaction objects connecting the nodes in trail_path.
                      If None and graph is provided, transactions are extracted from graph edges.
            root_amount: Total crypto sent out from root (defaults to first tx amount).
            graph: Optional NetworkX DiGraph for contextual sweep/mixer detection.
            has_mixer_parallel: Flag indicating if a parallel branch connected to a mixer.

        Returns:
            Structured dictionary with confidence_score_pct, confidence_band,
            detailed mathematical breakdown, and target VASP summary.
        """
        if not trail_path or len(trail_path) < 2:
            raise ValueError("A valid trail path with at least 2 nodes is required.")

        # Check if graph was passed as second positional argument
        if isinstance(path_txs, (nx.Graph, nx.DiGraph)):
            if graph is None:
                graph = path_txs
            path_txs = None

        # Reconstruct path_txs from graph if not explicitly provided
        if path_txs is None and graph is not None:
            path_txs = []
            for i in range(len(trail_path) - 1):
                u, v = trail_path[i], trail_path[i + 1]
                edge_data = graph.get_edge_data(u, v, default={})
                path_txs.append(edge_data)

        if not path_txs:
            path_txs = []

        hop_count = len(trail_path) - 1

        # Determine amount sent from root and amount received by target VASP
        if root_amount is not None and root_amount > 0:
            amount_sent = float(root_amount)
        elif path_txs:
            amount_sent = float(path_txs[0].get("amount_crypto", 1.0))
        else:
            amount_sent = 1.0

        if path_txs:
            amount_received = float(path_txs[-1].get("amount_crypto", 0.0))
        else:
            amount_received = amount_sent

        # 1. Hop Distance Decay (D_h)
        d_h = self.calculate_hop_decay(hop_count)

        # 2. Value Preservation Factor (V_p)
        v_p = self.calculate_value_preservation(amount_sent, amount_received)

        # 3. Velocity & Continuity Factor (T_c)
        t_c, time_deltas = self.calculate_velocity_continuity(path_txs)

        # Base weighted score
        base_score = (
            (self.weight_hop * d_h)
            + (self.weight_value * v_p)
            + (self.weight_velocity * t_c)
        )

        # 4. Heuristic Bonuses: Direct VASP Rapid Sweep (+0.10)
        has_direct_sweep = False
        if graph is not None and len(trail_path) >= 2:
            tail_deposit = trail_path[-2]
            tail_vault = trail_path[-1]
            if graph.has_edge(tail_deposit, tail_vault):
                tail_edge = graph[tail_deposit][tail_vault]
                if tail_edge.get("is_rapid_sweep") or LaunderingHeuristics.detect_rapid_sweep(
                    graph, tail_deposit, tail_vault
                ):
                    has_direct_sweep = True
        elif len(trail_path) >= 2:
            # Fallback heuristic: check if tail node is vasp_hot and predecessor is vasp_deposit
            penult_meta = identify_entity(trail_path[-2])
            last_meta = identify_entity(trail_path[-1])
            if penult_meta.get("nodetype") == "vasp_deposit" and last_meta.get("nodetype") == "vasp_hot":
                has_direct_sweep = True

        sweep_bonus = self.direct_sweep_bonus if has_direct_sweep else 0.0

        # 5. Heuristic Penalties: Mixer Proximity Penalty (-0.05)
        # Check if the graph has mixer nodes connected to root or intermediate nodes
        mixer_detected = has_mixer_parallel
        if not mixer_detected and graph is not None:
            for node in graph.nodes:
                if graph.nodes[node].get("nodetype") == "mixer":
                    mixer_detected = True
                    break

        mixer_penalty = self.mixer_proximity_penalty if mixer_detected else 0.0

        # Final score calculation with clamping [0.0, 1.0]
        final_score_raw = base_score + sweep_bonus - mixer_penalty
        final_score_clamped = min(1.0, max(0.0, final_score_raw))
        confidence_score_pct = round(final_score_clamped * 100, 2)

        # Categorize confidence band
        if confidence_score_pct >= 75.0:
            confidence_band = "High"
        elif confidence_score_pct >= 50.0:
            confidence_band = "Moderate"
        else:
            confidence_band = "Inconclusive"

        # Identify destination VASP metadata
        target_addr = trail_path[-1]
        target_meta = identify_entity(target_addr)

        return {
            "confidence_score_pct": confidence_score_pct,
            "confidence_band": confidence_band,
            "breakdown": {
                "hop_distance_decay": d_h,
                "value_preservation": v_p,
                "velocity_continuity": t_c,
                "base_score": round(base_score, 4),
                "direct_sweep_bonus": sweep_bonus,
                "mixer_proximity_penalty": mixer_penalty,
                "hop_count": hop_count,
                "alpha_decay": self.alpha,
                "amount_sent": amount_sent,
                "amount_received": amount_received,
                "has_direct_sweep": has_direct_sweep,
                "has_mixer_contamination": mixer_detected,
                "time_deltas_seconds": time_deltas,
            },
            "target_vasp_summary": {
                "address": target_addr,
                "name": target_meta.get("name", "Unknown VASP"),
                "entity_type": target_meta.get("entity_type", "Centralized Exchange"),
                "jurisdiction": target_meta.get("jurisdiction", "Unknown"),
                "nodetype": target_meta.get("nodetype", "vasp_hot"),
                "fiu_registered": target_meta.get("fiu_registered", False),
                "risk_tier": target_meta.get("risk_tier", "Low"),
                "compliance_email": target_meta.get("compliance_email"),
            },
            "trail_path": trail_path,
        }


# ---------------------------------------------------------------------------
# Standalone Execution / Scoring Verification Check
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

    print("=" * 80)
    print(" VASP ATTRIBUTION CONFIDENCE SCORING ENGINE")
    print("=" * 80)

    # Initialize graph and trace suspect path
    ingestor = IngestionEngine(mode="mock")
    tracer = BlockchainGraphTracer(ingestor)
    target_root = "0x_suspect_theft_initiator"

    print(f"\n[+] Tracing path from suspect root: {target_root}")
    tracer.trace_path(target_root, max_hops=5, min_amount_threshold=0.01)

    # Annotate risk heuristics
    LaunderingHeuristics.annotate_graph_risks(tracer.graph)

    # Identify nearest VASP trail
    vasps = tracer.find_nearest_vasps(target_root)
    if not vasps:
        print("[-] Error: No VASP trail discovered.")
        sys.exit(1)

    nearest = vasps[0]
    trail = nearest["path"]
    print(f"[+] Discovered Trail ({len(trail)-1} hops):")
    print(f"    {' -> '.join(trail)}")

    # Score the identified trail
    scorer = VASPAttributionScorer()
    # Initial stolen dispatch: 95.0 ETH
    result = scorer.score_trail(
        trail_path=trail,
        root_amount=95.0,
        graph=tracer.graph,
        has_mixer_parallel=True,
    )

    print("\n" + "-" * 80)
    print(" ATTRIBUTION CONFIDENCE SCORECARD")
    print("-" * 80)
    print(f"  * Final Confidence Score : {result['confidence_score_pct']}%")
    print(f"  * Confidence Band        : {result['confidence_band']}")
    print(f"\n  [Mathematical Breakdown]")
    b = result["breakdown"]
    print(f"  • Hop Distance Decay (D_h)   : {b['hop_distance_decay']} (hop count: {b['hop_count']}, alpha: {b['alpha_decay']})")
    print(f"  • Value Preservation (V_p)   : {b['value_preservation']} ({b['amount_received']} ETH / {b['amount_sent']} ETH)")
    print(f"  • Velocity Continuity (T_c)  : {b['velocity_continuity']} (Inter-hop deltas: {b['time_deltas_seconds']}s)")
    print(f"  • Base Weighted Score        : {b['base_score'] * 100:.2f}%")
    print(f"  • Direct Sweep Bonus         : +{b['direct_sweep_bonus'] * 100:.1f}% ({'APPLIED' if b['has_direct_sweep'] else 'N/A'})")
    print(f"  • Mixer Proximity Penalty    : -{b['mixer_proximity_penalty'] * 100:.1f}% ({'APPLIED' if b['has_mixer_contamination'] else 'N/A'})")

    print(f"\n  [Target Destination VASP]")
    v = result["target_vasp_summary"]
    print(f"  • Entity Name        : {v['name']}")
    print(f"  • Entity Type        : {v['entity_type']} ({v['nodetype']})")
    print(f"  • Legal Jurisdiction : {v['jurisdiction']}")
    print(f"  • FIU Registered     : {'YES' if v['fiu_registered'] else 'NO'}")
    print(f"  • Compliance Email   : {v['compliance_email']}")
    print("=" * 80)
