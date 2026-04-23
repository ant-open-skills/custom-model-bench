/**
 * Screen: Behavior
 *
 * Surfaces how each candidate actually RAN — not just its headline metric.
 * The hook is the Sonnet 4.6 story: the same model running under two different
 * harnesses ("cagent-sdk" vs the AI-SDK default) does 9 turns/3234 output
 * tokens vs 4 turns/772 output tokens on the same 15 prompts. That is a
 * behavioral story aggregate leaderboards flatten.
 *
 * Layout:
 *   - Hero callout surfacing the biggest behavior gap automatically
 *   - Per-candidate "behavior cards" — turns distribution, tokens out, tool mix
 *   - Side-by-side compare when two candidates share a model
 */

(() => {
  const B = window.__BENCH;
  const UI = window.BENCH_UI;

  const SEL = {
    suite: localStorage.getItem("cmbv3_suite") || (B.scopes[0] && B.scopes[0].id),
  };
  function persist() {
    localStorage.setItem("cmbv3_suite", SEL.suite);
  }
  function currentScope() {
    return B.scopes.find(s => s.id === SEL.suite) || B.scopes[0];
  }

  // Return stats for a single run.
  function statsFor(run) {
    const rows = run.results || run.rows || [];
    const turns = rows.map(r => r.turns).filter(v => v != null);
    const tokOut = rows.map(r => r.output_tokens).filter(v => v != null);
    const toolCounts = {};
    let totalCalls = 0;
    for (const r of rows) {
      for (const e of (r.trace || [])) {
        if (e.type === "tool_call") {
          toolCounts[e.name] = (toolCounts[e.name] || 0) + 1;
          totalCalls++;
        }
      }
    }
    const avg = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    return {
      rows,
      turns,
      tokOut,
      toolCounts,
      totalCalls,
      meanTurns: avg(turns),
      meanTok: avg(tokOut),
      medianTurns: turns.length ? turns.slice().sort((a, b) => a - b)[Math.floor(turns.length / 2)] : null,
    };
  }

  // Tiny inline histogram (SVG). Counts values at each bucket.
  function histogramSVG(values, opts = {}) {
    const { w = 180, h = 44, maxBucket = null, color = "var(--accent)" } = opts;
    if (!values.length) return "";
    const max = Math.max(...values);
    const buckets = Math.min(12, Math.max(3, max));
    const counts = new Array(buckets).fill(0);
    for (const v of values) {
      const b = Math.min(buckets - 1, Math.max(0, Math.floor(((v - 1) / Math.max(1, max)) * buckets)));
      counts[b]++;
    }
    const maxC = maxBucket ?? Math.max(...counts);
    const bw = (w / buckets) * 0.78;
    const gap = (w / buckets) * 0.22;
    const bars = counts.map((c, i) => {
      const x = i * (bw + gap) + gap / 2;
      const bh = maxC ? (c / maxC) * (h - 4) : 0;
      return `<rect x="${x.toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="${color}" opacity="0.85"/>`;
    }).join("");
    return `<svg viewBox="0 0 ${w} ${h}" class="bh-hist">${bars}</svg>`;
  }

  // Compare two runs that share the same model — auto-detects and returns the
  // pair with the biggest divergence in turns or tokens.
  function findBiggestPair(scope) {
    const runs = scope.comparison?.runs || [];
    const byModel = {};
    for (const r of runs) (byModel[r.model] ||= []).push(r);
    let best = null;
    for (const m of Object.keys(byModel)) {
      const pair = byModel[m];
      if (pair.length < 2) continue;
      // Compute divergence between any two same-model runs
      for (let i = 0; i < pair.length; i++) for (let j = i + 1; j < pair.length; j++) {
        const A = statsFor(pair[i]), Bs = statsFor(pair[j]);
        const turnGap = Math.abs((A.meanTurns || 0) - (Bs.meanTurns || 0));
        const tokGap = Math.abs((A.meanTok || 0) - (Bs.meanTok || 0));
        const score = turnGap * 500 + tokGap; // weight turn gaps highly
        if (!best || score > best.score) {
          best = { score, a: pair[i], b: pair[j], aS: A, bS: Bs };
        }
      }
    }
    return best;
  }

  function chipRow(toolCounts, color = "var(--accent)") {
    const entries = Object.entries(toolCounts).sort((a, b) => b[1] - a[1]);
    if (!entries.length) return `<div class="bh-none">no tool calls</div>`;
    const total = entries.reduce((s, [, v]) => s + v, 0);
    return `
      <div class="bh-toolbar">
        ${entries.map(([name, n]) => {
          const pct = Math.round((n / total) * 100);
          return `
            <div class="bh-tool">
              <div class="bh-tool-head">
                <code class="bh-tool-name">${UI.esc(name)}</code>
                <span class="bh-tool-n">${n}</span>
              </div>
              <div class="bh-tool-bar"><div class="bh-tool-fill" style="width:${pct}%; background:${color};"></div></div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function cardFor(run) {
    const s = statsFor(run);
    const agg = run.aggregate || {};
    const color = UI.PROVIDER_COLORS[run.provider] || "#888";
    const display = UI.modelDisplay(run.model);
    const runtime = run.runtime ? run.runtime : "(default)";
    return `
      <div class="bh-card">
        <header class="bh-card-head">
          <div class="bh-card-title">
            ${UI.providerDot(run.provider)}
            <div class="bh-card-name">${UI.esc(display)}</div>
            <div class="bh-card-rt">on <code>${UI.esc(runtime)}</code></div>
          </div>
          <div class="bh-card-meta">
            ${s.rows.length} rows · ${(agg.n_success || 0)}/${(agg.n || 0)} valid
          </div>
        </header>

        <div class="bh-metrics">
          <div class="bh-metric">
            <div class="bh-m-k">mean turns</div>
            <div class="bh-m-v">${s.meanTurns != null ? s.meanTurns.toFixed(1) : "—"}</div>
            <div class="bh-m-h">${histogramSVG(s.turns, { color })}</div>
            <div class="bh-m-sub">median ${s.medianTurns ?? "—"} · max ${s.turns.length ? Math.max(...s.turns) : "—"}</div>
          </div>

          <div class="bh-metric">
            <div class="bh-m-k">mean tokens out</div>
            <div class="bh-m-v">${s.meanTok != null ? Math.round(s.meanTok) : "—"}</div>
            <div class="bh-m-h">${histogramSVG(s.tokOut, { color })}</div>
            <div class="bh-m-sub">max ${s.tokOut.length ? Math.max(...s.tokOut) : "—"}</div>
          </div>

          <div class="bh-metric">
            <div class="bh-m-k">tool calls total</div>
            <div class="bh-m-v">${s.totalCalls}</div>
            <div class="bh-m-sub">${s.rows.length ? (s.totalCalls / s.rows.length).toFixed(1) + " / row" : "—"}</div>
          </div>
        </div>

        <div class="bh-tools-block">
          <div class="bh-tools-k">tool mix</div>
          ${chipRow(s.toolCounts, color)}
        </div>
      </div>
    `;
  }

  function comparePanel(pair) {
    if (!pair) return "";
    const { a, b, aS, bS } = pair;
    const aDisp = UI.modelDisplay(a.model), bDisp = UI.modelDisplay(b.model);
    const aRt = a.runtime || "(default)", bRt = b.runtime || "(default)";
    // Determine which is "tighter" (fewer turns & tokens)
    const aTight = (aS.meanTurns < bS.meanTurns) && (aS.meanTok < bS.meanTok);
    const bTight = (bS.meanTurns < aS.meanTurns) && (bS.meanTok < aS.meanTok);
    const tight = aTight ? a : bTight ? b : null;
    const tightS = aTight ? aS : bTight ? bS : null;
    const deep  = aTight ? b : bTight ? a : null;
    const deepS = aTight ? bS : bTight ? aS : null;

    const line = tight
      ? `Same model (<strong>${UI.esc(UI.modelDisplay(a.model))}</strong>), two harnesses. The <code>${UI.esc(tight.runtime || "default")}</code> run is tighter — <strong>${tightS.meanTurns.toFixed(1)} turns</strong> / <strong>${Math.round(tightS.meanTok)}</strong> tokens — while the <code>${UI.esc(deep.runtime || "default")}</code> run goes deeper at <strong>${deepS.meanTurns.toFixed(1)} turns</strong> / <strong>${Math.round(deepS.meanTok)}</strong>. Neither one is wrong; they're different stopping strategies.`
      : `Same model, different harnesses — behavior diverges on turns and tokens, but neither dominates the other.`;

    return `
      <section class="bh-callout">
        <div class="bh-callout-k">Behavior gap · auto-detected</div>
        <div class="bh-callout-body">
          ${line}
          <div class="bh-callout-why">
            Why this matters: the leaderboard shows cost and latency per <em>run</em>, but the <em>same</em> model will cost 3× more and take 2× longer under a different harness because it chose to take more turns. That's a product decision, not a benchmark one.
          </div>
        </div>
        <div class="bh-callout-grid">
          <div class="bh-cgi">
            <div class="bh-cgi-k">${UI.esc(aDisp)} · <code>${UI.esc(aRt)}</code></div>
            <div class="bh-cgi-rows">
              <div><span>mean turns</span><strong>${aS.meanTurns != null ? aS.meanTurns.toFixed(1) : "—"}</strong></div>
              <div><span>mean tokens</span><strong>${aS.meanTok != null ? Math.round(aS.meanTok) : "—"}</strong></div>
              <div><span>p50 latency</span><strong>${a.aggregate?.latency_ms?.p50 != null ? (a.aggregate.latency_ms.p50 / 1000).toFixed(1) + "s" : "—"}</strong></div>
              <div><span>$ / 1k</span><strong>$${a.aggregate?.cost_usd?.per_1k_evals?.toFixed(2) ?? "—"}</strong></div>
            </div>
          </div>
          <div class="bh-cgi-sep">vs</div>
          <div class="bh-cgi">
            <div class="bh-cgi-k">${UI.esc(bDisp)} · <code>${UI.esc(bRt)}</code></div>
            <div class="bh-cgi-rows">
              <div><span>mean turns</span><strong>${bS.meanTurns != null ? bS.meanTurns.toFixed(1) : "—"}</strong></div>
              <div><span>mean tokens</span><strong>${bS.meanTok != null ? Math.round(bS.meanTok) : "—"}</strong></div>
              <div><span>p50 latency</span><strong>${b.aggregate?.latency_ms?.p50 != null ? (b.aggregate.latency_ms.p50 / 1000).toFixed(1) + "s" : "—"}</strong></div>
              <div><span>$ / 1k</span><strong>$${b.aggregate?.cost_usd?.per_1k_evals?.toFixed(2) ?? "—"}</strong></div>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function render() {
    const scope = currentScope();
    const runs = scope.comparison?.runs || [];

    const suitesHtml = UI.suiteSwitcher(B.scopes, scope.id);

    // Only surface behavior cards for runs that actually have trace data
    // (otherwise turns/tokens are trivially 1 and the story is empty).
    const richRuns = runs.filter(r => {
      const rr = r.results || r.rows || [];
      return rr.some(x => (x.trace && x.trace.length) || (x.turns && x.turns > 1));
    });
    const hasTraces = richRuns.length > 0;

    const pair = hasTraces ? findBiggestPair(scope) : null;
    const cards = richRuns.map(cardFor).join("");

    const emptyMsg = !hasTraces
      ? `<div class="v3-empty-rich">
           <div class="vem-k">Behavior view is quiet for <strong>${UI.esc(scope.label)}</strong>.</div>
           <div class="vem-v">This suite's prompts are single-turn — there aren't tool calls or turn patterns to chart. Try <button class="vem-link" data-suite-sw="yc-qualifier">Prospect qualifier</button> or <button class="vem-link" data-suite-sw="tool-bench">Tool bench</button>.</div>
         </div>`
      : "";

    return `
      <main class="main v3-main">
        <section class="v3-hero v3-hero-slim">
          <div class="v3-kicker">Behavior · preview</div>
          <h1 class="v3-title">How each candidate actually <em>ran</em>.</h1>
          <p class="v3-blurb">
            Aggregate stats tell you the what. Behavior tells you the how — turns, tokens, which tools got called, how often. Same model under a different harness will often behave <em>radically</em> differently.
          </p>
        </section>

        ${suitesHtml}

        ${emptyMsg}
        ${pair ? comparePanel(pair) : ""}

        <section class="bh-cards">${cards}</section>
      </main>
    `;
  }

  function mount() {
    document.querySelectorAll(".v3-suite").forEach(el => {
      el.addEventListener("click", () => {
        SEL.suite = el.dataset.suite;
        persist();
        window.__APP.render();
      });
    });
    document.querySelectorAll(".vem-link").forEach(el => {
      el.addEventListener("click", () => {
        SEL.suite = el.dataset.suiteSw;
        persist();
        window.__APP.render();
      });
    });
  }

  window.__V3_SCREENS = window.__V3_SCREENS || {};
  window.__V3_SCREENS.behavior = { render, mount };
})();
