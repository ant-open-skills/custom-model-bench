/**
 * Deterministic GitHub fixtures used by the github_lookup tool when
 * MOCK_TOOLS=1. Each fixture is a realistic-looking (but hand-authored)
 * snapshot of an org: metadata, top 5 repos by stars, and a language mix.
 * Keep these small and stable — the benches' reproducibility depends on
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
      { name: "swr", stars: 31000, language: "TypeScript" },
      { name: "turborepo", stars: 27200, language: "Rust" },
      { name: "ai", stars: 12400, language: "TypeScript" },
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
      { name: "prompt-eng-interactive-tutorial", stars: 14200, language: "Jupyter Notebook" },
      { name: "courses", stars: 12100, language: "Jupyter Notebook" },
      { name: "anthropic-sdk-typescript", stars: 2400, language: "TypeScript" },
    ],
    language_mix: { Python: 34, TypeScript: 28, "Jupyter Notebook": 26, Rust: 6, Other: 6 },
  },
  openai: {
    name: "OpenAI",
    description: "Research company building AGI; GPT, DALL-E, and Whisper.",
    public_repos: 210,
    top_repos: [
      { name: "whisper", stars: 72000, language: "Python" },
      { name: "openai-cookbook", stars: 62000, language: "MDX" },
      { name: "openai-python", stars: 25600, language: "Python" },
      { name: "gpt-2", stars: 22400, language: "Python" },
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
      { name: "PowerToys", stars: 117000, language: "C#" },
      { name: "TypeScript", stars: 102000, language: "TypeScript" },
      { name: "terminal", stars: 96000, language: "C++" },
      { name: "playwright", stars: 68000, language: "TypeScript" },
    ],
    language_mix: { TypeScript: 38, "C#": 20, "C++": 14, Python: 12, Other: 16 },
  },
  stripe: {
    name: "Stripe",
    description: "Financial infrastructure for the internet — payment APIs and tooling.",
    public_repos: 190,
    top_repos: [
      { name: "stripe-node", stars: 4100, language: "TypeScript" },
      { name: "stripe-python", stars: 2100, language: "Python" },
      { name: "stripe-go", stars: 2300, language: "Go" },
      { name: "stripe-ios", stars: 2300, language: "Swift" },
      { name: "stripe-cli", stars: 3800, language: "Go" },
    ],
    language_mix: { Go: 24, Python: 20, TypeScript: 20, Ruby: 14, Swift: 10, Other: 12 },
  },
  linear: {
    name: "Linear",
    description: "Project and issue tracking for modern software teams.",
    public_repos: 48,
    top_repos: [
      { name: "linear", stars: 620, language: "TypeScript" },
      { name: "linear-sdk", stars: 430, language: "TypeScript" },
      { name: "codegen", stars: 210, language: "TypeScript" },
      { name: "linear-webhooks", stars: 180, language: "TypeScript" },
      { name: "linear-asks", stars: 95, language: "TypeScript" },
    ],
    language_mix: { TypeScript: 82, JavaScript: 8, Shell: 4, Other: 6 },
  },
  figma: {
    name: "Figma",
    description: "Collaborative interface design and prototyping tool.",
    public_repos: 65,
    top_repos: [
      { name: "plugin-samples", stars: 4700, language: "TypeScript" },
      { name: "plugin-typings", stars: 1200, language: "TypeScript" },
      { name: "code-connect", stars: 680, language: "TypeScript" },
      { name: "import-to-figma", stars: 420, language: "TypeScript" },
      { name: "rest-api-spec", stars: 290, language: "TypeScript" },
    ],
    language_mix: { TypeScript: 78, JavaScript: 10, Rust: 6, Other: 6 },
  },
  "makenotion": {
    name: "Notion",
    description: "All-in-one workspace for notes, docs, and collaboration.",
    public_repos: 32,
    top_repos: [
      { name: "notion-sdk-js", stars: 5400, language: "TypeScript" },
      { name: "notion-sdk-py", stars: 4800, language: "Python" },
      { name: "notion-ipfs", stars: 1100, language: "TypeScript" },
      { name: "notion-mcp-server", stars: 2600, language: "TypeScript" },
      { name: "notion-avatar", stars: 3900, language: "TypeScript" },
    ],
    language_mix: { TypeScript: 62, Python: 18, JavaScript: 10, Other: 10 },
  },
  shopify: {
    name: "Shopify",
    description: "Commerce platform for retailers and brands.",
    public_repos: 1300,
    top_repos: [
      { name: "polaris", stars: 5800, language: "TypeScript" },
      { name: "liquid", stars: 10700, language: "Ruby" },
      { name: "hydrogen", stars: 4100, language: "TypeScript" },
      { name: "cli", stars: 1900, language: "TypeScript" },
      { name: "theme-check", stars: 770, language: "Ruby" },
    ],
    language_mix: { Ruby: 40, TypeScript: 32, JavaScript: 12, Go: 6, Other: 10 },
  },
  databricks: {
    name: "Databricks",
    description: "Unified analytics platform for data and AI.",
    public_repos: 340,
    top_repos: [
      { name: "koalas", stars: 3400, language: "Python" },
      { name: "dbx", stars: 440, language: "Python" },
      { name: "terraform-provider-databricks", stars: 490, language: "Go" },
      { name: "mlflow", stars: 18900, language: "Python" },
      { name: "databricks-cli", stars: 420, language: "Python" },
    ],
    language_mix: { Python: 58, Scala: 18, Go: 10, TypeScript: 6, Other: 8 },
  },
  hashicorp: {
    name: "HashiCorp",
    description: "Multi-cloud infrastructure automation — Terraform, Vault, Nomad.",
    public_repos: 680,
    top_repos: [
      { name: "terraform", stars: 42000, language: "Go" },
      { name: "vault", stars: 31400, language: "Go" },
      { name: "consul", stars: 28700, language: "Go" },
      { name: "packer", stars: 15500, language: "Go" },
      { name: "nomad", stars: 15100, language: "Go" },
    ],
    language_mix: { Go: 86, Ruby: 4, Shell: 4, HCL: 3, Other: 3 },
  },
  cloudflare: {
    name: "Cloudflare",
    description: "Global network that makes applications fast and secure.",
    public_repos: 820,
    top_repos: [
      { name: "workers-sdk", stars: 3100, language: "TypeScript" },
      { name: "wrangler", stars: 2900, language: "TypeScript" },
      { name: "pingora", stars: 22400, language: "Rust" },
      { name: "cloudflared", stars: 9100, language: "Go" },
      { name: "flan", stars: 4300, language: "Python" },
    ],
    language_mix: { Rust: 30, TypeScript: 26, Go: 18, Python: 12, Other: 14 },
  },
};
