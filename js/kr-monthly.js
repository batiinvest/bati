// kr-monthly.js — STRATEGY '국내 월 리밸런싱' 페이지 (11-18, 11-23 V2.6)
// [원본] 태린이아빠 Market Dashboard '한국 월단위 리밸런싱 투자전략' V2.6(공개 소스 app.py KR_MONTHLY_REBALANCE_SRC, v11.59)
//   매달 마지막 거래일 종가로 업종 26개의 120일선 위 비율(Breadth)을 보고 네 구간으로 나눠 다음 달 비중을 정한다.
//   업종 순위 = 6개월 RS + 0.10 × 최근 26주 주간 상위 30% 횟수 ÷ 26(V2.4).
//   추세(≥60%) 순위 상위 3 · 100%(60~75%는 3개월 RS 순, V2.6) / 비추세(40~60%) 상위 3 평균 RS로 25~100%(약세면 −75%p) /
//   회복(30~40%) 과거 리더 눌림 최대 3개 · 50% / 역추세(<30%) 코스피 낙폭 단계 50~100%, F&G 과매도 반등이면 한 단계 더,
//   낙폭 ≤ −24% ∧ 60일 변동성 ≥ 3년 중앙값 × 2면 절반(V2.5).
// [원본과 다른 점] 원본은 계산 결과를 글(콘솔 출력) · 표 · 그림 3장으로 보인다. 여기는 확정 · 예상 포지션을 카드로,
//   Breadth 구간을 띠로 보이고, 원본 화면에 없는 '지금 업종 현황'(26개 업종의 120일선 · RS · 주간 가점 · 적격 여부)을 더했다.
//   자료는 원본 엑셀과 같은 WICS 업종지수 26개(wiseindex) — 원본 사이트 최신판은 업종 ETF 26개라 업종 이름 · 수익률이 다르다.
//   계산은 백엔드 collect_kr_monthly.py — 코스피로 정해지는 값(F&G · 낙폭 · 200일선 · 6개월 모멘텀 · 60일 변동성 · 확대 발동일)은
//   원본 화면과 일치(11-23). payload.version이 없으면 11-22 이전 V2.3 자료 — 옛 모양 그대로 그린다(봇 재시작 전 과도기).
// 데이터: market_snapshot(kind = 'kr_monthly', payload)
// 의존: config.js (sb, escapeHtml, escAttr, chartTheme, SERIES_PAL), Chart.js, us-52w.js의 u5-* 꾸밈(카드 · 표 · 그림 틀)

const KM = {
  p: null,
  charts: [],
};

// 원본 Mode → 화면 이름 · 설명
const KM_MODE = {
  TREND:                               ['추세', 'up', 'Breadth 60% 이상 — 적격 업종 순위 상위 3에 100%(60~75%는 3개월 RS 순)'],
  NON_TREND:                           ['비추세', '', 'Breadth 40~60% — 상위 3 평균 RS에 따라 25~100%'],
  NON_TREND_V22_NEUTRAL_NON_TREND:     ['비추세', '', 'Breadth 40~60% — 상위 3 평균 RS에 따라 25~100%'],
  NON_TREND_V22_WEAK_NON_TREND:        ['비추세 · 약세 보정', 'down', '코스피 200일선 아래 · 6개월 −5% 아래 · 낙폭 −15% 이하라 −75%p'],
  RECOVERY_LEADER_PULLBACK:            ['회복 · 눌림 매수', '', 'Breadth 30~40% — 최근 6개월 리더 중 20일 고점 대비 −15~−5% 눌린 업종에 50%'],
  RECOVERY_CASH:                       ['회복 · 현금', '', 'Breadth 30~40%인데 눌림 조건을 맞춘 과거 리더가 없음'],
  CONTRARIAN_KOSPI:                    ['역추세 · 코스피', 'down', 'Breadth 30% 미만 — 코스피 252일 낙폭 단계만큼 코스피(변동성 충격이면 절반)'],
  CONTRARIAN_KOSPI_FG_BOOST:           ['역추세 · 코스피(확대)', 'down', 'Breadth 30% 미만 — 낙폭 단계 + F&G 과매도 반등으로 한 단계 확대'],
  CASH:                                ['현금', '', '투자할 조건이 없음(역추세인데 코스피 낙폭이 −12%보다 얕음 등)'],
};
// [키, 이름, 색 번호(SERIES_PAL, −1 = 회색), 굵기] — 첫 줄이 최종 전략. V2.6 자료(version 있음)와 11-22 이전 V2.3 자료
const _kmSeries = p => p?.version
  ? [['v26', 'V2.6 (최종)', 1, 2.4], ['v25', 'V2.5', 4, 1.3], ['kospi', '코스피', -1, 1.5]]
  : [['v23', 'V2.3 (최종)', 1, 2.4], ['v21', 'V2.1', 4, 1.3], ['v2', 'V2', 0, 1.1], ['kospi', '코스피', -1, 1.5]];

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

