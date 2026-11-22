import React, { useState } from 'react';
import {
  Gavel,
  Play,
  RotateCcw,
  Sparkles,
  Zap,
  Activity,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { useDebateStream } from './hooks/useDebateStream';
import { HistorySidebar } from './components/HistorySidebar';
import { ExecutionGraph } from './components/ExecutionGraph';
import { CourtroomSplit } from './components/CourtroomSplit';
import { JudgeVerdictCard } from './components/JudgeVerdictCard';
import { SseInspector } from './components/SseInspector';

const PRESET_CLAIMS = [
  {
    label: 'Sea Levels',
    claim: 'Global mean sea levels have risen by more than 20 centimeters since 1900.',
  },
  {
    label: 'Quantum RSA',
    claim: 'Quantum computers are currently capable of breaking RSA-2048 encryption in real time.',
  },
  {
    label: 'Great Wall Orbit',
    claim: 'The Great Wall of China is easily visible to the unaided human eye from low Earth orbit.',
  },
];

export function App() {
  const {
    status,
    threadId,
    claim: activeClaim,
    maxRounds,
    currentRound,
    totalTokens,
    subClaims,
    proponentArgs,
    skepticArgs,
    evidenceUrls,
    activeNode,
    completedNodes,
    verdict,
    interruptData,
    sseEvents,
    history,
    errorMessage,
    startDebate,
    intervene,
    loadDebate,
    resetDebate,
  } = useDebateStream();

  const [inputClaim, setInputClaim] = useState('');
  const [selectedMaxRounds, setSelectedMaxRounds] = useState(2);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);

  const handleRunDebate = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const claimToRun = inputClaim.trim() || activeClaim.trim();
    if (!claimToRun || status === 'running') return;
    startDebate(claimToRun, selectedMaxRounds);
  };

  const handleSelectPreset = (presetClaim: string) => {
    setInputClaim(presetClaim);
  };

  const getStatusBadge = () => {
    const styles: Record<string, string> = {
      idle: 'bg-slate-800 text-slate-400 border-slate-700',
      running: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30 animate-pulse',
      paused: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      error: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
    };
    return (
      <span
        className={`px-2.5 py-1 text-xs font-mono font-semibold uppercase tracking-wider rounded-md border flex items-center gap-1.5 ${
          styles[status] || styles.idle
        }`}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            status === 'running'
              ? 'bg-cyan-400 animate-ping'
              : status === 'completed'
              ? 'bg-emerald-400'
              : status === 'paused'
              ? 'bg-amber-400'
              : status === 'error'
              ? 'bg-rose-400'
              : 'bg-slate-500'
          }`}
        />
        {status}
      </span>
    );
  };

  const graphStateSnapshot = {
    thread_id: threadId,
    raw_claim: activeClaim || inputClaim,
    sub_claims: subClaims,
    round: currentRound,
    max_rounds: maxRounds,
    proponent_arguments_count: proponentArgs.length,
    skeptic_arguments_count: skepticArgs.length,
    evidence_count: evidenceUrls.length,
    total_tokens: totalTokens,
    status,
    active_node: activeNode,
    verdict: verdict ? verdict.verdict : null,
    confidence: verdict ? verdict.confidence : null,
    is_paused: status === 'paused',
  };

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
      {/* Left History Sidebar */}
      <HistorySidebar
        history={history}
        selectedThreadId={threadId}
        onSelectDebate={loadDebate}
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
      />

      {/* Main War-Room Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Header Bar */}
        <header className="px-6 py-3.5 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between shrink-0 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-blue-600 text-white shadow-md shadow-cyan-900/50">
              <Gavel className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold tracking-tight text-white uppercase">
                  CrossExam
                </h1>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 font-mono">
                  v1.0 MVP
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono">
                Adversarial Fact-Checker & Multi-Agent Courtroom Engine
              </p>
            </div>
          </div>

          {/* Telemetry Pills */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-md bg-slate-950 border border-slate-800 text-xs font-mono text-slate-400">
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              <span>Round:</span>
              <span className="text-cyan-400 font-bold">{currentRound}</span>
              <span className="text-slate-600">/</span>
              <span>{maxRounds}</span>
            </div>

            <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-md bg-slate-950 border border-slate-800 text-xs font-mono text-slate-400">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Tokens:</span>
              <span className="text-amber-400 font-bold">{totalTokens.toLocaleString()}</span>
            </div>

            {getStatusBadge()}
          </div>
        </header>

        {/* Content Container */}
        <div className="p-6 space-y-5 max-w-7xl mx-auto w-full">
          {/* Claim Input & Presets Bar */}
          <section className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-xl space-y-3">
            <form onSubmit={handleRunDebate} className="flex flex-col sm:flex-row gap-2.5">
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="Enter any claim or proposition to adversarial fact-check (e.g. climate data, geopolitical news)..."
                  value={inputClaim}
                  onChange={(e) => setInputClaim(e.target.value)}
                  disabled={status === 'running'}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all disabled:opacity-60"
                />
              </div>

              {/* Rounds Selector */}
              <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 shrink-0">
                <span className="text-[11px] font-mono text-slate-400 pl-1">Rounds:</span>
                <select
                  value={selectedMaxRounds}
                  onChange={(e) => setSelectedMaxRounds(Number(e.target.value))}
                  disabled={status === 'running'}
                  className="bg-transparent text-xs font-mono text-cyan-400 focus:outline-none cursor-pointer pr-1"
                >
                  <option value={1} className="bg-slate-900 text-slate-200">
                    1
                  </option>
                  <option value={2} className="bg-slate-900 text-slate-200">
                    2 (Recommended)
                  </option>
                </select>
              </div>

              {/* Action Buttons */}
              <button
                type="submit"
                disabled={status === 'running' || (!inputClaim.trim() && !activeClaim.trim())}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-cyan-950 shrink-0"
              >
                {status === 'running' ? (
                  <>
                    <Sparkles className="w-3.5 h-3.5 animate-spin" />
                    Debating...
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    Run Debate
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={resetDebate}
                className="inline-flex items-center justify-center p-2.5 rounded-lg text-slate-400 hover:text-slate-200 bg-slate-950 border border-slate-800 hover:bg-slate-800 transition-colors shrink-0"
                title="Reset session"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </form>

            {/* Presets */}
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800/60 text-[11px]">
              <span className="text-slate-500 font-mono flex items-center gap-1">
                <HelpCircle className="w-3 h-3" /> Preset Claims:
              </span>
              {PRESET_CLAIMS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectPreset(preset.claim)}
                  disabled={status === 'running'}
                  className="px-2.5 py-1 rounded-md bg-slate-950/80 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-cyan-300 font-mono transition-colors disabled:opacity-50"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </section>

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3.5 bg-rose-950/40 border border-rose-500/50 rounded-xl text-rose-300 text-xs flex items-center gap-2.5 shadow-lg">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <div className="flex-1">
                <span className="font-semibold">Execution Notice: </span>
                <span>{errorMessage}</span>
              </div>
            </div>
          )}

          {/* 5-Node Pipeline Progress */}
          <ExecutionGraph
            status={status}
            activeNode={activeNode}
            completedNodes={completedNodes}
            currentRound={currentRound}
            maxRounds={maxRounds}
          />

          {/* Judge Verdict & HITL Intervention Gate */}
          {(verdict || interruptData) && (
            <JudgeVerdictCard
              verdict={verdict}
              interruptData={interruptData}
              onIntervene={intervene}
              isIntervening={status === 'running'}
            />
          )}

          {/* Courtroom Split (Proponent vs Skeptic) */}
          <CourtroomSplit
            subClaims={subClaims}
            proponentArgs={proponentArgs}
            skepticArgs={skepticArgs}
            evidenceUrls={evidenceUrls}
            isDebating={status === 'running'}
            currentRound={currentRound}
          />

          {/* Telemetry & SSE State Inspector */}
          <SseInspector
            events={sseEvents}
            graphState={graphStateSnapshot}
            isOpen={isInspectorOpen}
            onToggle={() => setIsInspectorOpen(!isInspectorOpen)}
          />
        </div>
      </main>
    </div>
  );
}

export default App;
