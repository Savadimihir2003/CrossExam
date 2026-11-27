import React from 'react';
import {
  FileText,
  Users2,
  RefreshCw,
  Scale,
  ShieldCheck,
  Check,
  Loader2,
  Pause,
} from 'lucide-react';
import type { DebateStatus, PipelineNodeName } from '../types/debate';

interface ExecutionGraphProps {
  status: DebateStatus;
  activeNode: PipelineNodeName | null;
  completedNodes: PipelineNodeName[];
  currentRound: number;
  maxRounds: number;
}

interface StepConfig {
  id: string;
  name: string;
  model: string;
  icon: React.ElementType;
  nodes: PipelineNodeName[];
}

export const ExecutionGraph: React.FC<ExecutionGraphProps> = ({
  status,
  activeNode,
  completedNodes,
  currentRound,
  maxRounds,
}) => {
  const steps: StepConfig[] = [
    {
      id: 'decomposer',
      name: 'Decomposer',
      model: 'gpt-oss-20b',
      icon: FileText,
      nodes: ['guard_node', 'decomposer_node'],
    },
    {
      id: 'courtroom',
      name: `Debate Fan-Out (R${Math.min(currentRound, maxRounds)})`,
      model: 'qwen3.8-27b ⫽ gpt-oss-20b',
      icon: Users2,
      nodes: ['proponent_node', 'skeptic_node'],
    },
    {
      id: 'moderator',
      name: 'Moderator Loop',
      model: 'State Sync',
      icon: RefreshCw,
      nodes: ['moderator_node'],
    },
    {
      id: 'judge',
      name: 'Chief Judge',
      model: 'gpt-oss-120b',
      icon: Scale,
      nodes: ['judge_node'],
    },
    {
      id: 'hitl',
      name: 'HITL Gate',
      model: 'Confidence Arbitrator',
      icon: ShieldCheck,
      nodes: ['hitl_gate_node', 'hitl_resumed', 'persist_node'],
    },
  ];

  const getStepState = (step: StepConfig) => {
    const isActive = activeNode ? step.nodes.includes(activeNode) : false;
    const isCompleted = step.nodes.some((n) => completedNodes.includes(n));
    const isPaused = status === 'paused' && step.id === 'hitl';

    return { isActive, isCompleted, isPaused };
  };

  return (
    <div className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 shadow-sm dark:shadow-none">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Scale className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
          <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            LangGraph Execution Pipeline
          </h3>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400">
          <span>
            Round <span className="text-cyan-700 dark:text-cyan-400 font-bold">{currentRound}</span>/{maxRounds}
          </span>
          <span className="text-slate-300 dark:text-slate-700">|</span>
          <span className="capitalize text-slate-800 dark:text-slate-200 font-medium">{status}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-2 relative">
        {steps.map((step, idx) => {
          const { isActive, isCompleted, isPaused } = getStepState(step);
          const Icon = step.icon;

          return (
            <div
              key={step.id}
              className={`relative flex items-center gap-2.5 p-2.5 rounded-lg border transition-colors duration-200 ${
                isPaused
                  ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-400 dark:border-amber-500/60'
                  : isActive
                  ? 'bg-cyan-50 dark:bg-cyan-950/40 border-cyan-500 dark:border-cyan-500/60 ring-1 ring-cyan-500/20'
                  : isCompleted
                  ? 'bg-emerald-50/50 dark:bg-slate-950/80 border-emerald-300 dark:border-emerald-500/30 text-slate-900 dark:text-slate-200'
                  : 'bg-slate-50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800/60 text-slate-500 dark:text-slate-400'
              }`}
            >
              <div
                className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors shrink-0 ${
                  isPaused
                    ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400'
                    : isActive
                    ? 'bg-cyan-100 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-400'
                    : isCompleted
                    ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                    : 'bg-slate-200/70 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400'
                }`}
              >
                {isPaused ? (
                  <Pause className="w-3.5 h-3.5 animate-pulse" />
                ) : isActive ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : isCompleted ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Icon className="w-3.5 h-3.5" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-medium text-slate-900 dark:text-slate-200 truncate">
                    {step.name}
                  </span>
                  <span className="text-[10px] font-mono tabular-nums text-slate-400 dark:text-slate-500">
                    {idx + 1}
                  </span>
                </div>
                <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">
                  {step.model}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
