/**
 * linkedin_enrich — return structured info about a LinkedIn profile slug.
 *
 * Three execution paths:
 *   - Mock (MOCK_TOOLS=1): return a fixture if we have one, else a structured
 *     error listing available slugs. Used by Tool bench for reproducibility.
 *   - Real (PROXYCURL_API_KEY set): call Proxycurl's person endpoint.
 *   - Real (no key): return a structured error object advising the agent to
 *     fall back to web_fetch. Crucial: graceful degradation is the WHOLE
 *     POINT of this tool's design. The agent should observe the error and
 *     call web_fetch instead.
 *
 * Handlers NEVER throw. Errors come back as data so the tool loop continues.
 */

import { z } from "zod";
import type { ToolDefinition } from "../types";
import { LINKEDIN_FIXTURES, type LinkedInFixture } from "./fixtures/linkedin";

const InputSchema = z.object({
  profile_slug: z
    .string()
    .min(1)
    .describe(
      "LinkedIn profile slug — the path segment after '/in/', e.g. 'guillermo-rauch'.",
    ),
});

type Input = z.infer<typeof InputSchema>;

type Output =
  | (LinkedInFixture & { source: "mock" | "proxycurl" })
  | { error: string; source: "mock" | "proxycurl" | "no-key" };

async function mockHandler({ profile_slug }: Input): Promise<Output> {
  const fixture = LINKEDIN_FIXTURES[profile_slug];
  if (!fixture) {
    return {
      error: `No fixture for '${profile_slug}'. Mocked profiles cover: ${Object.keys(LINKEDIN_FIXTURES).join(", ")}. Fall back to web_fetch if you need real data.`,
      source: "mock",
    };
  }
  return { ...fixture, source: "mock" };
}

async function proxycurlHandler({ profile_slug }: Input): Promise<Output> {
  const key = process.env.PROXYCURL_API_KEY;
  if (!key) {
    // This is a feature, not a bug: the agent should recognize the error shape
    // and try web_fetch instead. Tool bench measures whether each provider
    // does so gracefully.
    return {
      error:
        "linkedin_enrich requires PROXYCURL_API_KEY in the environment. " +
        "Fall back to web_fetch with the URL https://linkedin.com/in/" +
        profile_slug +
        " if you still need this data.",
      source: "no-key",
    };
  }
  try {
    const url = new URL("https://nubela.co/proxycurl/api/v2/linkedin");
    url.searchParams.set(
      "linkedin_profile_url",
      `https://www.linkedin.com/in/${profile_slug}`,
    );
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      return {
        error: `Proxycurl fetch failed: ${res.status} ${res.statusText}`,
        source: "proxycurl",
      };
    }
    const raw = (await res.json()) as any;
    return {
      full_name: [raw.first_name, raw.last_name].filter(Boolean).join(" "),
      headline: raw.headline ?? "",
      location:
        raw.city && raw.country_full_name
          ? `${raw.city}, ${raw.country_full_name}`
          : raw.country_full_name ?? raw.city ?? "",
      company:
        raw.experiences?.[0]?.company ??
        raw.occupation ??
        "",
      company_title: raw.experiences?.[0]?.title ?? "",
      summary: raw.summary ?? "",
      source: "proxycurl",
    };
  } catch (e: unknown) {
    return {
      error: `linkedin_enrich threw: ${e instanceof Error ? e.message : String(e)}`,
      source: "proxycurl",
    };
  }
}

export const linkedinEnrich: ToolDefinition<Input, Output> = {
  name: "linkedin_enrich",
  description:
    "Fetch structured info for a LinkedIn profile by slug — full name, current role, location, company, headline, summary. Returns a structured error object (not a throw) when the profile can't be fetched; in that case consider falling back to web_fetch.",
  inputSchema: InputSchema,
  handler: (input) =>
    process.env.MOCK_TOOLS === "1" ? mockHandler(input) : proxycurlHandler(input),
};
