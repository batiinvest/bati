// export-data.js — RESEARCH '수출 데이터' 페이지 (10-11)
// [원본] 태린이아빠 「주요품목별수출정리」 — 9월 잠정(품목·국가 270시트) · 8월 확정(공장 시군구 232시트) 워크북.
//   시트 계산 그대로: 일평균수출 = 금액(달러) ÷ 영업일수 · MoM·YoY(일평균) · 판가 = 금액 ÷ 중량 · 판가 YoY
//   분기 일평균 = 3달 일평균의 평균(원본 AVERAGE) · QoQ·YoY · 분기 금액 = 3달 합 · 분기 판가 = 3달 판가 평균
// 탭 = 원본 두 파일(품목·국가 / 공장·지역), 줄 순서 = 원본 시트 순서. 목록·원본과 다른 점은 백엔드 export_items.py 머리말.
// 데이터: export_items · export_monthly(관세청 API 월별 확정치, 매월 15일경 전월분) · export_workdays(영업일수)
//   관리자만: export_prelim(TRASS 잠정치 붙여넣기 — 1일 전월, 11일 1~10일, 21일 1~20일) · export_wb(원본 기록 → '원본 판가')
//   공장·지역은 2026-09-01부터 중량 비공개라 판가가 없다. 원본 판가는 원본 금액이 관세청 값과 같은 항목만(같은 기준일 때만 의미).
// 의존: config.js (sb, fetchAllPages, escapeHtml, escAttr, loadingHTML, emptyHTML, errorHTML, isAdmin, toast), Chart.js

const EXP = {
  items: null,     // export_items 행
  tab: 'p',
  q: '',
  sort: null,      // null = 원본 순서, {key, dir}
  sel: null,       // 상세로 연 항목 id
  rows: {},        // 계열 키 'lvl|hs|area' → {ym: row}
  full: new Set(), // 전체 기간을 받은 계열 키
  wd: {},          // ym → 영업일수
  cal: [],         // 거래일 (잠정 부분월 영업일수용)
  prelim: [],      // 관리자: export_prelim 행
  wb: {},          // 관리자: item_id → {ym: {usd, wgt}}
  latest: null,    // 확정치 최신 월
  missing: false,
  chart: null,
};
const EXP_LIST_MONTHS = 27;   // 목록용으로 받는 기간 (분기 전년비까지)
const EXP_CNTY = { US: '미국', CN: '중국', JP: '일본', VN: '베트남', PL: '폴란드', MX: '멕시코', IN: '인도',
                   NL: '네덜란드', TH: '태국', BR: '브라질', CA: '캐나다' };
const EXP_PERIOD = { '10': '1~10일', '20': '1~20일', m: '한 달' };

function pExports() {
  return `
  <div class="ex-head">
    <div id="ex-tabs" class="ex-tabs"></div>
    <input id="ex-q" class="ex-q" placeholder="품목·기업·HS 검색" oninput="setExQuery(this.value)">
    <span id="ex-asof" class="ex-asof"></span>
    <span id="ex-admin"></span>
  </div>
  <div class="ex-desc">
    태린이아빠 「주요품목별수출정리」 — 일평균수출 = 금액(달러) ÷ 영업일수, 판가 = 금액 ÷ 중량(달러/kg), 분기 일평균 = 3달 일평균의 평균.
    출처: 관세청 품목·국가·시군구 수출입 통계(매월 15일경 전월 확정치). 공장·지역은 HS 6자리 × 시군구 금액만 공개(2026-09-01부터 지역 중량·10자리 비공개)라 판가가 없습니다.
    줄을 누르면 월별·분기 표가 열립니다.
  </div>
  <div id="ex-detail"></div>
  <div id="ex-body">${loadingHTML('불러오는 중...')}</div>
  <div id="ex-modal"></div>`;
}

const _exKey = p => p.rg ? `sgg|${p.hs}|${p.rg}` : p.cn ? `cnty|${p.hs}|${p.cn}` : `nat|${p.hs}|`;
const _exYm = (ym, n) => { let y = +ym.slice(0, 4), m = +ym.slice(5, 7) + n; y += Math.floor((m - 1) / 12); m = ((m - 1) % 12 + 12) % 12 + 1; return `${y}-${String(m).padStart(2, '0')}`; };
const _exMissing = e => /42P01|PGRST205|does not exist|Could not find/.test(`${e?.code} ${e?.message}`);

