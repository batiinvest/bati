// chart-uskr.js — US vs KR 산업 비교 차트
// 의존: config.js (INDUSTRIES, IND_COLORS), chart-industry.js (_krIndDates)

// ══════════════════════════════════════════════════════════════
// 🌐 US vs KR 산업 비교 차트
// ══════════════════════════════════════════════════════════════

// KR 산업 → US ETF 대응
// 산업별 ETF 목록 — us_etf_map 테이블에서 동적 로드
let USKR_MAP = {};

async function loadUskrMap() {
  const { data } = await sb.from('us_etf_map').select('industry,ticker').order('industry').order('ticker');
  const map = {};
  (data || []).forEach(r => {
    if (!map[r.industry]) map[r.industry] = [];
    if (!map[r.industry].includes(r.ticker)) map[r.industry].push(r.ticker);
  });
  USKR_MAP = map;
  window.USKR_MAP = map;
}

// KR_IND_COLORS → IND_COLORS 통합 (config.js 참조)
const KR_IND_COLORS = IND_COLORS;

let _uskrChart = null;
let _uskrPeriod   = 7;
let _uskrSelected = '반도체';
let _uskrMode     = 'avg';   // 'avg' = KR평균 vs US평균, 'all' = KR평균 + 전체 ETF

function selectUskrInd(ind) {
  _uskrSelected = ind;
  window._uskrPinned  = null;  // 산업 전환 시 고정 해제
  window._uskrHovered = null;
  document.querySelectorAll('[id^="uskr-btn-"]').forEach(b =>
    b.classList.toggle('active', b.id === 'uskr-btn-' + ind));
  loadUskrChart();
}

function setUskrMode(mode) {
  _uskrMode = mode;
  document.getElementById('uskr-mode-avg')?.classList.toggle('active', mode === 'avg');
  document.getElementById('uskr-mode-all')?.classList.toggle('active', mode === 'all');
  loadUskrChart();
}

