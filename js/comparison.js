// comparison.js — 기업 비교 분석 페이지
// 의존: config.js (INDUSTRIES, CATS, fetchAllPages, fmtCap, chgColor, chgStr, loadingHTML, emptyHTML)

// ── 비교 상태 ──
const CMP = {
  selectedCodes: [],   // 선택된 종목코드 배열
  industry: '',        // 산업 필터 ('' = 전체)
  metric: 'revenue',  // 선택된 지표
  period: '8',         // 표시 분기 수
  normalize: false,    // 정규화 차트 (100 기준)
  pricePeriod: '3M',   // 주가 흐름 비교 기간 — '1M' · '3M' · 'ALL'(보관된 일별 시세 전체, 약 120일)
  priceRows: {},       // 종목코드 → market_data 일별 행(최신순) — 주가 동향 표·주가 흐름 비교 공용
  // 구 window._cmp* 수렴 (런타임 대입): metricCache·sortedLabels·stockDataMap·chartLabels·chartDatasets
};

const CMP_METRICS = [
  { key: 'revenue',            label: '매출액',      unit: '억', scale: 1e8, chartType: 'bar'  },
  { key: 'operating_profit',   label: '영업이익',    unit: '억', scale: 1e8, chartType: 'bar'  },
  { key: 'net_income',         label: '순이익',      unit: '억', scale: 1e8, chartType: 'bar'  },
  { key: 'operating_margin',   label: '영업이익률',  unit: '%',  scale: 1,   chartType: 'line' },
  { key: 'roe',                label: 'ROE',          unit: '%',  scale: 1,   chartType: 'line' },
  { key: 'roa',                label: 'ROA',          unit: '%',  scale: 1,   chartType: 'line' },
  { key: 'debt_ratio',         label: '부채비율',    unit: '%',  scale: 1,   chartType: 'line' },
  { key: 'total_assets',       label: '자산총계',    unit: '억', scale: 1e8, chartType: 'bar'  },
  { key: 'operating_cashflow', label: '영업현금흐름', unit: '억', scale: 1e8, chartType: 'bar'  },
  { key: 'fcf',                label: 'FCF',          unit: '억', scale: 1e8, chartType: 'bar'  },
  { key: 'gross_profit',       label: '매출총이익',   unit: '억', scale: 1e8, chartType: 'bar'  },
  // financials 밖 — DART 정기보고서 수주잔고 합계(dart_segment_revenue 'backlog_total', 반도체 장비만). 재무 행에 붙여 씀.
  // 선 차트 — 막대(10종목 × 8분기)는 큰 회사 하나에 눈금이 맞춰져 나머지가 안 보였다(10-18 사용자). 정규화(100 기준)도 선에서만 된다.
  // bars: 상세 표 칸 아래 분기별 최대 대비 막대. 잔고÷연매출 = 잔고 ÷ 최근 4분기 매출 — 회사 크기와 상관없이 비교
  { key: 'backlog',            label: '수주잔고',     unit: '억', scale: 1e8, chartType: 'line', src: 'backlog', bars: true },
  { key: 'backlog_ratio',      label: '잔고÷연매출',  unit: '배', scale: 1,   chartType: 'line', src: 'backlog', bars: true, dec: 2 },
];

// Chart.js 색상 팔레트 — config.js 공용 계열 색(예전 팔레트는 #2AABEE↔#4a9eff, #2dce89↔#00d4aa가 거의 같은 색)
const CMP_COLORS = SERIES_PAL;

function pComparison() {
  return `
  <div style="display:grid;grid-template-columns:300px 1fr;gap:12px;align-items:start">

    <!-- 좌측 패널: 종목 선택 -->
    <div style="position:sticky;top:1rem;display:flex;flex-direction:column;gap:10px;overflow:visible">

      <!-- 산업 선택 -->
      <div class="card">
        <div class="card-header"><span class="card-title">산업 / 테마 선택</span></div>
        <div style="padding:.75rem;display:flex;flex-direction:column;gap:6px">
          <select class="form-select" id="cmp-industry" onchange="onCmpIndustryChange()" style="width:100%">
            <option value="">-- 산업 선택 --</option>
            ${INDUSTRIES.map(i=>`<option value="${i}">${i}</option>`).join('')}
          </select>
          <!-- 테마(sub_industry) 선택 — 산업 선택 후 표시 -->
          <div id="cmp-theme-wrap" style="display:none;flex-direction:column;gap:6px">
            <select class="form-select" id="cmp-theme" style="width:100%">
              <option value="">-- 테마 선택 (선택 시 해당 테마만) --</option>
            </select>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm btn-primary" onclick="addIndustryAll()" style="flex:1">전체 추가</button>
            <button class="btn btn-sm" onclick="addThemeOnly()" style="flex:1" id="cmp-theme-btn" disabled>테마만 추가</button>
          </div>
        </div>
      </div>

      <!-- 종목 검색 -->
      <div class="card" style="overflow:visible">
        <div class="card-header"><span class="card-title">종목 검색</span></div>
        <div style="padding:.75rem;display:flex;flex-direction:column;gap:6px;overflow:visible">
          <div style="position:relative">
            <input class="form-input" id="cmp-search" placeholder="종목명 검색..."
              oninput="onCmpSearch(this.value)" autocomplete="off"
              style="width:100%;box-sizing:border-box">
            <div id="cmp-dropdown" style="
              display:none;position:absolute;top:100%;left:0;right:0;z-index:9999;
              background:var(--bg2);border:1px solid var(--border2);border-radius:var(--radius-sm);
              max-height:220px;overflow-y:auto;margin-top:2px;
              box-shadow:0 8px 24px rgba(0,0,0,.4)"></div>
          </div>
        </div>
      </div>

      <!-- 선택된 종목 -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">선택 종목 <span id="cmp-count" style="font-size:calc(11px*var(--m-label));color:var(--text2)">0개</span></span>
          <button class="btn btn-sm" onclick="clearCmpStocks()">전체 해제</button>
        </div>
        <div id="cmp-selected-list" style="padding:.5rem;min-height:60px;max-height:300px;overflow-y:auto">
          <div style="padding:.5rem;text-align:center;color:var(--text2);font-size:calc(12px*var(--m-sub))">종목을 선택해주세요</div>
        </div>
        <div style="padding:.5rem .75rem;border-top:1px solid var(--border)">
          <button class="btn btn-primary" style="width:100%" onclick="runComparison()">비교 분석 실행</button>
        </div>
      </div>

      <!-- 지표/기간 설정 -->
      <div class="card">
        <div class="card-header"><span class="card-title">지표 / 기간</span></div>
        <div style="padding:.75rem;display:flex;flex-direction:column;gap:8px">
          <div>
            <div style="font-size:calc(11px*var(--m-label));color:var(--text1);margin-bottom:4px">재무 지표</div>
            <select class="form-select" id="cmp-metric" onchange="CMP.metric=this.value;CMP.metrics=[this.value]" style="width:100%">
              ${CMP_METRICS.map(m=>`<option value="${m.key}" ${CMP.metric===m.key?'selected':''}>${m.label}</option>`).join('')}
            </select>
          </div>
          <div>
            <div style="font-size:calc(11px*var(--m-label));color:var(--text1);margin-bottom:4px">표시 분기</div>
            <select class="form-select" id="cmp-period" onchange="CMP.period=this.value" style="width:100%">
              <option value="4">최근 4분기</option>
              <option value="8" selected>최근 8분기</option>
              <option value="12">최근 12분기</option>
            </select>
          </div>
        </div>
      </div>

    </div>

    <!-- 우측: 차트/테이블 -->
    <div id="cmp-result">
      <div style="padding:3rem;text-align:center;color:var(--text2);font-size:calc(13px*var(--m-body));background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius)">
        <div style="font-size:calc(24px*var(--m-title));margin-bottom:.5rem">📊</div>
        <div>좌측에서 종목을 선택하고 비교 분석을 실행해주세요</div>
        <div style="font-size:calc(11px*var(--m-label));margin-top:.5rem;color:var(--text2)">산업 전체 추가 또는 개별 종목 검색으로 최대 10개까지 비교 가능합니다</div>
      </div>
    </div>

  </div>`;
}

