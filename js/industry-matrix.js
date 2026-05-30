/**
 * industry-matrix.js — 산업 강도 매트릭스
 *
 * US ETF 성과 ↔ KR 섹터 성과를 비교해 선행 신호를 자동 탐지합니다.
 *
 * 신호 탐지 기준 (선택된 기간 기준):
 *   ⚡ KR 추격 예상  : US 강세이지만 KR 미반영 → KR 추격 매수 관찰
 *   ⚠️ KR 하락 경고  : US 급락이지만 KR 아직 미하락 → KR 낙폭 확대 경고
 *   🚀 KR 독주        : KR이 US보다 현저히 강함 → 독자 모멘텀
 *   🟢 동조 강세      : US·KR 동반 상승
 *   🔴 동조 약세      : US·KR 동반 하락
 *
 * 의존: sb, KR_INDUSTRIES, IND_COLORS, getIndustryMap, fetchAllPages (config.js)
 */

// ── 기간별 신호 탐지 임계값 ────────────────────────────────────────────────
// period → { base, lead } px
//   base: 동조 강/약세 판단 기준 (±%)
//   lead: 선행 신호 스프레드 기준 (US-KR %)
const _IM_THRESH = {
  1:  { base: 1.0, lead: 0.8 },
  5:  { base: 2.5, lead: 2.0 },
  20: { base: 5.0, lead: 4.0 },
};

// ── 신호 정의 (우선순위 순) ───────────────────────────────────────────────
const _IM_SIGNALS = [
  {
    key: 'us_lead_bull',
    test: (u, k, thr) => u > thr.base && (u - k) > thr.lead,
    color: '#2dce89',
    icon: '⚡',
    label: 'KR 추격 예상',
    tip: 'US 선행 상승 — KR 아직 미반영, 매수 관찰 구간',
  },
  {
    key: 'us_lead_bear',
    test: (u, k, thr) => u < -thr.base && (k - u) > thr.lead,
    color: '#f5365c',
    icon: '⚠️',
    label: 'KR 하락 경고',
    tip: 'US 선행 하락 — KR 낙폭 확대 경고',
  },
  {
    key: 'kr_outrun',
    test: (u, k, thr) => (k - u) > thr.lead && k > thr.base * 0.6,
    color: '#ffd600',
    icon: '🚀',
    label: 'KR 독주',
    tip: 'KR 독자 강세 — 디커플링, 지속성 검증 필요',
  },
  {
    key: 'co_bull',
    test: (u, k, thr) => u > thr.base * 0.7 && k > thr.base * 0.7,
    color: '#4a9eff',
    icon: '🟢',
    label: '동조 강세',
    tip: 'US·KR 동반 상승 — 추세 유효',
  },
  {
    key: 'co_bear',
    test: (u, k, thr) => u < -thr.base * 0.7 && k < -thr.base * 0.7,
    color: '#fb6340',
    icon: '🔴',
    label: '동조 약세',
    tip: 'US·KR 동반 하락 — 리스크 오프',
  },
];

function _imDetect(usV, krV, period) {
  if (usV == null || krV == null) return null;
  const thr = _IM_THRESH[period] || _IM_THRESH[5];
  for (const s of _IM_SIGNALS) {
    if (s.test(usV, krV, thr)) return s;
  }
  return null; // 중립 — 배지 없음
}

// ── 셀 색상 헬퍼 ──────────────────────────────────────────────────────────
function _imColor(v) {
  if (v == null) return { txt: 'var(--text3)', bg: 'transparent' };
  if (v >= 5)   return { txt: '#4ade80', bg: 'rgba(45,206,137,.22)' };
  if (v >= 2)   return { txt: '#2dce89', bg: 'rgba(45,206,137,.14)' };
  if (v >= 0.3) return { txt: '#86efac', bg: 'rgba(45,206,137,.07)' };
  if (v >= 0)   return { txt: '#a8adc4', bg: 'transparent' };
  if (v > -0.3) return { txt: '#fca5a5', bg: 'transparent' };
  if (v > -2)   return { txt: '#f87171', bg: 'rgba(245,54,92,.07)' };
  if (v > -5)   return { txt: '#f5365c', bg: 'rgba(245,54,92,.14)' };
               return { txt: '#ef4444', bg: 'rgba(185,28,28,.22)' };
}

