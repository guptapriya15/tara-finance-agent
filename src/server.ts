import "dotenv/config";
import express, { Request, Response } from "express";
import crypto from "crypto";
import { taraAgent } from "./mastra/agents/tara-agent.js";
import { writeTrace, persistTrace, type ToolCall } from "./services/logger.js";

const app  = express();
const PORT = Number(process.env.PORT ?? 3000);

app.use(express.json());

// ------------------------------------------------------------------ //
//  POST /ask
// ------------------------------------------------------------------ //
app.post("/ask", async (req: Request, res: Response) => {
  const question  = req.body?.question;
  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  if (!question || typeof question !== "string" || !question.trim()) {
    res.status(400).json({ error: 'Body must contain a non-empty "question" string.' });
    return;
  }

  const toolsCalled: ToolCall[] = [];
  const tablesRead  = new Set<string>();

  try {
    // Intercept tool calls for observability by wrapping generate
    const result = await taraAgent.generate(question, {
      onStepFinish: (step: any) => {
        // Mastra calls onStepFinish after each model step
        if (step?.toolCalls) {
          for (const tc of step.toolCalls) {
            const tables = inferTables(tc.toolName);
            tables.forEach((t) => tablesRead.add(t));
            toolsCalled.push({
              tool:       tc.toolName,
              input:      tc.args ?? {},
              tables,
              durationMs: 0, // Mastra doesn't expose per-tool timing here
            });
          }
        }
      },
    });

    const latency = Date.now() - startTime;
    const trace   = {
      request_id:   requestId,
      question,
      tools_called: toolsCalled,
      tables_read:  [...tablesRead],
      status:       "success" as const,
      latency_ms:   latency,
      created_at:   new Date().toISOString(),
    };

    writeTrace(trace);
    await persistTrace(trace);

    res.json({
      answer:     result.text,
      request_id: requestId,
      latency_ms: latency,
    });

  } catch (err) {
    const latency  = Date.now() - startTime;
    const errorMsg = err instanceof Error ? err.message : String(err);

    const trace = {
      request_id:   requestId,
      question,
      tools_called: toolsCalled,
      tables_read:  [...tablesRead],
      status:       "failed" as const,
      error_msg:    errorMsg,
      latency_ms:   latency,
      created_at:   new Date().toISOString(),
    };

    writeTrace(trace);
    await persistTrace(trace);

    console.error(`[${requestId}] ERROR:`, errorMsg);
    res.status(500).json({ error: "Internal error", request_id: requestId });
  }
});

// ------------------------------------------------------------------ //
//  GET /health
// ------------------------------------------------------------------ //
app.get("/health", (_req, res) => {
  res.json({ status: "ok", ts: new Date().toISOString() });
});

// ------------------------------------------------------------------ //
//  Boot
// ------------------------------------------------------------------ //
app.listen(PORT, () => {
  console.log(`✅ Tara server listening on http://localhost:${PORT}`);
});

// ------------------------------------------------------------------ //
//  Helper: infer which DB tables a given tool reads
// ------------------------------------------------------------------ //
function inferTables(toolName: string): string[] {
  switch (toolName) {
    case "query_transactions":
      return ["transactions"];
    case "portfolio_analytics":
      return ["funds", "fund_navs", "holdings"];
    default:
      return [];
  }
}