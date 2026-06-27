// config.js — Supabase 연결, 전역 상수, 앱 상태
// ══════════════════════════════════════════
//  Supabase 연결 설정
//  SB_URL, SB_KEY 두 줄만 본인 값으로 교체하세요
//  SB_KEY: Supabase > Settings > API > anon public (eyJ...로 시작하는 값)
// ══════════════════════════════════════════
const SB_URL = 'https://ngyzcpogfxbkoqkcfipv.supabase.co';
const SB_KEY = 'sb_publishable_Z1NulIB63zzJABeC4eWLFw_UOyXCosq';               // ← 교체

const sb = supabase.createClient(SB_URL, SB_KEY, {
  auth: {
    storageKey: 'bati-auth-v2',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  }
});
const DB = sb.from.bind(sb);

// ══════════════════════════════════════════
//  산업 목록 — 단일 정의, 전체 파일 참조
// ══════════════════════════════════════════
const INDUSTRIES = ['바이오','뷰티','로봇','2차전지','신재생','소비재','테크','반도체','엔터','조선','우주'];
// CATS: 채팅방 UI 배지 색상 (IND_COLORS와 의도적으로 다름 — 차트 라인 색상과 분리)
const CATS = { '바이오':'#2AABEE','뷰티':'#f5365c','로봇':'#2dce89','2차전지':'#fb6340','신재생':'#5e72e4','소비재':'#f3a4b5','테크':'#a259ff','반도체':'#8898aa','엔터':'#ffd600','조선':'#11cdef','우주':'#4a6fa5' };

// ══════════════════════════════════════════
//  산업 누적 복리수익률 헬퍼 — chart-industry / chart-uskr / market-insight 공용
//  dayChgMap: { 'YYYY-MM-DD': [종목등락률, ...] }  (한 산업의 일별 등락률 묶음)
//  dates    : 적용할 날짜 배열(오름차순)
// ══════════════════════════════════════════
//  누적 '지수' 시계열(시작 100) — 라인차트용. 데이터 시작 전은 null, 데이터 있는 날만 반영.
function indCumIndexSeries(dayChgMap, dates) {
  let cum = 100, started = false;
  return dates.map(date => {
    const chgs = dayChgMap?.[date];
    if (chgs && chgs.length) { started = true; cum *= (1 + chgs.reduce((s, v) => s + v, 0) / chgs.length / 100); }
    return started ? parseFloat(cum.toFixed(2)) : null;
  });
}
//  최종 누적수익률(%) = 마지막 누적값 − 100. 데이터/변동 없으면 0.
function indCumReturn(dayChgMap, dates) {
  let cum = 100;
  for (const date of dates) {
    const chgs = dayChgMap?.[date];
    if (chgs && chgs.length) cum *= (1 + chgs.reduce((s, v) => s + v, 0) / chgs.length / 100);
  }
  return parseFloat((cum - 100).toFixed(2));
}

// 유료 채팅방 입장 후원 링크 (Litt.ly)
// 유료방은 직접 입장 링크 대신 이 후원 페이지로 안내 → 후원(결제) 후 봇에서 방 선택·입장
const LITTLY_DONATE_URL = 'https://litt.ly/batiinvest';

// ══════════════════════════════════════════
//  공통 HTML 유틸
// ══════════════════════════════════════════
// HTML 이스케이프 — 템플릿 문자열에 DB/사용자 텍스트 삽입 시 (각 파일 인라인 정의 통합)
const escapeHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const loadingHTML = (msg = '') =>
  `<div style="padding:1.5rem;text-align:center;color:var(--text2);font-size:13px"><span class="loading"></span>${msg ? ' ' + msg : ''}</div>`;

const emptyHTML = (msg = '데이터 없음', hint = '') =>
  `<div style="padding:2.5rem;text-align:center">
    <div style="font-size:32px;margin-bottom:.75rem;opacity:.3">📊</div>
    <div style="font-size:13px;color:var(--text2)">${msg}</div>
    ${hint ? `<div style="font-size:11px;color:var(--text3);margin-top:6px">${hint}</div>` : ''}
  </div>`;

