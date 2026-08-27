/**
 * flow-map.js — 수급 지도 (Accumulation / Distribution Map)
 *
 * 종목별 "찬집 / 빈집" 사분면 지도. 참고: DAOL 커버리지 대시보드 #flowmap.
 *   ├ 가로축(X) = 중기 누적 순매수 ÷ 시가총액  → 얼마나 "찼나"(찬집) / "비었나"(빈집)
 *   └ 세로축(Y) = 최근 단기 순매수 ÷ 시가총액  → 지금 담나 / 비우나
 *
 *   4사분면:
 *     · 우상 찬집·계속 담는 중  (중기 유입 + 최근도 매수)
 *     · 우하 찬집·비우기 시작    (중기 유입 but 최근 매도 전환 — 차익실현 경계)
 *     · 좌상 빈집·담기 시작      (중기 유출 but 최근 매수 전환 — 저점 매집 관찰)
 *     · 좌하 빈집·계속 비우는 중 (중기 유출 + 최근도 매도 — 소외)
 *
 * 값 = Σ(일별 순매수 주식수 × 일별 종가) ÷ 현재 시총.
 *   market_data.foreign_net_buy / institution_net_buy 는 **주식수** 단위라 종가를 곱해
 *   원화로 환산한 뒤 시총으로 정규화(참고 사이트와 동일 방식, 확정대금과 소수 오차 존재).
 *   ⚠ 순매수 데이터는 is_monitored 종목 + 2026-05-26 이후에만 존재 → 현재 1M·3M 창만 유효,
 *     이력이 쌓이면 6M·12M 칩이 자동 노출된다.
 *
 * 산업 필터(기본 반도체) 단위로 ~20~60종목만 찍어 사분면이 또렷하게 읽히도록 한다.
 *
 * 의존: sb, INDUSTRIES, IND_COLORS, getIndustryMap, getLatestMarketDate, fetchAllPages,
 *       fmtCap, fmtWon, fmtPct, wlBadge, escAttr, loadingHTML, setAsOf (config.js)
 */

// ── 상태 네임스페이스 (window._* 금지 규약) ─────────────────────────────────
const FM = {
  ind:     '반도체',   // 선택 산업
  win:     '3M',       // 기간 창 (1M | 3M | 6M | 12M)
  inv:     'both',     // 투자자 (both | foreign | inst)
  sortCol: 'med',      // 표 정렬 컬럼
  sortDir: -1,         // -1 내림차순, 1 오름차순
  raw:     {},         // 산업별 원자료 캐시 { ind: { dates, byCode } }
  latest:  null,       // 최신 거래일
};

// 기간 창 정의 — med=중기(가로) 거래일수, sh=단기(세로) 거래일수, th=노출 최소 거래일수
const _FM_WINS = [
  { k: '1M',  med: 20,  sh: 5,  th: 10  },
  { k: '3M',  med: 63,  sh: 20, th: 35  },
  { k: '6M',  med: 126, sh: 20, th: 80  },
  { k: '12M', med: 252, sh: 20, th: 170 },
];

// 사분면 정의 (색 언어: 가격 빨/파와 분리 — 수급 전용 팔레트)
const _FM_Q = {
  ff: { key: 'ff', label: '찬집 · 계속 담는 중',  short: '찬집·담는중', color: '#2dce89', bg: 'rgba(45,206,137,.14)', prio: 3, tip: '중기 순유입 + 최근도 매수 지속 — 강한 축적' },
  fe: { key: 'fe', label: '찬집 · 비우기 시작',    short: '찬집·비우기', color: '#fb6340', bg: 'rgba(251,99,64,.13)',  prio: 2, tip: '중기 순유입했지만 최근 순매도 전환 — 차익실현 경계' },
  ef: { key: 'ef', label: '빈집 · 담기 시작',      short: '빈집·담기',   color: '#f59e0b', bg: 'rgba(245,158,11,.13)', prio: 1, tip: '중기 순유출이나 최근 매수 전환 — 저점 매집 관찰' },
  ee: { key: 'ee', label: '빈집 · 계속 비우는 중', short: '빈집·비우기', color: '#8898aa', bg: 'rgba(136,152,170,.12)', prio: 0, tip: '중기 순유출 + 최근도 매도 지속 — 소외·회피' },
};
const _fmQuad = (x, y) => x >= 0 ? (y >= 0 ? _FM_Q.ff : _FM_Q.fe) : (y >= 0 ? _FM_Q.ef : _FM_Q.ee);

