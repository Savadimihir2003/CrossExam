import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  ApiSettings,
  DebateArgument,
  DebateStatus,
  DebateSummaryItem,
  EvidenceItem,
  InterruptPayload,
  JuryMode,
  ModelSlots,
  PipelineNodeName,
  ServerConfig,
  SseEventItem,
  VerdictData,
} from '../types/debate';

const API_BASE = ((import.meta as any).env?.VITE_API_BASE_URL || '').replace(/\/+$/, '');
const apiUrl = (path: string) => `${API_BASE}${path}`;

const DEFAULT_MODEL_SLOTS: ModelSlots = {
  guard: 'meta-llama/llama-prompt-guard-2-22m',
  decomposer: 'openai/gpt-oss-20b',
  proponent: 'qwen/qwen3.8-27b',
  skeptic: 'openai/gpt-oss-20b',
  judge: 'openai/gpt-oss-120b',
};

const SESSION_ID_KEY = 'crossexam_session_id';
const BYOAK_SETTINGS_KEY = 'crossexam_byoak_settings';

function getOrCreateSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_ID_KEY);
    if (existing) return existing;
    const generated =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(SESSION_ID_KEY, generated);
    return generated;
  } catch {
    return 'default-session';
  }
}

function loadInitialApiSettings(): ApiSettings {
  try {
    const raw = sessionStorage.getItem(BYOAK_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
        provider: 'groq',
        modelPreset: parsed.modelPreset || 'balanced',
        customModels: { ...DEFAULT_MODEL_SLOTS, ...(parsed.customModels || {}) },
      };
    }
  } catch {}
  return {
    apiKey: '',
    provider: 'groq',
    modelPreset: 'balanced',
    customModels: { ...DEFAULT_MODEL_SLOTS },
  };
}

