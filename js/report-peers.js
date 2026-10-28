// report-peers.js — 종목리포트 '동종비교' 탭
//   같은 세부 섹터(companies.industry + sub_industry) 종목의 분기 실적·수주잔고·밸류를 한 표와 추이 차트로 비교.
//   수주잔고 = DART 정기보고서 '매출 및 수주상황'의 기말 잔고 합계(서버 collect_backlog.py — 반도체 전공정·후공정 장비),
//     dart_segment_revenue segment_type='backlog_total', 백만원. MD 업로드분('backlog', 품목별)은 일부 종목뿐이라 쓰지 않는다.
//   비교 대상 = 섹터 기본 + 화면에서 빼기·더하기(이 기기 localStorage, 섹터별로 기억).
//   기준 분기 = 비교 대상 절반 이상이 실적을 낸 가장 최근 분기(실적 시즌 초 한두 곳만 낸 분기로 비교하지 않게).
// 의존: config.js(sb, fetchAllPages, finPreferFs, finNormalizeQuarters, getLatestMarketDate, fmtCap, searchCompanies, SERIES_PAL),
//       escapeHtml·escAttr, report-fnguide.js(_rpSecT), Chart.js, comparison.js(CMP·renderCmpSelected·runComparison)

const RPPEER = {
  key: '', me: null, base: [], list: [], ex: [], found: {},
  data: null, L: null, stats: {}, sort: 'mcap', dir: -1, metric: 'backlog', inChart: null, chart: null,
};
const RPPEER_COLORS = SERIES_PAL;   // config.js 공용 계열 색 — 첫 색(파랑)이 이 종목
// 수주잔고 수집 대상(서버 collect_backlog.SUBS와 같게) — 이 섹터인데 잔고가 한 건도 없으면 '미공시'
// (정기보고서에 잔고를 싣지 않음: HPSP '영업 기밀', 피에스케이 NDA 등). 대상 밖은 '—'.
const RPPEER_BL_SECTOR = { industry: '반도체', subs: ['전공정장비', '후공정장비'] };
const RPPEER_METRICS = [
  { k: 'backlog',  label: '수주잔고',    unit: '억' },
  { k: 'revenue',  label: '매출',        unit: '억' },
  { k: 'op',       label: '영업이익',    unit: '억' },
  { k: 'opm',      label: '영업이익률',  unit: '%' },
  { k: 'blr',      label: '잔고÷연매출', unit: '배' },
];

// ── 분기 키 'YYYY Qn' ──
const _rpqShift = (key, n) => {
  const [y, q] = key.split(' ');
  const i = (+y) * 4 + (+q.slice(1) - 1) + n;
  return `${Math.floor(i / 4)} Q${(i % 4) + 1}`;
};
const _rpqLabel = key => `${key.slice(2, 4)}.${key.slice(-1)}Q`;
const _rpqKor = key => `${key.slice(0, 4)}년 ${key.slice(-1)}분기`;

function _rpPeerPrefs(val) {
  const k = 'rpPeers:' + RPPEER.key;
  try {
    if (val === undefined) return JSON.parse(localStorage.getItem(k) || '{}') || {};
    localStorage.setItem(k, JSON.stringify(val));
  } catch (e) { /* 사생활 보호 창 등 — 기억만 못 함 */ }
  return {};
}

// ── 탭 진입 ──
async function _rpLoadAndRenderPeers(body) {
  if (!_rpStock || !body) return;
  try {
    const { data: me, error } = await sb.from('companies').select('code,name,industry,sub_industry')
      .eq('code', _rpStock.code).maybeSingle();
    if (error) throw error;
    if (!me?.industry || !me?.sub_industry) {
      body.innerHTML = `<div style="padding:30px;text-align:center;color:var(--text3);font-size:calc(12px*var(--m-sub))">
        세부 섹터가 정해지지 않은 종목이라 비교 대상을 고를 수 없습니다(종목 관리에서 산업·세부 섹터 지정).</div>`;
      return;
    }
    RPPEER.me = me;
    RPPEER.key = `${me.industry}|${me.sub_industry}`;
    RPPEER.inChart = null;
    const { data: base } = await sb.from('companies').select('code,name,market')
      .eq('industry', me.industry).eq('sub_industry', me.sub_industry).eq('active', true).order('name');
    RPPEER.base = base || [];
    await _rpPeerReload();
  } catch (e) {
    body.innerHTML = `<div style="padding:20px;text-align:center;color:var(--red);font-size:calc(12px*var(--m-sub))">동종비교 로드 실패: ${escapeHtml(e.message || String(e))}</div>`;
  }
}

