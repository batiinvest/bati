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
const CATS = { '바이오':'#2AABEE','뷰티':'#f5365c','로봇':'#2dce89','2차전지':'#fb6340','신재생':'#5e72e4','소비재':'#f3a4b5','테크':'#a259ff','반도체':'#8898aa','엔터':'#ffd600','조선':'#11cdef','우주':'#4a6fa5' };

// ══════════════════════════════════════════
//  공통 HTML 유틸
// ══════════════════════════════════════════
const loadingHTML = (msg = '') =>
  `<div style="padding:1.5rem;text-align:center;color:var(--text3);font-size:13px"><span class="loading"></span>${msg ? ' ' + msg : ''}</div>`;

const emptyHTML = (msg = '데이터 없음') =>
  `<div style="padding:1.5rem;text-align:center;color:var(--text3);font-size:13px">${msg}</div>`;

const errorHTML = (msg = '') =>
  `<div style="padding:1rem;color:var(--red);font-size:13px">${msg}</div>`;

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

// ── App state ──
const A = {
  user: null,     // Supabase auth user
  profile: null,  // app_users row  { role, name, email }
  rooms: [],
  config: {},     // app_config rows: { key: value }
  page: 'overview',
  cat: 'all', status: 'all', q: '',
  room: null,
};

const isAdmin  = () => A.profile?.role === 'admin';
const isEditor = () => ['admin','editor'].includes(A.profile?.role);
const canEdit  = () => isEditor();
const canDel   = () => isAdmin();

// ══════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════

// ── 재무 조회 상태 ──
const F = { mode: 'market', industry: '전체', q: '', sortBy: 'market_cap', sortDir: 'desc' };

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

// 등락률 색상 — 한국 주식 관행 (상승=빨강, 하락=파랑)
const chgColor = v => v > 0 ? 'var(--red)' : v < 0 ? 'var(--blue)' : 'var(--text3)';

// 등락률 문자열 (예: +2.34% / -1.50% / —)
const chgStr = v => v != null ? `${v > 0 ? '+' : ''}${v.toFixed(2)}%` : '—';

// ══════════════════════════════════════════
//  전역 캐시 — companies 산업 매핑
//  {stock_code(suffix 제거): industry} 형태
//  사용법: const map = await getIndustryMap();
// ══════════════════════════════════════════
let _globalIndustryMap = null;

async function getIndustryMap() {
  if (_globalIndustryMap) return _globalIndustryMap;
  const map = {};
  try {
    let from = 0;
    while (true) {
      const { data } = await sb.from('companies')
        .select('code,industry')
        .range(from, from + 999);
      if (!data?.length) break;
      data.forEach(c => {
        if (c.industry) map[c.code.replace(/\.(KS|KQ)$/, '')] = c.industry;
      });
      if (data.length < 1000) break;
      from += 1000;
    }
  } catch(e) { console.warn('getIndustryMap 실패:', e); }
  _globalIndustryMap = map;
  // market-overview.js의 _industryMapCache와 동기화 (하위 호환)
  window._industryMapCache = map;
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
async function requestBotReload(btnId = 'reload-btn') {
  if (!canEdit()) { toast('권한이 없습니다.', 'error'); return; }
  const btn = document.getElementById(btnId);
  const origHTML = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.textContent = '전송 중...'; }
  try {
    const { error } = await sb.from('app_config')
      .update({ value: String(Date.now()) })
      .eq('key', 'reload_flag');
    if (error) throw error;
    toast('✓ 재로드 요청 전송 완료 — 봇이 1분 내 반영합니다', 'success');
  } catch(e) {
    toast('전송 실패: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = origHTML; }
  }
}
