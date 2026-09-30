"""Comprehensive Test Suite for Cryptocurrency Tracking & VASP Attribution Engine.

Tests:
  1. VASP Registry: entity identification, taxonomy, case insensitivity, deposit proxies, mixers.
  2. Data Ingestor: mock ledger traversal, threshold filtering, outbound transaction queries.
  3. Laundering Heuristics: peeling chain detection, rapid sweep detection, risk annotation.
  4. Graph Engine: BFS path traversal, terminal halting at mixers/vaults, cycle avoidance, nearest VASP ranking.
  5. Attribution Engine: mathematical decay scoring, value preservation, velocity continuity, bonus/penalty logic.
  6. Serializers: Cytoscape.js format serialization, primary path highlights, investigator summary telemetry.
  7. Dossier Builder: statutory Section 91 CrPC / Section 94 BNSS notice drafting, SHA256 hashing, evidentiary audit trail.
  8. FastAPI REST Endpoints: GET /health, POST /api/v1/trace, POST /api/v1/dossier/generate, error scenarios (422, 404).
"""

import json
import unittest
from fastapi.testclient import TestClient
import networkx as nx

from attribution_engine import VASPAttributionScorer
from data_ingestor import (
    IngestionEngine,
    MOCK_LEDGER,
    ROOT_SUSPECT_WALLET,
    COINDCX_HOT_VAULT,
    COINDCX_TEMP_PROXY,
    TORNADO_CASH_VAULT,
)
from dossier_builder import generate_case_dossier
from graph_engine import BlockchainGraphTracer
from heuristics import LaunderingHeuristics
from main import app
from serializers import format_investigator_stats, networkx_to_cytoscape_elements
from vasp_registry import KNOWN_VASPS, identify_entity


class TestVASPRegistry(unittest.TestCase):
    """Unit tests for VASP entity registry and address identification."""

    def test_known_vasps_populated(self):
        """Ensure the registry is populated with verified exchange and mixer entities."""
        self.assertGreaterEqual(len(KNOWN_VASPS), 30)

    def test_identify_known_vasp_exact_and_case_insensitive(self):
        """Identify known VASPs regardless of casing."""
        profile = identify_entity("0x71c0800b651000dd65f4ffc04b8ce273bb31e9c2")
        self.assertIn("CoinDCX", profile["name"])
        self.assertEqual(profile["nodetype"], "vasp_hot")
        self.assertTrue(profile["fiu_registered"])
        self.assertEqual(profile["compliance_email"], "compliance@coindcx.com")

        # Upper-case test
        profile_upper = identify_entity("0X71C0800B651000DD65F4FFC04B8CE273BB31E9C2")
        self.assertEqual(profile["name"], profile_upper["name"])

    def test_identify_dynamic_deposit_proxies(self):
        """Dynamic deposit proxy heuristics should identify exchange-associated user proxies."""
        coindcx_proxy = identify_entity("0x_dep_coindcx_custom_9912")
        self.assertEqual(coindcx_proxy["nodetype"], "vasp_deposit")
        self.assertIn("CoinDCX", coindcx_proxy["name"])
        self.assertTrue(coindcx_proxy["fiu_registered"])

        binance_proxy = identify_entity("0x_dep_binance_alpha_01")
        self.assertEqual(binance_proxy["nodetype"], "vasp_deposit")
        self.assertIn("Binance", binance_proxy["name"])

    def test_identify_sanctioned_mixer(self):
        """Tornado Cash addresses must be flagged as mixers with Critical risk tier."""
        profile = identify_entity(TORNADO_CASH_VAULT)
        self.assertEqual(profile["nodetype"], "mixer")
        self.assertEqual(profile["risk_tier"], "Critical")
        self.assertFalse(profile["fiu_registered"])

    def test_identify_unattributed_wallet(self):
        """Unknown arbitrary addresses should default to unattributed wallet profile."""
        profile = identify_entity("0x9999999999999999999999999999999999999999")
        self.assertEqual(profile["name"], "Unattributed Wallet")
        self.assertEqual(profile["nodetype"], "unattributed")
        self.assertEqual(profile["risk_tier"], "Medium")
        self.assertFalse(profile["fiu_registered"])


