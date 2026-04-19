/**
 * tool-smoke/config.ts — minimal echo-tool config used to verify the
 * tool-calling loop lands in Phase A.3. Not a real benchmark.
 */
import type { CandidateConfig } from "../../scripts/types";
import { z } from "zod";

export const candidate: CandidateConfig = {
  provider: "anthropic",
  model: "claude-haiku-4-5",
  systemPrompt:
    "You have access to an `echo` tool that returns whatever string you pass in. " +
    "When the user asks you to test it, call echo with a short message, then " +
    "tell the user what the tool returned.",
  temperature: 0,
  maxOutputTokens: 300,
  tools: [
    {
      name: "echo",
      description: "Returns the input message verbatim.",
      inputSchema: z.object({ message: z.string() }),
      handler: async ({ message }: { message: string }) => ({ echoed: message }),
    },
  ],
  maxTurns: 5,
};