// ── 산업 변경 → 테마(sub_industry) 목록 로드 ──
async function onCmpIndustryChange() {
  const ind = document.getElementById('cmp-industry')?.value;
  CMP.industry = ind;
  const themeWrap = document.getElementById('cmp-theme-wrap');
  const themeEl   = document.getElementById('cmp-theme');
  const themeBtn  = document.getElementById('cmp-theme-btn');

  if (!ind) {
    themeWrap.style.display = 'none';
    return;
  }

  // 해당 산업의 sub_industry 목록 조회 (모니터링 종목 기준)
  const { data: rows } = await sb.from('companies')
    .select('sub_industry')
    .eq('industry', ind)
    .eq('is_monitored', true)
    .not('sub_industry', 'is', null);

  const themes = [...new Set(
    (rows || []).map(r => r.sub_industry).filter(v => v && v.trim())
  )].sort();

  if (!themes.length) {
    themeWrap.style.display = 'none';
    return;
  }

  themeEl.innerHTML = `<option value="">-- 테마 선택 (선택 시 해당 테마만) --</option>`
    + themes.map(t => `<option value="${t}">${t}</option>`).join('');
  themeWrap.style.display = 'flex';

  // 테마 선택 시 버튼 활성화
  themeEl.onchange = () => {
    themeBtn.disabled = !themeEl.value;
  };
}

// ── 테마만 추가 ──
async function addThemeOnly() {
  const ind   = document.getElementById('cmp-industry')?.value;
  const theme = document.getElementById('cmp-theme')?.value;
  if (!ind)   { toast('산업을 먼저 선택해주세요.', 'error'); return; }
  if (!theme) { toast('테마를 선택해주세요.', 'error'); return; }

  const { data: rows, error } = await sb.from('companies')
    .select('code,name,industry,sub_industry')
    .eq('industry', ind)
    .eq('sub_industry', theme)
    .eq('is_monitored', true)
    .eq('active', true)
    .order('name');

  if (error || !rows?.length) { toast('해당 테마 종목 없음', 'error'); return; }

  let added = 0;
  for (const r of rows) {
    const code = (r.code || '').split('.')[0];
    if (!code) continue;
    if (CMP.selectedCodes.length >= 10) {
      toast(`최대 10개까지 선택 가능합니다. (${added}개 추가됨)`, 'error');
      break;
    }
    if (!CMP.selectedCodes.find(s => s.code === code)) {
      CMP.selectedCodes.push({ code, name: r.name, industry: ind, subIndustry: theme });
      added++;
    }
  }
  renderCmpSelected();
  if (added > 0) toast(`${theme} ${added}개 종목 추가됨`, 'success');
  else toast('이미 모두 추가된 종목입니다.', 'info');
}

// ── 산업 전체 추가 ──
async function addIndustryAll() {
  const ind = document.getElementById('cmp-industry')?.value;
  if (!ind) { toast('산업을 먼저 선택해주세요.', 'error'); return; }

  const { data: rows, error } = await sb.from('companies')
    .select('code,name,industry')
    .eq('industry', ind)
    .eq('is_monitored', true)
    .order('name');

  if (error || !rows?.length) { toast('해당 산업 종목 없음', 'error'); return; }

  const avail = rows.filter(r => {
    const code = (r.code || '').split('.')[0];
    return code && !CMP.selectedCodes.find(s => s.code === code);
  });

  const remain = 10 - CMP.selectedCodes.length;
  if (remain <= 0) { toast('이미 10개 선택됨. 일부 종목을 해제 후 추가하세요.', 'error'); return; }

  const toAdd = avail.slice(0, remain);
  toAdd.forEach(r => {
    const code = (r.code || '').split('.')[0];
    CMP.selectedCodes.push({ code, name: r.name, industry: ind });
  });

  renderCmpSelected();
  if (toAdd.length > 0) {
    const msg = avail.length > remain
      ? `${ind} ${toAdd.length}개 추가됨 (전체 ${rows.length}개 중 최대 10개 제한)`
      : `${ind} ${toAdd.length}개 종목 추가됨`;
    toast(msg, 'success');
  } else toast('이미 모두 추가된 종목입니다.', 'info');
}

// ── 종목 검색 자동완성 ──
let _cmpSearchTimer = null;
async function onCmpSearch(q) {
  clearTimeout(_cmpSearchTimer);
  const dd = document.getElementById('cmp-dropdown');
  if (!q || q.length < 1) { dd.style.display = 'none'; return; }

  _cmpSearchTimer = setTimeout(async () => {
    try {
      const { data: rows, error } = await searchCompanies(q, { scope: 'monitored', limit: 20 });

      if (error) { dd.style.display = 'none'; return; }
      if (!rows?.length) { dd.innerHTML = '<div style="padding:8px 12px;font-size:calc(12px*var(--m-sub));color:var(--text2)">검색 결과 없음</div>'; dd.style.display = 'block'; return; }

      dd.innerHTML = rows.map(r => {
        const code = (r.code || '').split('.')[0];
        const already = CMP.selectedCodes.find(s => s.code === code);
        return `<div
          data-code="${code}"
          data-name="${escAttr(r.name)}"
          data-industry="${escAttr(r.industry || '')}"
          onclick="addCmpStockFromEl(this)"
          style="padding:8px 12px;font-size:calc(13px*var(--m-body));cursor:pointer;display:flex;justify-content:space-between;align-items:center;
          border-bottom:1px solid var(--border);${already?'opacity:.4;pointer-events:none':''}">
          <span style="font-weight:500">${escapeHtml(r.name)} <span class="card-sub">${code}</span></span>
          <span style="font-size:calc(11px*var(--m-label));color:${CATS[r.industry]||'var(--text3)'}">
            ${already?'추가됨':escapeHtml(r.industry||'')}
          </span>
        </div>`;
      }).join('');
      dd.style.display = 'block';
    } catch(e) {
      dd.style.display = 'none';
    }
  }, 300);
}

function addCmpStockFromEl(el) {
  const code     = el.dataset.code;
  const name     = el.dataset.name;
  const industry = el.dataset.industry;
  addCmpStock(code, name, industry);
}

function addCmpStock(code, name, industry) {
  if (CMP.selectedCodes.length >= 10) { toast('최대 10개까지 선택 가능합니다.', 'error'); return; }
  if (CMP.selectedCodes.find(s => s.code === code)) return;
  CMP.selectedCodes.push({ code, name, industry });
  renderCmpSelected();
  document.getElementById('cmp-dropdown').style.display = 'none';
  document.getElementById('cmp-search').value = '';
}

function removeCmpStock(code) {
  CMP.selectedCodes = CMP.selectedCodes.filter(s => s.code !== code);
  renderCmpSelected();
}

function clearCmpStocks() {
  CMP.selectedCodes = [];
  renderCmpSelected();
}

// ── 페이지 진입 시 상태 초기화 ──
function initCmpPage() {
  // 선택 종목, 필터, 상태 초기화
  CMP.selectedCodes = [];
  CMP.industry      = '';
  CMP.subcat        = '';
  CMP.metric        = 'revenue';
  CMP.metrics       = ['revenue'];   // 함께 보는 지표들(칩 여러 개 선택) — 지표마다 차트·표 카드
  CMP.period        = '8';
  CMP.normalize     = false;
  CMP.showMedian    = false;

  // 차트 인스턴스 제거
  _cmpDestroyCharts();
  if (_cmpRadarInstance) { _cmpRadarInstance.destroy(); _cmpRadarInstance = null; }

  // 캐시 전체 초기화 — 이전 실행 데이터 제거
  CMP.chartDatasets = null;
  CMP.chartLabels   = null;
  CMP.metricCache   = {};   // ← 지표별 캐시 초기화
  CMP.stockDataMap  = null;
  CMP.sortedLabels  = null;

  // UI 초기화 후 선택 목록 렌더
  renderCmpSelected();
}

function renderCmpSelected() {
  const el = document.getElementById('cmp-selected-list');
  const cnt = document.getElementById('cmp-count');
  if (!el) return;
  if (cnt) cnt.textContent = `${CMP.selectedCodes.length}개`;
  if (!CMP.selectedCodes.length) {
    el.innerHTML = '<div style="padding:.5rem;text-align:center;color:var(--text2);font-size:calc(12px*var(--m-sub))">종목을 선택해주세요</div>';
    return;
  }
  el.innerHTML = CMP.selectedCodes.map((s, i) => `
    <div style="display:flex;align-items:center;gap:6px;padding:5px 6px;border-radius:var(--radius-sm);background:var(--bg3);margin-bottom:4px">
      <span style="width:10px;height:10px;border-radius:50%;background:${CMP_COLORS[i%CMP_COLORS.length]};flex-shrink:0"></span>
      <div style="flex:1;min-width:0">
        <div style="font-size:calc(12px*var(--m-sub));overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(s.name)}</div>
        ${s.subIndustry ? `<div style="font-size:calc(11px*var(--m-label));color:var(--text2)">${escapeHtml(s.subIndustry)}</div>` : ''}
      </div>
      <span style="font-size:calc(11px*var(--m-label));color:var(--text2)">${s.code}</span>
      <button onclick="removeCmpStock('${s.code}')"
        style="background:none;border:none;color:var(--text2);cursor:pointer;padding:0 2px;font-size:calc(14px*var(--m-body));line-height:1">×</button>
    </div>`).join('');
}

