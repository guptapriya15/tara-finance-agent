import "dotenv/config";

import express from "express";
import chatRoutes from "./routes/chat.routes";

const app = express();

app.use(express.json());

// routes
app.use("/", chatRoutes);

app.get("/health", (_, res) => {
  res.json({ status: "ok" });
});

const PORT = 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});