/**
 * Deterministic web_fetch fixtures used when MOCK_TOOLS=1. Keyed on the
 * URL passed to the tool (case-insensitive, stripped of protocol and
 * trailing slashes). Kept small: enough to cover the Tool bench fallback
 * paths (e.g. when the agent pivots from linkedin_enrich to web_fetch
 * because Proxycurl isn't keyed).
 */

export type WebFixture = { title: string; text: string };

export const WEB_FIXTURES: Record<string, WebFixture> = {
  "linkedin.com/in/guillermo-rauch": {
    title: "Guillermo Rauch — LinkedIn",
    text:
      "Guillermo Rauch. CEO at Vercel. San Francisco, California. " +
      "Creator of Next.js, the React framework for production. " +
      "Previously created Socket.IO and Mongoose. Based in San Francisco.",
  },
  "linkedin.com/in/paul-copplestone": {
    title: "Paul Copplestone — LinkedIn",
    text:
      "Paul Copplestone. Co-founder & CEO at Supabase. Singapore. " +
      "Supabase is an open-source Firebase alternative — Postgres-first. " +
      "Previously engineering at Xfund; founder at Anchor.",
  },
  "linkedin.com/in/dario-amodei": {
    title: "Dario Amodei — LinkedIn",
    text:
      "Dario Amodei. CEO at Anthropic. San Francisco Bay Area. " +
      "Co-founder and CEO of Anthropic, an AI safety research company. " +
      "Former VP of Research at OpenAI.",
  },
  "example.com": {
    title: "Example Domain",
    text:
      "This domain is for use in illustrative examples in documents. " +
      "You may use this domain in literature without prior coordination or asking for permission.",
  },
};
