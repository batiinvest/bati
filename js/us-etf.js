// us-etf.js — STRATEGY '미국 ETF'(11-16) · '한국 ETF'(11-17) 페이지 — 같은 화면 코드를 시장 설정만 바꿔 쓴다
// [원본] 태린이아빠 Market Dashboard '미국 ETF 소라티노 및 상대강도'(US_SECTOR_SRC) · '한국 ETF 소라티노 및 상대강도'(KR_SECTOR_SRC)
//   기준 지수(SPY · 코스피) 대비 업종 ETF의 힘을 본다.
//   ① 상대강도  Mansfield RS = (ETF÷기준 ÷ 그 126일 평균 − 1) × 100, 정규화 = 100 ÷ (1 + e^(−RS÷12)) — 70 이상이 강한 것
//               6개월 수익률과 기준 대비 차이
//   ② 순위 변화  최근 10거래일 각각의 상위 20 — 변동성 조정 모멘텀(6개월 수익률 ÷ 일간 표준편차), 소르티노(6개월, ○일선 이상),
//               한국은 ETR Comfort(CAGR ÷ (|MDD| × 변동성))도
//   ③ 과열 점검  소르티노 상위의 30일 이격도가 최근 247거래일의 97% 구간 대비 어디인지(100 이상 = 과열)
//   ④ 정배열    20 · 65 · 130 · 260일선(4 · 13 · 26 · 52주) 정배열과 이어진 거래일 수
//   한국만 ⑤ 시장 폭·쏠림 — 쏠림지수(6개월 수익률 순위 가중 표준편차 × 100, 35 이상 과열)와 10 · 20 · 50 · 120일선 위 비율(Breadth)
//         ⑥ 52주 신고가 전략 — 6개월 코스피 대비 상위 12 ∩ 52주 신고가, 최대 4 × 25%, 10일선 이탈 매도(백테스트 · 현재 보유)
// [원본과 다른 점] 원본은 표 · 그림을 세로로 늘어놓는다. 여기는 탭으로 나누고 표를 정렬 · 필터할 수 있게 했다.
//   계산은 백엔드 collect_us_etf_rs.py · collect_kr_etf_rs.py — 원본 대조: 미국 순위표 7종 일치, 한국 백테스트 · 모멘텀 순위 일치.
// 데이터: market_snapshot(kind = 'us_etf' · 'kr_etf', payload)
// 의존: config.js (sb, escapeHtml, escAttr, chartTheme, SERIES_PAL), Chart.js

const USE = {
  market: 'us',           // us | kr — 페이지(usetf · kretf)가 정한다
  p: null,
  tab: 'rs',              // rs | rank | heat | align | breadth | bt
  rsSort: ['norm', -1],   // 상대강도 표 정렬
  rsGroup: '',            // 묶음 필터(미국만)
  rsStrong: false,        // 정규화 70 이상만
  list: 'sor10',          // 순위 변화: 어떤 표
  pick: null,             // 순위 변화: 눌러서 따라가 보는 ETF
  heatPick: null,         // 과열 점검: 그림으로 보는 ETF
  alignMode: 'full',      // full | ma | all
  alignPicked: false,     // 정배열 칩을 직접 눌렀나(안 눌렀으면 완전 정배열 0개일 때 이평 → 전체로 대신 보임)
  chart: null,
  charts: [],
};

const USE_STRONG = 70;    // 원본 Norm_RS_avg >= 70
const UE_BASE_TABS = [['rs', '상대강도'], ['rank', '순위 변화'], ['heat', '과열 점검'], ['align', '정배열']];
const UE_KIND_DESC = { '모멘텀': '6개월 수익률 ÷ 변동성', '소르티노': '내린 날의 흔들림만 벌점', 'ETR': '연수익 ÷ (낙폭 × 변동성)' };
const UE_MARKET = {
  us: {
    kind: 'us_etf', bench: 'SPY', unit: 'ETF', groups: true, wait: '매일 아침 7시 20분',
    lede: '미국 업종·테마 ETF <b>99개가 S&amp;P500(SPY)보다 얼마나 강한지</b>, 그 힘이 <b>흔들림 없이 꾸준한지</b>를 봅니다. 강한 업종이 어디서 어디로 옮겨 가는지 확인하는 용도입니다.',
    tabs: UE_BASE_TABS,
    lists: [['mom', '모멘텀', '필터 없음'], ['mom10', '모멘텀', '10일선 이상'], ['mom20', '모멘텀', '20일선 이상'], ['mom60', '모멘텀', '60일선 이상'],
            ['sor10', '소르티노', '10일선 이상'], ['sor20', '소르티노', '20일선 이상'], ['sor50', '소르티노', '50일선 이상']],
    heatSub: '소르티노(10일선 이상) 상위 20',
    source: "야후 수정 종가 기준, 태린이아빠 '미국 ETF 소라티노 및 상대강도'와 같은 계산.",
  },
  kr: {
    kind: 'kr_etf', bench: '코스피', unit: '종목', groups: false, wait: '평일 16시 50분',
    lede: '한국 업종 ETF 38개와 대형주 4종목(삼성전자 · SK하이닉스 · 파마리서치 · 에이피알)이 <b>코스피보다 얼마나 강한지</b>, <b>시장 안에서 힘이 몰렸는지 퍼졌는지</b>를 봅니다.',
    tabs: [...UE_BASE_TABS, ['breadth', '시장 폭 · 쏠림'], ['bt', '52주 전략']],
    lists: [['mom', '모멘텀', '필터 없음'], ['sor10', '소르티노', '10일선 이상'], ['sor20', '소르티노', '20일선 이상'], ['sor50', '소르티노', '50일선 이상'],
            ['etr10', 'ETR', '10일선 이상'], ['etr20', 'ETR', '20일선 이상'], ['etr50', 'ETR', '50일선 이상']],
    heatSub: '소르티노(50일선 이상) 상위',
    source: "ETF는 분배금 반영 종가, 주식 · 코스피는 수정 전 종가(야후, 빈 날은 KRX). 태린이아빠 '한국 ETF 소라티노 및 상대강도'와 같은 계산.",
  },
};
const _ueCfg = () => UE_MARKET[USE.market] || UE_MARKET.us;

// 페이지 진입 — 시장이 바뀌면 고른 표 · 탭을 처음으로
function _ueSetMarket(m) {
  if (USE.market !== m) {
    Object.assign(USE, { market: m, p: null, tab: 'rs', rsSort: ['norm', -1], rsGroup: '', rsStrong: false, list: 'sor10', pick: null, heatPick: null, alignMode: 'full', alignPicked: false });
  }
}

