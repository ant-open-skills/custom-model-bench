/**
 * web_fetch — generic HTTPS GET that returns page title + visible text.
 *
 * Two execution modes:
 *   - Real (default): fetches the URL, extracts <title>, strips all tags,
 *     collapses whitespace. No JavaScript execution, no cookies, no auth.
 *     Truncates text to MAX_TEXT chars to keep tool_result tokens bounded.
 *   - Mock (MOCK_TOOLS=1): returns a fixture keyed by the URL's host+path.
 *     Used by Tool bench for reproducibility — agent's fallback path
 *     produces stable data across runs.
 *
 * Handlers NEVER throw.
 */

import { z } from "zod";
import type { ToolDefinition } from "../types";
import { WEB_FIXTURES } from "./fixtures/web";

const MAX_TEXT = 4000;

const InputSchema = z.object({
  url: z
    .string()
    .url()
    .describe("Absolute https:// URL to fetch. Only static HTML is read — no JS execution."),
});

type Input = z.infer<typeof InputSchema>;

type Output =
  | { title: string; text: string; url: string; source: "mock" | "http" }
  | { error: string; url: string; source: "mock" | "http" };

function normaliseKey(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const host = u.host.replace(/^www\./i, "");
    const path = u.pathname.replace(/\/+$/, "");
    return (host + path).toLowerCase();
  } catch {
    return rawUrl.toLowerCase();
  }
}

async function mockHandler({ url }: Input): Promise<Output> {
  const key = normaliseKey(url);
  const fixture = WEB_FIXTURES[key];
  if (!fixture) {
    return {
      error: `No web fixture for URL '${url}' (normalised key: '${key}'). Mocked URLs: ${Object.keys(WEB_FIXTURES).join(", ")}.`,
      url,
      source: "mock",
    };
  }
  return { title: fixture.title, text: fixture.text, url, source: "mock" };
}

async function httpHandler({ url }: Input): Promise<Output> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "custom-model-bench/web_fetch" },
      redirect: "follow",
    });
    if (!res.ok) {
      return {
        error: `web_fetch received ${res.status} ${res.statusText}`,
        url,
        source: "http",
      };
    }
    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch?.[1]?.trim() ?? "";

    // Crude but effective text extraction: drop <script>/<style>, then strip
    // all remaining tags, then collapse whitespace. Good enough for the agent
    // to reason over; heavyweight parsing (cheerio et al.) is out of scope.
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim();

    const truncated = text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) + " …" : text;
    return { title, text: truncated, url, source: "http" };
  } catch (e: unknown) {
    return {
      error: `web_fetch threw: ${e instanceof Error ? e.message : String(e)}`,
      url,
      source: "http",
    };
  }
}

export const webFetch: ToolDefinition<Input, Output> = {
  name: "web_fetch",
  description:
    "Fetch an https:// URL and return its page title plus visible text. No JavaScript execution, no auth, text is truncated. Use this as a fallback when a structured tool (e.g. linkedin_enrich) can't reach the source.",
  inputSchema: InputSchema,
  handler: (input) => (process.env.MOCK_TOOLS === "1" ? mockHandler(input) : httpHandler(input)),
};
