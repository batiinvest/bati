/**
 * flow-map.js — 수급 지도 (Accumulation / Distribution Map)
 *
 * 종목별 "찬집 / 빈집" 사분면 지도. 참고: DAOL 커버리지 대시보드 #flowmap.
 *   ├ 가로축(X) = 이전 구간 누적 순매수 ÷ 시가총액 → 얼마나 "찼나"(찬집) / "비었나"(빈집)
 *   └ 세로축(Y) = 최근 구간 순매수 ÷ 시가총액      → 지금 담나 / 비우나
 *
 *   ⚠ 두 축의 기간은 겹치지 않는다. 가로 = 창 전체에서 세로(최근) 구간을 뺀 앞부분.
 *     겹치면 y ⊂ x 가 되어 실측 corr +0.55 — 우상/좌하 대각선으로 구조적 쏠림이 생기고,
 *     "최근 20일에만 담긴" 종목이 '이전부터 찬 집'으로 둔갑한다(반도체 67종 중 14종은
 *     |y| > |x|였다). 비중첩으로 바꾸면 corr -0.02, 75종 중 15종이 사분면을 옮겼다.
 *
 *   4사분면:
 *     · 우상 찬집·계속 담는 중  (이전 유입 + 최근도 매수)
 *     · 우하 찬집·비우기 시작    (이전 유입 but 최근 매도 전환 — 차익실현 경계)
 *     · 좌상 빈집·담기 시작      (이전 유출 but 최근 매수 전환 — 저점 매집 관찰)
 *     · 좌하 빈집·계속 비우는 중 (이전 유출 + 최근도 매도 — 소외)
 *
 * 값 = Σ(일별 순매수 주식수 × 일별 종가) ÷ 시총.
 *   market_data.foreign_net_buy / institution_net_buy 는 **주식수** 단위라 종가를 곱해
 *   원화로 환산한 뒤 시총으로 정규화(참고 사이트와 동일 방식, 확정대금과 소수 오차 존재).
 *   분모는 gap 모드=현재 시총, empty 모드=당일 시총(기간 중 주가 급변 왜곡 제거).
 *   ⚠ 순매수는 is_monitored 종목만 수집되고, 서버 job_cleanup_market_data 가
 *     KEEP_MON=90일로 롤링 삭제한다 → 보유 이력은 영구히 61~63거래일이 천장.
 *     따라서 _FM_WINS 의 6M(th=80)·12M(th=170) 칩은 **절대 열리지 않는다**(실측 확인).
 *     살리려면 순매수 전용 경량 장기 테이블을 따로 보존해야 한다.
 *
 * 산업 필터(기본 반도체) 단위로 ~20~60종목만 찍어 사분면이 또렷하게 읽히도록 한다.
 *
 * ── 모드 2종 ────────────────────────────────────────────────────────────────
 *  ① empty(빈집)  — 유튜브 '태린이아빠'(@Taerins_Dad) "수급빈집" 로직
 *     https://www.youtube.com/watch?v=AvXIhX7VlH4
 *     원 정의(영상 육성 + 엑셀 시트):
 *       1. 유동성 공급이 되는 컨셉(업종)을 분류한다 — 이때 매수만 본다.
 *       2. 수출데이터·미국시장·선행지표·컨센서스로 공급이 약해질지 본다(하자 있으면 매도압력↑).
 *       3. 하자가 없는데 수급 강도가 "비워져" 있으면 금방 채워질 가능성에 베팅한다.
 *          (모멘텀 로테이션=덜 오른 종목 사기 와 달리, 주도주도 잡히는 게 장점)
 *     수급오실레이터 = 외국인+기관 **순매수 금액**의 5일 롤링 합 ÷ 시가총액 × 100(%).
 *     ⚠ 영상 자막(ASR)만 보면 "매수(총매수)·투신·연금"으로 들리지만, 화면 실물로 반증된다:
 *       ① 오실레이터가 음수로 내려간다 — 알테오젠 -0.13%, 유한양행 -0.38%(우축 +0.4~-0.5%).
 *          총매수라면 부호가 항상 +라 불가능 → **순매수**가 맞다.
 *       ② 워크북 시트 탭이 `외인 / 기관 / 외국인매수데이터 / 기관매수데이터 / 기외 / 시기외`
 *          — 투자자 분류가 **외인+기관 2종**이고 투신·연금 분리가 없다. '기외'=기관+외인,
 *          '시기외'=시총 대비 기관+외인. 우리 구성과 동일.
 *       ③ 스케일도 순매수급 — 5일 총매수는 시총의 수 %가 나와야 하는데 실제는 ±0.4%.
 *     → 투자자 분류·부호·5일 롤링·÷시가총액·% 변환·자기 이력 대비 위치가 모두 원본과 같다.
 *       남은 차이는 **금액 산출** 하나: 원본은 거래소 순매수 '금액'(시트 헤더 '외국인금액')을
 *       직접 쓰는 것으로 보이고, 우리는 KIS가 수량만 주므로 순매수 수량 × 종가로 환산한다.
 *  ② gap(전환)   — 이전 구간 누적 vs 최근 구간. 기존 사분면 지도(위 설명).
 *
 * 의존: sb, INDUSTRIES, IND_COLORS, getIndustryMap, getLatestMarketDate, fetchAllPages,
 *       fmtCap, fmtWon, fmtPct, wlBadge, escAttr, loadingHTML, setAsOf (config.js)
 */

// ── 상태 네임스페이스 (window._* 금지 규약) ─────────────────────────────────
const FM = {
  ind:     '반도체',   // 선택 산업
  mode:    'empty',    // 지도 모드 (empty=빈집 · gap=전환)
  win:     '3M',       // 기간 창 (1M | 3M | 6M | 12M)
  inv:     'both',     // 투자자 (both | foreign | inst)
  sortCol: 'quad',     // 표 정렬 컬럼 (기본 모드가 empty라 빈집이 위로 — switchFmMode가 모드별로 재설정)
  sortDir: -1,         // -1 내림차순, 1 오름차순
  raw:     {},         // 산업별 원자료 캐시 { ind: { dates, byCode } }
  latest:  null,       // 최신 거래일
};

// 기간 창 정의 — med=창 전체 거래일수, sh=최근(세로) 거래일수, th=칩 노출 최소 거래일수
//   가로축은 med - sh 거래일. 창 전체에서 세로 구간을 떼어내 두 축이 겹치지 않게 한다.
const _FM_WINS = [
  { k: '1M',  med: 20,  sh: 5,  th: 10  },
  { k: '3M',  med: 63,  sh: 20, th: 35  },
  { k: '6M',  med: 126, sh: 20, th: 80  },
  { k: '12M', med: 252, sh: 20, th: 170 },
];