// ── 현재 기간 상태 ────────────────────────────────────────────────────────
let _imPeriod = 5;

// ── 기간 탭 전환 ──────────────────────────────────────────────────────────
function switchImPeriod(p) {
  _imPeriod = p;
  document.querySelectorAll('[data-im-period]').forEach(b =>
    b.classList.toggle('active', Number(b.dataset.imPeriod) === p));
  renderIndustryMatrix();
}

// ── 메인 로드 ─────────────────────────────────────────────────────────────
async function loadIndustryMatrix() {
  const el = document.getElementById('im-body');
  if (!el) return;

  el.innerHTML =
    '<div style="padding:1rem;color:var(--text3);font-size:12px">' +
    '<span class="loading"></span> 신호 분석 중...</div>';

  try {
    // ── ① 거래일 달력 (최근 25일) ──────────────────────────────────────
    const latestDate = (window._macroData || {}).base_date;
    if (!latestDate) {
      el.innerHTML = '<div style="padding:1rem;color:var(--text3);font-size:12px">시장 데이터 미로드</div>';
      return;
    }

    const { data: macroRows } = await sb.from('macro_data')
      .select('base_date')
      .lte('base_date', latestDate)
      .order('base_date', { ascending: false })
      .limit(25);

    // 오름차순 (가장 오래된 → 최신)
    const tradingDays = (macroRows || []).map(r => r.base_date).reverse();
    if (!tradingDays.length) return;

    const cutoffDate = tradingDays[0];
    const N          = tradingDays.length;

    // ── ② US ETF 등락률 조회 ────────────────────────────────────────────
    const { data: usRaw } = await sb.from('us_market')
      .select('base_date,industry,chg_pct')
      .gte('base_date', cutoffDate)
      .lte('base_date', latestDate)
      .not('chg_pct', 'is', null)
      .order('base_date', { ascending: true })
      .limit(5000);

    // usIndDate[ind][date] = [chg_pct, ...]
    const usIndDate = {};
    for (const r of (usRaw || [])) {
      const ind = r.industry;
      if (!usIndDate[ind]) usIndDate[ind] = {};
      if (!usIndDate[ind][r.base_date]) usIndDate[ind][r.base_date] = [];
      usIndDate[ind][r.base_date].push(r.chg_pct);
    }

    // ── ③ KR 섹터 누적 등락률 — sector_daily_summary (백엔드 사전집계) ──
    const { data: krSummary } = await sb.from('sector_daily_summary')
      .select('industry,avg_chg_1d,avg_chg_5d,avg_chg_20d')
      .eq('base_date', latestDate);

    // krChg[ind] = {1d, 5d, 20d}
    const krChg = {};
    for (const r of (krSummary || [])) {
      krChg[r.industry] = { '1d': r.avg_chg_1d, '5d': r.avg_chg_5d, '20d': r.avg_chg_20d };
    }

    // ── ④ US ETF 누적 성과 계산 ────────────────────────────────────────
    function cumChgUs(ind, nDays) {
      let total = 0, count = 0;
      for (let i = Math.max(0, N - nDays); i < N; i++) {
        const date = tradingDays[i];
        const vals = (usIndDate[ind] || {})[date];
        if (vals && vals.length) {
          total += vals.reduce((s, v) => s + v, 0) / vals.length;
          count++;
        }
      }
      return count > 0 ? parseFloat(total.toFixed(2)) : null;
    }

    // ── ⑤ 산업별 매트릭스 데이터 빌드 ─────────────────────────────────
    const KR_INDS = (typeof KR_INDUSTRIES !== 'undefined' ? KR_INDUSTRIES : null)
                 || (typeof INDUSTRIES    !== 'undefined' ? INDUSTRIES    : null)
                 || [];
    const matrixRows = [];

    for (const ind of KR_INDS) {
      const us1d  = cumChgUs(ind, 1);
      const us5d  = cumChgUs(ind, 5);
      const us20d = cumChgUs(ind, 20);
      const kr1d  = (krChg[ind] || {})['1d']  ?? null;
      const kr5d  = (krChg[ind] || {})['5d']  ?? null;
      const kr20d = (krChg[ind] || {})['20d'] ?? null;

      // 각 기간별 신호 pre-compute
      const sig = {
        1:  _imDetect(us1d,  kr1d,  1),
        5:  _imDetect(us5d,  kr5d,  5),
        20: _imDetect(us20d, kr20d, 20),
      };

      matrixRows.push({ ind, us1d, us5d, us20d, kr1d, kr5d, kr20d, sig });
    }

    // ── ⑥ 신호 강도 순 정렬 ────────────────────────────────────────────
    const _PRIO = {
      us_lead_bull: 0, us_lead_bear: 1, kr_outrun: 2,
      co_bull: 3, co_bear: 4,
    };
    matrixRows.sort((a, b) => {
      const sa = a.sig[5] || a.sig[1] || a.sig[20];
      const sb_ = b.sig[5] || b.sig[1] || b.sig[20];
      const pa = sa ? (_PRIO[sa.key] ?? 9) : 9;
      const pb = sb_ ? (_PRIO[sb_.key] ?? 9) : 9;
      if (pa !== pb) return pa - pb;
      // 같은 신호: us5d 기준 내림차순
      return (b.us5d ?? 0) - (a.us5d ?? 0);
    });

    window._imRows    = matrixRows;
    window._imDate    = latestDate;

    // 날짜 표시
    const dateEl = document.getElementById('im-date');
    if (dateEl) dateEl.textContent = latestDate + ' 기준';

    renderIndustryMatrix();

  } catch (e) {
    console.error('[IndustryMatrix]', e);
    if (el) el.innerHTML =
      `<div style="padding:1rem;color:var(--text3);font-size:12px">오류: ${e.message}</div>`;
  }
}