async function _rpPeerReload() {
  const body = document.getElementById('rp-tab-card');
  if (!body || !RPPEER.me) return;
  const pref = _rpPeerPrefs();
  const ex = new Set(pref.ex || []);
  const list = RPPEER.base.filter(p => p.code === RPPEER.me.code || !ex.has(p.code));
  for (const a of pref.add || []) if (a?.code && !list.some(p => p.code === a.code)) list.push(a);
  if (!list.some(p => p.code === RPPEER.me.code)) list.unshift({ code: RPPEER.me.code, name: RPPEER.me.name });
  RPPEER.list = list;
  RPPEER.ex = RPPEER.base.filter(p => ex.has(p.code) && p.code !== RPPEER.me.code);
  body.innerHTML = `<div style="text-align:center;color:var(--text2);padding:40px"><span class="loading"></span> 동종 ${list.length}개 종목 불러오는 중...</div>`;
  RPPEER.data = await _rpPeerFetch(list.map(p => p.code));
  _rpPeerCompute();
  body.innerHTML = _rpPeerView();
  _rpPeerDrawChart();
}

async function _rpPeerFetch(codes) {
  const y0 = String(new Date().getFullYear() - 4);
  const [fin, bl, mdate] = await Promise.all([
    fetchAllPages((s, e) => sb.from('financials')
      .select('stock_code,fs_div,is_cumulative,bsns_year,quarter,revenue,operating_profit,net_income,total_equity')
      .in('stock_code', codes).gte('bsns_year', y0)
      .order('stock_code').order('bsns_year').order('quarter').order('fs_div').range(s, e)),
    fetchAllPages((s, e) => sb.from('dart_segment_revenue').select('stock_code,bsns_year,quarter,revenue')
      .eq('segment_type', 'backlog_total').in('stock_code', codes).gte('bsns_year', +y0)
      .order('stock_code').order('bsns_year').order('quarter').range(s, e)),
    getLatestFullMarketDate(),   // 동종 기업은 모니터링 밖도 많아 전 종목이 있는 날
  ]);
  const [mkt, comp] = await Promise.all([
    mdate ? fetchAllPages((s, e) => sb.from('market_data').select('stock_code,market_cap,per,pbr')
      .in('stock_code', codes).eq('base_date', mdate).order('stock_code').range(s, e)) : [],
    fetchAllPages((s, e) => sb.from('companies').select('code,industry,sub_industry').in('code', codes).order('code').range(s, e)),
  ]);
  const D = { fin: {}, bl: {}, mkt: {}, mdate, blCovered: new Set() };
  for (const c of comp) {
    if (c.industry === RPPEER_BL_SECTOR.industry && RPPEER_BL_SECTOR.subs.includes(c.sub_industry)) D.blCovered.add(c.code);
  }
  for (const r of finNormalizeQuarters(finPreferFs(fin))) {           // 종목별 CFS 우선 + 4분기 연간값 행 정리
    (D.fin[r.stock_code] = D.fin[r.stock_code] || {})[`${r.bsns_year} ${r.quarter}`] = r;
  }
  for (const r of bl) (D.bl[r.stock_code] = D.bl[r.stock_code] || {})[`${r.bsns_year} ${r.quarter}`] = r.revenue * 1e6;
  for (const r of mkt) D.mkt[r.stock_code] = r;
  return D;
}

// ── 계산 ──
const _rpPeerG = (cur, prev) => (cur != null && prev != null && prev > 0) ? (cur / prev - 1) * 100 : null;
// 영업이익 YoY — 부호가 바뀌면 숫자 대신 흑전·적전·적지
function _rpPeerGop(cur, prev) {
  if (cur == null || prev == null) return null;
  if (prev > 0 && cur > 0) return (cur / prev - 1) * 100;
  if (prev <= 0 && cur > 0) return '흑전';
  if (prev > 0 && cur <= 0) return '적전';
  return '적지';
}

function _rpPeerVal(code, key, metric) {
  const D = RPPEER.data, F = D.fin[code] || {}, B = D.bl[code] || {};
  const r = F[key] || {};
  const ttm = k => {
    let s = 0;
    for (let i = 0; i < 4; i++) { const v = F[_rpqShift(key, -i)]?.[k]; if (v == null) return null; s += v; }
    return s;
  };
  switch (metric) {
    case 'backlog': return B[key] ?? null;
    case 'revenue': return r.revenue ?? null;
    case 'op':      return r.operating_profit ?? null;
    case 'opm':     return r.revenue > 0 && r.operating_profit != null ? r.operating_profit / r.revenue * 100 : null;
    case 'rev4':    return ttm('revenue');
    case 'op4':     return ttm('operating_profit');
    case 'ni4':     return ttm('net_income');
    case 'blr': {
      const b = B[key], t = ttm('revenue');
      return b != null && t > 0 ? b / t : null;
    }
  }
  return null;
}

