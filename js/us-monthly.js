// us-monthly.js — STRATEGY '미국 월 리밸런싱' 페이지 (11-20, 11-23 V8.2)
// [원본] 태린이아빠 Market Dashboard '미국 월단위 리밸런싱 투자전략' V8.2 · 개선 2조건 RESEARCH_TWO(공개 소스 app.py US_MONTHLY_REBALANCE_SRC, v11.67)
//   매달 마지막 거래일 종가로 업종 ETF의 120일선 위 비율(Breadth)과 QQQ · SPY 상대강도를 보고 다음 달 자산을 정한다.
//   나스닥 독주(QQQ > 200일선 ∧ QQQ/SPY 6개월 RS > 3.5%) → 나스닥 세부 1위 / Breadth ≥70% → SPY · QQQ 중 강한 쪽 /
//   60~70% → 3개월 RS 상위 2 / 40~60% → 순위 모멘텀 상위 3(최대 25% + 금속 50%) / 30~40% → 과거 리더 눌림 50% 또는 금속 /
//   <30% → SPY 낙폭 단계 또는 금속. 월말 신호 → 다음 거래일 종가 체결. 성과는 첫 체결 전날부터 전체 기간.
// [원본과 다른 점] 원본은 계산 결과를 글(콘솔 출력) · 표 · 그림으로 보인다. 여기는 국내 월 리밸런싱과 같은 틀(확정 · 예상 카드,
//   Breadth 띠)에 원본 화면엔 없는 '지금 업종 현황'(42개 업종의 120일선 · RS · 순위)과 나스닥 · 금속 현황을 더했다.
//   계산은 백엔드 collect_us_monthly.py — 원본 대조(11-20 종가): 확정 · 예상 포지션, 최근 15개 월말 신호, 성과 시작일 · 최대 낙폭,
//   SPY 연도별 수익이 같다. 전략 2025년 수익만 원본보다 3.4%p 낮다(그해 9월 이전 신호가 원본 화면에 없어 원인 미확인).
//   payload 성과 키는 'strat'(11-22 이전 V8.1 자료는 'v81' — _kmuNorm이 맞춰 준다).
// 데이터: market_snapshot(kind = 'us_monthly', payload)
// 의존: config.js (sb, escapeHtml, escAttr, chartTheme, SERIES_PAL), Chart.js, kr-monthly.js(_km* 카드 · 띠 · 그림 · 숫자 도우미), u5-* · km-* 꾸밈

const KMU = {
  p: null,
  charts: [],
};

