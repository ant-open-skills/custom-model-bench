// =====================================================================
// Screen renderers — Compare / Detail / Drill / Spec
// Adapted to custom-model-bench's real comparison JSON schema:
//   window.__BENCH.scopes[].comparison.{runs[], leaderboard, n_rows, n_candidates, ...}
// =====================================================================

const BENCH = window.__BENCH;

// ---- Provider palette ----
const PROVIDERS = {
  anthropic: { name: 'Anthropic', mark: 'A', color: 'var(--p-anthropic)', bg: 'var(--p-anthropic-bg)' },
  openai:    { name: 'OpenAI',    mark: 'O', color: 'var(--p-openai)',    bg: 'var(--p-openai-bg)'    },
  google:    { name: 'Google',    mark: 'G', color: 'var(--p-google)',    bg: 'var(--p-google-bg)'    },
  xai:       { name: 'xAI',       mark: 'X', color: 'var(--p-xai)',       bg: 'var(--p-xai-bg)'       },
};

// ---- Selection state (scope + focused candidate, survives re-render) ----
const SEL = {
  scope: localStorage.getItem('cmb_scope') || 'flagship',
  // candidate index within the scope's runs[], for Detail screen
  candidateIdx: Number(localStorage.getItem('cmb_candidate') || 0),
};
function setScope(id) {
  SEL.scope = id;
  SEL.candidateIdx = 0;
  localStorage.setItem('cmb_scope', id);
  localStorage.setItem('cmb_candidate', '0');
}
function setCandidate(idx) {
  SEL.candidateIdx = idx;
  localStorage.setItem('cmb_candidate', String(idx));
}
function currentScope() {
  return BENCH.scopes.find(s => s.id === SEL.scope) || BENCH.scopes[0];
}

// ---- Formatting ----
const fmtMs   = v => `${Math.round(v).toLocaleString()}`;
const fmtUsd  = v => `$${v.toFixed(4)}`;
const fmtCost = v => v >= 1 ? `$${v.toFixed(2)}` : `$${v.toFixed(4)}`;
const fmtPct  = v => `${(v * 100).toFixed(1)}%`;

function providerDot(p, size = 22) {
  const info = PROVIDERS[p];
  if (!info) return '';
  return `<span class="prov-dot" style="width:${size}px;height:${size}px;background:${info.color};">${info.mark}</span>`;
}
function providerTag(p) {
  const info = PROVIDERS[p];
  if (!info) return '';
  return `<span class="tag" style="background:${info.bg}; border-color:${info.color};"><span class="dot" style="background:${info.color};"></span>${info.name}</span>`;
}

// Collapse a run's aggregate leaderboard to per-candidate best values
function findBest(runs) {
  const ok = runs.filter(r => r.aggregate.n_success > 0);
  if (ok.length === 0) return { p50: 0, p95: 0, cost: 0, success: 0, turns: 0 };
  return {
    p50:     Math.min(...ok.map(r => r.aggregate.latency_ms.p50)),
    p95:     Math.min(...ok.map(r => r.aggregate.latency_ms.p95)),
    cost:    Math.min(...ok.map(r => r.aggregate.cost_usd.per_1k_evals)),
    success: Math.max(...runs.map(r => r.aggregate.n_success / r.aggregate.n)),
    turns:   Math.min(...ok.map(r => r.aggregate.turns.mean)),
  };
}

// Build latency samples from a candidate's results[] (since our schema doesn't
// include a pre-computed distribution — we derive it from per-row latencies).
function latencySamples(run) {
  return run.results
    .filter(r => r.error === null)
    .map(r => r.latency_ms)
    .sort((a, b) => a - b);
}

// =========================================================================
// Scope switcher — sits at the top of Compare / Detail / Drill screens
// =========================================================================
function scopeSwitcher() {
  return `
    <div class="switcher" style="margin-bottom:20px;" id="scope-switcher">
      ${BENCH.scopes.map(s => `
        <button data-scope="${s.id}" class="${s.id === SEL.scope ? 'active' : ''}">
          ${s.label} <span style="opacity:.55; margin-left:4px;">· ${s.comparison.n_candidates}</span>
        </button>
      `).join('')}
    </div>
  `;
}

