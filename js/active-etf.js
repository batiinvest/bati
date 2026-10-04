// active-etf.js — DISCOVER '액티브 ETF' 페이지 (10-04)
// [원본] 태린이아빠 「액티브ETF를 관찰하자」 — 요약 시트 10개 = 탭, 탭마다 ETF 3개를 나란히:
//   시장 | 종목명 | 현재 비중 | 과거 비중 | 비중차이(현재 − 과거) | 증가율(현재 ÷ 과거 − 1, 과거에 없으면 '신규편입')
//   비중차이·증가율 열은 ETF마다 3색 단계(최소 초록 · 중앙값 노랑 · 최대 빨강 — 원본 조건부 서식 색 그대로)
//   종목 순서 = 현재 구성 순서(금액 큰 순). 과거에만 있던 종목은 원본처럼 나오지 않는다.
//   비중 = 금액 ÷ Σ(금액이 플러스이고 원화예금이 아닌 행) × 100, 소수 2자리 — 원본(DataGuide) 값과 같게 다시 계산(_aeWeights).
//     KRX 구성비중(COMPST_RTO)은 음수 현금·원화예금까지 분모에 넣어 4개 ETF가 원본과 달랐다(10-04 대조:
//     PLUS AI반도체소부장·WON 반도체밸류체인·RISE 비메모리·PLUS K제조업). 이 규칙으로 30개 999행 중 999행 일치.
// 날짜: 현재 = 저장된 최신 거래일, 과거 = 그보다 3거래일 전(원본 예시 09-28 vs 09-23) — 둘 다 고를 수 있다(10-04 사용자 결정)
// [추가 — 원본에 없음, 10-04 사용자 요청] '구성 변화 모아보기': 고른 두 날짜 사이 30개 ETF의 변화를 한 표로.
//   신규편입 = 표와 같은 기준(비교 날짜 비중 0 또는 없음 → 현재 비중 > 0), 종목별로 묶어 담은 ETF 수 → 비중 합 순.
//   비중 증가·감소 = 아래 표들의 비중차이·증가율을 ETF×종목 한 줄씩 모아 큰 순(증가율 순 / 비중차이 순 선택).
//     기준선 없이 늘린(줄인) 것 전부를 크기 순으로 늘어놓는다. 신규편입은 증가에서 빼고(증가율이 없다),
//     비교 날짜 뒤 빠진 종목(편출)은 원본 표처럼 나오지 않는다.
//   공통: 현금(KRD…)과 비교 날짜에 상장 전이던 ETF는 뺀다(상장 전 ETF는 표에서 전 종목이 신규편입으로 찍힌다).
// 데이터: active_etfs, active_etf_holdings (백엔드 collect_active_etf.py, 평일 19:35)
//   두 날짜의 30개 ETF 전체를 한 번 받아(AE.byDate) 탭 표와 모아보기가 같이 쓴다.
// 의존: config.js (sb, fetchAllPages, escapeHtml, escAttr, escJsStr, loadingHTML, emptyHTML, errorHTML)

const AE = {
  etfs: null,     // [{code, name, grp, grp_ord, ord}]
  groups: [],     // [{name, codes:[...]}]
  dates: [],      // 저장된 거래일, 최신 → 과거
  cur: null,      // 현재 날짜
  past: null,     // 비교(과거) 날짜
  tab: 0,
  missing: false, // 테이블 없음(sql/active_etf.sql 실행 전)
  byDate: {},     // 날짜 → { etf_code: [원본 비중 붙인 행] } (Promise)
  newMore: false, // 모아보기 전부 보기
  view: 'new',    // 모아보기: new 신규편입 · up 비중 증가 · down 비중 감소
  sort: 'rate',   // 증가·감소 정렬: rate 증가율(감소율) · diff 비중차이
};
const AE_NEW_SHOW = 12;   // 모아보기 기본 줄 수
const AE_PAST_GAP = 3;          // 기본 비교 = 3거래일 전 (원본 예시)
const AE_DATE_PROBE = '438740'; // 가장 오래 상장된 ETF — 저장된 날짜 목록용
const AE_SCALE = ['#63BE7B', '#FFEB84', '#F8696B'];   // 원본 3색 단계: 최소 · 중앙값(50%) · 최대
const AE_MKT = { STK: 'KS', KSQ: 'KQ', KNX: 'KN' };   // 원본 시장 표기