function _rpPeerCompute() {
  const codes = RPPEER.list.map(p => p.code);
  // 기준 분기: 절반 이상이 매출을 낸 가장 최근 분기
  const cnt = {};
  for (const c of codes) for (const [k, r] of Object.entries(RPPEER.data.fin[c] || {})) if (r.revenue != null) cnt[k] = (cnt[k] || 0) + 1;
  const keys = Object.keys(cnt).sort((a, b) => b.localeCompare(a));
  RPPEER.L = keys.find(k => cnt[k] >= Math.ceil(codes.length / 2)) || keys[0] || null;
  const L = RPPEER.L;
  RPPEER.stats = {};
  if (!L) return;
  const Ly = _rpqShift(L, -4);
  for (const c of codes) {
    const m = RPPEER.data.mkt[c] || {};
    const rev = _rpPeerVal(c, L, 'revenue'), op = _rpPeerVal(c, L, 'op');
    const rev4 = _rpPeerVal(c, L, 'rev4'), op4 = _rpPeerVal(c, L, 'op4');
    const bl = _rpPeerVal(c, L, 'backlog');
    // 최근 4분기 PER·ROE — 밸류에이션 카드와 같은 계산(시총 ÷ 4분기 순이익, 4분기 순이익 ÷ 기말 자본), 기준 분기까지
    const ni4 = _rpPeerVal(c, L, 'ni4'), eq = RPPEER.data.fin[c]?.[L]?.total_equity;
    RPPEER.stats[c] = {
      mcap: m.market_cap ?? null, per: m.per ?? null, pbr: m.pbr ?? null,
      rev, revY: _rpPeerG(rev, _rpPeerVal(c, Ly, 'revenue')),
      op, opY: _rpPeerGop(op, _rpPeerVal(c, Ly, 'op')), opm: _rpPeerVal(c, L, 'opm'),
      rev4, op4, opm4: rev4 > 0 && op4 != null ? op4 / rev4 * 100 : null,
      bl, blY: _rpPeerG(bl, _rpPeerVal(c, Ly, 'backlog')), blr: _rpPeerVal(c, L, 'blr'),
      ni4, perT: m.market_cap > 0 && ni4 != null ? (ni4 > 0 ? m.market_cap / ni4 : -1) : null,
      roe4: eq > 0 && ni4 != null ? ni4 / eq * 100 : null,
      blNone: RPPEER.data.blCovered.has(c) && !Object.keys(RPPEER.data.bl[c] || {}).length,
    };
  }
  if (!RPPEER.inChart) {   // 기본 차트 = 이 종목 + 시총 상위 5
    const others = codes.filter(c => c !== RPPEER.me.code)
      .sort((a, b) => (RPPEER.stats[b].mcap || 0) - (RPPEER.stats[a].mcap || 0)).slice(0, 5);
    RPPEER.inChart = [RPPEER.me.code, ...others];
  }
  RPPEER.inChart = RPPEER.inChart.filter(c => codes.includes(c));
}