// 사분면 정의 (색 언어: 가격 빨/파와 분리 — 수급 전용 팔레트)
const _FM_Q = {
  ff: { key: 'ff', label: '찬집 · 계속 담는 중',  short: '찬집·담는중', color: '#2dce89', bg: 'rgba(45,206,137,.14)', prio: 3, tip: '이전 구간 순유입 + 최근도 매수 지속 — 강한 축적' },
  fe: { key: 'fe', label: '찬집 · 비우기 시작',    short: '찬집·비우기', color: '#fb6340', bg: 'rgba(251,99,64,.13)',  prio: 2, tip: '이전 구간 순유입했지만 최근 순매도 전환 — 차익실현 경계' },
  ef: { key: 'ef', label: '빈집 · 담기 시작',      short: '빈집·담기',   color: '#f59e0b', bg: 'rgba(245,158,11,.13)', prio: 1, tip: '이전 구간 순유출이나 최근 매수 전환 — 저점 매집 관찰' },
  ee: { key: 'ee', label: '빈집 · 계속 비우는 중', short: '빈집·비우기', color: '#8898aa', bg: 'rgba(136,152,170,.12)', prio: 0, tip: '이전 구간 순유출 + 최근도 매도 지속 — 소외·회피' },
};
const _fmQuad = (x, y) => x >= 0 ? (y >= 0 ? _FM_Q.ff : _FM_Q.fe) : (y >= 0 ? _FM_Q.ef : _FM_Q.ee);

// ── 빈집 모드 ───────────────────────────────────────────────────────────────
// 수급오실레이터 롤링 창 — 태린이아빠 원 정의 5거래일 고정("5일 롤로 하루씩 이연되면서 합산").
const _FM_OSC_N = 5;
// ★(진짜 비었다) 기준 백분위 — 사분면은 중앙값으로 가르되, 이 선 아래만 강조한다.
// 중앙값 바로 아래(하위 46% 등)까지 '빈집'으로 부르면 과장이라 표/차트에서 눈에 띄게 분리.
const _FM_EMPTY_TH = 30;

// 빈집 사분면 — 가로=유동성 공급 강도(오실레이터 평균), 세로=자기 이력 대비 현재 위치
const _FM_QE = {
  fill: { key: 'fill', label: '빈집 · 채워질 자리', short: '빈집',     color: '#f59e0b', bg: 'rgba(245,158,11,.16)', prio: 3, tip: '유동성이 공급되는 종목인데 최근 5일 수급 강도가 자기 이력 하위 — 태린이아빠가 말하는 빈집' },
  full: { key: 'full', label: '이미 채워짐',        short: '채워짐',   color: '#2dce89', bg: 'rgba(45,206,137,.13)', prio: 2, tip: '유동성 공급 + 현재 수급 강도도 상위 — 이미 붐비는 집' },
  bnce: { key: 'bnce', label: '유출 중 일시 유입',  short: '일시유입', color: '#fb6340', bg: 'rgba(251,99,64,.13)',  prio: 1, tip: '기간 평균은 유출인데 최근만 상위 — 공급 컨셉인지 확인 필요' },
  cold: { key: 'cold', label: '소외 · 공급 없음',   short: '소외',     color: '#8898aa', bg: 'rgba(136,152,170,.12)', prio: 0, tip: '기간 평균 유출 + 현재도 하위 — 유동성 공급 컨셉이 아님(빈집 아님)' },
};
const _fmQuadE = (x, y) => x >= 0 ? (y < 0 ? _FM_QE.fill : _FM_QE.full) : (y < 0 ? _FM_QE.cold : _FM_QE.bnce);

/**
 * 종목의 수급오실레이터 시계열 — osc(d) = Σ(d-4..d) 순매수대금 ÷ 당일 시가총액 × 100(%)
 * 분모를 '당일' 시총으로 잡아 기간 중 주가가 크게 변한 종목의 왜곡을 없앤다(전환 모드의 한계 ②).
 * 창이 덜 찬 날(결측 포함)은 버려 5일 합산의 의미를 지킨다.
 */
function _fmOscSeries(s, dates, netOf) {
  const out = [];
  for (let i = _FM_OSC_N - 1; i < dates.length; i++) {
    const cap = s.days[dates[i]]?.cap;
    if (!cap || cap <= 0) continue;
    let sum = 0, hit = 0;
    for (let k = i - _FM_OSC_N + 1; k <= i; k++) {
      const d = s.days[dates[k]];
      const n = netOf(d);
      if (n == null || d.p == null) continue;
      sum += n * d.p; hit++;
    }
    if (hit < _FM_OSC_N) continue;
    out.push({ d: dates[i], v: sum / cap * 100 });
  }
  return out;
}

// 수급 유입/유출 색 (녹=담기, 적=비우기)
const _fmFlowColor = v => v > 0 ? '#2dce89' : v < 0 ? '#f5365c' : 'var(--text3)';

// 현재 노출 대상 창(데이터가 받쳐주는 것만)
const _fmVisibleWins = availDays =>
  _FM_WINS.filter(w => availDays >= w.th || w.k === '1M');

// ── 페이지 셸 ────────────────────────────────────────────────────────────────
function pFlowMap() {
  return `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.9rem;flex-wrap:wrap;gap:8px">
    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
      ${INDUSTRIES.map(i => `<button class="chip${i === FM.ind ? ' active' : ''}" data-fm-ind="${i}" onclick="switchFmInd(this,'${i}')">${i}</button>`).join('')}
    </div>
    <span id="fm-date" style="font-size:calc(11px*var(--m-label));color:var(--text2)"></span>
  </div>
  <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:.75rem">
    <div style="display:flex;gap:4px;align-items:center">
      <span style="font-size:calc(11px*var(--m-label));color:var(--text3);margin-right:2px">지도</span>
      ${[['empty','빈집','유동성은 공급되는데 최근 5일 수급 강도가 비워진 종목 (태린이아빠 로직)'],
         ['gap','전환','이전 구간 누적 vs 최근 구간 — 담다가 비우기 시작한 전환 포착']].map(([k,l,t]) =>
        `<button class="chip${FM.mode === k ? ' active' : ''}" data-fm-mode="${k}" title="${t}" onclick="switchFmMode('${k}')">${l}</button>`).join('')}
    </div>
    <div style="display:flex;gap:4px;align-items:center">
      <span id="fm-win-label" style="font-size:calc(11px*var(--m-label));color:var(--text3);margin-right:2px">기간</span>
      <span id="fm-win-chips" style="display:flex;gap:4px"></span>
    </div>
    <div style="display:flex;gap:4px;align-items:center">
      <span style="font-size:calc(11px*var(--m-label));color:var(--text3);margin-right:2px">투자자</span>
      ${[['both','외국인+기관'],['foreign','외국인'],['inst','기관']].map(([k,l]) =>
        `<button class="chip${FM.inv === k ? ' active' : ''}" data-fm-inv="${k}" onclick="switchFmInv('${k}')">${l}</button>`).join('')}
    </div>
  </div>
  <div id="fm-body">${loadingHTML('수급 집계 중...')}</div>`;
}

