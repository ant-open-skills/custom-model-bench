/**
 * workflow-diagram.js — hand-composed SVG pipeline for the yc-qualifier scope.
 *
 * DESIGN NOTES
 *
 * This is a one-off editorial illustration, not a general-purpose diagram
 * renderer. Every coordinate, edge, and annotation is pinned deliberately,
 * the same way a print-magazine diagrammer would set a figure. If the backend
 * adds another agentic scope, write a new hand-composed viz for it — don't
 * try to generalize this one. "A placeholder generated diagram is worse than
 * a considered one."
 *
 * The source of truth for what's drawn here lives at:
 *   skills/custom-model-bench/examples/yc-qualifier/
 *     ├── system-prompt.md              Stage 1 agent instructions
 *     ├── system-prompt-stage2.md       Stage 2 drafter instructions
 *     ├── schema.ts                     ProspectProfile + EmailDraft Zod schemas
 *     └── judge-rubric.md               4-dim × 1-5 rubric
 *   skills/custom-model-bench/scripts/graders/
 *     ├── schema.ts                     structural validator
 *     ├── grounding_faithfulness.ts     5-type claim extractor + matcher
 *     └── trace_metrics.ts              turns, tool calls, fabrication_rate
 *
 * Aesthetic: follows the v3 "editorial almanac" style — serif labels,
 * hairline rules, numbered stations like a field guide. Deliberately NOT
 * a rough.js wobble diagram — that's boxes-and-arrows flowchart vernacular,
 * which undersells how specific this pipeline is.
 */

