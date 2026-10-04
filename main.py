"""Main FastAPI Application Module for Cryptocurrency Tracking and Attribution System.

Exposes RESTful endpoints for:
  - Service health and VASP registry telemetry (GET /health)
  - Multi-hop transaction graph tracing & Cytoscape.js serialization (POST /api/v1/trace)
  - Formal Law Enforcement legal dossier generation under Section 91 CrPC / Section 94 BNSS (POST /api/v1/dossier/generate)

Configured with CORS middleware to enable full interoperability with frontend
frameworks (Next.js, React).
"""

from contextlib import asynccontextmanager
import logging
import sys
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn

from attribution_engine import VASPAttributionScorer
from data_ingestor import IngestionEngine
from dossier_builder import generate_case_dossier
from graph_engine import BlockchainGraphTracer
from heuristics import LaunderingHeuristics
from serializers import format_investigator_stats, networkx_to_cytoscape_elements
from vasp_registry import KNOWN_VASPS, identify_entity

logger = logging.getLogger("CryptoLEA_API")
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")


# ---------------------------------------------------------------------------
# Pydantic Request & Response Schemas
# ---------------------------------------------------------------------------
class TraceRequest(BaseModel):
    """Request payload for on-chain multi-hop graph tracing."""

    wallet_address: str = Field(
        ...,
        description="Originating cryptocurrency address to trace (EVM hex or Bitcoin address)",
        examples=["0x_suspect_theft_initiator"],
    )
    chain: str = Field(
        default="ETH",
        description="Target blockchain ecosystem (ETH, BTC, MATIC)",
        examples=["ETH"],
    )
    max_hops: int = Field(
        default=5,
        ge=1,
        le=15,
        description="Maximum BFS search depth in hops",
        examples=[5],
    )
    min_amount_threshold: float = Field(
        default=0.01,
        ge=0.0,
        description="Minimum crypto transfer amount threshold to include in graph",
        examples=[0.01],
    )


class TraceResponse(BaseModel):
    """Response payload containing Cytoscape.js elements and forensic attribution."""

    status: str = Field(default="success", description="Status of the trace execution")
    root_address: str = Field(..., description="Root suspect wallet address analyzed")
    chain: str = Field(default="ETH", description="Analyzed blockchain ecosystem")
    elements: List[Dict[str, Any]] = Field(
        ...,
        description="Cytoscape.js compatible list of serialized nodes and edges",
    )
    attribution_summary: Dict[str, Any] = Field(
        ...,
        description="Forensic attribution scorecard including confidence score and breakdown",
    )
    metrics: Dict[str, Any] = Field(
        ...,
        description="High-level forensic intelligence metrics and high-risk flags",
    )


class DossierRequest(BaseModel):
    """Request payload for generating a formal statutory case dossier."""

    wallet_address: str = Field(
        ...,
        description="Root suspect address from which stolen assets originated",
        examples=["0x_suspect_theft_initiator"],
    )
    case_reference_id: Optional[str] = Field(
        default=None,
        description="Optional custom case reference number (auto-generated if omitted)",
        examples=["LEA-CYBER-2026-CR9912"],
    )
    chain: str = Field(
        default="ETH",
        description="Target blockchain ecosystem",
        examples=["ETH"],
    )
    max_hops: int = Field(
        default=5,
        ge=1,
        le=15,
        description="Maximum search depth for path reconstruction",
        examples=[5],
    )
    target_vasp_address: Optional[str] = Field(
        default=None,
        description="Optional specific VASP endpoint address to target in statutory notice",
    )


class DossierResponse(BaseModel):
    """Export-ready legal case dossier response compliant with Indian LEA guidelines."""

    status: str = Field(default="success", description="Execution status")
    case_metadata: Dict[str, Any] = Field(..., description="Investigation reference identifiers")
    primary_target_vasp: Dict[str, Any] = Field(..., description="Identified exchange corporate profile")
    forensic_trail: List[Dict[str, Any]] = Field(..., description="Ordered hop-by-hop ledger evidence")
    evidentiary_assessment: Dict[str, Any] = Field(..., description="Confidence scores and statutory threshold")
    statutory_notice_draft: str = Field(..., description="Pre-filled Section 91 CrPC / Section 94 BNSS notice")


