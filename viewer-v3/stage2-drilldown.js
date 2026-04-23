/**
 * Stage 2 drilldown + workflow diagram addon for the Trace Diff screen.
 *
 * When the active scope is agentic (kind:"agentic") AND has declared a
 * workflow shape, we render two extra sections beneath the existing Stage 1
 * trace grid:
 *
 *   1. Workflow diagram — a hand-drawn (Rough.js) pipeline of the scope's
 *      declared stages. Static per scope. Rendered once per scope change.
 *
 *   2. Stage 2 panel — per-candidate, for the currently-selected row:
 *        • email draft (subject + recipient + body)
 *        • grounding faithfulness breakdown (per-claim ✓/✗ + evidence)
 *        • judge runs (3 runs × 4 dimensions + overall mean/std)
 *
 * This module monkey-patches window.__V3_SCREENS.traceDiff.render so it
 * keeps working even if the base file changes. The patch:
 *   - runs the original render()
 *   - if the active scope is agentic, appends the diagram + stage2 sections
 *     to the returned HTML just before the closing </main>
 *   - mount() attaches drilldown tab-switching and re-triggers the diagram
 *     draw (which depends on DOM size).
 */

(() => {
  const B  = window.__BENCH;
  const UI = window.BENCH_UI;
  const TD = window.__V3_SCREENS && window.__V3_SCREENS.traceDiff;
  if (!TD) {
    console.warn("[stage2] traceDiff screen not registered yet");
    return;
  }

  // Declare a pipeline for the Prospect Qualifier scope. The backend will
  // eventually put this on the scope itself; we pin it client-side until then.
  const WORKFLOWS = {
    "yc-qualifier": {
      title: "Prospect qualifier · 2-stage pipeline",
      nodes: [
        { id: "in",     kind: "input",   label: "Task row",          sub: "company_name · seed_url" },
        { id: "s1",     kind: "agent",   label: "Stage 1 · researcher", sub: "tools: web_fetch, github, hn_search" },
        { id: "tools",  kind: "tool",    label: "Tool calls",        sub: "≤ 12 steps · 8k tok cap" },
        { id: "schema", kind: "schema",  label: "ProspectProfile",   sub: "strict schema · 11 fields" },
        { id: "s2",     kind: "agent",   label: "Stage 2 · drafter", sub: "email from profile" },
        { id: "ground", kind: "check",   label: "Grounding check",   sub: "per-claim evidence match" },
        { id: "judge",  kind: "check",   label: "3-run judge",       sub: "tone · spec · ground · CTA" },
        { id: "out",    kind: "output",  label: "Scored email",      sub: "overall_mean · std" },
      ],
      edges: [
        ["in", "s1"], ["s1", "tools"], ["tools", "s1"],
        ["s1", "schema"], ["schema", "s2"],
        ["s2", "ground"], ["s2", "judge"],
        ["ground", "out"], ["judge", "out"],
      ],
    },
  };

  // ===== Workflow diagram (Rough.js) =====================================

  // We avoid loading external Rough.js; instead we do our own hand-drawn SVG:
  // straight segments become wobbly polylines, rectangles become "double-stroke
  // jitter" paths. This keeps the page self-contained (no network).
  function jitter(seed) {
    let t = seed | 0;
    return () => {
      t = (Math.imul(t ^ (t >>> 15), 0xbf58476d) ^ 0x9e3779b9) >>> 0;
      t = Math.imul(t ^ (t >>> 13), 0x94d049bb) >>> 0;
      t ^= t >>> 17;
      return ((t >>> 0) / 4294967296) - 0.5;  // [-0.5, 0.5)
    };
  }

  function wobblyRect(x, y, w, h, r, rng, strokes = 2) {
    // Two stacked rounded paths with offset, to fake rough.js.
    const paths = [];
    for (let s = 0; s < strokes; s++) {
      const jx = () => rng() * 2.2;
      const jy = () => rng() * 1.5;
      const x0 = x + jx(),  y0 = y + jy();
      const x1 = x + w + jx(), y1 = y + h + jy();
      const d = `
        M${x0 + r},${y0}
        L${x1 - r},${y0 + jy()*0.4}
        Q${x1 + jx()*0.6},${y0 + jy()*0.2} ${x1 + jx()*0.2},${y0 + r}
        L${x1 + jx()*0.3},${y1 - r}
        Q${x1 + jx()*0.1},${y1 + jy()*0.4} ${x1 - r},${y1 + jy()*0.2}
        L${x0 + r},${y1 + jy()*0.3}
        Q${x0 + jx()*0.4},${y1 + jy()*0.1} ${x0 + jx()*0.2},${y1 - r}
        L${x0 + jx()*0.3},${y0 + r}
        Q${x0 + jx()*0.1},${y0 + jy()*0.4} ${x0 + r},${y0}
        Z
      `;
      paths.push(d);
    }
    return paths;
  }

  function wobblyArrow(x1, y1, x2, y2, rng) {
    // Curve with midpoint jitter; a small arrowhead at end.
    const mx = (x1 + x2) / 2 + rng() * 4;
    const my = (y1 + y2) / 2 + rng() * 8;
    const d1 = `M${x1},${y1} Q${mx},${my} ${x2},${y2}`;
    // arrowhead
    const ang = Math.atan2(y2 - my, x2 - mx);
    const ah = 7, aw = 4;
    const ax1 = x2 - Math.cos(ang) * ah + Math.cos(ang + Math.PI / 2) * aw;
    const ay1 = y2 - Math.sin(ang) * ah + Math.sin(ang + Math.PI / 2) * aw;
    const ax2 = x2 - Math.cos(ang) * ah - Math.cos(ang + Math.PI / 2) * aw;
    const ay2 = y2 - Math.sin(ang) * ah - Math.sin(ang + Math.PI / 2) * aw;
    const head = `M${ax1},${ay1} L${x2},${y2} L${ax2},${ay2}`;
    return [d1, head];
  }

  // Greedy word wrap into at-most-2 lines. If more words than fit, truncate with ellipsis.
  function wrapText(str, maxChars) {
    if (!str) return [""];
    const words = str.split(/\s+/);
    const lines = [];
    let cur = "";
    for (const w of words) {
      if ((cur + " " + w).trim().length <= maxChars) {
        cur = (cur + " " + w).trim();
      } else {
        if (cur) lines.push(cur);
        cur = w;
        if (lines.length >= 1) break; // max 2 lines
      }
    }
    if (cur) lines.push(cur);
    if (lines.length === 2) {
      // Any leftover words? check
      const joined = lines.join(" ");
      if (joined.length < str.length) {
        // Add ellipsis to the last line
        const last = lines[1];
        const room = maxChars - 1;
        lines[1] = last.length > room ? last.slice(0, room - 1) + "…" : last + "…";
      }
    }
    return lines.slice(0, 2);
  }

  // Layout: columns left→right, nodes vertically centered per column.
  function layoutWorkflow(wf, width) {
    // Columns — force a specific pipeline reading order.
    const cols = [
      ["in"],
      ["s1", "tools"],   // s1 main row, tools underneath
      ["schema"],
      ["s2"],
      ["ground", "judge"],
      ["out"],
    ];
    const colW = width / cols.length;
    const nodeW = Math.min(200, colW - 22);
    const nodeH = 88;
    const rowGap = 44;
    // Height determined by max column stack
    const maxStack = Math.max(...cols.map(c => c.length));
    const height = 80 + maxStack * (nodeH + rowGap);
    const pos = {};
    cols.forEach((col, ci) => {
      const cx = ci * colW + colW / 2;
      const stackH = col.length * nodeH + (col.length - 1) * rowGap;
      const top = height / 2 - stackH / 2;
      col.forEach((id, ri) => {
        pos[id] = {
          x: cx - nodeW / 2,
          y: top + ri * (nodeH + rowGap),
          w: nodeW,
          h: nodeH,
          cx,
          cy: top + ri * (nodeH + rowGap) + nodeH / 2,
        };
      });
    });
    return { pos, height, nodeW, nodeH };
  }

  function renderWorkflow(wf, containerWidth) {
    const w = Math.max(720, containerWidth);
    const { pos, height } = layoutWorkflow(wf, w);
    const rng = jitter(0xc0ffee + wf.nodes.length * 37);

    // Nodes
    const nodeSvg = wf.nodes.map(n => {
      const p = pos[n.id];
      const paths = wobblyRect(p.x, p.y, p.w, p.h, 10, rng, 2);
      // Wrap sub text to 2 lines of ~24 chars each.
      const subLines = wrapText(n.sub, Math.max(18, Math.floor(p.w / 8)));
      const label = `<text x="${p.x + p.w / 2}" y="${p.y + 26}" class="wf-label" text-anchor="middle">${UI.esc(n.label)}</text>`;
      const sub   = subLines.map((ln, i) =>
        `<text x="${p.x + p.w / 2}" y="${p.y + 46 + i * 12}" class="wf-sub" text-anchor="middle">${UI.esc(ln)}</text>`
      ).join("");
      const kind  = `<text x="${p.x + 10}" y="${p.y + p.h - 8}" class="wf-kind">${UI.esc(n.kind)}</text>`;
      return `
        <g class="wf-node wf-node-${n.kind}">
          <title>${UI.esc(n.label)} — ${UI.esc(n.sub)}</title>
          ${paths.map(d => `<path d="${d}" class="wf-fill"/>`).join("")}
          ${paths.map(d => `<path d="${d}" class="wf-stroke"/>`).join("")}
          ${label}${sub}${kind}
        </g>
      `;
    }).join("");

    // Edges — from right edge of src to left edge of dst (or vertical loop for tools)
    const edgeSvg = wf.edges.map(([a, b]) => {
      const pa = pos[a], pb = pos[b];
      if (!pa || !pb) return "";
      // tools ↔ s1: vertical loop
      if ((a === "s1" && b === "tools") || (a === "tools" && b === "s1")) {
        const [up, down] = a === "s1" ? [pa, pb] : [pb, pa];
        const x1 = up.cx + (a === "s1" ? 18 : -18);
        const y1 = up.y + up.h;
        const x2 = down.cx + (a === "s1" ? 18 : -18);
        const y2 = down.y;
        const [d1, head] = wobblyArrow(x1, y1, x2, y2, rng);
        return `<g class="wf-edge"><path d="${d1}" class="wf-edge-line"/><path d="${head}" class="wf-edge-head"/></g>`;
      }
      const x1 = pa.x + pa.w;
      const y1 = pa.cy;
      const x2 = pb.x;
      const y2 = pb.cy;
      const [d1, head] = wobblyArrow(x1 + 2, y1, x2 - 6, y2, rng);
      return `<g class="wf-edge"><path d="${d1}" class="wf-edge-line"/><path d="${head}" class="wf-edge-head"/></g>`;
    }).join("");

    return `
      <svg class="wf-svg" viewBox="0 0 ${w} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${UI.esc(wf.title)}">
        ${edgeSvg}
        ${nodeSvg}
      </svg>
    `;
  }

  function workflowSection(scope) {
    // Prefer the hand-composed workflow-diagram.js output for known scopes;
    // fall back to the old auto-laid-out diagram for any new agentic scope
    // until a bespoke figure is drawn for it.
    const wf2 = window.__WF2 && window.__WF2.render(scope.id);
    if (wf2) {
      return `
        <section class="wf-section wf-section-v2" id="wf-section">
          <div class="wf-canvas" id="wf-canvas">${wf2}</div>
        </section>
      `;
    }
    const wf = WORKFLOWS[scope.id];
    if (!wf) return "";
    return `
      <section class="wf-section" id="wf-section">
        <div class="wf-head">
          <div class="wf-kicker">Pipeline shape</div>
          <div class="wf-title">${UI.esc(wf.title)}</div>
          <div class="wf-blurb">
            Static shape. This is what every candidate is being asked to execute.
          </div>
        </div>
        <div class="wf-canvas" id="wf-canvas" data-wf="${scope.id}"></div>
      </section>
    `;
  }

  // ===== Stage 2 drilldown =================================================

  // pickCandidates replica — we re-derive the same candidate list the base
  // screen uses so drilldown columns match the trace columns exactly.
  function readSel() {
    return {
      suite:  localStorage.getItem("cmbv3_suite"),
      row:    Number(localStorage.getItem("cmbv3_td_row") || 0),
      cols:   Number(localStorage.getItem("cmbv3_td_cols") || 3),
      colsMap: JSON.parse(localStorage.getItem("cmbv3_td_cols_map") || "{}"),
      primaryModel:   localStorage.getItem("cmbv3_td_model") || "",
      primaryRuntime: localStorage.getItem("cmbv3_td_runtime") || "",
      tab: localStorage.getItem("cmbv3_td_s2tab") || "email",
    };
  }
  function getScope(suiteId) {
    return B.scopes.find(s => s.id === suiteId) || B.scopes[0];
  }
  function pickCandidates(scope, colN) {
    const sel = readSel();
    const runs = scope.comparison?.runs || [];
    // Pin col0 to primary model+runtime, pad with diverse picks.
    let primary = runs.find(r => r.model === sel.primaryModel && (r.runtime || "") === (sel.primaryRuntime || "")) ||
                  runs.find(r => r.model === sel.primaryModel) ||
                  runs[0];
    const picked = [primary];
    for (const r of runs) {
      if (picked.length >= colN) break;
      if (!picked.includes(r)) picked.push(r);
    }
    // Apply per-column overrides
    for (const [kStr, vIdx] of Object.entries(sel.colsMap || {})) {
      const k = Number(kStr);
      if (runs[vIdx] && k < colN) picked[k] = runs[vIdx];
    }
    return picked.slice(0, colN);
  }

  function judgeDimsBar(name, v) {
    const pct = ((v - 1) / 4) * 100;
    return `
      <div class="s2-jd">
        <span class="s2-jd-k">${UI.esc(name)}</span>
        <div class="s2-jd-bar"><span style="width:${pct.toFixed(1)}%"></span></div>
        <span class="s2-jd-n">${v.toFixed(1)}</span>
      </div>
    `;
  }

  function emailPanel(row) {
    const e = row.stage2?.email_text;
    if (!e) return `<div class="s2-empty">No Stage 2 email for this row.</div>`;
    const subject   = UI.esc(e.subject);
    const recipient = UI.esc(e.recipient_name);
    const body      = UI.esc(e.body).replace(/\n/g, "<br>");
    return `
      <article class="s2-email">
        <header class="s2-email-h">
          <div class="s2-email-k">To</div><div class="s2-email-v">${recipient}</div>
          <div class="s2-email-k">Subject</div><div class="s2-email-v s2-email-subj">${subject}</div>
        </header>
        <div class="s2-email-body">${body}</div>
      </article>
    `;
  }

  function groundingPanel(row) {
    const g = row.stage2?.grounding;
    if (!g) return `<div class="s2-empty">No grounding check available.</div>`;
    const fab = (g.fabrication_rate * 100).toFixed(0);
    const ok  = g.n_grounded;
    const bad = (g.n_total || 0) - ok;
    const claimRows = (g.claim_results || []).map(c => `
      <li class="s2-claim ${c.grounded ? "ok" : "bad"}">
        <span class="s2-claim-icon">${c.grounded ? "✓" : "✗"}</span>
        <div class="s2-claim-body">
          <div class="s2-claim-text">${UI.esc(c.claim)}</div>
          ${c.grounded
            ? `<div class="s2-claim-ev"><span class="s2-ev-k">evidence</span><code>${UI.esc(c.evidence)}</code></div>`
            : `<div class="s2-claim-ev s2-claim-fab"><span class="s2-ev-k">no match in tool output</span></div>`
          }
        </div>
      </li>
    `).join("");
    return `
      <section class="s2-ground">
        <header class="s2-ground-h">
          <div class="s2-ground-num"><b>${ok}</b><span>/${g.n_total}</span> grounded</div>
          <div class="s2-ground-fab">fabrication rate <b>${fab}%</b></div>
          <div class="s2-ground-bar">
            <span class="ok"   style="flex:${ok}"></span>
            <span class="bad"  style="flex:${bad}"></span>
          </div>
        </header>
        <ul class="s2-claims">${claimRows}</ul>
      </section>
    `;
  }

  function judgePanel(row) {
    const j = row.stage2?.judge;
    if (!j) return `<div class="s2-empty">No judge runs available.</div>`;
    const dims = j.dimensions || {};
    const runs = j.runs || [];
    const runCards = runs.map(r => `
      <div class="s2-jrun">
        <header class="s2-jrun-h">
          <span class="s2-jrun-id">${UI.esc(r.run_id)}</span>
          <span class="s2-jrun-overall">${r.overall.toFixed(1)}</span>
        </header>
        <div class="s2-jrun-dims">
          ${Object.entries(r.scores).map(([k, v]) => `
            <div class="s2-jrun-d"><span>${UI.esc(k)}</span><b>${v.toFixed(1)}</b></div>
          `).join("")}
        </div>
        <div class="s2-jrun-rat">${UI.esc(r.rationale)}</div>
      </div>
    `).join("");
    return `
      <section class="s2-judge">
        <div class="s2-jsummary">
          <div class="s2-jsum-left">
            <div class="s2-jsum-k">Overall · 3-run mean</div>
            <div class="s2-jsum-big">${j.overall_mean.toFixed(1)}<span class="s2-jsum-unit">/ 5</span></div>
            <div class="s2-jsum-std">σ ${j.overall_std.toFixed(2)}</div>
          </div>
          <div class="s2-jsum-right">
            ${judgeDimsBar("tone",           dims.tone)}
            ${judgeDimsBar("specificity",    dims.specificity)}
            ${judgeDimsBar("grounding",      dims.grounding)}
            ${judgeDimsBar("call_to_action", dims.call_to_action)}
          </div>
        </div>
        <div class="s2-jruns">${runCards}</div>
      </section>
    `;
  }

  function stage2Section(scope) {
    const cands = pickCandidates(scope, Math.max(2, Math.min(5, Number(localStorage.getItem("cmbv3_td_cols") || 3))));
    const sel = readSel();
    const rowIdx = sel.row;
    const tab = sel.tab; // email | grounding | judge

    const tabBtns = [
      ["email", "Email draft"],
      ["grounding", "Grounding · per claim"],
      ["judge", "Judge · 3 runs × 4 dims"],
    ].map(([k, lbl]) => `
      <button class="s2-tab ${tab === k ? "active" : ""}" data-s2tab="${k}">${lbl}</button>
    `).join("");

    const cols = cands.map(run => {
      const rows = run.results || run.rows || [];
      const row = rows[rowIdx];
      const display = UI.modelDisplay(run.model);
      const runtimeChip = run.runtime ? `<span class="td-rt">${UI.esc(run.runtime)}</span>` : "";
      let body = "";
      if (!row || !row.stage2) {
        body = `<div class="s2-empty">No Stage 2 data for this candidate yet.</div>`;
      } else if (tab === "email")      body = emailPanel(row);
      else if (tab === "grounding")    body = groundingPanel(row);
      else if (tab === "judge")        body = judgePanel(row);
      return `
        <div class="s2-col">
          <header class="s2-col-h">
            ${UI.providerDot(run.provider)}
            <div class="s2-col-name">${UI.esc(display)}</div>
            ${runtimeChip}
          </header>
          <div class="s2-col-body s2-tabbody-${tab}">${body}</div>
        </div>
      `;
    }).join("");

    const colN = cands.length;
    return `
      <section class="s2-section">
        <div class="s2-head">
          <div class="s2-kicker">Stage 2 · drilldown</div>
          <div class="s2-title">Same row, each candidate — the email, the grounding, the judge.</div>
          <div class="s2-blurb">
            Stage 1 produces a <code>ProspectProfile</code>; Stage 2 drafts an outreach email from it.
            Pick a lens — draft, grounding, or judge — and compare across candidates side-by-side.
          </div>
        </div>
        <div class="s2-tabs">${tabBtns}</div>
        <div class="s2-grid s2-cols-${colN}">${cols}</div>
      </section>
    `;
  }

  // ===== Patch the Trace Diff screen =======================================

  const origRender = TD.render;
  const origMount  = TD.mount;

  TD.render = function () {
    const html = origRender();
    // Determine scope from whatever the base screen used.
    const suite = localStorage.getItem("cmbv3_suite");
    const scope = getScope(suite);
    if (!scope || scope.kind !== "agentic") return html;
    const extra = workflowSection(scope) + stage2Section(scope);
    // Inject before </main>
    return html.replace(/<\/main>\s*$/, `${extra}</main>`);
  };

  TD.mount = function () {
    origMount();
    // Old auto-laid-out workflow only needs a re-draw on resize; the new
    // __WF2 diagram is a single static SVG with preserveAspectRatio, so
    // CSS handles scaling.
    const canvas = document.getElementById("wf-canvas");
    if (canvas && canvas.dataset.wf) {
      const wfId = canvas.dataset.wf;
      const wf = WORKFLOWS[wfId];
      if (wf) {
        const w = canvas.clientWidth || 960;
        canvas.innerHTML = renderWorkflow(wf, w);
        let t;
        window.addEventListener("resize", () => {
          clearTimeout(t);
          t = setTimeout(() => {
            const ww = canvas.clientWidth || 960;
            canvas.innerHTML = renderWorkflow(wf, ww);
          }, 160);
        }, { passive: true, once: true });
      }
    }
    // Stage 2 tab switching
    document.querySelectorAll(".s2-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        localStorage.setItem("cmbv3_td_s2tab", btn.dataset.s2tab);
        window.__APP.render();
      });
    });
  };
})();
