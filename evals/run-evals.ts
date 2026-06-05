import fs from "fs";
import path from "path";

import { taraAgent } from "../src/mastra/agents/tara-agent";

async function main() {
  const questions = JSON.parse(
    fs.readFileSync(
      path.join(
        process.cwd(),
        "evals",
        "questions.json"
      ),
      "utf8"
    )
  );

  const results: any[] = [];

  for (const q of questions) {
    console.log(
      `Running: ${q.question}`
    );

    const start = Date.now();

    try {
      const response =
        await taraAgent.generate(
          q.question
        );

      results.push({
        id: q.id,
        question: q.question,
        answer: response.text,
        latency_ms:
          Date.now() - start,
        success: true,
      });
    } catch (error) {
      results.push({
        id: q.id,
        question: q.question,
        answer: null,
        latency_ms:
          Date.now() - start,
        success: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }

  fs.writeFileSync(
    path.join(
      process.cwd(),
      "evals",
      "report.json"
    ),
    JSON.stringify(
      results,
      null,
      2
    )
  );

  console.log(
    "✅ Evaluation complete"
  );
}

main().catch(console.error);