// Breadth 띠 — 0 ~ 100%에 구간과 확정 · 예상 값을 표시. zones = [[폭 %, 색 클래스, 이름], …] (국내 · 미국 공용)
const KM_ZONES = [[30, 'z0', '역추세 &lt;30'], [10, 'z1', '회복'], [20, 'z2', '비추세 40~60'], [40, 'z3', '추세 ≥60']];
function _kmBand(conf, prev, zones = KM_ZONES) {
  const mark = (v, cls, label) => {
    if (v == null) return '';
    const pos = Math.max(0, Math.min(100, v * 100));
    return `<span class="km-mark ${cls}${pos < 8 ? ' l' : pos > 92 ? ' r' : ''}" style="left:${pos.toFixed(1)}%" title="${escAttr(label)} ${_kmPct(v)}"><i></i><em>${label} ${_kmPct(v, 0)}</em></span>`;
  };
  return `<div class="km-band" role="img" aria-label="Breadth 확정 ${_kmPct(conf)} · 예상 ${_kmPct(prev)}">
    <div class="km-band-bar">${zones.map(([w, cls, n]) => `<span class="${cls}" style="width:${w}%">${n}</span>`).join('')}</div>
    ${mark(conf, 'conf', '확정')}${mark(prev, 'prev', '예상')}
  </div>`;
}

// 확정 · 예상 카드 틀 — 국내 · 미국 월 리밸런싱 공용. rows = [[이름, 값 html, 말풍선], …], lists = [[이름, html], …]
function _kmCardHtml(c) {
  return `<div class="card km-pos${c.preview ? ' preview' : ''}">
    <div class="km-pos-h"><span class="km-pos-t">${c.title}</span><span class="km-pos-s">${c.sub}</span></div>
    <div class="km-pos-main">
      <div class="u5-status ${c.cls}">${escapeHtml(c.name)}</div>
      <div class="km-exp"><b>${_kmPct(c.exp, 0)}</b><span>투자 · 현금 ${_kmPct(c.cash, 0)}</span></div>
    </div>
    ${c.desc ? `<div class="km-desc">${escapeHtml(c.desc)}</div>` : ''}
    <div class="km-hold"><span>투자 대상</span>${c.hold}</div>
    <div class="km-kv">${c.rows.map(([k, v, t]) => `<div title="${escAttr(t || '')}"><span>${k}</span><b>${v}</b></div>`).join('')}</div>
    ${(c.lists || []).map(([k, html]) => `<div class="km-top"><span>${k}</span>${html}</div>`).join('')}
  </div>`;
}

// 그림 공용 — 선 하나 · x축(해를 넘기면 '26.03') · 캔버스에 그리고 store에 담기
const _kmLine = (label, data, col, w, extra = {}) => ({ type: 'line', label, data, borderColor: col, backgroundColor: col, borderWidth: w,
  pointRadius: 0, pointHoverRadius: 3, tension: 0, spanGaps: true, fill: false, ...extra });
const _kmXAxis = (t, labels) => ({ ticks: { color: t.tick, font: { size: 10 }, maxTicksLimit: 9, maxRotation: 0, callback: function (v) {
  const d = this.getLabelForValue(v); return labels.length > 1 && labels[0].slice(0, 4) !== labels[labels.length - 1].slice(0, 4) ? d.slice(2, 7).replace('-', '.') : _kmMD(d); } }, grid: { color: t.grid } });
const _kmChart = (store, id, cfg) => { const cv = document.getElementById(id); if (cv) store.push(new Chart(cv.getContext('2d'), cfg)); };
// 고점 대비 낙폭(%) 계열
const _kmDD = a => { let m = -Infinity; return (a || []).map(v => { if (v == null) return null; m = Math.max(m, v); return (v / m - 1) * 100; }); };