async function loadUskrChart() {
  const canvas = document.getElementById('uskr-chart');
  if (!canvas) return;

  const ind     = _uskrSelected;
  const tickers = USKR_MAP[ind];
  if (!tickers) return;
  const krColor = KR_IND_COLORS[ind] || '#2dce89';

  // ── loadIndTrendChart와 완전히 동일한 방식으로 날짜·데이터 확정 ──
  // Step1: 실제 거래일 목록을 refCode 기준으로 확정 (달력 기준 아님)
  const industryMap = window._industryMapCache || {};
  // ※ 전체 맵의 첫 종목이 아닌, 선택 산업 내 첫 종목을 기준으로 사용
  //   → 산업별 데이터 보유 기간이 달라도 선택 산업 기준으로 일관된 날짜 확정
  const indCodes = Object.keys(industryMap).filter(k => industryMap[k] === ind);
  const refCode  = indCodes[0] || Object.keys(industryMap)[0];
  if (!refCode) return;

  const { data: dateRows } = await sb.from('market_data')
    .select('base_date')
    .eq('stock_code', refCode)
    .order('base_date', { ascending: false })
    .limit(_uskrPeriod + 10);

  if (!dateRows?.length) return;
  const tradingDays = [...new Set(dateRows.map(r => r.base_date))].sort().slice(-_uskrPeriod);
  const oldestDate  = tradingDays[0];

  // Step2+3: KR · US 병렬 조회 — 둘 다 oldestDate에만 의존하므로 동시에 받는다.
  //  KR은 선택 산업 종목코드(indCodes)로 범위를 좁힌다. market_data엔 전 상장사
  //  (~2,600종목)가 있어 전체 조회 시 3달=수십만 행/수백 페이지가 되지만,
  //  한 산업(수십 종목)만 받으면 수천 행으로 줄어 로딩이 크게 빨라진다.
  //  (indCodes는 industryMap에서 해당 산업만 추린 것 → 기존 industryMap 필터와 동일 결과)
  const krDates = {};
  const [allRows, usResp] = await Promise.all([
    fetchAllPages(
      sb.from('market_data')
        .select('stock_code,base_date,price_change_rate')
        .in('stock_code', indCodes)
        .gte('base_date', oldestDate)
        .not('price_change_rate', 'is', null)
    ),
    sb.from('us_market')
      .select('base_date,ticker,close,chg_pct')
      .eq('industry', ind)
      .in('ticker', tickers)
      .gte('base_date', oldestDate)
      .order('base_date', { ascending: true }),
  ]);
  allRows.forEach(r => {
    if (!krDates[r.base_date]) krDates[r.base_date] = [];
    krDates[r.base_date].push(r.price_change_rate);
  });
  const usRows = usResp.data;

  // Step4: 날짜 목록 — KR 실제 거래일 기준 (loadIndTrendChart와 동일)
  const dateList = tradingDays;

  // ── KR 누적 지수 (config.js 공용 헬퍼) ──
  const makeKrData = () => indCumIndexSeries(krDates, dateList);

  // ── US 누적 지수 빌더 ──
  const makeUsData = (tickerRows) => {
    let base = null;
    return dateList.map(date => {
      const r = tickerRows.find(x => x.base_date === date);
      if (r?.close != null) {
        if (base === null) base = r.close;
        return parseFloat((r.close / base * 100).toFixed(2));
      }
      return null;
    });
  };

  // ── ETF 색상 팔레트 ──
  const ETF_COLORS = ['#2AABEE','#f97316','#e879f9','#fbbf24','#f87171',
                      '#818cf8','#34d399','#fb7185','#38bdf8','#a3e635','#c084fc','#fdba74'];

  const datasets = [];

  // KR 평균 (항상 표시)
  datasets.push({
    label: `🇰🇷 ${ind}`,
    data: makeKrData(),
    borderColor: krColor, backgroundColor: krColor + '22',
    borderWidth: 3, pointRadius: 3, tension: 0.3,
    fill: false, spanGaps: true,
  });

  if (_uskrMode === 'avg') {
    // US ETF 평균 — KR과 동일한 등가중 수익률 방식 (단일 선).
    // 주의: 종가(close) 레벨을 평균내면 고가 ETF에 가중치가 쏠려(가격가중)
    //   KR(일별 등락률 등가중)과 방법론이 어긋난다. 일별 chg_pct를 등가중
    //   평균한 뒤 indCumIndexSeries로 복리(시작 100) → KR과 동일 기준.
    const usChg = {};
    (usRows || []).forEach(r => {
      if (r.chg_pct == null) return;
      if (!usChg[r.base_date]) usChg[r.base_date] = [];
      usChg[r.base_date].push(r.chg_pct);
    });
    const normAvg = indCumIndexSeries(usChg, dateList);
    datasets.push({
      label: `🇺🇸 ${ind} 평균(${tickers.length}개)`,
      data: normAvg,
      borderColor: '#2AABEE', backgroundColor: '#2AABEE22',
      borderWidth: 2, pointRadius: 3, tension: 0.3,
      borderDash: [8, 4], fill: false, spanGaps: true,
    });
  } else {
    // 개별 ETF 전체 표시
    tickers.forEach((ticker, i) => {
      const tickerRows = (usRows || []).filter(r => r.ticker === ticker);
      const color = ETF_COLORS[i % ETF_COLORS.length];
      datasets.push({
        label: `🇺🇸 ${ticker}`,
        data: makeUsData(tickerRows),
        borderColor: color, backgroundColor: color + '22',
        borderWidth: 1.5, pointRadius: 2, tension: 0.3,
        borderDash: [5, 3], fill: false, spanGaps: true,
      });
    });
  }

  // ── 차트 그리기 ──
  if (_uskrChart) { _uskrChart.destroy(); _uskrChart = null; }
  window._uskrPinned  = window._uskrPinned  || null;
  window._uskrHovered = null;
  if (!window.Chart) return;

  _uskrChart = new window.Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels: dateList, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: '#a8adc4',
            font: { size: 12 },
            padding: 16,
            usePointStyle: true,
            pointStyle: 'line',
            generateLabels: (chart) => {
              return chart.data.datasets.map((ds, i) => {
                // 마지막 유효값으로 누적 수익률 계산
                const vals = ds.data.filter(v => v != null);
                const last = vals.length ? vals[vals.length - 1] : null;
                const ret  = last != null ? (last - 100) : null;
                const retStr = ret != null
                  ? ` ${ret >= 0 ? '+' : ''}${ret.toFixed(1)}%`
                  : '';
                const retColor = ret == null ? '#a8adc4' : ret >= 0 ? '#ff6b6b' : '#4a9eff';
                const isUS = ds.label.startsWith('🇺🇸');
                return {
                  text: ds.label + retStr,
                  fillStyle: ds.borderColor,
                  strokeStyle: ds.borderColor,
                  lineWidth: isUS ? 1.5 : 3,
                  lineDash: isUS ? [6, 3] : [],
                  pointStyle: 'line',
                  fontColor: ret == null ? '#a8adc4' : retColor,
                  hidden: false,
                  datasetIndex: i,
                };
              });
            }
          }
        },
        tooltip: {
          backgroundColor: '#1a1d27',
          titleColor: '#f0f2f8',
          titleFont: { size: 12, weight: '600' },
          bodyColor: '#a8adc4',
          bodyFont: { size: 12 },
          padding: 12,
          borderColor: 'rgba(255,255,255,.1)',
          borderWidth: 1,
          callbacks: {
            title: items => items[0]?.label || '',
            label: ctx => {
              const v = ctx.parsed.y;
              if (v == null) return '';
              const ret = v - 100;
              const sign = ret >= 0 ? '+' : '';
              const arrow = ret >= 0 ? '▲' : '▼';
              const isUS = ctx.dataset.label.startsWith('🇺🇸');
              const type = isUS ? '- - -' : '———';
              return ` ${type} ${ctx.dataset.label}   ${arrow}${sign}${ret.toFixed(2)}%`;
            },
            afterBody: items => {
              // KR과 US 차이 표시 (avg 모드일 때만)
              if (items.length !== 2) return [];
              const kr = items.find(i => i.dataset.label.startsWith('🇰🇷'));
              const us = items.find(i => i.dataset.label.startsWith('🇺🇸'));
              if (!kr || !us || kr.parsed.y == null || us.parsed.y == null) return [];
              const diff = (kr.parsed.y - us.parsed.y).toFixed(2);
              const sign = diff >= 0 ? '+' : '';
              return ['', ` KR - US 스프레드  ${sign}${diff}%`];
            }
          }
        }
      },
      scales: {
        x: { ticks: { color:'#6e7491', font:{size:10} }, grid:{color:'rgba(255,255,255,.05)'} },
        y: {
          ticks: { color:'#6e7491', font:{size:11}, callback: v => {
            const ret = v - 100;
            return (ret >= 0 ? '+' : '') + ret.toFixed(0) + '%';
          }},
          grid: { color:'rgba(255,255,255,.05)' }
        }
      }
    }
  });

  // canvas 이벤트 재바인딩 — 공통 호버/클릭-고정 바인더 (config.js)
  bindLineChartHover(document.getElementById('uskr-chart'), {
    getChart: () => _uskrChart,
    applyHighlight: _applyUskrHighlight,
    state: {
      get pinned()  { return window._uskrPinned; },  set pinned(v)  { window._uskrPinned = v; },
      get hovered() { return window._uskrHovered; }, set hovered(v) { window._uskrHovered = v; },
    },
  });
}

// ── US vs KR 하이라이트 헬퍼 ──
function _applyUskrHighlight(label) {
  const chart = _uskrChart;
  if (!chart) return;
  chart.data.datasets.forEach((ds, i) => {
    const origColor = ds._origColor || ds.borderColor.replace(/55$|44$/, '');
    if (!ds._origColor) ds._origColor = origColor;
    if (!label) {
      // 해제 — 기본값 복원
      ds.borderWidth = ds.label.startsWith('🇰🇷') ? 3 : 2;
      ds.pointRadius = 3;
      ds.borderColor = origColor;
    } else {
      const active = ds.label === label;
      ds.borderWidth = active ? 4   : 1.2;
      ds.pointRadius = active ? 4   : 1;
      ds.borderColor = active ? origColor : origColor + '44';
    }
  });
  chart.update('none');
}

function reloadUskrChart() { loadUskrChart(); }

function setUskrPeriod(period) {
  _uskrPeriod = period;
  document.querySelectorAll('[data-uskr-period]').forEach(b =>
    b.classList.toggle('active', b.dataset.uskrPeriod === String(period)));
  loadUskrChart();
}
