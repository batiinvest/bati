/**
 * market-temperature.js — 시장 온도계 (v2)
 *
 * 기존 로드된 데이터만으로 0~100점 시장 온도를 계산해 렌더링한다.
 * 별도 DB 쿼리 없음 — loadMarketOverview() 완료 후 호출.
 *
 * 의존:
 *   window._macroData        (chart-macro.js)
 *   window._allMarketRows    (market-overview.js)
 *   window._krIndFinalReturn (chart-industry.js)
 *   window.KR_INDUSTRIES     (config.js)
 *
 * ── 배점 구조 (총 100점) ─────────────────────────────────
 *  ① VIX 글로벌 공포지수        20pt  (구 30pt)
 *  ② USD/KRW 환율 방향          20pt  (신규 — 한국 시장 1순위 선행지표)
 *  ③ 미 10년 금리 방향          10pt  (신규 — 성장주 할인율 직결)
 *  ④ 코스피/닥 등락률           15pt  (구 20pt — 결과지표 비중 축소)
 *  ⑤ 외국인 수급 방향           15pt  (구 20pt)
 *  ⑥ 시장 폭 — 상승 종목 비율  12pt  (구 15pt)
 *  ⑦ 산업 모멘텀                 8pt  (구 15pt — 상승종목 비율과 중복 축소)
 * ─────────────────────────────────────────────────────────
 *
 * ── 등급 구간 (20점 균등 간격) ──
 *  🔴 위험  0~19   현금 비중 극대화
 *  🟠 경계 20~39   방어적 포지션 유지
 *  🟡 중립 40~59   선별적 접근
 *  🟢 우호 60~79   적극 탐색 가능
 *  🔵 과열 80~100  단계적 비중 축소 검토
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

  // ① VIX 글로벌 공포지수 (max 20)
  // VIX는 미 S&P500 기반 간접지표 → 비중 20%로 조정 (구 30%)
  // 한국 고유 요인(환율·금리)과 병행해야 의미 있음
  const vix = m.vix ?? null;
  let vixPts = 10; // 데이터 없을 때 중립
  if (vix !== null) {
    if      (vix <  13) vixPts = 20;  // 극도 낙관 — 오히려 과열 경계 구간
    else if (vix <  16) vixPts = 17;  // 안정적 강세 환경
    else if (vix <  19) vixPts = 14;  // 보통 수준
    else if (vix <  22) vixPts = 10;  // 중립
    else if (vix <  25) vixPts = 6;   // 불안 신호
    else if (vix <  30) vixPts = 3;   // 공포 구간
    else                vixPts = 0;   // 극도 공포 (≥30)
  }
  score += vixPts;
  parts.push({
    label: vix != null ? `VIX ${Number(vix).toFixed(1)}` : 'VIX —',
    pts: vixPts, max: 20,
    hint: vix != null
      ? (vix < 16 ? '안정 국면' : vix < 22 ? '주의 구간' : '공포 구간')
      : '데이터 없음',
  });

  // ② USD/KRW 환율 방향 (max 20) — 🆕 신규
  // 원화 강세(달러↓) = 외국인 자금 유입 + 위험자산 선호 = 긍정
  // 원화 약세(달러↑) = 외국인 이탈 압력 + 수입 물가 부담 = 부정
  // 한국 시장에서 당일 가장 강력한 선행 지표 중 하나
  const krwChg = m.usd_krw_chg ?? null;   // 원/달러 전일 대비 변화 (원)
  const krwLvl = m.usd_krw ?? null;       // 원/달러 절대 수준
  let krwPts = 10; // 데이터 없을 때 중립
  if (krwChg !== null) {
    const chgPct = krwLvl ? (krwChg / krwLvl) * 100 : 0;
    if      (chgPct < -0.5)  krwPts = 20;  // 원화 강세 0.5% 이상 — 외국인 유입 신호 강
    else if (chgPct < -0.2)  krwPts = 17;  // 원화 강세 0.2~0.5%
    else if (chgPct < -0.05) krwPts = 14;  // 소폭 원화 강세
    else if (chgPct <= 0.05) krwPts = 10;  // 보합
    else if (chgPct <= 0.2)  krwPts = 6;   // 소폭 원화 약세
    else if (chgPct <= 0.5)  krwPts = 3;   // 원화 약세 — 외국인 매도 압력
    else                     krwPts = 0;   // 원화 급약세 — 이탈 신호 강
  }
  score += krwPts;
  const krwStr = krwChg != null
    ? `${krwChg >= 0 ? '+' : ''}${Number(krwChg).toFixed(0)}원`
    : '—';
  parts.push({
    label: `USD/KRW ${krwStr}`,
    pts: krwPts, max: 20,
    hint: krwChg != null
      ? (krwChg < 0 ? '원화 강세 ▲' : krwChg > 0 ? '원화 약세 ▼' : '보합')
      : '데이터 없음',
  });

  // ③ 미 10년 국채금리 방향 (max 10) — 🆕 신규
  // 금리 하락 = 유동성 확대 + 성장주 할인율 완화 = 긍정
  // 금리 상승 = 긴축 심리 + PER 압축 = 부정
  // 반도체·IT 비중 높은 코스피 특성상 금리 민감도 특히 높음
  const us10yChg = m.us10y_chg ?? null;  // 전일 대비 변화 (bp 또는 %)
  let ratesPts = 5; // 데이터 없을 때 중립
  if (us10yChg !== null) {
    if      (us10yChg < -0.06) ratesPts = 10;  // 금리 급락 — 유동성 확대 신호
    else if (us10yChg < -0.02) ratesPts = 8;   // 금리 하락
    else if (us10yChg <= 0.02) ratesPts = 5;   // 보합
    else if (us10yChg <= 0.06) ratesPts = 2;   // 금리 상승
    else                       ratesPts = 0;   // 금리 급등 — 긴축 우려
  }
  score += ratesPts;
  const ratesStr = us10yChg != null
    ? `${us10yChg >= 0 ? '+' : ''}${Number(us10yChg).toFixed(3)}%`
    : '—';
  parts.push({
    label: `미10년금리 ${ratesStr}`,
    pts: ratesPts, max: 10,
    hint: us10yChg != null
      ? (us10yChg < 0 ? '금리 하락 ▼ (긍정)' : us10yChg > 0.02 ? '금리 상승 ▲ (부정)' : '보합')
      : '데이터 없음',
  });

  // ④ 국내 지수 등락률 (max 15) — 구 20pt → 결과지표 비중 축소
  // 당일 등락률은 환율·수급의 *결과*이므로 선행지표보다 비중 낮게 설정
  const krAvg = ((m.kospi_chg ?? 0) + (m.kosdaq_chg ?? 0)) / 2;
  let krPts;
  if      (krAvg >=  2.0) krPts = 15;
  else if (krAvg >=  1.0) krPts = 13;
  else if (krAvg >=  0.3) krPts = 10;
  else if (krAvg >=  0.0) krPts = 7;
  else if (krAvg >= -0.3) krPts = 5;
  else if (krAvg >= -1.0) krPts = 2;
  else                    krPts = 0;
  score += krPts;
  parts.push({
    label: `코스피/닥 ${krAvg >= 0 ? '+' : ''}${krAvg.toFixed(2)}%`,
    pts: krPts, max: 15,
    hint: '',
  });

  // ⑤ 외국인 수급 방향 (max 15) — 구 20pt → 주 단위 한계 인정, 방향성만 활용
  // foreign_net_buy 단위: 주(株) — 금액 환산 불가 시 방향성 지표로만 활용
  // 시가총액 가중 평균이 이상적이나 현재 데이터 구조상 순주 단위로 대응
  const frgnTotal = rows.reduce((s, r) => s + (r.foreign_net_buy ?? 0), 0);
  let frgnPts;
  if      (frgnTotal >  500000) frgnPts = 15;  // 대규모 순매수
  else if (frgnTotal >  200000) frgnPts = 12;
  else if (frgnTotal >   50000) frgnPts = 9;
  else if (frgnTotal >=      0) frgnPts = 6;   // 소폭 매수 or 보합
  else if (frgnTotal > -200000) frgnPts = 3;
  else if (frgnTotal > -500000) frgnPts = 1;
  else                          frgnPts = 0;   // 대규모 순매도
  score += frgnPts;
  const fAbs = Math.abs(frgnTotal);
  const fStr = (frgnTotal >= 0 ? '+' : '') + frgnTotal.toLocaleString() + '주';
  parts.push({
    label: `외국인 ${fStr}`,
    pts: frgnPts, max: 15,
    hint: '',
  });

  // ⑥ 시장 폭 — 상승 종목 비율 (max 12) — 구 15pt
  // 전체 시장에서 상승 종목 비율 → 매수세의 폭(breadth) 측정
  // 폭 넓은 상승 = 투자심리 건강, 소수 주도 상승 = 리스크 내재
  const riseCount = rows.filter(r => (r.price_change_rate ?? 0) > 0).length;
  const fallCount = rows.filter(r => (r.price_change_rate ?? 0) < 0).length;
  const riseRatio = rows.length > 0 ? riseCount / rows.length : 0.5;
  const actPts    = Math.min(Math.round(riseRatio * 2.0 * 12), 12);
  score += actPts;
  parts.push({
    label: `상승 ${riseCount} / 하락 ${fallCount}`,
    pts: actPts, max: 12,
    hint: '',
  });

  // ⑦ 산업 모멘텀 — 상승 산업 비율 (max 8) — 구 15pt → 상승종목 비율과 중복 축소
  // 어떤 산업이 올랐는지(시가총액 가중)가 이상적이나 현재 데이터로는 단순 비율 활용
  const upInds   = inds.filter(ind => (krR[ind] ?? 0) > 0).length;
  const indRatio = inds.length > 0 ? upInds / inds.length : 0.5;
  const indPts   = Math.round(indRatio * 8);
  score += indPts;
  parts.push({
    label: `산업 상승 ${upInds}/${inds.length}`,
    pts: indPts, max: 8,
    hint: '',
  });

  // ── 등급 결정 (20점 균등 간격) ──────────────────────────────────────────────
  // 구 구간: 위험(0-25), 경계(26-45), 중립(46-65), 우호(66-85), 과열(86-100)
  // → 과열 구간이 15점으로 사실상 달성 불가 → 균등 20점 간격으로 조정
  let gradeTxt, gradeColor, gradeEmoji, strategy;

  // 환율·금리 신호 결합해 전략 메시지 세분화
  const krwNeg  = krwChg != null && krwChg > 3;    // 원화 급약세 (외국인 이탈 우려)
  const ratePop = us10yChg != null && us10yChg > 0.05;  // 금리 급등

  if (score >= 80) {
    gradeTxt = '과열 국면'; gradeColor = '#4a9eff'; gradeEmoji = '🔵';
    strategy = '단계적 비중 축소 검토 — 고점 추격 매수 자제. 수익 실현 구간 설정 권고. 신규 진입 시 손절선 엄격히 관리.';
  } else if (score >= 60) {
    gradeTxt = '우호 국면'; gradeColor = '#2dce89'; gradeEmoji = '🟢';
    if (krwNeg)
      strategy = '수급 긍정이나 환율 약세 — 외국인 지속성 확인 필요. 수출주·환헤지 비중 점검.';
    else
      strategy = '매수 우위 환경 — 모멘텀 종목·주도 업종 중심 진입 검토. 포지션 확대는 분할 접근.';
  } else if (score >= 40) {
    gradeTxt = '중립 국면'; gradeColor = '#f59e0b'; gradeEmoji = '🟡';
    if (ratePop)
      strategy = '금리 상승 압력 주의 — 고PER 성장주 비중 축소 고려. 가치주·배당주로 분산.';
    else
      strategy = '선별적 접근 — 수급 확인된 주도 업종만 대응. 시장 방향성 확인 전 신규 진입 자제.';
  } else if (score >= 20) {
    gradeTxt = '경계 국면'; gradeColor = '#fb6340'; gradeEmoji = '🟠';
    strategy = '방어적 포지션 — 낙폭 과대 종목 단기 반등 관찰. 신규 포지션 최소화, 현금 비중 확대 준비.';
  } else {
    gradeTxt = '위험 국면'; gradeColor = '#f5365c'; gradeEmoji = '🔴';
    strategy = '현금 비중 극대화 — 신규 진입 전면 자제. 기존 포지션 손절 기준 재점검. 공포 극대화 구간에서 역발상 준비.';
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
        ${[20, 40, 60, 80].map(v =>
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
    border-left:2px solid ${t.gradeColor};line-height:1.6">
    ${t.strategy}
  </div>

  <!-- 세부 요소 -->
  <div style="display:flex;flex-direction:column;gap:5px">
    ${t.parts.map(p => {
      const pct      = Math.round(p.pts / p.max * 100);
      const barColor = pct >= 70 ? '#2dce89' : pct >= 40 ? '#f59e0b' : '#f5365c';
      return `
      <div class="temp-detail-row">
        <span style="min-width:140px;color:var(--text2);font-size:11px">${p.label}${p.hint ? ` <span style="color:var(--text3);font-size:10px">${p.hint}</span>` : ''}</span>
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
