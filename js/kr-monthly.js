// kr-monthly.js — STRATEGY '국내 월 리밸런싱' 페이지 (11-18)
// [원본] 태린이아빠 Market Dashboard '국내시장 월단위 리밸런싱 투자전략' V2.3(공개 소스 app.py KR_MONTHLY_REBALANCE_SRC)
//   매달 마지막 거래일 종가로 업종 26개의 120일선 위 비율(Breadth)을 보고 네 구간으로 나눠 다음 달 비중을 정한다.
//   추세(≥60%) 적격 업종 RS 상위 3 · 100% / 비추세(40~60%) 상위 3 평균 RS로 25~100%(약세면 −75%p) /
//   회복(30~40%) 과거 리더 눌림 최대 3개 · 50% / 역추세(<30%) 코스피 낙폭 단계 50~100%, F&G 과매도 반등이면 한 단계 더.
// [원본과 다른 점] 원본은 계산 결과를 글(콘솔 출력) · 표 · 그림 4장으로 보인다. 여기는 확정 · 예상 포지션을 카드로,
//   Breadth 구간을 띠로 보이고, 원본 화면에 없는 '지금 업종 현황'(26개 업종의 120일선 · RS · 적격 여부)을 더했다.
//   자료는 원본 엑셀과 같은 WICS 업종지수 26개(wiseindex) — 원본 사이트 최신판은 업종 ETF 26개라 업종 이름 · 수익률이 다르다.
//   계산은 백엔드 collect_kr_monthly.py — 코스피로 정해지는 값(F&G · 낙폭 · 200일선 · 6개월 모멘텀 · F&G 확대 발동일)은 원본 화면과 일치.
// 데이터: market_snapshot(kind = 'kr_monthly', payload)
// 의존: config.js (sb, escapeHtml, escAttr, chartTheme, SERIES_PAL), Chart.js, us-52w.js의 u5-* 꾸밈(카드 · 표 · 그림 틀)

const KM = {
  p: null,
  charts: [],
};

// 원본 Mode → 화면 이름 · 설명
const KM_MODE = {
  TREND:                               ['추세', 'up', 'Breadth 60% 이상 — 적격 업종 RS 상위 3에 100%'],
  NON_TREND:                           ['비추세', '', 'Breadth 40~60% — 상위 3 평균 RS에 따라 25~100%'],
  NON_TREND_V22_NEUTRAL_NON_TREND:     ['비추세', '', 'Breadth 40~60% — 상위 3 평균 RS에 따라 25~100%'],
  NON_TREND_V22_WEAK_NON_TREND:        ['비추세 · 약세 보정', 'down', '코스피 200일선 아래 · 6개월 −5% 아래 · 낙폭 −15% 이하라 −75%p'],
  RECOVERY_LEADER_PULLBACK:            ['회복 · 눌림 매수', '', 'Breadth 30~40% — 최근 6개월 리더 중 20일 고점 대비 −15~−5% 눌린 업종에 50%'],
  RECOVERY_CASH:                       ['회복 · 현금', '', 'Breadth 30~40%인데 눌림 조건을 맞춘 과거 리더가 없음'],
  CONTRARIAN_KOSPI:                    ['역추세 · 코스피', 'down', 'Breadth 30% 미만 — 코스피 252일 낙폭 단계만큼 코스피'],
  CONTRARIAN_KOSPI_FG_BOOST:           ['역추세 · 코스피(확대)', 'down', 'Breadth 30% 미만 — 낙폭 단계 + F&G 과매도 반등으로 한 단계 확대'],
  CASH:                                ['현금', '', '투자할 조건이 없음(역추세인데 코스피 낙폭이 −12%보다 얕음 등)'],
};
const KM_SERIES = [['v23', 'V2.3 (최종)', 1, 2.4], ['v21', 'V2.1', 4, 1.3], ['v2', 'V2', 0, 1.1], ['kospi', '코스피', -1, 1.5]];

