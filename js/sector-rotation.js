/**
 * sector-rotation.js — 산업별 수급동향 (Sector Rotation & Flow Board)
 *
 * 월스트리트 PM 관점의 섹터 로테이션 진단:
 *   ① 로테이션 맵 (사분면): X=스마트머니 수급(외국인+기관 누적), Y=등락률(누적)
 *      → 주도(추세추종) / 매집(역발상 매수) / 분산(차익실현 경계) / 소외(회피)
 *   ② 산업 보드(표): 오늘 등락·시장대비 RS·상승종목(breadth)·거래대금(비중)·수급·국면
 *
 * 데이터 (추가 쿼리 최소화):
 *   - 오늘 등락/거래대금/breadth: INV.indMapData (market-overview.js, market_data 최신일 = 신선)
 *   - 누적 수급/누적 등락률/US선행/신호: sector_daily_summary (백엔드 집계 — 자체 1회 조회)
 *
 * 주의: market_data의 1일 외국인/기관 순매수는 사실상 비어있어(전체 종목 중 극소수만 채움)
 *       수급은 sector_daily_summary의 5일/20일 누적값을 신뢰 소스로 사용한다. 날짜는 분리 표기.
 *
 * 의존: sb, INDUSTRIES, IND_COLORS, fmtNet, fmtCap, chgColor, chgStr, fmtPct (config.js)
 */

let _srPeriod  = 5;          // 수급/누적 등락률 렌즈: 5 | 20 (일)
let _srSortCol = 'tv';       // 표 정렬 컬럼
let _srSortDir = -1;         // -1 내림차순, 1 오름차순
let _srRows    = null;       // 조인된 산업별 행 캐시
let _srSdsDate = null;       // sector_daily_summary 집계 기준일

// ── 국면(Phase) 분류 — '시장 대비' 상대 등락 × 수급 4사분면 ───────────────────
// 색 언어: 가격(빨강/파랑)과 충돌 피하려 국면 전용 팔레트 사용.
const _SR_PHASE = {
  lead:    { label: '주도', color: '#2dce89', bg: 'rgba(45,206,137,.13)', prio: 0, tip: '시장 대비 강세 + 자금유입 — 추세 주도, 추종 매수 구간' },
  accum:   { label: '매집', color: '#f59e0b', bg: 'rgba(245,158,11,.13)', prio: 1, tip: '시장 대비 약세 + 자금유입 — 스마트머니 저점 매집, 역발상 관찰' },
  dist:    { label: '분산', color: '#fb6340', bg: 'rgba(251,99,64,.13)', prio: 2, tip: '시장 대비 강세 + 자금유출 — 차익실현·분산 신호, 추격 경계' },
  lag:     { label: '소외', color: '#8898aa', bg: 'rgba(136,152,170,.12)', prio: 3, tip: '시장 대비 약세 + 자금유출 — 소외·약세, 방어적 회피' },
  neutral: { label: '중립', color: 'var(--text2)', bg: 'transparent',      prio: 4, tip: '뚜렷한 방향성 없음' },
  na:      { label: '—',    color: 'var(--text3)', bg: 'transparent',      prio: 5, tip: '수급 데이터 집계 대기' },
};

// 국면 분류 — '시장 대비' 상대 등락(rel) × 수급(flow) 4사분면.
//  rel = 산업 등락 − 산업평균(시장 프록시). 절대 등락을 쓰면 하락장에 전 산업이 음수→
//  하단 2사분면(매집/소외)에만 몰린다. 상대값은 시장보다 강/약으로 갈라 4사분면을 살린다.
function _srPhaseOf(rel, flow) {
  if (rel == null || flow == null) return _SR_PHASE.na;
  const rPos = rel > 0.05, rNeg = rel < -0.05;   // 시장대비 ±0.05%p 데드존
  const fPos = flow > 0,   fNeg = flow < 0;
  if (rPos && fPos) return _SR_PHASE.lead;
  if (rNeg && fPos) return _SR_PHASE.accum;
  if (rPos && fNeg) return _SR_PHASE.dist;
  if (rNeg && fNeg) return _SR_PHASE.lag;
  return _SR_PHASE.neutral;
}