async function loadExports() {
  const body = document.getElementById('ex-body');
  if (!body) return;
  try {
    if (!EXP.items) {
      const [it, wd, lt] = await Promise.all([
        fetchAllPages(sb.from('export_items').select('id,tab,ord,name,co,note,flow,parts,orig,orig_last').order('tab').order('ord')),
        sb.from('export_workdays').select('ym,days').order('ym'),
        sb.from('export_monthly').select('ym').neq('lvl', 'sgg').order('ym', { ascending: false }).limit(1),
      ]);
      if (wd.error || lt.error) throw (wd.error || lt.error);
      EXP.items = it;
      (wd.data || []).forEach(r => { EXP.wd[r.ym] = r.days; });
      EXP.latest = lt.data?.[0]?.ym || null;
      if (EXP.latest) {
        const from = _exYm(EXP.latest, -(EXP_LIST_MONTHS - 1));
        const rows = await fetchAllPages((a, b) => sb.from('export_monthly')
          .select('lvl,hs,area,ym,exp_usd,exp_wgt,imp_usd,imp_wgt').gte('ym', from)
          .order('lvl').order('hs').order('area').order('ym').range(a, b));
        _exPut(rows);
      }
      if (isAdmin()) await _exLoadAdmin();
    }
    EXP.missing = false;
  } catch (e) {
    EXP.missing = _exMissing(e);
    if (!EXP.missing) { console.warn('[수출]', e); body.innerHTML = errorHTML(e.message || '조회 실패'); return; }
  }
  if (EXP.missing || !EXP.items?.length) {
    body.innerHTML = emptyHTML(EXP.missing ? '준비 중 — 데이터 표를 만드는 중입니다.' : '수집 목록이 아직 없습니다', '');
    return;
  }
  if (!EXP.latest) {
    body.innerHTML = emptyHTML('관세청 데이터 수집 전입니다', '공공데이터포털 키를 서버에 넣으면 매일 10:10에 받습니다');
  }
  _exControls();
  if (EXP.latest) _exRender();
}

function _exPut(rows) {
  rows.forEach(r => { const k = `${r.lvl}|${r.hs}|${r.area}`; (EXP.rows[k] = EXP.rows[k] || {})[r.ym] = r; });
}

async function _exLoadAdmin() {
  const [pr, wb] = await Promise.all([
    sb.from('export_prelim').select('hs,cn,ym,period,flow,usd,krw,wgt').order('ym'),
    fetchAllPages((a, b) => sb.from('export_wb').select('item_id,ym,usd,wgt').order('item_id').order('ym').range(a, b)).catch(() => []),
  ]);
  EXP.prelim = pr.error ? [] : (pr.data || []);
  EXP.wb = {};
  wb.forEach(r => { (EXP.wb[r.item_id] = EXP.wb[r.item_id] || {})[r.ym] = r; });
  const yms = EXP.prelim.map(r => r.ym).sort();
  if (yms.length) {
    const days = await fetchAllPages((a, b) => sb.from('fear_greed_daily').select('base_date')
      .gte('base_date', `${yms[0]}-01`).order('base_date').range(a, b)).catch(() => []);
    EXP.cal = days.map(r => r.base_date);
  }
}

function _exControls() {
  const n = t => EXP.items.filter(i => i.tab === t).length;
  const tabs = document.getElementById('ex-tabs');
  if (tabs) tabs.innerHTML = [['p', '품목·국가'], ['f', '공장·지역']].map(([t, l]) =>
    `<button class="chip chip-sm ${EXP.tab === t ? 'active' : ''}" onclick="setExTab('${t}')">${l} ${n(t)}</button>`).join('')
    + (EXP.sort ? ` <button class="chip chip-sm" onclick="setExSort(null)">원본 순서로</button>` : '');
  const asof = document.getElementById('ex-asof');
  if (asof) asof.textContent = EXP.latest ? `확정치 ${EXP.latest.replace('-', '.')}까지` : '';
  const adm = document.getElementById('ex-admin');
  if (adm) adm.innerHTML = isAdmin()
    ? `<button class="chip chip-sm" onclick="openExPaste()" title="TRASS 잠정치 표를 붙여넣기 (관리자만 보임)">잠정치 붙여넣기${EXP.prelim.length ? ` · ${_exPrelimSets().length}건` : ''}</button>` : '';
}

function setExTab(t) { EXP.tab = t; EXP.sel = null; _exControls(); _exRender(); }
function setExQuery(v) { EXP.q = v.trim().toLowerCase(); _exRender(); }
function setExSort(key) {
  if (!key) EXP.sort = null;
  else EXP.sort = EXP.sort?.key === key ? (EXP.sort.dir < 0 ? { key, dir: 1 } : null) : { key, dir: -1 };
  _exControls(); _exRender();
}

