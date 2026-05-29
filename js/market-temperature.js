/**
 * market-temperature.js — 시장 온도계
 *
 * 기존 로드된 데이터만으로 0~100점 시장 온도를 계산해 렌더링한다.
 * 별도 DB 쿼리 없음 — loadMarketOverview() 완료 후 호출.
 *
 * 의존:
 *   window._macroData        (chart-macro.js)
 *   window._allMarketRows    (market-overview.js)
 *   window._krIndFinalReturn (chart-industry.js)
 *   window.KR_INDUSTRIES     (config.js)
 */

// ── 온도 계산 ─────────────────────────────────────────────────────────────────
function _calcTemperature() {
  const m    = window._macroData        || {};
  const rows = window._allMarketRows    || [];
  const krR  = window._krIndFinalReturn || {};
  const inds = (typeof KR_INDUSTRIES !== 'undefined' ? KR_INDUSTRIES : null)
             || (typeof INDUSTRIES    !== 'undefined' ? INDUSTRIES    : null)
             || [];

  let score = 0;
  const parts = [];

  // ① VIX (max 30)
  const vix = m.vix ?? null;
  let vixPts = 15; // 데이터 없을 때 중립
  if (vix !== null) {
    if      (vix <  15) vixPts = 30;
    else if (vix <  18) vixPts = 25;
    else if (vix <  20) vixPts = 20;
    else if (vix <  22) vixPts = 15;
    else if (vix <  25) vixPts = 10;
    else if (vix <  30) vixPts = 5;
    else                vixPts = 0;
  }
  score += vixPts;
  parts.push({
    label: vix != null ? `VIX ${Number(vix).toFixed(0)}` : 'VIX —',
    pts: vixPts, max: 30,
  });

  // ② 국내 지수 (max 20)
  const krAvg = ((m.kospi_chg ?? 0) + (m.kosdaq_chg ?? 0)) / 2;
  let krPts;
  if      (krAvg >=  2.0) krPts = 20;
  else if (krAvg >=  1.0) krPts = 17;
  else if (krAvg >=  0.3) krPts = 14;
  else if (krAvg >=  0.0) krPts = 10;
  else if (krAvg >= -0.3) krPts = 7;
  else if (krAvg >= -1.0) krPts = 4;
  else if (krAvg >= -2.0) krPts = 2;
  else                    krPts = 0;
  score += krPts;
  parts.push({
    label: `코스피/닥 ${krAvg >= 0 ? '+' : ''}${krAvg.toFixed(1)}%`,
    pts: krPts, max: 20,
  });

  // ③ 외국인 수급 방향 (max 20)
  const frgnTotal = rows.reduce((s, r) => s + (r.foreign_net_buy ?? 0), 0);
  let frgnPts;
  if      (frgnTotal >  5000) frgnPts = 20;
  else if (frgnTotal >  2000) frgnPts = 16;
  else if (frgnTotal >   500) frgnPts = 12;
  else if (frgnTotal >=    0) frgnPts = 8;
  else if (frgnTotal > -2000) frgnPts = 5;
  else if (frgnTotal > -5000) frgnPts = 2;
  else                        frgnPts = 0;
  score += frgnPts;
  const fab  = Math.abs(frgnTotal);
  const fStr = (frgnTotal >= 0 ? '+' : '-') +
               (fab >= 1e6 ? (fab / 1e6).toFixed(1) + '조'
                           : Math.round(fab / 100) + '억');
  parts.push({ label: `외국인 ${fStr}`, pts: frgnPts, max: 20 });

  // ④ 산업 모멘텀 (max 15)
  const upInds   = inds.filter(ind => (krR[ind] ?? 0) > 0).length;
  const indRatio = inds.length > 0 ? upInds / inds.length : 0.5;
  const indPts   = Math.round(indRatio * 15);
  score += indPts;
  parts.push({ label: `산업 상승 ${upInds}/${inds.length}`, pts: indPts, max: 15 });

  // ⑤ 시장 활성도 — 1% 이상 등락 종목 비율 (max 15)
  const active   = rows.filter(r => Math.abs(r.price_change_rate ?? 0) >= 1.0).length;
  const actRatio = rows.length > 0 ? active / rows.length : 0;
  const actPts   = Math.min(Math.round(actRatio * 2.0 * 15), 15);
  score += actPts;
  parts.push({ label: `변동 종목 ${active}개`, pts: actPts, max: 15 });

  // 등급 결정
  let gradeTxt, gradeColor, gradeEmoji, strategy;
  if      (score >= 86) {
    gradeTxt = '과열 국면'; gradeColor = '#4a9eff'; gradeEmoji = '🔵';
    strategy = '고점 경계 — 추격 매수 자제, 단계적 비중 조절 검토';
  } else if (score >= 66) {
    gradeTxt = '우호 국면'; gradeColor = '#2dce89'; gradeEmoji = '🟢';
    strategy = '적극 탐색 가능 — 모멘텀 종목·성장주 중심으로 진입 검토';
  } else if (score >= 46) {
    gradeTxt = '중립 국면'; gradeColor = '#f59e0b'; gradeEmoji = '🟡';
    strategy = '선별적 접근 — 수급 확인 후 주도 업종 중심 대응';
  } else if (score >= 26) {
    gradeTxt = '경계 국면'; gradeColor = '#fb6340'; gradeEmoji = '🟠';
    strategy = '방어적 대응 — 낙폭 과대 관찰, 신규 진입 최소화';
  } else {
    gradeTxt = '위험 국면'; gradeColor = '#f5365c'; gradeEmoji = '🔴';
    strategy = '현금 비중 확대 — 신규 진입 자제, 기존 포지션 점검';
  }

  return { score, gradeTxt, gradeColor, gradeEmoji, parts, strategy };
}


