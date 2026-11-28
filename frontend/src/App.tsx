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
  Sun,
  Moon,
  History,
} from 'lucide-react';
import { useDebateStream } from './hooks/useDebateStream';
import { useTheme } from './hooks/useTheme';
import { HistorySidebar } from './components/HistorySidebar';
import { ExecutionGraph } from './components/ExecutionGraph';
import { CourtroomSplit } from './components/CourtroomSplit';
import { JudgeVerdictCard } from './components/JudgeVerdictCard';
import { SettingsPanel } from './components/SettingsPanel';
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
  {
    label: 'Fusion Net Energy',
    claim: 'Commercial nuclear fusion reactors currently provide net electricity to the public power grid.',
  },
  {
    label: 'EV Carbon Footprint',
    claim: 'Electric vehicles have a higher lifetime carbon footprint than internal combustion engine vehicles when battery manufacturing is included.',
  },
  {
    label: 'Coffee Longevity',
    claim: 'Daily moderate coffee consumption (2-3 cups) is causally linked to reduced all-cause mortality in humans.',
  },
  {
    label: 'Dark Matter vs MOND',
    claim: 'Astronomical observations of galaxy rotation curves have definitively disproven Modified Newtonian Dynamics (MOND) in favor of particle dark matter.',
  },
  {
    label: 'Deep-Sea Oxygen',
    claim: 'Polymetallic nodules on the deep ocean floor produce dark oxygen without sunlight through natural geobattery electrolysis.',
  },
];

