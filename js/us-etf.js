// us-etf.js — STRATEGY '미국 ETF' 페이지 (11-16)
// [원본] 태린이아빠 Market Dashboard '미국 ETF 소라티노 및 상대강도'(공개 소스 app.py US_SECTOR_SRC)
//   SPY를 기준으로 업종·테마 ETF 99개의 힘을 네 가지로 본다.
//   ① 상대강도  Mansfield RS = (ETF÷SPY ÷ 그 126일 평균 − 1) × 100, 정규화 = 100 ÷ (1 + e^(−RS÷12)) — 70 이상이 강한 것
//               6개월 수익률과 SPY 대비 차이
//   ② 순위 변화  최근 10거래일 각각의 상위 20 — 변동성 조정 모멘텀(6개월 수익률 ÷ 일간 표준편차, 필터 없음 · 10 · 20 · 60일선 이상)
//               소르티노(6개월, 10 · 20 · 50일선 이상)
//   ③ 과열 점검  소르티노(10일선 이상) 상위 20의 30일 이격도가 최근 247거래일의 97% 구간 대비 어디인지(100 이상 = 과열)
//   ④ 정배열    20 · 65 · 130 · 260일선(4 · 13 · 26 · 52주) 정배열과 이어진 거래일 수
// [원본과 다른 점] 원본은 표 11장 + 그림 20장을 세로로 늘어놓는다. 여기는 네 탭으로 나누고 표를 정렬·필터할 수 있게 했다.
//   계산은 백엔드 collect_us_etf_rs.py — 원본 대조(11-13 종가): 순위표 7종 상위 20 순서까지 일치.
// 데이터: market_snapshot(kind = 'us_etf', payload) — 매일 07:20 · 08:30
// 의존: config.js (sb, escapeHtml, escAttr, chartTheme, SERIES_PAL), Chart.js

const USE = {
  p: null,
  tab: 'rs',              // rs | rank | heat | align
  rsSort: ['norm', -1],   // 상대강도 표 정렬
  rsGroup: '',            // 묶음 필터
  rsStrong: false,        // 정규화 70 이상만
  list: 'sor10',          // 순위 변화: 어떤 표
  pick: null,             // 순위 변화: 눌러서 따라가 보는 ETF
  heatPick: null,         // 과열 점검: 그림으로 보는 ETF
  alignMode: 'full',      // full | ma | all
  chart: null,
};

const USE_TABS = [['rs', '상대강도'], ['rank', '순위 변화'], ['heat', '과열 점검'], ['align', '정배열']];
const USE_LISTS = [
  ['mom', '모멘텀', '필터 없음'], ['mom10', '모멘텀', '10일선 이상'], ['mom20', '모멘텀', '20일선 이상'], ['mom60', '모멘텀', '60일선 이상'],
  ['sor10', '소르티노', '10일선 이상'], ['sor20', '소르티노', '20일선 이상'], ['sor50', '소르티노', '50일선 이상'],
];
const USE_STRONG = 70;    // 원본 Norm_RS_avg >= 70

function pUsEtf() {
  return `
  <div class="ue-head">
    <div class="ue-lede">미국 업종·테마 ETF <b>99개가 S&amp;P500(SPY)보다 얼마나 강한지</b>, 그 힘이 <b>흔들림 없이 꾸준한지</b>를 봅니다.
      강한 업종이 어디서 어디로 옮겨 가는지 확인하는 용도입니다.</div>
    <div id="ue-asof" class="ue-asof"></div>
  </div>
  <div class="ue-tabs" role="tablist">${USE_TABS.map(([k, n]) =>
    `<button class="chip${USE.tab === k ? ' active' : ''}" role="tab" aria-selected="${USE.tab === k}" data-ue-tab="${k}" onclick="setUeTab('${k}')">${n}</button>`).join('')}</div>
  <div id="ue-body"><div class="ue-msg">불러오는 중...</div></div>`;
}

async function loadUsEtf() {
  const body = document.getElementById('ue-body');
  if (!body) return;
  try {
    const { data, error } = await sb.from('market_snapshot').select('base_date,payload')
      .eq('kind', 'us_etf').order('base_date', { ascending: false }).limit(1);
    if (error) throw error;
    if (!document.getElementById('ue-body')) return;
    USE.p = data?.[0]?.payload || null;
    if (!USE.p) { body.innerHTML = '<div class="ue-msg">아직 계산된 날이 없습니다 — 매일 아침 7시 20분에 채워집니다.</div>'; return; }
    ueRender();
  } catch (e) {
    const missing = /42P01|PGRST205|does not exist|Could not find/.test(`${e?.code} ${e?.message}`);
    if (!missing) console.warn('[미국 ETF]', e);
    body.innerHTML = `<div class="ue-msg">${missing ? '준비 중 — 데이터 테이블이 아직 없습니다.'
      : '불러오지 못했습니다 — ' + escapeHtml(e.message || '조회 실패')}</div>`;
  }
}

