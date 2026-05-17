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

// 검색 입력 시 포커스·커서 위치 유지하며 재렌더링
function drawKeepFocus() {
  const el  = document.getElementById('room-search-input');
  const pos = el ? el.selectionStart : null;
  draw();
  if (pos !== null) {
    const newEl = document.getElementById('room-search-input');
    if (newEl) { newEl.focus(); newEl.setSelectionRange(pos, pos); }
  }
}

// 한글 조합(IME) 완료 후에만 재렌더링 — 조합 중 재렌더링 방지
let _roomComposing = false;
function _roomSearchInput(el) {
  A.q = el.value;
  if (!_roomComposing) drawKeepFocus();
}
// compositionend/start 이벤트는 inline으로 못 쓰므로 draw 후 바인딩
const _origDraw = draw;
function draw() {
  _origDraw();
  const inp = document.getElementById('room-search-input');
  if (inp && !inp._imebound) {
    inp._imebound = true;
    inp.addEventListener('compositionstart', () => { _roomComposing = true; });
    inp.addEventListener('compositionend',   () => {
      _roomComposing = false;
      A.q = inp.value;
      drawKeepFocus();
    });
  }
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
