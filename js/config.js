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
//  공통 HTML 유틸
// ══════════════════════════════════════════
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
