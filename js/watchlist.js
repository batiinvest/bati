// 투자노트 — 원본 포트폴리오 표 (태린이아빠 「포트폴리오 관리샘플(매일업데이트)」 국장 시트) — 10-04 전면 교체
//
// [원본 열] NO · CODE · 시장 · 산업구분 · 주요생산제품 · 종목명 · 시가총액 · 현재가 · PER(2023A~2028E) · 목표PE ·
//   PBR(2023A~2025A·최근) · 목표PB · 추정 목표가 · 기대수익률 · 시총 비중 · 현재포트 · 목표비중 · 비중 · 매입가 · 수익률 ·
//   편입가능 · 현보유 · 편입비 · 증감(수량) · 평가액(억)   + 위 헤지 칸(인버스·레버리지) · 아래 묶음별 목표비중 합 · 운용 규칙 메모
// [원본 수식]
//   기준가 = 순자산 ÷ 원본좌수 × 1000, 수익률 = (기준가 − 1000) ÷ 1000, 편입비(위) = 주식평가액 ÷ 순자산
//   비중 = 평가액 ÷ 순자산 · 수익률 = (현재가 − 매입가) ÷ 매입가 · 편입가능 = 순자산 × 목표비중 ÷ 현재가
//   편입비 = 현보유 ÷ 편입가능 · 증감 = 편입가능 − 현보유 · 평가액 = 현보유 × 현재가
//   PER(추정 연도) = 현재가 ÷ 추정 EPS · 목표PE = 컨센 목표주가 ÷ (2026E·2027E EPS 평균) · 목표PB = 컨센 목표주가 ÷ BPS
//   추정 목표가 = (목표PE × 2027E EPS 와 목표PB × BPS 의 평균, 한쪽만 있으면 그 값) · 기대수익률 = 추정 목표가 ÷ 현재가 − 1
//   시총 비중 = 시가총액 ÷ 코스피·코스닥 전체 시가총액 · 거래소/코스닥 = 시장별 목표비중 합 · 현금(아래) = 100% − 목표비중 합
// [10-04 사용자 결정]
//   · 순자산 자동 = Σ(현보유 × 현재가) + 현금 (원본은 순자산을 손으로 고침). 좌수는 입출금 때 그때 기준가로 늘고 준다
//     (portfolio_flows — 원본에 없는 부분), 일별 기록은 백엔드 collect_portfolio_nav.py(평일 16:30) → portfolio_nav
//   · 입력은 원본처럼 표에 직접: 현재포트·목표비중·현보유·매입가·묶음·헤지, 현금도 직접
//   · 원본에 없는 기존 기능 중 '매매 복기·청산 기록'만 남김(오늘 할 일·종목 메모 드로어·벤치마크·집중도·거래 기록은 없앰)
//   · 묶음은 종목마다 직접 이름을 적는다 · 밸류에이션 열은 원본 그대로, 데이터 없으면 빈칸
// [데이터] 앱에 있는 것으로 채움 — 원본(데이터가이드)과 다른 점
//   · 산업구분 = WICS 중분류(원본은 원저자 분류), 주요생산제품 = companies.product
//   · 실적 연도 PER = KIS 추정실적표의 PER, 실적 연도 PBR = PER × ROE ÷ 100 (P/B = P/E × E/B), 최근 PBR·BPS = KIS 현재가 시세
//   · 추정 EPS = KIS 추정실적(2개년, 약 200종목) — 2028E는 없음 · 컨센 목표주가 = 증권사별 최근 90일 목표가의 평균
//   · 시세 없는 종목(ETF 등 헤지 칸)의 현재가 = 최근 portfolio_nav.detail(장 마감 뒤 KIS 종가)
// 데이터: watchlist(+target_weight·cur_port·bucket·hedge·opened_at), app_config portfolio_cash, portfolio_flows,
//         portfolio_nav, trade_journal — sql/portfolio_book.sql
// 의존: config.js (sb, fetchPagesParallel, escapeHtml, escAttr, escJsStr, chgColor, fmtWon, toast, loadingHTML,
//       emptyHTML, errorHTML, kstToday, offsetDate, getLatestMarketDate, CACHE, _ICO)

const WL = { tab: 'book', prefill: null, data: null };
const WL_CASH_KEY = 'portfolio_cash';
const WL_TP_DAYS = 90;                     // 컨센 목표주가 — 증권사별 최근 목표가(이 날 수 안)의 평균
const WL_MKT = { KOSPI: 'KS', KOSDAQ: 'KQ', KONEX: 'KN' };
const WL_YEARS_A = ['2023', '2024', '2025'], WL_YEARS_E = ['2026', '2027', '2028'];

// 원본 '국장' 시트 아래 메모(H46~H86) 그대로
const WL_RULES = [
  ['1. 사전확률을 높이는 기준', [
    '1) 변동성 모멘텀 상위 섹터 또는 상대강도 상위 섹터 + 장마감후 꾸준히 수급 발생하는 섹터',
    '→ 하나라도 속하지 않으면 아예 보지 않습니다. 가급적 교집합 섹터를 선호합니다.',
    '2) 선정된 섹터 안에서만 수급 빈집 여부를 체크합니다.',
    '→ 섹터가 틀리면 종목은 아무리 좋아 보여도 안 갑니다.',
    '3) 거래대금이 주력으로 터지고 있는지 확인한다.',
    '→ 국장은 거래대금이 터져야 대장이다. 총거래대금과 기관 거래대금 둘다 터져야 최선호',
    '4) 세부 종목 고를때는',
    '→ 컨센서스 상향, 정책·산업 모멘텀 등 추가 재료를 확인합니다.']],
  ['2. 배팅 포지션 규칙', [
    '기본은 3% 단위 진입', '한 종목 최대 10% 초과 금지', '구조가 좋아 보이면 4~5%', '확신이 생기면 8~10%까지',
    '삼성전자·SK하이닉스는 시가총액 비중을 감안해 최대 2배까지 허용합니다.', '(대장주는 예외 규칙을 둡니다)']],
  ['리스크 관리 기준 특히 매도기준', [
    '1) Fear & Greed 오실레이터가 꺾이면 현금화를 우선합니다.',
    '코스피 지수나 코스닥 지수가 의미있는 10일선 또는 20일선 이탈시 현금 비중 더올림',
    '(예 과열권 10%, 이평선 이탈시 20%)',
    '2) 개별 종목',
    ' - 수급 오실레이터 과열권이면 매도',
    ' - 수급 오실레이터와 상관없이 10일선 이탈시 1차로 줄이고 20일선 이탈은 포기하자',
    ' - 일봉이나 주봉 신고가 갱신 후 음전',
    ' - 섹터가 소라티노 모멘텀 등수에 없으면 단체로 삭제',
    '다만 위험관리를 하면서 가질수 있는 최대 현금 비중은',
    '→ 과거 통계상 30% 정도가 합리적',
    '3) MDD -10%~15% 도달시 더 이상 현금 비중 늘리지 않고 단계적으로 주식비중 증가 고민',
    '시장이 상승추세 200일선 이상의 경우에 주로 주식비중을 MDD -10%부터 고민',
    '시장이 하락추세 200일선 이하의 경우는 MDD -15% 부터 고민필요']],
];

