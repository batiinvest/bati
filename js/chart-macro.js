// chart-macro.js — 글로벌 매크로 차트 (흐름 비교 차트, ETF 배너)
// 의존: config.js, investment.js (INV_ALL_METRICS, INV)

// ── 매크로 위험 신호 임계값 (투자전문가 기준) ──
const MACRO_RISK_SIGNALS = {
  vix:            { caution: 20,    danger: 30,    critical: 40,   dir: 'above' },
  us10y:          { caution: 4.3,   danger: 4.5,   critical: 5.0,  dir: 'above' },
  usd_krw:        { caution: 1400,  danger: 1500,  critical: 1600, dir: 'above' },
  sp500_chg:      { caution: -1.5,  danger: -2.5,  critical: -4.0, dir: 'below' },
  nasdaq_chg:     { caution: -2.0,  danger: -3.5,  critical: -5.0, dir: 'below' },
  sp500_fut_chg:  { caution: -1.0,  danger: -2.0,                  dir: 'below' },
  nasdaq_fut_chg: { caution: -1.5,  danger: -2.5,                  dir: 'below' },
  wti:            { caution: 90,    danger: 100,                   dir: 'above' },
};

function _getRisk(key, value) {
  if (value == null || isNaN(Number(value))) return null;
  const v = Number(value);
  const s = MACRO_RISK_SIGNALS[key];
  if (!s) return null;
  if (s.dir === 'above') {
    if (s.critical != null && v >= s.critical) return 'critical';
    if (s.danger   != null && v >= s.danger)   return 'danger';
    if (s.caution  != null && v >= s.caution)  return 'caution';
  } else {
    if (s.critical != null && v <= s.critical) return 'critical';
    if (s.danger   != null && v <= s.danger)   return 'danger';
    if (s.caution  != null && v <= s.caution)  return 'caution';
  }
  return null;
}

