// card-capture.js — 카드 이미지 저장(블로그용)
// 카드에 마우스를 올리면 오른쪽 위에 [복사] [PNG] [흰 배경]. 복사 = 클립보드(네이버 블로그 에디터에 Ctrl+V), PNG = 파일 저장
// 대상: .card 또는 [data-capture] 중 가장 안쪽 상자([data-capture-off]는 제외 — 탭 전체 래퍼·탭 막대)
// html-to-image(CDN, 처음 누를 때 로드)로 최대 3배 해상도. 화면 캡처는 글자가 몇 픽셀뿐이라 블로그가 줄이면 번짐
// 글꼴: 이미지 안에서는 페이지 글꼴을 못 쓰므로 카드가 실제 쓰는 Pretendard 굵기만 임베드(굵기당 약 0.77MB, 9개 전부면 7MB)
// 화면 밖 복제본을 캡처(깜빡임 없음) — 흰 배경이면 밝은 색 변수, Chart.js 차트는 3배 해상도로 다시 그림(흰 배경이면 글자·격자 색도)
// 조작 줄 등 이미지에 넣지 않을 요소는 data-no-capture

const CAP = { lib: null, fonts: new Map(), target: null, hideT: 0, busy: false, light: false, zoom: 1.3, bar: null };
// 크기(zoom): 카드를 1/zoom 폭으로 다시 배치해 캡처 → 블로그가 본문 폭(약 966px)으로 늘려 보여줄 때 글자·차트가 zoom배로 커짐.
// 화면 폭 그대로 찍으면 해상도가 높아도 글자가 화면과 같은 11~12px로 보여 블로그 본문(17px 안팎)보다 작고 흐려 보였음
const _CAP_ZOOMS = [1, 1.3, 1.6];
try {
  CAP.light = localStorage.getItem('bati-capture-light') === '1';
  const z = parseFloat(localStorage.getItem('bati-capture-zoom'));
  if (_CAP_ZOOMS.includes(z)) CAP.zoom = z;
} catch (e) {}

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

