import fs from "fs";
import path from "path";
import dotenv from "dotenv";

import { db } from "../src/db/client";
import { normalizeMerchant } from "../src/services/merchantNormalizer";

dotenv.config();

const DATA_DIR =
  process.env.DATA_DIR || "./data/sample_a";

async function main() {
  console.log("🚀 Starting ingestion...");

  const transactions = JSON.parse(
    fs.readFileSync(
      path.join(DATA_DIR, "transactions.json"),
      "utf8"
    )
  );

  const funds = JSON.parse(
    fs.readFileSync(
      path.join(DATA_DIR, "funds.json"),
      "utf8"
    )
  );

  const holdings = JSON.parse(
    fs.readFileSync(
      path.join(DATA_DIR, "holdings.json"),
      "utf8"
    )
  );

  console.log("🧹 Clearing existing data...");

  await db.query("DELETE FROM holdings");
  await db.query("DELETE FROM fund_navs");
  await db.query("DELETE FROM funds");
  await db.query("DELETE FROM transactions");

  console.log("📈 Inserting funds...");

  for (const fund of funds) {
    await db.query(
      `
      INSERT INTO funds (
        id,
        name,
        category
      )
      VALUES ($1, $2, $3)
      `,
      [
        fund.id,
        fund.name,
        fund.category,
      ]
    );

    for (const nav of fund.nav) {
      await db.query(
        `
        INSERT INTO fund_navs (
          fund_id,
          nav_date,
          nav
        )
        VALUES ($1, $2, $3)
        `,
        [
          fund.id,
          nav.date,
          nav.value,
        ]
      );
    }
  }

  console.log("💰 Inserting holdings...");

  for (const holding of holdings) {
    await db.query(
      `
      INSERT INTO holdings (
        fund_id,
        fund_name,
        units,
        purchase_date,
        purchase_nav
      )
      VALUES ($1, $2, $3, $4, $5)
      `,
      [
        holding.fund_id,
        holding.fund_name,
        holding.units,
        holding.purchase_date,
        holding.purchase_nav,
      ]
    );
  }

  console.log("🧾 Inserting transactions...");

  for (const txn of transactions) {
    await db.query(
      `
      INSERT INTO transactions (
        id,
        transaction_date,
        merchant,
        merchant_canonical,
        category,
        amount,
        currency,
        memo
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `,
      [
        txn.id,
        txn.date,
        txn.merchant,
        normalizeMerchant(txn.merchant),
        txn.category,
        txn.amount,
        txn.currency,
        txn.memo,
      ]
    );
  }

  console.log(
    `✓ Transactions: ${transactions.length}`
  );

  console.log(
    `✓ Funds: ${funds.length}`
  );

  console.log(
    `✓ Holdings: ${holdings.length}`
  );

  console.log("🎉 Ingestion completed");

  await db.end();
}

main().catch(async (error) => {
  console.error("❌ Ingestion failed");
  console.error(error);

  await db.end();

  process.exit(1);
});