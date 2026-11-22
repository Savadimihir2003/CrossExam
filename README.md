# CrossExam: Adversarial Fact-Checker & Multi-Agent Debate Engine

> **Production-grade, adversarial multi-agent courtroom fact-checking engine built with FastAPI, LangGraph, SQLite, React 18, and Tailwind CSS.**

CrossExam challenges assumptions through structured adversarial debate. Instead of asking a single LLM to verify a claim, CrossExam decomposes the proposition into atomic sub-claims, fans out concurrently to **Proponent** and **Red-Team Skeptic** agents over DuckDuckGo web search, iterates across debate rounds via a **Moderator** sync barrier, synthesizes findings via an authoritative **Chief Judge**, and engages a **Human-in-the-Loop (HITL) Gate** when certainty is insufficient.

---

## 🏛️ System Architecture

```text
                                  ┌────────────────────────┐
                                  │   User Claim Input     │
                                  └───────────┬────────────┘
                                              │
                                              ▼
                                  ┌────────────────────────┐
                                  │   Guard Node (Fast)    │
                                  │  llama-prompt-guard    │
                                  └───────────┬────────────┘
                                              │
                                              ▼
                                  ┌────────────────────────┐
                                  │    Decomposer Node     │
                                  │     gpt-oss-20b        │
                                  └───────────┬────────────┘
                                              │
                      ┌───────────────────────┴───────────────────────┐
                      │ Parallel Send() Fan-Out                       │
                      ▼                                               ▼
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
       Re-Score        ▼                      ▼                        │
          ┌─────────────────────┐    ┌────────────────────┐            │
          │ Chief Judge Rescore │    │ Persist Node (End) │            │
          └──────────┬──────────┘    │ SQLite debates.db  │            │
                     │               └────────────────────┘            │
                     └────────────────────────┬────────────────────────┘
```

---

## 🚀 Free-Tier Model Routing (Groq Cloud)

To prevent rate-limit exhaustion within Groq's free-tier (8K TPM per model bucket), each courtroom role is assigned a distinct model:

| Role | Model Identifier | Free Tier Limits | Purpose |
| :--- | :--- | :--- | :--- |
| **Guard Gate** | `meta-llama/llama-prompt-guard-2-22m` | 30 RPM / 15K TPM | Prompt injection & jailbreak detection |
| **Decomposer** | `openai/gpt-oss-20b` | 30 RPM / 8K TPM | Decomposes claim into 2–3 atomic sub-claims |
| **Proponent** | `qwen/qwen3.8-27b` | 30 RPM / 8K TPM | Retrieves evidence & argues **SUPPORT** |
| **Skeptic** | `openai/gpt-oss-20b` | 30 RPM / 8K TPM | Retrieves counter-evidence & argues **REFUTE** |
| **Chief Judge** | `openai/gpt-oss-120b` | 30 RPM / 8K TPM | Synthesizes verdict, breakdown & citation audit |

All Groq calls are protected with `tenacity` exponential backoff retries on `429` / rate-limit responses.

---

## 🗄️ Persistence Architecture

1. **`checkpoints.db` (LangGraph `AsyncSqliteSaver`):**
   - Stateful graph checkpointing indexed by `thread_id`.
   - Supports pausing execution via `interrupt()` and resuming with `Command(resume=human_context)`.
2. **`debates.db` (Application SQLite Repository):**
   - Tracks debate history across app restarts (`thread_id`, `claim`, `status`, `verdict`, `confidence`, `total_tokens`, `report_json`, `created_at`).
   - Powers the sidebar history and cached debate viewer.

---

## 🛠️ Repository Layout

```text
CrossExam/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   └── routes.py         # REST + SSE endpoints
│   │   ├── db/
│   │   │   ├── __init__.py
│   │   │   └── sqlite.py         # Async SQLite CRUD
│   │   ├── graph/
│   │   │   ├── __init__.py
│   │   │   ├── nodes.py          # LLM & graph node functions
│   │   │   ├── state.py          # DebateState & Pydantic output schemas
│   │   │   └── workflow.py       # StateGraph builder + SqliteSaver
│   │   ├── tools/
│   │   │   ├── __init__.py
│   │   │   └── search.py         # DuckDuckGo search & snippet cleaner
│   │   ├── config.py             # Pydantic BaseSettings
│   │   └── main.py               # FastAPI app lifespan & CORS
│   ├── tests/
│   │   ├── __init__.py
│   │   └── test_graph.py         # Unit & integration tests
│   ├── .env.example
│   ├── pytest.ini
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── CourtroomSplit.tsx    # Proponent vs. Skeptic columns
│   │   │   ├── ExecutionGraph.tsx    # 5-node pipeline progress bar
│   │   │   ├── HistorySidebar.tsx    # SQLite archive drawer
│   │   │   ├── JudgeVerdictCard.tsx  # Final verdict & HITL intervention box
│   │   │   └── SseInspector.tsx      # Live SSE telemetry & state tree
│   │   ├── hooks/
│   │   │   └── useDebateStream.ts    # SSE stream & REST hook
│   │   ├── types/
│   │   │   └── debate.ts             # TypeScript definitions
│   │   ├── App.tsx                   # Main War-Room dashboard
│   │   └── index.css                 # Tailwind CSS styling
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.ts
└── README.md
```

---

## ⚡ Quickstart & Run Commands

### 1. Backend Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv .venv

# On Linux/macOS:
source .venv/bin/activate
# On Windows PowerShell:
.venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
# Edit .env and supply your Groq API key:
# GROQ_API_KEY=your_actual_groq_key_here
```

Run backend server:
```bash
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
API Documentation will be available at `http://127.0.0.1:8000/docs`.

### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start Vite development server
npm run dev
```
Open `http://localhost:3000` in your browser.

---

## 🧪 Verification & Testing

Run the full pytest suite in the backend (runs offline with mocked LLM/search calls):

```bash
# In backend/ directory with active venv:
pytest tests/test_graph.py -v
```

All 12 tests verify:
- SQLite persistence and thread CRUD operations
- DuckDuckGo search tool robustness and HTML stripping
- Atomic claim decomposition with structured output
- Concurrent `Send()` fan-out to Proponent and Skeptic
- Multi-round sliding-window conditional routing via Moderator
- `interrupt()` trigger when confidence < 0.75
- `Command(resume=...)` resumption and verdict re-scoring
- FastAPI REST and health endpoints
- Defensive error handling when `GROQ_API_KEY` is missing

---

## 📡 API Contract

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/debates` | Accepts `{ "claim": str, "max_rounds": int }`, creates `thread_id`, persists to SQLite |
| `GET` | `/api/debates` | Lists recent debates from SQLite for the history sidebar |
| `GET` | `/api/debates/{thread_id}` | Retrieves saved debate details and verdict report |
| `GET` | `/api/debates/{thread_id}/stream` | Streams real-time SSE events (`node_start`, `tool_call`, `argument`, `round_complete`, `interrupt`, `final_verdict`, `error`) |
| `POST` | `/api/debates/{thread_id}/intervene` | Resumes paused debate with `{ "human_context": str }` and streams re-evaluation events |
| `GET` | `/health` | Service health status and configured model IDs |

---

## ⚖️ License
MIT License. Built for rigorous AI fact verification.