// ── 계산 ─────────────────────────────────────────────
// 항목 → 월별 [{ym, usd, wgt, days, daily, price, prelim?}] (오래된 → 최신)
function _exSeries(it) {
  const parts = it.parts || [];
  if (!parts.length || parts.some(p => p.hs === '*')) return [];
  const f = it.flow === 'imp' ? 'imp' : 'exp';
  const keys = parts.map(_exKey);
  const yms = new Set();
  keys.forEach(k => Object.keys(EXP.rows[k] || {}).forEach(ym => yms.add(ym)));
  const out = [];
  [...yms].sort().forEach(ym => {
    let usd = 0, wgt = 0, hasW = true, any = false;
    keys.forEach(k => {
      const r = EXP.rows[k]?.[ym];
      const u = r?.[`${f}_usd`], w = r?.[`${f}_wgt`];
      if (u != null) { usd += +u; any = true; }
      if (w == null) hasW = false; else wgt += +w;
    });
    if (!any) return;
    out.push(_exRow(ym, usd, hasW && wgt > 0 ? wgt : null, EXP.wd[ym]));
  });
  // 잠정치(관리자): 확정치 다음 달들 — 모든 부분에 같은 (달, 기간) 값이 있을 때만
  if (EXP.prelim.length && parts.every(p => !p.rg)) {
    const last = out.length ? out[out.length - 1].ym : '';
    const sets = {};
    EXP.prelim.filter(r => r.flow === f && r.ym > last).forEach(r => {
      const s = sets[`${r.ym}|${r.period}`] = sets[`${r.ym}|${r.period}`] || {};
      s[`${r.hs}|${r.cn}`] = r;
    });
    const best = {};   // 달마다 가장 긴 기간 하나
    Object.keys(sets).forEach(k => {
      const [ym, per] = k.split('|');
      if (!parts.every(p => sets[k][`${p.hs}|${p.cn}`])) return;
      const rank = { '10': 1, '20': 2, m: 3 }[per];
      if (!best[ym] || rank > best[ym].rank) best[ym] = { per, rank, s: sets[k] };
    });
    Object.keys(best).sort().forEach(ym => {
      const { per, s } = best[ym];
      let usd = 0, wgt = 0, hasW = true;
      parts.forEach(p => { const r = s[`${p.hs}|${p.cn}`]; usd += +(r.usd || 0); if (r.wgt == null) hasW = false; else wgt += +r.wgt; });
      out.push({ ..._exRow(ym, usd, hasW && wgt > 0 ? wgt : null, _exPrelimDays(ym, per)), prelim: per });
    });
  }
  const at = Object.fromEntries(out.map((r, i) => [r.ym, i]));
  out.forEach((r, i) => {
    const pm = out[at[_exYm(r.ym, -1)]], py = out[at[_exYm(r.ym, -12)]];
    r.mom = pm?.daily ? r.daily / pm.daily - 1 : null;
    r.yoy = py?.daily ? r.daily / py.daily - 1 : null;
    r.pyoy = py?.price && r.price ? r.price / py.price - 1 : null;
    r.wbPrice = null;
  });
  return out;
}

function _exRow(ym, usd, wgt, days) {
  return { ym, usd, wgt, days: days || null, daily: days ? usd / days : null, price: wgt ? usd / wgt : null };
}

// 잠정 기간의 영업일수 — 거래일 달력(1~10일·1~20일·한 달). 달력이 비면 평일 수
function _exPrelimDays(ym, per) {
  if (per === 'm' && EXP.wd[ym]) return EXP.wd[ym];
  const end = per === '10' ? `${ym}-10` : per === '20' ? `${ym}-20` : `${ym}-31`;
  const n = EXP.cal.filter(d => d >= `${ym}-01` && d <= end).length;
  if (n) return n;
  let c = 0;
  const last = per === 'm' ? new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate() : +per;
  for (let d = 1; d <= last; d++) { const w = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1, d).getDay(); if (w % 6) c++; }
  return c;
}

// 월별 → 분기 [{q, daily, usd, price, qoq, yoy, pqoq, pyoy, n}] (3달이 다 있을 때만)
function _exQuarters(ser) {
  const by = {};
  ser.forEach(r => { const q = `${r.ym.slice(0, 4)} Q${Math.ceil(+r.ym.slice(5, 7) / 3)}`; (by[q] = by[q] || []).push(r); });
  const qs = Object.keys(by).sort().filter(q => by[q].length === 3).map(q => {
    const m = by[q], ps = m.map(r => r.price).filter(v => v != null);
    return { q, daily: m.reduce((s, r) => s + (r.daily || 0), 0) / 3, usd: m.reduce((s, r) => s + r.usd, 0),
             price: ps.length === 3 ? ps.reduce((a, b) => a + b, 0) / 3 : null, prelim: m.some(r => r.prelim) };
  });
  const at = Object.fromEntries(qs.map((r, i) => [r.q, r]));
  const prevQ = q => { let [y, n] = [+q.slice(0, 4), +q.slice(6)]; n--; if (!n) { n = 4; y--; } return `${y} Q${n}`; };
  qs.forEach(r => {
    const pq = at[prevQ(r.q)], py = at[`${+r.q.slice(0, 4) - 1}${r.q.slice(4)}`];
    r.qoq = pq?.daily ? r.daily / pq.daily - 1 : null;
    r.yoy = py?.daily ? r.daily / py.daily - 1 : null;
    r.pqoq = pq?.price && r.price ? r.price / pq.price - 1 : null;
    r.pyoy = py?.price && r.price ? r.price / py.price - 1 : null;
  });
  return qs;
}

