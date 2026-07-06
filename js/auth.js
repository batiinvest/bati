// auth.js — 로그인, 회원가입, 세션 관리
async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pw    = document.getElementById('login-pw').value;
  const err   = document.getElementById('login-err');
  err.classList.add('hidden');

  if (!email || !pw) {
    err.textContent = '이메일과 비밀번호를 입력해주세요.';
    err.classList.remove('hidden'); return;
  }

  await withBtn('login-btn', '로그인 중...', async () => {
    const { error } = await sb.auth.signInWithPassword({ email, password: pw });
    if (error) throw error;
  }).catch(e => {
    console.error('[login error]', e);
    err.textContent = parseAuthError(e);
    err.classList.remove('hidden');
  });
}

async function doSignup() {
  const name  = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const pw    = document.getElementById('signup-pw').value;
  const err   = document.getElementById('signup-err');
  err.style.color = 'var(--red)';
  err.classList.add('hidden');

  if (!name || !email || pw.length < 8) {
    err.textContent = '모든 항목을 입력하세요 (비밀번호 8자 이상)';
    err.classList.remove('hidden'); return;
  }

  await withBtn('signup-btn', '가입 중...', async () => {
    const { data, error } = await sb.auth.signUp({
      email, password: pw, options: { data: { name } }
    });
    if (error) throw error;

    if (data?.user?.id) {
      await sb.from('app_users').upsert({ id: data.user.id, name, role: 'viewer' }, { onConflict: 'id' });
    }

    err.style.color = 'var(--green)';
    err.textContent = '가입 완료! 바로 로그인해주세요.';
    err.classList.remove('hidden');
    setTimeout(() => {
      showLogin();
      document.getElementById('login-email').value = email;
    }, 1500);
  }).catch(e => {
    console.error('[signup error]', e);
    err.textContent = parseAuthError(e);
    err.classList.remove('hidden');
  });
}

async function doLogout() {
  await sb.auth.signOut();
}

function showLogin()  { document.getElementById('login-form').classList.remove('hidden'); document.getElementById('signup-form').classList.add('hidden'); }
function showSignup() { document.getElementById('login-form').classList.add('hidden'); document.getElementById('signup-form').classList.remove('hidden'); }

// ── Auth boot: 세션 확인 후 대시보드 또는 로그인 화면 ──
async function bootAuth() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session?.user) {
      A.user = session.user;
      await Promise.all([loadProfile(), loadConfig(), loadRooms()]);
      showDashboard();
    } else {
      showLoginScreen();
    }
  } catch(e) {
    console.error('[boot error]', e);
    showLoginScreen();
  }
}

// ── 로그인/로그아웃 이벤트 감지 ──
sb.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' && !A.user) {
    bootAuth();
  } else if (event === 'SIGNED_OUT') {
    A.user = null; A.profile = null;
    showLoginScreen();
  }
});

// 페이지 로드 시 실행

async function loadProfile() {
  const { data, error } = await DB('app_users').select('*').eq('id', A.user.id).single();
  if (error) {
    console.error('[loadProfile] 실패:', error.message);
    toast('프로필 로드 실패 — 권한이 제한됩니다.', 'error');
    return;
  }
  A.profile = data;
}

async function loadConfig() {
  const { data } = await DB('app_config').select('key,value');
  if (data) data.forEach(r => A.config[r.key] = r.value);
}

async function loadRooms() {
  const { data, error } = await DB('rooms').select('*').order('cat').order('name');
  if (error) {
    console.error('[loadRooms] 실패:', error.message);
    toast('채팅방 목록 로드 실패 — 새로고침 해주세요.', 'error');
    return;
  }
  A.rooms = data || [];
}

function showDashboard() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');
  // 유저 정보 표시
  const name  = A.profile?.name  || A.user.email.split('@')[0];
  const email = A.user.email;
  const role  = A.profile?.role || 'viewer';
  document.getElementById('user-name').textContent  = name;
  document.getElementById('user-email').textContent = email;
  document.getElementById('user-avatar').textContent = name.slice(0,2).toUpperCase();
  document.getElementById('badge').textContent = A.rooms.length;
  // 역할에 따라 네비 잠금
  if (!isAdmin()) {
    document.getElementById('nav-settings').classList.add('disabled');
    document.getElementById('nav-team').classList.add('disabled');
    document.getElementById('nav-botconfig').classList.add('disabled');
  }
  // viewer는 '오늘의 시황'만 노출 — 나머지 메뉴·섹션 전부 숨김
  if (isViewer()) {
    document.querySelectorAll('.nav-item[data-page]').forEach(el => {
      if (!VIEWER_PAGES.includes(el.dataset.page)) el.classList.add('hidden');
    });
    // 보이는 항목이 하나도 없는 섹션 헤더(DISCOVER/RESEARCH/PORTFOLIO/ADMIN) 숨김
    document.querySelectorAll('.nav .nav-sec').forEach(sec => {
      let hasVisible = false;
      for (let n = sec.nextElementSibling; n && !n.classList.contains('nav-sec'); n = n.nextElementSibling) {
        if (n.matches('.nav-item') && !n.classList.contains('hidden')) hasVisible = true;
        if (n.querySelector && n.querySelector('.nav-item:not(.hidden)')) hasVisible = true;
      }
      if (!hasVisible) sec.classList.add('hidden');
    });
    document.getElementById('nav-admin-items')?.classList.add('hidden');
    // 상단 버튼 전체 숨김
    ['btn-notice','btn-add','sync-btn'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
  } else if (!canEdit()) {
    document.getElementById('btn-notice').classList.add('hidden');
    document.getElementById('btn-add').classList.add('hidden');
    document.getElementById('sync-btn').classList.add('hidden');
  }
  go('investment');
}

function showLoginScreen() {
  document.getElementById('dashboard').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
}

// (botToken 제거 — 봇 토큰은 백엔드 .env에만 존재. 쓰기 작업은 bot_requests 큐로 위임)