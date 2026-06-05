import fs from "fs";
import path from "path";

const LOG_FILE = path.join(
  process.cwd(),
  "logs",
  "requests.log"
);

export function logEvent(event: any) {
  const dir = path.dirname(LOG_FILE);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.appendFileSync(
    LOG_FILE,
    JSON.stringify(event) + "\n"
  );
}