// 수급 유입/유출 색 (녹=담기, 적=비우기)
const _fmFlowColor = v => v > 0 ? '#2dce89' : v < 0 ? '#f5365c' : 'var(--text3)';

// 현재 노출 대상 창(데이터가 받쳐주는 것만)
const _fmVisibleWins = availDays =>
  _FM_WINS.filter(w => availDays >= w.th || w.k === '1M');

// ── 페이지 셸 ────────────────────────────────────────────────────────────────
function pFlowMap() {
  return `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.9rem;flex-wrap:wrap;gap:8px">
    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
      ${INDUSTRIES.map(i => `<button class="chip${i === FM.ind ? ' active' : ''}" data-fm-ind="${i}" onclick="switchFmInd(this,'${i}')">${i}</button>`).join('')}
    </div>
    <span id="fm-date" style="font-size:calc(11px*var(--m-label));color:var(--text2)"></span>
  </div>
  <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:.75rem">
    <div style="display:flex;gap:4px;align-items:center">
      <span style="font-size:calc(11px*var(--m-label));color:var(--text3);margin-right:2px">기간</span>
      <span id="fm-win-chips" style="display:flex;gap:4px"></span>
    </div>
    <div style="display:flex;gap:4px;align-items:center">
      <span style="font-size:calc(11px*var(--m-label));color:var(--text3);margin-right:2px">투자자</span>
      ${[['both','외국인+기관'],['foreign','외국인'],['inst','기관']].map(([k,l]) =>
        `<button class="chip${FM.inv === k ? ' active' : ''}" data-fm-inv="${k}" onclick="switchFmInv('${k}')">${l}</button>`).join('')}
    </div>
  </div>
  <div id="fm-body">${loadingHTML('수급 집계 중...')}</div>`;
}

// ── 컨트롤 핸들러 ────────────────────────────────────────────────────────────
function switchFmInd(el, ind) {
  if (FM.ind === ind) return;
  FM.ind = ind;
  document.querySelectorAll('[data-fm-ind]').forEach(b =>
    b.classList.toggle('active', b.dataset.fmInd === ind));
  loadFlowMap();
}
function switchFmInv(k) {
  if (FM.inv === k) return;
  FM.inv = k;
  document.querySelectorAll('[data-fm-inv]').forEach(b =>
    b.classList.toggle('active', b.dataset.fmInv === k));
  _fmRender();   // 재조회 없이 재집계
}
function switchFmWin(k) {
  if (FM.win === k) return;
  FM.win = k;
  document.querySelectorAll('[data-fm-win]').forEach(b =>
    b.classList.toggle('active', b.dataset.fmWin === k));
  _fmRender();
}
function _fmSort(col) {
  if (FM.sortCol === col) FM.sortDir *= -1;
  else { FM.sortCol = col; FM.sortDir = (col === 'name') ? 1 : -1; }
  _fmRender();
}