function pKrMonthly() {
  return `
  <div class="u5-head">
    <div class="u5-lede">업종 26개 가운데 <b>120일선 위에 있는 업종 비율(Breadth)</b>로 시장을 추세 · 비추세 · 회복 · 역추세로 나누고,
      <b>매달 말 한 번</b> 다음 달 투자 대상과 비중을 정하는 규칙입니다. 이번 달 확정 포지션과, 오늘이 월말이라면 바뀔 다음 달 예상을 봅니다.</div>
    <div id="km-asof" class="u5-asof"></div>
  </div>
  <div id="km-body"><div class="u5-msg">불러오는 중...</div></div>`;
}

async function loadKrMonthly() {
  const body = document.getElementById('km-body');
  if (!body) return;
  try {
    const { data, error } = await sb.from('market_snapshot').select('base_date,payload')
      .eq('kind', 'kr_monthly').order('base_date', { ascending: false }).limit(1);
    if (error) throw error;
    if (!document.getElementById('km-body')) return;
    KM.p = data?.[0]?.payload || null;
    if (!KM.p) { body.innerHTML = '<div class="u5-msg">아직 계산된 날이 없습니다 — 매일 저녁 · 아침에 채워집니다.</div>'; return; }
    kmRender();
  } catch (e) {
    const missing = /42P01|PGRST205|does not exist|Could not find/.test(`${e?.code} ${e?.message}`);
    if (!missing) console.warn('[국내 월 리밸런싱]', e);
    body.innerHTML = `<div class="u5-msg">${missing ? '준비 중 — 데이터 테이블이 아직 없습니다.'
      : '불러오지 못했습니다 — ' + escapeHtml(e.message || '조회 실패')}</div>`;
  }
}

function unloadKrMonthly() {
  KM.charts.forEach(c => c.destroy());
  KM.charts = [];
}

const _kmPct = (v, d = 1) => v == null ? '—' : (v * 100).toFixed(d) + '%';
const _kmSignedPct = (v, d = 1, unit = '%') => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v * 100).toFixed(d) + unit;
const _kmNum = (v, d = 2) => v == null ? '—' : (+v).toFixed(d);
const _kmColor = v => v == null ? 'var(--text2)' : v > 0 ? 'var(--up)' : v < 0 ? 'var(--down)' : 'var(--text1)';
const _kmMD = d => d ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : '—';
const _kmYM = d => d ? `${d.slice(0, 4)}년 ${+d.slice(5, 7)}월` : '—';
const _kmNextYM = d => { if (!d) return '—'; let y = +d.slice(0, 4), m = +d.slice(5, 7) + 1; if (m > 12) { m = 1; y++; } return `${y}년 ${m}월`; };
const _kmMode = m => KM_MODE[m] || [m || '—', '', ''];
const _kmHold = s => (s.hold || []).length ? s.hold.map(h => `<b class="km-chip${h === 'KOSPI' ? ' kospi' : ''}">${h === 'KOSPI' ? '코스피' : escapeHtml(h)}</b>`).join('') : '<em>없음 — 현금</em>';
const _kmList = a => (a || []).length ? a.map(escapeHtml).join(' · ') : '—';

// Breadth 띠 — 0 ~ 100%에 구간(30 · 40 · 60)과 확정 · 예상 값을 표시
function _kmBand(conf, prev) {
  const mark = (v, cls, label) => {
    if (v == null) return '';
    const pos = Math.max(0, Math.min(100, v * 100));
    return `<span class="km-mark ${cls}${pos < 8 ? ' l' : pos > 92 ? ' r' : ''}" style="left:${pos.toFixed(1)}%" title="${escAttr(label)} ${_kmPct(v)}"><i></i><em>${label} ${_kmPct(v, 0)}</em></span>`;
  };
  return `<div class="km-band" role="img" aria-label="Breadth 확정 ${_kmPct(conf)} · 예상 ${_kmPct(prev)}">
    <div class="km-band-bar"><span class="z0" style="width:30%">역추세 &lt;30</span><span class="z1" style="width:10%">회복</span><span class="z2" style="width:20%">비추세 40~60</span><span class="z3" style="width:40%">추세 ≥60</span></div>
    ${mark(conf, 'conf', '확정')}${mark(prev, 'prev', '예상')}
  </div>`;
}

