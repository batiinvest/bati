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
  us_lead_bull: { color: '#2dce89', icon: '⚡', label: 'KR 추격 예상', tip: 'US 먼저 상승 — KR 아직 미반영, 매수 관찰' },
  us_lead_bear: { color: '#f5365c', icon: '⚠️', label: 'KR 하락 경고', tip: 'US 먼저 하락 — KR 낙폭 확대 경고' },
  kr_outrun:    { color: '#ffd600', icon: '🚀', label: 'KR 독주',       tip: 'KR 독자 강세 — 과열 주의, 조정 가능' },
  co_bull:      { color: '#2dce89', icon: '🟢', label: '동조 강세',     tip: 'US·KR 동반 상승 — 추세 지속 가능' },
  co_bear:      { color: '#f5365c', icon: '🔴', label: '동조 약세',     tip: 'US·KR 동반 하락 — 방어적 대응 필요' },
};

// 신호 우선순위 (정렬용) — 코드 키 기준
const _IM_SIGNAL_PRIO = { us_lead_bull: 0, us_lead_bear: 1, kr_outrun: 2, co_bull: 3, co_bear: 4 };

// 신호 객체 → 코드 키 역조회 헬퍼
const _imSigKey = s => Object.keys(_IM_SIGNALS_MAP).find(k => _IM_SIGNALS_MAP[k] === s) ?? null;

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
    // sector_daily_summary 자체 최신 날짜로 조회 (macro_data 날짜와 불일치 방지)
    const { data: latestRow } = await sb.from('sector_daily_summary')
      .select('base_date')
      .order('base_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    const latestDate = latestRow?.base_date;
    if (!latestDate) {
      el.innerHTML =
        '<div style="padding:1rem;text-align:center;color:var(--text3);font-size:12px">' +
        '신호 데이터 없음 — 장 마감 후 (17:15) 자동 집계됩니다</div>';
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

    // ── 신호 우선순위 순 정렬 (버그 수정: _imSigKey로 코드 키 역조회) ─────────
    matrixRows.sort((a, b) => {
      const sa = a.sig[5] || a.sig[1] || a.sig[20];
      const sb_ = b.sig[5] || b.sig[1] || b.sig[20];
      const pa = sa  ? (_IM_SIGNAL_PRIO[_imSigKey(sa)]  ?? 9) : 9;
      const pb = sb_ ? (_IM_SIGNAL_PRIO[_imSigKey(sb_)] ?? 9) : 9;
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
    const key = _imSigKey(r.sig[p]);
    if (key) sigCount[key] = (sigCount[key] || 0) + 1;
  });
  const sigSummary = Object.entries(_IM_SIGNALS_MAP)
    .filter(([k]) => sigCount[k])
    .map(([k, s]) =>
      `<span style="font-size:11px;color:${s.color};background:${s.color}15;border-radius:3px;padding:1px 7px">` +
      `${s.icon} ${s.label} <b>${sigCount[k]}</b></span>`)
    .join('');

  // ── 양방향 퍼포먼스 바 (compact: flag 생략, 바+값만) ─────────────────────
  function perfBar(v, flag) {
    const c   = _imColor(v);
    const pct = v != null ? Math.min(Math.abs(v) / maxAbs * 50, 50) : 0;
    const val = v != null ? (v >= 0 ? '+' : '') + v.toFixed(1) + '%' : '—';
    const isPos = v != null && v >= 0;
    return (
      `<div style="display:flex;align-items:center;gap:4px;min-width:0">` +
        `<span style="font-size:9px;color:var(--text3);flex-shrink:0">${flag}</span>` +
        `<div style="flex:1;height:6px;border-radius:2px;position:relative;background:rgba(255,255,255,.07);overflow:hidden">` +
          `<div style="position:absolute;top:0;height:100%;width:${pct}%;` +
               `background:${c.txt};border-radius:2px;transition:width .4s ease;` +
               `${isPos ? 'left:50%' : 'right:50%;'}"></div>` +
          `<div style="position:absolute;top:0;left:50%;width:1px;height:100%;background:rgba(255,255,255,.2)"></div>` +
        `</div>` +
        `<span style="font-size:10px;font-weight:600;color:${c.txt};width:34px;text-align:right;` +
              `font-variant-numeric:tabular-nums;flex-shrink:0">${val}</span>` +
      `</div>`
    );
  }

  // ── 각 행 (compact: tip 제거, US/KR 2열 나란히) ───────────────────────────
  const rowsHtml = rows.map(r => {
    const usV = r[usK];
    const krV = r[krK];
    const sig = r.sig[p];
    const indColor = ((typeof IND_COLORS !== 'undefined' ? IND_COLORS : null) || {})[r.ind] || '#a8adc4';

    // Δ 스프레드
    const sp = (usV != null && krV != null) ? usV - krV : null;
    let spHtml = '';
    if (sp != null && Math.abs(sp) >= 0.3) {
      const spColor = sp > 0 ? '#2dce89' : '#f5365c';
      const spLabel = sp > 0 ? 'US↑KR미반영' : 'KR↑US대비';
      spHtml =
        `<span style="font-size:9px;color:${spColor};margin-left:5px;` +
        `background:${spColor}18;border-radius:3px;padding:1px 4px;white-space:nowrap">` +
        `${spLabel} ${sp > 0 ? '+' : ''}${sp.toFixed(1)}%</span>`;
    }

    // 신호 배지 (tip 텍스트 제거 — 높이 절감)
    const sigBadge = sig
      ? `<span style="font-size:10px;font-weight:700;color:${sig.color};` +
          `background:${sig.color}1a;border-radius:4px;padding:2px 7px;white-space:nowrap;flex-shrink:0">` +
          `${sig.icon} ${sig.label}</span>`
      : `<span style="font-size:10px;color:var(--text3);flex-shrink:0">—</span>`;

    return (
      `<div style="padding:5px 12px;border-bottom:1px solid var(--border)">` +
        // 1줄: 섹터명 + 스프레드 + 신호배지
        `<div style="display:flex;align-items:center;justify-content:space-between;gap:4px;margin-bottom:4px">` +
          `<div style="display:flex;align-items:center;gap:4px;min-width:0;flex:1;overflow:hidden">` +
            `<span style="width:6px;height:6px;border-radius:50%;background:${indColor};flex-shrink:0"></span>` +
            `<span style="font-size:11px;font-weight:700;color:var(--text1);white-space:nowrap">${r.ind}</span>` +
            spHtml +
          `</div>` +
          sigBadge +
        `</div>` +
        // 2줄: US / KR 바 나란히
        `<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">` +
          perfBar(usV, '🇺🇸') +
          perfBar(krV, '🇰🇷') +
        `</div>` +
      `</div>`
    );
  }).join('');

  // ── 범례 ──────────────────────────────────────────────────────────────────
  const legendHtml =
    `<div style="padding:8px 12px 6px;border-top:1px solid var(--border);` +
         `display:flex;flex-wrap:wrap;gap:5px;align-items:center">` +
      Object.entries(_IM_SIGNALS_MAP).map(([, s]) =>
        `<span style="font-size:10px;color:${s.color};background:${s.color}15;` +
              `border-radius:3px;padding:1px 6px">${s.icon} ${s.label}</span>`
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