// ── 표시 ─────────────────────────────────────────────
function _exUsd(v) {
  if (v == null || !isFinite(v)) return '';
  const a = Math.abs(v);
  if (a >= 1e8) return `${(v / 1e8).toFixed(a >= 1e10 ? 0 : 1)}억$`;
  if (a >= 1e4) return `${Math.round(v / 1e4).toLocaleString()}만$`;
  return `${Math.round(v).toLocaleString()}$`;
}
const _exKg = v => v == null ? '' : v >= 1e3 ? `${(v / 1e3).toLocaleString(undefined, { maximumFractionDigits: 1 })}t` : `${Math.round(v).toLocaleString()}kg`;
const _exPx = v => v == null ? '' : v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(2);
function _exPct(v) {
  if (v == null || !isFinite(v)) return '<span class="ex-dim">–</span>';
  const p = v * 100, c = p > 0 ? 'var(--up)' : p < 0 ? 'var(--down)' : 'var(--text2)';
  return `<span style="color:${c}">${p > 0 ? '+' : ''}${Math.abs(p) >= 100 ? Math.round(p) : p.toFixed(1)}%</span>`;
}
function _exParts(it) {
  return (it.parts || []).map(p => p.hs === '*' ? `총수출${p.cn ? ' · ' + (EXP_CNTY[p.cn] || p.cn) : ''}`
    : `${p.hs}${p.cn ? ' · ' + (EXP_CNTY[p.cn] || p.cn) : ''}${p.rg ? ' · ' + p.rg : ''}`).join(' + ');
}

function _exRender() {
  const body = document.getElementById('ex-body');
  if (!body || !EXP.items) return;
  const q = EXP.q;
  let list = EXP.items.filter(i => i.tab === EXP.tab).filter(i => !q
    || `${i.name} ${i.co || ''} ${i.note || ''} ${_exParts(i)} ${(i.orig || []).join(' ')}`.toLowerCase().includes(q));
  list = list.map(it => {
    const ser = _exSeries(it), last = ser[ser.length - 1], qs = _exQuarters(ser), lq = qs[qs.length - 1];
    return { it, last, lq };
  });
  if (EXP.sort) {
    const g = { mom: x => x.last?.mom, yoy: x => x.last?.yoy, pyoy: x => x.last?.pyoy, daily: x => x.last?.daily,
                qoq: x => x.lq?.qoq, qyoy: x => x.lq?.yoy }[EXP.sort.key];
    list.sort((a, b) => { const va = g(a), vb = g(b); if (va == null) return 1; if (vb == null) return -1; return (va - vb) * EXP.sort.dir; });
  }
  const p = EXP.tab === 'p';
  const th = (k, l, t) => `<th class="ex-num ex-sort" onclick="setExSort('${k}')" title="${escAttr(t)}">${l}${EXP.sort?.key === k ? (EXP.sort.dir < 0 ? ' ▼' : ' ▲') : ''}</th>`;
  const stale = it => it.orig_last && EXP.latest && it.orig_last < _exYm(EXP.latest, -2)
    ? `<span class="ex-tag" title="원작자가 ${escAttr(it.orig_last)} 이후 갱신하지 않은 시트 — 여기서는 계속 받습니다">원본 ${it.orig_last.slice(2).replace('-', '.')}</span>` : '';
  body.innerHTML = `
  <div class="card ex-card"><div class="table-wrap ex-scroll"><table class="ex-tbl">
    <thead><tr><th class="ex-name">품목</th><th>관련 기업</th><th class="ex-num">기준월</th>
      ${th('daily', '일평균', '일평균 수출(수입) = 금액 ÷ 영업일수')}
      ${th('mom', '전월비', '일평균 MoM')}${th('yoy', '전년비', '일평균 YoY (전년 같은 달)')}
      ${th('qoq', '분기 QoQ', '분기 일평균(3달 평균) 전분기비 — 3달이 다 찬 최근 분기')}${th('qyoy', '분기 YoY', '분기 일평균 전년 같은 분기비')}
      ${p ? th('pyoy', '판가 YoY', '판가(금액 ÷ 중량) 전년 같은 달 대비') : ''}</tr></thead>
    <tbody>${list.map(({ it, last, lq }) => `
      <tr class="ex-row ${EXP.sel === it.id ? 'active' : ''}" onclick="openExItem('${escAttr(it.id)}')">
        <td class="ex-name" title="${escAttr(_exParts(it))}">${escapeHtml(it.name)}${it.flow === 'imp' ? ' <span class="ex-tag">수입</span>' : ''}${stale(it)}</td>
        <td class="ex-co" title="${escAttr(it.co || '')}">${escapeHtml(it.co || '')}</td>
        <td class="ex-num">${last ? `${last.ym.slice(2).replace('-', '.')}${last.prelim ? `<span class="ex-tag ex-pre">${EXP_PERIOD[last.prelim]}</span>` : ''}` : '<span class="ex-dim">없음</span>'}</td>
        <td class="ex-num">${last ? _exUsd(last.daily) : ''}</td>
        <td class="ex-num">${last ? _exPct(last.mom) : ''}</td><td class="ex-num">${last ? _exPct(last.yoy) : ''}</td>
        <td class="ex-num">${lq ? _exPct(lq.qoq) : ''}</td><td class="ex-num">${lq ? _exPct(lq.yoy) : ''}</td>
        ${p ? `<td class="ex-num">${last ? _exPct(last.pyoy) : ''}</td>` : ''}
      </tr>`).join('')}</tbody>
  </table></div>
  ${!list.length ? emptyHTML('검색 결과 없음') : ''}
  <div class="ex-foot">${list.length}개 · 일평균 = 금액 ÷ 영업일수(원본 분모, 이후 거래일 달력) · 빨강 = 증가 · 파랑 = 감소
    ${p ? '' : ' · 지역은 HS 6자리 × 시군구 금액(2026-09-01부터 지역 중량·10자리 비공개)'}</div></div>`;
}

