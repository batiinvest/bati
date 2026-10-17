// card-capture.js — 카드 이미지 저장(블로그용)
// 카드에 마우스를 올리면 오른쪽 위에 [복사] [PNG] [흰 배경]. 복사 = 클립보드(네이버 블로그 에디터에 Ctrl+V), PNG = 파일 저장
// 대상: .card 또는 [data-capture] 중 가장 안쪽 상자([data-capture-off]는 제외 — 탭 전체 래퍼·탭 막대)
// html-to-image(CDN, 처음 누를 때 로드)로 최대 3배 해상도. 화면 캡처는 글자가 몇 픽셀뿐이라 블로그가 줄이면 번짐
// 글꼴: 이미지 안에서는 페이지 글꼴을 못 쓰므로 카드가 실제 쓰는 Pretendard 굵기만 임베드(굵기당 약 0.77MB, 9개 전부면 7MB)
// 흰 배경: 화면 밖 복제본에 밝은 색 변수를 입혀 캡처(화면 깜빡임 없음). Chart.js 캔버스는 그려진 그대로 복사됨

const CAP = { lib: null, fonts: new Map(), target: null, hideT: 0, busy: false, light: false, bar: null };
try { CAP.light = localStorage.getItem('bati-capture-light') === '1'; } catch (e) {}

// 흰 배경용 색 변수 — 의미색(상승 빨강·하락 파랑 등)은 흰 바탕에서 읽히게 조금 진하게
const _CAP_LIGHT = {
  '--bg': '#ffffff', '--bg2': '#ffffff', '--bg3': '#f3f5f9',
  '--border': 'rgba(15,23,42,0.10)', '--border2': 'rgba(15,23,42,0.18)',
  '--text': '#0f172a', '--text1': '#1e293b', '--text2': '#475569', '--text3': '#64748b',
  '--tg': '#1689cf', '--tg2': '#1276b3', '--red': '#e11d48', '--up': '#e11d48', '--blue': '#2563eb', '--down': '#2563eb', '--sell': '#2563eb',
  '--green': '#16a34a', '--buy': '#059669', '--warn': '#b7791f', '--accent': '#b7791f', '--danger': '#dc2626', '--yellow': '#ea580c',
};
const _CAP_WEIGHTS = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };
const _CAP_SEL = '.card:not([data-capture-off]), [data-capture]';

function _capLoadLib() {
  if (window.htmlToImage) return Promise.resolve(window.htmlToImage);
  return CAP.lib || (CAP.lib = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js';
    s.onload = () => resolve(window.htmlToImage);
    s.onerror = () => { CAP.lib = null; reject(new Error('캡처 라이브러리를 불러오지 못했습니다')); };
    document.head.appendChild(s);
  }));
}

// 카드 안 글자의 굵기만 골라 Pretendard @font-face(data URL) — 한 번 받은 굵기는 재사용
async function _capFontCSS(node) {
  const link = document.querySelector('link[href*="pretendard"]');
  if (!link) return '';
  const used = new Set();
  for (const el of [node, ...node.querySelectorAll('*')]) {
    const w = parseInt(getComputedStyle(el).fontWeight, 10);
    if (w) used.add(Math.min(900, Math.max(100, Math.round(w / 100) * 100)));
  }
  const rules = await Promise.all([...used].map(w => {
    if (!CAP.fonts.has(w)) {
      CAP.fonts.set(w, (async () => {
        // pretendard.css와 같은 상대 경로(…/dist/web/static/ → …/packages/pretendard/dist/web/static/woff2/)
        const url = new URL(`../../../packages/pretendard/dist/web/static/woff2/Pretendard-${_CAP_WEIGHTS[w]}.woff2`, link.href).href;
        const blob = await (await fetch(url)).blob();
        const data = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(blob); });
        return `@font-face{font-family:'Pretendard';font-style:normal;font-weight:${w};src:url(${data}) format('woff2');}`;
      })().catch(() => { CAP.fonts.delete(w); return ''; }));   // 실패하면 그 굵기만 시스템 글꼴
    }
    return CAP.fonts.get(w);
  }));
  return rules.join('\n');
}

