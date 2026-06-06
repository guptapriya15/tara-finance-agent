# Tara Finance Research Agent

AI-powered finance research agent built using Mastra, PostgreSQL, Express, and Groq.

Tara answers natural-language questions about:

- Transaction spending
- Merchant analytics
- Category analytics
- Recurring subscriptions
- Portfolio holdings
- Fund performance
- Asset allocation

---

# Architecture

![Architecture](docs/screenshots/architecture.png)

Tara uses an LLM for intent understanding and deterministic analytics tools for financial calculations.

---

# Features

## Transaction Analytics

- Merchant spend analysis
- Category spend analysis
- Transaction history lookup
- Spend summaries
- Recurring subscription detection

## Portfolio Analytics

- Holdings analysis
- Portfolio summary
- Asset allocation
- Fund performance lookup

## AI Agent

- Natural language interface
- Tool-based reasoning
- Structured financial analytics
- Multi-dataset support

---

# Database Schema

![Database Schema](docs/screenshots/database-schema.png)

The system stores:

- Transactions
- Funds
- Fund NAV history
- Holdings

---

# Technology Stack

- TypeScript
- Node.js
- Express
- PostgreSQL
- Mastra
- Groq
- Zod

---

# Project Structure

```text
.
├── src/
│   ├── agents/
│   ├── db/
│   ├── services/
│   ├── tools/
│   └── server.ts
│
├── scripts/
│   ├── ingest.ts
│   └── chat.ts
│
├── data/
│   └── sample_a/
│
├── docs/
│   └── screenshots/
│
├── README.md
├── DESIGN.md
├── eval-report.json
└── .env.example
```

---

# Setup

## 1. Install

```bash
npm install
```

## 2. Configure Environment

Create a `.env` file in the repo root:

```env
# Required
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DB_NAME
GROQ_API_KEY=your_groq_key

# Optional
DATA_DIR=./data/sample_a
PORT=3000
```

## 3. Create Database (optional)

If you don’t already have Postgres set up, create the database referenced in `DATABASE_URL`.

Example:

```sql
CREATE DATABASE provue_tara;
```

## 4. Ingest Dataset

Ingest one of the provided snapshots (or your own snapshot folder):

```bash
# Default: DATA_DIR=./data/sample_a
npx tsx scripts/ingest.ts

# Or set DATA_DIR to another folder, e.g.
# set DATA_DIR=./data/sample_b
# npx tsx scripts/ingest.ts
```

---

# Dataset Ingestion

![Dataset Ingestion](docs/screenshots/ingestion.png)

The ingestion pipeline:

1. Loads transactions
2. Normalizes merchants
3. Loads fund NAV history
4. Loads holdings
5. Stores structured data in PostgreSQL

---

# Running the Server

```bash
npm run server
```

Server:

```text
Server running on port 3000
```

---

# Interactive CLI Demo

Start:

```bash
npm run chat
```

The CLI sends questions directly to the `/ask` endpoint and provides a simple conversational interface.

---

# Example Conversation

![CLI Demo](docs/screenshots/api-query.png)

Example questions:

- How much did I spend on Swiggy?
- What is my total food spend?
- Which category had the highest spend?
- What are my recurring subscriptions?

---

# API

## Endpoint

```http
POST /ask
```

## Request

```json
{
  "question": "How much did I spend on Swiggy?"
}
```

## Response

```json
{
  "answer": "You spent ₹49,311.02 on Swiggy."
}
```

---

# Running Against New Datasets

The ingestion pipeline is dataset agnostic.

Update:

```env
DATA_DIR=./data/new_dataset
```

Expected structure:

```text
new_dataset/
├── transactions.json
├── funds.json
└── holdings.json
```

Re-ingest:

```bash
npx tsx scripts/ingest.ts
```

Start server:

```bash
npm run server
```

All queries will now operate on the newly loaded dataset.

---

# Evaluation

Run:

```bash
npm run eval
```

Results are generated in:

```text
eval-report.json
```

---

# Evaluation Results

![Evaluation Results](docs/screenshots/evaluation-results.png)

The evaluation suite validates:

- Merchant spending
- Category analysis
- Recurring subscriptions
- Portfolio analytics
- Fund performance

---

# Logs & Observability

![Logs](docs/screenshots/logs.png)

Logs include:

- User questions
- Tool selection
- Tool outputs
- Errors
- Evaluation runs

This helps with debugging and reproducibility.

---

# Design Document

Additional implementation details are available in:

```text
DESIGN.md
```
