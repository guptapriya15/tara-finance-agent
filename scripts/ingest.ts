/**
 * scripts/ingest.ts
 *
 * Usage:
 *   DATA_DIR=./data/sample_a npx tsx scripts/ingest.ts
 *   DATA_DIR=./data/sample_b npx tsx scripts/ingest.ts
 *
 * Reads three JSON files from DATA_DIR:
 *   transactions.json, funds.json, holdings.json
 *
 * Clears existing data and repopulates all tables.
 * Also runs schema.sql to ensure tables exist.
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "../src/db/client.js";
import { normalizeMerchant } from "../src/services/merchantNormalizer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATA_DIR = process.env.DATA_DIR ?? "./data/sample_a";

// ------------------------------------------------------------------ //

async function runSchema() {
  const schemaPath = path.join(__dirname, "../src/db/schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  // Split on semicolons, filter blanks, run each statement
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of statements) {
    await db.query(stmt);
  }
  console.log("✅ Schema applied");
}

function readJson<T>(file: string): T {
  const full = path.resolve(DATA_DIR, file);
  if (!fs.existsSync(full)) {
    throw new Error(`File not found: ${full}`);
  }
  return JSON.parse(fs.readFileSync(full, "utf8")) as T;
}

// ------------------------------------------------------------------ //

async function main() {
  console.log(`📂 DATA_DIR = ${DATA_DIR}`);

  await runSchema();

  // Load raw data
  interface TxnRaw {
    id: string;
    date: string;
    merchant: string;
    category: string;
    amount: number;
    currency: string;
    memo?: string;
  }
  interface NavPoint { date: string; value: number }
  interface FundRaw  { id: string; name: string; category: string; nav: NavPoint[] }
  interface HoldingRaw {
    fund_id: string;
    fund_name: string;
    units: number;
    purchase_date: string;
    purchase_nav: number;
  }

  const transactions = readJson<TxnRaw[]>("transactions.json");
  const funds        = readJson<FundRaw[]>("funds.json");
  const holdings     = readJson<HoldingRaw[]>("holdings.json");

  // Clear in FK-safe order
  console.log("🧹 Clearing existing data...");
  await db.query("DELETE FROM holdings");
  await db.query("DELETE FROM fund_navs");
  await db.query("DELETE FROM funds");
  await db.query("DELETE FROM transactions");

  // Funds
  console.log(`📈 Inserting ${funds.length} funds...`);
  for (const fund of funds) {
    await db.query(
      `INSERT INTO funds (id, name, category) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category`,
      [fund.id, fund.name, fund.category]
    );

    for (const point of fund.nav) {
      await db.query(
        `INSERT INTO fund_navs (fund_id, nav_date, nav) VALUES ($1, $2, $3)
         ON CONFLICT (fund_id, nav_date) DO UPDATE SET nav = EXCLUDED.nav`,
        [fund.id, point.date, point.value]
      );
    }
  }

  // Holdings
  console.log(`💼 Inserting ${holdings.length} holdings...`);
  for (const h of holdings) {
    await db.query(
      `INSERT INTO holdings (fund_id, fund_name, units, purchase_date, purchase_nav)
       VALUES ($1, $2, $3, $4, $5)`,
      [h.fund_id, h.fund_name, h.units, h.purchase_date, h.purchase_nav]
    );
  }

  // Transactions
  console.log(`🧾 Inserting ${transactions.length} transactions...`);
  let inserted = 0;
  let skipped  = 0;

  for (const txn of transactions) {
    // Defensive: skip rows with missing required fields
    if (!txn.id || !txn.date || !txn.merchant || txn.amount == null) {
      skipped++;
      continue;
    }

    const canonical = normalizeMerchant(txn.merchant);
    const category  = txn.category?.toLowerCase().trim() || "uncategorized";

    await db.query(
      `INSERT INTO transactions
         (id, transaction_date, merchant, merchant_canonical, category, amount, currency, memo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE
         SET transaction_date   = EXCLUDED.transaction_date,
             merchant           = EXCLUDED.merchant,
             merchant_canonical = EXCLUDED.merchant_canonical,
             category           = EXCLUDED.category,
             amount             = EXCLUDED.amount,
             currency           = EXCLUDED.currency,
             memo               = EXCLUDED.memo`,
      [
        txn.id,
        txn.date,
        txn.merchant,
        canonical,
        category,
        txn.amount,
        txn.currency ?? "INR",
        txn.memo ?? null,
      ]
    );
    inserted++;
  }

  console.log(`\n🎉 Ingestion complete`);
  console.log(`   Funds:        ${funds.length}`);
  console.log(`   NAV points:   ${funds.reduce((a, f) => a + f.nav.length, 0)}`);
  console.log(`   Holdings:     ${holdings.length}`);
  console.log(`   Transactions: ${inserted} inserted, ${skipped} skipped`);

  await db.end();
}

main().catch(async (err) => {
  console.error("❌ Ingestion failed:", err.message);
  await db.end();
  process.exit(1);
});