# ---------------------------------------------------------------------------
# FastAPI Application Factory & Lifespan
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown telemetry."""
    logger.info("Starting Crypto LEA Attribution & Tracking API Service...")
    logger.info(f"Loaded verified VASP entity profiles in registry: {len(KNOWN_VASPS)}")
    yield
    logger.info("Shutting down Crypto LEA Attribution & Tracking API Service.")


app = FastAPI(
    title="Cryptocurrency Tracking & VASP Attribution API",
    description=(
        "Specialized on-chain financial intelligence API for Law Enforcement Agencies (LEAs) "
        "and Financial Intelligence Units (FIU). Performs multi-hop BFS graph traversal, "
        "anti-laundering heuristic detection, attribution confidence scoring, Cytoscape.js "
        "graph serialization, and formal statutory legal requisition drafting (Section 91 CrPC / Section 94 BNSS)."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# CORS Configuration (Full Interoperability with Next.js / React & Vercel)
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)



# ---------------------------------------------------------------------------
# Pipeline Helper
# ---------------------------------------------------------------------------
def _execute_trace_pipeline(
    wallet_address: str,
    max_hops: int = 5,
    min_amount_threshold: float = 0.01,
) -> tuple[BlockchainGraphTracer, List[Dict[str, Any]], Dict[str, Any]]:
    """Internal helper to execute graph traversal, heuristic annotation, and attribution scoring.

    Raises:
        HTTPException(422) if address format is invalid.
        HTTPException(404) if address is isolated or no outgoing activity is found.
    """
    clean_address = wallet_address.strip()
    if not clean_address or len(clean_address) < 3:
        raise HTTPException(
            status_code=422,
            detail="Invalid wallet address format. Address cannot be blank or truncated.",
        )

    # 1. Initialize Ingestion and Tracing Engine
    ingestor = IngestionEngine(mode="mock")
    tracer = BlockchainGraphTracer(ingestor)

    try:
        tracer.trace_path(
            clean_address,
            max_hops=max_hops,
            min_amount_threshold=min_amount_threshold,
        )
    except Exception as exc:
        logger.error(f"Graph traversal error for '{clean_address}': {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Graph traversal failed: {str(exc)}",
        )

    # 2. Check for isolated or non-existent address
    if tracer.graph.number_of_nodes() <= 1 and tracer.graph.number_of_edges() == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"Wallet address '{clean_address}' is isolated or has no outgoing "
                "transactions matching the query threshold in the ledger."
            ),
        )

    # 3. Annotate Graph with Laundering Risk Heuristics
    LaunderingHeuristics.annotate_graph_risks(tracer.graph)

    # 4. Find Nearest Reachable VASP Endpoints
    vasp_rankings = tracer.find_nearest_vasps(clean_address)
    if not vasp_rankings:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"No reachable VASP endpoint or exchange cash-out destination could be "
                f"attributed from '{clean_address}' within {max_hops} hops."
            ),
        )

    # 5. Score Attribution for the primary shortest trail
    nearest_vasp = vasp_rankings[0]
    primary_trail = nearest_vasp["path"]

    scorer = VASPAttributionScorer()
    attribution_summary = scorer.score_trail(
        trail_path=primary_trail,
        graph=tracer.graph,
        has_mixer_parallel=any(
            tracer.graph.nodes[n].get("nodetype") == "mixer" for n in tracer.graph.nodes
        ),
    )

    return tracer, vasp_rankings, attribution_summary


# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------
@app.get(
    "/health",
    tags=["System Telemetry"],
    summary="Service Health Check & VASP Registry Metrics",
    response_description="Operational status and loaded VASP database entity count",
)
async def health_check() -> Dict[str, Any]:
    """Returns the operational status and loaded VASP database entity count."""
    return {
        "status": "ok",
        "service": "Cryptocurrency Tracking & VASP Attribution Engine",
        "loaded_vasp_count": len(KNOWN_VASPS),
        "supported_chains": ["ETH", "BTC", "MATIC", "BSC"],
        "fiu_compliance_jurisdiction": "India (FIU-IND)",
    }



@app.post(
    "/api/v1/trace",
    response_model=TraceResponse,
    tags=["Forensic Tracing"],
    summary="Execute Multi-Hop BFS Path Tracing & Cytoscape Serialization",
    response_description="Cytoscape.js compatible graph elements with attribution scorecard",
)
async def trace_wallet(payload: TraceRequest) -> TraceResponse:
    """Executes multi-hop graph traversal and returns Cytoscape.js graph elements.

    Workflow:
      1. Validates input wallet address.
      2. Triggers Breadth-First Search (BFS) graph traversal via BlockchainGraphTracer.
      3. Identifies terminal halting nodes (vasp_hot, mixer) and prevents cyclic loops.
      4. Evaluates peeling chain and rapid sweep laundering heuristics.
      5. Calculates deterministic attribution confidence score via VASPAttributionScorer.
      6. Serializes the NetworkX graph into Cytoscape.js elements with primary-path highlights.
    """
    tracer, vasp_rankings, attribution_summary = _execute_trace_pipeline(
        wallet_address=payload.wallet_address,
        max_hops=payload.max_hops,
        min_amount_threshold=payload.min_amount_threshold,
    )

    # Convert graph to Cytoscape.js element objects
    cyto_elements = networkx_to_cytoscape_elements(tracer.graph, attribution_summary)

    # Generate investigator dashboard metrics
    metrics = format_investigator_stats(tracer.graph, [attribution_summary])

    return TraceResponse(
        status="success",
        root_address=payload.wallet_address.strip(),
        chain=payload.chain.upper(),
        elements=cyto_elements,
        attribution_summary=attribution_summary,
        metrics=metrics,
    )


@app.post(
    "/api/v1/dossier/generate",
    response_model=DossierResponse,
    tags=["Legal Intelligence Dossier"],
    summary="Generate Statutory Section 91 CrPC / Section 94 BNSS Legal Requisition Dossier",
    response_description="Complete formal legal brief and statutory requisition notice for exchange nodal officer",
)
async def generate_dossier_endpoint(payload: DossierRequest) -> DossierResponse:
    """Generates an export-ready legal case dossier for Indian Law Enforcement Agencies.

    Constructs:
      - Case reference metadata and UTC dispatch timestamps.
      - Corporate reporting entity legal profile (e.g., CoinDCX / Neblio Technologies Pvt. Ltd.).
      - Ordered forensic transaction ledger with hop-by-hop step classifications.
      - Evidentiary assessment and statutory actionable threshold check (> 65%).
      - Pre-filled statutory notice under Section 91 CrPC / Section 94 BNSS demanding
        account freezing, full KYC, IP logs, and fiat withdrawal UTRs within 24 hours.
    """
    tracer, vasp_rankings, attribution_summary = _execute_trace_pipeline(
        wallet_address=payload.wallet_address,
        max_hops=payload.max_hops,
    )

    nearest = vasp_rankings[0]
    trail = nearest["path"]

    # Reconstruct transaction records along the trail
    path_details: List[Dict[str, Any]] = []
    for i in range(len(trail) - 1):
        u, v = trail[i], trail[i + 1]
        edge = tracer.graph.get_edge_data(u, v, default={})
        path_details.append({
            "from_address": u,
            "to_address": v,
            "tx_hash": edge.get("tx_hash", f"0xtx_{i+1}"),
            "amount_crypto": float(edge.get("amount_crypto", 0.0)),
            "timestamp": int(edge.get("timestamp", 0)),
        })

    # Generate formal legal case dossier
    dossier_dict = generate_case_dossier(
        root_address=payload.wallet_address.strip(),
        attribution_result=attribution_summary,
        path_details=path_details,
        case_reference_id=payload.case_reference_id,
    )

    return DossierResponse(
        status="success",
        case_metadata=dossier_dict["case_metadata"],
        primary_target_vasp=dossier_dict["primary_target_vasp"],
        forensic_trail=dossier_dict["forensic_trail"],
        evidentiary_assessment=dossier_dict["evidentiary_assessment"],
        statutory_notice_draft=dossier_dict["statutory_notice_draft"],
    )


# ---------------------------------------------------------------------------
# Standalone Execution Entrypoint
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

    print("=" * 80)
    print(" LAUNCHING CRYPTO TRACKING & ATTRIBUTION FASTAPI SERVER")
    print(" HOST: 0.0.0.0 | PORT: 8000")
    print("=" * 80)
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