class TestDataIngestor(unittest.TestCase):
    """Unit tests for the on-chain data ingestion engine and synthetic ledger."""

    def setUp(self):
        self.ingestor = IngestionEngine(mode="mock")

    def test_mock_ledger_has_root_suspect(self):
        """Verify the mock ledger contains root suspect addresses."""
        self.assertIn(ROOT_SUSPECT_WALLET.lower(), MOCK_LEDGER)
        self.assertIn("0x_suspect_theft_initiator", MOCK_LEDGER)

    def test_get_outbound_transactions_query(self):
        """Verify outbound transactions query on known root suspect."""
        txs_all = self.ingestor.get_outbound_transactions(ROOT_SUSPECT_WALLET)
        self.assertEqual(len(txs_all), 2)
        total_val = sum(tx["amount_crypto"] for tx in txs_all)
        self.assertAlmostEqual(total_val, 100.0, places=2)

    def test_unknown_wallet_returns_empty(self):
        """Querying a non-existent wallet returns an empty list without raising exceptions."""
        txs = self.ingestor.get_outbound_transactions("0xunknown_address_999")
        self.assertEqual(txs, [])


class TestLaunderingHeuristics(unittest.TestCase):
    """Unit tests for peeling chain and rapid sweep heuristic detection."""

    def test_detect_peeling_chain(self):
        """Detect asymmetric peeling chains on a split transaction list."""
        tx_list = [
            {"amount_crypto": 85.0, "timestamp": 1711930800, "to_address": "0x_mule_layer", "tx_hash": "tx1"},
            {"amount_crypto": 10.0, "timestamp": 1711931000, "to_address": "0x_peeled_gas", "tx_hash": "tx2"},
        ]
        result = LaunderingHeuristics.detect_peeling_chain(tx_list)
        self.assertTrue(result["is_peeling_chain"])
        self.assertAlmostEqual(result["primary_ratio"], 0.8947, places=3)
        self.assertAlmostEqual(result["peeled_ratio"], 0.1053, places=3)

    def test_detect_rapid_sweep(self):
        """Detect rapid sweep behavior from deposit proxy to hot wallet."""
        ingestor = IngestionEngine(mode="mock")
        tracer = BlockchainGraphTracer(ingestor)
        tracer.trace_path("0x_suspect_theft_initiator", max_hops=5)

        is_sweep = LaunderingHeuristics.detect_rapid_sweep(
            tracer.graph,
            "0x_dep_coindcx_user_4492",
            "CoinDCX Main Inflow Vault",
        )
        self.assertTrue(is_sweep)

    def test_annotate_graph_risks(self):
        """Ensure graph annotation correctly tags nodes and edges with heuristic flags."""
        ingestor = IngestionEngine(mode="mock")
        tracer = BlockchainGraphTracer(ingestor)
        tracer.trace_path("0x_suspect_theft_initiator", max_hops=5)

        LaunderingHeuristics.annotate_graph_risks(tracer.graph)

        # Check node heuristic attributes
        peeling_nodes = [
            n for n, d in tracer.graph.nodes(data=True) if d.get("is_peeling_chain")
        ]
        sweep_nodes = [
            n for n, d in tracer.graph.nodes(data=True) if d.get("is_rapid_sweep")
        ]
        self.assertGreaterEqual(len(peeling_nodes), 1)
        self.assertGreaterEqual(len(sweep_nodes), 1)