// ETF가 담는 것(짧은 이름) — 원본 화면은 티커만 보인다
const KMU_NAME = {
  SPY: 'S&P500', QQQ: '나스닥100', SOXX: '반도체', IGV: '소프트웨어', FDN: '인터넷', GDX: '금광', IYZ: '통신', FINX: '핀테크',
  KCE: '증권 · 자산운용', XLE: '에너지', KIE: '보험', XLI: '산업재', IHI: '의료기기', IHF: '헬스케어 서비스', IYT: '운송',
  ITA: '항공우주 · 방산', XLB: '소재', BOAT: '해운', PPH: '제약', PPA: '항공우주 · 방산', OIH: '석유 서비스', PEJ: '레저 · 엔터',
  PHO: '물', XHB: '주택건설', IYR: '부동산', PBJ: '음식료', XLP: '필수소비재', CARZ: '자동차', KRE: '지역은행', KBWB: '은행',
  IYF: '금융', IBB: '바이오', IYW: '기술', XME: '금속 · 광업', PICK: '광업(세계)', SIL: '은광', FCG: '천연가스', XOP: '석유 · 가스 탐사',
  MLPX: '미드스트림', XLU: '유틸리티', URA: '우라늄', GRID: '전력망', TAN: '태양광', COPX: '구리 광업', SLX: '철강', REMX: '희토류',
  MOO: '농업', WOOD: '목재', AIRR: '산업 리쇼어링', XBI: '바이오(동일가중)', SKYY: '클라우드', LIT: '리튬 · 배터리',
};
const KMU_MODE = {
  NASDAQ_INTERNAL_TOP1:          ['나스닥 독주', 'up', 'QQQ > 200일선 ∧ QQQ/SPY 6개월 RS > 기준 — 나스닥 세부(KRE · KBWB · IYF · IBB · IYW) 중 QQQ 대비 6개월 RS 1위에 100%'],
  NASDAQ_INTERNAL_TOP1_CAP50:    ['나스닥 독주 · 50%', 'up', '나스닥 독주지만 Breadth가 30% 미만이라 나스닥 세부 1위에 50%까지만'],
  NASDAQ100_FALLBACK:            ['나스닥 독주 · QQQ', 'up', '나스닥 독주인데 세부 지수 RS가 없어 QQQ 100%'],
  NASDAQ100_FALLBACK_CAP50:      ['나스닥 독주 · QQQ 50%', 'up', '나스닥 독주 · Breadth 30% 미만이라 QQQ 50%'],
  SUPER_BULL_NASDAQ100:          ['초광범위 강세 · QQQ', 'up', 'Breadth 70% 이상 — 1 · 3 · 6개월 수익 평균이 더 높은 QQQ에 100%'],
  SUPER_BULL_SP500:              ['초광범위 강세 · SPY', 'up', 'Breadth 70% 이상 — 1 · 3 · 6개월 수익 평균이 더 높은 SPY에 100%'],
  RS3M_TOP2:                     ['선택적 강세', 'up', 'Breadth 60~70% — 적격 업종 중 3개월 SPY 대비 RS 상위 2에 50%씩'],
  NON_TREND_RANK6M_SKIP1M:       ['비추세', '', 'Breadth 40~60% — 최근 1개월 뺀 6개월 순위 모멘텀 상위 3, 비중은 그 3개의 6개월 RS 평균으로 정하되 최대 기준까지(금속 1위가 있으면 더함)'],
  NON_TREND_RANK6M_SKIP1M_METAL: ['비추세 + 금속', '', '비추세 기본 비중이 25% 이하라 금속 1위를 더함'],
  RECOVERY:                      ['회복 · 눌림 매수', '', 'Breadth 30~40% — 최근 6개월 리더 중 20일 고점 대비 −15~−5% 눌린 업종에 50%'],
  RECOVERY_METAL:                ['회복 · 금속', '', '눌림 후보가 없어 금속 1위에 50%'],
  RECOVERY_CASH:                 ['회복 · 현금', '', '눌림 후보도, 120일선 위 · SPY보다 강한 금속도 없음'],
  DEEP_WEAKNESS_SP500:           ['깊은 약세 · SPY', 'down', 'Breadth 30% 미만 — SPY 252일 낙폭 단계(−12 · −18 · −24% → 50 · 75 · 100%)만큼 SPY'],
  DEEP_METAL:                    ['깊은 약세 · 금속', 'down', 'Breadth 30% 미만 · SPY 낙폭이 −12%보다 얕아 금속 1위에 50%'],
  DEEP_CASH:                     ['깊은 약세 · 현금', 'down', 'Breadth 30% 미만 · SPY 낙폭이 −12%보다 얕고 강한 금속도 없어 현금'],
  CASH:                          ['현금', '', ''],
};
const KMU_ZONES = [[30, 'z0', '깊은 약세 &lt;30'], [10, 'z1', '회복'], [20, 'z2', '비추세 40~60'], [10, 'z3', '선택 60~70'], [30, 'z3', '초광범위 ≥70']];
// [키, 이름, 색 번호(SERIES_PAL, −1 = 회색), 굵기] — 전략 이름은 payload.version으로
const _kmuSeries = p => [['strat', `${p?.version || 'V8.1'} 전략`, 1, 2.4], ['spy', 'S&P500 (SPY)', -1, 1.5], ['qqq', '나스닥100 (QQQ)', 4, 1.4]];

// 11-22 이전 자료(V8.1)는 전략 키가 'v81' — 같은 모양으로 맞춘다
function _kmuNorm(p) {
  if (!p) return p;
  for (const k of ['perf', 'yearly', 'curve']) if (p[k] && p[k].strat == null && p[k].v81 != null) p[k].strat = p[k].v81;
  return p;
}

function pUsMonthly() {
  return `
  <div class="u5-head">
    <div class="u5-lede">미국 업종 ETF 가운데 <b>120일선 위에 있는 비율(Breadth)</b>과 <b>나스닥이 S&P500보다 얼마나 강한지</b>로 시장을 나누고,
      <b>매달 말 한 번</b> 다음 달 지수 · 업종과 비중을 정하는 규칙입니다. 이번 달 확정 포지션과, 오늘이 월말이라면 바뀔 다음 달 예상을 봅니다.</div>
    <div id="kmu-asof" class="u5-asof"></div>
  </div>
  <div id="kmu-body"><div class="u5-msg">불러오는 중...</div></div>`;
}

