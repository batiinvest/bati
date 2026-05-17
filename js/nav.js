// nav.js — 페이지 라우팅, 화면 전환
// 페이지 타이틀·함수명은 pages.js의 PAGE_META를 단일 소스로 참조

function go(page) {
  A.page = page;
  closeSidebar();
  document.querySelectorAll('.nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.page === page));
  const meta = PAGE_META[page];
  document.getElementById('page-title').textContent = meta?.title || '';

  // 채팅방 관련 버튼은 전체현황(overview) 페이지에서만 표시
  const chatBtns = ['btn-notice', 'btn-add', 'sync-btn'];
  const showChatBtns = page === 'overview';
  chatBtns.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = showChatBtns ? '' : 'none';
  });

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

  // 채팅방 검색 input IME 바인딩 (한글 조합 완료 후에만 재렌더링)
  const inp = document.getElementById('room-search-input');
  if (inp) {
    let composing = false;
    inp.addEventListener('compositionstart', () => { composing = true; });
    inp.addEventListener('compositionend',   () => {
      composing = false;
      A.q = inp.value;
      draw();
    });
    inp.addEventListener('input', () => {
      if (composing) return;          // 한글 조합 중이면 skip
      A.q = inp.value;
      const pos = inp.selectionStart;
      draw();
      const next = document.getElementById('room-search-input');
      if (next) { next.focus(); next.setSelectionRange(pos, pos); }
    });
    inp.focus();
    inp.setSelectionRange(inp.value.length, inp.value.length);
  }
}

// ── Pages ──
