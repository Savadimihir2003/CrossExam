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
  Download,
  Copy,
  Check,
} from 'lucide-react';
import type {
  CitationAuditItem,
  ClaimBreakdownItem,
  InterruptPayload,
  VerdictData,
  VerdictType,
} from '../types/debate';

interface JudgeVerdictCardProps {
  claim?: string;
  verdict: VerdictData | null;
  interruptData: InterruptPayload | null;
  onIntervene: (context: string) => void;
  isIntervening: boolean;
}

export const JudgeVerdictCard: React.FC<JudgeVerdictCardProps> = ({
  claim = '',
  verdict,
  interruptData,
  onIntervene,
  isIntervening,
}) => {
  const [humanInput, setHumanInput] = useState('');
  const [copiedJson, setCopiedJson] = useState(false);

  const handleExportMarkdown = () => {
    if (!verdict) return;
    const lines = [
      `# CrossExam Fact-Check Dossier`,
      ``,
      `**Claim:** ${claim}`,
      `**Verdict:** ${verdict.verdict} (${(verdict.confidence * 100).toFixed(0)}% confidence)`,
      verdict.mode ? `**Jury Mode:** ${verdict.mode}` : '',
      ``,
      `## Executive Synthesis`,
      verdict.summary,
      ``,
      `## Atomic Premise Breakdown`,
      ...(verdict.claim_breakdown || []).map(
        (b) => `- **[${b.status}]** ${b.sub_claim} — ${b.rationale}`
      ),
      ``,
      `## Citation Reliability Audit`,
      ...(verdict.citation_audit || []).map(
        (c) =>
          `- [${c.reliability}] [${c.url_status || 'unverified'}] ${c.url} — ${c.relevance}`
      ),
    ].filter((l) => l !== '');

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crossexam-${verdict.verdict.toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyJson = () => {
    if (!verdict) return;
    navigator.clipboard.writeText(JSON.stringify({ claim, ...verdict }, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

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
          badge: 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30',
          border: 'border-emerald-300 dark:border-emerald-500/40',
          text: 'text-emerald-700 dark:text-emerald-400',
          bg: 'bg-emerald-50/60 dark:bg-gradient-to-r dark:from-emerald-950/30 dark:to-slate-900',
          progress: 'bg-emerald-600 dark:bg-emerald-500',
        };
      case 'REFUTED':
        return {
          badge: 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/30',
          border: 'border-rose-300 dark:border-rose-500/40',
          text: 'text-rose-700 dark:text-rose-400',
          bg: 'bg-rose-50/60 dark:bg-gradient-to-r dark:from-rose-950/30 dark:to-slate-900',
          progress: 'bg-rose-600 dark:bg-rose-500',
        };
      case 'MIXED':
        return {
          badge: 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30',
          border: 'border-amber-300 dark:border-amber-500/40',
          text: 'text-amber-700 dark:text-amber-400',
          bg: 'bg-amber-50/60 dark:bg-gradient-to-r dark:from-amber-950/30 dark:to-slate-900',
          progress: 'bg-amber-600 dark:bg-amber-500',
        };
      case 'UNVERIFIABLE':
      default:
        return {
          badge: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-500/10 dark:text-slate-300 dark:border-slate-500/30',
          border: 'border-slate-300 dark:border-slate-700/60',
          text: 'text-slate-700 dark:text-slate-300',
          bg: 'bg-slate-100/70 dark:bg-gradient-to-r dark:from-slate-900 dark:to-slate-950',
          progress: 'bg-slate-600 dark:bg-slate-500',
        };
    }
  };

  const getSubClaimBadge = (status: string) => {
    switch (status) {
      case 'VERIFIED_TRUE':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
            <CheckCircle2 className="w-2.5 h-2.5" /> TRUE
          </span>
        );
      case 'VERIFIED_FALSE':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20">
            <XCircle className="w-2.5 h-2.5" /> FALSE
          </span>
        );
      case 'AMBIGUOUS':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20">
            <HelpCircle className="w-2.5 h-2.5" /> AMBIGUOUS
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
            UNSUPPORTED
          </span>
        );
    }
  };

  const getReliabilityPill = (rel: string) => {
    const map: Record<string, string> = {
      HIGH: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800',
      MEDIUM: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800',
      LOW: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800',
      QUESTIONABLE: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-400 dark:border-rose-800',
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
        <div className="bg-amber-50/70 dark:bg-gradient-to-r dark:from-amber-950/50 dark:via-slate-900 dark:to-amber-950/30 border border-amber-400 dark:border-amber-500/60 rounded-xl p-4 shadow-sm dark:shadow-none space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-500/40">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-amber-950 dark:text-amber-300 tracking-tight">
                  HITL Intervention Required: Graph Interrupted
                </h3>
                <p className="text-[11px] font-mono tabular-nums text-amber-800 dark:text-amber-400/90">
                  Confidence score ({(interruptData.confidence * 100).toFixed(0)}%) is below the
                  75% threshold
                </p>
              </div>
            </div>
            <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded bg-amber-100 dark:bg-amber-500/20 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40">
              Awaiting Expert Input
            </span>
          </div>

          <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed bg-white dark:bg-slate-950/60 border border-amber-200 dark:border-amber-900/40 rounded-lg p-3">
            {interruptData.question}
          </p>

          <form onSubmit={handleResume} className="space-y-2.5">
            <textarea
              rows={3}
              value={humanInput}
              onChange={(e) => setHumanInput(e.target.value)}
              placeholder="Provide domain facts, official source citations, or context to resolve ambiguity and resume arbitration..."
              className="w-full text-xs bg-white dark:bg-slate-950 border border-amber-300 dark:border-slate-700 rounded-lg p-2.5 text-slate-900 dark:text-slate-200 placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:border-amber-600 dark:focus:border-amber-400 transition-colors"
            />
            <div className="flex justify-end gap-2">
              <button
                type="submit"
                disabled={isIntervening || !humanInput.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-600 dark:hover:bg-amber-400 text-white dark:text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                {isIntervening ? (
                  <>
                    <Sparkles className="w-3.5 h-3.5 animate-spin" />
                    Rescoring with Human Context...
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    Resume Graph &amp; Re-Score
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
          className={`bg-white dark:bg-slate-900 border ${theme.border} rounded-xl overflow-hidden shadow-md dark:shadow-none transition-colors duration-200`}
        >
          {/* Verdict Header */}
          <div
            className={`p-4 ${theme.bg} border-b ${theme.border} flex flex-wrap items-center justify-between gap-3`}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-white dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 text-cyan-600 dark:text-cyan-400 shadow-sm dark:shadow-none">
                <Scale className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Chief Judge Verdict
                  </h3>
                  <span
                    className={`px-2.5 py-0.5 rounded text-xs font-mono font-bold tracking-wider border ${theme.badge}`}
                  >
                    {verdict.verdict}
                  </span>
                </div>
                <p className="text-[11px] font-mono text-slate-600 dark:text-slate-400">
                  Engine: <span className="text-slate-800 dark:text-slate-300">openai/gpt-oss-120b</span> (Adversarial
                  Synthesis)
                </p>
              </div>
            </div>

            {/* Confidence Progress Meter & Export Actions */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="min-w-[180px] flex-1">
                <div className="flex justify-between text-[11px] font-mono mb-1 tabular-nums">
                  <span className="text-slate-600 dark:text-slate-400">Arbitration Confidence</span>
                  <span className={`font-bold ${theme.text}`}>
                    {(verdict.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-200 dark:bg-slate-950 rounded-full overflow-hidden border border-slate-300/70 dark:border-slate-800">
                  <div
                    className={`h-full ${theme.progress} transition-[width] duration-700`}
                    style={{ width: `${Math.round(verdict.confidence * 100)}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleExportMarkdown}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-mono bg-white hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
                  title="Export Markdown Dossier"
                >
                  <Download className="w-3 h-3" />
                  .md
                </button>
                <button
                  type="button"
                  onClick={handleCopyJson}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-mono bg-white hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
                  title="Copy Verdict JSON"
                >
                  {copiedJson ? <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  JSON
                </button>
              </div>
            </div>
          </div>

          <div className="p-4 space-y-4">
            {/* Summary */}
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                Executive Synthesis
              </h4>
              <p className="text-xs leading-relaxed text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 rounded-lg p-3.5 whitespace-pre-line font-sans max-w-[75ch]">
                {verdict.summary}
              </p>
            </div>

            {/* Sub-Claims Breakdown */}
            {verdict.claim_breakdown && verdict.claim_breakdown.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Atomic Premise Breakdown
                </h4>
                <div className="space-y-1.5">
                  {verdict.claim_breakdown.map((item: ClaimBreakdownItem, idx: number) => (
                    <div
                      key={idx}
                      className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/60 rounded-lg p-2.5 flex flex-col md:flex-row md:items-center justify-between gap-2"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-slate-900 dark:text-slate-200">
                            {item.sub_claim}
                          </span>
                          {getSubClaimBadge(item.status)}
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400">
                          {item.rationale}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Citation Credibility Audit */}
            {verdict.citation_audit && verdict.citation_audit.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                  Citation Reliability Audit
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {verdict.citation_audit.map((cite: CitationAuditItem, idx: number) => (
                    <div
                      key={idx}
                      className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800/80 rounded-lg p-2.5 space-y-1"
                    >
                      <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
                        <a
                          href={cite.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] font-mono text-cyan-700 hover:text-cyan-900 dark:text-cyan-400 dark:hover:text-cyan-300 truncate inline-flex items-center gap-1 min-w-0 max-w-full"
                        >
                          <ExternalLink className="w-3 h-3 shrink-0" />
                          <span className="truncate">{cite.url.replace(/^https?:\/\//, '')}</span>
                        </a>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {cite.url_status === 'verified_live' && (
                            <span className="px-1.5 py-0.5 text-[9px] font-mono font-semibold rounded border bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800">
                              LIVE {cite.status_code || 200}
                            </span>
                          )}
                          {cite.url_status === 'unreachable' && (
                            <span className="px-1.5 py-0.5 text-[9px] font-mono font-semibold rounded border bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-400 dark:border-rose-800">
                              UNREACHABLE
                            </span>
                          )}
                          {getReliabilityPill(cite.reliability)}
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2">
                        {cite.relevance}
                      </p>
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