async function loadUsMonthly() {
  const body = document.getElementById('kmu-body');
  if (!body) return;
  try {
    const { data, error } = await sb.from('market_snapshot').select('base_date,payload')
      .eq('kind', 'us_monthly').order('base_date', { ascending: false }).limit(1);
    if (error) throw error;
    if (!document.getElementById('kmu-body')) return;
    KMU.p = _kmuNorm(data?.[0]?.payload || null);
    if (!KMU.p) { body.innerHTML = '<div class="u5-msg">아직 계산된 날이 없습니다 — 매일 아침 미국 장 마감 뒤 채워집니다.</div>'; return; }
    kmuRender();
  } catch (e) {
    const missing = /42P01|PGRST205|does not exist|Could not find/.test(`${e?.code} ${e?.message}`);
    if (!missing) console.warn('[미국 월 리밸런싱]', e);
    body.innerHTML = `<div class="u5-msg">${missing ? '준비 중 — 데이터 테이블이 아직 없습니다.'
      : '불러오지 못했습니다 — ' + escapeHtml(e.message || '조회 실패')}</div>`;
  }
}

function unloadUsMonthly() {
  KMU.charts.forEach(c => c.destroy());
  KMU.charts = [];
}

const _kmuMode = m => KMU_MODE[m] || [m || '—', '', ''];
const _kmuT = t => `${escapeHtml(t)}${KMU_NAME[t] ? `<small> ${escapeHtml(KMU_NAME[t])}</small>` : ''}`;
const _kmuChips = (a, on = []) => (a || []).length ? a.map(t => `<b class="${on.includes(t) ? 'on' : ''}" title="${escAttr(KMU_NAME[t] || '')}">${escapeHtml(t)}</b>`).join('') : '<em>없음</em>';

function _kmuCard(s, title, sub, isPreview, p) {
  const [name, cls, desc] = _kmuMode(s.mode);
  const prm = p.param || {};
  const hold = (s.sel || []).length ? s.sel.map(t => `<b class="km-chip${t === 'SPY' || t === 'QQQ' ? ' kospi' : ''}" title="${escAttr(KMU_NAME[t] || '')}">${escapeHtml(t)}<small style="font-weight:500"> ${escapeHtml(KMU_NAME[t] || '')}</small></b>`).join('') : '<em>없음 — 현금</em>';
  const rows = [
    ['Breadth', `${_kmPct(s.breadth)} <small>${s.above ?? '—'}/${s.valid ?? '—'}</small>`, '업종 ETF 가운데 120일선 위 비율'],
    ['QQQ/SPY 6개월 RS', `<span style="color:${_kmColor(s.ndx_rs)}">${_kmSignedPct(s.ndx_rs, 2)}</span>`, `${_kmPct(prm.nasdaq_rs ?? 0.05, 0)} 넘고 QQQ가 200일선 위면 나스닥 독주`],
    ['QQQ 200일선 대비', `<span style="color:${_kmColor(s.ndx_gap)}">${_kmSignedPct(s.ndx_gap)}</span>`, '나스닥 독주 조건 하나'],
    ['나스닥 독주', s.strong ? '<b class="km-on">켜짐</b>' : '<span class="km-off">꺼짐</span>', '켜지면 Breadth 구간보다 먼저 적용'],
    ['SPY 252일 고점 대비', `<span style="color:${_kmColor(s.dd)}">${_kmSignedPct(s.dd)}</span>`, 'Breadth 30% 미만일 때 −12 · −18 · −24% 이하면 SPY 50 · 75 · 100%'],
    ['1·3·6개월 평균 SPY / QQQ', `<span style="color:${_kmColor(s.sp_mom)}">${_kmSignedPct(s.sp_mom)}</span> / <span style="color:${_kmColor(s.ndx_mom)}">${_kmSignedPct(s.ndx_mom)}</span>`, 'Breadth 70% 이상이면 더 높은 쪽 100%'],
  ];
  if ((s.mode || '').startsWith('NON_TREND')) rows.push(['상위 3 6개월 RS 평균', `<span style="color:${_kmColor(s.avg_rs)}">${_kmSignedPct(s.avg_rs)}</span>`, `<5 · 5~12 · 12~22 · ≥22% → 25 · 50 · 75 · 100%(최대 ${_kmPct(prm.nontrend_max ?? 0.5, 0)})`]);
  rows.push(['금속 1위', s.metal ? `${escapeHtml(s.metal)}<small> ${escapeHtml(KMU_NAME[s.metal] || '')}</small>` : '<span class="km-off">없음</span>', 'XME · PICK · SIL 중 120일선 위 ∧ SPY보다 강한 것']);
  const lists = [
    ['3개월 RS 상위 2', _kmuChips(s.top2_3m, s.mode === 'RS3M_TOP2' ? s.sel : [])],
    ['6개월 RS 상위 3', _kmuChips(s.top3_6m, (s.mode || '').startsWith('RECOVERY') ? s.sel : [])],
    ['순위 모멘텀 상위 3', _kmuChips(s.top3_nt, (s.mode || '').startsWith('NON_TREND') ? s.sel : [])],
  ];
  return _kmCardHtml({ title, sub, preview: isPreview, name, cls, desc, exp: s.exp, cash: s.cash, hold, rows, lists });
}

