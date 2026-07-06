// financials.js — 기업 분석 (시장 현황/재무제표)
// fmtCap, chgColor, chgStr, loadingHTML, emptyHTML, errorHTML, fetchAllPages → config.js 참조

// 페이지 상태 네임스페이스 — 구 window._fin*/_sd* 수렴 (view·chart·drawChart·render·getRows·rows·indMap·sdCode 등)
const FIN = {};

// 검색 debounce — 키스트로크마다 API 호출 방지
let _finSearchTimer = null;
function _finSearchDebounce() {
  F.q = document.getElementById('fin-q')?.value ?? '';
  clearTimeout(_finSearchTimer);
  _finSearchTimer = setTimeout(() => loadFinancials(), 300);
}

/** 종목별 최신 분기 데이터 1건 추출 — { stock_code: row } 맵 반환 */
function _pickLatestFin(rows) {
  const map = {};
  (rows || []).forEach(r => {
    const cur = map[r.stock_code];
    if (!cur || r.bsns_year > cur.bsns_year ||
       (r.bsns_year === cur.bsns_year && r.quarter > cur.quarter))
      map[r.stock_code] = r;
  });
  return map;
}

function pFinancials() {
  const industries = ['전체', ...INDUSTRIES];
  return `
  <div style="display:flex;gap:6px;align-items:center;margin-bottom:.75rem;flex-wrap:wrap">
    <button class="chip" onclick="go('screener')">🔎 필터 스크리닝</button>
    <button class="chip active" onclick="go('financials')">📊 기업 분석</button>
  </div>
  <div class="tabs" style="margin-bottom:.75rem">
    <button class="tab fin-tab ${F.mode==='market'?'active':''}" data-mode="market" onclick="F.mode='market';loadFinancials()">시장 현황</button>
    <button class="tab fin-tab ${F.mode==='financial'?'active':''}" data-mode="financial" onclick="F.mode='financial';loadFinancials()">재무제표</button>
    <div style="margin-left:auto;display:flex;align-items:center;gap:8px;font-size:11px;padding:0 4px">
      <span style="padding:1px 6px;border-radius:3px;background:rgba(45,206,137,.15);color:var(--green);font-weight:600">DART</span><span style="color:var(--text2)">금융감독원 공시</span>
      <span style="padding:1px 6px;border-radius:3px;background:rgba(251,99,64,.15);color:var(--yellow);font-weight:600">계산</span><span style="color:var(--text2)">DB 자동계산</span>
      <span style="padding:1px 6px;border-radius:3px;background:rgba(42,171,238,.15);color:var(--tg);font-weight:600">KIS</span><span style="color:var(--text2)">한투 API</span>
    </div>
  </div>

  <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:1rem">
    <select class="form-select" id="fin-scope" onchange="F.scope=this.value;loadFinancials()" style="width:130px;padding:6px 10px">
      <option value="monitored" ${F.scope==='monitored'?'selected':''}>모니터링 종목</option>
      <option value="all" ${F.scope==='all'?'selected':''}>전체</option>
    </select>
    <input class="search-box" id="fin-q" placeholder="종목명 검색..." oninput="_finSearchDebounce()" style="max-width:160px">
    <select class="form-select" id="fin-ind" onchange="F.industry=this.value;loadFinancials()" style="width:120px;padding:6px 10px">
      ${industries.map(i=>`<option value="${i}" ${F.industry===i?'selected':''}>${i}</option>`).join('')}
    </select>
    <span style="font-size:12px;color:var(--text2)" id="fin-count"></span>
    <div style="margin-left:auto;display:flex;gap:6px">
      <button class="btn btn-sm" onclick="loadFinancials()">새로고침</button>
      <button class="btn btn-sm" onclick="exportFinancials()">CSV 다운로드</button>
    </div>
  </div>

  <div id="fin-table" style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);overflow:auto;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.2) var(--bg3)">
    <div id="fin-table-inner">${loadingHTML()}</div>
  </div>`;
}

let _finData = [];

// ══════════════════════════════════════════
//  공통 헬퍼
// ══════════════════════════════════════════

/**
 * 공통 필터 적용 (검색어 + 산업)
 * @param {Array} rows
 * @returns {Array} 필터된 rows
 */
function _applyFinFilter(rows) {
  if (F.q) rows = rows.filter(r => r.corp_name.includes(F.q));
  if (F.industry !== '전체') {
    const indStocks = new Set(
      Object.entries(FIN.indMap || {})
        .filter(([, ind]) => ind === F.industry)
        .map(([code]) => code)
    );
    rows = rows.filter(r => indStocks.has(r.stock_code));
  }
  return rows;
}

/**
 * 공통 정렬 버튼 생성
 * @param {string} col   정렬 키
 * @param {string} label 표시 레이블
 * @returns {string} HTML 문자열
 */
// src 배지: 'D'=DART, 'C'=계산(DB), 'K'=KIS API
const _SRC = {
  D: '<sup style="font-size:8px;color:var(--green);font-weight:700;margin-left:1px">D</sup>',
  C: '<sup style="font-size:8px;color:var(--yellow);font-weight:700;margin-left:1px">C</sup>',
  K: '<sup style="font-size:8px;color:var(--tg);font-weight:700;margin-left:1px">K</sup>',
};
function _sortBtn(col, label, src) {
  const active = F.sortBy === col;
  const icon   = active ? (F.sortDir === 'desc' ? ' ↓' : ' ↑') : '';
  const clr    = active ? 'color:var(--tg);' : '';
  const badge  = src ? (_SRC[src] || '') : '';
  return `<span style="cursor:pointer;white-space:nowrap;${clr}user-select:none"
    onclick="F.sortBy='${col}';F.sortDir=(F.sortBy==='${col}'&&F.sortDir==='desc')?'asc':'desc';loadFinancials()"
  >${label}${badge}${icon}</span>`;
}

/**
 * 공통 정렬 적용
 * @param {Array}  rows
 * @param {string} defaultCol 기본 정렬 컬럼
 * @returns {Array} 정렬된 rows
 */
function _sortRows(rows, defaultCol = 'market_cap') {
  const col = F.sortBy || defaultCol;
  return rows.sort((a, b) => {
    const av = a[col] ?? -Infinity;
    const bv = b[col] ?? -Infinity;
    return F.sortDir === 'desc' ? bv - av : av - bv;
  });
}

/**
 * 공통 모니터링 종목 코드 조회
 * @returns {Set|null} 모니터링 종목 코드 Set (전체 범위면 null)
 */
async function _getMonitoredCodes() {
  if (F.scope !== 'monitored') return null;
  const data = await fetchAllPages(
    sb.from('companies').select('code').eq('is_monitored', true)
  );
  return new Set(data.map(c => c.code));
}

/**
 * 공통 테이블 HTML 렌더링
 * @param {string[]} headers   th 배열 (HTML 문자열)
 * @param {string[]} bodyRows  tr 배열 (HTML 문자열)
 * @returns {string}
 */
