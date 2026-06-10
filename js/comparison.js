// comparison.js — 기업 비교 분석 페이지
// 의존: config.js (INDUSTRIES, CATS, fetchAllPages, fmtCap, chgColor, chgStr, loadingHTML, emptyHTML)

// ── 비교 상태 ──
const CMP = {
  selectedCodes: [],   // 선택된 종목코드 배열
  industry: '',        // 산업 필터 ('' = 전체)
  metric: 'revenue',  // 선택된 지표
  period: '8',         // 표시 분기 수
  normalize: false,    // 정규화 차트 (100 기준)
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
];

// Chart.js 색상 팔레트
const CMP_COLORS = [
  '#2AABEE','#2dce89','#f5365c','#fb6340','#ffd600',
  '#a259ff','#11cdef','#4a9eff','#ff6b9d','#00d4aa',
];

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
          <span class="card-title">선택 종목 <span id="cmp-count" style="font-size:11px;color:var(--text2)">0개</span></span>
          <button class="btn btn-sm" onclick="clearCmpStocks()">전체 해제</button>
        </div>
        <div id="cmp-selected-list" style="padding:.5rem;min-height:60px;max-height:300px;overflow-y:auto">
          <div style="padding:.5rem;text-align:center;color:var(--text2);font-size:12px">종목을 선택해주세요</div>
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
            <div style="font-size:11px;color:var(--text1);margin-bottom:4px">재무 지표</div>
            <select class="form-select" id="cmp-metric" onchange="CMP.metric=this.value" style="width:100%">
              ${CMP_METRICS.map(m=>`<option value="${m.key}" ${CMP.metric===m.key?'selected':''}>${m.label}</option>`).join('')}
            </select>
          </div>
          <div>
            <div style="font-size:11px;color:var(--text1);margin-bottom:4px">표시 분기</div>
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
      <div style="padding:3rem;text-align:center;color:var(--text2);font-size:13px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius)">
        <div style="font-size:24px;margin-bottom:.5rem">📊</div>
        <div>좌측에서 종목을 선택하고 비교 분석을 실행해주세요</div>
        <div style="font-size:11px;margin-top:.5rem;color:var(--text2)">산업 전체 추가 또는 개별 종목 검색으로 최대 10개까지 비교 가능합니다</div>
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
      console.log('[종목검색] 검색어:', q);
      const { data: rows, error } = await sb
        .from('companies')
        .select('code,name,industry')
        .or(`name.ilike.%${q}%,code.ilike.%${q}%`)
        .eq('is_monitored', true)
        .order('name')
        .limit(20);

      console.log('[종목검색] 결과:', rows?.length, '개, 에러:', error);

      if (error) { console.error('[종목검색] 에러:', error); dd.style.display = 'none'; return; }
      if (!rows?.length) { dd.innerHTML = '<div style="padding:8px 12px;font-size:12px;color:var(--text2)">검색 결과 없음</div>'; dd.style.display = 'block'; return; }

      dd.innerHTML = rows.map(r => {
        const code = (r.code || '').split('.')[0];
        const already = CMP.selectedCodes.find(s => s.code === code);
        return `<div
          data-code="${code}"
          data-name="${r.name.replace(/"/g,'&quot;')}"
          data-industry="${(r.industry||'').replace(/"/g,'&quot;')}"
          onclick="addCmpStockFromEl(this)"
          style="padding:8px 12px;font-size:13px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;
          border-bottom:1px solid var(--border);${already?'opacity:.4;pointer-events:none':''}">
          <span style="font-weight:500">${r.name} <span style="font-size:11px;color:var(--text2);font-weight:400">${code}</span></span>
          <span style="font-size:11px;color:${CATS[r.industry]||'var(--text3)'}">
            ${already?'추가됨':r.industry||''}
          </span>
        </div>`;
      }).join('');
      dd.style.display = 'block';
    } catch(e) {
      console.error('[종목검색] 예외:', e);
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
  CMP.period        = '8';
  CMP.normalize     = false;
  CMP.showMedian    = false;

  // 차트 인스턴스 제거
  if (_cmpChartInstance) { _cmpChartInstance.destroy(); _cmpChartInstance = null; }
  if (_cmpRadarInstance) { _cmpRadarInstance.destroy(); _cmpRadarInstance = null; }

  // 캐시 전체 초기화 — 이전 실행 데이터 제거
  window._cmpChartDatasets = null;
  window._cmpChartLabels   = null;
  window._cmpMetricCache   = {};   // ← 지표별 캐시 초기화
  window._cmpStockDataMap  = null;
  window._cmpSortedLabels  = null;

  // UI 초기화 후 선택 목록 렌더
  renderCmpSelected();
}

