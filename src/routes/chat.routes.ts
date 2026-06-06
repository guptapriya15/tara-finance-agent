import { Router, Request, Response } from "express";
import crypto from "crypto";
import { taraAgent } from "../mastra/agents/tara-agent";
import { logEvent } from "../services/logger";

const router = Router();

router.post("/ask", async (req: Request, res: Response) => {
  const question = req.body.question;
  const requestId = crypto.randomUUID();
  const start = Date.now();

  try {
    const result = await taraAgent.generate(question);

    const response = {
      request_id: requestId,
      answer: result.text,
      latency_ms: Date.now() - start,
    };

    logEvent({
      request_id: requestId,
      question,
      answer: result.text,
      status: "success",
      timestamp: new Date().toISOString(),
    });

    res.json(response);
  } catch (err) {
    logEvent({
      request_id: requestId,
      question,
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    });

    res.status(500).json({
      request_id: requestId,
      error: "Internal error",
    });
  }
});

export default router;