// =========================================================================
// SCREEN 1 — COMPARE
// =========================================================================
function renderCompare() {
  const scope = currentScope();
  const cmp = scope.comparison;
  const runs = cmp.runs;
  const best = findBest(runs);
  const hero = (window.TWEAKS || {}).heroMetric || 'all';

  // Composite score → winner badge
  const ranked = [...runs].map(r => {
    const a = r.aggregate;
    const sRate = a.n_success / a.n;
    if (a.n_success === 0) return { ...r, _score: 0 };
    const lScore = best.p50 / a.latency_ms.p50;
    const cScore = best.cost / a.cost_usd.per_1k_evals;
    const sScore = sRate / (best.success || 1);
    return { ...r, _score: lScore + cScore + sScore };
  }).sort((a, b) => b._score - a._score);
  const winnerCfg = ranked[0].config_file;

  const candidateCard = (run) => {
    const p = PROVIDERS[run.provider] || PROVIDERS.anthropic;
    const a = run.aggregate;
    const sRate = a.n_success / a.n;
    const rank = ranked.findIndex(r => r.config_file === run.config_file) + 1;
    const isWinner = run.config_file === winnerCfg && a.n_success > 0;

    const metrics = {
      p50: {
        label: 'p50 latency',
        value: fmtMs(a.latency_ms.p50), unit: 'ms',
        sub: `p95 ${fmtMs(a.latency_ms.p95)}ms`,
        best: a.latency_ms.p50 === best.p50,
      },
      cost: {
        label: 'per 1k evals',
        value: fmtCost(a.cost_usd.per_1k_evals), unit: '',
        sub: `run total ${fmtCost(a.cost_usd.total)}`,
        best: a.cost_usd.per_1k_evals === best.cost,
      },
      success: {
        label: 'success rate',
        value: fmtPct(sRate), unit: '',
        sub: `${a.n_error} errors · ${a.n} evals`,
        best: sRate === best.success,
      },
    };
    const order = hero === 'all'     ? ['p50','cost','success']
                : hero === 'p50'     ? ['p50','cost','success']
                : hero === 'cost'    ? ['cost','p50','success']
                :                      ['success','p50','cost'];

    return `
      <div class="prov ${isWinner ? 'winner' : ''}" data-cfg="${run.config_file}">
        <div class="prov-head">
          <div class="prov-brand">
            ${providerDot(run.provider)}
            <div>
              <div class="prov-name">${p.name}</div>
              <div class="prov-model">${run.model}</div>
            </div>
          </div>
          <div class="prov-rank">${isWinner ? 'best overall' : ''}<span class="r" style="margin-left:${isWinner?'6px':'0'}">#${rank}</span></div>
        </div>

        <div class="prov-metrics">
          ${order.map(k => {
            const m = metrics[k];
            return `
              <div class="metric">
                <div class="metric-label">${m.label}</div>
                <div class="metric-value">${m.value}${m.unit ? `<span class="unit">${m.unit}</span>` : ''}</div>
                <div class="metric-sub">${m.sub}${m.best ? ' · <span class="delta-ok">best</span>' : ''}</div>
              </div>
            `;
          }).join('')}
        </div>

        <div class="dist">
          <div class="dist-label">
            <span>latency distribution</span>
            <span class="range">${a.latency_ms.p50}–${a.latency_ms.p99}ms</span>
          </div>
          <div id="dist-${run.config_file.replace(/\W/g,'_')}"></div>
        </div>
      </div>
    `;
  };

  // Metrics matrix: rows are metrics, columns are candidates
  const matrixCol = runs.length + 1; // +1 for metric label
  const mStyle = `style="grid-template-columns:200px repeat(${runs.length}, 1fr);"`;
  const hBorder = (i) => i === runs.length ? 'border-right:0;' : '';
  const mrow = (label, extract, isLower, fmt) => {
    const values = runs.map(r => extract(r));
    const bestVal = isLower ? Math.min(...values) : Math.max(...values);
    return `
      <div class="ml">${label}</div>
      ${runs.map((_, i) => {
        const v = values[i];
        const isBest = v === bestVal;
        return `<div class="mv" style="${hBorder(i+1)}"><span class="${isBest ? 'best' : ''}">${fmt(v)}</span></div>`;
      }).join('')}
    `;
  };

  const startedAt = new Date(cmp.started_at);
  const ago = humanAgo(startedAt);

  return `
    <div class="page">
      <div class="screen-head">
        <div>
          <div class="screen-kicker">
            <span>Screen 01 · Comparison</span>
            <span class="tag soft"><span class="dot" style="background:var(--ok);"></span>${ago}</span>
          </div>
          <h1 class="screen-title">${scopeHeadline(scope)}</h1>
        </div>
        <div>
          <p class="screen-dek">${scopeDek(scope)}</p>
        </div>
      </div>

      ${scopeSwitcher()}

      <div class="section-label">
        Latest run · dataset <span class="mono" style="color:var(--ink-2)">${datasetBasename(cmp.dataset_path)}</span>
        · ${cmp.n_rows} rows × ${cmp.n_candidates} candidates
      </div>
      <div class="provider-strip" style="grid-template-columns:repeat(${Math.min(runs.length, 4)}, 1fr);">
        ${runs.map(candidateCard).join('')}
      </div>

      <div class="section-label" style="margin-top:32px;">All metrics at a glance</div>
      <div class="matrix" ${mStyle}>
        <div class="mh">Metric</div>
        ${runs.map((r, i) => `
          <div class="mh" style="${hBorder(i+1)}">
            ${PROVIDERS[r.provider]?.name || r.provider}<br>
            <span class="mono" style="font-size:10px; font-weight:400; text-transform:none; letter-spacing:0; color:var(--ink-4);">${r.model}</span>
          </div>
        `).join('')}

        ${mrow('p50 latency',      r => r.aggregate.latency_ms.p50, true,  v => `${fmtMs(v)}ms`)}
        ${mrow('p95 latency',      r => r.aggregate.latency_ms.p95, true,  v => `${fmtMs(v)}ms`)}
        ${mrow('p99 latency',      r => r.aggregate.latency_ms.p99, true,  v => `${fmtMs(v)}ms`)}
        ${mrow('cost per 1k evals',r => r.aggregate.cost_usd.per_1k_evals, true, v => fmtCost(v))}
        ${mrow('cost total',       r => r.aggregate.cost_usd.total, true,  v => fmtCost(v))}
        ${mrow('success rate',     r => r.aggregate.n_success / r.aggregate.n, false, v => fmtPct(v))}
        ${mrow('mean turns',       r => r.aggregate.turns.mean, true,       v => v.toFixed(2))}
      </div>

      <div class="designdoc">
        <div class="designdoc-head">
          <div class="designdoc-title">Why this layout</div>
          <div class="mono" style="font-size:11px;color:var(--ink-4);">screen 01 · rationale</div>
        </div>
        <div class="dd-grid">
          <div class="dd-card">
            <div class="dd-kicker">Hero</div>
            <h4>Cards, equal weight</h4>
            <p>A horizontal strip invites side-by-side comparison without forcing a ranking. The winner gets a subtle border accent; ordinal rank lives in the corner, not in the layout.</p>
          </div>
          <div class="dd-card">
            <div class="dd-kicker">Three numbers</div>
            <h4>Speed · money · reliability</h4>
            <p>Every card shows p50, per-1k cost, and success — the three trade-offs a team actually argues about. "Best" badges highlight per-metric winners so no one metric hides behind the composite.</p>
          </div>
          <div class="dd-card">
            <div class="dd-kicker">Distribution</div>
            <h4>Don't hide p99 under a mean</h4>
            <p>Each card carries a box plot built from the actual per-row latencies: median, IQR, p95, p99. A single mean lies; a distribution tells you whether the tail will page you at 3am.</p>
          </div>
          <div class="dd-card">
            <div class="dd-kicker">Full matrix</div>
            <h4>For the engineer who wants the table</h4>
            <p>Below the hero, every metric as a grid — tabular, monospace, "best" tagged. When a PM forwards the page, the engineer scrolls straight here.</p>
          </div>
          <div class="dd-card">
            <div class="dd-kicker">Five scopes</div>
            <h4>Cross-provider &amp; intra-provider</h4>
            <p>The scope switcher lets you pivot from "Claude vs GPT vs Gemini vs Grok" (flagship) into "Opus vs Sonnet vs Haiku" (Anthropic tiers) or any other provider's internal tiering. Same schema, same components.</p>
          </div>
          <div class="dd-card">
            <div class="dd-kicker">Tradeoff considered</div>
            <h4>Why not a leaderboard?</h4>
            <p>A single scalar ranking hides the shape of the data and tempts over-fitting. The strip shows the distributions as peers; the matrix lets you pick your own composite.</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

function mountCompare() {
  const scope = currentScope();
  const cmp = scope.comparison;
  const allLatencies = cmp.runs.flatMap(r => r.results.filter(x => x.error === null).map(x => x.latency_ms));
  const xmin = Math.max(0, Math.min(...allLatencies) * 0.9);
  const xmax = Math.max(...allLatencies) * 1.05;

  cmp.runs.forEach(run => {
    const id = `dist-${run.config_file.replace(/\W/g,'_')}`;
    const el = document.getElementById(id);
    const samples = latencySamples(run);
    if (!el || samples.length < 2) {
      if (el) el.innerHTML = `<div style="font-family:var(--mono); font-size:11px; color:var(--ink-4); padding:8px 0;">—  not enough samples</div>`;
      return;
    }
    const bg = PROVIDERS[run.provider]?.bg || '#fff';
    window.__CHARTS.renderDistribution(el, samples, { xmin, xmax, fill: bg });
  });

  // Scope switcher
  document.querySelectorAll('#scope-switcher button').forEach(btn => {
    btn.addEventListener('click', () => {
      setScope(btn.dataset.scope);
      window.__APP.navigate('compare');
    });
  });

  // Click a candidate card → jump to detail
  document.querySelectorAll('.prov').forEach(card => {
    card.addEventListener('click', () => {
      const cfg = card.dataset.cfg;
      const idx = cmp.runs.findIndex(r => r.config_file === cfg);
      if (idx >= 0) {
        setCandidate(idx);
        window.__APP.navigate('detail');
      }
    });
  });
}

// =========================================================================
// SCREEN 2 — RUN DETAIL
// =========================================================================
function renderDetail() {
  const scope = currentScope();
  const cmp = scope.comparison;
  const idx = Math.min(SEL.candidateIdx, cmp.runs.length - 1);
  const run = cmp.runs[idx];
  const p = PROVIDERS[run.provider] || { name: run.provider };
  const a = run.aggregate;
  const sRate = a.n_success / a.n;

  // Candidate selector chips
  const candChips = cmp.runs.map((r, i) => `
    <button data-idx="${i}" class="${i === idx ? 'active' : ''}">
      ${PROVIDERS[r.provider]?.name || r.provider} · <span class="mono" style="font-size:10px;">${r.model}</span>
    </button>
  `).join('');

  const rowsHtml = run.results.map((row, i) => {
    const isErr = row.error !== null;
    const promptPreview = row.prompt;
    const responsePreview = isErr ? `<span style="color:var(--err);">${esc(row.error)}</span>` : esc(row.response);
    return `
      <tr class="row-main" data-idx="${i}">
        <td><span class="chev">›</span></td>
        <td class="cid">${row.id}</td>
        <td><div class="cprompt">${esc(promptPreview)}</div></td>
        <td><div class="cresponse">${responsePreview}</div></td>
        <td class="cnum">${row.turns}</td>
        <td class="cnum">${row.latency_ms}ms</td>
        <td class="cnum">$${row.cost_usd.toFixed(6)}</td>
        <td class="cstat">
          ${!isErr
            ? `<span class="tag" style="background:var(--ok-bg); border-color:var(--ok); color:var(--ok);"><span class="dot" style="background:var(--ok);"></span>ok</span>`
            : `<span class="tag" style="background:var(--err-bg); border-color:var(--err); color:var(--err);"><span class="dot" style="background:var(--err);"></span>error</span>`}
        </td>
      </tr>
      <tr class="row-detail" style="display:none;" data-for="${i}">
        <td colspan="8">
          <div class="row-detail-inner">
            <div class="rdcol">
              <div class="rdlabel">Prompt (full)</div>
              <div class="rdbody">${esc(row.prompt)}</div>
            </div>
            <div class="rdcol">
              <div class="rdlabel">Response</div>
              <div class="rdbody">${isErr
                ? `<span style="color:var(--err); font-family:var(--mono); font-size:12px;">${esc(row.error)}</span>`
                : esc(row.response)}</div>
            </div>
            <div class="rdmeta">
              <span>latency <b>${row.latency_ms}ms</b></span>
              <span>in tokens <b>${row.input_tokens}</b></span>
              <span>out tokens <b>${row.output_tokens}</b></span>
              <span>cost <b>$${row.cost_usd.toFixed(6)}</b></span>
              <span>turns <b>${row.turns}</b></span>
            </div>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <div class="page">
      <div class="screen-head">
        <div>
          <div class="screen-kicker">
            <span>Screen 02 · Run detail</span>
            <a data-route="compare" style="color:var(--ink-3); cursor:pointer; text-decoration:underline; text-decoration-color:var(--ink-5); text-underline-offset:2px;">← back to compare</a>
          </div>
          <h1 class="screen-title">${p.name} · ${run.model}</h1>
        </div>
        <div>
          <p class="screen-dek">Every eval, inline. Click a row to read the exact prompt the model saw, what it returned, and how much the turn cost.</p>
        </div>
      </div>

      ${scopeSwitcher()}

      <div class="switcher" id="candidate-switcher" style="margin-bottom:20px;">
        ${candChips}
      </div>

      <div class="run-meta">
        <div class="mitem">
          <div class="l">Provider</div>
          <div class="v serif">${providerDot(run.provider, 18)} ${p.name}</div>
        </div>
        <div class="mitem">
          <div class="l">Model</div>
          <div class="v">${run.model}</div>
        </div>
        <div class="mitem">
          <div class="l">Dataset</div>
          <div class="v">${datasetBasename(cmp.dataset_path)} · ${a.n} evals</div>
        </div>
        <div class="mitem">
          <div class="l">System prompt</div>
          <div class="v" title="${esc(run.systemPrompt || '')}">${truncate(run.systemPrompt || '—', 40)}</div>
        </div>
        <div class="mitem">
          <div class="l">Temperature</div>
          <div class="v">${run.temperature !== undefined ? run.temperature : '—'}</div>
        </div>
        <div class="mitem">
          <div class="l">Max tokens</div>
          <div class="v">${run.maxOutputTokens?.toLocaleString?.() ?? '—'}</div>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:16px; margin-bottom:24px;">
        <div class="panel" style="padding:16px 18px;">
          <div class="section-label" style="margin-bottom:6px;">success</div>
          <div style="font-family:var(--serif); font-size:26px; font-weight:500; letter-spacing:-0.02em;">${fmtPct(sRate)}</div>
          <div class="mono" style="font-size:11px; color:var(--ink-4);">${a.n_success}/${a.n} · ${a.n_error} errors</div>
        </div>
        <div class="panel" style="padding:16px 18px;">
          <div class="section-label" style="margin-bottom:6px;">p50 / p95 / p99</div>
          <div style="font-family:var(--serif); font-size:20px; font-weight:500; letter-spacing:-0.02em;">${a.latency_ms.p50} <span style="color:var(--ink-4);">/ ${a.latency_ms.p95} / ${a.latency_ms.p99}</span><span class="mono" style="font-size:12px; color:var(--ink-3); margin-left:4px;">ms</span></div>
          <div class="mono" style="font-size:11px; color:var(--ink-4);">mean ${a.latency_ms.mean}ms</div>
        </div>
        <div class="panel" style="padding:16px 18px;">
          <div class="section-label" style="margin-bottom:6px;">cost</div>
          <div style="font-family:var(--serif); font-size:26px; font-weight:500; letter-spacing:-0.02em;">${fmtCost(a.cost_usd.total)}</div>
          <div class="mono" style="font-size:11px; color:var(--ink-4);">${fmtCost(a.cost_usd.per_1k_evals)} per 1k · mean $${a.cost_usd.mean.toFixed(6)}</div>
        </div>
        <div class="panel" style="padding:16px 18px;">
          <div class="section-label" style="margin-bottom:6px;">turns</div>
          <div style="font-family:var(--serif); font-size:26px; font-weight:500; letter-spacing:-0.02em;">${a.turns.mean.toFixed(2)}</div>
          <div class="mono" style="font-size:11px; color:var(--ink-4);">mean · max ${a.turns.max}</div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div class="panel-title">Evaluations (${run.results.length} rows)</div>
          <div style="display:flex; gap:8px; align-items:center;">
            <div class="switcher" id="rowfilter">
              <button class="active" data-filter="all">All</button>
              <button data-filter="err">Errors only</button>
              <button data-filter="slow">Slowest</button>
              <button data-filter="cost">Costliest</button>
            </div>
          </div>
        </div>

        <table class="rtable" id="rtable">
          <thead>
            <tr>
              <th style="width:28px;"></th>
              <th style="width:80px;">ID</th>
              <th>Prompt</th>
              <th>Response</th>
              <th style="width:60px; text-align:right;">Turns</th>
              <th style="width:90px; text-align:right;">Latency</th>
              <th style="width:80px; text-align:right;">Cost</th>
              <th style="width:90px; text-align:center;">Status</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>

      <div class="designdoc">
        <div class="designdoc-head">
          <div class="designdoc-title">Why this layout</div>
          <div class="mono" style="font-size:11px;color:var(--ink-4);">screen 02 · rationale</div>
        </div>
        <div class="dd-grid">
          <div class="dd-card">
            <div class="dd-kicker">Rows, not cards</div>
            <h4>Density over prettiness</h4>
            <p>A benchmark table is read left-to-right, row-by-row. Cards would force the eye to jump. Monospace numerics, tabular-nums, and two-line clamped cells preserve scannability without losing context.</p>
          </div>
          <div class="dd-card">
            <div class="dd-kicker">Expand-in-place</div>
            <h4>Click, don't navigate</h4>
            <p>The full prompt and response live under each row. Opening a detail page breaks the rhythm of reviewing evals; expanding in place keeps you in the flow.</p>
          </div>
          <div class="dd-card">
            <div class="dd-kicker">Errors as first-class</div>
            <h4>Red, not missing</h4>
            <p>Failed evals stay in the list, tagged and colored. Filtering them out is optional — you almost always want to see what broke alongside what worked.</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

function mountDetail() {
  // Scope switcher
  document.querySelectorAll('#scope-switcher button').forEach(btn => {
    btn.addEventListener('click', () => {
      setScope(btn.dataset.scope);
      window.__APP.navigate('detail');
    });
  });
  // Candidate switcher
  document.querySelectorAll('#candidate-switcher button').forEach(btn => {
    btn.addEventListener('click', () => {
      setCandidate(Number(btn.dataset.idx));
      window.__APP.navigate('detail');
    });
  });
  // Row expand
  const table = document.getElementById('rtable');
  if (!table) return;
  table.querySelectorAll('tr.row-main').forEach(row => {
    row.addEventListener('click', () => {
      const idx = row.dataset.idx;
      const detail = table.querySelector(`tr.row-detail[data-for="${idx}"]`);
      const isOpen = row.classList.contains('open');
      row.classList.toggle('open', !isOpen);
      detail.style.display = isOpen ? 'none' : '';
    });
  });
  // Row filters (simple show/hide based on status/order)
  const filter = document.getElementById('rowfilter');
  if (filter) {
    filter.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        filter.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        applyRowFilter(btn.dataset.filter);
      });
    });
  }
}