async function loadMacroData() {
  const { data } = await sb.from('macro_data')
    .select('*').order('base_date', { ascending: false }).limit(1);
  const m = data?.[0] || {};
  window._macroData = m;  // market-insight.js에서 재활용

  // 위험 신호 감지 → 동적 스트립 삽입
  const _riskItems = [
    { key: 'vix',            val: m.vix,            label: 'VIX',      fmt: v => Number(v).toFixed(2) },
    { key: 'us10y',          val: m.us10y,           label: '미10년금리', fmt: v => Number(v).toFixed(3) + '%' },
    { key: 'usd_krw',        val: m.usd_krw,         label: 'USD/KRW',  fmt: v => Number(v).toLocaleString() + '원' },
    { key: 'sp500_chg',      val: m.sp500_chg,       label: 'S&P500',   fmt: v => (v>0?'+':'') + Number(v).toFixed(2) + '%' },
    { key: 'nasdaq_chg',     val: m.nasdaq_chg,      label: '나스닥',    fmt: v => (v>0?'+':'') + Number(v).toFixed(2) + '%' },
    { key: 'sp500_fut_chg',  val: m.sp500_fut_chg,   label: 'S&P선물',  fmt: v => (v>0?'+':'') + Number(v).toFixed(2) + '%' },
    { key: 'nasdaq_fut_chg', val: m.nasdaq_fut_chg,  label: '나스닥선물', fmt: v => (v>0?'+':'') + Number(v).toFixed(2) + '%' },
    { key: 'wti',            val: m.wti,             label: 'WTI',      fmt: v => '$' + Number(v).toFixed(1) },
  ];
  const _activeRisks = _riskItems
    .map(r => ({ ...r, risk: _getRisk(r.key, r.val) }))
    .filter(r => r.risk);

  const _oldStrip = document.getElementById('_macro-risk-strip');
  if (_oldStrip) _oldStrip.remove();

  const globalEl = document.getElementById('inv-global');
  if (_activeRisks.length && globalEl?.parentElement) {
    const _RI = {
      caution:  { color: '#f59e0b', icon: '⚠️', label: '주의' },
      danger:   { color: '#ef4444', icon: '🚨', label: '위험' },
      critical: { color: '#dc2626', icon: '🔴', label: '긴급' },
    };
    const strip = document.createElement('div');
    strip.id = '_macro-risk-strip';
    strip.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 12px;margin-bottom:8px;border-radius:8px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.25)';
    strip.innerHTML =
      '<span style="font-size:11px;color:var(--text3);font-weight:600;white-space:nowrap">🔔 위험 신호</span>' +
      _activeRisks.map(r => {
        const ri = _RI[r.risk];
        return `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:12px;` +
          `background:${ri.color}22;border:1px solid ${ri.color}55;font-size:11px;color:${ri.color};font-weight:600;white-space:nowrap">` +
          `${ri.icon} ${r.label} ${r.fmt(r.val)}</span>`;
      }).join('');
    globalEl.parentElement.insertBefore(strip, globalEl);
  }

  if (globalEl) globalEl.innerHTML = [
    mkIndexCard('S&P 500',     m.sp500,       m.sp500_chg,       '',  'USA 현물', _getRisk('sp500_chg',      m.sp500_chg)),
    mkIndexCard('나스닥',       m.nasdaq,      m.nasdaq_chg,      '',  'USA 현물', _getRisk('nasdaq_chg',     m.nasdaq_chg)),
    mkIndexCard('다우존스',     m.dow,         m.dow_chg,         '',  'USA 현물'),
    mkIndexCard('S&P 선물',    m.sp500_fut,   m.sp500_fut_chg,   '',  '선물',     _getRisk('sp500_fut_chg',  m.sp500_fut_chg)),
    mkIndexCard('나스닥 선물',  m.nasdaq_fut,  m.nasdaq_fut_chg,  '',  '선물',     _getRisk('nasdaq_fut_chg', m.nasdaq_fut_chg)),
    mkIndexCard('다우 선물',    m.dow_fut,     m.dow_fut_chg,     '',  '선물'),
    mkIndexCard('VIX',         m.vix,         m.vix_chg,         '',  '공포지수', _getRisk('vix',            m.vix)),
    mkIndexCard('미 10년 금리', m.us10y,       m.us10y_chg,       '%', '국채',    _getRisk('us10y',          m.us10y)),
  ].join('');

  const domEl = document.getElementById('inv-domestic');
  if (domEl) domEl.innerHTML = [
    mkIndexCard('코스피', m.kospi,  m.kospi_chg,  '', 'KOSPI'),
    mkIndexCard('코스닥', m.kosdaq, m.kosdaq_chg, '', 'KOSDAQ'),
  ].join('');

  const fxEl = document.getElementById('inv-fx');
  if (fxEl) fxEl.innerHTML = [
    mkIndexCard('USD/KRW', m.usd_krw, m.usd_krw_chg, '원', '달러', _getRisk('usd_krw', m.usd_krw)),
    mkIndexCard('JPY/KRW', m.jpy_krw, m.jpy_krw_chg, '원', '100엔'),
    mkIndexCard('EUR/KRW', m.eur_krw, m.eur_krw_chg, '원', '유로'),
    mkIndexCard('CNY/KRW', m.cny_krw, m.cny_krw_chg, '원', '위안'),
  ].join('');

  const cmdEl = document.getElementById('inv-commodity');
  if (cmdEl) cmdEl.innerHTML = [
    mkIndexCard('WTI 유가',  m.wti,    m.wti_chg,    '$', '배럴', _getRisk('wti', m.wti)),
    mkIndexCard('금',        m.gold,   m.gold_chg,   '$', '온스'),
    mkIndexCard('천연가스',   m.gas,    m.gas_chg,    '$', 'MMBtu'),
    mkIndexCard('구리',      m.copper, m.copper_chg, '$', '파운드'),
  ].join('');

  // 전체 종목 동향 카드 헤더 배너에 글로벌 지수 인라인 표시
  const bannerEl = document.getElementById('inv-banner-content');
  if (bannerEl) {
    const _BI = {
      caution:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.55)', icon: '⚠️', glow: '' },
      danger:   { color: '#ef4444', bg: 'rgba(239,68,68,0.13)',   border: 'rgba(239,68,68,0.6)',   icon: '🚨', glow: '' },
      critical: { color: '#dc2626', bg: 'rgba(220,38,38,0.17)',   border: 'rgba(220,38,38,0.75)',  icon: '🔴', glow: '0 0 8px rgba(220,38,38,0.45)' },
    };
    const mkB = (label, val, chg, unit, riskKey) => {
      if (val == null || isNaN(Number(val))) return '';
      const risk = riskKey ? _getRisk(riskKey, riskKey.endsWith('_chg') ? chg : val) : null;
      const ri   = risk ? _BI[risk] : null;
      const clr  = chg != null ? chgColor(chg) : 'var(--text2)';
      const valStr = unit === '%'
        ? Number(val).toFixed(3) + '%'
        : Number(val).toLocaleString(undefined, {maximumFractionDigits: 2});
      const chgHtml = chg != null
        ? `<span style="color:${clr};font-size:10px">${chg>0?'+':''}${chg.toFixed(2)}%</span>`
        : '';

      if (ri) {
        // 위험 항목: 컬러 박스로 강조
        return `<div style="display:flex;flex-direction:column;gap:2px;flex-shrink:0;` +
          `padding:4px 8px;border-radius:7px;` +
          `background:${ri.bg};border:1px solid ${ri.border};` +
          `${ri.glow ? 'box-shadow:' + ri.glow + ';' : ''}">` +
          `<div style="display:flex;align-items:center;gap:3px;line-height:1">` +
            `<span style="font-size:11px;line-height:1">${ri.icon}</span>` +
            `<span style="font-size:10px;color:var(--text2);font-weight:500;white-space:nowrap">${label}</span>` +
          `</div>` +
          `<div style="display:flex;align-items:baseline;gap:3px">` +
            `<span style="font-size:13px;font-weight:800;color:var(--text1)">${valStr}</span>` +
            chgHtml +
          `</div>` +
        `</div>`;
      }

      // 일반 항목
      return `<div style="display:flex;flex-direction:column;gap:1px;flex-shrink:0">` +
        `<span style="font-size:10px;color:var(--text2);line-height:1;font-weight:500">${label}</span>` +
        `<div style="display:flex;align-items:baseline;gap:3px">` +
          `<span style="font-size:12px;font-weight:700;color:var(--text1)">${valStr}</span>` +
          chgHtml +
        `</div>` +
      `</div>`;
    };
    const sep = '<div style="width:1px;background:var(--border);min-height:24px;align-self:stretch;flex-shrink:0"></div>';

    // ─── US 증시: 지수 + 선물을 한 카드에 쌍으로 묶어 표시 ───
    const mkBPair = (idxLabel, idxVal, idxChg, futLabel, futVal, futChg, idxRiskKey, futRiskKey) => {
      if (idxVal == null || isNaN(Number(idxVal))) return '';
      const risk = idxRiskKey ? _getRisk(idxRiskKey, idxRiskKey.endsWith('_chg') ? idxChg : idxVal) : null;
      const ri   = risk ? _BI[risk] : null;
      const clr  = idxChg != null ? chgColor(idxChg) : 'var(--text2)';
      const valStr = Number(idxVal).toLocaleString(undefined, {maximumFractionDigits: 2});
      const chgHtml = idxChg != null
        ? `<span style="color:${clr};font-size:10px">${idxChg>0?'+':''}${idxChg.toFixed(2)}%</span>`
        : '';

      // 선물 섹션: 지수에 위험 색상이 없을 때만 선물 독립 하이라이트 적용
      let futHtml = '';
      if (futVal != null && !isNaN(Number(futVal))) {
        const futRisk = !ri && futRiskKey ? _getRisk(futRiskKey, futRiskKey.endsWith('_chg') ? futChg : futVal) : null;
        const futRi   = futRisk ? _BI[futRisk] : null;
        const futClr  = futChg != null ? chgColor(futChg) : 'var(--text3)';
        const futValStr = Number(futVal).toLocaleString(undefined, {maximumFractionDigits: 2});
        const futChgHtml = futChg != null
          ? `<span style="color:${futClr};font-size:9px">${futChg>0?'+':''}${futChg.toFixed(2)}%</span>`
          : '';
        const futBox = futRi
          ? `background:${futRi.bg};border:1px solid ${futRi.border};border-radius:4px;padding:1px 5px;${futRi.glow?'box-shadow:'+futRi.glow+';':''}`
          : '';
        futHtml =
          `<div style="display:flex;align-items:baseline;gap:3px;margin-top:4px;padding-top:3px;` +
          `border-top:1px solid rgba(255,255,255,0.08);${futBox}">` +
            `<span style="font-size:9px;color:var(--text3);white-space:nowrap;font-weight:500">${futLabel}</span>` +
            `<span style="font-size:10px;font-weight:600;color:var(--text1)">${futValStr}</span>` +
            futChgHtml +
          `</div>`;
      }

      const boxStyle = ri
        ? `padding:4px 8px;border-radius:7px;background:${ri.bg};border:1px solid ${ri.border};${ri.glow?'box-shadow:'+ri.glow+';':''}`
        : '';

      return `<div style="display:flex;flex-direction:column;gap:0;flex-shrink:0;${boxStyle}">` +
        `<span style="font-size:10px;color:var(--text2);line-height:1;font-weight:500">${idxLabel}</span>` +
        `<div style="display:flex;align-items:baseline;gap:3px;margin-top:1px">` +
          `<span style="font-size:12px;font-weight:700;color:var(--text1)">${valStr}</span>` +
          chgHtml +
        `</div>` +
        futHtml +
      `</div>`;
    };

    const _usParts = [
      mkBPair('S&P500', m.sp500,  m.sp500_chg,  '선물', m.sp500_fut,  m.sp500_fut_chg,  'sp500_chg',  'sp500_fut_chg'),
      mkBPair('나스닥',  m.nasdaq, m.nasdaq_chg, '선물', m.nasdaq_fut, m.nasdaq_fut_chg, 'nasdaq_chg', 'nasdaq_fut_chg'),
      mkBPair('다우',    m.dow,    m.dow_chg,    '선물', m.dow_fut,    m.dow_fut_chg),
    ].filter(Boolean);

    const _usBlock = `<div style="display:flex;gap:14px;align-items:flex-start;flex-shrink:0">${_usParts.join('')}</div>`;

    // ─── 나머지 단행 항목 ───
    const _restItems = [
      { str: mkB('VIX',    m.vix,     m.vix_chg,     '',  'vix'),     risk: _getRisk('vix',     m.vix) },
      { str: mkB('미10년', m.us10y,   m.us10y_chg,   '%', 'us10y'),   risk: _getRisk('us10y',   m.us10y) },
      { str: mkB('달러',   m.usd_krw, m.usd_krw_chg, '',  'usd_krw'), risk: _getRisk('usd_krw', m.usd_krw) },
      { str: mkB('엔',     m.jpy_krw, m.jpy_krw_chg),                  risk: null },
      { str: mkB('유로',   m.eur_krw, m.eur_krw_chg),                  risk: null },
      { str: mkB('BTC',    m.bitcoin, m.bitcoin_chg),                   risk: null },
    ].filter(it => it.str);

    let restParts = [];
    for (let i = 0; i < _restItems.length; i++) {
      const cur  = _restItems[i];
      const prev = _restItems[i - 1];
      if (prev && !cur.risk && !prev.risk) restParts.push(sep);
      restParts.push(cur.str);
    }

    // 컨테이너 스타일을 JS에서 직접 제어 (HTML inline 스타일 덮어쓰기)
    bannerEl.style.cssText =
      'display:flex;gap:8px;align-items:flex-start;flex-wrap:nowrap;' +
      'margin-left:auto;overflow-x:auto;overflow-y:hidden;' +
      'scrollbar-width:none;padding:2px 0;';
    bannerEl.innerHTML = _usBlock + sep + restParts.join('');

  }  // end if (m)
}  // end loadMacroData