// 원본 '이번달 확정 → 다음달 예상 포지션 변화 해석'을 같은 순서로
function _kmuComments(c, v) {
  const a = (c.sel || []).join(', ') || '현금', b = (v.sel || []).join(', ') || '현금';
  const out = [a === b ? `투자 대상은 지금(${escapeHtml(a)})과 다음 달 예상이 같습니다.` : `포지션이 <b>${escapeHtml(a)}</b>에서 <b>${escapeHtml(b)}</b>(으)로 바뀌는 신호입니다.`];
  const de = (v.exp ?? 0) - (c.exp ?? 0);
  out.push(Math.abs(de) < 1e-9 ? `투자비중은 ${_kmPct(v.exp, 0)}로 지금과 같습니다.` : `투자비중은 ${_kmPct(c.exp, 0)}에서 <b>${_kmPct(v.exp, 0)}</b>로 ${de > 0 ? '늘어납니다' : '줄어듭니다'}(${de > 0 ? '+' : '−'}${Math.abs(de * 100).toFixed(0)}%p).`);
  out.push(`Breadth는 ${_kmPct(c.breadth)}에서 ${_kmPct(v.breadth)}로 ${(v.breadth ?? 0) >= (c.breadth ?? 0) ? '넓어졌습니다' : '좁아졌습니다'}(${_kmSignedPct((v.breadth ?? 0) - (c.breadth ?? 0), 1, '%p')}).`);
  out.push(`QQQ/SPY 6개월 RS는 ${_kmSignedPct(c.ndx_rs, 2)}에서 ${_kmSignedPct(v.ndx_rs, 2)}로 ${_kmSignedPct((v.ndx_rs ?? 0) - (c.ndx_rs ?? 0), 2, '%p')} 움직였습니다.`);
  out.push(c.strong === v.strong ? `나스닥 독주 조건은 ${v.strong ? '켜진' : '꺼진'} 상태 그대로입니다.` : `나스닥 독주 조건이 <b>${v.strong ? '켜졌습니다' : '꺼졌습니다'}</b>.`);
  return out;
}