// ── 컨트롤 핸들러 ────────────────────────────────────────────────────────────
function switchFmInd(el, ind) {
  if (FM.ind === ind) return;
  FM.ind = ind;
  document.querySelectorAll('[data-fm-ind]').forEach(b =>
    b.classList.toggle('active', b.dataset.fmInd === ind));
  loadFlowMap();
}
function switchFmMode(k) {
  if (FM.mode === k) return;
  FM.mode = k;
  FM.sortCol = (k === 'empty') ? 'quad' : 'med';   // 빈집 모드는 빈집이 위로
  FM.sortDir = -1;
  document.querySelectorAll('[data-fm-mode]').forEach(b =>
    b.classList.toggle('active', b.dataset.fmMode === k));
  _fmRender();   // 재조회 없이 재집계 — 원자료는 동일
}
function switchFmInv(k) {
  if (FM.inv === k) return;
  FM.inv = k;
  document.querySelectorAll('[data-fm-inv]').forEach(b =>
    b.classList.toggle('active', b.dataset.fmInv === k));
  _fmRender();   // 재조회 없이 재집계
}
function switchFmWin(k) {
  if (FM.win === k) return;
  FM.win = k;
  document.querySelectorAll('[data-fm-win]').forEach(b =>
    b.classList.toggle('active', b.dataset.fmWin === k));
  _fmRender();
}
function _fmSort(col) {
  if (FM.sortCol === col) FM.sortDir *= -1;
  else { FM.sortCol = col; FM.sortDir = (col === 'name') ? 1 : -1; }
  _fmRender();
}

// ── 로드 — 선택 산업의 모니터링 종목 수급 원자료 ─────────────────────────────
async function loadFlowMap() {
  const el = document.getElementById('fm-body');
  if (!el) return;

  // 캐시 히트 → 재조회 없이 재집계
  if (FM.raw[FM.ind]) { _fmRender(); return; }

  el.innerHTML = loadingHTML('수급 집계 중...');
  try {
    FM.latest = FM.latest || await getLatestMarketDate();

    const indMap = await getIndustryMap();                 // {code: industry} (모니터링 종목)
    const codes  = Object.keys(indMap).filter(c => indMap[c] === FM.ind);
    if (!codes.length) { el.innerHTML = _fmEmpty(`${FM.ind} 모니터링 종목이 없습니다`); return; }

    // 순매수 존재 구간만 (2026-05-26~). 400일 컷오프로 페이로드 상한.
    const cutoff = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
    const rows = [];
    const CH = 300;
    for (let i = 0; i < codes.length; i += CH) {
      const chunk = codes.slice(i, i + CH);
      const part = await fetchAllPages((s, e) => sb.from('market_data')
        .select('stock_code,corp_name,base_date,price,market_cap,foreign_net_buy,institution_net_buy')
        .in('stock_code', chunk)
        .gte('base_date', cutoff)
        .not('foreign_net_buy', 'is', null)
        // 정렬은 (base_date, stock_code) 총순서 — PK 기준이라 페이지네이션이 결정적.
        // base_date 단독 정렬 시 동일일자 타이가 range 페이지 경계에서 뒤섞여 행 누락/중복 발생
        // (반도체 등 >1000행 산업에서 실측 29행 유실). PK 타이브레이커로 방지.
        .order('base_date', { ascending: true })
        .order('stock_code', { ascending: true })
        .range(s, e));
      rows.push(...part);
    }
    if (!rows.length) { el.innerHTML = _fmEmpty(`${FM.ind} 수급 데이터가 아직 없습니다`); return; }

    // 종목별 날짜맵 + 거래일 집합
    const byCode = {};
    const dateSet = new Set();
    for (const r of rows) {
      dateSet.add(r.base_date);
      let s = byCode[r.stock_code];
      if (!s) s = byCode[r.stock_code] = { code: r.stock_code, name: r.corp_name || r.stock_code, days: {}, cap: null };
      s.days[r.base_date] = {
        f: r.foreign_net_buy, i: r.institution_net_buy, p: r.price, cap: r.market_cap,
      };
      if (r.market_cap != null) s.cap = r.market_cap;   // 마지막(최신) 유효 시총
    }
    const dates = [...dateSet].sort();                  // asc

    FM.raw[FM.ind] = { dates, byCode };
    _fmRender();
  } catch (e) {
    console.error('[FlowMap]', e);
    if (el) el.innerHTML = _fmEmpty('집계 실패: ' + (e.message || e));
  }
}

// 캐시 무효화 — 시황 새로고침(refreshInvestment→loadInvestment)·페이지 이탈에서 호출.
// loadInvestment는 Zone C 내용을 다시 그리지 않으므로(수급 지도는 펼칠 때만 지연 로드),
// 펼쳐진 상태면 여기서 직접 재조회해야 새로고침 후에도 어제 집계가 남는 일이 없다.
// 산업/기간/투자자 선택은 사용자 의도라 유지하고, 원자료와 기준일만 버린다.
function resetFlowMap(reload = false) {
  FM.raw    = {};
  FM.latest = null;
  if (!reload) return;
  const zone = document.getElementById('inv-zonec');
  if (zone && zone.style.display !== 'none' && document.getElementById('fm-body')) loadFlowMap();
}

const _fmEmpty = msg =>
  `<div style="padding:2rem 1rem;text-align:center;color:var(--text2);font-size:calc(13px*var(--m-body))">${escAttr(msg)}</div>`;