const errorHTML = (msg = '') =>
  `<div style="padding:1.5rem;text-align:center">
    <div style="font-size:28px;margin-bottom:.5rem;opacity:.4">⚠️</div>
    <div style="font-size:13px;color:var(--red)">${msg}</div>
  </div>`;

// ══════════════════════════════════════════
//  공통 페이징 유틸
//  사용법:
//    const data = await fetchAllPages(
//      sb.from('companies').select('id,name').eq('active', true)
//    );
// ══════════════════════════════════════════
async function fetchAllPages(queryOrFn, pageSize = 1000) {
  let all = [], page = 0;
  while (true) {
    const s = page * pageSize, e = (page + 1) * pageSize - 1;
    // 콜백 방식: (s, e) => query.range(s, e)
    // query 객체 방식: sb.from('table').select(...).eq(...)
    const q = typeof queryOrFn === 'function' ? queryOrFn(s, e) : queryOrFn.range(s, e);
    const { data, error } = await q;
    if (error) throw error;
    if (!data?.length) break;
    all = all.concat(data);
    if (data.length < pageSize) break;
    page++;
  }
  return all;
}

// ══════════════════════════════════════════
//  fetchAllPages의 병렬판 — 페이지를 순차가 아니라 동시에 받는다.
//  먼저 countQuery(head)로 총 행수를 구해 페이지 수를 정한 뒤 Promise.all로 일괄 요청.
//  수만 행/수십 페이지(예: 3달 산업비교)에서 순차 대기를 없애 로딩을 크게 줄인다.
//  ⚠️ 병렬 range는 정렬이 고정돼야 페이지 경계가 어긋나지 않음(누락/중복 방지)
//     → makeQuery가 반드시 결정적 .order(...)를 포함해야 한다.
//    makeQuery(s, e): range(s,e)까지 적용된 완성 쿼리를 매번 새로 만들어 반환
//    countQuery     : 동일 필터에 { count:'exact', head:true }를 건 쿼리(개수만)
// ══════════════════════════════════════════
async function fetchPagesParallel(makeQuery, countQuery, pageSize = 1000) {
  const { count, error } = await countQuery;
  if (error) throw error;
  const pages = Math.ceil((count || 0) / pageSize);
  const results = await Promise.all(
    Array.from({ length: pages }, (_, p) => makeQuery(p * pageSize, (p + 1) * pageSize - 1))
  );
  const all = [];
  for (const r of results) { if (r.error) throw r.error; if (r.data) all.push(...r.data); }
  return all;
}

// ══════════════════════════════════════════
//  종목 검색 공통 fetcher — 회사명/코드 ilike 드롭다운용
//  comparison·report·company의 .or(name.ilike,code.ilike) 중복을 통합.
//  각 페이지는 scope/limit/orderBy/cols만 지정하고 렌더링은 자체 유지한다.
//    scope:   'all'(전체 상장사) | 'monitored'(is_monitored) | 'active'
//    orderBy: 컬럼명 | 'is_monitored'(내림차순) | null(정렬 생략)
//  반환: Supabase 응답 형태 { data, error } — 기존 호출부 그대로 호환.
//  주의: code는 접미사(.KS/.KQ) 제거 없이 원본 반환 — 접미사 처리는 호출부 책임.
// ══════════════════════════════════════════
async function searchCompanies(q, opts = {}) {
  const { scope = 'all', limit = 12, orderBy = 'name', cols = 'code,name,industry' } = opts;
  q = (q || '').trim();
  if (!q) return { data: [], error: null };
  let query = sb.from('companies')
    .select(cols)
    .or(`name.ilike.%${q}%,code.ilike.%${q}%`);
  if (scope === 'monitored')   query = query.eq('is_monitored', true);
  else if (scope === 'active') query = query.eq('active', true);
  if (orderBy === 'is_monitored') query = query.order('is_monitored', { ascending: false });
  else if (orderBy)               query = query.order(orderBy);
  return await query.limit(limit);
}

// ── App state ──
const A = {
  user: null,     // Supabase auth user
  profile: null,  // app_users row  { role, name, email }
  rooms: [],
  config: {},     // app_config rows: { key: value }
  page: 'overview',
  cat: 'all', status: 'all', q: '', sortBy: 'members', sortDir: 'desc',
  room: null,
};