// 흰 배경: 화면 밖에 같은 폭으로 복제 + 밝은 색 변수
function _capLightClone(el) {
  const holder = document.createElement('div');
  holder.style.cssText = `position:fixed;left:-100000px;top:0;width:${el.getBoundingClientRect().width}px;pointer-events:none`;
  for (const [k, v] of Object.entries(_CAP_LIGHT)) holder.style.setProperty(k, v);
  holder.style.color = _CAP_LIGHT['--text'];
  const clone = el.cloneNode(true);
  const src = el.querySelectorAll('canvas'), dst = clone.querySelectorAll('canvas');
  src.forEach((c, i) => { try { dst[i].getContext('2d').drawImage(c, 0, 0); } catch (e) {} });   // 복제 캔버스는 비어 있음
  clone.style.margin = '0';
  holder.appendChild(clone);
  document.body.appendChild(holder);
  return { node: clone, done: () => holder.remove() };
}

// 이미지 바탕: 카드 자기 배경(투명 래퍼면 흰 배경 모드는 흰색, 아니면 페이지 배경)
function _capBg(node, light) {
  const c = getComputedStyle(node).backgroundColor;
  if (c && !/rgba\(.*,\s*0\)$|transparent/.test(c)) return c;
  return light ? _CAP_LIGHT['--bg'] : getComputedStyle(document.body).backgroundColor;
}