// 캡처용 복제본: 화면 밖 홀더(같은 폭)에 복제. 흰 배경이면 밝은 색 변수를 입힘.
// 캔버스는 복제하면 비므로 — Chart.js 차트는 같은 데이터로 3배 해상도로 다시 그리고(흰 배경이면 글자·격자 색도 바꿈),
// 그 밖의 캔버스는 그려진 그림을 복사
function _capClone(el, light, ratio, width) {
  const holder = document.createElement('div');
  const ps = getComputedStyle(el.parentElement || document.body);   // 원래 자리에서 물려받던 글자 속성
  holder.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;pointer-events:none`;
  holder.style.font = ps.font;
  holder.style.color = light ? _CAP_LIGHT['--text'] : ps.color;
  if (light) for (const [k, v] of Object.entries(_CAP_LIGHT)) holder.style.setProperty(k, v);
  const clone = el.cloneNode(true);
  clone.style.margin = '0';
  holder.appendChild(clone);
  document.body.appendChild(holder);
  const src = el.querySelectorAll('canvas'), dst = clone.querySelectorAll('canvas');
  src.forEach((c, i) => _capCanvas(c, dst[i], light, ratio, holder));
  return { node: clone, done: () => holder.remove() };
}

// 어두운 테마용 밝은 무채색(글자 #a8adc4·#8b90a7·#e8ecf1, 격자 rgba(255,255,255,.05) 등)만 흰 바탕용으로.
// 계열 색(채도 있는 색)·어두운 색은 그대로. 색이 아닌 문자열(라벨 등)은 파싱 실패로 그대로
const _capCtx = document.createElement('canvas').getContext('2d');
function _capLightColor(v) {
  if (typeof v !== 'string') return v;
  _capCtx.fillStyle = '#000'; _capCtx.fillStyle = v;
  const s = _capCtx.fillStyle;   // '#rrggbb' 또는 'rgba(r, g, b, a)' — 색이 아니면 '#000000'
  let r, g, b, a = 1, m;
  if ((m = s.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i))) [r, g, b] = m.slice(1).map(x => parseInt(x, 16));
  else if ((m = s.match(/^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/))) { [r, g, b] = m.slice(1, 4).map(Number); if (m[4] != null) a = +m[4]; }
  else return v;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b, chroma = Math.max(r, g, b) - Math.min(r, g, b);
  if (lum < 120 || chroma > 45) return v;
  if (a < 0.6) return `rgba(15,23,42,${Math.min(0.22, a * 1.6 + 0.03).toFixed(2)})`;   // 격자·옅은 선
  return lum > 215 ? '#1e293b' : '#475569';                                           // 제목 / 눈금·범례 글자
}
// 평범한 객체·배열만 깊이 복사(함수·그라디언트 등은 그대로), 값마다 fix 적용
const _capDeep = (v, fix) => Array.isArray(v) ? v.map(x => _capDeep(x, fix))
  : v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype
    ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, _capDeep(x, fix)]))
    : fix(v);

function _capCanvas(src, dst, light, ratio, holder) {
  if (!dst) return;
  const chart = window.Chart?.getChart?.(src);
  // 복제본은 폭이 좁아질 수 있으므로(크기 옵션) 복제본 안 부모 폭에 맞춰 다시 그림.
  // 높이는 고정 높이 차트면 그대로, 비율 유지 차트면 원래 비율로
  const p = dst.parentElement, pcs = p && getComputedStyle(p);
  const pw = p ? p.clientWidth - parseFloat(pcs.paddingLeft) - parseFloat(pcs.paddingRight) : 0;
  const w = Math.round(Math.min(src.clientWidth, pw > 0 ? pw : src.clientWidth));
  const keepAspect = chart?.config?.options?.maintainAspectRatio !== false;
  const h = Math.round(keepAspect && src.clientWidth ? w * src.clientHeight / src.clientWidth : src.clientHeight);
  if (chart && w && h) {
    let off = null, tmp = null;
    try {
      off = document.createElement('canvas');
      off.width = w; off.height = h; off.style.cssText = `width:${w}px;height:${h}px`;
      holder.appendChild(off);   // 문서에 붙어 있어야 그려짐
      const cfg = chart.config, fix = light ? _capLightColor : (x => x);
      tmp = new window.Chart(off, {
        type: cfg.type,
        data: { labels: [...(cfg.data.labels || [])], datasets: cfg.data.datasets.map(d => _capDeep({ ...d, data: [...(d.data || [])] }, fix)) },
        options: Object.assign(_capDeep(cfg.options || {}, fix),
          { responsive: false, maintainAspectRatio: false, animation: false, devicePixelRatio: ratio, events: [] }),
        plugins: cfg.plugins || [],
      });
      const img = new Image();
      img.src = off.toDataURL('image/png');
      img.style.cssText = `display:block;width:${w}px;height:${h}px`;
      dst.replaceWith(img);
      return;
    } catch (e) {
      // 다시 그리기 실패 → 아래 그림 복사로
    } finally {
      try { tmp?.destroy(); } catch (e) {}
      off?.remove();
    }
  }
  try { dst.getContext('2d').drawImage(src, 0, 0); dst.style.maxWidth = '100%'; dst.style.height = 'auto'; } catch (e) {}
}

// 이미지 바탕 — 흰 배경: 카드 자기 배경(투명이면 흰색) / 어두운 배경: 카드 또는 가장 가까운 조상의 배경
const _capSolid = c => c && !/rgba\(.*,\s*0\)$|transparent/.test(c);
function _capBg(el, node, light) {
  if (light) { const c = getComputedStyle(node).backgroundColor; return _capSolid(c) ? c : _CAP_LIGHT['--bg']; }
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    const c = getComputedStyle(n).backgroundColor;
    if (_capSolid(c)) return c;
  }
  return getComputedStyle(document.body).backgroundColor;
}

// 파일명: 종목명(또는 페이지명)_카드제목_YYYYMMDD.png
function _capFileName(el) {
  // data-capture="제목"이 있으면 그것, 없으면 첫 굵은 글자(이미지에서 빠지는 조작 줄 제외)
  const head = [...el.querySelectorAll('span,div,b,strong,h1,h2,h3,h4')]
    .find(x => !x.children.length && !x.closest('[data-no-capture]') && x.textContent.trim().length >= 2 && parseInt(getComputedStyle(x).fontWeight, 10) >= 700);
  const title = (el.dataset.capture || head?.textContent.trim() || '카드').slice(0, 24);
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
    // 배치 폭 = 화면 폭 ÷ 크기(최소 360px). 이미지 가로 픽셀은 화면 폭의 3배 안팎으로 유지(배치 폭 × 3×크기)
    const width = Math.max(360, Math.round(el.getBoundingClientRect().width / CAP.zoom));
    const chartRatio = Math.max(1, Math.min(3 * CAP.zoom, 12000 / width));
    tmp = _capClone(el, CAP.light, chartRatio, width);
    const node = tmp.node;
    const nr = node.getBoundingClientRect();
    // 아주 큰 상자는 긴 변 12,000px 안으로(브라우저 캔버스 한도·메모리)
    const pixelRatio = Math.max(1, Math.min(chartRatio, 12000 / Math.max(nr.width, nr.height, 1)));
    const blob = await lib.toBlob(node, {
      pixelRatio, backgroundColor: _capBg(el, node, CAP.light), fontEmbedCSS: await _capFontCSS(node),
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
  b.innerHTML = btn('copy', '복사', '고해상도 이미지를 클립보드로 — 블로그 에디터에 Ctrl+V')
    + btn('save', 'PNG', '고해상도 PNG 파일로 저장')
    + btn('zoom', '크기', '블로그에 붙였을 때 글자 크기(100→130→160%). 클수록 카드를 좁게 다시 배치해 글자·차트가 커짐')
    + btn('light', '흰 배경', '흰 바탕으로 캡처(켜고 끄기, 이 기기에 기억)');
  b.addEventListener('click', e => {
    const act = e.target.closest('[data-cap]')?.dataset.cap;
    if (!act || CAP.busy) return;
    if (act === 'light' || act === 'zoom') {
      if (act === 'light') CAP.light = !CAP.light;
      else CAP.zoom = _CAP_ZOOMS[(_CAP_ZOOMS.indexOf(CAP.zoom) + 1) % _CAP_ZOOMS.length];
      try {
        localStorage.setItem('bati-capture-light', CAP.light ? '1' : '0');
        localStorage.setItem('bati-capture-zoom', String(CAP.zoom));
      } catch (err) {}
      _capBarState(false);
      _capPlace();   // 버튼 글자 폭이 바뀌어도 카드 오른쪽 끝에 맞춤
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
  b.querySelector('[data-cap="zoom"]').textContent = `크기 ${Math.round(CAP.zoom * 100)}%`;
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
