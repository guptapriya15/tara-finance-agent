# Tara Finance Agent

A personal finance research agent built with Mastra SDK, Postgres (Neon), and Google Gemini 2.5 Flash.
Tara answers natural-language questions about spending, transactions, and mutual fund portfolios by querying a real database — never guessing or hallucinating figures.

---

## Deployed URL

```
POST https://tara-finance-agent-me01.onrender.com/ask
```

---

## Stack

| Layer | Technology |
|---|---|
| Agent framework | [Mastra SDK](https://mastra.ai) (TypeScript) |
| LLM | Google Gemini 2.5 Flash (`gemini-2.5-flash`) via `@ai-sdk/google` |
| Database | PostgreSQL 16 on [Neon](https://neon.tech) (free tier) |
| Server | Express 5 — `POST /ask` |
| Runtime | Node.js ≥ 22, `tsx` |
| Deployment | [Render](https://render.com) |

---

## Local Setup

### Prerequisites

- Node.js ≥ 22
- A PostgreSQL database (local or [Neon](https://neon.tech) free tier)
- A [Google AI Studio](https://aistudio.google.com) API key (free, no credit card)

### 1. Clone and install

```bash
git clone https://github.com/guptapriya15/tara-finance-agent.git
cd tara-finance-agent
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```bash
DATABASE_URL=postgresql://user:password@host/provue_tara?sslmode=require
GOOGLE_GENERATIVE_AI_API_KEY=your_google_ai_studio_key
DATA_DIR=./data/sample_a
PORT=3000
```

### 3. Reset database and ingest data

```bash
# Creates schema, clears old data, ingests from DATA_DIR, verifies counts
npx tsx scripts/reset.ts

# Expected output:
# transactions  1500
# funds            8
# fund_navs      192
# holdings         8
# request_traces   0
```

To ingest a different snapshot:

```bash
DATA_DIR=./data/sample_b npx tsx scripts/reset.ts
DATA_DIR=./data/sample_c npx tsx scripts/reset.ts
```

### 4. Start the server

```bash
npm start
# or for development with auto-reload:
npm run dev
```

Server starts at `http://localhost:3000`.

---

## API

### `POST /ask`

```bash
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "How much did I spend on Swiggy?"}'
```

**Request:**
```json
{ "question": "How much did I spend on Swiggy?" }
```

**Response:**
```json
{
  "answer": "You spent a total of ₹49,311.02 on Swiggy across all recorded transactions.",
  "request_id": "133a2154-3e62-4cce-8cc3-0047f7b1336f",
  "latency_ms": 1240
}
```

### `GET /health`

```bash
curl http://localhost:3000/health
# {"status":"ok","ts":"2026-06-07T10:00:00.000Z"}
```

---

## Running Evals

```bash
# Run all 20 questions with pass/fail output
npx tsx evals/run-evals.ts

# Run a subset by tag
npx tsx evals/run-evals.ts --tag=no_data
npx tsx evals/run-evals.ts --tag=multi_step
npx tsx evals/run-evals.ts --tag=portfolio
```

Results are saved to `evals/report.json`.

---

## Project Structure

```
tara-finance-agent/
├── data/
│   ├── sample_a/          # transactions.json, funds.json, holdings.json
│   ├── sample_b/
│   └── sample_c/
├── evals/
│   ├── questions.json     # 20 eval questions with expected answer shapes
│   ├── run-evals.ts       # eval runner with pass/fail logic
│   └── report.json        # generated — gitignored
├── logs/
│   └── requests.log       # JSONL trace log — gitignored
├── scripts/
│   ├── reset.ts           # drop + recreate schema + ingest + verify
│   ├── create-schema.ts   # schema only
│   └── ingest.ts          # ingest only
├── src/
│   ├── db/
│   │   ├── client.ts      # pg Pool
│   │   └── schema.sql     # table definitions and indexes
│   ├── mastra/
│   │   ├── agents/
│   │   │   └── tara-agent.ts
│   │   └── tools/
│   │       ├── index.ts
│   │       ├── queryTransactions.ts
│   │       └── portfolioAnalytics.ts
│   ├── services/
│   │   ├── logger.ts
│   │   ├── merchantNormalizer.ts
│   │   └── subscriptionDetector.ts
│   ├── utils/
│   │   └── retry.ts
│   └── server.ts
├── .env.example
├── package.json
├── tsconfig.json
├── README.md
└── DESIGN.md
```

---

## Observability

Every `POST /ask` request is logged two ways:

1. **JSONL file** — `logs/requests.log`, one line per request
2. **Postgres table** — `request_traces`, queryable via SQL

Each trace captures: `request_id`, `question`, `tools_called`, `tables_read`, `latency_ms`, `status`, `error_msg`.

To inspect a failed request:

```sql
SELECT request_id, question, error_msg, latency_ms
FROM request_traces
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 10;
```

To see which tools were called for a question:

```sql
SELECT question, tools_called, tables_read, latency_ms
FROM request_traces
WHERE status = 'success'
ORDER BY created_at DESC
LIMIT 5;
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string (include `?sslmode=require` for Neon) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | ✅ | Google AI Studio key — get free at [aistudio.google.com](https://aistudio.google.com) |
| `DATA_DIR` | ✅ | Path to snapshot folder, e.g. `./data/sample_a` |
| `PORT` | ❌ | Server port, defaults to `3000` |

---



## Sample Questions Tara Can Answer

- "How much did I spend on Swiggy in total?"
- "Which category had the highest spend?"
- "What are my recurring subscriptions?"
- "Compare my food and travel spending month by month. Which grew faster?"
- "What is my total portfolio worth today, and how much have I made on it?"
- "Which of my funds gave me the best realised return?"
- "Ignore transfers. What was my total actual spending in Q1 2025?"
- "Do I have any rent transactions?"
- "What was the return of Saffron Bluechip Equity Fund in 2024?"
- "Rank all my holdings by realised return."