// ── 렌더링 ────────────────────────────────────────────────────────────────
function renderIndustryMatrix() {
  const el = document.getElementById('im-body');
  if (!el) return;

  const rows = window._imRows || [];
  if (!rows.length) {
    el.innerHTML =
      '<div style="padding:1rem;text-align:center;color:var(--text3);font-size:12px">데이터 없음</div>';
    return;
  }

  const p   = _imPeriod;
  const usK = { 1: 'us1d', 5: 'us5d', 20: 'us20d' }[p];
  const krK = { 1: 'kr1d', 5: 'kr5d', 20: 'kr20d' }[p];

  // 최대 절대값 (막대 스케일 기준)
  const maxAbs = Math.max(
    ...rows.map(r => Math.max(Math.abs(r[usK] ?? 0), Math.abs(r[krK] ?? 0))),
    2,
  );

  // ── 신호 카운트 요약 ───────────────────────────────────────────────────
  const sigCount = {};
  rows.forEach(r => {
    const s = r.sig[p];
    if (s) sigCount[s.key] = (sigCount[s.key] || 0) + 1;
  });
  const sigSummary = _IM_SIGNALS
    .filter(s => sigCount[s.key])
    .map(s =>
      `<span style="font-size:11px;color:${s.color};background:${s.color}15;border-radius:3px;padding:1px 7px">` +
      `${s.icon} ${s.label} <b>${sigCount[s.key]}</b></span>`)
    .join('');

  // ── 미니 퍼포먼스 바 ─────────────────────────────────────────────────
  function perfBar(v, flag) {
    const c = _imColor(v);
    const pct = v != null ? Math.round(Math.abs(v) / maxAbs * 100) : 0;
    const valStr = v != null
      ? (v >= 0 ? '+' : '') + v.toFixed(1) + '%'
      : '—';
    return (
      `<div style="display:flex;align-items:center;gap:5px">` +
        `<span style="font-size:10px;color:var(--text3);width:20px;flex-shrink:0">${flag}</span>` +
        `<div style="flex:1;height:5px;border-radius:3px;background:rgba(255,255,255,.07);overflow:hidden">` +
          `<div style="height:100%;width:${pct}%;background:${c.txt};border-radius:3px;transition:width .4s ease"></div>` +
        `</div>` +
        `<span style="font-size:11px;font-weight:600;color:${c.txt};min-width:38px;text-align:right;` +
              `font-variant-numeric:tabular-nums">${valStr}</span>` +
      `</div>`
    );
  }

  // ── 각 행 ─────────────────────────────────────────────────────────────
  const rowsHtml = rows.map(r => {
    const usV = r[usK];
    const krV = r[krK];
    const sig = r.sig[p];
    const indColor = ((typeof IND_COLORS !== 'undefined' ? IND_COLORS : null) || {})[r.ind] || '#a8adc4';

    // Spread (US − KR)
    const sp = (usV != null && krV != null) ? usV - krV : null;
    const spColor = sp == null ? 'var(--text3)' : sp > 0 ? '#2dce89' : '#f5365c';
    const spStr = sp != null
      ? `<span style="font-size:10px;color:${spColor};margin-left:6px">` +
        `Δ${sp > 0 ? '+' : ''}${sp.toFixed(1)}%</span>`
      : '';

    const sigBadge = sig
      ? `<span style="font-size:10px;font-weight:700;color:${sig.color};` +
        `background:${sig.color}1a;border-radius:4px;padding:2px 8px;` +
        `white-space:nowrap;cursor:help" title="${sig.tip}">${sig.icon} ${sig.label}</span>`
      : `<span style="font-size:10px;color:var(--text3);padding:2px 8px">— 중립</span>`;

    return (
      `<div style="padding:7px 12px;border-bottom:1px solid var(--border)">` +
        // 상단: 산업명 + 스프레드 + 신호
        `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">` +
          `<div style="display:flex;align-items:center;gap:5px">` +
            `<span style="width:7px;height:7px;border-radius:50%;background:${indColor};flex-shrink:0"></span>` +
            `<span style="font-size:12px;font-weight:700;color:var(--text1)">${r.ind}</span>` +
            spStr +
          `</div>` +
          sigBadge +
        `</div>` +
        // 미니 퍼포먼스 바
        `<div style="display:flex;flex-direction:column;gap:3px">` +
          perfBar(usV, '🇺🇸') +
          perfBar(krV, '🇰🇷') +
        `</div>` +
      `</div>`
    );
  }).join('');

  // ── 범례 / 설명 ──────────────────────────────────────────────────────
  const legendHtml =
    `<div style="padding:8px 12px 6px;border-top:1px solid var(--border);` +
         `display:flex;flex-wrap:wrap;gap:5px;align-items:center">` +
      _IM_SIGNALS.map(s =>
        `<span style="font-size:10px;color:${s.color};background:${s.color}15;` +
              `border-radius:3px;padding:1px 6px;cursor:help" title="${s.tip}">${s.icon} ${s.label}</span>`
      ).join('') +
      `<span style="font-size:10px;color:var(--text3);margin-left:auto">` +
        `${{ 1:'1일', 5:'5일', 20:'20일' }[p]} 기준 탐지 · 막대=누적 등락률</span>` +
    `</div>`;

  // ── 신호 요약 헤더 ───────────────────────────────────────────────────
  const summaryHtml = sigSummary
    ? `<div style="padding:6px 12px;border-bottom:1px solid var(--border);` +
           `display:flex;flex-wrap:wrap;gap:5px;align-items:center;background:var(--bg2)">` +
        `<span style="font-size:10px;color:var(--text3);margin-right:2px">탐지 신호:</span>` +
        sigSummary +
      `</div>`
    : '';

  el.innerHTML = summaryHtml + rowsHtml + legendHtml;
}
