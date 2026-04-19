/**
 * github_lookup — look up a GitHub org: metadata, top repos by stars, language mix.
 *
 * Two modes:
 *   - Real (default): hits api.github.com. No auth required for public orgs; set
 *     GITHUB_TOKEN in the environment for a 5k/hr rate-limit bump.
 *   - Mock (MOCK_TOOLS=1): returns a deterministic fixture from
 *     ./fixtures/github.ts. Used by the Tool bench for reproducibility.
 *
 * Returns an error object (not a throw) on any failure — handlers must keep
 * the agent loop alive so the model can observe the failure and decide what to do.
 */

import { z } from "zod";
import type { ToolDefinition } from "../types";
import { GITHUB_FIXTURES, type GithubFixture } from "./fixtures/github";

const InputSchema = z.object({
  org: z.string().min(1).describe("GitHub organization login, e.g. 'vercel'"),
});

type Input = z.infer<typeof InputSchema>;

type Output =
  | (GithubFixture & { source: "mock" | "api" })
  | { error: string; source: "mock" | "api" };

async function mockHandler({ org }: Input): Promise<Output> {
  const key = org.toLowerCase();
  const fixture = GITHUB_FIXTURES[key];
  if (!fixture) {
    return {
      error: `No fixture for org '${org}'. Mocked lookups cover: ${Object.keys(GITHUB_FIXTURES).join(", ")}.`,
      source: "mock",
    };
  }
  return { ...fixture, source: "mock" };
}

async function apiHandler({ org }: Input): Promise<Output> {
  const headers: Record<string, string> = {
    "User-Agent": "custom-model-bench/github_lookup",
    Accept: "application/vnd.github+json",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  try {
    const metaRes = await fetch(`https://api.github.com/orgs/${encodeURIComponent(org)}`, { headers });
    if (!metaRes.ok) {
      return {
        error: `GitHub metadata fetch failed: ${metaRes.status} ${metaRes.statusText}`,
        source: "api",
      };
    }
    const meta = (await metaRes.json()) as {
      name?: string;
      description?: string;
      public_repos?: number;
    };

    const reposRes = await fetch(
      `https://api.github.com/orgs/${encodeURIComponent(org)}/repos?per_page=100&sort=updated`,
      { headers },
    );
    if (!reposRes.ok) {
      return {
        error: `GitHub repos fetch failed: ${reposRes.status} ${reposRes.statusText}`,
        source: "api",
      };
    }
    const repos = (await reposRes.json()) as {
      name: string;
      stargazers_count: number;
      language: string | null;
    }[];

    const top5 = [...repos]
      .sort((a, b) => b.stargazers_count - a.stargazers_count)
      .slice(0, 5)
      .map((r) => ({ name: r.name, stars: r.stargazers_count, language: r.language ?? "Unknown" }));

    // Language mix as % share of stars (better signal than file counts in repo lists)
    const totalStars = repos.reduce((s, r) => s + r.stargazers_count, 0) || 1;
    const byLang: Record<string, number> = {};
    for (const r of repos) {
      const lang = r.language ?? "Other";
      byLang[lang] = (byLang[lang] ?? 0) + r.stargazers_count;
    }
    const langMix = Object.fromEntries(
      Object.entries(byLang)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([k, v]) => [k, Math.round((v / totalStars) * 100)]),
    );

    return {
      name: meta.name ?? org,
      description: meta.description ?? "",
      public_repos: meta.public_repos ?? repos.length,
      top_repos: top5,
      language_mix: langMix,
      source: "api",
    };
  } catch (e: unknown) {
    return {
      error: `GitHub lookup threw: ${e instanceof Error ? e.message : String(e)}`,
      source: "api",
    };
  }
}

export const githubLookup: ToolDefinition<Input, Output> = {
  name: "github_lookup",
  description:
    "Look up a GitHub organization. Returns its display name, description, public repo count, top 5 repos by star count, and language mix percentages.",
  inputSchema: InputSchema,
  handler: (input) => (process.env.MOCK_TOOLS === "1" ? mockHandler(input) : apiHandler(input)),
};