// ── 렌더링 ────────────────────────────────────────────────────────────────────
function renderMarketTemperature() {
  const el = document.getElementById('market-temp-body');
  if (!el) return;

  const t = _calcTemperature();

  el.innerHTML = `
  <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px">

    <!-- 숫자 스코어 -->
    <div style="text-align:center;min-width:54px;flex-shrink:0">
      <div style="font-size:36px;font-weight:800;line-height:1;color:${t.gradeColor};
        font-variant-numeric:tabular-nums">${t.score}</div>
      <div style="font-size:10px;color:var(--text3);margin-top:2px">/ 100</div>
    </div>

    <!-- 게이지 + 등급 -->
    <div style="flex:1">
      <div style="font-size:14px;font-weight:700;color:${t.gradeColor};
        margin-bottom:7px;display:flex;align-items:center;gap:6px">
        ${t.gradeEmoji} ${t.gradeTxt}
      </div>
      <div class="temp-gauge-bar">
        <div class="temp-gauge-fill" style="width:${t.score}%"></div>
        ${[25, 45, 65, 85].map(v =>
          `<div style="position:absolute;left:${v}%;top:0;bottom:0;
            width:1px;background:rgba(0,0,0,.4);z-index:1"></div>`
        ).join('')}
      </div>
      <div style="display:flex;justify-content:space-between;
        font-size:9px;color:var(--text3);margin-top:3px;padding:0 1px;letter-spacing:0">
        <span>위험</span><span>경계</span><span>중립</span><span>우호</span><span>과열</span>
      </div>
    </div>
  </div>

  <!-- 전략 메모 -->
  <div style="font-size:11px;color:var(--text2);margin-bottom:10px;
    padding:7px 10px;background:var(--bg3);border-radius:5px;
    border-left:2px solid ${t.gradeColor};line-height:1.5">
    ${t.strategy}
  </div>

  <!-- 세부 요소 -->
  <div style="display:flex;flex-direction:column;gap:5px">
    ${t.parts.map(p => {
      const pct      = Math.round(p.pts / p.max * 100);
      const barColor = pct >= 70 ? '#2dce89' : pct >= 40 ? '#f59e0b' : '#f5365c';
      return `
      <div class="temp-detail-row">
        <span style="min-width:126px;color:var(--text3)">${p.label}</span>
        <div class="temp-detail-bar">
          <div class="temp-detail-fill" style="width:${pct}%;background:${barColor}"></div>
        </div>
        <span style="min-width:34px;text-align:right;font-size:11px;font-weight:600;color:var(--text2)">${p.pts}<span style="color:var(--text3);font-weight:400">/${p.max}</span></span>
      </div>`;
    }).join('')}
  </div>`;

  // 날짜 표시
  const dateEl = document.getElementById('market-temp-date');
  if (dateEl) {
    const m = window._macroData || {};
    dateEl.textContent = m.base_date ? `${m.base_date} 기준` : '';
  }
}