// ── 집계 → 렌더 ──────────────────────────────────────────────────────────────
function _fmRender() {
  const el = document.getElementById('fm-body');
  if (!el) return;
  const raw = FM.raw[FM.ind];
  if (!raw) { loadFlowMap(); return; }

  const availDays = raw.dates.length;

  // 창 칩 재구성 (데이터가 받쳐주는 것만)
  const wins = _fmVisibleWins(availDays);
  if (!wins.some(w => w.k === FM.win)) FM.win = wins.length ? wins[wins.length - 1].k : '1M';
  const winChips = document.getElementById('fm-win-chips');
  if (winChips) winChips.innerHTML = wins.map(w =>
    `<button class="chip${w.k === FM.win ? ' active' : ''}" data-fm-win="${w.k}" onclick="switchFmWin('${w.k}')">${w.k}</button>`).join('');
  const winLbl = document.getElementById('fm-win-label');
  if (winLbl) winLbl.textContent = (FM.mode === 'empty') ? '비교이력' : '기간';

  if (availDays < 2) { el.innerHTML = _fmEmpty(`${FM.ind} — 수급 이력이 2거래일 미만입니다`); return; }

  // 창 전체(spanN)에서 최근 구간(shN)을 떼어내 가로축 구간(preN)을 만든다 — 두 축 비중첩.
  // shN은 창을 넘을 수 없고, 가로가 0일이 되지 않도록 최소 1거래일은 남긴다.
  const winDef = _FM_WINS.find(w => w.k === FM.win) || _FM_WINS[1];
  const spanN = Math.min(winDef.med, availDays);
  const shN   = Math.min(winDef.sh, Math.max(1, spanN - 1));
  const preN  = spanN - shN;
  const preDates = raw.dates.slice(-spanN, -shN);   // 가로축 — 이전 구간
  const shDates  = raw.dates.slice(-shN);           // 세로축 — 최근 구간
  const startDate = preDates[0];

  // 투자자별 순매수 주식수 선택
  const netOf = d => {
    if (!d) return null;
    const f = d.f, i = d.i;
    if (FM.inv === 'foreign') return f == null ? null : f;
    if (FM.inv === 'inst')    return i == null ? null : i;
    if (f == null && i == null) return null;
    return (f || 0) + (i || 0);
  };

  if (FM.mode === 'empty') { _fmRenderEmpty(el, raw, availDays, spanN, netOf); return; }

  const pts = [];
  for (const s of Object.values(raw.byCode)) {
    const cap = s.cap;
    if (!cap || cap <= 0) continue;

    let preWon = 0, shWon = 0, preHit = 0;
    for (const dt of preDates) {
      const d = s.days[dt];
      const n = netOf(d);
      if (n == null || d.p == null) continue;
      preWon += n * d.p; preHit++;
    }
    for (const dt of shDates) {
      const d = s.days[dt];
      const n = netOf(d);
      if (n == null || d.p == null) continue;
      shWon += n * d.p;
    }
    if (preHit === 0) continue;   // 이 구간에 데이터 없음

    const x = preWon / cap * 100;   // 이전 구간 ÷ 시총 (%)
    const y = shWon  / cap * 100;   // 최근 구간 ÷ 시총 (%)
    const q = _fmQuad(x, y);
    pts.push({
      code: s.code, name: s.name, cap,
      preWon, shWon, x, y, q,
      short: preHit < preN * 0.9,   // 구간보다 데이터가 뚜렷이 짧음(늦게 편입/상장) — 하루치 결측은 무시
      hit: preHit,
    });
  }

  // 기준일 배지
  setAsOf('fm-date', FM.latest);
  const dEl = document.getElementById('fm-date');
  if (dEl) dEl.innerHTML =
    `<span style="color:var(--text3)">${startDate} ~ ${FM.latest}</span> · 이전 ${preN}일 + 최근 ${shN}일 · <span style="color:var(--text2)">보유 ${availDays}거래일</span>`;

  if (!pts.length) { el.innerHTML = _fmEmpty(`${FM.ind} — 선택 조건에 표시할 종목이 없습니다`); return; }

  const topIn  = pts.slice().sort((a, b) => b.x - a.x)[0];
  const topOut = pts.slice().sort((a, b) => a.x - b.x)[0];
  const hi = [];
  if (topIn && topIn.x > 0)
    hi.push(`<span style="color:var(--text2)">가장 많이 담긴</span> <b style="color:var(--text1)">${escapeHtml(topIn.name)}</b> <span style="color:#2dce89;font-weight:700">${fmtPct(topIn.x)}</span>`);
  if (topOut && topOut.x < 0)
    hi.push(`<span style="color:var(--text2)">가장 많이 비워진</span> <b style="color:var(--text1)">${escapeHtml(topOut.name)}</b> <span style="color:#f5365c;font-weight:700">${fmtPct(topOut.x)}</span>`);

  const L = {
    quads: [_FM_Q.ff, _FM_Q.fe, _FM_Q.ef, _FM_Q.ee],
    hi,
    sub:   `가로=이전 ${preN}일 누적÷시총(최근 ${shN}일 제외) · 세로=최근 ${shN}일 · 버블=시총 · 클릭→종목 상세`,
    xAxis: `← 빈집 (순유출)   ·   이전 ${preN}일 누적 ÷ 시총   ·   (순유입) 찬집 →`,
    yAxis: `← 비우기   최근 ${shN}일   담기 →`,
    corners: [
      { txt: '찬집·담는중 ▲', color: _FM_Q.ff.color },   // 우상
      { txt: '찬집·비우기 ▼', color: _FM_Q.fe.color },   // 우하
      { txt: '▲ 빈집·담기',   color: _FM_Q.ef.color },   // 좌상
      { txt: '▼ 빈집·비우기', color: _FM_Q.ee.color },   // 좌하
    ],
    tipOf: p => `${p.name} · 이전 ${preN}일 ${fmtPct(p.x)} (${fmtWon(p.preWon, true)}) · 최근 ${shN}일 ${fmtPct(p.y)} · ${p.q.short}`,
    cols: [
      { key: 'name', label: '종목', align: 'left', w: 'minmax(96px,1.3fr)', val: p => p.name, cell: _fmNameCell },
      { key: 'cap', label: '시총', align: 'right', w: 'minmax(64px,0.8fr)', val: p => p.cap,
        cell: p => `<div style="text-align:right;font-size:calc(11px*var(--m-label));color:var(--text2)">${fmtCap(p.cap)}</div>` },
      { key: 'med', label: `이전 ${preN}일 ÷시총`, align: 'right', w: 'minmax(96px,1.15fr)', val: p => p.x,
        cell: p => `<div style="text-align:right">
            <div style="font-size:calc(13px*var(--m-body));font-weight:700;color:${_fmFlowColor(p.x)}">${fmtPct(p.x)}</div>
            <div style="font-size:calc(10px*var(--m-label));color:var(--text3)">${fmtWon(p.preWon, true)}</div>
          </div>` },
      { key: 'sh', label: `최근 ${shN}일 ÷시총`, align: 'right', w: 'minmax(96px,1.15fr)', val: p => p.y,
        cell: p => `<div style="text-align:right">
            <div style="font-size:calc(13px*var(--m-body));font-weight:700;color:${_fmFlowColor(p.y)}">${fmtPct(p.y)}</div>
            <div style="font-size:calc(10px*var(--m-label));color:var(--text3)">${fmtWon(p.shWon, true)}</div>
          </div>` },
      // 같은 사분면 안에서는 누적이 큰 종목이 위로 (prio 간격 1000 > |x| 범위)
      { key: 'quad', label: '구분', align: 'center', w: 'minmax(88px,1.05fr)', val: p => p.q.prio * 1000 + p.x,
        cell: p => `<div style="text-align:center">
            <span title="${escAttr(p.q.tip)}" style="font-size:calc(10.5px*var(--m-label));font-weight:700;color:${p.q.color};background:${p.q.bg};border-radius:4px;padding:2px 6px;white-space:nowrap">${p.q.short}</span>
          </div>` },
    ],
    notes: [
      `순매매 <b>수량 × 종가</b> 환산이라 확정 대금과 소수 % 오차가 있습니다. 시총 대비 비율(순위)로만 씁니다.`,
      `분모는 <b>현재 시총</b> — 기간 중 크게 오른 종목은 비율이 과소평가됩니다. (빈집 모드는 당일 시총을 씁니다)`,
      `가로=<b>이전 ${preN}거래일</b>(${spanN}일 창에서 최근 ${shN}일을 뺀 구간) 누적, 세로=<b>최근 ${shN}거래일</b>. 두 축은 기간이 겹치지 않아 "이전에 찼는데 지금 비운다"가 독립적으로 읽힙니다.`,
      `원점 근처 종목은 이름표가 겹쳐 생략됩니다 — 점에 올리면 뜨고, 표에는 전부 있습니다. 이름 옆 <b>nd</b> 는 데이터가 가로 구간보다 짧다는 표시.`,
      `순매수는 <b>모니터링 종목</b>만 수집되고 market_data 보존이 <b>90일</b>이라 창은 최대 ${availDays}거래일입니다.`,
    ],
  };

  el.innerHTML =
    _fmSummary(pts, L) +
    `<div style="display:flex;flex-wrap:wrap;gap:0;align-items:stretch">
       <div style="flex:2 1 380px;min-width:320px;padding:4px 8px 8px;box-sizing:border-box">
         ${_fmScatter(pts, L)}
       </div>
       <div style="flex:3 1 460px;min-width:330px;border-left:1px solid var(--border);box-sizing:border-box">
         ${_fmTable(pts, L)}
       </div>
     </div>` +
    _fmFootnotes(L.notes);
}