// ── 비교 분석 실행 ──
async function runComparison() {
  if (CMP.selectedCodes.length < 1) { toast('종목을 1개 이상 선택해주세요.', 'error'); return; }

  // 실행 시마다 지표 캐시 초기화 — 종목 조합 변경 반영
  CMP.metricCache  = {};
  CMP.stockDataMap = null;
  CMP.sortedLabels = null;

  const el = document.getElementById('cmp-result');
  el.innerHTML = loadingHTML('데이터 로드 중...');

  try {
    const codes = CMP.selectedCodes.map(s => s.code);
    const period = parseInt(CMP.period);
    if (!CMP.metrics?.length) CMP.metrics = [CMP.metric];
    else if (!CMP.metrics.includes(CMP.metric)) CMP.metrics.unshift(CMP.metric);   // 왼쪽 '재무 지표'로 고른 것은 늘 포함
    const metric = CMP.metric;
    const metaDef = CMP_METRICS.find(m => m.key === metric);

    // 재무 데이터 조회
    const finRows = await fetchAllPages(
      sb.from('financials')
        .select('stock_code,corp_name,bsns_year,quarter,fs_div,is_cumulative,' + CMP_METRICS.filter(m => !m.src).map(m=>m.key).filter((k,i,a)=>a.indexOf(k)===i).join(','))
        .in('stock_code', codes)
        .order('bsns_year', { ascending: false })
        .order('quarter', { ascending: false })
    );

    // 시장 데이터 조회 (최신 1일치) — config.js 전역 캐시 사용
    const maxDate = await getLatestMarketDate();
    let mktMap = {};
    if (maxDate) {
      const mktRows = await fetchAllPages(
        sb.from('market_data')
          .select('stock_code,corp_name,price,price_change_rate,market_cap,per,pbr,hgpr_cls,hgpr_cls_code')
          .in('stock_code', codes)
          .eq('base_date', maxDate)
      );
      mktRows.forEach(r => { mktMap[r.stock_code] = r; });
    }

    // 종목별 데이터 구성
    const stockDataMap = {};
    codes.forEach(code => { stockDataMap[code] = []; });
    finNormalizeQuarters(finPreferFs(finRows)).forEach(r => {   // 종목별 CFS 우선·OFS 폴백 + 4분기 연간값 행 정리
      // FCF 근사: 영업현금흐름 (capex 데이터 없으므로 보수적 근사)
      // fcf: DB 컬럼에서 직접 가져옴 (collect_financials.py에서 계산)
      if (stockDataMap[r.stock_code]) {
        stockDataMap[r.stock_code].push(r);
      }
    });

    // 수주잔고(백만원 → 원) — 재무 행에 붙여 같은 분기 축으로. 수집 대상 밖 종목은 null
    const blRows = await fetchAllPages((s, e) => sb.from('dart_segment_revenue')
      .select('stock_code,bsns_year,quarter,revenue').eq('segment_type', 'backlog_total').in('stock_code', codes)
      .order('stock_code').order('bsns_year').order('quarter').range(s, e));
    const blMap = {};
    blRows.forEach(r => { blMap[`${r.stock_code} ${r.bsns_year} ${r.quarter}`] = r.revenue * 1e6; });
    const qBack = (y, q, n) => { const i = (+y) * 4 + (+String(q).slice(1) - 1) - n; return `${Math.floor(i / 4)} Q${i % 4 + 1}`; };
    codes.forEach(code => {
      const rev = {};
      stockDataMap[code].forEach(r => { rev[`${r.bsns_year} ${r.quarter}`] = r.revenue; });
      stockDataMap[code].forEach(r => {
        r.backlog = blMap[`${code} ${r.bsns_year} ${r.quarter}`] ?? null;
        let ttm = 0;                                  // 최근 4분기 매출 — 한 분기라도 없으면 계산 안 함
        for (let n = 0; n < 4 && ttm != null; n++) {
          const v = rev[qBack(r.bsns_year, r.quarter, n)];
          ttm = v == null ? null : ttm + v;
        }
        r.backlog_ratio = r.backlog != null && ttm > 0 ? Math.round(r.backlog / ttm * 100) / 100 : null;
      });
    });

    // 공통 기간 라벨 (최신 N분기)
    const allLabels = new Set();
    codes.forEach(code => {
      stockDataMap[code].slice(0, period).forEach(r => allLabels.add(`${r.bsns_year} ${r.quarter}`));
    });
    const sortedLabels = [...allLabels].sort((a, b) => {
      const [ya, qa] = a.split(' ');
      const [yb, qb] = b.split(' ');
      return ya !== yb ? ya.localeCompare(yb) : qa.localeCompare(qb);
    }).slice(-period);

    // Chart.js 데이터셋 구성
    const datasets = CMP.selectedCodes.map((s, i) => {
      const color = CMP_COLORS[i % CMP_COLORS.length];
      const rows = stockDataMap[s.code] || [];
      const rowMap = {};
      rows.forEach(r => { rowMap[`${r.bsns_year} ${r.quarter}`] = r; });
      const data = sortedLabels.map(lbl => {
        const row = rowMap[lbl];
        if (!row) return null;
        const val = row[metric];
        return val != null ? (metaDef.scale === 1 ? val : Math.round(val / metaDef.scale)) : null;
      });
      return {
        label: s.name,
        data,
        borderColor: color,
        backgroundColor: color + '22',
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.3,
        fill: false,
      };
    });

    // 주가 동향 (이동평균 + 52주 고/저) 계산
    const maData = {};
    const weekData = {};   // 52주 고/저
    // market_data는 약 120일(70~80거래일)만 보관 — 52주 고저는 KIS가 주는 w52_high/w52_low(진짜 52주)를 쓴다.
    // 예전엔 보관된 행의 최고·최저를 '52주'라 적었음(원익IPS 52주 최고 187,800원 대신 3개월 최고)
    const priceList = await Promise.all(CMP.selectedCodes.map(s => sb.from('market_data')
      .select('base_date,price,price_change_rate,hgpr_cls,hgpr_cls_code,w52_high,w52_low,week_return,month_return,quarter_return')
      .eq('stock_code', s.code)
      .order('base_date', { ascending: false })
      .limit(252).then(r => r.data || []).catch(() => [])));
    CMP.priceRows = {};
    for (const [si, s] of CMP.selectedCodes.entries()) {
      const priceRows = priceList[si];
      CMP.priceRows[s.code] = priceRows;
      if (priceRows?.length) {
        const prices = priceRows.map(r => r.price).filter(Boolean);
        const latest = priceRows[0];
        const calcMA = n => prices.slice(0, n).reduce((a,b)=>a+b,0) / Math.min(n, prices.length);
        const ma5  = calcMA(5);
        const ma20 = calcMA(20);
        const ma60 = calcMA(60);
        maData[s.code] = {
          price: latest.price,
          chg:   latest.price_change_rate,
          ma5:   Math.round(ma5),
          ma20:  Math.round(ma20),
          ma60:  Math.round(ma60),
          newHigh:     latest.hgpr_cls      || null,
          newHighCode: latest.hgpr_cls_code || null,
        };
        // 52주 고/저 — KIS 값, 없으면 보관된 기간의 최고·최저(표에 그렇게 표시)
        weekData[s.code] = latest.w52_high && latest.w52_low
          ? { high: latest.w52_high, low: latest.w52_low, real: true }
          : { high: Math.max(...prices), low: Math.min(...prices), real: false };
      }
    }
    // 모니터링 set 준비
    if (!A.monitoredSet) {
      const { data: monRows } = await sb.from('companies')
        .select('code').eq('is_monitored', true);
      A.monitoredSet = new Set((monRows||[]).map(r => r.code.replace(/\.(KS|KQ)$/, '')));
    }

    // 결과 렌더링
    el.innerHTML = `
      <!-- 주가 동향 카드 -->
      <div class="card" style="margin-bottom:1rem">
        <div class="card-header">
          <span class="card-title">주가 동향</span>
          <span style="font-size:calc(11px*var(--m-label));color:var(--text2)">기준: ${maxDate || '—'}</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>종목</th>
                <th class="num">현재가</th>
                <th class="num">등락률</th>
                <th class="num">5일선</th>
                <th class="num">20일선</th>
                <th class="num">60일선</th>
                <th class="num">시총</th>
                <th class="num">PER</th>
                <th class="num">PBR</th>
                <th class="ctr">52주 위치</th>
                <th class="ctr">액션</th>
              </tr>
            </thead>
            <tbody>
              ${CMP.selectedCodes.map((s, i) => {
                const ma = maData[s.code];
                const mkt = mktMap[s.code];
                const w52 = weekData[s.code];
                const color = CMP_COLORS[i % CMP_COLORS.length];
                if (!ma && !mkt) return `<tr><td colspan="11" style="padding:8px 12px;color:var(--text2);font-size:calc(12px*var(--m-sub))">${escapeHtml(s.name)} — 시장 데이터 없음</td></tr>`;
                const price = ma?.price || mkt?.price;
                const chg = ma?.chg ?? mkt?.price_change_rate;
                const ma5pos  = ma && price > ma.ma5  ? 'var(--red)' : 'var(--blue)';
                const ma20pos = ma && price > ma.ma20 ? 'var(--red)' : 'var(--blue)';
                const ma60pos = ma && price > ma.ma60 ? 'var(--red)' : 'var(--blue)';
                // 52주 위치 계산
                let w52bar = '';
                if (w52 && price) {
                  const pct = Math.round((price - w52.low) / (w52.high - w52.low) * 100);
                  const barColor = pct >= 80 ? 'var(--red)' : pct <= 20 ? 'var(--blue)' : 'var(--tg)';
                  w52bar = `<div style="font-size:calc(11px*var(--m-label));color:var(--text2);margin-bottom:3px;display:flex;justify-content:space-between"${w52.real ? '' : ' title="52주 값이 없어 보관된 시세(약 120일)의 최고·최저"'}>
                    <span>${w52.low.toLocaleString()}</span><span>${pct}%${w52.real ? '' : '*'}</span><span>${w52.high.toLocaleString()}</span>
                  </div>
                  <div style="background:var(--bg3);border-radius:3px;height:6px;position:relative;width:120px">
                    <div style="position:absolute;left:0;top:0;height:100%;width:${Math.max(4,Math.min(100,pct))}%;background:${barColor};border-radius:3px"></div>
                  </div>`;
                }
                // 모니터링 여부
                const isMonitored = A.monitoredSet?.has(s.code);
                return `<tr style="border-bottom:1px solid var(--border)">
                  <td>
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                      <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0"></span>
                      <span style="font-weight:500">${escapeHtml(s.name)}</span>
                      ${ma?.newHigh ? `<span style="font-size:calc(11px*var(--m-label));padding:1px 5px;border-radius:3px;
                        background:${ma.newHighCode==='3'?'rgba(255,193,7,.2)':ma.newHighCode==='2'?'rgba(255,107,54,.2)':'rgba(42,171,238,.15)'};
                        color:${ma.newHighCode==='3'?'#ffc107':ma.newHighCode==='2'?'#ff6b35':'var(--tg)'};
                        font-weight:600;white-space:nowrap">${ma.newHigh}</span>` : ''}
                    </div>
                  </td>
                  <td class="num" style="font-weight:500">${fmtPrice(price)}</td>
                  <td class="num" style="color:${chgColor(chg)};font-weight:500">${chg != null ? chgStr(chg) : '—'}</td>
                  <td class="num" style="color:${ma5pos}">${fmtPrice(ma?.ma5)}</td>
                  <td class="num" style="color:${ma20pos}">${fmtPrice(ma?.ma20)}</td>
                  <td class="num" style="color:${ma60pos}">${fmtPrice(ma?.ma60)}</td>
                  <td class="num">${mkt?.market_cap ? fmtCap(mkt.market_cap) : '—'}</td>
                  <td class="num">${mkt?.per ? mkt.per.toFixed(1) : '—'}</td>
                  <td class="num">${mkt?.pbr ? mkt.pbr.toFixed(2) : '—'}</td>
                  <td class="ctr">${w52bar || '—'}</td>
                  <td class="ctr">
                    <button onclick="cmpAddToMonitor('${escJsStr(s.code)}','${escJsStr(s.name)}')"
                      style="font-size:calc(11px*var(--m-label));padding:3px 8px;border-radius:4px;border:1px solid ${isMonitored?'var(--green)':'var(--border)'};
                        background:${isMonitored?'rgba(45,206,137,.1)':'none'};color:${isMonitored?'var(--green)':'var(--text3)'};cursor:pointer">
                      ${isMonitored ? '✓ 모니터링 중' : '+ 모니터링'}
                    </button>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- 주가 흐름 비교 — 시작일 = 100 -->
      <div class="card" style="margin-bottom:1rem" id="cmp-price-card">
        <div class="card-header" style="flex-wrap:wrap;gap:8px">
          <span class="card-title">주가 흐름 비교</span>
          <span style="font-size:calc(11px*var(--m-label));color:var(--text2)">시작일 주가 = 100</span>
          <div style="margin-left:auto;display:flex;gap:4px" data-no-capture>
            ${[['1M', '1개월'], ['3M', '3개월'], ['ALL', '전체']].map(([k, t]) => `<button class="chip chip-sm${CMP.pricePeriod === k ? ' active' : ''}"
              data-cmp-pp="${k}" onclick="setCmpPricePeriod('${k}')">${t}</button>`).join('')}
          </div>
        </div>
        <div id="cmp-price-rank" style="padding:.5rem 1rem;border-bottom:1px solid var(--border);display:flex;gap:8px;flex-wrap:wrap"></div>
        <div style="padding:1rem"><canvas id="cmp-price-chart" style="max-height:340px;min-height:240px"></canvas></div>
        <div id="cmp-price-table" class="table-wrap"></div>
        <div style="padding:.4rem 1rem .8rem;font-size:calc(11px*var(--m-label));color:var(--text3)">
          * 1개월 = 21거래일 · 3개월 = 63거래일(1달·3달 수익률과 같은 기준) · 일별 시세는 약 120일만 보관해 '전체'는 약 3개월 반 · 52주는 KIS 기준</div>
      </div>

      <!-- 지표 선택(여러 개) + 정규화 토글 — 고른 지표마다 아래에 차트·분기별 표 카드 -->
      <div class="card" style="margin-bottom:1rem">
        <div class="card-header" style="flex-wrap:wrap;gap:8px">
          <span class="card-title">분기별 재무 비교</span>
          <span style="font-size:calc(11px*var(--m-label));color:var(--text2)">여러 개 고르면 함께 표시</span>
          <div style="display:flex;gap:6px;flex-wrap:wrap;flex:1">
            ${CMP_METRICS.map(m => `
              <button class="chip chip-sm ${CMP.metrics.includes(m.key)?'active':''}"
                data-metric="${m.key}"
                onclick="cmpToggleMetric('${m.key}')"
               >${m.label}</button>
            `).join('')}
          </div>
          <div style="display:flex;gap:6px;align-items:center;margin-left:auto">
            <button id="cmp-normalize-btn"
              onclick="CMP.normalize=!CMP.normalize;this.classList.toggle('active');renderCmpMetricBlocks()"
              class="chip chip-sm ${CMP.normalize?'active':''}"
              title="100 기준 정규화 — 성장률 비교">
              📐 정규화
            </button>
            <button id="cmp-median-btn"
              onclick="CMP.showMedian=!CMP.showMedian;this.classList.toggle('active');renderCmpMetricBlocks()"
              class="chip chip-sm ${CMP.showMedian?'active':''}"
              title="산업 중위값 기준선 표시">
              ⊘ 중위값
            </button>
          </div>
        </div>
      </div>
      <div id="cmp-metric-blocks"></div>


      <!-- 레이더 차트 (6개 지표 종합) -->
      <div class="card" style="margin-bottom:1rem">
        <div class="card-header">
          <span class="card-title">종합 지표 레이더</span>
          <span style="font-size:calc(11px*var(--m-label));color:var(--text2)">최신 분기 기준 — 종목 클릭 시 하이라이트</span>
        </div>
        <div style="padding:1rem;display:flex;flex-direction:column;align-items:center;gap:12px">
          <div style="width:420px;height:420px;position:relative">
            <canvas id="cmp-radar"></canvas>
          </div>
          <div id="cmp-radar-btns" style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center"></div>
        </div>
      </div>`;

    // stockDataMap 전역 저장
    CMP.stockDataMap = stockDataMap;
    CMP.sortedLabels = sortedLabels;

    // 고른 지표마다 차트 + 분기별 표
    CMP.chartDatasets = datasets;
    CMP.chartLabels   = sortedLabels;
    renderCmpMetricBlocks();
    drawCmpRadar(stockDataMap);
    renderCmpPriceCompare();

  } catch(e) {
    el.innerHTML = errorHTML(e.message);
    console.error('[비교분석]', e);
  }
}

// ── 주가 흐름 비교 ─────────────────────────────────────────────────────────────
// 종목마다 기간 첫 거래일 종가를 100으로 맞춘 선. 시세는 주가 동향 표와 같은 CMP.priceRows(market_data, 약 120일 보관)
let _cmpPriceChart = null;
function setCmpPricePeriod(k) {
  CMP.pricePeriod = k;
  document.querySelectorAll('[data-cmp-pp]').forEach(b => b.classList.toggle('active', b.dataset.cmpPp === k));
  renderCmpPriceCompare();
}
function renderCmpPriceCompare() {
  const canvas = document.getElementById('cmp-price-chart');
  if (!canvas || !window.Chart) return;
  if (_cmpPriceChart) { _cmpPriceChart.destroy(); _cmpPriceChart = null; }
  const rowsOf = code => [...(CMP.priceRows[code] || [])].filter(r => r.price > 0).reverse();   // 오래된 날부터
  const allDates = [...new Set(CMP.selectedCodes.flatMap(s => rowsOf(s.code).map(r => r.base_date)))].sort();
  if (!allDates.length) { canvas.parentElement.innerHTML = emptyHTML('시세 데이터 없음'); return; }
  const last = allDates[allDates.length - 1];
  // 기간 = 거래일 수 — 시세 수집 때 계산하는 1달·3달 수익률(market_data month/quarter_return)과 같은 기준
  // (21·63거래일 전 종가가 시작점). 달력으로 3개월을 세면 시작일이 며칠 달라 같은 '3개월'인데 숫자가 달랐음
  const back = { '1M': 21, '3M': 63 }[CMP.pricePeriod];
  const dates = back ? allDates.slice(-(back + 1)) : allDates;
  const from = dates[0];
  const series = CMP.selectedCodes.map((s, i) => {
    const m = new Map(rowsOf(s.code).filter(r => r.base_date >= from).map(r => [r.base_date, r.price]));
    const base = dates.map(d => m.get(d)).find(v => v != null);
    const data = dates.map(d => m.has(d) && base ? Math.round(m.get(d) / base * 10000) / 100 : null);
    let lastV = null; for (let j = data.length - 1; j >= 0; j--) if (data[j] != null) { lastV = data[j]; break; }
    return { s, color: CMP_COLORS[i % CMP_COLORS.length], data, ret: lastV != null ? lastV - 100 : null };
  });

  // 기간 수익률 순위
  const rank = series.filter(x => x.ret != null).sort((a, b) => b.ret - a.ret);
  const rankEl = document.getElementById('cmp-price-rank');
  if (rankEl) rankEl.innerHTML = `<span style="font-size:calc(11px*var(--m-label));color:var(--text2);align-self:center">${escapeHtml(dates[0] || '')} ~ ${escapeHtml(last)} 수익률</span>`
    + rank.map((x, i) => `<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:100px;background:rgba(255,255,255,.06);font-size:calc(12px*var(--m-sub))">
        <span style="font-size:calc(11px*var(--m-label));font-weight:700;color:var(--text2);min-width:22px;text-align:center">${i + 1}위</span>
        <span style="width:6px;height:6px;border-radius:50%;background:${x.color}"></span>
        <strong>${escapeHtml(x.s.name)}</strong>
        <span style="color:${chgColor(x.ret)};font-weight:600">${chgStr(x.ret)}</span></span>`).join('');

  // 기간 수익률 표 — 1주·1달·3달(수집 때 계산한 값)·이 차트 기간·52주 고점/저점 대비
  const tblEl = document.getElementById('cmp-price-table');
  if (tblEl) {
    const pct = v => v == null || !isFinite(v) ? '<span style="color:var(--text3)">—</span>' : `<span style="color:${chgColor(v)};font-weight:600">${chgStr(v)}</span>`;
    tblEl.innerHTML = `<table><thead><tr><th>종목</th><th class="num">1주</th><th class="num">1달</th><th class="num">3달</th>
      <th class="num">차트 기간</th><th class="num">52주 고점 대비</th><th class="num">52주 저점 대비</th></tr></thead><tbody>
      ${series.map(x => {
        const L = (CMP.priceRows[x.s.code] || [])[0] || {};
        return `<tr><td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${x.color};margin-right:6px"></span>${escapeHtml(x.s.name)}</td>
          <td class="num">${pct(L.week_return)}</td><td class="num">${pct(L.month_return)}</td><td class="num">${pct(L.quarter_return)}</td>
          <td class="num">${pct(x.ret)}</td>
          <td class="num">${pct(L.price && L.w52_high ? (L.price / L.w52_high - 1) * 100 : null)}</td>
          <td class="num">${pct(L.price && L.w52_low ? (L.price / L.w52_low - 1) * 100 : null)}</td></tr>`;
      }).join('')}</tbody></table>`;
  }

  _cmpPriceChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: dates.map(d => d.slice(5)),
      datasets: [
        ...series.map(x => ({ label: x.s.name, data: x.data, borderColor: x.color, backgroundColor: x.color + '22',
          borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.15, spanGaps: true, fill: false })),
        { label: '기준 100', data: dates.map(() => 100), borderColor: 'rgba(139,144,167,.45)', borderWidth: 1, borderDash: [4, 4],
          pointRadius: 0, fill: false, order: 99 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { color: '#8b90a7', font: { size: 12 }, padding: 14, usePointStyle: true,
          filter: it => it.text !== '기준 100' } },
        tooltip: {
          backgroundColor: '#1a1d27', borderColor: 'rgba(255,255,255,.1)', borderWidth: 1, titleColor: '#e8eaf0', bodyColor: '#c9cdd9',
          filter: it => it.dataset.label !== '기준 100',
          callbacks: {
            title: items => dates[items[0]?.dataIndex] || '',
            label: ctx => ctx.raw == null ? null : ` ${ctx.dataset.label}  ${ctx.raw.toFixed(1)} (${ctx.raw >= 100 ? '+' : ''}${(ctx.raw - 100).toFixed(1)}%)`,
          },
        },
      },
      scales: {
        x: { ticks: { color: '#8b90a7', maxTicksLimit: 8, font: { size: 11 } }, grid: { color: 'rgba(255,255,255,.04)' } },
        y: { ticks: { color: '#8b90a7', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,.05)' } },
      },
    },
  });
}

// ── 지표별 분기별 상세 테이블 ──
function renderCmpDetailTable(metricKey) {
  const body  = document.getElementById(`cmp-detail-body-${metricKey}`);
  const title = document.getElementById(`cmp-detail-title-${metricKey}`);
  if (!body || !CMP.stockDataMap || !CMP.sortedLabels) return;

  const metaDef = CMP_METRICS.find(m => m.key === metricKey) || CMP_METRICS[0];
  const labels  = CMP.sortedLabels;
  if (title) title.textContent = `${metaDef.label} — 분기별 비교`;

  const fmtVal = (v) => {
    if (v == null) return `<span style="color:var(--text2)">—</span>`;
    if (metaDef.scale === 1) {
      if (metaDef.src) return `<span style="color:var(--text1);font-weight:500">${v.toFixed(metaDef.dec ?? 1)}${metaDef.unit}</span>`;
      const color = metaDef.key === 'debt_ratio'
        ? (v > 200 ? 'var(--red)' : v > 100 ? 'var(--yellow)' : 'var(--green)')
        : (v > 0 ? 'var(--green)' : v < 0 ? 'var(--red)' : 'var(--text2)');
      return `<span style="color:${color};font-weight:500">${v.toFixed(1)}${metaDef.unit}</span>`;
    }
    const eok = Math.round(v / 1e8);
    const color = eok >= 0 ? 'var(--text1)' : 'var(--red)';
    return `<span style="color:${color}">${eok.toLocaleString()}억</span>`;
  };

  const calcQoQ = (cur, prev) => {
    if (cur == null || prev == null || prev === 0) return null;
    return ((cur - prev) / Math.abs(prev) * 100).toFixed(1);
  };
  // YoY: 4분기 전과 비교
  const calcYoY = (rowMap, lbl, lblList) => {
    const curIdx = lblList.indexOf(lbl);
    if (curIdx < 4) return null;
    const prevLbl = lblList[curIdx - 4];
    const cur  = rowMap[lbl];
    const prev = rowMap[prevLbl];
    if (cur == null || prev == null || prev === 0) return null;
    return ((cur - prev) / Math.abs(prev) * 100).toFixed(1);
  };

  const stockRowMap = {};
  CMP.selectedCodes.forEach(s => {
    stockRowMap[s.code] = {};
    (CMP.stockDataMap[s.code] || []).forEach(r => {
      stockRowMap[s.code][`${r.bsns_year} ${r.quarter}`] = r[metricKey];
    });
  });
  const colMax = {};   // 분기별 최대값 — metaDef.bars 지표의 칸 막대 기준
  if (metaDef.bars) labels.forEach(lbl => {
    colMax[lbl] = Math.max(0, ...CMP.selectedCodes.map(s => stockRowMap[s.code]?.[lbl]).filter(v => v != null));
  });

  body.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:calc(13px*var(--m-body));min-width:500px">
      <thead>
        <tr style="background:var(--bg3)">
          <th style="padding:8px 12px;text-align:left;font-size:calc(11px*var(--m-label));color:var(--text2);
            border-bottom:1px solid var(--border);position:sticky;left:0;background:var(--bg3);min-width:120px">종목</th>
          ${labels.map(lbl => `
            <th style="padding:8px 12px;text-align:right;font-size:calc(11px*var(--m-label));color:var(--text2);
              border-bottom:1px solid var(--border);white-space:nowrap">${lbl}</th>
          `).join('')}
          <th style="padding:8px 12px;text-align:center;font-size:calc(11px*var(--m-label));color:var(--text2);border-bottom:1px solid var(--border);white-space:nowrap;min-width:90px">추이</th>
        </tr>
      </thead>
      <tbody>
        ${CMP.selectedCodes.map((s, i) => {
          const color  = CMP_COLORS[i % CMP_COLORS.length];
          const rowMap = stockRowMap[s.code] || {};
          const noData = metaDef.src && labels.every(l => rowMap[l] == null);
          return `<tr style="border-bottom:1px solid var(--border)">
            <td style="padding:8px 12px;position:sticky;left:0;background:var(--bg2);min-width:120px">
              <div style="display:flex;align-items:center;gap:6px;white-space:nowrap">
                <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0"></span>
                <span style="font-weight:500;font-size:calc(12px*var(--m-sub))">${escapeHtml(s.name)}</span>
                ${noData ? `<span title="보고서에 수주잔고를 싣지 않음(영업 기밀·NDA 등) 또는 수집 대상(반도체 장비) 밖"
                  style="font-size:calc(11px*var(--m-label));color:var(--text3)">잔고 없음</span>` : ''}
              </div>
            </td>
            ${labels.map((lbl, li) => {
              const cur  = rowMap[lbl];
              const prev = li > 0 ? rowMap[labels[li-1]] : null;
              const qoq  = calcQoQ(cur, prev);
              const qoqColor = qoq != null
                ? (parseFloat(qoq) > 0 ? 'var(--red)' : parseFloat(qoq) < 0 ? 'var(--blue)' : 'var(--text3)')
                : '';
              const yoy = calcYoY(rowMap, lbl, labels);
              const yoyColor = yoy != null ? (parseFloat(yoy)>0?'var(--red)':'var(--blue)') : '';
              const yoyStr = yoy != null
                ? `<div style="font-size:calc(11px*var(--m-label));color:${yoyColor};font-weight:600;margin-top:1px">YoY ${parseFloat(yoy)>0?'▲':'▼'}${Math.abs(yoy)}%</div>` : '';
              const qoqStr = qoq != null && li > 0
                ? `<div style="font-size:calc(11px*var(--m-label));color:${qoqColor};margin-top:1px">QoQ ${parseFloat(qoq) > 0 ? '▲' : '▼'}${Math.abs(qoq)}%</div>`
                : '';
              // 그 분기 최대값 대비 막대 — 숫자만으로는 회사끼리 크기 비교가 어려웠다(수주잔고)
              const bar = metaDef.bars && cur != null && cur > 0 && colMax[lbl] > 0
                ? `<div style="height:5px;margin:3px 0 1px auto;width:100%;max-width:110px;background:var(--bg3);border-radius:3px;overflow:hidden">
                    <div style="height:100%;width:${Math.max(2, cur / colMax[lbl] * 100).toFixed(1)}%;background:${color};border-radius:3px;margin-left:auto"></div></div>` : '';
              return `<td style="padding:6px 12px;text-align:right;vertical-align:top">
                <div>${fmtVal(cur)}</div>${bar}${yoyStr}${qoqStr}
              </td>`;
            }).join('')}
          <td style="padding:8px 12px;text-align:center;vertical-align:middle">
              <canvas id="spark-${s.code}-${metricKey}"
                width="80" height="30"
                style="display:block;margin:auto"></canvas>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

// ── Sparkline 렌더링 (renderCmpDetailTable 호출 후) ──
function _drawSparklines(metricKey) {
  requestAnimationFrame(() => {
    const map = CMP.stockDataMap || {};
    const sparkKey = metricKey;

    CMP.selectedCodes.forEach((s, si) => {
      const canvas = document.getElementById(`spark-${s.code}-${metricKey}`);
      if (!canvas) return;

      // stockDataMap 키: financials.stock_code 형태 (s.code와 동일해야 함)
      // 최신→과거 순으로 저장되어 있으므로 reverse()로 오름차순 변환
      const allRows = map[s.code] || [];
      const rows = allRows.slice(0, parseInt(CMP.period)).reverse();
      const vals = rows.map(r => r[sparkKey]).filter(v => v != null && !isNaN(v));
      if (vals.length < 2) return;

      const min = Math.min(...vals), max = Math.max(...vals);
      const w = canvas.width, h = canvas.height;
      const color = CMP_COLORS[si % CMP_COLORS.length];
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, w, h);

      // 선 그리기
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      vals.forEach((v, i) => {
        const x = vals.length === 1 ? w/2 : (i / (vals.length - 1)) * (w - 4) + 2;
        const y = max === min ? h / 2 : h - ((v - min) / (max - min)) * (h - 6) - 3;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();

      // 마지막 점
      const lx = vals.length === 1 ? w/2 : (w - 4) + 2;
      const lv = vals[vals.length - 1];
      const ly = max === min ? h/2 : h - ((lv - min) / (max - min)) * (h - 6) - 3;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(lx, ly, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
  });
}

function _cmpSetActiveMetric() {
  document.querySelectorAll('#cmp-result .chip[data-metric]').forEach(el => {
    el.classList.toggle('active', CMP.metrics.includes(el.dataset.metric));
  });
}

// ── 지표 여러 개 — 칩을 누르면 넣고 빼기(마지막 하나는 남김), 지표마다 차트·분기별 표 카드 ──
// 10-18 사용자: 한 번에 한 지표만 보여 매출액을 고르면 수주잔고가 사라졌다 → 여러 개를 함께
const CMP_MAX_METRICS = 6;
function cmpToggleMetric(key) {
  const i = CMP.metrics.indexOf(key);
  if (i >= 0) {
    if (CMP.metrics.length === 1) return;
    CMP.metrics.splice(i, 1);
  } else {
    if (CMP.metrics.length >= CMP_MAX_METRICS) { toast(`지표는 ${CMP_MAX_METRICS}개까지 함께 볼 수 있습니다.`, 'warn'); return; }
    CMP.metrics.push(key);
  }
  CMP.metric = CMP.metrics[0];
  const sel = document.getElementById('cmp-metric');
  if (sel) sel.value = CMP.metric;
  renderCmpMetricBlocks();
}

const _cmpCharts = {};   // 지표 키 → Chart
function _cmpDestroyCharts() {
  for (const k of Object.keys(_cmpCharts)) { _cmpCharts[k].destroy(); delete _cmpCharts[k]; }
}

function renderCmpMetricBlocks() {
  const el = document.getElementById('cmp-metric-blocks');
  if (!el || !CMP.sortedLabels) return;
  _cmpSetActiveMetric();
  _cmpDestroyCharts();
  el.innerHTML = CMP.metrics.map(k => {
    const m = CMP_METRICS.find(x => x.key === k);
    if (!m) return '';
    return `<div class="card" style="margin-bottom:1rem" data-capture="${escAttr(m.label)}">
      <div class="card-header" style="gap:8px">
        <span class="card-title" id="cmp-detail-title-${k}">${m.label}</span>
        <span style="font-size:calc(11px*var(--m-label));color:var(--text2)">단위 ${m.unit} · 최근 ${CMP.sortedLabels.length}분기</span>
        ${CMP.metrics.length > 1 ? `<button data-no-capture onclick="cmpToggleMetric('${k}')" title="이 지표 닫기"
          style="margin-left:auto;background:none;border:none;color:var(--text2);cursor:pointer;font-size:calc(14px*var(--m-body))">✕</button>` : ''}
      </div>
      <div id="cmp-rank-badges-${k}" style="padding:.5rem 1rem;border-bottom:1px solid var(--border);display:flex;gap:8px;flex-wrap:wrap"></div>
      <div style="padding:1rem"><canvas id="cmp-chart-${k}" style="max-height:360px;min-height:260px"></canvas></div>
      <div id="cmp-detail-body-${k}" class="table-wrap" style="border-top:1px solid var(--border)"></div>
    </div>`;
  }).join('');
  CMP.metrics.forEach(k => renderCmpChart(k));
}

// ── Chart.js 차트 렌더링 ──
function renderCmpChart(metricKey) {
  const canvas = document.getElementById(`cmp-chart-${metricKey}`);
  if (!canvas || !CMP.sortedLabels) return;

  const metaDef = CMP_METRICS.find(m => m.key === metricKey) || CMP_METRICS[0];
  const labels  = CMP.sortedLabels;

  // 캐시 있으면 즉시 렌더, 없으면 DB 조회
  if (CMP.metricCache?.[metricKey]) {
    drawCmpChart(canvas, CMP.metricCache[metricKey], labels, metaDef);
    renderCmpDetailTable(metricKey);
    _drawSparklines(metricKey);
  } else {
    fetchCmpMetricAndRender(metricKey, canvas, labels, metaDef);
  }
}

async function fetchCmpMetricAndRender(metricKey, canvas, labels, metaDef) {
  if (!CMP.metricCache) CMP.metricCache = {};
  if (CMP.metricCache[metricKey]) {
    drawCmpChart(canvas, CMP.metricCache[metricKey], labels, metaDef);
    renderCmpDetailTable(metricKey);
    return;
  }

  const codes = CMP.selectedCodes.map(s => s.code);

  // 페이지로 받는다 — 예전엔 한 번에 limit(500)이라 종목 10개 × 연결·별도 × 20여 분기(~1,000행)에서 잘렸다.
  // 수주잔고는 runComparison이 재무 행에 붙여 둔 값을 그대로 쓴다(financials 칸이 아님).
  const rows = metaDef.src ? Object.values(CMP.stockDataMap || {}).flat()
    : await fetchAllPages((s, e) => sb.from('financials')
      .select(`stock_code,fs_div,is_cumulative,bsns_year,quarter,${metricKey}`)
      .in('stock_code', codes)
      .order('stock_code').order('bsns_year').order('quarter').order('fs_div')
      .range(s, e));

  const stockMap = {};
  codes.forEach(c => { stockMap[c] = {}; });
  (metaDef.src ? rows : finNormalizeQuarters(finPreferFs(rows))).forEach(r => {   // 종목별 CFS 우선·OFS 폴백 + 4분기 연간값 행 정리
    if (stockMap[r.stock_code]) {
      stockMap[r.stock_code][`${r.bsns_year} ${r.quarter}`] = r[metricKey];
    }
  });

  const datasets = CMP.selectedCodes.map((s, i) => {
    const color   = CMP_COLORS[i % CMP_COLORS.length];
    const isBar   = metaDef.chartType === 'bar';
    const data    = labels.map(lbl => {
      const v = stockMap[s.code]?.[lbl];
      return v != null ? (metaDef.scale === 1 ? v : Math.round(v / metaDef.scale)) : null;
    });
    if (isBar) {
      return {
        label: s.name, data,
        backgroundColor: color + 'cc',
        borderColor: color,
        borderWidth: 1,
        borderRadius: 3,
        borderSkipped: false,
      };
    }
    return {
      label: s.name, data,
      borderColor: color,
      backgroundColor: color + '22',
      borderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 6,
      tension: 0.3,
      fill: false,
    };
  });

  CMP.metricCache[metricKey] = datasets;

  drawCmpChart(canvas, datasets, labels, metaDef);
  renderCmpDetailTable(metricKey);
  _drawSparklines(metricKey);
}

function drawCmpChart(canvas, datasets, labels, metaDef) {
  if (_cmpCharts[metaDef.key]) { _cmpCharts[metaDef.key].destroy(); delete _cmpCharts[metaDef.key]; }

  const isBar = metaDef.chartType === 'bar';

  // ── 정규화 처리 (100 기준) ──
  let finalDatasets = datasets;
  if (CMP.normalize && !isBar) {
    finalDatasets = datasets.map(ds => {
      const firstValid = ds.data.find(v => v != null);
      if (!firstValid) return ds;
      return { ...ds, data: ds.data.map(v => v != null ? parseFloat((v / firstValid * 100).toFixed(2)) : null) };
    });
  }

  // ── 산업 중위값 기준선 ──
  if (CMP.showMedian) {
    const medianData = labels.map((_, li) => {
      const vals = finalDatasets.map(ds => ds.data[li]).filter(v => v != null);
      if (!vals.length) return null;
      const sorted = [...vals].sort((a,b)=>a-b);
      const mid = Math.floor(sorted.length/2);
      return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2;
    });
    finalDatasets = [...finalDatasets, {
      label: '중위값',
      data: medianData,
      borderColor: 'rgba(255,255,255,.3)',
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderDash: [6, 3],
      pointRadius: 0,
      tension: 0,
      fill: false,
      type: 'line',
      order: -1,
    }];
  }

  // ── 순위 뱃지 렌더링 (최신 분기 기준) ──
  const rankBadges = document.getElementById(`cmp-rank-badges-${metaDef.key}`);
  if (rankBadges) {
    const lastIdx = labels.length - 1;
    const vals = datasets.map((ds, i) => ({
      name: CMP.selectedCodes[i]?.name || ds.label,
      color: CMP_COLORS[i % CMP_COLORS.length],
      val: ds.data[lastIdx],
    })).filter(x => x.val != null);

    const isAscBetter = ['debt_ratio'].includes(metaDef.key);
    const sorted = [...vals].sort((a,b) => isAscBetter ? a.val-b.val : b.val-a.val);
    const rankMap = {};
    sorted.forEach((x,i) => { rankMap[x.name] = i+1; });

    const rankColors = ['#f5a623','#a8a8a8','#cd7f32'];
    rankBadges.innerHTML = vals.length < 2 ? '' : sorted.map((x, i) => {
      const unit = CMP.normalize ? '%' : metaDef.unit;
      const dispVal = metaDef.scale === 1 ? x.val.toFixed(1)+unit
        : (Math.round(x.val)).toLocaleString()+unit;
      const rankColor = rankColors[i] || 'var(--text3)';
      return `<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;
        border-radius:100px;background:rgba(255,255,255,.06);font-size:calc(12px*var(--m-sub))">
        <span style="font-size:calc(11px*var(--m-label));font-weight:700;color:${rankColor};min-width:22px;text-align:center">${i+1}위</span>
        <span style="width:6px;height:6px;border-radius:50%;background:${x.color}"></span>
        <strong>${escapeHtml(x.name)}</strong>
        <span style="color:var(--text2)">${dispVal}</span>
      </span>`;
    }).join('');
  }

  // bar 차트용 데이터셋: fill, borderRadius 등 추가
  const styledDatasets = finalDatasets.map((ds, i) => {
    const color = CMP_COLORS[i % CMP_COLORS.length];
    if (isBar) {
      return {
        ...ds,
        backgroundColor: color + 'cc',
        borderColor: color,
        borderWidth: 1,
        borderRadius: 3,
        borderSkipped: false,
        fill: false,
      };
    }
    return {
      ...ds,
      backgroundColor: color + '22',
      borderColor: color,
      borderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 6,
      tension: 0.3,
      fill: false,
    };
  });

  _cmpCharts[metaDef.key] = new Chart(canvas, {
    type: isBar ? 'bar' : 'line',
    data: { labels, datasets: styledDatasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels: { color: '#8b90a7', font: { size: 12 }, padding: 16, usePointStyle: true },
        },
        tooltip: {
          backgroundColor: '#1a1d27',
          borderColor: 'rgba(255,255,255,.1)',
          borderWidth: 1,
          titleColor: '#e8eaf0',
          bodyColor: '#8b90a7',
          callbacks: {
            label: ctx => {
              const v = ctx.parsed.y;
              if (v == null) return `${ctx.dataset.label}: —`;
              const sign = v > 0 ? '' : '';
              return `${ctx.dataset.label}: ${v.toLocaleString()}${metaDef.unit}`;
            }
          }
        },
      },
      scales: {
        x: {
          ticks: { color: '#8b90a7', font: { size: 11 } },
          grid: { color: 'rgba(255,255,255,.04)' },
          // bar 차트는 grouped
          ...(isBar && datasets.length > 1 ? {} : {}),
        },
        y: {
          ticks: {
            color: '#8b90a7', font: { size: 11 },
            callback: v => {
              if (CMP.normalize && !isBar) return v.toFixed(0) + '%';
              if (Math.abs(v) >= 10000) return metaDef.unit === '억'   // 1만억 → 1조
                ? (v/10000).toLocaleString('ko-KR', { maximumFractionDigits: 1 }) + '조'
                : (v/10000).toFixed(0) + '만' + metaDef.unit;
              return v.toLocaleString() + metaDef.unit;
            },
          },
          grid: { color: 'rgba(255,255,255,.06)' },
          // 음수 표현을 위해 0 기준선 강조
          ...(isBar ? {
            grid: {
              color: ctx => ctx.tick.value === 0
                ? 'rgba(255,255,255,.25)'
                : 'rgba(255,255,255,.06)',
              lineWidth: ctx => ctx.tick.value === 0 ? 2 : 1,
            }
          } : {}),
        },
      },
    },
  });
}

// 외부 클릭 시 드롭다운 닫기
document.addEventListener('click', e => {
  const dd = document.getElementById('cmp-dropdown');
  if (dd && !e.target.closest('#cmp-search') && !e.target.closest('#cmp-dropdown')) {
    dd.style.display = 'none';
  }
});

// ── 비교 화면에서 모니터링 추가 ──
async function cmpAddToMonitor(code, name) {
  if (typeof canEdit === 'function' && !canEdit()) { toast('권한이 없습니다.', 'error'); return; }
  if (A.monitoredSet?.has(code)) return;
  try {
    // companies.code는 접미사 없는 6자리(예전 '.KS' 붙여 update → 0행 갱신인데 성공 토스트였음, 10-28)
    const { data: cur, error: e1 } = await sb.from('companies').select('code,monitoring_level').eq('code', code).maybeSingle();
    if (e1) throw e1;
    if (!cur) throw new Error('종목 정보를 찾을 수 없습니다');
    const { error: e2 } = await sb.from('companies')
      .update({ is_monitored: true, monitoring_level: cur.monitoring_level || 'news' }).eq('code', code);
    if (e2) throw e2;
    await triggerBotReload();   // 모니터링 종목 화면의 [적용]과 같은 신호(config.js 공용)
    A.monitoredSet = A.monitoredSet || new Set();
    A.monitoredSet.add(code);
    toast(`${name} 모니터링 추가됨 — 약 1분 후 봇 반영`, 'success');
    // 버튼 즉시 업데이트
    document.querySelectorAll(`button[onclick*="${code}"]`).forEach(btn => {
      if (btn.textContent.includes('모니터링')) {
        btn.textContent = '✓ 모니터링 중';
        btn.style.color = 'var(--green)';
        btn.style.borderColor = 'var(--green)';
        btn.style.background = 'rgba(45,206,137,.1)';
      }
    });
  } catch(e) {
    toast('모니터링 추가 실패: ' + e.message, 'error');
  }
}

// ── 레이더 차트 (6개 지표 종합) ──
let _cmpRadarInstance = null;
let _cmpRadarHighlight = null;   // 하이라이트 종목 code (null = 전체 동일)
let _cmpRadarScores   = {};      // 점수 캐시 (하이라이트 재적용용)
let _cmpRadarColors   = {};      // 색상 캐시

function _applyRadarHighlight() {
  if (!_cmpRadarInstance) return;
  const hl = _cmpRadarHighlight;
  _cmpRadarInstance.data.datasets.forEach(ds => {
    const code = CMP.selectedCodes.find(s => s.name === ds.label)?.code;
    const isHl = !hl || code === hl;
    const color = _cmpRadarColors[ds.label] || ds.borderColor;
    ds.borderColor       = isHl ? color : color.replace(/[\d.]+\)$/, '0.18)');
    ds.backgroundColor   = isHl ? color + '44' : color + '08';
    ds.borderWidth       = isHl ? (hl ? 3 : 2) : 1;
    ds.pointRadius       = isHl ? (hl ? 5 : 4) : 2;
  });
  _cmpRadarInstance.update('none');

  // 버튼 스타일 갱신
  CMP.selectedCodes.forEach(s => {
    const btn = document.getElementById('radar-btn-' + s.code);
    if (!btn) return;
    const isHl = !hl || s.code === hl;
    btn.style.opacity    = isHl ? '1' : '0.4';
    btn.style.fontWeight = (hl && s.code === hl) ? '700' : '400';
    btn.style.borderWidth = (hl && s.code === hl) ? '2px' : '1px';
  });
}

function highlightCmpRadar(code) {
  _cmpRadarHighlight = (_cmpRadarHighlight === code) ? null : code;  // 재클릭 = 해제
  _applyRadarHighlight();
}

function drawCmpRadar(stockDataMap) {
  const canvas = document.getElementById('cmp-radar');
  if (!canvas || !window.Chart) return;
  if (_cmpRadarInstance) { _cmpRadarInstance.destroy(); _cmpRadarInstance = null; }
  _cmpRadarHighlight = null;

  // 레이더 6개 축: 수익성/성장성/안정성/효율성/현금흐름/밸류에이션
  const RADAR_AXES = [
    { key: 'operating_margin',    label: '영업이익률', higher: true  },
    { key: 'roe',                 label: 'ROE',        higher: true  },
    { key: 'revenue',             label: '매출 규모',  higher: true  },
    { key: 'operating_cashflow',  label: '현금흐름',   higher: true  },
    { key: 'debt_ratio',          label: '재무안정',   higher: false },
    { key: 'gross_profit',        label: '매출총이익', higher: true  },
  ];

  // 종목별 최신 분기 데이터
  const latest = {};
  CMP.selectedCodes.forEach(s => {
    latest[s.code] = (stockDataMap[s.code] || [])[0] || {};
  });

  // 0~100 정규화
  _cmpRadarScores = {};
  RADAR_AXES.forEach(ax => {
    const vals = CMP.selectedCodes.map(s => latest[s.code]?.[ax.key]).filter(v => v != null);
    if (!vals.length) {
      CMP.selectedCodes.forEach(s => { (_cmpRadarScores[s.code] = _cmpRadarScores[s.code]||{})[ax.label] = 50; });
      return;
    }
    const min = Math.min(...vals), max = Math.max(...vals);
    CMP.selectedCodes.forEach(s => {
      const v = latest[s.code]?.[ax.key];
      if (v == null) { (_cmpRadarScores[s.code] = _cmpRadarScores[s.code]||{})[ax.label] = 0; return; }
      let pct = max === min ? 50 : (v - min) / (max - min) * 100;
      if (!ax.higher) pct = 100 - pct;
      (_cmpRadarScores[s.code] = _cmpRadarScores[s.code]||{})[ax.label] = Math.round(pct);
    });
  });

  _cmpRadarColors = {};
  const datasets = CMP.selectedCodes.map((s, i) => {
    const color = CMP_COLORS[i % CMP_COLORS.length];
    _cmpRadarColors[s.name] = color;
    return {
      label: s.name,
      data: RADAR_AXES.map(ax => _cmpRadarScores[s.code]?.[ax.label] ?? 0),
      borderColor: color,
      backgroundColor: color + '33',
      borderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 6,
    };
  });

  _cmpRadarInstance = new Chart(canvas, {
    type: 'radar',
    data: { labels: RADAR_AXES.map(a => a.label), datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: { color: '#8b90a7', font: { size: 12 }, padding: 12, usePointStyle: true },
          onClick: (e, item) => {
            const code = CMP.selectedCodes[item.datasetIndex]?.code;
            if (code) highlightCmpRadar(code);
          },
        },
        tooltip: {
          backgroundColor: '#1a1d27', titleColor: '#e8eaf0', bodyColor: '#8b90a7',
          callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.raw}점 (100점 만점)` },
        },
      },
      scales: {
        r: {
          min: 0, max: 100,
          ticks: { color: '#8b90a7', font: { size: 10 }, stepSize: 25, backdropColor: 'transparent' },
          grid: { color: 'rgba(255,255,255,.08)' },
          angleLines: { color: 'rgba(255,255,255,.08)' },
          pointLabels: { color: '#8b90a7', font: { size: 12 } },
        },
      },
    },
  });

  // 종목 선택 버튼 렌더링
  const btns = document.getElementById('cmp-radar-btns');
  if (btns) {
    btns.innerHTML = CMP.selectedCodes.map((s, i) => {
      const color = CMP_COLORS[i % CMP_COLORS.length];
      return `<button id="radar-btn-${s.code}"
        onclick="highlightCmpRadar('${s.code}')"
        style="font-size:calc(12px*var(--m-sub));padding:4px 12px;border-radius:20px;cursor:pointer;
               border:1px solid ${color};color:${color};background:${color}18;
               transition:all .15s">
        ${s.name}
      </button>`;
    }).join('');
  }
}