function pActiveEtf() {
  return `
  <div class="ae-head">
    <div id="ae-tabs" class="ae-tabs"></div>
    <div class="ae-dates">
      <label>현재 <select id="ae-cur" onchange="setAeDate('cur', this.value)"></select></label>
      <label>비교 <select id="ae-past" onchange="setAeDate('past', this.value)"></select></label>
    </div>
  </div>
  <div class="ae-desc">
    태린이아빠 「액티브ETF를 관찰하자」 — 액티브 ETF 30개의 CU당 구성비중(금액 기준)을 두 날짜로 비교합니다.
    비중차이 = 현재 − 비교(%p) · 증가율 = 현재 ÷ 비교 − 1 (비교 날짜에 없으면 신규편입) ·
    색 = ETF마다 그 열 안에서 낮음 <span class="ae-sw" style="background:${AE_SCALE[0]}"></span>
    중간 <span class="ae-sw" style="background:${AE_SCALE[1]}"></span>
    높음 <span class="ae-sw" style="background:${AE_SCALE[2]}"></span> (원본 조건부 서식). 출처: KRX ETF PDF.
  </div>
  <div id="ae-new"></div>
  <div id="ae-body">${loadingHTML('불러오는 중...')}</div>`;
}

async function loadActiveEtf() {
  const body = document.getElementById('ae-body');
  if (!body) return;
  try {
    if (!AE.etfs) {
      const [{ data: etfs, error: e1 }, { data: ds, error: e2 }] = await Promise.all([
        sb.from('active_etfs').select('code,name,grp,grp_ord,ord').order('grp_ord').order('ord'),
        sb.from('active_etf_holdings').select('base_date').eq('etf_code', AE_DATE_PROBE).eq('seq', 1)
          .order('base_date', { ascending: false }).limit(400),
      ]);
      if (e1 || e2) throw (e1 || e2);
      AE.etfs = etfs || [];
      AE.dates = (ds || []).map(r => r.base_date);
      const by = {};
      AE.etfs.forEach(e => { (by[e.grp_ord] = by[e.grp_ord] || { name: e.grp, codes: [] }).codes.push(e.code); });
      AE.groups = Object.keys(by).sort((a, b) => a - b).map(k => by[k]);
      AE.cur = AE.dates[0] || null;
      AE.past = AE.dates[Math.min(AE_PAST_GAP, AE.dates.length - 1)] || null;
    }
    AE.missing = false;
  } catch (e) {
    AE.missing = /42P01|PGRST205|does not exist|Could not find/.test(`${e?.code} ${e?.message}`);
    if (!AE.missing) { console.warn('[액티브ETF]', e); body.innerHTML = errorHTML(e.message || '조회 실패'); return; }
  }
  if (AE.missing || !AE.etfs?.length || AE.dates.length < 2) {
    body.innerHTML = emptyHTML(AE.missing ? '준비 중 — 데이터 표를 만드는 중입니다.' : '데이터 수집 중 (평일 19:35 업데이트)',
      AE.dates.length === 1 ? '비교하려면 거래일이 이틀 이상 쌓여야 합니다' : '');
    return;
  }
  _aeRenderControls();
  _aeRender();
}

function _aeRenderControls() {
  const tabs = document.getElementById('ae-tabs');
  if (tabs) tabs.innerHTML = AE.groups.map((g, i) =>
    `<button class="chip chip-sm ${i === AE.tab ? 'active' : ''}" onclick="setAeTab(${i})">${escapeHtml(g.name)}</button>`).join('');
  const opt = (d, sel) => `<option value="${d}" ${d === sel ? 'selected' : ''}>${d}</option>`;
  const cur = document.getElementById('ae-cur'), past = document.getElementById('ae-past');
  if (cur) cur.innerHTML = AE.dates.map(d => opt(d, AE.cur)).join('');
  if (past) past.innerHTML = AE.dates.filter(d => d < AE.cur).map(d => opt(d, AE.past)).join('');
}

