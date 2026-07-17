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
    <button class="chip" onclick="go('screener')">${_ICO.search}필터 스크리닝</button>
    <button class="chip active" onclick="go('financials')">${_ICO.bar}기업 분석</button>
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
    sb.from('companies').select('code').eq('is_monitored', true).order('code')
  );
  // companies.code는 일부만 .KS/.KQ 접미사 — market_data/financials의 bare 코드와
  // 모두 매칭되도록 원본·접미사 제거본을 함께 담는다 (접미사 행이 필터에서 새던 문제)
  const set = new Set();
  data.forEach(c => { set.add(c.code); set.add(c.code.replace(/\.(KS|KQ)$/, '')); });
  return set;
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
      // 표가 실제 사용하는 컬럼만 명시 (구 select('*') — 당일 전 종목 × 전 컬럼 다운로드)
      const COLS = 'stock_code,corp_name,market,market_cap,price,price_change,price_change_rate,'
        + 'volume_change_rate,high_price,low_price,vwap,volume,trading_value,listing_shares,vol_turnover,'
        + 'per,pbr,eps,bps,fiscal_month,foreign_hold_rate,foreign_hold_qty,foreign_net_buy,program_net_buy,'
        + 'loan_balance_rate,short_sell_qty,w52_high,w52_low,w52_high_date,w52_low_date,'
        + 'price_change_sign,market_warn_code,is_caution,manage_issue_code,is_short_over,is_liquidation,'
        + 'hgpr_cls,hgpr_cls_code,base_date';
      const all = maxDate ? await fetchAllPages(
        sb.from('market_data').select(COLS).eq('base_date', maxDate)
          .order('stock_code')   // 페이지 경계 결정성 (무정렬 페이징은 누락/중복 가능)
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
        ? `<div style="display:flex;align-items:center;gap:3px;font-size:11px">
            <span style="width:40px;height:3px;background:var(--bg3);border-radius:2px;display:inline-block;position:relative">
              <span style="position:absolute;left:0;top:0;height:100%;width:${Math.max(2,w52pct)}%;
                background:${w52pct>=80?'var(--red)':w52pct<=20?'var(--blue)':'var(--tg)'};border-radius:2px"></span>
            </span><span style="color:var(--text2)">${w52pct}%</span></div>` : '';
      return `<tr>
        <td class="stock-row" style="font-weight:500;color:var(--tg);white-space:nowrap"
          data-stock-open="${r.stock_code}" data-stock-name="${escAttr(r.corp_name||'')}" data-stock-tab="market">${escapeHtml(r.corp_name||'')}</td>
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
        <td style="font-size:11px;color:var(--text2)">${r.w52_high_date||'—'}</td>
        <td style="font-size:11px;color:var(--text2)">${r.w52_low_date||'—'}</td>
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
  const src  = (s) => `<span style="font-size:11px;padding:1px 4px;border-radius:3px;
    background:${s==='DART'?'rgba(45,206,137,.15)':s==='계산'?'rgba(251,99,64,.15)':'rgba(42,171,238,.15)'};
    color:${s==='DART'?'var(--green)':s==='계산'?'var(--yellow)':'var(--tg)'};font-weight:600">${s}</span>`;

  await _loadTabData(el, {
    defaultSort: 'revenue',
    fetchRows: async () => {
      const monitoredCodes = await _getMonitoredCodes();
      // 탭은 종목별 최신 분기 1건만 사용 — 전 이력 다운로드 대신 최근 4개년으로 제한
      const minYear = String(new Date().getFullYear() - 3);
      const all = await fetchAllPages(
        sb.from('financials').select('*')
          .gte('bsns_year', minYear)
          .order('bsns_year', { ascending: false })
          .order('quarter',   { ascending: false })
          .order('stock_code')   // 페이지 경계 결정성 (동순위 다수 → 누락/중복 방지)
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
          data-stock-open="${r.stock_code}" data-stock-name="${escAttr(r.corp_name||'')}" data-stock-tab="financial">${escapeHtml(r.corp_name||'')}</td>
        <td style="font-size:11px;color:var(--text2);font-family:monospace">${r.stock_code}</td>
        <td style="font-size:11px;color:var(--text2)">${r.bsns_year||'—'}</td>
        <td style="font-size:11px;color:var(--text2)">${r.quarter||'—'}</td>
        <td style="font-size:11px">${r.fs_div==='CFS'?'연결':'별도'}</td>
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

// (2026-07-17) 종목 상세 통합 모달(openStockDetail·_sd*)은 stock-detail.js로 분리 —
//   전 페이지 공용 컴포넌트라 기업 분석 페이지 파일과 경계를 맞춤. FIN 네임스페이스는 공유.