function renderCmpSelected() {
  const el = document.getElementById('cmp-selected-list');
  const cnt = document.getElementById('cmp-count');
  if (!el) return;
  if (cnt) cnt.textContent = `${CMP.selectedCodes.length}개`;
  if (!CMP.selectedCodes.length) {
    el.innerHTML = '<div style="padding:.5rem;text-align:center;color:var(--text2);font-size:12px">종목을 선택해주세요</div>';
    return;
  }
  el.innerHTML = CMP.selectedCodes.map((s, i) => `
    <div style="display:flex;align-items:center;gap:6px;padding:5px 6px;border-radius:var(--radius-sm);background:var(--bg3);margin-bottom:4px">
      <span style="width:10px;height:10px;border-radius:50%;background:${CMP_COLORS[i%CMP_COLORS.length]};flex-shrink:0"></span>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.name}</div>
        ${s.subIndustry ? `<div style="font-size:10px;color:var(--text2)">${s.subIndustry}</div>` : ''}
      </div>
      <span style="font-size:10px;color:var(--text2)">${s.code}</span>
      <button onclick="removeCmpStock('${s.code}')"
        style="background:none;border:none;color:var(--text2);cursor:pointer;padding:0 2px;font-size:14px;line-height:1">×</button>
    </div>`).join('');
}

