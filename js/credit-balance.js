// credit-balance.js — 오늘의 시황: 신용융자 잔고 추이 카드 (코스피·코스닥)
// 데이터: credit_balance_history (KOFIA 신용공여 잔고, 백만원 단위, 백엔드가 매일 19:00 수집)
//   직전 영업일분이 당일 오후 발표(2026-07-22 실측) — 기준일은 최신 행의 base_date로 표기.
// 의존: config.js (sb, chartTheme, fmtTV, fmtNet, chgColor, setAsOf), Chart.js

const CB = {
  period: 180,   // 표시 기간(일). 0 = 전체
  rows: null,    // 전체 시계열 캐시 (오름차순)
  chart: null,
};

// 코스피/코스닥 색 = 흐름 비교 차트(INV_ALL_METRICS)와 동일 색 언어
const CB_SERIES = [
  { col: 'loan_kospi',  name: '코스피', color: '#2dce89', axis: 'y'  },
  { col: 'loan_kosdaq', name: '코스닥', color: '#ffd600', axis: 'y1' },
];

async function loadCreditBalance() {
  if (!document.getElementById('cb-chart')) return;
  try {
    // desc→reverse: 1000행 초과 축적 시에도 최신 구간이 잘리지 않게
    const { data, error } = await sb.from('credit_balance_history')
      .select('base_date,loan_kospi,loan_kosdaq')
      .order('base_date', { ascending: false })
      .limit(1000);
    if (error) throw error;
    CB.rows = (data || []).reverse();
    renderCreditBalance();
  } catch (e) {
    console.warn('[신용융자] 로드 실패', e);
    CB.rows = [];
    renderCreditBalance();
  }
}

function setCbPeriod(days) {
  CB.period = days;
  document.querySelectorAll('[data-cb-period]').forEach(b =>
    b.classList.toggle('active', b.dataset.cbPeriod === String(days)));
  renderCreditBalance();
}

function renderCreditBalance() {
  const canvas  = document.getElementById('cb-chart');
  const empty   = document.getElementById('cb-empty');
  const summary = document.getElementById('cb-summary');
  if (!canvas) return;

  const all = CB.rows || [];
  let rows = all;
  if (CB.period > 0 && all.length) {
    const cutoff = new Date(Date.now() - CB.period * 86400e3).toISOString().slice(0, 10);
    rows = all.filter(r => r.base_date >= cutoff);
  }

  if (rows.length < 2) {
    canvas.style.display = 'none';
    if (empty) empty.style.display = 'flex';
    if (summary) summary.innerHTML = '';
    setAsOf('cb-date', null);
    return;
  }
  canvas.style.display = 'block';
  if (empty) empty.style.display = 'none';

  const last  = rows[rows.length - 1];
  const prev  = rows[rows.length - 2];
  const first = rows[0];
  setAsOf('cb-date', last.base_date);

  // ── 요약: 시장별 잔고 + 전일비 + 기간 변화 ──
  if (summary) {
    summary.innerHTML = CB_SERIES.map(s => {
      const cur = last[s.col], pre = prev[s.col], base = first[s.col];
      if (cur == null) return '';
      const d1     = pre  != null ? cur - pre : null;             // 백만원
      const d1Pct  = pre  ? (cur - pre)  / pre  * 100 : null;
      const pdPct  = base ? (cur - base) / base * 100 : null;
      const pdLbl  = { 90: '3달', 180: '6달', 365: '1년', 0: '전체' }[CB.period] ?? CB.period + '일';
      return `
      <div style="padding:8px 12px;border-left:3px solid ${s.color}">
        <div style="font-size:11px;color:var(--text2)">${s.name}</div>
        <div style="font-size:15px;font-weight:700;font-variant-numeric:tabular-nums">${fmtTV(cur * 1e6)}원</div>
        <div style="font-size:11px;margin-top:2px">
          <span style="color:${chgColor(d1Pct)}">전일 ${d1 != null ? fmtNet(d1) : '—'}${d1Pct != null ? ` (${d1Pct > 0 ? '+' : ''}${d1Pct.toFixed(1)}%)` : ''}</span>
          <span style="color:var(--border);margin:0 4px">·</span>
          <span style="color:${chgColor(pdPct)}">${pdLbl} ${pdPct != null ? (pdPct > 0 ? '+' : '') + pdPct.toFixed(1) + '%' : '—'}</span>
        </div>
      </div>`;
    }).join('');
  }

  // ── 차트: 이중축 (좌 코스피 / 우 코스닥 — 잔고 스케일 27조 vs 7조 차이 보정) ──
  const t = chartTheme();
  const labels = rows.map(r => r.base_date);
  const datasets = CB_SERIES.map(s => ({
    label:           s.name,
    data:            rows.map(r => r[s.col]),
    yAxisID:         s.axis,
    borderColor:     s.color,
    backgroundColor: s.color + '15',
    borderWidth:     2,
    pointRadius:     0,
    pointHoverRadius: 4,
    tension:         0.2,
    fill:            false,
    spanGaps:        true,
  }));

  if (CB.chart) { CB.chart.destroy(); CB.chart = null; }
  const axisTicks = color => ({
    color,
    callback: v => (v / 1e6).toFixed(1) + '조',
    maxTicksLimit: 5,
    font: { size: 10 },
  });
  CB.chart = new Chart(canvas.getContext('2d'), {
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
            label: ctx => `${ctx.dataset.label}: ${(ctx.parsed.y / 1e6).toFixed(2)}조`,
          }
        }
      },
      scales: {
        x:  { ticks: { color: t.tick, maxTicksLimit: 6, maxRotation: 0, font: { size: 10 } }, grid: { color: t.grid } },
        y:  { position: 'left',  ticks: axisTicks(CB_SERIES[0].color), grid: { color: t.grid } },
        y1: { position: 'right', ticks: axisTicks(CB_SERIES[1].color), grid: { drawOnChartArea: false } },
      }
    }
  });
}
