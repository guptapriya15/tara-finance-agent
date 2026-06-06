import "dotenv/config";
import readline from "readline";

const API_URL = "http://localhost:3000/ask";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.clear();

console.log("╔══════════════════════════════════════╗");
console.log("║          Tara Finance Agent          ║");
console.log("╚══════════════════════════════════════╝");
console.log("Type your question and press Enter.");
console.log("Type 'exit' to quit.\n");

async function askQuestion() {
  rl.question("❯ ", async (question) => {
    const input = question.trim();

    if (!input) {
      return askQuestion();
    }

    if (input.toLowerCase() === "exit") {
      console.log("\n👋 Goodbye!");
      rl.close();
      process.exit(0);
    }

    try {
      process.stdout.write("\n⏳ Thinking...\n");

      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: input,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}: ${response.statusText}`
        );
      }

      const data = await response.json();

      console.log("\n──────────────────────────────────────");

      if (data.answer) {
        console.log(`🤖 ${data.answer}`);
      } else {
        console.log("🤖 No response received.");
      }

      console.log("──────────────────────────────────────\n");
    } catch (error) {
      console.log("\n──────────────────────────────────────");
      console.error(
        "❌ Error:",
        error instanceof Error
          ? error.message
          : String(error)
      );
      console.log("──────────────────────────────────────\n");
    }

    askQuestion();
  });
}

askQuestion();