// ── US ETF 배너: us_market 테이블에서 최신 산업별 평균 등락률 조회 ──
async function loadUsEtfBanner() {
  const etfBanner = document.getElementById('inv-etf-banner');
  if (!etfBanner) return;

  try {
  const { data: rows, error } = await sb.from('us_market')
    .select('base_date,industry,ticker,chg_pct')
    .order('base_date', { ascending: false })
    .limit(500);

  if (error) {
    console.error('[ETF배너] 조회 오류:', error);
    etfBanner.innerHTML = '<span style="color:var(--text3);font-size:11px">US ETF 데이터 오류</span>';
    return;
  }
  if (!rows?.length) {
    etfBanner.innerHTML = '<span style="color:var(--text3);font-size:11px">US ETF 수집 대기 중</span>';
    return;
  }

  // 최신 날짜 확인
  const latestDate = rows[0].base_date;
  const latest = rows.filter(r => r.base_date === latestDate);

  // 산업별 ETF 평균 등락률 계산
  const indAvg = {};
  const inds = Object.keys(USKR_MAP);
  inds.forEach(ind => {
    const tickers = USKR_MAP[ind];
    const vals = latest
      .filter(r => r.industry === ind && tickers.includes(r.ticker) && r.chg_pct != null)
      .map(r => r.chg_pct);
    if (vals.length) indAvg[ind] = vals.reduce((s,v)=>s+v,0)/vals.length;
  });

  // 상승률 내림차순 정렬
  const sorted = Object.entries(indAvg).sort((a,b) => b[1]-a[1]);

  const sep = '<span style="color:rgba(255,255,255,.2)">|</span>';
  const fmt = v => {
    const s = v >= 0 ? '+' : '';
    const c = v >= 0 ? 'var(--red)' : 'var(--blue)';
    return `<span style="font-weight:600;color:${c}">${s}${v.toFixed(2)}%</span>`;
  };

  etfBanner.innerHTML = sorted.map(([ind, avg]) =>
    `<span style="display:flex;align-items:center;gap:4px;white-space:nowrap">
      <span style="font-size:11px;color:var(--text3)">${ind}</span>
      ${fmt(avg)}
    </span>`
  ).join(sep);

  } catch(e) {
    console.error('[ETF배너] 예외:', e);
    etfBanner.innerHTML = '<span style="color:var(--text3);font-size:11px">US ETF 로드 실패</span>';
  }
}