export function useDebateStream() {
  const [status, setStatus] = useState<DebateStatus>('idle');
  const [threadId, setThreadId] = useState<string | null>(null);
  const [claim, setClaim] = useState<string>('');
  const [maxRounds, setMaxRounds] = useState<number>(3);
  const [mode, setMode] = useState<JuryMode>('general');
  const [currentRound, setCurrentRound] = useState<number>(1);
  const [totalTokens, setTotalTokens] = useState<number>(0);
  const [subClaims, setSubClaims] = useState<string[]>([]);
  const [proponentArgs, setProponentArgs] = useState<DebateArgument[]>([]);
  const [skepticArgs, setSkepticArgs] = useState<DebateArgument[]>([]);
  const [evidenceUrls, setEvidenceUrls] = useState<EvidenceItem[]>([]);
  const [activeNode, setActiveNode] = useState<PipelineNodeName | null>(null);
  const [completedNodes, setCompletedNodes] = useState<PipelineNodeName[]>([]);
  const [verdict, setVerdict] = useState<VerdictData | null>(null);
  const [interruptData, setInterruptData] = useState<InterruptPayload | null>(null);
  const [sseEvents, setSseEvents] = useState<SseEventItem[]>([]);
  const [history, setHistory] = useState<DebateSummaryItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [serverKeyConfigured, setServerKeyConfigured] = useState<boolean>(true);
  const [defaultModels, setDefaultModels] = useState<ModelSlots>(DEFAULT_MODEL_SLOTS);
  const [apiSettings, setApiSettings] = useState<ApiSettings>(loadInitialApiSettings);

  const sessionIdRef = useRef<string>(getOrCreateSessionId());
  const abortControllerRef = useRef<AbortController | null>(null);
  const handleSseEventRef = useRef<(type: string, data: any) => void>(() => {});

  const updateApiSettings = useCallback((patch: Partial<ApiSettings>) => {
    setApiSettings((prev) => {
      const next: ApiSettings = {
        ...prev,
        ...patch,
        customModels: {
          ...prev.customModels,
          ...(patch.customModels || {}),
        },
      };
      try {
        sessionStorage.setItem(BYOAK_SETTINGS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const clearApiKey = useCallback(() => {
    updateApiSettings({ apiKey: '' });
  }, [updateApiSettings]);

  const validateApiKey = useCallback(async (candidateKey: string): Promise<{ valid: boolean; error?: string }> => {
    try {
      const res = await fetch(apiUrl('/api/validate-key'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: candidateKey, provider: 'groq' }),
      });
      if (!res.ok) {
        return { valid: false, error: `Validation request failed (${res.status})` };
      }
      return await res.json();
    } catch (err: any) {
      return { valid: false, error: err.message || 'Network error while validating key' };
    }
  }, []);

  const buildByoakHeaders = useCallback((overrideTemp?: number): Record<string, string> => {
    const headers: Record<string, string> = {
      'X-Session-ID': sessionIdRef.current,
    };
    if (apiSettings.apiKey.trim()) {
      headers['X-API-Key'] = apiSettings.apiKey.trim();
    }
    if (apiSettings.modelPreset) {
      headers['X-Model-Preset'] = apiSettings.modelPreset;
    }
    if (apiSettings.modelPreset === 'custom') {
      headers['X-Models'] = JSON.stringify(apiSettings.customModels);
    }
    if (typeof overrideTemp === 'number') {
      headers['X-Temperature'] = String(Math.max(0, Math.min(0.7, overrideTemp)));
    }
    return headers;
  }, [apiSettings]);

  // Fetch server BYOAK config on mount
  useEffect(() => {
    fetch(apiUrl('/api/config'))
      .then((res) => (res.ok ? res.json() : null))
      .then((cfg: ServerConfig | null) => {
        if (!cfg) return;
        setServerKeyConfigured(Boolean(cfg.server_key_configured));
        if (cfg.default_models) {
          setDefaultModels(cfg.default_models);
          setApiSettings((prev) => {
            const hasSavedCustom = sessionStorage.getItem(BYOAK_SETTINGS_KEY);
            if (hasSavedCustom) return prev;
            return { ...prev, customModels: cfg.default_models };
          });
        }
      })
      .catch(() => {});
  }, []);

  // Fetch SQLite debate history scoped to this browser session
  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/debates?limit=50'), {
        headers: { 'X-Session-ID': sessionIdRef.current },
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (err) {
      console.error('Failed to fetch debate history:', err);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const addSseEvent = useCallback((type: string, data: any) => {
    const item: SseEventItem = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      type,
      data,
      timestamp: new Date().toLocaleTimeString(),
    };
    setSseEvents((prev) => [item, ...prev].slice(0, 100));
  }, []);

  // Process SSE line buffer
  const processSseChunk = useCallback(
    (chunkText: string, currentBuffer: string): { newBuffer: string } => {
      const text = currentBuffer + chunkText;
      const lines = text.split('\n');
      let remainder = '';

      // Last element might be incomplete line
      if (!text.endsWith('\n\n') && !text.endsWith('\n')) {
        remainder = lines.pop() || '';
      }

      let currentEvent = 'message';
      let currentData = '';

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trimEnd();

        if (line.startsWith('event:')) {
          currentEvent = line.replace('event:', '').trim();
        } else if (line.startsWith('data:')) {
          currentData = line.replace('data:', '').trim();
        } else if (line === '') {
          // Dispatch completed SSE message
          if (currentData) {
            try {
              const parsed = JSON.parse(currentData);
              handleSseEventRef.current(currentEvent, parsed);
            } catch {
              handleSseEventRef.current(currentEvent, currentData);
            }
          }
          currentEvent = 'message';
          currentData = '';
        }
      }

      return { newBuffer: remainder };
    },
    []
  );

  const handleSseEvent = useCallback(
    (type: string, data: any) => {
      addSseEvent(type, data);

      switch (type) {
        case 'node_start': {
          const node = data.node as PipelineNodeName;
          setActiveNode(node);
          setCompletedNodes((prev) => (prev.includes(node) ? prev : [...prev, node]));
          if (data.round) {
            setCurrentRound(data.round);
          }
          break;
        }

        case 'sub_claims': {
          if (Array.isArray(data.sub_claims)) {
            setSubClaims(data.sub_claims);
          }
          if (data.token_usage) {
            setTotalTokens((prev) => prev + data.token_usage);
          }
          break;
        }

        case 'tool_call': {
          if (data.role === 'proponent' || data.role === 'skeptic') {
            setActiveNode(data.role === 'proponent' ? 'proponent_node' : 'skeptic_node');
          }
          break;
        }

        case 'argument': {
          const arg = data as DebateArgument & { evidence?: EvidenceItem[]; token_usage?: number };
          if (arg.role === 'proponent') {
            setProponentArgs((prev) => {
              const exists = prev.some((p) => p.round === arg.round && p.argument === arg.argument);
              return exists ? prev : [...prev, arg];
            });
          } else if (arg.role === 'skeptic') {
            setSkepticArgs((prev) => {
              const exists = prev.some((s) => s.round === arg.round && s.argument === arg.argument);
              return exists ? prev : [...prev, arg];
            });
          }
          if (Array.isArray(arg.evidence) && arg.evidence.length > 0) {
            setEvidenceUrls((prev) => [...prev, ...arg.evidence!]);
          } else if (arg.citations && Array.isArray(arg.citations)) {
            const newEv: EvidenceItem[] = arg.citations.map((c: string) => ({
              role: arg.role,
              round: arg.round,
              title: c,
              url: c,
              snippet: '',
            }));
            setEvidenceUrls((prev) => [...prev, ...newEv]);
          }
          if (arg.token_usage) {
            setTotalTokens((prev) => prev + arg.token_usage!);
          }
          break;
        }

        case 'verdict_preview': {
          if (data.token_usage) {
            setTotalTokens((prev) => prev + data.token_usage);
          }
          break;
        }

        case 'round_complete': {
          if (data.round) {
            setCurrentRound(data.round);
          }
          break;
        }

        case 'interrupt': {
          setStatus('paused');
          setActiveNode('hitl_gate_node');
          setInterruptData(data as InterruptPayload);
          break;
        }

        case 'final_verdict': {
          setStatus('completed');
          setActiveNode(null);
          setInterruptData(null);
          setVerdict(data as VerdictData);
          if (data.total_tokens) {
            setTotalTokens(data.total_tokens);
          }
          fetchHistory();
          break;
        }

        case 'error': {
          setStatus('error');
          setActiveNode(null);
          setErrorMessage(data.message || 'An error occurred during debate execution.');
          fetchHistory();
          break;
        }

        default:
          break;
      }
    },
    [addSseEvent, fetchHistory]
  );

  handleSseEventRef.current = handleSseEvent;

  // Consume an SSE stream using fetch and ReadableStream reader
  const consumeStream = useCallback(
    async (url: string, options: RequestInit = {}) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            ...options.headers,
            Accept: 'text/event-stream',
          },
        });

        if (!response.ok) {
          throw new Error(`Stream request failed with status ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('ReadableStream body not available');
        }

        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunkText = decoder.decode(value, { stream: true });
          const { newBuffer } = processSseChunk(chunkText, buffer);
          buffer = newBuffer;
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          console.log('Stream aborted.');
        } else {
          console.error('SSE Stream error:', err);
          setStatus('error');
          setErrorMessage(err.message || 'Stream connection failed');
        }
      }
    },
    [processSseChunk]
  );

  // Start new debate
  const startDebate = useCallback(
    async (
      targetClaim: string,
      targetMaxRounds: number = 3,
      targetMode: JuryMode = 'general',
      targetTemperature: number = 0.2
    ) => {
      setErrorMessage(null);
      setVerdict(null);
      setInterruptData(null);
      setProponentArgs([]);
      setSkepticArgs([]);
      setEvidenceUrls([]);
      setSubClaims([]);
      setSseEvents([]);
      setCompletedNodes([]);
      setTotalTokens(0);
      setCurrentRound(1);
      setClaim(targetClaim);
      setMaxRounds(targetMaxRounds);
      setMode(targetMode);
      setStatus('running');

      try {
        const res = await fetch(apiUrl('/api/debates'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Session-ID': sessionIdRef.current,
          },
          body: JSON.stringify({ claim: targetClaim, max_rounds: targetMaxRounds, mode: targetMode }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || 'Failed to initialize debate');
        }

        const data = await res.json();
        const newThreadId = data.thread_id;
        setThreadId(newThreadId);
        try {
          const url = new URL(window.location.href);
          url.searchParams.set('thread', newThreadId);
          window.history.replaceState({}, '', url.toString());
        } catch {}
        fetchHistory();

        // Connect SSE stream with BYOAK headers (in-memory only, never stored)
        consumeStream(apiUrl(`/api/debates/${newThreadId}/stream`), {
          headers: buildByoakHeaders(targetTemperature),
        });
      } catch (err: any) {
        setStatus('error');
        setErrorMessage(err.message || 'Failed to start debate');
      }
    },
    [consumeStream, fetchHistory, buildByoakHeaders]
  );

  // Intervene in paused debate
  const intervene = useCallback(
    async (humanContext: string) => {
      if (!threadId) return;

      setStatus('running');
      setErrorMessage(null);
      setInterruptData(null);

      // Post intervention and consume resume SSE stream
      consumeStream(apiUrl(`/api/debates/${threadId}/intervene`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildByoakHeaders(),
        },
        body: JSON.stringify({ human_context: humanContext }),
      });
    },
    [threadId, consumeStream, buildByoakHeaders]
  );

  // Load an existing debate from history
  const loadDebate = useCallback(
    async (targetThreadId: string) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      setErrorMessage(null);
      setInterruptData(null);
      setSseEvents([]);

      try {
        const res = await fetch(apiUrl(`/api/debates/${targetThreadId}`));
        if (!res.ok) throw new Error('Failed to load debate');
        const debate = await res.json();

        setThreadId(debate.thread_id);
        setClaim(debate.claim);
        setStatus(debate.status as DebateStatus);
        setTotalTokens(debate.total_tokens || 0);
        setMaxRounds(debate.max_rounds || 3);
        setMode((debate.mode || debate.report?.mode || 'general') as JuryMode);
        try {
          const url = new URL(window.location.href);
          url.searchParams.set('thread', debate.thread_id);
          window.history.replaceState({}, '', url.toString());
        } catch {}

        const report = debate.report || {};
        setSubClaims(report.sub_claims || []);
        const loadedPropArgs = report.proponent_args || [];
        const loadedSkepArgs = report.skeptic_args || [];
        setProponentArgs(loadedPropArgs);
        setSkepticArgs(loadedSkepArgs);
        setEvidenceUrls(report.evidence_urls || []);

        const recordedRounds = Math.max(
          loadedPropArgs.length,
          loadedSkepArgs.length,
          1
        );
        setCurrentRound(recordedRounds);

        if (debate.verdict) {
          setVerdict({
            verdict: debate.verdict,
            confidence: debate.confidence ?? 0.5,
            summary: report.summary || '',
            claim_breakdown: report.claim_breakdown || [],
            citation_audit: report.citation_audit || [],
            total_tokens: debate.total_tokens,
            cached: true,
          });
        } else {
          setVerdict(null);
        }

        if (debate.status === 'completed') {
          setActiveNode(null);
          setCompletedNodes([
            'guard_node',
            'decomposer_node',
            'proponent_node',
            'skeptic_node',
            'moderator_node',
            'judge_node',
            'hitl_gate_node',
            'persist_node',
          ]);
        } else if (debate.status === 'paused') {
          setCompletedNodes([
            'guard_node',
            'decomposer_node',
            'proponent_node',
            'skeptic_node',
            'moderator_node',
            'judge_node',
          ]);
          setInterruptData({
            thread_id: debate.thread_id,
            reason: report.reason || 'low_confidence',
            confidence: report.confidence ?? (debate.confidence || 0.5),
            question:
              report.question ||
              `The confidence score is below threshold. Please provide human clarification.`,
          });
          setActiveNode('hitl_gate_node');
        } else if (debate.status === 'running') {
          // Reconnect stream if it's still running
          consumeStream(apiUrl(`/api/debates/${debate.thread_id}/stream`));
        }
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to load debate');
      }
    },
    [consumeStream]
  );

  const resetDebate = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setStatus('idle');
    setThreadId(null);
    setClaim('');
    setTotalTokens(0);
    setCurrentRound(1);
    setSubClaims([]);
    setProponentArgs([]);
    setSkepticArgs([]);
    setEvidenceUrls([]);
    setActiveNode(null);
    setCompletedNodes([]);
    setVerdict(null);
    setInterruptData(null);
    setSseEvents([]);
    setErrorMessage(null);
    setMode('general');
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('thread');
      window.history.replaceState({}, '', url.toString());
    } catch {}
  }, []);

  // Auto-load ?thread=<id> permalink on initial mount
  useEffect(() => {
    try {
      const sharedThread = new URLSearchParams(window.location.search).get('thread');
      if (sharedThread) {
        loadDebate(sharedThread);
      }
    } catch {}
  }, [loadDebate]);

  return {
    status,
    threadId,
    claim,
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
    fetchHistory,
  };
}