function _kmCard(s, title, sub, isPreview) {
  const [name, cls, desc] = _kmMode(s.mode);
  const contrarian = (s.mode || '').startsWith('CONTRARIAN');
  const nonTrend = (s.mode || '').startsWith('NON_TREND');
  const rows = [
    ['Breadth', _kmPct(s.breadth), '업종 26개 가운데 120일선 위 비율'],
    ['코스피 252일 고점 대비', `<span style="color:${_kmColor(s.dd)}">${_kmSignedPct(s.dd)}</span>`, '−12 · −18 · −24% 이하면 역추세 비중 50 · 75 · 100%'],
    ['F&G', `${_kmNum(s.fg, 1)} <small>히스토그램 <i style="color:${_kmColor(s.hist)}">${s.hist == null ? '—' : (s.hist > 0 ? '+' : '') + _kmNum(s.hist, 3)}</i></small>`, '코스피 가격 기반 — 30 이하 과매도'],
  ];
  if (contrarian) rows.push(['과매도 확대 신호', s.boost ? '<b class="km-on">켜짐</b>' : '<span class="km-off">꺼짐</span>', 'F&G ≤ 30 ∧ 히스토그램 > 0 ∧ 직전 월말보다 큼']);
  if (contrarian) rows.push(['낙폭 기준 비중', _kmPct(s.base, 0), '확대 전 코스피 비중']);
  if (nonTrend) rows.push(['상위 3 평균 RS', `<span style="color:${_kmColor(s.top3_rs)}">${_kmSignedPct(s.top3_rs)}</span>`, '<5 · 5~12 · 12~22 · ≥22% → 25 · 50 · 75 · 100%'],
    ['기본 비중', _kmPct(s.nt_base, 0), s.nt_regime === 'WEAK_NON_TREND' ? '약세 보정 −75%p 적용' : '약세 보정 없음']);
  rows.push(['코스피 6개월', `<span style="color:${_kmColor(s.mom6)}">${_kmSignedPct(s.mom6)}</span>`, `200일선 ${s.ma200 == null ? '—' : s.ma200.toLocaleString(undefined, { maximumFractionDigits: 0 })}`]);
  return `<div class="card km-pos${isPreview ? ' preview' : ''}">
    <div class="km-pos-h"><span class="km-pos-t">${title}</span><span class="km-pos-s">${sub}</span></div>
    <div class="km-pos-main">
      <div class="u5-status ${cls}">${escapeHtml(name)}</div>
      <div class="km-exp"><b>${_kmPct(s.exp, 0)}</b><span>투자 · 현금 ${_kmPct(s.cash, 0)}</span></div>
    </div>
    <div class="km-desc">${escapeHtml(desc)}</div>
    <div class="km-hold"><span>투자 대상</span>${_kmHold(s)}</div>
    <div class="km-kv">${rows.map(([k, v, t]) => `<div title="${escAttr(t)}"><span>${k}</span><b>${v}</b></div>`).join('')}</div>
    <div class="km-top"><span>적격 RS 상위 5</span>${(s.top5 || []).length ? s.top5.map((n, i) => `<b class="${(s.top3 || []).includes(n) ? 'on' : ''}">${i + 1}. ${escapeHtml(n)} <i>${_kmSignedPct(s.top5_rs?.[i], 1)}</i></b>`).join('') : '<em>적격 업종 없음(120일선 위 ∧ 코스피보다 강한 업종이 없음)</em>'}</div>
    ${(s.rec || []).length ? `<div class="km-top"><span>회복 후보</span>${s.rec.map(n => `<b class="on">${escapeHtml(n)}</b>`).join('')}</div>` : ''}
  </div>`;
}