// ══════════════════════════════════════════════════════════════════════════════
//  렌더 공통부 — 모드는 라벨 묶음(L)만 갈아끼우고 요약·산점도·표는 공유한다.
//  L = { quads, hi, sub, xAxis, yAxis, corners, yMax, tipOf, cols, notes }
// ══════════════════════════════════════════════════════════════════════════════

// 오실레이터는 ±0.5% 스케일이라 fmtPct(소수1)로는 전부 0.0%로 뭉갠다 → 소수 2자리 전용
const _fmPct2 = v => (v == null || isNaN(v)) ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

// 표 첫 칸(종목명 + 보유/관심 배지 + 데이터 짧음 표시) — 모드 공용
const _fmNameCell = p => `
  <div style="min-width:0;display:flex;align-items:center;gap:5px">
    <span style="font-size:calc(12px*var(--m-sub));font-weight:600;color:var(--text1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(p.name)}</span>
    ${typeof wlBadge === 'function' ? wlBadge(p.code) : ''}
    ${p.short ? `<span title="데이터 ${p.hit}거래일 — 비교 구간보다 짧음" style="font-size:calc(10px*var(--m-label));color:#f5a623;flex-shrink:0">${p.hit}d</span>` : ''}
  </div>`;

// ── ① 요약 타일 (사분면 분포 + 하이라이트) ───────────────────────────────────
function _fmSummary(pts, L) {
  const cnt = {};
  pts.forEach(p => { cnt[p.q.key] = (cnt[p.q.key] || 0) + 1; });

  const tile = q => `
    <div style="flex:1 1 120px;min-width:112px;padding:8px 10px;border-radius:8px;background:${q.bg};border:1px solid ${q.color}33" title="${escAttr(q.tip)}">
      <div style="font-size:calc(11px*var(--m-label));color:${q.color};font-weight:700;margin-bottom:1px">${q.short}</div>
      <div style="font-size:calc(18px*var(--m-title));font-weight:800;color:var(--text1);line-height:1.1">${cnt[q.key] || 0}<span style="font-size:calc(11px*var(--m-label));color:var(--text3);font-weight:500">종목</span></div>
    </div>`;

  return `
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:.5rem">
    ${L.quads.map(tile).join('')}
  </div>
  ${L.hi.length ? `<div style="font-size:calc(12px*var(--m-sub));color:var(--text2);margin-bottom:.5rem;display:flex;flex-wrap:wrap;gap:14px">${L.hi.join('<span style="color:var(--border)">·</span>')}</div>` : ''}`;
}

// ── ② 사분면 산점도 (SVG) — 차트라 폰트 bare px ─────────────────────────────
function _fmAxisMax(vals) {
  const a = vals.map(v => Math.abs(v)).filter(v => v > 1e-9).sort((x, y) => x - y);
  if (!a.length) return 1;
  const q90 = a[Math.min(a.length - 1, Math.floor(a.length * 0.9))];
  const mx  = a[a.length - 1];
  return Math.max(q90 * 1.15, mx * 0.5, 0.3);   // 이상치 1개가 구름을 뭉개지 않게 p90 기준
}

