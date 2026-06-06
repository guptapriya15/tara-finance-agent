import pg from "pg";

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL || typeof DATABASE_URL !== "string") {
  console.error(
    "[db] Missing/invalid DATABASE_URL env var. Set DATABASE_URL to a valid Postgres connection string.",
  );
  // Fail fast so /ask doesn't return opaque 500s.
  throw new Error("Missing DATABASE_URL");
}

export const db = new Pool({
  connectionString: DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

db.on("error", (err) => {
  console.error("[db] pool error:", err.message);
});