function _ueShell() {
  const c = _ueCfg();
  if (!c.tabs.some(([k]) => k === USE.tab)) USE.tab = 'rs';
  return `
  <div class="ue-head">
    <div class="ue-lede">${c.lede}</div>
    <div id="ue-asof" class="ue-asof"></div>
  </div>
  <div class="ue-tabs" role="tablist">${c.tabs.map(([k, n]) =>
    `<button class="chip${USE.tab === k ? ' active' : ''}" role="tab" aria-selected="${USE.tab === k}" data-ue-tab="${k}" onclick="setUeTab('${k}')">${n}</button>`).join('')}</div>
  <div id="ue-body"><div class="ue-msg">불러오는 중...</div></div>`;
}
function pUsEtf() { _ueSetMarket('us'); return _ueShell(); }
function pKrEtf() { _ueSetMarket('kr'); return _ueShell(); }
function loadUsEtf() { return _ueLoad(); }
function loadKrEtf() { return _ueLoad(); }

async function _ueLoad() {
  const body = document.getElementById('ue-body');
  if (!body) return;
  const c = _ueCfg(), market = USE.market;
  try {
    const { data, error } = await sb.from('market_snapshot').select('base_date,payload')
      .eq('kind', c.kind).order('base_date', { ascending: false }).limit(1);
    if (error) throw error;
    if (!document.getElementById('ue-body') || USE.market !== market) return;
    const p = data?.[0]?.payload || null;
    USE.p = p && market === 'kr' ? _ueAdaptKr(p) : p;
    if (!USE.p) { body.innerHTML = `<div class="ue-msg">아직 계산된 날이 없습니다 — ${c.wait}에 채워집니다.</div>`; return; }
    ueRender();
  } catch (e) {
    const missing = /42P01|PGRST205|does not exist|Could not find/.test(`${e?.code} ${e?.message}`);
    if (!missing) console.warn('[ETF 강도]', e);
    body.innerHTML = `<div class="ue-msg">${missing ? '준비 중 — 데이터 테이블이 아직 없습니다.'
      : '불러오지 못했습니다 — ' + escapeHtml(e.message || '조회 실패')}</div>`;
  }
}

// 한국 payload → 미국과 같은 모양(상대강도 · 과열 · 정배열 화면을 그대로 쓰려고)
function _ueAdaptKr(p) {
  const six = p.six || {};
  const etfs = (p.rs || []).map(r => ({ t: r.n, name: '', g: '', rs: r.rs, norm: r.norm, ret6m: six[r.n]?.r6 ?? null, vs_spy: six[r.n]?.vs ?? null }));
  Object.keys(six).forEach(n => { if (!etfs.some(e => e.t === n)) etfs.push({ t: n, name: '', g: '', rs: null, norm: null, ret6m: six[n].r6, vs_spy: six[n].vs }); });
  return {
    ...p, etfs, total: p.n, groups: [], spy: { ret6m: p.kospi?.r6 },
    heat: (p.gap || []).map(g => ({ rank: g.rank, t: g.n, gap: g.gap, p97: g.p97, heat: g.heat, price: g.series.price, gaps: g.series.gaps, dates: g.series.dates })),
    align: (p.align || []).map(a => ({ ...a, t: a.n })),
  };
}

function unloadUsEtf() {
  if (USE.chart) { USE.chart.destroy(); USE.chart = null; }
  USE.charts.forEach(c => c.destroy());
  USE.charts = [];
}

function setUeTab(k) {
  USE.tab = k;
  document.querySelectorAll('[data-ue-tab]').forEach(b => { const on = b.dataset.ueTab === k; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
  ueRender();
}

const _ueNum = (v, d = 2) => v == null ? '—' : (+v).toFixed(d);
const _ueSigned = (v, d = 2, unit = '') => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d) + unit;
const _ueColor = v => v == null ? 'var(--text2)' : v > 0 ? 'var(--up)' : v < 0 ? 'var(--down)' : 'var(--text1)';
const _ueMD = d => d ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : '—';
const _ueEtf = t => (USE.p?.etfs || []).find(e => e.t === t);
const _ueName = t => _ueEtf(t)?.name || '';
const _ueCell = t => `<b>${escapeHtml(t)}</b>${_ueName(t) ? `<small>${escapeHtml(_ueName(t))}</small>` : ''}`;
// 한국 주식 4종목은 줄을 누르면 종목 창
const _ueStockAttr = t => { const code = USE.p?.codes?.[t]; return code ? ` data-stock-open="${escAttr(code)}" data-stock-name="${escAttr(t)}" style="cursor:pointer"` : ''; };
// 한국 순위 칸은 좁아서 운용사 이름을 뗀다(뗀 이름도 서로 겹치지 않음) — 전체 이름은 칸 위 말풍선
const _ueShort = t => USE.market === 'kr' ? t.replace(/^(KODEX|TIGER|SOL|PLUS|ACE|HANARO|RISE|KIWOOM)\s+/, '') : t;
const _ueWon = v => v == null ? '—' : Math.round(v).toLocaleString('ko-KR');

function ueRender() {
  const p = USE.p, body = document.getElementById('ue-body');
  if (!body || !p) return;
  unloadUsEtf();
  const c = _ueCfg();
  const asof = document.getElementById('ue-asof');
  if (asof) asof.innerHTML = `<b>${escapeHtml(p.asof)} 기준</b> · ${c.unit} ${p.n}${p.total !== p.n ? ` / ${p.total}` : ''} · ${c.bench} 6개월 ${_ueSigned(p.spy?.ret6m, 1, '%')}`;
  ({ rs: ueRenderRs, rank: ueRenderRank, heat: ueRenderHeat, align: ueRenderAlign, breadth: ueRenderBreadth, bt: ueRenderBt }[USE.tab] || ueRenderRs)(body, p);
}

// ── ① 상대강도 ─────────────────────────────────────────────────────────
function ueRenderRs(body, p) {
  const c = _ueCfg(), B = c.bench;
  const [key, dir] = USE.rsSort;
  const strong = p.etfs.filter(e => (e.norm ?? 0) >= USE_STRONG).sort((a, b) => b.norm - a.norm);
  const rows = p.etfs.filter(e => (!USE.rsGroup || e.g === USE.rsGroup) && (!USE.rsStrong || (e.norm ?? 0) >= USE_STRONG))
    .sort((a, b) => ((a[key] ?? (dir < 0 ? -Infinity : Infinity)) - (b[key] ?? (dir < 0 ? -Infinity : Infinity))) * dir);
  const rank = Object.fromEntries([...p.etfs].sort((a, b) => (b.norm ?? -1) - (a.norm ?? -1)).map((e, i) => [e.t, i + 1]));
  const th = (k, name, tip = '') => `<th class="ue-sort${key === k ? ' on' : ''}" data-ue-sort="${k}" tabindex="0" role="button"${tip ? ` title="${escAttr(tip)}"` : ''}>${name}${key === k ? (dir < 0 ? ' ↓' : ' ↑') : ''}</th>`;
  body.innerHTML = `
    <div class="card">
      <div class="card-header" style="flex-wrap:wrap;gap:6px">
        <span class="card-title">${B} 대비 상대강도</span>
        <span class="card-sub">6개월(126거래일) · 정규화 70 이상이 강한 ${c.unit}</span>
        <div class="ue-filters">
          <button class="chip chip-sm${USE.rsStrong ? ' active' : ''}" id="ue-strong">70 이상만 ${strong.length}</button>
          ${c.groups ? `<select class="ue-select" id="ue-group" aria-label="묶음 고르기"><option value="">전체 묶음</option>${p.groups.map(g => `<option${USE.rsGroup === g ? ' selected' : ''}>${escapeHtml(g)}</option>`).join('')}</select>` : ''}
        </div>
      </div>
      <div class="ue-strong">${strong.length
        ? `<span>정규화 70 이상</span>${strong.map(e => `<b title="${escAttr(e.name)}">${escapeHtml(e.t)} <i>${_ueNum(e.norm, 1)}</i></b>`).join('')}`
        : `<span>정규화 70 이상인 ${c.unit}이 없습니다 — ${B}를 뚜렷하게 앞서는 업종이 없는 구간입니다.</span>`}</div>
      <div class="ue-scroll"><table class="ue-tbl">
        <thead><tr><th>순위</th><th class="ue-l">${c.unit} ${rows.length}</th>${c.groups ? '<th class="ue-l ue-grp-h">묶음</th>' : ''}${th('rs', 'RS', `Mansfield RS — ${B} 대비 상대값이 126일 평균보다 몇 % 위인지`)}${th('norm', '정규화', `0~100, 50이 ${B}와 같은 흐름`)}<th class="ue-barcell"></th>${th('ret6m', '6개월')}${th('vs_spy', `${B} 대비`, `6개월 수익률 − ${B} 6개월 수익률`)}</tr></thead>
        <tbody>${rows.map(e => `<tr class="${(e.norm ?? 0) >= USE_STRONG ? 'ue-hot' : ''}"${_ueStockAttr(e.t)}>
          <td class="ue-n ue-rk">${rank[e.t] ?? '—'}</td>
          <td class="ue-name">${_ueCell(e.t)}</td>
          ${c.groups ? `<td class="ue-grp">${escapeHtml(e.g)}</td>` : ''}
          <td class="ue-n" style="color:${_ueColor(e.rs)}">${_ueSigned(e.rs)}</td>
          <td class="ue-n"><b>${_ueNum(e.norm, 1)}</b></td>
          <td class="ue-barcell">${e.norm == null ? '' : `<span class="ue-meter"><i style="width:${Math.max(0, Math.min(100, e.norm)).toFixed(1)}%;background:${e.norm >= USE_STRONG ? 'var(--up)' : e.norm >= 50 ? 'var(--text2)' : 'var(--down)'}"></i><u style="left:${USE_STRONG}%"></u></span>`}</td>
          <td class="ue-n" style="color:${_ueColor(e.ret6m)}">${_ueSigned(e.ret6m, 1, '%')}</td>
          <td class="ue-n" style="color:${_ueColor(e.vs_spy)}">${_ueSigned(e.vs_spy, 1, '%p')}</td></tr>`).join('')}</tbody>
      </table></div>
    </div>
    <div class="ue-foot">RS = (${c.unit} ÷ ${B})가 그 126거래일 평균보다 몇 % 위에 있는지. 정규화 = 100 ÷ (1 + e^(−RS ÷ 12)) — 50이면 ${B}와 같은 흐름, 70 이상이면 뚜렷하게 강함.
      6개월 = 126거래일 전 종가 대비. ${c.source}</div>`;
  body.querySelector('#ue-strong').addEventListener('click', () => { USE.rsStrong = !USE.rsStrong; ueRender(); });
  body.querySelector('#ue-group')?.addEventListener('change', e => { USE.rsGroup = e.target.value; ueRender(); });
  body.querySelectorAll('[data-ue-sort]').forEach(h => {
    const go = () => { const k = h.dataset.ueSort; USE.rsSort = [k, USE.rsSort[0] === k ? -USE.rsSort[1] : -1]; ueRender(); };
    h.addEventListener('click', go);
    h.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); } });
  });
}

