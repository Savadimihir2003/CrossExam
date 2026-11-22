export type DebateStatus = 'idle' | 'running' | 'paused' | 'completed' | 'error';

export type VerdictType = 'SUPPORTED' | 'REFUTED' | 'MIXED' | 'UNVERIFIABLE';

export type ReliabilityRating = 'HIGH' | 'MEDIUM' | 'LOW' | 'QUESTIONABLE';

export type SubClaimStatus = 'VERIFIED_TRUE' | 'VERIFIED_FALSE' | 'AMBIGUOUS' | 'UNSUPPORTED';

export interface ClaimBreakdownItem {
  sub_claim: string;
  status: SubClaimStatus;
  rationale: string;
}

export interface CitationAuditItem {
  url: string;
  reliability: ReliabilityRating;
  relevance: string;
}

export interface VerdictData {
  verdict: VerdictType;
  confidence: number;
  summary: string;
  claim_breakdown: ClaimBreakdownItem[];
  citation_audit: CitationAuditItem[];
  total_tokens?: number;
  cached?: boolean;
}

export interface DebateArgument {
  round: number;
  role: 'proponent' | 'skeptic';
  model: string;
  search_query: string;
  argument: string;
  citations: string[];
  timestamp: string;
}

export interface EvidenceItem {
  role: 'proponent' | 'skeptic';
  round: number;
  title: string;
  url: string;
  snippet: string;
}

export interface InterruptPayload {
  thread_id: string;
  reason: string;
  confidence: number;
  question: string;
  summary?: string;
  timestamp?: string;
}

export interface SseEventItem {
  id: string;
  type: string;
  data: any;
  timestamp: string;
}

export interface DebateSummaryItem {
  thread_id: string;
  claim: string;
  status: DebateStatus;
  max_rounds?: number;
  verdict?: VerdictType | null;
  confidence?: number | null;
  total_tokens: number;
  created_at: string;
  updated_at: string;
  report?: any;
}

export type PipelineNodeName =
  | 'guard_node'
  | 'decomposer_node'
  | 'proponent_node'
  | 'skeptic_node'
  | 'moderator_node'
  | 'judge_node'
  | 'hitl_gate_node'
  | 'hitl_resumed'
  | 'persist_node';