function _kmCard(s, title, sub, isPreview) {
  const [name, cls, desc] = _kmMode(s.mode);
  const contrarian = (s.mode || '').startsWith('CONTRARIAN');
  const nonTrend = (s.mode || '').startsWith('NON_TREND');
  const rows = [
    ['Breadth', _kmPct(s.breadth), '업종 26개 가운데 120일선 위 비율'],
    ['코스피 252일 고점 대비', `<span style="color:${_kmColor(s.dd)}">${_kmSignedPct(s.dd)}</span>`, '−12 · −18 · −24% 이하면 역추세 비중 50 · 75 · 100%'],
    ['F&G', `${_kmNum(s.fg, 1)} <small>히스토그램 <i style="color:${_kmColor(s.hist)}">${s.hist == null ? '—' : (s.hist > 0 ? '+' : '') + _kmNum(s.hist, 3)}</i></small>`, '코스피 가격 기반 — 30 이하 과매도'],
  ];
  const v26 = s.cap != null;                     // V2.6 자료(변동성 제한 · 3개월 RS 표시가 있음)
  if (contrarian) rows.push(['과매도 확대 신호', s.boost ? '<b class="km-on">켜짐</b>' : '<span class="km-off">꺼짐</span>', 'F&G ≤ 30 ∧ 히스토그램 > 0 ∧ 직전 월말보다 큼']);
  if (contrarian) rows.push(['낙폭 기준 비중', v26 ? `${_kmPct(s.base, 0)}${s.precap !== s.base ? ` → ${_kmPct(s.precap, 0)}` : ''}${s.cap ? ` → <b>${_kmPct(s.exp, 0)}</b>` : ''}` : _kmPct(s.base, 0),
    v26 ? '낙폭 단계 → F&G 확대 → 변동성 절반 제한 순' : '확대 전 코스피 비중']);
  if (contrarian && v26) rows.push(['고변동성 절반 제한', s.cap ? '<b class="km-on">걸림 · 절반</b>' : '<span class="km-off">안 걸림</span>', '낙폭 ≤ −24% ∧ 60일 변동성 ≥ 과거 3년 중앙값 × 2 (V2.5)'],
    ['코스피 60일 변동성', `${_kmPct(s.vol, 1)} <small>3년 중앙값 ${_kmPct(s.vol_med, 1)} · <i style="color:${(s.vol_ratio ?? 0) >= 2 ? 'var(--down)' : 'var(--text2)'}">${_kmNum(s.vol_ratio, 2)}배</i></small>`, '연율 · 중앙값은 최근 63거래일을 뺀 과거 756거래일']);
  if (nonTrend) rows.push(['상위 3 평균 RS', `<span style="color:${_kmColor(s.top3_rs)}">${_kmSignedPct(s.top3_rs)}</span>`, '<5 · 5~12 · 12~22 · ≥22% → 25 · 50 · 75 · 100%'],
    ['기본 비중', _kmPct(s.nt_base, 0), s.nt_regime === 'WEAK_NON_TREND' ? '약세 보정 −75%p 적용' : '약세 보정 없음']);
  rows.push(['코스피 6개월', `<span style="color:${_kmColor(s.mom6)}">${_kmSignedPct(s.mom6)}</span>`, `200일선 ${s.ma200 == null ? '—' : s.ma200.toLocaleString(undefined, { maximumFractionDigits: 0 })}`]);
  const topLabel = !v26 ? '적격 RS 상위 5' : s.rs3 ? '3개월 RS 순 상위 5 · 숫자는 6개월 RS' : '순위 상위 5 · 숫자는 6개월 RS';
  const lists = [[topLabel, (s.top5 || []).length ? s.top5.map((n, i) => `<b class="${(s.top3 || []).includes(n) ? 'on' : ''}">${i + 1}. ${escapeHtml(n)} <i>${_kmSignedPct(s.top5_rs?.[i], 1)}</i></b>`).join('') : '<em>적격 업종 없음(120일선 위 ∧ 코스피보다 강한 업종이 없음)</em>']];
  if ((s.rec || []).length) lists.push(['회복 후보', s.rec.map(n => `<b class="on">${escapeHtml(n)}</b>`).join('')]);
  return _kmCardHtml({ title, sub, preview: isPreview, name, cls, desc, exp: s.exp, cash: s.cash, hold: _kmHold(s), rows, lists });
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
  if (v.cap != null && (v.mode || '').startsWith('CONTRARIAN')) out.push(v.cap
    ? `코스피 60일 변동성이 과거 3년 중앙값의 ${_kmNum(v.vol_ratio, 2)}배라 <b>고변동성 절반 제한</b>이 걸려 있습니다(${_kmPct(v.precap, 0)} → ${_kmPct(v.exp, 0)}).`
    : `고변동성 절반 제한은 걸리지 않았습니다(60일 변동성 ${_kmNum(v.vol_ratio, 2)}배 · 기준 2배, 낙폭 기준 −24%).`);
  return out;
}

