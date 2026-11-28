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
  X,
} from 'lucide-react';
import type { DebateSummaryItem, DebateStatus, VerdictType } from '../types/debate';

interface HistorySidebarProps {
  history: DebateSummaryItem[];
  selectedThreadId: string | null;
  onSelectDebate: (threadId: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  onCloseMobile?: () => void;
}

export const HistorySidebar: React.FC<HistorySidebarProps> = ({
  history,
  selectedThreadId,
  onSelectDebate,
  isOpen,
  onToggle,
  onCloseMobile,
}) => {
  const [filterText, setFilterText] = useState('');

  const filteredHistory = history.filter((item) =>
    item.claim.toLowerCase().includes(filterText.toLowerCase())
  );

  const getStatusBadge = (status: DebateStatus) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
            <CheckCircle2 className="w-2.5 h-2.5" /> DONE
          </span>
        );
      case 'paused':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20">
            <PauseCircle className="w-2.5 h-2.5 animate-pulse" /> PAUSED
          </span>
        );
      case 'running':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-cyan-50 text-cyan-700 border border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-400 dark:border-cyan-500/20">
            <PlayCircle className="w-2.5 h-2.5 animate-spin" /> LIVE
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20">
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
      SUPPORTED: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/40 dark:border-emerald-800/40',
      REFUTED: 'text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-400 dark:bg-rose-950/40 dark:border-rose-800/40',
      MIXED: 'text-amber-800 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-800/40',
      UNVERIFIABLE: 'text-slate-700 bg-slate-100 border-slate-200 dark:text-slate-400 dark:bg-slate-800/40 dark:border-slate-700/40',
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
    <>
      {/* Mobile / Tablet Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-950/50 backdrop-blur-[1px] z-40 lg:hidden"
          onClick={onCloseMobile || onToggle}
          aria-hidden="true"
        />
      )}

      <aside
        aria-label="Debate Archive"
        className={`fixed lg:relative inset-y-0 left-0 flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800/80 transition-all duration-200 z-50 lg:z-30 shrink-0 ${
          isOpen
            ? 'translate-x-0 w-80 max-w-[85vw] shadow-2xl lg:shadow-none'
            : '-translate-x-full lg:translate-x-0 w-80 lg:w-14 pointer-events-none lg:pointer-events-auto'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3.5 border-b border-slate-200 dark:border-slate-800">
          {isOpen ? (
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <h2 className="text-xs font-semibold tracking-wide text-slate-800 dark:text-slate-200">
                Debate Archive
              </h2>
              <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full font-mono tabular-nums">
                {history.length}
              </span>
            </div>
          ) : (
            <div className="w-full flex justify-center">
              <History className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            </div>
          )}
          <button
            type="button"
            onClick={onToggle}
            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
            title={isOpen ? 'Collapse archive' : 'Expand archive'}
            aria-label={isOpen ? 'Collapse archive' : 'Expand archive'}
          >
            {isOpen ? (
              <>
                <X className="w-4 h-4 lg:hidden" />
                <ChevronLeft className="w-4 h-4 hidden lg:block" />
              </>
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        </div>

        {isOpen && (
          <>
            {/* Search Bar */}
            <div className="p-3 border-b border-slate-200/80 dark:border-slate-800/60">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400 dark:text-slate-500" />
                <input
                  type="text"
                  placeholder="Filter archived claims..."
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-200 placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:border-cyan-600 dark:focus:border-cyan-500 transition-colors"
                />
              </div>
            </div>

            {/* List items */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {filteredHistory.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                  <ShieldAlert className="w-8 h-8 mx-auto mb-2 opacity-30" />
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
                      type="button"
                      onClick={() => {
                        onSelectDebate(item.thread_id);
                        if (onCloseMobile && window.innerWidth < 1024) {
                          onCloseMobile();
                        }
                      }}
                      className={`w-full text-left p-2.5 rounded-lg transition-colors border ${
                        isSelected
                          ? 'bg-cyan-50/70 dark:bg-slate-800/90 border-cyan-400 dark:border-cyan-500/50 shadow-sm'
                          : 'bg-slate-50/70 dark:bg-slate-950/40 border-slate-200/80 dark:border-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-700/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5 mb-1.5">
                        {getStatusBadge(item.status)}
                        {getVerdictPill(item.verdict)}
                      </div>
                      <p className="text-xs font-medium text-slate-800 dark:text-slate-200 line-clamp-2 leading-relaxed mb-2">
                        {item.claim}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        <span className="flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {formattedDate}
                        </span>
                        {item.confidence !== null && item.confidence !== undefined && (
                          <span className="text-cyan-700 dark:text-cyan-400 font-semibold">
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
    </>
  );
};