function kmuRender() {
  const p = KMU.p, body = document.getElementById('kmu-body');
  if (!body || !p) return;
  unloadUsMonthly();
  const asof = document.getElementById('kmu-asof');
  if (asof) asof.innerHTML = `<b>${escapeHtml(p.asof)} 미국 종가 기준</b> · ${escapeHtml(p.version || 'V8.1')} · ETF ${p.n_etf} · 업종 ${p.sectors?.length ?? '—'} · ${escapeHtml(p.param?.set || '')}`;
  const c = p.confirmed, v = p.preview, pf = p.perf || {}, yr = p.yearly || {};
  const SER = _kmuSeries(p), ver = escapeHtml(p.version || 'V8.1'), full = !!p.version;   // version이 있으면 V8.2(전체 기간 성과)
  const now = p.now || [], ix = p.index_now || {};
  const above = now.filter(r => (r.ma_gap ?? -1) > 0).length;

  body.innerHTML = `
    <div class="km-top2">
      ${_kmuCard(c, `${_kmYM(c.ed || c.sd)} 실제 운용 · 확정`, `${_kmMD(c.sd)} 월말 신호 → ${_kmMD(c.ed)} 종가 체결`, false, p)}
      ${_kmuCard(v, `${_kmNextYM(v.sd)} 예상 · 임시`, `${_kmMD(v.sd)}을 월말로 친 신호 — 월말까지 바뀔 수 있음`, true, p)}
    </div>
    <div class="card km-read">
      <div class="card-header" style="flex-wrap:wrap;gap:6px"><span class="card-title">지금 → 다음 달</span><span class="card-sub">원본의 '이번달 확정 → 다음달 예상 포지션 변화 해석' · 나스닥 독주가 켜지면 Breadth 구간보다 먼저</span></div>
      ${_kmBand(c.breadth, v.breadth, KMU_ZONES)}
      <ol class="km-cmt">${_kmuComments(c, v).map(t => `<li>${t}</li>`).join('')}</ol>
      ${(p.hold || []).length ? `<div class="km-top" style="padding:0 18px 14px"><span>지금 비중(${_kmMD(p.asof)} 종가, 가격대로 움직인 뒤)</span>${p.hold.map(h => `<b class="on">${escapeHtml(h.t)} <i>${_kmNum(h.w, 1)}%</i></b>`).join('')}<em>현금 ${(100 - p.hold.reduce((s, h) => s + (h.w || 0), 0)).toFixed(1)}%</em></div>` : ''}
    </div>

    <div class="u5-grid">
      <div class="card">
        <div class="card-header" style="flex-wrap:wrap;gap:6px"><span class="card-title">지금 업종 현황</span>
          <span class="card-sub">${_kmMD(p.asof)} · 120일선 위 ${above}/${now.length} · 적격 = 120일선 위 ∧ 6개월 SPY 대비 RS > 0 (원본 화면엔 없는 표)</span></div>
        <div class="u5-scroll"><table class="u5-tbl">
          <thead><tr><th>6M 순위</th><th>업종 ETF</th><th title="종가 ÷ 120일선 − 1">120일선</th><th title="(ETF ÷ SPY)가 126거래일 전보다 몇 % 올랐나">6개월 RS</th><th title="63거래일 기준 — 선택적 강세 구간 순위">3개월 RS</th><th title="최근 1개월 뺀 6개월 동안 날마다 매긴 수익률 순위(0~1)의 평균 — 비추세 구간 순위">순위 모멘텀</th><th title="최근 20거래일 최고 대비 — 회복 구간 눌림">20일 고점</th></tr></thead>
          <tbody>${now.map(r => `<tr class="${r.elig ? 'u5-held' : ''}">
            <td class="u5-n u5-rk">${r.r6 ?? ''}</td><td class="u5-name">${_kmuT(r.t)}</td>
            <td class="u5-n" style="color:${_kmColor(r.ma_gap)}">${_kmSignedPct(r.ma_gap)}</td>
            <td class="u5-n" style="color:${_kmColor(r.rs6)}">${_kmSignedPct(r.rs6)}</td>
            <td class="u5-n" style="color:${_kmColor(r.rs3)}">${_kmSignedPct(r.rs3)}${r.r3 && r.r3 <= 2 ? ' <b style="color:var(--warn)">●</b>' : ''}</td>
            <td class="u5-n">${r.rk == null ? '—' : _kmNum(r.rk, 3)}${r.rn && r.rn <= 3 ? ' <b style="color:var(--warn)">●</b>' : ''}</td>
            <td class="u5-n" style="color:${_kmColor(r.dd20)}">${_kmSignedPct(r.dd20)}</td></tr>`).join('')}</tbody>
        </table></div>
        <div class="u5-note">● = 지금 적격 업종 가운데 3개월 RS 상위 2 · 순위 모멘텀 상위 3. 색칠된 줄이 적격(120일선 위 ∧ SPY보다 강함).</div>
      </div>
      <div class="card">
        <div class="card-header" style="flex-wrap:wrap;gap:6px"><span class="card-title">나스닥 · 금속</span><span class="card-sub">${_kmMD(p.asof)} · 나스닥 독주와 금속 보조의 재료</span></div>
        <table class="u5-tbl">
          <tbody>
            <tr><td class="u5-name"><b>QQQ/SPY 6개월 RS</b></td><td class="u5-n" style="color:${_kmColor(ix.ndx_rs)}">${_kmSignedPct(ix.ndx_rs, 2)}</td><td class="u5-why">${_kmPct(p.param?.nasdaq_rs ?? 0.05, 0)} 넘어야 독주</td></tr>
            <tr><td class="u5-name"><b>QQQ 200일선 대비</b></td><td class="u5-n" style="color:${_kmColor(ix.ndx_gap)}">${_kmSignedPct(ix.ndx_gap)}</td><td class="u5-why">0 넘어야 독주</td></tr>
            <tr><td class="u5-name"><b>SPY 252일 고점 대비</b></td><td class="u5-n" style="color:${_kmColor(ix.spy_dd)}">${_kmSignedPct(ix.spy_dd)}</td><td class="u5-why">깊은 약세 비중 단계</td></tr>
            <tr><td class="u5-name"><b>1·3·6개월 평균 SPY · QQQ</b></td><td class="u5-n"><span style="color:${_kmColor(ix.sp_mom)}">${_kmSignedPct(ix.sp_mom)}</span> · <span style="color:${_kmColor(ix.ndx_mom)}">${_kmSignedPct(ix.ndx_mom)}</span></td><td class="u5-why">초광범위 강세에서 고르는 기준</td></tr>
          </tbody>
        </table>
        <table class="u5-tbl" style="border-top:1px solid var(--border)">
          <thead><tr><th>나스닥 세부</th><th title="(ETF ÷ QQQ)가 126거래일 전보다 몇 % 올랐나">QQQ 대비 6개월 RS</th></tr></thead>
          <tbody>${[...(p.nasdaq_now || [])].sort((a, b) => (b.rs6 ?? -9) - (a.rs6 ?? -9)).map((r, i) => `<tr${i === 0 ? ' class="u5-hl"' : ''}><td class="u5-name">${_kmuT(r.t)}</td><td class="u5-n" style="color:${_kmColor(r.rs6)}">${_kmSignedPct(r.rs6)}</td></tr>`).join('')}</tbody>
        </table>
        <table class="u5-tbl" style="border-top:1px solid var(--border)">
          <thead><tr><th>금속</th><th>120일선</th><th>6개월 RS</th></tr></thead>
          <tbody>${(p.metals_now || []).map(r => `<tr><td class="u5-name">${_kmuT(r.t)}</td><td class="u5-n" style="color:${_kmColor(r.ma_gap)}">${_kmSignedPct(r.ma_gap)}</td><td class="u5-n" style="color:${_kmColor(r.rs6)}">${_kmSignedPct(r.rs6)}</td></tr>`).join('')}</tbody>
        </table>
      </div>
    </div>

    <div class="card u5-perf-card">
      <div class="card-header" style="flex-wrap:wrap;gap:6px">
        <span class="card-title">${full ? '전체 기간 성과' : '최근 2년 성과'}</span><span class="card-sub">${escapeHtml(p.live_start)}부터 = 1 · 원본과 같은 평가 기간${full ? '(첫 투자 체결 전날부터)' : ''} · 월말 신호 → 다음 거래일 종가 체결 · 거래비용 0.1%</span>
      </div>
      <div class="u5-chart u5-chart-lg"><canvas id="kmu-c-eq" role="img" aria-label="${ver} · SPY · QQQ 누적 성과"></canvas></div>
      <div class="u5-legend">${SER.map(([k, n, ci]) => `<span><i style="background:${ci < 0 ? 'var(--text2)' : SERIES_PAL[ci]}"></i>${n}</span>`).join('')}</div>
      <div class="u5-chart"><canvas id="kmu-c-dd" role="img" aria-label="고점 대비 낙폭"></canvas></div>
      <div class="u5-legend"><span>고점 대비 낙폭(%) — 같은 색</span></div>
      <div class="u5-perf">
        <table class="u5-tbl">
          <thead><tr><th>전략</th><th>연수익</th><th>최대 낙폭</th><th>Sharpe</th><th>Sortino</th><th title="연수익 ÷ |최대 낙폭|">Calmar</th><th title="1년 동안 사고판 비중의 합">회전율</th><th>배수</th></tr></thead>
          <tbody>${SER.map(([k, n]) => { const s = pf[k] || {}; return `<tr class="${k === 'strat' ? 'u5-hl' : ''}">
            <td class="u5-name"><b>${n}</b></td><td class="u5-n" style="color:${_kmColor(s.cagr)}">${_kmSignedPct(s.cagr, 2)}</td>
            <td class="u5-n" style="color:var(--down)">${_kmPct(s.mdd, 2)}</td><td class="u5-n">${_kmNum(s.sharpe)}</td><td class="u5-n">${_kmNum(s.sortino)}</td>
            <td class="u5-n">${_kmNum(s.calmar)}</td><td class="u5-n">${k === 'strat' ? _kmNum(s.turnover, 1) + '배' : '—'}</td><td class="u5-n"><b>${_kmNum(s.mult, 2)}x</b></td></tr>`; }).join('')}</tbody>
        </table>
        <div class="u5-side">
          <table class="u5-tbl">
            <thead><tr><th>연도</th><th>${ver}</th><th>SPY</th><th>QQQ</th><th title="SPY · QQQ보다 높았나">앞섬</th></tr></thead>
            <tbody>${(yr.years || []).map((y, i) => { const a = yr.strat?.[i], b = yr.spy?.[i], q = yr.qqq?.[i]; return `<tr><td>${y}${i === 0 ? '<small> (일부)</small>' : i === yr.years.length - 1 ? '<small> (연중)</small>' : ''}</td>
              <td class="u5-n" style="color:${_kmColor(a)}">${_kmSignedPct(a, 1)}</td><td class="u5-n" style="color:${_kmColor(b)}">${_kmSignedPct(b, 1)}</td><td class="u5-n" style="color:${_kmColor(q)}">${_kmSignedPct(q, 1)}</td>
              <td class="u5-n">${a == null ? '—' : `${a > b ? 'O' : 'X'} · ${a > q ? 'O' : 'X'}`}</td></tr>`; }).join('')}</tbody>
          </table>
          <div class="u5-note">신호는 ${escapeHtml(p.start)}부터의 자료 전체로 만들고${full ? '(첫 200거래일은 준비 기간), 성과는 원본처럼 첫 투자 체결 전날부터 전체 기간을 봅니다' : ', 성과는 원본처럼 최근 2년만 봅니다'}. 표본 안의 결과이며, 원본 작성자도 '최근 수익률은 같은 자료로 수치를 찾은 표본 내 결과'라고 적어 두었습니다.</div>
        </div>
      </div>
    </div>

    <div class="card u5-perf-card">
      <div class="card-header" style="flex-wrap:wrap;gap:6px"><span class="card-title">최근 ${p.signals?.length || 0}개 월말 신호</span><span class="card-sub">맨 아래 줄은 오늘을 월말로 친 예상</span></div>
      <div class="u5-scroll"><table class="u5-tbl">
        <thead><tr><th>신호일</th><th style="text-align:left">구간</th><th>Breadth</th><th>QQQ/SPY RS</th><th>SPY 낙폭</th><th>비중</th><th style="text-align:left">선택</th><th style="text-align:left">3M RS 상위 2</th><th style="text-align:left">순위 상위 3</th></tr></thead>
        <tbody>${[...(p.signals || [])].reverse().map(s => { const [n, cls] = _kmuMode(s.mode); return `<tr${s.ed ? '' : ' class="u5-hl"'}>
          <td class="u5-n u5-rk">${escapeHtml(s.sd.slice(2).replace(/-/g, '.'))}${s.ed ? '' : '<small>예상</small>'}</td>
          <td><span class="km-mode ${cls}">${escapeHtml(n)}</span></td>
          <td class="u5-n">${_kmPct(s.breadth)}</td><td class="u5-n" style="color:${_kmColor(s.ndx_rs)}">${_kmSignedPct(s.ndx_rs, 2)}${s.strong ? ' <b style="color:var(--up)" title="나스닥 독주">●</b>' : ''}</td>
          <td class="u5-n" style="color:${_kmColor(s.dd)}">${_kmSignedPct(s.dd)}</td><td class="u5-n"><b>${_kmPct(s.exp, 0)}</b></td>
          <td class="u5-why"><b>${escapeHtml((s.sel || []).join(', ') || '현금')}</b></td>
          <td class="u5-why">${escapeHtml((s.top2_3m || []).join(', '))}</td><td class="u5-why">${escapeHtml((s.top3_nt || []).join(', '))}</td></tr>`; }).join('')}</tbody>
      </table></div>
    </div>

    <div class="u5-foot">
      <b>구간</b> — 먼저 나스닥 독주(QQQ > 200일선 ∧ QQQ/SPY 6개월 RS > ${_kmPct(p.param?.nasdaq_rs ?? 0.05, 0)})이면 나스닥 세부(KRE · KBWB · IYF · IBB · IYW) 중 QQQ 대비 6개월 RS 1위에 100%(Breadth 30% 미만이면 50%).
      아니면 월말 Breadth(업종 ETF 중 120일선 위 비율)로: ${_kmPct(p.param?.superbull ?? 0.7, 0)} 이상 SPY · QQQ 중 1 · 3 · 6개월 수익 평균이 높은 쪽 100% / 60% 이상 적격 업종(120일선 위 ∧ 6개월 SPY 대비 RS > 0) 3개월 RS 상위 2 /
      40% 이상 최근 1개월 뺀 6개월 순위 모멘텀 상위 3(6개월 RS 평균 <5 · 5~12 · 12~22 · ≥22% → 25 · 50 · 75 · 100%, 최대 ${_kmPct(p.param?.nontrend_max ?? 0.5, 0)}), 25% 이하면 금속 1위 ${_kmPct(p.param?.metal ?? 0.5, 0)} 추가 /
      30% 이상 최근 6개 월말 6개월 RS 상위 3에 들었던 업종 중 20일 고점 대비 −15~−5% 눌린 것 50%, 없으면 금속 / 30% 미만 SPY 252일 고점 대비 −12 · −18 · −24% 이하 50 · 75 · 100%, 0%면 금속.
      금속 = XME · PICK · SIL 중 120일선 위 ∧ 6개월 SPY 대비 RS > 0 1위(${_kmPct(p.param?.metal ?? 0.5, 0)}).<br>
      <b>체결</b> — 월말 종가로 신호, 다음 거래일 종가에 교체, 새 비중 수익은 그다음 날부터(원본과 같음). 편도 0.1%.<br>
      <b>자료</b> — 야후 수정 종가(분할 · 배당 반영 — 원본 HTS 종가와 SPY 연도별 수익이 같음), ETF 52개, ${escapeHtml(p.start)}부터.
      ${full ? '하루 +200% 초과 · −70% 미만 · 0 이하 가격이 하나라도 있으면 그날은 계산을 멈춥니다(원본 V8.2 규칙 — 예전처럼 그 ETF를 빼지 않음).' : ''}
      ${full ? `원본 대조(11-20 종가): 확정 · 예상 포지션, 최근 15개 월말 신호(구간 · Breadth · RS · 선택), 성과 시작일, 최대 낙폭, SPY 연도별 수익이 같습니다.
      전략 연수익은 원본(26.7%)보다 조금 낮은데, 차이는 거의 2025년(원본 +27.7%)에서 납니다 — 그해 9월 이전 신호가 원본 화면에 없어 원인은 확인하지 못했습니다.
      QQQ는 2023년 이전 연도별 수익이 0.1~0.5%p 다릅니다(수정종가 계산 차이로 보임).` : ''}
      태린이아빠 '미국 월단위 리밸런싱 투자전략' ${ver}${full ? ' · 개선 2조건(RESEARCH_TWO)' : ' · SUPER70'}과 같은 계산.
    </div>`;
  kmuDrawCharts();
}

