/**
 * industry-matrix.js — 산업 강도 매트릭스
 *
 * sector_daily_summary 테이블에서 US 누적 등락률 · KR 누적 등락률 · 신호를 읽어 렌더링.
 * 신호 탐지 로직(detect_signal)은 백엔드 collect_sector_summary.py가 담당.
 *
 * 의존: sb, IND_COLORS (config.js)
 */

// ── 신호 표시 설정 (렌더링 전용, 계산 로직 없음) ─────────────────────────────
const _IM_SIGNALS_MAP = {
  us_lead_bull: { color: '#2dce89', icon: '⚡', label: 'KR 추격 예상', tip: 'US 선행 상승 — KR 아직 미반영, 매수 관찰 구간' },
  us_lead_bear: { color: '#f5365c', icon: '⚠️', label: 'KR 하락 경고', tip: 'US 선행 하락 — KR 낙폭 확대 경고' },
  kr_outrun:    { color: '#ffd600', icon: '🚀', label: 'KR 독주',       tip: 'KR 독자 강세 — 디커플링' },
  co_bull:      { color: '#4a9eff', icon: '🟢', label: '동조 강세',     tip: 'US·KR 동반 상승' },
  co_bear:      { color: '#fb6340', icon: '🔴', label: '동조 약세',     tip: 'US·KR 동반 하락' },
};

// 신호 우선순위 (정렬용)
const _IM_SIGNAL_PRIO = { us_lead_bull: 0, us_lead_bear: 1, kr_outrun: 2, co_bull: 3, co_bear: 4 };

// ── 셀 색상 헬퍼 ──────────────────────────────────────────────────────────────
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

// ── 현재 기간 상태 ────────────────────────────────────────────────────────────
let _imPeriod = 5;

// ── 기간 탭 전환 ──────────────────────────────────────────────────────────────
function switchImPeriod(p) {
  _imPeriod = p;
  document.querySelectorAll('[data-im-period]').forEach(b =>
    b.classList.toggle('active', Number(b.dataset.imPeriod) === p));
  renderIndustryMatrix();
}

// ── 메인 로드 — sector_daily_summary 단순 조회 ───────────────────────────────
async function loadIndustryMatrix() {
  const el = document.getElementById('im-body');
  if (!el) return;

  el.innerHTML =
    '<div style="padding:1rem;color:var(--text3);font-size:12px">' +
    '<span class="loading"></span> 신호 분석 중...</div>';

  try {
    const latestDate = (window._macroData || {}).base_date;
    if (!latestDate) {
      el.innerHTML = '<div style="padding:1rem;color:var(--text3);font-size:12px">시장 데이터 미로드</div>';
      return;
    }

    // ── sector_daily_summary 단일 조회 (백엔드 사전집계) ──────────────────────
    const { data: rows, error } = await sb.from('sector_daily_summary')
      .select([
        'industry',
        'avg_chg_1d', 'avg_chg_5d',  'avg_chg_20d',
        'us_chg_1d',  'us_chg_5d',   'us_chg_20d',
        'signal_1d',  'signal_5d',   'signal_20d',
      ].join(','))
      .eq('base_date', latestDate);

    if (error) throw error;

    if (!rows?.length) {
      el.innerHTML =
        '<div style="padding:1rem;text-align:center;color:var(--text3);font-size:12px">' +
        '신호 데이터 없음 — 장 마감 후 (17:15) 자동 집계됩니다</div>';
      return;
    }

    // ── matrixRows 빌드 ───────────────────────────────────────────────────────
    const KR_INDS = (typeof KR_INDUSTRIES !== 'undefined' ? KR_INDUSTRIES : null)
                 || (typeof INDUSTRIES    !== 'undefined' ? INDUSTRIES    : null)
                 || [];

    const matrixRows = rows
      .filter(r => KR_INDS.includes(r.industry))
      .map(r => ({
        ind:   r.industry,
        us1d:  r.us_chg_1d,   us5d:  r.us_chg_5d,  us20d: r.us_chg_20d,
        kr1d:  r.avg_chg_1d,  kr5d:  r.avg_chg_5d, kr20d: r.avg_chg_20d,
        sig: {
          1:  _IM_SIGNALS_MAP[r.signal_1d]  || null,
          5:  _IM_SIGNALS_MAP[r.signal_5d]  || null,
          20: _IM_SIGNALS_MAP[r.signal_20d] || null,
        },
      }));

    // ── 신호 강도 순 정렬 ─────────────────────────────────────────────────────
    matrixRows.sort((a, b) => {
      const sa = a.sig[5] || a.sig[1] || a.sig[20];
      const sb_ = b.sig[5] || b.sig[1] || b.sig[20];
      const pa = sa ? (_IM_SIGNAL_PRIO[sa.label] ?? _IM_SIGNAL_PRIO[Object.keys(_IM_SIGNALS_MAP).find(k => _IM_SIGNALS_MAP[k] === sa)] ?? 9) : 9;
      const pb = sb_ ? (_IM_SIGNAL_PRIO[sb_.label] ?? _IM_SIGNAL_PRIO[Object.keys(_IM_SIGNALS_MAP).find(k => _IM_SIGNALS_MAP[k] === sb_)] ?? 9) : 9;
      if (pa !== pb) return pa - pb;
      return (b.us5d ?? 0) - (a.us5d ?? 0);
    });

    window._imRows = matrixRows;
    window._imDate = latestDate;

    const dateEl = document.getElementById('im-date');
    if (dateEl) dateEl.textContent = latestDate + ' 기준';

    renderIndustryMatrix();

  } catch(e) {
    console.error('[IndustryMatrix]', e);
    if (el) el.innerHTML =
      `<div style="padding:1rem;color:var(--text3);font-size:12px">오류: ${e.message}</div>`;
  }
}