async function openExItem(id) {
  EXP.sel = EXP.sel === id ? null : id;
  _exRender();
  const el = document.getElementById('ex-detail');
  if (!el) return;
  if (EXP.chart) { EXP.chart.destroy(); EXP.chart = null; }
  if (!EXP.sel) { el.innerHTML = ''; return; }
  const it = EXP.items.find(i => i.id === id);
  el.innerHTML = `<div class="card ex-card">${loadingHTML('불러오는 중...')}</div>`;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  // 이 항목 계열의 전체 기간을 받는다 (목록은 최근 27개월만)
  const need = (it.parts || []).filter(p => p.hs !== '*').map(_exKey).filter(k => !EXP.full.has(k));
  try {
    await Promise.all(need.map(async k => {
      const [lvl, hs, area] = k.split('|');
      const rows = await fetchAllPages((a, b) => sb.from('export_monthly').select('lvl,hs,area,ym,exp_usd,exp_wgt,imp_usd,imp_wgt')
        .eq('lvl', lvl).eq('hs', hs).eq('area', area).order('ym').range(a, b));
      _exPut(rows);
      EXP.full.add(k);
    }));
  } catch (e) { el.innerHTML = `<div class="card ex-card">${errorHTML(e.message || '조회 실패')}</div>`; return; }
  if (EXP.sel !== id) return;
  _exDetail(it);
}

