/**
 * Screen: Trace Diff
 *
 * The "why" drill-down. Pick a prompt (row) from the current suite; see the
 * trace (tool-call sequence + final response) from N candidates, stacked in
 * parallel columns. Makes behavioral differences visible at a glance:
 *   - who called github_lookup first
 *   - who repeated tools, who fell back to web_fetch
 *   - who emitted JSON-in-text, who emitted a clean answer
 *   - how many turns each took, how many tokens out
 *
 * This screen is only populated for suites where runs have traces
 * (tool-bench, yc-qualifier). For trace-less suites, we show the prompt and
 * the final answer columns only.
 */

(() => {
  const B = window.__BENCH;
  const UI = window.BENCH_UI;

  const SEL = {
    suite: localStorage.getItem("cmbv3_suite") || (B.scopes[0] && B.scopes[0].id),
    row:   Number(localStorage.getItem("cmbv3_td_row") || 0),
    cols:  Number(localStorage.getItem("cmbv3_td_cols") || 3),
  };
  function persist() {
    localStorage.setItem("cmbv3_suite", SEL.suite);
    localStorage.setItem("cmbv3_td_row", String(SEL.row));
    localStorage.setItem("cmbv3_td_cols", String(SEL.cols));
  }
  function currentScope() {
    return B.scopes.find(s => s.id === SEL.suite) || B.scopes[0];
  }

  // Return the list of candidates to compare. Preference: the model the user
  // came in with (via frontier click) + top-fit neighbors. Otherwise the first
  // N runs in the suite.
  function pickCandidates(scope, n) {
    const runs = scope.comparison?.runs || [];
    if (!runs.length) return [];
    const incomingModel = localStorage.getItem("cmbv3_td_model");
    const incomingRuntime = localStorage.getItem("cmbv3_td_runtime") || "";
    const picked = [];
    const incomingIdx = runs.findIndex(r => r.model === incomingModel && (r.runtime || "") === incomingRuntime);
    if (incomingIdx >= 0) picked.push(runs[incomingIdx]);
    for (const r of runs) {
      if (picked.length >= n) break;
      if (!picked.includes(r)) picked.push(r);
    }
    return picked;
  }

  // Extract one row from a given run by prompt index.
  function rowFor(run, rowIdx) {
    const rows = run.results || run.rows || [];
    return rows[rowIdx] || null;
  }

  // Render a single trace as a vertical stack of events.
  // Trace event schema (per viewer/types.d.ts):
  //   { type: "tool_call",     step, name, input,  id }
  //   { type: "tool_result",   step, name, output, id }
  //   { type: "assistant_text", step, text }
  // Older synthetic data sometimes used `args` / `result` — we read both.
  function traceBlock(row, run) {
    if (!row) {
      return `<div class="v3-trace-empty">no data for this row</div>`;
    }
    const trace = row.trace || [];
    const lines = [];

    if (trace.length === 0) {
      // No trace data — show the raw response as a single block.
      lines.push(`
        <div class="tdl tdl-final">
          <div class="tdl-k">final answer</div>
          <div class="tdl-body">${UI.esc((row.response || "").slice(0, 1200))}${(row.response || "").length > 1200 ? "…" : ""}</div>
        </div>
      `);
    } else {
      let step = 0;
      for (const ev of trace) {
        step = ev.step ?? step;
        if (ev.type === "tool_call") {
          // Real schema: ev.input. Synthetic / older data: ev.args.
          const argsRaw = ev.input ?? ev.args ?? {};
          const argsStr = typeof argsRaw === "string" ? argsRaw : JSON.stringify(argsRaw);
          const argsShort = argsStr.length > 80 ? argsStr.slice(0, 79) + "…" : argsStr;
          lines.push(`
            <div class="tdl tdl-call">
              <div class="tdl-rail">↘</div>
              <div class="tdl-body">
                <div class="tdl-head">
                  <code class="tdl-tool">${UI.esc(ev.name || "tool")}</code>
                  <span class="tdl-step">step ${step}</span>
                </div>
                <code class="tdl-args">${UI.esc(argsShort)}</code>
              </div>
            </div>
          `);
        } else if (ev.type === "tool_result") {
          // Real schema: ev.output. Synthetic / older data: ev.result.
          const resRaw = ev.output ?? ev.result ?? {};
          const resStr = typeof resRaw === "string" ? resRaw : JSON.stringify(resRaw);
          const resShort = resStr.length > 140 ? resStr.slice(0, 139) + "…" : resStr;
          lines.push(`
            <div class="tdl tdl-res">
              <div class="tdl-rail">↖</div>
              <div class="tdl-body">
                <div class="tdl-head"><span class="tdl-reslbl">result</span></div>
                <code class="tdl-res-body">${UI.esc(resShort)}</code>
              </div>
            </div>
          `);
        } else if (ev.type === "assistant_text") {
          const txt = String(ev.text || "").trim();
          const short = txt.length > 260 ? txt.slice(0, 259) + "…" : txt;
          lines.push(`
            <div class="tdl tdl-say">
              <div class="tdl-rail">•</div>
              <div class="tdl-body">
                <div class="tdl-head"><span class="tdl-saylbl">thinks</span></div>
                <div class="tdl-say-body">${UI.esc(short)}</div>
              </div>
            </div>
          `);
        }
      }
      // Final answer — take the end of row.response
      const resp = String(row.response || "").trim();
      if (resp) {
        const last = resp.length > 400 ? "…" + resp.slice(-399) : resp;
        lines.push(`
          <div class="tdl tdl-final">
            <div class="tdl-k">final answer</div>
            <div class="tdl-body"><code>${UI.esc(last)}</code></div>
          </div>
        `);
      }
    }

    // Row metrics footer
    const footer = `
      <div class="td-foot">
        <span><strong>${row.turns ?? "—"}</strong> turns</span>
        <span><strong>${row.output_tokens ?? "—"}</strong> tok out</span>
        <span><strong>${row.latency_ms != null ? (row.latency_ms / 1000).toFixed(1) + "s" : "—"}</strong></span>
        <span class="${row.error ? "td-err" : (row.answer_correct === false ? "td-err" : "td-ok")}">
          ${row.error ? "error" : (row.answer_correct === false ? "wrong" : "ok")}
        </span>
      </div>
    `;

    return lines.join("") + footer;
  }

  function render() {
    const scope = currentScope();
    const runs = scope.comparison?.runs || [];
    if (runs.length === 0) {
      return `<main class="main v3-main"><div class="v3-empty">No runs in this suite.</div></main>`;
    }

    // Clamp row/cols
    const nRows = scope.comparison?.n_rows || (runs[0]?.results || runs[0]?.rows || []).length;
    if (SEL.row >= nRows) SEL.row = 0;
    const colN = Math.max(2, Math.min(5, SEL.cols));
    const cands = pickCandidates(scope, colN);

    // Row picker: show the prompt preview (first 140 chars) for each row index.
    const firstRun = runs[0];
    const allRows = firstRun.results || firstRun.rows || [];
    const rowPicker = allRows.map((r, i) => `
      <button class="td-rowpick ${i === SEL.row ? "active" : ""}" data-row="${i}">
        <span class="td-rp-idx">${String(i + 1).padStart(2, "0")}</span>
        <span class="td-rp-prompt">${UI.esc((r.prompt || "").slice(0, 80))}${(r.prompt || "").length > 80 ? "…" : ""}</span>
      </button>
    `).join("");

    const activeRow = allRows[SEL.row];
    const promptText = activeRow?.prompt || "";

    // Suite switcher (grouped)
    const suitesHtml = UI.suiteSwitcher(B.scopes, scope.id);

    // Candidate columns
    const cols = cands.map((run, i) => {
      const row = rowFor(run, SEL.row);
      const display = UI.modelDisplay(run.model);
      const runtimeChip = run.runtime && run.runtime !== "vercel" ? `<span class="td-rt">${UI.esc(run.runtime)}</span>` : "";
      // swapper for this column
      const swapOpts = runs.map((r, j) => {
        const lbl = UI.modelDisplay(r.model) + (r.runtime && r.runtime !== "vercel" ? ` · ${r.runtime}` : "");
        const selected = r === run ? "selected" : "";
        return `<option value="${j}" ${selected}>${UI.esc(lbl)}</option>`;
      }).join("");

      return `
        <div class="td-col" data-col="${i}">
          <header class="td-col-head">
            <div class="td-col-title">
              ${UI.providerDot(run.provider)}
              <div class="td-col-name">${UI.esc(display)}</div>
              ${runtimeChip}
            </div>
            <select class="td-swap" data-col="${i}">
              ${swapOpts}
            </select>
          </header>
          <div class="td-col-body">
            ${traceBlock(row, run)}
          </div>
        </div>
      `;
    }).join("");

    const colsClass = `td-cols-${colN}`;

    return `
      <main class="main v3-main">
        <section class="v3-hero v3-hero-slim">
          <div class="v3-kicker">Trace diff · preview</div>
          <h1 class="v3-title">Same prompt, different models. Lined up.</h1>
          <p class="v3-blurb">
            Aggregate stats hide the interesting part. On any given prompt, models take wildly different paths —
            some pile tool calls, some answer in one shot. The diff view makes behavior comparable.
          </p>
        </section>

        ${suitesHtml}

        <section class="td-layout">
          <aside class="td-rowcol">
            <div class="td-rc-head">Prompts · ${nRows}</div>
            <div class="td-rc-body">${rowPicker}</div>
          </aside>

          <div class="td-main">
            <div class="td-prompt">
              <div class="td-prompt-k">Prompt ${String(SEL.row + 1).padStart(2, "0")}</div>
              <div class="td-prompt-body">${UI.esc(promptText)}</div>
              <div class="td-prompt-tools">
                <span>Showing</span>
                <div class="td-coln-seg">
                  ${[2, 3, 4, 5].map(n => `<button class="td-coln ${n === colN ? "active" : ""}" data-coln="${n}">${n}</button>`).join("")}
                </div>
                <span>columns</span>
              </div>
            </div>

            <div class="td-grid ${colsClass}">
              ${cols}
            </div>
          </div>
        </section>
      </main>
    `;
  }

  function mount() {
    document.querySelectorAll(".v3-suite").forEach(el => {
      el.addEventListener("click", () => {
        SEL.suite = el.dataset.suite;
        SEL.row = 0;
        persist();
        window.__APP.render();
      });
    });
    document.querySelectorAll(".td-rowpick").forEach(el => {
      el.addEventListener("click", () => {
        SEL.row = Number(el.dataset.row);
        persist();
        window.__APP.render();
      });
    });
    document.querySelectorAll(".td-coln").forEach(el => {
      el.addEventListener("click", () => {
        SEL.cols = Number(el.dataset.coln);
        persist();
        window.__APP.render();
      });
    });
    document.querySelectorAll(".td-swap").forEach(el => {
      el.addEventListener("change", () => {
        // Swap the run for this column — we persist a per-column selection.
        const col = Number(el.dataset.col);
        const runIdx = Number(el.value);
        const scope = currentScope();
        const run = (scope.comparison?.runs || [])[runIdx];
        if (!run) return;
        // Stash the primary model so re-entering trace-diff keeps it
        if (col === 0) {
          localStorage.setItem("cmbv3_td_model", run.model);
          localStorage.setItem("cmbv3_td_runtime", run.runtime || "");
        }
        // We store a simple column-override for now: col -> runIdx
        const overrides = JSON.parse(localStorage.getItem("cmbv3_td_cols_map") || "{}");
        overrides[col] = runIdx;
        localStorage.setItem("cmbv3_td_cols_map", JSON.stringify(overrides));
        window.__APP.render();
      });
    });
  }

  window.__V3_SCREENS = window.__V3_SCREENS || {};
  window.__V3_SCREENS.traceDiff = { render, mount };
})();