// ── 로드 — 선택 산업의 모니터링 종목 수급 원자료 ─────────────────────────────
async function loadFlowMap() {
  const el = document.getElementById('fm-body');
  if (!el) return;

  // 캐시 히트 → 재조회 없이 재집계
  if (FM.raw[FM.ind]) { _fmRender(); return; }

  el.innerHTML = loadingHTML('수급 집계 중...');
  try {
    FM.latest = FM.latest || await getLatestMarketDate();

    const indMap = await getIndustryMap();                 // {code: industry} (모니터링 종목)
    const codes  = Object.keys(indMap).filter(c => indMap[c] === FM.ind);
    if (!codes.length) { el.innerHTML = _fmEmpty(`${FM.ind} 모니터링 종목이 없습니다`); return; }

    // 순매수 존재 구간만 (2026-05-26~). 400일 컷오프로 페이로드 상한.
    const cutoff = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
    const rows = [];
    const CH = 300;
    for (let i = 0; i < codes.length; i += CH) {
      const chunk = codes.slice(i, i + CH);
      const part = await fetchAllPages((s, e) => sb.from('market_data')
        .select('stock_code,corp_name,base_date,price,market_cap,foreign_net_buy,institution_net_buy')
        .in('stock_code', chunk)
        .gte('base_date', cutoff)
        .not('foreign_net_buy', 'is', null)
        // 정렬은 (base_date, stock_code) 총순서 — PK 기준이라 페이지네이션이 결정적.
        // base_date 단독 정렬 시 동일일자 타이가 range 페이지 경계에서 뒤섞여 행 누락/중복 발생
        // (반도체 등 >1000행 산업에서 실측 29행 유실). PK 타이브레이커로 방지.
        .order('base_date', { ascending: true })
        .order('stock_code', { ascending: true })
        .range(s, e));
      rows.push(...part);
    }
    if (!rows.length) { el.innerHTML = _fmEmpty(`${FM.ind} 수급 데이터가 아직 없습니다`); return; }

    // 종목별 날짜맵 + 거래일 집합
    const byCode = {};
    const dateSet = new Set();
    for (const r of rows) {
      dateSet.add(r.base_date);
      let s = byCode[r.stock_code];
      if (!s) s = byCode[r.stock_code] = { code: r.stock_code, name: r.corp_name || r.stock_code, days: {}, cap: null };
      s.days[r.base_date] = {
        f: r.foreign_net_buy, i: r.institution_net_buy, p: r.price, cap: r.market_cap,
      };
      if (r.market_cap != null) s.cap = r.market_cap;   // 마지막(최신) 유효 시총
    }
    const dates = [...dateSet].sort();                  // asc

    FM.raw[FM.ind] = { dates, byCode };
    _fmRender();
  } catch (e) {
    console.error('[FlowMap]', e);
    if (el) el.innerHTML = _fmEmpty('집계 실패: ' + (e.message || e));
  }
}

const _fmEmpty = msg =>
  `<div style="padding:2rem 1rem;text-align:center;color:var(--text2);font-size:calc(13px*var(--m-body))">${escAttr(msg)}</div>`;

// ── 집계 → 렌더 ──────────────────────────────────────────────────────────────
function _fmRender() {
  const el = document.getElementById('fm-body');
  if (!el) return;
  const raw = FM.raw[FM.ind];
  if (!raw) { loadFlowMap(); return; }

  const availDays = raw.dates.length;

  // 창 칩 재구성 (데이터가 받쳐주는 것만)
  const wins = _fmVisibleWins(availDays);
  if (!wins.some(w => w.k === FM.win)) FM.win = wins.length ? wins[wins.length - 1].k : '1M';
  const winChips = document.getElementById('fm-win-chips');
  if (winChips) winChips.innerHTML = wins.map(w =>
    `<button class="chip${w.k === FM.win ? ' active' : ''}" data-fm-win="${w.k}" onclick="switchFmWin('${w.k}')">${w.k}</button>`).join('');

  const winDef = _FM_WINS.find(w => w.k === FM.win) || _FM_WINS[1];
  const medN = Math.min(winDef.med, availDays);
  const shN  = Math.min(winDef.sh,  availDays);
  const medDates = raw.dates.slice(-medN);
  const shDates  = raw.dates.slice(-shN);
  const startDate = medDates[0];

  // 투자자별 순매수 주식수 선택
  const netOf = d => {
    if (!d) return null;
    const f = d.f, i = d.i;
    if (FM.inv === 'foreign') return f == null ? null : f;
    if (FM.inv === 'inst')    return i == null ? null : i;
    if (f == null && i == null) return null;
    return (f || 0) + (i || 0);
  };

  const pts = [];
  for (const s of Object.values(raw.byCode)) {
    const cap = s.cap;
    if (!cap || cap <= 0) continue;

    let medWon = 0, shWon = 0, medHit = 0;
    for (const dt of medDates) {
      const d = s.days[dt];
      const n = netOf(d);
      if (n == null || d.p == null) continue;
      medWon += n * d.p; medHit++;
    }
    for (const dt of shDates) {
      const d = s.days[dt];
      const n = netOf(d);
      if (n == null || d.p == null) continue;
      shWon += n * d.p;
    }
    if (medHit === 0) continue;   // 이 창에 데이터 없음

    const x = medWon / cap * 100;   // 중기 ÷ 시총 (%)
    const y = shWon  / cap * 100;   // 단기 ÷ 시총 (%)
    const q = _fmQuad(x, y);
    pts.push({
      code: s.code, name: s.name, cap,
      medWon, shWon, x, y, q,
      short: medHit < medN * 0.9,   // 창보다 데이터가 뚜렷이 짧음(늦게 편입/상장) — 하루치 결측은 무시
      hit: medHit,
    });
  }

  // 기준일 배지
  setAsOf('fm-date', FM.latest);
  const dEl = document.getElementById('fm-date');
  if (dEl) dEl.innerHTML =
    `<span style="color:var(--text3)">${startDate} ~ ${FM.latest}</span> · ${availDays}거래일 · <span style="color:var(--text2)">${FM.latest} 기준</span>`;

  if (!pts.length) { el.innerHTML = _fmEmpty(`${FM.ind} — 선택 조건에 표시할 종목이 없습니다`); return; }

  el.innerHTML =
    _fmSummary(pts) +
    `<div style="display:flex;flex-wrap:wrap;gap:0;align-items:stretch">
       <div style="flex:2 1 380px;min-width:320px;padding:4px 8px 8px;box-sizing:border-box">
         ${_fmScatter(pts, winDef, shN)}
       </div>
       <div style="flex:3 1 460px;min-width:330px;border-left:1px solid var(--border);box-sizing:border-box">
         ${_fmTable(pts, winDef, shN)}
       </div>
     </div>` +
    _fmFootnotes(winDef, medN, shN);
}