(() => {
  const UI = window.BENCH_UI;

  // Canvas dimensions. ViewBox is fixed; wrapper CSS handles responsive scale.
  const W = 1280;
  const H = 780;

  // Palette tokens — read from CSS vars at paint time so theme + accent
  // tweaks are live. Some paths need hex fallbacks when used in url()-referenced
  // filters, so we expose a small helper.
  const INK    = "var(--ink)";
  const INK2   = "var(--ink-2)";
  const INK3   = "var(--ink-3)";
  const INK4   = "var(--ink-4)";
  const RULE   = "var(--rule)";
  const RULE2  = "var(--rule-2)";
  const BGELEV = "var(--bg-elev)";
  const BGSUNK = "var(--bg-sunk)";
  const ACC    = "var(--accent)";
  const ACCSFT = "var(--accent-soft)";

  // ========= Typographic primitives =========

  const serif = "var(--serif)";
  const mono  = "var(--mono)";
  const sans  = "var(--sans)";

  function label(x, y, text, opts = {}) {
    const size = opts.size || 14;
    const weight = opts.weight || 500;
    const font = opts.font || serif;
    const fill = opts.fill || INK;
    const anchor = opts.anchor || "start";
    const style = opts.italic ? "italic" : "normal";
    return `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" font-weight="${weight}" font-style="${style}" fill="${fill}" text-anchor="${anchor}">${UI.esc(text)}</text>`;
  }

  function kicker(x, y, text, opts = {}) {
    return `<text x="${x}" y="${y}" font-family="${mono}" font-size="${opts.size || 10}" letter-spacing="0.14em" fill="${opts.fill || ACC}" text-anchor="${opts.anchor || "start"}" text-transform="uppercase">${UI.esc((text || "").toUpperCase())}</text>`;
  }

  function monoLine(x, y, text, opts = {}) {
    return `<text x="${x}" y="${y}" font-family="${mono}" font-size="${opts.size || 11}" fill="${opts.fill || INK3}" text-anchor="${opts.anchor || "start"}">${UI.esc(text)}</text>`;
  }

  // ========= Shape primitives =========

  function rule(x1, y1, x2, y2, opts = {}) {
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${opts.stroke || RULE}" stroke-width="${opts.width || 1}" ${opts.dash ? `stroke-dasharray="${opts.dash}"` : ""}/>`;
  }

  function box(x, y, w, h, opts = {}) {
    const r = opts.r || 4;
    const fill = opts.fill || "none";
    const stroke = opts.stroke || INK2;
    const sw = opts.sw || 1;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
  }

  /** Numbered station: a small circle + number, like a cartographic marker. */
  function station(cx, cy, n) {
    return `
      <g>
        <circle cx="${cx}" cy="${cy}" r="12" fill="${BGELEV}" stroke="${INK}" stroke-width="1.2"/>
        <text x="${cx}" y="${cy + 4}" font-family="${serif}" font-size="13" font-weight="600" fill="${INK}" text-anchor="middle">${n}</text>
      </g>
    `;
  }

  /** Arrow with a triangular head — used for pipeline flow. */
  function arrow(x1, y1, x2, y2, opts = {}) {
    const color = opts.stroke || INK2;
    const width = opts.width || 1.2;
    const dash  = opts.dash ? `stroke-dasharray="${opts.dash}"` : "";
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const ah = 9, aw = 4.5;
    const hx = x2 - Math.cos(ang) * 2;
    const hy = y2 - Math.sin(ang) * 2;
    const ax1 = hx - Math.cos(ang) * ah + Math.cos(ang + Math.PI / 2) * aw;
    const ay1 = hy - Math.sin(ang) * ah + Math.sin(ang + Math.PI / 2) * aw;
    const ax2 = hx - Math.cos(ang) * ah - Math.cos(ang + Math.PI / 2) * aw;
    const ay2 = hy - Math.sin(ang) * ah - Math.sin(ang + Math.PI / 2) * aw;
    return `
      <g>
        <line x1="${x1}" y1="${y1}" x2="${hx}" y2="${hy}" stroke="${color}" stroke-width="${width}" stroke-linecap="round" ${dash}/>
        <path d="M${ax1},${ay1} L${hx},${hy} L${ax2},${ay2}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
    `;
  }

  /** Curved arrow — used for the tool-call loop-back from Stage 1. */
  function curveArrow(x1, y1, x2, y2, cx, cy, opts = {}) {
    const color = opts.stroke || INK3;
    const width = opts.width || 1.2;
    const dash  = opts.dash ? `stroke-dasharray="${opts.dash}"` : "";
    // Arrowhead at end
    const ang = Math.atan2(y2 - cy, x2 - cx);
    const ah = 9, aw = 4.5;
    const hx = x2 - Math.cos(ang) * 2;
    const hy = y2 - Math.sin(ang) * 2;
    const ax1 = hx - Math.cos(ang) * ah + Math.cos(ang + Math.PI / 2) * aw;
    const ay1 = hy - Math.sin(ang) * ah + Math.sin(ang + Math.PI / 2) * aw;
    const ax2 = hx - Math.cos(ang) * ah - Math.cos(ang + Math.PI / 2) * aw;
    const ay2 = hy - Math.sin(ang) * ah - Math.sin(ang + Math.PI / 2) * aw;
    return `
      <g>
        <path d="M${x1},${y1} Q${cx},${cy} ${hx},${hy}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" ${dash}/>
        <path d="M${ax1},${ay1} L${hx},${hy} L${ax2},${ay2}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
    `;
  }

  // ========= Composed elements =========

  /**
   * An "agent card": a rounded box with agent name, tier/role, and an inner
   * body area with pre-positioned slots the caller fills with bullet lines.
   */
  function agentCard(x, y, w, h, { number, title, subtitle, bullets = [] }) {
    const parts = [];
    // Card body
    parts.push(box(x, y, w, h, { fill: BGELEV, stroke: INK, sw: 1.2, r: 6 }));
    // Header band
    parts.push(`<rect x="${x}" y="${y}" width="${w}" height="34" fill="${BGSUNK}" rx="6" ry="6"/>`);
    parts.push(`<rect x="${x}" y="${y + 28}" width="${w}" height="6" fill="${BGSUNK}"/>`); // Hide bottom-corner rounding
    parts.push(rule(x, y + 34, x + w, y + 34, { stroke: RULE }));
    // Number on left, title + subtitle on right
    parts.push(station(x + 20, y + 17, number));
    parts.push(label(x + 40, y + 15, title, { size: 13, weight: 600 }));
    parts.push(monoLine(x + 40, y + 29, subtitle, { size: 10, fill: INK3 }));
    // Bullets
    bullets.forEach((b, i) => {
      parts.push(monoLine(x + 16, y + 56 + i * 18, b, { size: 10.5, fill: INK2 }));
    });
    return parts.join("");
  }

  /** A "document artifact" card — for ProspectProfile and EmailDraft. */
  function documentCard(x, y, w, h, { kicker: k, title, fields = [] }) {
    const parts = [];
    parts.push(box(x, y, w, h, { fill: BGELEV, stroke: INK, sw: 1, r: 4 }));
    // Folded corner decoration (document glyph)
    const cx = x + w, cy = y;
    parts.push(`<path d="M${cx - 14},${cy} L${cx},${cy + 14} L${cx - 14},${cy + 14} Z" fill="${BGSUNK}" stroke="${INK}" stroke-width="1"/>`);
    // Kicker + title
    parts.push(kicker(x + 14, y + 22, k, { size: 10, fill: INK3 }));
    parts.push(label(x + 14, y + 42, title, { size: 14, weight: 600, font: serif }));
    parts.push(rule(x + 14, y + 52, x + w - 14, y + 52, { stroke: RULE2, dash: "3 3" }));
    // Field list as a two-column monospace layout.
    fields.forEach((f, i) => {
      const row = Math.floor(i / 2);
      const col = i % 2;
      const fx = x + 14 + col * ((w - 28) / 2);
      const fy = y + 70 + row * 16;
      parts.push(monoLine(fx, fy, f, { size: 10, fill: INK2 }));
    });
    return parts.join("");
  }

  /** Tool triplet — three small boxes in a column, with a "fallback" arrow
   *  between linkedin_enrich and web_fetch. */
  function toolStack(x, y) {
    const parts = [];
    const tw = 192, th = 34, gap = 10;
    const tools = [
      { name: "github_lookup",    desc: "repos · languages · org meta" },
      { name: "linkedin_enrich",  desc: "contact · role · slug (may 502)" },
      { name: "web_fetch",        desc: "generic GET · LinkedIn fallback" },
    ];
    tools.forEach((t, i) => {
      const ty = y + i * (th + gap);
      parts.push(box(x, ty, tw, th, { fill: BGSUNK, stroke: INK3, sw: 1, r: 3 }));
      parts.push(`<text x="${x + 10}" y="${ty + 14}" font-family="${mono}" font-size="11" font-weight="500" fill="${INK}">${UI.esc(t.name)}</text>`);
      parts.push(`<text x="${x + 10}" y="${ty + 27}" font-family="${mono}" font-size="9.5" fill="${INK3}">${UI.esc(t.desc)}</text>`);
      // Left tick mark
      parts.push(rule(x, ty + th / 2, x - 6, ty + th / 2, { stroke: INK3 }));
    });
    // Fallback arrow from linkedin_enrich down-right to web_fetch.
    const ax = x + tw + 6;
    const y2 = y + (th + gap) * 1 + th / 2;
    const y3 = y + (th + gap) * 2 + th / 2;
    parts.push(curveArrow(ax, y2, ax, y3, ax + 18, (y2 + y3) / 2, { stroke: INK3, dash: "3 2" }));
    parts.push(monoLine(ax + 22, (y2 + y3) / 2 + 3, "on 502 / 429", { size: 9, fill: INK3 }));
    return parts.join("");
  }

  /** Judge runs block — 3 vertical strips, one per Opus 4.7 pass, each with
   *  four dimension ticks. */
  function judgeStack(x, y, w, h) {
    const parts = [];
    parts.push(box(x, y, w, h, { fill: BGELEV, stroke: INK, sw: 1, r: 4 }));
    parts.push(kicker(x + 14, y + 20, "RUBRIC JUDGE", { size: 10, fill: INK3 }));
    parts.push(label(x + 14, y + 40, "Opus 4.7 · 3 runs", { size: 13, weight: 600 }));
    parts.push(rule(x + 14, y + 50, x + w - 14, y + 50, { stroke: RULE2, dash: "3 3" }));

    // Three run columns
    const runs = 3;
    const dims = ["grounding", "specificity", "relevance", "CTA"];
    const colW = (w - 40) / runs;
    for (let r = 0; r < runs; r++) {
      const cx = x + 20 + r * colW + colW / 2;
      parts.push(monoLine(cx, y + 68, `run ${r + 1}`, { size: 9.5, fill: INK3, anchor: "middle" }));
      dims.forEach((d, i) => {
        const dy = y + 84 + i * 16;
        // tick + label
        parts.push(`<circle cx="${cx - 30}" cy="${dy - 3}" r="3" fill="${ACC}"/>`);
        parts.push(monoLine(cx - 22, dy, d, { size: 9.5, fill: INK2 }));
      });
    }
    // variance line at bottom
    parts.push(rule(x + 14, y + h - 36, x + w - 14, y + h - 36, { stroke: RULE2, dash: "3 3" }));
    parts.push(monoLine(x + 14, y + h - 18, "report: mean ± σ per dimension + overall", { size: 10, fill: INK2 }));
    return parts.join("");
  }

  /** Grounding grader block — claim types + matcher. */
  function groundingBlock(x, y, w, h) {
    const parts = [];
    parts.push(box(x, y, w, h, { fill: BGELEV, stroke: INK, sw: 1, r: 4 }));
    parts.push(kicker(x + 14, y + 20, "GROUNDING GRADER", { size: 10, fill: INK3 }));
    parts.push(label(x + 14, y + 40, "2-stage fabrication detector", { size: 13, weight: 600 }));
    parts.push(rule(x + 14, y + 50, x + w - 14, y + 50, { stroke: RULE2, dash: "3 3" }));

    const types = [
      ["named_entity", "company · product · person"],
      ["number",       "headcount · $ · year · count"],
      ["url",          "domain · path"],
      ["tech",         "lang · framework · infra"],
      ["event",        "round · launch · acquisition"],
    ];
    types.forEach((t, i) => {
      const ty = y + 70 + i * 16;
      parts.push(monoLine(x + 14, ty, t[0], { size: 10, fill: INK, font: mono }));
      parts.push(monoLine(x + 120, ty, t[1], { size: 10, fill: INK3 }));
    });
    parts.push(rule(x + 14, y + h - 36, x + w - 14, y + h - 36, { stroke: RULE2, dash: "3 3" }));
    parts.push(monoLine(x + 14, y + h - 18, "match → fabrication_rate ∈ [0,1]", { size: 10, fill: INK2 }));
    return parts.join("");
  }

  // ========= Layout =========
  //
  // Three vertical bands:
  //   Band A — Stage 1 (researcher + tools)          y: 120–330
  //   Band B — Divider + ProspectProfile artifact    y: 340–430
  //   Band C — Stage 2 (drafter + graders)           y: 440–720

  function composeSvg() {
    const parts = [];

    // ===== Header strip (figure caption style) =====
    parts.push(kicker(40, 40, "Pipeline · figure 1", { size: 11 }));
    parts.push(label(40, 74, "Prospect qualifier — what every candidate is asked to execute", { size: 26, weight: 500, font: serif }));
    parts.push(label(40, 100, "Two agent stages, three tools, two schemas, two graders, three judge runs — one row of the dataset travels left to right across the page.", { size: 13, fill: INK2, font: serif, italic: true }));
    parts.push(rule(40, 110, W - 40, 110, { stroke: RULE }));

    // ===== Top axis labels =====
    parts.push(kicker(40,   130, "INPUT",   { size: 9, fill: INK4 }));
    parts.push(kicker(320,  130, "STAGE 1 · RESEARCH",   { size: 9, fill: INK4 }));
    parts.push(kicker(40,   390, "ARTIFACT", { size: 9, fill: INK4 }));
    parts.push(kicker(440,  390, "STAGE 2 · DRAFT", { size: 9, fill: INK4 }));
    parts.push(kicker(776 + 36, 390, "ARTIFACT", { size: 9, fill: INK4 }));
    parts.push(kicker(40,   611, "GRADERS", { size: 9, fill: INK4 }));

    // ===== Input card (task row) =====
    parts.push(box(40, 150, 240, 170, { fill: BGSUNK, stroke: INK3, sw: 1, r: 4 }));
    parts.push(station(62, 172, 1));
    parts.push(label(82, 170, "Task row", { size: 13, weight: 600 }));
    parts.push(monoLine(82, 184, "dataset.jsonl · yc-001", { size: 10, fill: INK3 }));
    parts.push(rule(54, 200, 266, 200, { stroke: RULE2, dash: "3 3" }));
    [
      `{`,
      `  "id": "yc-001",`,
      `  "founder_product":`,
      `    "AgentEval, a TS framework`,
      `    for benchmarking LLM agents",`,
      `  "target_company":`,
      `    "Anthropic"`,
      `}`,
    ].forEach((line, i) => {
      parts.push(monoLine(54, 220 + i * 12, line, { size: 10, fill: INK2 }));
    });

    // ===== Stage 1 researcher agent =====
    const s1x = 320, s1y = 150, s1w = 336, s1h = 170;
    parts.push(agentCard(s1x, s1y, s1w, s1h, {
      number: 2,
      title: "Researcher agent",
      subtitle: "runtime: vercel | cagent-sdk  ·  maxTurns: 10",
      bullets: [
        "1. github_lookup → org + top repos + lang mix",
        "2. identify 2–3 technical contacts",
        "3. linkedin_enrich → fallback web_fetch if 502",
        "4. estimate tech_stack_overlap_pct",
        "5. score fit 0–100  ·  write rationale",
      ],
    }));

    // Tool stack (to the right of Stage 1, but visually inside its band)
    const toolX = s1x + s1w + 24;
    const toolY = s1y + 10;
    parts.push(toolStack(toolX, toolY));

    // Flow arrows: input → s1
    parts.push(arrow(280, 235, s1x - 2, 235));

    // s1 ⇄ tools loop (shows request / response round trip)
    parts.push(curveArrow(s1x + s1w + 2, 180, toolX - 6, toolY + 17, s1x + s1w + 18, 165, { stroke: INK3 }));
    parts.push(curveArrow(toolX - 6, toolY + 17 + (34 + 10) * 2, s1x + s1w + 2, 290, s1x + s1w + 18, 300, { stroke: INK3, dash: "3 3" }));
    parts.push(monoLine(s1x + s1w + 4, 159, "request", { size: 9, fill: INK3 }));
    parts.push(monoLine(s1x + s1w + 4, 322, "tool result", { size: 9, fill: INK3 }));

    // ===== Stage boundary divider =====
    const divY = 355;
    parts.push(rule(40, divY, W - 40, divY, { stroke: RULE, dash: "5 4" }));
    parts.push(`<rect x="${W/2 - 120}" y="${divY - 11}" width="240" height="22" fill="${BGELEV}"/>`);
    parts.push(label(W / 2, divY + 4, "schema-validated handoff", { size: 11, fill: INK3, anchor: "middle", italic: true, font: serif }));

    // ===== ProspectProfile artifact (centered, between stages) =====
    const ppx = 40, ppy = 400, ppw = 340, pph = 190;
    parts.push(documentCard(ppx, ppy, ppw, pph, {
      kicker: "Artifact · Stage 1 output",
      title: "ProspectProfile",
      fields: [
        "target_company : str",   "github_org : str|null",
        "tech_stack : str[]",     "top_repos : Repo[≤5]",
        "contacts : Contact[≤6]", "tech_stack_overlap_pct",
        "fit_score : 0–100",      "rationale : str",
      ],
    }));
    parts.push(station(ppx + ppw - 24, ppy + 17, 3));

    // Grader callout — schema validator sits on the artifact
    parts.push(rule(ppx + 12, ppy + pph + 10, ppx + ppw - 12, ppy + pph + 10, { stroke: RULE2 }));
    parts.push(monoLine(ppx + 14, ppy + pph + 26, "graders/schema.ts · extractProfile()", { size: 10, fill: INK3 }));
    parts.push(monoLine(ppx + 14, ppy + pph + 40, "walks balanced { } · Zod.safeParse()", { size: 10, fill: INK3 }));

    // ===== Stage 2 drafter agent =====
    const s2x = 440, s2y = 400, s2w = 336, s2h = 170;
    parts.push(agentCard(s2x, s2y, s2w, s2h, {
      number: 4,
      title: "Drafter agent",
      subtitle: "single-turn  ·  system-prompt-stage2.md",
      bullets: [
        "1. pick one contact from ProspectProfile",
        "2. draft subject ≤9 words",
        "3. draft body 80–140 words",
        "4. list grounding_references (dotted paths)",
        "5. empty draft on dead-end profiles",
      ],
    }));

    // ===== EmailDraft artifact =====
    const edx = s2x + s2w + 36, edy = 400, edw = 280, edh = 190;
    parts.push(documentCard(edx, edy, edw, edh, {
      kicker: "Artifact · Stage 2 output",
      title: "EmailDraft",
      fields: [
        "recipient.name : str",            "recipient.role : str",
        "recipient.linkedin_slug : str",   "subject : str  (≤9 w)",
        "body : str  (80–140 w)",          "grounding_references : str[]",
      ],
    }));
    parts.push(station(edx + edw - 24, edy + 17, 5));

    // ===== Graders row (below the band) =====
    const grY = 620;
    // Grounding
    parts.push(groundingBlock(40, grY, 380, 140));
    // Judge
    parts.push(judgeStack(460, grY, 500, 140));

    // Rubric / graders kicker on the right
    const rbx = 1000, rby = grY;
    parts.push(box(rbx, rby, 240, 140, { fill: BGELEV, stroke: INK, sw: 1, r: 4 }));
    parts.push(kicker(rbx + 14, rby + 20, "CODE GRADERS", { size: 10, fill: INK3 }));
    parts.push(label(rbx + 14, rby + 40, "Deterministic metrics", { size: 13, weight: 600 }));
    parts.push(rule(rbx + 14, rby + 50, rbx + 240 - 14, rby + 50, { stroke: RULE2, dash: "3 3" }));
    [
      "schema_ok · 0 | 1",
      "task_completion · 0–1",
      "recovery_rate · 0–1",
      "fabrication_rate · 0–1",
      "p50 / p95 latency · ms",
      "cost_per_task · usd",
    ].forEach((line, i) => {
      parts.push(monoLine(rbx + 14, rby + 68 + i * 12, line, { size: 10, fill: INK2 }));
    });

    // ===== Flow arrows across the diagram =====

    // s1 → ProspectProfile artifact (straight down from researcher, then curve left)
    const s1MidX = s1x + s1w / 2;
    parts.push(rule(s1MidX, s1y + s1h + 2, s1MidX, 380, { stroke: INK2, dash: "3 3" }));
    parts.push(arrow(s1MidX, 380, ppx + ppw / 2 + 2, 400 - 2, { stroke: INK2, dash: "3 3" }));
    // ProspectProfile → drafter
    parts.push(arrow(ppx + ppw + 8, ppy + pph / 2, s2x - 2, s2y + s2h / 2));
    // Drafter → EmailDraft
    parts.push(arrow(s2x + s2w + 8, edy + edh / 2, edx - 2, edy + edh / 2));

    // EmailDraft → graders row (split into three)
    const edmx = edx + edw / 2;
    const edmy = edy + edh + 4;
    parts.push(rule(edmx, edmy, edmx, grY - 26, { stroke: INK3, dash: "3 2" }));
    parts.push(rule(200, grY - 26, 1120, grY - 26, { stroke: INK3, dash: "3 2" }));
    parts.push(arrow(200, grY - 26, 200, grY - 2, { stroke: INK3, dash: "3 2" }));   // to grounding
    parts.push(arrow(700, grY - 26, 700, grY - 2, { stroke: INK3, dash: "3 2" }));   // to judge
    parts.push(arrow(1120, grY - 26, 1120, grY - 2, { stroke: INK3, dash: "3 2" })); // to code graders

    // Footer caption / byline
    parts.push(rule(40, H - 26, W - 40, H - 26, { stroke: RULE2 }));
    parts.push(monoLine(40, H - 10, "source: skills/custom-model-bench/examples/yc-qualifier/  ·  graders: scripts/graders/  ·  judge rubric: judge-rubric.md", { size: 9.5, fill: INK4 }));
    parts.push(monoLine(W - 40, H - 10, "fig. 1 — prospect qualifier pipeline", { size: 9.5, fill: INK4, anchor: "end", italic: false }));

    return parts.join("\n");
  }

  function render(scopeId) {
    // This file is deliberately scope-specific. The caller asks for a scope
    // by id; we only know how to draw "yc-qualifier" right now. Any other
    // scope returns empty so the caller can fall back gracefully.
    if (scopeId !== "yc-qualifier") return "";
    return `
      <svg class="wf2-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet"
           role="img" aria-label="Prospect qualifier pipeline">
        ${composeSvg()}
      </svg>
    `;
  }

  // Public API
  window.__WF2 = { render };
})();
