// chart-industry.js — KR 산업별 흐름 비교 차트
// 의존: config.js (INDUSTRIES, IND_COLORS, IND_DEFAULT_COLORS)

// ══════════════════════════════════════════
//  📈 산업별 흐름 비교 차트
// ══════════════════════════════════════════

// IND_COLORS — config.js에서 전역 정의
const IND_DEFAULT_COLORS = [
  '#2AABEE','#2dce89','#ffd600','#ff6b35','#f5365c',
  '#a259ff','#00d4aa','#fb6340','#4fc3f7','#aed581','#e040fb','#80cbc4',
];

let _indTrendPeriod = 7;
let _indTrendChart2 = null;
let _indTrendSelected = null; // null = 전체

async function loadIndTrendChart() {
  const canvas = document.getElementById('ind-trend-chart');
  if (!canvas) return;

  const industryMap = await getIndustryMap();

  // 날짜 목록: 모니터링 종목 중 첫 번째 코드로 날짜 추출
  const monCodes = Object.keys(industryMap);
  const refCode = monCodes[0];
  if (!refCode) return;

  const { data: dateRows } = await sb.from('market_data')
    .select('base_date')
    .eq('stock_code', refCode)
    .order('base_date', { ascending: false })
    .limit(_indTrendPeriod + 10);

  if (!dateRows?.length) return;
  const dateList = [...new Set(dateRows.map(r => r.base_date))].sort().slice(-_indTrendPeriod);
  if (dateList.length < 2) return;
  const oldestDate = dateList[0];

  // 모니터링 종목만 조회 (전체 상장사 × N일 → 모니터링 ~300 × N일, 약 88% 감소)
  const allRows = await fetchAllPages((s, e) =>
    sb.from('market_data')
      .select('stock_code,base_date,price_change_rate')
      .in('stock_code', monCodes)
      .gte('base_date', oldestDate)
      .not('price_change_rate', 'is', null)
      .range(s, e)
  );

  // 날짜 × 산업별 평균 등락률 집계
  const indDates = {}; // { '반도체': { '2026-05-09': [chg, chg, ...] } }
  allRows.forEach(r => {
    const ind = industryMap[r.stock_code];
    if (!ind || ind === '기타') return;
    if (!indDates[ind]) indDates[ind] = {};
    if (!indDates[ind][r.base_date]) indDates[ind][r.base_date] = [];
    indDates[ind][r.base_date].push(r.price_change_rate);
  });
  window._krIndDates = indDates;  // US vs KR 차트에서 재활용

  // 산업 목록 (데이터 있는 것만)
  const industries = Object.keys(indDates).sort();

  // ── 산업별 최종 누적 수익률 계산 (범례 정렬 + 상/하위 필터용) ──
  const indFinalReturn = {}; // { '반도체': 3.42, ... }
  industries.forEach(ind => {
    let cum = 100;
    dateList.forEach(date => {
      const chgs = indDates[ind]?.[date];
      if (chgs?.length) {
        const avg = chgs.reduce((s,v) => s+v, 0) / chgs.length;
        cum = cum * (1 + avg / 100);
      }
    });
    indFinalReturn[ind] = parseFloat((cum - 100).toFixed(2));
  });
  window._krIndFinalReturn = indFinalReturn;  // market-insight.js에서 재활용

  // 수익률 순으로 정렬된 산업 목록
  const industriesSorted = [...industries].sort(
    (a, b) => indFinalReturn[b] - indFinalReturn[a]
  );

  // ── ② 범례: 수익률 순위 + 수치 표시 (매번 갱신) ──
  const checksEl = document.getElementById('ind-trend-checks');
  if (checksEl) {
    // 기존 범례 태그만 제거 (버튼은 유지)
    checksEl.querySelectorAll('.ind-legend-item').forEach(el => el.remove());

    // 정렬된 순서로 범례 삽입 (버튼 앞에)
    const btnGroup = checksEl.querySelector('#btn-top3')?.parentElement;
    industriesSorted.forEach((ind, i) => {
      const color = IND_COLORS[ind] || IND_DEFAULT_COLORS[industries.indexOf(ind) % IND_DEFAULT_COLORS.length];
      const ret   = indFinalReturn[ind];
      const retColor = ret >= 0 ? 'var(--red)' : 'var(--blue)';
      const retStr  = (ret >= 0 ? '+' : '') + ret.toFixed(1) + '%';
      const isChecked = window._indChecked?.[ind] !== false;

      const lbl = document.createElement('label');
      lbl.className = 'ind-legend-item';
      lbl.id = 'ind-lbl-' + ind;
      lbl.style.cssText = `display:flex;align-items:center;gap:5px;cursor:pointer;padding:3px 8px;
        border-radius:100px;border:1px solid var(--border);font-size:12px;user-select:none;
        opacity:${isChecked ? '1' : '0.35'};transition:opacity .15s`;
      lbl.innerHTML = `
        <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0"></span>
        <span>${ind}</span>
        <span style="font-weight:700;color:${retColor};font-size:11px">${retStr}</span>`;
      lbl.onclick = () => { window._toggleIndLegend(ind); };

      if (btnGroup) checksEl.insertBefore(lbl, btnGroup);
      else checksEl.appendChild(lbl);
    });
  }

  // ── 필터 모드 적용 ──
  let selectedInds;
  const mode = window._indFilterMode || 'all';
  if (mode === 'top') {
    selectedInds = industriesSorted.slice(0, 3);
  } else if (mode === 'bottom') {
    selectedInds = industriesSorted.slice(-3);
  } else {
    selectedInds = industriesSorted.filter(ind => window._indChecked?.[ind] !== false);
    if (selectedInds.length === 0) selectedInds = [...industriesSorted];
  }

  // ── 날짜별 누적 지수 계산 (공통 시작점 100) ──
  const datasets = selectedInds.map((ind) => {
    const color = IND_COLORS[ind] || IND_DEFAULT_COLORS[industries.indexOf(ind) % IND_DEFAULT_COLORS.length];
    let cumulative = 100;
    let started = false;
    const data = dateList.map(date => {
      const chgs = indDates[ind]?.[date];
      if (chgs?.length) {
        started = true;
        const avg = chgs.reduce((s,v) => s+v, 0) / chgs.length;
        cumulative = cumulative * (1 + avg / 100);
      }
      return started ? parseFloat(cumulative.toFixed(2)) : null;
    });

    const _pin = window._indPinned;
    const active = !_pin || ind === _pin;
    return {
      label: ind, data,
      borderColor: active ? color : color + '55',
      backgroundColor: color + '18',
      borderWidth: active ? (_pin ? 4 : 1.5) : 1.2,
      pointRadius: active ? (_pin ? 4 : 2)   : 1,
      pointHoverRadius: 6,
      tension: 0.3, fill: false, spanGaps: true,
    };
  });

  // ── 차트 그리기 ──
  if (_indTrendChart2) { _indTrendChart2.destroy(); _indTrendChart2 = null; }
  if (!window.Chart) return;

  _indTrendChart2 = new window.Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels: dateList, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1a1d27', titleColor: '#f0f2f8', bodyColor: '#a8adc4',
          callbacks: {
            // 툴팁도 수익률 순 정렬
            beforeBody: (items) => { items.sort((a,b) => b.parsed.y - a.parsed.y); return []; },
            label: ctx => {
              const cur  = ctx.parsed.y;
              const ret  = cur !== null ? (cur - 100).toFixed(1) : '—';
              const sign = ret >= 0 ? '+' : '';
              return ` ${ctx.dataset.label}  ${cur?.toFixed(1)}  (${sign}${ret}%)`;
            }
          }
        }
      },
      // onHover는 사용하지 않음 — mousemove로 직접 처리
      scales: {
        x: { ticks: { color: '#6e7491', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,.05)' } },
        y: {
          ticks: { color: '#6e7491', font: { size: 11 }, callback: v => v.toFixed(0) },
          grid: { color: 'rgba(255,255,255,.05)' }
        }
      }
    }
  });

  // canvas 이벤트 재바인딩 (차트 재생성 시 _hoverBound 초기화)
  const freshCanvas = document.getElementById('ind-trend-chart');
  if (freshCanvas) freshCanvas._hoverBound = false;
  _bindIndTrendHover();
}