// ── 렌더링 ────────────────────────────────────────────────────────────────────
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

  const maxAbs = Math.max(
    ...rows.map(r => Math.max(Math.abs(r[usK] ?? 0), Math.abs(r[krK] ?? 0))),
    2,
  );

  // ── 신호 카운트 요약 ───────────────────────────────────────────────────────
  const sigCount = {};
  rows.forEach(r => {
    const s = r.sig[p];
    if (s) sigCount[s.label] = (sigCount[s.label] || 0) + 1;
  });
  const sigSummary = Object.values(_IM_SIGNALS_MAP)
    .filter((s, i, arr) => arr.findIndex(x => x.label === s.label) === i) // dedupe
    .filter(s => sigCount[s.label])
    .map(s =>
      `<span style="font-size:11px;color:${s.color};background:${s.color}15;border-radius:3px;padding:1px 7px">` +
      `${s.icon} ${s.label} <b>${sigCount[s.label]}</b></span>`)
    .join('');

  // ── 미니 퍼포먼스 바 ──────────────────────────────────────────────────────
  function perfBar(v, flag) {
    const c   = _imColor(v);
    const pct = v != null ? Math.round(Math.abs(v) / maxAbs * 100) : 0;
    const val = v != null ? (v >= 0 ? '+' : '') + v.toFixed(1) + '%' : '—';
    return (
      `<div style="display:flex;align-items:center;gap:5px">` +
        `<span style="font-size:10px;color:var(--text3);width:20px;flex-shrink:0">${flag}</span>` +
        `<div style="flex:1;height:5px;border-radius:3px;background:rgba(255,255,255,.07);overflow:hidden">` +
          `<div style="height:100%;width:${pct}%;background:${c.txt};border-radius:3px;transition:width .4s ease"></div>` +
        `</div>` +
        `<span style="font-size:11px;font-weight:600;color:${c.txt};min-width:38px;text-align:right;` +
              `font-variant-numeric:tabular-nums">${val}</span>` +
      `</div>`
    );
  }

  // ── 각 행 ─────────────────────────────────────────────────────────────────
  const rowsHtml = rows.map(r => {
    const usV = r[usK];
    const krV = r[krK];
    const sig = r.sig[p];
    const indColor = ((typeof IND_COLORS !== 'undefined' ? IND_COLORS : null) || {})[r.ind] || '#a8adc4';

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
        `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">` +
          `<div style="display:flex;align-items:center;gap:5px">` +
            `<span style="width:7px;height:7px;border-radius:50%;background:${indColor};flex-shrink:0"></span>` +
            `<span style="font-size:12px;font-weight:700;color:var(--text1)">${r.ind}</span>` +
            spStr +
          `</div>` +
          sigBadge +
        `</div>` +
        `<div style="display:flex;flex-direction:column;gap:3px">` +
          perfBar(usV, '🇺🇸') +
          perfBar(krV, '🇰🇷') +
        `</div>` +
      `</div>`
    );
  }).join('');

  // ── 범례 ──────────────────────────────────────────────────────────────────
  const legendItems = Object.entries(_IM_SIGNALS_MAP)
    .filter(([, s], i, arr) => arr.findIndex(([, x]) => x.label === s.label) === i);
  const legendHtml =
    `<div style="padding:8px 12px 6px;border-top:1px solid var(--border);` +
         `display:flex;flex-wrap:wrap;gap:5px;align-items:center">` +
      legendItems.map(([, s]) =>
        `<span style="font-size:10px;color:${s.color};background:${s.color}15;` +
              `border-radius:3px;padding:1px 6px;cursor:help" title="${s.tip}">${s.icon} ${s.label}</span>`
      ).join('') +
      `<span style="font-size:10px;color:var(--text3);margin-left:auto">` +
        `${{ 1:'1일', 5:'5일', 20:'20일' }[p]} 기준 · 백엔드 탐지</span>` +
    `</div>`;

  const summaryHtml = sigSummary
    ? `<div style="padding:6px 12px;border-bottom:1px solid var(--border);` +
           `display:flex;flex-wrap:wrap;gap:5px;align-items:center;background:var(--bg2)">` +
        `<span style="font-size:10px;color:var(--text3);margin-right:2px">탐지 신호:</span>` +
        sigSummary +
      `</div>`
    : '';

  el.innerHTML = summaryHtml + rowsHtml + legendHtml;
}
