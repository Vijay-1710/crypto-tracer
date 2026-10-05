"""Data Ingestion Pipeline and Mock Laundering Ledger Module.

Interfaces with the VASP registry (vasp_registry.py) to ingest, normalize, and
enrich on-chain transactions for financial intelligence investigations and law
enforcement tracing.

Includes:
  - MOCK_LEDGER: A synthetic multi-hop cryptocurrency laundering trail simulating
    an Indian fraud case splitting into an Exchange Cash-Out branch and a Mixer
    Obfuscation branch.
  - IngestionEngine: An extensible pipeline supporting 'mock' mode, alongside
    pluggable hooks for live blockchain API fetching (Etherscan, Mempool.space).
  - Standalone LEA execution trace report when executed as main.
"""

from copy import deepcopy
from datetime import datetime, timezone
import json
import logging
from typing import Any, Dict, List, Optional
from urllib.error import URLError
import urllib.parse
import urllib.request

from vasp_registry import KNOWN_VASPS, identify_entity

logger = logging.getLogger("DataIngestor")

# ---------------------------------------------------------------------------
# Suspect & Counterparty Wallet Constants (Indian Fraud Investigation Case)
# ---------------------------------------------------------------------------
ROOT_SUSPECT_WALLET = "0x892a014902d28f01a3c79014b2d18047fa10c3b9"

# Branch A: Cash-Out via Domestic FIU-Registered Exchange (CoinDCX)
MULE_ACCOUNT_A = "0x3a4b91c89012f45812e9123049b10924fa0912cb"
LAYERING_HOP_A = "0x5d98a14b301294817a02c914029481029cba1240"
COINDCX_TEMP_PROXY = "0x_dep_coindcx_991f28b4a2"
COINDCX_HOT_VAULT = "0x71c0800b651000dd65f4ffc04b8ce273bb31e9c2"

# Branch B: Obfuscation via Sanctioned Mixer (Tornado Cash)
MULE_ACCOUNT_B = "0x91f04128ba49102c94812304891b01924fa9012c"
TORNADO_CASH_VAULT = "0xd90e2f925da726b50c4ed8d0fb90ad053324f31b"


