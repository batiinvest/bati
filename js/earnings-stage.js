// earnings-stage.js — DISCOVER '실적 국면' 페이지 (10-11)
// [원본] 태린이아빠 「확정실적 분석」 — '데이터정리' 시트(종목 × 분기 국면, 최근 분기 '2'에 빨간 칸) +
//   '실적확인'·'확정실적그래프' 시트(한 종목의 분기 매출·영업이익·전년비·스프레드·국면, 매수/매도 표시).
//   국면 수식(직전 분기 국면 P, 매출g·영업g = 전년 동분기 대비 %, 스프레드 = 매출g − 영업g):
//     1   = P≠2·2.5 ∧ 매출g>5 ∧ 매출g>영업g ∧ 매출이 최근 8분기 최고
//     2.5 = 영업g>매출g ∧ 스프레드가 직전보다 큼  — P가 1·2·2.5면 이것만, P가 4·NA·빈칸이면 매출g>5·8분기 최고도
//     2   = 위와 같고 스프레드가 직전보다 작음
//     3   = P≠4 ∧ 매출g>영업g · 4 = 매출g<0 · 그 밖 NA   (P가 3이면 2·2.5로 바로 못 간다 — 원본 수식 그대로)
//   원본 '실적확인' 표시: 0<국면<2.6 → 매수, 국면>2.9 → 매도.
// 계산은 백엔드 earnings_stage.py(매일 20:10·07:40) — 원본 입력으로 '데이터정리' 51,100칸 전부 재현.
//   입력은 DataGuide 대신 financials(DART, 연결 우선) → 2026Q2 같은 종목 기준 89% 일치(차이 이유는 백엔드 머리말).
//   이력이 2023년부터라 국면은 2024Q1부터 — 앞쪽 분기는 직전 국면을 몰라 원본과 덜 맞는다.
// 원본에서 뺀 것: 주가 선(원본은 분기와 주가 날짜가 한두 분기 어긋나 있고, 우리는 분기별 장기 주가가 없음) · 컨센 추정 분기.
// 의존: config.js (sb, fetchAllPages, getLatestMarketDate, escapeHtml, escAttr, loadingHTML, emptyHTML, errorHTML, fmtCap), Chart.js

const ES = {
  rows: null,        // earnings_stage 행 (history 제외)
  comp: {},          // 종목코드 → {name, market, wics}
  cap: {},           // 종목코드 → 시가총액(원)
  period: null,      // 기준 분기 (기본 = 가장 많은 종목의 최근 분기)
  stage: '2',        // 국면 필터 — 원본이 최근 분기 '2'에 빨간 칸을 칠한다
  changed: false,    // 직전 분기와 국면이 다른 종목만
  q: '',
  ind: '',
  sort: { key: 'cap', dir: -1 },
  limit: 200,
  sel: null,         // 상세로 연 종목코드
  charts: [],
  missing: false,
  updated: null,
};
const ES_STAGES = ['1', '2', '2.5', '3', '4', 'NA'];
const ES_BUY = s => s === '1' || s === '2' || s === '2.5';   // 원본 '실적확인' 0<국면<2.6 → 매수
const ES_SELL = s => s === '3' || s === '4';                 //               국면>2.9 → 매도
const ES_YOY_CLIP = 500;   // 상세 차트 축 — 원본 '실적확인'도 ±500% 넘으면 500%로 표시