function applyRowFilter(kind) {
  const scope = currentScope();
  const run = scope.comparison.runs[Math.min(SEL.candidateIdx, scope.comparison.runs.length - 1)];
  const rows = Array.from(document.querySelectorAll('#rtable tr.row-main'));
  const details = Array.from(document.querySelectorAll('#rtable tr.row-detail'));

  // Reset
  rows.forEach((r, i) => { r.style.display = ''; details[i].style.display = 'none'; r.classList.remove('open'); });

  if (kind === 'err') {
    rows.forEach((r, i) => {
      const res = run.results[i];
      if (res.error === null) { r.style.display = 'none'; details[i].style.display = 'none'; }
    });
    return;
  }
  if (kind === 'slow' || kind === 'cost') {
    const key = kind === 'slow' ? 'latency_ms' : 'cost_usd';
    const order = [...run.results.map((res, i) => ({ i, v: res[key] }))]
      .sort((a, b) => b.v - a.v).map(x => x.i);
    const topN = Math.max(3, Math.ceil(order.length * 0.4));
    const keep = new Set(order.slice(0, topN));
    rows.forEach((r, i) => {
      if (!keep.has(i)) { r.style.display = 'none'; details[i].style.display = 'none'; }
    });
  }
}

// =========================================================================
// SCREEN 3 — DRILL (historical trend view)
// =========================================================================
function renderDrill() {
  const scope = currentScope();
  const cmp = scope.comparison;

  // We only have a single comparison run per scope in v1 — no historical
  // series yet. Render a friendly empty state that explains how to populate it.
  return `
    <div class="page">
      <div class="screen-head">
        <div>
          <div class="screen-kicker">
            <span>Screen 03 · Drill-down</span>
            <a data-route="compare" style="color:var(--ink-3); cursor:pointer; text-decoration:underline; text-decoration-color:var(--ink-5); text-underline-offset:2px;">← back to compare</a>
          </div>
          <h1 class="screen-title">Trends over time</h1>
        </div>
        <div>
          <p class="screen-dek">One scope, many runs. This is where you spot the moment a model swap moved latency, or a prompt tweak changed the cost curve.</p>
        </div>
      </div>

      ${scopeSwitcher()}

      <div class="panel" style="padding: 36px 40px;">
        <div class="section-label">Not enough runs yet</div>
        <h2 style="font-family:var(--serif); font-weight:500; letter-spacing:-0.02em; margin:8px 0 14px; font-size:28px;">
          <em>${scope.label}</em> has a single comparison so far.
        </h2>
        <p style="font-family:var(--serif); font-size:16px; line-height:1.5; color:var(--ink-2); max-width:640px;">
          Run the comparison a few more times — after a prompt change, a model swap, or just across a quiet week — and this screen will fill in with p50 / p95 / cost / success trend lines, annotated where the model ID or candidate config changed.
        </p>
        <div style="margin-top:24px; padding:18px 20px; background:var(--paper-2); border:1px solid var(--rule-soft); border-radius:10px; font-family:var(--mono); font-size:12.5px; color:var(--ink-2); line-height:1.7;">
          # from the repo root, run the same comparison again:<br>
          <span style="color:var(--ink);">bun ${scope.id === 'flagship' ? 'bench:compare' : `bench:tiers:${scope.id}`}</span><br><br>
          # then regenerate the viewer data:<br>
          <span style="color:var(--ink);">bun viewer:build</span>
        </div>
        <div style="margin-top:24px;">
          <div class="section-label">Current baseline</div>
          <div style="display:grid; grid-template-columns:repeat(${cmp.runs.length}, 1fr); gap:14px;">
            ${cmp.runs.map(run => {
              const a = run.aggregate;
              return `
                <div style="background:#fff; border:1px solid var(--rule-soft); border-radius:10px; padding:14px 16px;">
                  <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                    ${providerDot(run.provider, 14)}
                    <span class="mono" style="font-size:11px; color:var(--ink-3);">${run.model}</span>
                  </div>
                  <div class="mono" style="font-size:12px; color:var(--ink-2); line-height:1.7;">
                    p50 · <b>${a.latency_ms.p50}ms</b><br>
                    p95 · <b>${a.latency_ms.p95}ms</b><br>
                    $/1k · <b>${fmtCost(a.cost_usd.per_1k_evals)}</b><br>
                    ok · <b>${a.n_success}/${a.n}</b>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>

      <div class="designdoc">
        <div class="designdoc-head">
          <div class="designdoc-title">Why this layout (when populated)</div>
          <div class="mono" style="font-size:11px;color:var(--ink-4);">screen 03 · rationale</div>
        </div>
        <div class="dd-grid">
          <div class="dd-card">
            <div class="dd-kicker">Four small charts</div>
            <h4>Not one big one</h4>
            <p>The temptation is a single chart with every metric on double Y-axes. It never reads well. Four small charts share an X axis; the eye does the correlation automatically.</p>
          </div>
          <div class="dd-card">
            <div class="dd-kicker">Annotated shifts</div>
            <h4>Dashed lines earn their place</h4>
            <p>When a candidate's model ID changes between runs, a dashed vertical rule gets added to each chart with a short label. The "What changed" card is the human-readable version of the same markers.</p>
          </div>
          <div class="dd-card">
            <div class="dd-kicker">Tradeoff considered</div>
            <h4>Why not a heatmap?</h4>
            <p>Heatmaps are good for dense multivariate data. Here you'd have ~10–50 points in 4 metrics — line charts with markers are more legible and invite clicking through to the individual run.</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

function mountDrill() {
  document.querySelectorAll('#scope-switcher button').forEach(btn => {
    btn.addEventListener('click', () => {
      setScope(btn.dataset.scope);
      window.__APP.navigate('drill');
    });
  });
}

// =========================================================================
// SCREEN 4 — SPEC
// =========================================================================
function renderSpec() {
  const totalRuns = BENCH.scopes.reduce((n, s) => n + s.comparison.runs.length, 0);
  const totalEvals = BENCH.scopes.reduce(
    (n, s) => n + s.comparison.runs.reduce((m, r) => m + r.aggregate.n, 0), 0,
  );

  return `
    <div class="page">
      <div class="screen-head">
        <div>
          <div class="screen-kicker"><span>Screen 04 · Spec</span></div>
          <h1 class="screen-title">Design rationale &amp; component inventory</h1>
        </div>
        <div>
          <p class="screen-dek">A short memo: what the surface is for, who it is for, the principles that govern it, and the atoms it's built from.</p>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 320px; gap:48px;">
        <div style="font-family:var(--serif); font-size:17px; line-height:1.6; color:var(--ink-2); max-width:720px;">

          <h2 style="font-family:var(--serif); font-size:26px; font-weight:500; letter-spacing:-0.02em; margin:0 0 14px; color:var(--ink);">Who this is for</h2>
          <p>Two readers. The <strong>engineer</strong> picking a provider for a new feature: they need the distribution, not the average, and they need to click into the rows that failed. The <strong>PM or lead</strong> making a budget call: they want three numbers per provider and a clear winner badge they can paste into a doc.</p>
          <p>Everything on these four screens exists to serve one of those two jobs. Anything that doesn't, we cut.</p>

          <h2 style="font-family:var(--serif); font-size:26px; font-weight:500; letter-spacing:-0.02em; margin:36px 0 14px; color:var(--ink);">Principles</h2>
          <ul style="padding-left:20px;">
            <li style="margin-bottom:10px;"><strong>Distributions over means.</strong> Every latency number is accompanied by its shape. Means lie about tails; tails wake people up at 3am.</li>
            <li style="margin-bottom:10px;"><strong>Evidence one click away.</strong> You can always get from a comparison cell to the actual prompt and response behind it — never deeper than two clicks.</li>
            <li style="margin-bottom:10px;"><strong>Errors in the list, not beside it.</strong> Failed evals stay inline with the good ones; filtering them is optional. Hiding failures is how people ship bad agents.</li>
            <li style="margin-bottom:10px;"><strong>Editorial, on purpose.</strong> Paper and serif because this is read, not just glanced at. A dashboard that reads like a document gets forwarded; a dashboard that reads like Grafana gets screenshotted and lost.</li>
          </ul>

          <h2 style="font-family:var(--serif); font-size:26px; font-weight:500; letter-spacing:-0.02em; margin:36px 0 14px; color:var(--ink);">The four screens</h2>
          <p><strong>01 Compare</strong> — the landing. Up to four candidates, one dataset, three numbers each. Built for forwarding.</p>
          <p><strong>02 Run detail</strong> — dense table, expand-in-place rows. Built for an engineer reviewing what the model actually wrote.</p>
          <p><strong>03 Drill-down</strong> — one scope over time. Built for spotting when something changed and correlating it with a model/prompt swap.</p>
          <p><strong>04 Spec</strong> — this page.</p>

          <h2 style="font-family:var(--serif); font-size:26px; font-weight:500; letter-spacing:-0.02em; margin:36px 0 14px; color:var(--ink);">Current data</h2>
          <p>This build has <strong>${BENCH.scopes.length} scopes</strong> wired up · <strong>${totalRuns} candidate runs</strong> total · <strong>${totalEvals} eval rows</strong> across all scopes. The scope switcher at the top of every screen pivots between them.</p>

          <h2 style="font-family:var(--serif); font-size:26px; font-weight:500; letter-spacing:-0.02em; margin:36px 0 14px; color:var(--ink);">Component inventory</h2>
          <div class="inv-grid" style="margin-bottom:28px;">
            <div class="inv-cell"><div class="inv-name">&lt;prov-card&gt;</div><div class="inv-desc">Candidate hero card. Three metric slots, distribution strip, winner state.</div></div>
            <div class="inv-cell"><div class="inv-name">&lt;metric&gt;</div><div class="inv-desc">Label + serif value + unit + monospace delta. Used inside cards and summary panels.</div></div>
            <div class="inv-cell"><div class="inv-name">&lt;dist-viz&gt;</div><div class="inv-desc">Swappable: box plot, strip, histogram. Built from per-row latencies. Tweaks toggle changes all instances.</div></div>
            <div class="inv-cell"><div class="inv-name">&lt;matrix&gt;</div><div class="inv-desc">Row = metric, column = candidate. Tabular-nums, "best" badge per row.</div></div>
            <div class="inv-cell"><div class="inv-name">&lt;run-meta&gt;</div><div class="inv-desc">Six-slot metadata strip. Provider, model, dataset, system prompt, temperature, max tokens.</div></div>
            <div class="inv-cell"><div class="inv-name">&lt;rtable&gt;</div><div class="inv-desc">Eval table with expand-in-place rows; two-line clamp on prompt/response.</div></div>
            <div class="inv-cell"><div class="inv-name">&lt;scope-switcher&gt;</div><div class="inv-desc">Pivot between flagship cross-provider and each provider's intra-tier view.</div></div>
            <div class="inv-cell"><div class="inv-name">&lt;trend-line&gt;</div><div class="inv-desc">Small multiple with dashed rules at model shifts. Empty state when history is thin.</div></div>
            <div class="inv-cell"><div class="inv-name">&lt;tweaks&gt;</div><div class="inv-desc">Bottom-right panel. Theme, density, distribution viz, hero metric.</div></div>
          </div>

          <h2 style="font-family:var(--serif); font-size:26px; font-weight:500; letter-spacing:-0.02em; margin:36px 0 14px; color:var(--ink);">What's deliberately missing</h2>
          <p><strong>No leaderboard.</strong> A single ranking flattens the trade-off. The strip + matrix + badges do the job without forcing one.</p>
          <p><strong>No autoplay.</strong> The page does not refresh on its own. Benchmarks are compared deliberately — you press Run again when you mean to.</p>
          <p><strong>No dark-patterned "best" framing.</strong> The winner gets a subtle border, not a glow. Most candidates lose on any given metric; we don't need to celebrate.</p>

        </div>

        <aside>
          <div class="rationale" style="position:sticky; top:88px;">
            <div class="rat-label">Open questions</div>
            <p>Should the matrix be sortable by column header? (Current answer: no — the "best" tag carries the signal.)</p>
            <p>Do we need a cost-per-token breakdown on the detail screen? (Leaning yes for v0.4.)</p>
            <p>Where should saved comparison snapshots live? (Current answer: file paths in the repo; permalink via comparison_id.)</p>
          </div>
        </aside>
      </div>
    </div>
  `;
}

// =========================================================================
// Helpers
// =========================================================================
function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function truncate(s, n) {
  if (!s) return s;
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
function datasetBasename(p) {
  if (!p) return '—';
  const parts = p.split('/');
  // up two: <scope-dir>/dataset.jsonl  → "<scope-dir>/dataset.jsonl"
  return parts.slice(-2).join('/');
}
function humanAgo(d) {
  const diff = Date.now() - d.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)       return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)       return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24)       return `${h} hr ago`;
  const day = Math.floor(h / 24);
  return `${day} d ago`;
}
function scopeHeadline(scope) {
  if (scope.kind === 'flagship') return `Four providers, same dataset.`;
  return `${PROVIDERS[scope.provider]?.name || scope.provider} tiers, side by side.`;
}
function scopeDek(scope) {
  if (scope.kind === 'flagship')
    return `A single scroll you can forward to a PM. Rank candidates by speed, money, or reliability — then click through to the row-by-row evidence.`;
  return `Compare this provider's flagship, balanced, and fast tiers on identical inputs. Where does paying more actually buy you something?`;
}

// Expose
window.__SCREENS = {
  compare: { render: renderCompare, mount: mountCompare },
  detail:  { render: renderDetail,  mount: mountDetail  },
  drill:   { render: renderDrill,   mount: mountDrill   },
  spec:    { render: renderSpec,    mount: () => {}     },
};
