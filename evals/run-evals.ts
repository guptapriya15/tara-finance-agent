import "dotenv/config";
import fs from "fs";
import path from "path";

// ── Config ────────────────────────────────────────────────────────────────────
const API_URL  = process.env.EVAL_API_URL ?? "http://localhost:3000/ask";
const OUT_FILE = path.join(process.cwd(), "evals", "report.json");
const CONCURRENCY = 1;    // run sequentially — avoids flooding the LLM rate limit
const DELAY_MS    = 8000; // 8s between requests — Groq free tier: 30k TPM limit

// ── Types ─────────────────────────────────────────────────────────────────────
interface Expectation {
  type: string;
  description: string;
  mustContain?: string[];
  mustNotContain?: string[];
  mustContainPattern?: string;
  minItems?: number;
}

interface Question {
  id: number;
  question: string;
  tags: string[];
  expect: Expectation;
}

interface EvalResult {
  id: number;
  question: string;
  tags: string[];
  answer: string | null;
  latency_ms: number;
  http_ok: boolean;
  passed: boolean;
  failures: string[];
  error?: string;
}

// ── Checker ───────────────────────────────────────────────────────────────────
function checkAnswer(answer: string, expect: Expectation): string[] {
  const failures: string[] = [];
  const lower = answer.toLowerCase();

  // mustContain — all strings must appear (case-insensitive)
  if (expect.mustContain) {
    for (const term of expect.mustContain) {
      if (!lower.includes(term.toLowerCase())) {
        failures.push(`Expected answer to contain "${term}"`);
      }
    }
  }

  // mustNotContain — none of these strings may appear
  if (expect.mustNotContain) {
    for (const term of expect.mustNotContain) {
      if (lower.includes(term.toLowerCase())) {
        failures.push(`Answer must not contain "${term}"`);
      }
    }
  }

  // mustContainPattern — at least one regex match required
  if (expect.mustContainPattern) {
    const re = new RegExp(expect.mustContainPattern, "i");
    if (!re.test(answer)) {
      failures.push(`Answer did not match expected pattern: ${expect.mustContainPattern}`);
    }
  }

  return failures;
}

// ── Ask ───────────────────────────────────────────────────────────────────────
async function ask(question: string): Promise<{ answer: string; latency_ms: number; ok: boolean }> {
  const start = Date.now();
  try {
    const res = await fetch(API_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ question }),
    });

    const latency_ms = Date.now() - start;

    if (!res.ok) {
      return { answer: `HTTP ${res.status}: ${res.statusText}`, latency_ms, ok: false };
    }

    const data = await res.json();
    return { answer: data.answer ?? "(no answer field in response)", latency_ms, ok: true };
  } catch (err) {
    return {
      answer:     err instanceof Error ? err.message : String(err),
      latency_ms: Date.now() - start,
      ok:         false,
    };
  }
}

// ── Formatting helpers ────────────────────────────────────────────────────────
const RESET  = "\x1b[0m";
const BOLD   = "\x1b[1m";
const GREEN  = "\x1b[32m";
const RED    = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM    = "\x1b[2m";
const CYAN   = "\x1b[36m";

function tag(t: string) {
  return `${DIM}[${t}]${RESET}`;
}

function pass(id: number, question: string, ms: number) {
  console.log(`${GREEN}✓${RESET} ${BOLD}#${id}${RESET} ${question}`);
  console.log(`  ${DIM}${ms}ms${RESET}`);
}

function fail(id: number, question: string, ms: number, failures: string[], answer: string) {
  console.log(`${RED}✗${RESET} ${BOLD}#${id}${RESET} ${question}`);
  for (const f of failures) {
    console.log(`  ${RED}→${RESET} ${f}`);
  }
  const preview = answer.length > 120 ? answer.slice(0, 120) + "…" : answer;
  console.log(`  ${DIM}Answer: ${preview}${RESET}`);
  console.log(`  ${DIM}${ms}ms${RESET}`);
}

