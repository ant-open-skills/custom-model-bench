/**
 * Deterministic GitHub fixtures used by the github_lookup tool when
 * MOCK_TOOLS=1. Each fixture is a realistic-looking (but hand-authored)
 * snapshot of an org: metadata, top 5 repos by stars, and a language mix.
 * Keep these small and stable — the Tool bench's reproducibility depends on
 * these values never drifting mid-benchmark.
 */

export type GithubFixture = {
  name: string;
  description: string;
  public_repos: number;
  top_repos: { name: string; stars: number; language: string }[];
  language_mix: Record<string, number>; // percent, sums to ~100
};

export const GITHUB_FIXTURES: Record<string, GithubFixture> = {
  vercel: {
    name: "Vercel",
    description: "Frontend cloud for building and deploying web apps.",
    public_repos: 208,
    top_repos: [
      { name: "next.js", stars: 124000, language: "JavaScript" },
      { name: "ai", stars: 12400, language: "TypeScript" },
      { name: "swr", stars: 31000, language: "TypeScript" },
      { name: "turborepo", stars: 27200, language: "Rust" },
      { name: "satori", stars: 11500, language: "TypeScript" },
    ],
    language_mix: { TypeScript: 62, JavaScript: 22, Rust: 9, Go: 4, Other: 3 },
  },
  supabase: {
    name: "Supabase",
    description: "The open source Firebase alternative — Postgres-first.",
    public_repos: 180,
    top_repos: [
      { name: "supabase", stars: 76000, language: "TypeScript" },
      { name: "realtime", stars: 7300, language: "Elixir" },
      { name: "postgres", stars: 3600, language: "Shell" },
      { name: "gotrue", stars: 3400, language: "Go" },
      { name: "storage-api", stars: 1300, language: "TypeScript" },
    ],
    language_mix: { TypeScript: 58, Elixir: 14, Go: 12, Shell: 8, Other: 8 },
  },
  anthropics: {
    name: "Anthropic",
    description: "AI safety and research — the company behind Claude.",
    public_repos: 42,
    top_repos: [
      { name: "claude-code", stars: 7100, language: "TypeScript" },
      { name: "anthropic-sdk-python", stars: 4300, language: "Python" },
      { name: "anthropic-sdk-typescript", stars: 2400, language: "TypeScript" },
      { name: "prompt-eng-interactive-tutorial", stars: 14200, language: "Jupyter Notebook" },
      { name: "courses", stars: 12100, language: "Jupyter Notebook" },
    ],
    language_mix: { Python: 34, TypeScript: 28, "Jupyter Notebook": 26, Rust: 6, Other: 6 },
  },
  openai: {
    name: "OpenAI",
    description: "Research company building AGI; GPT, DALL-E, and Whisper.",
    public_repos: 210,
    top_repos: [
      { name: "gpt-2", stars: 22400, language: "Python" },
      { name: "openai-python", stars: 25600, language: "Python" },
      { name: "whisper", stars: 72000, language: "Python" },
      { name: "openai-cookbook", stars: 62000, language: "MDX" },
      { name: "tiktoken", stars: 12800, language: "Python" },
    ],
    language_mix: { Python: 72, TypeScript: 10, MDX: 8, Jupyter: 6, Other: 4 },
  },
  microsoft: {
    name: "Microsoft",
    description: "Global technology company — vscode, typescript, playwright.",
    public_repos: 6800,
    top_repos: [
      { name: "vscode", stars: 164000, language: "TypeScript" },
      { name: "TypeScript", stars: 102000, language: "TypeScript" },
      { name: "playwright", stars: 68000, language: "TypeScript" },
      { name: "PowerToys", stars: 117000, language: "C#" },
      { name: "terminal", stars: 96000, language: "C++" },
    ],
    language_mix: { TypeScript: 38, "C#": 20, "C++": 14, Python: 12, Other: 16 },
  },
};
