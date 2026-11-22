import React from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Search,
  ExternalLink,
  Layers,
  Sparkles,
} from 'lucide-react';
import type { DebateArgument, EvidenceItem } from '../types/debate';

interface CourtroomSplitProps {
  subClaims: string[];
  proponentArgs: DebateArgument[];
  skepticArgs: DebateArgument[];
  evidenceUrls?: EvidenceItem[];
  isDebating: boolean;
  currentRound?: number;
}

export const CourtroomSplit: React.FC<CourtroomSplitProps> = ({
  subClaims,
  proponentArgs,
  skepticArgs,
  evidenceUrls = [],
  isDebating,
}) => {
  const getEvidenceMetadata = (url: string) => {
    return evidenceUrls.find((e) => e.url === url);
  };
  return (
    <div className="space-y-4">
      {/* Sub-Claims Breakdown Banner */}
      {subClaims.length > 0 && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-sm">
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>Decomposed Atomic Sub-Claims ({subClaims.length})</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {subClaims.map((claim, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5 text-xs text-slate-300"
              >
                <span className="w-4 h-4 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/50 flex items-center justify-center text-[10px] font-mono font-bold shrink-0">
                  {idx + 1}
                </span>
                <span className="leading-snug">{claim}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Split Courtroom Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ================= PROPONENT COLUMN ================= */}
        <div className="bg-slate-900/80 border border-blue-900/40 rounded-xl overflow-hidden shadow-lg shadow-blue-950/20 flex flex-col">
          {/* Card Header */}
          <div className="bg-gradient-to-r from-blue-950/60 to-slate-900 p-3.5 border-b border-blue-900/40 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-blue-200 tracking-wide flex items-center gap-1.5">
                  Proponent Advocate
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-950 text-blue-400 border border-blue-800/50 font-mono">
                    SUPPORT
                  </span>
                </h3>
                <p className="text-[10px] font-mono text-slate-400">
                  Engine: <span className="text-blue-300">qwen/qwen3.8-27b</span>
                </p>
              </div>
            </div>
            {isDebating && (
              <span className="flex items-center gap-1 text-[10px] font-mono text-blue-400 bg-blue-950/80 px-2 py-0.5 rounded-full border border-blue-800/50">
                <Sparkles className="w-2.5 h-2.5 animate-spin" /> Stream Active
              </span>
            )}
          </div>

          {/* Arguments Feed */}
          <div className="p-4 space-y-4 flex-1 overflow-y-auto max-h-[560px]">
            {proponentArgs.length === 0 ? (
              <div className="text-center py-12 text-xs text-slate-500">
                <ShieldCheck className="w-8 h-8 mx-auto mb-2 opacity-25 text-blue-400" />
                Awaiting Round 1 proponent argument and evidence retrieval...
              </div>
            ) : (
              proponentArgs.map((arg, idx) => (
                <div
                  key={idx}
                  className="bg-slate-950/70 border border-blue-900/30 rounded-lg p-3.5 space-y-2.5 hover:border-blue-700/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-950/80 text-blue-300 border border-blue-800/50">
                      Round {arg.round}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {new Date(arg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>

                  {/* Search Query Pill */}
                  {arg.search_query && (
                    <div className="flex items-center gap-1.5 text-[11px] font-mono text-blue-300/80 bg-blue-950/40 px-2.5 py-1 rounded border border-blue-900/40">
                      <Search className="w-3 h-3 text-blue-400 shrink-0" />
                      <span className="truncate">"{arg.search_query}"</span>
                    </div>
                  )}

                  {/* Argument Text */}
                  <p className="text-xs leading-relaxed text-slate-200 whitespace-pre-line font-sans">
                    {arg.argument}
                  </p>

                  {/* Source Citations */}
                  {arg.citations && arg.citations.length > 0 && (
                    <div className="pt-2 border-t border-slate-800/60 space-y-1">
                      <span className="text-[10px] font-mono uppercase text-slate-500 block">
                        Corroborating Evidence:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {arg.citations.map((cite, cIdx) => {
                          const ev = getEvidenceMetadata(cite);
                          const label = ev?.title || cite.replace(/^https?:\/\//, '');
                          const tooltip = ev?.snippet ? `${label}\n\n"${ev.snippet}"` : cite;
                          return (
                            <a
                              key={cIdx}
                              href={cite}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={tooltip}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-blue-950/50 hover:bg-blue-900/60 text-blue-300 border border-blue-800/40 hover:border-blue-600 transition-colors max-w-full truncate"
                            >
                              <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                              <span className="truncate max-w-[200px]">{label}</span>
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* ================= SKEPTIC COLUMN ================= */}
        <div className="bg-slate-900/80 border border-rose-900/40 rounded-xl overflow-hidden shadow-lg shadow-rose-950/20 flex flex-col">
          {/* Card Header */}
          <div className="bg-gradient-to-r from-rose-950/60 to-slate-900 p-3.5 border-b border-rose-900/40 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <ShieldAlert className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-rose-200 tracking-wide flex items-center gap-1.5">
                  Red-Team Skeptic
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-950 text-rose-400 border border-rose-800/50 font-mono">
                    REFUTE
                  </span>
                </h3>
                <p className="text-[10px] font-mono text-slate-400">
                  Engine: <span className="text-rose-300">openai/gpt-oss-20b</span>
                </p>
              </div>
            </div>
            {isDebating && (
              <span className="flex items-center gap-1 text-[10px] font-mono text-rose-400 bg-rose-950/80 px-2 py-0.5 rounded-full border border-rose-800/50">
                <Sparkles className="w-2.5 h-2.5 animate-spin" /> Stream Active
              </span>
            )}
          </div>

          {/* Arguments Feed */}
          <div className="p-4 space-y-4 flex-1 overflow-y-auto max-h-[560px]">
            {skepticArgs.length === 0 ? (
              <div className="text-center py-12 text-xs text-slate-500">
                <ShieldAlert className="w-8 h-8 mx-auto mb-2 opacity-25 text-rose-400" />
                Awaiting Round 1 skeptic rebuttal and counter-evidence...
              </div>
            ) : (
              skepticArgs.map((arg, idx) => (
                <div
                  key={idx}
                  className="bg-slate-950/70 border border-rose-900/30 rounded-lg p-3.5 space-y-2.5 hover:border-rose-700/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800/50">
                      Round {arg.round}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {new Date(arg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>

                  {/* Search Query Pill */}
                  {arg.search_query && (
                    <div className="flex items-center gap-1.5 text-[11px] font-mono text-rose-300/80 bg-rose-950/40 px-2.5 py-1 rounded border border-rose-900/40">
                      <Search className="w-3 h-3 text-rose-400 shrink-0" />
                      <span className="truncate">"{arg.search_query}"</span>
                    </div>
                  )}

                  {/* Argument Text */}
                  <p className="text-xs leading-relaxed text-slate-200 whitespace-pre-line font-sans">
                    {arg.argument}
                  </p>

                  {/* Counter-Evidence Citations */}
                  {arg.citations && arg.citations.length > 0 && (
                    <div className="pt-2 border-t border-slate-800/60 space-y-1">
                      <span className="text-[10px] font-mono uppercase text-slate-500 block">
                        Counter-Evidence Sources:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {arg.citations.map((cite, cIdx) => {
                          const ev = getEvidenceMetadata(cite);
                          const label = ev?.title || cite.replace(/^https?:\/\//, '');
                          const tooltip = ev?.snippet ? `${label}\n\n"${ev.snippet}"` : cite;
                          return (
                            <a
                              key={cIdx}
                              href={cite}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={tooltip}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 hover:border-rose-600 transition-colors max-w-full truncate"
                            >
                              <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                              <span className="truncate max-w-[200px]">{label}</span>
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