# ---------------------------------------------------------------------------
# Synthetic Ledger Simulating Multi-Hop Laundering Trail
# ---------------------------------------------------------------------------
# Keyed by lowercase 'from_address' for O(1) sender retrieval.
MOCK_LEDGER: Dict[str, List[Dict[str, Any]]] = {
    # Step 0: Root Suspect Wallet splits stolen funds into two distinct branches
    ROOT_SUSPECT_WALLET.lower(): [
        # Branch A Split: Transfer to primary cash-out mule
        {
            "tx_hash": "0x7a3910c2834b9e0f11a8b9415c89812efaa81230491823901840192830129481",
            "from_address": ROOT_SUSPECT_WALLET,
            "to_address": MULE_ACCOUNT_A,
            "amount_crypto": 48.50,
            "timestamp": 1711929600,  # 2024-04-01 00:00:00 UTC
        },
        # Branch B Split: Transfer to obfuscation/mixer mule
        {
            "tx_hash": "0x8b4021d3945c0f1e22b9c0526d90923fab912341502934012951203941230592",
            "from_address": ROOT_SUSPECT_WALLET,
            "to_address": MULE_ACCOUNT_B,
            "amount_crypto": 51.50,
            "timestamp": 1711929660,  # 2024-04-01 00:01:00 UTC
        },
    ],

    # Branch A - Hop 1: Mule Account A forwards to Layering Hop
    MULE_ACCOUNT_A.lower(): [
        {
            "tx_hash": "0x9c5132e4056d1f2f33c0d1637ea1034abc023452613045123062314052341603",
            "from_address": MULE_ACCOUNT_A,
            "to_address": LAYERING_HOP_A,
            "amount_crypto": 48.40,
            "timestamp": 1711933200,  # 2024-04-01 01:00:00 UTC (+1 hr)
        }
    ],

    # Branch A - Hop 2: Layering Hop deposits into CoinDCX Temporary Deposit Proxy
    LAYERING_HOP_A.lower(): [
        {
            "tx_hash": "0xad6243f5167e2a3a44d1e2748fb2145bcd134563724156234173425163452714",
            "from_address": LAYERING_HOP_A,
            "to_address": COINDCX_TEMP_PROXY,
            "amount_crypto": 48.30,
            "timestamp": 1711936800,  # 2024-04-01 02:00:00 UTC (+1 hr)
        }
    ],

    # Branch A - Hop 3: CoinDCX Internal Sweep from Deposit Proxy to Primary Hot Vault
    COINDCX_TEMP_PROXY.lower(): [
        {
            "tx_hash": "0xbe7354a6278f3b4b55e2f3859ac3256cde245674835267345284536274563825",
            "from_address": COINDCX_TEMP_PROXY,
            "to_address": COINDCX_HOT_VAULT,
            "amount_crypto": 48.30,
            "timestamp": 1711940400,  # 2024-04-01 03:00:00 UTC (automated exchange sweep)
        }
    ],

    # Branch B - Hop 1: Mule Account B deposits directly into Tornado Cash Mixer
    MULE_ACCOUNT_B.lower(): [
        {
            "tx_hash": "0xcf8465b7389a4c5c66f3a4960bd4367def356785946378456395647385674936",
            "from_address": MULE_ACCOUNT_B,
            "to_address": TORNADO_CASH_VAULT,
            "amount_crypto": 51.50,
            "timestamp": 1711931400,  # 2024-04-01 00:30:00 UTC
        }
    ],

    # -----------------------------------------------------------------------
    # Theft Initiator Multi-Hop Peeling & Rapid Sweep Laundering Scenario
    # -----------------------------------------------------------------------
    "0x_suspect_theft_initiator": [
        # Branch 1: Main cash-out trail to mule account alpha
        {
            "tx_hash": "0xtx_theft_to_mule_alpha_01",
            "from_address": "0x_suspect_theft_initiator",
            "to_address": "0x_mule_account_alpha",
            "amount_crypto": 95.0,
            "timestamp": 1711929600,
        },
        # Branch 2: Obfuscation to Tornado Cash mixer
        {
            "tx_hash": "0xtx_theft_to_tornado_obfuscation",
            "from_address": "0x_suspect_theft_initiator",
            "to_address": "0x_tornado_cash_vault",
            "amount_crypto": 25.0,
            "timestamp": 1711929700,
        },
    ],

    "0x_mule_account_alpha": [
        # Forwarding majority (85.0 ETH) to peeling layer 01
        {
            "tx_hash": "0xtx_mule_alpha_to_peeling_layer",
            "from_address": "0x_mule_account_alpha",
            "to_address": "0x_peeling_layer_01",
            "amount_crypto": 85.0,
            "timestamp": 1711930800,
        },
        # Peeling minority fraction (10.0 ETH) within 200s (< 1 hr, > 80/20 ratio)
        {
            "tx_hash": "0xtx_mule_alpha_peeled_cut",
            "from_address": "0x_mule_account_alpha",
            "to_address": "0x_peeled_fee_sink_alpha",
            "amount_crypto": 10.0,
            "timestamp": 1711931000,
        },
        # Circular mule loop to test cyclic traversal prevention
        {
            "tx_hash": "0xtx_mule_alpha_to_cycler",
            "from_address": "0x_mule_account_alpha",
            "to_address": "0x_mule_loop_cycler",
            "amount_crypto": 1.0,
            "timestamp": 1711931100,
        },
    ],

    # Cyclic mule that attempts to route back to 0x_mule_account_alpha
    "0x_mule_loop_cycler": [
        {
            "tx_hash": "0xtx_cycler_back_to_mule_alpha",
            "from_address": "0x_mule_loop_cycler",
            "to_address": "0x_mule_account_alpha",
            "amount_crypto": 0.95,
            "timestamp": 1711931200,
        }
    ],

    "0x_peeling_layer_01": [
        # Forwarding majority (80.0 ETH) to CoinDCX Dynamic Deposit Proxy
        {
            "tx_hash": "0xtx_peeling_to_coindcx_dep",
            "from_address": "0x_peeling_layer_01",
            "to_address": "0x_dep_coindcx_user_4492",
            "amount_crypto": 80.0,
            "timestamp": 1711933000,
        },
        # Peeling minority fee (5.0 ETH) within 100s (< 1 hr, > 80/20 ratio)
        {
            "tx_hash": "0xtx_peeling_fee_fraction",
            "from_address": "0x_peeling_layer_01",
            "to_address": "0x_peeled_gas_sink_layer01",
            "amount_crypto": 5.0,
            "timestamp": 1711933100,
        },
    ],

    "0x_dep_coindcx_user_4492": [
        # Rapid sweep: 79.8 ETH forwarded to CoinDCX Main Inflow Vault (>95% in <15m)
        {
            "tx_hash": "0xtx_coindcx_user_4492_sweep_to_vault",
            "from_address": "0x_dep_coindcx_user_4492",
            "to_address": "CoinDCX Main Inflow Vault",
            "amount_crypto": 79.8,
            "timestamp": 1711933900,
        }
    ],
}