function pEarnStage() {
  return `
  <div class="es-head">
    <div id="es-chips" class="es-chips"></div>
    <select id="es-period" class="es-sel" onchange="setEsPeriod(this.value)"></select>
    <label class="es-chk"><input type="checkbox" id="es-changed" onchange="setEsChanged(this.checked)"> 국면 바뀐 종목만</label>
    <select id="es-ind" class="es-sel" onchange="setEsInd(this.value)"><option value="">업종 전체</option></select>
    <input id="es-q" class="es-q" placeholder="종목명·코드" oninput="setEsQuery(this.value)">
    <span id="es-asof" class="es-asof"></span>
  </div>
  <div class="card es-rule"><div class="card-body">
    태린이아빠 「확정실적 분석」 — 분기 확정실적의 <b>매출 전년비(매출g)</b>·<b>영업이익 전년비(영업g)</b>·<b>스프레드(매출g − 영업g)</b>로 국면을 매깁니다. 위에서부터 먼저 맞는 것:
    <div class="es-rule-grid">
      <span class="es-st es-st-1">1</span><span>직전 국면이 2·2.5가 아니고 · 매출g &gt; 5% · 매출g &gt; 영업g · 매출이 최근 8분기 최고</span>
      <span class="es-st es-st-2-5">2.5</span><span>영업g &gt; 매출g · 스프레드가 직전 분기보다 커짐</span>
      <span class="es-st es-st-2">2</span><span>영업g &gt; 매출g · 스프레드가 직전 분기보다 작아짐
        <span class="es-dim">— 2.5·2 모두 직전이 4·NA면 매출g &gt; 5%·8분기 최고도 필요, 직전이 3이면 해당 없음(원본 수식)</span></span>
      <span class="es-st es-st-3">3</span><span>직전 국면이 4가 아니고 · 매출g &gt; 영업g</span>
      <span class="es-st es-st-4">4</span><span>매출g &lt; 0</span>
      <span class="es-st es-st-NA">NA</span><span>어디에도 안 맞음</span>
    </div>
    <span class="es-dim">전년비 = (당분기 − 전년 동분기) ÷ |전년 동분기| (원본 DataGuide 방식). 원본 '실적확인' 표시: 1·2·2.5 = 매수, 3·4 = 매도. 줄을 누르면 분기별 표·차트가 열립니다.</span>
  </div></div>
  <div id="es-detail"></div>
  <div id="es-body">${loadingHTML('불러오는 중...')}</div>`;
}

const _esMissing = e => /42P01|PGRST205|does not exist|Could not find/.test(`${e?.code} ${e?.message}`);
const _esCode = c => String(c || '').split('.')[0];

async function loadEarnStage() {
  const body = document.getElementById('es-body');
  if (!body) return;
  try {
    if (!ES.rows) {
      const d = await getLatestMarketDate();
      const [rows, comp, cap] = await Promise.all([
        fetchAllPages(sb.from('earnings_stage')
          .select('stock_code,period,stage,prev_stage,sales_yoy,op_yoy,spread,sales_high,revenue,op,fs_div,trail,updated_at')
          .order('stock_code')),
        fetchAllPages(sb.from('companies').select('code,name,market,wics_industry').eq('active', true).order('code')),
        d ? fetchAllPages(sb.from('market_data').select('stock_code,market_cap').eq('base_date', d).order('stock_code')) : [],
      ]);
      ES.comp = {};
      comp.forEach(c => { ES.comp[_esCode(c.code)] = { name: c.name, market: c.market, wics: c.wics_industry }; });
      ES.cap = Object.fromEntries(cap.map(r => [r.stock_code, r.market_cap]));
      ES.rows = rows.filter(r => ES.comp[r.stock_code]);
      ES.updated = rows.reduce((m, r) => (r.updated_at > (m || '') ? r.updated_at : m), null);
      const cnt = {};
      ES.rows.forEach(r => { cnt[r.period] = (cnt[r.period] || 0) + 1; });
      ES.periods = Object.keys(cnt).sort().reverse();
      ES.periodCnt = cnt;
      if (!ES.period || !cnt[ES.period]) ES.period = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
      ES.missing = false;
    }
  } catch (e) {
    ES.missing = _esMissing(e);
    if (!ES.missing) { console.warn('[실적 국면]', e); body.innerHTML = errorHTML(e.message || '조회 실패'); return; }
  }
  if (ES.missing || !ES.rows?.length) {
    body.innerHTML = emptyHTML(ES.missing ? '준비 중 — 데이터 표를 만드는 중입니다.' : '아직 계산된 국면이 없습니다',
      ES.missing ? '' : '매일 20:10·07:40에 계산합니다');
    return;
  }
  _esControls();
  _esRender();
}