// 자산별 목표 비중(코스피는 exp 전부, 업종은 똑같이 나눔) → 전월 대비 변화 글. 원본 '전월 대비 변화'와 같은 모양
function _kmWeights(s) {
  const w = {}, h = s?.hold || [];
  if (!h.length || !(s.exp > 0)) return w;
  h.forEach(x => { w[x === 'KOSPI' ? '코스피' : x] = (s.exp || 0) / h.length; });
  return w;
}
function _kmDiff(prev, cur) {
  if (!prev) return '—';
  const a = _kmWeights(prev), b = _kmWeights(cur);
  a['현금'] = Math.max(0, 1 - (prev.exp || 0)); b['현금'] = Math.max(0, 1 - (cur.exp || 0));
  const out = [];
  new Set([...Object.keys(a), ...Object.keys(b)]).forEach(k => {
    const x = a[k] || 0, y = b[k] || 0, d = (y - x) * 100;
    if (Math.abs(d) < 0.05) return;
    out.push(`${escapeHtml(k)} ${x < 1e-9 ? '신규 ' : y < 1e-9 ? '제외 ' : ''}${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}%p`);
  });
  return out.length ? out.join(' / ') : '변경 없음';
}

function kmRender() {
  const p = KM.p, body = document.getElementById('km-body');
  if (!body || !p) return;
  unloadKrMonthly();
  const asof = document.getElementById('km-asof');
  if (asof) asof.innerHTML = `<b>${escapeHtml(p.asof)} 종가 기준</b> · ${escapeHtml(p.version || 'V2.3')} · 업종 ${p.n} · ${escapeHtml(p.start)}부터`;
  const c = p.confirmed, v = p.preview;
  const pf = p.perf || {}, yr = p.yearly || {};
  const nowRows = p.now || [];
  const above = nowRows.filter(r => (r.ma_gap ?? -1) > 0).length;
  const S = _kmSeries(p), top = S[0][0], NEW = !!p.version;
  const sigs = p.signals || [];

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
        <span class="card-sub">${_kmMD(p.asof)} · 120일선 위 ${above}/${nowRows.length} · 적격 = 120일선 위 ∧ 6개월 코스피 대비 RS > 0${NEW ? ` · 순위 = 6개월 RS + 주간 가점${v.rs3 ? '(지금은 Breadth 60~75%라 3개월 RS 순)' : ''}` : ''} (원본 화면엔 없는 표)</span>
      </div>
      <div class="u5-scroll"><table class="u5-tbl km-now">
        <thead><tr><th>순위</th><th>업종</th><th title="종가 ÷ 120일선 − 1">120일선 대비</th><th title="(업종 ÷ 코스피)가 126거래일 전보다 몇 % 올랐나">6개월 RS</th>${NEW ? '<th title="(업종 ÷ 코스피)가 63거래일 전보다 몇 % 올랐나 — Breadth 60~75%일 때 이 순서">3개월 RS</th><th title="최근 26주 가운데 주간 수익률이 업종 상위 30%에 든 주 수 — 가점 = 0.10 × 횟수 ÷ 26">주간 상위 30%</th><th title="6개월 RS + 주간 가점 — 평소 순위 기준">점수</th>' : ''}<th title="최근 20거래일 최고 대비">20일 고점 대비</th><th>1개월</th><th>상태</th></tr></thead>
        <tbody>${nowRows.map(r => `<tr class="${r.elig ? 'u5-held' : ''}">
          <td class="u5-n u5-rk">${r.rank ?? ''}</td><td class="u5-name"><b>${escapeHtml(r.n)}</b><small>${escapeHtml(r.code || '')}</small></td>
          <td class="u5-n" style="color:${_kmColor(r.ma_gap)}">${_kmSignedPct(r.ma_gap)}</td>
          <td class="u5-n" style="color:${_kmColor(r.rs)}">${_kmSignedPct(r.rs)}</td>
          ${NEW ? `<td class="u5-n" style="color:${_kmColor(r.rs3)}">${_kmSignedPct(r.rs3)}</td><td class="u5-n">${r.wk == null ? '—' : `${r.wk}<small>/26</small>`}</td><td class="u5-n">${r.score == null ? '—' : _kmNum(r.score * 100, 1)}</td>` : ''}
          <td class="u5-n" style="color:${_kmColor(r.dd20)}">${_kmSignedPct(r.dd20)}</td>
          <td class="u5-n" style="color:${_kmColor(r.r1m)}">${_kmSignedPct(r.r1m)}</td>
          <td>${r.elig ? '<span class="u5-tag u5-o-52">적격</span>' : (r.ma_gap ?? -1) <= 0 ? '<span class="u5-tag">120일선 아래</span>' : '<span class="u5-tag">코스피보다 약함</span>'}</td></tr>`).join('')}</tbody>
      </table></div>
    </div>

    <div class="card u5-perf-card">
      <div class="card-header" style="flex-wrap:wrap;gap:6px">
        <span class="card-title">백테스트</span><span class="card-sub">${_kmMD(p.graph_start)} ${p.graph_start?.slice(0, 4)} ${NEW ? '비교 시작(두 전략 중 늦게 운용을 시작한 날)' : '운용 시작'} = 1 · 로그 눈금 · 월말 신호 → 다음 거래일 적용 · 거래비용 0.1%</span>
      </div>
      <div class="u5-chart u5-chart-lg"><canvas id="km-c-eq" role="img" aria-label="${escAttr(S.map(x => x[1]).join(' · '))} 누적 성과"></canvas></div>
      <div class="u5-legend">${S.map(([k, n, ci]) => `<span><i style="background:${ci < 0 ? 'var(--text2)' : SERIES_PAL[ci]}"></i>${n}</span>`).join('')}</div>
      <div class="u5-chart"><canvas id="km-c-dd" role="img" aria-label="고점 대비 낙폭"></canvas></div>
      <div class="u5-legend"><span>고점 대비 낙폭(%) — 같은 색</span></div>
      <div class="u5-perf">
        ${NEW ? `<table class="u5-tbl">
          <thead><tr><th>전략</th><th title="비교 시작부터">연수익</th><th title="비교 시작부터">최대 낙폭</th><th>2018~2025 연수익</th><th title="2025년 말 대비">2026 수익</th><th>2026 최대 낙폭</th><th title="비교 시작 전날 = 1">배수</th><th title="1년 동안 사고판 비중의 합">회전율</th><th>Sharpe</th></tr></thead>
          <tbody>${S.map(([k, n]) => { const s = pf[k] || {}; return `<tr class="${k === top ? 'u5-hl' : ''}">
            <td class="u5-name"><b>${n}</b></td><td class="u5-n" style="color:${_kmColor(s.cagr)}">${_kmSignedPct(s.cagr, 2)}</td>
            <td class="u5-n" style="color:var(--down)">${_kmPct(s.mdd_all, 2)}</td><td class="u5-n" style="color:${_kmColor(s.cagr_old)}">${_kmSignedPct(s.cagr_old, 2)}</td>
            <td class="u5-n" style="color:${_kmColor(s.ytd)}">${_kmSignedPct(s.ytd, 2)}</td><td class="u5-n" style="color:var(--down)">${_kmPct(s.ytd_mdd, 2)}</td>
            <td class="u5-n"><b>${_kmNum(s.mult_cmp, 2)}x</b></td><td class="u5-n">${k === 'kospi' ? '—' : _kmNum(s.turnover, 1) + '배'}</td><td class="u5-n">${_kmNum(s.sharpe)}</td></tr>`; }).join('')}</tbody>
        </table>` : `<table class="u5-tbl">
          <thead><tr><th>전략</th><th title="운용 시작부터">연수익</th><th>최대 낙폭</th><th>Sharpe</th><th>Sortino</th><th title="월 단위로 오른 달 비율">월 승률</th><th title="1년 동안 사고판 비중의 합">회전율</th><th>배수</th></tr></thead>
          <tbody>${S.map(([k, n]) => { const s = pf[k] || {}; return `<tr class="${k === top ? 'u5-hl' : ''}">
            <td class="u5-name"><b>${n}</b></td><td class="u5-n" style="color:${_kmColor(s.live_cagr)}">${_kmSignedPct(s.live_cagr, 2)}</td>
            <td class="u5-n" style="color:var(--down)">${_kmPct(s.mdd, 2)}</td><td class="u5-n">${_kmNum(s.sharpe)}</td><td class="u5-n">${_kmNum(s.sortino)}</td>
            <td class="u5-n">${_kmPct(s.win, 1)}</td><td class="u5-n">${k === 'kospi' ? '—' : _kmNum(s.turnover, 1) + '배'}</td><td class="u5-n"><b>${_kmNum(s.mult, 2)}x</b></td></tr>`; }).join('')}</tbody>
        </table>`}
        <div class="u5-side">
          <table class="u5-tbl">
            <thead><tr><th>연도</th>${S.map(([, n]) => `<th>${n.replace(' (최종)', '')}</th>`).join('')}${NEW ? '<th title="V2.6 − 코스피">코스피 대비</th>' : ''}</tr></thead>
            <tbody>${(yr.years || []).map((y, i) => `<tr><td>${y}${i === 0 && !NEW ? '<small> (일부)</small>' : i === yr.years.length - 1 ? '<small> (연중)</small>' : ''}</td>${S.map(([k]) => `<td class="u5-n" style="color:${_kmColor(yr[k]?.[i])}">${_kmSignedPct(yr[k]?.[i], 1)}</td>`).join('')}${NEW ? (() => { const d = yr.v26?.[i] == null || yr.kospi?.[i] == null ? null : yr.v26[i] - yr.kospi[i]; return `<td class="u5-n" style="color:${_kmColor(d)}">${_kmSignedPct(d, 1, '%p')}</td>`; })() : ''}</tr>`).join('')}</tbody>
          </table>
          <div class="u5-note">${NEW
            ? `V2.5 = V2.3(비추세 약세 보정 · F&G 과매도 확대) + 주간 순위 가점(V2.4) + 역추세 고변동성 절반 제한, V2.6 = V2.5 + 추세 60~75%에서 3개월 RS 순(최종).
            원본처럼 두 전략 중 늦게 운용을 시작한 날(${escapeHtml(p.cmp_start || '')})부터 비교합니다. 표본 안의 결과입니다.`
            : `V2 = 기본 규칙, V2.1 = 역추세에서 F&G 과매도 반등 시 한 단계 확대, V2.3 = V2.1 + 비추세 약세 보정(최종).
            연수익은 처음 투자한 달(${escapeHtml(pf.v23?.live_start || '')})부터, 코스피는 ${escapeHtml(p.start)}부터. 표본 안의 결과입니다.`}</div>
        </div>
      </div>
    </div>

    <div class="card u5-perf-card">
      <div class="card-header" style="flex-wrap:wrap;gap:6px"><span class="card-title">코스피 가격 기반 F&G</span><span class="card-sub">기준선 30 이하 과매도 · ▲ = 역추세에서 비중을 한 단계 늘린 월말(V2.1)</span></div>
      <div class="u5-chart u5-chart-lg"><canvas id="km-c-fg" role="img" aria-label="코스피 가격 기반 F&G와 확대 발동"></canvas></div>
      <div class="u5-chart"><canvas id="km-c-hist" role="img" aria-label="F&G 오실레이터 히스토그램"></canvas></div>
      <div class="u5-legend"><span><i style="background:${SERIES_PAL[1]}"></i>F&G</span><span><i style="height:0;border-top:1px dashed var(--warn)"></i>과매도 30</span><span><i style="background:var(--up);height:8px"></i>히스토그램 (오실레이터 − 시그널)</span></div>
    </div>

    ${NEW && p.vol?.v?.length ? `<div class="card u5-perf-card">
      <div class="card-header" style="flex-wrap:wrap;gap:6px"><span class="card-title">코스피 60일 변동성 · 고변동성 절반 제한</span><span class="card-sub">V2.5 · 역추세(Breadth 30% 미만)에서 낙폭 ≤ −24% ∧ 60일 변동성 ≥ 과거 3년 중앙값 × 2면 코스피 비중을 절반으로</span></div>
      <div class="u5-chart"><canvas id="km-c-vol" role="img" aria-label="코스피 60일 연율 변동성과 적응형 기준"></canvas></div>
      <div class="u5-legend"><span><i style="background:${SERIES_PAL[1]}"></i>60일 연율 변동성</span><span><i style="height:0;border-top:1px dashed var(--warn)"></i>기준 = 과거 3년 중앙값 × 2</span></div>
      <div class="u5-scroll"><table class="u5-tbl">
        <thead><tr><th>신호일</th><th>Breadth</th><th>코스피 낙폭</th><th>60일 변동성</th><th title="최근 63거래일을 뺀 과거 756거래일 중앙값">3년 중앙값</th><th>배수</th><th>비중</th></tr></thead>
        <tbody>${(p.caps || []).length ? [...p.caps].reverse().map(b => `<tr${b.ed ? '' : ' class="u5-hl"'}>
          <td class="u5-n u5-rk">${escapeHtml(b.sd.slice(2).replace(/-/g, '.'))}${b.ed ? '' : '<small>예상</small>'}</td><td class="u5-n">${_kmPct(b.breadth)}</td>
          <td class="u5-n" style="color:${_kmColor(b.dd)}">${_kmSignedPct(b.dd)}</td><td class="u5-n">${_kmPct(b.vol, 1)}</td><td class="u5-n">${_kmPct(b.vol_med, 1)}</td>
          <td class="u5-n"><b>${_kmNum(b.vol_ratio, 2)}배</b></td><td class="u5-n">${_kmPct(b.precap, 0)} → <b>${_kmPct(b.exp, 0)}</b></td></tr>`).join('') : '<tr><td colspan="7" class="u5-msg">제한이 걸린 달이 없습니다.</td></tr>'}</tbody>
      </table></div>
    </div>` : ''}

    <div class="u5-grid">
      <div class="card">
        <div class="card-header" style="flex-wrap:wrap;gap:6px"><span class="card-title">최근 ${sigs.length}개 월말 신호</span><span class="card-sub">${escapeHtml(p.version || 'V2.3')} · 맨 아래 줄은 오늘을 월말로 친 예상${NEW ? ' · 3M = 3개월 RS 순 · ½ = 고변동성 절반 제한' : ''}</span></div>
        <div class="u5-scroll"><table class="u5-tbl">
          <thead><tr><th>신호일</th><th style="text-align:left">구간</th><th>Breadth</th><th>코스피 낙폭</th><th>F&G</th><th>비중</th><th style="text-align:left">투자 대상</th><th style="text-align:left">전월 대비</th></tr></thead>
          <tbody>${sigs.map((s, i) => { const [n, cls] = _kmMode(s.mode); return `<tr${s.ed ? '' : ' class="u5-hl"'}>
            <td class="u5-n u5-rk">${escapeHtml(s.sd.slice(2).replace(/-/g, '.'))}${s.ed ? '' : '<small>예상</small>'}</td>
            <td><span class="km-mode ${cls}">${escapeHtml(n)}</span>${s.rs3 ? ' <b style="color:var(--warn)" title="Breadth 60~75% — 3개월 RS 순으로 고름(V2.6)">3M</b>' : ''}</td>
            <td class="u5-n">${_kmPct(s.breadth)}</td><td class="u5-n" style="color:${_kmColor(s.dd)}">${_kmSignedPct(s.dd)}</td>
            <td class="u5-n">${_kmNum(s.fg, 1)}${s.boost ? ' <b style="color:var(--warn)" title="과매도 확대 발동">▲</b>' : ''}</td><td class="u5-n"><b>${_kmPct(s.exp, 0)}</b>${s.cap ? ' <b style="color:var(--down)" title="고변동성 절반 제한(V2.5)">½</b>' : ''}</td>
            <td class="u5-why">${escapeHtml((s.hold || []).map(h => h === 'KOSPI' ? '코스피' : h).join(', ') || '현금')}</td>
            <td class="u5-why">${i === 0 ? '—' : _kmDiff(sigs[i - 1], s)}</td></tr>`; }).reverse().join('')}</tbody>
        </table></div>
      </div>
      <div class="card">
        <div class="card-header" style="flex-wrap:wrap;gap:6px"><span class="card-title">F&G 과매도 확대 발동</span><span class="card-sub">${NEW ? 'V2.6 신호' : 'V2.1'} · Breadth 30% 미만 역추세에서 한 단계 늘린 월말</span></div>
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
      <b>구간</b> — 월말 Breadth(120일선 위 업종 비율)가 60% 이상 추세: 적격 업종(종가 > 120일선 ∧ 6개월 코스피 대비 상대모멘텀 > 0) 순위 상위 3을 같은 비중으로 100%, 이미 든 업종은 5위까지 남김${NEW ? '(60~75%는 3개월 RS 순)' : ''}.
      40~60% 비추세: 같은 방식으로 고르되 상위 3 평균 RS가 5 · 12 · 22% 미만/이상에 따라 25 · 50 · 75 · 100%, 코스피가 200일선 아래 ∧ 6개월 −5% 아래 ∧ 252일 고점 대비 −15% 이하면 −75%p.
      30~40% 회복: 직전 6개 월말 상위 3에 들었던 업종 중 지금도 적격이고 20일 고점 대비 −15~−5%인 것 최대 3개에 50%. 30% 미만 역추세: 코스피 252일 고점 대비 −12 · −18 · −24% 이하이면 코스피 50 · 75 · 100%,
      F&G ≤ 30 ∧ 히스토그램 > 0 ∧ 직전 월말보다 크면 한 단계 더${NEW ? ', 그 뒤 낙폭 ≤ −24% ∧ 60일 변동성 ≥ 과거 3년 중앙값 × 2면 절반' : ''}.<br>
      ${NEW ? '<b>순위</b> — 6개월 RS + 0.10 × (최근 26주 중 주간 수익률이 업종 상위 30%에 든 주 수 ÷ 26). 26주 자료가 모자란 업종은 가점 0.<br>' : ''}
      <b>F&G</b> — RSI14 25% + 125일 수익률 25% + 20일선 이격 20% + 252일 고점 대비 15% + 20일 변동성(거꾸로) 15%, 각각 직전 252거래일 안 백분위. 오실레이터 = 5일 EMA − 20일 EMA, 히스토그램 = 오실레이터 − 그 5일 EMA.
      ※ 시황 '피어앤그리드'(VKOSPI · 금리 · 풋콜 등)와는 다른 지표입니다.<br>
      <b>자료</b> — WICS 업종지수 26개(wiseindex) · 코스피 종가, ${escapeHtml(p.start)}부터. 원본 엑셀(DataGuide 업종지수)과 같은 지수이고, 코스피로 정해지는 값(F&G · 낙폭 · 200일선 · 6개월 · 확대 발동일)은 원본 화면과 같습니다.
      원본 사이트의 최신판은 업종지수 대신 업종 ETF 26개 종가를 써서 업종 이름 · Breadth · 수익률이 이 화면과 다릅니다${NEW ? '(11-23 대조: 코스피 · 60일 변동성 · 확정 · 예상 비중은 같고, 08-31 절반 제한은 원본 Breadth 26.9% · 여기 30% 이상이라 원본에만 있음)' : ''}.
      태린이아빠 '한국 월단위 리밸런싱 투자전략' ${escapeHtml(p.version || 'V2.3')}과 같은 계산.
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
  const labels = c.dates, S = _kmSeries(p), top = S[0][0];
  const xAxis = _kmXAxis(t, labels);
  const base = { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false } };
  const line = _kmLine;
  const mk = (id, cfg) => _kmChart(KM.charts, id, cfg);

  // ① 누적 성과(로그)
  mk('km-c-eq', {
    type: 'line',
    data: { labels, datasets: S.map(([k, n, ci, w]) => line(n, c[k], color(ci), w)) },
    options: { ...base,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ctx.parsed.y == null ? null : `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)}배` } } },
      scales: { x: xAxis, y: { type: 'logarithmic', ticks: { color: t.tick, font: { size: 10 }, callback: v => { const r = +(+v).toPrecision(2); return [0.5, 0.7, 1, 1.5, 2, 3, 5, 7, 10, 15, 20, 30, 50].includes(r) ? r + '배' : ''; } }, grid: { color: t.grid } } } },
  });
  // ② 고점 대비 낙폭
  const dd = _kmDD;
  mk('km-c-dd', {
    type: 'line',
    data: { labels, datasets: S.map(([k, n, ci]) => line(n, dd(c[k]), color(ci), k === top ? 1.6 : 1, k === top ? { fill: 'origin', backgroundColor: SERIES_PAL[1] + '22' } : {})) },
    options: { ...base,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ctx.parsed.y == null ? null : `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%` } } },
      scales: { x: xAxis, y: { max: 0, ticks: { color: t.tick, font: { size: 10 }, maxTicksLimit: 5, callback: v => v + '%' }, grid: { color: t.grid } } } },
  });
  const warn = css.getPropertyValue('--warn').trim() || '#f0a500';
  // ⑤ 60일 변동성 · 적응형 기준(V2.6 자료만) — 원본 세 번째 그림
  if (p.vol?.v?.length) {
    const capDays = new Set((p.caps || []).map(b => b.sd));
    mk('km-c-vol', {
      type: 'line',
      data: { labels, datasets: [
        line('60일 변동성', p.vol.v, SERIES_PAL[1], 1.3),
        line('기준(중앙값×2)', p.vol.th, warn, 1, { borderDash: [5, 4] }),
        { type: 'line', label: '절반 제한', data: labels.map((d, i) => capDays.has(d) ? p.vol.v[i] : null), showLine: false, pointStyle: 'rectRot',
          pointRadius: 5, pointHoverRadius: 6, borderColor: warn, backgroundColor: warn },
      ] },
      options: { ...base,
        plugins: { legend: { display: false }, tooltip: { filter: it => it.parsed.y != null, callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%` } } },
        scales: { x: xAxis, y: { min: 0, ticks: { color: t.tick, font: { size: 10 }, maxTicksLimit: 5, callback: v => v + '%' }, grid: { color: t.grid } } } },
    });
  }
  if (!f?.v?.length) return;
  // ③ F&G + 확대 발동 ▲
  const boostDays = new Set((p.boost || []).map(b => b.sd));
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