function unloadUsEtf() {
  if (USE.chart) { USE.chart.destroy(); USE.chart = null; }
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
const _ueCell = t => `<b>${escapeHtml(t)}</b><small>${escapeHtml(_ueName(t))}</small>`;

function ueRender() {
  const p = USE.p, body = document.getElementById('ue-body');
  if (!body || !p) return;
  unloadUsEtf();
  const asof = document.getElementById('ue-asof');
  if (asof) asof.innerHTML = `<b>${escapeHtml(p.asof)} 기준</b> · ETF ${p.n} / ${p.total} · SPY 6개월 ${_ueSigned(p.spy?.ret6m, 1, '%')}`;
  ({ rs: ueRenderRs, rank: ueRenderRank, heat: ueRenderHeat, align: ueRenderAlign }[USE.tab] || ueRenderRs)(body, p);
}

// ── ① 상대강도 ─────────────────────────────────────────────────────────
function ueRenderRs(body, p) {
  const [key, dir] = USE.rsSort;
  const strong = p.etfs.filter(e => (e.norm ?? 0) >= USE_STRONG).sort((a, b) => b.norm - a.norm);
  const rows = p.etfs.filter(e => (!USE.rsGroup || e.g === USE.rsGroup) && (!USE.rsStrong || (e.norm ?? 0) >= USE_STRONG))
    .sort((a, b) => ((a[key] ?? (dir < 0 ? -Infinity : Infinity)) - (b[key] ?? (dir < 0 ? -Infinity : Infinity))) * dir);
  const rank = Object.fromEntries([...p.etfs].sort((a, b) => (b.norm ?? -1) - (a.norm ?? -1)).map((e, i) => [e.t, i + 1]));
  const th = (k, name, tip = '') => `<th class="ue-sort${key === k ? ' on' : ''}" data-ue-sort="${k}" tabindex="0" role="button"${tip ? ` title="${escAttr(tip)}"` : ''}>${name}${key === k ? (dir < 0 ? ' ↓' : ' ↑') : ''}</th>`;
  body.innerHTML = `
    <div class="card">
      <div class="card-header" style="flex-wrap:wrap;gap:6px">
        <span class="card-title">SPY 대비 상대강도</span>
        <span class="card-sub">6개월(126거래일) · 정규화 70 이상이 강한 ETF</span>
        <div class="ue-filters">
          <button class="chip chip-sm${USE.rsStrong ? ' active' : ''}" id="ue-strong">70 이상만 ${strong.length}</button>
          <select class="ue-select" id="ue-group" aria-label="묶음 고르기"><option value="">전체 묶음</option>${p.groups.map(g => `<option${USE.rsGroup === g ? ' selected' : ''}>${escapeHtml(g)}</option>`).join('')}</select>
        </div>
      </div>
      <div class="ue-strong">${strong.length
        ? `<span>정규화 70 이상</span>${strong.map(e => `<b title="${escAttr(e.name)}">${escapeHtml(e.t)} <i>${_ueNum(e.norm, 1)}</i></b>`).join('')}`
        : '<span>정규화 70 이상인 ETF가 없습니다 — SPY를 뚜렷하게 앞서는 업종이 없는 구간입니다.</span>'}</div>
      <div class="ue-scroll"><table class="ue-tbl">
        <thead><tr><th>순위</th><th>ETF ${rows.length}</th><th>묶음</th>${th('rs', 'RS', 'Mansfield RS — SPY 대비 상대값이 126일 평균보다 몇 % 위인지')}${th('norm', '정규화', '0~100, 50이 SPY와 같은 흐름')}<th></th>${th('ret6m', '6개월')}${th('vs_spy', 'SPY 대비', '6개월 수익률 − SPY 6개월 수익률')}</tr></thead>
        <tbody>${rows.map(e => `<tr class="${(e.norm ?? 0) >= USE_STRONG ? 'ue-hot' : ''}">
          <td class="ue-n ue-rk">${rank[e.t]}</td>
          <td class="ue-name">${_ueCell(e.t)}</td>
          <td class="ue-grp">${escapeHtml(e.g)}</td>
          <td class="ue-n" style="color:${_ueColor(e.rs)}">${_ueSigned(e.rs)}</td>
          <td class="ue-n"><b>${_ueNum(e.norm, 1)}</b></td>
          <td class="ue-barcell">${e.norm == null ? '' : `<span class="ue-meter"><i style="width:${Math.max(0, Math.min(100, e.norm)).toFixed(1)}%;background:${e.norm >= USE_STRONG ? 'var(--up)' : e.norm >= 50 ? 'var(--text2)' : 'var(--down)'}"></i><u style="left:${USE_STRONG}%"></u></span>`}</td>
          <td class="ue-n" style="color:${_ueColor(e.ret6m)}">${_ueSigned(e.ret6m, 1, '%')}</td>
          <td class="ue-n" style="color:${_ueColor(e.vs_spy)}">${_ueSigned(e.vs_spy, 1, '%p')}</td></tr>`).join('')}</tbody>
      </table></div>
    </div>
    <div class="ue-foot">RS = (ETF ÷ SPY)가 그 126거래일 평균보다 몇 % 위에 있는지. 정규화 = 100 ÷ (1 + e^(−RS ÷ 12)) — 50이면 SPY와 같은 흐름, 70 이상이면 뚜렷하게 강함.
      6개월 = 126거래일 전 종가 대비. 야후 수정 종가 기준, 태린이아빠 '미국 ETF 소라티노 및 상대강도'와 같은 계산.</div>`;
  body.querySelector('#ue-strong').addEventListener('click', () => { USE.rsStrong = !USE.rsStrong; ueRender(); });
  body.querySelector('#ue-group').addEventListener('change', e => { USE.rsGroup = e.target.value; ueRender(); });
  body.querySelectorAll('[data-ue-sort]').forEach(h => {
    const go = () => { const k = h.dataset.ueSort; USE.rsSort = [k, USE.rsSort[0] === k ? -USE.rsSort[1] : -1]; ueRender(); };
    h.addEventListener('click', go);
    h.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); } });
  });
}

