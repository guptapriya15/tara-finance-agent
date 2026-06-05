import { db } from "./client";

async function test() {
  const result = await db.query(
    "SELECT NOW()"
  );

  console.log(result.rows);
}

test();