const isAdmin  = () => A.profile?.role === 'admin';
const isEditor = () => ['admin','editor'].includes(A.profile?.role);
const isViewer = () => !isEditor();  // viewer 또는 미설정
const canEdit  = () => isEditor();
const canDel   = () => isAdmin();
// viewer가 접근 가능한 페이지
const VIEWER_PAGES = ['investment'];
const canAccess = (page) => isEditor() || VIEWER_PAGES.includes(page);

// ══════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════

// ── 재무 조회 상태 ──
const F = { mode: 'market', scope: 'monitored', industry: '전체', q: '', sortBy: 'market_cap', sortDir: 'desc' };

// ══════════════════════════════════════════
//  보유/관심 종목 교차표시 (시황 ↔ 투자노트)
//  시황 대시보드 목록에서 종목이 투자노트에 있으면 배지로 표시
// ══════════════════════════════════════════
let _wlHeldCodes  = new Set();   // group_name = '보유중'
let _wlWatchCodes = new Set();   // 관심·후보 등 나머지

// 코드 정규화: .KS/.KQ 접미사 제거 후 비교
function _normCode(code) { return String(code || '').replace(/\.(KS|KQ)$/i, ''); }

// 투자노트 종목코드 로드 → 보유/관심 Set 구성 (force=true면 캐시 무시 재조회)
async function loadWatchlistCodes(force = false) {
  if (window._wlCodesLoaded && !force) return;
  try {
    const { data } = await sb.from('watchlist').select('stock_code,group_name');
    const held = new Set(), watch = new Set();
    (data || []).forEach(r => {
      const c = _normCode(r.stock_code);
      if (r.group_name === '보유중') held.add(c); else watch.add(c);
    });
    _wlHeldCodes = held; _wlWatchCodes = watch;
    window._wlCodesLoaded = true;
  } catch (e) { /* 비로그인·권한 등 — 배지 미표시로 graceful degrade */ }
}

// 종목 코드에 대한 보유/관심 배지 HTML (해당 없으면 빈 문자열)
function wlBadge(code) {
  const c = _normCode(code);
  if (_wlHeldCodes.has(c))
    return `<span title="보유 중" style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:100px;background:rgba(42,171,238,.18);color:var(--tg);white-space:nowrap;flex-shrink:0">보유</span>`;
  if (_wlWatchCodes.has(c))
    return `<span title="투자노트 관심" style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:100px;background:rgba(74,158,255,.16);color:#4a9eff;white-space:nowrap;flex-shrink:0">관심</span>`;
  return '';
}

// ══════════════════════════════════════════
//  공통 포맷 헬퍼 — 전 파일에서 참조
// ══════════════════════════════════════════

// 원 단위 → 조/억 표시 (예: 1500000000000 → "1조 5,000억")
function fmtCap(won) {
  if (won == null) return '—';
  const abs  = Math.abs(won);
  const sign = won < 0 ? '-' : '';
  const EOK  = 1e8;
  const JO   = 1e12;

  if (abs >= JO) {
    const jo     = Math.floor(abs / JO);
    const eokRem = Math.floor((abs % JO) / EOK);
    return sign + (eokRem > 0 ? jo + '조 ' + eokRem.toLocaleString() + '억' : jo + '조');
  }
  if (abs >= EOK) {
    return sign + Math.round(abs / EOK).toLocaleString() + '억';
  }
  // 1억 미만: 소수점 첫째 자리 (최소 0.1억)
  const eokVal = Math.round(abs / EOK * 10) / 10;
  if (eokVal === 0) return '—';
  return sign + eokVal.toFixed(1) + '억';
}

// 억 단위 입력값 표시 (예: 15000 → "1조 5,000억") — fmtCap의 억 단위 버전
function fmtEok(eok) {
  if (eok == null || isNaN(eok)) return '—';
  const rounded = Math.round(eok); // 먼저 반올림 후 분기
  if (rounded >= 10000) {
    const jo  = Math.floor(rounded / 10000);
    const rem = rounded % 10000;
    if (rem > 0 && rem < 100) return `${jo}조`; // 100억 미만 잔여 생략
    return rem > 0 ? `${jo}조 ${rem.toLocaleString()}억` : `${jo}조`;
  }
  return `${rounded.toLocaleString()}억`;
}

