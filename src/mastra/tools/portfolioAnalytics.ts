import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db } from "../../db/client.js";

/**
 * portfolio_analytics
 *
 * All fund and holdings questions go through this one tool.
 *
 * mode="fund_return"
 *   → period return for a named fund between two dates
 *   Formula: (end_nav - start_nav) / start_nav * 100
 *   Uses the closest available NAV on or before each date.
 *
 * mode="fund_return_ranking"
 *   → rank ALL funds by period return between two dates
 *
 * mode="holding_return"
 *   → realised return for the user's holding of a named fund
 *   Formula: (current_nav - purchase_nav) / purchase_nav * 100
 *   current_value = units × latest_nav
 *   cost          = units × purchase_nav
 *
 * mode="portfolio_summary"
 *   → total portfolio value, cost basis, absolute gain, % return
 *   across all holdings
 *
 * mode="portfolio_ranking"
 *   → rank user's holdings by realised return %
 *
 * mode="list_funds"
 *   → list all funds in the database (name + id)
 *   Use this first when you need a fund_id or fund_name to pass to other modes.
 *
 * Tables read: funds, fund_navs, holdings
 */
export const portfolioAnalyticsTool = createTool({
  id: "portfolio_analytics",

  description: `
Answer any question about mutual funds or the user's investment portfolio.

Modes:
  list_funds          → list all available funds (call this first if you don't know the fund name/id)
  fund_return         → period return % for a specific fund between two dates
  fund_return_ranking → rank ALL funds by period return between startDate and endDate
  holding_return      → user's realised return on a specific holding (by fund name, fuzzy matched)
  portfolio_summary   → total portfolio value, cost, gain, and return % across all holdings
  portfolio_ranking   → rank all holdings by realised return %

For "realised return" or "how much have I made" questions → use holding_return or portfolio_summary.
For "fund return" or "NAV change" questions without holdings context → use fund_return.
For "which fund is best" questions about the user's own money → use portfolio_ranking.
`.trim(),

  inputSchema: z.object({
    mode: z.enum([
      "list_funds",
      "fund_return",
      "fund_return_ranking",
      "holding_return",
      "portfolio_summary",
      "portfolio_ranking",
    ]),
    fundName:  z.string().optional().describe("Fund name (partial match OK). Used in fund_return and holding_return."),
    startDate: z.string().optional().describe("ISO date YYYY-MM-DD. Used in fund_return and fund_return_ranking."),
    endDate:   z.string().optional().describe("ISO date YYYY-MM-DD. Used in fund_return and fund_return_ranking. Defaults to today."),
  }),

  execute: async ({ mode, fundName, startDate, endDate }) => {
    const today = new Date().toISOString().slice(0, 10);
    const end   = endDate ?? today;

    switch (mode) {

      // ---- list all funds ----
      case "list_funds": {
        const r = await db.query(
          `SELECT id, name, category FROM funds ORDER BY name`
        );
        if (!r.rows.length) return { found: false, message: "No funds in database." };
        return { found: true, funds: r.rows };
      }

      // ---- period return for one fund ----
      case "fund_return": {
        if (!fundName) return { found: false, message: "fundName is required for fund_return." };
        if (!startDate) return { found: false, message: "startDate is required for fund_return." };

        const fund = await resolveFund(fundName);
        if (!fund) return { found: false, message: `No fund found matching "${fundName}".` };

        const navStart = await closestNav(fund.id, startDate);
        const navEnd   = await closestNav(fund.id, end);

        if (!navStart) return { found: false, message: `No NAV data for ${fund.name} on or before ${startDate}.` };
        if (!navEnd)   return { found: false, message: `No NAV data for ${fund.name} on or before ${end}.` };

        const returnPct = ((navEnd.nav - navStart.nav) / navStart.nav) * 100;
        return {
          found: true,
          fund_id:   fund.id,
          fund_name: fund.name,
          start_date:  navStart.date,
          start_nav:   round2(navStart.nav),
          end_date:    navEnd.date,
          end_nav:     round2(navEnd.nav),
          return_pct:  round2(returnPct),
        };
      }

      // ---- rank all funds by period return ----
      case "fund_return_ranking": {
        if (!startDate) return { found: false, message: "startDate is required for fund_return_ranking." };

        const funds = await db.query(`SELECT id, name FROM funds ORDER BY name`);
        if (!funds.rows.length) return { found: false, message: "No funds in database." };

        const results: Array<{
          fund_name: string;
          return_pct: number;
          start_nav: number;
          end_nav: number;
        }> = [];

        for (const f of funds.rows) {
          const navStart = await closestNav(f.id, startDate);
          const navEnd   = await closestNav(f.id, end);
          if (!navStart || !navEnd) continue;
          const ret = ((navEnd.nav - navStart.nav) / navStart.nav) * 100;
          results.push({
            fund_name:  f.name,
            return_pct: round2(ret),
            start_nav:  round2(navStart.nav),
            end_nav:    round2(navEnd.nav),
          });
        }

        if (!results.length) return { found: false, message: "Insufficient NAV data for the given period." };

        results.sort((a, b) => b.return_pct - a.return_pct);
        const spread = round2(results[0].return_pct - results[results.length - 1].return_pct);
        return { found: true, ranking: results, spread_pct: spread };
      }

      // ---- realised return on a holding ----
      case "holding_return": {
        if (!fundName) return { found: false, message: "fundName is required for holding_return." };

        const holding = await resolveHolding(fundName);
        if (!holding) return { found: false, message: `No holding found matching "${fundName}".` };

        const latestNav = await closestNav(holding.fund_id, today);
        if (!latestNav) return { found: false, message: `No NAV data found for fund ${holding.fund_name}.` };

        const cost          = holding.units * holding.purchase_nav;
        const currentValue  = holding.units * latestNav.nav;
        const gainAbs       = currentValue - cost;
        const returnPct     = (gainAbs / cost) * 100;

        return {
          found:          true,
          fund_name:      holding.fund_name,
          units:          holding.units,
          purchase_date:  holding.purchase_date,
          purchase_nav:   round2(holding.purchase_nav),
          current_nav:    round2(latestNav.nav),
          current_nav_date: latestNav.date,
          cost_inr:       round2(cost),
          current_value_inr: round2(currentValue),
          gain_inr:       round2(gainAbs),
          return_pct:     round2(returnPct),
        };
      }

      // ---- total portfolio summary ----
      case "portfolio_summary": {
        const r = await db.query(`
          WITH latest_nav AS (
            SELECT DISTINCT ON (fund_id)
              fund_id, nav_date::text AS nav_date, nav
            FROM fund_navs
            ORDER BY fund_id, nav_date DESC
          )
          SELECT
            h.fund_name,
            h.units,
            h.purchase_nav,
            ln.nav          AS current_nav,
            ln.nav_date     AS current_nav_date,
            ROUND(h.units * h.purchase_nav, 2) AS cost_inr,
            ROUND(h.units * ln.nav, 2)         AS current_value_inr,
            ROUND(h.units * ln.nav - h.units * h.purchase_nav, 2) AS gain_inr,
            ROUND(((ln.nav - h.purchase_nav) / NULLIF(h.purchase_nav, 0)) * 100, 2) AS return_pct
          FROM holdings h
          JOIN latest_nav ln ON ln.fund_id = h.fund_id
        `);

        if (!r.rows.length) return { found: false, message: "No holdings found." };

        const totalCost  = r.rows.reduce((a, row) => a + Number(row.cost_inr), 0);
        const totalValue = r.rows.reduce((a, row) => a + Number(row.current_value_inr), 0);
        const totalGain  = totalValue - totalCost;
        const totalRet   = (totalGain / totalCost) * 100;

        return {
          found: true,
          holdings: r.rows,
          summary: {
            total_cost_inr:         round2(totalCost),
            total_current_value_inr: round2(totalValue),
            total_gain_inr:         round2(totalGain),
            total_return_pct:       round2(totalRet),
          },
        };
      }

      // ---- rank user's holdings by realised return ----
      case "portfolio_ranking": {
        const r = await db.query(`
          WITH latest_nav AS (
            SELECT DISTINCT ON (fund_id)
              fund_id, nav
            FROM fund_navs
            ORDER BY fund_id, nav_date DESC
          )
          SELECT
            h.fund_name,
            ROUND(((ln.nav - h.purchase_nav) / NULLIF(h.purchase_nav, 0)) * 100, 2) AS return_pct,
            ROUND(h.units * ln.nav - h.units * h.purchase_nav, 2) AS gain_inr,
            ROUND(h.units * ln.nav, 2) AS current_value_inr
          FROM holdings h
          JOIN latest_nav ln ON ln.fund_id = h.fund_id
          ORDER BY return_pct DESC
        `);

        if (!r.rows.length) return { found: false, message: "No holdings found." };
        return { found: true, ranking: r.rows };
      }
    }
  },
});

// ---- helpers ----

async function resolveFund(name: string) {
  const r = await db.query(
    `SELECT id, name FROM funds WHERE name ILIKE $1 ORDER BY name LIMIT 1`,
    [`%${name}%`]
  );
  return r.rows[0] ?? null;
}

async function resolveHolding(name: string) {
  const r = await db.query(
    `SELECT h.id, h.fund_id, h.fund_name, h.units::float AS units,
            h.purchase_date::text AS purchase_date, h.purchase_nav::float AS purchase_nav
     FROM holdings h
     WHERE h.fund_name ILIKE $1
     ORDER BY h.id
     LIMIT 1`,
    [`%${name}%`]
  );
  return r.rows[0] ?? null;
}

async function closestNav(
  fundId: string,
  date: string
): Promise<{ nav: number; date: string } | null> {
  const r = await db.query(
    `SELECT nav::float AS nav, nav_date::text AS date
     FROM fund_navs
     WHERE fund_id = $1 AND nav_date <= $2
     ORDER BY nav_date DESC
     LIMIT 1`,
    [fundId, date]
  );
  return r.rows[0] ?? null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}