// 시장 프록시 = 해당 기간 산업 등락률의 단순평균(등가중). 상대 등락·국면의 기준선.
function _srMktMean(rows, pk) {
  const v = rows.map(r => r[pk].ret).filter(x => x != null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0;
}

// US 선행 신호 (백엔드 collect_sector_summary.detect_signal 탐지) — US·KR·선행 컬럼에 표시
const _SR_SIG = {
  us_lead_bull: { icon: '⚡', color: '#2dce89', label: 'KR 추격 기대', tip: 'US 선행 상승 — KR 추격 기대' },
  us_lead_bear: { icon: '⚠️', color: '#f5365c', label: 'KR 하락 경고', tip: 'US 선행 하락 — KR 낙폭 확대 경고' },
  kr_outrun:    { icon: '🚀', color: '#ffd600', label: 'KR 독주',     tip: 'KR 독주 — 과열 주의' },
  co_bull:      { icon: '🟢', color: '#2dce89', label: '동조 강세',   tip: 'US·KR 동반 강세' },
  co_bear:      { icon: '🔴', color: '#f5365c', label: '동조 약세',   tip: 'US·KR 동반 약세' },
};

// 거래대금 포맷 (조/천억/억)
function _srTV(tv) {
  if (!tv) return '—';
  if (tv >= 1e12) return (tv / 1e12).toFixed(1) + '조';
  if (tv >= 1e11) return (tv / 1e11).toFixed(1) + '천억';
  if (tv >= 1e8)  return Math.round(tv / 1e8).toLocaleString() + '억';
  return Math.round(tv / 1e8) + '억';
}

// ── 로드 — sector_daily_summary 자체 조회 후 INV.indMapData(신선)와 조인 ──
async function loadSectorRotation() {
  const el = document.getElementById('sector-rot-body');
  if (!el) return;

  try {
    // 최신 집계일
    const { data: latest } = await sb.from('sector_daily_summary')
      .select('base_date').order('base_date', { ascending: false }).limit(1).maybeSingle();
    _srSdsDate = latest?.base_date || null;

    let sdsByInd = {};
    if (_srSdsDate) {
      const { data: rows } = await sb.from('sector_daily_summary')
        .select('industry,avg_chg_1d,avg_chg_5d,avg_chg_20d,foreign_net_1d,inst_net_1d,foreign_net_5d,inst_net_5d,foreign_net_20d,inst_net_20d,us_chg_1d,us_chg_5d,us_chg_20d,signal_1d,signal_5d,signal_20d,stock_count')
        .eq('base_date', _srSdsDate);
      (rows || []).forEach(r => { sdsByInd[r.industry] = r; });
    }

    _srRows = _buildSrRows(sdsByInd);
    renderSectorRotation();
  } catch (e) {
    console.error('[SectorRotation]', e);
    if (el) el.innerHTML = `<div style="padding:1rem;color:var(--text2);font-size:12px">집계 실패: ${e.message}</div>`;
  }
}

// 신선(오늘) 보드 + 누적 수급(SDS) 조인 → 산업별 행
function _buildSrRows(sdsByInd) {
  const indMap    = INV.indMapData || {};
  const marketAvg = (INV.marketBreadth && typeof INV.marketBreadth.avg === 'number')
    ? INV.marketBreadth.avg : 0;

  const flowOf = (f, i) => (f == null && i == null) ? null : (f || 0) + (i || 0);

  return INDUSTRIES.map(ind => {
    const d   = indMap[ind] || null;                       // 오늘(신선)
    const sds = sdsByInd[ind] || null;                     // 누적(백엔드)

    // ── 오늘 집계 (market_data 최신일) ──
    let ret = null, tv = 0, rise = 0, fall = 0, flat = 0, total = 0;
    if (d) {
      total = d.total || 0; rise = d.rise || 0; fall = d.fall || 0; flat = d.flat || 0;
      ret = total ? d.sumChg / total : null;
      tv  = (d.stocks || []).reduce((s, r) =>
        s + (r.trading_value || ((r.volume || 0) * (r.price || 0))), 0);
    }
    const rs = (ret != null) ? ret - marketAvg : null;     // 시장대비 상대강도(α)

    return {
      ind,
      color: (IND_COLORS || {})[ind] || '#8898aa',
      today: { ret, rs, tv, rise, fall, flat, total },
      d1: {
        ret:  sds?.avg_chg_1d ?? null,
        flow: flowOf(sds?.foreign_net_1d, sds?.inst_net_1d),
        fnet: sds?.foreign_net_1d ?? null,
        inet: sds?.inst_net_1d ?? null,
        us:   sds?.us_chg_1d ?? null,
        sig:  sds?.signal_1d ?? null,
      },
      d5: {
        ret:  sds?.avg_chg_5d ?? null,
        flow: flowOf(sds?.foreign_net_5d, sds?.inst_net_5d),
        fnet: sds?.foreign_net_5d ?? null,
        inet: sds?.inst_net_5d ?? null,
        us:   sds?.us_chg_5d ?? null,
        sig:  sds?.signal_5d ?? null,
      },
      d20: {
        ret:  sds?.avg_chg_20d ?? null,
        flow: flowOf(sds?.foreign_net_20d, sds?.inst_net_20d),
        fnet: sds?.foreign_net_20d ?? null,
        inet: sds?.inst_net_20d ?? null,
        us:   sds?.us_chg_20d ?? null,
        sig:  sds?.signal_20d ?? null,
      },
      n: sds?.stock_count ?? (d?.total ?? 0),
    };
  });
}

// ── 기간 전환 (5/20일) ──────────────────────────────────────────────────────
function switchSrPeriod(p) {
  _srPeriod = p;
  document.querySelectorAll('[data-sr-period]').forEach(b =>
    b.classList.toggle('active', Number(b.dataset.srPeriod) === p));
  renderSectorRotation();
}

// ── 표 정렬 ──────────────────────────────────────────────────────────────────
function _srSort(col) {
  if (_srSortCol === col) _srSortDir *= -1;
  else { _srSortCol = col; _srSortDir = (col === 'ind') ? 1 : -1; }
  renderSectorRotation();
}

// ── 메인 렌더 ────────────────────────────────────────────────────────────────
function renderSectorRotation() {
  const el = document.getElementById('sector-rot-body');
  if (!el || !_srRows) return;

  // 기준일 라벨 (오늘 종목데이터 / 누적 수급 분리 표기)
  const dateEl = document.getElementById('sr-date');
  if (dateEl) {
    let stale = '';
    if (_srSdsDate) {
      const todayKst = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
      const diff = Math.round((new Date(todayKst) - new Date(_srSdsDate)) / 86400000);
      if (diff >= 6) stale = ` <span style="color:var(--yellow)">⚠${diff}일전</span>`;
    }
    dateEl.innerHTML = _srSdsDate
      ? `수급 ${_srSdsDate}${stale} · ${_srPeriod}일 누적`
      : '수급 집계 대기';
  }

  const pk  = _srPeriod === 20 ? 'd20' : _srPeriod === 1 ? 'd1' : 'd5';
  const mkt = _srMktMean(_srRows, pk);   // 시장 프록시 — 상대 등락/국면의 기준선

  el.innerHTML =
    _srSummary(_srRows, pk, mkt) +
    `<div style="display:flex;flex-wrap:wrap;gap:0;align-items:stretch">
       <div style="flex:2 1 340px;min-width:320px;padding:6px 10px 10px;box-sizing:border-box">
         ${_srQuadrant(_srRows, pk, mkt)}
       </div>
       <div style="flex:3 1 480px;min-width:340px;border-left:1px solid var(--border);box-sizing:border-box">
         ${_srTable(_srRows, pk, mkt)}
       </div>
     </div>`;
}

// ── ① 요약 인사이트 1줄 ──────────────────────────────────────────────────────
function _srSummary(rows, pk, mkt) {
  const withFlow = rows.filter(r => r[pk].flow != null);
  const withTV   = rows.filter(r => r.today.tv > 0);

  const sep = '<span style="color:var(--border);margin:0 7px">·</span>';
  const parts = [];

  if (withFlow.length) {
    const inMax  = withFlow.slice().sort((a, b) => b[pk].flow - a[pk].flow)[0];
    const outMax = withFlow.slice().sort((a, b) => a[pk].flow - b[pk].flow)[0];
    parts.push(`<span style="color:var(--text2)">자금유입</span> <b style="color:${inMax.color}">${inMax.ind}</b> <span style="color:#2dce89;font-weight:600">${fmtNet(inMax[pk].flow)}</span>`);
    if (outMax[pk].flow < 0)
      parts.push(`<span style="color:var(--text2)">유출</span> <b style="color:${outMax.color}">${outMax.ind}</b> <span style="color:#f5365c;font-weight:600">${fmtNet(outMax[pk].flow)}</span>`);
  }
  if (withTV.length) {
    const tvMax    = withTV.slice().sort((a, b) => b.today.tv - a.today.tv)[0];
    const totalTV  = withTV.reduce((s, r) => s + r.today.tv, 0);
    const pct      = totalTV ? Math.round(tvMax.today.tv / totalTV * 100) : 0;
    parts.push(`<span style="color:var(--text2)">거래대금 집중</span> <b style="color:${tvMax.color}">${tvMax.ind}</b> <span style="color:var(--text1)">${_srTV(tvMax.today.tv)} (${pct}%)</span>`);
  }

  // 국면 분포
  const phaseCount = { lead: 0, accum: 0, dist: 0, lag: 0 };
  const _labelKey = { '주도': 'lead', '매집': 'accum', '분산': 'dist', '소외': 'lag' };
  rows.forEach(r => {
    const rel = r[pk].ret != null ? r[pk].ret - mkt : null;
    const k = _labelKey[_srPhaseOf(rel, r[pk].flow).label];
    if (k) phaseCount[k]++;
  });
  const phStr = ['lead', 'accum', 'dist', 'lag']
    .filter(k => phaseCount[k])
    .map(k => `<span style="color:${_SR_PHASE[k].color}">${_SR_PHASE[k].label} ${phaseCount[k]}</span>`)
    .join(' ');
  if (phStr) parts.push(`<span style="color:var(--text2)">국면</span> ${phStr}`);

  return `<div style="padding:8px 12px;border-bottom:1px solid var(--border);font-size:11.5px;line-height:1.7;display:flex;flex-wrap:wrap;align-items:center">${parts.join(sep)}</div>`;
}

// ── ② 로테이션 맵 (사분면 SVG) ───────────────────────────────────────────────
function _srQuadrant(rows, pk, mkt) {
  const pts = rows.filter(r => r[pk].ret != null && r[pk].flow != null);
  if (pts.length < 2)
    return `<div style="padding:2.5rem 1rem;text-align:center;color:var(--text2);font-size:12px">
      로테이션 맵 — 수급 추세 데이터 집계 대기<br>
      <span style="font-size:11px;color:var(--text3)">장 마감 후 자동 집계됩니다</span></div>`;

  const W = 420, H = 320, ML = 64, MR = 64, MT = 18, MB = 22;
  const pw = W - ML - MR, ph = H - MT - MB;
  const x0 = ML, x1 = W - MR, y0 = MT, y1 = H - MB;

  // ── 세로축: '시장 대비' 상대 등락 (절대 등락 − 시장평균). 0 기준 재중심화 →
  //    하락장(전 산업 음수)에서도 시장보다 강/약으로 갈려 4사분면이 살아남는다.
  const relOf = p => p[pk].ret - mkt;
  const yMax  = Math.max(...pts.map(p => Math.abs(relOf(p))), 0.3) * 1.18;
  const mapY  = v => y0 + ph - (v + yMax) / (2 * yMax) * ph;   // 위=시장대비 강세

  // ── 가로축: 수급 '부호별 순위' 위치. 절대 순매수(원)는 반도체 등 대형주 산업이
  //    수십 배로 지배해 선형축이면 나머지가 중앙에 압축된다. 유입(>0)은 우측 절반,
  //    유출(<0)은 좌측 절반에 각자 순위로 고르게 배치 → 이상치 면역 + 중앙=수급 0.
  const inflow  = pts.filter(p => p[pk].flow > 0).sort((a, b) => a[pk].flow - b[pk].flow);
  const outflow = pts.filter(p => p[pk].flow < 0).sort((a, b) => a[pk].flow - b[pk].flow);
  const xNorm = {};
  outflow.forEach((p, i) => { xNorm[p.ind] = (i + 1) / (outflow.length + 1) * 0.5; });        // 강한 매도일수록 왼쪽
  inflow.forEach((p, i)  => { xNorm[p.ind] = 0.5 + (i + 1) / (inflow.length + 1) * 0.5; });    // 강한 매수일수록 오른쪽
  pts.forEach(p => { if (xNorm[p.ind] == null) xNorm[p.ind] = 0.5; });                          // 수급 0
  const mapX = p => x0 + xNorm[p.ind] * pw;
  const cx = x0 + 0.5 * pw, cy = mapY(0);

  const tvMax = Math.max(...pts.map(p => p.today.tv || 0), 1);
  const rOf   = tv => 4 + Math.sqrt((tv || 0) / tvMax) * 10;   // 4..14

  // 사분면 배경 틴트
  const q = (x, y, w, h, c) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`;
  const bg =
    q(cx, y0, x1 - cx, cy - y0, 'rgba(45,206,137,.05)') +   // 우상 주도
    q(x0, y0, cx - x0, cy - y0, 'rgba(251,99,64,.05)')  +   // 좌상 분산
    q(cx, cy, x1 - cx, y1 - cy, 'rgba(245,158,11,.05)') +   // 우하 매집
    q(x0, cy, cx - x0, y1 - cy, 'rgba(136,152,170,.05)');   // 좌하 소외

  // 코너 라벨
  const corner = (x, y, anchor, txt, c) =>
    `<text x="${x}" y="${y}" font-size="10" font-weight="700" fill="${c}" text-anchor="${anchor}" opacity=".75">${txt}</text>`;
  const corners =
    corner(x1 - 4, y0 + 12, 'end',   '주도 ▲유입', '#2dce89') +
    corner(x0 + 4, y0 + 12, 'start', '분산 ▲유출', '#fb6340') +
    corner(x1 - 4, y1 - 5,  'end',   '매집 ▼유입', '#f59e0b') +
    corner(x0 + 4, y1 - 5,  'start', '소외 ▼유출', '#8898aa');

  // 중심 십자선
  const cross =
    `<line x1="${cx}" y1="${y0}" x2="${cx}" y2="${y1}" stroke="rgba(255,255,255,.18)" stroke-width="1" stroke-dasharray="3 3"/>` +
    `<line x1="${x0}" y1="${cy}" x2="${x1}" y2="${cy}" stroke="rgba(255,255,255,.18)" stroke-width="1" stroke-dasharray="3 3"/>`;

  // 축 라벨
  const axes =
    `<text x="${x1}" y="${cy - 4}" font-size="9" fill="#8b91a7" text-anchor="end">수급 유입 →</text>` +
    `<text x="${x0}" y="${cy - 4}" font-size="9" fill="#8b91a7" text-anchor="start">← 유출</text>` +
    `<text x="${cx + 4}" y="${y0 + 9}" font-size="9" fill="#8b91a7" text-anchor="start">▲ 시장대비</text>`;

  // 버블 + 좌우 가장자리 라벨 컬럼 (수직 충돌회피 + 리더선) — 클러스터에서도 또렷하게
  const items = pts.map(p => ({
    p, px: mapX(p), py: mapY(relOf(p)), r: rOf(p.today.tv),
    side: mapX(p) < cx ? 'L' : 'R',   // 버블이 중심 왼쪽이면 왼쪽 컬럼, 오른쪽이면 오른쪽 컬럼
  }));
  const GAP = 15, topY = y0 + 6, botY = y1 - 1;
  ['L', 'R'].forEach(side => {
    const g = items.filter(it => it.side === side).sort((a, b) => a.py - b.py);
    let last = -Infinity;
    g.forEach(it => { it.ly = Math.max(it.py, last + GAP); last = it.ly; });
    const over = last - botY;
    if (over > 0) g.forEach(it => { it.ly -= over; });        // 하단 넘치면 그룹 전체 위로
    let lo = topY;
    g.forEach(it => { if (it.ly < lo) it.ly = lo; lo = it.ly + GAP; });   // 상단 클램프
  });
  const bubbles = items.map(it => {
    const { p, px, py, r, side, ly } = it;
    const lblX = side === 'L' ? x0 - 5 : x1 + 5;   // 라벨을 플롯 가장자리에 밀착
    const anchor = side === 'L' ? 'end' : 'start';
    const _rel = relOf(p);
    const tip = `${p.ind} · ${_srPeriod}일 ${fmtPct(p[pk].ret)} (시장대비 ${_rel >= 0 ? '+' : ''}${_rel.toFixed(1)}%p) · 수급 ${fmtNet(p[pk].flow)}`;
    return `<g style="cursor:pointer" onclick="_srFocus('${p.ind}')"><title>${tip}</title>
      <path d="M ${lblX} ${(ly - 3).toFixed(1)} L ${px.toFixed(1)} ${py.toFixed(1)}" fill="none" stroke="${p.color}" stroke-width="0.7" opacity=".28"/>
      <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${r.toFixed(1)}"
        fill="${p.color}" fill-opacity=".85" stroke="${p.color}" stroke-width="1.2"/>
      <text x="${lblX}" y="${ly.toFixed(1)}" font-size="11" font-weight="700" text-anchor="${anchor}"
        fill="#eef0f6" style="paint-order:stroke;stroke:#12141c;stroke-width:3.5px">${p.ind}</text>
    </g>`;
  }).join('');

  return `<div style="font-size:11px;font-weight:600;color:var(--text1);padding:2px 2px 6px">
      로테이션 맵 <span style="font-weight:400;color:var(--text2);font-size:11px">세로=시장대비 · 가로=수급순위 · 버블=거래대금 · 클릭→표 강조</span>
    </div>
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;max-width:560px;display:block;margin:0 auto" xmlns="http://www.w3.org/2000/svg">
      ${bg}${cross}${corners}${axes}${bubbles}
    </svg>`;
}

// ── ③ 산업 보드 (정렬 가능 표) ───────────────────────────────────────────────
function _srTable(rows, pk, mkt) {
  const pLbl = `${_srPeriod}일`;
  const relOf = (r) => r[pk].ret != null ? r[pk].ret - mkt : null;   // 시장 대비 상대 등락

  // 정렬 키 추출
  const keyOf = (r) => {
    switch (_srSortCol) {
      case 'ind':   return r.ind;
      case 'ret':   return r.today.ret ?? -Infinity;
      case 'rs':    return r.today.rs ?? -Infinity;
      case 'breadth': return r.today.total ? r.today.rise / r.today.total : -Infinity;
      case 'tv':    return r.today.tv ?? -Infinity;
      case 'flow':  return r[pk].flow ?? -Infinity;
      case 'phase': return -_srPhaseOf(relOf(r), r[pk].flow).prio;  // 주도가 위로
      default:      return r.today.tv ?? -Infinity;
    }
  };
  // dir=-1 내림차순, dir=1 오름차순
  const sorted = rows.slice().sort((a, b) => {
    const ka = keyOf(a), kb = keyOf(b);
    if (typeof ka === 'string') return _srSortDir === 1 ? ka.localeCompare(kb) : kb.localeCompare(ka);
    return _srSortDir === -1 ? (kb - ka) : (ka - kb);
  });

  const tvTotal = rows.reduce((s, r) => s + (r.today.tv || 0), 0);
  const tvMax   = Math.max(...rows.map(r => r.today.tv || 0), 1);

  const arrow = c => _srSortCol === c ? (_srSortDir === -1 ? ' ▼' : ' ▲') : '';
  const th = (c, label, extra = '') =>
    `<span onclick="_srSort('${c}')" style="cursor:pointer;user-select:none;font-size:10.5px;${extra};color:${_srSortCol === c ? 'var(--tg)' : 'var(--text2)'}">${label}${arrow(c)}</span>`;

  const COLS = 'minmax(88px,1.15fr) minmax(54px,0.7fr) minmax(60px,0.8fr) minmax(96px,1.2fr) minmax(78px,0.95fr) minmax(112px,1.3fr) minmax(46px,0.62fr)';

  const header =
    `<div style="display:grid;grid-template-columns:${COLS};gap:6px;align-items:center;padding:8px 12px;border-bottom:1px solid var(--border);background:var(--bg2)">
      ${th('ind', '산업', 'text-align:left')}
      ${th('ret', `오늘`, 'text-align:right')}
      ${th('breadth', '상승종목', 'text-align:center')}
      ${th('tv', '거래대금', 'text-align:left')}
      ${th('flow', `수급 ${pLbl}`, 'text-align:right')}
      <span style="font-size:10.5px;color:var(--tg);text-align:left">US·KR ${pLbl}·선행</span>
      ${th('phase', '국면', 'text-align:center')}
    </div>`;

  const body = sorted.map((r, i) => {
    const t  = r.today;
    const fp = r[pk];
    const ph = _srPhaseOf(relOf(r), fp.flow);

    // 오늘 등락 + 시장대비 RS
    const retCell = t.ret != null
      ? `<div style="text-align:right">
           <div style="font-size:14px;font-weight:700;color:${chgColor(t.ret)}">${chgStr(t.ret)}</div>
           <div style="font-size:9.5px;color:var(--text2)">α ${t.rs >= 0 ? '+' : ''}${t.rs != null ? t.rs.toFixed(1) : '—'}</div>
         </div>`
      : `<div style="text-align:right;color:var(--text3);font-size:12px">—</div>`;

    // breadth: ▲r ▼f + 비율 바
    const tot = t.total || 0;
    const upPct = tot ? (t.rise / tot * 100) : 0;
    const dnPct = tot ? (t.fall / tot * 100) : 0;
    const breadthCell = tot
      ? `<div>
           <div style="font-size:11px;text-align:center;margin-bottom:2px">
             <span style="color:var(--red);font-weight:600">▲${t.rise}</span>
             <span style="color:var(--text3);margin:0 2px">·</span>
             <span style="color:var(--blue);font-weight:600">▼${t.fall}</span>
           </div>
           <div style="display:flex;height:4px;border-radius:2px;overflow:hidden;background:rgba(255,255,255,.06)">
             <div style="width:${upPct}%;background:var(--red)"></div>
             <div style="width:${100 - upPct - dnPct}%;background:var(--text3);opacity:.4"></div>
             <div style="width:${dnPct}%;background:var(--blue)"></div>
           </div>
         </div>`
      : `<div style="text-align:center;color:var(--text3);font-size:11px">—</div>`;

    // 거래대금 + 비중 바
    const tvPct = tvTotal ? (t.tv / tvTotal * 100) : 0;
    const tvBar = tvMax ? (t.tv / tvMax * 100) : 0;
    const tvCell = t.tv
      ? `<div>
           <div style="display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:2px">
             <span style="color:var(--text1);font-weight:600">${_srTV(t.tv)}</span>
             <span style="color:var(--text2)">${tvPct.toFixed(0)}%</span>
           </div>
           <div style="height:4px;border-radius:2px;background:rgba(255,255,255,.06);overflow:hidden">
             <div style="width:${tvBar}%;height:100%;background:${r.color};opacity:.8"></div>
           </div>
         </div>`
      : `<div style="color:var(--text3);font-size:11px">—</div>`;

    // 수급(외+기) + 외/기 분해 배지
    let flowCell;
    if (fp.flow != null) {
      const fc = fp.flow >= 0 ? '#2dce89' : '#f5365c';
      const splitBadge = (() => {
        const fPos = (fp.fnet ?? 0) > 0, iPos = (fp.inet ?? 0) > 0;
        const fNeg = (fp.fnet ?? 0) < 0, iNeg = (fp.inet ?? 0) < 0;
        if (fPos && iPos) return `<span style="font-size:9.5px;color:#2dce89">외↑기↑</span>`;
        if (fNeg && iNeg) return `<span style="font-size:9.5px;color:#f5365c">외↓기↓</span>`;
        if ((fp.fnet ?? 0) !== 0 || (fp.inet ?? 0) !== 0) return `<span style="font-size:9.5px;color:#f59e0b">엇갈림</span>`;
        return '';
      })();
      flowCell = `<div style="text-align:right">
          <div style="font-size:13px;font-weight:700;color:${fc}">${fmtNet(fp.flow)}</div>
          <div style="line-height:1">${splitBadge}</div>
        </div>`;
    } else {
      flowCell = `<div style="text-align:right;color:var(--text3);font-size:11px">집계중</div>`;
    }

    // US·KR n일 등락 + 선행 신호 (산업 강도 매트릭스 통합 컬럼)
    const sig = fp.sig ? _SR_SIG[fp.sig] : null;
    const uskrCell = (fp.us != null || fp.ret != null)
      ? `<div style="text-align:right;line-height:1.35">
           <div style="font-size:11.5px;font-variant-numeric:tabular-nums">
             <span style="color:var(--text2)">US</span> <span style="color:${fp.us != null ? chgColor(fp.us) : 'var(--text3)'};font-weight:600">${fp.us != null ? fmtPct(fp.us) : '—'}</span>
             <span style="color:var(--text3);margin:0 1px">·</span>
             <span style="color:var(--text2)">KR</span> <span style="color:${fp.ret != null ? chgColor(fp.ret) : 'var(--text3)'};font-weight:600">${fp.ret != null ? fmtPct(fp.ret) : '—'}</span>
           </div>
           ${sig ? `<div title="${sig.tip}" style="font-size:9.5px;color:${sig.color}">${sig.icon} ${sig.label}</div>` : ''}
         </div>`
      : `<div style="text-align:right;color:var(--text3);font-size:11px">—</div>`;

    // 국면 배지
    const phaseCell = `<div style="text-align:center" title="${ph.tip}">
        <span style="font-size:11px;font-weight:700;color:${ph.color};background:${ph.bg};border-radius:4px;padding:1px 6px;white-space:nowrap">${ph.label}</span>
      </div>`;

    return `<div id="sr-row-${r.ind}" style="display:grid;grid-template-columns:${COLS};gap:6px;align-items:center;padding:9px 12px;background:${i % 2 ? 'rgba(255,255,255,.03)' : 'transparent'};transition:background .25s">
        <div style="display:flex;align-items:center;gap:4px;min-width:0">
          <span style="width:6px;height:6px;border-radius:50%;background:${r.color};flex-shrink:0"></span>
          <span style="font-size:12px;font-weight:600;color:var(--text1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.ind}</span>
          <span style="font-size:11px;color:var(--text3);flex-shrink:0">${r.n}</span>
        </div>
        ${retCell}
        ${breadthCell}
        ${tvCell}
        ${flowCell}
        ${uskrCell}
        ${phaseCell}
      </div>`;
  }).join('');

  const legend = `<div style="padding:6px 12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;border-top:1px solid var(--border)">
      ${['lead', 'accum', 'dist', 'lag'].map(k =>
        `<span title="${_SR_PHASE[k].tip}" style="font-size:9.5px;color:${_SR_PHASE[k].color}">● ${_SR_PHASE[k].label}</span>`).join('')}
      <span style="font-size:9.5px;color:var(--text3);margin-left:auto">국면·맵=시장대비 기준 · α=시장대비 초과등락 · 수급=외국인+기관 누적순매수</span>
    </div>`;

  return header + body + legend;
}

// ── 로테이션 맵 버블 클릭 → 해당 표 행 강조 ──────────────────────────────────
function _srFocus(ind) {
  const row = document.getElementById('sr-row-' + ind);
  if (!row) return;
  row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  const orig = row.style.background;
  row.style.background = 'rgba(42,171,238,.16)';
  setTimeout(() => { row.style.background = orig; }, 1100);
}