# ---------------------------------------------------------------------------
# IngestionEngine Class
# ---------------------------------------------------------------------------
class IngestionEngine:
    """Blockchain ingestion engine that normalizes and enriches transaction data.

    Supports mock execution mode for synthetic testing and offline simulation,
    with extensible pluggable hooks for live blockchain API endpoints (Etherscan,
    Mempool.space).
    """

    def __init__(
        self,
        mode: str = "mock",
        etherscan_api_key: Optional[str] = None,
        mempool_base_url: str = "https://mempool.space/api",
        ledger_data: Optional[Dict[str, List[Dict[str, Any]]]] = None,
    ):
        """Initializes the ingestion engine.

        Args:
            mode: Operational mode ('mock', 'etherscan', 'mempool').
            etherscan_api_key: Optional API key for live Etherscan querying.
            mempool_base_url: Base URL for Mempool.space REST API.
            ledger_data: Custom in-memory ledger dictionary (defaults to MOCK_LEDGER).
        """
        valid_modes = {"mock", "etherscan", "mempool"}
        if mode.lower() not in valid_modes:
            raise ValueError(
                f"Invalid ingestion mode '{mode}'. Supported modes are: {sorted(valid_modes)}"
            )

        self.mode = mode.lower()
        self.etherscan_api_key = etherscan_api_key
        self.mempool_base_url = mempool_base_url.rstrip("/")
        self.ledger: Dict[str, List[Dict[str, Any]]] = (
            ledger_data if ledger_data is not None else MOCK_LEDGER
        )

    # -----------------------------------------------------------------------
    # Core Ingestion Method
    # -----------------------------------------------------------------------
    def get_outbound_transactions(self, address: str) -> List[Dict[str, Any]]:
        """Retrieves all outgoing transactions originating from the given address.

        Enriches each transaction with destination counterparty intelligence
        by invoking identify_entity() on the to_address.

        Args:
            address: Sender wallet address to inspect.

        Returns:
            List of enriched transaction dictionaries containing original fields
            plus structured 'destination_entity' metadata.
        """
        if not address or not isinstance(address, str):
            return []

        normalized_addr = address.strip().lower()

        # Step 1: Retrieve raw outgoing transfers according to mode
        raw_txs: List[Dict[str, Any]]
        if self.mode == "mock":
            raw_txs = self._fetch_mock(normalized_addr)
        elif self.mode == "etherscan":
            raw_txs = self._fetch_etherscan(normalized_addr)
        elif self.mode == "mempool":
            raw_txs = self._fetch_mempool(normalized_addr)
        else:
            raw_txs = []

        # Step 2: Enrich each transaction with VASP Registry intelligence
        enriched_records: List[Dict[str, Any]] = []
        for tx in raw_txs:
            enriched_tx = deepcopy(tx)
            to_addr = enriched_tx.get("to_address", "")
            
            # Identify counterparty entity
            entity_metadata = identify_entity(to_addr)
            enriched_tx["destination_entity"] = entity_metadata
            
            # Convenience shortcuts for analytical queries
            enriched_tx["entity_name"] = entity_metadata.get("name")
            enriched_tx["nodetype"] = entity_metadata.get("nodetype")
            enriched_tx["risk_tier"] = entity_metadata.get("risk_tier")
            enriched_tx["fiu_registered"] = entity_metadata.get("fiu_registered")
            enriched_tx["compliance_email"] = entity_metadata.get("compliance_email")

            enriched_records.append(enriched_tx)

        return enriched_records

    # -----------------------------------------------------------------------
    # Internal Fetch Handlers & Extensible Live API Hooks
    # -----------------------------------------------------------------------
    def _fetch_mock(self, normalized_address: str) -> List[Dict[str, Any]]:
        """Fetches outgoing transactions from the in-memory mock ledger."""
        return self.ledger.get(normalized_address, [])

    def _fetch_etherscan(self, normalized_address: str) -> List[Dict[str, Any]]:
        """Extensible live hook: Fetches outbound transactions from Etherscan API.

        Queries:
          https://api.etherscan.io/api?module=account&action=txlist&address={address}

        Parses outgoing transactions where 'from' matches the queried address.
        """
        if not self.etherscan_api_key:
            logger.warning(
                "Etherscan API key not configured. Returning empty live dataset."
            )
            return []

        url = (
            f"https://api.etherscan.io/api?"
            f"module=account&action=txlist&address={normalized_address}"
            f"&startblock=0&endblock=99999999&sort=asc&apikey={self.etherscan_api_key}"
        )

        try:
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "CryptoLEA-IngestionEngine/1.0"},
            )
            with urllib.request.urlopen(req, timeout=10) as response:
                payload = json.loads(response.read().decode("utf-8"))

            status = payload.get("status")
            result = payload.get("result", [])

            if status != "1" or not isinstance(result, list):
                return []

            outbound: List[Dict[str, Any]] = []
            for item in result:
                if str(item.get("from", "")).lower() == normalized_address:
                    value_eth = float(item.get("value", 0)) / 1e18
                    outbound.append({
                        "tx_hash": item.get("hash", ""),
                        "from_address": item.get("from", ""),
                        "to_address": item.get("to", ""),
                        "amount_crypto": value_eth,
                        "timestamp": int(item.get("timeStamp", 0)),
                    })
            return outbound

        except (URLError, TimeoutError, ValueError) as err:
            logger.error(f"Error querying Etherscan API: {err}")
            return []

    def _fetch_mempool(self, normalized_address: str) -> List[Dict[str, Any]]:
        """Extensible live hook: Fetches outbound transactions from Mempool.space API.

        Queries:
          https://mempool.space/api/address/{address}/txs

        Parses outgoing UTXOs/transfers where inputs contain the queried address.
        """
        url = f"{self.mempool_base_url}/address/{normalized_address}/txs"
        try:
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "CryptoLEA-IngestionEngine/1.0"},
            )
            with urllib.request.urlopen(req, timeout=10) as response:
                result = json.loads(response.read().decode("utf-8"))

            if not isinstance(result, list):
                return []

            outbound: List[Dict[str, Any]] = []
            for tx in result:
                vin_addrs = [
                    vin.get("prevout", {}).get("scriptpubkey_address", "").lower()
                    for vin in tx.get("vin", [])
                ]
                if normalized_address in vin_addrs:
                    # Sum outputs destined to counterparties
                    for vout in tx.get("vout", []):
                        dst_addr = vout.get("scriptpubkey_address", "")
                        if dst_addr and dst_addr.lower() != normalized_address:
                            sats = float(vout.get("value", 0))
                            outbound.append({
                                "tx_hash": tx.get("txid", ""),
                                "from_address": normalized_address,
                                "to_address": dst_addr,
                                "amount_crypto": sats / 1e8,  # Convert to BTC
                                "timestamp": tx.get("status", {}).get("block_time", 0),
                            })
            return outbound

        except (URLError, TimeoutError, ValueError) as err:
            logger.error(f"Error querying Mempool.space API: {err}")
            return []

    # -----------------------------------------------------------------------
    # Multi-Hop Trace Utility
    # -----------------------------------------------------------------------
    def trace_full_trail(
        self,
        start_address: str,
        max_depth: int = 6,
        visited: Optional[set] = None,
    ) -> List[Dict[str, Any]]:
        """Recursively traverses the ledger to construct a multi-hop investigation graph.

        Args:
            start_address: Root suspect or starting wallet.
            max_depth: Maximum recursion depth to prevent cyclic recursion.
            visited: Set of visited transaction hashes.

        Returns:
            List of traced hop nodes containing hop depth, transaction info,
            and child downstream branches.
        """
        if visited is None:
            visited = set()

        if max_depth <= 0:
            return []

        outbound = self.get_outbound_transactions(start_address)
        hop_nodes: List[Dict[str, Any]] = []

        for tx in outbound:
            tx_hash = tx.get("tx_hash", "")
            if tx_hash in visited:
                continue
            visited.add(tx_hash)

            dest_addr = tx.get("to_address", "")
            node = {
                "transaction": tx,
                "destination_address": dest_addr,
                "destination_entity": tx.get("destination_entity"),
                "children": self.trace_full_trail(dest_addr, max_depth - 1, visited),
            }
            hop_nodes.append(node)

        return hop_nodes


