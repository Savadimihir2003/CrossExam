# CrossExam: Adversarial Fact-Checker & Multi-Agent Debate Engine

[![Python: 3.11+](https://img.shields.io/badge/Python-3.11%2B-brightgreen.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115%2B-009688.svg)](https://fastapi.tiangolo.com/)
[![LangGraph](https://img.shields.io/badge/LangGraph-0.2%2B-orange.svg)](https://langchain-ai.github.io/langgraph/)
[![React: 18](https://img.shields.io/badge/React-18-61dafb.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6%2B-3178c6.svg)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-3.4%2B-38bdf8.svg)](https://tailwindcss.com/)

> **A production-grade, adversarial multi-agent courtroom fact-checking engine built with FastAPI, LangGraph, SQLite, React 18, and Tailwind CSS.**

---

## 📖 Table of Contents

- [Executive Overview](#-executive-overview)
- [Why Adversarial Fact-Checking?](#-why-adversarial-fact-checking)
- [System Architecture](#-system-architecture)
- [Multi-Model Groq Free-Tier Routing](#-multi-model-groq-free-tier-routing)
- [Core Engineering Highlights](#-core-engineering-highlights)
- [Repository Structure](#-repository-structure)
- [Quickstart Guide](#-quickstart-guide)
  - [Prerequisites](#prerequisites)
  - [Backend Setup](#1-backend-setup)
  - [Frontend Setup](#2-frontend-setup)
- [API Reference](#-api-reference)
- [Verification & Automated Test Suite](#-verification--automated-test-suite)
- [Frontend War-Room Architecture](#-frontend-war-room-architecture)
- [License](#-license)

---

## 🏛️ Executive Overview

Standard LLM fact-checkers suffer from single-model confirmation bias, sycophancy, and hallucinated consensus: when prompted with a premise, they frequently hallucinate supporting arguments while overlooking contradictory evidence.

**CrossExam** treats truth-seeking as an adversarial legal proceeding. Rather than relying on a solitary model's judgment, CrossExam:

1. **Decomposes** complex user claims into testable, atomic sub-claims.
2. **Fans out concurrently** using LangGraph's `Send()` API to an affirmative **Proponent** and a red-team **Skeptic** agent.
3. **Retrieves live web ground-truth** via DuckDuckGo search, distilled into clean, non-HTML citation snippets.
4. **Conducts multi-round debates** through a synchronized **Moderator** node using sliding-window context to stay strictly within token budgets.
5. **Issues a structured verdict** via a high-reasoning **Chief Judge** auditing each sub-claim and source URL.
6. **Engages Human-in-the-Loop (HITL)** whenever verdict confidence falls below 75%, allowing human arbiters to provide disambiguating context and trigger re-scoring.

---

## ⚖️ Why Adversarial Fact-Checking?

```
Traditional LLM Verification:
  [Claim] ───> [Single LLM] ───> [Hallucinated / Sycophantic Consensus]

CrossExam Adversarial Courtroom:
                   ┌──> [Proponent (Qwen-27B)] ──> [Live Web Evidence] ──┐
  [Claim] ──> [Decomposer]                                               ├──> [Chief Judge (120B)] ──> [Verdict]
                   └──> [Skeptic (GPT-OSS-20B)] ──> [Live Web Evidence] ─┘
```

- **Confirmation Bias Mitigation:** Two specialized models argue opposite sides under explicit evidentiary burdens.
- **Sliding-Window Efficiency:** In multi-round debates, agents only see atomic sub-claims and their opponent's previous round rebuttal—not raw search dumps—staying well within the 8K TPM rate limit.
- **Audited Citations:** Claims must cite live retrieved URLs; unverified assertions are penalized during Chief Judge arbitration.

---

## 🏛️ System Architecture

The core graph is orchestrated via **LangGraph** (`StateGraph`) with persistent SQLite state checkpoints:

```text
                                  ┌────────────────────────┐
                                  │   User Claim Input     │
                                  └───────────┬────────────┘
                                              │
                                              ▼
                                  ┌────────────────────────┐
                                  │   Guard Node (Fast)    │
                                  │  llama-prompt-guard    ├──────────────┐ (Injection Flagged)
                                  └───────────┬────────────┘              │
                                              │ (Clean Claim)             │
                                              ▼                           │
                                  ┌────────────────────────┐              │
                                  │    Decomposer Node     │              │
                                  │     gpt-oss-20b        │              │
                                  └───────────┬────────────┘              │
                                              │                           │
                      ┌───────────────────────┴───────────────────────┐   │
                      │ Parallel Send() Fan-Out                       │   │
                      ▼                                               ▼   │
         ┌────────────────────────┐                      ┌────────────────────────┐
         │ Proponent Node (8K TPM)│                      │  Skeptic Node (8K TPM) │
         │      qwen3.8-27b       │                      │      gpt-oss-20b       │
         │ DuckDuckGo Search (#3) │                      │ DuckDuckGo Search (#3) │
         │   SUPPORT Argument     │                      │   REFUTE Argument      │
         └────────────┬───────────┘                      └────────────┬───────────┘
                      │                                               │
                      └───────────────────────┬───────────────────────┘
                                              ▼
                                  ┌────────────────────────┐
                                  │     Moderator Node     │  (Round < Max: loop)
                                  │  Sync Barrier & Router ├───────────┐
                                  └───────────┬────────────┘           │
                                              │ (Round >= Max)         │
                                              ▼                        │
                                  ┌────────────────────────┐           │
                                  │    Chief Judge Node    │           │
                                  │     gpt-oss-120b       │           │
                                  │ VerdictSchema & Audit  │           │
                                  └───────────┬────────────┘           │
                                              │                        │
                                              ▼                        │
                                  ┌────────────────────────┐           │
                       ┌──────────┤   HITL Gate Node       │           │
                       │          │  interrupt() if < 0.75 │           │
                       │          └───────────┬────────────┘           │
       Command(resume) │                      │ (Confidence >= 0.75)   │
       Re-Score        ▼                      ▼                        ▼
          ┌─────────────────────┐    ┌───────────────────────────────────┐
          │ Chief Judge Rescore │    │        Persist Node (End)         │
          └──────────┬──────────┘    │ writes to debates.db (SQLite)     │
                     │               └───────────────────────────────────┘
                     └────────────────────────┬────────────────────────┘
```

---

## 🚀 Multi-Model Groq Free-Tier Routing

Groq's Free Plan enforces an **8,000 Tokens Per Minute (TPM)** bucket limit _per model ID_. If parallel branches (`Send()`) share a single model identifier, concurrent fan-out risks immediate `429 RateLimitError` exceptions.

CrossExam solves this by routing separate courtroom responsibilities to isolated models across distinct token buckets:

| Role             | Model Identifier                      | Free Tier Limits | Engineering Responsibility                                       |
| :--------------- | :------------------------------------ | :--------------- | :--------------------------------------------------------------- |
| **Prompt Guard** | `meta-llama/llama-prompt-guard-2-22m` | 30 RPM / 15K TPM | Early-rejection filter for prompt-injections & jailbreak attacks |
| **Decomposer**   | `openai/gpt-oss-20b`                  | 30 RPM / 8K TPM  | Decomposes claim into 2–3 atomic, testable sub-claims            |
| **Proponent**    | `qwen/qwen3.8-27b`                    | 30 RPM / 8K TPM  | Live search & ~180-word affirmative evidence argument            |
| **Skeptic**      | `openai/gpt-oss-20b`                  | 30 RPM / 8K TPM  | Live search & ~180-word adversarial counter-argument             |
| **Chief Judge**  | `openai/gpt-oss-120b`                 | 30 RPM / 8K TPM  | High-reasoning synthesis, confidence scoring & citation audit    |

All Groq invocations are wrapped with **`tenacity` exponential backoff retries** handling HTTP 429 and connection jitter gracefully.

---

## 💡 Core Engineering Highlights

### 1. Dual-Database SQLite Architecture

- **`checkpoints.db` (`AsyncSqliteSaver`):** LangGraph's native thread-scoped checkpointer. Tracks execution checkpoints per `thread_id`, enabling zero-loss `interrupt()` and seamless graph resumption via `Command(resume=...)`.
- **`debates.db` (Async SQLite Repository):** Relational application table storing debate history (`thread_id`, `claim`, `status`, `verdict`, `confidence`, `total_tokens`, `report_json`, `created_at`, `max_rounds`). Enables instant history reloads and UI hydration.

### 2. Context Isolation & Token Control

- Round 1 provides each debater only with the atomic sub-claims.
- Round 2+ passes a **sliding window**: debaters receive _only_ the opponent's previous argument and sub-claims—eliminating recursive token bloat and staying under Groq's 8K TPM threshold.

### 3. Defensive Web Search & Text Sanitization

- `DuckDuckGoSearch` wrapped with strict timeouts, empty-query fallbacks, and connection error guards.
- Two-pass sanitization: unescapes HTML entities (`&lt;b&gt;`), strips raw tags (`<[^>]+>`), unescapes again, and truncates snippets to ~120 words to avoid context contamination.

### 4. Real-Time Server-Sent Events (SSE) Engine

- The backend emits structured, typed SSE events throughout graph execution:
  - `node_start` / `node_complete`: Real-time pipeline status updates.
  - `tool_call`: Live DuckDuckGo queries and retrieved source pills.
  - `argument`: Streaming debater text and citations.
  - `interrupt`: Signals UI that human intervention is required (`confidence < 0.75`).
  - `final_verdict`: Complete `VerdictSchema` JSON payload.

---

## 🛠️ Repository Structure

```text
CrossExam/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   └── routes.py         # REST + SSE endpoints (/api/debates, /stream, /intervene)
│   │   ├── db/
│   │   │   ├── __init__.py
│   │   │   └── sqlite.py         # Async SQLite CRUD & auto-migrations
│   │   ├── graph/
│   │   │   ├── __init__.py
│   │   │   ├── nodes.py          # Guard, Decomposer, Proponent, Skeptic, Moderator, Judge, HITL
│   │   │   ├── state.py          # DebateState TypedDict & Pydantic output schemas
│   │   │   └── workflow.py       # StateGraph builder + AsyncSqliteSaver
│   │   ├── tools/
│   │   │   ├── __init__.py
│   │   │   └── search.py         # Defensive DuckDuckGo search & entity cleaner
│   │   ├── config.py             # Pydantic BaseSettings for Groq & SQLite paths
│   │   └── main.py               # FastAPI lifespan, CORS, & route mounting
│   ├── tests/
│   │   ├── __init__.py
│   │   └── test_graph.py         # 16 Pytest integration & unit tests
│   ├── .env.example              # Template for environment configuration
│   ├── pytest.ini                # Pytest configuration with asyncio support
│   └── requirements.txt          # Pinned backend dependencies
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── CourtroomSplit.tsx    # Proponent vs. Skeptic streaming debate cards
│   │   │   ├── ExecutionGraph.tsx    # 5-stage live status pipeline bar
│   │   │   ├── HistorySidebar.tsx    # Saved & paused debates archive drawer
│   │   │   ├── JudgeVerdictCard.tsx  # Final verdict card & inline HITL intervention
│   │   │   └── SseInspector.tsx      # Live SSE event telemetry & state viewer
│   │   ├── hooks/
│   │   │   └── useDebateStream.ts    # SSE event management & REST state hook
│   │   ├── types/
│   │   │   └── debate.ts             # Strict TypeScript types matching backend schemas
│   │   ├── App.tsx                   # Dark-mode War-Room dashboard
│   │   └── index.css                 # Custom Tailwind CSS styling
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.ts
└── README.md
```

---

## ⚡ Quickstart Guide

### Prerequisites

- **Python 3.11+**
- **Node.js 18+ & npm**
- **Groq API Key** (Free tier from [console.groq.com](https://console.groq.com/))

---

### 1. Backend Setup

```bash
cd backend

# 1. Create and activate virtual environment
python -m venv .venv

# On Linux/macOS:
source .venv/bin/activate
# On Windows PowerShell:
.venv\Scripts\Activate.ps1

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment variables
cp .env.example .env

# Edit .env and insert your Groq API key:
# GROQ_API_KEY=gsk_your_actual_key_here
```

**Launch Backend Server:**

```bash
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Interactive OpenAPI Swagger docs will be live at `http://127.0.0.1:8000/docs`.

---

### 2. Frontend Setup

In a separate terminal:

```bash
cd frontend

# 1. Install dependencies
npm install

# 2. Start Vite development server
npm run dev
```

Open `http://localhost:3000` (or `http://localhost:5173`) in your browser to enter the **War-Room**.

---

## 📡 API Reference

| Method | Endpoint                             | Description                                                                                                                               |
| :----- | :----------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/api/debates`                       | Accepts `{ "claim": str, "max_rounds": int }`. Initializes debate in SQLite and returns `{ "thread_id": str }`.                           |
| `GET`  | `/api/debates`                       | Fetches recent debate records from `debates.db` for sidebar history.                                                                      |
| `GET`  | `/api/debates/{thread_id}`           | Retrieves a complete persisted debate record by ID.                                                                                       |
| `GET`  | `/api/debates/{thread_id}/stream`    | SSE endpoint streaming real-time events (`node_start`, `tool_call`, `argument`, `round_complete`, `interrupt`, `final_verdict`, `error`). |
| `POST` | `/api/debates/{thread_id}/intervene` | Resumes a paused debate with `{ "human_context": str }` via `Command(resume=...)` and streams re-scoring.                                 |
| `GET`  | `/health`                            | Service health status and configured model IDs.                                                                                           |

---

## 🧪 Verification & Automated Test Suite

CrossExam includes an extensive automated test suite (`backend/tests/test_graph.py`) testing the entire system offline using mocked LLM responses and realistic payloads.

Run tests using the backend virtual environment:

```bash
cd backend
.venv\Scripts\pytest -v tests/test_graph.py
```

### 16 Test Cases Passed:

1. `test_sqlite_persistence`: Async SQLite CRUD, thread isolation, and `max_rounds` persistence.
2. `test_search_clean_text`: HTML entity unescaping (`&lt;b&gt;`) and raw tag removal.
3. `test_search_empty_query`: Defensive handling of empty search inputs.
4. `test_search_mocked`: Mocked DuckDuckGo snippet extraction.
5. `test_guard_node_pass`: Clean claim traversal through the prompt guard.
6. `test_guard_node_injection_rejection`: Prompt injection detection and routing directly to `persist_node`.
7. `test_decomposer_node`: Structured claim decomposition into atomic sub-claims.
8. `test_fan_out_to_debaters`: LangGraph `Send()` parallel dispatch to Proponent and Skeptic.
9. `test_proponent_and_skeptic_nodes`: Debater argument synthesis and citation anchoring.
10. `test_moderator_loop_routing`: Conditional edge looping and max rounds sync barrier.
11. `test_hitl_interrupt_and_command_resume`: `interrupt()` pause on low confidence and `Command(resume=...)` re-scoring.
12. `test_fastapi_endpoints`: Health, debate creation, list, and single-item retrieval endpoints.
13. `test_missing_groq_api_key_fails_gracefully`: Graceful degradation and descriptive error responses.
14. `test_full_debate_graph_1_round_execution`: Complete end-to-end graph cycle for 1-round debates.
15. `test_full_debate_graph_2_rounds_execution`: Complete end-to-end graph cycle for 2-round debates.
16. `test_full_debate_graph_prompt_injection_halts_early`: Zero-token expenditure on injection attempts.

---

## 🖥️ Frontend War-Room Architecture

The user interface is engineered to evoke an intelligence war-room:

- **Telemetry Header:** Real-time round tracking, cumulative token usage meter, and connection badge.
- **5-Node Execution Graph (`ExecutionGraph.tsx`):** Visualizes live progress across `Decomposer` → `Debaters (Parallel)` → `Moderator` → `Chief Judge` → `HITL Gate`.
- **Courtroom Split (`CourtroomSplit.tsx`):** Side-by-side blue (Proponent) and red (Skeptic) columns displaying round badges, active search query pills, and interactive citation popovers.
- **Chief Judge Verdict Card (`JudgeVerdictCard.tsx`):** Prominently renders verdicts (`SUPPORTED`, `REFUTED`, `MIXED`, `UNVERIFIABLE`), confidence meters, sub-claim breakdowns, citation audits, and an inline amber human-intervention form when the graph pauses.
- **Backend Inspector (`SseInspector.tsx`):** Inspect raw SSE event stream messages and examine the live LangGraph state tree in real time.
- **History Sidebar (`HistorySidebar.tsx`):** Search, browse, and re-hydrate past and paused debates from SQLite.

---

## ⚖️ License

Distributed under the **MIT License**. See [LICENSE](LICENSE) for details. Built for high-assurance, defensible truth verification.