export function App() {
  const {
    status,
    threadId,
    claim: activeClaim,
    maxRounds,
    mode,
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
    serverKeyConfigured,
    defaultModels,
    apiSettings,
    updateApiSettings,
    clearApiKey,
    validateApiKey,
    startDebate,
    intervene,
    loadDebate,
    resetDebate,
  } = useDebateStream();

  const { theme, toggleTheme } = useTheme();
  const [inputClaim, setInputClaim] = useState('');
  const [selectedMaxRounds, setSelectedMaxRounds] = useState(3);
  const [selectedMode, setSelectedMode] = useState<'general' | 'scientific' | 'financial' | 'security'>('general');
  const [selectedTemperature, setSelectedTemperature] = useState(0.2);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [isInspectorOpen, setIsInspectorOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );

  const handleRunDebate = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const claimToRun = inputClaim.trim() || activeClaim.trim();
    if (!claimToRun || status === 'running') return;
    startDebate(claimToRun, selectedMaxRounds, selectedMode, selectedTemperature);
  };

  const handleSelectPreset = (presetClaim: string) => {
    setInputClaim(presetClaim);
  };

  const getStatusBadge = () => {
    const styles: Record<string, string> = {
      idle: 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800/80 dark:text-slate-300 dark:border-slate-700',
      running: 'bg-cyan-50 text-cyan-700 border-cyan-300 dark:bg-cyan-500/10 dark:text-cyan-300 dark:border-cyan-500/30',
      paused: 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30',
      completed: 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30',
      error: 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30',
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
              ? 'bg-cyan-600 dark:bg-cyan-400 animate-ping'
              : status === 'completed'
              ? 'bg-emerald-600 dark:bg-emerald-400'
              : status === 'paused'
              ? 'bg-amber-600 dark:bg-amber-400'
              : status === 'error'
              ? 'bg-rose-600 dark:bg-rose-400'
              : 'bg-slate-400 dark:bg-slate-500'
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
    <div className="flex min-h-screen lg:h-screen w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans lg:overflow-hidden transition-colors duration-200">
      {/* Left History Sidebar */}
      <HistorySidebar
        history={history}
        selectedThreadId={threadId}
        onSelectDebate={loadDebate}
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        onCloseMobile={() => setIsSidebarOpen(false)}
      />

      {/* Main War-Room Area */}
      <main className="flex-1 flex flex-col min-w-0 lg:overflow-y-auto">
        {/* Header Bar */}
        <header className="sticky top-0 z-20 px-3 sm:px-6 py-3 bg-white/90 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between gap-2 shrink-0 backdrop-blur-md">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Open debate archive"
              title="Open debate archive"
              className="lg:hidden inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-950 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 transition-colors shrink-0"
            >
              <History className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <span className="text-[11px] font-mono tabular-nums font-semibold">
                {history.length}
              </span>
            </button>

            <div className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-cyan-600 dark:bg-cyan-500/15 text-white dark:text-cyan-400 border border-cyan-700/20 dark:border-cyan-500/30 shadow-sm shrink-0">
              <Gavel className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white uppercase truncate">
                  CrossExam
                </h1>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-50 dark:bg-cyan-950/80 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800/60 font-mono font-medium shrink-0">
                  v1.0
                </span>
              </div>
              <p className="hidden sm:block text-[11px] text-slate-600 dark:text-slate-400 truncate">
                Adversarial Fact-Checker &amp; Multi-Agent Courtroom Engine
              </p>
            </div>
          </div>

          {/* Telemetry Pills & Mode Toggle */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <div className="flex sm:hidden items-center gap-1 px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400">
              <span className="text-cyan-700 dark:text-cyan-400 font-bold">R{currentRound}</span>
              <span className="text-slate-400 dark:text-slate-600">/</span>
              <span>{maxRounds}</span>
            </div>

            <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
              <Activity className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
              <span>Round</span>
              <span className="text-cyan-700 dark:text-cyan-400 font-bold">{currentRound}</span>
              <span className="text-slate-400 dark:text-slate-600">/</span>
              <span>{maxRounds}</span>
            </div>

            <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
              <Zap className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>Tokens</span>
              <span className="text-amber-700 dark:text-amber-400 font-bold">
                {totalTokens.toLocaleString()}
              </span>
            </div>

            {getStatusBadge()}

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-950 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-slate-700" />
              )}
            </button>
          </div>
        </header>

        {/* Content Container */}
        <div className="p-3 sm:p-6 space-y-4 sm:space-y-5 max-w-7xl mx-auto w-full">
          {/* BYOAK API & Model Settings */}
          <SettingsPanel
            serverKeyConfigured={serverKeyConfigured}
            defaultModels={defaultModels}
            apiSettings={apiSettings}
            onUpdateSettings={updateApiSettings}
            onClearKey={clearApiKey}
            onValidateKey={validateApiKey}
            disabled={status === 'running'}
          />

          {/* Claim Input & Presets Bar */}
          <section className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 sm:p-4 shadow-sm dark:shadow-none space-y-3">
            <form onSubmit={handleRunDebate} className="flex flex-col xl:flex-row gap-2.5">
              <div className="flex-1 relative min-w-0">
                <input
                  type="text"
                  placeholder="Enter any claim to fact-check (e.g. climate data, science, news)..."
                  value={inputClaim}
                  onChange={(e) => setInputClaim(e.target.value)}
                  disabled={status === 'running'}
                  className="w-full px-3.5 py-2.5 text-sm sm:text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:border-cyan-600 dark:focus:border-cyan-500 focus:ring-1 focus:ring-cyan-600/30 dark:focus:ring-cyan-500/30 transition-colors disabled:opacity-60"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Rounds Selector */}
                <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-2.5 py-2 sm:py-1.5 shrink-0">
                  <label htmlFor="rounds-select" className="text-[11px] font-mono text-slate-600 dark:text-slate-400">
                    Rounds:
                  </label>
                  <select
                    id="rounds-select"
                    value={selectedMaxRounds}
                    onChange={(e) => setSelectedMaxRounds(Number(e.target.value))}
                    disabled={status === 'running'}
                    className="bg-transparent text-xs font-mono font-medium text-cyan-700 dark:text-cyan-400 focus:outline-none cursor-pointer pr-1"
                  >
                    <option value={1} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200">
                      1 (Express)
                    </option>
                    <option value={2} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200">
                      2 (Standard)
                    </option>
                    <option value={3} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200">
                      3 (Definitive)
                    </option>
                  </select>
                </div>

                {/* Jury Mode Selector */}
                <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-2.5 py-2 sm:py-1.5 shrink-0">
                  <label htmlFor="mode-select" className="text-[11px] font-mono text-slate-600 dark:text-slate-400">
                    Jury:
                  </label>
                  <select
                    id="mode-select"
                    value={selectedMode}
                    onChange={(e) => setSelectedMode(e.target.value as any)}
                    disabled={status === 'running'}
                    className="bg-transparent text-xs font-mono font-medium text-cyan-700 dark:text-cyan-400 focus:outline-none cursor-pointer pr-1"
                  >
                    <option value="general" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200">
                      General
                    </option>
                    <option value="scientific" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200">
                      Scientific
                    </option>
                    <option value="financial" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200">
                      Financial
                    </option>
                    <option value="security" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200">
                      Security
                    </option>
                  </select>
                </div>

                {/* Guarded Temperature Control (0.0 – 0.7) */}
                <div
                  className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-2.5 py-2 sm:py-1.5 shrink-0"
                  title="Debater sampling temperature (0.0 = deterministic, 0.2 = balanced, 0.7 = max exploratory; Judge & Guard stay strictly capped)"
                >
                  <label htmlFor="temp-range" className="text-[11px] font-mono text-slate-600 dark:text-slate-400">
                    Temp:
                  </label>
                  <input
                    id="temp-range"
                    type="range"
                    min={0}
                    max={0.7}
                    step={0.1}
                    value={selectedTemperature}
                    onChange={(e) => setSelectedTemperature(Number(e.target.value))}
                    disabled={status === 'running'}
                    className="w-16 accent-cyan-600 dark:accent-cyan-400 cursor-pointer"
                  />
                  <span className="text-xs font-mono font-semibold text-cyan-700 dark:text-cyan-400 tabular-nums w-6 text-right">
                    {selectedTemperature.toFixed(1)}
                  </span>
                </div>

                {/* Action Buttons */}
                <button
                  type="submit"
                  disabled={status === 'running' || (!inputClaim.trim() && !activeClaim.trim())}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-700 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm shrink-0 min-h-[40px]"
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
                  className="inline-flex items-center justify-center p-2.5 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 min-h-[40px] min-w-[40px]"
                  title="Reset session"
                  aria-label="Reset session"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>

            {/* Presets */}
            <div className="flex flex-nowrap sm:flex-wrap items-center gap-2 pt-2 border-t border-slate-200/80 dark:border-slate-800/60 text-[11px] overflow-x-auto pb-1 sm:pb-0">
              <span className="text-slate-600 dark:text-slate-400 font-mono flex items-center gap-1 mr-1 shrink-0">
                <HelpCircle className="w-3 h-3" /> Presets:
              </span>
              {PRESET_CLAIMS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectPreset(preset.claim)}
                  disabled={status === 'running'}
                  className="shrink-0 px-2.5 py-1 rounded-md bg-slate-100 hover:bg-cyan-50 dark:bg-slate-950/80 dark:hover:bg-slate-800 border border-slate-200 hover:border-cyan-300 dark:border-slate-800 dark:hover:border-cyan-700 text-slate-700 hover:text-cyan-800 dark:text-slate-300 dark:hover:text-cyan-300 font-mono transition-colors disabled:opacity-50"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </section>

          {/* First-Time Orientation Banner (shown only when idle with no active claim) */}
          {status === 'idle' && !activeClaim && proponentArgs.length === 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
              <div className="px-3.5 py-2.5 rounded-lg bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800/80 flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-cyan-50 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800 flex items-center justify-center font-mono text-[11px] font-bold shrink-0">
                  1
                </span>
                <span className="text-slate-700 dark:text-slate-300">
                  Type a claim or pick a preset above, then tap <strong>Run Debate</strong>.
                </span>
              </div>
              <div className="px-3.5 py-2.5 rounded-lg bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800/80 flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-cyan-50 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800 flex items-center justify-center font-mono text-[11px] font-bold shrink-0">
                  2
                </span>
                <span className="text-slate-700 dark:text-slate-300">
                  <strong>Proponent</strong> &amp; <strong>Skeptic</strong> search the web and debate in parallel.
                </span>
              </div>
              <div className="px-3.5 py-2.5 rounded-lg bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800/80 flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-cyan-50 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800 flex items-center justify-center font-mono text-[11px] font-bold shrink-0">
                  3
                </span>
                <span className="text-slate-700 dark:text-slate-300">
                  <strong>Chief Judge</strong> audits live URLs and delivers a scored verdict.
                </span>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-500/50 rounded-xl text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2.5 shadow-sm">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
              <div className="flex-1">
                <span className="font-semibold">Execution Notice: </span>
                <span>{errorMessage}</span>
              </div>
            </div>
          )}

          {/* Active Claim Banner */}
          {activeClaim && (
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-slate-100/90 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800/80 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-[10px] uppercase tracking-wider text-cyan-700 dark:text-cyan-400 shrink-0 font-semibold">
                  Proposition:
                </span>
                <span className="text-slate-900 dark:text-slate-200 font-medium truncate">
                  {activeClaim}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-800 text-[10px] font-mono uppercase text-slate-700 dark:text-slate-300 shrink-0">
                  {mode}
                </span>
              </div>
              {threadId && (
                <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400 shrink-0 hidden md:inline tabular-nums">
                  Thread: {threadId.slice(0, 8)}...
                </span>
              )}
            </div>
          )}

          {/* 5-Node Execution Pipeline */}
          <ExecutionGraph
            status={status}
            activeNode={activeNode}
            completedNodes={completedNodes}
            currentRound={currentRound}
            maxRounds={maxRounds}
          />

          {/* Judge Verdict & HITL Gate */}
          {(verdict || interruptData) && (
            <JudgeVerdictCard
              claim={activeClaim}
              verdict={verdict}
              interruptData={interruptData}
              onIntervene={intervene}
              isIntervening={status === 'running'}
            />
          )}

          {/* Split-Screen Adversarial Courtroom */}
          <CourtroomSplit
            subClaims={subClaims}
            proponentArgs={proponentArgs}
            skepticArgs={skepticArgs}
            evidenceUrls={evidenceUrls}
            isDebating={status === 'running' && (activeNode === 'proponent_node' || activeNode === 'skeptic_node')}
            currentRound={currentRound}
          />

          {/* Collapsible Backend Telemetry & State Inspector */}
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