# ---------------------------------------------------------------------------
# Formatting Helpers for Law Enforcement Terminal Reports
# ---------------------------------------------------------------------------
def _format_epoch(epoch: int) -> str:
    """Converts epoch seconds to UTC ISO string."""
    try:
        return (
            datetime.fromtimestamp(epoch, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        )
    except Exception:
        return str(epoch)


def _print_trace_tree(node: Dict[str, Any], indent: str = "", branch_label: str = ""):
    """Pretty prints a transaction node and its children recursively using ASCII-safe characters."""
    tx = node["transaction"]
    entity = node["destination_entity"]

    risk = entity.get("risk_tier", "Unknown")
    nodetype = entity.get("nodetype", "unattributed")
    fiu = "YES (FIU-IND)" if entity.get("fiu_registered") else "NO"
    email = entity.get("compliance_email") or "N/A"

    # Risk badge formatting
    risk_display = f"[{risk.upper()}]"
    if risk == "Critical":
        risk_display = f"*** {risk_display} ***"

    print(f"{indent}|-- {branch_label}TX: {tx['tx_hash'][:18]}...")
    print(f"{indent}|   |-- Timestamp : {_format_epoch(tx['timestamp'])} (Epoch: {tx['timestamp']})")
    print(f"{indent}|   |-- Value     : {tx['amount_crypto']:.4f} CRYPTO (ETH)")
    print(f"{indent}|   |-- From      : {tx['from_address']}")
    print(f"{indent}|   \\-- To        : {tx['to_address']}")
    print(f"{indent}|       |-- Identified Entity : {entity.get('name')}")
    print(f"{indent}|       |-- Entity Type       : {entity.get('entity_type')} | Node: {nodetype}")
    print(f"{indent}|       |-- Jurisdiction      : {entity.get('jurisdiction')} | FIU Registered: {fiu}")
    print(f"{indent}|       |-- Risk Tier         : {risk_display}")
    print(f"{indent}|       \\-- Compliance / Legal: {email}")

    children = node.get("children", [])
    if children:
        print(f"{indent}|")
        for idx, child in enumerate(children, start=1):
            next_label = f"Hop {idx} --> " if len(children) > 1 else ""
            _print_trace_tree(child, indent + "|   ", next_label)


# ---------------------------------------------------------------------------
# Standalone Execution Block
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import sys

    # Ensure UTF-8 output encoding where supported on Windows consoles
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

    print("=" * 80)
    print(" FINANCIAL INTELLIGENCE UNIT & LAW ENFORCEMENT ON-CHAIN TRACING REPORT")
    print(" CASE ID: FIU-IND-2024-CR9912 | SUSPECT ASSET RECOVERY OPERATION")
    print("=" * 80)

    # Initialize IngestionEngine in mock mode
    engine = IngestionEngine(mode="mock")

    print(f"\n[+] TARGET SUSPECT WALLET (ROOT SENDER):")
    print(f"    Address : {ROOT_SUSPECT_WALLET}")
    root_entity = identify_entity(ROOT_SUSPECT_WALLET)
    print(f"    Profile : {root_entity['name']} (Risk: {root_entity['risk_tier']})")

    # Query immediate outbound transactions from Root Suspect Address
    print("\n" + "-" * 80)
    print("[+] PHASE 1: DIRECT OUTBOUND TRANSACTIONS (Root Splitting Analysis)")
    print("-" * 80)
    outbound_records = engine.get_outbound_transactions(ROOT_SUSPECT_WALLET)
    print(f"Total outgoing transfers identified from root: {len(outbound_records)}")

    for idx, tx in enumerate(outbound_records, start=1):
        dest_meta = tx["destination_entity"]
        branch_tag = "Branch A (Domestic Cash-Out)" if idx == 1 else "Branch B (Obfuscation)"
        print(f"\n[Split #{idx}] -> {branch_tag}")
        print(f"  * Transaction Hash : {tx['tx_hash']}")
        print(f"  * Destination      : {tx['to_address']}")
        print(f"  * Amount           : {tx['amount_crypto']:.2f} CRYPTO")
        print(f"  * Timestamp        : {_format_epoch(tx['timestamp'])}")
        print(f"  * Entity Detected  : {dest_meta['name']}")
        print(f"  * Node Type        : {dest_meta['nodetype']}")
        print(f"  * Risk Tier        : {dest_meta['risk_tier']}")
        print(f"  * FIU Registered   : {dest_meta['fiu_registered']}")
        print(f"  * Compliance Email : {dest_meta['compliance_email'] or 'N/A'}")

    # Full Multi-Hop Laundering Reconstruction
    print("\n" + "=" * 80)
    print("[+] PHASE 2: COMPREHENSIVE MULTI-HOP LAUNDERING TRAIL GRAPH")
    print("=" * 80)
    full_trace_tree = engine.trace_full_trail(ROOT_SUSPECT_WALLET)

    for i, root_branch in enumerate(full_trace_tree, start=1):
        branch_name = (
            "BRANCH A: Centralized Exchange Cash-Out Trail (CoinDCX Subpoena Target)"
            if i == 1
            else "BRANCH B: Sanctioned Mixer Obfuscation Trail (Tornado Cash)"
        )
        print(f"\n[{branch_name}]")
        _print_trace_tree(root_branch, indent="   ")

    # Actionable Intelligence Summary for Investigating Officers
    print("\n" + "=" * 80)
    print("[+] LAW ENFORCEMENT ACTIONABLE INTELLIGENCE SUMMARY")
    print("=" * 80)
    print("  1. SUBPOENA NOTICE READY:")
    print(f"     Target VASP       : CoinDCX (Neblio Technologies Pvt. Ltd.)")
    print(f"     FIU Status        : Registered Reporting Entity (Section 12 PMLA, 2002)")
    print(f"     Destination Vault : {COINDCX_HOT_VAULT}")
    print(f"     Associated Proxy  : {COINDCX_TEMP_PROXY}")
    print(f"     Actionable Contact: compliance@coindcx.com")
    print(f"     Recoverable Value : 48.30 ETH (~INR 1,40,00,000)")
    print("\n  2. SANCTIONS EVASION ADVISORY:")
    print(f"     Obfuscation Route : Tornado Cash Smart Contract")
    print(f"     Destination Vault : {TORNADO_CASH_VAULT}")
    print(f"     Status            : OFAC Specially Designated Nationals (SDN) Listed")
    print(f"     Risk Tier         : CRITICAL")
    print(f"     Action            : Blacklist originating Mule Account ({MULE_ACCOUNT_B})")
    print("=" * 80)