function setAeTab(i, scroll) {
  AE.tab = i;
  _aeRenderControls();
  _aeRenderTab();
  if (scroll) document.getElementById('ae-body')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setAeDate(which, d) {
  AE[which] = d;
  if (which === 'cur' && !(AE.past < AE.cur)) {      // 비교 날짜는 현재보다 앞이어야 한다 — 3거래일 전으로
    const i = AE.dates.indexOf(d);
    AE.past = AE.dates[Math.min(i + AE_PAST_GAP, AE.dates.length - 1)];
  }
  AE.newMore = false;
  _aeRenderControls();
  _aeRender();
}

function toggleAeNewMore() {
  AE.newMore = !AE.newMore;
  _aeRenderNew();
}

function setAeView(v) {
  AE.view = v;
  AE.newMore = false;
  _aeRenderNew();
}

function setAeSort(v) {
  AE.sort = v;
  AE.newMore = false;
  _aeRenderNew();
}

// 그날 30개 ETF 전체 → { etf_code: [원본 비중 붙인 행] } (한 번 받아 둔다)
function _aeLoad(d) {
  if (!AE.byDate[d]) {
    AE.byDate[d] = fetchAllPages((a, b) => sb.from('active_etf_holdings')
      .select('etf_code,item_code,item_name,mkt,amount,seq').eq('base_date', d)
      .order('etf_code').order('seq').range(a, b))
      .then(rows => {
        const by = {};
        rows.forEach(r => { (by[r.etf_code] = by[r.etf_code] || []).push(r); });
        Object.keys(by).forEach(c => { by[c] = _aeWeights(by[c]); });
        return by;
      })
      .catch(e => { delete AE.byDate[d]; throw e; });
  }
  return AE.byDate[d];
}

// 두 날짜를 받아 모아보기와 탭 표를 그린다 — 날짜가 바뀔 때만 부른다
async function _aeRender() {
  const body = document.getElementById('ae-body'), nw = document.getElementById('ae-new');
  if (!body) return;
  if (!AE.past || AE.past >= AE.cur) {
    body.innerHTML = emptyHTML('현재보다 앞선 비교 날짜가 없습니다');
    if (nw) nw.innerHTML = '';
    return;
  }
  body.innerHTML = loadingHTML('불러오는 중...');
  if (nw) nw.innerHTML = '';
  const want = `${AE.cur}|${AE.past}`;
  AE.want = want;
  try {
    await Promise.all([_aeLoad(AE.cur), _aeLoad(AE.past)]);
    if (AE.want !== want) return;   // 그사이 날짜가 바뀜
    _aeRenderNew();
    _aeRenderTab();
  } catch (e) {
    console.warn('[액티브ETF]', e);
    body.innerHTML = errorHTML(e.message || '조회 실패');
  }
}

async function _aeRenderTab() {
  const body = document.getElementById('ae-body');
  const g = AE.groups[AE.tab];
  if (!body || !g) return;
  const [cur, past] = await Promise.all([_aeLoad(AE.cur), _aeLoad(AE.past)]);
  const nameOf = Object.fromEntries(AE.etfs.map(e => [e.code, e.name]));
  body.innerHTML = `<div class="ae-grid">${g.codes.map(c =>
    _aeTable(c, nameOf[c] || c, cur[c] || [], past[c] || [])).join('')}</div>`;
}

// 구성 변화 모아보기 (원본에 없는 추가 — 머리말 참고)
async function _aeRenderNew() {
  const el = document.getElementById('ae-new');
  if (!el) return;
  const [cur, past] = await Promise.all([_aeLoad(AE.cur), _aeLoad(AE.past)]);
  const md = d => d.slice(5).replace('-', '/');
  const tabOf = {};
  AE.groups.forEach((g, i) => g.codes.forEach(c => { tabOf[c] = i; }));

  // ETF×종목 한 줄씩 — 현재 비중 c, 비교 비중 p
  const pairs = [], skipped = [];
  AE.etfs.forEach(e => {
    if (!cur[e.code]?.length) return;
    if (!past[e.code]?.length) { skipped.push(e.name); return; }   // 비교 날짜에 상장 전
    const pw = Object.fromEntries(past[e.code].map(r => [r.item_code, r.weight]));
    cur[e.code].forEach(r => {
      if (r.item_code.startsWith('KRD') || !(r.weight > 0)) return;   // 현금 · 비중 0
      const p = pw[r.item_code] || 0;
      pairs.push({ code: r.item_code, name: r.item_name, mkt: r.mkt, etf: e.code, etfName: e.name,
                   c: r.weight, p, diff: Math.round((r.weight - p) * 100) / 100, rate: p ? r.weight / p - 1 : null });
    });
  });

  let list, count;
  if (AE.view === 'new') {
    const items = {};
    pairs.filter(x => !x.p).forEach(x => {
      const it = items[x.code] = items[x.code] || { code: x.code, name: x.name, mkt: x.mkt, etfs: [] };
      it.etfs.push(x);
    });
    list = Object.values(items)
      .map(it => ({ ...it, sum: it.etfs.reduce((s, x) => s + x.c, 0), etfs: it.etfs.sort((a, b) => b.c - a.c) }))
      .sort((a, b) => b.etfs.length - a.etfs.length || b.sum - a.sum);
    count = `30개 ETF가 새로 담은 종목 ${list.length}개`;
  } else {
    const up = AE.view === 'up', k = AE.sort;
    list = pairs.filter(x => x.p && (up ? x.diff > 0 : x.diff < 0))
      .sort((a, b) => up ? b[k] - a[k] : a[k] - b[k]);
    count = `비중을 ${up ? '늘린' : '줄인'} 경우 ${list.length}건 (ETF×종목)`;
  }
  const shown = AE.newMore ? list : list.slice(0, AE_NEW_SHOW);
  const fs = 'font-size:calc(11px*var(--m-label))';
  const chip = (v, label, fn, cur) => `<button class="chip chip-sm ${cur === v ? 'active' : ''}" onclick="${fn}('${v}')">${label}</button>`;
  const etfBtn = (code, name, txt) => `<button class="chip chip-sm" data-no-detail title="${escAttr(name + ' 표로 이동')}"
      onclick="setAeTab(${tabOf[code]}, true)">${escapeHtml(txt)}</button>`;
  const rowAttr = it => /^[0-9A-Z]{6}$/.test(it.code)
    ? `class="stock-row" data-stock-open="${escAttr(it.code)}" data-stock-name="${escAttr(it.name || '')}" data-stock-tab="market"` : '';
  const sgn = (v, f) => `<span style="color:${v > 0 ? 'var(--up)' : v < 0 ? 'var(--down)' : 'var(--text2)'}">${f(v)}</span>`;
  const head = AE.view === 'new'
    ? '<th></th><th>종목명</th><th class="ae-num">ETF 수</th><th>담은 ETF (현재 비중)</th>'
    : `<th></th><th>종목명</th><th>ETF</th><th class="ae-num">${md(AE.cur)}</th><th class="ae-num">${md(AE.past)}</th>
       <th class="ae-num">비중차이</th><th class="ae-num">${AE.view === 'up' ? '증가율' : '감소율'}</th>`;
  const row = AE.view === 'new'
    ? it => `<tr ${rowAttr(it)}><td class="ae-mkt">${AE_MKT[it.mkt] || ''}</td>
        <td class="ae-name" title="${escAttr(it.name || '')}">${escapeHtml(it.name || it.code)}</td>
        <td class="ae-num"><b>${it.etfs.length}</b></td>
        <td class="ae-etfs"><div class="ae-etf-chips">${it.etfs.map(x => etfBtn(x.etf, x.etfName, `${x.etfName} ${x.c.toFixed(2)}%`)).join('')}</div></td></tr>`
    : x => `<tr ${rowAttr(x)}><td class="ae-mkt">${AE_MKT[x.mkt] || ''}</td>
        <td class="ae-name" title="${escAttr(x.name || '')}">${escapeHtml(x.name || x.code)}</td>
        <td>${etfBtn(x.etf, x.etfName, x.etfName)}</td>
        <td class="ae-num">${x.c.toFixed(2)}</td><td class="ae-num">${x.p.toFixed(2)}</td>
        <td class="ae-num">${sgn(x.diff, v => (v > 0 ? '+' : '') + v.toFixed(2))}</td>
        <td class="ae-num">${sgn(x.rate, v => (v > 0 ? '+' : '') + Math.round(v * 100) + '%')}</td></tr>`;
  const note = AE.view === 'new'
    ? "아래 표의 '신규편입'(비교 날짜에 없거나 비중 0)을 30개 ETF에서 종목별로 모은 것 — 담은 ETF 수 → 비중 합 순."
    : `아래 표들의 비중차이·${AE.view === 'up' ? '증가율' : '증가율(마이너스 = 감소율)'}을 ETF×종목 한 줄씩 모아 ${AE.sort === 'rate' ? (AE.view === 'up' ? '증가율' : '감소율') : '비중차이'}이 큰 순.
       비중은 주가가 오르내려도 바뀝니다(운용사가 사고팔지 않아도). ${AE.view === 'up' ? '신규편입은 증가율이 없어 신규편입 보기에.' : '비교 날짜 뒤 빠진 종목(편출)은 원본 표처럼 나오지 않습니다.'}`;
  el.innerHTML = `
  <div class="card ae-new-card">
    <div class="card-header" style="flex-wrap:wrap;gap:6px">
      <span class="card-title">구성 변화 모아보기</span>
      <span class="card-sub" style="margin-right:auto">${md(AE.past)} → ${md(AE.cur)} · ${count} (현금 제외)</span>
      <div style="display:flex;gap:4px;flex-wrap:wrap">
        ${chip('new', '신규편입', 'setAeView', AE.view)}${chip('up', '비중 증가', 'setAeView', AE.view)}${chip('down', '비중 감소', 'setAeView', AE.view)}
        ${AE.view === 'new' ? '' : `<span style="width:1px;background:var(--border);margin:0 2px"></span>
          ${chip('rate', AE.view === 'up' ? '증가율 순' : '감소율 순', 'setAeSort', AE.sort)}${chip('diff', '비중차이 순', 'setAeSort', AE.sort)}`}
      </div>
    </div>
    ${!list.length ? `<div style="padding:12px;${fs};color:var(--text2)">이 기간에 해당하는 종목이 없습니다</div>` : `
    <div class="table-wrap"><table class="ae-tbl ae-new-tbl">
      <thead><tr>${head}</tr></thead>
      <tbody>${shown.map(row).join('')}</tbody>
    </table></div>
    ${list.length > AE_NEW_SHOW ? `<div style="padding:6px 12px;text-align:center"><button class="chip chip-sm" onclick="toggleAeNewMore()">${AE.newMore ? '접기' : `전부 보기 (+${list.length - AE_NEW_SHOW})`}</button></div>` : ''}`}
    <div style="padding:6px 12px 8px;${fs};color:var(--text3);line-height:1.5;border-top:1px solid var(--border)">
      원본에 없는 추가 표 — ${note} ETF 칩을 누르면 그 ETF 표로 갑니다.
      ${skipped.length ? `<br>비교 날짜에 상장 전이라 뺀 ETF: ${escapeHtml(skipped.join(', '))}` : ''}
    </div>
  </div>`;
}

// 원본 비중 — 금액이 플러스인 행(원화예금 제외)으로 나눈다. 빠진 행(음수 현금·원화예금)은 원본처럼 0
function _aeWeights(rows) {
  const counted = r => (r.amount || 0) > 0 && r.item_name !== '원화예금';
  const tot = rows.reduce((s, r) => s + (counted(r) ? r.amount : 0), 0);
  return rows.map(r => ({ ...r, weight: counted(r) && tot ? Math.round(r.amount / tot * 10000) / 100 : 0 }));
}

// 원본 3색 단계 — 최소·중앙값·최대 사이를 선형 보간
function _aeScale(vals) {
  const v = vals.filter(x => x != null && isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return () => null;
  const lo = v[0], hi = v[v.length - 1];
  const pos = (v.length - 1) * 0.5, mid = v[Math.floor(pos)] + (v[Math.ceil(pos)] - v[Math.floor(pos)]) * (pos - Math.floor(pos));
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const [c0, c1, c2] = AE_SCALE.map(rgb);
  const mix = (a, b, t) => `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * t)).join(',')})`;
  return x => {
    if (x == null || !isFinite(x)) return null;
    if (hi === lo) return AE_SCALE[1];
    if (x <= mid) return mix(c0, c1, mid > lo ? (x - lo) / (mid - lo) : 1);
    return mix(c1, c2, hi > mid ? (x - mid) / (hi - mid) : 0);
  };
}

function _aeTable(code, name, cur, past) {
  const pw = Object.fromEntries(past.map(r => [r.item_code, r.weight]));
  const rows = cur.map(r => {
    const p = pw[r.item_code];
    const has = p != null && p !== 0;   // 원본: 과거 비중 = IFERROR(VLOOKUP, 0), 증가율 = IFERROR(현재/과거−1, "신규편입")
    return { ...r, past: p ?? 0, diff: r.weight != null ? r.weight - (p ?? 0) : null,
             rate: has && r.weight != null ? r.weight / p - 1 : null, isNew: !has };
  });
  const cDiff = _aeScale(rows.map(r => r.diff)), cRate = _aeScale(rows.map(r => r.rate));
  const f2 = v => v == null ? '' : v.toFixed(2);
  const sg = v => v == null ? '' : (v > 0 ? '+' : '') + v.toFixed(2);
  const pc = v => (v > 0 ? '+' : '') + Math.round(v * 100) + '%';
  const cell = (bg, txt) => `<td class="ae-num" ${bg ? `style="background:${bg};color:#1a1a1a"` : ''}>${txt}</td>`;
  const md = d => d.slice(5).replace('-', '/');
  return `
  <div class="card ae-card">
    <div class="card-header"><span class="card-title">${escapeHtml(name)}</span>
      <span class="card-sub">${escapeHtml(code)} · ${cur.length}종목</span></div>
    ${!cur.length ? emptyHTML('이 날짜 구성종목 없음', '상장 전이거나 아직 수집되지 않았습니다') : `
    <div class="ae-scroll"><table class="ae-tbl">
      <thead><tr><th></th><th>종목명</th><th class="ae-num">${md(AE.cur)}</th><th class="ae-num">${md(AE.past)}</th>
        <th class="ae-num">비중차이</th><th class="ae-num">증가율</th></tr></thead>
      <tbody>${rows.map(r => {
        const stock = /^[0-9A-Z]{6}$/.test(r.item_code);
        return `<tr ${stock ? `class="stock-row" data-stock-open="${escAttr(r.item_code)}" data-stock-name="${escAttr(r.item_name || '')}" data-stock-tab="market"` : ''}>
          <td class="ae-mkt">${AE_MKT[r.mkt] || ''}</td>
          <td class="ae-name" title="${escAttr(r.item_name || '')}">${escapeHtml(r.item_name || r.item_code)}</td>
          <td class="ae-num">${f2(r.weight)}</td><td class="ae-num">${f2(r.past)}</td>
          ${cell(cDiff(r.diff), sg(r.diff))}
          ${r.isNew ? '<td class="ae-num ae-new">신규편입</td>' : cell(cRate(r.rate), r.rate == null ? '' : pc(r.rate))}
        </tr>`;
      }).join('')}</tbody>
    </table></div>`}
  </div>`;
}
