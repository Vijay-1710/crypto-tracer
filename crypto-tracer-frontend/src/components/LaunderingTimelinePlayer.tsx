import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Core } from 'cytoscape';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  Clock,
  FastForward,
  Eye,
  EyeOff,
  ChevronRight,
  Sliders,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react';
import { TraceResultsData } from '../utils/exportDossier';

export interface LaunderingTimelinePlayerProps {
  cy: Core | null;
  traceData: TraceResultsData | null;
  isLoading: boolean;
  onStepChange?: (step: number, total: number, activeEdge: any) => void;
  className?: string;
}

interface TimelineMilestone {
  stepIndex: number; // 1-based index (0 = T0 suspect start)
  id: string;
  source: string;
  target: string;
  amount: number;
  txHash: string;
  timestamp: number;
  timeStr: string;
  timeRelative: string;
  title: string;
  category: 'theft' | 'split' | 'mixer' | 'deposit' | 'sweep' | 'transfer';
  inPrimaryPath: boolean;
  sourceLabel: string;
  targetLabel: string;
}

export const LaunderingTimelinePlayer: React.FC<LaunderingTimelinePlayerProps> = ({
  cy,
  traceData,
  isLoading,
  onStepChange,
  className = '',
}) => {
  // ---------------------------------------------------------------------------
  // Data Preparation: Extract & Sort Transactions Chronologically
  // ---------------------------------------------------------------------------
  const { sortedEdges, milestones, totalSteps, baseTimestamp } = useMemo(() => {
    if (!traceData?.elements || traceData.elements.length === 0) {
      return { sortedEdges: [], milestones: [], totalSteps: 0, baseTimestamp: 1711929600 };
    }

    const nodeLabelMap = new Map<string, string>();
    traceData.elements.forEach((el: any) => {
      if (el.data && !el.data.source && el.data.id) {
        nodeLabelMap.set(el.data.id, el.data.label || el.data.id);
      }
    });

    const rawEdges = traceData.elements.filter(
      (el: any) => el.data && el.data.source && el.data.target
    );

    // Baseline reference: 10:00:00 AM if no timestamps provided
    const defaultBaseTs = 1711929600;

    // Normalize & sort chronologically based on timestamp
    const sorted = [...rawEdges]
      .map((edge: any, index: number) => {
        const rawTs = Number(edge.data.timestamp);
        const validTs = !isNaN(rawTs) && rawTs > 0 ? rawTs : defaultBaseTs + index * 900;
        return {
          ...edge,
          data: {
            ...edge.data,
            timestamp: validTs,
          },
        };
      })
      .sort((a: any, b: any) => (a.data.timestamp || 0) - (b.data.timestamp || 0));

    const initialTs = sorted.length > 0 ? sorted[0].data.timestamp : defaultBaseTs;

    // Build milestone list
    const items: TimelineMilestone[] = sorted.map((edge: any, idx: number) => {
      const d = edge.data;
      const ts = d.timestamp;
      const ms = ts < 1e11 ? ts * 1000 : ts;
      const date = new Date(ms);

      // Human-readable time (e.g., 10:00 AM)
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // Relative elapsed time from T0
      const diffMinutes = Math.max(0, Math.round((ts - initialTs) / 60));
      const hours = Math.floor(diffMinutes / 60);
      const mins = diffMinutes % 60;
      const timeRelative = diffMinutes === 0 ? 'T₀ (Start)' : hours > 0 ? `+${hours}h ${mins}m` : `+${mins}m`;

      // Smart forensic event title
      let title = 'Mule Hop';
      let category: TimelineMilestone['category'] = 'transfer';

      if (d.is_sweep || d.target?.toLowerCase().includes('vault') || d.target?.toLowerCase().includes('inflow')) {
        title = 'CoinDCX Sweep';
        category = 'sweep';
      } else if (d.target?.toLowerCase().includes('mixer') || d.target?.toLowerCase().includes('tornado')) {
        title = 'Mixer Obfuscation';
        category = 'mixer';
      } else if (d.target?.toLowerCase().includes('dep_') || d.target?.toLowerCase().includes('deposit')) {
        title = 'Exchange Deposit';
        category = 'deposit';
      } else if (d.is_peeling) {
        title = 'Mule Split';
        category = 'split';
      } else if (idx === 0) {
        title = 'Theft Initiated';
        category = 'theft';
      }

      return {
        stepIndex: idx + 1,
        id: d.id,
        source: d.source,
        target: d.target,
        amount: Number(d.amount) || 0,
        txHash: d.tx_hash || '',
        timestamp: ts,
        timeStr,
        timeRelative,
        title,
        category,
        inPrimaryPath: !!d.in_primary_path,
        sourceLabel: nodeLabelMap.get(d.source) || d.source,
        targetLabel: nodeLabelMap.get(d.target) || d.target,
      };
    });

    return {
      sortedEdges: sorted,
      milestones: items,
      totalSteps: sorted.length,
      baseTimestamp: initialTs,
    };
  }, [traceData]);

  // ---------------------------------------------------------------------------
  // Player Controls & State
  // ---------------------------------------------------------------------------
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 2 | 5>(1);
  const [viewMode, setViewMode] = useState<'ghost' | 'hidden'>('ghost'); // 15% opacity vs display: none
  const [isMinimized, setIsMinimized] = useState<boolean>(false);

  // Synchronize initial state: reveal full graph when a fresh trace loads
  useEffect(() => {
    if (totalSteps > 0) {
      setCurrentStep(totalSteps);
      setIsPlaying(false);
    }
  }, [totalSteps]);

  // ---------------------------------------------------------------------------
  // Graph Application: Sequentially reveal nodes & edges in Cytoscape
  // Nodes & edges that haven't occurred yet are dimmed to 15% opacity or hidden
  // ---------------------------------------------------------------------------
  const applyTimelineStep = (step: number, edgesList: any[], mode: 'ghost' | 'hidden') => {
    if (!cy || cy.destroyed()) return;

    const rootNode = traceData?.elements?.find(
      (el: any) => el.data && !el.data.source && (el.data.is_root || el.data.nodetype === 'suspect')
    );
    const rootId = rootNode?.data?.id;

    // Edges that have occurred up to current step
    const activeEdges = edgesList.slice(0, step);
    const activeEdgeIds = new Set(activeEdges.map((e: any) => e.data.id));

    // Nodes revealed up to current step
    const activeNodeIds = new Set<string>();
    if (rootId) activeNodeIds.add(rootId);

    activeEdges.forEach((e: any) => {
      if (e.data.source) activeNodeIds.add(e.data.source);
      if (e.data.target) activeNodeIds.add(e.data.target);
    });

    // Newly activated edge at this exact step (for pulse flash)
    const latestEdge = step > 0 && step <= edgesList.length ? edgesList[step - 1] : null;

    cy.batch(() => {
      // 1. Update Edges
      cy.edges().forEach((edge: any) => {
        const isRevealed = activeEdgeIds.has(edge.id());
        if (isRevealed) {
          edge.style({
            display: 'element',
            opacity: 1,
            'line-opacity': edge.data('in_primary_path') ? 1 : 0.65,
          });
        } else {
          if (mode === 'hidden') {
            edge.style({ display: 'none' });
          } else {
            edge.style({
              display: 'element',
              opacity: 0.12,
              'line-opacity': 0.12,
            });
          }
        }
      });

      // 2. Update Nodes
      cy.nodes().forEach((node: any) => {
        const isRevealed = activeNodeIds.has(node.id());
        if (isRevealed) {
          node.style({
            display: 'element',
            opacity: 1,
          });
        } else {
          if (mode === 'hidden') {
            node.style({ display: 'none' });
          } else {
            node.style({
              display: 'element',
              opacity: 0.15,
            });
          }
        }
      });
    });

    // 3. Trigger flash pop on the newly activated edge
    if (latestEdge && cy) {
      const cyEdge = cy.getElementById(latestEdge.data.id);
      if (cyEdge && cyEdge.length > 0) {
        cyEdge.flashClass('timeline-active-flash', 650);
      }
    }

    if (onStepChange && latestEdge) {
      onStepChange(step, totalSteps, latestEdge.data);
    }
  };

  // Re-apply whenever step, viewMode, or cy changes
  useEffect(() => {
    if (totalSteps > 0 && sortedEdges.length > 0) {
      applyTimelineStep(currentStep, sortedEdges, viewMode);
    }
  }, [currentStep, viewMode, sortedEdges, totalSteps]);

  // ---------------------------------------------------------------------------
  // Playback Loop: Animates step-by-step from T0 to the final exchange sweep
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isPlaying) return;

    // Base interval: 1x = 1200ms, 2x = 600ms, 5x = 240ms
    const stepDuration = Math.round(1200 / playbackSpeed);

    const timer = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= totalSteps) {
          setIsPlaying(false);
          return totalSteps;
        }
        return prev + 1;
      });
    }, stepDuration);

    return () => clearInterval(timer);
  }, [isPlaying, playbackSpeed, totalSteps]);

  // Pause playback if query is loading
  useEffect(() => {
    if (isLoading) {
      setIsPlaying(false);
    }
  }, [isLoading]);

  // Play / Pause toggle handler
  const handlePlayToggle = () => {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      if (currentStep >= totalSteps) {
        // Rewind to start if at the end
        setCurrentStep(0);
      }
      setIsPlaying(true);
    }
  };

  // Scrubber slide handler
  const handleScrubberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsPlaying(false);
    setCurrentStep(Number(e.target.value));
  };

  // Skip helpers
  const handleSkipStart = () => {
    setIsPlaying(false);
    setCurrentStep(0);
  };

  const handleStepBack = () => {
    setIsPlaying(false);
    setCurrentStep((prev) => Math.max(0, prev - 1));
  };

  const handleStepForward = () => {
    setIsPlaying(false);
    setCurrentStep((prev) => Math.min(totalSteps, prev + 1));
  };

  const handleSkipEnd = () => {
    setIsPlaying(false);
    setCurrentStep(totalSteps);
  };

  if (totalSteps === 0) {
    return null;
  }

  // Active milestone details
  const activeMilestone = currentStep > 0 && currentStep <= milestones.length
    ? milestones[currentStep - 1]
    : null;

  // Initial suspect reference date
  const ms0 = baseTimestamp < 1e11 ? baseTimestamp * 1000 : baseTimestamp;
  const initialTimeStr = new Date(ms0).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Progress percentage
  const progressPct = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;

  // ---------------------------------------------------------------------------
  // Minimized Compact Floating Bar
  // ---------------------------------------------------------------------------
  if (isMinimized) {
    return (
      <div
        className={`absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 bg-[#080d19]/95 border border-cyan-500/40 rounded-full px-4 py-2 shadow-[0_8px_30px_rgba(0,0,0,0.8)] backdrop-blur-md transition-all ${className}`}
      >
        <button
          onClick={handlePlayToggle}
          className="w-7 h-7 rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-white flex items-center justify-center shadow-[0_0_12px_rgba(6,182,212,0.5)] transition active:scale-95 cursor-pointer"
          title={isPlaying ? 'Pause' : 'Play Timeline'}
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
        </button>

        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="text-cyan-400 font-semibold">
            {activeMilestone ? activeMilestone.timeStr : initialTimeStr}
          </span>
          <span className="text-slate-500">•</span>
          <span className="text-slate-300">
            {activeMilestone ? activeMilestone.title : 'T₀ Suspect Wallet'}
          </span>
          <span className="text-slate-500">•</span>
          <span className="text-slate-400 text-[11px]">
            {currentStep}/{totalSteps}
          </span>
        </div>

        <button
          onClick={() => setIsMinimized(false)}
          className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800/60 transition cursor-pointer"
          title="Expand Timeline Player"
        >
          <ChevronUp className="w-4 h-4 text-cyan-400" />
        </button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Full Laundering Timeline Player Dock
  // ---------------------------------------------------------------------------
  return (
    <div
      className={`absolute bottom-3 left-1/2 -translate-x-1/2 z-20 w-[95%] max-w-3xl bg-[#080d1a]/95 border border-cyan-500/35 rounded-2xl shadow-[0_16px_45px_rgba(0,0,0,0.85)] backdrop-blur-xl p-3.5 text-xs select-none transition-all ${className}`}
    >
      {/* ── Top Header Row: Title, Live Event Badge, and Mode Controls ── */}
      <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 font-mono font-bold tracking-wider text-[10px] uppercase">
            <Clock className="w-3 h-3 text-cyan-400 animate-pulse" />
            <span>Laundering Timeline Player</span>
          </div>

          {/* Current Event Headline with Pulse Beacon */}
          <div className="flex items-center gap-2 text-slate-200 font-mono text-[11px] truncate">
            <span className="relative flex h-2 w-2">
              {isPlaying && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
              )}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isPlaying ? 'bg-cyan-400' : 'bg-emerald-400'}`} />
            </span>

            {activeMilestone ? (
              <span className="truncate">
                <span className="text-cyan-400 font-semibold">{activeMilestone.timeStr}</span>
                <span className="text-slate-500 mx-1.5">—</span>
                <span className="text-slate-100 font-medium">{activeMilestone.title}</span>
                <span className="text-emerald-400 font-semibold ml-1.5">({activeMilestone.amount} ETH)</span>
                <span className="text-slate-400 ml-2 hidden sm:inline text-[10px]">
                  ({activeMilestone.sourceLabel} → {activeMilestone.targetLabel})
                </span>
              </span>
            ) : (
              <span className="text-slate-400">
                <span className="text-cyan-400 font-semibold">{initialTimeStr}</span>
                <span className="text-slate-500 mx-1.5">—</span>
                <span>T₀ Origin (Suspect Wallet Pre-Theft)</span>
              </span>
            )}
          </div>
        </div>

        {/* View Mode Toggle & Minimize Button */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setViewMode((m) => (m === 'ghost' ? 'hidden' : 'ghost'))}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono transition cursor-pointer border ${
              viewMode === 'ghost'
                ? 'bg-slate-800/80 text-cyan-300 border-cyan-500/40'
                : 'bg-slate-800/80 text-amber-300 border-amber-500/40'
            }`}
            title={viewMode === 'ghost' ? 'Future elements rendered at 15% opacity' : 'Future elements hidden entirely'}
          >
            {viewMode === 'ghost' ? <Eye className="w-3 h-3 text-cyan-400" /> : <EyeOff className="w-3 h-3 text-amber-400" />}
            <span className="hidden sm:inline">{viewMode === 'ghost' ? '15% Ghost' : 'Hidden'}</span>
          </button>

          <button
            onClick={() => setIsMinimized(true)}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800/60 transition cursor-pointer"
            title="Minimize Dock"
          >
            <ChevronDown className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      </div>

      {/* ── Chronological Milestone Ribbon (e.g., 10:00 AM Theft -> 10:35 AM Split -> 11:15 AM Sweep) ── */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 mb-2.5 text-[10.5px] font-mono">
        {/* T0 Root Origin */}
        <div
          onClick={() => {
            setIsPlaying(false);
            setCurrentStep(0);
          }}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-md cursor-pointer transition shrink-0 ${
            currentStep === 0
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/60 shadow-[0_0_8px_rgba(6,182,212,0.3)]'
              : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
          <span>{initialTimeStr} Origin</span>
        </div>

        {/* Milestone Steps with Arrow Separators */}
        {milestones.map((m, idx) => {
          const isPassed = currentStep >= m.stepIndex;
          const isCurrent = currentStep === m.stepIndex;

          return (
            <React.Fragment key={m.id}>
              <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />
              <div
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentStep(m.stepIndex);
                }}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md cursor-pointer transition shrink-0 ${
                  isCurrent
                    ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.4)] font-bold'
                    : isPassed
                    ? 'bg-slate-800/70 text-slate-300 hover:text-white border border-slate-700'
                    : 'bg-slate-900/40 text-slate-600 border border-slate-800/60'
                }`}
                title={`${m.timeStr} • ${m.title} (${m.amount} ETH)\n${m.sourceLabel} → ${m.targetLabel}`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    m.category === 'sweep'
                      ? 'bg-emerald-400'
                      : m.category === 'mixer'
                      ? 'bg-purple-400'
                      : m.category === 'split'
                      ? 'bg-amber-400'
                      : 'bg-cyan-400'
                  }`}
                />
                <span className="font-semibold">{m.timeStr}</span>
                <span>{m.title}</span>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* ── Timeline Range Slider (Interactive Scrubber) ── */}
      <div className="relative mb-3 px-1">
        <input
          type="range"
          min={0}
          max={totalSteps}
          step={1}
          value={currentStep}
          onChange={handleScrubberChange}
          className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer focus:outline-none accent-cyan-400"
          style={{
            background: `linear-gradient(to right, #06b6d4 0%, #06b6d4 ${progressPct}%, #1e293b ${progressPct}%, #1e293b 100%)`,
          }}
        />

        {/* Step Tick Marks */}
        <div className="flex justify-between items-center px-1 text-[9px] font-mono text-slate-500 mt-1">
          <span>{initialTimeStr} (T₀)</span>
          <span className="text-cyan-400/80 font-bold">
            Step {currentStep} of {totalSteps}
          </span>
          <span>{milestones.length > 0 ? milestones[milestones.length - 1].timeStr : ''} (Final Sweep)</span>
        </div>
      </div>

      {/* ── Controls Row: Play/Pause, Navigation, Speeds, and Metrics ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Navigation & Playback Controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleSkipStart}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition cursor-pointer"
            title="Rewind to T₀"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleStepBack}
            disabled={currentStep <= 0}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 disabled:opacity-30 transition cursor-pointer"
            title="Step Backward"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>

          {/* Large Primary Play / Pause Button */}
          <button
            onClick={handlePlayToggle}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-sky-500 via-cyan-500 to-teal-500 hover:from-sky-400 hover:to-teal-400 text-white font-semibold text-xs shadow-[0_0_15px_rgba(6,182,212,0.45)] transition active:scale-95 cursor-pointer"
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                <span>Play Trail</span>
              </>
            )}
          </button>

          <button
            onClick={handleStepForward}
            disabled={currentStep >= totalSteps}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 disabled:opacity-30 transition cursor-pointer"
            title="Step Forward"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleSkipEnd}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition cursor-pointer"
            title="Jump to Final Exchange Sweep"
          >
            <FastForward className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Speed Selector (1x, 2x, 5x) */}
        <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-800 rounded-lg p-0.5">
          <span className="text-[10px] font-mono text-slate-500 px-1.5 hidden sm:inline">Speed:</span>
          {([1, 2, 5] as const).map((spd) => (
            <button
              key={spd}
              onClick={() => setPlaybackSpeed(spd)}
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition cursor-pointer ${
                playbackSpeed === spd
                  ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-500/50 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {spd}x
            </button>
          ))}
        </div>

        {/* Step Summary Tag */}
        <div className="flex items-center gap-2 font-mono text-[10.5px] text-slate-400">
          <span>
            Traced: <strong className="text-cyan-300 font-semibold">{currentStep}</strong> / {totalSteps} transfers
          </span>
          {activeMilestone && (
            <span className="px-1.5 py-0.5 rounded bg-slate-800/80 text-emerald-400 border border-slate-700 text-[10px]">
              {activeMilestone.timeRelative}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