function _exDetail(it) {
  const el = document.getElementById('ex-detail');
  const ser = _exSeries(it), qs = _exQuarters(ser);
  // 원본 판가(관리자, 공장·지역): 원본 금액이 관세청 값과 같은 달이 80% 이상일 때만
  const wb = EXP.wb[it.id];
  let wbOk = false;
  if (wb) {
    const both = ser.filter(r => wb[r.ym]?.usd);
    const same = both.filter(r => Math.abs(wb[r.ym].usd / r.usd - 1) < 0.01);
    wbOk = both.length >= 6 && same.length / both.length >= 0.8;
    if (wbOk) ser.forEach(r => { const w = wb[r.ym]; r.wbPrice = w?.wgt ? w.usd / w.wgt : null; });
  }
  const hasW = ser.some(r => r.price != null), hasWb = wbOk && ser.some(r => r.wbPrice != null);
  const unit = it.flow === 'imp' ? '수입' : '수출';
  const rowsM = [...ser].reverse();
  el.innerHTML = `
  <div class="card ex-card ex-detail">
    <div class="card-header" style="flex-wrap:wrap;gap:6px">
      <span class="card-title">${escapeHtml(it.name)}</span>
      <span class="card-sub" style="margin-right:auto">${escapeHtml(_exParts(it))} · ${unit}${it.co ? ' · ' + escapeHtml(it.co) : ''}</span>
      <button class="chip chip-sm" onclick="openExItem('${escAttr(it.id)}')">닫기</button>
    </div>
    <div class="ex-meta">${it.note ? escapeHtml(it.note) + ' · ' : ''}원본 시트: ${escapeHtml((it.orig || []).join(', '))}${it.orig_last ? ` (원본 마지막 ${escapeHtml(it.orig_last)})` : ''}
      ${wb && !wbOk ? ' · 원본 금액이 관세청 값과 기준이 달라(10자리 등) 원본 판가는 생략' : ''}</div>
    ${!ser.length ? emptyHTML('아직 받은 데이터가 없습니다', (it.parts || []).some(p => p.hs === '*') ? '총수출·국가 총액은 아직 수집하지 않습니다' : '') : `
    <div class="ex-chart"><canvas id="ex-canvas"></canvas></div>
    <div class="ex-two">
      <div class="table-wrap ex-scroll"><table class="ex-tbl">
        <thead><tr><th>년월</th><th class="ex-num">금액</th>${hasW ? '<th class="ex-num">중량</th>' : ''}<th class="ex-num">영업일</th>
          <th class="ex-num">일평균</th><th class="ex-num">MoM</th><th class="ex-num">YoY</th>
          ${hasW ? '<th class="ex-num">판가 $/kg</th><th class="ex-num">판가 YoY</th>' : ''}${hasWb ? '<th class="ex-num" title="원본 워크북 금액 ÷ 중량 (관리자만)">원본 판가</th>' : ''}</tr></thead>
        <tbody>${rowsM.map(r => `<tr>
          <td>${r.ym.replace('-', '.')}${r.prelim ? `<span class="ex-tag ex-pre">${EXP_PERIOD[r.prelim]}</span>` : ''}</td>
          <td class="ex-num">${_exUsd(r.usd)}</td>${hasW ? `<td class="ex-num">${_exKg(r.wgt)}</td>` : ''}
          <td class="ex-num">${r.days || ''}</td><td class="ex-num">${_exUsd(r.daily)}</td>
          <td class="ex-num">${_exPct(r.mom)}</td><td class="ex-num">${_exPct(r.yoy)}</td>
          ${hasW ? `<td class="ex-num">${_exPx(r.price)}</td><td class="ex-num">${_exPct(r.pyoy)}</td>` : ''}
          ${hasWb ? `<td class="ex-num">${_exPx(r.wbPrice)}</td>` : ''}</tr>`).join('')}</tbody>
      </table></div>
      <div class="table-wrap ex-scroll"><table class="ex-tbl">
        <thead><tr><th>분기</th><th class="ex-num">분기 일평균</th><th class="ex-num">QoQ</th><th class="ex-num">YoY</th>
          <th class="ex-num">분기 금액</th>${hasW ? '<th class="ex-num">분기 판가</th><th class="ex-num">QoQ</th><th class="ex-num">YoY</th>' : ''}</tr></thead>
        <tbody>${[...qs].reverse().map(r => `<tr>
          <td>${r.q}${r.prelim ? '<span class="ex-tag ex-pre">잠정</span>' : ''}</td><td class="ex-num">${_exUsd(r.daily)}</td>
          <td class="ex-num">${_exPct(r.qoq)}</td><td class="ex-num">${_exPct(r.yoy)}</td><td class="ex-num">${_exUsd(r.usd)}</td>
          ${hasW ? `<td class="ex-num">${_exPx(r.price)}</td><td class="ex-num">${_exPct(r.pqoq)}</td><td class="ex-num">${_exPct(r.pyoy)}</td>` : ''}</tr>`).join('')}</tbody>
      </table></div>
    </div>`}
  </div>`;
  if (ser.length && typeof Chart !== 'undefined') _exChart(ser, hasW, unit);
}

function _exChart(ser, hasW, unit) {
  const cv = document.getElementById('ex-canvas');
  if (!cv) return;
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const ds = [{ type: 'bar', label: `일평균 ${unit}`, data: ser.map(r => r.daily), yAxisID: 'y',
                backgroundColor: ser.map(r => r.prelim ? 'rgba(160,160,160,.55)' : 'rgba(91,141,239,.6)') }];
  if (hasW) ds.push({ type: 'line', label: '판가 $/kg', data: ser.map(r => r.price), yAxisID: 'y1',
                      borderColor: css('--up') || '#ef4444', pointRadius: 0, borderWidth: 1.5, spanGaps: true });
  EXP.chart = new Chart(cv, {
    data: { labels: ser.map(r => r.ym.slice(2).replace('-', '.')), datasets: ds },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { labels: { color: css('--text2'), boxWidth: 10 } },
                 tooltip: { callbacks: { label: c => c.dataset.yAxisID === 'y' ? `${c.dataset.label} ${_exUsd(c.raw)}` : `${c.dataset.label} ${_exPx(c.raw)}` } } },
      scales: {
        x: { ticks: { color: css('--text3'), maxTicksLimit: 12 }, grid: { display: false } },
        y: { ticks: { color: css('--text3'), callback: v => _exUsd(v) }, grid: { color: 'rgba(128,128,128,.12)' } },
        ...(hasW ? { y1: { position: 'right', ticks: { color: css('--text3'), callback: v => _exPx(v) }, grid: { display: false } } } : {}),
      },
    },
  });
}

