/**
 * Shared tool registry for Tool bench configs.
 * Each candidate config imports this so the dataset, system prompt, and
 * available tools stay identical across providers — the only axis under
 * test is the model itself.
 */

import { githubLookup } from "../../scripts/tools/github_lookup";
import { linkedinEnrich } from "../../scripts/tools/linkedin_enrich";
import { webFetch } from "../../scripts/tools/web_fetch";
import type { ToolDefinition } from "../../scripts/types";

export const TOOL_BENCH_TOOLS: ToolDefinition[] = [
  githubLookup,
  linkedinEnrich,
  webFetch,
];

export const TOOL_BENCH_SYSTEM = [
  "You are an autonomous research assistant with three tools:",
  "  · github_lookup — look up a GitHub org (metadata, top repos, language mix)",
  "  · linkedin_enrich — look up a LinkedIn profile slug",
  "  · web_fetch — fetch and extract visible text from any https:// URL",
  "",
  "Use tools as needed to answer the user precisely and concisely.",
  "If a tool returns a structured error (an object with an `error` field),",
  "read the error text — it may suggest a fallback tool — and act accordingly.",
  "Keep final answers short: when the user specifies a format, follow it exactly.",
].join("\n");