// ── ① 요약 타일 (사분면 분포 + 최다 담김/비움) ───────────────────────────────
function _fmSummary(pts) {
  const cnt = { ff: 0, fe: 0, ef: 0, ee: 0 };
  pts.forEach(p => cnt[p.q.key]++);

  const tile = (q, n) => `
    <div style="flex:1 1 120px;min-width:112px;padding:8px 10px;border-radius:8px;background:${q.bg};border:1px solid ${q.color}33" title="${q.tip}">
      <div style="font-size:calc(11px*var(--m-label));color:${q.color};font-weight:700;margin-bottom:1px">${q.short}</div>
      <div style="font-size:calc(18px*var(--m-title));font-weight:800;color:var(--text1);line-height:1.1">${n}<span style="font-size:calc(11px*var(--m-label));color:var(--text3);font-weight:500">종목</span></div>
    </div>`;

  const topIn  = pts.slice().sort((a, b) => b.x - a.x)[0];
  const topOut = pts.slice().sort((a, b) => a.x - b.x)[0];
  const hi = [];
  if (topIn && topIn.x > 0)
    hi.push(`<span style="color:var(--text2)">가장 많이 담긴</span> <b style="color:var(--text1)">${escAttr(topIn.name)}</b> <span style="color:#2dce89;font-weight:700">${fmtPct(topIn.x)}</span>`);
  if (topOut && topOut.x < 0)
    hi.push(`<span style="color:var(--text2)">가장 많이 비워진</span> <b style="color:var(--text1)">${escAttr(topOut.name)}</b> <span style="color:#f5365c;font-weight:700">${fmtPct(topOut.x)}</span>`);

  return `
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:.5rem">
    ${tile(_FM_Q.ff, cnt.ff)}${tile(_FM_Q.fe, cnt.fe)}${tile(_FM_Q.ef, cnt.ef)}${tile(_FM_Q.ee, cnt.ee)}
  </div>
  ${hi.length ? `<div style="font-size:calc(12px*var(--m-sub));color:var(--text2);margin-bottom:.5rem;display:flex;flex-wrap:wrap;gap:14px">${hi.join('<span style="color:var(--border)">·</span>')}</div>` : ''}`;
}

// ── ② 사분면 산점도 (SVG) — 차트라 폰트 bare px ─────────────────────────────
function _fmAxisMax(vals) {
  const a = vals.map(v => Math.abs(v)).filter(v => v > 1e-9).sort((x, y) => x - y);
  if (!a.length) return 1;
  const q90 = a[Math.min(a.length - 1, Math.floor(a.length * 0.9))];
  const mx  = a[a.length - 1];
  return Math.max(q90 * 1.15, mx * 0.5, 0.3);   // 이상치 1개가 구름을 뭉개지 않게 p90 기준
}