// 등락률 색상 — 한국 주식 관행 (상승=빨강, 하락=파랑)
const chgColor = v => v > 0 ? 'var(--red)' : v < 0 ? 'var(--blue)' : 'var(--text3)';

// 등락률 문자열 (예: +2.34% / -1.50% / —)
const chgStr = v => v != null ? `${v > 0 ? '+' : ''}${v.toFixed(2)}%` : '—';

// 등락률 1자리 % (예: +2.3% / -1.5% / —) — 0 이상이면 '+' (chgStr은 0에 '+' 없음 — 의도적 차이)
// 주의: market-insight.js의 _fmt는 null→"+0.0%" 처리가 달라 통합하지 않음 (표기 보존).
const fmtPct = v => v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : '—';

// 가격(원) 표시 (예: 71,200원 / —) — null/undefined만 '—' (0은 "0원"; 주가엔 미발생)
const fmtPrice = v => v != null ? v.toLocaleString() + '원' : '—';

// 순매수 금액 포맷 (단위: 백만원 → 조/억 표시)
// 예: 1_500_000 → "+1.5조" / 123_400 → "+1,234억" / -50_000 → "-500억"
function fmtNet(val) {
  if (val == null) return '—';
  const abs  = Math.abs(val);
  const sign = val >= 0 ? '+' : '-';
  if (abs >= 1_000_000) return sign + (abs / 1_000_000).toFixed(1) + '조';
  if (abs >= 100)       return sign + Math.round(abs / 100).toLocaleString() + '억';
  if (abs >= 1)         return sign + (abs / 100).toFixed(1) + '억';
  return sign + abs + '백만';
}

// 원(KRW) 단위 금액 → 한국식 조/억/만원 표시 (개인 포트폴리오 전용)
// fmtNet/fmtEok은 억·조 스케일이라 수백만~수천만원을 "0억"으로 뭉갬 → 만원 단위까지 표시.
// signed=true면 양수에 '+' 부호 (손익 표기용).
// 예: 100_000_000 → "1.0억" / 50_000_000 → "5,000만" / -3_200_000 → "-320만"
function fmtWon(won, signed = false) {
  if (won == null || isNaN(won)) return '—';
  const abs  = Math.abs(won);
  const sign = won < 0 ? '-' : (signed && won > 0 ? '+' : '');
  if (abs >= 1e12) return sign + (abs / 1e12).toFixed(2) + '조';
  if (abs >= 1e8)  { const e = abs / 1e8; return sign + (e >= 100 ? Math.round(e).toLocaleString() : e.toFixed(1)) + '억'; }
  if (abs >= 1e4)  return sign + Math.round(abs / 1e4).toLocaleString() + '만';
  return sign + Math.round(abs).toLocaleString() + '원';
}

// ── 날짜 포맷 헬퍼 — 전 파일에서 참조 ──────────────────────────────────────

/** 오늘 날짜 → 'YYYY-MM-DD' 문자열 */
const todayStr = () => new Date().toISOString().slice(0, 10);

/**
 * Date 객체 → 'YYYY-MM-DD' 문자열
 * disclosure.js / investment.js 등의 인라인 패턴 통합
 */
const fmtDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

/**
 * 오늘 기준 N일 후 날짜 → 'YYYY-MM-DD'
 * 예: offsetDate(7) → 7일 후
 */
const offsetDate = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

// ══════════════════════════════════════════
//  전역 캐시 — companies 산업 매핑
//  {stock_code(suffix 제거): industry} 형태
//  사용법: const map = await getIndustryMap();
// ══════════════════════════════════════════
let _globalIndustryMap = null;
let _globalSubMap      = null;  // ✅ subMap도 모듈 스코프에 캐싱 (캐시 HIT 시 복원용)