// ── 비교 분석 실행 ──
async function runComparison() {
  if (CMP.selectedCodes.length < 1) { toast('종목을 1개 이상 선택해주세요.', 'error'); return; }

  // 실행 시마다 지표 캐시 초기화 — 종목 조합 변경 반영
  window._cmpMetricCache  = {};
  window._cmpStockDataMap = null;
  window._cmpSortedLabels = null;

  const el = document.getElementById('cmp-result');
  el.innerHTML = loadingHTML('데이터 로드 중...');

  try {
    const codes = CMP.selectedCodes.map(s => s.code);
    const period = parseInt(CMP.period);
    const metric = CMP.metric;
    const metaDef = CMP_METRICS.find(m => m.key === metric);

    // 재무 데이터 조회
    const finRows = await fetchAllPages(
      sb.from('financials')
        .select('stock_code,corp_name,bsns_year,quarter,fs_div,' + CMP_METRICS.map(m=>m.key).filter((k,i,a)=>a.indexOf(k)===i).join(','))
        .in('stock_code', codes)
        .eq('fs_div', 'CFS')
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
    finRows.forEach(r => {
      // FCF 근사: 영업현금흐름 (capex 데이터 없으므로 보수적 근사)
      // fcf: DB 컬럼에서 직접 가져옴 (collect_financials.py에서 계산)
      if (stockDataMap[r.stock_code]) {
        stockDataMap[r.stock_code].push(r);
      }
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
    for (const s of CMP.selectedCodes) {
      const { data: priceRows } = await sb.from('market_data')
        .select('base_date,price,price_change_rate,hgpr_cls,hgpr_cls_code')
        .eq('stock_code', s.code)
        .order('base_date', { ascending: false })
        .limit(252);   // 52주(약 252 거래일)
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
        // 52주 고/저
        const high52 = Math.max(...prices);
        const low52  = Math.min(...prices);
        weekData[s.code] = { high: high52, low: low52 };
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
          <span style="font-size:11px;color:var(--text2)">기준: ${maxDate || '—'}</span>
        </div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead>
              <tr>
                <th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--text2);border-bottom:1px solid var(--border)">종목</th>
                <th style="padding:8px 12px;text-align:right;font-size:11px;color:var(--text2);border-bottom:1px solid var(--border)">현재가</th>
                <th style="padding:8px 12px;text-align:right;font-size:11px;color:var(--text2);border-bottom:1px solid var(--border)">등락률</th>
                <th style="padding:8px 12px;text-align:right;font-size:11px;color:var(--text2);border-bottom:1px solid var(--border)">5일선</th>
                <th style="padding:8px 12px;text-align:right;font-size:11px;color:var(--text2);border-bottom:1px solid var(--border)">20일선</th>
                <th style="padding:8px 12px;text-align:right;font-size:11px;color:var(--text2);border-bottom:1px solid var(--border)">60일선</th>
                <th style="padding:8px 12px;text-align:right;font-size:11px;color:var(--text2);border-bottom:1px solid var(--border)">시총</th>
                <th style="padding:8px 12px;text-align:right;font-size:11px;color:var(--text2);border-bottom:1px solid var(--border)">PER</th>
                <th style="padding:8px 12px;text-align:right;font-size:11px;color:var(--text2);border-bottom:1px solid var(--border)">PBR</th>
                <th style="padding:8px 12px;text-align:center;font-size:11px;color:var(--text2);border-bottom:1px solid var(--border)">52주 위치</th>
                <th style="padding:8px 12px;text-align:center;font-size:11px;color:var(--text2);border-bottom:1px solid var(--border)">액션</th>
              </tr>
            </thead>
            <tbody>
              ${CMP.selectedCodes.map((s, i) => {
                const ma = maData[s.code];
                const mkt = mktMap[s.code];
                const w52 = weekData[s.code];
                const color = CMP_COLORS[i % CMP_COLORS.length];
                if (!ma && !mkt) return `<tr><td colspan="11" style="padding:8px 12px;color:var(--text2);font-size:12px">${s.name} — 시장 데이터 없음</td></tr>`;
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
                  w52bar = `<div style="font-size:10px;color:var(--text2);margin-bottom:3px;display:flex;justify-content:space-between">
                    <span>${w52.low.toLocaleString()}</span><span>${pct}%</span><span>${w52.high.toLocaleString()}</span>
                  </div>
                  <div style="background:var(--bg3);border-radius:3px;height:6px;position:relative;width:120px">
                    <div style="position:absolute;left:0;top:0;height:100%;width:${Math.max(4,Math.min(100,pct))}%;background:${barColor};border-radius:3px"></div>
                  </div>`;
                }
                // 모니터링 여부
                const isMonitored = A.monitoredSet?.has(s.code);
                return `<tr style="border-bottom:1px solid var(--border)">
                  <td style="padding:8px 12px">
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                      <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0"></span>
                      <span style="font-weight:500">${s.name}</span>
                      ${ma?.newHigh ? `<span style="font-size:10px;padding:1px 5px;border-radius:3px;
                        background:${ma.newHighCode==='3'?'rgba(255,193,7,.2)':ma.newHighCode==='2'?'rgba(255,107,54,.2)':'rgba(42,171,238,.15)'};
                        color:${ma.newHighCode==='3'?'#ffc107':ma.newHighCode==='2'?'#ff6b35':'var(--tg)'};
                        font-weight:600;white-space:nowrap">${ma.newHigh}</span>` : ''}
                    </div>
                  </td>
                  <td style="padding:8px 12px;text-align:right;font-weight:500">${price ? price.toLocaleString()+'원' : '—'}</td>
                  <td style="padding:8px 12px;text-align:right;color:${chgColor(chg)};font-weight:500">${chg != null ? chgStr(chg) : '—'}</td>
                  <td style="padding:8px 12px;text-align:right;color:${ma5pos}">${ma?.ma5 ? ma.ma5.toLocaleString()+'원' : '—'}</td>
                  <td style="padding:8px 12px;text-align:right;color:${ma20pos}">${ma?.ma20 ? ma.ma20.toLocaleString()+'원' : '—'}</td>
                  <td style="padding:8px 12px;text-align:right;color:${ma60pos}">${ma?.ma60 ? ma.ma60.toLocaleString()+'원' : '—'}</td>
                  <td style="padding:8px 12px;text-align:right">${mkt?.market_cap ? fmtCap(mkt.market_cap) : '—'}</td>
                  <td style="padding:8px 12px;text-align:right">${mkt?.per ? mkt.per.toFixed(1) : '—'}</td>
                  <td style="padding:8px 12px;text-align:right">${mkt?.pbr ? mkt.pbr.toFixed(2) : '—'}</td>
                  <td style="padding:8px 12px;text-align:center">${w52bar || '—'}</td>
                  <td style="padding:8px 12px;text-align:center">
                    <button onclick="cmpAddToMonitor('${s.code}','${s.name}')"
                      style="font-size:11px;padding:3px 8px;border-radius:4px;border:1px solid ${isMonitored?'var(--green)':'var(--border)'};
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

      <!-- 지표 선택 탭 + 정규화 토글 -->
      <div class="card" style="margin-bottom:1rem">
        <div class="card-header" style="flex-wrap:wrap;gap:8px">
          <span class="card-title">분기별 재무 비교</span>
          <div style="display:flex;gap:6px;flex-wrap:wrap;flex:1">
            ${CMP_METRICS.map(m => `
              <button class="chip ${CMP.metric===m.key?'active':''}"
                data-metric="${m.key}"
                onclick="CMP.metric='${m.key}';document.getElementById('cmp-metric').value='${m.key}';renderCmpChart('${m.key}')"
                style="font-size:11px;padding:3px 8px">${m.label}</button>
            `).join('')}
          </div>
          <div style="display:flex;gap:6px;align-items:center;margin-left:auto">
            <button id="cmp-normalize-btn"
              onclick="CMP.normalize=!CMP.normalize;this.classList.toggle('active');renderCmpChart(CMP.metric)"
              class="chip ${CMP.normalize?'active':''}"
              style="font-size:11px;padding:3px 8px" title="100 기준 정규화 — 성장률 비교">
              📐 정규화
            </button>
            <button id="cmp-median-btn"
              onclick="CMP.showMedian=!CMP.showMedian;this.classList.toggle('active');renderCmpChart(CMP.metric)"
              class="chip ${CMP.showMedian?'active':''}"
              style="font-size:11px;padding:3px 8px" title="산업 중위값 기준선 표시">
              ⊘ 중위값
            </button>
          </div>
        </div>

        <!-- 지표별 순위 뱃지 -->
        <div id="cmp-rank-badges" style="padding:.5rem 1rem;border-bottom:1px solid var(--border);display:flex;gap:8px;flex-wrap:wrap"></div>

        <div style="padding:1rem">
          <canvas id="cmp-chart" style="max-height:400px;min-height:280px"></canvas>
        </div>
      </div>


      <!-- 레이더 차트 (6개 지표 종합) -->
      <div class="card" style="margin-bottom:1rem">
        <div class="card-header">
          <span class="card-title">종합 지표 레이더</span>
          <span style="font-size:11px;color:var(--text2)">최신 분기 기준 — 종목 클릭 시 하이라이트</span>
        </div>
        <div style="padding:1rem;display:flex;flex-direction:column;align-items:center;gap:12px">
          <div style="width:420px;height:420px;position:relative">
            <canvas id="cmp-radar"></canvas>
          </div>
          <div id="cmp-radar-btns" style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center"></div>
        </div>
      </div>

      <!-- 지표별 분기별 상세 테이블 -->
      <div class="card" id="cmp-detail-card">
        <div class="card-header">
          <span class="card-title" id="cmp-detail-title">분기별 상세</span>
          <span style="font-size:11px;color:var(--text2)">위 지표 탭 클릭 시 전환</span>
        </div>
        <div id="cmp-detail-body" style="overflow-x:auto"></div>
      </div>`;

    // stockDataMap 전역 저장
    window._cmpStockDataMap = stockDataMap;
    window._cmpSortedLabels = sortedLabels;

    // 차트 + 상세 테이블 렌더링
    window._cmpChartDatasets = datasets;
    window._cmpChartLabels   = sortedLabels;
    renderCmpChart(metric);
    renderCmpDetailTable(metric);
    _drawSparklines(metric);
    drawCmpRadar(stockDataMap);

  } catch(e) {
    el.innerHTML = errorHTML(e.message);
    console.error('[비교분석]', e);
  }
}

// ── 지표별 분기별 상세 테이블 ──
function renderCmpDetailTable(metricKey) {
  const body  = document.getElementById('cmp-detail-body');
  const title = document.getElementById('cmp-detail-title');
  if (!body || !window._cmpStockDataMap || !window._cmpSortedLabels) return;

  const metaDef = CMP_METRICS.find(m => m.key === metricKey) || CMP_METRICS[0];
  const labels  = window._cmpSortedLabels;
  if (title) title.textContent = `${metaDef.label} — 분기별 비교`;

  const fmtVal = (v) => {
    if (v == null) return `<span style="color:var(--text2)">—</span>`;
    if (metaDef.scale === 1) {
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
    (window._cmpStockDataMap[s.code] || []).forEach(r => {
      stockRowMap[s.code][`${r.bsns_year} ${r.quarter}`] = r[metricKey];
    });
  });

  body.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:13px;min-width:500px">
      <thead>
        <tr style="background:var(--bg3)">
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--text2);
            border-bottom:1px solid var(--border);position:sticky;left:0;background:var(--bg3);min-width:120px">종목</th>
          ${labels.map(lbl => `
            <th style="padding:8px 12px;text-align:right;font-size:11px;color:var(--text2);
              border-bottom:1px solid var(--border);white-space:nowrap">${lbl}</th>
          `).join('')}
          <th style="padding:8px 12px;text-align:center;font-size:11px;color:var(--text2);border-bottom:1px solid var(--border);white-space:nowrap;min-width:90px">추이</th>
        </tr>
      </thead>
      <tbody>
        ${CMP.selectedCodes.map((s, i) => {
          const color  = CMP_COLORS[i % CMP_COLORS.length];
          const rowMap = stockRowMap[s.code] || {};
          return `<tr style="border-bottom:1px solid var(--border)">
            <td style="padding:8px 12px;position:sticky;left:0;background:var(--bg2);min-width:120px">
              <div style="display:flex;align-items:center;gap:6px;white-space:nowrap">
                <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0"></span>
                <span style="font-weight:500;font-size:12px">${s.name}</span>
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
                ? `<div style="font-size:10px;color:${yoyColor};font-weight:600;margin-top:1px">YoY ${parseFloat(yoy)>0?'▲':'▼'}${Math.abs(yoy)}%</div>` : '';
              const qoqStr = qoq != null && li > 0
                ? `<div style="font-size:10px;color:${qoqColor};margin-top:1px">QoQ ${parseFloat(qoq) > 0 ? '▲' : '▼'}${Math.abs(qoq)}%</div>`
                : '';
              return `<td style="padding:6px 12px;text-align:right;vertical-align:top">
                <div>${fmtVal(cur)}</div>${yoyStr}${qoqStr}
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
    const map = window._cmpStockDataMap || {};
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

function _cmpSetActiveMetric(metricKey) {
  document.querySelectorAll('#cmp-result .chip[data-metric]').forEach(el => {
    el.classList.toggle('active', el.dataset.metric === metricKey);
  });
}

// ── Chart.js 차트 렌더링 ──
let _cmpChartInstance = null;
function renderCmpChart(metricKey) {
  const canvas = document.getElementById('cmp-chart');
  if (!canvas || !window._cmpSortedLabels) return;

  // CMP.metric 업데이트
  CMP.metric = metricKey;

  _cmpSetActiveMetric(metricKey);

  const metaDef = CMP_METRICS.find(m => m.key === metricKey) || CMP_METRICS[0];
  const labels  = window._cmpSortedLabels;

  // 캐시 있으면 즉시 렌더, 없으면 DB 조회
  if (window._cmpMetricCache?.[metricKey]) {
    drawCmpChart(canvas, window._cmpMetricCache[metricKey], labels, metaDef);
    renderCmpDetailTable(metricKey);
    _drawSparklines(metricKey);
  } else {
    fetchCmpMetricAndRender(metricKey, canvas, labels, metaDef);
  }
}

async function fetchCmpMetricAndRender(metricKey, canvas, labels, metaDef) {
  if (!window._cmpMetricCache) window._cmpMetricCache = {};
  if (window._cmpMetricCache[metricKey]) {
    drawCmpChart(canvas, window._cmpMetricCache[metricKey], labels, metaDef);
    renderCmpDetailTable(metricKey);
    return;
  }

  const codes = CMP.selectedCodes.map(s => s.code);

  // fetchAllPages 대신 직접 쿼리 (정렬+range 충돌 방지)
  const { data: rows } = await sb.from('financials')
    .select(`stock_code,bsns_year,quarter,${metricKey}`)
    .in('stock_code', codes)
    .eq('fs_div', 'CFS')
    .order('bsns_year', { ascending: true })
    .order('quarter', { ascending: true })
    .limit(500);

  const stockMap = {};
  codes.forEach(c => { stockMap[c] = {}; });
  (rows || []).forEach(r => {
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

  window._cmpMetricCache[metricKey] = datasets;

  _cmpSetActiveMetric(metricKey);

  drawCmpChart(canvas, datasets, labels, metaDef);
  renderCmpDetailTable(metricKey);
  _drawSparklines(metricKey);
}

function drawCmpChart(canvas, datasets, labels, metaDef) {
  if (_cmpChartInstance) { _cmpChartInstance.destroy(); _cmpChartInstance = null; }

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
  const rankBadges = document.getElementById('cmp-rank-badges');
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
        border-radius:100px;background:rgba(255,255,255,.06);font-size:12px">
        <span style="font-size:11px;font-weight:700;color:${rankColor};min-width:22px;text-align:center">${i+1}위</span>
        <span style="width:6px;height:6px;border-radius:50%;background:${x.color}"></span>
        <strong>${x.name}</strong>
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

  _cmpChartInstance = new Chart(canvas, {
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
          ticks: { color: '#555a70', font: { size: 11 } },
          grid: { color: 'rgba(255,255,255,.04)' },
          // bar 차트는 grouped
          ...(isBar && datasets.length > 1 ? {} : {}),
        },
        y: {
          ticks: {
            color: '#555a70', font: { size: 11 },
            callback: v => {
              if (CMP.normalize && !isBar) return v.toFixed(0) + '%';
              if (Math.abs(v) >= 10000) return (v/10000).toFixed(0) + '만' + metaDef.unit;
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
  try {
    const fullCode = code + (code.endsWith('.KS') || code.endsWith('.KQ') ? '' : '.KS');
    await sb.from('companies').update({ is_monitored: true }).eq('code', fullCode);
    A.monitoredSet = A.monitoredSet || new Set();
    A.monitoredSet.add(code);
    toast(`${name} 모니터링 추가됨`, 'success');
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
          ticks: { color: '#555a70', font: { size: 10 }, stepSize: 25, backdropColor: 'transparent' },
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
        style="font-size:12px;padding:4px 12px;border-radius:20px;cursor:pointer;
               border:1px solid ${color};color:${color};background:${color}18;
               transition:all .15s">
        ${s.name}
      </button>`;
    }).join('');
  }
}
