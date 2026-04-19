/**
 * Deterministic LinkedIn fixtures used by the linkedin_enrich tool when
 * MOCK_TOOLS=1 (or when Proxycurl is unavailable and we want the bench to
 * still produce meaningful responses). Covers a small, stable set of
 * well-known profiles.
 */

export type LinkedInFixture = {
  full_name: string;
  headline: string;
  location: string;
  company: string;
  company_title: string;
  summary: string;
};

export const LINKEDIN_FIXTURES: Record<string, LinkedInFixture> = {
  "guillermo-rauch": {
    full_name: "Guillermo Rauch",
    headline: "CEO at Vercel",
    location: "San Francisco, California",
    company: "Vercel",
    company_title: "CEO",
    summary:
      "Founder and CEO of Vercel. Creator of Next.js, Socket.IO, Mongoose. Argentine engineer now in SF.",
  },
  "paul-copplestone": {
    full_name: "Paul Copplestone",
    headline: "Co-founder & CEO at Supabase",
    location: "Singapore",
    company: "Supabase",
    company_title: "Co-founder & CEO",
    summary:
      "Building an open-source Firebase alternative on top of Postgres. Previously engineering at Xfund, founder at Anchor.",
  },
  "dario-amodei": {
    full_name: "Dario Amodei",
    headline: "CEO at Anthropic",
    location: "San Francisco Bay Area",
    company: "Anthropic",
    company_title: "CEO",
    summary:
      "Co-founder and CEO of Anthropic, an AI safety research company. Former VP of Research at OpenAI.",
  },
};