async function getIndustryMap() {
  if (_globalIndustryMap) {
    window._subIndustryMap = _globalSubMap;
    return _globalIndustryMap;
  }

  const map    = {};
  const subMap = {};

  // ① app_config 캐시 우선 (auth 시 A.config에 로드됨 — DB 추가 조회 없음)
  const cachedInd = A.config?.industry_map;
  const cachedSub = A.config?.sub_industry_map;
  if (cachedInd) {
    try {
      Object.assign(map,    JSON.parse(cachedInd));
      Object.assign(subMap, cachedSub ? JSON.parse(cachedSub) : {});
      _globalIndustryMap       = map;
      _globalSubMap            = subMap;
      window._industryMapCache = map;
      window._subIndustryMap   = subMap;
      return map;
    } catch(e) {
      console.warn('[getIndustryMap] app_config 캐시 파싱 실패 — DB 직접 조회', e);
    }
  }

  // ② 폴백: companies 테이블 직접 조회 (캐시 미존재 시)
  try {
    let from = 0;
    while (true) {
      const { data } = await sb.from('companies')
        .select('code,industry,sub_industry')
        .eq('is_monitored', true)
        .range(from, from + 999);
      if (!data?.length) break;
      data.forEach(c => {
        const code = c.code.replace(/\.(KS|KQ)$/, '');
        if (c.industry)     map[code]    = c.industry;
        if (c.sub_industry) subMap[code] = c.sub_industry;
      });
      if (data.length < 1000) break;
      from += 1000;
    }
  } catch(e) { console.warn('getIndustryMap 직접조회 실패:', e); }

  _globalIndustryMap       = map;
  _globalSubMap            = subMap;
  window._industryMapCache = map;
  window._subIndustryMap   = subMap;
  return map;
}

// ══════════════════════════════════════════
//  전역 캐시 — market_data 최신 날짜
//  사용법: const maxDate = await getLatestMarketDate();
//  매 페이지 전환마다 재조회하지 않도록 세션 캐싱
//  새로고침 필요 시: _latestMarketDate = null; 후 재호출
// ══════════════════════════════════════════
let _latestMarketDate = null;

async function getLatestMarketDate() {
  if (_latestMarketDate) return _latestMarketDate;
  try {
    const { data } = await sb.from('market_data')
      .select('base_date')
      .order('base_date', { ascending: false })
      .limit(1);
    _latestMarketDate = data?.[0]?.base_date || null;
  } catch(e) { console.warn('getLatestMarketDate 실패:', e); }
  return _latestMarketDate;
}

// ══════════════════════════════════════════
//  봇 재로드 요청 — stocks.js / bots.js 공용
// ══════════════════════════════════════════
// 봇 재로드 플래그 upsert — saveEdit, monApply 등 버튼 없는 호출에서도 사용
async function triggerBotReload() {
  const { error } = await sb.from('app_config')
    .upsert({ key: 'reload_flag', value: String(Date.now()) }, { onConflict: 'key' });
  if (error) throw error;
}

async function requestBotReload(btnId = 'reload-btn') {
  if (!canEdit()) { toast('권한이 없습니다.', 'error'); return; }
  await withBtn(btnId, '전송 중...', triggerBotReload)
    .then(() => toast('✓ 재로드 요청 전송 완료 — 봇이 1분 내 반영합니다', 'success'))
    .catch(e => toast('전송 실패: ' + e.message, 'error'));
}

// ══════════════════════════════════════════
//  공통 UI 헬퍼
// ══════════════════════════════════════════

/**
 * 버튼 로딩 상태 관리 — 작업 중 비활성화, 완료/실패 시 원복
 * 사용: await withBtn('btn-id', '처리 중...', async () => { ... })
 */
async function withBtn(btnId, loadingText, fn) {
  const btn = document.getElementById(btnId);
  const orig = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.textContent = loadingText; }
  try { return await fn(); }
  finally { if (btn) { btn.disabled = false; btn.innerHTML = orig; } }
}

/**
 * 컨테이너 로딩 → 실행 → 에러 처리 패턴 공통화
 * 사용: await withLoad('el-id', async el => { el.innerHTML = ...; })
 */
async function withLoad(elId, fn) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = loadingHTML();
  try { await fn(el); }
  catch(e) { el.innerHTML = errorHTML(e.message); }
}

