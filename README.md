# 🛡️ MHA Cyber Forensic Division — VASP Attribution & Crypto Tracking Platform

An advanced multi-hop cryptocurrency intelligence and VASP (Virtual Asset Service Provider) attribution platform designed for Law Enforcement Agencies (LEAs) and the Financial Intelligence Unit (FIU-IND).

---

## 🏛️ Key Features

- **Breadth-First Search (BFS) Money Flow Tracing**: Multi-hop graph traversal engine reconstructing complex peeling chains, rapid consolidation sweeps, and mixer obfuscation trails.
- **VASP Attribution Engine**: Scores attribution probability against 31+ verified Indian and international exchange entities (CoinDCX, WazirX, CoinSwitch, Binance, etc.) using hop decay, velocity continuity, and volume preservation metrics.
- **Interactive Cyber Forensic Workbench (React + Cytoscape.js)**:
  - 70% Viewport interactive graph visualization with custom node taxonomy (Suspect Red Halo, VASP Hot Vault Green, Deposit Proxy Amber, Mixer Purple).
  - Breadthfirst (L→R), Force-Directed (Cola physics), and Concentric layouts.
  - Reactive 30% intelligence sidebar displaying real-time confidence gauge, risk tier, laundering flags, and compliance nodal contacts.
- **Section 91 Cr.P.C. / Section 94 BNSS Legal Dossier Exporter**:
  - 1-click generation of court-admissible, 2-page statutory requisition notices.
  - Complete multi-hop forensic audit trail table.
  - Formal statutory directives mandating 48-hour asset freeze, KYC disclosure, and IP login logs.

---

## 📂 Project Architecture

```
projectx/
├── attribution_engine.py       # Deterministic VASP attribution scoring engine
├── data_ingestor.py            # On-chain ingestion & synthetic laundering ledger
├── dossier_builder.py          # Section 91 CrPC / Section 94 BNSS brief builder
├── graph_engine.py             # NetworkX multi-hop BFS path tracing
├── heuristics.py               # Peeling chain & rapid sweep risk heuristics
├── main.py                     # FastAPI REST API (CORS enabled for port 5174/Vercel)
├── serializers.py              # Cytoscape.js element serializers & investigator stats
├── test_system.py              # Comprehensive 25-case automated test suite (unittest)
├── vasp_registry.py            # Verified VASP entity profiles & FIU-IND registry
│
└── crypto-tracer-frontend/     # React 18 + TypeScript + Vite + Tailwind CSS + Cytoscape
    ├── src/
    │   ├── components/
    │   │   ├── InvestigationWorkbench.tsx  # Main Forensic Workbench
    │   │   └── InvestigationWorkbench.jsx  # Re-export wrapper
    │   ├── utils/
    │   │   ├── exportDossier.ts            # jsPDF & autoTable Section 91 exporter
    │   │   └── exportDossier.js            # Wrapper
    │   ├── App.tsx
    │   ├── main.tsx
    │   └── index.css
    ├── vite.config.ts
    ├── tailwind.config.js
    └── package.json
```

---

## 🚀 Quick Start Guide

### 1. Backend (FastAPI Engine)

```bash
# Install dependencies
pip install fastapi uvicorn networkx pydantic httpx

# Run comprehensive automated test suite (25 test cases)
python -m unittest test_system.py -v

# Run the API server
python main.py
```
Backend will start on: **`http://127.0.0.1:8000`** (Swagger docs: `/docs`, Health: `/health`).

### 2. Frontend (Cyber Forensic Workbench)

```bash
cd crypto-tracer-frontend

# Install dependencies
npm install

# Start development server
npm run dev
```
Frontend will be accessible at: **`http://localhost:5174/`**.

---

## ☁️ Vercel Deployment

Deploy the frontend directly to Vercel:

```bash
cd crypto-tracer-frontend
npx vercel
```
Set `VITE_API_URL` environment variable in Vercel to your deployed backend API URL.

---

## ⚖️ Legal & Statutory Compliance

This software produces documentation under:
- **Section 91, Code of Criminal Procedure, 1973 (Cr.P.C.)**
- **Section 94, Bharatiya Nagarik Suraksha Sanhita, 2023 (BNSS)**
- **Section 12, Prevention of Money Laundering Act, 2002 (PMLA)**