// ── 표 ──
const _rpPeerEok = v => {
  if (v == null || !isFinite(v)) return '—';
  const x = v / 1e8;
  return Math.abs(x) >= 100 ? Math.round(x).toLocaleString('ko-KR') : x.toFixed(1);
};
function _rpPeerPct(v, colored = true) {
  if (typeof v === 'string') {
    const c = v === '흑전' ? 'var(--red)' : v === '적전' ? 'var(--blue)' : 'var(--text3)';
    return `<span style="color:${c}">${v}</span>`;
  }
  if (v == null || !isFinite(v)) return '—';
  const s = `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
  return colored ? `<span style="color:${v > 0 ? 'var(--red)' : v < 0 ? 'var(--blue)' : 'var(--text2)'}">${s}</span>` : s;
}
const _rpPeerNum = (v, d = 1, u = '') => v == null || !isFinite(v) ? '—' : `${(+v).toFixed(d)}${u}`;

const RPPEER_COLS = [
  { k: 'mcap', g: '시장',        label: '시가총액', f: s => s.mcap ? fmtCap(s.mcap) : '—' },
  { k: 'per',  g: '시장',        label: 'PER',      f: s => s.per > 0 ? _rpPeerNum(s.per) : '—' },
  { k: 'pbr',  g: '시장',        label: 'PBR',      f: s => s.pbr > 0 ? _rpPeerNum(s.pbr, 2) : '—' },
  { k: 'rev',  g: 'Q',           label: '매출',      f: s => _rpPeerEok(s.rev) },
  { k: 'revY', g: 'Q',           label: 'YoY',       f: s => _rpPeerPct(s.revY) },
  { k: 'op',   g: 'Q',           label: '영업이익',  f: s => _rpPeerEok(s.op) },
  { k: 'opm',  g: 'Q',           label: '이익률',    f: s => _rpPeerNum(s.opm, 1, '%') },
  { k: 'opY',  g: 'Q',           label: 'YoY',       f: s => _rpPeerPct(s.opY) },
  { k: 'rev4', g: '최근 4분기',  label: '매출',      f: s => _rpPeerEok(s.rev4) },
  { k: 'op4',  g: '최근 4분기',  label: '영업이익',  f: s => _rpPeerEok(s.op4) },
  { k: 'opm4', g: '최근 4분기',  label: '이익률',    f: s => _rpPeerNum(s.opm4, 1, '%') },
  { k: 'bl',   g: '수주잔고',    label: '잔고',      f: s => s.blNone
      ? `<span title="정기보고서에 수주잔고를 싣지 않음(영업 기밀·고객 NDA 등으로 생략) 또는 그림으로만 적음" style="color:var(--text3)">미공시</span>` : _rpPeerEok(s.bl) },
  { k: 'blY',  g: '수주잔고',    label: 'YoY',       f: s => _rpPeerPct(s.blY) },
  { k: 'blr',  g: '수주잔고',    label: '÷연매출',   f: s => s.blr == null ? '—' : `${s.blr.toFixed(2)}배` },
];

function _rpPeerSortVal(s, k) {
  const v = s[k];
  if (typeof v === 'string') return v === '흑전' ? 1e9 : v === '적전' ? -1e9 : -2e9;
  return v == null || !isFinite(v) ? null : v;
}

// 배수 지표는 양수만 — 적자 PER(음수·-1)이 중앙값을 끌어내리지 않게
const RPPEER_POS_ONLY = new Set(['per', 'perT', 'pbr']);
const _rpPeerOk = (k, v) => typeof v === 'number' && isFinite(v) && (!RPPEER_POS_ONLY.has(k) || v > 0);
// 동종 중앙값 — 이 종목은 빼고(밸류에이션 카드의 업종 중앙값과 같은 방식) 비교 대상끼리
function _rpPeerMedian(k) {
  const vs = RPPEER.list.filter(p => p.code !== RPPEER.me.code).map(p => RPPEER.stats[p.code]?.[k])
    .filter(v => _rpPeerOk(k, v)).sort((a, b) => a - b);
  if (!vs.length) return null;
  const m = Math.floor(vs.length / 2);
  return vs.length % 2 ? vs[m] : (vs[m - 1] + vs[m]) / 2;
}

function _rpPeerTable() {
  const L = RPPEER.L, me = RPPEER.me.code;
  const rows = [...RPPEER.list].sort((a, b) => {
    const va = _rpPeerSortVal(RPPEER.stats[a.code] || {}, RPPEER.sort), vb = _rpPeerSortVal(RPPEER.stats[b.code] || {}, RPPEER.sort);
    if (va == null && vb == null) return a.name.localeCompare(b.name);
    if (va == null) return 1;
    if (vb == null) return -1;
    return (va - vb) * RPPEER.dir;
  });
  const th = 'padding:6px 8px;border-bottom:1px solid var(--border);color:var(--text2);font-weight:600;white-space:nowrap;background:var(--bg3)';
  const td = 'padding:6px 8px;border-bottom:1px solid var(--border);text-align:right;white-space:nowrap';
  const sticky = 'position:sticky;left:0;z-index:1';
  const groups = [];
  for (const c of RPPEER_COLS) {
    const g = c.g === 'Q' ? `${_rpqKor(L)}` : c.g;
    if (groups.length && groups[groups.length - 1].g === g) groups[groups.length - 1].n++;
    else groups.push({ g, n: 1 });
  }
  const arrow = k => RPPEER.sort === k ? (RPPEER.dir < 0 ? ' ▼' : ' ▲') : '';
  const colorOf = c => {
    const i = RPPEER.inChart.indexOf(c);
    return i < 0 ? null : RPPEER_COLORS[i % RPPEER_COLORS.length];
  };
  const body = rows.map(p => {
    const s = RPPEER.stats[p.code] || {}, isMe = p.code === me, col = colorOf(p.code);
    const bg = isMe ? 'background:color-mix(in srgb, var(--tg) 12%, var(--bg2))' : 'background:var(--bg2)';
    return `<tr style="${isMe ? 'font-weight:700' : ''}">
      <td style="${td};text-align:left;${sticky};${bg};min-width:120px">
        <span onclick="rpPeerChartToggle('${p.code}')" title="차트에 ${col ? '빼기' : '넣기'}"
          style="display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;cursor:pointer;vertical-align:middle;
            ${col ? `background:${col}` : 'border:1.5px solid var(--text3)'}"></span><span data-stock-open="${escAttr(p.code)}" data-stock-name="${escAttr(p.name)}"
          style="cursor:pointer;color:var(--text1)">${escapeHtml(p.name)}</span>${isMe ? ' <span style="font-size:calc(10px*var(--m-label));color:var(--tg)">이 종목</span>' : ''}
      </td>
      ${RPPEER_COLS.map(c => `<td style="${td};${isMe ? bg : ''}">${c.f(s)}</td>`).join('')}
      <td data-no-capture style="${td};text-align:center;${isMe ? bg : ''}">${isMe ? '' : `<button onclick="rpPeerExclude('${p.code}')" title="비교에서 빼기"
        style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:calc(12px*var(--m-sub));padding:0 4px">✕</button>`}</td>
    </tr>`;
  }).join('');
  const med = {};
  for (const c of RPPEER_COLS) med[c.k] = c.k === 'opY' ? null : _rpPeerMedian(c.k);
  const medRow = `<tr style="color:var(--text2)">
    <td style="${td};text-align:left;${sticky};background:var(--bg3)" title="이 종목을 뺀 비교 대상의 중앙값">동종 중앙값</td>
    ${RPPEER_COLS.map(c => `<td style="${td};background:var(--bg3)">${c.k === 'opY' ? '' : c.f(med)}</td>`).join('')}
    <td data-no-capture style="${td};background:var(--bg3)"></td></tr>`;
  return `<table style="border-collapse:collapse;width:max-content;min-width:100%;font-size:calc(12px*var(--m-sub));font-variant-numeric:tabular-nums">
    <thead>
      <tr><th rowspan="2" style="${th};text-align:left;${sticky}">종목</th>
        ${groups.map(g => `<th colspan="${g.n}" style="${th};text-align:center">${g.g}</th>`).join('')}
        <th data-no-capture rowspan="2" style="${th}"></th></tr>
      <tr>${RPPEER_COLS.map(c => `<th onclick="rpPeerSort('${c.k}')" style="${th};text-align:right;cursor:pointer">${c.label}${arrow(c.k)}</th>`).join('')}</tr>
    </thead>
    <tbody>${body}${medRow}</tbody>
  </table>`;
}

// ── 동종 대비 위치 — 이 종목의 PER·PBR·ROE 등이 비교 대상 중앙값보다 얼마나 높고 낮은지, 몇 위인지, 분포 어디쯤인지 ──
// 유리·불리는 밸류에이션 카드와 같은 기준(_rpPeerJudge: 중앙값과 15% 넘게 차이)을 같은 지표(PER·PBR·ROE)에만.
// 이익률·성장률·잔고·시총은 좋고 나쁨 기준을 정하지 않았으므로 차이와 순위만
const RPPEER_POS = [
  { k: 'per',  label: 'PER',         basis: '직전 결산 이익',        unit: 'x', d: 1, low: true, judge: true },
  { k: 'perT', label: 'PER',         basis: '최근 4분기 이익',       unit: 'x', d: 1, low: true, judge: true },
  { k: 'pbr',  label: 'PBR',         basis: '직전 결산 자본',        unit: 'x', d: 2, low: true, judge: true },
  { k: 'roe4', label: 'ROE',         basis: '최근 4분기 순이익',     unit: '%', d: 1, judge: true },
  { k: 'opm4', label: '영업이익률',  basis: '최근 4분기',            unit: '%', d: 1 },
  { k: 'revY', label: '매출 성장률', basis: '기준 분기 YoY',         unit: '%', d: 1 },
  { k: 'blr',  label: '잔고÷연매출', basis: '수주잔고 ÷ 4분기 매출', unit: '배', d: 2 },
  { k: 'mcap', label: '시가총액',    basis: '최근 거래일',           unit: '',  d: 0 },
];

function _rpPeerPosition(box, note) {
  const me = RPPEER.me.code, S = RPPEER.stats, mine = S[me] || {};
  const names = Object.fromEntries(RPPEER.list.map(p => [p.code, p.name]));
  const fmt = (m, v) => m.k === 'mcap' ? fmtCap(v) : `${(+v).toFixed(m.d)}${m.unit}`;
  const th = 'padding:7px 8px;border-bottom:1px solid var(--border);color:var(--text2);font-weight:600;white-space:nowrap;background:var(--bg3)';
  const td = 'padding:8px;border-bottom:1px solid var(--border);white-space:nowrap;vertical-align:middle';
  const sm = 'font-size:calc(10px*var(--m-label));color:var(--text3)';
  const rows = RPPEER_POS.map(m => {
    const v = mine[m.k];
    // 이 종목 값이 없는 지표(잔고 미수집 업종 등)는 줄째 뺌. 적자 PER은 '적자'로 남김
    if (typeof v !== 'number' || !isFinite(v)) return '';
    const ok = _rpPeerOk(m.k, v);
    const med = _rpPeerMedian(m.k);
    const vals = RPPEER.list.map(p => ({ c: p.code, v: S[p.code]?.[m.k] })).filter(x => _rpPeerOk(m.k, x.v))
      .sort((a, b) => a.v - b.v);
    const n = vals.length;
    const asc = vals.findIndex(x => x.c === me);   // 낮은 값부터 0
    const rank = asc < 0 ? null : m.low ? asc + 1 : n - asc;
    // 차이 — %는 %p, 시총은 중앙값의 몇 배, 나머지는 중앙값 대비 %
    let diff = '—', dcol = 'var(--text2)', dlab = '';
    if (ok && med != null) {
      const j = m.judge ? _rpPeerJudge(v, med, !!m.low, m.unit) : null;
      if (j) { diff = j.diffStr; dcol = j.color; dlab = j.label.replace('업종 대비 ', '').replace('업종 수준', '비슷'); }
      else if (m.k === 'mcap') diff = med > 0 ? `${(v / med).toFixed(1)}배` : '—';
      else if (m.unit === '%') { const pp = v - med; diff = `${pp >= 0 ? '+' : ''}${pp.toFixed(1)}%p`; }
      else if (med !== 0) { const r = (v - med) / Math.abs(med) * 100; diff = `${r >= 0 ? '+' : ''}${r.toFixed(0)}%`; }
    }
    // 분포 — 비교 대상을 낮은 값부터 고르게 늘어놓고(극단값에 눌리지 않게 순서 기준) 이 종목만 파란 점
    const strip = n >= 2 ? `<div style="position:relative;height:14px;min-width:130px;margin:0 6px">
        <div style="position:absolute;left:0;right:0;top:6px;height:2px;border-radius:1px;background:var(--border)"></div>
        ${vals.map((x, i) => {
          const isMe = x.c === me, sz = isMe ? 12 : 6;
          return `<span title="${escAttr(`${names[x.c] || x.c} ${fmt(m, x.v)}`)}" style="position:absolute;top:${7 - sz / 2}px;
            left:calc(${(i / (n - 1) * 100).toFixed(1)}% - ${sz / 2}px);width:${sz}px;height:${sz}px;border-radius:50%;
            ${isMe ? 'background:var(--tg);box-shadow:0 0 0 2px var(--bg2);z-index:1' : 'background:var(--text3);opacity:.55'}"></span>`;
        }).join('')}
      </div>
      <div style="display:flex;justify-content:space-between;margin:2px 6px 0;${sm}">
        <span>${fmt(m, vals[0].v)}</span><span>${fmt(m, vals[n - 1].v)}</span></div>` : '';
    return `<tr>
      <td style="${td}"><div style="font-weight:700;color:var(--text1)">${m.label}</div><div style="${sm}">${m.basis}</div></td>
      <td style="${td};text-align:right;font-weight:700;color:var(--text1)">${ok ? fmt(m, v) : '<span style="color:var(--text3)">적자</span>'}</td>
      <td style="${td};text-align:right;color:var(--text2)">${med != null ? fmt(m, med) : '—'}</td>
      <td style="${td};text-align:right"><span style="font-weight:700;color:${dcol}">${diff}</span>${dlab
        ? `<div><span style="font-size:calc(10px*var(--m-label));padding:1px 6px;border-radius:100px;background:${dcol}20;color:${dcol}">${dlab}</span></div>` : ''}</td>
      <td style="${td};text-align:right;color:var(--text1)">${rank ? `<b>${rank}</b><span style="color:var(--text3)">/${n}</span>
        <div style="${sm}">${m.low ? '낮은 순' : '높은 순'}</div>` : '—'}</td>
      <td style="${td};width:34%">${strip}</td>
    </tr>`;
  }).join('');
  if (!rows) return '';
  const others = RPPEER.list.length - 1;
  return `<div data-capture="동종 대비 위치" style="${box}">
    ${_rpSecT(`동종 대비 위치 — ${escapeHtml(RPPEER.me.name)}`, `${escapeHtml(RPPEER.me.sub_industry)} ${others}개사와 비교 · 기준 ${_rpqKor(RPPEER.L)}`)}
    <div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%;font-size:calc(12px*var(--m-sub));font-variant-numeric:tabular-nums">
      <thead><tr>
        <th style="${th};text-align:left">지표</th><th style="${th};text-align:right">이 종목</th>
        <th style="${th};text-align:right" title="이 종목을 뺀 비교 대상의 중앙값">동종 중앙값</th>
        <th style="${th};text-align:right">차이</th><th style="${th};text-align:right">순위</th>
        <th style="${th};text-align:center">분포 <span style="font-weight:400;color:var(--text3)">낮음 → 높음</span></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <div style="${note};margin-top:8px">
      * 비교 대상 = 아래 표의 종목(빼기·더하기 반영) · 중앙값은 이 종목 제외 · 유리·불리 = 중앙값과 15% 넘게 차이
      (PER·PBR은 낮을수록, ROE는 높을수록 유리 — 밸류에이션 카드와 같은 기준) · 적자 PER은 중앙값·순위에서 뺌
      · 분포 = 비교 대상을 낮은 값부터 늘어놓은 것(양 끝 = 최저·최고), 파란 점 = 이 종목 · 점에 마우스를 올리면 종목·값</div>
  </div>`;
}

function _rpPeerView() {
  const me = RPPEER.me, L = RPPEER.L, D = RPPEER.data;
  if (!L) return `<div style="padding:30px;text-align:center;color:var(--text3)">비교할 재무 데이터가 없습니다.</div>`;
  const blN = RPPEER.list.filter(p => RPPEER.stats[p.code]?.bl != null).length;
  const box = 'background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px';
  const note = 'font-size:calc(11px*var(--m-label));color:var(--text3);line-height:1.6';
  const chip = (label, on, act) => `<button class="chip chip-sm ${on ? 'active' : ''}" onclick="${act}">${label}</button>`;
  const pref = _rpPeerPrefs();
  const changed = (pref.ex || []).length || (pref.add || []).length;
  return `<div style="display:flex;flex-direction:column;gap:12px">
    ${_rpPeerPosition(box, note)}
    <div data-capture style="${box}">
      ${_rpSecT(`동종 비교 — ${escapeHtml(me.industry)} · ${escapeHtml(me.sub_industry)} ${RPPEER.list.length}개`,
        `기준 ${_rpqKor(L)} · 시총 ${escapeHtml(D.mdate || '—')} · 금액 억원`)}
      <div id="rp-peer-tbl" style="overflow-x:auto">${_rpPeerTable()}</div>
      <div style="${note};margin-top:8px">
        * 기준 분기 = 비교 대상 절반 이상이 실적을 낸 가장 최근 분기 · 이익률·YoY는 금액으로 계산(연결 우선) · 열 이름을 누르면 정렬
        · 동종 중앙값 = 이 종목을 뺀 비교 대상의 중앙값(PER·PBR은 흑자만)
        · 수주잔고 = DART 정기보고서 '매출 및 수주상황'의 기말 잔고 합계(잔고 표가 여럿이면 회사 본문의 첫 표 — 자회사·큰 계약 세부 표는 빼고), ${blN}개 종목 —
        달러로 적은 회사는 분기 말 환율로 원화 환산 · '미공시' = 보고서에 잔고를 싣지 않는 회사(영업 기밀·고객 NDA 등),
        '—' = 그 분기 값 없음 또는 수집 대상(반도체 장비) 밖
        · ÷연매출 = 잔고 ÷ 최근 4분기 매출</div>
    </div>
    <div data-capture style="${box}">
      ${_rpSecT('추이 비교', `최근 12분기 · ${RPPEER_METRICS.find(m => m.k === RPPEER.metric)?.label} (${RPPEER_METRICS.find(m => m.k === RPPEER.metric)?.unit})`)}
      <div data-no-capture style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
        ${RPPEER_METRICS.map(m => chip(m.label, RPPEER.metric === m.k, `rpPeerMetric('${m.k}')`)).join('')}
      </div>
      <div style="position:relative;height:300px"><canvas id="rp-peer-chart"></canvas></div>
      <div data-no-capture style="${note};margin-top:6px">* 표의 ● 를 눌러 차트에 넣고 빼기 · 처음엔 이 종목 + 시가총액 상위 5개</div>
    </div>
    <div data-no-capture style="${box};display:flex;flex-direction:column;gap:8px">
      ${_rpSecT('비교 대상 조정', '이 기기에만 기억 · 같은 세부 섹터 종목 리포트에 함께 적용')}
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;position:relative">
        <input id="rp-peer-q" class="form-input" placeholder="종목명·코드로 더하기" style="max-width:220px"
          onkeydown="if(event.key==='Enter')rpPeerSearch(this.value)">
        <button class="btn btn-sm" onclick="rpPeerSearch(document.getElementById('rp-peer-q').value)">찾기</button>
        <button class="btn btn-sm btn-primary" onclick="rpPeerOpenCompare()" title="이 종목 + 차트에 넣은 종목(최대 10개)을 기업 비교 페이지로">기업 비교에서 열기</button>
        ${changed ? `<button class="btn btn-sm" onclick="rpPeerReset()">섹터 기본으로</button>` : ''}
      </div>
      <div id="rp-peer-found" style="display:flex;gap:6px;flex-wrap:wrap"></div>
      ${RPPEER.ex.length ? `<div style="${note}">뺀 종목(누르면 되돌림): ${RPPEER.ex.map(p =>
        `<button class="chip chip-sm" onclick="rpPeerRestore('${p.code}')">${escapeHtml(p.name)} ↺</button>`).join(' ')}</div>` : ''}
      ${(pref.add || []).length ? `<div style="${note}">더한 종목: ${(pref.add || []).map(p =>
        `<button class="chip chip-sm" onclick="rpPeerUnadd('${escAttr(p.code)}')">${escapeHtml(p.name)} ✕</button>`).join(' ')}</div>` : ''}
    </div>
  </div>`;
}

// ── 차트 ──
function _rpPeerDrawChart() {
  const cv = document.getElementById('rp-peer-chart');
  if (RPPEER.chart) { RPPEER.chart.destroy(); RPPEER.chart = null; }
  if (!cv || !RPPEER.L || typeof Chart === 'undefined') return;
  const keys = Array.from({ length: 12 }, (_, i) => _rpqShift(RPPEER.L, i - 11));
  const m = RPPEER_METRICS.find(x => x.k === RPPEER.metric);
  const conv = v => v == null ? null : (m.unit === '억' ? Math.round(v / 1e8 * 10) / 10 : Math.round(v * 100) / 100);
  const datasets = RPPEER.inChart.map((c, i) => {
    const p = RPPEER.list.find(x => x.code === c);
    const isMe = c === RPPEER.me.code, color = RPPEER_COLORS[i % RPPEER_COLORS.length];
    return {
      label: (p?.name || c) + (['backlog', 'blr'].includes(RPPEER.metric) && RPPEER.stats[c]?.blNone ? ' (미공시)' : ''),
      data: keys.map(k => conv(_rpPeerVal(c, k, RPPEER.metric))),
      borderColor: color, backgroundColor: color + '22', borderWidth: isMe ? 3.5 : 1.8,
      pointRadius: isMe ? 3.5 : 2.5, tension: 0.25, spanGaps: true, fill: false, order: isMe ? 0 : 1,
    };
  });
  RPPEER.chart = new Chart(cv, {
    type: 'line',
    data: { labels: keys.map(_rpqLabel), datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { color: '#8b90a7', font: { size: 12 }, usePointStyle: true, boxWidth: 8 } },
        tooltip: {
          backgroundColor: '#1a1d27', borderColor: 'rgba(255,255,255,.1)', borderWidth: 1,
          titleColor: '#e8eaf0', bodyColor: '#8b90a7',
          callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y == null ? '—' : ctx.parsed.y.toLocaleString('ko-KR')}${m.unit}` },
        },
      },
      scales: {
        x: { ticks: { color: '#8b90a7', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,.04)' } },
        y: { ticks: { color: '#8b90a7', font: { size: 11 }, callback: v => v.toLocaleString('ko-KR') + m.unit },
             grid: { color: 'rgba(255,255,255,.06)' } },
      },
    },
  });
}

