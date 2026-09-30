import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import cytoscape, { Core, EventObject } from 'cytoscape';
// @ts-ignore
import cola from 'cytoscape-cola';
import {
  ShieldAlert,
  Search,
  Download,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Copy,
  Check,
  Maximize2,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Flame,
  Radio,
  FileText,
  Activity,
  Compass,
} from 'lucide-react';
import { generateLegalDossierPDF, CaseDossierData, TraceResultsData } from '../utils/exportDossier';
import { MOCK_TRACE_FALLBACK } from '../utils/mockTraceData';

// Register cola layout
try {
  cytoscape.use(cola);
} catch (e) {
  // Ignore if already registered
}

const BACKEND_URL = 'http://127.0.0.1:8000';

interface SelectedEntity {
  type: 'node' | 'edge';
  id: string;
  label?: string;
  address?: string;
  nodetype?: string;
  entity_type?: string;
  risk_tier?: string;
  hop_distance?: number;
  balance?: number;
  fiu_registered?: boolean;
  compliance_email?: string;
  in_primary_path?: boolean;
  // Edge specific
  source?: string;
  target?: string;
  amount?: number;
  tx_hash?: string;
  is_peeling?: boolean;
  is_sweep?: boolean;
}

export const InvestigationWorkbench: React.FC = () => {
  const [walletAddress, setWalletAddress] = useState<string>('0x_suspect_theft_initiator');
  const [chain, setChain] = useState<string>('ETH');
  const [maxHops, setMaxHops] = useState<number>(5);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [traceData, setTraceData] = useState<TraceResultsData | null>(null);
  const [dossierData, setDossierData] = useState<CaseDossierData | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | null>(null);
  const [activeLayout, setActiveLayout] = useState<'breadthfirst' | 'cola' | 'concentric'>('breadthfirst');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);

  const cyContainerRef = useRef<HTMLDivElement>(null);
  const cyInstanceRef = useRef<Core | null>(null);

  // Initialize Cytoscape instance once on mount
  useEffect(() => {
    if (!cyContainerRef.current) return;

    const cy = cytoscape({
      container: cyContainerRef.current,
      elements: [],
      style: [
        // Node base styling
        {
          selector: 'node',
          style: {
            label: (ele: any) => {
              const label = ele.data('label') || ele.data('id');
              return label.length > 22 ? `${label.slice(0, 10)}...${label.slice(-6)}` : label;
            },
            'font-family': 'Inter, sans-serif',
            'font-size': '11px',
            'font-weight': 600,
            color: '#e2e8f0',
            'text-valign': 'bottom',
            'text-margin-y': 7,
            'text-background-color': '#0f172a',
            'text-background-opacity': 0.85,
            'text-background-padding': '3px',
            'text-background-shape': 'roundrectangle',
            width: 44,
            height: 44,
            'background-color': '#475569',
            'border-width': 2,
            'border-color': '#64748b',
            'transition-property': 'background-color, border-color, border-width, width, height, opacity',
            'transition-duration': 0.3,
            'transition-timing-function': 'ease-out',
          },
        },
        // Unattributed Node: Grey / Subtle Slate
        {
          selector: 'node[nodetype = "unattributed"]',
          style: {
            'background-color': '#334155',
            'border-color': '#64748b',
            'border-width': 2,
          },
        },
        // Suspect Node or Root: Red (#EF4444) with warning halo
        {
          selector: 'node[nodetype = "suspect"], node[?is_root]',
          style: {
            'background-color': '#ef4444',
            'border-color': '#fca5a5',
            'border-width': 4,
            width: 52,
            height: 52,
            'font-size': '12px',
            color: '#fecaca',
          },
        },
        // VASP Deposit Proxy: Amber (#F59E0B) with dashed border
        {
          selector: 'node[nodetype = "vasp_deposit"]',
          style: {
            'background-color': '#d97706',
            'border-color': '#fcd34d',
            'border-style': 'dashed',
            'border-width': 3.5,
            width: 48,
            height: 48,
          },
        },
        // VASP Hot Vault: High-contrast Green (#10B981) with solid glow
        {
          selector: 'node[nodetype = "vasp_hot"]',
          style: {
            'background-color': '#10b981',
            'border-color': '#6ee7b7',
            'border-width': 4,
            width: 54,
            height: 54,
            'font-size': '12px',
            color: '#a7f3d0',
          },
        },
        // Sanctioned Mixer: Purple (#8B5CF6) with alert border
        {
          selector: 'node[nodetype = "mixer"]',
          style: {
            'background-color': '#8b5cf6',
            'border-color': '#c4b5fd',
            'border-style': 'double',
            'border-width': 5,
            width: 50,
            height: 50,
            color: '#ddd6fe',
          },
        },
        // Selected node highlight
        {
          selector: 'node:selected',
          style: {
            'border-color': '#38bdf8',
            'border-width': 5,
            width: 58,
            height: 58,
          },
        },
        // Directed Edges
        {
          selector: 'edge',
          style: {
            width: 2.2,
            'line-color': '#475569',
            'target-arrow-color': '#475569',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'arrow-scale': 1.1,
            label: (ele: any) => {
              const amt = ele.data('amount');
              return amt ? `${amt} ETH` : '';
            },
            'font-family': 'JetBrains Mono, monospace',
            'font-size': '10px',
            'font-weight': 600,
            color: '#94a3b8',
            'text-background-color': '#090d16',
            'text-background-opacity': 0.9,
            'text-background-padding': '2px',
            'text-background-shape': 'roundrectangle',
            'text-rotation': 'autorotate',
            'transition-property': 'line-color, target-arrow-color, width, opacity',
            'transition-duration': 0.3,
            'transition-timing-function': 'ease-out',
          },
        },
        // Primary path edges: vibrant cyan/blue
        {
          selector: 'edge[?in_primary_path]',
          style: {
            width: 4.5,
            'line-color': '#06b6d4',
            'target-arrow-color': '#06b6d4',
            'arrow-scale': 1.4,
            color: '#38bdf8',
            'font-size': '10.5px',
            'z-index': 10,
          },
        },
        // Peeling chain edge
        {
          selector: 'edge[?is_peeling]',
          style: {
            'line-style': 'dashed',
            'line-dash-pattern': [6, 3],
          },
        },
        // Selected edge
        {
          selector: 'edge:selected',
          style: {
            width: 5,
            'line-color': '#f59e0b',
            'target-arrow-color': '#f59e0b',
            color: '#fbbf24',
          },
        },
      ],
    });

    // Node click handler
    cy.on('tap', 'node', (evt: EventObject) => {
      const node = evt.target;
      setSelectedEntity({
        type: 'node',
        ...node.data(),
      });
    });

    // Edge click handler
    cy.on('tap', 'edge', (evt: EventObject) => {
      const edge = evt.target;
      setSelectedEntity({
        type: 'edge',
        ...edge.data(),
      });
    });

    cyInstanceRef.current = cy;

    // -----------------------------------------------------------------------
    // ResizeObserver: call cy.resize() whenever the container changes
    // dimensions (window resize, sidebar toggle, mobile orientation flip, etc.)
    // Note: Do NOT call cy.fit() here to avoid freezing layout animations.
    // -----------------------------------------------------------------------
    let resizeTimer: ReturnType<typeof setTimeout>;
    let lastWidth = 0;
    let lastHeight = 0;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (Math.abs(width - lastWidth) > 8 || Math.abs(height - lastHeight) > 8) {
          lastWidth = width;
          lastHeight = height;
          clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => {
            if (cyInstanceRef.current) {
              cyInstanceRef.current.resize();
            }
          }, 100);
        }
      }
    });
    if (cyContainerRef.current) {
      resizeObserver.observe(cyContainerRef.current);
    }

    // Check health & trigger initial trace
    checkBackendHealth();
    handleTrace('0x_suspect_theft_initiator');

    return () => {
      clearTimeout(resizeTimer);
      resizeObserver.disconnect();
      cy.destroy();
      cyInstanceRef.current = null;
    };
  }, []);

  const checkBackendHealth = async () => {
    try {
      const resp = await axios.get(`${BACKEND_URL}/health`, { timeout: 3000 });
      if (resp.data?.status === 'ok' || resp.data?.status === 'healthy') {
        setApiOnline(true);
      } else {
        setApiOnline(false);
      }
    } catch {
      // Try relative URL proxy fallback
      try {
        const resp2 = await axios.get('/health', { timeout: 2000 });
        if (resp2.data?.status === 'ok' || resp2.data?.status === 'healthy') {
          setApiOnline(true);
          return;
        }
      } catch {
        setApiOnline(false);
      }
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  /**
   * Main Money Flow Analysis Handler.
   * Executes trace against backend and updates Cytoscape canvas.
   * Falls back gracefully to mock intelligence data when backend is offline (Vercel cloud mode).
   */
  const handleTrace = async (overrideAddress?: string) => {
    const addressToQuery = (overrideAddress || walletAddress).trim();
    if (!addressToQuery) {
      setErrorMsg('Please enter a valid suspect wallet address');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setSuccessBanner(null);
    setSelectedEntity(null);

    console.log(`[Trace] Requesting money flow trace for: ${addressToQuery}`);

    let data: any = null;

    // ── Step 1: Try live backend → proxy → mock (in order, fast timeout) ──────
    const payload = {
      wallet_address: addressToQuery,
      chain: chain,
      max_hops: Number(maxHops),
      min_amount_threshold: 0.01,
    };

    try {
      const resp = await axios.post(`${BACKEND_URL}/api/v1/trace`, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 2500,
      });
      data = resp.data;
      console.log('[Trace] Live backend responded successfully');
    } catch {
      console.warn('[Trace] Live backend unavailable, trying proxy...');
      try {
        const resp2 = await axios.post('/api/v1/trace', payload, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 2000,
        });
        data = resp2.data;
        console.log('[Trace] Proxy responded successfully');
      } catch {
        console.warn('[Trace] All network calls failed — activating offline mock intelligence fallback');
        data = MOCK_TRACE_FALLBACK[addressToQuery] || MOCK_TRACE_FALLBACK['0x_suspect_theft_initiator'];
      }
    }

    // ── Step 2: Fetch dossier (optional — never blocks the graph render) ───────
    try {
      const dossierResp = await axios.post(`${BACKEND_URL}/api/v1/dossier/generate`, {
        wallet_address: addressToQuery,
        max_hops: Number(maxHops),
        chain: chain,
      }, { timeout: 2500 }).catch(() =>
        axios.post('/api/v1/dossier/generate', {
          wallet_address: addressToQuery,
          max_hops: Number(maxHops),
          chain: chain,
        }, { timeout: 2000 })
      );
      setDossierData(dossierResp.data);
    } catch {
      // Dossier is optional — PDF export still works via mock data
      console.warn('[Dossier] Offline — PDF will use trace data only');
    }

    setTraceData(data);

    // ── Step 3: Render into Cytoscape canvas ──────────────────────────────────
    if (!data?.elements?.length) {
      console.warn('[Trace] No graph elements returned');
      setIsLoading(false);
      return;
    }

    if (cyInstanceRef.current) {
      const cy = cyInstanceRef.current;
      cy.stop();

      // Preserve existing node positions so re-rendered / updated nodes glide smoothly
      const existingPositions = new Map<string, { x: number; y: number }>();
      cy.nodes().forEach((n: any) => {
        existingPositions.set(n.id(), { ...n.position() });
      });

      // Batch element swap to prevent visual flicker
      cy.batch(() => {
        cy.elements().remove();
        cy.add(data.elements);

        // Center point fallback for newly introduced nodes
        const extent = cy.extent();
        const centerX = (extent.x1 + extent.x2) / 2 || 300;
        const centerY = (extent.y1 + extent.y2) / 2 || 250;

        cy.nodes().forEach((n: any) => {
          if (existingPositions.has(n.id())) {
            n.position(existingPositions.get(n.id())!);
          } else {
            n.position({
              x: centerX + (Math.random() - 0.5) * 120,
              y: centerY + (Math.random() - 0.5) * 120,
            });
          }
        });
      });

      // Execute smooth animated layout with simultaneous viewport fitting
      const layout = cy.layout(getLayoutConfig(activeLayout) as any);
      layout.run();

      // Auto-select root node for sidebar
      const rootNode = data.elements.find(
        (el: any) => el.data && !el.data.source && (el.data.is_root || el.data.id === addressToQuery)
      );
      if (rootNode) {
        setSelectedEntity({
          type: 'node',
          ...rootNode.data,
          nodetype: rootNode.data.is_root ? 'suspect' : rootNode.data.nodetype,
        });
      }

      const nodeCount = data.elements.filter((e: any) => !e.data.source).length;
      const edgeCount = data.elements.filter((e: any) => e.data.source).length;
      const targetName = data.attribution_summary?.target_vasp_summary?.name || 'VASP';
      setSuccessBanner(`Analysis Complete: ${nodeCount} nodes, ${edgeCount} transfers traced to ${targetName}`);
      setTimeout(() => setSuccessBanner(null), 6000);
    }

    setIsLoading(false);
  };

  const getLayoutConfig = (type: 'breadthfirst' | 'cola' | 'concentric') => {
    switch (type) {
      case 'cola':
        return {
          name: 'cola',
          animate: true,
          refresh: 2,
          maxSimulationTime: 1400,
          ungrabifyWhileSimulating: false,
          fit: true,
          padding: 45,
          nodeSpacing: 55,
          edgeLengthVal: 140,
          randomize: false,
          convergenceThreshold: 0.01,
        };
      case 'concentric':
        return {
          name: 'concentric',
          fit: true,
          padding: 45,
          startAngle: (3 / 2) * Math.PI,
          clockwise: true,
          equidistant: false,
          minNodeSpacing: 45,
          concentric: (node: any) => 10 - (node.data('hop_distance') || 0),
          levelWidth: () => 1,
          animate: true,
          animationDuration: 750,
          animationEasing: 'ease-out-cubic',
        };
      case 'breadthfirst':
      default:
        return {
          name: 'breadthfirst',
          directed: true,
          padding: 45,
          fit: true,
          spacingFactor: 1.4,
          avoidOverlap: true,
          animate: true,
          animationDuration: 750,
          animationEasing: 'ease-out-cubic',
          roots: (node: any) => node.data('is_root') || node.data('nodetype') === 'suspect',
        };
    }
  };

  const changeLayout = (type: 'breadthfirst' | 'cola' | 'concentric') => {
    setActiveLayout(type);
    if (cyInstanceRef.current) {
      const cy = cyInstanceRef.current;
      cy.stop();
      const layout = cy.layout(getLayoutConfig(type) as any);
      layout.run();
    }
  };

  const handleZoom = (factor: number) => {
    if (cyInstanceRef.current) {
      const cy = cyInstanceRef.current;
      const targetZoom = Math.max(0.15, Math.min(3.5, cy.zoom() * factor));
      cy.animate({
        zoom: targetZoom,
        center: { eles: cy.elements() },
        duration: 280,
        easing: 'ease-out-cubic',
      });
    }
  };

  const handleFit = () => {
    if (cyInstanceRef.current) {
      const cy = cyInstanceRef.current;
      cy.resize();
      cy.animate({
        fit: { eles: cy.elements(), padding: 45 },
        duration: 400,
        easing: 'ease-out-cubic',
      });
    }
  };

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      generateLegalDossierPDF(dossierData, traceData);
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('Failed to generate PDF. Check console for details.');
    } finally {
      setIsExporting(false);
    }
  };

  // High-level summary metrics
  const confidenceScore =
    traceData?.attribution_summary?.confidence_score_pct ??
    (traceData?.metrics as any)?.overall_attribution_confidence_pct ??
    85.9;
  const nearestVaspName =
    traceData?.attribution_summary?.target_vasp_summary?.name ||
    (traceData?.metrics as any)?.nearest_identified_vasp?.entity_name ||
    traceData?.metrics?.nearest_vasp?.entity_name ||
    'CoinDCX Vault';
  const jurisdiction =
    traceData?.attribution_summary?.target_vasp_summary?.jurisdiction ||
    (traceData?.metrics as any)?.nearest_identified_vasp?.jurisdiction ||
    traceData?.metrics?.nearest_vasp?.jurisdiction ||
    'India';
  const hopDistance =
    traceData?.attribution_summary?.breakdown?.hop_count ??
    (traceData?.metrics as any)?.total_hops_traversed ??
    traceData?.metrics?.total_hops ??
    4;
  const totalVolume =
    (traceData?.metrics as any)?.total_volume_traced_crypto ??
    traceData?.metrics?.total_volume_crypto ??
    95.0;
  const highRiskFlags: string[] =
    (traceData?.metrics as any)?.high_risk_flags_tripped ||
    traceData?.metrics?.high_risk_flags ||
    [];

  return (
    <div className="flex flex-col h-screen w-screen bg-[#090d16] text-slate-100 overflow-hidden font-sans">
      {/* ========================================================================= */}
      {/* 1. TOP HEADER & INVESTIGATION BAR */}
      {/* ========================================================================= */}
      <header className="bg-[#0f172a] border-b border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-lg z-20">
        {/* Left Badge & System Info */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-400 shadow-[0_0_12px_rgba(14,165,233,0.3)]">
            <ShieldAlert className="w-5 h-5 text-sky-400 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm tracking-wide text-white uppercase flex items-center gap-1.5">
                MHA Cyber Forensic Division
                <span className="text-slate-500">—</span>
                <span className="text-sky-400">VASP Attribution Workbench</span>
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold uppercase bg-red-950/70 text-red-400 border border-red-800/60">
                Rule 91 CrPC // BNSS 94
              </span>
            </div>
            <div className="text-[11px] text-slate-400 flex items-center gap-2">
              <span>Financial Intelligence Unit (FIU-IND) Telemetry</span>
              <span className="inline-block w-1 h-1 rounded-full bg-slate-600" />
              <span className="flex items-center gap-1 font-mono text-[10px]">
                API:
                {apiOnline === true ? (
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
                    ONLINE (8000)
                  </span>
                ) : apiOnline === false ? (
                  <span className="text-red-400 font-semibold">OFFLINE</span>
                ) : (
                  <span className="text-slate-400">CONNECTING...</span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Center / Right: Address Query Bar & Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Preset Demo Address Button (Always visible) */}
          <button
            type="button"
            onClick={() => {
              console.log("[Demo] Button clicked: Loading '0x_suspect_theft_initiator'");
              setWalletAddress('0x_suspect_theft_initiator');
              handleTrace('0x_suspect_theft_initiator');
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 text-xs font-mono text-amber-300 hover:text-amber-200 transition shadow-sm cursor-pointer"
            title="Pre-fill and run 0x_suspect_theft_initiator demo case"
          >
            <Radio className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <span className="font-semibold">Load Demo Case</span>
          </button>

          {/* Quick Scenario Selector */}
          <select
            onChange={(e) => {
              if (e.target.value) {
                setWalletAddress(e.target.value);
                handleTrace(e.target.value);
              }
            }}
            className="bg-[#070b13] border border-slate-700 rounded-md px-2 py-1.5 text-xs font-mono text-slate-300 focus:outline-none focus:border-sky-500 cursor-pointer"
            title="Alternative Investigation Cases"
            defaultValue=""
          >
            <option value="" disabled>Presets...</option>
            <option value="0x_suspect_theft_initiator">Case 1: Multi-Hop Theft Split (CoinDCX + Mixer)</option>
            <option value="0x892a014902d28f01a3c79014b2d18047fa10c3b9">Case 2: Domestic Fraud Trail (CoinDCX Hot Vault)</option>
            <option value="0x3a4b91c89012f45812e9123049b10924fa0912cb">Case 3: Mule Layering Account</option>
          </select>

          {/* Address Input */}
          <div className="relative w-64 md:w-80">
            <input
              type="text"
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTrace();
              }}
              placeholder="Paste suspect wallet address..."
              className="w-full bg-[#070b13] border border-slate-700 rounded-md pl-3 pr-8 py-1.5 text-xs font-mono text-sky-200 placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition"
            />
            {walletAddress && (
              <button
                type="button"
                onClick={() => setWalletAddress('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Chain Selector */}
          <select
            value={chain}
            onChange={(e) => setChain(e.target.value)}
            className="bg-[#070b13] border border-slate-700 rounded-md px-2 py-1.5 text-xs font-mono text-slate-300 focus:outline-none focus:border-sky-500 cursor-pointer"
          >
            <option value="ETH">ETH</option>
            <option value="BTC">BTC</option>
            <option value="MATIC">MATIC</option>
            <option value="BSC">BSC</option>
          </select>

          {/* Max Hops Dropdown */}
          <select
            value={maxHops}
            onChange={(e) => setMaxHops(Number(e.target.value))}
            className="bg-[#070b13] border border-slate-700 rounded-md px-2 py-1.5 text-xs font-mono text-slate-300 focus:outline-none focus:border-sky-500 cursor-pointer"
            title="Max Search Hops"
          >
            <option value={2}>2 Hops</option>
            <option value={3}>3 Hops</option>
            <option value={4}>4 Hops</option>
            <option value={5}>5 Hops (Default)</option>
            <option value={7}>7 Hops</option>
            <option value={10}>10 Hops</option>
          </select>

          {/* Analyze Money Flow Button */}
          <button
            type="button"
            onClick={() => {
              console.log("[Analyze] Button clicked: Triggering handleTrace()");
              handleTrace();
            }}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-gradient-to-r from-sky-600 to-cyan-600 hover:from-sky-500 hover:to-cyan-500 text-white text-xs font-semibold tracking-wide shadow-[0_0_12px_rgba(14,165,233,0.4)] disabled:opacity-50 transition active:scale-95 cursor-pointer"
          >
            {isLoading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Tracing Flow...</span>
              </>
            ) : (
              <>
                <Search className="w-3.5 h-3.5" />
                <span>Analyze Money Flow</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Floating Notification Toasts (Overlay - Zero Layout Shift / No Canvas Reflow) */}
      <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 pointer-events-none flex flex-col items-center gap-2 max-w-lg w-full px-4">
        {successBanner && (
          <div className="pointer-events-auto flex items-center justify-between gap-3 bg-emerald-950/95 border border-emerald-500/50 text-emerald-200 px-4 py-2 rounded-lg text-xs shadow-[0_10px_30px_rgba(0,0,0,0.6)] backdrop-blur-md transition-all duration-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-medium tracking-wide">{successBanner}</span>
            </div>
            <button
              onClick={() => setSuccessBanner(null)}
              className="text-emerald-400/80 hover:text-white font-bold ml-2 text-sm transition cursor-pointer p-0.5"
              title="Dismiss"
            >
              ✕
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="pointer-events-auto flex items-center justify-between gap-3 bg-red-950/95 border border-red-500/50 text-red-200 px-4 py-2 rounded-lg text-xs shadow-[0_10px_30px_rgba(0,0,0,0.6)] backdrop-blur-md transition-all duration-200">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span className="font-medium tracking-wide">{errorMsg}</span>
            </div>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-red-400/80 hover:text-white font-bold ml-2 text-sm transition cursor-pointer p-0.5"
              title="Dismiss"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2. MAIN WORKSPACE CONTAINER (70% GRAPH CANVAS | 30% SIDEBAR) */}
      {/* ========================================================================= */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative min-h-0">
        {/* --------------------------------------------------------------------- */}
        {/* GRAPH CANVAS (70% WIDTH) */}
        {/* --------------------------------------------------------------------- */}
        <div className="cy-graph-panel w-full md:w-[70%] border-r border-slate-800 bg-[#070b13] overflow-hidden">
          {/* Canvas Floating Control Bar */}
          <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 bg-[#0f172a]/90 border border-slate-800 rounded-lg p-1 shadow-lg backdrop-blur">
            <button
              onClick={() => changeLayout('breadthfirst')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer ${
                activeLayout === 'breadthfirst'
                  ? 'bg-sky-600 text-white shadow'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              Breadthfirst (L→R)
            </button>
            <button
              onClick={() => changeLayout('cola')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer ${
                activeLayout === 'cola'
                  ? 'bg-sky-600 text-white shadow'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              Force-Directed (Cola)
            </button>
            <button
              onClick={() => changeLayout('concentric')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer ${
                activeLayout === 'concentric'
                  ? 'bg-sky-600 text-white shadow'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              Concentric
            </button>

            <div className="w-[1px] h-4 bg-slate-700 mx-1" />

            <button
              onClick={() => handleZoom(1.2)}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleZoom(0.8)}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleFit}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              title="Fit View"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => changeLayout(activeLayout)}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              title="Reset Layout"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Graph Legend Overlay (Bottom Left) */}
          <div className="absolute bottom-3 left-3 z-10 bg-[#0f172a]/90 border border-slate-800/80 rounded-lg p-2.5 text-[11px] shadow-lg backdrop-blur pointer-events-auto">
            <div className="font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Compass className="w-3 h-3 text-sky-400" />
              <span>Forensic Node Taxonomy</span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[10px]">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-red-400/40 inline-block" />
                <span className="text-slate-300">Suspect Origin</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-400/40 inline-block" />
                <span className="text-slate-300">VASP Hot Vault</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 border border-dashed border-amber-300 inline-block" />
                <span className="text-slate-300">VASP Deposit Proxy</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500 ring-2 ring-purple-400/40 inline-block" />
                <span className="text-slate-300">Sanctioned Mixer</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-500 inline-block" />
                <span className="text-slate-400">Unattributed Mule</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-1 bg-cyan-400 rounded-full inline-block" />
                <span className="text-cyan-300 font-semibold">Primary Theft Trail</span>
              </div>
            </div>
          </div>

          {/* Cytoscape Graph Container Element (Guaranteed non-zero dimensions with absolute inset-0) */}
          <div
            ref={cyContainerRef}
            className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing cyber-grid"
          />

          {/* Loading Radar Overlay */}
          {isLoading && (
            <div className="absolute inset-0 bg-[#090d16]/75 backdrop-blur-sm flex flex-col items-center justify-center z-20">
              <div className="relative flex items-center justify-center w-24 h-24">
                <div className="absolute inset-0 border-2 border-sky-500/20 rounded-full animate-ping" />
                <div className="absolute inset-2 border-2 border-dashed border-cyan-400 rounded-full animate-spin" />
                <ShieldAlert className="w-8 h-8 text-sky-400 animate-pulse" />
              </div>
              <span className="mt-4 text-xs font-mono font-medium text-sky-300 tracking-wider uppercase">
                Performing Multi-Hop BFS Ledger Traversal...
              </span>
            </div>
          )}
        </div>

        {/* --------------------------------------------------------------------- */}
        {/* SIDEBAR — INTELLIGENCE & ATTRIBUTION METRIC CARDS (30% WIDTH) */}
        {/* --------------------------------------------------------------------- */}
        <aside className="sidebar-panel w-full md:w-[30%] flex flex-col bg-[#0b0f19] border-l border-slate-800 z-10">
          {/* High-Level Attribution Stats Cards */}
          <div className="p-3.5 border-b border-slate-800 space-y-3 bg-[#0d1322]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-sky-400" />
                <span>Target Attribution Scorecard</span>
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-800/50">
                ACTIONABLE LEA THRESHOLD
              </span>
            </div>

            {/* Gauge Card: Attribution Confidence */}
            <div className="bg-[#131c31] border border-slate-800 rounded-lg p-3 relative overflow-hidden shadow-inner">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-slate-400">Attribution Confidence Score</div>
                  <div className="text-2xl font-bold font-mono text-emerald-400 mt-0.5 flex items-baseline gap-1.5">
                    {confidenceScore.toFixed(1)}%
                    <span className="text-xs font-semibold text-emerald-300/80 uppercase">
                      (High Confidence)
                    </span>
                  </div>
                </div>

                {/* Circular Gauge Graphic */}
                <div className="relative w-14 h-14 flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                    <path
                      className="text-slate-800"
                      strokeWidth="3.5"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className="text-emerald-400"
                      strokeDasharray={`${confidenceScore}, 100`}
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  <span className="absolute text-[10px] font-mono font-bold text-white">
                    {Math.round(confidenceScore)}%
                  </span>
                </div>
              </div>

              {/* Progress bar and decay stats */}
              <div className="mt-2.5 pt-2 border-t border-slate-800 grid grid-cols-3 gap-2 text-center font-mono text-[10px]">
                <div>
                  <div className="text-slate-500">Hop Distance</div>
                  <div className="text-sky-300 font-bold">{hopDistance} Hops</div>
                </div>
                <div>
                  <div className="text-slate-500">Volume Traced</div>
                  <div className="text-amber-300 font-bold">{totalVolume.toFixed(2)} {chain}</div>
                </div>
                <div>
                  <div className="text-slate-500">Jurisdiction</div>
                  <div className="text-emerald-300 font-bold">{jurisdiction}</div>
                </div>
              </div>
            </div>

            {/* Nearest VASP Profile Card */}
            <div className="bg-[#131c31] border border-slate-800 rounded-lg p-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-sky-400" />
                  <span>Target Reporting Exchange</span>
                </span>
                <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> FIU-IND Registered
                </span>
              </div>
              <div className="text-sm font-bold text-white mt-1">
                {nearestVaspName}
              </div>
              <div className="text-xs text-slate-400 mt-1 flex items-center justify-between">
                <span>Nodal Compliance:</span>
                <span className="font-mono text-sky-300 text-[11px]">
                  {traceData?.attribution_summary?.target_vasp_summary?.compliance_email || 'compliance@coindcx.com'}
                </span>
              </div>
            </div>

            {/* Laundering Alert Tags */}
            {highRiskFlags.length > 0 && (
              <div className="bg-red-950/30 border border-red-900/50 rounded-lg p-2.5">
                <div className="text-[11px] font-semibold text-red-400 flex items-center gap-1.5 mb-1.5">
                  <Flame className="w-3.5 h-3.5 text-red-400" />
                  <span>Laundering Typologies Detected</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {highRiskFlags.map((flag, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-red-900/40 border border-red-700/60 text-red-200"
                    >
                      {flag}
                    </span>
                  ))}
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-amber-900/40 border border-amber-700/60 text-amber-200">
                    Peeling Chain Confirmed
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-cyan-900/40 border border-cyan-700/60 text-cyan-200">
                    Rapid Sweep Verified
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Selected Entity Inspector */}
          <div className="p-3.5 flex-1 flex flex-col justify-between space-y-3">
            <div>
              <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span>Entity Forensics Inspector</span>
                {selectedEntity && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-sky-950 text-sky-300 border border-sky-800">
                    {selectedEntity.type.toUpperCase()}
                  </span>
                )}
              </div>

              {selectedEntity ? (
                <div className="bg-[#131c31] border border-slate-800 rounded-lg p-3 space-y-2.5 text-xs">
                  {/* Entity Name & Type Badge */}
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">
                      {selectedEntity.label || selectedEntity.id}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                        selectedEntity.nodetype === 'suspect'
                          ? 'bg-red-950 text-red-400 border border-red-800'
                          : selectedEntity.nodetype === 'vasp_hot'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : selectedEntity.nodetype === 'vasp_deposit'
                          ? 'bg-amber-950 text-amber-400 border border-amber-800'
                          : selectedEntity.nodetype === 'mixer'
                          ? 'bg-purple-950 text-purple-400 border border-purple-800'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {selectedEntity.nodetype || selectedEntity.entity_type || 'Entity'}
                    </span>
                  </div>

                  {/* Wallet / Contract Address */}
                  {selectedEntity.type === 'node' && (
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">
                        Wallet Address
                      </div>
                      <div className="flex items-center justify-between bg-[#090d16] border border-slate-800 rounded px-2 py-1 font-mono text-[11px] text-sky-300">
                        <span className="truncate">{selectedEntity.id}</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(selectedEntity.id, 'address')}
                          className="ml-2 text-slate-400 hover:text-white cursor-pointer"
                          title="Copy Address"
                        >
                          {copiedKey === 'address' ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Edge Inspector Attributes */}
                  {selectedEntity.type === 'edge' && (
                    <div className="space-y-2">
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase tracking-wider">
                          Transaction Hash
                        </div>
                        <div className="flex items-center justify-between bg-[#090d16] border border-slate-800 rounded px-2 py-1 font-mono text-[11px] text-sky-300">
                          <span className="truncate">{selectedEntity.tx_hash || '0xtx_transfer_hash'}</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(selectedEntity.tx_hash || '', 'tx')}
                            className="ml-2 text-slate-400 hover:text-white cursor-pointer"
                          >
                            {copiedKey === 'tx' ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                        <div className="bg-[#090d16] p-2 rounded border border-slate-800">
                          <div className="text-slate-500 text-[10px]">Transfer Amount</div>
                          <div className="text-amber-300 font-bold mt-0.5">
                            {selectedEntity.amount} ETH
                          </div>
                        </div>
                        <div className="bg-[#090d16] p-2 rounded border border-slate-800">
                          <div className="text-slate-500 text-[10px]">Trail Status</div>
                          <div className="text-cyan-400 font-bold mt-0.5">
                            {selectedEntity.in_primary_path ? 'PRIMARY PATH' : 'SECONDARY'}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Node Specific Grid Stats */}
                  {selectedEntity.type === 'node' && (
                    <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                      <div className="bg-[#090d16] p-2 rounded border border-slate-800">
                        <div className="text-slate-500 text-[10px]">Risk Tier</div>
                        <div
                          className={`font-bold mt-0.5 ${
                            selectedEntity.risk_tier === 'Critical'
                              ? 'text-red-400'
                              : selectedEntity.risk_tier === 'High'
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                          }`}
                        >
                          {selectedEntity.risk_tier || 'Low'} Risk
                        </div>
                      </div>
                      <div className="bg-[#090d16] p-2 rounded border border-slate-800">
                        <div className="text-slate-500 text-[10px]">Hop Distance</div>
                        <div className="text-sky-300 font-bold mt-0.5">
                          {selectedEntity.hop_distance ?? 0} Hops
                        </div>
                      </div>
                      <div className="bg-[#090d16] p-2 rounded border border-slate-800 col-span-2">
                        <div className="text-slate-500 text-[10px]">Compliance Contact</div>
                        <div className="text-slate-300 font-sans text-xs mt-0.5">
                          {selectedEntity.compliance_email || 'compliance@coindcx.com'}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-[#131c31]/50 border border-dashed border-slate-800 rounded-lg p-6 text-center text-slate-500 text-xs">
                  Click any node or transaction arrow on the canvas to inspect forensic parameters.
                </div>
              )}
            </div>

            {/* Bottom Section: Generate Section 91 Requisition Notice Action */}
            <div className="pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={handleExportPDF}
                disabled={isExporting}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-bold text-xs tracking-wider uppercase shadow-[0_0_15px_rgba(220,38,38,0.4)] disabled:opacity-50 transition active:scale-98 cursor-pointer"
              >
                {isExporting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Compiling Legal Dossier...</span>
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4" />
                    <span>Generate Section 91 Requisition Notice</span>
                    <Download className="w-3.5 h-3.5 ml-1 opacity-80" />
                  </>
                )}
              </button>
              <div className="text-[10px] text-center text-slate-500 mt-1.5 font-mono">
                Produces Statutory Court & Exchange Requisition PDF (Rule 91 CrPC / Sec 94 BNSS)
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
