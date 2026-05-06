// nav.js — 페이지 라우팅, 화면 전환
// 페이지 타이틀·함수명은 pages.js의 PAGE_META를 단일 소스로 참조

function go(page) {
  A.page = page;
  closeSidebar();
  document.querySelectorAll('.nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.page === page));
  const meta = PAGE_META[page];
  document.getElementById('page-title').textContent = meta?.title || '';
  draw();
}

function draw() {
  const el   = document.getElementById('content');
  const meta = PAGE_META[A.page] || PAGE_META['overview'];
  const fn   = window[meta.fn];

  el.innerHTML = typeof fn === 'function' ? fn() : '';

  // onLoad 콜백 실행
  if (meta.onLoad && typeof window[meta.onLoad] === 'function') {
    window[meta.onLoad]();
  }
}

// ── Pages ──
