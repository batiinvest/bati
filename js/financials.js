// financials.js — 기업 분석 (시장 현황/재무제표)
// fmtCap, chgColor, chgStr, loadingHTML, emptyHTML, errorHTML, fetchAllPages → config.js 참조

// 페이지 상태 네임스페이스 — 구 window._fin*/_sd* 수렴 (view·chart·drawChart·render·getRows·rows·indMap·sdCode 등)
const FIN = {};

// 검색 debounce — 키스트로크마다 API 호출 방지
let _finSearchTimer = null;
function _finSearchDebounce() {
  F.q = document.getElementById('fin-q')?.value ?? '';
  clearTimeout(_finSearchTimer);
  // 검색은 캐시된 행만 다시 거르면 된다 — 재조회 불필요
  _finSearchTimer = setTimeout(() => _renderFinView(), 200);
}

/** 새로고침 버튼 — 캐시를 버리고 서버에서 다시 받는다 */
function reloadFinancials() {
  FIN.raw = null;
  FIN.rawKey = null;
  _latestMarketDate = null;   // market_data 최신일 캐시도 함께 무효화
  loadFinancials();
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
    <button class="chip active" onclick="go('financials')">${_ICO.bar}기업 분석</button>
    <button class="chip" onclick="go('screener')">${_ICO.search}필터 스크리닝</button>
  </div>
  <div class="tabs" style="margin-bottom:.75rem">
    <button class="tab fin-tab ${F.mode==='market'?'active':''}" data-mode="market" onclick="F.mode='market';loadFinancials()">시장 현황</button>
    <button class="tab fin-tab ${F.mode==='financial'?'active':''}" data-mode="financial" onclick="F.mode='financial';loadFinancials()">재무제표</button>
    <div style="margin-left:auto;display:flex;align-items:center;gap:8px;font-size:calc(11px*var(--m-label));padding:0 4px">
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
    <!-- 필터 2축. 옵션·건수는 로드된 데이터에서 _syncFinSectorOptions()가 채운다.
         업종(WICS) = 무슨 사업을 하나 · 전 종목 / 테마 = 어떤 이야기로 묶이나 · 일부 종목 -->
    <select class="form-select" id="fin-wsec" title="업종 대분류 (GICS 표준 10종)"
      onchange="F.wicsSector=this.value;_finCatSel('_wics').clear();_renderFinView()" style="width:130px;padding:6px 10px">
      <option value="전체">업종 전체</option>
    </select>
    <select class="form-select" id="fin-wics" title="업종 소분류 (WICS 79종)"
      onchange="_finSelPick('_wics',this.value);_renderFinView()" style="width:175px;padding:6px 10px">
      <option value="전체">세부업종 전체</option>
    </select>
    <select class="form-select" id="fin-ind" title="투자 테마 (큐레이션)"
      onchange="_finSelPick('_ind',this.value);F.subIndustry='전체';_renderFinView()" style="width:120px;padding:6px 10px">
      ${industries.map(i=>`<option value="${i}" ${_finCatSel('_ind').has(i)?'selected':''}>${i}</option>`).join('')}
    </select>
    <select class="form-select" id="fin-sub" title="세부 테마"
      onchange="F.subIndustry=this.value;_renderFinView()" style="width:145px;padding:6px 10px">
      <option value="전체">세부테마 전체</option>
    </select>
    <span style="font-size:calc(12px*var(--m-sub));color:var(--text2)" id="fin-count"></span>
    <div style="margin-left:auto;display:flex;gap:6px">
      <button class="btn btn-sm" onclick="reloadFinancials()">새로고침</button>
      <button class="btn btn-sm" onclick="exportFinancials()">CSV 다운로드</button>
    </div>
  </div>

  <!-- 컬럼 그룹 토글 — 40여 개를 용도별로 켜고 끈다 (선택은 브라우저에 저장) -->
  <div id="fin-cols" style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;margin-bottom:.75rem"></div>

  <!-- 지표 범위 필터 — 컬럼을 골라 최소~최대로 거른다. 여러 개를 겹쳐 걸 수 있고
       걸린 조건은 칩으로 표시·제거한다. 옵션은 탭별로 _syncFinNumFilter()가 채운다 -->
  <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;margin-bottom:.75rem">
    <span style="font-size:calc(11px*var(--m-label));color:var(--text2);margin-right:2px">지표</span>
    <select class="form-select" id="fin-num-col" style="width:168px;padding:4px 8px;font-size:calc(12px*var(--m-sub))"></select>
    <input class="form-input" id="fin-num-min" type="number" placeholder="최소" inputmode="decimal"
      style="width:78px;padding:4px 8px;font-size:calc(12px*var(--m-sub))"
      onkeydown="if(event.key==='Enter')addFinNumFilter()">
    <span style="color:var(--text3);font-size:calc(12px*var(--m-sub))">~</span>
    <input class="form-input" id="fin-num-max" type="number" placeholder="최대" inputmode="decimal"
      style="width:78px;padding:4px 8px;font-size:calc(12px*var(--m-sub))"
      onkeydown="if(event.key==='Enter')addFinNumFilter()">
    <button class="chip chip-sm" onclick="addFinNumFilter()">추가</button>
    <span id="fin-num-chips" style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;margin-left:4px"></span>
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
 * 공통 필터 적용 — 검색어 + 테마 2단 + 업종 2단 (두 축은 독립이며 AND로 겹친다)
 * @param {Array} rows
 * @returns {Array} 필터된 rows
 */
function _applyFinFilter(rows) {
  if (F.q) rows = rows.filter(r => r.corp_name.includes(F.q));
  // 열 필터 — 같은 열 안에서 여러 값은 OR, 열끼리는 AND.
  // 값은 행에 이미 붙어 있다(_ind·_wics는 로더가 메타에서 채워 넣는다).
  Object.entries(F.catSel || {}).forEach(([col, set]) => {
    if (!set || !set.size) return;
    rows = rows.filter(r => {
      const v = _finCellVal(r, col);
      return Array.isArray(v) ? v.some(x => set.has(x)) : set.has(v);
    });
  });
  Object.entries(F.textF || {}).forEach(([col, q]) => {
    const t = String(q).toLowerCase();
    rows = rows.filter(r => String(r[col] ?? '').toLowerCase().includes(t));
  });
  if (F.subIndustry && F.subIndustry !== '전체') {
    rows = rows.filter(r => FIN.metaMap?.[r.stock_code]?.sub === F.subIndustry);
  }
  // 업종(WICS) — 테마와 독립된 축. 대분류는 wics_code 앞 3자리로 판정
  if (F.wicsSector && F.wicsSector !== '전체') {
    rows = rows.filter(r => (FIN.metaMap?.[r.stock_code]?.wcode || '').slice(0, 3) === F.wicsSector);
  }
  // 지표 범위 — 여러 조건은 AND. 값이 없는 종목은 비교 불가라 제외한다
  (F.numFilters || []).forEach(f => {
    rows = rows.filter(r => {
      const v = r[f.col];
      if (v == null || v === '') return false;
      if (f.min != null && v < f.min * f.scale) return false;
      if (f.max != null && v > f.max * f.scale) return false;
      return true;
    });
  });
  return rows;
}

/**
 * 업종·테마 드롭다운 4종을 실제 로드된 데이터로 다시 채운다.
 * - 업종(WICS): 대분류(GICS 10종) → 소분류(79종). 소분류는 선택된 대분류 안에서만
 * - 테마: INDUSTRIES(11종) 순서를 먼저 두고, 상수 밖 값(금융·기타·건설 등)을 건수순으로 뒤에
 *         → 이 상수 밖 값들은 업종을 테마 칸에 넣어둔 잔재라 WICS 안착 후 정리 대상
 * - 세부테마: 테마가 선택돼 있으면 그 테마 것만
 * - 건수는 현재 범위(모니터링/전체)·검색어 적용 전 기준이라 고르기 전에 규모를 가늠할 수 있다
 * @param {Array} rows 필터 적용 전 행 (stock_code 보유)
 */
function _syncFinSectorOptions(rows) {
  const meta = FIN.metaMap || {};
  const indCnt = {}, subCnt = {}, secCnt = {}, wicsCnt = {};
  rows.forEach(r => {
    const m = meta[r.stock_code];
    if (!m) return;
    if (m.ind) {
      indCnt[m.ind] = (indCnt[m.ind] || 0) + 1;
      if (m.sub && (!_finCatSel('_ind').size || _finCatSel('_ind').has(m.ind))) {
        subCnt[m.sub] = (subCnt[m.sub] || 0) + 1;
      }
    }
    if (m.wics) {
      const sec = (m.wcode || '').slice(0, 3);
      if (sec) secCnt[sec] = (secCnt[sec] || 0) + 1;
      // 소분류는 선택된 대분류 안에서만 센다
      if (!F.wicsSector || F.wicsSector === '전체' || sec === F.wicsSector) {
        wicsCnt[m.wics] = (wicsCnt[m.wics] || 0) + 1;
      }
    }
  });

  // 열 헤더 ▾ 팝오버가 같은 목록·건수를 쓰도록 남긴다 (두 벌로 계산하면 어긋난다)
  FIN.optCnt = { ind: indCnt, wics: wicsCnt };
  const byCntDesc = (a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0], 'ko');
  const known = INDUSTRIES.filter(i => indCnt[i]);
  const extra = Object.entries(indCnt).filter(([i]) => !INDUSTRIES.includes(i))
    .sort(byCntDesc).map(([i]) => i);
  const opt = (val, label, cur) =>
    `<option value="${escAttr(val)}"${val === cur ? ' selected' : ''}>${escapeHtml(label)}</option>`;

  const indEl = document.getElementById('fin-ind');
  if (indEl) {
    // 선택값이 목록에 없으면(범위 전환 등) 옵션을 남겨 선택이 조용히 풀리지 않게 한다
    const sel  = _finCatSel('_ind');
    const cur  = _finSelCur(sel);
    const list = [...known, ...extra];
    sel.forEach(v => { if (!list.includes(v)) list.push(v); });
    indEl.innerHTML = _finMultiOpt(sel, '테마')
      + opt('전체', '테마 전체', cur)
      + list.map(i => opt(i, `${i} (${indCnt[i] || 0})`, cur)).join('');
  }

  const subEl = document.getElementById('fin-sub');
  if (subEl) {
    const cur  = F.subIndustry || '전체';
    const list = Object.entries(subCnt).sort(byCntDesc).map(([s]) => s);
    if (cur !== '전체' && !list.includes(cur)) list.push(cur);
    subEl.innerHTML = opt('전체', '세부테마 전체', cur)
      + list.map(s => opt(s, `${s} (${subCnt[s] || 0})`, cur)).join('');
    subEl.disabled = !list.length;
  }

  // 업종 대분류 — GICS 표준 10종. WICS_SECTORS 정의 순서를 유지해 위치가 흔들리지 않게 한다
  const secEl = document.getElementById('fin-wsec');
  if (secEl) {
    const cur  = F.wicsSector || '전체';
    const list = Object.keys(WICS_SECTORS).filter(k => secCnt[k]);
    if (cur !== '전체' && !list.includes(cur)) list.push(cur);
    secEl.innerHTML = opt('전체', '업종 전체', cur)
      + list.map(k => opt(k, `${WICS_SECTORS[k] || k} (${secCnt[k] || 0})`, cur)).join('');
  }

  // 업종 소분류 — 대분류가 선택돼 있으면 그 안에서만
  const wEl = document.getElementById('fin-wics');
  if (wEl) {
    const sel  = _finCatSel('_wics');
    const cur  = _finSelCur(sel);
    const list = Object.entries(wicsCnt).sort(byCntDesc).map(([s]) => s);
    sel.forEach(v => { if (!list.includes(v)) list.push(v); });
    wEl.innerHTML = _finMultiOpt(sel, '업종')
      + opt('전체', '세부업종 전체', cur)
      + list.map(s => opt(s, `${s} (${wicsCnt[s] || 0})`, cur)).join('');
    wEl.disabled = !list.length;
  }
}