function _fmScatter(pts, L) {
  const W = 470, H = 360, ML = 30, MR = 30, MT = 30, MB = 34;
  const pw = W - ML - MR, ph = H - MT - MB;
  const x0 = ML, x1 = W - MR, y0 = MT, y1 = H - MB;
  const cx = x0 + pw / 2, cy = y0 + ph / 2;

  const xMax = _fmAxisMax(pts.map(p => p.x));
  const yMax = L.yMax || _fmAxisMax(pts.map(p => p.y));
  const clamp = (v, m) => Math.max(-m, Math.min(m, v));
  const mapX = v => cx + clamp(v, xMax) / xMax * (pw / 2);
  const mapY = v => cy - clamp(v, yMax) / yMax * (ph / 2);

  const capMax = Math.max(...pts.map(p => p.cap || 0), 1);
  const rOf = c => 3 + Math.sqrt((c || 0) / capMax) * 9;

  // 사분면 배경 틴트 — corners(우상·우하·좌상·좌하) 색을 그대로 옅게 깐다
  const [TR, BR, TL, BL] = L.corners;
  const q = (x, y, w, h, c) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}" fill-opacity=".055"/>`;
  const bg =
    q(cx, y0, x1 - cx, cy - y0, TR.color) +
    q(cx, cy, x1 - cx, y1 - cy, BR.color) +
    q(x0, y0, cx - x0, cy - y0, TL.color) +
    q(x0, cy, cx - x0, y1 - cy, BL.color);

  // 중심 십자선
  const cross =
    `<line x1="${cx}" y1="${y0}" x2="${cx}" y2="${y1}" stroke="rgba(255,255,255,.16)" stroke-width="1" stroke-dasharray="3 3"/>` +
    `<line x1="${x0}" y1="${cy}" x2="${x1}" y2="${cy}" stroke="rgba(255,255,255,.16)" stroke-width="1" stroke-dasharray="3 3"/>`;

  // 코너 라벨
  const corner = (x, y, anchor, txt, c) =>
    `<text x="${x}" y="${y}" font-size="10" font-weight="700" fill="${c}" text-anchor="${anchor}" opacity=".85">${escAttr(txt)}</text>`;
  const corners =
    corner(x1 - 3, y0 + 11, 'end',   TR.txt, TR.color) +
    corner(x1 - 3, y1 - 4,  'end',   BR.txt, BR.color) +
    corner(x0 + 3, y0 + 11, 'start', TL.txt, TL.color) +
    corner(x0 + 3, y1 - 4,  'start', BL.txt, BL.color);

  // 보조선 (빈집권 임계 등) — 중심 십자선과 구분되게 색을 준다
  const guides = (L.guides || []).map(g =>
    `<line x1="${x0}" y1="${mapY(g.y).toFixed(1)}" x2="${x1}" y2="${mapY(g.y).toFixed(1)}" stroke="${g.color}" stroke-width="1" stroke-dasharray="5 4" opacity=".5"/>` +
    `<text x="${x1 - 3}" y="${(mapY(g.y) - 3).toFixed(1)}" font-size="8.5" fill="${g.color}" text-anchor="end" opacity=".85">${escAttr(g.txt)}</text>`).join('');

  // 축 라벨
  const axes =
    `<text x="${cx}" y="${y1 + 24}" font-size="9.5" fill="#8b91a7" text-anchor="middle">${escAttr(L.xAxis)}</text>` +
    `<text x="${x0 - 4}" y="${cy}" font-size="9.5" fill="#8b91a7" text-anchor="middle" transform="rotate(-90 ${x0 - 4} ${cy})">${escAttr(L.yAxis)}</text>`;

  // 라벨 슬롯팅 — 원점에서 먼 순으로 최대 18개, 세로 겹침 회피
  pts.forEach(p => {
    p._px = mapX(p.x); p._py = mapY(p.y);
    p._d2 = (p.x / xMax) * (p.x / xMax) + (p.y / yMax) * (p.y / yMax);   // 축 스케일 정규화 거리
  });
  const cand = pts.slice().sort((a, b) => b._d2 - a._d2);
  const occ = { L: [], R: [] };
  const SLOT = 12, maxLbl = Math.min(18, cand.length);
  let placed = 0;
  for (const p of cand) {
    if (placed >= maxLbl) break;
    const side = p._px < cx ? 'L' : 'R';
    let ly = null;
    for (let step = 0; step <= 9 && ly === null; step++) {
      for (const dir of (step === 0 ? [0] : [-1, 1])) {
        const t = p._py + dir * step * SLOT;
        if (t < y0 + 7 || t > y1 - 3) continue;
        if (occ[side].every(u => Math.abs(u - t) >= SLOT - 1)) { ly = t; break; }
      }
    }
    if (ly === null) continue;
    occ[side].push(ly); p._ly = ly; p._side = side; placed++;
  }

  const bubbles = pts.map(p => {
    const r = rOf(p.cap);
    const outX = Math.abs(p.x) > xMax, outY = Math.abs(p.y) > yMax;   // 축 밖 이상치
    let lbl = '';
    if (p._ly != null) {
      const anchor = p._side === 'L' ? 'end' : 'start';
      const lx = p._side === 'L' ? p._px - r - 3 : p._px + r + 3;
      const leader = Math.abs(p._ly - p._py) > 6
        ? `<line x1="${lx}" y1="${(p._ly - 3).toFixed(1)}" x2="${p._px.toFixed(1)}" y2="${p._py.toFixed(1)}" stroke="${p.q.color}" stroke-width="0.6" opacity=".28"/>` : '';
      lbl = leader +
        `<text x="${lx.toFixed(1)}" y="${p._ly.toFixed(1)}" font-size="10" font-weight="600" text-anchor="${anchor}" fill="#eef0f6" style="paint-order:stroke;stroke:#12141c;stroke-width:3px">${escAttr(p.name)}${p.short ? '<tspan fill="#f5a623" font-size="8"> ' + p.hit + 'd</tspan>' : ''}</text>`;
    }
    const edge = (outX || outY)
      ? `<circle cx="${p._px.toFixed(1)}" cy="${p._py.toFixed(1)}" r="${(r + 2).toFixed(1)}" fill="none" stroke="${p.q.color}" stroke-width="1" stroke-dasharray="2 2" opacity=".7"/>` : '';
    return `<g data-stock-open="${p.code}" data-stock-name="${escAttr(p.name)}" data-stock-tab="market" style="cursor:pointer"><title>${escAttr(L.tipOf(p))}</title>
      ${edge}<circle cx="${p._px.toFixed(1)}" cy="${p._py.toFixed(1)}" r="${r.toFixed(1)}" fill="${p.q.color}" fill-opacity=".82" stroke="${p.q.color}" stroke-width="1.1"/>
      ${lbl}</g>`;
  }).join('');

  return `<div style="font-size:calc(11px*var(--m-label));font-weight:600;color:var(--text1);padding:2px 2px 4px">
      수급 지도 <span style="font-weight:400;color:var(--text2)">${L.sub}</span>
    </div>
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;max-width:560px;display:block;margin:0 auto" xmlns="http://www.w3.org/2000/svg">
      ${bg}${cross}${guides}${corners}${axes}${bubbles}
    </svg>`;
}