// 원본 '현재 포지션 → 다음달 예상 포지션 해석'을 같은 순서로
function _kmComments(c, v) {
  const h1 = (c.hold || []).join(', ') || '-', h2 = (v.hold || []).join(', ') || '-';
  const label = h => h === 'KOSPI' ? '코스피' : h;
  const out = [];
  out.push(h1 === h2 ? `투자 대상은 지금(${escapeHtml(h1.split(', ').map(label).join(', '))})과 다음 달 예상이 같습니다.`
    : `투자 대상이 <b>${escapeHtml(h1.split(', ').map(label).join(', '))}</b>에서 <b>${escapeHtml(h2.split(', ').map(label).join(', '))}</b>(으)로 바뀌는 신호입니다.`);
  const de = (v.exp ?? 0) - (c.exp ?? 0);
  out.push(Math.abs(de) < 1e-9 ? `투자비중은 ${_kmPct(v.exp, 0)}로 지금과 같습니다.` : `예상 투자비중은 ${_kmPct(c.exp, 0)}에서 <b>${_kmPct(v.exp, 0)}</b>로 ${de > 0 ? '늘어납니다' : '줄어듭니다'}.`);
  const db = (v.breadth ?? 0) - (c.breadth ?? 0);
  out.push(Math.abs(db) < 1e-9 ? `Breadth는 ${_kmPct(v.breadth)}로 그대로입니다.` : `Breadth는 ${_kmPct(c.breadth)}에서 ${_kmPct(v.breadth)}로 ${db > 0 ? '개선되고' : '약해지고'} 있습니다.`);
  const dd = (v.dd ?? 0) - (c.dd ?? 0);
  if (Math.abs(dd) > 1e-9) out.push(`코스피 252일 고점 대비 낙폭은 ${dd > 0 ? '줄어드는' : '커지는'} 방향입니다(${_kmSignedPct(c.dd)} → ${_kmSignedPct(v.dd)}).`);
  out.push(v.boost ? '다음 달 예상 신호에서 F&G 과매도 반등 확대 조건이 <b>켜졌습니다</b>.' : '다음 달 예상 신호에서 F&G 과매도 반등 확대 조건은 꺼져 있습니다.');
  return out;
}