function _renderTable(headers, bodyRows) {
  if (!bodyRows.length) return emptyHTML();
  return `
    <table style="border-collapse:collapse;width:max-content;min-width:100%;font-size:13px">
      <thead>
        <tr>
          ${headers.map(h => `<th style="
            position:sticky;top:0;z-index:2;
            background:var(--bg2);
            border-bottom:2px solid var(--border2);
            text-align:left;padding:9px 12px;
            font-size:11px;font-weight:600;color:var(--text1);
            text-transform:uppercase;letter-spacing:.06em;
            white-space:nowrap;
          ">${h}</th>`).join('')}
        </tr>
      </thead>
      <tbody>${bodyRows.join('')}</tbody>
    </table>`;
}

/**
 * 3탭 공통 로직 추출 — 데이터 조회 후 카운트 업데이트 + 테이블 렌더
 * @param {HTMLElement} el      대상 컨테이너
 * @param {Object}      config
 *   .fetchRows()       → Promise<Array>   탭별 데이터 조회 함수
 *   .defaultSort       → string           기본 정렬 컬럼
 *   .headers           → (rows)=>Array    헤더 배열 반환 함수
 *   .rowTemplate       → (row)=>string    행 HTML 반환 함수
 */
async function _loadTabData(el, config) {
  const { fetchRows, defaultSort = 'market_cap', headers, rowTemplate } = config;

  let rows = await fetchRows();
  rows = _applyFinFilter(rows);
  rows = _sortRows(rows, defaultSort);

  _finData = rows;
  const cnt = document.getElementById('fin-count');
  if (cnt) cnt.textContent = `${rows.length}개`;

  el.innerHTML = _renderTable(
    typeof headers === 'function' ? headers(rows) : headers,
    rows.map(config.rowTemplate)
  );
  _setFinTableHeight();
}

function _setFinTableHeight() {
  const el = document.getElementById('fin-table');
  if (!el) return;
  const top = el.getBoundingClientRect().top;
  el.style.maxHeight = Math.max(200, window.innerHeight - top - 8) + 'px';
  // fin-table-inner 너비를 fin-table 내부 너비(스크롤바 제외)로 명시 고정
  // → overflow:visible인 inner가 테이블 너비를 body로 흘리는 경로를 차단
  const inner = document.getElementById('fin-table-inner');
  if (inner) inner.style.width = el.clientWidth + 'px';
}

function initFinancials() {
  // 페이지 진입 시 검색어·필터 초기화
  F.q        = '';
  F.mode     = 'market';
  F.scope    = 'monitored';
  F.industry = '전체';
  F.sortBy   = 'market_cap';
  F.sortDir  = 'desc';

  // #content overflow-x:hidden → body 가로스크롤 차단
  // (탭 레전드 등 #fin-table 외부 요소도 원인일 수 있어 최상위에서 차단)
  // 페이지 이탈 시 MutationObserver가 자동으로 리셋
  const _contentEl = document.getElementById('content');
  if (_contentEl) {
    _contentEl.style.overflowX = 'hidden';
    const _obs = new MutationObserver(() => {
      _contentEl.style.overflowX = '';
      _obs.disconnect();
    });
    _obs.observe(_contentEl, { childList: true });
  }

  loadFinancials();

  // #fin-table 높이를 viewport 잔여 공간에 맞게 설정
  requestAnimationFrame(_setFinTableHeight);
  window.removeEventListener('resize', FIN.resizeHandler);
  FIN.resizeHandler = _setFinTableHeight;
  window.addEventListener('resize', _setFinTableHeight);
}

async function loadFinancials() {
  const el = document.getElementById('fin-table-inner') || document.getElementById('fin-table');
  if (!el) return;

  // 산업 필터용 companies 매핑: config.js 전역 캐시 사용
  if (!FIN.indMap) {
    const map = await getIndustryMap();  // config.js 전역 캐시 (이미 로드된 경우 즉시 반환)
    FIN.indMap = map;             // 기존 참조 코드(_finIndMap)와 호환성 유지
  }

  // 탭 active 상태 업데이트
  document.querySelectorAll('.fin-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.mode === F.mode);
  });

  el.innerHTML = loadingHTML();

  try {
    if (F.mode === 'financial') {
      await loadFinancialData(el);
    } else {
      await loadMarketData(el);
    }
  } catch(e) {
    el.innerHTML = `${errorHTML(e.message)}`;
  }
}

async function loadMarketData(el) {
  const _pct  = v => v != null ? v.toFixed(1) + '%' : '—';
  const _num  = v => v != null ? v.toLocaleString() : '—';
  const _yn   = v => v == null ? '—' : v ? '예' : '—';
  const _warn = c => {
    if (!c || c === '00') return '—';
    const m = {'01':'주의','02':'경고','03':'위험예고'};
    return `<span style="color:var(--yellow)">${m[c]||c}</span>`;
  };
  const _sign = s => s === '2' ? '▲' : s === '5' ? '▼' : s === '3' ? '─' : '';

  await _loadTabData(el, {
    defaultSort: 'market_cap',
    fetchRows: async () => {
      const [monitoredCodes, maxDate] = await Promise.all([
        _getMonitoredCodes(), getLatestMarketDate(),
      ]);
      const all = maxDate ? await fetchAllPages(
        sb.from('market_data').select('*').eq('base_date', maxDate)
      ) : [];
      const data = monitoredCodes ? all.filter(r => monitoredCodes.has(r.stock_code)) : all;
      const latest = {};
      data.forEach(r => { if (!latest[r.stock_code]) latest[r.stock_code] = r; });
      return Object.values(latest);
    },
    headers: () => [
      '종목명', '코드', '시장',
      _sortBtn('market_cap','시가총액'),
      _sortBtn('price','현재가'),
      _sortBtn('price_change','전일대비'),
      _sortBtn('price_change_rate','등락률'),
      _sortBtn('volume_change_rate','거래량증감률'),
      _sortBtn('high_price','고가'), _sortBtn('low_price','저가'),
      _sortBtn('vwap','VWAP'),
      _sortBtn('volume','거래량'), _sortBtn('trading_value','거래대금'),
      _sortBtn('listing_shares','상장주수'), _sortBtn('vol_turnover','거래량회전율'),
      _sortBtn('per','PER'), _sortBtn('pbr','PBR'),
      _sortBtn('eps','EPS'), _sortBtn('bps','BPS'), '결산월',
      _sortBtn('foreign_hold_rate','외국인보유율'), _sortBtn('foreign_hold_qty','외국인보유수'),
      _sortBtn('foreign_net_buy','외국인순매수'), _sortBtn('program_net_buy','프로그램순매수'),
      _sortBtn('loan_balance_rate','융자잔고율'), _sortBtn('short_sell_qty','공매도수량'),
      _sortBtn('w52_high','52주고가'), _sortBtn('w52_low','52주저가'),
      '52주고가일', '52주저가일',
      '52주고가대비%', '52주저가대비%',

      '전일부호', '시장경고', '투자유의', '관리종목', '단기과열', '정리매매', '신고가구분', '신고가코드', '기준일',
    ],
    rowTemplate: r => {
      const chg  = r.price_change_rate;
      const chgV = r.price_change;
      const chgC = chgColor(chg);
      const p    = v => v != null ? v.toFixed(1) + '%' : '—';
      const n    = v => v != null ? v.toLocaleString() : '—';
      const yn   = v => v ? '예' : '—';
      const warn = c => {
        if (!c || c === '00') return '—';
        return `<span style="color:var(--yellow)">${{'01':'주의','02':'경고','03':'위험예고'}[c]||c}</span>`;
      };
      const buyClr = v => v > 0 ? 'var(--green)' : v < 0 ? 'var(--red)' : 'var(--text3)';
      const buyFmt = v => v != null ? (v>0?'+':'')+v.toLocaleString() : '—';
      // 52주 프로그레스바
      const w52pct = (r.w52_high && r.w52_low && r.price && r.w52_high > r.w52_low)
        ? Math.round((r.price - r.w52_low) / (r.w52_high - r.w52_low) * 100) : null;
      const w52bar = w52pct != null
        ? `<div style="display:flex;align-items:center;gap:3px;font-size:10px">
            <span style="width:40px;height:3px;background:var(--bg3);border-radius:2px;display:inline-block;position:relative">
              <span style="position:absolute;left:0;top:0;height:100%;width:${Math.max(2,w52pct)}%;
                background:${w52pct>=80?'var(--red)':w52pct<=20?'var(--blue)':'var(--tg)'};border-radius:2px"></span>
            </span><span style="color:var(--text2)">${w52pct}%</span></div>` : '';
      return `<tr>
        <td class="stock-row" style="font-weight:500;color:var(--tg);white-space:nowrap"
          data-stock-open="${r.stock_code}" data-stock-name="${escAttr(r.corp_name||'')}" data-stock-tab="market">${r.corp_name}</td>
        <td style="font-size:11px;color:var(--text2);font-family:monospace">${r.stock_code}</td>
        <td style="font-size:11px;color:var(--text2)">${r.market||'—'}</td>
        <td>${fmtCap(r.market_cap)}</td>
        <td style="font-weight:500">${fmtPrice(r.price)}</td>
        <td style="color:${chgC}">${chgV != null ? (chgV>0?'+':'')+chgV.toLocaleString()+'원' : '—'}</td>
        <td style="color:${chgC};font-weight:500">${chgStr(chg)}</td>
        <td style="font-size:11px;color:var(--text2)">${p(r.volume_change_rate)}</td>
        <td style="color:var(--red)">${fmtPrice(r.high_price)}</td>
        <td style="color:var(--blue)">${fmtPrice(r.low_price)}</td>
        <td style="font-size:11px">${fmtPrice(r.vwap)}</td>
        <td>${n(r.volume)}</td>
        <td>${r.trading_value ? fmtCap(r.trading_value) : '—'}</td>
        <td style="font-size:11px">${n(r.listing_shares)}</td>
        <td style="font-size:11px">${r.vol_turnover != null ? r.vol_turnover.toFixed(2)+'%' : '—'}</td>
        <td>${r.per != null && r.per !== 0 ? r.per.toFixed(1) : '—'}</td>
        <td>${r.pbr != null && r.pbr !== 0 ? r.pbr.toFixed(2) : '—'}</td>
        <td>${n(r.eps)}</td><td>${n(r.bps)}</td>
        <td style="font-size:11px;color:var(--text2)">${r.fiscal_month||'—'}월</td>
        <td>${r.foreign_hold_rate != null ? r.foreign_hold_rate.toFixed(1)+'%' : '—'}</td>
        <td style="font-size:11px">${n(r.foreign_hold_qty)}</td>
        <td style="color:${buyClr(r.foreign_net_buy||0)}">${buyFmt(r.foreign_net_buy)}</td>
        <td style="color:${buyClr(r.program_net_buy||0)}">${buyFmt(r.program_net_buy)}</td>
        <td>${r.loan_balance_rate != null ? r.loan_balance_rate.toFixed(2)+'%' : '—'}</td>
        <td style="font-size:11px">${n(r.short_sell_qty)}</td>
        <td>
          <div style="color:var(--red);font-size:12px">${n(r.w52_high)}</div>
          ${w52bar}
        </td>
        <td style="color:var(--blue);font-size:12px">${n(r.w52_low)}</td>
        <td style="font-size:10px;color:var(--text2)">${r.w52_high_date||'—'}</td>
        <td style="font-size:10px;color:var(--text2)">${r.w52_low_date||'—'}</td>
        <td style="font-size:11px">${p(r.price && r.w52_high ? (r.price - r.w52_high) / r.w52_high * 100 : null)}</td>
        <td style="font-size:11px">${p(r.price && r.w52_low  ? (r.price - r.w52_low)  / r.w52_low  * 100 : null)}</td>
        <td style="font-size:11px;color:var(--text2);font-family:monospace">${r.price_change_sign||'—'}</td>
        <td>${warn(r.market_warn_code)}</td>
        <td>${yn(r.is_caution)}</td>
        <td style="font-size:11px">${r.manage_issue_code||'—'}</td>
        <td>${yn(r.is_short_over)}</td>
        <td>${yn(r.is_liquidation)}</td>
        <td style="font-size:11px;color:var(--tg)">${r.hgpr_cls||'—'}</td>
        <td style="font-size:11px;color:var(--text2);font-family:monospace">${r.hgpr_cls_code||'—'}</td>
        <td style="font-size:11px;color:var(--text2)">${r.base_date||'—'}</td>
      </tr>`;
    },
  });
}

async function loadFinancialData(el) {
  const pct  = v => v != null ? v.toFixed(1) + '%' : '—';
  const cap  = v => v != null ? fmtCap(v) : '—';
  const num  = v => v != null ? v.toLocaleString() : '—';
  const src  = (s) => `<span style="font-size:9px;padding:1px 4px;border-radius:3px;
    background:${s==='DART'?'rgba(45,206,137,.15)':s==='계산'?'rgba(251,99,64,.15)':'rgba(42,171,238,.15)'};
    color:${s==='DART'?'var(--green)':s==='계산'?'var(--yellow)':'var(--tg)'};font-weight:600">${s}</span>`;

  await _loadTabData(el, {
    defaultSort: 'revenue',
    fetchRows: async () => {
      const monitoredCodes = await _getMonitoredCodes();
      const all = await fetchAllPages(
        sb.from('financials').select('*')
          .order('bsns_year', { ascending: false })
          .order('quarter',   { ascending: false })
      );
      const data = monitoredCodes ? all.filter(r => monitoredCodes.has(r.stock_code)) : all;
      return Object.values(_pickLatestFin(data));
    },
    headers: () => [
      // 식별
      '종목명', '코드', '연도', '분기', '구분',
      // 손익계산서 (DART)
      _sortBtn('revenue','매출액','D'),
      _sortBtn('gross_profit','매출총이익','D'),
      _sortBtn('cogs','매출원가','D'),
      _sortBtn('sga','판관비','D'),
      _sortBtn('rd_expense','R&D','D'),
      _sortBtn('operating_profit','영업이익','D'),
      _sortBtn('other_operating_income','기타영업수익','D'),
      _sortBtn('other_operating_expense','기타영업비용','D'),
      _sortBtn('pretax_income','세전이익','D'),
      _sortBtn('net_income','당기순이익','D'),
      // 재무상태표 (DART)
      _sortBtn('total_assets','자산총계','D'),
      _sortBtn('total_liabilities','부채총계','D'),
      _sortBtn('total_equity','자본총계','D'),
      _sortBtn('current_assets','유동자산','D'),
      _sortBtn('current_liabilities','유동부채','D'),
      _sortBtn('non_current_assets','비유동자산','D'),
      _sortBtn('capital_stock','자본금','D'),
      _sortBtn('retained_earnings','이익잉여금','D'),
      // 현금흐름 (DART)
      _sortBtn('operating_cashflow','영업현금흐름','D'),
      _sortBtn('investing_cashflow','투자현금흐름','D'),
      _sortBtn('financing_cashflow','재무현금흐름','D'),
      _sortBtn('capex','CapEx(유형)','D'),
      _sortBtn('capex_intangible','CapEx(무형)','D'),
      _sortBtn('capex_total','CapEx합계','C'),
      _sortBtn('depreciation','감가상각비','D'),
      _sortBtn('amortization','무형상각비','D'),
      _sortBtn('da','D&A','C'),
      _sortBtn('ebitda','EBITDA','C'),
      // 파생비율 (계산)
      _sortBtn('gross_margin','GPM','C'),
      _sortBtn('operating_margin','OPM','C'),
      _sortBtn('net_margin','NPM','C'),
      _sortBtn('cogs_ratio','매출원가율','C'),
      _sortBtn('sga_ratio','판관비율','C'),
      _sortBtn('debt_ratio','부채비율','C'),
      _sortBtn('current_ratio','유동비율','C'),
      _sortBtn('roe','ROE','C'),
      _sortBtn('roa','ROA','C'),
      _sortBtn('fcf','FCF','C'),
    ],
    rowTemplate: r => {
      // 재무 손익 색상: 이익=초록, 손실=빨강 (주가 등락 색상과 구분)
      const _finC = v => v > 0 ? 'var(--green)' : v < 0 ? 'var(--red)' : '';
      const opC    = _finC(r.operating_profit||0);
      const niC    = _finC(r.net_income||0);
      const fcfC   = _finC(r.fcf||0);
      const ocfC   = _finC(r.operating_cashflow||0);
      const ebitdaC= _finC(r.ebitda||0);
      return `<tr>
        <td class="stock-row" style="font-weight:500;color:var(--tg);white-space:nowrap"
          data-stock-open="${r.stock_code}" data-stock-name="${escAttr(r.corp_name||'')}" data-stock-tab="financial">${r.corp_name}</td>
        <td style="font-size:11px;color:var(--text2);font-family:monospace">${r.stock_code}</td>
        <td style="font-size:11px;color:var(--text2)">${r.bsns_year||'—'}</td>
        <td style="font-size:11px;color:var(--text2)">${r.quarter||'—'}</td>
        <td style="font-size:10px">${r.fs_div==='CFS'?'연결':'별도'}</td>
        <td>${cap(r.revenue)}</td>
        <td>${cap(r.gross_profit)}</td>
        <td>${cap(r.cogs)}</td>
        <td>${cap(r.sga)}</td>
        <td>${cap(r.rd_expense)}</td>
        <td style="color:${opC};font-weight:500">${cap(r.operating_profit)}</td>
        <td>${cap(r.other_operating_income)}</td>
        <td>${cap(r.other_operating_expense)}</td>
        <td>${cap(r.pretax_income)}</td>
        <td style="color:${niC};font-weight:500">${cap(r.net_income)}</td>
        <td>${cap(r.total_assets)}</td>
        <td>${cap(r.total_liabilities)}</td>
        <td>${cap(r.total_equity)}</td>
        <td>${cap(r.current_assets)}</td>
        <td>${cap(r.current_liabilities)}</td>
        <td>${cap(r.non_current_assets)}</td>
        <td>${cap(r.capital_stock)}</td>
        <td>${cap(r.retained_earnings)}</td>
        <td style="color:${ocfC}">${cap(r.operating_cashflow)}</td>
        <td>${cap(r.investing_cashflow)}</td>
        <td>${cap(r.financing_cashflow)}</td>
        <td>${cap(r.capex)}</td>
        <td>${cap(r.capex_intangible)}</td>
        <td>${cap(r.capex_total)}</td>
        <td>${cap(r.depreciation)}</td>
        <td>${cap(r.amortization)}</td>
        <td>${cap(r.da)}</td>
        <td style="color:${ebitdaC};font-weight:500">${cap(r.ebitda)}</td>
        <td style="font-size:11px">${pct(r.gross_margin)}</td>
        <td style="font-size:11px">${pct(r.operating_margin)}</td>
        <td style="font-size:11px">${pct(r.net_margin)}</td>
        <td style="font-size:11px">${pct(r.cogs_ratio)}</td>
        <td style="font-size:11px">${pct(r.sga_ratio)}</td>
        <td style="font-size:11px">${pct(r.debt_ratio)}</td>
        <td style="font-size:11px">${pct(r.current_ratio)}</td>
        <td style="font-size:11px">${pct(r.roe)}</td>
        <td style="font-size:11px">${pct(r.roa)}</td>
        <td style="color:${fcfC};font-weight:500">${cap(r.fcf)}</td>
      </tr>`;
    },
  });
}