// ── ② 순위 변화 ─────────────────────────────────────────────────────────
function ueRenderRank(body, p) {
  const L = p.lists[USE.list] || p.lists.sor10;
  const meta = USE_LISTS.find(x => x[0] === USE.list) || USE_LISTS[4];
  const last = L.ranks[L.ranks.length - 1] || [], prev = L.ranks[L.ranks.length - 2] || [];
  if (!USE.pick || !last.includes(USE.pick)) USE.pick = last[0] || null;
  const days = t => L.ranks.filter(r => r.includes(t)).length;
  const move = t => { const i = prev.indexOf(t); if (i < 0) return '<span class="ue-new">새로</span>'; const d = i - last.indexOf(t); return d === 0 ? '<span class="ue-flat">–</span>' : `<span style="color:${_ueColor(d)}">${d > 0 ? '▲' : '▼'}${Math.abs(d)}</span>`; };
  const out = prev.filter(t => !last.includes(t));
  body.innerHTML = `
    <div class="ue-listsel">
      ${['모멘텀', '소르티노'].map(kind => `<div><span>${kind}${kind === '모멘텀' ? ' <small>6개월 수익률 ÷ 변동성</small>' : ' <small>내린 날의 흔들림만 벌점</small>'}</span>${USE_LISTS.filter(x => x[1] === kind).map(([k, , f]) =>
        `<button class="chip chip-sm${USE.list === k ? ' active' : ''}" data-ue-list="${k}">${f}</button>`).join('')}</div>`).join('')}
    </div>
    <div class="ue-rank-grid">
      <div class="card">
        <div class="card-header" style="flex-wrap:wrap;gap:6px">
          <span class="card-title">${meta[1]} 상위 20</span><span class="card-sub">${meta[2]} · ${_ueMD(L.dates[L.dates.length - 1])}</span>
        </div>
        <div class="ue-scroll"><table class="ue-tbl ue-pickable">
          <thead><tr><th>순위</th><th>ETF</th><th>점수</th><th title="하루 전 순위와 비교">전일 대비</th><th title="최근 10거래일 가운데 상위 20에 든 날">10일 중</th></tr></thead>
          <tbody>${last.map((t, i) => `<tr class="${t === USE.pick ? 'on' : ''}" data-ue-pick="${escAttr(t)}" tabindex="0" role="button">
            <td class="ue-n ue-rk">${i + 1}</td><td class="ue-name">${_ueCell(t)}</td>
            <td class="ue-n"><b>${_ueNum(L.scores?.[t])}</b></td><td class="ue-n">${move(t)}</td><td class="ue-n">${days(t)}일</td></tr>`).join('')}</tbody>
        </table></div>
        ${out.length ? `<div class="ue-out">전일 상위 20에서 빠짐: ${out.map(t => `<b title="${escAttr(_ueName(t))}">${escapeHtml(t)}</b>`).join(' ')}</div>` : ''}
      </div>
      <div class="card">
        <div class="card-header" style="flex-wrap:wrap;gap:6px">
          <span class="card-title">최근 ${L.dates.length}거래일 순위</span><span class="card-sub">왼쪽 표에서 고른 ETF를 따라 봅니다 · 칸을 눌러도 됩니다</span>
        </div>
        <div class="ue-scroll"><table class="ue-mat">
          <thead><tr><th></th>${L.dates.map((d, i) => `<th class="${i === L.dates.length - 1 ? 'last' : ''}">${_ueMD(d)}</th>`).join('')}</tr></thead>
          <tbody>${Array.from({ length: 20 }, (_, r) => `<tr><td class="ue-rk">${r + 1}</td>${L.ranks.map((row, c) => {
            const t = row[r];
            return t ? `<td class="${t === USE.pick ? 'on' : ''}${c === L.ranks.length - 1 ? ' last' : ''}" data-ue-pick="${escAttr(t)}" title="${escAttr(`${t} ${_ueName(t)}`)}">${escapeHtml(t)}</td>` : '<td class="none">·</td>';
          }).join('')}</tr>`).join('')}</tbody>
        </table></div>
      </div>
    </div>
    <div class="ue-foot">모멘텀 점수 = 126거래일 수익률 ÷ 같은 기간 일간 수익률의 표준편차. 소르티노 = 일간 수익률 평균 × 252 ÷ (내린 날 수익률의 표준편차 × √252).
      '○일선 이상'은 그날 종가가 그 이동평균선 위에 있는 ETF만 남긴 순위입니다. 점수는 최신일 값.</div>`;
  body.querySelectorAll('[data-ue-list]').forEach(b => b.addEventListener('click', () => { USE.list = b.dataset.ueList; ueRender(); }));
  body.querySelectorAll('[data-ue-pick]').forEach(el => {
    const go = () => { USE.pick = el.dataset.uePick; body.querySelectorAll('[data-ue-pick]').forEach(x => x.classList.toggle('on', x.dataset.uePick === USE.pick)); };
    el.addEventListener('click', go);
    el.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); } });
  });
}