function _fmScatter(pts, winDef, shN) {
  const W = 470, H = 360, ML = 30, MR = 30, MT = 30, MB = 34;
  const pw = W - ML - MR, ph = H - MT - MB;
  const x0 = ML, x1 = W - MR, y0 = MT, y1 = H - MB;
  const cx = x0 + pw / 2, cy = y0 + ph / 2;

  const xMax = _fmAxisMax(pts.map(p => p.x));
  const yMax = _fmAxisMax(pts.map(p => p.y));
  const clamp = (v, m) => Math.max(-m, Math.min(m, v));
  const mapX = v => cx + clamp(v, xMax) / xMax * (pw / 2);
  const mapY = v => cy - clamp(v, yMax) / yMax * (ph / 2);

  const capMax = Math.max(...pts.map(p => p.cap || 0), 1);
  const rOf = c => 3 + Math.sqrt((c || 0) / capMax) * 9;

  // 사분면 배경 틴트
  const q = (x, y, w, h, c) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`;
  const bg =
    q(cx, y0, x1 - cx, cy - y0, 'rgba(45,206,137,.05)') +   // 우상 찬집·담는중
    q(cx, cy, x1 - cx, y1 - cy, 'rgba(251,99,64,.05)')  +   // 우하 찬집·비우기
    q(x0, y0, cx - x0, cy - y0, 'rgba(245,158,11,.05)') +   // 좌상 빈집·담기
    q(x0, cy, cx - x0, y1 - cy, 'rgba(136,152,170,.05)');   // 좌하 빈집·비우기

  // 중심 십자선
  const cross =
    `<line x1="${cx}" y1="${y0}" x2="${cx}" y2="${y1}" stroke="rgba(255,255,255,.16)" stroke-width="1" stroke-dasharray="3 3"/>` +
    `<line x1="${x0}" y1="${cy}" x2="${x1}" y2="${cy}" stroke="rgba(255,255,255,.16)" stroke-width="1" stroke-dasharray="3 3"/>`;

  // 코너 라벨
  const corner = (x, y, anchor, txt, c) =>
    `<text x="${x}" y="${y}" font-size="10" font-weight="700" fill="${c}" text-anchor="${anchor}" opacity=".8">${txt}</text>`;
  const corners =
    corner(x1 - 3, y0 + 11, 'end',   '찬집·담는중 ▲', '#2dce89') +
    corner(x1 - 3, y1 - 4,  'end',   '찬집·비우기 ▼', '#fb6340') +
    corner(x0 + 3, y0 + 11, 'start', '▲ 빈집·담기',   '#f59e0b') +
    corner(x0 + 3, y1 - 4,  'start', '▼ 빈집·비우기', '#8898aa');

  // 축 라벨
  const axes =
    `<text x="${cx}" y="${y1 + 24}" font-size="9.5" fill="#8b91a7" text-anchor="middle">← 빈집 (중기 순유출)   ·   중기 누적 ÷ 시총   ·   (중기 순유입) 찬집 →</text>` +
    `<text x="${x0 - 4}" y="${cy}" font-size="9.5" fill="#8b91a7" text-anchor="middle" transform="rotate(-90 ${x0 - 4} ${cy})">← 비우기   최근 ${shN}일   담기 →</text>`;

  // 라벨 슬롯팅 — 원점에서 먼 순으로 최대 18개, 세로 겹침 회피
  pts.forEach(p => { p._px = mapX(p.x); p._py = mapY(p.y); p._d2 = p.x * p.x + p.y * p.y; });
  const cand = pts.slice().sort((a, b) => b._d2 - a._d2);
  const occ = { L: [], R: [] };
  const SLOT = 12, maxLbl = Math.min(18, cand.length);
  let placed = 0;
  for (const p of cand) {
    if (placed >= maxLbl) break;
    const side = p._px < cx ? 'L' : 'R';
    let ly = null;
    for (let step = 0; step <= 9 && ly === null; step++) {
      for (const dir of (step === 0 ? [0] : [-1, 1])) {
        const t = p._py + dir * step * SLOT;
        if (t < y0 + 7 || t > y1 - 3) continue;
        if (occ[side].every(u => Math.abs(u - t) >= SLOT - 1)) { ly = t; break; }
      }
    }
    if (ly === null) continue;
    occ[side].push(ly); p._ly = ly; p._side = side; placed++;
  }

  const bubbles = pts.map(p => {
    const r = rOf(p.cap);
    const outX = Math.abs(p.x) > xMax, outY = Math.abs(p.y) > yMax;   // 축 밖 이상치
    const tip = `${p.name} · 중기 ${fmtPct(p.x)} (${fmtWon(p.medWon, true)}) · 최근 ${fmtPct(p.y)} · ${p.q.short}`;
    let lbl = '';
    if (p._ly != null) {
      const anchor = p._side === 'L' ? 'end' : 'start';
      const lx = p._side === 'L' ? p._px - r - 3 : p._px + r + 3;
      const leader = Math.abs(p._ly - p._py) > 6
        ? `<line x1="${lx}" y1="${(p._ly - 3).toFixed(1)}" x2="${p._px.toFixed(1)}" y2="${p._py.toFixed(1)}" stroke="${p.q.color}" stroke-width="0.6" opacity=".28"/>` : '';
      lbl = leader +
        `<text x="${lx.toFixed(1)}" y="${p._ly.toFixed(1)}" font-size="10" font-weight="600" text-anchor="${anchor}" fill="#eef0f6" style="paint-order:stroke;stroke:#12141c;stroke-width:3px">${escAttr(p.name)}${p.short ? '<tspan fill="#f5a623" font-size="8"> ' + p.hit + 'd</tspan>' : ''}</text>`;
    }
    const edge = (outX || outY)
      ? `<circle cx="${p._px.toFixed(1)}" cy="${p._py.toFixed(1)}" r="${(r + 2).toFixed(1)}" fill="none" stroke="${p.q.color}" stroke-width="1" stroke-dasharray="2 2" opacity=".7"/>` : '';
    return `<g data-stock-open="${p.code}" data-stock-name="${escAttr(p.name)}" data-stock-tab="market" style="cursor:pointer"><title>${tip}</title>
      ${edge}<circle cx="${p._px.toFixed(1)}" cy="${p._py.toFixed(1)}" r="${r.toFixed(1)}" fill="${p.q.color}" fill-opacity=".82" stroke="${p.q.color}" stroke-width="1.1"/>
      ${lbl}</g>`;
  }).join('');

  return `<div style="font-size:calc(11px*var(--m-label));font-weight:600;color:var(--text1);padding:2px 2px 4px">
      수급 지도 <span style="font-weight:400;color:var(--text2)">가로=중기 누적÷시총 · 세로=최근 ${shN}일 · 버블=시총 · 클릭→종목 상세</span>
    </div>
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;max-width:560px;display:block;margin:0 auto" xmlns="http://www.w3.org/2000/svg">
      ${bg}${cross}${corners}${axes}${bubbles}
    </svg>`;
}

// ── ③ 정렬 가능 표 ───────────────────────────────────────────────────────────
function _fmTable(pts, winDef, shN) {
  const keyOf = p => {
    switch (FM.sortCol) {
      case 'name':   return p.name;
      case 'cap':    return p.cap;
      case 'med':    return p.x;
      case 'medw':   return p.medWon;
      case 'sh':     return p.y;
      case 'shw':    return p.shWon;
      case 'quad':   return p.q.prio;
      default:       return p.x;
    }
  };
  const sorted = pts.slice().sort((a, b) => {
    const ka = keyOf(a), kb = keyOf(b);
    if (typeof ka === 'string') return FM.sortDir === 1 ? ka.localeCompare(kb) : kb.localeCompare(ka);
    return FM.sortDir === -1 ? (kb - ka) : (ka - kb);
  });

  const arrow = c => FM.sortCol === c ? (FM.sortDir === -1 ? ' ▼' : ' ▲') : '';
  const th = (c, label, align) =>
    `<span onclick="_fmSort('${c}')" style="cursor:pointer;user-select:none;font-size:10.5px;text-align:${align};color:${FM.sortCol === c ? 'var(--tg)' : 'var(--text2)'}">${label}${arrow(c)}</span>`;

  const COLS = 'minmax(96px,1.3fr) minmax(64px,0.8fr) minmax(96px,1.15fr) minmax(96px,1.15fr) minmax(88px,1.05fr)';
  const medLbl = FM.win;

  const header =
    `<div style="display:grid;grid-template-columns:${COLS};gap:8px;align-items:center;padding:8px 12px;border-bottom:1px solid var(--border);background:var(--bg2)">
      ${th('name', '종목', 'left')}
      ${th('cap',  '시총', 'right')}
      ${th('med',  `${medLbl} ÷시총`, 'right')}
      ${th('sh',   `${shN}일 ÷시총`, 'right')}
      ${th('quad', '구분', 'center')}
    </div>`;

  const body = sorted.map((p, idx) => {
    const xc = _fmFlowColor(p.x), yc = _fmFlowColor(p.y);
    return `<div class="stock-row" data-stock-open="${p.code}" data-stock-name="${escAttr(p.name)}" data-stock-tab="market"
        style="display:grid;grid-template-columns:${COLS};gap:8px;align-items:center;padding:8px 12px;border-bottom:1px solid var(--border);background:${idx % 2 ? 'rgba(255,255,255,.02)' : 'transparent'}">
        <div style="min-width:0;display:flex;align-items:center;gap:5px">
          <span style="font-size:calc(12px*var(--m-sub));font-weight:600;color:var(--text1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escAttr(p.name)}</span>
          ${typeof wlBadge === 'function' ? wlBadge(p.code) : ''}
          ${p.short ? `<span title="편입/데이터 ${p.hit}거래일 — 창보다 짧음" style="font-size:calc(10px*var(--m-label));color:#f5a623;flex-shrink:0">${p.hit}d</span>` : ''}
        </div>
        <div style="text-align:right;font-size:calc(11px*var(--m-label));color:var(--text2)">${fmtCap(p.cap)}</div>
        <div style="text-align:right">
          <div style="font-size:calc(13px*var(--m-body));font-weight:700;color:${xc}">${fmtPct(p.x)}</div>
          <div style="font-size:calc(10px*var(--m-label));color:var(--text3)">${fmtWon(p.medWon, true)}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:calc(13px*var(--m-body));font-weight:700;color:${yc}">${fmtPct(p.y)}</div>
          <div style="font-size:calc(10px*var(--m-label));color:var(--text3)">${fmtWon(p.shWon, true)}</div>
        </div>
        <div style="text-align:center">
          <span title="${p.q.tip}" style="font-size:calc(10.5px*var(--m-label));font-weight:700;color:${p.q.color};background:${p.q.bg};border-radius:4px;padding:2px 6px;white-space:nowrap">${p.q.short}</span>
        </div>
      </div>`;
  }).join('');

  return header + body;
}

// ── ④ 각주 (한계 명시) ───────────────────────────────────────────────────────
function _fmFootnotes(winDef, medN, shN) {
  const notes = [
    `순매매 <b>수량 × 종가</b> 환산이라 확정 대금과 소수 % 오차가 있습니다. 시총 대비 비율(순위)로만 씁니다.`,
    `분모는 <b>현재 시총</b> — 기간 중 크게 오른 종목은 비율이 과소평가됩니다.`,
    `가로=최근 <b>${medN}거래일</b> 누적, 세로=최근 <b>${shN}거래일</b>. 세로는 가로의 최근 구간이라, 찬집이어도 최근 매도면 '비우기 시작'입니다.`,
    `원점 근처 종목은 이름표가 겹쳐 생략됩니다 — 점에 올리면 뜨고, 표에는 전부 있습니다. 이름 옆 <b>nd</b> 는 데이터가 창보다 짧다는 표시.`,
    `순매수는 <b>모니터링 종목 + 2026-05-26 이후</b>만 수집됩니다. 이력이 쌓이면 6M·12M 창이 자동 열립니다.`,
  ];
  return `<div style="padding:10px 12px;border-top:1px solid var(--border);font-size:calc(10.5px*var(--m-label));color:var(--text3);line-height:1.7">
    ${notes.map(n => `<div>※ ${n}</div>`).join('')}
  </div>`;
}