function toggleInvMetric(col) {
  if (INV.selected.has(col)) {
    INV.selected.delete(col);
  } else {
    if (INV.selected.size >= 8) { return; }
    INV.selected.add(col);
  }
  const lbl = document.getElementById('inv-lbl-' + col);
  const m   = INV_ALL_METRICS.find(x => x.col === col);
  if (lbl && m) {
    lbl.style.background  = INV.selected.has(col) ? m.color + '22' : '';
    lbl.style.borderColor = INV.selected.has(col) ? m.color : 'var(--border)';
    lbl.style.color       = INV.selected.has(col) ? m.color : '';
  }
  loadTrendChart();
}

// 그룹 일괄 선택
function selectInvGroup(group) {
  INV_ALL_METRICS.forEach(m => {
    const chk = document.getElementById('inv-chk-' + m.col);
    if (!chk) return;
    const on = group === '' ? false : m.group === group;
    if (chk.checked !== on) {
      chk.checked = on;
      if (on) INV.selected.add(m.col);
      else    INV.selected.delete(m.col);
    }
  });
  initInvCheckboxStyles();
  loadTrendChart();
}

function setInvPeriod(period) {
  INV.period = period;
  document.querySelectorAll('[data-inv-period]').forEach(b =>
    b.classList.toggle('active', b.dataset.invPeriod === String(period)));
  loadTrendChart();
}