// ── ② 순위 변화 ─────────────────────────────────────────────────────────
function ueRenderRank(body, p) {
  const c = _ueCfg();
  if (!p.lists[USE.list]) USE.list = 'sor10';
  const L = p.lists[USE.list] || { dates: [], ranks: [], scores: {} };
  const meta = c.lists.find(x => x[0] === USE.list) || c.lists[0];
  const last = L.ranks[L.ranks.length - 1] || [], prev = L.ranks[L.ranks.length - 2] || [];
  if (!USE.pick || !last.includes(USE.pick)) USE.pick = last[0] || null;
  const days = t => L.ranks.filter(r => r.includes(t)).length;
  const move = t => { const i = prev.indexOf(t); if (i < 0) return '<span class="ue-new">새로</span>'; const d = i - last.indexOf(t); return d === 0 ? '<span class="ue-flat">–</span>' : `<span style="color:${_ueColor(d)}">${d > 0 ? '▲' : '▼'}${Math.abs(d)}</span>`; };
  const out = prev.filter(t => !last.includes(t));
  const kinds = [...new Set(c.lists.map(x => x[1]))];
  const topN = Math.max(20, ...L.ranks.map(r => r.length));
  body.innerHTML = `
    <div class="ue-listsel">
      ${kinds.map(kind => `<div><span>${kind} <small>${UE_KIND_DESC[kind] || ''}</small></span>${c.lists.filter(x => x[1] === kind).map(([k, , f]) =>
        `<button class="chip chip-sm${USE.list === k ? ' active' : ''}" data-ue-list="${k}">${f}</button>`).join('')}</div>`).join('')}
    </div>
    <div class="ue-rank-grid${USE.market === 'kr' ? ' ue-rank-kr' : ''}">
      <div class="card">
        <div class="card-header" style="flex-wrap:wrap;gap:6px">
          <span class="card-title">${meta[1]} 상위 ${Math.min(20, last.length) || 20}</span><span class="card-sub">${meta[2]} · ${_ueMD(L.dates[L.dates.length - 1])}</span>
        </div>
        ${last.length ? `<div class="ue-scroll"><table class="ue-tbl ue-pickable">
          <thead><tr><th>순위</th><th class="ue-l">${c.unit}</th><th>점수</th><th title="하루 전 순위와 비교">전일 대비</th><th title="최근 10거래일 가운데 상위 20에 든 날">10일 중</th></tr></thead>
          <tbody>${last.map((t, i) => `<tr class="${t === USE.pick ? 'on' : ''}" data-ue-pick="${escAttr(t)}" tabindex="0" role="button">
            <td class="ue-n ue-rk">${i + 1}</td><td class="ue-name">${_ueCell(t)}</td>
            <td class="ue-n"><b>${_ueNum(L.scores?.[t])}</b></td><td class="ue-n">${move(t)}</td><td class="ue-n">${days(t)}일</td></tr>`).join('')}</tbody>
        </table></div>` : `<div class="ue-msg">오늘 조건(${escapeHtml(meta[2])})을 맞춘 ${c.unit}이 없습니다.</div>`}
        ${out.length ? `<div class="ue-out">전일 순위에서 빠짐: ${out.map(t => `<b title="${escAttr(_ueName(t))}">${escapeHtml(t)}</b>`).join(' ')}</div>` : ''}
      </div>
      <div class="card">
        <div class="card-header" style="flex-wrap:wrap;gap:6px">
          <span class="card-title">최근 ${L.dates.length}거래일 순위</span><span class="card-sub">왼쪽 표에서 고른 것을 따라 봅니다 · 칸을 눌러도 됩니다</span>
        </div>
        <div class="ue-scroll"><table class="ue-mat${USE.market === 'kr' ? ' ue-mat-kr' : ''}">
          <thead><tr><th></th>${L.dates.map((d, i) => `<th class="${i === L.dates.length - 1 ? 'last' : ''}">${_ueMD(d)}</th>`).join('')}</tr></thead>
          <tbody>${Array.from({ length: topN }, (_, r) => `<tr><td class="ue-rk">${r + 1}</td>${L.ranks.map((row, ci) => {
            const t = row[r];
            return t ? `<td class="${t === USE.pick ? 'on' : ''}${ci === L.ranks.length - 1 ? ' last' : ''}" data-ue-pick="${escAttr(t)}" title="${escAttr(`${t} ${_ueName(t)}`.trim())}">${escapeHtml(_ueShort(t))}</td>` : '<td class="none">·</td>';
          }).join('')}</tr>`).join('')}</tbody>
        </table></div>
      </div>
    </div>
    <div class="ue-foot">모멘텀 점수 = 126거래일 수익률 ÷ 같은 기간 일간 수익률의 표준편차. 소르티노 = 일간 수익률 평균 × 252 ÷ (내린 날 수익률의 표준편차 × √252).
      ${USE.market === 'kr' ? 'ETR Comfort = 연수익(CAGR) ÷ (최대 낙폭 × 연 변동성). ' : ''}'○일선 이상'은 그날 종가가 그 이동평균선 위에 있는 것만 남긴 순위입니다. 점수는 최신일 값.</div>`;
  body.querySelectorAll('[data-ue-list]').forEach(b => b.addEventListener('click', () => { USE.list = b.dataset.ueList; ueRender(); }));
  body.querySelectorAll('[data-ue-pick]').forEach(el => {
    const go = () => { USE.pick = el.dataset.uePick; body.querySelectorAll('[data-ue-pick]').forEach(x => x.classList.toggle('on', x.dataset.uePick === USE.pick)); };
    el.addEventListener('click', go);
    el.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); } });
  });
  // 한국은 이름이 길어 좁은 화면에선 표가 옆으로 넘친다 — 최신 날짜(오른쪽 끝)가 먼저 보이게
  const mat = body.querySelector('.ue-mat-kr')?.parentElement;
  if (mat) mat.scrollLeft = mat.scrollWidth;
}