function pWatchlist() {
  return `
  <div class="pb-head">
    <div style="display:flex;gap:6px;align-items:center">
      <button class="chip ${WL.tab === 'book' ? 'active' : ''}" data-wl-tab="book" onclick="setWlTab('book')">포트폴리오</button>
      <button class="chip ${WL.tab === 'closed' ? 'active' : ''}" data-wl-tab="closed" onclick="setWlTab('closed')">청산 기록</button>
    </div>
    <div style="display:flex;gap:6px">
      <button class="btn" onclick="openFlowModal()">입출금</button>
      <button class="btn btn-primary" onclick="openWatchlistModal(null)">+ 종목 추가</button>
    </div>
  </div>
  <div id="pb-summary"></div>
  <div id="wl-body">${loadingHTML('불러오는 중...')}</div>`;
}

function setWlTab(t) {
  WL.tab = t;
  document.querySelectorAll('[data-wl-tab]').forEach(b => b.classList.toggle('active', b.dataset.wlTab === t));
  _wlRender();
}

// ── 데이터 ───────────────────────────────────────────────────────────────

async function _wlGetCash() {
  const { data } = await sb.from('app_config').select('value').eq('key', WL_CASH_KEY).limit(1);
  const v = parseFloat(data?.[0]?.value);
  return isFinite(v) ? v : 0;
}