// ── 열 필터 ────────────────────────────────────────────────────────────────
// 컬럼마다 값의 성격이 달라 양식도 달라야 한다:
//   cat  범주 — 값 목록에서 체크, 여러 개면 OR   (업종·테마·시장·경고·신고가구분)
//   num  숫자 — 최소~최대 범위                    (PER·시가총액·수익률 …)
//   text 문자 — 부분 일치                         (종목명·코드·날짜)
// 표의 대부분이 숫자라, 명시하지 않은 컬럼은 num으로 본다.
const FIN_FILTER_KIND = {
  corp_name: 'text', stock_code: 'text', w52_high_date: 'text', w52_low_date: 'text',
  market: 'cat', _wics: 'cat', _ind: 'cat', hgpr_cls: 'cat',
  fiscal_month: 'cat', base_date: 'cat', _riskRank: 'cat',
  bsns_year: 'cat', quarter: 'cat', fs_div: 'cat',   // 재무제표 탭
};
// 값이 행에 그대로 없는 컬럼의 추출기. 배열을 주면 '그중 하나라도'로 매칭한다.
const FIN_FILTER_GET = { _riskRank: r => _riskTags(r) };

const _FIN_MULTI = '__multi__';

function _finFilterKind(col) { return FIN_FILTER_KIND[col] || 'num'; }
function _finCellVal(r, col) {
  const get = FIN_FILTER_GET[col];
  return get ? get(r) : r[col];
}

/** 범주 선택 Set — 컬럼마다 하나. 진실은 이 Set이고 상단 드롭다운은 그 단축 조작이다 */
function _finCatSel(col) {
  F.catSel = F.catSel || {};
  if (!(F.catSel[col] instanceof Set)) F.catSel[col] = new Set();
  return F.catSel[col];
}

/** 드롭다운에서 하나 고르기 — '전체'면 비우고, 그 외엔 그 값 하나로 바꾼다 */
function _finSelPick(col, val) {
  if (val === _FIN_MULTI) return;      // '여러 개' 표시용 옵션은 골라도 무시
  const sel = _finCatSel(col);
  sel.clear();
  if (val && val !== '전체') sel.add(val);
}

/** 드롭다운이 표시할 값 — 0개면 전체, 1개면 그 값, 여러 개면 전용 옵션 */
function _finSelCur(sel) {
  return !sel.size ? '전체' : sel.size === 1 ? [...sel][0] : _FIN_MULTI;
}

/** 여러 개 선택됐을 때만 맨 앞에 붙는 옵션 (드롭다운은 하나만 표시할 수 있다) */
function _finMultiOpt(sel, label) {
  return sel.size > 1
    ? `<option value="${_FIN_MULTI}" selected>${escapeHtml(label)} ${sel.size}개 선택</option>` : '';
}

/** 표에서 값을 눌러 켜고 끈다 — 같은 값을 다시 누르면 해제. 여러 개가 쌓이면 OR */
function toggleFinCellFilter(col, val) {
  const sel = _finCatSel(col);
  if (sel.has(val)) sel.delete(val); else sel.add(val);
  _renderFinView();
}

/** 현재 로드된 행에서 그 열의 값별 건수 — 팝오버 목록용 */
function _finCatCounts(col) {
  const cnt = {};
  (FIN.raw || []).forEach(r => {
    const v = _finCellVal(r, col);
    (Array.isArray(v) ? v : [v]).forEach(x => {
      if (x == null || x === '') return;
      cnt[x] = (cnt[x] || 0) + 1;
    });
  });
  return cnt;
}

/** 이 열에 필터가 걸려 있나 (버튼 강조용) */
function _finColActive(col) {
  const kind = _finFilterKind(col);
  if (kind === 'cat')  return _finCatSel(col).size;
  if (kind === 'text') return (F.textF?.[col] || '').trim() ? 1 : 0;
  return (F.numFilters || []).some(f => f.col === col) ? 1 : 0;
}

// ── 열 헤더 ▾ 필터 ─────────────────────────────────────────────────────────
function _colFilterBtn(col, label) {
  const kind = _finFilterKind(col);
  const n    = _finColActive(col);
  const cnt  = kind === 'cat' && n > 1 ? n : '';
  return `<span class="col-filter-btn${n ? ' on' : ''}" data-no-detail`
    + ` onclick="event.stopPropagation();toggleFinColFilter('${col}',event,'${escJsStr(label)}')"`
    + ` title="${n ? '필터 걸림 — 눌러서 변경' : '이 열로 거르기'}">▾${cnt}</span>`;
}

function toggleFinColFilter(col, ev, label) {
  const old  = document.getElementById('fin-col-filter');
  const same = old && old.dataset.col === col;
  old?.remove();
  if (same) return;                     // 같은 버튼을 다시 누르면 닫기

  const kind = _finFilterKind(col);
  const box  = document.createElement('div');
  box.id = 'fin-col-filter';
  box.dataset.col = col;
  box.className = 'col-filter';
  box.innerHTML = `<div class="col-filter-head">${escapeHtml(label || col)}</div>`
    + (kind === 'cat' ? _finCatBody(col) : kind === 'text' ? _finTextBody(col) : _finNumBody(col));
  document.body.appendChild(box);

  // 표가 가로로 스크롤되는 영역 안이라 헤더 셀에 넣으면 잘린다 → body에 fixed로 띄운다.
  // 위아래 모두 뷰포트 안으로 가둔다 — 아래쪽만 막으면 버튼이 화면 위로 스크롤됐을 때
  // top이 음수가 돼 팝오버가 통째로 사라진다(실측).
  const r = ev.target.getBoundingClientRect();
  box.style.left = Math.max(8, Math.min(r.left, window.innerWidth - box.offsetWidth - 8)) + 'px';
  box.style.top  = Math.max(8, Math.min(r.bottom + 4, window.innerHeight - box.offsetHeight - 8)) + 'px';
  box.querySelector('input')?.focus();
}

/** 범주 — 값 목록 체크 */
function _finCatBody(col) {
  const cnt  = _finCatCounts(col);
  const sel  = _finCatSel(col);
  const list = Object.entries(cnt).sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0], 'ko'));
  sel.forEach(v => { if (!(v in cnt)) list.push([v, 0]); });   // 범위 밖 선택값도 남긴다
  return `<input class="form-input col-filter-q" placeholder="값 검색..."
            oninput="_finColFilterSearch(this.value)">`
    + `<div class="col-filter-list">`
    + (list.length ? list.map(([v, c]) =>
        `<label class="col-filter-item"><input type="checkbox" value="${escAttr(v)}"`
        + `${sel.has(v) ? ' checked' : ''} onchange="_finColFilterToggle('${col}',this)">`
        + `<span>${escapeHtml(v)}</span><span class="col-filter-cnt">${c}</span></label>`).join('')
       : `<div class="col-filter-hint" style="padding:6px">값이 없습니다</div>`)
    + `</div>`
    + `<div class="col-filter-foot">`
    + `<button class="chip chip-sm" onclick="_finColFilterClear('${col}')">모두 해제</button>`
    + `<span class="col-filter-hint">여러 개 = 그중 아무거나</span>`
    + `</div>`;
}

/** 숫자 — 최소~최대. 단위는 지표 목록에 정의된 배율을 따른다(억 단위 등) */
function _finNumBody(col) {
  const cur  = (F.numFilters || []).find(f => f.col === col) || {};
  const def  = _finNumCols().find(c => c[0] === col);
  const unit = def ? (def[1].match(/\(([^)]+)\)/)?.[1] || '') : '';
  return `<div class="col-filter-num">`
    + `<input class="form-input" id="cf-min" type="number" inputmode="decimal" placeholder="최소"`
    + ` value="${cur.min ?? ''}" onkeydown="if(event.key==='Enter')_finNumApply('${col}')">`
    + `<span>~</span>`
    + `<input class="form-input" id="cf-max" type="number" inputmode="decimal" placeholder="최대"`
    + ` value="${cur.max ?? ''}" onkeydown="if(event.key==='Enter')_finNumApply('${col}')">`
    + `</div>`
    + `<div class="col-filter-foot">`
    + `<button class="chip chip-sm" onclick="_finNumApply('${col}')">적용</button>`
    + `<button class="chip chip-sm" onclick="_finNumClear('${col}')">해제</button>`
    + `<span class="col-filter-hint">${unit ? escapeHtml(unit) + ' 단위' : '한쪽만 넣어도 됩니다'}</span>`
    + `</div>`;
}

/** 문자 — 부분 일치 */
function _finTextBody(col) {
  const cur = F.textF?.[col] || '';
  return `<input class="form-input col-filter-q" placeholder="포함할 글자"
            value="${escAttr(cur)}" oninput="_finTextApply('${col}',this.value)">`
    + `<div class="col-filter-foot">`
    + `<button class="chip chip-sm" onclick="_finTextApply('${col}','')">해제</button>`
    + `<span class="col-filter-hint">부분 일치</span>`
    + `</div>`;
}

function _finColFilterToggle(col, cb) {
  const sel = _finCatSel(col);
  if (cb.checked) sel.add(cb.value); else sel.delete(cb.value);
  _renderFinView();
}

function _finColFilterClear(col) {
  _finCatSel(col).clear();
  document.querySelectorAll('#fin-col-filter input[type=checkbox]')
    .forEach(c => { c.checked = false; });
  _renderFinView();
}

function _finNumApply(col) {
  const box = document.getElementById('fin-col-filter');
  if (!box) return;
  if (_finNumSet(col, box.querySelector('#cf-min').value, box.querySelector('#cf-max').value)) {
    _renderFinView();
  }
}

function _finNumClear(col) {
  F.numFilters = (F.numFilters || []).filter(f => f.col !== col);
  const box = document.getElementById('fin-col-filter');
  if (box) box.querySelectorAll('input[type=number]').forEach(i => { i.value = ''; });
  _renderFinView();
}

// 문자 필터는 타이핑마다 2,500행을 다시 거르므로 잠깐 모아서 한 번만 돈다
let _finTextTimer = null;
function _finTextApply(col, v) {
  F.textF = F.textF || {};
  const t = (v || '').trim();
  if (t) F.textF[col] = t; else delete F.textF[col];
  clearTimeout(_finTextTimer);
  _finTextTimer = setTimeout(_renderFinView, 250);
}