// ── 산업별 흐름 하이라이트 헬퍼 (전역) ──
function _applyIndHighlight(label) {
  const chart = _indTrendChart2;
  if (!chart) return;
  chart.data.datasets.forEach((ds, i) => {
    const color = IND_COLORS[ds.label] || IND_DEFAULT_COLORS[i % IND_DEFAULT_COLORS.length];
    if (!label) {
      // 완전 해제 — 기본값 복원
      ds.borderWidth = 1.5;
      ds.pointRadius = 2;
      ds.borderColor = color;
    } else {
      const active = ds.label === label;
      ds.borderWidth = active ? 4   : 1.2;
      ds.pointRadius = active ? 4   : 1;
      ds.borderColor = active ? color : color + '55';
    }
  });
  chart.update('none');
  document.querySelectorAll('.ind-legend-item').forEach(lbl => {
    const ind = lbl.id.replace('ind-lbl-', '');
    lbl.style.opacity     = !label || ind === label ? '1' : '0.35';
    lbl.style.borderWidth = label && ind === label  ? '2px' : '';
  });
}
function _applyIndHover(label) {
  if (window._indPinned) return;
  if (label === window._indHovered) return;
  window._indHovered = label;
  _applyIndHighlight(label);
}

// ── canvas 마우스 이벤트로 호버 하이라이트 ──
// (loadIndTrendChart 호출 후 외부에서 canvas 이벤트 재바인딩)
function _bindIndTrendHover() {
  const canvas = document.getElementById('ind-trend-chart');
  if (!canvas || canvas._hoverBound) return;
  canvas._hoverBound = true;

  canvas.addEventListener('mousemove', (e) => {
    const chart = _indTrendChart2;
    if (!chart) return;
    const pts = chart.getElementsAtEventForMode(e, 'nearest', { intersect: false }, true);
    const label = pts.length ? chart.data.datasets[pts[0].datasetIndex]?.label : null;
    _applyIndHover(label);
  });

  canvas.addEventListener('mouseleave', () => {
    if (!window._indPinned) {
      window._indHovered = null;
      _applyIndHighlight(null);
    }
  });

  // 클릭으로 고정/해제
  if (canvas._indClickHandler) canvas.removeEventListener('click', canvas._indClickHandler);
  canvas._indClickHandler = (e) => {
    const chart = _indTrendChart2;
    if (!chart) return;
    const pts = chart.getElementsAtEventForMode(e, 'nearest', { intersect: false }, true);
    const clicked = pts.length ? chart.data.datasets[pts[0].datasetIndex]?.label : null;
    window._indPinned = (clicked && clicked !== window._indPinned) ? clicked : null;
    window._indHovered = window._indPinned;
    _applyIndHighlight(window._indPinned);
  };
  canvas.addEventListener('click', canvas._indClickHandler);
}

