(function () {
  'use strict';

  var DATA = window.RADAR_DATA || window.RADAR;
  var rows = DATA && Array.isArray(DATA.rows) ? DATA.rows : [];
  var meta = DATA && DATA.model ? DATA.model : DATA && DATA.meta ? DATA.meta : {};
  var M = meta.constants || {};
  var cats = meta.categoryPercentiles || meta.category_percentiles || {};
  var globalP = meta.globalPercentiles || meta.global_percentiles || { p25: 0, p50: 1, p75: 1 };
  var majorChains = meta.majorChains || meta.major_chains || ['Ethereum', 'Solana', 'Base', 'Arbitrum', 'BSC', 'Optimism', 'Polygon'];
  var asOf = DATA && DATA.as_of ? DATA.as_of : meta.as_of || 'unknown';
  var floorUsd = DATA && DATA.floor_usd != null ? DATA.floor_usd : meta.floor_usd != null ? meta.floor_usd : 0;
  var sourceText = DATA && DATA.source ? DATA.source : meta.source || 'snapshot';
  var modelVersion = DATA && DATA.model_version ? DATA.model_version : meta.version || meta.model_version || 'radar';
  var DAY_MS = 86400000;

  var el = {
    q: document.getElementById('q'),
    integrityChips: document.getElementById('integrityChips'),
    category: document.getElementById('category'),
    chain: document.getElementById('chain'),
    watchOnly: document.getElementById('watchOnly'),
    minTvl: document.getElementById('minTvl'),
    minTvlOut: document.getElementById('minTvlOut'),
    reset: document.getElementById('reset'),
    emptyReset: document.getElementById('emptyReset'),
    count: document.getElementById('count'),
    chips: document.getElementById('chips'),
    heroMeta: document.getElementById('heroMeta'),
    headRow: document.getElementById('headRow'),
    tbody: document.getElementById('tbody'),
    empty: document.getElementById('empty'),
    boardMeta: document.getElementById('boardMeta'),
    hotCards: document.getElementById('hotCards'),
    freshCards: document.getElementById('freshCards'),
    drawer: document.getElementById('drawer'),
    drawerMeta: document.getElementById('drawerMeta'),
    drawerBody: document.getElementById('drawerBody'),
    drawerClose: document.getElementById('drawerClose'),
    backdrop: document.getElementById('backdrop')
  };

  var state = {
    q: '',
    category: 'all',
    chain: 'all',
    watchOnly: false,
    minTvl: 0,
    sort: 'implied',
    dir: -1,
    selected: null
  };

  var DEFAULT_DIR = { rank: 1, implied: -1, tvl: -1, change: -1, age: 1, name: 1, odds: -1, verdict: -1 };
  var SORT_LABEL = { rank: 'rank', implied: 'implied value', tvl: 'TVL', change: 'seven-day change', age: 'age', name: 'name', odds: 'token odds', verdict: 'farm verdict' };
  var fit = meta.fit || null;

  function num(value, fallback) {
    return typeof value === 'number' && isFinite(value) ? value : fallback;
  }
  var K = {
    momentum_weight: num(M.momentum_weight, 0.5),
    momentum_floor: num(M.momentum_floor, -0.5),
    momentum_cap: num(M.momentum_cap, 2),
    age_weight: num(M.age_weight, 0.08),
    age_max_years: num(M.age_max_years, 6),
    age_fallback_years: num(M.age_fallback_years, 3),
    chain_distinct_bonus: num(M.chain_distinct_bonus, 0.04),
    chain_major_bonus: num(M.chain_major_bonus, 0.06),
    chain_weight_cap: num(M.chain_weight_cap, 1.6),
    clamp_min_usd: num(M.clamp_min_usd, 1000000),
    clamp_tvl_share: num(M.clamp_tvl_share, 0.2),
    clamp_max_usd: num(M.clamp_max_usd, 100000000000000)
  };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;';
    });
  }
  function fmtUsd(n) {
    if (n == null || !isFinite(n)) return 'n/a';
    var abs = Math.abs(n);
    if (abs >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n == null || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days == null || !isFinite(days)) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) {
    if (n == null || !isFinite(n)) return 'n/a';
    return Number(n).toFixed(2) + '×';
  }
  function fmtOdds(n) {
    if (n == null || !isFinite(n)) return 'n/a';
    return Math.round(n * 100) + '%';
  }
  function fmtPerHour(n) {
    if (n == null || !isFinite(n)) return 'n/a';
    if (n >= 1000) return '$' + Math.round(n / 1000) + 'K/h';
    if (n >= 1) return '$' + n.toFixed(0) + '/h';
    return '<$1/h';
  }
  function catOf(row) {
    return row.category || 'Other';
  }
  function chainsLabel(row) {
    var chains = row.chains || [];
    if (chains.length === 0) return 'unnamed chain';
    var shown = chains.slice(0, 3).join(', ');
    if (chains.length > 3) shown += ' +' + (chains.length - 3);
    return shown;
  }
  function ageDaysOf(row) {
    if (row.age_days != null && isFinite(row.age_days)) return row.age_days;
    if (row.listed_at && asOf && asOf !== 'unknown') {
      var a = Date.parse(asOf + 'T00:00:00Z');
      var b = Date.parse(row.listed_at + 'T00:00:00Z');
      if (isFinite(a) && isFinite(b)) return Math.max(0, Math.floor((a - b) / DAY_MS));
    }
    return null;
  }

  function catPercentiles(row) {
    var ps = cats[catOf(row)] || globalP;
    return ps || { p25: 0, p50: 1, p75: 1 };
  }
  function chainWeight(row) {
    var chains = (row.chains || []).map(function (c) { return String(c).trim().toLowerCase(); });
    var distinct = new Set(chains).size;
    var majorSet = new Set(majorChains.map(function (c) { return String(c).trim().toLowerCase(); }));
    var major = new Set(chains.filter(function (c) { return majorSet.has(c); })).size;
    var distinctBonus = K.chain_distinct_bonus * Math.max(0, Math.min(distinct, K.age_max_years) - 1);
    var majorBonus = K.chain_major_bonus * Math.min(major, K.age_max_years);
    return Math.min(K.chain_weight_cap, 1 + distinctBonus + majorBonus);
  }
  function momentumOf(row) {
    var growth = row.change_7d == null ? 0 : row.change_7d;
    var clamped = Math.max(K.momentum_floor, Math.min(K.momentum_cap, growth / 100));
    return 1 + clamped * K.momentum_weight;
  }
  function ageMultOf(row) {
    var days = ageDaysOf(row);
    var years = days == null ? K.age_fallback_years : days / 365;
    return 1 + Math.min(Math.max(years, 0), K.age_max_years) * K.age_weight;
  }
  function breakdown(row) {
    var mult = num(row.launch_multiple, 0);
    var odds = num(row.token_odds, 1);
    var raw = row.tvl_usd * mult * odds;
    var lower = Math.max(K.clamp_min_usd, Math.round(row.tvl_usd * K.clamp_tvl_share));
    var implied = Math.min(K.clamp_max_usd, Math.max(lower, Math.round(raw)));
    return { mult: mult, odds: odds, raw: raw, implied: implied };
  }

  function fallbackPlan(row) {
    var chains = row.chains || [];
    var chain = chains.length > 0 ? chains[0] : 'its main chain';
    var capital = row.tvl_usd >= 5e9 ? 250 : row.tvl_usd >= 1e9 ? 150 : row.tvl_usd >= 1e8 ? 100 : 50;
    var distinct = new Set(chains.map(function (c) { return String(c).trim().toLowerCase(); })).size;
    var gas = distinct >= 4 ? 12 : distinct >= 2 ? 8 : capital >= 150 ? 8 : 4;
    var age = ageDaysOf(row);
    var hold = age == null ? 30 : age < 180 ? 60 : age < 365 ? 45 : 30;
    var c = (row.category || '').toLowerCase();
    var action = 'Deposit $' + capital + ' of USDC into ' + row.name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) {
      action = 'Supply $' + capital + ' of USDC to ' + row.name + ' on ' + chain + ' and keep the position open.';
    } else if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0) {
      action = 'Provide $' + capital + ' of liquidity to ' + row.name + ' on ' + chain + ' and keep the position open.';
    } else if (c.indexOf('bridge') >= 0) {
      action = 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + row.name + ' and use the funds in its app.';
    } else if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) {
      action = 'Stake $' + capital + ' of the chain asset through ' + row.name + ' and keep the receipt.';
    } else if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) {
      action = 'Deposit $' + capital + ' of USDC as margin on ' + row.name + ' and open one small hedge.';
    } else if (c.indexOf('prediction') >= 0) {
      action = 'Fund $' + capital + ' and place one market position on ' + row.name + '.';
    } else if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) {
      action = 'Deposit $' + capital + ' into a ' + row.name + ' vault on ' + chain + ' and keep the shares.';
    }
    return [
      { text: 'Create a fresh wallet for this farm only, write its seed phrase offline, and fund it from a wallet you control.', cost: '$2 gas', time: '5 minutes' },
      { text: 'Confirm ' + row.name + ' uses the official app on ' + chain + ' before approving any contract.', cost: '$3 gas', time: '10 minutes' },
      { text: action, cost: '$' + capital + ' capital + $' + gas + ' gas', time: '15 minutes' },
      { text: 'Make one qualifying action each week, such as a deposit, borrow, swap or vote.', cost: '$2 gas/week', time: '10 minutes/week' },
      { text: 'Hold the position for at least ' + hold + ' days so more than one snapshot counts it.', cost: '$' + capital + ' held', time: hold + ' days' },
      { text: 'Claim only from ' + row.name + ' official points or rewards page.', cost: '$0', time: '10 minutes' },
      { text: 'Log the wallet address, dates and transactions so the position can be repeated or unwound.', cost: '$0', time: '5 minutes' }
    ];
  }
  function planOf(row) {
    if (Array.isArray(row.farm_steps) && row.farm_steps.length > 0) {
      return row.farm_steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var text = at >= 0 ? s.slice(0, at) : s;
        var rest = at >= 0 ? s.slice(at + 7) : '';
        var ti = rest.indexOf('. Time: ');
        var cost = ti >= 0 ? rest.slice(0, ti) : rest.replace(/\.$/, '');
        var time = ti >= 0 ? rest.slice(ti + 7).replace(/\.$/, '') : '';
        return { text: text, cost: cost, time: time };
      });
    }
    return fallbackPlan(row);
  }

  function findRow(slug) {
    for (var i = 0; i < rows.length; i++) if (rows[i].slug === slug) return rows[i];
    return null;
  }

  function readHash() {
    var raw = window.location.hash.replace(/^#/, '');
    var qi = raw.indexOf('?');
    var path = qi >= 0 ? raw.slice(0, qi) : raw;
    var query = qi >= 0 ? raw.slice(qi + 1) : '';
    if (path.charAt(0) === '/') path = path.slice(1);
    if (path) {
      try { state.selected = decodeURIComponent(path); } catch (err) { state.selected = path; }
    }
    var params = new URLSearchParams(query);
    if (params.get('q')) state.q = params.get('q');
    var sortParam = params.get('sort');
    if (sortParam && DEFAULT_DIR[sortParam] !== undefined) state.sort = sortParam;
    var dirParam = params.get('dir');
    if (dirParam === '1' || dirParam === '-1') state.dir = Number(dirParam);
    else state.dir = DEFAULT_DIR[state.sort];
    var categoryParam = params.get('category');
    if (categoryParam) state.category = categoryParam;
    var chainParam = params.get('chain');
    if (chainParam) state.chain = chainParam;
    var watchParam = params.get('watch');
    if (watchParam === '1' || watchParam === 'true') state.watchOnly = true;
    var minParam = params.get('min');
    if (minParam !== null && isFinite(Number(minParam)) && Number(minParam) >= 0) state.minTvl = Number(minParam);
  }

  function writeHash() {
    var params = new URLSearchParams();
    params.set('sort', state.sort);
    params.set('dir', String(state.dir));
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watchOnly) params.set('watch', '1');
    if (state.minTvl > 0) params.set('min', String(state.minTvl));
    var path = state.selected ? '/' + encodeURIComponent(state.selected) : '/';
    window.history.replaceState(null, '', '#' + path + '?' + params.toString());
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var chain = state.chain.toLowerCase();
    return rows.filter(function (r) {
      if (state.category !== 'all' && catOf(r) !== state.category) return false;
      if (state.chain !== 'all') {
        var has = false;
        (r.chains || []).forEach(function (c) { if (String(c).toLowerCase() === chain) has = true; });
        if (!has) return false;
      }
      if (state.watchOnly && !r.on_watchlist) return false;
      if (r.tvl_usd < state.minTvl) return false;
      if (q) {
        var hay = [r.name, r.slug, catOf(r), (r.chains || []).join(' ')].join(' ').toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  function sortedRows(list) {
    var dir = state.dir;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (state.sort === 'rank') { av = a.rank; bv = b.rank; }
      else if (state.sort === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (state.sort === 'change') { av = a.change_7d == null ? -Infinity : a.change_7d; bv = b.change_7d == null ? -Infinity : b.change_7d; }
      else if (state.sort === 'age') { av = ageDaysOf(a) == null ? Infinity : ageDaysOf(a); bv = ageDaysOf(b) == null ? Infinity : ageDaysOf(b); }
      else if (state.sort === 'name') { av = String(a.name).toLowerCase(); bv = String(b.name).toLowerCase(); }
      else if (state.sort === 'odds') { av = a.token_odds == null ? -Infinity : a.token_odds; bv = b.token_odds == null ? -Infinity : b.token_odds; }
      else if (state.sort === 'verdict') { av = a.verdict_usd_per_hour == null ? -Infinity : a.verdict_usd_per_hour; bv = b.verdict_usd_per_hour == null ? -Infinity : b.verdict_usd_per_hour; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av === bv) return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
      return av < bv ? -dir : dir;
    });
  }

  function renderHero() {
    el.heroMeta.innerHTML = '<span>Snapshot ' + esc(asOf) + '</span><span>' + esc(sourceText) + '</span><span>' + esc(modelVersion) + ' model</span>';
  }

  function renderChips() {
    var watchSize = DATA.watchlist_size != null ? DATA.watchlist_size : rows.filter(function (r) { return r.on_watchlist; }).length;
    var boardSize = DATA.board_size != null ? DATA.board_size : rows.length;
    var earlySize = DATA.early_size != null ? DATA.early_size : rows.filter(function (r) { return !r.on_watchlist; }).length;
    var liveSize = DATA.live_size != null ? DATA.live_size : 0;
    var items = [
      ['Snapshot', asOf],
      ['Floor', fmtUsd(floorUsd)],
      ['Watchlist', watchSize + ' protocols'],
      ['Scored', boardSize + ' rows'],
      ['Early', earlySize + ' below floor'],
      ['Live', liveSize + ' set aside']
    ];
    el.chips.innerHTML = items.map(function (item) {
      return '<div class="chip"><span>' + esc(item[0]) + '</span><b>' + esc(String(item[1])) + '</b></div>';
    }).join('');
  }

  function renderIntegrity() {
    if (!el.integrityChips) return;
    if (!fit) { el.integrityChips.innerHTML = '<div class="ichip"><span>fit</span><b>peer percentiles</b></div>'; return; }
    var coefs = Array.isArray(fit.coefficients) ? fit.coefficients.slice(1, 4).map(function (c) { return c.name.split(' ')[0] + ' ' + c.weight; }).join(', ') : '';
    var items = [
      ['Fit', 'ridge on log(mcap/tvl), n=' + (fit.bearers != null ? fit.bearers : '?') + ' token-bearing'],
      ['Held out', 'LOO ×' + (fit.loo_factor != null ? fit.loo_factor : '?')],
      ['Walk-forward', '×' + (fit.walk_forward_factor != null ? fit.walk_forward_factor : '?')],
      ['Residual IQR', fmtMult(fit.residual_q25) + ' to ' + fmtMult(fit.residual_q75)],
      ['Token odds', 'global ' + fmtOdds(fit.global_odds)],
      ['Terms', coefs],
      ['Watchlist', (DATA.watchlist_size || 0) + '/' + (DATA.watchlist_size || 0) + ' covered']
    ];
    el.integrityChips.innerHTML = items.map(function (item) {
      return '<div class="ichip"><span>' + esc(item[0]) + '</span><b>' + esc(item[1]) + '</b></div>';
    }).join('');
  }

  function initControls() {
    var categories = Array.from(new Set(rows.map(catOf))).sort();
    el.category.innerHTML = '<option value="all">All categories</option>' + categories.map(function (c) {
      return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
    }).join('');
    if (categories.indexOf(state.category) < 0) state.category = 'all';
    el.category.value = state.category;

    var chainSet = new Set();
    rows.forEach(function (r) {
      (r.chains || []).forEach(function (c) { chainSet.add(c); });
    });
    var chains = Array.from(chainSet).sort();
    el.chain.innerHTML = '<option value="all">All chains</option>' + chains.map(function (c) {
      return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
    }).join('');
    if (chains.indexOf(state.chain) < 0) state.chain = 'all';
    el.chain.value = state.chain;

    var maxTvl = rows.length > 0 ? Math.max.apply(null, rows.map(function (r) { return r.tvl_usd; })) : 1;
    var sliderMax = Math.ceil(maxTvl / 1e8) * 1e8;
    el.minTvl.max = String(sliderMax);
    el.minTvl.step = String(Math.max(1, Math.round(sliderMax / 200)));
    el.minTvl.value = String(state.minTvl);
    el.minTvlOut.textContent = fmtUsd(state.minTvl);
    el.q.value = state.q;
    el.watchOnly.checked = state.watchOnly;
  }

  function renderHead() {
    el.headRow.innerHTML = '';
    var headers = [
      { key: 'rank', label: 'Rank' },
      { key: null, label: 'Protocol' },
      { key: 'tvl', label: 'TVL' },
      { key: 'change', label: '7d' },
      { key: 'age', label: 'Age' },
      { key: 'odds', label: 'Odds' },
      { key: 'implied', label: 'Implied value' },
      { key: 'verdict', label: 'Farm $/h' },
      { key: null, label: 'Token' }
    ];
    headers.forEach(function (h) {
      var th = document.createElement('th');
      th.scope = 'col';
      if (h.key) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'sort-btn';
        button.textContent = h.label;
        if (state.sort === h.key) {
          var arrow = document.createElement('span');
          arrow.className = 'arrow';
          arrow.setAttribute('aria-hidden', 'true');
          arrow.textContent = state.dir === 1 ? '▲' : '▼';
          button.appendChild(arrow);
        }
        button.addEventListener('click', function () { setSort(h.key); });
        th.appendChild(button);
        th.setAttribute('aria-sort', state.sort === h.key ? (state.dir === 1 ? 'ascending' : 'descending') : 'none');
      } else {
        th.textContent = h.label;
      }
      el.headRow.appendChild(th);
    });
  }

  function setSort(key) {
    if (state.sort === key) state.dir = -state.dir;
    else {
      state.sort = key;
      state.dir = DEFAULT_DIR[key] || -1;
    }
    writeHash();
    render();
  }

  function renderCards() {
    var movers = rows.filter(function (r) { return r.change_7d != null; })
      .sort(function (a, b) { return b.change_7d - a.change_7d || b.tvl_usd - a.tvl_usd; })
      .slice(0, 5);
    var fresh = rows.filter(function (r) { return ageDaysOf(r) != null && r.tvl_usd >= floorUsd; })
      .sort(function (a, b) { return ageDaysOf(a) - ageDaysOf(b) || b.tvl_usd - a.tvl_usd; })
      .slice(0, 5);

    el.hotCards.innerHTML = '';
    movers.forEach(function (r) { el.hotCards.appendChild(card(r, 'mover')); });
    el.freshCards.innerHTML = '';
    fresh.forEach(function (r) { el.freshCards.appendChild(card(r, 'fresh')); });
  }

  function card(r, kind) {
    var node = document.createElement('button');
    node.type = 'button';
    node.className = 'card ' + kind;
    var change = r.change_7d == null ? '' : '<span class="badge ' + (r.change_7d >= 0 ? 'pos' : 'neg') + '">' + fmtPct(r.change_7d) + '</span>';
    var age = kind === 'fresh' && ageDaysOf(r) != null ? '<span class="badge">' + fmtAge(ageDaysOf(r)) + '</span>' : '';
    node.innerHTML = '<div class="card-top"><span class="badge rank">#' + r.rank + '</span>' + change + age + '</div>' +
      '<b class="card-name">' + esc(r.name) + '</b>' +
      '<span class="sub">' + esc(catOf(r)) + ' · ' + esc(chainsLabel(r)) + '</span>' +
      '<div class="card-nums"><span>TVL ' + fmtUsd(r.tvl_usd) + '</span><span>Implied ' + fmtUsd(r.implied_value_usd) + '</span></div>';
    node.addEventListener('click', function () { openRow(r.slug); });
    return node;
  }

  function renderTable() {
    var list = sortedRows(filteredRows());
    var maxImplied = 1;
    list.forEach(function (r) { if (r.implied_value_usd > maxImplied) maxImplied = r.implied_value_usd; });
    el.tbody.innerHTML = '';
    if (list.length === 0) {
      el.empty.hidden = false;
      el.boardMeta.textContent = 'No protocol matches these filters.';
    } else {
      el.empty.hidden = true;
      el.boardMeta.textContent = list.length + ' of ' + rows.length + ' rows shown · sorted by ' + SORT_LABEL[state.sort] + ' ' + (state.dir === 1 ? 'ascending' : 'descending');
    }
    list.forEach(function (r) {
      var tr = document.createElement('tr');
      tr.setAttribute('tabindex', '0');
      tr.setAttribute('data-slug', r.slug);
      if (state.selected === r.slug) tr.className = 'selected';
      var growth = fmtPct(r.change_7d);
      var growthClass = r.change_7d == null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var width = Math.max(2, Math.round((r.implied_value_usd / maxImplied) * 100));
      var token = r.on_watchlist ? '<span class="badge accent">watchlist</span>' : '<span class="badge">early</span>';
      tr.innerHTML = '<td class="num">' + r.rank + '</td>' +
        '<td><div class="name">' + esc(r.name) + '</div><div class="sub">' + esc(catOf(r)) + ' · ' + esc(chainsLabel(r)) + '</div></td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num ' + growthClass + '">' + growth + '</td>' +
        '<td class="num">' + fmtAge(ageDaysOf(r)) + '</td>' +
        '<td class="num">' + fmtOdds(r.token_odds) + '</td>' +
        '<td><div class="implied"><span class="num">' + fmtUsd(r.implied_value_usd) + '</span><div class="bar"><i style="width:' + width + '%"></i></div></div></td>' +
        '<td class="num">' + fmtPerHour(r.verdict_usd_per_hour) + '</td>' +
        '<td>' + token + '</td>';
      tr.addEventListener('click', function () { openRow(r.slug); });
      tr.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openRow(r.slug);
        }
      });
      el.tbody.appendChild(tr);
    });
    el.count.textContent = list.length + ' rows';
  }

  function render() {
    renderIntegrity();
    renderHead();
    renderCards();
    renderTable();
  }

  function renderDrawer(row) {
    var b = breakdown(row);
    var scenarios = [['Low', row.scenario_low], ['Mid', row.scenario_mid], ['High', row.scenario_high]];
    var maxScenario = Math.max(row.scenario_low || 0, row.scenario_mid || 0, row.scenario_high || 0, 1);
    var scenarioHtml = scenarios.map(function (s) {
      var width = Math.max(2, Math.round((s[1] / maxScenario) * 100));
      return '<div class="scenario"><span class="sc-label">' + s[0] + '</span><div class="bar"><i style="width:' + width + '%"></i></div><b class="num">' + fmtUsd(s[1]) + '</b></div>';
    }).join('');

    var peers = DATA.peers && DATA.peers[row.slug] ? DATA.peers[row.slug] : [];
    var peerHtml = peers.length > 0 ? '<ul class="peer-list">' + peers.map(function (p) {
      return '<li><b>' + esc(p.name) + '</b><span class="num">' + fmtUsd(p.mcap_usd) + '</span><span class="badge">' + fmtMult(p.multiple) + '</span></li>';
    }).join('') + '</ul>' : '<p class="sub">No token peer in this category.</p>';

    var plan = planOf(row);
    var planHtml = '<ol class="plan">' + plan.map(function (s) {
      return '<li><div class="step-text">' + esc(s.text) + '</div><div class="step-badges"><span class="badge">Cost: ' + esc(s.cost) + '</span><span class="badge">Time: ' + esc(s.time) + '</span></div></li>';
    }).join('') + '</ol>';

    var matchNote = b.implied === row.implied_value_usd
      ? 'The recomputed value matches the board.'
      : 'The recomputed value is ' + fmtUsd(b.implied) + '; the board carries ' + fmtUsd(row.implied_value_usd) + '.';

    el.drawerMeta.innerHTML = '<span class="badge accent">Rank ' + row.rank + '</span>' +
      (row.on_watchlist ? '<span class="badge">watchlist</span>' : '<span class="badge">early radar</span>');

    el.drawerBody.innerHTML =
      '<div class="drawer-title-wrap"><span class="sub">' + (row.on_watchlist ? 'Watchlist protocol' : 'Early radar protocol') + '</span>' +
      '<h2 id="drawer-title">' + esc(row.name) + '</h2>' +
      '<p class="sub">' + esc(catOf(row)) + ' · ' + esc(chainsLabel(row)) + '</p></div>' +
      '<section class="drawer-section"><h3>Implied value breakdown</h3>' +
      '<div class="breakdown">' +
      '<div><span>TVL</span><b class="num">' + fmtUsd(row.tvl_usd) + '</b></div>' +
      '<div><span>Fitted multiple exp(w·x)</span><b class="num">' + fmtMult(b.mult) + '</b></div>' +
      '<div><span>Token odds (category, falling with age)</span><b class="num">' + fmtOdds(b.odds) + '</b></div>' +
      '<div><span>Farm verdict</span><b class="num">' + fmtPerHour(row.verdict_usd_per_hour) + ' over ' + fmtUsd(row.farm_cost_usd || 0) + ' cost</b></div>' +
      '<div class="total"><span>Implied value</span><b class="num">' + fmtUsd(row.implied_value_usd) + '</b></div>' +
      '</div>' +
      '<p class="formula">implied = clamp( tvl × exp(w·x) × token odds ), w fitted by ridgeFit, tested by leaveOneOutFactor and walkForwardFactor</p>' +
      '<p class="sub">' + matchNote + '</p></section>' +
      '<section class="drawer-section"><h3>Scenario range</h3><div class="scenarios">' + scenarioHtml + '</div></section>' +
      '<section class="drawer-section"><h3>Peer comps</h3>' + peerHtml + '</section>' +
      '<section class="drawer-section"><h3>Farm plan</h3>' + planHtml + '</section>';
  }

  function openRow(slug) {
    var row = findRow(slug);
    if (!row) return;
    state.selected = slug;
    writeHash();
    renderDrawer(row);
    el.drawer.hidden = false;
    el.drawer.classList.add('open');
    el.drawer.setAttribute('aria-hidden', 'false');
    el.backdrop.hidden = false;
    document.body.classList.add('drawer-open');
    el.drawerClose.focus();
    renderTable();
  }

  function closeDrawer() {
    state.selected = null;
    writeHash();
    el.drawer.classList.remove('open');
    el.drawer.hidden = true;
    el.drawer.setAttribute('aria-hidden', 'true');
    el.backdrop.hidden = true;
    document.body.classList.remove('drawer-open');
    renderTable();
  }

  function resetFilters() {
    state.q = '';
    state.category = 'all';
    state.chain = 'all';
    state.watchOnly = false;
    state.minTvl = 0;
    el.q.value = '';
    el.category.value = 'all';
    el.chain.value = 'all';
    el.watchOnly.checked = false;
    el.minTvl.value = '0';
    el.minTvlOut.textContent = '$0';
    writeHash();
    render();
  }

  if (!DATA || rows.length === 0) {
    el.boardMeta.textContent = 'No radar data loaded. Check that data.js sits beside dashboard/.';
    return;
  }

  readHash();
  initControls();
  renderHero();
  renderChips();
  writeHash();
  render();

  if (state.selected) {
    var selectedRow = findRow(state.selected);
    if (selectedRow) openRow(state.selected);
    else {
      state.selected = null;
      writeHash();
      renderTable();
    }
  }

  el.q.addEventListener('input', function () {
    state.q = el.q.value;
    writeHash();
    render();
  });
  el.category.addEventListener('change', function () {
    state.category = el.category.value;
    writeHash();
    render();
  });
  el.chain.addEventListener('change', function () {
    state.chain = el.chain.value;
    writeHash();
    render();
  });
  el.watchOnly.addEventListener('change', function () {
    state.watchOnly = el.watchOnly.checked;
    writeHash();
    render();
  });
  el.minTvl.addEventListener('input', function () {
    state.minTvl = Number(el.minTvl.value) || 0;
    el.minTvlOut.textContent = fmtUsd(state.minTvl);
    writeHash();
    render();
  });
  el.reset.addEventListener('click', resetFilters);
  el.emptyReset.addEventListener('click', resetFilters);
  el.drawerClose.addEventListener('click', closeDrawer);
  el.backdrop.addEventListener('click', closeDrawer);
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !el.drawer.hidden) closeDrawer();
  });
})();