function _finColFilterSearch(q) {
  const t = (q || '').trim().toLowerCase();
  document.querySelectorAll('#fin-col-filter .col-filter-item').forEach(el => {
    el.style.display = !t || el.innerText.toLowerCase().includes(t) ? '' : 'none';
  });
}

// 바깥을 누르면 닫는다 (헤더 버튼은 stopPropagation 하므로 여기 걸리지 않는다)
document.addEventListener('click', e => {
  const box = document.getElementById('fin-col-filter');
  if (box && !box.contains(e.target)) box.remove();
});

/**
 * 헤더 한 칸 — 정렬 + 이 열로 거르기.
 * 필터 양식(체크·범위·부분일치)은 컬럼 성격에서 자동으로 정해진다(FIN_FILTER_KIND).
 * @param {object} [o] {src: 출처 배지, extra: 뒤에 붙일 것(상세 펼침 버튼 등)}
 */
const _th = (col, label, o = {}) =>
  _sortBtn(col, label, o.src) + _colFilterBtn(col, label) + (o.extra || '');

/**
 * 공통 정렬 버튼 생성
 * @param {string} col   정렬 키
 * @param {string} label 표시 레이블
 * @returns {string} HTML 문자열
 */
// src 배지: 'D'=DART, 'C'=계산(DB), 'K'=KIS API
const _SRC = {
  D: '<sup style="font-size:calc(8px*var(--m-label));color:var(--green);font-weight:700;margin-left:1px">D</sup>',
  C: '<sup style="font-size:calc(8px*var(--m-label));color:var(--yellow);font-weight:700;margin-left:1px">C</sup>',
  K: '<sup style="font-size:calc(8px*var(--m-label));color:var(--tg);font-weight:700;margin-left:1px">K</sup>',
};
function _sortBtn(col, label, src) {
  const active = F.sortBy === col;
  const icon   = active ? (F.sortDir === 'desc' ? ' ↓' : ' ↑') : '';
  const clr    = active ? 'color:var(--tg);' : '';
  const badge  = src ? (_SRC[src] || '') : '';
  return `<span style="cursor:pointer;white-space:nowrap;${clr}user-select:none"
    onclick="_sortFin('${col}')"
  >${label}${badge}${icon}</span>`;
}

/**
 * 정렬 토글 — 다른 컬럼을 누르면 내림차순부터, 같은 컬럼을 다시 누르면 방향 전환.
 * (구 인라인 코드는 F.sortBy를 먼저 대입한 뒤 비교해 조건이 항상 참 → 새 컬럼을 눌러도
 *  직전 방향을 물려받았다. 비교를 대입보다 앞에 둬 바로잡음.)
 * 재조회 없이 캐시된 행만 다시 정렬·렌더한다.
 */
function _sortFin(col) {
  F.sortDir = (F.sortBy === col && F.sortDir === 'desc') ? 'asc' : 'desc';
  F.sortBy  = col;
  _renderFinView();
}

/**
 * 공통 정렬 적용
 * @param {Array}  rows
 * @param {string} defaultCol 기본 정렬 컬럼
 * @returns {Array} 정렬된 rows
 */