/**
 * Chart.js 라인차트 공통 호버/클릭-고정 인터랙션 바인딩.
 * 마우스 이동 → 최근접 라인 하이라이트, 클릭 → 고정/해제, 이탈 → 복원.
 * 차트별 시각 표현(색상·굵기)은 applyHighlight(label)에 위임 → 표현 불변.
 *   getChart():      현재 살아있는 Chart 인스턴스 반환
 *   applyHighlight:  하이라이트 적용 함수 (label|null)
 *   state:           { pinned, hovered } getter/setter 객체 (차트별 전역 상태 래핑)
 * 차트 재생성마다 호출해도 안전 — 이전 핸들러를 제거 후 재바인딩.
 */
function bindLineChartHover(canvas, { getChart, applyHighlight, state }) {
  if (!canvas) return;
  [['mousemove','_lphMove'], ['mouseleave','_lphLeave'], ['click','_lphClick']]
    .forEach(([ev, k]) => { if (canvas[k]) canvas.removeEventListener(ev, canvas[k]); });

  const labelAt = (e) => {
    const chart = getChart();
    if (!chart) return null;
    const pts = chart.getElementsAtEventForMode(e, 'nearest', { intersect: false }, true);
    return pts.length ? chart.data.datasets[pts[0].datasetIndex]?.label : null;
  };

  canvas._lphMove = (e) => {
    if (state.pinned) return;            // 고정 중엔 호버 무시
    const label = labelAt(e);
    if (label === state.hovered) return;
    state.hovered = label;
    applyHighlight(label);
  };
  canvas._lphLeave = () => {
    if (state.pinned) return;
    state.hovered = null;
    applyHighlight(null);
  };
  canvas._lphClick = (e) => {
    const clicked = labelAt(e);
    state.pinned  = (clicked && clicked !== state.pinned) ? clicked : null;
    state.hovered = state.pinned;
    applyHighlight(state.pinned);
  };

  canvas.addEventListener('mousemove',  canvas._lphMove);
  canvas.addEventListener('mouseleave', canvas._lphLeave);
  canvas.addEventListener('click',      canvas._lphClick);
}

/** Supabase auth 에러 메시지 한국어 변환 */
function parseAuthError(e) {
  const msg = e.message || JSON.stringify(e);
  if (msg.includes('Invalid login'))      return '이메일 또는 비밀번호가 올바르지 않습니다.';
  if (msg.includes('Email not confirmed')) return '이메일 인증이 필요합니다. Supabase에서 Confirm email을 OFF로 설정해주세요.';
  if (msg.includes('already registered')) return '이미 가입된 이메일입니다. 로그인을 시도해보세요.';
  if (msg.includes('fetch'))              return 'Supabase 연결 실패 — SB_URL, SB_KEY를 확인해주세요.';
  if (msg.includes('Database error'))     return 'DB 오류 — Supabase SQL Editor에서 fix_trigger.sql을 실행해주세요.';
  return msg;
}

// ── KR 산업별 색상 (단일 정의) ──
// 주의: IND_COLORS(산업 흐름 차트용)와 KR_IND_COLORS(US vs KR 비교용)를 통합
const IND_COLORS = {
  '반도체': '#2AABEE', '바이오': '#2dce89', '2차전지': '#ffd600',
  '엔터':   '#ff6b35', '소비재': '#f5365c', '뷰티':    '#a259ff',
  '조선':   '#00d4aa', '로봇':   '#fb6340', '우주':    '#4fc3f7',
  '신재생': '#aed581', '테크':   '#e040fb',
};


// ADMIN 섹션 접기/펼치기
function toggleAdminNav() {
  const sec = document.getElementById('nav-sec-admin');
  const items = document.getElementById('nav-admin-items');
  if (!sec || !items) return;
  sec.classList.toggle('open');
  items.classList.toggle('open');
}

// 키보드 단축키 (Task 8-2)
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  const map = { '1':'investment','2':'screener','3':'watchlist','4':'report','5':'comparison' };
  if (map[e.key]) go(map[e.key]);
  if (e.key === '/') { e.preventDefault(); document.querySelector('.search-box')?.focus(); }
});
