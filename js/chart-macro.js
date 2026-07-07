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
    .select('*').order('base_date', { ascending: false }).limit(5);
  const m = data?.[0] || {};
  INV.macroData = m;   // market-insight.js / market-temperature.js 재활용
  INV.macroRows = data || []; // 5일치 — 온도계 5일 추세 계산용

  // (정리됨) 매크로 카드 그리드·위험 스트립·증시동향 헤더 배너(inv-banner-content) 모두 제거 —
  // 매크로 지수는 전역 탑바 스트립·시장 온도계 6세부요소·Zone A 브리핑 위험배지가 담당(중복 제거).
  // 증시동향 카드는 제거 → 코스피·코스닥 상승종목수(breadth)는 탑바 스트립의 지수값 밑에 미니 바로 노출(_renderTopbarStrip).

  // 탑바 시장 스트립 갱신
  _renderTopbarStrip();
}  // end loadMacroData

// ── 탑바 스트립 갱신 기준 시각 라벨 (macro_data base_date + updated_at, KST) ──
// 탑바는 전역이라 다른 페이지로 이동해도 남는다(_renderTopbarStrip은 시황 진입 시에만 호출).
// 데이터가 고착(stale)돼 보이지 않도록 '기준 시각'을 명시.
function _macroAsOfLabel(m) {
  if (!m || !m.base_date) return '';
  let t = '';
  if (m.updated_at) {
    const kst = new Date(new Date(m.updated_at).getTime() + 9 * 60 * 60 * 1000);
    t = ` ${String(kst.getUTCHours()).padStart(2,'0')}:${String(kst.getUTCMinutes()).padStart(2,'0')}`;
  }
  const md = String(m.base_date).slice(5).replace('-', '/'); // YYYY-MM-DD → MM/DD
  return `기준 ${md}${t}`;
}