async function loadTrendChart() {
  const canvas = document.getElementById('inv-trend-chart');
  const empty  = document.getElementById('inv-trend-empty');
  if (!canvas) return;

  initInvCheckboxStyles();

  if (!INV.selected.size) {
    canvas.style.display = 'none';
    if (empty) { empty.style.display = 'flex'; empty.textContent = '지표를 선택해주세요.'; }
    return;
  }

  const selectedMetrics = INV_ALL_METRICS.filter(m => INV.selected.has(m.col));
  const cols = ['base_date', ...selectedMetrics.map(m => m.col)].join(',');

  const { data: rawRows } = await sb.from('macro_data')
    .select(cols)
    .order('base_date', { ascending: false })
    .limit(INV.period);

  const rows = (rawRows || []).reverse();

  if (!rows?.length) {
    canvas.style.display = 'none';
    if (empty) { empty.style.display = 'flex'; empty.textContent = '데이터 수집 중... (매일 09:00, 16:10 업데이트)'; }
    return;
  }
  canvas.style.display = 'block';
  if (empty) empty.style.display = 'none';

  const labels = rows.map(r => r.base_date);

  const _hl = window._invHighlighted || null;
  const datasets = selectedMetrics.map(m => {
    const values = rows.map(r => r[m.col]);
    const base   = values.find(v => v != null);
    const normalized = values.map(v => v != null && base ? Math.round(v / base * 10000) / 100 : null);
    const active = !_hl || m.name === _hl;
    return {
      label:           m.name,
      data:            normalized,
      borderColor:     active ? m.color : m.color + '77',
      backgroundColor: m.color + '15',
      borderWidth:     active ? (_hl ? 4 : 2) : 1.2,
      pointRadius:     active ? (_hl ? 4 : 2) : 1,
      pointHoverRadius:5,
      tension:         0.3,
      fill:            false,
      spanGaps:        true,
    };
  });

  if (_invTrendChart) { _invTrendChart.destroy(); _invTrendChart = null; }
  window._invHighlighted = window._invHighlighted || null;
  window._invHovered = null;

  _invTrendChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(2)}`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: 'var(--text3)', maxTicksLimit: 7, maxRotation: 0 },
          grid:  { color: 'var(--border)' },
        },
        y: {
          ticks: { color: 'var(--text3)', callback: v => v + '' },
          grid:  { color: 'var(--border)' },
        }
      }
    }
  });

  // ── 호버 + 클릭 고정 (이전 핸들러 제거 후 재바인딩) ──
  ['_invClickHandler','_invMoveHandler','_invLeaveHandler'].forEach(k => {
    if (canvas[k]) canvas.removeEventListener(
      k === '_invClickHandler' ? 'click' : k === '_invMoveHandler' ? 'mousemove' : 'mouseleave',
      canvas[k]
    );
  });

  canvas._invMoveHandler = (e) => {
    if (window._invHighlighted) return;   // 고정 중엔 호버 무시
    const chart = _invTrendChart;
    if (!chart) return;
    const pts = chart.getElementsAtEventForMode(e, 'nearest', { intersect: false }, true);
    const label = pts.length ? chart.data.datasets[pts[0].datasetIndex]?.label : null;
    if (label === window._invHovered) return;
    window._invHovered = label;
    // 호버용 임시 적용 (pinned 아님)
    chart.data.datasets.forEach(ds => {
      const m = INV_ALL_METRICS.find(x => x.name === ds.label);
      const color = m ? m.color : '#ffffff';
      if (!label) { ds.borderWidth = 2; ds.pointRadius = 2; ds.borderColor = color; }
      else {
        const active = ds.label === label;
        ds.borderWidth = active ? 4   : 1.2;
        ds.pointRadius = active ? 4   : 1;
        ds.borderColor = active ? color : color + '55';
      }
    });
    chart.update('none');
  };

  canvas._invLeaveHandler = () => {
    if (window._invHighlighted) return;   // 고정 중엔 복원 안 함
    window._invHovered = null;
    _applyInvHighlight();
  };

  canvas._invClickHandler = (e) => {
    const chart = _invTrendChart;
    if (!chart) return;
    const pts = chart.getElementsAtEventForMode(e, 'nearest', { intersect: false }, true);
    const clicked = pts.length ? chart.data.datasets[pts[0].datasetIndex]?.label : null;
    // 같은 선 재클릭 → 고정 해제
    window._invHighlighted = (clicked && clicked !== window._invHighlighted) ? clicked : null;
    window._invHovered = window._invHighlighted;
    _applyInvHighlight();
  };

  canvas.addEventListener('mousemove', canvas._invMoveHandler);
  canvas.addEventListener('mouseleave', canvas._invLeaveHandler);
  canvas.addEventListener('click',     canvas._invClickHandler);
}

// 하이라이트 적용 (borderWidth + 투명도)
function _applyInvHighlight() {
  const chart = _invTrendChart;
  if (!chart) return;
  const hl = window._invHighlighted;
  chart.data.datasets.forEach((ds) => {
    const m = INV_ALL_METRICS.find(x => x.name === ds.label);
    const color = m ? m.color : '#ffffff';
    if (!hl) {
      // 완전 해제 — 기본값 복원
      ds.borderWidth = 2;
      ds.pointRadius = 2;
      ds.borderColor = color;
    } else {
      const active = ds.label === hl;
      ds.borderWidth = active ? 4   : 1.2;
      ds.pointRadius = active ? 4   : 1;
      ds.borderColor = active ? color : color + '55';
    }
  });
  chart.update('none');

  // 범례 스타일 연동
  document.querySelectorAll('[id^="inv-lbl-"]').forEach(lbl => {
    const col = lbl.id.replace('inv-lbl-', '');
    const m   = INV_ALL_METRICS.find(x => x.col === col);
    if (!m) return;
    const isHL = hl && m.name === hl;
    lbl.style.opacity     = !hl || isHL ? '1' : '0.35';
    lbl.style.borderWidth = isHL ? '2px' : '';
  });
}

function initInvCheckboxStyles() {
  INV_ALL_METRICS.forEach(m => {
    const lbl = document.getElementById('inv-lbl-' + m.col);
    if (!lbl) return;
    if (INV.selected.has(m.col)) {
      lbl.style.background  = m.color + '22';
      lbl.style.borderColor = m.color;
      lbl.style.color       = m.color;
    }
  });
}