// ── 조작 ──
function rpPeerSort(k) {
  if (RPPEER.sort === k) RPPEER.dir = -RPPEER.dir;
  else { RPPEER.sort = k; RPPEER.dir = -1; }
  const el = document.getElementById('rp-peer-tbl');
  if (el) el.innerHTML = _rpPeerTable();
}
function rpPeerMetric(k) {
  RPPEER.metric = k;
  const body = document.getElementById('rp-tab-card');
  if (body) { body.innerHTML = _rpPeerView(); _rpPeerDrawChart(); }
}
function rpPeerChartToggle(code) {
  const i = RPPEER.inChart.indexOf(code);
  if (i >= 0) RPPEER.inChart.splice(i, 1);
  else if (RPPEER.inChart.length >= RPPEER_COLORS.length) { toast(`차트에는 ${RPPEER_COLORS.length}개까지`, 'warn'); return; }
  else RPPEER.inChart.push(code);
  const el = document.getElementById('rp-peer-tbl');
  if (el) el.innerHTML = _rpPeerTable();
  _rpPeerDrawChart();
}
function rpPeerExclude(code) {
  const pref = _rpPeerPrefs();
  if (RPPEER.base.some(p => p.code === code)) pref.ex = [...new Set([...(pref.ex || []), code])];
  pref.add = (pref.add || []).filter(p => p.code !== code);
  _rpPeerPrefs(pref);
  _rpPeerReload();
}
function rpPeerRestore(code) {
  const pref = _rpPeerPrefs();
  pref.ex = (pref.ex || []).filter(c => c !== code);
  _rpPeerPrefs(pref);
  _rpPeerReload();
}
function rpPeerUnadd(code) { rpPeerExclude(code); }
function rpPeerReset() { _rpPeerPrefs({}); RPPEER.inChart = null; _rpPeerReload(); }
async function rpPeerSearch(q) {
  const el = document.getElementById('rp-peer-found');
  if (!el || !(q || '').trim()) return;
  const { data } = await searchCompanies(q, { scope: 'active', limit: 8, cols: 'code,name,market' });
  RPPEER.found = {};
  const rows = (data || []).filter(r => !RPPEER.list.some(p => p.code === r.code));
  rows.forEach(r => { RPPEER.found[r.code] = r; });
  el.innerHTML = rows.length ? rows.map(r => `<button class="chip chip-sm" onclick="rpPeerAdd('${escAttr(r.code)}')">+ ${escapeHtml(r.name)} <span style="color:var(--text3)">${escapeHtml(r.code)}</span></button>`).join('')
    : `<span style="font-size:calc(11px*var(--m-label));color:var(--text3)">찾은 종목 없음(이미 비교 중이거나 이름이 다름)</span>`;
}
function rpPeerAdd(code) {
  const r = RPPEER.found[code];
  if (!r) return;
  const pref = _rpPeerPrefs();
  pref.ex = (pref.ex || []).filter(c => c !== code);
  if (!RPPEER.base.some(p => p.code === code)) pref.add = [...(pref.add || []).filter(p => p.code !== code), { code, name: r.name, market: r.market }];
  _rpPeerPrefs(pref);
  if (RPPEER.inChart && RPPEER.inChart.length < RPPEER_COLORS.length) RPPEER.inChart.push(code);
  _rpPeerReload();
}
function rpPeerOpenCompare() {
  if (typeof go !== 'function' || typeof CMP === 'undefined') return;
  const byCap = [...RPPEER.list].sort((a, b) => (RPPEER.stats[b.code]?.mcap || 0) - (RPPEER.stats[a.code]?.mcap || 0)).map(p => p.code);
  const codes = [...new Set([RPPEER.me.code, ...RPPEER.inChart, ...byCap])].slice(0, 10);
  const sel = codes.map(c => {
    const p = RPPEER.list.find(x => x.code === c);
    return { code: c, name: p?.name || c, industry: RPPEER.me.industry, subIndustry: RPPEER.me.sub_industry };
  });
  go('comparison');
  if (A.page !== 'comparison') return;   // 권한 등으로 이동이 막힘(go가 안내)
  CMP.selectedCodes = sel;
  CMP.metric = 'backlog';
  CMP.metrics = ['backlog', 'backlog_ratio', 'revenue'];   // 수주잔고·잔고÷연매출·매출액 함께
  renderCmpSelected();
  const m = document.getElementById('cmp-metric');
  if (m) m.value = 'backlog';
  runComparison();
}