// ══════════════════════════════════════════
//  📊 종목 상세 통합 모달 — 펀드매니저 뷰
// ══════════════════════════════════════════
async function openStockDetail(code, name, initTab = 'overview') {
  const _canEditSD = typeof canEdit === 'function' ? canEdit() : true;
  const _sdSafeName = escJsStr(name || '');
  document.getElementById('m-stock-detail')?.remove();
  const modal = document.createElement('div');
  modal.id = 'm-stock-detail';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9999;display:flex;align-items:center;justify-content:center;padding:12px;backdrop-filter:blur(3px)';

  modal.innerHTML = `
    <div style="background:var(--bg2);border-radius:14px;width:100%;max-width:1100px;
      height:90vh;overflow:hidden;display:flex;flex-direction:column;
      box-shadow:0 16px 64px rgba(0,0,0,.7);border:1px solid var(--border2)">

      <!-- 헤더 -->
      <div style="padding:14px 20px 10px;border-bottom:1px solid var(--border);flex-shrink:0;
        background:linear-gradient(135deg,var(--bg2) 0%,var(--bg3) 100%)">
        <div style="display:flex;align-items:flex-start;justify-content:space-between">
          <div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
              <span style="font-size:20px;font-weight:700">${escapeHtml(name)}</span>
              <span style="font-size:11px;color:var(--text2);padding:2px 7px;background:var(--bg3);
                border-radius:4px;border:1px solid var(--border);font-family:monospace">${escapeHtml(code)}</span>
              <span id="sd-industry-badge" style="font-size:11px;color:var(--tg)"></span>
            </div>
            <div id="sd-sub-info" style="font-size:11px;color:var(--text2)"></div>
          </div>
          <div style="display:flex;align-items:center;gap:12px">
            <div id="sd-price-badge" style="text-align:right"></div>
            ${_canEditSD ? `<button onclick="document.getElementById('m-stock-detail').remove();openReportFor('${code}','${_sdSafeName}')"
              style="background:var(--bg3);border:1px solid var(--border);cursor:pointer;color:var(--tg);
                font-size:12px;font-weight:600;padding:6px 12px;line-height:1;border-radius:6px;transition:.15s;white-space:nowrap"
              title="종목 리포트 전체 보기">전체 리포트 →</button>
            <button id="sd-watch-btn" onclick="window.sdToggleWatch('${code}','${_sdSafeName}')"
              style="background:var(--bg3);border:1px solid var(--border);cursor:pointer;color:var(--text1);
                font-size:12px;font-weight:600;padding:6px 12px;line-height:1;border-radius:6px;transition:.15s;white-space:nowrap"
              title="관심종목 추가/해제">⭐ 관심</button>` : ''}
            <button onclick="document.getElementById('m-stock-detail').remove()"
              style="background:var(--bg3);border:1px solid var(--border);cursor:pointer;
                color:var(--text2);font-size:18px;padding:2px 8px;line-height:1;
                border-radius:6px;transition:.15s" onmouseover="this.style.color='var(--text)'"
              onmouseout="this.style.color='var(--text3)'">×</button>
          </div>
        </div>
      </div>

      <!-- 탭 -->
      <div style="display:flex;border-bottom:1px solid var(--border);flex-shrink:0;padding:0 20px;
        background:var(--bg2);overflow-x:auto;scrollbar-width:none">
        ${[
          ['overview',  '📋', '종합'],
          ['market',    '📊', '시장 데이터'],
          ['financial', '💰', '재무제표'],
          ['supply',    '🔄', '수급'],
          ['opinion',   '🎯', '증권사 의견'],
        ].map(([id, ic, lb]) => `
          <button id="sd-tab-${id}" onclick="window.sdSwitchTab('${id}')"
            style="background:none;border:none;border-bottom:2px solid transparent;
              padding:10px 16px;cursor:pointer;font-size:13px;font-weight:600;
              color:var(--text2);white-space:nowrap;transition:.15s;flex-shrink:0">
            ${ic} ${lb}
          </button>`).join('')}
      </div>

      <!-- 콘텐츠 -->
      <div id="sd-body" style="overflow-y:auto;padding:20px;flex:1;min-height:0">
        <div style="text-align:center;color:var(--text2);padding:60px">
          <span class="loading"></span> 로딩 중...
        </div>
      </div>
    </div>`;

  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);

  // 기본 정보 로드
  FIN.sdCode = code; FIN.sdName = name;
  try {
    const { data: ci } = await sb.from('companies')
      .select('industry,sub_industry,market')
      .or(`code.eq.${code},code.eq.${code}.KS,code.eq.${code}.KQ`)
      .limit(1).single();
    if (ci) {
      const ib = document.getElementById('sd-industry-badge');
      const si = document.getElementById('sd-sub-info');
      if (ib) ib.textContent = ci.industry || '';
      if (si) si.textContent = [ci.sub_industry, ci.market].filter(Boolean).join(' · ');
    }
  } catch(e) {}

  // 관심종목 등록 여부 반영 (버튼 토글 상태)
  if (_canEditSD) _sdCheckWatch(code);

  // 최신 시세로 헤더 가격 업데이트
  try {
    const { data: lp } = await sb.from('market_data')
      .select('price,price_change_rate,price_change,base_date')
      .eq('stock_code', code)
      .order('base_date', { ascending: false }).limit(1).single();
    if (lp) {
      const pb = document.getElementById('sd-price-badge');
      if (pb) {
        const cc = chgColor(lp.price_change_rate);
        pb.innerHTML =
          `<div style="font-size:24px;font-weight:700">${lp.price?.toLocaleString()}원</div>` +
          `<div style="display:flex;gap:6px;justify-content:flex-end;margin-top:2px">` +
            `<span style="color:${cc};font-weight:700;font-size:14px">${chgStr(lp.price_change_rate)}</span>` +
            (lp.price_change != null ? `<span style="color:${cc};font-size:12px">${lp.price_change>0?'+':''}${lp.price_change?.toLocaleString()}원</span>` : '') +
            `<span style="color:var(--text2);font-size:11px">${lp.base_date}</span>` +
          `</div>`;
      }
    }
  } catch(e) {}

  window.sdSwitchTab = async (tab) => {
    ['overview','market','financial','supply','opinion'].forEach(t => {
      const btn = document.getElementById('sd-tab-'+t);
      if (btn) {
        btn.style.color = t===tab ? 'var(--tg)' : 'var(--text3)';
        btn.style.borderBottomColor = t===tab ? 'var(--tg)' : 'transparent';
      }
    });
    const body = document.getElementById('sd-body');
    if (!body) return;
    body.innerHTML = '<div style="text-align:center;color:var(--text2);padding:60px"><span class="loading"></span></div>';
    const fns = {
      overview:  _sdOverview,
      market:    _sdMarket,
      financial: _sdFinancial,
      supply:    _sdSupply,
      opinion:   _sdOpinion,
    };
    if (fns[tab]) await fns[tab](body, code, name);
  };

  await window.sdSwitchTab(initTab);
}