function _sortRows(rows, defaultCol = 'market_cap') {
  const col = F.sortBy || defaultCol;
  const dir = F.sortDir === 'asc' ? 1 : -1;
  // 빈 값은 방향과 무관하게 항상 뒤로 — 구현이 `?? -Infinity`라 오름차순에서
  // 데이터 없는 종목이 맨 앞을 차지하던 문제를 함께 해소
  const isEmpty = v => v == null || v === '';
  return rows.sort((a, b) => {
    const av = a[col], bv = b[col];
    if (isEmpty(av) || isEmpty(bv)) {
      if (isEmpty(av) && isEmpty(bv)) return 0;
      return isEmpty(av) ? 1 : -1;
    }
    // 문자열(종목명·산업·날짜·코드)은 한국어 정렬, 그 외 숫자·불리언은 수치 비교
    if (typeof av === 'string' || typeof bv === 'string') {
      return String(av).localeCompare(String(bv), 'ko') * dir;
    }
    return ((+av) - (+bv)) * dir;
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
 * 전 종목 산업 메타 맵 (code → {ind, sub, sector}) — 1회 조회 후 FIN 캐시
 * getIndustryMap()은 모니터링 종목(약 313개)만 담아 '전체' 범위에선 산업이 대부분 비어버린다.
 * 실측(2026-09): industry 실값 1,361/2,661 · sub_industry 535 · sector(DART) 2,651.
 * @returns {Promise<Object>} 조회 실패 시 빈 객체(산업 컬럼만 '—'로 비고 표는 정상 렌더)
 */
async function _getCompanyMetaMap() {
  if (FIN.metaMap) return FIN.metaMap;
  const map = {};
  try {
    const rows = await fetchAllPages(
      sb.from('companies').select('code,industry,sub_industry,wics_industry,wics_code')
        .eq('active', true).order('code')
    );
    // companies.code는 일부만 .KS/.KQ 접미사 — market_data의 bare 코드와 맞춘다
    rows.forEach(c => {
      map[c.code.replace(/\.(KS|KQ)$/, '')] = {
        raw:   c.code,                  // 저장 시 where 절용 원본 코드(.KS/.KQ 포함 가능)
        ind:   c.industry      || '',   // 테마 (큐레이션, 일부 종목)
        sub:   c.sub_industry  || '',   // 세부 테마
        wics:  c.wics_industry || '',   // 업종 (WICS, 전 종목)
        wcode: c.wics_code     || '',   // 'G453010' — 앞 3자리가 대분류
      };
    });
  } catch (e) {
    console.warn('[기업분석] 업종·테마 메타 로드 실패 — 해당 컬럼 비움', e);
  }
  FIN.metaMap = map;
  return map;
}

// WICS 대분류 (wics_code 앞 3자리) — GICS 표준 섹터명
const WICS_SECTORS = {
  G10: '에너지',   G15: '소재',     G20: '산업재',   G25: '경기소비재', G30: '필수소비재',
  G35: '건강관리', G40: '금융',     G45: 'IT',       G50: '커뮤니케이션', G55: '유틸리티',
};

/**
 * 업종 셀 — WICS 소분류(전 종목 동일 기준). 대분류는 title로 보조 표기.
 * 테마와 한 칸에 섞지 않는다 — 기준이 다른 값이 한 컬럼에 섞이면 정렬·집계가 무의미해진다.
 * @param {Object} [m] _getCompanyMetaMap()의 종목 메타
 * @returns {string} td HTML
 */
function _wicsCell(m) {
  if (!m || !m.wics) return '<td style="color:var(--text3)">—</td>';
  const sec = WICS_SECTORS[(m.wcode || '').slice(0, 3)];
  // title에는 원본명을 남긴다 — 별칭이 어떤 WICS 업종인지 확인할 수 있어야 한다
  const tip = [sec, m.wics].filter(Boolean).join(' > ');
  // 값을 누르면 그 업종만 본다. 여러 행에서 눌러 여러 업종을 쌓을 수 있다(같은 축 안은 OR).
  // data-no-detail: 행 클릭 위임(data-stock-open)이 종목 상세를 열지 않도록 막는다.
  const on = _finCatSel('_wics').has(m.wics);
  return `<td style="white-space:nowrap" title="${escAttr(tip)}">`
    + `<span class="badge badge-cat fin-cell-pick${on ? ' fin-cell-on' : ''}" data-no-detail`
    + ` onclick="toggleFinCellFilter('_wics','${escJsStr(m.wics)}')"`
    + ` title="${escAttr(tip)} — 눌러서 이 업종만 보기">${escapeHtml(m.wics)}</span></td>`;
}

/**
 * 테마 셀 — 큐레이션한 투자 테마 + 세부 테마. 없는 게 정상(전 종목에 붙일 성격이 아니다).
 * @param {Object} [m] _getCompanyMetaMap()의 종목 메타
 * @returns {string} td HTML
 */
function _themeCell(m, code) {
  // 테마는 큐레이션 값이라 표에서 바로 고칠 수 있게 한다(editor 이상).
  // 업종(WICS)은 외부 수집값이라 편집 대상이 아니다 — 고쳐도 다음 수집에 덮인다.
  const editable = typeof canEdit !== 'function' || canEdit();
  // 값을 누르면 그 테마로 거른다 — 값 클릭이 필터와 편집 둘 다일 수는 없어서
  // 편집은 ✎ 로 옮겼다(셀 전체 클릭 → 편집이던 기존 동작을 대체).
  const pen = editable && code
    ? ` <span data-no-detail onclick="startThemeEdit(this.closest('td'),'${escJsStr(code)}')"`
      + ` title="테마 수정" style="cursor:pointer;color:var(--text3)">✎</span>`
    : '';
  if (!m || !m.ind) {
    return `<td style="white-space:nowrap;color:var(--text3)">—${pen}</td>`;
  }
  const on  = _finCatSel('_ind').has(m.ind);
  const sub = m.sub
    ? `<div style="font-size:calc(11px*var(--m-label));color:var(--text2);margin-top:2px">${escapeHtml(m.sub)}</div>`
    : '';
  return `<td style="white-space:nowrap;font-size:calc(12px*var(--m-sub))">`
    + `<span class="fin-cell-pick${on ? ' fin-cell-on' : ''}" data-no-detail`
    + ` onclick="toggleFinCellFilter('_ind','${escJsStr(m.ind)}')"`
    + ` title="눌러서 이 테마만 보기" style="color:var(--tg)">${escapeHtml(m.ind)}</span>${pen}${sub}</td>`;
}

/** 현재 metaMap에서 쓰이고 있는 테마 목록 (상수 밖 값도 포함) */
function _themeOptions() {
  const extra = [...new Set(Object.values(FIN.metaMap || {}).map(m => m.ind).filter(Boolean))]
    .filter(v => !INDUSTRIES.includes(v)).sort((a, b) => a.localeCompare(b, 'ko'));
  return ['', ...INDUSTRIES, ...extra];
}

/** 특정 테마에 이미 쓰이는 세부테마 목록 — 자유 입력이라 datalist 제안으로만 쓴다 */
function _subOptions(theme) {
  return [...new Set(Object.values(FIN.metaMap || {})
    .filter(m => m.sub && (!theme || m.ind === theme)).map(m => m.sub))]
    .sort((a, b) => a.localeCompare(b, 'ko'));
}

/**
 * 테마 셀을 편집 폼으로 교체 — 테마(select) + 세부테마(자유 입력 + 제안).
 * 세부테마는 113종이라 고정 목록이 아니다. datalist로 기존 값을 제안하되 새 값도 받는다.
 * 두 값을 한 번에 저장(✓)해 테마만 바뀌고 세부가 남는 중간 상태를 만들지 않는다.
 */
function startThemeEdit(td, code) {
  if (td.querySelector('select')) return;          // 이미 편집 중
  const m = FIN.metaMap?.[code] || {};
  const cur = m.ind || '', curSub = m.sub || '';
  const opts = _themeOptions()
    .map(v => `<option value="${escAttr(v)}"${v === cur ? ' selected' : ''}>${v ? escapeHtml(v) : '(없음)'}</option>`)
    .join('');
  const listId = 'fin-sub-list';
  td.dataset.prev = td.innerHTML;
  td.dataset.code = code;
  td.innerHTML =
    `<div style="display:flex;gap:3px;align-items:center" onclick="event.stopPropagation()">
      <select class="form-select fin-edit-ind" style="width:88px;padding:2px 4px;font-size:calc(11px*var(--m-label))"
        onchange="_refreshSubList(this)">${opts}</select>
      <input class="form-input fin-edit-sub" list="${listId}" value="${escAttr(curSub)}" placeholder="세부"
        style="width:88px;padding:2px 4px;font-size:calc(11px*var(--m-label))"
        onkeydown="if(event.key==='Enter'){event.preventDefault();commitThemeEdit(this)}
                   else if(event.key==='Escape'){cancelThemeEdit(this)}">
      <datalist id="${listId}"></datalist>
      <span onclick="commitThemeEdit(this)" title="저장"
        style="cursor:pointer;padding:0 4px;color:var(--green);font-weight:700">✓</span>
      <span onclick="cancelThemeEdit(this)" title="취소"
        style="cursor:pointer;padding:0 3px;color:var(--text3)">✕</span>
    </div>`;
  _refreshSubList(td.querySelector('.fin-edit-ind'));
  td.querySelector('.fin-edit-ind').focus();
}

/** 선택된 테마에 맞춰 세부테마 제안 목록을 갈아끼운다 */
function _refreshSubList(el) {
  const td = el.closest('td');
  const dl = td?.querySelector('datalist');
  if (!dl) return;
  const theme = td.querySelector('.fin-edit-ind')?.value || '';
  dl.innerHTML = _subOptions(theme).map(v => `<option value="${escAttr(v)}">`).join('');
}

function cancelThemeEdit(el) {
  const td = el.closest('td');
  if (td && td.dataset.prev != null) { td.innerHTML = td.dataset.prev; delete td.dataset.prev; }
}

/** ✓ 또는 Enter — 테마·세부테마를 함께 저장 */
function commitThemeEdit(el) {
  const td = el.closest('td');
  if (!td) return;
  saveTheme(td.dataset.code, td.querySelector('.fin-edit-ind')?.value || '',
                             td.querySelector('.fin-edit-sub')?.value || '');
}

/**
 * 테마·세부테마 저장 — DB 반영 후 캐시(metaMap·indMap·행 정렬키)까지 맞춘 뒤 다시 그린다.
 * 두 값을 한 번의 UPDATE로 보내 '테마만 바뀌고 세부는 옛 값'인 중간 상태를 만들지 않는다.
 */
async function saveTheme(code, value, sub) {
  const m = FIN.metaMap?.[code];
  if (!m) return;
  const v = (value || '').trim();
  // 테마가 없으면 세부도 있을 수 없다 — 소속 없는 세부는 모순
  const sv = v ? (sub || '').trim() : '';
  if (v === m.ind && sv === m.sub) { _renderFinView(); return; }

  try {
    // .select()로 실제 갱신된 행을 되받는다 — RLS가 막으면 오류 없이 0건만 반환하므로,
    // 이를 확인하지 않으면 화면만 바뀌고 DB는 그대로인 상태를 성공으로 오인한다
    // (비로그인 anon으로 실측: HTTP 200 + 빈 배열).
    const { data, error } = await sb.from('companies')
      .update({ industry: v, sub_industry: sv })
      .eq('code', m.raw || code).select('code');
    if (error) throw error;
    if (!data || !data.length) throw new Error('권한이 없거나 대상 종목을 찾지 못했습니다');
  } catch (e) {
    toast('테마 저장 실패: ' + (e.message || e), 'error');
    _renderFinView();   // 캐시를 건드리기 전이라 원래 값으로 되돌아간다
    return;
  }

  m.ind = v; m.sub = sv;
  if (v) FIN.indMap[code] = v; else delete FIN.indMap[code];
  (FIN.raw || []).forEach(r => { if (r.stock_code === code) r._ind = v; });  // 정렬키 동기화
  _renderFinView();
  toast(v ? `${v}${sv ? ' · ' + sv : ''}` : '테마 비움', 'success');
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
    <table style="border-collapse:collapse;width:max-content;min-width:100%;font-size:calc(13px*var(--m-body))">
      <thead>
        <tr>
          ${headers.map((h, i) => `<th style="
            position:sticky;top:0;z-index:${i === 0 ? 3 : 2};
            background-color:var(--bg2);   /* 단축 background는 background-image를 리셋해 상세열 음영이 죽는다 */
            border-bottom:2px solid var(--border2);
            text-align:left;padding:9px 12px;
            font-size:calc(11px*var(--m-label));font-weight:600;color:var(--text1);
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
/** 한 번에 그리는 행 수 — 2,600행을 통째로 그리면 셀 11만 개라 첫 렌더가 수 초 걸린다 */
const FIN_CHUNK = 150;

// ══════════════════════════════════════════
//  컬럼 그룹 — 40여 개를 한 번에 보여주지 않고 용도별로 켜고 끈다.
//  숨김은 행 템플릿을 고치지 않고 nth-child CSS로 처리 → 두 탭에 그대로 적용되고
//  스크롤로 이어붙인 행에도 자동 반영된다.
//  ⚠ cols는 헤더 라벨과 정확히 일치해야 한다(정렬 화살표·출처 배지는 떼고 비교).
// ══════════════════════════════════════════
const FIN_COL_GROUPS = {
  market: [
    { key:'id',    name:'식별', always:true,
      cols:['종목명','코드','시장','업종','테마'] },
    // 거래량·거래대금은 '현재가 +' 상세로 들어가 거래 칩이 비어버리므로 시세로 흡수
    { key:'price', name:'시세',
      cols:['시가총액','현재가','전일대비','고가','저가','거래량','거래량증감률','등락률','1주','1달','3달','거래대금'] },
    { key:'val',   name:'밸류',
      cols:['PER','PBR','EPS','BPS'] },
    { key:'flow',  name:'수급',
      cols:['외국인보유율','외국인보유수','외국인순매수','프로그램순매수','융자잔고율','공매도수량'] },
    { key:'w52',   name:'52주',
      cols:['52주고가','52주저가','52주고가일','52주저가일','52주고가대비%','52주저가대비%'] },
    { key:'stat',  name:'상태',
      cols:['경고','신고가구분'] },
    { key:'etc',   name:'참고',
      cols:['상장주수','거래량회전율','결산월','기준일'] },
  ],
  financial: [
    { key:'id',    name:'식별', always:true,
      cols:['종목명','코드','연도','분기','구분'] },
    { key:'pl',    name:'손익',
      cols:['매출액','매출총이익','매출원가','판관비','R&D','영업이익','기타영업수익','기타영업비용','세전이익','당기순이익'] },
    { key:'bs',    name:'재무상태',
      cols:['자산총계','부채총계','자본총계','유동자산','유동부채','비유동자산','자본금','이익잉여금'] },
    { key:'cf',    name:'현금흐름',
      cols:['영업현금흐름','투자현금흐름','재무현금흐름','CapEx(유형)','CapEx(무형)','CapEx합계','감가상각비','무형상각비','D&A','EBITDA','FCF'] },
    { key:'ratio', name:'비율',
      cols:['GPM','OPM','NPM','매출원가율','판관비율','부채비율','유동비율','ROE','ROA'] },
  ],
};

const FIN_COLS_LS = 'bati-fin-cols';

// ── 헤더 '+' 로 펼치는 상세 컬럼 ────────────────────────────────────────────
// 컬럼 칩과 층위가 다르다:
//   칩  = 용도별 묶음을 통째로 켜고 끄기 (수급을 볼지 말지)
//   '+' = 켜진 묶음 안에서 상세를 펼지 말지 (현재가는 보되 고가·저가까지 볼지)
// 대표 컬럼 하나만 남기고 부속은 기본 접힘 — 36열 중 8열이 접혀 28열로 시작한다.
const FIN_EXPAND_GROUPS = {
  market: [
    { key: 'price', lead: '현재가',
      // 가격 상세 + 거래 상세. 거래대금은 유동성 확인용으로 늘 보는 값이라 제외.
      // 접으면 시가총액·현재가·등락률·거래대금만 남는다
      cols: ['전일대비', '고가', '저가', '거래량', '거래량증감률'] },
    { key: 'ret',   lead: '등락률',
      // 당일 등락률이 대표값, 기간 수익률은 추세 확인용.
      // 3달은 64거래일 이력이 필요해 모니터링 종목 위주로만 채워진다(전체의 12%)
      cols: ['1주', '1달', '3달'] },
    { key: 'frgn',  lead: '외국인보유율',
      // 보유율(%)이 대표값, 보유수(주)는 절대 규모라 필요할 때만
      cols: ['외국인보유수'] },
    { key: 'w52',   lead: '52주고가',
      // 52주 고가 셀에 이미 위치 프로그레스 바가 있어 대표값으로 충분하다
      cols: ['52주저가', '52주고가일', '52주저가일', '52주고가대비%', '52주저가대비%'] },
  ],
  financial: [],
};
const FIN_EXPAND_LS = 'bati-fin-expand';

// ── 지표 범위 필터 ──────────────────────────────────────────────────────────
// [컬럼, 라벨, 입력배율]. 배율은 '입력값 × 배율 = DB값' — 시가총액·거래대금을 원 단위로
// 입력하게 하면 자릿수가 비현실적이라 억 단위로 받는다.
const FIN_NUM_COLS = {
  // [컬럼, 라벨, 배율, 그룹]. 그룹은 select의 <optgroup> — 19개를 평면으로 늘어놓으면
  // PER 말고 무엇이 있는지 드러나지 않아 첫 항목만 쓰게 된다.
  market: [
    ['per',               'PER',              1,   '밸류'],
    ['pbr',               'PBR',              1,   '밸류'],
    ['eps',               'EPS(원)',          1,   '밸류'],
    ['bps',               'BPS(원)',          1,   '밸류'],
    ['market_cap',        '시가총액(억)',      1e8, '시세'],
    ['price',             '현재가(원)',        1,   '시세'],
    ['price_change_rate', '등락률(%)',        1,   '시세'],
    ['week_return',       '1주수익률(%)',      1,   '시세'],
    ['month_return',      '1달수익률(%)',      1,   '시세'],
    ['quarter_return',    '3달수익률(%)',      1,   '시세'],
    ['volume',            '거래량(주)',        1,   '거래'],
    ['volume_change_rate','거래량증감률(%)',   1,   '거래'],
    ['trading_value',     '거래대금(억)',      1e8, '거래'],
    ['vol_turnover',      '거래량회전율(%)',   1,   '거래'],
    ['foreign_hold_rate', '외국인보유율(%)',   1,   '수급'],
    ['foreign_net_buy',   '외국인순매수',      1,   '수급'],
    ['loan_balance_rate', '융자잔고율(%)',     1,   '수급'],
    ['_w52HighPct',       '52주고가대비(%)',   1,   '52주'],
    ['_w52LowPct',        '52주저가대비(%)',   1,   '52주'],
  ],
  financial: [
    ['revenue',          '매출액(억)',    1e8, '손익'],
    ['operating_profit', '영업이익(억)',  1e8, '손익'],
    ['net_income',       '당기순이익(억)', 1e8, '손익'],
    ['ebitda',           'EBITDA(억)',   1e8, '현금흐름'],
    ['fcf',              'FCF(억)',      1e8, '현금흐름'],
    ['operating_margin', 'OPM(%)',       1,   '비율'],
    ['net_margin',       'NPM(%)',       1,   '비율'],
    ['roe',              'ROE(%)',       1,   '비율'],
    ['roa',              'ROA(%)',       1,   '비율'],
    ['debt_ratio',       '부채비율(%)',   1,   '비율'],
    ['current_ratio',    '유동비율(%)',   1,   '비율'],
  ],
};

function _finNumCols() {
  return FIN_NUM_COLS[F.mode === 'financial' ? 'financial' : 'market'] || [];
}

/** 지표 필터 추가 — 최소·최대 중 하나만 넣어도 된다 */
/**
 * 숫자 범위 조건 설정 — 상단 지표 필터와 열 헤더 ▾ 가 함께 쓴다.
 * 라벨·배율은 지표 목록(FIN_NUM_COLS)에서 찾고, 목록에 없는 열이면 넘겨받은 라벨을 쓴다
 * (표에는 지표 목록에 없는 숫자 열도 있다 — 고가·저가·상장주수 등).
 * @returns {boolean} 조건이 실제로 설정됐는지
 */
function _finNumSet(col, rawMin, rawMax, label) {
  const min = rawMin === '' ? null : Number(rawMin);
  const max = rawMax === '' ? null : Number(rawMax);
  if (min == null && max == null) { toast('최소 또는 최대를 입력하세요', 'error'); return false; }
  if (min != null && max != null && min > max) { toast('최소가 최대보다 큽니다', 'error'); return false; }
  const def = _finNumCols().find(c => c[0] === col);
  F.numFilters = (F.numFilters || []).filter(f => f.col !== col);   // 같은 컬럼은 교체
  F.numFilters.push({
    col, label: def ? def[1] : (label || col), scale: def ? def[2] : 1, min, max,
  });
  return true;
}

function addFinNumFilter() {
  const col = document.getElementById('fin-num-col')?.value;
  if (!col) return;
  const minEl = document.getElementById('fin-num-min');
  const maxEl = document.getElementById('fin-num-max');
  if (!_finNumSet(col, minEl.value, maxEl.value)) return;
  minEl.value = '';
  maxEl.value = '';
  _renderFinView();
}

function removeFinNumFilter(col) {
  F.numFilters = (F.numFilters || []).filter(f => f.col !== col);
  _renderFinView();
}

function clearFinNumFilters() {
  F.numFilters = [];
  _renderFinView();
}

/** 컬럼 목록·조건 칩 갱신 (탭마다 지표가 다르다) */
function _syncFinNumFilter() {
  const sel = document.getElementById('fin-num-col');
  if (sel) {
    const cur = sel.value;
    // 그룹(optgroup)으로 묶어 연다 — 평면 목록이면 맨 위 PER만 눈에 들어온다
    const groups = [];
    _finNumCols().forEach(([c, l, , g]) => {
      const key = g || '기타';
      let grp = groups.find(x => x[0] === key);
      if (!grp) { grp = [key, []]; groups.push(grp); }
      grp[1].push([c, l]);
    });
    sel.innerHTML = groups.map(([g, items]) =>
      `<optgroup label="${escAttr(g)}">`
      + items.map(([c, l]) =>
          `<option value="${escAttr(c)}"${c === cur ? ' selected' : ''}>${escapeHtml(l)}</option>`).join('')
      + `</optgroup>`).join('');
  }
  const box = document.getElementById('fin-num-chips');
  if (!box) return;
  const fs = F.numFilters || [];
  box.innerHTML = fs.map(f => {
    const range = f.min != null && f.max != null ? `${f.min}~${f.max}`
                : f.min != null ? `${f.min}↑` : `${f.max}↓`;
    return `<span class="chip chip-sm active" style="cursor:default">${escapeHtml(f.label)} ${range}`
      + `<span onclick="removeFinNumFilter('${escJsStr(f.col)}')" title="조건 제거"
         style="cursor:pointer;margin-left:5px;font-weight:700">✕</span></span>`;
  }).join('') + (fs.length > 1
    ? `<button class="chip chip-sm" onclick="clearFinNumFilters()">조건 비우기</button>` : '');
  if (!fs.length) {
    box.innerHTML = `<span style="font-size:calc(11px*var(--m-label));color:var(--text3)">`
      + `PER·PBR·ROE 등 ${_finNumCols().length}개 지표 — 여러 조건을 겹쳐 걸 수 있습니다</span>`;
  }
}

function _finExpandGroups() {
  return FIN_EXPAND_GROUPS[F.mode === 'financial' ? 'financial' : 'market'] || [];
}

/** 펼쳐둔 그룹 키 Set (기본: 전부 접힘) */
function _finExpanded() {
  const m = F.mode === 'financial' ? 'financial' : 'market';
  FIN.expanded = FIN.expanded || {};
  if (!FIN.expanded[m]) {
    let saved = [];
    try { saved = (JSON.parse(localStorage.getItem(FIN_EXPAND_LS)) || {})[m] || []; } catch (e) {}
    FIN.expanded[m] = new Set(saved);
  }
  return FIN.expanded[m];
}

function toggleFinExpand(key) {
  const s = _finExpanded();
  s.has(key) ? s.delete(key) : s.add(key);
  try {
    const all = {};
    Object.entries(FIN.expanded || {}).forEach(([m, v]) => { all[m] = [...v]; });
    localStorage.setItem(FIN_EXPAND_LS, JSON.stringify(all));
  } catch (e) { /* 사생활 모드 */ }
  _renderFinView();   // 헤더 기호·숨김이 함께 바뀌므로 통째로 다시 그린다
}

/**
 * 대표 컬럼 헤더 뒤에 붙는 펼침 버튼.
 * _sortBtn이 만든 정렬 span **밖에** 두어 클릭이 정렬로 새지 않게 한다.
 */
function _expandBtn(key, n) {
  const on = _finExpanded().has(key);
  return `<span onclick="toggleFinExpand('${key}')" title="${on ? '상세 접기' : `상세 ${n}열 펼치기`}"
    style="cursor:pointer;user-select:none;margin-left:4px;padding:0 3px;border-radius:3px;
    border:1px solid var(--border);color:var(--text2);font-weight:700">${on ? '−' : '+'}</span>`;
}

// ── 표 글자 크기 ────────────────────────────────────────────────────────────
// 전역 조절(설정 페이지)은 document 전체 zoom이라 사이드바까지 같이 커진다.
// 표는 36열짜리라 "더 많이 보려고 줄이거나" "읽으려고 키우는" 요구가 따로 있어,
// #fin-table에만 --m-* 배율을 덮어쓴다. 표 안의 font-size는 전부
// calc(NNpx*var(--m-역할)) 규약이라 변수만 바꾸면 일괄로 따라온다.
const FIN_FONT_LS = 'bati-fin-font';
const FIN_FONT_MIN = 70, FIN_FONT_MAX = 130, FIN_FONT_STEP = 10;

function _finFontPct() {
  const v = Math.round(Number(localStorage.getItem(FIN_FONT_LS)));
  return Number.isFinite(v) && v ? Math.min(FIN_FONT_MAX, Math.max(FIN_FONT_MIN, v)) : 100;
}

// --fs-* 의 기준 px과 대응 역할 (style.css :root 정의와 같이 유지할 것)
const FIN_FS_BASE = { '--fs-data': [12, 'sub'], '--fs-label': [11, 'label'],
                      '--fs-value': [15, 'title'], '--fs-big': [22, 'title'] };

/**
 * 배율을 표 컨테이너에 적용 — 내부 재렌더와 무관하게 유지되도록 #fin-table에 건다.
 *
 * --m-* 만 덮어써선 안 된다. style.css의 `td { font-size: var(--fs-data) }` 계열은
 * --fs-data 가 :root에서 이미 calc(12px*1)로 **확정된 뒤 상속**되므로, 하위에서
 * --m-sub 를 바꿔도 반영되지 않는다(실측: table은 커지는데 td는 12px 고정).
 * 그래서 --fs-* 도 함께 덮어쓴다.
 *
 * 또한 전역 역할별 배율(설정 페이지, config.js)이 따로 있으므로 **곱해서** 합성한다.
 */
function _applyFinFont() {
  const el = document.getElementById('fin-table');
  if (!el) return;
  const r = _finFontPct() / 100;
  const rootCs = getComputedStyle(document.documentElement);
  const g = k => parseFloat(rootCs.getPropertyValue(`--m-${k}`)) || 1;   // 전역 역할 배율

  ['title', 'body', 'sub', 'label'].forEach(k =>
    el.style.setProperty(`--m-${k}`, r === 1 ? '' : String(g(k) * r)));
  Object.entries(FIN_FS_BASE).forEach(([v, [px, role]]) =>
    el.style.setProperty(v, r === 1 ? '' : `calc(${px}px*${g(role) * r})`));

  const out = document.getElementById('fin-font-val');
  if (out) out.textContent = _finFontPct() + '%';
  _setFinTableHeight();   // 행 높이가 바뀌므로 표 높이 재계산
}

function setFinFont(pct) {
  const v = Math.min(FIN_FONT_MAX, Math.max(FIN_FONT_MIN, Math.round(pct)));
  try { localStorage.setItem(FIN_FONT_LS, String(v)); } catch (e) { /* 사생활 모드 */ }
  _applyFinFont();
}

function stepFinFont(delta) { setFinFont(_finFontPct() + delta * FIN_FONT_STEP); }

/** 현재 탭의 그룹 정의 */
function _finGroups() {
  return FIN_COL_GROUPS[F.mode === 'financial' ? 'financial' : 'market'] || [];
}

/** 현재 탭에서 꺼둔 그룹 키 Set */
function _finColsOff() {
  const m = F.mode === 'financial' ? 'financial' : 'market';
  FIN.colsOff = FIN.colsOff || {};
  if (!FIN.colsOff[m]) {
    let saved = [];
    try { saved = (JSON.parse(localStorage.getItem(FIN_COLS_LS)) || {})[m] || []; } catch (e) {}
    FIN.colsOff[m] = new Set(saved);
  }
  return FIN.colsOff[m];
}

function _saveFinCols() {
  try {
    const all = {};
    Object.entries(FIN.colsOff || {}).forEach(([m, s]) => { all[m] = [...s]; });
    localStorage.setItem(FIN_COLS_LS, JSON.stringify(all));
  } catch (e) { /* 사생활 모드 등 — 저장 실패해도 화면은 정상 */ }
}

/** th 텍스트 → 순수 컬럼 라벨 (정렬 화살표·출처 배지·펼침 기호 제거) */
function _finThLabel(th) {
  return th.textContent.trim().replace(/[↓↑]/g, '').replace(/[+−]\s*$/, '')
           .replace(/[DCK]$/, '').trim();
}

/** 꺼둔 그룹의 컬럼을 nth-child 규칙으로 숨긴다 */
function _applyFinColVisibility() {
  const off = _finColsOff();
  const hidden = new Set();
  _finGroups().forEach(g => { if (!g.always && off.has(g.key)) g.cols.forEach(c => hidden.add(c)); });
  // 접어둔 상세 컬럼도 같은 방식으로 숨긴다 (칩과 독립 — 둘 중 하나라도 끄면 숨김)
  const exp = _finExpanded();
  _finExpandGroups().forEach(g => { if (!exp.has(g.key)) g.cols.forEach(c => hidden.add(c)); });

  // textContent 사용: 이미 display:none인 th는 innerText가 빈 문자열이라 라벨을 잃는다
  const ths = Array.from(document.querySelectorAll('#fin-table thead th'));
  const nth = [];
  ths.forEach((th, i) => {
    const label = _finThLabel(th);
    if (hidden.has(label)) nth.push(i + 1);   // nth-child는 1부터
  });

  // 펼쳐진 상세 컬럼은 배경 톤 + 좌우 경계선으로 묶어 표시한다.
  // 안 그러면 어디서 어디까지가 '현재가에 딸려 나온 열'인지 구분이 안 된다.
  const label2idx = new Map();
  ths.forEach((th, i) => label2idx.set(_finThLabel(th), i + 1));
  const detail = [];
  _finExpandGroups().forEach(g => {
    if (!exp.has(g.key)) return;
    const idx = g.cols.map(c => label2idx.get(c)).filter(Boolean).sort((a, b) => a - b);
    if (idx.length) detail.push(idx);
  });

  let el = document.getElementById('fin-col-style');
  if (!el) { el = document.createElement('style'); el.id = 'fin-col-style'; document.head.appendChild(el); }
  const rules = nth.map(n =>
    `#fin-table th:nth-child(${n}),#fin-table td:nth-child(${n}){display:none}`);
  detail.forEach(idx => {
    const sel = n => `#fin-table th:nth-child(${n}),#fin-table td:nth-child(${n})`;
    // background-image로 칠한다 — background로 쓰면 sticky 헤더·첫 열의 불투명 배경을 덮어
    // 스크롤 시 뒤 셀이 비친다. box-shadow도 헤더의 기존 하단 그림자를 덮으므로 테두리를 쓴다.
    idx.forEach(n => rules.push(
      `${sel(n)}{background-image:linear-gradient(rgba(42,171,238,.06),rgba(42,171,238,.06))}`));
    rules.push(`${sel(idx[0])}{border-left:1px solid var(--border2)}`);
    rules.push(`${sel(idx[idx.length - 1])}{border-right:1px solid var(--border2)}`);
  });
  el.textContent = rules.join('');

  const info = document.getElementById('fin-col-info');
  if (info) info.textContent = nth.length ? `${ths.length - nth.length}/${ths.length}열` : '';
}

/** 컬럼 그룹 칩 — 탭마다 그룹이 달라 렌더 시점에 다시 그린다 */
function _syncFinColChips() {
  const el = document.getElementById('fin-cols');
  if (!el) return;
  const off = _finColsOff();
  el.innerHTML =
    `<span style="font-size:calc(11px*var(--m-label));color:var(--text2);margin-right:2px">컬럼</span>`
    + _finGroups().filter(g => !g.always).map(g =>
        `<button class="chip chip-sm ${off.has(g.key) ? '' : 'active'}"
          onclick="toggleFinColGroup('${g.key}')"
          title="${escAttr(g.cols.join(' · '))}">${g.name}</button>`).join('')
    + `<button class="chip chip-sm" onclick="setFinColsAll()" title="모든 컬럼 표시">전체</button>`
    + `<span id="fin-col-info" style="font-size:calc(11px*var(--m-label));color:var(--text2);margin-left:2px"></span>`
    // 글자 크기 — 표에만 적용. 컬럼 칩과 같은 줄 오른쪽 끝
    + `<span style="margin-left:auto;display:flex;align-items:center;gap:3px">`
    +   `<span style="font-size:calc(11px*var(--m-label));color:var(--text2);margin-right:2px">글자</span>`
    +   `<button class="chip chip-sm" onclick="stepFinFont(-1)" title="작게">−</button>`
    +   `<span id="fin-font-val" style="font-size:calc(11px*var(--m-label));color:var(--text2);`
    +     `min-width:34px;text-align:center;font-variant-numeric:tabular-nums"></span>`
    +   `<button class="chip chip-sm" onclick="stepFinFont(1)" title="크게">+</button>`
    +   `<button class="chip chip-sm" onclick="setFinFont(100)" title="기본값으로">초기화</button>`
    + `</span>`;
}

function toggleFinColGroup(key) {
  const off = _finColsOff();
  off.has(key) ? off.delete(key) : off.add(key);
  _saveFinCols();
  _syncFinColChips();
  _applyFinColVisibility();
}

function setFinColsAll() {
  _finColsOff().clear();
  _saveFinCols();
  _syncFinColChips();
  _applyFinColVisibility();
}

/** 조회 조건 키 — 같으면 네트워크 재조회 없이 캐시(FIN.raw)를 쓴다 */
function _finCacheKey() {
  return `${F.mode}|${F.scope}`;
}

async function _loadTabData(el, config) {
  FIN.cfg = config;
  FIN.el  = el;

  const key = _finCacheKey();
  if (FIN.rawKey !== key || !FIN.raw) {
    FIN.raw    = await config.fetchRows();
    FIN.rawKey = key;
  }
  _renderFinView();
}

/**
 * 캐시된 행으로 필터·정렬·렌더만 다시 수행 — 네트워크 호출 0회.
 * 정렬/검색/산업 필터는 모두 이 경로를 탄다(구: loadFinancials()로 매번 전량 재조회,
 * 정렬 한 번에 REST 3회·2MB·4.7초였음).
 */
function _renderFinView() {
  const cfg = FIN.cfg;
  const el  = FIN.el || document.getElementById('fin-table-inner') || document.getElementById('fin-table');
  if (!cfg || !FIN.raw || !el) return;

  _syncFinSectorOptions(FIN.raw);   // 선택된 산업에 맞춰 세부산업 목록·건수 갱신

  // slice(): _sortRows가 제자리 정렬이라 캐시 원본이 뒤섞이지 않게 사본에서 정렬
  const rows = _sortRows(_applyFinFilter(FIN.raw).slice(), cfg.defaultSort || 'market_cap');
  _finData = rows;   // CSV 내보내기는 렌더된 일부가 아니라 이 전체 집합을 쓴다

  const cnt = document.getElementById('fin-count');
  if (cnt) cnt.textContent = `${rows.length}개`;

  FIN.rendered = Math.min(FIN_CHUNK, rows.length);
  el.innerHTML = _renderTable(
    typeof cfg.headers === 'function' ? cfg.headers(rows) : cfg.headers,
    rows.slice(0, FIN.rendered).map(cfg.rowTemplate)
  );
  _setFinTableHeight();
  _bindFinLazyRows();
  _syncFinNumFilter();           // 탭마다 지표 목록이 다르다
  _syncFinColChips();            // 탭마다 그룹이 달라 매 렌더 갱신
  _applyFinColVisibility();      // 헤더 인덱스가 바뀔 수 있어 렌더 후 다시 적용
  _applyFinFont();               // 칩 줄이 새로 그려지므로 표시값도 함께 갱신
}

/** 아래로 스크롤하면 다음 묶음을 이어 붙인다 (행 높이가 제각각이라 가상 스크롤 대신 점진 렌더) */
function _bindFinLazyRows() {
  const wrap = document.getElementById('fin-table');
  if (!wrap) return;
  wrap.onscroll = () => {
    if (!FIN.cfg || FIN.rendered >= (_finData?.length || 0)) return;
    if (wrap.scrollTop + wrap.clientHeight < wrap.scrollHeight - 400) return;
    const tbody = wrap.querySelector('tbody');
    if (!tbody) return;
    const next = _finData.slice(FIN.rendered, FIN.rendered + FIN_CHUNK);
    tbody.insertAdjacentHTML('beforeend', next.map(FIN.cfg.rowTemplate).join(''));
    FIN.rendered += next.length;
  };
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
  F.scope    = 'all';        // 진입 시 전체 상장사 (모니터링 313종목은 드롭다운으로 전환)
  F.catSel   = {};
  F.textF    = {};
  F.subIndustry = '전체';
  F.wicsSector  = '전체';
  F.numFilters  = [];
  F.sortBy   = 'market_cap';
  F.sortDir  = 'desc';

  // 템플릿(pFinancials)은 이 함수보다 **먼저** 실행돼 직전 F 값으로 select를 그린다.
  // 여기서 기본값으로 되돌린 뒤 DOM을 맞춰주지 않으면 표는 전체인데 드롭다운은
  // '모니터링 종목'으로 보이는 불일치가 생긴다(업종·테마 select는 _syncFinSectorOptions가 담당).
  const _scopeEl = document.getElementById('fin-scope');
  if (_scopeEl) _scopeEl.value = F.scope;
  const _qEl = document.getElementById('fin-q');
  if (_qEl) _qEl.value = F.q;

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

  // 산업 필터용 매핑 — 표의 산업 컬럼과 같은 전 종목 맵을 쓴다.
  // (구: getIndustryMap()=모니터링 전용 → '전체' 범위에서 컬럼엔 보이는데 필터엔 안 걸리는 불일치)
  if (!FIN.indMap) {
    const meta = await _getCompanyMetaMap();
    FIN.indMap = {};
    Object.entries(meta).forEach(([code, m]) => { if (m.ind) FIN.indMap[code] = m.ind; });
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
      const [monitoredCodes, maxDate, meta] = await Promise.all([
        _getMonitoredCodes(), getLatestMarketDate(), _getCompanyMetaMap(),
      ]);
      // 표가 실제 사용하는 컬럼만 명시 (구 select('*') — 당일 전 종목 × 전 컬럼 다운로드)
      const COLS = 'stock_code,corp_name,market,market_cap,price,price_change,price_change_rate,'
        + 'volume_change_rate,high_price,low_price,volume,trading_value,listing_shares,vol_turnover,'
        + 'week_return,month_return,quarter_return,'
        + 'per,pbr,eps,bps,fiscal_month,foreign_hold_rate,foreign_hold_qty,foreign_net_buy,program_net_buy,'
        + 'loan_balance_rate,short_sell_qty,w52_high,w52_low,w52_high_date,w52_low_date,'
        + 'market_warn_code,manage_issue_code,is_short_over,is_liquidation,'
        + 'hgpr_cls,base_date';
      const all = maxDate ? await fetchAllPages(
        sb.from('market_data').select(COLS).eq('base_date', maxDate)
          .order('stock_code')   // 페이지 경계 결정성 (무정렬 페이징은 누락/중복 가능)
      ) : [];
      // companies(active)에 없는 종목은 제외 — 스팩·상장폐지분이 market_data에는
      // 과거 수집분으로 남아 있어 비활성화만으로는 표에서 사라지지 않는다.
      // meta가 비면(로드 실패) 거르지 않는다 — 표가 통째로 비는 것보다 낫다.
      const listed = Object.keys(meta).length ? new Set(Object.keys(meta)) : null;
      let data = monitoredCodes ? all.filter(r => monitoredCodes.has(r.stock_code)) : all;
      if (listed) data = data.filter(r => listed.has(r.stock_code));
      const latest = {};
      data.forEach(r => { if (!latest[r.stock_code]) latest[r.stock_code] = r; });
      const out = Object.values(latest);
      // 표시용 메타 + 정렬 키. 52주 대비율은 행에서 즉석 계산하던 값이라 정렬할 수 없었다
      // → 미리 필드로 만들어 표시·정렬이 같은 값을 쓰게 한다.
      out.forEach(r => {
        const m = meta[r.stock_code];
        r._meta = m;
        r._ind  = m?.ind  || '';   // 테마 정렬용
        r._wics = m?.wics || '';   // 업종 정렬용
        r._riskRank = _riskRank(r);   // 경고 컬럼 정렬용
        r._w52HighPct = (r.price != null && r.w52_high) ? (r.price - r.w52_high) / r.w52_high * 100 : null;
        r._w52LowPct  = (r.price != null && r.w52_low)  ? (r.price - r.w52_low)  / r.w52_low  * 100 : null;
      });
      return out;
    },
    headers: () => [
      _th('corp_name','종목명'), _th('stock_code','코드'),
      _th('market','시장'),
      _th('_wics','업종'),
      _th('_ind','테마'),
      _th('market_cap','시가총액'),
      // 상세 컬럼은 대표(현재가) 바로 뒤에 붙인다 — 펼쳤을 때 멀리 떨어져 나오면
      // 어느 대표에 딸린 값인지 알 수 없다
      _th('price','현재가',{extra:_expandBtn('price', 5)}),
      _th('price_change','전일대비'),
      _th('high_price','고가'), _th('low_price','저가'),
      _th('volume','거래량'), _th('volume_change_rate','거래량증감률'),
      _th('price_change_rate','등락률',{extra:_expandBtn('ret', 3)}),
      _th('week_return','1주'), _th('month_return','1달'),
      _th('quarter_return','3달'),
      _th('trading_value','거래대금'),
      _th('per','PER'), _th('pbr','PBR'),
      _th('eps','EPS'), _th('bps','BPS'),
      _th('foreign_hold_rate','외국인보유율',{extra:_expandBtn('frgn', 1)}),
      _th('foreign_hold_qty','외국인보유수'),
      _th('foreign_net_buy','외국인순매수'), _th('program_net_buy','프로그램순매수'),
      _th('loan_balance_rate','융자잔고율'), _th('short_sell_qty','공매도수량'),
      _th('w52_high','52주고가',{extra:_expandBtn('w52', 5)}), _th('w52_low','52주저가'),
      _th('w52_high_date','52주고가일'), _th('w52_low_date','52주저가일'),
      _th('_w52HighPct','52주고가대비%'), _th('_w52LowPct','52주저가대비%'),

      _th('_riskRank','경고'), _th('hgpr_cls','신고가구분'),
      // 참고 — 훑을 때 보는 값이 아니라 맨 뒤. 기준일은 전 행이 같은 날짜라 정보량 0,
      // 결산월도 대부분 12월, 거래량회전율은 거래량/상장주수 파생이다.
      _th('listing_shares','상장주수'), _th('vol_turnover','거래량회전율'),
      _th('fiscal_month','결산월'), _th('base_date','기준일'),
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
        ? `<div style="display:flex;align-items:center;gap:3px;font-size:calc(11px*var(--m-label))">
            <span style="width:40px;height:3px;background:var(--bg3);border-radius:2px;display:inline-block;position:relative">
              <span style="position:absolute;left:0;top:0;height:100%;width:${Math.max(2,w52pct)}%;
                background:${w52pct>=80?'var(--red)':w52pct<=20?'var(--blue)':'var(--tg)'};border-radius:2px"></span>
            </span><span style="color:var(--text2)">${w52pct}%</span></div>` : '';
      return `<tr>
        <td class="stock-row" style="font-weight:600;color:var(--text);white-space:nowrap"
          data-stock-open="${r.stock_code}" data-stock-name="${escAttr(r.corp_name||'')}" data-stock-tab="market">${escapeHtml(r.corp_name||'')}</td>
        <td style="font-size:calc(11px*var(--m-label));color:var(--text2);font-family:monospace">${r.stock_code}</td>
        <td style="font-size:calc(11px*var(--m-label));color:var(--text2)">${r.market||'—'}</td>
        ${_wicsCell(r._meta)}
        ${_themeCell(r._meta, r.stock_code)}
        <td>${fmtCap(r.market_cap)}</td>
        <td style="font-weight:500">${fmtPrice(r.price)}</td>
        <td style="color:${chgC}">${chgV != null ? (chgV>0?'+':'')+chgV.toLocaleString()+'원' : '—'}</td>
        <td style="color:var(--red)">${fmtPrice(r.high_price)}</td>
        <td style="color:var(--blue)">${fmtPrice(r.low_price)}</td>
        <td>${n(r.volume)}</td>
        <td style="font-size:calc(11px*var(--m-label));color:var(--text2)">${p(r.volume_change_rate)}</td>
        <td style="color:${chgC};font-weight:500">${chgStr(chg)}</td>
        <td style="color:${chgColor(r.week_return)};font-size:calc(11px*var(--m-label))">${chgStr(r.week_return)}</td>
        <td style="color:${chgColor(r.month_return)};font-size:calc(11px*var(--m-label))">${chgStr(r.month_return)}</td>
        <td style="color:${chgColor(r.quarter_return)};font-size:calc(11px*var(--m-label))">${chgStr(r.quarter_return)}</td>
        <td>${r.trading_value ? fmtCap(r.trading_value) : '—'}</td>
        <td>${r.per != null && r.per !== 0 ? r.per.toFixed(1) : '—'}</td>
        <td>${r.pbr != null && r.pbr !== 0 ? r.pbr.toFixed(2) : '—'}</td>
        <td>${n(r.eps)}</td><td>${n(r.bps)}</td>
        <td>${r.foreign_hold_rate != null ? r.foreign_hold_rate.toFixed(1)+'%' : '—'}</td>
        <td style="font-size:calc(11px*var(--m-label))">${n(r.foreign_hold_qty)}</td>
        <td style="color:${buyClr(r.foreign_net_buy||0)}">${buyFmt(r.foreign_net_buy)}</td>
        <td style="color:${buyClr(r.program_net_buy||0)}">${buyFmt(r.program_net_buy)}</td>
        <td>${r.loan_balance_rate != null ? r.loan_balance_rate.toFixed(2)+'%' : '—'}</td>
        <td style="font-size:calc(11px*var(--m-label))">${n(r.short_sell_qty)}</td>
        <td>
          <div style="color:var(--red);font-size:calc(12px*var(--m-sub))">${n(r.w52_high)}</div>
          ${w52bar}
        </td>
        <td style="color:var(--blue);font-size:calc(12px*var(--m-sub))">${n(r.w52_low)}</td>
        <td style="font-size:calc(11px*var(--m-label));color:var(--text2)">${r.w52_high_date||'—'}</td>
        <td style="font-size:calc(11px*var(--m-label));color:var(--text2)">${r.w52_low_date||'—'}</td>
        <td style="font-size:calc(11px*var(--m-label))">${p(r._w52HighPct)}</td>
        <td style="font-size:calc(11px*var(--m-label))">${p(r._w52LowPct)}</td>
        ${_riskCell(r)}
        <td style="font-size:calc(11px*var(--m-label));color:var(--tg)">${r.hgpr_cls||'—'}</td>
        <td style="font-size:calc(11px*var(--m-label))">${n(r.listing_shares)}</td>
        <td style="font-size:calc(11px*var(--m-label))">${r.vol_turnover != null ? r.vol_turnover.toFixed(2)+'%' : '—'}</td>
        <td style="font-size:calc(11px*var(--m-label));color:var(--text2)">${r.fiscal_month||'—'}월</td>
        <td style="font-size:calc(11px*var(--m-label));color:var(--text2)">${r.base_date||'—'}</td>
      </tr>`;
    },
  });
}

// ══════════════════════════════════════════
//  CSV 내보내기 — 화면에 보이는 그대로(필터·정렬이 적용된 _finData)
//  값은 서식 없는 원본을 내보낸다 — 엑셀에서 바로 계산되도록('1.2조' 같은 표시 문자열 금지).
//  ⚠ 컬럼 구성은 각 탭의 headers 배열과 같이 유지할 것.
// ══════════════════════════════════════════

/** 시장 경고 코드 → 라벨 (표와 동일 기준) */
const _FIN_WARN_LABEL = { '01': '주의', '02': '경고', '03': '위험예고' };

/**
 * 위험 플래그를 한 칸에 모은다 — 구 4개 컬럼(시장경고·관리종목·단기과열·정리매매).
 * 2,589행 중 실제로 켜지는 건 214건뿐인데 여러 칸을 차지하며 대부분 'N'·'—'만 찍고 있었다.
 * 한 칸에 모으면 자리도 줄고, 네 칸을 훑는 대신 한 칸만 보면 된다.
 * 희귀하다고 지우면 안 된다 — 단기과열은 지정되면 켜지는 실제 신호다.
 * (투자유의 is_caution은 2026-09 제거 — KIS invt_caful_yn이 투자주의로 지정된 종목에도
 *  'N'만 돌려주고, 같은 정보를 market_warn_code='01'이 담는다.)
 * @returns {string} td HTML
 */
const _RISK_COLOR = { '정리매매': 'var(--danger, #f5365c)', '관리': 'var(--red)', '과열': 'var(--yellow)' };

/** 한 종목에 켜진 경고 이름들 — 셀 표시와 열 필터가 같은 값을 보게 분리했다 */
function _riskTags(r) {
  const t = [];
  if (r.is_liquidation) t.push('정리매매');
  if (r.manage_issue_code === 'Y') t.push('관리');
  const w = r.market_warn_code;
  if (w && w !== '00') t.push(_FIN_WARN_LABEL[w] || w);
  if (r.is_short_over) t.push('과열');
  return t;
}

function _riskCell(r) {
  const b = (t) => {
    const c = _RISK_COLOR[t] || 'var(--yellow)';
    return `<span style="font-size:calc(10px*var(--m-label));padding:1px 4px;border-radius:3px;`
      + `background:${c}22;color:${c};font-weight:600;white-space:nowrap">${escapeHtml(t)}</span>`;
  };
  const tags = _riskTags(r).map(b);
  return tags.length
    ? `<td style="white-space:nowrap">${tags.join(' ')}</td>`
    : '<td style="color:var(--text3)">—</td>';
}

/** 경고 정렬용 점수 — 심각한 것이 위로 (내림차순 기준) */
function _riskRank(r) {
  return (r.is_liquidation ? 8 : 0)
       + (r.manage_issue_code === 'Y' ? 4 : 0)
       + ((r.market_warn_code && r.market_warn_code !== '00') ? 2 : 0)
       + (r.is_short_over ? 1 : 0);
}

/** 시장 현황 탭 CSV 스펙 — [헤더, 값함수] */
function _finMarketCsvSpec() {
  const pctOf = (a, b) => (a != null && b) ? +((a - b) / b * 100).toFixed(2) : '';
  return [
    ['종목명',       r => r.corp_name],
    ['코드',         r => r.stock_code],
    ['시장',         r => r.market],
    // 표에선 한 칸에 묶어 보여주지만 CSV는 열을 나눈다 (피벗·필터 편의)
    ['업종',         r => r._meta?.wics],
    ['업종대분류',    r => WICS_SECTORS[(r._meta?.wcode || '').slice(0, 3)] || ''],
    ['WICS코드',     r => r._meta?.wcode],
    ['테마',         r => r._meta?.ind],
    ['세부테마',      r => r._meta?.sub],
    ['시가총액',      r => r.market_cap],
    ['현재가',       r => r.price],
    ['전일대비',      r => r.price_change],
    ['고가',         r => r.high_price],
    ['저가',         r => r.low_price],
    ['거래량',       r => r.volume],
    ['거래량증감률(%)', r => r.volume_change_rate],
    ['등락률(%)',    r => r.price_change_rate],
    ['1주수익률(%)',  r => r.week_return],
    ['1달수익률(%)',  r => r.month_return],
    ['3달수익률(%)',  r => r.quarter_return],
    ['거래대금',      r => r.trading_value],
    ['PER',          r => r.per],
    ['PBR',          r => r.pbr],
    ['EPS',          r => r.eps],
    ['BPS',          r => r.bps],
    ['외국인보유율(%)', r => r.foreign_hold_rate],
    ['외국인보유수',   r => r.foreign_hold_qty],
    ['외국인순매수',   r => r.foreign_net_buy],
    ['프로그램순매수', r => r.program_net_buy],
    ['융자잔고율(%)',  r => r.loan_balance_rate],
    ['공매도수량',    r => r.short_sell_qty],
    ['52주고가',     r => r.w52_high],
    ['52주저가',     r => r.w52_low],
    ['52주고가일',    r => r.w52_high_date],
    ['52주저가일',    r => r.w52_low_date],
    ['52주고가대비(%)', r => pctOf(r.price, r.w52_high)],
    ['52주저가대비(%)', r => pctOf(r.price, r.w52_low)],
    // CSV는 배지를 쓸 수 없어 플래그를 개별 열로 유지한다(표는 '경고' 한 칸으로 합침).
    // 단, 'N'/'00' 같은 정상값은 빈칸으로 — 엑셀에서 필터 걸 때 걸리적거린다
    ['시장경고',      r => (!r.market_warn_code || r.market_warn_code === '00')
                            ? '' : (_FIN_WARN_LABEL[r.market_warn_code] || r.market_warn_code)],
    ['관리종목',      r => r.manage_issue_code === 'Y' ? 'Y' : ''],
    ['단기과열',      r => r.is_short_over ? 'Y' : ''],
    ['정리매매',      r => r.is_liquidation ? 'Y' : ''],
    ['신고가구분',    r => r.hgpr_cls],
    // 참고 — 표와 같은 순서로 맨 뒤
    ['상장주수',      r => r.listing_shares],
    ['거래량회전율(%)', r => r.vol_turnover],
    ['결산월',       r => r.fiscal_month],
    ['기준일',       r => r.base_date],
  ];
}

/** 재무제표 탭 CSV 스펙 */
function _finFinancialCsvSpec() {
  const cols = [
    ['매출액','revenue'], ['매출총이익','gross_profit'], ['매출원가','cogs'],
    ['판관비','sga'], ['R&D','rd_expense'], ['영업이익','operating_profit'],
    ['기타영업수익','other_operating_income'], ['기타영업비용','other_operating_expense'],
    ['세전이익','pretax_income'], ['당기순이익','net_income'],
    ['자산총계','total_assets'], ['부채총계','total_liabilities'], ['자본총계','total_equity'],
    ['유동자산','current_assets'], ['유동부채','current_liabilities'], ['비유동자산','non_current_assets'],
    ['자본금','capital_stock'], ['이익잉여금','retained_earnings'],
    ['영업현금흐름','operating_cashflow'], ['투자현금흐름','investing_cashflow'],
    ['재무현금흐름','financing_cashflow'], ['CapEx(유형)','capex'], ['CapEx(무형)','capex_intangible'],
    ['CapEx합계','capex_total'], ['감가상각비','depreciation'], ['무형상각비','amortization'],
    ['D&A','da'], ['EBITDA','ebitda'],
    ['GPM(%)','gross_margin'], ['OPM(%)','operating_margin'], ['NPM(%)','net_margin'],
    ['매출원가율(%)','cogs_ratio'], ['판관비율(%)','sga_ratio'],
    ['부채비율(%)','debt_ratio'], ['유동비율(%)','current_ratio'],
    ['ROE(%)','roe'], ['ROA(%)','roa'], ['FCF','fcf'],
  ];
  return [
    ['종목명', r => r.corp_name],
    ['코드',   r => r.stock_code],
    ['업종',   r => FIN.metaMap?.[r.stock_code]?.wics],
    ['테마',   r => FIN.metaMap?.[r.stock_code]?.ind],
    ['연도',   r => r.bsns_year],
    ['분기',   r => r.quarter],
    ['구분',   r => r.fs_div === 'CFS' ? '연결' : '별도'],
    ...cols.map(([h, k]) => [h, r => r[k]]),
  ];
}

function exportFinancials() {
  if (!_finData?.length) { toast('내보낼 데이터가 없습니다.', 'error'); return; }
  const isMarket = F.mode !== 'financial';
  const spec  = isMarket ? _finMarketCsvSpec() : _finFinancialCsvSpec();
  const scope = F.scope === 'monitored' ? '모니터링' : '전체';
  const name  = ['기업분석', isMarket ? '시장현황' : '재무제표', scope,
                 _finCatSel('_ind').size ? [..._finCatSel('_ind')].join('+') : null,
                 todayStr()].filter(Boolean).join('_');
  downloadCsv(
    spec.map(c => c[0]),
    _finData.map(r => spec.map(c => c[1](r) ?? '')),
    name
  );
  toast(`CSV ${_finData.length}개 종목 내보냄`, 'success');
}

async function loadFinancialData(el) {
  const pct  = v => v != null ? v.toFixed(1) + '%' : '—';
  const cap  = v => v != null ? fmtCap(v) : '—';
  const num  = v => v != null ? v.toLocaleString() : '—';
  const src  = (s) => `<span style="font-size:calc(11px*var(--m-label));padding:1px 4px;border-radius:3px;
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
      // 시장 현황 탭과 동일 기준 — companies(active)에 없는 종목은 제외
      const meta = await _getCompanyMetaMap();
      const listed = Object.keys(meta).length ? new Set(Object.keys(meta)) : null;
      let data = monitoredCodes ? all.filter(r => monitoredCodes.has(r.stock_code)) : all;
      if (listed) data = data.filter(r => listed.has(r.stock_code));
      return Object.values(_pickLatestFin(data));
    },
    headers: () => [
      // 식별
      _th('corp_name','종목명'), _th('stock_code','코드'),
      _th('bsns_year','연도'), _th('quarter','분기'), _th('fs_div','구분'),
      // 손익계산서 (DART)
      _th('revenue','매출액',{src:'D'}),
      _th('gross_profit','매출총이익',{src:'D'}),
      _th('cogs','매출원가',{src:'D'}),
      _th('sga','판관비',{src:'D'}),
      _th('rd_expense','R&D',{src:'D'}),
      _th('operating_profit','영업이익',{src:'D'}),
      _th('other_operating_income','기타영업수익',{src:'D'}),
      _th('other_operating_expense','기타영업비용',{src:'D'}),
      _th('pretax_income','세전이익',{src:'D'}),
      _th('net_income','당기순이익',{src:'D'}),
      // 재무상태표 (DART)
      _th('total_assets','자산총계',{src:'D'}),
      _th('total_liabilities','부채총계',{src:'D'}),
      _th('total_equity','자본총계',{src:'D'}),
      _th('current_assets','유동자산',{src:'D'}),
      _th('current_liabilities','유동부채',{src:'D'}),
      _th('non_current_assets','비유동자산',{src:'D'}),
      _th('capital_stock','자본금',{src:'D'}),
      _th('retained_earnings','이익잉여금',{src:'D'}),
      // 현금흐름 (DART)
      _th('operating_cashflow','영업현금흐름',{src:'D'}),
      _th('investing_cashflow','투자현금흐름',{src:'D'}),
      _th('financing_cashflow','재무현금흐름',{src:'D'}),
      _th('capex','CapEx(유형)',{src:'D'}),
      _th('capex_intangible','CapEx(무형)',{src:'D'}),
      _th('capex_total','CapEx합계',{src:'C'}),
      _th('depreciation','감가상각비',{src:'D'}),
      _th('amortization','무형상각비',{src:'D'}),
      _th('da','D&A',{src:'C'}),
      _th('ebitda','EBITDA',{src:'C'}),
      // 파생비율 (계산)
      _th('gross_margin','GPM',{src:'C'}),
      _th('operating_margin','OPM',{src:'C'}),
      _th('net_margin','NPM',{src:'C'}),
      _th('cogs_ratio','매출원가율',{src:'C'}),
      _th('sga_ratio','판관비율',{src:'C'}),
      _th('debt_ratio','부채비율',{src:'C'}),
      _th('current_ratio','유동비율',{src:'C'}),
      _th('roe','ROE',{src:'C'}),
      _th('roa','ROA',{src:'C'}),
      _th('fcf','FCF',{src:'C'}),
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
        <td class="stock-row" style="font-weight:600;color:var(--text);white-space:nowrap"
          data-stock-open="${r.stock_code}" data-stock-name="${escAttr(r.corp_name||'')}" data-stock-tab="financial">${escapeHtml(r.corp_name||'')}</td>
        <td style="font-size:calc(11px*var(--m-label));color:var(--text2);font-family:monospace">${r.stock_code}</td>
        <td style="font-size:calc(11px*var(--m-label));color:var(--text2)">${r.bsns_year||'—'}</td>
        <td style="font-size:calc(11px*var(--m-label));color:var(--text2)">${r.quarter||'—'}</td>
        <td style="font-size:calc(11px*var(--m-label))">${r.fs_div==='CFS'?'연결':'별도'}</td>
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
        <td style="font-size:calc(11px*var(--m-label))">${pct(r.gross_margin)}</td>
        <td style="font-size:calc(11px*var(--m-label))">${pct(r.operating_margin)}</td>
        <td style="font-size:calc(11px*var(--m-label))">${pct(r.net_margin)}</td>
        <td style="font-size:calc(11px*var(--m-label))">${pct(r.cogs_ratio)}</td>
        <td style="font-size:calc(11px*var(--m-label))">${pct(r.sga_ratio)}</td>
        <td style="font-size:calc(11px*var(--m-label))">${pct(r.debt_ratio)}</td>
        <td style="font-size:calc(11px*var(--m-label))">${pct(r.current_ratio)}</td>
        <td style="font-size:calc(11px*var(--m-label))">${pct(r.roe)}</td>
        <td style="font-size:calc(11px*var(--m-label))">${pct(r.roa)}</td>
        <td style="color:${fcfC};font-weight:500">${cap(r.fcf)}</td>
      </tr>`;
    },
  });
}

// (2026-07-17) 종목 상세 통합 모달(openStockDetail·_sd*)은 stock-detail.js로 분리 —
//   전 페이지 공용 컴포넌트라 기업 분석 페이지 파일과 경계를 맞춤. FIN 네임스페이스는 공유.
