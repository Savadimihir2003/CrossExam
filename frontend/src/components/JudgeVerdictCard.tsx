import React, { useState } from 'react';
import {
  Scale,
  Award,
  AlertTriangle,
  Send,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import type {
  CitationAuditItem,
  ClaimBreakdownItem,
  InterruptPayload,
  VerdictData,
  VerdictType,
} from '../types/debate';

interface JudgeVerdictCardProps {
  verdict: VerdictData | null;
  interruptData: InterruptPayload | null;
  onIntervene: (context: string) => void;
  isIntervening: boolean;
}

export const JudgeVerdictCard: React.FC<JudgeVerdictCardProps> = ({
  verdict,
  interruptData,
  onIntervene,
  isIntervening,
}) => {
  const [humanInput, setHumanInput] = useState('');

  const handleResume = (e: React.FormEvent) => {
    e.preventDefault();
    if (!humanInput.trim()) return;
    onIntervene(humanInput.trim());
    setHumanInput('');
  };

  const getVerdictTheme = (v?: VerdictType) => {
    switch (v) {
      case 'SUPPORTED':
        return {
          badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
          border: 'border-emerald-500/40',
          text: 'text-emerald-400',
          bg: 'from-emerald-950/30 to-slate-900',
          progress: 'bg-emerald-500',
        };
      case 'REFUTED':
        return {
          badge: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
          border: 'border-rose-500/40',
          text: 'text-rose-400',
          bg: 'from-rose-950/30 to-slate-900',
          progress: 'bg-rose-500',
        };
      case 'MIXED':
        return {
          badge: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
          border: 'border-amber-500/40',
          text: 'text-amber-400',
          bg: 'from-amber-950/30 to-slate-900',
          progress: 'bg-amber-500',
        };
      case 'UNVERIFIABLE':
      default:
        return {
          badge: 'bg-slate-500/10 text-slate-300 border-slate-500/30',
          border: 'border-slate-700/60',
          text: 'text-slate-300',
          bg: 'from-slate-900 to-slate-950',
          progress: 'bg-slate-500',
        };
    }
  };

  const getSubClaimBadge = (status: string) => {
    switch (status) {
      case 'VERIFIED_TRUE':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-2.5 h-2.5" /> TRUE
          </span>
        );
      case 'VERIFIED_FALSE':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle className="w-2.5 h-2.5" /> FALSE
          </span>
        );
      case 'AMBIGUOUS':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <HelpCircle className="w-2.5 h-2.5" /> AMBIGUOUS
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
            UNSUPPORTED
          </span>
        );
    }
  };

  const getReliabilityPill = (rel: string) => {
    const map: Record<string, string> = {
      HIGH: 'bg-emerald-950 text-emerald-400 border-emerald-800',
      MEDIUM: 'bg-blue-950 text-blue-400 border-blue-800',
      LOW: 'bg-amber-950 text-amber-400 border-amber-800',
      QUESTIONABLE: 'bg-rose-950 text-rose-400 border-rose-800',
    };
    return (
      <span
        className={`px-1.5 py-0.5 text-[9px] font-mono font-bold rounded border ${
          map[rel] || map.MEDIUM
        }`}
      >
        {rel}
      </span>
    );
  };

  const theme = getVerdictTheme(verdict?.verdict);

  return (
    <div className="space-y-4">
      {/* ================= HITL INTERRUPT BOX ================= */}
      {interruptData && (
        <div className="bg-gradient-to-r from-amber-950/50 via-slate-900 to-amber-950/30 border border-amber-500/60 rounded-xl p-4 shadow-xl shadow-amber-950/30 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/40">
                <AlertTriangle className="w-4 h-4 animate-bounce" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-amber-300 tracking-wide">
                  HITL Intervention Required: Graph Interrupted
                </h3>
                <p className="text-[10px] font-mono text-amber-400/80">
                  Confidence score ({(interruptData.confidence * 100).toFixed(0)}%) is below the
                  75% threshold
                </p>
              </div>
            </div>
            <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
              Awaiting Expert Input
            </span>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 border border-amber-900/40 rounded-lg p-3">
            {interruptData.question}
          </p>

          <form onSubmit={handleResume} className="space-y-2">
            <textarea
              rows={3}
              value={humanInput}
              onChange={(e) => setHumanInput(e.target.value)}
              placeholder="Provide domain facts, official source citations, or context to resolve ambiguity and resume arbitration..."
              className="w-full text-xs bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-400 transition-colors"
            />
            <div className="flex justify-end gap-2">
              <button
                type="submit"
                disabled={isIntervening || !humanInput.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-amber-950/50"
              >
                {isIntervening ? (
                  <>
                    <Sparkles className="w-3.5 h-3.5 animate-spin" />
                    Rescoring with Human Context...
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    Resume Graph & Re-Score
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ================= FINAL VERDICT CARD ================= */}
      {verdict && (
        <div
          className={`bg-slate-900 border ${theme.border} rounded-xl overflow-hidden shadow-2xl transition-all duration-300`}
        >
          {/* Verdict Header */}
          <div
            className={`p-4 bg-gradient-to-r ${theme.bg} border-b ${theme.border} flex flex-wrap items-center justify-between gap-3`}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800 text-cyan-400">
                <Scale className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-100">Chief Judge Verdict</h3>
                  <span
                    className={`px-2.5 py-0.5 rounded text-xs font-mono font-bold tracking-wider border ${theme.badge}`}
                  >
                    {verdict.verdict}
                  </span>
                </div>
                <p className="text-[10px] font-mono text-slate-400">
                  Engine: <span className="text-slate-300">openai/gpt-oss-120b</span> (Adversarial
                  Synthesis)
                </p>
              </div>
            </div>

            {/* Confidence Progress Meter */}
            <div className="flex items-center gap-3 min-w-[200px]">
              <div className="flex-1">
                <div className="flex justify-between text-[10px] font-mono mb-1">
                  <span className="text-slate-400">Arbitration Confidence:</span>
                  <span className={`font-bold ${theme.text}`}>
                    {(verdict.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className={`h-full ${theme.progress} transition-all duration-700`}
                    style={{ width: `${Math.round(verdict.confidence * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 space-y-4">
            {/* Summary */}
            <div className="space-y-1">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-cyan-400" />
                Executive Synthesis
              </h4>
              <p className="text-xs leading-relaxed text-slate-200 bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 whitespace-pre-line font-sans">
                {verdict.summary}
              </p>
            </div>

            {/* Sub-Claims Breakdown */}
            {verdict.claim_breakdown && verdict.claim_breakdown.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Atomic Premise Breakdown
                </h4>
                <div className="space-y-1.5">
                  {verdict.claim_breakdown.map((item: ClaimBreakdownItem, idx: number) => (
                    <div
                      key={idx}
                      className="bg-slate-950/60 border border-slate-800/60 rounded-lg p-2.5 flex flex-col md:flex-row md:items-center justify-between gap-2"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-slate-200">
                            {item.sub_claim}
                          </span>
                          {getSubClaimBadge(item.status)}
                        </div>
                        <p className="text-[11px] text-slate-400">{item.rationale}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Citation Credibility Audit */}
            {verdict.citation_audit && verdict.citation_audit.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                  Citation Reliability Audit
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {verdict.citation_audit.map((cite: CitationAuditItem, idx: number) => (
                    <div
                      key={idx}
                      className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <a
                          href={cite.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 truncate inline-flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3 shrink-0" />
                          <span className="truncate">{cite.url.replace(/^https?:\/\//, '')}</span>
                        </a>
                        {getReliabilityPill(cite.reliability)}
                      </div>
                      <p className="text-[10px] text-slate-400 line-clamp-2">{cite.relevance}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