// ── ③ 과열 점검 ─────────────────────────────────────────────────────────
function ueRenderHeat(body, p) {
  const c = _ueCfg();
  const H = p.heat || [];
  if (!H.length) { body.innerHTML = `<div class="ue-msg">과열 점검 대상이 없습니다 — ${escapeHtml(c.heatSub)}에 든 ${c.unit}이 없습니다.</div>`; return; }
  if (!USE.heatPick || !H.some(h => h.t === USE.heatPick)) USE.heatPick = H[0].t;
  const maxHeat = Math.max(120, ...H.map(h => Math.abs(h.heat ?? 0)));
  const over = H.filter(h => (h.heat ?? 0) >= 100);
  body.innerHTML = `
    <div class="ue-heat-grid">
      <div class="card">
        <div class="card-header" style="flex-wrap:wrap;gap:6px">
          <span class="card-title">과열 점검</span><span class="card-sub">${escapeHtml(c.heatSub)} · 줄을 누르면 그림</span>
        </div>
        <div class="ue-strong">${over.length ? `<span>97% 구간을 넘은 ${c.unit}</span>${over.map(h => `<b>${escapeHtml(h.t)} <i>${_ueNum(h.heat, 0)}</i></b>`).join('')}`
          : `<span>지금 97% 구간(최근 1년 상위 3% 이격)을 넘은 ${c.unit}은 없습니다.</span>`}</div>
        <div class="ue-scroll"><table class="ue-tbl ue-pickable">
          <thead><tr><th>순위</th><th class="ue-l">${c.unit}</th><th title="(종가 ÷ 30일선 − 1) × 100">30일 이격도</th><th title="최근 247거래일 이격도의 97% 분위수">97% 구간</th><th class="ue-barcell"></th><th title="현재 이격도 ÷ 97% 구간 × 100 — 100을 넘으면 과열">위치</th></tr></thead>
          <tbody>${H.map(h => `<tr class="${h.t === USE.heatPick ? 'on' : ''}" data-ue-heat="${escAttr(h.t)}" tabindex="0" role="button">
            <td class="ue-n ue-rk">${h.rank}</td><td class="ue-name">${_ueCell(h.t)}</td>
            <td class="ue-n" style="color:${_ueColor(h.gap)}">${_ueSigned(h.gap, 2, '%')}</td>
            <td class="ue-n">${_ueNum(h.p97)}%</td>
            <td class="ue-barcell">${h.heat == null ? '' : `<span class="ue-meter"><i style="width:${(Math.max(0, Math.min(h.heat, maxHeat)) / maxHeat * 100).toFixed(1)}%;background:${h.heat >= 100 ? 'var(--warn)' : h.heat >= 0 ? 'var(--text2)' : 'transparent'}"></i><u style="left:${(100 / maxHeat * 100).toFixed(1)}%"></u></span>`}</td>
            <td class="ue-n"><b style="color:${(h.heat ?? 0) >= 100 ? 'var(--warn)' : 'var(--text)'}">${_ueNum(h.heat, 0)}</b></td></tr>`).join('')}</tbody>
        </table></div>
      </div>
      <div class="card">
        <div class="card-header" style="flex-wrap:wrap;gap:6px"><span class="card-title" id="ue-heat-title"></span><span class="card-sub" id="ue-heat-sub"></span></div>
        <div class="ue-chart"><canvas id="ue-heat-chart" role="img" aria-label="종가·30일선과 30일 이격도"></canvas></div>
        <div class="ue-legend"><span><i style="background:var(--text1)"></i>종가</span><span><i style="background:${SERIES_PAL[1]}"></i>30일선</span>
          <span><i style="height:8px;background:linear-gradient(var(--up) 50%, var(--down) 50%)"></i>30일 이격도 (오른쪽)</span><span><i style="height:0;border-top:1px dashed var(--warn)"></i>97% 구간</span></div>
      </div>
    </div>
    <div class="ue-foot">30일 이격도 = (종가 ÷ 30일선 − 1) × 100. 97% 구간 = 최근 247거래일 이격도 가운데 상위 3% 경계.
      위치 = 현재 이격도 ÷ 97% 구간 × 100 — 100을 넘으면 지난 1년에서 드물게 벌어진 상태입니다. 강한 ${c.unit}을 쫓아 들어갈 때 과열 여부를 보는 용도입니다.</div>`;
  body.querySelectorAll('[data-ue-heat]').forEach(tr => {
    const go = () => { USE.heatPick = tr.dataset.ueHeat; body.querySelectorAll('[data-ue-heat]').forEach(x => x.classList.toggle('on', x === tr)); ueDrawHeat(); };
    tr.addEventListener('click', go);
    tr.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); } });
  });
  ueDrawHeat();
}

