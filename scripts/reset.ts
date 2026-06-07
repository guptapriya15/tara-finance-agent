/**
 * reset.ts
 *
 * Full environment reset:
 *   1. Clear logs/requests.log
 *   2. Clear evals/report.json
 *   3. Drop all tables (in FK-safe order)
 *   4. Re-run schema (CREATE TABLE IF NOT EXISTS)
 *   5. Re-ingest from DATA_DIR
 *   6. Print row counts to confirm
 *
 * Usage:
 *   npx tsx scripts/reset.ts
 *   DATA_DIR=./data/sample_b npx tsx scripts/reset.ts
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { db } from "../src/db/client.js";
import { normalizeMerchant } from "../src/services/merchantNormalizer.js";

const DATA_DIR  = process.env.DATA_DIR ?? "./data/sample_a";
const LOG_FILE  = path.join(process.cwd(), "logs", "requests.log");
const REPORT    = path.join(process.cwd(), "evals", "report.json");
const SCHEMA    = path.join(process.cwd(), "src", "db", "schema.sql");

// ── ANSI helpers ──────────────────────────────────────────────────────────────
const G = "\x1b[32m";   // green
const R = "\x1b[31m";   // red
const Y = "\x1b[33m";   // yellow
const D = "\x1b[2m";    // dim
const B = "\x1b[1m";    // bold
const X = "\x1b[0m";    // reset

const ok  = (msg: string) => console.log(`${G}✓${X} ${msg}`);
const err = (msg: string) => console.log(`${R}✗${X} ${msg}`);
const inf = (msg: string) => console.log(`${Y}→${X} ${msg}`);
const dim = (msg: string) => console.log(`${D}  ${msg}${X}`);

// ── Step 1 — Clear log file ───────────────────────────────────────────────────
function clearLogs() {
  inf("Clearing logs/requests.log");
  if (fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, "");
    ok("logs/requests.log cleared");
  } else {
    dim("logs/requests.log not found — skipping");
  }

  // also clear the mastra internal log if present
  const mastraLog = path.join(process.cwd(), "src", "mastra", "public", "logs", "requests.log");
  if (fs.existsSync(mastraLog)) {
    fs.writeFileSync(mastraLog, "");
    ok("src/mastra/public/logs/requests.log cleared");
  }
}

// ── Step 2 — Clear eval report ────────────────────────────────────────────────
function clearReport() {
  inf("Clearing evals/report.json");
  if (fs.existsSync(REPORT)) {
    fs.unlinkSync(REPORT);
    ok("evals/report.json removed");
  } else {
    dim("evals/report.json not found — skipping");
  }
}

// ── Step 3 — Drop all tables ──────────────────────────────────────────────────
async function dropTables() {
  inf("Dropping all tables (FK-safe order)");

  // Drop in reverse dependency order
  const drops = [
    "DROP TABLE IF EXISTS request_traces CASCADE",
    "DROP TABLE IF EXISTS holdings CASCADE",
    "DROP TABLE IF EXISTS fund_navs CASCADE",
    "DROP TABLE IF EXISTS funds CASCADE",
    "DROP TABLE IF EXISTS transactions CASCADE",
  ];

  for (const sql of drops) {
    await db.query(sql);
    const table = sql.match(/DROP TABLE IF EXISTS (\w+)/)?.[1] ?? "";
    dim(`dropped ${table}`);
  }

  ok("All tables dropped");
}

// ── Step 4 — Recreate schema ──────────────────────────────────────────────────
async function createSchema() {
  inf("Recreating schema from src/db/schema.sql");

  if (!fs.existsSync(SCHEMA)) {
    err(`Schema file not found at ${SCHEMA}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(SCHEMA, "utf8");
  await db.query(sql);
  ok("Schema created");
}

// ── Step 5 — Ingest data ──────────────────────────────────────────────────────
async function ingest() {
  inf(`Ingesting from ${DATA_DIR}`);

  const read = (file: string) => {
    const p = path.join(DATA_DIR, file);
    if (!fs.existsSync(p)) {
      err(`Missing file: ${p}`);
      process.exit(1);
    }
    return JSON.parse(fs.readFileSync(p, "utf8"));
  };

  const transactions = read("transactions.json");
  const funds        = read("funds.json");
  const holdings     = read("holdings.json");

  // ── Funds + NAVs ──
  dim(`Inserting ${funds.length} funds…`);
  for (const fund of funds) {
    await db.query(
      `INSERT INTO funds (id, name, category) VALUES ($1, $2, $3)`,
      [fund.id, fund.name, fund.category]
    );

    for (const nav of fund.nav) {
      await db.query(
        `INSERT INTO fund_navs (fund_id, nav_date, nav) VALUES ($1, $2, $3)`,
        [fund.id, nav.date, nav.value]
      );
    }
  }
  ok(`Funds inserted: ${funds.length}`);

  // ── Holdings ──
  dim(`Inserting ${holdings.length} holdings…`);
  for (const h of holdings) {
    await db.query(
      `INSERT INTO holdings (fund_id, fund_name, units, purchase_date, purchase_nav)
       VALUES ($1, $2, $3, $4, $5)`,
      [h.fund_id, h.fund_name, h.units, h.purchase_date, h.purchase_nav]
    );
  }
  ok(`Holdings inserted: ${holdings.length}`);

  // ── Transactions ──
  dim(`Inserting ${transactions.length} transactions…`);
  for (const txn of transactions) {
    await db.query(
      `INSERT INTO transactions
         (id, transaction_date, merchant, merchant_canonical, category, amount, currency, memo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        txn.id,
        txn.date,
        txn.merchant,
        normalizeMerchant(txn.merchant),
        txn.category,
        txn.amount,
        txn.currency,
        txn.memo ?? null,
      ]
    );
  }
  ok(`Transactions inserted: ${transactions.length}`);
}

// ── Step 6 — Verify counts ────────────────────────────────────────────────────
async function verifyCounts() {
  inf("Verifying row counts");

  const tables = ["transactions", "funds", "fund_navs", "holdings", "request_traces"];
  const counts: Record<string, number> = {};

  for (const t of tables) {
    const r = await db.query(`SELECT COUNT(*) AS n FROM ${t}`);
    counts[t] = Number(r.rows[0].n);
  }

  const pad = (s: string) => s.padEnd(20);

  console.log(`\n${B}  Table                Count${X}`);
  console.log(`  ${"─".repeat(30)}`);
  for (const [t, n] of Object.entries(counts)) {
    const flag = n === 0 && t !== "request_traces" ? `${R} ← expected > 0!${X}` : "";
    console.log(`  ${pad(t)} ${n}${flag}`);
  }
  console.log();
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${B}Tara — Full Reset${X}`);
  console.log(`${D}DATA_DIR: ${DATA_DIR}${X}\n`);

  try {
    clearLogs();
    clearReport();
    await dropTables();
    await createSchema();
    await ingest();
    await verifyCounts();

    ok(`${B}Reset complete. Ready to run: npm start${X}`);
  } catch (e) {
    err("Reset failed");
    console.error(e);
    process.exit(1);
  } finally {
    await db.end();
  }
}

main();