// 호버/클릭 하이라이트 상태
window._indHovered = null;
window._indPinned  = null;   // 클릭으로 고정된 산업
window._indChecked    = {};   // { 반도체: true, ... }
window._indFilterMode = 'all';

window._toggleIndLegend = function(ind) {
  if (!window._indChecked) window._indChecked = {};
  window._indChecked[ind] = window._indChecked[ind] === false ? true : false;
  const lbl = document.getElementById('ind-lbl-' + ind);
  if (lbl) lbl.style.opacity = window._indChecked[ind] === false ? '0.35' : '1';
  loadIndTrendChart();
};

// ③ 상/하위 필터 버튼
function filterIndTrend(mode) {
  window._indFilterMode = mode;
  ['top','bottom','all'].forEach(m => {
    const btn = document.getElementById('btn-' + (m === 'all' ? 'all' : m === 'top' ? 'top3' : 'bot3'));
    if (btn) btn.classList.toggle('active', m === mode);
  });
  loadIndTrendChart();
}

function setIndTrendPeriod(period) {
  _indTrendPeriod = period;
  document.querySelectorAll('[data-ind-period]').forEach(b =>
    b.classList.toggle('active', b.dataset.indPeriod === String(period)));
  loadIndTrendChart();
}

function toggleIndTrend(ind) {
  window._toggleIndLegend(ind);
}