function error(id: number, question: string, ms: number, msg: string) {
  console.log(`${YELLOW}!${RESET} ${BOLD}#${id}${RESET} ${question}`);
  console.log(`  ${YELLOW}→ Error: ${msg}${RESET}`);
  console.log(`  ${DIM}${ms}ms${RESET}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const questionsPath = path.join(process.cwd(), "evals", "questions.json");

  if (!fs.existsSync(questionsPath)) {
    console.error(`${RED}✗ evals/questions.json not found${RESET}`);
    process.exit(1);
  }

  const questions: Question[] = JSON.parse(fs.readFileSync(questionsPath, "utf8"));

  // Optional tag filter: npx tsx evals/run-evals.ts --tag=no_data
  const tagFilter = process.argv.find((a) => a.startsWith("--tag="))?.split("=")[1];
  const subset = tagFilter
    ? questions.filter((q) => q.tags.includes(tagFilter))
    : questions;

  console.clear();
  console.log(`${BOLD}Tara Finance Agent — Eval Suite${RESET}`);
  console.log(`${DIM}Endpoint: ${API_URL}${RESET}`);
  if (tagFilter) console.log(`${CYAN}Filter: tag=${tagFilter}${RESET}`);
  console.log(`Running ${subset.length} question(s)…\n`);

  const results: EvalResult[] = [];

  for (const q of subset) {
    process.stdout.write(`${DIM}#${q.id} asking…${RESET}\r`);

    const { answer, latency_ms, ok } = await ask(q.question);

    const result: EvalResult = {
      id:         q.id,
      question:   q.question,
      tags:       q.tags,
      answer,
      latency_ms,
      http_ok:    ok,
      passed:     false,
      failures:   [],
    };

    if (!ok) {
      result.error    = answer;
      result.failures = [`HTTP request failed: ${answer}`];
      error(q.id, q.question, latency_ms, answer);
    } else {
      const failures = checkAnswer(answer, q.expect);
      result.passed   = failures.length === 0;
      result.failures = failures;

      if (result.passed) {
        pass(q.id, q.question, latency_ms);
      } else {
        fail(q.id, q.question, latency_ms, failures, answer);
      }
    }

    results.push(result);

    // pause between requests — Groq free tier hits 30k TPM quickly with 20 questions
    if (CONCURRENCY === 1 && subset.indexOf(q) < subset.length - 1) {
      process.stdout.write(`  waiting ${DELAY_MS / 1000}s for rate limit…\r`);
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const passed  = results.filter((r) => r.passed).length;
  const failed  = results.filter((r) => !r.passed).length;
  const avgMs   = Math.round(results.reduce((a, r) => a + r.latency_ms, 0) / results.length);
  const pct     = Math.round((passed / results.length) * 100);

  console.log(`\n${"─".repeat(52)}`);
  console.log(`${BOLD}Results${RESET}   ${GREEN}${passed} passed${RESET}  ${RED}${failed} failed${RESET}  ${DIM}(${pct}% pass rate)${RESET}`);
  console.log(`${BOLD}Latency${RESET}   avg ${avgMs}ms`);

  // tag-level breakdown
  const allTags = [...new Set(questions.flatMap((q) => q.tags))].sort();
  if (allTags.length > 0) {
    console.log(`\n${BOLD}By tag${RESET}`);
    for (const t of allTags) {
      const inTag  = results.filter((r) => {
        const q = questions.find((q) => q.id === r.id);
        return q?.tags.includes(t);
      });
      if (!inTag.length) continue;
      const ok = inTag.filter((r) => r.passed).length;
      const bar = ok === inTag.length ? GREEN : ok === 0 ? RED : YELLOW;
      console.log(`  ${tag(t.padEnd(20))} ${bar}${ok}/${inTag.length}${RESET}`);
    }
  }

  // failed cases detail
  const failedResults = results.filter((r) => !r.passed);
  if (failedResults.length > 0) {
    console.log(`\n${BOLD}Failed cases${RESET}`);
    for (const r of failedResults) {
      console.log(`  ${RED}#${r.id}${RESET} ${r.question}`);
      for (const f of r.failures) {
        console.log(`     → ${f}`);
      }
    }
  }

  console.log(`${"─".repeat(52)}\n`);

  // ── Write report ──────────────────────────────────────────────────────────
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(
    OUT_FILE,
    JSON.stringify(
      {
        run_at:     new Date().toISOString(),
        endpoint:   API_URL,
        tag_filter: tagFilter ?? null,
        summary: {
          total:     results.length,
          passed,
          failed,
          pass_rate: pct,
          avg_latency_ms: avgMs,
        },
        results,
      },
      null,
      2
    )
  );

  console.log(`${DIM}Report saved → evals/report.json${RESET}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`${RED}Fatal:${RESET}`, err);
  process.exit(1);
});