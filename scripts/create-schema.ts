import fs from "fs";
import path from "path";
import { db } from "../src/db/client";

async function main() {
  const schema = fs.readFileSync(
    path.join(process.cwd(), "src/db/schema.sql"),
    "utf8"
  );

  await db.query(schema);

  console.log("✅ Schema created successfully");

  await db.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});