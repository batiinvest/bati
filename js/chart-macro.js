// chart-macro.js — 글로벌 매크로 차트 (흐름 비교 차트, ETF 배너)
// 의존: config.js, investment.js (INV_ALL_METRICS, INV)

async function loadMacroData() {
  const { data } = await sb.from('macro_data')
    .select('*').order('base_date', { ascending: false }).limit(1);
  const m = data?.[0] || {};

  const globalEl = document.getElementById('inv-global');
  if (globalEl) globalEl.innerHTML = [
    mkIndexCard('S&P 500',     m.sp500,       m.sp500_chg,       '',  'USA 현물'),
    mkIndexCard('나스닥',       m.nasdaq,      m.nasdaq_chg,      '',  'USA 현물'),
    mkIndexCard('다우존스',     m.dow,         m.dow_chg,         '',  'USA 현물'),
    mkIndexCard('S&P 선물',    m.sp500_fut,   m.sp500_fut_chg,   '',  '선물'),
    mkIndexCard('나스닥 선물',  m.nasdaq_fut,  m.nasdaq_fut_chg,  '',  '선물'),
    mkIndexCard('다우 선물',    m.dow_fut,     m.dow_fut_chg,     '',  '선물'),
    mkIndexCard('VIX',         m.vix,         m.vix_chg,         '',  '공포지수'),
    mkIndexCard('미 10년 금리', m.us10y,       m.us10y_chg,       '%', '국채'),
  ].join('');

  const domEl = document.getElementById('inv-domestic');
  if (domEl) domEl.innerHTML = [
    mkIndexCard('코스피', m.kospi,  m.kospi_chg,  '', 'KOSPI'),
    mkIndexCard('코스닥', m.kosdaq, m.kosdaq_chg, '', 'KOSDAQ'),
  ].join('');

  const fxEl = document.getElementById('inv-fx');
  if (fxEl) fxEl.innerHTML = [
    mkIndexCard('USD/KRW', m.usd_krw, m.usd_krw_chg, '원', '달러'),
    mkIndexCard('JPY/KRW', m.jpy_krw, m.jpy_krw_chg, '원', '100엔'),
    mkIndexCard('EUR/KRW', m.eur_krw, m.eur_krw_chg, '원', '유로'),
    mkIndexCard('CNY/KRW', m.cny_krw, m.cny_krw_chg, '원', '위안'),
  ].join('');

  const cmdEl = document.getElementById('inv-commodity');
  if (cmdEl) cmdEl.innerHTML = [
    mkIndexCard('WTI 유가',  m.wti,    m.wti_chg,    '$', '배럴'),
    mkIndexCard('금',        m.gold,   m.gold_chg,   '$', '온스'),
    mkIndexCard('천연가스',   m.gas,    m.gas_chg,    '$', 'MMBtu'),
    mkIndexCard('구리',      m.copper, m.copper_chg, '$', '파운드'),
  ].join('');

  // 전체 종목 동향 카드 헤더 배너에 글로벌 지수 인라인 표시
  const bannerEl = document.getElementById('inv-banner-content');
  if (bannerEl) {
    const mkB = (label, val, chg, unit) => {
      if (val == null || isNaN(Number(val))) return '';
      const clr = chg != null ? chgColor(chg) : 'var(--text2)';
      const valStr = unit === '%'
        ? Number(val).toFixed(3) + '%'
        : Number(val).toLocaleString(undefined, {maximumFractionDigits: 2});
      const chgHtml = chg != null
        ? '<span style="color:' + clr + ';font-size:10px">' + (chg>0?'+':'') + chg.toFixed(2) + '%</span>'
        : '';
      return '<div style="display:flex;flex-direction:column;gap:1px;flex-shrink:0">' +
        '<span style="font-size:10px;color:var(--text2);line-height:1;font-weight:500">' + label + '</span>' +
        '<div style="display:flex;align-items:baseline;gap:3px">' +
          '<span style="font-size:12px;font-weight:700;color:var(--text1)">' + valStr + '</span>' +
          chgHtml +
        '</div>' +
      '</div>';
    };
    const sep = '<div style="width:1px;background:var(--border);height:28px;flex-shrink:0;align-self:center"></div>';
    bannerEl.innerHTML =
      '<div style="display:flex;gap:10px;align-items:center;flex-wrap:nowrap">' +
      [
        mkB('S&P500',    m.sp500,       m.sp500_chg),
        sep,
        mkB('나스닥',     m.nasdaq,      m.nasdaq_chg),
        sep,
        mkB('다우',       m.dow,         m.dow_chg),
        sep,
        mkB('S&P선물',   m.sp500_fut,   m.sp500_fut_chg),
        sep,
        mkB('나스닥선물', m.nasdaq_fut,  m.nasdaq_fut_chg),
        sep,
        mkB('다우선물',   m.dow_fut,     m.dow_fut_chg),
        sep,
        mkB('VIX',        m.vix,         m.vix_chg),
        sep,
        mkB('미10년',     m.us10y,       m.us10y_chg, '%'),
        sep,
        mkB('달러',       m.usd_krw,     m.usd_krw_chg),
        sep,
        mkB('엔',         m.jpy_krw,     m.jpy_krw_chg),
        sep,
        mkB('유로',       m.eur_krw,     m.eur_krw_chg),
        sep,
        mkB('BTC',        m.bitcoin,     m.bitcoin_chg),
      ].filter(s => s && s !== sep).join(sep) +
      '</div>';

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