function kmuDrawCharts() {
  const p = KMU.p, c = p?.curve;
  unloadUsMonthly();
  if (!c?.dates?.length) return;
  const t = chartTheme(), css = getComputedStyle(document.documentElement);
  const gray = css.getPropertyValue('--text2').trim() || '#b3b8cd';
  const color = ci => ci < 0 ? gray : SERIES_PAL[ci];
  const labels = c.dates, SER = _kmuSeries(p);
  const base = { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false } };
  _kmChart(KMU.charts, 'kmu-c-eq', {
    type: 'line',
    data: { labels, datasets: SER.map(([k, n, ci, w]) => _kmLine(n, c[k], color(ci), w)) },
    options: { ...base,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ctx.parsed.y == null ? null : `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(3)} (${_kmSignedPct(ctx.parsed.y - 1, 1)})` } } },
      scales: { x: _kmXAxis(t, labels), y: { ticks: { color: t.tick, font: { size: 10 }, maxTicksLimit: 6, callback: v => (+v).toFixed(2) }, grid: { color: t.grid } } } },
  });
  _kmChart(KMU.charts, 'kmu-c-dd', {
    type: 'line',
    data: { labels, datasets: SER.map(([k, n, ci]) => _kmLine(n, _kmDD(c[k]), color(ci), k === 'strat' ? 1.6 : 1, k === 'strat' ? { fill: 'origin', backgroundColor: SERIES_PAL[1] + '22' } : {})) },
    options: { ...base,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ctx.parsed.y == null ? null : `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%` } } },
      scales: { x: _kmXAxis(t, labels), y: { max: 0, ticks: { color: t.tick, font: { size: 10 }, maxTicksLimit: 5, callback: v => v + '%' }, grid: { color: t.grid } } } },
  });
}