// ── ③ 정렬 가능 표 ───────────────────────────────────────────────────────────
function _fmTable(pts, L) {
  const cols = L.cols;
  const col  = cols.find(c => c.key === FM.sortCol) || cols[0];
  const sorted = pts.slice().sort((a, b) => {
    const ka = col.val(a), kb = col.val(b);
    if (typeof ka === 'string') return FM.sortDir === 1 ? ka.localeCompare(kb) : kb.localeCompare(ka);
    return FM.sortDir === -1 ? (kb - ka) : (ka - kb);
  });

  const arrow = k => FM.sortCol === k ? (FM.sortDir === -1 ? ' ▼' : ' ▲') : '';
  const COLS  = cols.map(c => c.w).join(' ');

  const header =
    `<div style="display:grid;grid-template-columns:${COLS};gap:8px;align-items:center;padding:8px 12px;border-bottom:1px solid var(--border);background:var(--bg2)">
      ${cols.map(c => `<span onclick="_fmSort('${c.key}')" title="${escAttr(c.tip || '')}" style="cursor:pointer;user-select:none;font-size:10.5px;text-align:${c.align};color:${FM.sortCol === c.key ? 'var(--tg)' : 'var(--text2)'}">${escapeHtml(c.label)}${arrow(c.key)}</span>`).join('')}
    </div>`;

  const body = sorted.map((p, idx) =>
    `<div class="stock-row" data-stock-open="${p.code}" data-stock-name="${escAttr(p.name)}" data-stock-tab="market"
        style="display:grid;grid-template-columns:${COLS};gap:8px;align-items:center;padding:8px 12px;border-bottom:1px solid var(--border);background:${idx % 2 ? 'rgba(255,255,255,.02)' : 'transparent'}">
        ${cols.map(c => c.cell(p)).join('')}
      </div>`).join('');

  return header + body;
}

// ── ④ 각주 (한계 명시) ───────────────────────────────────────────────────────
const _fmFootnotes = notes =>
  `<div style="padding:10px 12px;border-top:1px solid var(--border);font-size:calc(10.5px*var(--m-label));color:var(--text3);line-height:1.7">
    ${notes.map(n => `<div>※ ${n}</div>`).join('')}
  </div>`;