// ── 잠정치 붙여넣기 (관리자) ─────────────────────────
// TRASS '잠정치조회' 결과 표를 그대로 복사해 붙인다. 줄마다 HS코드·년월·국가·기간(01~10)이 있으면 그 값을,
// 없으면 아래에서 고른 값을 쓴다. 숫자 칸은 뒤에서 세 개가 금액(달러) · 금액(원화) · 중량(kg) (둘이면 금액·중량).
function _exPrelimSets() {
  const s = {};
  EXP.prelim.forEach(r => { const k = `${r.ym}|${r.period}|${r.flow}`; s[k] = (s[k] || 0) + 1; });
  return Object.entries(s).sort((a, b) => b[0].localeCompare(a[0]));
}

function _exDefaultPeriod() {
  const t = new Date(Date.now() + 9 * 3600e3), d = t.getUTCDate();
  const ym = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
  return d <= 10 ? { ym: _exYm(ym, -1), per: 'm' } : d <= 20 ? { ym, per: '10' } : { ym, per: '20' };
}

function openExPaste() {
  const m = document.getElementById('ex-modal');
  if (!m || !isAdmin()) return;
  const dp = _exDefaultPeriod();
  const sel = EXP.items.find(i => i.id === EXP.sel);
  const one = sel && sel.parts?.length === 1 && !sel.parts[0].rg && sel.parts[0].hs !== '*' ? sel : null;
  m.innerHTML = `
  <div class="modal-overlay open" onclick="if(event.target===this)closeExPaste()">
    <div class="modal ex-paste">
      <div class="card-header"><span class="card-title">TRASS 잠정치 붙여넣기</span>
        <button class="chip chip-sm" style="margin-left:auto" onclick="closeExPaste()">닫기</button></div>
      <div class="ex-meta">관리자만 보이고 저장됩니다(TRASS 약관: 조회한 정보를 남에게 제공 금지). 같은 달 확정치(15일경)가 들어오면 화면은 확정치를 씁니다.</div>
      <div class="ex-form">
        <label>년월 <input id="ex-p-ym" type="month" value="${dp.ym}"></label>
        <label>기간 <select id="ex-p-per">${Object.entries(EXP_PERIOD).map(([k, l]) => `<option value="${k}" ${k === dp.per ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>구분 <select id="ex-p-flow"><option value="exp">수출</option><option value="imp">수입</option></select></label>
        <label>금액 단위 <select id="ex-p-unit"><option value="1">달러·원</option><option value="1000">천달러·천원</option><option value="1000000">백만달러·백만원</option></select></label>
        <label>HS(줄에 없을 때) <input id="ex-p-hs" value="${one ? escAttr(one.parts[0].hs) : ''}" placeholder="8542321010" size="11"></label>
        <label>국가(줄에 없을 때) <select id="ex-p-cn"><option value="">전체</option>${Object.entries(EXP_CNTY).map(([c, n]) =>
          `<option value="${c}" ${one?.parts[0].cn === c ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      </div>
      <textarea id="ex-p-text" class="ex-text" placeholder="TRASS 결과 표를 복사해 붙여넣으세요" oninput="previewExPaste()"></textarea>
      <div id="ex-p-prev"></div>
      <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:8px">
        <button class="chip chip-sm active" onclick="saveExPaste()">저장</button></div>
      ${_exPrelimSets().length ? `<div class="ex-meta" style="margin-top:10px">저장된 잠정치: ${_exPrelimSets().map(([k, n]) => {
        const [ym, per, fl] = k.split('|');
        return `<span class="ex-tag">${ym} ${EXP_PERIOD[per]}${fl === 'imp' ? ' 수입' : ''} ${n}건
          <a href="javascript:void(0)" onclick="delExPrelim('${ym}','${per}','${fl}')" title="이 묶음 지우기">✕</a></span>`;
      }).join(' ')}</div>` : ''}
    </div>
  </div>`;
  ['ex-p-ym', 'ex-p-per', 'ex-p-flow', 'ex-p-unit', 'ex-p-hs', 'ex-p-cn'].forEach(i => document.getElementById(i)?.addEventListener('change', previewExPaste));
}

function closeExPaste() { const m = document.getElementById('ex-modal'); if (m) m.innerHTML = ''; }

function _exParsePaste() {
  const v = id => document.getElementById(id)?.value || '';
  const unit = +v('ex-p-unit') || 1, flow = v('ex-p-flow') || 'exp';
  const defYm = v('ex-p-ym'), defPer = v('ex-p-per'), defHs = v('ex-p-hs').replace(/\D/g, ''), defCn = v('ex-p-cn');
  const cnByName = Object.fromEntries(Object.entries(EXP_CNTY).map(([c, n]) => [n, c]));
  const out = [], skipped = [];
  v('ex-p-text').split(/\r?\n/).forEach(line => {
    if (!line.trim()) return;
    const cells = line.split(/\t| {2,}/).map(s => s.trim()).filter(Boolean);
    let hs = '', ym = '', per = '', cn = '';
    const nums = [];
    cells.forEach(c => {
      const digits = c.replace(/[.\-\s]/g, '');
      let m;
      if (!ym && (m = c.match(/^(20\d{2})\s*[.\-/년]?\s*(\d{1,2})\s*월?$/)) && +m[2] >= 1 && +m[2] <= 12) { ym = `${m[1]}-${m[2].padStart(2, '0')}`; return; }
      if (!per && (m = c.match(/^0?1\s*[~-]\s*(\d{1,2})(일)?$/))) { per = +m[1] <= 10 ? '10' : +m[1] <= 20 ? '20' : 'm'; return; }
      if (cnByName[c]) { cn = cnByName[c]; return; }
      if (!hs && /^\d{4}([.\-]?\d{2}){0,3}$/.test(c) && [4, 6, 10].includes(digits.length) && !/,/.test(c)) { hs = digits; return; }
      if (/^-?[\d,]+(\.\d+)?$/.test(c)) nums.push(+c.replace(/,/g, ''));
    });
    if (!nums.length) return;   // 머리글 등
    hs = hs || defHs; ym = ym || defYm; per = per || defPer; cn = cn || defCn;
    if (!hs || !/^\d{4}-\d{2}$/.test(ym)) { skipped.push(line.slice(0, 40)); return; }
    // 숫자는 뒤에서부터 금액(달러)·금액(원화)·중량 — 앞의 순번 칸은 버린다. 숫자가 둘이면 금액·중량
    const v3 = nums.length >= 3 ? nums.slice(-3) : null;
    const usd = (v3 ? v3[0] : nums[0]) * unit, krw = v3 ? v3[1] * unit : null, wgt = v3 ? v3[2] : nums.length === 2 ? nums[1] : null;
    out.push({ hs, cn, ym, period: per, flow, usd, krw, wgt });
  });
  return { out, skipped };
}

function previewExPaste() {
  const el = document.getElementById('ex-p-prev');
  if (!el) return;
  const { out, skipped } = _exParsePaste();
  if (!out.length) { el.innerHTML = skipped.length ? `<div class="ex-meta">읽지 못한 줄 ${skipped.length}개 — HS코드를 줄에 넣거나 위에서 고르세요</div>` : ''; return; }
  const who = r => EXP.items.filter(i => (i.parts || []).some(p => !p.rg && p.hs === r.hs && (p.cn || '') === r.cn)).map(i => i.name);
  el.innerHTML = `<div class="table-wrap" style="max-height:30vh;overflow:auto"><table class="ex-tbl">
    <thead><tr><th>HS</th><th>국가</th><th>년월</th><th>기간</th><th class="ex-num">금액</th><th class="ex-num">중량</th><th>들어갈 품목</th></tr></thead>
    <tbody>${out.map(r => { const w = who(r); return `<tr><td>${r.hs}</td><td>${EXP_CNTY[r.cn] || '전체'}</td><td>${r.ym}</td><td>${EXP_PERIOD[r.period]}</td>
      <td class="ex-num">${_exUsd(r.usd)}</td><td class="ex-num">${_exKg(r.wgt)}</td>
      <td>${w.length ? escapeHtml(w.join(', ')) : '<span style="color:var(--down)">목록에 없음</span>'}</td></tr>`; }).join('')}</tbody>
  </table></div>${skipped.length ? `<div class="ex-meta">읽지 못한 줄 ${skipped.length}개</div>` : ''}`;
}

async function saveExPaste() {
  const { out } = _exParsePaste();
  if (!out.length) { toast('저장할 줄이 없습니다', 'error'); return; }
  const { error } = await sb.from('export_prelim').upsert(out, { onConflict: 'hs,cn,ym,period,flow' });
  if (error) { toast('저장 실패: ' + error.message, 'error'); return; }
  toast(`잠정치 ${out.length}건 저장`, 'success');
  await _exLoadAdmin();
  closeExPaste();
  _exControls(); _exRender();
  const it = EXP.items.find(i => i.id === EXP.sel);
  if (it) _exDetail(it);
}

async function delExPrelim(ym, per, flow) {
  if (!confirm(`${ym} ${EXP_PERIOD[per]} 잠정치를 지울까요?`)) return;
  const { error } = await sb.from('export_prelim').delete().eq('ym', ym).eq('period', per).eq('flow', flow);
  if (error) { toast('삭제 실패: ' + error.message, 'error'); return; }
  await _exLoadAdmin();
  openExPaste();
  _exControls(); _exRender();
}

function unloadExports() {
  if (EXP.chart) { EXP.chart.destroy(); EXP.chart = null; }
}