function _esControls() {
  const ps = document.getElementById('es-period');
  if (ps) ps.innerHTML = ES.periods.map(p =>
    `<option value="${escAttr(p)}" ${p === ES.period ? 'selected' : ''}>최근 실적 ${escapeHtml(p.replace('Q', ' ') + '분기')} · ${ES.periodCnt[p]}종목</option>`).join('');
  if (ps) ps.title = '종목마다 가장 최근에 나온 분기 실적으로 묶습니다 — 이전 분기를 고르면 아직 다음 실적이 안 나온 종목만 보입니다';
  const is = document.getElementById('es-ind');
  if (is && is.options.length <= 1) {
    const inds = [...new Set(ES.rows.map(r => ES.comp[r.stock_code]?.wics).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
    is.innerHTML = '<option value="">업종 전체</option>' + inds.map(i => `<option value="${escAttr(i)}">${escapeHtml(i)}</option>`).join('');
    is.value = ES.ind;
  }
  const cb = document.getElementById('es-changed');
  if (cb) cb.checked = ES.changed;
  const q = document.getElementById('es-q');
  if (q && q.value !== ES.q) q.value = ES.q;
  const asof = document.getElementById('es-asof');
  if (asof) {
    const k = ES.updated ? new Date(new Date(ES.updated).getTime() + 9 * 3600e3).toISOString() : '';
    asof.textContent = k ? `계산 ${k.slice(5, 10).replace('-', '/')} ${k.slice(11, 16)}` : '';
  }
}

function setEsStage(s) { ES.stage = s; ES.limit = 200; _esRender(); }
function setEsPeriod(p) { ES.period = p; ES.limit = 200; _esRender(); }
function setEsChanged(v) { ES.changed = v; ES.limit = 200; _esRender(); }
function setEsInd(v) { ES.ind = v; ES.limit = 200; _esRender(); }
function setEsQuery(v) { ES.q = v.trim(); ES.limit = 200; _esRender(); }
function setEsSort(key) {
  ES.sort = ES.sort.key === key ? { key, dir: -ES.sort.dir } : { key, dir: key === 'name' ? 1 : -1 };
  _esRender();
}
function showEsAll() { ES.limit = Infinity; _esRender(); }

// 기준 분기·업종·검색까지 거른 행 (국면 칩 개수는 국면 필터 앞에서 센다)
function _esBase() {
  const q = ES.q.toLowerCase();
  return ES.rows.filter(r => {
    if (r.period !== ES.period) return false;
    const c = ES.comp[r.stock_code];
    if (ES.ind && c.wics !== ES.ind) return false;
    if (ES.changed && (r.stage || '') === (r.prev_stage || '')) return false;
    if (q && !(c.name || '').toLowerCase().includes(q) && !r.stock_code.includes(q)) return false;
    return true;
  });
}

function _esRender() {
  const body = document.getElementById('es-body');
  if (!body || !ES.rows) return;
  const base = _esBase();
  const cnt = { all: base.length };
  base.forEach(r => { const s = r.stage || '-'; cnt[s] = (cnt[s] || 0) + 1; });
  const chips = document.getElementById('es-chips');
  if (chips) chips.innerHTML = [['all', '전체'], ...ES_STAGES.map(s => [s, `국면 ${s}`])].map(([k, l]) =>
    `<button class="chip chip-sm ${ES.stage === k ? 'active' : ''}" onclick="setEsStage('${k}')">${l} <b>${cnt[k] || 0}</b></button>`).join('')
    + (cnt['-'] ? `<span class="es-dim" title="매출·영업이익 전년비를 못 구한 종목 (금융사 매출 없음·상장 첫해 등)">입력 없음 ${cnt['-']}</span>` : '');
  const list = base.filter(r => ES.stage === 'all' || r.stage === ES.stage);
  const val = {
    cap: r => ES.cap[r.stock_code] ?? null, sg: r => r.sales_yoy, og: r => r.op_yoy, sp: r => r.spread,
    rev: r => r.revenue, op: r => r.op, name: r => ES.comp[r.stock_code]?.name || '',
  }[ES.sort.key];
  list.sort((a, b) => {
    const x = val(a), y = val(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return (typeof x === 'string' ? x.localeCompare(y, 'ko') : x - y) * ES.sort.dir;
  });
  const shown = list.slice(0, ES.limit);
  const th = (k, l, cls = 'es-num') => `<th class="${cls} es-sort" onclick="setEsSort('${k}')">${l}${ES.sort.key === k ? (ES.sort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
  body.innerHTML = `<div class="card"><div class="table-wrap"><table class="es-tbl">
    <thead><tr><th>시장</th>${th('name', '종목명', 'es-name')}<th>업종</th><th title="오래된 분기 → 최근 분기">최근 8분기 국면</th>
      <th class="es-num">국면</th>${th('sg', '매출 전년비')}${th('og', '영업이익 전년비')}${th('sp', '스프레드')}
      <th class="es-num" title="당분기 매출이 최근 8분기(당분기 포함) 최고">8분기 최고</th>${th('rev', '매출')}${th('op', '영업이익')}${th('cap', '시가총액')}</tr></thead>
    <tbody>${shown.map(r => {
      const c = ES.comp[r.stock_code];
      return `<tr class="es-row ${ES.sel === r.stock_code ? 'active' : ''}" onclick="openEsStock(event,'${escAttr(r.stock_code)}')">
        <td class="es-dim">${c.market === 'KOSPI' ? '코스피' : c.market === 'KOSDAQ' ? '코스닥' : escapeHtml(c.market || '')}</td>
        <td class="es-name"><span data-stock-open="${escAttr(r.stock_code)}" data-stock-name="${escAttr(c.name)}" class="es-link" title="종목 상세">${escapeHtml(c.name)}</span>${r.fs_div === 'OFS' ? '<span class="es-tag" title="연결재무제표가 없어 별도 기준">별도</span>' : ''}</td>
        <td class="es-dim es-ind">${escapeHtml(c.wics || '')}</td>
        <td class="es-trail">${(r.trail || []).map(([p, s]) => _esChip(s, p)).join('')}</td>
        <td class="es-num">${_esChip(r.stage, r.period, true)}</td>
        <td class="es-num">${_esPct(r.sales_yoy)}</td><td class="es-num">${_esPct(r.op_yoy)}</td><td class="es-num">${_esPct(r.spread, true)}</td>
        <td class="es-num">${r.sales_high ? '●' : ''}</td>
        <td class="es-num">${_esEok(r.revenue)}</td><td class="es-num">${_esEok(r.op)}</td>
        <td class="es-num">${ES.cap[r.stock_code] != null ? fmtCap(ES.cap[r.stock_code]) : '—'}</td></tr>`;
    }).join('')}</tbody></table></div>
    ${!list.length ? emptyHTML('조건에 맞는 종목이 없습니다') : ''}
    ${list.length > shown.length ? `<div class="es-more"><button class="chip chip-sm" onclick="showEsAll()">전부 보기 (${list.length}종목)</button></div>` : ''}
    <div class="es-foot">${list.length}종목 · ${escapeHtml(ES.period || '')} 기준(그 분기가 최근 실적인 종목) · 전년비 빨강 = 증가 · 파랑 = 감소 ·
      입력은 DART 정기보고서(연결 우선, 없으면 별도). 원본(DataGuide) 결과와 2026Q2 같은 종목 89% 일치 — 다른 이유: 지주사 등 원본과 수치가 다름 · 직전 국면 차이.
      보험·증권 등은 DART 매출액 칸이 없어, 2025년 이후 상장사는 전년 실적이 없어 국면이 비어 있습니다.</div></div>`;
}

const _esPct = (v, plain) => v == null ? '<span class="es-dim">—</span>'
  : `<span style="color:${plain ? 'var(--text1)' : v > 0 ? 'var(--up)' : v < 0 ? 'var(--down)' : 'var(--text1)'}">${v > 0 && !plain ? '+' : ''}${Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : v.toFixed(1)}%</span>`;
const _esEok = v => v == null ? '—' : Math.abs(v) >= 10000 ? `${(v / 10000).toFixed(1)}조` : `${Math.round(v).toLocaleString()}억`;
const _esChip = (s, p, big) => `<span class="es-st es-st-${s ? s.replace('.', '-') : 'none'}${big ? ' es-st-big' : ''}" title="${escAttr(p || '')}${s ? ' · 국면 ' + s : ' · 입력 없음'}">${s || '·'}</span>`;

// ── 종목 상세 (원본 '실적확인'·'확정실적그래프') ─────────────
async function openEsStock(ev, code) {
  if (ev?.target?.closest?.('[data-stock-open]')) return;   // 종목명은 전역 종목 상세
  ES.sel = ES.sel === code ? null : code;
  _esRender();
  const el = document.getElementById('es-detail');
  if (!el) return;
  _esDestroyCharts();
  if (!ES.sel) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="card es-card">${loadingHTML('불러오는 중...')}</div>`;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const { data, error } = await sb.from('earnings_stage').select('stock_code,period,stage,fs_div,history').eq('stock_code', code).maybeSingle();
  if (ES.sel !== code) return;
  if (error || !data) { el.innerHTML = `<div class="card es-card">${errorHTML(error?.message || '데이터 없음')}</div>`; return; }
  _esDetail(data);
}

function _esDetail(d) {
  const el = document.getElementById('es-detail');
  const c = ES.comp[d.stock_code] || {};
  const h = (d.history || []).map(x => ({ ...x, opm: x.rev > 0 && x.op != null ? x.op / x.rev * 100 : null }));
  const mark = s => ES_BUY(s) ? '<span style="color:var(--up);font-weight:700">매수</span>'
    : ES_SELL(s) ? '<span style="color:var(--down);font-weight:700">매도</span>' : '';
  el.innerHTML = `
  <div class="card es-card">
    <div class="card-header" style="flex-wrap:wrap;gap:6px">
      <span class="card-title">${escapeHtml(c.name || d.stock_code)}</span>
      <span class="card-sub" style="margin-right:auto">${escapeHtml(d.stock_code)} · ${escapeHtml(c.wics || '')} · ${d.fs_div === 'OFS' ? '별도' : '연결'} · 최근 ${escapeHtml(d.period || '')} 국면 ${_esChip(d.stage, d.period, true)}</span>
      <button class="chip chip-sm" data-stock-open="${escAttr(d.stock_code)}" data-stock-name="${escAttr(c.name || '')}">종목 상세</button>
      <button class="chip chip-sm" onclick="openEsStock(null,'${escAttr(d.stock_code)}')">닫기</button>
    </div>
    <div class="es-charts">
      <div><div class="es-ctitle">매출·영업이익 (억원) · 영업이익률</div><div class="es-chart"><canvas id="es-c1"></canvas></div></div>
      <div><div class="es-ctitle">전년비 (%) · 스프레드 <span class="es-dim">— 축은 ±${ES_YOY_CLIP}%에서 자름</span></div><div class="es-chart"><canvas id="es-c2"></canvas></div></div>
    </div>
    <div class="table-wrap es-scroll"><table class="es-tbl es-dtbl">
      <thead><tr><th>분기</th><th class="es-num">매출</th><th class="es-num">영업이익</th><th class="es-num">영업이익률</th>
        <th class="es-num">매출 전년비</th><th class="es-num">영업이익 전년비</th><th class="es-num">스프레드</th>
        <th class="es-num">8분기 최고</th><th class="es-num">국면</th><th class="es-num" title="원본 '실적확인': 0&lt;국면&lt;2.6 매수, 국면&gt;2.9 매도">원본 표시</th></tr></thead>
      <tbody>${[...h].reverse().map(x => `<tr>
        <td>${escapeHtml(x.p)}</td><td class="es-num">${_esEok(x.rev)}</td><td class="es-num">${_esEok(x.op)}</td>
        <td class="es-num">${x.opm == null ? '—' : x.opm.toFixed(1) + '%'}</td>
        <td class="es-num">${_esPct(x.sg)}</td><td class="es-num">${_esPct(x.og)}</td><td class="es-num">${_esPct(x.sp, true)}</td>
        <td class="es-num">${x.hi ? '●' : ''}</td><td class="es-num">${_esChip(x.st, x.p)}</td><td class="es-num">${mark(x.st)}</td></tr>`).join('')}</tbody>
    </table></div>
    <div class="es-foot">8분기 최고 = 당분기 매출이 최근 8분기(당분기 포함) 중 최고 — 이력이 2023년부터라 2024년까지는 8분기가 안 찹니다.
      국면은 직전 분기 국면에 따라 달라져서 이력 앞쪽(2024년)은 원본과 덜 맞습니다(원본 대조, 같은 종목 기준 2024Q2 61% → 2025Q2 82% → 2026Q2 89%).
      원본 차트의 주가 선은 뺐습니다(분기별 장기 주가 이력이 없음).</div>
  </div>`;
  if (typeof Chart !== 'undefined' && h.length) _esCharts(h);
}

function _esDestroyCharts() { ES.charts.forEach(ch => ch.destroy()); ES.charts = []; }
function unloadEarnStage() { _esDestroyCharts(); ES.sel = null; }

function _esCharts(h) {
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const labels = h.map(x => x.p.slice(2));
  const tick = { color: css('--text3') };
  const grid = { color: 'rgba(128,128,128,.12)' };
  const legend = { labels: { color: css('--text2'), boxWidth: 10 } };
  const c1 = document.getElementById('es-c1'), c2 = document.getElementById('es-c2');
  if (c1) ES.charts.push(new Chart(c1, {
    data: { labels, datasets: [
      { type: 'bar', label: '매출', data: h.map(x => x.rev), backgroundColor: 'rgba(91,141,239,.55)', yAxisID: 'y' },
      { type: 'bar', label: '영업이익', data: h.map(x => x.op), backgroundColor: 'rgba(245,158,11,.7)', yAxisID: 'y' },
      { type: 'line', label: '영업이익률', data: h.map(x => x.opm), borderColor: css('--up') || '#ef4444', pointRadius: 2, borderWidth: 1.5, yAxisID: 'y1', spanGaps: true },
    ] },
    options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend,
      tooltip: { callbacks: { label: c => c.dataset.yAxisID === 'y1' ? `영업이익률 ${c.raw == null ? '—' : c.raw.toFixed(1) + '%'}` : `${c.dataset.label} ${_esEok(c.raw)}` } } },
      scales: { x: { ticks: tick, grid: { display: false } }, y: { ticks: { ...tick, callback: v => _esEok(v) }, grid },
                y1: { position: 'right', ticks: { ...tick, callback: v => v + '%' }, grid: { display: false } } } },
  }));
  const clip = v => v == null ? null : Math.max(-ES_YOY_CLIP, Math.min(ES_YOY_CLIP, v));
  const big = h.some(x => [x.sg, x.og, x.sp].some(v => v != null && Math.abs(v) > ES_YOY_CLIP));
  const raw = { 0: h.map(x => x.sg), 1: h.map(x => x.og), 2: h.map(x => x.sp) };
  if (c2) ES.charts.push(new Chart(c2, {
    type: 'line',
    data: { labels, datasets: [
      { label: '매출 전년비', data: h.map(x => clip(x.sg)), borderColor: 'rgba(91,141,239,1)', pointRadius: 2, borderWidth: 1.5, spanGaps: true },
      { label: '영업이익 전년비', data: h.map(x => clip(x.og)), borderColor: 'rgba(245,158,11,1)', pointRadius: 2, borderWidth: 1.5, spanGaps: true },
      { label: '스프레드', data: h.map(x => clip(x.sp)), borderColor: css('--text3') || '#8590ad', borderDash: [4, 3], pointRadius: 0, borderWidth: 1.2, spanGaps: true },
    ] },
    options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend,
      tooltip: { callbacks: { label: c => { const v = raw[c.datasetIndex][c.dataIndex]; return `${c.dataset.label} ${v == null ? '—' : v.toFixed(1) + '%'}`; } } } },
      scales: { x: { ticks: tick, grid: { display: false } },
                y: { ticks: { ...tick, callback: v => v + '%' }, grid, ...(big ? { min: -ES_YOY_CLIP, max: ES_YOY_CLIP } : {}) } } },
  }));
}
