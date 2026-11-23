const DATA = window.RADAR;

let currentSort = { key: 'implied', dir: -1 };
let filteredRows = [];
let selectedRow = null;

function fmtUsd(n) {
  if (n >= 1e12) return '$' + (n / 1e12).toFixed(1) + 'T';
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toLocaleString();
}

function fmtPct(n) {
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
}

function fmtNum(n, decimals = 2) {
  return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function init() {
  renderModelIntegrity();
  renderKPIs();
  applyFilters();
  renderBoard();
  renderCardStrips();
  bindEvents();
}

function renderModelIntegrity() {
  const fit = DATA.meta.fit;
  const container = document.getElementById('modelIntegrity');
  container.innerHTML = `
    <span class="chip">Ridge λ=0.25, ${fit.bearers} bearers</span>
    <span class="chip">LOO factor: ${fit.loo_factor.toFixed(2)}×</span>
    <span class="chip">Walk-forward: ${fit.walk_forward_factor.toFixed(2)}×</span>
    <span class="chip">Residual IQR: [${fit.residual_q25.toFixed(2)}, ${fit.residual_q75.toFixed(2)}]</span>
    <span class="chip">Global odds: ${(fit.global_odds * 100).toFixed(1)}%</span>
    <span class="chip">Features: ${fit.coefficients.map(c => c.name).join(', ')}</span>
  `;

  document.getElementById('looFactor').textContent = fit.loo_factor.toFixed(2);
  document.getElementById('wfFactor').textContent = fit.walk_forward_factor.toFixed(2);
  document.getElementById('q25').textContent = fit.residual_q25.toFixed(2);
  document.getElementById('q75').textContent = fit.residual_q75.toFixed(2);
}

function renderKPIs() {
  const watchlistRows = DATA.rows.filter(r => r.on_watchlist);
  const medianMultiple = DATA.rows.length > 0
    ? DATA.rows.map(r => r.launch_multiple).sort((a, b) => a - b)[Math.floor(DATA.rows.length / 2)]
    : 0;
  const bestVerdict = DATA.rows.length > 0
    ? Math.max(...DATA.rows.map(r => r.verdict_usd_per_hour))
    : 0;
  const watchlistCoverage = (watchlistRows.length / DATA.watchlist_size * 100).toFixed(1);

  document.getElementById('kpiCards').innerHTML = `
    <div class="kpi"><span class="kpi-value">${DATA.watchlist_size}</span><span class="kpi-label">Watchlist</span></div>
    <div class="kpi"><span class="kpi-value">${medianMultiple.toFixed(3)}x</span><span class="kpi-label">Median Multiple</span></div>
    <div class="kpi"><span class="kpi-value">${fmtUsd(bestVerdict)}/h</span><span class="kpi-label">Best $/hr Farm</span></div>
    <div class="kpi"><span class="kpi-value">${watchlistCoverage}%</span><span class="kpi-label">Watchlist Coverage</span></div>
  `;
}

function applyFilters() {
  const search = document.getElementById('searchInput').value.toLowerCase();
  const watchlistOnly = document.getElementById('watchlistOnly').checked;
  const statusFilter = document.getElementById('statusFilter').value;

  filteredRows = DATA.rows.filter(r => {
    const matchesSearch = r.slug.toLowerCase().includes(search) ||
      r.name.toLowerCase().includes(search) ||
      r.category.toLowerCase().includes(search);
    const matchesWatchlist = !watchlistOnly || r.on_watchlist;
    const status = r.on_watchlist ? 'watchlist' : 'early';
    const matchesStatus = statusFilter === 'all' || statusFilter === status;
    return matchesSearch && matchesWatchlist && matchesStatus;
  });

  sortRows(currentSort.key, currentSort.dir);
}

function sortRows(key, dir) {
  currentSort = { key, dir };
  const getVal = (r) => {
    switch (key) {
      case 'rank': return r.rank;
      case 'token': return r.slug;
      case 'tvl': return r.tvl_usd;
      case 'implied': return r.implied_value_usd;
      case 'fitted': return r.launch_multiple;
      case 'odds': return r.token_odds;
      case 'growth': return r.change_7d;
      case 'verdict': return r.verdict_usd_per_hour;
      case 'status': return r.on_watchlist ? 'watchlist' : 'early';
      default: return r.implied_value_usd;
    }
  };
  filteredRows.sort((a, b) => {
    const av = getVal(a), bv = getVal(b);
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
  renderBoard();
  updateSortHeaders();
}

function updateSortHeaders() {
  document.querySelectorAll('#boardTable th[data-sort]').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.sort === currentSort.key) {
      th.classList.add(currentSort.dir === 1 ? 'sort-asc' : 'sort-desc');
    }
  });
}

