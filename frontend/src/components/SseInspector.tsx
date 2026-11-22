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
        return 'text-blue-400 bg-blue-950/80 border-blue-800/50';
      case 'tool_call':
        return 'text-cyan-400 bg-cyan-950/80 border-cyan-800/50';
      case 'argument':
        return 'text-purple-400 bg-purple-950/80 border-purple-800/50';
      case 'round_complete':
        return 'text-emerald-400 bg-emerald-950/80 border-emerald-800/50';
      case 'interrupt':
        return 'text-amber-400 bg-amber-950/80 border-amber-800/50';
      case 'final_verdict':
        return 'text-emerald-300 bg-emerald-950 border-emerald-700';
      case 'error':
        return 'text-rose-400 bg-rose-950/80 border-rose-800/50';
      default:
        return 'text-slate-400 bg-slate-900 border-slate-800';
    }
  };

  return (
    <div
      className={`bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl transition-all duration-300 ${
        isOpen ? 'h-[480px]' : 'h-11'
      } flex flex-col`}
    >
      {/* Top Bar / Accordion Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-950 border-b border-slate-800 cursor-pointer select-none">
        <div className="flex items-center gap-2" onClick={onToggle}>
          <Terminal className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Backend Telemetry & Graph Inspector
          </h3>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
            {events.length} events
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isOpen && (
            <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTab('stream');
                }}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                  activeTab === 'stream'
                    ? 'bg-slate-800 text-cyan-400 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Activity className="w-3 h-3" />
                Live SSE Stream
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTab('state');
                }}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                  activeTab === 'state'
                    ? 'bg-slate-800 text-cyan-400 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Code className="w-3 h-3" />
                State Snapshot
              </button>
            </div>
          )}

          <button
            onClick={onToggle}
            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 transition-colors"
          >
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Body */}
      {isOpen && (
        <div className="flex-1 overflow-y-auto p-3 font-mono text-xs bg-slate-950/90 divide-y divide-slate-800/40">
          {activeTab === 'stream' ? (
            events.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
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
                      className="bg-slate-900/60 border border-slate-800/70 rounded-lg p-2.5 space-y-1.5 hover:border-slate-700 transition-colors"
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
                          <span className="text-[10px] text-slate-500">{evt.timestamp}</span>
                        </div>
                        <button
                          onClick={() => copyToClipboard(payloadStr, evt.id)}
                          className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded transition-colors"
                          title="Copy JSON payload"
                        >
                          {isCopied ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                      <pre className="text-[11px] leading-relaxed text-slate-300 overflow-x-auto bg-slate-950 p-2 rounded border border-slate-900 max-h-36">
                        {payloadStr}
                      </pre>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <div className="p-2 space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-[11px] mb-2 pb-2 border-b border-slate-800">
                <span>Thread State Context:</span>
                <button
                  onClick={() =>
                    copyToClipboard(JSON.stringify(graphState, null, 2), 'state_snapshot')
                  }
                  className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 text-[11px]"
                >
                  {copiedId === 'state_snapshot' ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  Copy Snapshot
                </button>
              </div>
              <pre className="text-[11px] leading-relaxed text-slate-300 overflow-x-auto bg-slate-950 p-3 rounded-lg border border-slate-800/80">
                {JSON.stringify(graphState, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