function ueDrawHeat() {
  const p = USE.p, h = (p.heat || []).find(x => x.t === USE.heatPick), cv = document.getElementById('ue-heat-chart');
  unloadUsEtf();
  if (!h || !cv) return;
  document.getElementById('ue-heat-title').textContent = _ueName(h.t) ? `${h.t} · ${_ueName(h.t)}` : h.t;
  document.getElementById('ue-heat-sub').textContent = `이격도 ${_ueSigned(h.gap, 2, '%')} · 97% 구간 ${_ueNum(h.p97)}% · 위치 ${_ueNum(h.heat, 0)}`;
  const t = chartTheme(), css = getComputedStyle(document.documentElement);
  const up = css.getPropertyValue('--up').trim() || '#f5365c', dn = css.getPropertyValue('--down').trim() || '#4a9eff';
  const labels = h.dates || p.heat_dates || [];
  const ma30 = h.price.map((v, i) => v == null || h.gaps[i] == null ? null : v / (1 + h.gaps[i] / 100));
  USE.chart = new Chart(cv.getContext('2d'), {
    data: {
      labels,
      datasets: [
        { type: 'line', label: '종가', data: h.price, yAxisID: 'y', borderColor: css.getPropertyValue('--text1').trim() || '#cfd4e4', borderWidth: 1.6, pointRadius: 0, pointHoverRadius: 4, tension: 0.1, spanGaps: true, order: 1 },
        { type: 'line', label: '30일선', data: ma30, yAxisID: 'y', borderColor: SERIES_PAL[1], borderWidth: 1.4, pointRadius: 0, pointHoverRadius: 0, tension: 0.1, spanGaps: true, order: 2 },
        { type: 'line', label: '97% 구간', data: labels.map(() => h.p97), yAxisID: 'y1', borderColor: css.getPropertyValue('--warn').trim() || '#f0a500', borderDash: [5, 4], borderWidth: 1.2, pointRadius: 0, pointHoverRadius: 0, order: 3 },
        { type: 'bar', label: '30일 이격도', data: h.gaps, yAxisID: 'y1', backgroundColor: h.gaps.map(v => (v ?? 0) >= 0 ? up + '55' : dn + '55'), borderWidth: 0, barPercentage: 1, categoryPercentage: 1, order: 4 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ctx.parsed.y == null ? null : `${ctx.dataset.label}: ${ctx.dataset.yAxisID === 'y1' ? _ueSigned(ctx.parsed.y, 2, '%') : ctx.parsed.y.toLocaleString(undefined, { maximumFractionDigits: 2 })}` } } },
      scales: {
        x: { ticks: { color: t.tick, font: { size: 10 }, maxTicksLimit: 8, maxRotation: 0, callback: function (v) { return this.getLabelForValue(v).slice(2, 7).replace('-', '.'); } }, grid: { color: t.grid } },
        y: { position: 'left', ticks: { color: t.tick, font: { size: 10 }, maxTicksLimit: 6 }, grid: { color: t.grid } },
        y1: { position: 'right', ticks: { color: t.tick, font: { size: 10 }, maxTicksLimit: 6, callback: v => v + '%' }, grid: { drawOnChartArea: false } },
      },
    },
  });
}

// ── ④ 정배열 ───────────────────────────────────────────────────────────
function ueRenderAlign(body, p) {
  const c = _ueCfg();
  const A = p.align || [];
  const full = A.filter(a => a.full), ma = A.filter(a => a.ma);
  // 처음 열 때 완전 정배열이 하나도 없으면 빈 표 대신 이평 정배열 → 전체(강도순)를 보여 준다. 칩을 눌러 고른 뒤에는 고른 대로.
  const mode = USE.alignPicked || USE.alignMode !== 'full' || full.length ? USE.alignMode : ma.length ? 'ma' : 'all';
  const rows = (mode === 'full' ? full : mode === 'ma' ? ma : A).slice().sort((a, b) => mode === 'ma'
    ? b.ma_days - a.ma_days || b.strength - a.strength
    : (b.full - a.full) || b.full_days - a.full_days || b.strength - a.strength);
  const yes = v => `<td class="ue-n ue-dot" style="color:${v ? 'var(--up)' : 'var(--text3)'}">${v ? '●' : '○'}</td>`;
  const since = (start, days) => days ? `${_ueMD(start)}부터 <b>${days}</b>거래일` : '<span style="color:var(--text3)">—</span>';
  body.innerHTML = `
    <div class="card">
      <div class="ue-kpis">
        <div><span>완전 정배열</span><b>${full.length}</b><small>종가 &gt; 20 &gt; 65 &gt; 130 &gt; 260일선</small></div>
        <div><span>이평 정배열</span><b>${ma.length}</b><small>20 &gt; 65 &gt; 130 &gt; 260일선</small></div>
        <div><span>분석한 ${c.unit}</span><b>${A.length}</b><small>260일선을 계산할 수 있는 것</small></div>
      </div>
      <div class="card-header" style="flex-wrap:wrap;gap:6px;border-top:1px solid var(--border)">
        <span class="card-title">이동평균 정배열</span><span class="card-sub">4 · 13 · 26 · 52주선 = 20 · 65 · 130 · 260거래일</span>
        <div class="ue-filters">${[['full', `완전 ${full.length}`], ['ma', `이평 ${ma.length}`], ['all', `전체 ${A.length}`]].map(([k, n]) =>
          `<button class="chip chip-sm${mode === k ? ' active' : ''}" data-ue-align="${k}">${n}</button>`).join('')}</div>
      </div>
      <div class="ue-scroll"><table class="ue-tbl">
        <thead><tr><th>${c.unit} ${rows.length}</th>${c.groups ? '<th class="ue-l ue-grp-h">묶음</th>' : ''}<th>완전 정배열</th><th>이평 정배열</th><th title="종가가 20일선 위인지">종가&gt;20</th><th title="네 간격(%)의 합 — 선들이 얼마나 벌어져 있는지">강도</th><th class="ue-gaps" title="종가÷20일선 · 20÷65 · 65÷130 · 130÷260 간격(%)">간격</th></tr></thead>
        <tbody>${rows.length ? rows.map(a => `<tr class="${a.full ? 'ue-hot' : ''}"${_ueStockAttr(a.t)}>
          <td class="ue-name">${_ueCell(a.t)}</td>${c.groups ? `<td class="ue-grp">${escapeHtml(_ueEtf(a.t)?.g || '')}</td>` : ''}
          <td class="ue-n">${since(a.full_start, a.full_days)}</td><td class="ue-n">${since(a.ma_start, a.ma_days)}</td>
          ${yes(a.above4w)}
          <td class="ue-n" style="color:${_ueColor(a.strength)}"><b>${_ueSigned(a.strength)}</b></td>
          <td class="ue-n ue-gaps">${a.gaps.map(g => `<i style="color:${_ueColor(g)}">${_ueSigned(g, 1)}</i>`).join(' ')}</td></tr>`).join('')
          : `<tr><td colspan="${c.groups ? 7 : 6}" class="ue-msg">해당하는 ${c.unit}이 없습니다.</td></tr>`}</tbody>
      </table></div>
    </div>
    <div class="ue-foot">완전 정배열 = 종가가 20일선 위에 있고 20 &gt; 65 &gt; 130 &gt; 260일선 순서. 이평 정배열 = 선끼리만 그 순서(종가는 20일선 아래일 수 있음).
      '○○부터 n거래일' = 그 상태가 끊기지 않고 이어진 기간. 강도 = 종가÷20일선, 20÷65, 65÷130, 130÷260 간격(%)을 더한 값.</div>`;
  body.querySelectorAll('[data-ue-align]').forEach(b => b.addEventListener('click', () => { USE.alignMode = b.dataset.ueAlign; USE.alignPicked = true; ueRender(); }));
}