async function _wlSetCash(v) {
  const { error } = await sb.from('app_config').upsert(
    { key: WL_CASH_KEY, value: String(Math.round(v)), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
}

// 코스피·코스닥 전체 시가총액 (시총 비중 분모) — 날짜별 캐시
async function _wlTotalCap(date) {
  if (CACHE.wlTotalCap?.date === date) return CACHE.wlTotalCap.v;
  const rows = await fetchPagesParallel(
    (a, b) => sb.from('market_data').select('market_cap').eq('base_date', date).range(a, b),
    sb.from('market_data').select('stock_code', { count: 'exact', head: true }).eq('base_date', date));
  const v = rows.reduce((s, r) => s + (r.market_cap || 0), 0);
  CACHE.wlTotalCap = { date, v };
  return v;
}

async function loadWatchlist() {
  const body = document.getElementById('wl-body');
  if (!body) return;
  try {
    const [rowsRes, cash, flowsRes, navRes, jrRes, date] = await Promise.all([
      sb.from('watchlist').select('*').order('id'),
      _wlGetCash(),
      sb.from('portfolio_flows').select('*').order('flow_date').order('id'),
      sb.from('portfolio_nav').select('base_date,nav,price,detail').order('base_date', { ascending: false }).limit(1),
      sb.from('trade_journal').select('*').order('closed_date', { ascending: false }),
      getLatestMarketDate(),
    ]);
    if (rowsRes.error) throw rowsRes.error;
    const rows = rowsRes.data || [];
    const codes = [...new Set(rows.map(r => r.stock_code))];
    const none = Promise.resolve({ data: [] });
    const [mkt, comp, est, ops, totalCap] = await Promise.all([
      codes.length ? sb.from('market_data').select('stock_code,price,market_cap,pbr,bps').eq('base_date', date).in('stock_code', codes) : none,
      codes.length ? sb.from('companies').select('code,name,market,wics_mid,product').in('code', codes) : none,
      codes.length ? sb.from('consensus_estimates').select('stock_code,fiscal_period,is_estimate,eps,per,roe,collected_at')
        .in('stock_code', codes).order('collected_at', { ascending: false }).limit(5000) : none,
      codes.length ? sb.from('analyst_opinions').select('stock_code,firm_name,target_price,opinion_date')
        .in('stock_code', codes).gte('opinion_date', offsetDate(-WL_TP_DAYS)).order('opinion_date', { ascending: false }).limit(5000) : none,
      _wlTotalCap(date).catch(() => null),
    ]);
    WL.data = {
      rows, cash, date, totalCap,
      schemaOk: !flowsRes.error && !navRes.error && (!rows.length || 'target_weight' in rows[0]),
      flows: flowsRes.data || [], nav: navRes.data?.[0] || null,
      journals: jrRes.error ? null : (jrRes.data || []),
      mkt: Object.fromEntries((mkt.data || []).map(r => [r.stock_code, r])),
      comp: Object.fromEntries((comp.data || []).map(r => [r.code, r])),
      est: _wlEstByCode(est.data || []),
      tp: _wlTargetPrice(ops.data || []),
    };
    _wlRender();
  } catch (e) {
    console.error('[투자노트]', e);
    body.innerHTML = errorHTML('투자노트 로드 실패: ' + (e.message || e));
  }
}

// KIS 추정실적 → {code: {연도: {eps, per, roe, e}}} (연도마다 가장 최근 수집분)
function _wlEstByCode(rows) {
  const out = {};
  rows.forEach(r => {
    const y = String(r.fiscal_period || '').slice(0, 4);
    const m = out[r.stock_code] = out[r.stock_code] || {};
    if (y && !m[y]) m[y] = { eps: r.eps, per: r.per, roe: r.roe, e: !!r.is_estimate };
  });
  return out;
}

// 컨센 목표주가 — 증권사마다 가장 최근 목표가(90일 안) → 평균
function _wlTargetPrice(rows) {
  const by = {};
  rows.forEach(r => {
    if (!(r.target_price > 0)) return;
    const m = by[r.stock_code] = by[r.stock_code] || {};
    if (!m[r.firm_name]) m[r.firm_name] = r.target_price;   // 최신순 정렬이라 처음 값이 최근
  });
  return Object.fromEntries(Object.entries(by).map(([c, m]) => {
    const v = Object.values(m);
    return [c, { avg: v.reduce((s, x) => s + x, 0) / v.length, n: v.length }];
  }));
}

// 원본 수식으로 행·합계 계산
function _wlCompute() {
  const d = WL.data;
  const navPx = d.nav?.detail || {};
  const book = d.rows.filter(r => r.group_name !== '청산');
  const rows = book.map(r => {
    const m = d.mkt[r.stock_code] || {}, c = d.comp[r.stock_code] || {};
    const price = m.price || (navPx[r.stock_code]?.[1]) || null;
    const qty = r.quantity || 0;
    return { r, c, m, price, qty, value: price ? qty * price : 0 };
  });
  const stockValue = rows.reduce((s, x) => s + x.value, 0);
  const nav = stockValue + (d.cash || 0);
  const units = d.flows.reduce((s, f) => s + (+f.units || 0), 0);
  const bp = units > 0 ? nav / units * 1000 : null;
  rows.forEach(x => {
    const { r, m, price } = x;
    const tw = r.target_weight != null ? r.target_weight / 100 : null;
    x.weight = nav > 0 ? x.value / nav : null;
    x.ret = price && r.avg_price ? (price - r.avg_price) / r.avg_price : null;
    x.can = tw != null && price && nav > 0 ? nav * tw / price : null;            // 편입가능(수량)
    x.fill = x.can ? x.qty / x.can : null;                                       // 편입비
    x.delta = x.can != null ? x.can - x.qty : null;                              // 증감(수량)
    // 밸류에이션
    const e = d.est[r.stock_code] || {};
    x.per = {}; x.pbr = {};
    WL_YEARS_A.forEach(y => {
      const v = e[y];
      if (v && !v.e) { x.per[y] = v.per; x.pbr[y] = v.per != null && v.roe != null ? v.per * v.roe / 100 : null; }
    });
    WL_YEARS_E.forEach(y => { const v = e[y]; if (v && price && v.eps) x.per[y] = price / v.eps; });
    x.pbrNow = m.pbr || null;
    const tp = d.tp[r.stock_code];
    const epsE = ['2026', '2027'].map(y => e[y]?.e ? e[y].eps : null).filter(v => v != null);
    x.tp = tp?.avg ?? null; x.tpN = tp?.n || 0;
    x.tpe = x.tp && epsE.length ? x.tp / (epsE.reduce((s, v) => s + v, 0) / epsE.length) : null;
    x.tpb = x.tp && m.bps ? x.tp / m.bps : null;
    const ai = x.tpe != null && e['2027']?.e && e['2027'].eps ? x.tpe * e['2027'].eps : null;
    const aj = x.tpb != null && m.bps ? x.tpb * m.bps : null;
    x.estTp = ai != null && aj != null ? (ai + aj) / 2 : (ai ?? aj);
    x.upside = x.estTp && price ? x.estTp / price - 1 : null;
    x.capW = m.market_cap && d.totalCap ? m.market_cap / d.totalCap : null;
  });
  // 정렬 — 헤지 칸 먼저(원본 위 칸), 그다음 묶음 순(처음 나온 순) → 목표비중 큰 순
  const bucketOrd = {};
  book.forEach(r => { const b = r.bucket || ''; if (b && !(b in bucketOrd)) bucketOrd[b] = Object.keys(bucketOrd).length; });
  rows.sort((a, b) => (b.r.hedge === true) - (a.r.hedge === true)
    || (a.r.bucket ? bucketOrd[a.r.bucket] : 999) - (b.r.bucket ? bucketOrd[b.r.bucket] : 999)
    || (b.r.target_weight || 0) - (a.r.target_weight || 0) || (a.r.corp_name || '').localeCompare(b.r.corp_name || ''));
  const sumBy = f => rows.reduce((s, x) => s + (f(x) || 0), 0);
  const twOf = x => x.r.target_weight || 0;
  const buckets = {};
  rows.filter(x => !x.r.hedge).forEach(x => { const b = x.r.bucket || '(묶음 없음)'; buckets[b] = (buckets[b] || 0) + twOf(x); });
  return {
    rows, stockValue, nav, units, bp, cash: d.cash || 0,
    tw: sumBy(twOf), cp: sumBy(x => x.r.cur_port), hedgeTw: sumBy(x => x.r.hedge ? twOf(x) : 0),
    ks: sumBy(x => WL_MKT[x.c.market] === 'KS' ? twOf(x) : 0), kq: sumBy(x => WL_MKT[x.c.market] === 'KQ' ? twOf(x) : 0),
    buckets, wSum: sumBy(x => x.weight),
  };
}

// ── 그리기 ───────────────────────────────────────────────────────────────

const _wlPct = (v, d = 1) => v == null || !isFinite(v) ? '' : (v * 100).toFixed(d) + '%';
const _wlNum = (v, d = 0) => v == null || !isFinite(v) ? '' : Number(v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const _wlFs = 'font-size:calc(11px*var(--m-label))';

function _wlRender() {
  const body = document.getElementById('wl-body'), sum = document.getElementById('pb-summary');
  if (!body || !WL.data) return;
  if (!WL.data.schemaOk) {
    sum.innerHTML = '';
    body.innerHTML = emptyHTML('준비 중 — sql/portfolio_book.sql을 Supabase에서 실행해야 합니다',
      '목표비중·묶음·헤지 칸과 입출금·기준가 기록 표를 만듭니다');
    return;
  }
  const k = _wlCompute();
  sum.innerHTML = _wlSummaryHTML(k);
  body.innerHTML = WL.tab === 'closed' ? _wlClosedHTML() : _wlBookHTML(k);
}

function _wlSummaryHTML(k) {
  const d = WL.data;
  const cell = (label, val, sub = '', extra = '') => `<div class="pb-kpi" ${extra}>
      <div class="pb-kpi-l">${label}</div><div class="pb-kpi-v">${val}</div>${sub ? `<div class="pb-kpi-s">${sub}</div>` : ''}</div>`;
  const ret = k.bp != null ? k.bp / 1000 - 1 : null;
  const start = k.units <= 0
    ? `<div class="pb-note">좌수가 없습니다 — ${k.nav > 0
        ? `<button class="chip chip-sm" onclick="wlStartNav()">기준가 시작</button> 지금 순자산 ${fmtWon(k.nav)}을 원본(기준가 1,000)으로 삼습니다.`
        : '현금이나 현보유를 넣은 뒤 \'기준가 시작\', 또는 \'입출금\'으로 첫 입금을 기록하세요.'}</div>` : '';
  return `<div class="card pb-sum">
    <div class="pb-kpis">
      ${cell('원본좌수', k.units > 0 ? _wlNum(k.units) : '—')}
      ${cell('순자산', fmtWon(k.nav), `주식 ${fmtWon(k.stockValue)} + 현금`)}
      ${cell('기준가', k.bp != null ? _wlNum(k.bp, 2) : '—',
        ret != null ? `<span style="color:${chgColor(ret)}">${ret >= 0 ? '+' : ''}${(ret * 100).toFixed(2)}%</span> (1,000 대비)` : '')}
      ${cell('주식평가액', fmtWon(k.stockValue))}
      ${cell('현금잔고', `<span class="pb-edit-cash" title="눌러서 현금 잔고 입력 — 사고팔 때 현금도 함께 고쳐야 기준가가 맞습니다. 입금·출금은 '입출금'으로">${fmtWon(k.cash)} ✎</span>`,
        '', `onclick="wlEditCash()" style="cursor:pointer"`)}
      ${cell('편입비', k.nav > 0 ? _wlPct(k.stockValue / k.nav) : '—', '주식평가액 ÷ 순자산')}
      ${cell('거래소 · 코스닥', `${k.ks.toFixed(1)}% · ${k.kq.toFixed(1)}%`, '목표비중 합')}
    </div>
    ${start}
    <div class="pb-note" style="color:var(--text3)">순자산 = Σ(현보유 × 현재가) + 현금 · 기준가 = 순자산 ÷ 좌수 × 1000 (원본 수식, 순자산은 자동).
      좌수는 입출금 때만 바뀝니다${d.nav ? ` · 일별 기록 ${d.nav.base_date} 기준가 ${d.nav.price != null ? _wlNum(d.nav.price, 2) : '—'}` : ''}.</div>
  </div>`;
}

function _wlBookHTML(k) {
  if (!k.rows.length) return emptyHTML('종목이 없습니다', "'+ 종목 추가'로 원본 표에 종목을 넣으세요");
  const ed = (x, f, txt, title) => `<td class="pb-ed" data-wl-edit="${f}" data-wl-id="${x.r.id}" title="${escAttr(title || '눌러서 입력')}">${txt}</td>`;
  const num = (v, d = 2) => `<td class="ae-num">${_wlNum(v, d)}</td>`;
  const sg = (v, f) => v == null || !isFinite(v) ? '<td></td>' : `<td class="ae-num" style="color:${chgColor(v)}">${f(v)}</td>`;
  let no = 0;
  const body = k.rows.map(x => {
    const { r, c } = x;
    const isStock = /^[0-9A-Z]{6}$/.test(r.stock_code);
    return `<tr class="${r.hedge ? 'pb-hedge' : ''}">
      <td class="ae-num">${r.hedge ? '<span title="헤지 칸 — 원본 위 인버스·레버리지 자리">헤지</span>' : ++no}</td>
      <td class="pb-name"><span ${isStock ? `class="stock-row" data-stock-open="${escAttr(r.stock_code)}" data-stock-name="${escAttr(r.corp_name || '')}"` : ''}>${escapeHtml(r.corp_name || c.name || r.stock_code)}</span></td>
      <td style="color:var(--text3)">${escapeHtml(r.stock_code)}</td>
      <td>${WL_MKT[c.market] || ''}</td>
      <td class="pb-txt" title="${escAttr(c.wics_mid || '')}">${escapeHtml(c.wics_mid || '')}</td>
      <td class="pb-txt" title="${escAttr(c.product || '')}">${escapeHtml(c.product || '')}</td>
      ${num(x.m.market_cap ? x.m.market_cap / 1e8 : null, 0)}
      <td class="ae-num" title="${x.m.price ? '' : '시세 없는 종목 — 장 마감 뒤(16:30) 기록 가격'}">${_wlNum(x.price, 0)}</td>
      ${[...WL_YEARS_A, ...WL_YEARS_E].map(y => num(x.per[y], 2)).join('')}
      ${num(x.tpe, 2)}
      ${WL_YEARS_A.map(y => num(x.pbr[y], 2)).join('')}${num(x.pbrNow, 2)}
      ${num(x.tpb, 2)}
      <td class="ae-num" title="${escAttr(x.tp ? `컨센 목표주가 ${_wlNum(x.tp)}원 (증권사 ${x.tpN}곳, 최근 ${WL_TP_DAYS}일)` : '')}">${_wlNum(x.estTp, 0)}</td>
      ${sg(x.upside, v => (v > 0 ? '+' : '') + (v * 100).toFixed(1) + '%')}
      <td class="ae-num">${_wlPct(x.capW, 3)}</td>
      ${ed(x, 'cur_port', r.cur_port != null ? r.cur_port + '%' : '', '현재포트(%) — 눌러서 입력')}
      ${ed(x, 'target_weight', r.target_weight != null ? r.target_weight + '%' : '', '목표비중(%) — 눌러서 입력')}
      <td class="ae-num">${_wlPct(x.weight, 1)}</td>
      ${ed(x, 'avg_price', r.avg_price ? _wlNum(r.avg_price) : '', '매입가 — 눌러서 입력')}
      ${sg(x.ret, v => (v > 0 ? '+' : '') + (v * 100).toFixed(1) + '%')}
      ${num(x.can, 0)}
      ${ed(x, 'quantity', x.qty ? _wlNum(x.qty) : '', '현보유(수량) — 눌러서 입력. 0으로 바꾸면 청산 기록을 남길 수 있습니다')}
      <td class="ae-num">${_wlPct(x.fill, 0)}</td>
      ${sg(x.delta == null ? null : Math.round(x.delta), v => (v > 0 ? '+' : '') + _wlNum(v))}
      ${num(x.value ? x.value / 1e8 : null, 2)}
      ${ed(x, 'bucket', escapeHtml(r.bucket || ''), '묶음 이름 — 같은 이름끼리 아래에서 목표비중을 합칩니다')}
      <td style="text-align:center"><input type="checkbox" ${r.hedge ? 'checked' : ''} title="헤지 칸(인버스·레버리지)" onchange="wlSetHedge(${r.id}, this.checked)"></td>
      <td><button class="pb-del" title="표에서 빼기" onclick="wlRemoveRow(${r.id})">×</button></td>
    </tr>`;
  }).join('');
  const y = s => `<th class="ae-num">${s}</th>`;
  const head = `
    <tr class="pb-grp"><th colspan="8"></th><th colspan="6">PER</th><th></th><th colspan="4">PBR</th><th></th>
      <th colspan="2">추정</th><th>시총</th><th colspan="3">포트</th><th colspan="7">편입</th><th colspan="3"></th></tr>
    <tr><th class="ae-num">NO</th><th class="pb-name">종목명</th><th>CODE</th><th>시장</th><th>산업구분</th><th>주요생산제품</th>
      ${y('시가총액(억)')}${y('현재가')}
      ${WL_YEARS_A.map(v => y(v + 'A')).join('')}${WL_YEARS_E.map(v => y(v + 'E')).join('')}${y('목표PE')}
      ${WL_YEARS_A.map(v => y(v + 'A')).join('')}${y('최근')}${y('목표PB')}
      ${y('목표가')}${y('기대수익률')}${y('비중')}
      ${y('현재포트')}${y('목표비중')}${y('비중')}
      ${y('매입가')}${y('수익률')}${y('편입가능')}${y('현보유')}${y('편입비')}${y('증감(수량)')}${y('평가액(억)')}
      <th>묶음</th><th>헤지</th><th></th></tr>`;
  const foot = `<tr class="pb-total"><td></td><td class="pb-name">합계</td><td colspan="${6 + 6 + 1 + 4 + 1 + 3}"></td>
      <td class="ae-num">${k.cp.toFixed(1)}%</td><td class="ae-num">${k.tw.toFixed(1)}%</td><td class="ae-num">${_wlPct(k.wSum, 1)}</td>
      <td colspan="6"></td><td class="ae-num">${_wlNum(k.stockValue / 1e8, 2)}</td><td colspan="3"></td></tr>`;
  const bucketRows = Object.entries(k.buckets).map(([b, v]) => `<tr><td>${escapeHtml(b)}</td><td class="ae-num">${v.toFixed(1)}%</td></tr>`).join('');
  return `
  <div class="card" style="margin-bottom:1rem"><div class="table-wrap pb-wrap"><table class="pb-tbl">
    <thead>${head}</thead><tbody>${body}</tbody><tfoot>${foot}</tfoot></table></div>
    <div class="pb-note" style="padding:6px 12px 8px;color:var(--text3)">
      편입가능 = 순자산 × 목표비중 ÷ 현재가 · 편입비 = 현보유 ÷ 편입가능 · 증감 = 편입가능 − 현보유(+ 더 살 수량, − 줄일 수량) ·
      PER 추정 연도 = 현재가 ÷ 추정 EPS, 실적 연도 PBR = PER × ROE · 추정 목표가 = (목표PE × 2027E EPS + 목표PB × BPS) ÷ 2 ·
      데이터가 없는 칸은 비웁니다(추정 EPS는 약 200종목, 2028E 없음). 색: 빨강 = 플러스, 파랑 = 마이너스.
    </div></div>
  <div class="pb-bottom">
    <div class="card"><div class="card-header"><span class="card-title">목표 배분</span><span class="card-sub">원본 아래 칸 — 목표비중 기준</span></div>
      <table class="pb-mini"><tbody>
        <tr><td>현금</td><td class="ae-num">${(100 - k.tw).toFixed(1)}%</td></tr>
        <tr><td>헤지(인버스·레버리지)</td><td class="ae-num">${k.hedgeTw.toFixed(1)}%</td></tr>
        <tr><td><b>주식비중</b></td><td class="ae-num"><b>${k.tw.toFixed(1)}%</b></td></tr>
        ${bucketRows}
      </tbody></table></div>
    <div class="card"><div class="card-header"><span class="card-title">운용 규칙</span><span class="card-sub">원본 메모 그대로</span></div>
      <div class="pb-rules">${WL_RULES.map(([h, lines]) => `<div class="pb-rule-h">${escapeHtml(h)}</div>`
        + lines.map(l => `<div>${escapeHtml(l)}</div>`).join('')).join('')}</div></div>
  </div>`;
}

// ── 표에서 직접 입력 ─────────────────────────────────────────────────────

document.addEventListener('click', e => {
  const td = e.target.closest('td[data-wl-edit]');
  if (!td || td.querySelector('input')) return;
  const id = +td.dataset.wlId, f = td.dataset.wlEdit;
  const r = WL.data?.rows.find(x => x.id === id);
  if (!r) return;
  const cur = r[f] ?? '';
  td.innerHTML = `<input class="pb-input" ${f === 'bucket' ? 'type="text"' : 'type="number" step="any"'} value="${escAttr(String(cur))}">`;
  const inp = td.querySelector('input');
  inp.focus(); inp.select();
  let done = false;
  const finish = save => { if (done) return; done = true; save ? _wlSave(id, f, inp.value) : _wlRender(); };
  inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') finish(true); if (ev.key === 'Escape') finish(false); });
  inp.addEventListener('blur', () => finish(true));
});

async function _wlSave(id, f, raw) {
  const r = WL.data.rows.find(x => x.id === id);
  const v = f === 'bucket' ? (raw.trim() || null) : (raw.trim() === '' ? null : Number(raw));
  if (f !== 'bucket' && v != null && !isFinite(v)) { _wlRender(); return; }
  if ((r[f] ?? null) === v) { _wlRender(); return; }
  const upd = { [f]: f === 'quantity' && v != null ? Math.round(v) : v, updated_at: new Date().toISOString() };
  try {
    if (f === 'quantity') {
      const prev = r.quantity || 0, now = upd.quantity || 0;
      if (prev <= 0 && now > 0) { upd.opened_at = r.opened_at || kstToday(); upd.group_name = '보유중'; }
      if (prev > 0 && now <= 0) {
        const px = WL.data.mkt[r.stock_code]?.price || WL.data.nav?.detail?.[r.stock_code]?.[1] || '';
        const sell = prompt(`${r.corp_name} 현보유를 0으로 바꿉니다.\n전량 매도(청산)로 기록하려면 매도가를 확인하세요 — 취소하면 수량만 0이 됩니다.`, String(px));
        if (sell != null && +sell > 0) { await _wlRecordClose(r, prev, +sell); upd.group_name = '청산'; }
        else upd.group_name = '관심';
        upd.opened_at = null;
      }
    }
    const { error } = await sb.from('watchlist').update(upd).eq('id', id);
    if (error) throw error;
  } catch (e) {
    alert('저장 실패: ' + (e.message || e));
  }
  loadWatchlist();
}

async function wlSetHedge(id, on) {
  const { error } = await sb.from('watchlist').update({ hedge: on, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) alert('저장 실패: ' + error.message);
  loadWatchlist();
}

async function wlRemoveRow(id) {
  const r = WL.data.rows.find(x => x.id === id);
  if (!r) return;
  if ((r.quantity || 0) > 0 && !confirm(`${r.corp_name}은 현보유 ${r.quantity}주가 있습니다. 표에서 뺄까요? (청산 기록은 남지 않습니다)`)) return;
  if (!(r.quantity > 0) && !confirm(`${r.corp_name}을 표에서 뺄까요?`)) return;
  const { error } = await sb.from('watchlist').delete().eq('id', id);
  if (error) alert('삭제 실패: ' + error.message);
  loadWatchlist();
}

async function wlEditCash() {
  const cur = WL.data?.cash || 0;
  const raw = prompt('현금잔고(원) — 사고팔 때 현금도 함께 고쳐야 기준가가 맞습니다.\n입금·출금은 \'입출금\'으로 기록하세요(좌수가 바뀝니다).', String(Math.round(cur)));
  if (raw == null) return;
  const v = Number(String(raw).replace(/[,\s원]/g, ''));
  if (!isFinite(v)) { alert('숫자를 넣어 주세요'); return; }
  try { await _wlSetCash(v); } catch (e) { alert('현금 저장 실패: ' + (e.message || e)); }
  loadWatchlist();
}

// ── 좌수: 기준가 시작 · 입출금 ─────────────────────────────────────────────

async function wlStartNav() {
  const k = _wlCompute();
  if (k.units > 0 || !(k.nav > 0)) return;
  if (!confirm(`지금 순자산 ${fmtWon(k.nav)}을 원본으로 삼아 기준가 1,000에서 시작합니다.\n(좌수 ${_wlNum(k.nav)} — 현금은 바뀌지 않습니다)`)) return;
  const { error } = await sb.from('portfolio_flows').insert({ flow_date: kstToday(), amount: Math.round(k.nav), units: Math.round(k.nav), price: 1000, memo: '기준가 시작(그때 순자산)' });
  if (error) alert('저장 실패: ' + error.message);
  loadWatchlist();
}

function openFlowModal() {
  if (!WL.data?.schemaOk) { alert('sql/portfolio_book.sql을 먼저 실행해야 합니다'); return; }
  document.getElementById('m-flow')?.remove();
  const k = _wlCompute();
  const flows = WL.data.flows.slice().reverse();
  const ov = document.createElement('div');
  ov.id = 'm-flow';
  ov.className = 'modal-overlay open';
  ov.innerHTML = `
    <div class="modal" style="width:520px;max-width:95vw;max-height:90vh;overflow-y:auto">
      <div class="modal-header"><span class="modal-title">입출금</span>
        <button class="modal-close" onclick="document.getElementById('m-flow').remove()">×</button></div>
      <div style="padding:1.1rem;display:flex;flex-direction:column;gap:10px">
        <div style="${_wlFs};color:var(--text2);line-height:1.6">지금 기준가 <b style="color:var(--text1)">${k.bp != null ? _wlNum(k.bp, 2) : '1,000 (시작)'}</b> ·
          좌수 ${_wlNum(k.units)} · 순자산 ${fmtWon(k.nav)}<br>입금하면 지금 기준가로 좌수가 늘고 현금잔고에 더해집니다(출금은 반대).</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          <input type="date" id="fl-date" class="form-input" value="${kstToday()}" style="width:150px">
          <select id="fl-kind" class="form-select" style="width:90px"><option value="1">입금</option><option value="-1">출금</option></select>
          <input type="text" id="fl-amt" class="form-input" placeholder="금액(원)" style="flex:1;min-width:120px">
        </div>
        <input type="text" id="fl-memo" class="form-input" placeholder="메모(선택)">
        <div style="display:flex;justify-content:flex-end;gap:6px">
          <button class="btn" onclick="document.getElementById('m-flow').remove()">취소</button>
          <button class="btn btn-primary" onclick="wlSaveFlow()">기록</button></div>
        ${flows.length ? `<div class="table-wrap"><table class="pb-mini" style="width:100%">
          <thead><tr><th>날짜</th><th class="ae-num">금액</th><th class="ae-num">기준가</th><th class="ae-num">좌수 변화</th><th>메모</th></tr></thead>
          <tbody>${flows.map(f => `<tr><td>${f.flow_date}</td><td class="ae-num" style="color:${chgColor(f.amount)}">${fmtWon(f.amount, true)}</td>
            <td class="ae-num">${_wlNum(f.price, 2)}</td><td class="ae-num">${_wlNum(f.units)}</td><td>${escapeHtml(f.memo || '')}</td></tr>`).join('')}</tbody>
        </table></div>` : ''}
      </div></div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
}

async function wlSaveFlow() {
  const k = _wlCompute();
  const amt = Number(String(document.getElementById('fl-amt').value).replace(/[,\s원]/g, '')) * Number(document.getElementById('fl-kind').value);
  if (!isFinite(amt) || !amt) { alert('금액을 넣어 주세요'); return; }
  if (amt < 0 && -amt > k.nav) { alert('출금이 순자산보다 큽니다'); return; }
  const price = k.units > 0 && k.bp ? k.bp : 1000;            // 좌수가 없으면 이 입금이 원본(기준가 1,000)
  try {
    const { error } = await sb.from('portfolio_flows').insert({
      flow_date: document.getElementById('fl-date').value || kstToday(), amount: Math.round(amt),
      units: amt / (price / 1000), price: Math.round(price * 10000) / 10000,
      memo: document.getElementById('fl-memo').value.trim() || null });
    if (error) throw error;
    await _wlSetCash((WL.data.cash || 0) + amt);
  } catch (e) { alert('저장 실패: ' + (e.message || e)); return; }
  document.getElementById('m-flow')?.remove();
  loadWatchlist();
}

// ── 청산 기록 · 매매 복기 (원본에 없는 기능 중 남긴 것) ─────────────────────

async function _wlRecordClose(r, qty, sell) {
  const buy = r.avg_price || null;
  const days = r.opened_at ? Math.round((new Date(kstToday()) - new Date(r.opened_at)) / 86400000) : null;
  const { error } = await sb.from('trade_journal').insert({
    stock_code: r.stock_code, corp_name: r.corp_name, watchlist_id: r.id, closed_date: kstToday(),
    avg_buy: buy, avg_sell: sell, realized: buy ? Math.round((sell - buy) * qty) : null,
    return_pct: buy ? Math.round((sell / buy - 1) * 1000) / 10 : null, hold_days: days,
    updated_at: new Date().toISOString() });
  if (error) throw error;
}

function _wlClosedHTML() {
  const js = WL.data.journals;
  if (js == null) return emptyHTML('청산 기록 표(trade_journal)가 없습니다', 'sql/trade_journal.sql을 실행하세요');
  if (!js.length) return emptyHTML('청산 기록이 없습니다', '표에서 현보유를 0으로 바꾸면 청산으로 기록할 수 있습니다');
  return `<div class="card"><div class="table-wrap"><table class="pb-mini" style="width:100%">
    <thead><tr><th>종목</th><th>청산일</th><th class="ae-num">매입가 → 매도가</th><th class="ae-num">수익률</th>
      <th class="ae-num">실현손익</th><th class="ae-num">보유</th><th>매도 사유</th><th>교훈</th><th></th></tr></thead>
    <tbody>${js.map(j => `<tr>
      <td>${escapeHtml(j.corp_name || j.stock_code)}</td><td>${j.closed_date || ''}</td>
      <td class="ae-num">${_wlNum(j.avg_buy)} → ${_wlNum(j.avg_sell)}</td>
      <td class="ae-num" style="color:${chgColor(j.return_pct)}">${j.return_pct != null ? (j.return_pct > 0 ? '+' : '') + j.return_pct + '%' : ''}</td>
      <td class="ae-num" style="color:${chgColor(j.realized)}">${j.realized != null ? fmtWon(j.realized, true) : ''}</td>
      <td class="ae-num">${j.hold_days != null ? j.hold_days + '일' : ''}</td>
      <td>${escapeHtml(j.sell_reason || '')}</td><td class="pb-txt" title="${escAttr(j.lesson || '')}">${escapeHtml(j.lesson || '')}</td>
      <td style="white-space:nowrap"><button class="chip chip-sm" onclick="openJournalModal(${j.id})">${j.sell_reason || j.lesson ? '복기 수정' : '복기'}</button>
        <button class="chip chip-sm" title="원본 표로 다시 담기(관심)" onclick="wlReopen('${escJsStr(j.stock_code)}')">다시 담기</button></td>
    </tr>`).join('')}</tbody></table></div></div>`;
}

async function wlReopen(code) {
  const r = WL.data.rows.find(x => x.stock_code === code);
  if (r) await sb.from('watchlist').update({ group_name: '관심', updated_at: new Date().toISOString() }).eq('id', r.id);
  else {
    const j = WL.data.journals.find(x => x.stock_code === code);
    await sb.from('watchlist').insert({ stock_code: code, corp_name: j?.corp_name || code, group_name: '관심' });
  }
  WL.tab = 'book';
  document.querySelectorAll('[data-wl-tab]').forEach(b => b.classList.toggle('active', b.dataset.wlTab === 'book'));
  loadWatchlist();
}

function openJournalModal(id) {
  const j = WL.data?.journals?.find(x => x.id === id);
  if (!j) return;
  document.getElementById('m-journal')?.remove();
  const reasons = ['목표 달성', '손절 룰', '펀더멘털 훼손', '더 좋은 기회', '패닉·감정', '자금 필요', '기타'];
  const auto = (label, val, color = 'var(--text1)') =>
    `<div style="flex:1;min-width:90px;background:var(--bg2);border-radius:8px;padding:8px 10px">
       <div style="${_wlFs};color:var(--text2)">${label}</div>
       <div style="font-size:calc(14px*var(--m-body));font-weight:700;color:${color}">${val}</div></div>`;
  const ov = document.createElement('div');
  ov.id = 'm-journal';
  ov.className = 'modal-overlay open';
  ov.innerHTML = `
    <div class="modal" style="width:520px;max-width:95vw;max-height:90vh;overflow-y:auto">
      <div class="modal-header"><span class="modal-title">${escapeHtml(j.corp_name || j.stock_code)} · ${_ICO.pen}매매 복기</span>
        <button class="modal-close" onclick="document.getElementById('m-journal').remove()">×</button></div>
      <div style="padding:1.25rem;display:flex;flex-direction:column;gap:14px">
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${auto('실현손익', j.realized != null ? fmtWon(j.realized, true) : '—', chgColor(j.realized))}
          ${auto('수익률', j.return_pct != null ? `${j.return_pct > 0 ? '+' : ''}${j.return_pct}%` : '—', chgColor(j.return_pct))}
          ${auto('보유기간', j.hold_days != null ? `${j.hold_days}일` : '—')}
          ${auto('매입가 → 매도가', `${_wlNum(j.avg_buy) || '—'} → ${_wlNum(j.avg_sell) || '—'}`)}
        </div>
        <div><div style="font-size:calc(12px*var(--m-sub));color:var(--text1);margin-bottom:4px">매도 사유</div>
          <select class="form-select" id="j-reason" style="width:100%"><option value="">선택…</option>
            ${reasons.map(r => `<option value="${r}" ${j.sell_reason === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div><div style="font-size:calc(12px*var(--m-sub));color:var(--text1);margin-bottom:4px">잘한 점</div>
            <textarea class="form-input" id="j-well" style="width:100%;box-sizing:border-box;height:54px;resize:vertical">${escapeHtml(j.did_well || '')}</textarea></div>
          <div><div style="font-size:calc(12px*var(--m-sub));color:var(--text1);margin-bottom:4px">아쉬운 점</div>
            <textarea class="form-input" id="j-poorly" style="width:100%;box-sizing:border-box;height:54px;resize:vertical">${escapeHtml(j.did_poorly || '')}</textarea></div>
        </div>
        <div><div style="font-size:calc(12px*var(--m-sub));color:var(--text1);margin-bottom:4px">교훈 (다음 거래에 적용)</div>
          <input type="text" class="form-input" id="j-lesson" value="${escAttr(j.lesson || '')}" style="width:100%;box-sizing:border-box"></div>
        <div><div style="font-size:calc(12px*var(--m-sub));color:var(--text1);margin-bottom:4px">프로세스 점수 <span style="color:var(--text2);font-weight:400">(결과와 무관하게 판단·실행의 질)</span></div>
          <span id="j-stars">${[1, 2, 3, 4, 5].map(n => `<span onclick="_setJournalScore(${n})" data-star="${n}" style="cursor:pointer;font-size:calc(22px*var(--m-title));color:${(j.process_score || 0) >= n ? 'var(--accent)' : 'var(--text3)'}">★</span>`).join('')}</span>
          <input type="hidden" id="j-process" value="${j.process_score || ''}"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn" onclick="document.getElementById('m-journal').remove()">취소</button>
          <button class="btn btn-primary" onclick="saveJournalFromForm(${j.id})">복기 저장</button></div>
      </div></div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
}

function _setJournalScore(n) {
  const inp = document.getElementById('j-process'); if (inp) inp.value = n;
  document.querySelectorAll('#j-stars [data-star]').forEach(s => {
    s.style.color = Number(s.dataset.star) <= n ? 'var(--accent)' : 'var(--text3)';
  });
}

async function saveJournalFromForm(id) {
  const g = k => document.getElementById(k)?.value?.trim() || null;
  const { error } = await sb.from('trade_journal').update({
    sell_reason: g('j-reason'), did_well: g('j-well'), did_poorly: g('j-poorly'), lesson: g('j-lesson'),
    process_score: parseInt(document.getElementById('j-process')?.value) || null, updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) { alert('복기 저장 실패: ' + error.message); return; }
  document.getElementById('m-journal')?.remove();
  loadWatchlist();
}

// ── 종목 추가 (스크리너 '+WL'도 이 창 — WL.prefill) ─────────────────────────

function openWatchlistModal() {
  document.getElementById('m-watchlist')?.remove();
  const pre = WL.prefill;
  WL.prefill = null;
  const ov = document.createElement('div');
  ov.id = 'm-watchlist';
  ov.className = 'modal-overlay open';
  ov.innerHTML = `
    <div class="modal" style="width:480px;max-width:95vw;max-height:90vh;overflow-y:auto">
      <div class="modal-header"><span class="modal-title">종목 추가</span>
        <button class="modal-close" onclick="document.getElementById('m-watchlist').remove()">×</button></div>
      <div style="padding:1.1rem;display:flex;flex-direction:column;gap:10px">
        <input type="text" id="wl-q" class="form-input" placeholder="종목명 또는 코드" value="${escAttr(pre?.corp_name || '')}" oninput="wlSearch(this.value)">
        <div id="wl-results"></div>
        <div style="border-top:1px solid var(--border);padding-top:10px;${_wlFs};color:var(--text2)">시세에 없는 종목(ETF 등)은 코드를 직접 — 가격은 장 마감 뒤(16:30) 들어옵니다</div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <input type="text" id="wl-mcode" class="form-input" placeholder="코드(예: 114800)" style="width:130px">
          <input type="text" id="wl-mname" class="form-input" placeholder="이름(예: KODEX 인버스)" style="flex:1;min-width:140px">
          <label style="${_wlFs};color:var(--text2);white-space:nowrap"><input type="checkbox" id="wl-mhedge"> 헤지 칸</label>
          <button class="btn" onclick="wlAddManual()">추가</button>
        </div>
      </div></div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  if (pre?.corp_name) wlSearch(pre.corp_name);
  document.getElementById('wl-q')?.focus();
}

let _wlSearchSeq = 0;
async function wlSearch(q) {
  const el = document.getElementById('wl-results');
  q = (q || '').trim();
  if (!el) return;
  if (!q) { el.innerHTML = ''; return; }
  const seq = ++_wlSearchSeq;
  const like = q.replace(/[%_,()]/g, '');
  const { data } = await sb.from('companies').select('code,name,market').eq('active', true)
    .or(`name.ilike.%${like}%,code.eq.${like}`).limit(12);
  if (seq !== _wlSearchSeq) return;
  const have = new Set((WL.data?.rows || []).filter(r => r.group_name !== '청산').map(r => r.stock_code));
  el.innerHTML = (data || []).map(c => `<div class="pb-sr">
      <span>${escapeHtml(c.name)} <span style="color:var(--text3)">${c.code} · ${WL_MKT[c.market] || ''}</span></span>
      ${have.has(c.code) ? '<span style="color:var(--text3)">표에 있음</span>'
        : `<button class="chip chip-sm" onclick="wlAdd('${escJsStr(c.code)}','${escJsStr(c.name)}',false)">추가</button>`}</div>`).join('')
    || `<div style="${_wlFs};color:var(--text3)">찾는 종목이 없습니다</div>`;
}

function wlAddManual() {
  const code = (document.getElementById('wl-mcode').value || '').trim().toUpperCase().replace(/^A/, '');
  const name = (document.getElementById('wl-mname').value || '').trim();
  if (!/^[0-9A-Z]{6}$/.test(code) || !name) { alert('6자리 코드와 이름을 넣어 주세요'); return; }
  wlAdd(code, name, document.getElementById('wl-mhedge').checked);
}

async function wlAdd(code, name, hedge) {
  try {
    const { data: ex } = await sb.from('watchlist').select('id,group_name').eq('stock_code', code).limit(1);
    if (ex?.[0]) {
      if (ex[0].group_name === '청산') await sb.from('watchlist').update({ group_name: '관심', hedge, updated_at: new Date().toISOString() }).eq('id', ex[0].id);
      else { toast?.('이미 표에 있습니다', 'info'); return; }
    } else {
      const { error } = await sb.from('watchlist').insert({ stock_code: code, corp_name: name, group_name: '관심', hedge });
      if (error) throw error;
    }
    document.getElementById('m-watchlist')?.remove();
    toast?.(`${name} 추가`, 'success');
    if (document.getElementById('wl-body')) loadWatchlist();
  } catch (e) { alert('추가 실패: ' + (e.message || e)); }
}