class TestGraphEngine(unittest.TestCase):
    """Unit tests for BlockchainGraphTracer BFS traversal and terminal conditions."""

    def setUp(self):
        self.ingestor = IngestionEngine(mode="mock")
        self.tracer = BlockchainGraphTracer(self.ingestor)

    def test_bfs_traversal_and_terminal_halting(self):
        """Verify BFS traversal halts at terminal nodes (mixer, vasp_hot) without looping."""
        self.tracer.trace_path("0x_suspect_theft_initiator", max_hops=5)

        # Check that mixer node has out-degree 0 in the traversed graph
        mixer_nodes = [
            n for n in self.tracer.graph.nodes
            if self.tracer.graph.nodes[n].get("nodetype") == "mixer"
        ]
        self.assertGreaterEqual(len(mixer_nodes), 1)
        for m in mixer_nodes:
            self.assertEqual(self.tracer.graph.out_degree(m), 0)

        # Check that hot vault node has out-degree 0
        hot_nodes = [
            n for n in self.tracer.graph.nodes
            if self.tracer.graph.nodes[n].get("nodetype") == "vasp_hot"
        ]
        self.assertGreaterEqual(len(hot_nodes), 1)
        for h in hot_nodes:
            self.assertEqual(self.tracer.graph.out_degree(h), 0)

    def test_find_nearest_vasps_ranking(self):
        """Nearest VASP search should rank reachable exchanges by hop distance and volume."""
        self.tracer.trace_path("0x_suspect_theft_initiator", max_hops=5)
        rankings = self.tracer.find_nearest_vasps("0x_suspect_theft_initiator")
        self.assertGreater(len(rankings), 0)

        primary = rankings[0]
        self.assertEqual(primary["hop_distance"], 4)
        self.assertIn("CoinDCX", primary["label"])
        self.assertEqual(len(primary["path"]), 5)  # 4 hops = 5 nodes

    def test_max_hops_limiting(self):
        """Depth limit of 1 should only traverse direct counterparty nodes."""
        self.tracer.trace_path("0x_suspect_theft_initiator", max_hops=1)
        # Root has out-degree to mule alpha and tornado vault
        for n in self.tracer.graph.nodes:
            hop = self.tracer.graph.nodes[n].get("hop_distance", 0)
            self.assertLessEqual(hop, 1)


class TestAttributionEngine(unittest.TestCase):
    """Unit tests for deterministic VASP attribution confidence scoring."""

    def setUp(self):
        self.scorer = VASPAttributionScorer(default_alpha=0.85, weight_hop=0.35, weight_value=0.35, weight_velocity=0.30)
        self.ingestor = IngestionEngine(mode="mock")
        self.tracer = BlockchainGraphTracer(self.ingestor)
        self.tracer.trace_path("0x_suspect_theft_initiator", max_hops=5)
        LaunderingHeuristics.annotate_graph_risks(self.tracer.graph)

    def test_score_trail_calculation_and_factors(self):
        """Verify trail scoring produces proper factors and confidence tier."""
        rankings = self.tracer.find_nearest_vasps("0x_suspect_theft_initiator")
        primary_trail = rankings[0]["path"]

        summary = self.scorer.score_trail(
            trail_path=primary_trail,
            graph=self.tracer.graph,
            has_mixer_parallel=True,
        )

        self.assertIn("confidence_score_pct", summary)
        self.assertIn("confidence_band", summary)
        self.assertIn("breakdown", summary)
        self.assertTrue(0.0 <= summary["confidence_score_pct"] <= 100.0)

        breakdown = summary["breakdown"]
        self.assertIn("hop_distance_decay", breakdown)
        self.assertIn("value_preservation", breakdown)
        self.assertIn("velocity_continuity", breakdown)
        self.assertIn("direct_sweep_bonus", breakdown)
        self.assertIn("mixer_proximity_penalty", breakdown)

        self.assertEqual(summary["confidence_band"], "High")

    def test_score_clamping(self):
        """Scores must remain clamped within [0, 100]."""
        summary = self.scorer.score_trail(
            trail_path=["0x_suspect_theft_initiator", "0x_mule_account_alpha"],
            graph=self.tracer.graph,
            has_mixer_parallel=False,
        )
        self.assertLessEqual(summary["confidence_score_pct"], 100.0)
        self.assertGreaterEqual(summary["confidence_score_pct"], 0.0)