// ── 공용 선 그림(한국 탭) ───────────────────────────────────────────────
function _ueLineChart(id, labels, sets, yOpt = {}, tipFmt = v => v.toFixed(1)) {
  const cv = document.getElementById(id);
  if (!cv) return;
  const t = chartTheme();
  const multiYear = labels.length > 1 && labels[0].slice(0, 4) !== labels[labels.length - 1].slice(0, 4);   // 해를 넘기면 '26.03'처럼
  USE.charts.push(new Chart(cv.getContext('2d'), {
    type: 'line',
    data: { labels, datasets: sets.map(s => ({ borderWidth: 1.7, pointRadius: 0, pointHoverRadius: 4, tension: 0.12, spanGaps: true, fill: false,
      backgroundColor: s.borderColor, ...s })) },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { filter: it => !String(it.dataset.label).startsWith('_'), callbacks: { label: ctx => ctx.parsed.y == null ? null : `${ctx.dataset.label}: ${tipFmt(ctx.parsed.y)}` } } },
      scales: {
        x: { ticks: { color: t.tick, font: { size: 10 }, maxTicksLimit: 7, maxRotation: 0, callback: function (v) { const d = this.getLabelForValue(v); return multiYear ? d.slice(2, 7).replace('-', '.') : _ueMD(d); } }, grid: { color: t.grid } },
        y: { ticks: { color: t.tick, font: { size: 10 }, maxTicksLimit: 6 }, grid: { color: t.grid }, ...yOpt },
      },
    },
  }));
}
const _ueGuide = (labels, v, color = 'rgba(168,173,196,.5)') => ({ label: `_${v}`, data: labels.map(() => v), borderColor: color, borderDash: [4, 4], borderWidth: 1, pointHoverRadius: 0 });

// ── ⑤ 시장 폭 · 쏠림(한국) ─────────────────────────────────────────────
function ueRenderBreadth(body, p) {
  const cr = p.crowd || {}, br = p.breadth || {}, now = br.now || {}, cnt = br.count || {};
  const hot = (cr.value ?? 0) >= (cr.threshold ?? 35);
  const REV = { met: ['역추세 조건 충족', 'warn', '120일선 위 비율 30% 미만 — 시장 안쪽이 매우 약한 구간'], near: ['역추세 접근', 'soft', '120일선 위 비율 30~40%'], wait: ['대기', '', '120일선 위 비율 40% 이상'] };
  const [revName, revCls, revDesc] = REV[br.reverse] || ['—', '', ''];
  const tile = (name, v, c, sub = '') => `<div><span>${name}</span><b>${v == null ? '—' : _ueNum(v, 1) + '%'}</b><small>${c ? `${c[0]} / ${c[1]}` : ''}${sub}</small></div>`;
  body.innerHTML = `
    <div class="ue-grid2">
      <div class="card">
        <div class="card-header" style="flex-wrap:wrap;gap:6px"><span class="card-title">쏠림지수</span><span class="card-sub">6개월 수익률이 몇몇 업종에 몰렸나 · ${_ueMD(cr.date)}</span></div>
        <div class="ue-big"><b style="color:${hot ? 'var(--warn)' : 'var(--text)'}">${_ueNum(cr.value, 1)}</b>
          <span class="ue-badge${hot ? ' warn' : ''}">${hot ? '과열 · 쏠림' : '비과열 · 확산'}</span><small>기준 ${cr.threshold ?? 35} 이상이면 과열</small></div>
        <div class="ue-chart ue-chart-sm"><canvas id="ue-c-crowd" role="img" aria-label="쏠림지수 추이"></canvas></div>
        <div class="ue-two">
          <div><h4>6개월 수익률 상위 10</h4>${(cr.leaders || []).map(x => `<p><span>${escapeHtml(x.n)}</span><b style="color:${_ueColor(x.r6)}">${_ueSigned(x.r6, 1, '%')}</b></p>`).join('')}</div>
          <div><h4>하위 10</h4>${(cr.laggards || []).map(x => `<p><span>${escapeHtml(x.n)}</span><b style="color:${_ueColor(x.r6)}">${_ueSigned(x.r6, 1, '%')}</b></p>`).join('')}</div>
        </div>
      </div>
      <div class="card">
        <div class="card-header" style="flex-wrap:wrap;gap:6px"><span class="card-title">Breadth</span><span class="card-sub">이동평균선 위에 있는 종목 비율 · ${_ueMD(br.date)}</span></div>
        <div class="ue-kpis ue-kpis4">
          ${tile('10일선 위', now.a10, cnt.ma10)}${tile('20일선 위', now.a20, cnt.ma20)}${tile('50일선 위', now.a50, cnt.ma50)}${tile('120일선 위', now.a120, cnt.ma120)}
        </div>
        <div class="ue-big ue-big-row"><span>종합 점수(5일 평균)</span><b>${_ueNum(now.ma5, 1)}</b>
          <small>5일 <i style="color:${_ueColor(now.sl5)}">${_ueSigned(now.sl5, 1)}</i> · 10일 <i style="color:${_ueColor(now.sl10)}">${_ueSigned(now.sl10, 1)}</i></small>
          <span class="ue-badge${revCls ? ' ' + revCls : ''}" title="${escAttr(revDesc)}">${revName}</span></div>
        <div class="ue-chart ue-chart-sm"><canvas id="ue-c-breadth" role="img" aria-label="Breadth 추이"></canvas></div>
        <div class="ue-legend"><span><i style="background:${SERIES_PAL[0]}"></i>10일선</span><span><i style="background:${SERIES_PAL[1]}"></i>20일선</span><span><i style="background:${SERIES_PAL[2]}"></i>50일선</span><span><i style="background:${SERIES_PAL[3]}"></i>120일선</span><span><i style="background:var(--text1);height:3px"></i>종합(5일 평균)</span></div>
      </div>
    </div>
    <div class="card" style="margin-top:1rem">
      <div class="card-header"><span class="card-title">최근 20거래일 Breadth</span><span class="card-sub">최신 순</span></div>
      <div class="ue-scroll"><table class="ue-tbl">
        <thead><tr><th>날짜</th><th>10일선</th><th>20일선</th><th>50일선</th><th>120일선</th><th>종합</th><th>5일 변화</th><th>10일 변화</th></tr></thead>
        <tbody>${[...(br.recent || [])].reverse().map(r => `<tr><td>${_ueMD(r.d)}</td>${['a10', 'a20', 'a50', 'a120'].map(k => `<td class="ue-n">${_ueNum(r[k], 1)}%</td>`).join('')}
          <td class="ue-n"><b>${_ueNum(r.ma5, 1)}</b></td><td class="ue-n" style="color:${_ueColor(r.sl5)}">${_ueSigned(r.sl5, 1)}</td><td class="ue-n" style="color:${_ueColor(r.sl10)}">${_ueSigned(r.sl10, 1)}</td></tr>`).join('')}</tbody>
      </table></div>
    </div>
    <div class="ue-foot">쏠림지수 = 날마다 6개월 수익률 순위를 가운데가 0인 점수(1위 +1 ~ 꼴찌 −1)로 바꿔 수익률에 곱한 값의 표준편차 × 100. 몇몇 업종만 크게 오르고 나머지가 처지면 커집니다.
      ※ 오늘의 시황 '주도 업종' 카드의 쏠림지수(WICS 업종 수급)와 다른 지표입니다.<br>
      Breadth = 그날 이동평균선 이상인 종목 비율(유효 10개 이상), 3일 평균으로 다듬은 10일선 35% + 20일선 35% + 50일선 30%를 다시 5일 평균. 120일선 위 비율이 30% 아래면 역추세 조건(코스피 낙폭과 함께 보는 참고 신호).</div>`;
  const cs = cr.series || {}, bs = br.series || {};
  _ueLineChart('ue-c-crowd', cs.dates || [], [
    { label: '쏠림지수', data: cs.v || [], borderColor: SERIES_PAL[1], borderWidth: 2 },
    _ueGuide(cs.dates || [], cr.threshold ?? 35, getComputedStyle(document.documentElement).getPropertyValue('--warn').trim() || '#f0a500'),
  ]);
  _ueLineChart('ue-c-breadth', bs.dates || [], [
    // 구성 비율 넷은 옅게, 종합 점수만 굵게 — 다섯 줄이 겹쳐도 종합이 먼저 읽히도록
    { label: '10일선', data: bs.a10 || [], borderColor: SERIES_PAL[0] + '80', borderWidth: 1 },
    { label: '20일선', data: bs.a20 || [], borderColor: SERIES_PAL[1] + '80', borderWidth: 1 },
    { label: '50일선', data: bs.a50 || [], borderColor: SERIES_PAL[2] + '99', borderWidth: 1.1 },
    { label: '120일선', data: bs.a120 || [], borderColor: SERIES_PAL[3] + '99', borderWidth: 1.1 },
    { label: '종합', data: bs.ma5 || [], borderColor: getComputedStyle(document.documentElement).getPropertyValue('--text1').trim() || '#cfd4e4', borderWidth: 2.4 },
    _ueGuide(bs.dates || [], 30),
  ], { min: 0, max: 100 }, v => v.toFixed(1) + '%');
}

