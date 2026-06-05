import "dotenv/config";
import { Mastra } from "@mastra/core";
import { taraAgent } from "./agents/tara-agent";

export const mastra = new Mastra({
  agents: {
    "tara-finance-agent": taraAgent,
  },
});