// ══════════════════════════════════════════════════════════════════════════════
//  빈집 모드 — 태린이아빠 "수급빈집" 로직
//    가로(X) = 유동성 공급 강도 : 비교 이력 구간의 수급오실레이터 평균(%)
//              → 이 종목에 평소 돈이 들어오는가 (그의 1단계 '유동성 공급 컨셉')
//    세로(Y) = 현재 채움도      : 오늘 오실레이터가 자기 이력에서 놓인 백분위 − 50
//              → 0 아래면 "비워져 있다"(3단계). 절대값이 아니라 자기 과거 대비로 본다.
//    ★ 우하(공급 O · 지금 빔) = 빈집. 하자만 없으면 채워질 자리.
// ══════════════════════════════════════════════════════════════════════════════
function _fmRenderEmpty(el, raw, availDays, spanN, netOf) {
  if (availDays < _FM_OSC_N + 3) {
    el.innerHTML = _fmEmpty(`${FM.ind} — ${_FM_OSC_N}일 오실레이터를 만들 이력이 부족합니다 (보유 ${availDays}거래일)`);
    return;
  }
  const cutIdx  = Math.max(0, raw.dates.length - spanN);
  const cutDate = raw.dates[cutIdx];
  // 이 구간에서 기대되는 오실레이터 점 수 — 앞쪽 4일은 창이 덜 차 값이 안 나온다
  const expect  = raw.dates.length - Math.max(cutIdx, _FM_OSC_N - 1);

  const pts = [];
  for (const s of Object.values(raw.byCode)) {
    const ser = _fmOscSeries(s, raw.dates, netOf).filter(o => o.d >= cutDate);
    if (ser.length < 8) continue;                                      // 백분위를 말할 표본이 안 됨
    const cur = ser[ser.length - 1].v;
    const avg = ser.reduce((a, o) => a + o.v, 0) / ser.length;
    const pct = ser.filter(o => o.v < cur).length / ser.length * 100;   // 0~100
    pts.push({
      code: s.code, name: s.name, cap: s.cap,
      x: avg,           // 유동성 공급 강도
      y: pct - 50,      // 현재 채움도 (음수 = 비어 있음)
      cur, avg, pct,
      q: _fmQuadE(avg, pct - 50),
      short: ser.length < expect * 0.9,
      hit: ser.length,
    });
  }

  // 기준일 배지 — 비교 이력 구간을 그대로 노출
  const dEl = document.getElementById('fm-date');
  if (dEl) dEl.innerHTML =
    `<span style="color:var(--text3)">${cutDate} ~ ${FM.latest}</span> · ${_FM_OSC_N}일 롤링 · 비교이력 ${Math.min(spanN, availDays)}거래일 · <span style="color:var(--text2)">보유 ${availDays}거래일</span>`;

  if (!pts.length) { el.innerHTML = _fmEmpty(`${FM.ind} — 선택 조건에 표시할 종목이 없습니다`); return; }

  // 업종 단위 유동성 공급 여부 (그의 1단계) — 업종 평균 오실레이터의 부호
  const indAvg   = pts.reduce((a, p) => a + p.x, 0) / pts.length;
  const supplied = indAvg >= 0;
  const hi = [
    `<span style="color:var(--text2)">${escapeHtml(FM.ind)} 유동성</span> <b style="color:${supplied ? '#2dce89' : '#f5365c'}">${supplied ? '공급 중' : '유출 중'}</b> <span style="color:var(--text3)">(업종 평균 ${_fmPct2(indAvg)})</span>`,
  ];
  const best = pts.filter(p => p.q.key === 'fill').sort((a, b) => a.y - b.y)[0];
  if (best)
    hi.push(`<span style="color:var(--text2)">가장 비어 있는 빈집</span> <b style="color:var(--text1)">${escapeHtml(best.name)}</b> <span style="color:#f59e0b;font-weight:700">하위 ${Math.round(best.pct)}%</span>`);

  const L = {
    quads: [_FM_QE.fill, _FM_QE.full, _FM_QE.bnce, _FM_QE.cold],
    hi,
    sub:   `가로=유동성 공급 강도(${_FM_OSC_N}일 오실레이터 평균) · 세로=자기 이력 대비 현재 채움도 · 버블=시총 · 클릭→종목 상세`,
    xAxis: `← 유출   ·   유동성 공급 강도 (${_FM_OSC_N}일 수급 ÷ 시총, 평균)   ·   공급 →`,
    yAxis: `← 비어있음   자기 이력 대비   꽉참 →`,
    yMax:  50,
    guides: [{ y: _FM_EMPTY_TH - 50, txt: `하위 ${_FM_EMPTY_TH}% — 빈집권`, color: _FM_QE.fill.color }],
    corners: [
      { txt: '채워짐 ▲',   color: _FM_QE.full.color },   // 우상
      { txt: '빈집 ▼',      color: _FM_QE.fill.color },   // 우하
      { txt: '▲ 일시유입', color: _FM_QE.bnce.color },   // 좌상
      { txt: '▼ 소외',     color: _FM_QE.cold.color },   // 좌하
    ],
    tipOf: p => `${p.name} · 공급강도 ${_fmPct2(p.x)} · 현재 ${_fmPct2(p.cur)} (이력 하위 ${Math.round(p.pct)}%) · ${p.q.short}`,
    cols: [
      { key: 'name', label: '종목', align: 'left', w: 'minmax(96px,1.3fr)', val: p => p.name, cell: _fmNameCell },
      { key: 'cap', label: '시총', align: 'right', w: 'minmax(60px,0.75fr)', val: p => p.cap,
        cell: p => `<div style="text-align:right;font-size:calc(11px*var(--m-label));color:var(--text2)">${fmtCap(p.cap)}</div>` },
      { key: 'med', label: '공급강도', align: 'right', w: 'minmax(88px,1.05fr)', val: p => p.x,
        tip: `비교 이력 구간의 ${_FM_OSC_N}일 오실레이터 평균 — 이 종목에 평소 돈이 들어오는가`,
        cell: p => `<div style="text-align:right">
            <div style="font-size:calc(13px*var(--m-body));font-weight:700;color:${_fmFlowColor(p.x)}">${_fmPct2(p.x)}</div>
            <div style="font-size:calc(10px*var(--m-label));color:var(--text3)">평균</div>
          </div>` },
      { key: 'sh', label: '현재 채움도', align: 'right', w: 'minmax(96px,1.15fr)', val: p => p.y,
        tip: '오늘 오실레이터가 자기 이력에서 놓인 위치 — 하위일수록 빈집',
        cell: p => {
          const deep = p.pct <= _FM_EMPTY_TH;   // 충분히 비었다 — ★
          return `<div style="text-align:right">
            <div style="font-size:calc(13px*var(--m-body));font-weight:${deep ? 800 : 700};color:${p.y < 0 ? '#f59e0b' : '#2dce89'}">${deep ? '★ ' : ''}하위 ${Math.round(p.pct)}%</div>
            <div style="font-size:calc(10px*var(--m-label));color:var(--text3)">${_fmPct2(p.cur)}</div>
          </div>`;
        } },
      // 같은 사분면 안에서는 더 비워진 종목이 위로 (prio 간격 1000 > |y| 최대 50)
      { key: 'quad', label: '구분', align: 'center', w: 'minmax(84px,1fr)', val: p => p.q.prio * 1000 - p.y,
        cell: p => `<div style="text-align:center">
            <span title="${escAttr(p.q.tip)}" style="font-size:calc(10.5px*var(--m-label));font-weight:700;color:${p.q.color};background:${p.q.bg};border-radius:4px;padding:2px 6px;white-space:nowrap">${p.q.short}</span>
          </div>` },
    ],
    notes: [
      `<b>출처</b> — 유튜브 <b>태린이아빠</b> '수급빈집'. ① 유동성이 공급되는 컨셉을 고르고 ② 수출데이터·미국시장·선행지표·컨센서스에 하자가 없는지 보고 ③ 그런데도 수급이 비워져 있으면 채워질 자리로 본다. ②는 사람이 판단할 몫이라 이 지도는 ①③만 계산합니다.`,
      `<b>원본과의 일치</b> — 투자자 분류(외인+기관)·<b>순매수</b>·${_FM_OSC_N}일 롤링·÷시가총액·% 변환이 모두 원본과 같습니다. 원 영상의 오실레이터가 음수로 내려가고(유한양행 −0.38%), 워크북 시트가 <b>외인·기관·기외·시기외</b>로만 구성된 것을 화면에서 확인했습니다.`,
      `<b>남은 차이 한 가지</b> — 금액 산출입니다. 원본은 거래소 <b>순매수 금액</b>을 직접 쓰고, 우리 원천(KIS inquire-investor)은 수량만 주므로 <b>순매수 수량 × 종가</b>로 환산합니다 — 확정 대금과 소수 % 오차가 납니다.`,
      `사분면은 <b>중앙값(하위 50%)</b>으로 가르지만, 실제로 "비었다"고 부를 만한 건 <b>하위 ${_FM_EMPTY_TH}% 이하</b>입니다 — 표의 <b>★</b>와 차트 점선이 그 선입니다. 중앙값 바로 아래는 빈집권일 뿐 신호가 약합니다.`,
      `세로는 절대 수치가 아니라 <b>그 종목 자신의 이력 백분위</b>입니다. 대형주일수록 시총 대비 비중이 작아 종목 간 절대값 비교는 의미가 없습니다.`,
      `분모가 <b>당일 시가총액</b>이라 기간 중 주가가 크게 오른 종목도 왜곡되지 않습니다(전환 모드와 다른 점).`,
      `빈집은 <b>채워질 가능성에 거는 것</b>이지 확정이 아닙니다. 원저자도 시장 리스크는 업종쏠림지수·코스닥 3/5/10일선 이탈로 따로 관리하라고 말합니다.`,
      `수급은 <b>모니터링 종목</b>만 수집되고 market_data 보존이 <b>90일</b>이라 비교 이력은 최대 ${availDays}거래일입니다.`,
    ],
  };

  el.innerHTML =
    _fmSummary(pts, L) +
    `<div style="display:flex;flex-wrap:wrap;gap:0;align-items:stretch">
       <div style="flex:2 1 380px;min-width:320px;padding:4px 8px 8px;box-sizing:border-box">
         ${_fmScatter(pts, L)}
       </div>
       <div style="flex:3 1 460px;min-width:330px;border-left:1px solid var(--border);box-sizing:border-box">
         ${_fmTable(pts, L)}
       </div>
     </div>` +
    _fmFootnotes(L.notes);
}