// ── ⑥ 52주 신고가 전략(한국) ───────────────────────────────────────────
function ueRenderBt(body, p) {
  const bt = p.bt || {};
  if (!bt.start) { body.innerHTML = `<div class="ue-msg">${escapeHtml(bt.note || '백테스트 결과가 없습니다.')}</div>`; return; }
  const S = bt.perf?.strategy || {}, K = bt.perf?.kospi || {}, ts = bt.trade_stats || {};
  const held = bt.holdings || [], sells = bt.today_sell || [];
  // 오늘 종가 신호 — 백테스트와 같은 순서: 10일선 이탈을 먼저 팔고, 남은 빈 자리만큼 RS 상위 12 ∩ 52주 돌파를 RS 순으로
  const keep = held.filter(h => !sells.includes(h.n)).map(h => h.n);
  const buys = (bt.top12 || []).filter(x => x.brk && !keep.includes(x.n)).slice(0, Math.max(0, 4 - keep.length)).map(x => x.n);
  const yrs = bt.yearly?.years || [];
  body.innerHTML = `
    <div class="u5-top">
      <div class="card u5-port">
        <div class="card-header" style="flex-wrap:wrap;gap:6px">
          <span class="card-title">지금 들고 있는 것</span><span class="card-sub">최대 4종목 · 새로 살 때 25%</span>
          <span class="u5-cash">투자 <b>${_ueNum(bt.invested, 1)}%</b> · 현금 <b>${_ueNum(100 - (bt.invested ?? 0), 1)}%</b></span>
        </div>
        ${held.length ? `<table class="u5-tbl">
          <thead><tr><th>종목</th><th style="text-align:right">비중</th><th title="종가가 10일선보다 몇 % 위 — 0 아래로 내려가면 판다">10일선 위</th></tr></thead>
          <tbody>${held.map(h => `<tr${_ueStockAttr(h.n)}><td class="u5-name"><b>${escapeHtml(h.n)}</b></td><td class="u5-n"><b>${_ueNum(h.w, 1)}%</b></td>
            <td class="u5-n" style="color:${_ueColor(h.ma_gap)}">${_ueSigned(h.ma_gap, 2, '%')}</td></tr>`).join('')}</tbody></table>`
          : '<div class="u5-msg">보유 종목이 없습니다 — 현금 100%.</div>'}
        <div class="u5-acts"><span>오늘 종가 신호</span>${sells.map(n => `<b class="u5-act sell">매도 ${escapeHtml(n)}</b>`).join('')}${buys.map(n => `<b class="u5-act buy">매수 ${escapeHtml(n)}</b>`).join('')}${sells.length || buys.length ? '' : '<em>없음</em>'}</div>
      </div>
      <div class="card">
        <div class="card-header" style="flex-wrap:wrap;gap:6px"><span class="card-title">오늘 판정 근거</span><span class="card-sub">6개월 코스피 대비 RS 상위 12 — 이 가운데 52주 신고가를 넘은 것만 매수 후보</span></div>
        <div class="u5-scroll"><table class="u5-tbl">
          <thead><tr><th>순위</th><th>종목</th><th title="6개월 수익률 − 코스피 6개월 수익률">RS 6개월</th><th>종가</th><th title="직전 252거래일 종가 최고">52주 최고</th><th>돌파</th><th></th></tr></thead>
          <tbody>${(bt.top12 || []).map(x => { const own = held.some(h => h.n === x.n); return `<tr class="${own ? 'u5-held' : ''}"${_ueStockAttr(x.n)}>
            <td class="u5-n u5-rk">${x.rank}</td><td class="u5-name"><b>${escapeHtml(x.n)}</b></td>
            <td class="u5-n" style="color:${_ueColor(x.rs)}">${_ueSigned(x.rs, 1, '%p')}</td>
            <td class="u5-n">${_ueWon(x.close)}</td><td class="u5-n">${_ueWon(x.high)}</td>
            <td class="u5-n u5-dot" style="color:${x.brk ? 'var(--up)' : 'var(--text3)'}">${x.brk ? '●' : '○'}</td>
            <td>${own ? '<span class="u5-tag u5-o-held">보유</span>' : ''}</td></tr>`; }).join('')}</tbody>
        </table></div>
      </div>
    </div>

    <div class="card u5-perf-card">
      <div class="card-header" style="flex-wrap:wrap;gap:6px">
        <span class="card-title">백테스트</span><span class="card-sub">${_ueMD(bt.start)} 첫 거래부터(그 전날 = 1) · 1원이 얼마가 됐나</span>
      </div>
      <div class="u5-chart u5-chart-lg"><canvas id="ue-c-bt" role="img" aria-label="52주 신고가 전략과 코스피 자산 곡선"></canvas></div>
      <div class="u5-legend"><span><i style="background:${SERIES_PAL[1]}"></i>52주 신고가 전략</span><span><i style="background:var(--text2)"></i>코스피 보유</span></div>
      <div class="u5-perf">
        <table class="u5-tbl">
          <thead><tr><th>전략</th><th>연수익(CAGR)</th><th>최대 낙폭</th><th>Sharpe</th><th>Sortino</th><th title="1년 동안 사고판 비중의 합">회전율</th><th>배수</th></tr></thead>
          <tbody>${[['52주 신고가 전략', S, true], ['코스피 보유', K, false]].map(([n, s, hl]) => `<tr class="${hl ? 'u5-hl' : ''}">
            <td class="u5-name"><b>${n}</b></td><td class="u5-n" style="color:${_ueColor(s.cagr)}">${_ueSigned(s.cagr, 2, '%')}</td>
            <td class="u5-n" style="color:var(--down)">${_ueNum(s.mdd, 2)}%</td><td class="u5-n">${_ueNum(s.sharpe)}</td><td class="u5-n">${_ueNum(s.sortino)}</td>
            <td class="u5-n">${s.turnover == null ? '—' : _ueNum(s.turnover, 1) + '배'}</td><td class="u5-n"><b>${_ueNum(s.mult, 2)}x</b></td></tr>`).join('')}</tbody>
        </table>
        <div class="u5-side">
          <table class="u5-tbl">
            <thead><tr><th>연도</th><th>전략</th><th>코스피</th><th>차이</th></tr></thead>
            <tbody>${yrs.map((y, i) => { const a = bt.yearly.strategy[i], b = bt.yearly.kospi[i], d = a == null || b == null ? null : a - b;
              return `<tr><td>${y}${i === 0 ? '<small> (일부)</small>' : i === yrs.length - 1 ? '<small> (연중)</small>' : ''}</td>
              <td class="u5-n" style="color:${_ueColor(a)}">${_ueSigned(a, 1, '%')}</td><td class="u5-n" style="color:${_ueColor(b)}">${_ueSigned(b, 1, '%')}</td>
              <td class="u5-n" style="color:${_ueColor(d)}">${_ueSigned(d, 1, '%p')}</td></tr>`; }).join('')}</tbody>
          </table>
          <div class="u5-note">매수 <b>${ts.buys ?? 0}</b>회 · 매도 <b>${ts.sells ?? 0}</b>회 · 평균 보유 <b>${_ueNum(ts.avg_hold, 2)}</b>종목(최대 ${ts.max_hold ?? 0}) · 평균 투자 비중 <b>${_ueNum(ts.avg_inv, 1)}%</b><br>
            전략이 코스피보다 ${(S.cagr ?? 0) >= (K.cagr ?? 0) ? '연수익이 높고' : '연수익이 낮고'} 최대 낙폭은 ${(S.mdd ?? 0) >= (K.mdd ?? 0) ? '얕았습니다' : '깊었습니다'}. 표본 안의 결과이며 거래비용 0.1%를 뺐습니다.</div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:1rem">
      <div class="card-header" style="flex-wrap:wrap;gap:6px"><span class="card-title">최근 거래</span><span class="card-sub">최신 순 ${bt.trades?.length || 0}건 · 신호일 종가에 체결 가정</span></div>
      <div class="u5-scroll"><table class="u5-tbl">
        <thead><tr><th>신호일</th><th>종목</th><th style="text-align:left">매매</th><th>종가</th><th>10일선</th><th style="text-align:left">근거</th></tr></thead>
        <tbody>${[...(bt.trades || [])].reverse().map(t => `<tr${_ueStockAttr(t.t)}>
          <td class="u5-n u5-rk">${_ueMD(t.sd)}</td><td class="u5-name"><b>${escapeHtml(t.t)}</b></td>
          <td><b class="u5-act ${t.a === 'BUY' ? 'buy' : 'sell'}">${t.a === 'BUY' ? '매수' : '매도'}</b></td>
          <td class="u5-n">${_ueWon(t.close)}</td><td class="u5-n">${_ueWon(t.ma10)}</td>
          <td class="u5-why">${t.a === 'BUY' ? `52주 최고 ${_ueWon(t.high)} 돌파 · RS ${t.rk ?? '—'}위` : '10일선 아래'}</td></tr>`).join('')}</tbody>
      </table></div>
    </div>
    <div class="ue-foot">규칙 — 6개월(126거래일) 수익률 − 코스피 6개월 수익률 상위 12 가운데, 종가가 직전 252거래일 종가 최고를 넘은 종목을 RS 순으로 빈 자리만큼(최대 4) 25%씩 삽니다.
      보유 종목은 종가가 10일선 아래면 팝니다. 신호일 종가에 체결한다고 가정하고 수익은 다음 거래일부터 셉니다. 거래비용 0.1%, 기존 보유 비중은 가격대로 움직이게 둡니다(원본과 같음).
      자료가 2025-01-21부터라(원본 엑셀과 같음) 첫 거래는 252거래일 뒤에 나옵니다.</div>`;
  const c = bt.curve || {};
  _ueLineChart('ue-c-bt', c.dates || [], [
    { label: '52주 신고가 전략', data: c.strategy || [], borderColor: SERIES_PAL[1], borderWidth: 2.4 },
    { label: '코스피 보유', data: c.kospi || [], borderColor: getComputedStyle(document.documentElement).getPropertyValue('--text2').trim() || '#b3b8cd', borderWidth: 1.6 },
    _ueGuide(c.dates || [], 1),
  ], { ticks: { color: chartTheme().tick, font: { size: 10 }, maxTicksLimit: 6, callback: v => (+v).toFixed(2) } }, v => `${v.toFixed(3)} (${_ueSigned((v - 1) * 100, 1, '%')})`);
}
