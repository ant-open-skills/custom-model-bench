/**
 * Deterministic LinkedIn fixtures used by the linkedin_enrich tool when
 * MOCK_TOOLS=1 (or when Proxycurl is unavailable and we want the bench to
 * still produce meaningful responses). Covers one key contact per
 * company in the YC qualifier dataset.
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
  "sam-altman": {
    full_name: "Sam Altman",
    headline: "CEO at OpenAI",
    location: "San Francisco, California",
    company: "OpenAI",
    company_title: "CEO",
    summary:
      "CEO of OpenAI. Previously president of Y Combinator. Building AGI for humanity's benefit.",
  },
  "satyanadella": {
    full_name: "Satya Nadella",
    headline: "Chairman and CEO at Microsoft",
    location: "Redmond, Washington",
    company: "Microsoft",
    company_title: "Chairman & CEO",
    summary:
      "Leading Microsoft's transformation to a cloud-first, AI-first company. Author of Hit Refresh.",
  },
  "patrickc": {
    full_name: "Patrick Collison",
    headline: "Co-founder & CEO at Stripe",
    location: "San Francisco, California",
    company: "Stripe",
    company_title: "Co-founder & CEO",
    summary:
      "Building economic infrastructure for the internet. Co-founder of Stripe with brother John.",
  },
  "karrisaarinen": {
    full_name: "Karri Saarinen",
    headline: "Co-founder & CEO at Linear",
    location: "San Francisco Bay Area",
    company: "Linear",
    company_title: "Co-founder & CEO",
    summary:
      "Designing the tool for high-performance product teams. Previously design lead at Airbnb, design at Coinbase.",
  },
  "dylanfield": {
    full_name: "Dylan Field",
    headline: "Co-founder & CEO at Figma",
    location: "San Francisco Bay Area",
    company: "Figma",
    company_title: "Co-founder & CEO",
    summary:
      "Building the tool that makes design accessible to everyone. Thiel fellow; co-founded Figma in 2012.",
  },
  "ivanhzhao": {
    full_name: "Ivan Zhao",
    headline: "Co-founder & CEO at Notion",
    location: "San Francisco, California",
    company: "Notion",
    company_title: "Co-founder & CEO",
    summary:
      "Building a tool that empowers everyone to organize their work and life. Bet on blocks as the universal primitive.",
  },
  "tobi": {
    full_name: "Tobias Lütke",
    headline: "Founder & CEO at Shopify",
    location: "Ottawa, Canada",
    company: "Shopify",
    company_title: "Founder & CEO",
    summary:
      "Founder and CEO of Shopify. Rails core alum. Building commerce infrastructure for merchants worldwide.",
  },
  "alighodsi": {
    full_name: "Ali Ghodsi",
    headline: "Co-founder & CEO at Databricks",
    location: "San Francisco Bay Area",
    company: "Databricks",
    company_title: "Co-founder & CEO",
    summary:
      "Co-founder and CEO of Databricks. Co-creator of Apache Spark. Former faculty at UC Berkeley.",
  },
  "mitchellh": {
    full_name: "Mitchell Hashimoto",
    headline: "Co-founder at HashiCorp",
    location: "Oakland, California",
    company: "HashiCorp",
    company_title: "Co-founder",
    summary:
      "Co-founder of HashiCorp — Vagrant, Terraform, Vault, Nomad, Consul. Go enthusiast.",
  },
  "eastdakota": {
    full_name: "Matthew Prince",
    headline: "Co-founder & CEO at Cloudflare",
    location: "San Francisco, California",
    company: "Cloudflare",
    company_title: "Co-founder & CEO",
    summary:
      "Co-founder and CEO of Cloudflare. Building a better internet. Formerly practicing attorney.",
  },
};