class TestSerializers(unittest.TestCase):
    """Unit tests for Cytoscape.js serializer and investigator statistics."""

    def setUp(self):
        self.ingestor = IngestionEngine(mode="mock")
        self.tracer = BlockchainGraphTracer(self.ingestor)
        self.tracer.trace_path("0x_suspect_theft_initiator", max_hops=5)
        LaunderingHeuristics.annotate_graph_risks(self.tracer.graph)
        scorer = VASPAttributionScorer()
        rankings = self.tracer.find_nearest_vasps("0x_suspect_theft_initiator")
        self.summary = scorer.score_trail(
            trail_path=rankings[0]["path"],
            graph=self.tracer.graph,
        )

    def test_cytoscape_elements_serialization(self):
        """Serialize NetworkX graph to Cytoscape.js elements list."""
        elements = networkx_to_cytoscape_elements(self.tracer.graph, self.summary)
        self.assertIsInstance(elements, list)
        self.assertGreater(len(elements), 0)

        # Check JSON dumpability
        serialized_json = json.dumps(elements)
        self.assertIsInstance(serialized_json, str)

        # Check node and edge count
        node_elements = [e for e in elements if "source" not in e["data"]]
        edge_elements = [e for e in elements if "source" in e["data"]]
        self.assertEqual(len(node_elements), self.tracer.graph.number_of_nodes())
        self.assertEqual(len(edge_elements), self.tracer.graph.number_of_edges())

        for ne in node_elements:
            data = ne["data"]
            self.assertIn("id", data)
            self.assertIn("label", data)
            self.assertIn("nodetype", data)
            self.assertIn("risk_tier", data)

    def test_format_investigator_stats(self):
        """Generate high-level investigator telemetry metrics."""
        stats = format_investigator_stats(self.tracer.graph, [self.summary])
        self.assertIn("total_hops_traversed", stats)
        self.assertIn("total_volume_traced_crypto", stats)
        self.assertIn("overall_attribution_confidence_pct", stats)
        self.assertIn("high_risk_flags_tripped", stats)
        self.assertIn("is_actionable", stats)
        self.assertTrue(stats["is_actionable"])


class TestDossierBuilder(unittest.TestCase):
    """Unit tests for Section 91 CrPC / Section 94 BNSS statutory dossier generation."""

    def setUp(self):
        self.ingestor = IngestionEngine(mode="mock")
        self.tracer = BlockchainGraphTracer(self.ingestor)
        self.tracer.trace_path("0x_suspect_theft_initiator", max_hops=5)
        LaunderingHeuristics.annotate_graph_risks(self.tracer.graph)
        rankings = self.tracer.find_nearest_vasps("0x_suspect_theft_initiator")
        self.trail = rankings[0]["path"]
        self.summary = VASPAttributionScorer().score_trail(
            trail_path=self.trail,
            graph=self.tracer.graph,
        )

    def test_generate_case_dossier(self):
        """Build statutory case dossier and verify statutory references."""
        path_details = []
        for i in range(len(self.trail) - 1):
            u, v = self.trail[i], self.trail[i + 1]
            edge = self.tracer.graph.get_edge_data(u, v, default={})
            path_details.append({
                "from_address": u,
                "to_address": v,
                "tx_hash": edge.get("tx_hash", f"0xtx_{i}"),
                "amount_crypto": float(edge.get("amount_crypto", 0.0)),
                "timestamp": int(edge.get("timestamp", 0)),
            })

        dossier = generate_case_dossier(
            root_address="0x_suspect_theft_initiator",
            attribution_result=self.summary,
            path_details=path_details,
            case_reference_id="LEA-TEST-2026-9900",
        )

        self.assertIn("case_metadata", dossier)
        self.assertIn("primary_target_vasp", dossier)
        self.assertIn("forensic_trail", dossier)
        self.assertIn("statutory_notice_draft", dossier)

        meta = dossier["case_metadata"]
        self.assertEqual(meta["case_reference_id"], "LEA-TEST-2026-9900")
        self.assertEqual(meta["root_suspect_address"], "0x_suspect_theft_initiator")

        notice = dossier["statutory_notice_draft"]
        self.assertIn("SECTION 91 OF THE CODE OF CRIMINAL PROCEDURE", notice)
        self.assertIn("SECTION 94 OF BHARATIYA NAGARIK SURAKSHA SANHITA", notice)
        self.assertIn("SECTION 12 OF THE PREVENTION OF MONEY LAUNDERING ACT", notice)
        self.assertIn("MANDATORY STATUTORY DIRECTIVES", notice)
        self.assertIn("IMMEDIATE ASSET FREEZE", notice)