function kmRender() {
  const p = KM.p, body = document.getElementById('km-body');
  if (!body || !p) return;
  unloadKrMonthly();
  const asof = document.getElementById('km-asof');
  if (asof) asof.innerHTML = `<b>${escapeHtml(p.asof)} 종가 기준</b> · 업종 ${p.n} · ${escapeHtml(p.start)}부터`;
  const c = p.confirmed, v = p.preview;
  const pf = p.perf || {}, yr = p.yearly || {};
  const nowRows = p.now || [];
  const above = nowRows.filter(r => (r.ma_gap ?? -1) > 0).length;

  body.innerHTML = `
    <div class="km-top2">
      ${_kmCard(c, `${_kmYM(c.ed || c.sd)} 실제 운용 · 확정`, `${_kmMD(c.sd)} 월말 신호 → ${_kmMD(c.ed)}부터 적용`, false)}
      ${_kmCard(v, `${_kmNextYM(v.sd)} 예상 · 임시`, `${_kmMD(v.sd)}을 월말로 친 신호 — 월말까지 바뀔 수 있음`, true)}
    </div>
    <div class="card km-read">
      <div class="card-header" style="flex-wrap:wrap;gap:6px"><span class="card-title">지금 → 다음 달</span><span class="card-sub">원본의 '현재 포지션 → 다음달 예상 포지션 해석'</span></div>
      ${_kmBand(c.breadth, v.breadth)}
      <ol class="km-cmt">${_kmComments(c, v).map(t => `<li>${t}</li>`).join('')}</ol>
    </div>

    <div class="card u5-perf-card">
      <div class="card-header" style="flex-wrap:wrap;gap:6px">
        <span class="card-title">지금 업종 현황</span>
        <span class="card-sub">${_kmMD(p.asof)} · 120일선 위 ${above}/${nowRows.length} · 적격 = 120일선 위 ∧ 6개월 코스피 대비 RS > 0 (원본 화면엔 없는 표)</span>
      </div>
      <div class="u5-scroll"><table class="u5-tbl km-now">
        <thead><tr><th>순위</th><th>업종</th><th title="종가 ÷ 120일선 − 1">120일선 대비</th><th title="(업종 ÷ 코스피)가 126거래일 전보다 몇 % 올랐나">6개월 RS</th><th title="최근 20거래일 최고 대비">20일 고점 대비</th><th>1개월</th><th>상태</th></tr></thead>
        <tbody>${nowRows.map(r => `<tr class="${r.elig ? 'u5-held' : ''}">
          <td class="u5-n u5-rk">${r.rank ?? ''}</td><td class="u5-name"><b>${escapeHtml(r.n)}</b><small>${escapeHtml(r.code || '')}</small></td>
          <td class="u5-n" style="color:${_kmColor(r.ma_gap)}">${_kmSignedPct(r.ma_gap)}</td>
          <td class="u5-n" style="color:${_kmColor(r.rs)}">${_kmSignedPct(r.rs)}</td>
          <td class="u5-n" style="color:${_kmColor(r.dd20)}">${_kmSignedPct(r.dd20)}</td>
          <td class="u5-n" style="color:${_kmColor(r.r1m)}">${_kmSignedPct(r.r1m)}</td>
          <td>${r.elig ? '<span class="u5-tag u5-o-52">적격</span>' : (r.ma_gap ?? -1) <= 0 ? '<span class="u5-tag">120일선 아래</span>' : '<span class="u5-tag">코스피보다 약함</span>'}</td></tr>`).join('')}</tbody>
      </table></div>
    </div>

    <div class="card u5-perf-card">
      <div class="card-header" style="flex-wrap:wrap;gap:6px">
        <span class="card-title">백테스트</span><span class="card-sub">${_kmMD(p.graph_start)} ${p.graph_start?.slice(0, 4)} 운용 시작 = 1 · 로그 눈금 · 월말 신호 → 다음 거래일 적용 · 거래비용 0.1%</span>
      </div>
      <div class="u5-chart u5-chart-lg"><canvas id="km-c-eq" role="img" aria-label="V2.3 · V2.1 · V2 · 코스피 누적 성과"></canvas></div>
      <div class="u5-legend">${KM_SERIES.map(([k, n, ci]) => `<span><i style="background:${ci < 0 ? 'var(--text2)' : SERIES_PAL[ci]}"></i>${n}</span>`).join('')}</div>
      <div class="u5-chart"><canvas id="km-c-dd" role="img" aria-label="고점 대비 낙폭"></canvas></div>
      <div class="u5-legend"><span>고점 대비 낙폭(%) — 같은 색</span></div>
      <div class="u5-perf">
        <table class="u5-tbl">
          <thead><tr><th>전략</th><th title="운용 시작부터">연수익</th><th>최대 낙폭</th><th>Sharpe</th><th>Sortino</th><th title="월 단위로 오른 달 비율">월 승률</th><th title="1년 동안 사고판 비중의 합">회전율</th><th>배수</th></tr></thead>
          <tbody>${KM_SERIES.map(([k, n]) => { const s = pf[k] || {}; return `<tr class="${k === 'v23' ? 'u5-hl' : ''}">
            <td class="u5-name"><b>${n}</b></td><td class="u5-n" style="color:${_kmColor(s.live_cagr)}">${_kmSignedPct(s.live_cagr, 2)}</td>
            <td class="u5-n" style="color:var(--down)">${_kmPct(s.mdd, 2)}</td><td class="u5-n">${_kmNum(s.sharpe)}</td><td class="u5-n">${_kmNum(s.sortino)}</td>
            <td class="u5-n">${_kmPct(s.win, 1)}</td><td class="u5-n">${k === 'kospi' ? '—' : _kmNum(s.turnover, 1) + '배'}</td><td class="u5-n"><b>${_kmNum(s.mult, 2)}x</b></td></tr>`; }).join('')}</tbody>
        </table>
        <div class="u5-side">
          <table class="u5-tbl">
            <thead><tr><th>연도</th>${KM_SERIES.map(([, n]) => `<th>${n.replace(' (최종)', '')}</th>`).join('')}</tr></thead>
            <tbody>${(yr.years || []).map((y, i) => `<tr><td>${y}${i === 0 ? '<small> (일부)</small>' : i === yr.years.length - 1 ? '<small> (연중)</small>' : ''}</td>${KM_SERIES.map(([k]) => `<td class="u5-n" style="color:${_kmColor(yr[k]?.[i])}">${_kmSignedPct(yr[k]?.[i], 1)}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>
          <div class="u5-note">V2 = 기본 규칙, V2.1 = 역추세에서 F&G 과매도 반등 시 한 단계 확대, V2.3 = V2.1 + 비추세 약세 보정(최종).
            연수익은 처음 투자한 달(${escapeHtml(pf.v23?.live_start || '')})부터, 코스피는 ${escapeHtml(p.start)}부터. 표본 안의 결과입니다.</div>
        </div>
      </div>
    </div>

    <div class="card u5-perf-card">
      <div class="card-header" style="flex-wrap:wrap;gap:6px"><span class="card-title">코스피 가격 기반 F&G</span><span class="card-sub">기준선 30 이하 과매도 · ▲ = 역추세에서 비중을 한 단계 늘린 월말(V2.1)</span></div>
      <div class="u5-chart u5-chart-lg"><canvas id="km-c-fg" role="img" aria-label="코스피 가격 기반 F&G와 확대 발동"></canvas></div>
      <div class="u5-chart"><canvas id="km-c-hist" role="img" aria-label="F&G 오실레이터 히스토그램"></canvas></div>
      <div class="u5-legend"><span><i style="background:${SERIES_PAL[1]}"></i>F&G</span><span><i style="height:0;border-top:1px dashed var(--warn)"></i>과매도 30</span><span><i style="background:var(--up);height:8px"></i>히스토그램 (오실레이터 − 시그널)</span></div>
    </div>

    <div class="u5-grid">
      <div class="card">
        <div class="card-header" style="flex-wrap:wrap;gap:6px"><span class="card-title">최근 ${p.signals?.length || 0}개 월말 신호</span><span class="card-sub">V2.3 · 맨 아래 줄은 오늘을 월말로 친 예상</span></div>
        <div class="u5-scroll"><table class="u5-tbl">
          <thead><tr><th>신호일</th><th style="text-align:left">구간</th><th>Breadth</th><th>코스피 낙폭</th><th>F&G</th><th>비중</th><th style="text-align:left">투자 대상</th></tr></thead>
          <tbody>${[...(p.signals || [])].reverse().map(s => { const [n, cls] = _kmMode(s.mode); return `<tr${s.ed ? '' : ' class="u5-hl"'}>
            <td class="u5-n u5-rk">${escapeHtml(s.sd.slice(2).replace(/-/g, '.'))}${s.ed ? '' : '<small>예상</small>'}</td>
            <td><span class="km-mode ${cls}">${escapeHtml(n)}</span></td>
            <td class="u5-n">${_kmPct(s.breadth)}</td><td class="u5-n" style="color:${_kmColor(s.dd)}">${_kmSignedPct(s.dd)}</td>
            <td class="u5-n">${_kmNum(s.fg, 1)}${s.boost ? ' <b style="color:var(--warn)" title="과매도 확대 발동">▲</b>' : ''}</td><td class="u5-n"><b>${_kmPct(s.exp, 0)}</b></td>
            <td class="u5-why">${escapeHtml((s.hold || []).map(h => h === 'KOSPI' ? '코스피' : h).join(', ') || '현금')}</td></tr>`; }).join('')}</tbody>
        </table></div>
      </div>
      <div class="card">
        <div class="card-header" style="flex-wrap:wrap;gap:6px"><span class="card-title">F&G 과매도 확대 발동</span><span class="card-sub">V2.1 · Breadth 30% 미만 역추세에서 한 단계 늘린 월말</span></div>
        <div class="u5-scroll"><table class="u5-tbl">
          <thead><tr><th>신호일</th><th>Breadth</th><th>코스피 낙폭</th><th>F&G</th><th title="이번 월말 / 직전 월말">히스토그램</th><th>비중</th></tr></thead>
          <tbody>${(p.boost || []).length ? [...p.boost].reverse().map(b => `<tr>
            <td class="u5-n u5-rk">${escapeHtml(b.sd.slice(2).replace(/-/g, '.'))}</td><td class="u5-n">${_kmPct(b.breadth)}</td>
            <td class="u5-n" style="color:${_kmColor(b.dd)}">${_kmSignedPct(b.dd)}</td><td class="u5-n">${_kmNum(b.fg, 1)}</td>
            <td class="u5-n">${_kmNum(b.hist, 2)} <small>/ ${_kmNum(b.prev_hist, 2)}</small></td>
            <td class="u5-n">${_kmPct(b.base, 0)} → <b>${_kmPct(b.exp, 0)}</b></td></tr>`).join('') : '<tr><td colspan="6" class="u5-msg">발동한 적이 없습니다.</td></tr>'}</tbody>
        </table></div>
      </div>
    </div>

    <div class="u5-foot">
      <b>구간</b> — 월말 Breadth(120일선 위 업종 비율)가 60% 이상 추세: 적격 업종(종가 > 120일선 ∧ 6개월 코스피 대비 상대모멘텀 > 0) RS 상위 3을 같은 비중으로 100%, 이미 든 업종은 5위까지 남김.
      40~60% 비추세: 같은 방식으로 고르되 상위 3 평균 RS가 5 · 12 · 22% 미만/이상에 따라 25 · 50 · 75 · 100%, 코스피가 200일선 아래 ∧ 6개월 −5% 아래 ∧ 252일 고점 대비 −15% 이하면 −75%p.
      30~40% 회복: 직전 6개 월말 상위 3에 들었던 업종 중 지금도 적격이고 20일 고점 대비 −15~−5%인 것 최대 3개에 50%. 30% 미만 역추세: 코스피 252일 고점 대비 −12 · −18 · −24% 이하이면 코스피 50 · 75 · 100%,
      F&G ≤ 30 ∧ 히스토그램 > 0 ∧ 직전 월말보다 크면 한 단계 더.<br>
      <b>F&G</b> — RSI14 25% + 125일 수익률 25% + 20일선 이격 20% + 252일 고점 대비 15% + 20일 변동성(거꾸로) 15%, 각각 직전 252거래일 안 백분위. 오실레이터 = 5일 EMA − 20일 EMA, 히스토그램 = 오실레이터 − 그 5일 EMA.
      ※ 시황 '피어앤그리드'(VKOSPI · 금리 · 풋콜 등)와는 다른 지표입니다.<br>
      <b>자료</b> — WICS 업종지수 26개(wiseindex) · 코스피 종가, ${escapeHtml(p.start)}부터. 원본 엑셀(DataGuide 업종지수)과 같은 지수이고, 코스피로 정해지는 값(F&G · 낙폭 · 200일선 · 6개월 · 확대 발동일)은 원본 화면과 같습니다.
      원본 사이트의 최신판은 업종지수 대신 업종 ETF 26개 종가를 써서 업종 이름 · Breadth · 수익률이 이 화면과 다릅니다. 태린이아빠 '국내시장 월단위 리밸런싱 투자전략' V2.3과 같은 계산.
    </div>`;
  kmDrawCharts();
}

function kmDrawCharts() {
  const p = KM.p, c = p?.curve, f = p?.fg;
  unloadKrMonthly();
  if (!c?.dates?.length) return;
  const t = chartTheme(), css = getComputedStyle(document.documentElement);
  const gray = css.getPropertyValue('--text2').trim() || '#b3b8cd';
  const color = ci => ci < 0 ? gray : SERIES_PAL[ci];
  const labels = c.dates;
  const xAxis = { ticks: { color: t.tick, font: { size: 10 }, maxTicksLimit: 9, maxRotation: 0, callback: function (v) { return this.getLabelForValue(v).slice(2, 7).replace('-', '.'); } }, grid: { color: t.grid } };
  const base = { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false } };
  const line = (label, data, col, w, extra = {}) => ({ type: 'line', label, data, borderColor: col, backgroundColor: col, borderWidth: w, pointRadius: 0, pointHoverRadius: 3, tension: 0, spanGaps: true, fill: false, ...extra });
  const mk = (id, cfg) => { const cv = document.getElementById(id); if (cv) KM.charts.push(new Chart(cv.getContext('2d'), cfg)); };

  // ① 누적 성과(로그)
  mk('km-c-eq', {
    type: 'line',
    data: { labels, datasets: KM_SERIES.map(([k, n, ci, w]) => line(n, c[k], color(ci), w)) },
    options: { ...base,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ctx.parsed.y == null ? null : `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)}배` } } },
      scales: { x: xAxis, y: { type: 'logarithmic', ticks: { color: t.tick, font: { size: 10 }, callback: v => { const r = +(+v).toPrecision(2); return [0.5, 0.7, 1, 1.5, 2, 3, 5, 7, 10, 15, 20, 30, 50].includes(r) ? r + '배' : ''; } }, grid: { color: t.grid } } } },
  });
  // ② 고점 대비 낙폭
  const dd = a => { let m = -Infinity; return (a || []).map(v => { if (v == null) return null; m = Math.max(m, v); return (v / m - 1) * 100; }); };
  mk('km-c-dd', {
    type: 'line',
    data: { labels, datasets: KM_SERIES.map(([k, n, ci]) => line(n, dd(c[k]), color(ci), k === 'v23' ? 1.6 : 1, k === 'v23' ? { fill: 'origin', backgroundColor: SERIES_PAL[1] + '22' } : {})) },
    options: { ...base,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ctx.parsed.y == null ? null : `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%` } } },
      scales: { x: xAxis, y: { max: 0, ticks: { color: t.tick, font: { size: 10 }, maxTicksLimit: 5, callback: v => v + '%' }, grid: { color: t.grid } } } },
  });
  if (!f?.v?.length) return;
  // ③ F&G + 확대 발동 ▲
  const boostDays = new Set((p.boost || []).map(b => b.sd));
  const warn = css.getPropertyValue('--warn').trim() || '#f0a500';
  mk('km-c-fg', {
    type: 'line',
    data: { labels, datasets: [
      line('F&G', f.v, SERIES_PAL[1], 1.3),
      line('_30', labels.map(() => 30), warn, 1, { borderDash: [5, 4], pointHoverRadius: 0 }),
      { type: 'line', label: '확대 발동', data: labels.map((d, i) => boostDays.has(d) ? f.v[i] : null), showLine: false, pointStyle: 'triangle',
        pointRadius: 7, pointHoverRadius: 8, borderColor: warn, backgroundColor: warn },
    ] },
    options: { ...base,
      plugins: { legend: { display: false }, tooltip: { filter: it => !String(it.dataset.label).startsWith('_') && it.parsed.y != null,
        callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}` } } },
      scales: { x: xAxis, y: { min: 0, max: 100, ticks: { color: t.tick, font: { size: 10 }, stepSize: 20 }, grid: { color: t.grid } } } },
  });
  // ④ 히스토그램
  const up = css.getPropertyValue('--up').trim() || '#f5365c', dn = css.getPropertyValue('--down').trim() || '#4a9eff';
  mk('km-c-hist', {
    type: 'bar',
    data: { labels, datasets: [{ label: '히스토그램', data: f.hist, backgroundColor: f.hist.map(v => (v ?? 0) >= 0 ? up + '99' : dn + '99'), borderWidth: 0, barPercentage: 1, categoryPercentage: 1 }] },
    options: { ...base,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `히스토그램: ${ctx.parsed.y.toFixed(3)}` } } },
      scales: { x: xAxis, y: { ticks: { color: t.tick, font: { size: 10 }, maxTicksLimit: 5 }, grid: { color: ctx => ctx.tick.value === 0 ? 'rgba(168,173,196,.5)' : t.grid } } } },
  });
}
