// market-investor.js — 오늘의 시황: 투자자별 매매동향 카드 (개인·외국인·기관 순매수)
// 데이터: market_investor_flow (KIS 시장별 투자자매매동향 일별, 백만원 단위, 백엔드가 매일 18:20 수집)
//   당일분이 장 마감 후 확정되므로 저녁 수집 — 기준일은 최신 행의 base_date로 표기.
// 의존: config.js (sb, chartTheme, fmtNet, chgColor, setAsOf), Chart.js

const MIF = {
  market: 'kospi',   // 표시 시장: kospi | kosdaq
  period: 90,        // 표시 기간(일). 0 = 전체
  rows: null,        // 전체 시계열 캐시 (오름차순)
  chart: null,
};

// 외국인·기관 색 = 위 '기관/외국인 수급' 카드 컬럼 헤더와 동일 색 언어
const MIF_SERIES = [
  { key: 'indi', name: '개인',   color: '#2dce89' },
  { key: 'frgn', name: '외국인', color: '#2AABEE' },
  { key: 'orgn', name: '기관',   color: '#fb6340' },
];

async function loadMarketInvestor() {
  if (!document.getElementById('mif-chart')) return;
  try {
    // desc→reverse: 1000행 초과 축적 시에도 최신 구간이 잘리지 않게
    const { data, error } = await sb.from('market_investor_flow')
      .select('base_date,kospi_indi,kospi_frgn,kospi_orgn,kosdaq_indi,kosdaq_frgn,kosdaq_orgn')
      .order('base_date', { ascending: false })
      .limit(1000);
    if (error) throw error;
    MIF.rows = (data || []).reverse();
    renderMarketInvestor();
  } catch (e) {
    console.warn('[투자자동향] 로드 실패', e);
    MIF.rows = [];
    renderMarketInvestor();
  }
}

function setMifPeriod(days) {
  MIF.period = days;
  document.querySelectorAll('[data-mif-period]').forEach(b =>
    b.classList.toggle('active', b.dataset.mifPeriod === String(days)));
  renderMarketInvestor();
}

function setMifMarket(mkt) {
  MIF.market = mkt;
  document.querySelectorAll('[data-mif-market]').forEach(b =>
    b.classList.toggle('active', b.dataset.mifMarket === mkt));
  renderMarketInvestor();
}

function renderMarketInvestor() {
  const canvas  = document.getElementById('mif-chart');
  const empty   = document.getElementById('mif-empty');
  const summary = document.getElementById('mif-summary');
  if (!canvas) return;

  const col = k => `${MIF.market}_${k}`;
  const all = (MIF.rows || []).filter(r => MIF_SERIES.every(s => r[col(s.key)] != null));
  let rows = all;
  if (MIF.period > 0 && all.length) {
    const cutoff = new Date(Date.now() - MIF.period * 86400e3).toISOString().slice(0, 10);
    rows = all.filter(r => r.base_date >= cutoff);
  }

  if (rows.length < 2) {
    canvas.style.display = 'none';
    if (empty) empty.style.display = 'flex';
    if (summary) summary.innerHTML = '';
    setAsOf('mif-date', null);
    return;
  }
  canvas.style.display = 'block';
  if (empty) empty.style.display = 'none';

  const last = rows[rows.length - 1];
  setAsOf('mif-date', last.base_date);

  // ── 요약: 주체별 당일 순매수 + 기간 누적 ──
  if (summary) {
    const pdLbl = { 90: '3달', 180: '6달', 365: '1년', 0: '전체' }[MIF.period] ?? MIF.period + '일';
    summary.innerHTML = MIF_SERIES.map(s => {
      const d1  = last[col(s.key)];                                   // 백만원
      const cum = rows.reduce((a, r) => a + r[col(s.key)], 0);
      return `
      <div style="padding:8px 12px;border-left:3px solid ${s.color}">
        <div style="font-size:11px;color:var(--text2)">${s.name}</div>
        <div style="font-size:15px;font-weight:700;font-variant-numeric:tabular-nums;color:${chgColor(d1)}">${fmtNet(d1)}</div>
        <div style="font-size:11px;margin-top:2px;color:${chgColor(cum)}">${pdLbl} 누적 ${fmtNet(cum)}</div>
      </div>`;
    }).join('');
  }

  // ── 차트: 기간 시작점 기준 누적 순매수 라인 (누가 사 모으고 있나) ──
  const t = chartTheme();
  const labels = rows.map(r => r.base_date);
  const datasets = MIF_SERIES.map(s => {
    let acc = 0;
    return {
      label:           s.name,
      data:            rows.map(r => (acc += r[col(s.key)])),
      borderColor:     s.color,
      backgroundColor: s.color + '15',
      borderWidth:     2,
      pointRadius:     0,
      pointHoverRadius: 4,
      tension:         0.2,
      fill:            false,
    };
  });

  if (MIF.chart) { MIF.chart.destroy(); MIF.chart = null; }
  MIF.chart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          labels: { color: t.tick, boxWidth: 8, boxHeight: 8, font: { size: 10 } },
        },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label} 누적: ${fmtNet(ctx.parsed.y)}`,
          }
        }
      },
      scales: {
        x: { ticks: { color: t.tick, maxTicksLimit: 6, maxRotation: 0, font: { size: 10 } }, grid: { color: t.grid } },
        y: {
          ticks: {
            color: t.tick,
            maxTicksLimit: 5,
            font: { size: 10 },
            callback: v => Math.abs(v) >= 1e6
              ? (v / 1e6).toFixed(1) + '조'
              : Math.round(v / 100).toLocaleString() + '억',
          },
          grid: { color: t.grid },
        },
      }
    }
  });
}