async function openFinTrend(code, name)     { openStockDetail(code, name, 'financial'); }
async function openMarketDetail(code, name) { openStockDetail(code, name, 'market'); }

// ── 상세 모달 → 관심종목(워치리스트) 토글 ────────────────────────────────────
// 버튼 상태 반영: 'in'(등록됨, ✓) / 'out'(미등록, ⭐)
function _sdSetWatchBtn(state) {
  const btn = document.getElementById('sd-watch-btn');
  if (!btn) return;
  btn.disabled = false;
  if (state === 'in') {
    btn.textContent      = '✓ 관심';
    btn.style.color      = 'var(--tg)';
    btn.style.borderColor = 'var(--tg)';
    btn.onmouseover = function(){ this.style.borderColor = 'var(--red)'; };
    btn.onmouseout  = function(){ this.style.borderColor = 'var(--tg)';  };
    btn.title = '관심 해제';
  } else {
    btn.textContent      = '⭐ 관심';
    btn.style.color      = 'var(--text1)';
    btn.style.borderColor = 'var(--border)';
    btn.onmouseover = function(){ this.style.borderColor = 'var(--tg)';    };
    btn.onmouseout  = function(){ this.style.borderColor = 'var(--border)'; };
    btn.title = '관심종목에 추가';
  }
}

// 현재 등록 여부 조회 → 버튼 상태 반영 (모달 오픈 시)
async function _sdCheckWatch(code) {
  const bare = String(code).replace(/\.(KS|KQ)$/, '');
  try {
    const { data } = await sb.from('watchlist')
      .select('id')
      .or(`stock_code.eq.${bare},stock_code.eq.${bare}.KS,stock_code.eq.${bare}.KQ`)
      .limit(1);
    _sdSetWatchBtn(data && data.length ? 'in' : 'out');
  } catch(e) { /* 조회 실패 시 기본(⭐) 유지 */ }
}