function renderBoard() {
  const tbody = document.getElementById('boardBody');
  tbody.innerHTML = filteredRows.map(r => `
    <tr data-slug="${r.slug}" class="${r.on_watchlist ? 'watchlist-row' : ''}">
      <td>${r.rank}</td>
      <td class="token-cell">
        <span class="slug">${r.slug}</span>
        <span class="name">${r.name}</span>
        <span class="category">${r.category}</span>
      </td>
      <td>${fmtUsd(r.tvl_usd)}</td>
      <td>${fmtUsd(r.implied_value_usd)}</td>
      <td>${r.launch_multiple.toFixed(4)}x</td>
      <td>${(r.token_odds * 100).toFixed(1)}%</td>
      <td class="${r.change_7d >= 0 ? 'positive' : 'negative'}">${fmtPct(r.change_7d)}</td>
      <td>${fmtUsd(r.verdict_usd_per_hour)}/h</td>
      <td><span class="status ${r.on_watchlist ? 'watchlist' : 'early'}">${r.on_watchlist ? 'Watchlist' : 'Early'}</span></td>
      <td class="watchlist-col"><input type="checkbox" class="row-check" ${r.on_watchlist ? 'checked' : ''} ${!r.on_watchlist ? 'disabled' : ''}></td>
    </tr>
  `).join('');

  document.querySelectorAll('#boardBody tr').forEach(tr => {
    tr.addEventListener('click', (e) => {
      if (e.target.type === 'checkbox') return;
      openDrawer(tr.dataset.slug);
    });
  });
}

function renderCardStrips() {
  const hotMovers = [...DATA.rows]
    .filter(r => r.change_7d > 0)
    .sort((a, b) => b.change_7d - a.change_7d)
    .slice(0, 5);

  const freshLaunches = [...DATA.live]
    .sort((a, b) => b.mcap_usd - a.mcap_usd)
    .slice(0, 5);

  document.getElementById('hotMovers').innerHTML = `
    <h3>Hot Movers (7d)</h3>
    <div class="card-grid">
      ${hotMovers.map(r => `<div class="card"><strong>${r.name}</strong><br>${fmtPct(r.change_7d)}<br>${fmtUsd(r.implied_value_usd)} implied</div>`).join('')}
    </div>
  `;

  document.getElementById('freshLaunches').innerHTML = `
    <h3>Fresh Launches (Live)</h3>
    <div class="card-grid">
      ${freshLaunches.map(r => `<div class="card"><strong>${r.name}</strong><br>${fmtUsd(r.mcap_usd)} mcap<br>${r.multiple.toFixed(2)}x multiple</div>`).join('')}
    </div>
  `;
}

function openDrawer(slug) {
  const row = DATA.rows.find(r => r.slug === slug);
  if (!row) return;

  selectedRow = row;
  document.getElementById('drawerTitle').textContent = `${row.name} (${row.slug})`;
  document.getElementById('drawerContent').innerHTML = `
    <div class="breakdown">
      <div class="breakdown-row"><span>TVL</span><span>${fmtUsd(row.tvl_usd)}</span></div>
      <div class="breakdown-row"><span>Fitted Multiple (exp(w·x))</span><span>${row.launch_multiple.toFixed(4)}x</span></div>
      <div class="breakdown-row"><span>Token Odds</span><span>${(row.token_odds * 100).toFixed(1)}%</span></div>
      <div class="breakdown-row"><span>Farm Verdict</span><span>${fmtUsd(row.farm_cost_usd)} cost, ${row.farm_hours.toFixed(1)}h</span></div>
      <div class="breakdown-row"><span>Scenario Low</span><span>${fmtUsd(row.scenario_low)}</span></div>
      <div class="breakdown-row"><span>Scenario Mid</span><span>${fmtUsd(row.scenario_mid)}</span></div>
      <div class="breakdown-row"><span>Scenario High</span><span>${fmtUsd(row.scenario_high)}</span></div>
    </div>
    <div class="formula">implied = clamp( tvl × exp(w·x) × token_odds )</div>
    <div class="farm-steps">
      <h4>Farm Steps</h4>
      <ol>${row.farm_steps.map(s => `<li>${s}</li>`).join('')}</ol>
    </div>
  `;
  document.getElementById('drawer').classList.add('open');
}

function bindEvents() {
  document.getElementById('searchInput').addEventListener('input', () => { applyFilters(); });
  document.getElementById('watchlistOnly').addEventListener('change', () => { applyFilters(); });
  document.getElementById('statusFilter').addEventListener('change', () => { applyFilters(); });

  document.querySelectorAll('#boardTable th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      const dir = (currentSort.key === key && currentSort.dir === -1) ? 1 : -1;
      sortRows(key, dir);
    });
  });

  document.getElementById('closeDrawer').addEventListener('click', () => {
    document.getElementById('drawer').classList.remove('open');
  });

  document.getElementById('selectAll').addEventListener('change', (e) => {
    document.querySelectorAll('.row-check').forEach(cb => { cb.checked = e.target.checked; });
  });
}

document.addEventListener('DOMContentLoaded', init);