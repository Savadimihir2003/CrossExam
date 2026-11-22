import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  History,
  Search,
  CheckCircle2,
  AlertCircle,
  PauseCircle,
  PlayCircle,
  ShieldAlert,
} from 'lucide-react';
import type { DebateSummaryItem, DebateStatus, VerdictType } from '../types/debate';

interface HistorySidebarProps {
  history: DebateSummaryItem[];
  selectedThreadId: string | null;
  onSelectDebate: (threadId: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export const HistorySidebar: React.FC<HistorySidebarProps> = ({
  history,
  selectedThreadId,
  onSelectDebate,
  isOpen,
  onToggle,
}) => {
  const [filterText, setFilterText] = useState('');

  const filteredHistory = history.filter((item) =>
    item.claim.toLowerCase().includes(filterText.toLowerCase())
  );

  const getStatusBadge = (status: DebateStatus) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-2.5 h-2.5" /> DONE
          </span>
        );
      case 'paused':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <PauseCircle className="w-2.5 h-2.5 animate-pulse" /> PAUSED
          </span>
        );
      case 'running':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <PlayCircle className="w-2.5 h-2.5 animate-spin" /> LIVE
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertCircle className="w-2.5 h-2.5" /> ERR
          </span>
        );
      default:
        return null;
    }
  };

  const getVerdictPill = (verdict?: VerdictType | null) => {
    if (!verdict) return null;
    const styles: Record<VerdictType, string> = {
      SUPPORTED: 'text-emerald-400 bg-emerald-950/40 border-emerald-800/40',
      REFUTED: 'text-rose-400 bg-rose-950/40 border-rose-800/40',
      MIXED: 'text-amber-400 bg-amber-950/40 border-amber-800/40',
      UNVERIFIABLE: 'text-slate-400 bg-slate-800/40 border-slate-700/40',
    };
    return (
      <span
        className={`px-1.5 py-0.5 text-[10px] font-mono rounded border ${
          styles[verdict] || styles.UNVERIFIABLE
        }`}
      >
        {verdict}
      </span>
    );
  };

  return (
    <aside
      className={`relative flex flex-col bg-slate-900 border-r border-slate-800/80 transition-all duration-300 z-30 ${
        isOpen ? 'w-80' : 'w-14'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3.5 border-b border-slate-800">
        {isOpen ? (
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-cyan-400" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Debate Archive
            </h2>
            <span className="text-[10px] px-1.5 py-0.2 bg-slate-800 text-slate-400 rounded-full font-mono">
              {history.length}
            </span>
          </div>
        ) : (
          <div className="w-full flex justify-center">
            <History className="w-4 h-4 text-cyan-400" />
          </div>
        )}
        <button
          onClick={onToggle}
          className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 transition-colors"
          title={isOpen ? 'Collapse archive' : 'Expand archive'}
        >
          {isOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </div>

      {isOpen && (
        <>
          {/* Search Bar */}
          <div className="p-3 border-b border-slate-800/60">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Filter archived claims..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>
          </div>

          {/* List items */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40 p-1.5 space-y-1">
            {filteredHistory.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                <ShieldAlert className="w-8 h-8 mx-auto mb-2 opacity-30 text-slate-400" />
                No archived claims found
              </div>
            ) : (
              filteredHistory.map((item) => {
                const isSelected = item.thread_id === selectedThreadId;
                const formattedDate = new Date(item.created_at).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <button
                    key={item.thread_id}
                    onClick={() => onSelectDebate(item.thread_id)}
                    className={`w-full text-left p-2.5 rounded-lg transition-all border ${
                      isSelected
                        ? 'bg-slate-800/90 border-cyan-500/50 shadow-sm shadow-cyan-950/50'
                        : 'bg-slate-950/40 border-slate-800/50 hover:bg-slate-800/50 hover:border-slate-700/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5 mb-1.5">
                      {getStatusBadge(item.status)}
                      {getVerdictPill(item.verdict)}
                    </div>
                    <p className="text-xs font-medium text-slate-200 line-clamp-2 leading-relaxed mb-2">
                      {item.claim}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                      <span className="flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        {formattedDate}
                      </span>
                      {item.confidence !== null && item.confidence !== undefined && (
                        <span className="text-cyan-400 font-semibold">
                          {(item.confidence * 100).toFixed(0)}% conf
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </>
      )}
    </aside>
  );
};