// 토글: 미등록→추가('관심'), 등록→해제(단, 보유/노트 보호)
window.sdToggleWatch = async function(code, name) {
  if (typeof canEdit === 'function' && !canEdit()) {
    if (typeof toast === 'function') toast('권한이 없습니다.', 'error');
    return;
  }
  const bare = String(code).replace(/\.(KS|KQ)$/, '');
  try {
    const { data } = await sb.from('watchlist')
      .select('id,group_name,quantity,thesis_1,catalyst,target_price,watch_price,risk_1')
      .or(`stock_code.eq.${bare},stock_code.eq.${bare}.KS,stock_code.eq.${bare}.KQ`)
      .limit(1);
    const row = data && data[0];

    if (!row) {
      // ── 추가 ──
      const ind = document.getElementById('sd-industry-badge')?.textContent?.trim() || null;
      const { error } = await sb.from('watchlist').insert({
        stock_code: bare,
        corp_name:  name,
        industry:   ind || null,
        group_name: '관심',
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      _sdSetWatchBtn('in');
      if (typeof toast === 'function') toast('⭐ 관심종목에 추가했습니다.', 'success');
    } else {
      // ── 해제 ── 보유 포지션은 거래기록 꼬임 방지 위해 차단
      const isPosition = row.group_name === '보유중' || (row.quantity && row.quantity > 0);
      if (isPosition) {
        if (typeof toast === 'function') toast('보유 종목입니다 — 투자노트에서 관리하세요. (여기서 해제 불가)', 'info');
        _sdSetWatchBtn('in');
        return;
      }
      // 메모가 있는 관심/후보는 실수 삭제 방지 위해 확인
      const hasNotes = row.thesis_1 || row.catalyst || row.target_price || row.watch_price || row.risk_1;
      if (hasNotes && !confirm(`'${name}'에 작성한 투자노트(근거·목표가 등)가 함께 삭제됩니다. 관심에서 제거할까요?`)) {
        _sdSetWatchBtn('in');
        return;
      }
      const { error } = await sb.from('watchlist').delete().eq('id', row.id);
      if (error) throw error;
      _sdSetWatchBtn('out');
      if (typeof toast === 'function') toast('관심종목에서 제거했습니다.', 'success');
    }
    // 워치리스트 화면이 떠 있으면 갱신
    if (typeof loadWatchlist === 'function' && document.getElementById('wl-body')) loadWatchlist();
  } catch(e) {
    console.error('[sdToggleWatch]', e);
    if (typeof toast === 'function') toast('처리 실패: ' + e.message, 'error');
  }
};

// ─────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────
const _row2 = (label, val, color='') =>
  `<div style="display:flex;justify-content:space-between;align-items:center;
    padding:5px 0;border-bottom:1px solid var(--border)">
    <span style="font-size:12px;color:var(--text)">${label}</span>
    <span style="font-size:13px;font-weight:600;color:${color||'var(--text1)'}">${val}</span>
  </div>`;

const _sec = (title, content, accent='var(--tg)') =>
  `<div style="background:var(--bg3);border-radius:10px;padding:14px 16px;
    border:1px solid var(--border);border-top:2px solid ${accent}">
    <div style="font-size:11px;font-weight:700;color:var(--text1);
      letter-spacing:.6px;margin-bottom:10px">${title}</div>
    ${content}
  </div>`;

const _pct = v => v != null ? v.toFixed(1)+'%' : '—';
const _num = v => v != null ? v.toLocaleString() : '—';
const _cap = v => v != null ? fmtCap(v) : '—';
const _won = fmtPrice;  // config.js 전역 헬퍼 — 동일 동작

function _w52bar(r) {
  const hi = r.w52_high||0, lo = r.w52_low||0, cur = r.price||0;
  const pct = hi>lo ? Math.round((cur-lo)/(hi-lo)*100) : 50;
  const c = pct>=80?'var(--red)':pct<=20?'var(--blue)':'var(--tg)';
  return `
    <div style="margin:8px 0 4px">
      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text1);margin-bottom:4px">
        <span>저 ${_won(lo)}</span>
        <span style="color:${c};font-weight:700">현재 ${pct}%</span>
        <span>고 ${_won(hi)}</span>
      </div>
      <div style="height:5px;background:var(--border);border-radius:3px;position:relative">
        <div style="position:absolute;left:0;width:${pct}%;height:100%;
          background:${c};border-radius:3px;opacity:.5"></div>
        <div style="position:absolute;left:${pct}%;transform:translateX(-50%);
          width:11px;height:11px;background:${c};border:2px solid var(--bg2);
          border-radius:50%;top:-3px"></div>
      </div>
    </div>`;
}

function _retStr(hist, days) {
  if (!hist || hist.length <= days) return '—';
  const sorted = [...hist].sort((a,b)=>a.base_date.localeCompare(b.base_date));
  const cur  = sorted[sorted.length-1]?.price;
  const past = sorted[Math.max(0, sorted.length-1-days)]?.price;
  if (!cur || !past) return '—';
  const ret = ((cur-past)/past*100).toFixed(2);
  return `<span style="color:${ret>=0?'var(--red)':'var(--blue)'}">${ret>=0?'+':''}${ret}%</span>`;
}

// ─────────────────────────────────────────
// 탭1: 종합 Overview
// ─────────────────────────────────────────
async function _sdOverview(body, code, name) {
  try {
    const [
      { data: md },
      { data: fins },
      { data: opinions },
      { data: hist90 },
    ] = await Promise.all([
      sb.from('market_data').select('*').eq('stock_code', code)
        .order('base_date', { ascending:false }).limit(1).single(),
      sb.from('financials').select('bsns_year,quarter,revenue,operating_profit,net_income,operating_margin,net_margin,roe,roa,debt_ratio,total_assets,total_equity,operating_cashflow,fcf,fcf_direct,fcf_indirect,capex,capex_intangible,capex_total,depreciation,amortization,da,ebitda')
        .eq('stock_code', code).eq('fs_div','CFS')
        .order('bsns_year',{ascending:false}).order('quarter',{ascending:false}).limit(8),
      sb.from('analyst_opinions').select('firm_name,opinion,target_price,gap_rate,opinion_date')
        .eq('stock_code', code).in('opinion_code',['1','2'])
        .order('opinion_date',{ascending:false}).limit(10),
      sb.from('market_data').select('base_date,price,price_change_rate,volume,foreign_net_buy')
        .eq('stock_code', code).order('base_date',{ascending:false}).limit(90),
    ]);

    const r = md || {};
    const latestFin = fins?.[0] || {};
    const prevFin   = fins?.[1] || {};

    // 컨센서스
    const tgPrices = (opinions||[]).map(o=>o.target_price).filter(v=>v>0);
    const avgTarget = tgPrices.length ? Math.round(tgPrices.reduce((a,b)=>a+b,0)/tgPrices.length) : null;
    const upside = avgTarget && r.price ? ((avgTarget-r.price)/r.price*100).toFixed(1) : null;
    const buyCount = (opinions||[]).length;

    // QoQ 영업이익 성장
    const qoqOp = latestFin.operating_profit && prevFin.operating_profit
      ? ((latestFin.operating_profit-prevFin.operating_profit)/Math.abs(prevFin.operating_profit)*100).toFixed(1)
      : null;

    const signalItems = [];
    if (r.hgpr_cls) signalItems.push(`<span style="background:rgba(42,171,238,.15);color:var(--tg);padding:2px 8px;border-radius:4px;font-size:11px">📈 ${r.hgpr_cls}</span>`);
    if (r.is_caution) signalItems.push(`<span style="background:rgba(245,54,92,.15);color:var(--red);padding:2px 8px;border-radius:4px;font-size:11px">⚠️ 투자유의</span>`);
    if (r.manage_issue_code && r.manage_issue_code!=='0') signalItems.push(`<span style="background:rgba(245,54,92,.2);color:var(--red);padding:2px 8px;border-radius:4px;font-size:11px">🚨 관리종목</span>`);
    if (r.is_short_over) signalItems.push(`<span style="background:rgba(251,99,64,.15);color:var(--yellow);padding:2px 8px;border-radius:4px;font-size:11px">🔥 단기과열</span>`);
    if (upside > 0) signalItems.push(`<span style="background:rgba(45,206,137,.12);color:var(--green);padding:2px 8px;border-radius:4px;font-size:11px">🎯 목표가 +${upside}%</span>`);

    body.innerHTML = `
      <!-- 시그널 배지 -->
      ${signalItems.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">${signalItems.join('')}</div>` : ''}

      <!-- 핵심 지표 5개 KPI -->
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:14px">
        ${[
          ['시가총액', _cap(r.market_cap), 'var(--tg)'],
          ['PER / PBR', `${r.per!=null&&r.per!==0?r.per.toFixed(1):'—'}배 / ${r.pbr!=null&&r.pbr!==0?r.pbr.toFixed(2):'—'}배`, ''],
          ['영업이익률', _pct(latestFin.operating_margin), latestFin.operating_margin>=15?'var(--green)':latestFin.operating_margin>=0?'var(--text1)':'var(--red)'],
          ['ROE', _pct(latestFin.roe), latestFin.roe>=15?'var(--green)':latestFin.roe>=0?'var(--text1)':'var(--red)'],
          ['외국인 보유율', r.foreign_hold_rate!=null?r.foreign_hold_rate.toFixed(1)+'%':'—', ''],
        ].map(([lb,v,c])=>`
          <div style="background:var(--bg3);border-radius:8px;padding:12px 14px;border:1px solid var(--border);text-align:center">
            <div style="font-size:11px;color:var(--text1);margin-bottom:6px">${lb}</div>
            <div style="font-size:16px;font-weight:700;color:${c||'var(--text1)'}">${v}</div>
          </div>`).join('')}
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:14px">
        <!-- 가격 범위 -->
        ${_sec('가격 범위 · 수익률', `
          ${_w52bar(r)}
          ${_row2('52주 고가', _won(r.w52_high), 'var(--red)')}
          ${_row2('52주 저가', _won(r.w52_low), 'var(--blue)')}
          <div style="height:8px"></div>
          ${_row2('1주 수익률',  _retStr(hist90, 5))}
          ${_row2('1달 수익률',  _retStr(hist90, 21))}
          ${_row2('3달 수익률',  _retStr(hist90, 63))}
        `, 'var(--tg)')}

        <!-- 최근 실적 -->
        ${_sec(`최근 실적 (${latestFin.bsns_year||'—'} ${latestFin.quarter||'—'})`, `
          ${_row2('매출액', _cap(latestFin.revenue))}
          ${_row2('영업이익', _cap(latestFin.operating_profit), (latestFin.operating_profit||0)>0?'var(--green)':(latestFin.operating_profit||0)<0?'var(--red)':'')}
          ${_row2('영업이익률', _pct(latestFin.operating_margin), (latestFin.operating_margin||0)>=10?'var(--green)':'var(--text1)')}
          ${_row2('순이익', _cap(latestFin.net_income), (latestFin.net_income||0)>0?'var(--red)':'var(--blue)')}
          ${_row2('FCF', _cap(latestFin.fcf), (latestFin.fcf||0)>0?'var(--green)':'var(--red)')}
          ${latestFin.ebitda!=null?_row2('EBITDA', _cap(latestFin.ebitda), (latestFin.ebitda||0)>0?'var(--red)':'var(--blue)'):''}
          ${qoqOp != null ? _row2('QoQ 영업이익', `<span style="color:${qoqOp>=0?'var(--red)':'var(--blue)'}">${qoqOp>=0?'+':''}${qoqOp}%</span>`) : ''}
          ${_row2('ROE', _pct(latestFin.roe))}
          ${_row2('부채비율', _pct(latestFin.debt_ratio))}
        `, 'var(--green)')}

        <!-- 증권사 컨센서스 -->
        ${_sec('증권사 컨센서스', `
          ${avgTarget ? `
            <div style="text-align:center;margin-bottom:10px">
              <div style="font-size:11px;color:var(--text1);margin-bottom:2px">평균 목표주가</div>
              <div style="font-size:22px;font-weight:700;color:var(--text1)">${avgTarget.toLocaleString()}원</div>
              ${upside != null ? `<div style="font-size:14px;color:${upside>=0?'var(--green)':'var(--red)'};font-weight:600">현재가 대비 ${upside>=0?'+':''}${upside}%</div>` : ''}
            </div>` : '<div style="color:var(--text2);font-size:12px;padding:8px 0">컨센서스 없음</div>'}
          ${_row2('커버리지', `${buyCount}개 증권사`)}
          ${(opinions||[]).slice(0,4).map(o=>
            `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);font-size:12px">
              <span style="color:var(--text1)">${o.firm_name}</span>
              <span style="color:${o.opinion?.includes('매수')||o.opinion==='BUY'?'var(--red)':'var(--text2)'}">
                ${o.opinion} ${o.target_price?o.target_price.toLocaleString()+'원':''}
              </span>
            </div>`).join('')}
        `, 'var(--yellow)')}
      </div>`;
  } catch(e) {
    body.innerHTML = `<div style="color:var(--red);padding:20px">오류: ${e.message}</div>`;
  }
}

// ─────────────────────────────────────────
// 탭2: 시장 데이터 (전체 필드)
// ─────────────────────────────────────────
async function _sdMarket(body, code, name) {
  try {
    const { data: r } = await sb.from('market_data')
      .select('*').eq('stock_code', code)
      .order('base_date', { ascending:false }).limit(1).single();
    const { data: hist } = await sb.from('market_data')
      .select('base_date,price,price_change_rate,market_cap,volume,trading_value,per,pbr,foreign_net_buy,foreign_hold_rate,program_net_buy,short_sell_qty')
      .eq('stock_code', code)
      .order('base_date', { ascending:false }).limit(90);

    if (!r) { body.innerHTML='<div style="color:var(--text2);padding:40px;text-align:center">데이터 없음</div>'; return; }

    const sorted = (hist||[]).slice().reverse();

    body.innerHTML = `
      <!-- 3종 차트 -->
      <div style="background:var(--bg3);border-radius:10px;border:1px solid var(--border);
        padding:14px 16px;margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;color:var(--text1);letter-spacing:.6px;margin-bottom:10px">
          주가 · 거래량 · 외국인 지분율
        </div>
        <div style="display:grid;grid-template-columns:1fr;gap:8px">
          <div>
            <div style="font-size:10px;color:var(--tg);margin-bottom:3px;font-weight:600">주가 (원)</div>
            <div style="position:relative;height:130px"><canvas id="sd-chart-price"></canvas></div>
          </div>
          <div>
            <div style="font-size:10px;color:var(--green);margin-bottom:3px;font-weight:600">거래량</div>
            <div style="position:relative;height:80px"><canvas id="sd-chart-volume"></canvas></div>
          </div>
          <div>
            <div style="font-size:10px;color:var(--yellow);margin-bottom:3px;font-weight:600">외국인 보유율 (%)</div>
            <div style="position:relative;height:80px"><canvas id="sd-chart-foreign"></canvas></div>
          </div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-bottom:16px">
        ${_sec('VALUATION', `
          ${_row2('시가총액', _cap(r.market_cap))}
          ${_row2('PER', r.per&&r.per!==0?r.per.toFixed(1)+'배':'—')}
          ${_row2('PBR', r.pbr&&r.pbr!==0?r.pbr.toFixed(2)+'배':'—')}
          ${_row2('EPS', _won(r.eps))}
          ${_row2('BPS', _won(r.bps))}
          ${_row2('결산월', r.fiscal_month?r.fiscal_month+'월':'—')}
        `)}
        ${_sec('가격 · 거래', `
          ${_row2('현재가', _won(r.price))}
          ${r.open_price  ? _row2('시가',    _won(r.open_price)) : ''}
          ${r.high_price  ? _row2('고가',    _won(r.high_price), 'var(--red)') : ''}
          ${r.low_price   ? _row2('저가',    _won(r.low_price),  'var(--blue)') : ''}
          ${r.base_price  ? _row2('기준가',  _won(r.base_price)) : ''}
          ${r.limit_high  ? _row2('상한가',  _won(r.limit_high), 'var(--red)') : ''}
          ${r.limit_low   ? _row2('하한가',  _won(r.limit_low),  'var(--blue)') : ''}
          ${r.vwap        ? _row2('VWAP',    _won(r.vwap)) : ''}
          ${_row2('거래량', _num(r.volume))}
          ${_row2('거래대금', _cap(r.trading_value))}
          ${r.vol_turnover ? _row2('거래회전율', _pct(r.vol_turnover)) : ''}
        `)}
        ${_sec('52주 · 수익률', `
          ${_w52bar(r)}
          ${_row2('52주 고가', _won(r.w52_high), 'var(--red)')}
          ${_row2('52주 저가', _won(r.w52_low), 'var(--blue)')}
          ${_row2('52주 고가일', r.w52_high_date||'—')}
          ${_row2('52주 고가대비', _pct(r.price && r.w52_high ? (r.price - r.w52_high) / r.w52_high * 100 : null))}
          ${_row2('52주 저가대비', _pct(r.price && r.w52_low  ? (r.price - r.w52_low)  / r.w52_low  * 100 : null))}
          ${_row2('1주 수익률', _retStr(hist,5))}
          ${_row2('1달 수익률', _retStr(hist,21))}
          ${_row2('3달 수익률', _retStr(hist,63))}
        `)}
        ${_sec('종목 상태', `
          ${_row2('시장경고', r.market_warn_code&&r.market_warn_code!=='00'?`<span style="color:var(--yellow)">${{'01':'주의','02':'경고','03':'위험예고','04':'위험'}[r.market_warn_code]||r.market_warn_code}</span>`:'정상')}
          ${r.manage_issue_code&&r.manage_issue_code!=='0'?_row2('관리종목','<span style="color:var(--red)">지정</span>'):''}
          ${r.is_short_over ?_row2('단기과열','<span style="color:var(--yellow)">예</span>'):''}
          ${r.is_liquidation?_row2('정리매매','<span style="color:var(--red)">예</span>'):''}
          ${r.hgpr_cls      ?_row2('신고가구분', r.hgpr_cls):''}
          ${_row2('상장주수', _num(r.listing_shares)+'주')}
          ${_row2('시장', r.market||'—')}
        `)}
      </div>
      <div style="font-size:11px;font-weight:700;color:var(--text1);letter-spacing:.6px;margin-bottom:8px">
        최근 시장 데이터 (${sorted.length}일)
      </div>
      <div class="table-wrap"><table>
        <thead><tr>
          <th>기준일</th><th style="text-align:right">종가</th><th style="text-align:right">등락률</th>
          <th style="text-align:right">시가총액</th><th style="text-align:right">거래량</th>
          <th style="text-align:right">거래대금</th><th style="text-align:right">외국인순매수</th>
          <th style="text-align:right">외국인보유율</th><th style="text-align:right">PER</th><th style="text-align:right">PBR</th>
        </tr></thead>
        <tbody>${sorted.slice().reverse().map(h=>{
          const hc = h.price_change_rate;
          return `<tr>
            <td style="font-size:11px;color:var(--text2)">${h.base_date}</td>
            <td style="text-align:right;font-weight:600">${fmtPrice(h.price)}</td>
            <td style="text-align:right;color:${chgColor(hc)};font-weight:600">${chgStr(hc)}</td>
            <td style="text-align:right;color:var(--text1)">${h.market_cap?_cap(h.market_cap):'—'}</td>
            <td style="text-align:right;color:var(--text1)">${h.volume?h.volume.toLocaleString():'—'}</td>
            <td style="text-align:right;color:var(--text1)">${h.trading_value?_cap(h.trading_value):'—'}</td>
            <td style="text-align:right;color:${(h.foreign_net_buy||0)<0?'var(--blue)':'var(--red)'}">
              ${h.foreign_net_buy!=null?h.foreign_net_buy.toLocaleString():'—'}
            </td>
            <td style="text-align:right;color:var(--text1)">${h.foreign_hold_rate!=null?h.foreign_hold_rate.toFixed(1)+'%':'—'}</td>
            <td style="text-align:right;color:var(--text1)">${h.per&&h.per!==0?h.per.toFixed(1):'—'}</td>
            <td style="text-align:right;color:var(--text1)">${h.pbr&&h.pbr!==0?h.pbr.toFixed(2):'—'}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>`;

    // 3종 차트 초기화
    const _sdChartOpts = (fmt, tickLimit=8) => ({
      responsive:true, maintainAspectRatio:false, animation:false,
      plugins:{ legend:{display:false}, tooltip:{callbacks:{label:ctx=>fmt(ctx.raw)}} },
      scales:{
        x:{ grid:{color:'rgba(255,255,255,.03)'}, ticks:{color:'rgba(255,255,255,.25)',maxTicksLimit:tickLimit,font:{size:9}} },
        y:{ grid:{color:'rgba(255,255,255,.03)'}, ticks:{color:'rgba(255,255,255,.25)',font:{size:9},callback:v=>fmt(v)} },
      },
    });
    const _makeChart = (id, type, data, color, fill, fmt) => {
      const canvas = document.getElementById(id);
      if (!canvas || !window.Chart) return;
      return new window.Chart(canvas.getContext('2d'), {
        type,
        data:{ labels: sorted.map(r=>r.base_date.slice(5)), datasets:[{
          data, borderColor: Array.isArray(color)?undefined:color,
          backgroundColor: type==='bar'?color:fill,
          borderWidth: type==='line'?2:0, pointRadius:0, tension:0.3,
          fill: fill!==false,
        }]},
        options: _sdChartOpts(fmt),
      });
    };
    setTimeout(() => {
      _makeChart('sd-chart-price',
        'line',
        sorted.map(r=>r.price),
        'rgba(42,171,238,.9)', 'rgba(42,171,238,.07)',
        v => v!=null?v.toLocaleString()+'원':''
      );
      _makeChart('sd-chart-volume',
        'bar',
        sorted.map(r=>r.volume),
        sorted.map(r=>(r.volume||0)>0?'rgba(45,206,137,.65)':'rgba(255,255,255,.1)'),
        false,
        v => v!=null?(v/10000).toFixed(0)+'만':''
      );
      _makeChart('sd-chart-foreign',
        'line',
        sorted.map(r=>r.foreign_hold_rate),
        'rgba(251,99,64,.9)', 'rgba(251,99,64,.07)',
        v => v!=null?v.toFixed(1)+'%':''
      );
    }, 50);
  } catch(e) { body.innerHTML=`<div style="color:var(--red);padding:20px">오류: ${e.message}</div>`; }
}

// ─────────────────────────────────────────
// 탭3: 재무제표 (기존 차트 포함)
// ─────────────────────────────────────────
async function _sdFinancial(body, code, name) {
  await _renderFinancialTab(body, code, name);
}

// ─────────────────────────────────────────
// 탭4: 수급 상세
// ─────────────────────────────────────────
async function _sdSupply(body, code, name) {
  try {
    const { data: hist } = await sb.from('market_data')
      .select('base_date,price,price_change_rate,foreign_net_buy,foreign_hold_rate,foreign_hold_qty,program_net_buy,short_sell_qty,loan_balance_rate,volume,trading_value')
      .eq('stock_code', code)
      .order('base_date', { ascending:false }).limit(30);

    const { data: latest } = await sb.from('market_data')
      .select('foreign_hold_rate,foreign_hold_qty,foreign_net_buy,program_net_buy,short_sell_qty,loan_balance_rate,volume,trading_value,listing_shares')
      .eq('stock_code', code)
      .order('base_date',{ascending:false}).limit(1).single();

    const r = latest || {};
    const rows = (hist||[]).slice().reverse();

    // 외국인 누적 (최근 5일/10일/20일)
    const fNet = (days) => {
      const sl = rows.slice(-days);
      const sum = sl.reduce((a,h)=>a+(h.foreign_net_buy||0),0);
      return `<span style="color:${sum>=0?'var(--red)':'var(--blue)'}">${sum>=0?'+':''}${sum.toLocaleString()}</span>`;
    };

    body.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px">
        ${_sec('외국인 수급', `
          ${_row2('보유율', r.foreign_hold_rate!=null?r.foreign_hold_rate.toFixed(2)+'%':'—')}
          ${_row2('보유수량', r.foreign_hold_qty!=null?_num(r.foreign_hold_qty)+'주':'—')}
          ${_row2('당일 순매수', r.foreign_net_buy!=null?`<span style="color:${(r.foreign_net_buy||0)>=0?'var(--red)':'var(--blue)'}">
            ${r.foreign_net_buy.toLocaleString()}주</span>`:'—')}
          ${_row2('5일 누적', fNet(5)+'주')}
          ${_row2('10일 누적', fNet(10)+'주')}
          ${_row2('20일 누적', fNet(20)+'주')}
        `, 'var(--tg)')}
        ${_sec('프로그램 · 공매도', `
          ${_row2('프로그램 순매수', r.program_net_buy!=null?`<span style="color:${(r.program_net_buy||0)>=0?'var(--red)':'var(--blue)'}">
            ${_num(r.program_net_buy)}주</span>`:'—')}
          ${_row2('공매도 체결수량', r.short_sell_qty!=null?_num(r.short_sell_qty)+'주':'—')}
          ${_row2('융자잔고율', r.loan_balance_rate!=null?r.loan_balance_rate.toFixed(2)+'%':'—')}
        `, 'var(--yellow)')}
        ${_sec('거래 강도', `
          ${_row2('거래량', _num(r.volume))}
          ${_row2('거래대금', _cap(r.trading_value))}
          ${_row2('상장주수', r.listing_shares?_num(r.listing_shares)+'주':'—')}
          ${r.listing_shares&&r.volume?_row2('일 회전율', (r.volume/r.listing_shares*100).toFixed(3)+'%'):''}
        `, 'var(--green)')}
      </div>
      <div style="font-size:11px;font-weight:700;color:var(--text1);letter-spacing:.6px;margin-bottom:8px">최근 30일 수급 추이</div>
      <div class="table-wrap"><table>
        <thead><tr>
          <th>기준일</th><th style="text-align:right">종가</th><th style="text-align:right">등락률</th>
          <th style="text-align:right">외국인순매수</th><th style="text-align:right">외국인보유율</th>
          <th style="text-align:right">프로그램순매수</th><th style="text-align:right">공매도</th>
          <th style="text-align:right">융자잔고율</th>
        </tr></thead>
        <tbody>${rows.slice().reverse().map(h=>{
          const hc = h.price_change_rate;
          return `<tr>
            <td style="font-size:11px;color:var(--text2)">${h.base_date}</td>
            <td style="text-align:right;font-weight:600">${fmtPrice(h.price)}</td>
            <td style="text-align:right;color:${chgColor(hc)};font-weight:600">${chgStr(hc)}</td>
            <td style="text-align:right;color:${(h.foreign_net_buy||0)<0?'var(--blue)':'var(--red)'}">
              ${h.foreign_net_buy!=null?h.foreign_net_buy.toLocaleString():'—'}
            </td>
            <td style="text-align:right">${h.foreign_hold_rate!=null?h.foreign_hold_rate.toFixed(1)+'%':'—'}</td>
            <td style="text-align:right;color:${(h.program_net_buy||0)<0?'var(--blue)':'var(--red)'}">
              ${h.program_net_buy!=null?h.program_net_buy.toLocaleString():'—'}
            </td>
            <td style="text-align:right;color:var(--text1)">${h.short_sell_qty!=null?h.short_sell_qty.toLocaleString():'—'}</td>
            <td style="text-align:right;color:var(--text1)">${h.loan_balance_rate!=null?h.loan_balance_rate.toFixed(2)+'%':'—'}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>`;
  } catch(e) { body.innerHTML=`<div style="color:var(--red);padding:20px">오류: ${e.message}</div>`; }
}

// ─────────────────────────────────────────
// 탭5: 증권사 투자의견
// ─────────────────────────────────────────
async function _sdOpinion(body, code, name) {
  try {
    const { data: opinions } = await sb.from('analyst_opinions')
      .select('*').eq('stock_code', code)
      .order('opinion_date',{ascending:false}).limit(100);

    if (!opinions?.length) {
      body.innerHTML = '<div style="color:var(--text2);padding:60px;text-align:center">증권사 투자의견 없음<br><span style="font-size:11px">수집된 데이터가 없습니다</span></div>';
      return;
    }

    // 컨센서스 요약
    const recent = opinions.filter(o => {
      const d = new Date(o.opinion_date);
      return (Date.now()-d.getTime()) < 90*24*60*60*1000;
    });
    const tgPrices = recent.map(o=>o.target_price).filter(v=>v>0);
    const avgTarget = tgPrices.length ? Math.round(tgPrices.reduce((a,b)=>a+b,0)/tgPrices.length) : null;
    const maxTarget = tgPrices.length ? Math.max(...tgPrices) : null;
    const minTarget = tgPrices.length ? Math.min(...tgPrices) : null;
    const buyCnt    = recent.filter(o=>['1','2'].includes(o.opinion_code)).length;
    const holdCnt   = recent.filter(o=>o.opinion_code==='3').length;

    // 최신 현재가
    const { data: lp } = await sb.from('market_data')
      .select('price').eq('stock_code',code)
      .order('base_date',{ascending:false}).limit(1).single();
    const curPrice = lp?.price;
    const upside = avgTarget&&curPrice ? ((avgTarget-curPrice)/curPrice*100).toFixed(1) : null;

    body.innerHTML = `
      <!-- 컨센서스 요약 -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
        ${[
          ['평균 목표주가', fmtPrice(avgTarget), upside!=null?`현재가 대비 ${upside>=0?'+':''}${upside}%`:''],
          ['목표가 범위', maxTarget?`${minTarget?.toLocaleString()}~${maxTarget?.toLocaleString()}원`:'—', ''],
          ['매수 의견', `${buyCnt}개`, `전체 ${recent.length}개 중`],
          ['중립/기타', `${holdCnt}개`, ''],
        ].map(([lb,v,sub])=>`
          <div style="background:var(--bg3);border-radius:8px;padding:12px 14px;border:1px solid var(--border);text-align:center">
            <div style="font-size:11px;color:var(--text1);margin-bottom:4px">${lb}</div>
            <div style="font-size:18px;font-weight:700">${v}</div>
            ${sub?`<div style="font-size:10px;color:${upside&&upside>=0?'var(--green)':'var(--text2)'};margin-top:2px">${sub}</div>`:''}
          </div>`).join('')}
      </div>
      <!-- 의견 목록 -->
      <div class="table-wrap"><table>
        <thead><tr>
          <th>날짜</th><th>증권사</th><th style="text-align:center">투자의견</th>
          <th>직전의견</th><th style="text-align:right">목표주가</th>
          <th style="text-align:right">괴리율</th>
        </tr></thead>
        <tbody>${opinions.map(o=>{
          const isBuy = ['1','2'].includes(o.opinion_code)||o.opinion?.includes('매수')||o.opinion==='BUY';
          const opColor = isBuy ? 'var(--red)' : o.opinion?.includes('매도')||o.opinion==='SELL' ? 'var(--blue)' : 'var(--text2)';
          const gapColor = (o.gap_rate||0) < -20 ? 'var(--yellow)' : 'var(--text2)';
          // 의견 변화 감지
          const changed = o.opinion !== o.prev_opinion ? '🔄' : '';
          return `<tr>
            <td style="font-size:11px;color:var(--text2)">${o.opinion_date}</td>
            <td style="font-weight:500">${o.firm_name}</td>
            <td style="text-align:center">
              <span style="color:${opColor};font-weight:700">${changed}${o.opinion||'—'}</span>
            </td>
            <td style="color:var(--text2);font-size:12px">${o.prev_opinion||'—'}</td>
            <td style="text-align:right;font-weight:600">${fmtPrice(o.target_price)}</td>
            <td style="text-align:right;color:${gapColor}">${o.gap_rate!=null?o.gap_rate.toFixed(1)+'%':'—'}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>`;
  } catch(e) { body.innerHTML=`<div style="color:var(--red);padding:20px">오류: ${e.message}</div>`; }
}

async function _renderFinancialTab(body, code, name) {
  try {
    const { data: fins } = await sb.from('financials')
      .select('bsns_year,quarter,revenue,operating_profit,net_income,operating_margin,net_margin,roe,roa,debt_ratio,total_assets,total_equity,operating_cashflow,cogs_ratio,gross_margin,sga_ratio')
      .eq('stock_code', code)
      .order('bsns_year').order('quarter');

    if (!fins?.length) {
      body.innerHTML = '<div style="color:var(--text2);padding:40px;text-align:center">재무 데이터 없음</div>';
      return;
    }

    const fmt  = (v) => {
      if (v == null) return '—';
      const 億 = Math.round(v / 100000000);
      if (Math.abs(億) >= 10000) {
        const 조 = Math.floor(億 / 10000);
        const 나머지 = Math.abs(億) % 10000;
        return 나머지 > 0 ? `${조}조 ${나머지.toLocaleString()}억` : `${조}조`;
      }
      return 億.toLocaleString() + '억';
    };
    const pct  = (v) => v!=null ? v.toFixed(1)+'%' : '—';
    const fmtB = (v) => v==null ? null : Math.round(v/100000000);

    body.innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:16px;align-items:center;flex-wrap:wrap">
        <button id="btn-quarter" class="chip active" onclick="FIN.view='quarter';FIN.render()">분기별</button>
        <button id="btn-annual"  class="chip"        onclick="FIN.view='annual'; FIN.render()">연간별 <span style="font-size:10px;color:var(--text2)">(Q4 누적)</span></button>
        <button id="btn-qcomp"   class="chip"        onclick="FIN.view='qcomp';  FIN.render()">분기비교</button>
        <div style="display:flex;gap:4px;margin-left:auto;align-items:center">
          <button id="btn-chart-rev"  class="chip active" onclick="FIN.chart='revenue'; FIN.drawChart()">매출·영업이익</button>
          <button id="btn-chart-gpm"  class="chip"        onclick="FIN.chart='gpm';     FIN.drawChart()">매출·GPM·판관비</button>
          <button id="btn-chart-cf"   class="chip"        onclick="FIN.chart='cf';      FIN.drawChart()">현금흐름</button>
          <div style="display:flex;align-items:center;gap:6px;margin-left:8px;border-left:1px solid var(--border);padding-left:8px">
            <span style="font-size:11px;color:var(--text2)">차트</span>
            <button onclick="FIN.resizeChart(-60)" style="background:none;border:1px solid var(--border);border-radius:4px;cursor:pointer;color:var(--text1);width:22px;height:22px;font-size:14px;line-height:1">−</button>
            <button onclick="FIN.resizeChart(+60)" style="background:none;border:1px solid var(--border);border-radius:4px;cursor:pointer;color:var(--text1);width:22px;height:22px;font-size:14px;line-height:1">+</button>
          </div>
        </div>
      </div>
      <div id="fin-chart-wrap" style="position:relative;height:220px;margin-bottom:16px">
        <canvas id="fin-chart-canvas"></canvas>
      </div>
      <div id="fin-table-area" class="table-wrap"><table>
        <thead><tr>
          <th>기간</th>
          <th style="text-align:right">매출액</th>
          <th style="text-align:right">영업이익</th>
          <th style="text-align:right">영업이익률</th>
          <th style="text-align:right">순이익</th>
          <th style="text-align:right">순이익률</th>
          <th style="text-align:right">ROE</th>
          <th style="text-align:right">부채비율</th>
          <th style="text-align:right">영업현금흐름</th>
        </tr></thead>
        <tbody id="fin-table-body"></tbody>
      </table></div>`;

    FIN.chartH = 220;
    FIN.resizeChart = (delta) => {
      FIN.chartH = Math.max(160, Math.min(600, FIN.chartH + delta));
      const wrap = document.getElementById('fin-chart-wrap');
      if (wrap) wrap.style.height = FIN.chartH + 'px';
      FIN.drawChart();
    };

    let finChart  = null;
    let finCharts = [];   // qcomp 모드의 4개 미니차트

    const _destroyAll = () => {
      if (finChart)  { finChart.destroy();  finChart  = null; }
      finCharts.forEach(c => c?.destroy());
      finCharts = [];
    };

    FIN.view  = 'quarter';
    FIN.chart = 'revenue';
    FIN.compQ = 'Q1';
    FIN.rows     = fins;

    FIN.getRows = () => {
      if (FIN.view === 'annual') {
        return FIN.rows.filter(f => f.quarter === 'Q4').map(f => ({...f, label: f.bsns_year+'년'}));
      } else {
        // quarter / qcomp 모두 전체 분기 반환 (qcomp는 render에서 피벗 처리)
        return FIN.rows.map(f => ({...f, label: f.bsns_year+' '+f.quarter}));
      }
    };

    FIN.drawChart = () => {
      ['rev','gpm','cf'].forEach(t => {
        const b = document.getElementById('btn-chart-'+t);
        if (b) b.classList.toggle('active', t === {revenue:'rev',gpm:'gpm',cf:'cf'}[FIN.chart]);
      });
      if (!window.Chart) return;
      _destroyAll();

      // ── 분기비교: 4개 미니차트 ──────────────────────────────────────────
      if (FIN.view === 'qcomp') {
        const wrap = document.getElementById('fin-chart-wrap');
        if (!wrap) return;
        const allRows = FIN.getRows();
        const QUARTERS = ['Q1','Q2','Q3','Q4'];
        const COLORS   = ['rgba(42,171,238,0.7)','rgba(45,206,137,0.7)','rgba(251,163,35,0.7)','rgba(245,54,92,0.7)'];

        wrap.style.height = 'auto';
        wrap.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          ${QUARTERS.map((q,i) => `
            <div style="background:var(--bg3);border-radius:8px;padding:8px">
              <div style="font-size:11px;font-weight:700;color:var(--text1);margin-bottom:4px">${q.replace('Q','')}분기</div>
              <div style="position:relative;height:130px"><canvas id="fin-qc-${q}"></canvas></div>
            </div>`).join('')}
        </div>`;

        QUARTERS.forEach((q, qi) => {
          const qRows  = allRows.filter(r => r.quarter === q);
          const canvas = document.getElementById(`fin-qc-${q}`);
          if (!canvas || !qRows.length) return;
          const labels = qRows.map(r => r.bsns_year + '년');
          finCharts.push(new window.Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
              labels,
              datasets: [
                {
                  label: '매출액',
                  data: qRows.map(r => fmtB(r.revenue)),
                  backgroundColor: 'rgba(42,171,238,0.55)',
                  borderRadius: 3, yAxisID: 'y',
                },
                {
                  label: '영업이익',
                  data: qRows.map(r => fmtB(r.operating_profit)),
                  backgroundColor: COLORS[qi],
                  borderRadius: 3, yAxisID: 'y',
                },
                {
                  label: '영업이익률(%)',
                  data: qRows.map(r => r.operating_margin?.toFixed(1) ?? null),
                  type: 'line',
                  borderColor: 'rgba(255,193,7,0.9)',
                  backgroundColor: 'transparent',
                  pointBackgroundColor: 'rgba(255,193,7,0.9)',
                  tension: 0.3, borderWidth: 2, yAxisID: 'y2',
                },
              ],
            },
            options: {
              responsive: true, maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: { backgroundColor: '#1a1d27', titleColor: '#f0f2f8', bodyColor: '#a8adc4' },
              },
              scales: {
                x: { ticks: { color: '#6e7491', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
                y: { ticks: { color: '#6e7491', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
                y2: {
                  ticks: { color: '#a8adc4', font: { size: 9 }, callback: v => v + '%' },
                  grid: { drawOnChartArea: false }, position: 'right',
                },
              },
            },
          }));
        });
        return;
      }

      // ── 분기별 / 연간별: 기존 단일 차트 ────────────────────────────────
      const rows   = FIN.getRows();
      const labels = rows.map(r => r.label);
      const canvas = document.getElementById('fin-chart-canvas');
      if (!canvas) return;

      let datasets, chartType;

      if (FIN.chart === 'revenue') {
        // 매출액(막대) + 영업이익(막대) + 영업이익률(라인, 우축)
        chartType = 'bar';
        datasets = [
          {
            label: '매출액',
            data: rows.map(r => fmtB(r.revenue)),
            backgroundColor: 'rgba(42,171,238,0.65)',
            borderRadius: 3,
            yAxisID: 'y',
          },
          {
            label: '영업이익',
            data: rows.map(r => fmtB(r.operating_profit)),
            backgroundColor: 'rgba(245,54,92,0.65)',
            borderRadius: 3,
            yAxisID: 'y',
          },
          {
            label: '영업이익률(%)',
            data: rows.map(r => r.operating_margin?.toFixed(1) ?? null),
            type: 'line',
            borderColor: 'rgba(255,193,7,0.9)',
            backgroundColor: 'transparent',
            pointBackgroundColor: 'rgba(255,193,7,0.9)',
            tension: 0.3,
            yAxisID: 'y2',
            borderWidth: 2,
          },
        ];
      } else if (FIN.chart === 'gpm') {
        // 매출액(막대) + GPM(라인) + 판관비비율(라인), 우축 %
        chartType = 'bar';
        datasets = [
          {
            label: '매출액',
            data: rows.map(r => fmtB(r.revenue)),
            backgroundColor: 'rgba(42,171,238,0.55)',
            borderRadius: 3,
            yAxisID: 'y',
          },
          {
            label: '매출총이익률(%)',
            data: rows.map(r => r.gross_margin?.toFixed(1) ?? null),
            type: 'line',
            borderColor: 'rgba(45,206,137,0.9)',
            backgroundColor: 'transparent',
            pointBackgroundColor: 'rgba(45,206,137,0.9)',
            tension: 0.3,
            yAxisID: 'y2',
            borderWidth: 2,
          },
          {
            label: '판관비율(%)',
            data: rows.map(r => r.sga_ratio?.toFixed(1) ?? null),
            type: 'line',
            borderColor: 'rgba(255,193,7,0.9)',
            backgroundColor: 'transparent',
            pointBackgroundColor: 'rgba(255,193,7,0.9)',
            tension: 0.3,
            yAxisID: 'y2',
            borderWidth: 2,
            borderDash: [4, 3],
          },
        ];
      } else {
        // 현금흐름 막대
        chartType = 'bar';
        datasets = [
          {
            label: '영업현금흐름',
            data: rows.map(r => fmtB(r.operating_cashflow)),
            backgroundColor: rows.map(r => (fmtB(r.operating_cashflow) ?? 0) >= 0
              ? 'rgba(45,206,137,0.7)' : 'rgba(245,54,92,0.7)'),
            borderRadius: 3,
            yAxisID: 'y',
          },
        ];
      }

      const hasY2 = ['revenue','gpm'].includes(FIN.chart);
      finChart = new window.Chart(canvas.getContext('2d'), {
        type: chartType,
        data: { labels, datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { labels: { color: '#a8adc4', font: { size: 11 }, boxWidth: 12 } },
            tooltip: { backgroundColor: '#1a1d27', titleColor: '#f0f2f8', bodyColor: '#a8adc4' },
          },
          scales: {
            x: { ticks: { color: '#6e7491', font: { size: 10 }, maxRotation: 45 }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { ticks: { color: '#6e7491', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' }, position: 'left' },
            ...(hasY2 ? {
              y2: {
                ticks: { color: '#a8adc4', font: { size: 10 }, callback: v => v + '%' },
                grid: { drawOnChartArea: false },
                position: 'right',
              }
            } : {}),
          },
        },
      });
    };

    FIN.render = () => {
      ['quarter','annual','qcomp'].forEach(t => {
        const b = document.getElementById('btn-'+t);
        if (b) b.classList.toggle('active', t === FIN.view);
      });

      // qcomp ↔ 일반 전환 시 차트 wrap 복원
      const wrap = document.getElementById('fin-chart-wrap');
      if (wrap && FIN.view !== 'qcomp') {
        if (!wrap.querySelector('#fin-chart-canvas')) {
          wrap.style.height = FIN.chartH + 'px';
          wrap.innerHTML = '<canvas id="fin-chart-canvas"></canvas>';
        }
      }

      const rows = FIN.getRows();
      const area = document.getElementById('fin-table-area');

      if (FIN.view === 'qcomp') {
        // ── 분기비교: Q1/Q2/Q3/Q4 각각 연도별 YoY 비교 ─────────────────
        const metrics = [
          { label: '매출액',       fn: r => `<b>${fmt(r.revenue)}</b>` },
          { label: '영업이익',     fn: r => fmt(r.operating_profit) },
          { label: '영업이익률',   fn: r => `<span style="color:${(r.operating_margin??0)>=0?'var(--red)':'var(--blue)'}">${pct(r.operating_margin)}</span>` },
          { label: '순이익',       fn: r => fmt(r.net_income) },
          { label: '순이익률',     fn: r => `<span style="color:${(r.net_margin??0)>=0?'var(--red)':'var(--blue)'}">${pct(r.net_margin)}</span>` },
          { label: 'ROE',          fn: r => pct(r.roe) },
          { label: '부채비율',     fn: r => pct(r.debt_ratio) },
          { label: '영업현금흐름', fn: r => fmt(r.operating_cashflow) },
        ];

        const makeQTable = (q) => {
          const qRows = rows.filter(r => r.quarter === q);
          if (!qRows.length) return '';
          const years = qRows.map(r => r.bsns_year);
          return `
            <div style="margin-bottom:20px">
              <div style="font-size:12px;font-weight:700;color:var(--text1);margin-bottom:6px;padding:4px 0;border-bottom:1px solid var(--border)">
                ${q.replace('Q','') + '분기'} 연도별 비교
              </div>
              <div style="overflow-x:auto"><table style="font-size:12px;width:100%">
                <thead><tr>
                  <th style="text-align:left;min-width:76px">지표</th>
                  ${years.map(y => `<th style="text-align:right;min-width:60px">${y}년</th>`).join('')}
                </tr></thead>
                <tbody>
                  ${metrics.map(m => `<tr>
                    <td style="font-size:11px;color:var(--text2);padding:5px 4px">${m.label}</td>
                    ${qRows.map(r => `<td style="text-align:right;padding:5px 8px">${m.fn(r)}</td>`).join('')}
                  </tr>`).join('')}
                </tbody>
              </table></div>
            </div>`;
        };

        area.innerHTML = ['Q1','Q2','Q3','Q4'].map(makeQTable).join('');

      } else {
        // ── 분기별 / 연간별: 기간 행 × 지표 열 기존 테이블 ──────────────
        const tableRows = [...rows].reverse();
        area.innerHTML = `<table>
          <thead><tr>
            <th>기간</th>
            <th style="text-align:right">매출액</th>
            <th style="text-align:right">영업이익</th>
            <th style="text-align:right">영업이익률</th>
            <th style="text-align:right">순이익</th>
            <th style="text-align:right">순이익률</th>
            <th style="text-align:right">ROE</th>
            <th style="text-align:right">부채비율</th>
            <th style="text-align:right">영업현금흐름</th>
          </tr></thead>
          <tbody>${tableRows.map(f => `<tr>
            <td style="font-size:12px;color:var(--text2);white-space:nowrap">${f.label}</td>
            <td style="text-align:right;font-weight:600">${fmt(f.revenue)}</td>
            <td style="text-align:right">${fmt(f.operating_profit)}</td>
            <td style="text-align:right;color:${f.operating_margin>=0?'var(--red)':'var(--blue)'}">${pct(f.operating_margin)}</td>
            <td style="text-align:right">${fmt(f.net_income)}</td>
            <td style="text-align:right;color:${f.net_margin>=0?'var(--red)':'var(--blue)'}">${pct(f.net_margin)}</td>
            <td style="text-align:right">${pct(f.roe)}</td>
            <td style="text-align:right">${pct(f.debt_ratio)}</td>
            <td style="text-align:right">${fmt(f.operating_cashflow)}</td>
          </tr>`).join('')}</tbody>
        </table>`;
      }

      FIN.drawChart();
    };

    FIN.render();

  } catch(e) {
    body.innerHTML = `<div style="color:var(--red);padding:20px">오류: ${e.message}</div>`;
  }
}