// 파일명: 종목명(또는 페이지명)_카드제목_YYYYMMDD.png
function _capFileName(el) {
  const head = [...el.querySelectorAll('span,div,b,strong,h1,h2,h3,h4')]
    .find(x => !x.children.length && x.textContent.trim().length >= 2 && parseInt(getComputedStyle(x).fontWeight, 10) >= 700);
  const title = (head?.textContent.trim() || '카드').slice(0, 24);
  // 기업 리포트 화면(#rp-… 안)의 카드면 종목명, 아니면 페이지 제목
  const page = (typeof _rpStock !== 'undefined' && _rpStock?.name && el.closest('[id^="rp-"]') && _rpStock.name)
    || (typeof A !== 'undefined' && typeof PAGE_META !== 'undefined' && PAGE_META[A.page]?.title) || 'BatiInvest';
  const day = (typeof kstToday === 'function' ? kstToday() : new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  return `${page}_${title}_${day}.png`.replace(/[\\/:*?"<>|\s]+/g, '_');
}

function _capDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function _capRun(mode) {
  const el = CAP.target;
  if (!el || CAP.busy) return;
  CAP.busy = true; _capBarState(true);
  let tmp = null;
  try {
    const lib = await _capLoadLib();
    tmp = CAP.light ? _capLightClone(el) : null;
    const node = tmp ? tmp.node : el;
    const r = node.getBoundingClientRect();
    // 최대 3배, 아주 큰 상자는 긴 변 12,000px 안으로(브라우저 캔버스 한도·메모리)
    const pixelRatio = Math.max(1, Math.min(3, 12000 / Math.max(r.width, r.height, 1)));
    const blob = await lib.toBlob(node, {
      pixelRatio, backgroundColor: _capBg(node, CAP.light), fontEmbedCSS: await _capFontCSS(node),
      filter: n => !(n.dataset && 'noCapture' in n.dataset),
    });
    if (!blob) throw new Error('이미지를 만들지 못했습니다');
    const name = _capFileName(el);
    if (mode === 'copy') {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        toast('이미지를 복사했습니다 — 블로그 에디터에서 Ctrl+V', 'success');
      } catch (e) {   // 클립보드 권한이 막힌 브라우저는 파일로
        _capDownload(blob, name);
        toast('클립보드 복사가 막혀 PNG 파일로 저장했습니다', 'warn');
      }
    } else {
      _capDownload(blob, name);
      toast(`저장했습니다: ${name}`, 'success');
    }
  } catch (e) {
    toast('이미지 저장 실패: ' + (e?.message || e), 'error');
  } finally {
    tmp?.done();
    CAP.busy = false; _capBarState(false);
  }
}

// ── 떠 있는 버튼 막대 ──────────────────────────────────────────────────────
function _capBar() {
  if (CAP.bar) return CAP.bar;
  const b = document.createElement('div');
  b.setAttribute('data-no-capture', '');
  b.style.cssText = 'position:fixed;z-index:9999;display:none;gap:3px;align-items:center;padding:3px;border-radius:8px;'
    + 'background:color-mix(in srgb, var(--bg) 90%, transparent);border:1px solid var(--border2);box-shadow:0 4px 14px rgba(0,0,0,.35)';
  const btn = (act, label, tip) => `<button data-cap="${act}" title="${tip}" style="padding:3px 8px;border-radius:5px;border:1px solid var(--border);
    background:var(--bg3);color:var(--text1);font-family:inherit;font-size:calc(11px*var(--m-label));cursor:pointer;white-space:nowrap">${label}</button>`;
  b.innerHTML = btn('copy', '복사', '3배 해상도 이미지를 클립보드로 — 블로그 에디터에 Ctrl+V')
    + btn('save', 'PNG', '3배 해상도 PNG 파일로 저장')
    + btn('light', '흰 배경', '흰 바탕으로 캡처(켜고 끄기, 이 기기에 기억)');
  b.addEventListener('click', e => {
    const act = e.target.closest('[data-cap]')?.dataset.cap;
    if (!act || CAP.busy) return;
    if (act === 'light') {
      CAP.light = !CAP.light;
      try { localStorage.setItem('bati-capture-light', CAP.light ? '1' : '0'); } catch (err) {}
      _capBarState(false);
      return;
    }
    _capRun(act);
  });
  document.body.appendChild(b);
  CAP.bar = b;
  _capBarState(false);
  return b;
}

function _capBarState(busy) {
  const b = CAP.bar;
  if (!b) return;
  const lt = b.querySelector('[data-cap="light"]');
  lt.style.background = CAP.light ? 'color-mix(in srgb, var(--tg) 22%, var(--bg3))' : 'var(--bg3)';
  lt.style.color = CAP.light ? 'var(--tg)' : 'var(--text1)';
  lt.setAttribute('aria-pressed', CAP.light ? 'true' : 'false');
  b.querySelectorAll('[data-cap="copy"],[data-cap="save"]').forEach(x => { x.disabled = busy; x.style.opacity = busy ? '.5' : '1'; });
  b.querySelector('[data-cap="copy"]').textContent = busy ? '만드는 중…' : '복사';
}

function _capPlace() {
  const t = CAP.target, b = CAP.bar;
  if (!t || !b || b.style.display === 'none') return;
  const r = t.getBoundingClientRect();
  if (!t.isConnected || r.bottom < 40 || r.top > innerHeight - 20) { _capHide(); return; }
  b.style.top = `${Math.max(6, r.top + 6)}px`;
  b.style.left = `${Math.max(6, r.right - b.offsetWidth - 6)}px`;
}
function _capShow(card) {
  CAP.target = card;
  _capBar().style.display = 'flex';
  _capPlace();
}
function _capHide() {
  if (CAP.busy) return;
  if (CAP.bar) CAP.bar.style.display = 'none';
  CAP.target = null;
}

// 마우스가 있는 기기에서만(터치 기기는 블로그 작성용이 아니고 탭과 충돌)
if (window.matchMedia && matchMedia('(hover: hover)').matches) {
  document.addEventListener('mouseover', e => {
    if (CAP.busy) return;
    if (CAP.bar && CAP.bar.contains(e.target)) { clearTimeout(CAP.hideT); return; }
    const card = e.target.closest ? e.target.closest(_CAP_SEL) : null;
    clearTimeout(CAP.hideT);
    if (card && card.offsetWidth >= 200 && card.offsetHeight >= 60) {
      if (card !== CAP.target || CAP.bar?.style.display === 'none') _capShow(card);
    } else {
      CAP.hideT = setTimeout(_capHide, 300);
    }
  }, { passive: true });
  window.addEventListener('scroll', _capPlace, { passive: true, capture: true });
  window.addEventListener('resize', _capPlace, { passive: true });
}