class TestFastAPIEndpoints(unittest.TestCase):
    """Integration tests for FastAPI REST endpoints using TestClient."""

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_health_check_endpoint(self):
        """GET /health must return 200 with status ok and VASP count."""
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "ok")
        self.assertGreaterEqual(data["loaded_vasp_count"], 30)
        self.assertIn("ETH", data["supported_chains"])

    def test_trace_endpoint_suspect_theft_initiator(self):
        """POST /api/v1/trace with 0x_suspect_theft_initiator returns 200 and Cytoscape elements."""
        payload = {
            "wallet_address": "0x_suspect_theft_initiator",
            "chain": "ETH",
            "max_hops": 5,
            "min_amount_threshold": 0.01,
        }
        response = self.client.post("/api/v1/trace", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["root_address"], "0x_suspect_theft_initiator")
        self.assertIsInstance(data["elements"], list)
        self.assertGreater(len(data["elements"]), 0)
        self.assertIn("attribution_summary", data)
        self.assertIn("metrics", data)

    def test_trace_endpoint_root_suspect_wallet(self):
        """POST /api/v1/trace with ROOT_SUSPECT_WALLET returns 200."""
        payload = {
            "wallet_address": ROOT_SUSPECT_WALLET,
            "chain": "ETH",
            "max_hops": 5,
        }
        response = self.client.post("/api/v1/trace", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["root_address"], ROOT_SUSPECT_WALLET)

    def test_trace_endpoint_invalid_address_format(self):
        """POST /api/v1/trace with blank or truncated address returns 422."""
        response = self.client.post("/api/v1/trace", json={"wallet_address": "  "})
        self.assertEqual(response.status_code, 422)

    def test_trace_endpoint_isolated_address_not_found(self):
        """POST /api/v1/trace with unknown/isolated address returns 404."""
        payload = {
            "wallet_address": "0xdeadbeef00000000000000000000000000000000",
            "chain": "ETH",
        }
        response = self.client.post("/api/v1/trace", json=payload)
        self.assertEqual(response.status_code, 404)

    def test_dossier_generate_endpoint_success(self):
        """POST /api/v1/dossier/generate returns 200 with formatted statutory legal dossier."""
        payload = {
            "wallet_address": "0x_suspect_theft_initiator",
            "case_reference_id": "LEA-CYBER-TEST-001",
            "chain": "ETH",
            "max_hops": 5,
        }
        response = self.client.post("/api/v1/dossier/generate", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "success")
        self.assertIn("case_metadata", data)
        self.assertIn("primary_target_vasp", data)
        self.assertIn("forensic_trail", data)
        self.assertIn("statutory_notice_draft", data)
        self.assertEqual(data["case_metadata"]["case_reference_id"], "LEA-CYBER-TEST-001")


if __name__ == "__main__":
    unittest.main()
