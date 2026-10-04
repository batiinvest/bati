// active-etf.js — DISCOVER '액티브 ETF' 페이지 (10-04)
// [원본] 태린이아빠 「액티브ETF를 관찰하자」 — 요약 시트 10개 = 탭, 탭마다 ETF 3개를 나란히:
//   시장 | 종목명 | 현재 비중 | 과거 비중 | 비중차이(현재 − 과거) | 증가율(현재 ÷ 과거 − 1, 과거에 없으면 '신규편입')
//   비중차이·증가율 열은 ETF마다 3색 단계(최소 초록 · 중앙값 노랑 · 최대 빨강 — 원본 조건부 서식 색 그대로)
//   종목 순서 = 현재 구성 순서(금액 큰 순). 과거에만 있던 종목은 원본처럼 나오지 않는다.
//   비중 = 금액 ÷ Σ(금액이 플러스이고 원화예금이 아닌 행) × 100, 소수 2자리 — 원본(DataGuide) 값과 같게 다시 계산(_aeWeights).
//     KRX 구성비중(COMPST_RTO)은 음수 현금·원화예금까지 분모에 넣어 4개 ETF가 원본과 달랐다(10-04 대조:
//     PLUS AI반도체소부장·WON 반도체밸류체인·RISE 비메모리·PLUS K제조업). 이 규칙으로 30개 999행 중 999행 일치.
// 날짜: 현재 = 저장된 최신 거래일, 과거 = 그보다 3거래일 전(원본 예시 09-28 vs 09-23) — 둘 다 고를 수 있다(10-04 사용자 결정)
// 데이터: active_etfs, active_etf_holdings (백엔드 collect_active_etf.py, 평일 19:35)
// 의존: config.js (sb, escapeHtml, escAttr, loadingHTML, emptyHTML, errorHTML)

const AE = {
  etfs: null,     // [{code, name, grp, grp_ord, ord}]
  groups: [],     // [{name, codes:[...]}]
  dates: [],      // 저장된 거래일, 최신 → 과거
  cur: null,      // 현재 날짜
  past: null,     // 비교(과거) 날짜
  tab: 0,
  missing: false, // 테이블 없음(sql/active_etf.sql 실행 전)
};
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
  _aeRenderTab();
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

function setAeTab(i) {
  AE.tab = i;
  _aeRenderControls();
  _aeRenderTab();
}

function setAeDate(which, d) {
  AE[which] = d;
  if (which === 'cur' && !(AE.past < AE.cur)) {      // 비교 날짜는 현재보다 앞이어야 한다 — 3거래일 전으로
    const i = AE.dates.indexOf(d);
    AE.past = AE.dates[Math.min(i + AE_PAST_GAP, AE.dates.length - 1)];
  }
  _aeRenderControls();
  _aeRenderTab();
}

async function _aeRenderTab() {
  const body = document.getElementById('ae-body');
  const g = AE.groups[AE.tab];
  if (!body || !g) return;
  if (!AE.past || AE.past >= AE.cur) { body.innerHTML = emptyHTML('현재보다 앞선 비교 날짜가 없습니다'); return; }
  body.innerHTML = loadingHTML('불러오는 중...');
  const want = `${AE.tab}|${AE.cur}|${AE.past}`;
  AE.want = want;
  try {
    const q = d => sb.from('active_etf_holdings').select('etf_code,item_code,item_name,mkt,amount,seq')
      .in('etf_code', g.codes).eq('base_date', d).order('etf_code').order('seq').limit(2000);
    const [{ data: cur, error: e1 }, { data: past, error: e2 }] = await Promise.all([q(AE.cur), q(AE.past)]);
    if (e1 || e2) throw (e1 || e2);
    if (AE.want !== want) return;   // 그사이 탭·날짜가 바뀜
    const nameOf = Object.fromEntries(AE.etfs.map(e => [e.code, e.name]));
    body.innerHTML = `<div class="ae-grid">${g.codes.map(c =>
      _aeTable(c, nameOf[c] || c, _aeWeights((cur || []).filter(r => r.etf_code === c)),
               _aeWeights((past || []).filter(r => r.etf_code === c)))).join('')}</div>`;
  } catch (e) {
    console.warn('[액티브ETF]', e);
    body.innerHTML = errorHTML(e.message || '조회 실패');
  }
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
