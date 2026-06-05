import express, { Request, Response } from "express";
import dotenv from "dotenv";
import crypto from "crypto";
import { logEvent } from "./services/logger";

import { taraAgent } from "./mastra/agents/tara-agent";


dotenv.config();

const app = express();

app.use(express.json());



app.post(
  "/ask",
  async (req: Request, res: Response): Promise<void> => {
    const question = req.body.question;

    const requestId = crypto.randomUUID();
    const start = Date.now();

    logEvent({
      request_id: requestId,
      question,
      status: "started",
      timestamp: new Date().toISOString(),
    });

    try {
      const result = await taraAgent.generate(
        question
      );

      const response = {
        request_id: requestId,
        answer: result.text,
        latency_ms: Date.now() - start,
      };

      logEvent({
        request_id: requestId,
        question,
        answer: result.text,
        latency_ms: response.latency_ms,
        status: "success",
        timestamp: new Date().toISOString(),
      });

      res.json(response);
    } catch (error) {
      console.error(error);

      logEvent({
        request_id: requestId,
        question,
        status: "failed",
        error:
          error instanceof Error
            ? error.message
            : String(error),
        timestamp: new Date().toISOString(),
      });

      res.status(500).json({
        request_id: requestId,
        error: "Internal error",
      });
    }
  }
);

app.listen(3000, () => {
  console.log(
    "Server running at http://localhost:3000"
  );
});