// ── 탑바 시장 스트립 렌더 ──
// 지수값 바로 밑 둘째 줄(서브 행): 코스피·코스닥=상승종목수(breadth) 미니 바, S&P500·나스닥=선물 등락률.
// breadth 데이터는 loadMarketOverview(market-overview.js)가 INV.marketBreadth에 채운 뒤 재호출.
function _renderTopbarStrip() {
  const strip = document.getElementById('topbar-market-strip');
  const m  = INV.macroData || {};
  const bd = INV.marketBreadth || {};

  // 지수값 밑 둘째 줄 — 코스피·코스닥: 상승종목수(breadth) 미니 바
  // '등락' 라벨(선물 라벨과 시각적 대칭) + 툴팁으로 막대 의미를 명시(직관성).
  const breadthRow = (b) => {
    if (!b || !b.total) return '';
    const risePct = b.rise / b.total * 100;
    const flatPct = b.flat / b.total * 100;
    const tip = `상승 ${b.rise.toLocaleString()} · 보합 ${b.flat.toLocaleString()} · 하락 ${b.fall.toLocaleString()} 종목`;
    return `<div class="market-strip-sub" title="${tip}">` +
      `<span style="color:var(--text3)">등락</span>` +
      `<span class="msb-bar">` +
        `<span style="width:${risePct.toFixed(1)}%;background:var(--red)"></span>` +
        `<span style="width:${flatPct.toFixed(1)}%;background:rgba(255,255,255,.07)"></span>` +
        `<span style="flex:1;background:var(--blue)"></span>` +
      `</span>` +
      `<span style="color:var(--red);font-weight:700">▲${b.rise.toLocaleString()}</span>` +
      `<span style="color:var(--blue);font-weight:700">▼${b.fall.toLocaleString()}</span>` +
    `</div>`;
  };
  // 지수값 밑 둘째 줄 — S&P500·나스닥: 선물 등락률
  const futRow = (chg) => {
    if (chg == null || isNaN(Number(chg))) return '';
    return `<div class="market-strip-sub" title="지수 선물 등락률">` +
      `<span style="color:var(--text3)">선물</span>` +
      `<span style="color:${chgColor(chg)};font-weight:700">${chgStr(chg)}</span>` +
    `</div>`;
  };

  const items = [
    { name: '코스피',  val: m.kospi,   chg: m.kospi_chg,   sub: breadthRow(bd.kospi) },
    { name: '코스닥',  val: m.kosdaq,  chg: m.kosdaq_chg,  sub: breadthRow(bd.kosdaq) },
    { name: 'S&P500', val: m.sp500,   chg: m.sp500_chg,   sub: futRow(m.sp500_fut_chg) },
    { name: '나스닥',  val: m.nasdaq,  chg: m.nasdaq_chg,  sub: futRow(m.nasdaq_fut_chg) },
    { name: 'VIX',    val: m.vix,     chg: m.vix_chg },
    { name: '달러',    val: m.usd_krw, chg: m.usd_krw_chg },
  ].filter(i => i.val != null);

  if (!strip) return;
  if (!items.length) { strip.style.display = 'none'; return; }
  strip.style.display = 'flex';

  // 지수값+등락률 한 줄
  const valRow = (item) =>
    `<span class="market-strip-name" style="font-size:10px;color:var(--text3)">${item.name}</span>` +
    `<span class="market-strip-val">${Number(item.val).toLocaleString(undefined,{maximumFractionDigits:2})}</span>` +
    `<span class="market-strip-chg" style="color:${chgColor(item.chg)}">${chgStr(item.chg)}</span>`;

  const body = items.slice(0,6).map((item, i) => {
    const sep = i > 0 ? '<span class="market-strip-sep" style="color:var(--border2)">│</span>' : '';
    if (item.sub) {
      return sep +
        `<div class="market-strip-item market-strip-item--stacked">` +
          `<div class="msb-valrow">${valRow(item)}</div>` +
          item.sub +
        `</div>`;
    }
    return sep + `<div class="market-strip-item">${valRow(item)}</div>`;
  }).join('');

  // 갱신 기준 시각 (stale 방지) — 스트립 끝에 옅게
  const asof = _macroAsOfLabel(m);
  const tail = asof
    ? '<span class="market-strip-sep" style="color:var(--border2)">│</span>' +
      `<span class="market-strip-asof" title="시장 데이터 갱신 기준">${asof}</span>`
    : '';

  strip.innerHTML = body + tail;
}

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
    etfBanner.innerHTML = '<span style="color:var(--text2);font-size:11px">US ETF 데이터 오류</span>';
    return;
  }
  if (!rows?.length) {
    etfBanner.innerHTML = '<span style="color:var(--text2);font-size:11px">US ETF 수집 대기 중</span>';
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
      <span style="font-size:11px;color:var(--text2)">${ind}</span>
      ${fmt(avg)}
    </span>`
  ).join(sep);

  } catch(e) {
    console.error('[ETF배너] 예외:', e);
    etfBanner.innerHTML = '<span style="color:var(--text2);font-size:11px">US ETF 로드 실패</span>';
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

  const _hl = INV.highlighted || null;
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
  INV.highlighted = INV.highlighted || null;
  INV.hovered = null;

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
          ticks: { color: chartTheme().tick, maxTicksLimit: 7, maxRotation: 0 },
          grid:  { color: chartTheme().grid },
        },
        y: {
          ticks: { color: chartTheme().tick, callback: v => v + '' },
          grid:  { color: chartTheme().grid },
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
    if (INV.highlighted) return;   // 고정 중엔 호버 무시
    const chart = _invTrendChart;
    if (!chart) return;
    const pts = chart.getElementsAtEventForMode(e, 'nearest', { intersect: false }, true);
    const label = pts.length ? chart.data.datasets[pts[0].datasetIndex]?.label : null;
    if (label === INV.hovered) return;
    INV.hovered = label;
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
    if (INV.highlighted) return;   // 고정 중엔 복원 안 함
    INV.hovered = null;
    _applyInvHighlight();
  };

  canvas._invClickHandler = (e) => {
    const chart = _invTrendChart;
    if (!chart) return;
    const pts = chart.getElementsAtEventForMode(e, 'nearest', { intersect: false }, true);
    const clicked = pts.length ? chart.data.datasets[pts[0].datasetIndex]?.label : null;
    // 같은 선 재클릭 → 고정 해제
    INV.highlighted = (clicked && clicked !== INV.highlighted) ? clicked : null;
    INV.hovered = INV.highlighted;
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
  const hl = INV.highlighted;
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
