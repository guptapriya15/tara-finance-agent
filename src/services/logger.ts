import fs from "fs";
import path from "path";
import { db } from "../db/client.js";

const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "requests.log");

export interface ToolCall {
  tool: string;
  input: Record<string, unknown>;
  tables: string[];
  durationMs: number;
}

export interface TraceEvent {
  request_id: string;
  question: string;
  tools_called: ToolCall[];
  tables_read: string[];
  status: "success" | "failed";
  error_msg?: string;
  latency_ms: number;
  created_at: string;
}

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

/** Append one JSONL line to the log file (never throws). */
export function writeTrace(event: TraceEvent): void {
  try {
    ensureLogDir();
    fs.appendFileSync(LOG_FILE, JSON.stringify(event) + "\n");
  } catch {
    // logging must never crash the server
  }
}

/** Persist trace to Postgres request_traces table (best-effort). */
export async function persistTrace(event: TraceEvent): Promise<void> {
  try {
    await db.query(
      `INSERT INTO request_traces
         (request_id, question, tools_called, tables_read, status, error_msg, latency_ms, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (request_id) DO UPDATE
         SET status     = EXCLUDED.status,
             tools_called = EXCLUDED.tools_called,
             tables_read  = EXCLUDED.tables_read,
             error_msg    = EXCLUDED.error_msg,
             latency_ms   = EXCLUDED.latency_ms`,
      [
        event.request_id,
        event.question,
        JSON.stringify(event.tools_called),
        event.tables_read,
        event.status,
        event.error_msg ?? null,
        event.latency_ms,
        event.created_at,
      ]
    );
  } catch {
    // best-effort
  }
}