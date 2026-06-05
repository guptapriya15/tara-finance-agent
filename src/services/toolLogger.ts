import { logEvent } from "./logger";

export function logTool(
  tool: string,
  input: unknown
) {
  console.log(
    "TOOL CALLED:",
    tool,
    input
  );

  logEvent({
    type: "tool_call",
    tool,
    input,
    timestamp: new Date().toISOString(),
  });
}