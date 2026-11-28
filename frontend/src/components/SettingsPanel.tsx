import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  KeyRound,
  Settings,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import type { ApiSettings, ModelPreset, ModelSlots } from '../types/debate';

interface SettingsPanelProps {
  serverKeyConfigured: boolean;
  defaultModels: ModelSlots;
  apiSettings: ApiSettings;
  onUpdateSettings: (patch: Partial<ApiSettings>) => void;
  onClearKey: () => void;
  onValidateKey: (key: string) => Promise<{ valid: boolean; error?: string }>;
  disabled?: boolean;
}

const PRESET_OPTIONS: { id: ModelPreset; label: string; desc: string }[] = [
  { id: 'balanced', label: 'Balanced', desc: 'Default multi-model mix' },
  { id: 'fast', label: 'Fast', desc: 'llama-3.1-8b-instant' },
  { id: 'smart', label: 'Smart', desc: 'llama-3.3-70b-versatile' },
  { id: 'custom', label: 'Custom', desc: 'Pick per-node models' },
];

const MODEL_SLOT_LABELS: { key: keyof ModelSlots; label: string }[] = [
  { key: 'guard', label: 'Prompt Guard' },
  { key: 'decomposer', label: 'Decomposer' },
  { key: 'proponent', label: 'Proponent' },
  { key: 'skeptic', label: 'Skeptic' },
  { key: 'judge', label: 'Judge' },
];

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  serverKeyConfigured,
  defaultModels,
  apiSettings,
  onUpdateSettings,
  onClearKey,
  onValidateKey,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(!serverKeyConfigured);
  const [showKey, setShowKey] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationState, setValidationState] = useState<{
    status: 'idle' | 'valid' | 'invalid';
    message?: string;
  }>({ status: 'idle' });

  useEffect(() => {
    if (!serverKeyConfigured && !apiSettings.apiKey.trim()) {
      setIsOpen(true);
    }
  }, [serverKeyConfigured, apiSettings.apiKey]);

  const handleTestKey = async () => {
    const trimmed = apiSettings.apiKey.trim();
    if (!trimmed) {
      setValidationState({ status: 'invalid', message: 'Enter an API key first.' });
      return;
    }
    setValidating(true);
    setValidationState({ status: 'idle' });
    const result = await onValidateKey(trimmed);
    setValidating(false);
    if (result.valid) {
      setValidationState({ status: 'valid', message: 'Key verified with Groq' });
    } else {
      setValidationState({
        status: 'invalid',
        message: result.error || 'Invalid API key',
      });
    }
  };

  const hasCustomKey = Boolean(apiSettings.apiKey.trim());

  return (
    <section className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm dark:shadow-none overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full px-3.5 sm:px-4 py-2.5 flex items-center justify-between gap-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
      >
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-slate-800 dark:text-slate-200">
            <Settings className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
            API &amp; Model Settings
          </span>

          {hasCustomKey ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-500/30 font-mono text-[11px]">
              <KeyRound className="w-3 h-3 shrink-0" />
              BYOAK Active ({apiSettings.modelPreset})
            </span>
          ) : serverKeyConfigured ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 font-mono text-[11px]">
              <ShieldCheck className="w-3 h-3 shrink-0" />
              Server key active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 font-mono text-[11px]">
              <KeyRound className="w-3 h-3 shrink-0" />
              Paste Groq key to start
            </span>
          )}
        </div>

        <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1 text-[11px] font-mono shrink-0">
          {isOpen ? (
            <>
              Hide <ChevronUp className="w-3.5 h-3.5" />
            </>
          ) : (
            <>
              Configure <ChevronDown className="w-3.5 h-3.5" />
            </>
          )}
        </span>
      </button>

      {isOpen && (
        <div className="px-4 pb-4 pt-2 border-t border-slate-200/80 dark:border-slate-800/80 space-y-3 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
            {/* Provider */}
            <div className="md:col-span-2 space-y-1">
              <label className="block text-[11px] font-mono text-slate-600 dark:text-slate-400">
                Provider
              </label>
              <select
                value={apiSettings.provider}
                disabled={disabled}
                onChange={() => onUpdateSettings({ provider: 'groq' })}
                className="w-full px-2.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-600"
              >
                <option value="groq">Groq Cloud</option>
              </select>
            </div>

            {/* API Key Input */}
            <div className="md:col-span-6 space-y-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className="block text-[11px] font-mono text-slate-600 dark:text-slate-400">
                  Groq API Key {serverKeyConfigured ? '(optional override)' : '(required)'}
                </label>
                <a
                  href="https://console.groq.com/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-mono text-cyan-700 dark:text-cyan-400 hover:underline"
                >
                  Get free key ↗
                </a>
              </div>
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5">
                <div className="relative flex-1 min-w-[180px]">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiSettings.apiKey}
                    disabled={disabled}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="gsk_..."
                    onChange={(e) => {
                      setValidationState({ status: 'idle' });
                      onUpdateSettings({ apiKey: e.target.value });
                    }}
                    className="w-full px-3 py-2 pr-9 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-sm sm:text-xs font-mono text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-cyan-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((prev) => !prev)}
                    aria-label={showKey ? 'Hide API key' : 'Show API key'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleTestKey}
                  disabled={disabled || validating || !apiSettings.apiKey.trim()}
                  className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-cyan-50 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-mono text-[11px] font-medium disabled:opacity-50 transition-colors shrink-0"
                >
                  {validating ? 'Testing...' : 'Test Key'}
                </button>

                {hasCustomKey && (
                  <button
                    type="button"
                    onClick={() => {
                      onClearKey();
                      setValidationState({ status: 'idle' });
                    }}
                    disabled={disabled}
                    title="Clear API key from sessionStorage"
                    aria-label="Clear API key"
                    className="p-2 rounded-lg bg-slate-100 hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-950/40 border border-slate-300 dark:border-slate-700 text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 transition-colors shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {validationState.status === 'valid' && (
                <p className="flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400 font-mono">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {validationState.message}
                </p>
              )}
              {validationState.status === 'invalid' && (
                <p className="flex items-center gap-1 text-[11px] text-rose-600 dark:text-rose-400 font-mono">
                  <XCircle className="w-3.5 h-3.5" /> {validationState.message}
                </p>
              )}
            </div>

            {/* Model Tier Selector */}
            <div className="md:col-span-4 space-y-1">
              <label className="block text-[11px] font-mono text-slate-600 dark:text-slate-400">
                Model Tier
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {PRESET_OPTIONS.map((opt) => {
                  const active = apiSettings.modelPreset === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={disabled}
                      title={opt.desc}
                      onClick={() => onUpdateSettings({ modelPreset: opt.id })}
                      className={`px-2 py-2 rounded-lg text-[11px] font-mono font-medium border transition-colors ${
                        active
                          ? 'bg-cyan-600 text-white border-cyan-600 dark:bg-cyan-500 dark:text-slate-950 dark:border-cyan-500'
                          : 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-800'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Custom Model Slots */}
          {apiSettings.modelPreset === 'custom' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 pt-2 border-t border-slate-200/70 dark:border-slate-800/70">
              {MODEL_SLOT_LABELS.map((slot) => (
                <div key={slot.key} className="space-y-1">
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {slot.label}
                  </label>
                  <input
                    type="text"
                    disabled={disabled}
                    value={apiSettings.customModels[slot.key] ?? defaultModels[slot.key]}
                    onChange={(e) =>
                      onUpdateSettings({
                        customModels: {
                          ...apiSettings.customModels,
                          [slot.key]: e.target.value,
                        },
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-[11px] font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-600"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Privacy Guarantee */}
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            Key stored in browser sessionStorage only. Cleared when tab closes. Never logged or written to our DB.
          </p>
        </div>
      )}
    </section>
  );
};
