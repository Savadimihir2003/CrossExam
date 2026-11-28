import React, { useState } from 'react';
import {
  Terminal,
  Activity,
  Code,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
} from 'lucide-react';
import type { SseEventItem } from '../types/debate';

interface SseInspectorProps {
  events: SseEventItem[];
  graphState: Record<string, any>;
  isOpen: boolean;
  onToggle: () => void;
}

export const SseInspector: React.FC<SseInspectorProps> = ({
  events,
  graphState,
  isOpen,
  onToggle,
}) => {
  const [activeTab, setActiveTab] = useState<'stream' | 'state'>('stream');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getEventBadgeColor = (type: string) => {
    switch (type) {
      case 'node_start':
        return 'text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/80 dark:border-blue-800/50';
      case 'tool_call':
        return 'text-cyan-700 bg-cyan-50 border-cyan-200 dark:text-cyan-400 dark:bg-cyan-950/80 dark:border-cyan-800/50';
      case 'argument':
        return 'text-purple-700 bg-purple-50 border-purple-200 dark:text-purple-400 dark:bg-purple-950/80 dark:border-purple-800/50';
      case 'round_complete':
        return 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/80 dark:border-emerald-800/50';
      case 'interrupt':
        return 'text-amber-800 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/80 dark:border-amber-800/50';
      case 'final_verdict':
        return 'text-emerald-800 bg-emerald-100 border-emerald-300 dark:text-emerald-300 dark:bg-emerald-950 dark:border-emerald-700';
      case 'error':
        return 'text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-400 dark:bg-rose-950/80 dark:border-rose-800/50';
      default:
        return 'text-slate-700 bg-slate-100 border-slate-200 dark:text-slate-400 dark:bg-slate-900 dark:border-slate-800';
    }
  };

  return (
    <div
      className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm dark:shadow-none transition-[height] duration-200 ${
        isOpen ? 'h-[360px] sm:h-[460px]' : 'min-h-[44px]'
      } flex flex-col`}
    >
      {/* Top Bar / Accordion Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 cursor-pointer select-none">
        <div className="flex items-center gap-2 min-w-0" onClick={onToggle}>
          <Terminal className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
          <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
            <span className="hidden sm:inline">Backend Telemetry &amp; Graph Inspector</span>
            <span className="sm:hidden">Telemetry &amp; State</span>
          </h3>
          <span className="text-[10px] font-mono tabular-nums px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 shrink-0">
            {events.length} <span className="hidden sm:inline">events</span>
          </span>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {isOpen && (
            <div className="flex items-center bg-slate-200/70 dark:bg-slate-900 rounded-lg p-0.5 border border-slate-300/70 dark:border-slate-800">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTab('stream');
                }}
                className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                  activeTab === 'stream'
                    ? 'bg-white dark:bg-slate-800 text-cyan-700 dark:text-cyan-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Activity className="w-3 h-3" />
                <span className="hidden sm:inline">Live SSE Stream</span>
                <span className="sm:hidden">SSE</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTab('state');
                }}
                className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                  activeTab === 'state'
                    ? 'bg-white dark:bg-slate-800 text-cyan-700 dark:text-cyan-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Code className="w-3 h-3" />
                <span className="hidden sm:inline">State Snapshot</span>
                <span className="sm:hidden">State</span>
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onToggle}
            aria-label={isOpen ? 'Collapse telemetry inspector' : 'Expand telemetry inspector'}
            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
          >
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Body */}
      {isOpen && (
        <div className="flex-1 overflow-y-auto p-3 font-mono text-xs bg-slate-50/70 dark:bg-slate-950/90">
          {activeTab === 'stream' ? (
            events.length === 0 ? (
              <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-xs font-sans">
                No telemetry streamed yet. Launch a debate to monitor real-time graph events.
              </div>
            ) : (
              <div className="space-y-2">
                {events.map((evt) => {
                  const payloadStr = JSON.stringify(evt.data, null, 2);
                  const isCopied = copiedId === evt.id;

                  return (
                    <div
                      key={evt.id}
                      className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/70 rounded-lg p-2.5 space-y-1.5 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold border uppercase ${getEventBadgeColor(
                              evt.type
                            )}`}
                          >
                            {evt.type}
                          </span>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                            {evt.timestamp}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(payloadStr, evt.id)}
                          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 rounded transition-colors"
                          title="Copy JSON payload"
                        >
                          {isCopied ? (
                            <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                      <pre className="text-[11px] leading-relaxed text-slate-800 dark:text-slate-300 overflow-x-auto bg-slate-50 dark:bg-slate-950 p-2 rounded border border-slate-200 dark:border-slate-900 max-h-36">
                        {payloadStr}
                      </pre>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <div className="p-2 space-y-2">
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400 text-[11px] mb-2 pb-2 border-b border-slate-200 dark:border-slate-800">
                <span>Thread State Context:</span>
                <button
                  type="button"
                  onClick={() =>
                    copyToClipboard(JSON.stringify(graphState, null, 2), 'state_snapshot')
                  }
                  className="flex items-center gap-1 text-cyan-700 hover:text-cyan-900 dark:text-cyan-400 dark:hover:text-cyan-300 text-[11px]"
                >
                  {copiedId === 'state_snapshot' ? (
                    <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  Copy State
                </button>
              </div>
              <pre className="text-[11px] leading-relaxed text-cyan-800 dark:text-cyan-300 overflow-x-auto bg-white dark:bg-slate-900/50 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                {JSON.stringify(graphState, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