// ── ③ 과열 점검 ─────────────────────────────────────────────────────────
function ueRenderHeat(body, p) {
  const H = p.heat || [];
  if (!H.length) { body.innerHTML = '<div class="ue-msg">과열 점검 대상이 없습니다.</div>'; return; }
  if (!USE.heatPick || !H.some(h => h.t === USE.heatPick)) USE.heatPick = H[0].t;
  const maxHeat = Math.max(120, ...H.map(h => Math.abs(h.heat ?? 0)));
  const over = H.filter(h => (h.heat ?? 0) >= 100);
  body.innerHTML = `
    <div class="ue-heat-grid">
      <div class="card">
        <div class="card-header" style="flex-wrap:wrap;gap:6px">
          <span class="card-title">과열 점검</span><span class="card-sub">소르티노(10일선 이상) 상위 20 · 줄을 누르면 그림</span>
        </div>
        <div class="ue-strong">${over.length ? `<span>97% 구간을 넘은 ETF</span>${over.map(h => `<b>${escapeHtml(h.t)} <i>${_ueNum(h.heat, 0)}</i></b>`).join('')}`
          : '<span>지금 97% 구간(최근 1년 상위 3% 이격)을 넘은 ETF는 없습니다.</span>'}</div>
        <div class="ue-scroll"><table class="ue-tbl ue-pickable">
          <thead><tr><th>순위</th><th>ETF</th><th title="(종가 ÷ 30일선 − 1) × 100">30일 이격도</th><th title="최근 247거래일 이격도의 97% 분위수">97% 구간</th><th colspan="2" title="현재 이격도 ÷ 97% 구간 × 100">위치</th></tr></thead>
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
      위치 = 현재 이격도 ÷ 97% 구간 × 100 — 100을 넘으면 지난 1년에서 드물게 벌어진 상태입니다. 강한 ETF를 쫓아 들어갈 때 과열 여부를 보는 용도입니다.</div>`;
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
  document.getElementById('ue-heat-title').textContent = `${h.t} · ${_ueName(h.t)}`;
  document.getElementById('ue-heat-sub').textContent = `이격도 ${_ueSigned(h.gap, 2, '%')} · 97% 구간 ${_ueNum(h.p97)}% · 위치 ${_ueNum(h.heat, 0)}`;
  const t = chartTheme(), css = getComputedStyle(document.documentElement);
  const up = css.getPropertyValue('--up').trim() || '#f5365c', dn = css.getPropertyValue('--down').trim() || '#4a9eff';
  const labels = p.heat_dates || [];
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
  const A = p.align || [];
  const full = A.filter(a => a.full), ma = A.filter(a => a.ma);
  const rows = (USE.alignMode === 'full' ? full : USE.alignMode === 'ma' ? ma : A).slice().sort((a, b) => USE.alignMode === 'ma'
    ? b.ma_days - a.ma_days || b.strength - a.strength
    : (b.full - a.full) || b.full_days - a.full_days || b.strength - a.strength);
  const yes = v => `<td class="ue-n ue-dot" style="color:${v ? 'var(--up)' : 'var(--text3)'}">${v ? '●' : '○'}</td>`;
  const since = (start, days) => days ? `${_ueMD(start)}부터 <b>${days}</b>거래일` : '<span style="color:var(--text3)">—</span>';
  body.innerHTML = `
    <div class="card">
      <div class="ue-kpis">
        <div><span>완전 정배열</span><b>${full.length}</b><small>종가 &gt; 20 &gt; 65 &gt; 130 &gt; 260일선</small></div>
        <div><span>이평 정배열</span><b>${ma.length}</b><small>20 &gt; 65 &gt; 130 &gt; 260일선</small></div>
        <div><span>분석한 ETF</span><b>${A.length}</b><small>260일선을 계산할 수 있는 것</small></div>
      </div>
      <div class="card-header" style="flex-wrap:wrap;gap:6px;border-top:1px solid var(--border)">
        <span class="card-title">이동평균 정배열</span><span class="card-sub">4 · 13 · 26 · 52주선 = 20 · 65 · 130 · 260거래일</span>
        <div class="ue-filters">${[['full', `완전 ${full.length}`], ['ma', `이평 ${ma.length}`], ['all', `전체 ${A.length}`]].map(([k, n]) =>
          `<button class="chip chip-sm${USE.alignMode === k ? ' active' : ''}" data-ue-align="${k}">${n}</button>`).join('')}</div>
      </div>
      <div class="ue-scroll"><table class="ue-tbl">
        <thead><tr><th>ETF ${rows.length}</th><th>묶음</th><th>완전 정배열</th><th>이평 정배열</th><th title="종가가 20일선 위인지">종가&gt;20</th><th title="네 간격(%)의 합 — 선들이 얼마나 벌어져 있는지">강도</th><th title="종가÷20일선 · 20÷65 · 65÷130 · 130÷260 간격(%)">간격</th></tr></thead>
        <tbody>${rows.length ? rows.map(a => `<tr class="${a.full ? 'ue-hot' : ''}">
          <td class="ue-name">${_ueCell(a.t)}</td><td class="ue-grp">${escapeHtml(_ueEtf(a.t)?.g || '')}</td>
          <td class="ue-n">${since(a.full_start, a.full_days)}</td><td class="ue-n">${since(a.ma_start, a.ma_days)}</td>
          ${yes(a.above4w)}
          <td class="ue-n" style="color:${_ueColor(a.strength)}"><b>${_ueSigned(a.strength)}</b></td>
          <td class="ue-n ue-gaps">${a.gaps.map(g => `<i style="color:${_ueColor(g)}">${_ueSigned(g, 1)}</i>`).join(' ')}</td></tr>`).join('')
          : '<tr><td colspan="7" class="ue-msg">해당하는 ETF가 없습니다.</td></tr>'}</tbody>
      </table></div>
    </div>
    <div class="ue-foot">완전 정배열 = 종가가 20일선 위에 있고 20 &gt; 65 &gt; 130 &gt; 260일선 순서. 이평 정배열 = 선끼리만 그 순서(종가는 20일선 아래일 수 있음).
      '○○부터 n거래일' = 그 상태가 끊기지 않고 이어진 기간. 강도 = 종가÷20일선, 20÷65, 65÷130, 130÷260 간격(%)을 더한 값.</div>`;
  body.querySelectorAll('[data-ue-align]').forEach(b => b.addEventListener('click', () => { USE.alignMode = b.dataset.ueAlign; ueRender(); }));
}
