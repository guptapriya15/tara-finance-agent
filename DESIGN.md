# Design Document

## Overview

Tara is a finance research agent that combines LLM-based intent understanding with deterministic financial analytics.

The design principle is:

> Use the LLM for reasoning and language generation, but use structured analytics tools for calculations.

This minimizes hallucinations and improves consistency.

---

# System Architecture

```text
                User
                  │
                  ▼
          Express API / CLI
                  │
                  ▼
             Tara Agent
                  │
      ┌───────────┴───────────┐
      │                       │
      ▼                       ▼
finance_analytics      portfolio_analytics
      │                       │
      └───────────┬───────────┘
                  ▼
             PostgreSQL
```

---

# Data Flow

```text
transactions.json
funds.json
holdings.json
        │
        ▼
 scripts/ingest.ts
        │
        ▼
 Merchant Normalization
        │
        ▼
 PostgreSQL
```

---

# Database Design

## Transactions

Stores normalized financial transactions.

Important fields:

* merchant
* merchant_canonical
* category
* amount
* transaction_date

## Funds

Stores fund metadata.

## Fund NAVs

Stores historical NAV values.

## Holdings

Stores portfolio positions.

---

# Merchant Normalization

Raw merchant names often vary.

Examples:

```text
SWIGGY INSTAMART
SWIGGY LIMITED
SWIGGY BANGALORE
```

Normalized:

```text
swiggy
```

This improves analytics accuracy.

---

# Analytics Layer

## finance_analytics

Provides:

* Merchant spend
* Category spend
* Spend summaries
* Transaction retrieval
* Recurring subscriptions

Implemented using deterministic SQL queries.

---

## portfolio_analytics

Provides:

* Portfolio summary
* Holdings analysis
* Allocation analysis
* Fund performance

Calculations are performed directly from holdings and NAV data.

---

# Agent Workflow

```text
Question
    │
    ▼
Intent Detection
    │
    ▼
Tool Selection
    │
    ▼
Analytics Query
    │
    ▼
Structured Result
    │
    ▼
Natural Language Response
```

---

# CLI Interface

A lightweight CLI is included:

```bash
npm run chat
```

Benefits:

* Fast manual testing
* Reviewer-friendly demo
* End-to-end validation

The CLI uses the same API layer as external clients.

---

# Evaluation

Automated evaluations validate:

* Merchant spending
* Category analysis
* Recurring subscriptions
* Portfolio questions
* Fund analytics

Results are stored in:

```text
eval-report.json
```

---

# Future Improvements

* Conversational memory
* Portfolio attribution analytics
* Semantic merchant clustering
* Streaming responses
* Web dashboard
* Multi-user support

```
```
