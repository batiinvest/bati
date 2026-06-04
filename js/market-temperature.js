/**
 * market-temperature.js — 시장 온도계 (v3)
 *
 * 기존 로드된 데이터만으로 0~100점 시장 온도를 계산해 렌더링한다.
 * 별도 DB 쿼리 없음 — loadMarketOverview() 완료 후 호출.
 *
 * 의존:
 *   window._macroData     (chart-macro.js)
 *   window._allMarketRows (market-overview.js)
 *
 * ── 배점 구조 (총 100점) ─────────────────────────────────
 *  ① USD/KRW 환율 방향   25pt  한국 시장 1순위 선행지표
 *  ② 코스피/닥 등락률    25pt  당일 시장 결과 반영
 *  ③ 외국인 수급 방향    20pt  매수 주체 확인
 *  ④ VIX 글로벌 공포지수 15pt  간접 글로벌 리스크
 *  ⑤ 미 10년 금리 방향   15pt  성장주 할인율 직결
 * ─────────────────────────────────────────────────────────
 * ※ 시장 폭(상승 종목 비율)·산업 모멘텀 제거 — 둘 다 동일 정보의 중복
 *
 * ── 등급 구간 (20점 균등 간격) ──
 *  🔴 위험   0~19   현금 비중 극대화
 *  🟠 경계  20~39   방어적 포지션 유지
 *  🟡 중립  40~59   선별적 접근
 *  🟢 우호  60~79   적극 탐색 가능
 *  🔵 과열  80~100  단계적 비중 축소 검토
 */

// ── 온도 계산 ─────────────────────────────────────────────────────────────────
function _calcTemperature() {
  const m    = window._macroData     || {};
  const rows = window._allMarketRows || [];

  let score = 0;
  const parts = [];

  // ① USD/KRW 환율 방향 (max 25)
  // 원화 강세(달러↓) = 외국인 자금 유입 + 위험자산 선호 = 긍정
  // 원화 약세(달러↑) = 외국인 이탈 압력 + 수입 물가 부담 = 부정
  const krwChg = m.usd_krw_chg ?? null;
  const krwLvl = m.usd_krw     ?? null;
  let krwPts = 12; // 데이터 없을 때 중립
  if (krwChg !== null) {
    const chgPct = krwLvl ? (krwChg / krwLvl) * 100 : 0;
    if      (chgPct < -0.5)  krwPts = 25;  // 원화 강세 0.5% 이상
    else if (chgPct < -0.2)  krwPts = 21;
    else if (chgPct < -0.05) krwPts = 17;
    else if (chgPct <= 0.05) krwPts = 12;  // 보합
    else if (chgPct <= 0.2)  krwPts = 7;
    else if (chgPct <= 0.5)  krwPts = 3;
    else                     krwPts = 0;   // 원화 급약세
  }
  score += krwPts;
  const krwStr = krwChg != null
    ? `${krwChg >= 0 ? '+' : ''}${Number(krwChg).toFixed(0)}원`
    : '—';
  const krwHint = krwChg != null
    ? (krwChg < 0 ? '원화 강세 ▲' : krwChg > 0 ? '원화 약세 ▼' : '보합')
    : '데이터 없음';
  parts.push({ label: `USD/KRW ${krwStr}`, pts: krwPts, max: 25, hint: krwHint });

  // ② 코스피/닥 등락률 (max 25)
  // 당일 등락률은 환율·수급의 결과이나, 시장 참여자 심리를 직접 반영
  const krAvg = ((m.kospi_chg ?? 0) + (m.kosdaq_chg ?? 0)) / 2;
  let krPts;
  if      (krAvg >=  2.0) krPts = 25;
  else if (krAvg >=  1.0) krPts = 21;
  else if (krAvg >=  0.3) krPts = 16;
  else if (krAvg >=  0.0) krPts = 11;
  else if (krAvg >= -0.3) krPts = 7;
  else if (krAvg >= -1.0) krPts = 3;
  else                    krPts = 0;
  score += krPts;
  parts.push({
    label: `코스피/닥 ${krAvg >= 0 ? '+' : ''}${krAvg.toFixed(2)}%`,
    pts: krPts, max: 25, hint: '',
  });

  // ③ 외국인 수급 방향 (max 20)
  // foreign_net_buy 단위: 주(株) — 방향성 지표로 활용
  const frgnTotal = rows.reduce((s, r) => s + (r.foreign_net_buy ?? 0), 0);
  let frgnPts;
  if      (frgnTotal >  500000) frgnPts = 20;
  else if (frgnTotal >  200000) frgnPts = 16;
  else if (frgnTotal >   50000) frgnPts = 12;
  else if (frgnTotal >=      0) frgnPts = 8;
  else if (frgnTotal > -200000) frgnPts = 4;
  else if (frgnTotal > -500000) frgnPts = 1;
  else                          frgnPts = 0;
  score += frgnPts;
  const fStr = (frgnTotal >= 0 ? '+' : '') + frgnTotal.toLocaleString() + '주';
  parts.push({ label: `외국인 ${fStr}`, pts: frgnPts, max: 20, hint: '' });

  // ④ VIX 글로벌 공포지수 (max 15)
  // 미 S&P500 기반 간접지표 — 글로벌 위험선호도 반영
  const vix = m.vix ?? null;
  let vixPts = 7; // 데이터 없을 때 중립
  if (vix !== null) {
    if      (vix <  13) vixPts = 15;
    else if (vix <  16) vixPts = 13;
    else if (vix <  19) vixPts = 10;
    else if (vix <  22) vixPts = 7;
    else if (vix <  25) vixPts = 4;
    else if (vix <  30) vixPts = 2;
    else                vixPts = 0;
  }
  score += vixPts;
  const vixHint = vix != null
    ? (vix < 16 ? '안정 국면' : vix < 22 ? '주의 구간' : '공포 구간')
    : '데이터 없음';
  parts.push({
    label: vix != null ? `VIX ${Number(vix).toFixed(1)}` : 'VIX —',
    pts: vixPts, max: 15, hint: vixHint,
  });

  // ⑤ 미 10년 국채금리 방향 (max 15)
  // 금리 하락 = 유동성 확대 + 성장주 할인율 완화 = 긍정
  // 반도체·IT 비중 높은 코스피 특성상 금리 민감도 높음
  const us10yChg = m.us10y_chg ?? null;
  let ratesPts = 7; // 데이터 없을 때 중립
  if (us10yChg !== null) {
    if      (us10yChg < -0.06) ratesPts = 15;
    else if (us10yChg < -0.02) ratesPts = 12;
    else if (us10yChg <= 0.02) ratesPts = 7;
    else if (us10yChg <= 0.06) ratesPts = 3;
    else                       ratesPts = 0;
  }
  score += ratesPts;
  const ratesStr = us10yChg != null
    ? `${us10yChg >= 0 ? '+' : ''}${Number(us10yChg).toFixed(3)}%`
    : '—';
  const ratesHint = us10yChg != null
    ? (us10yChg < 0 ? '금리 하락 ▼' : us10yChg > 0.02 ? '금리 상승 ▲' : '보합')
    : '데이터 없음';
  parts.push({ label: `미10년금리 ${ratesStr}`, pts: ratesPts, max: 15, hint: ratesHint });

  // ── 등급 결정 (20점 균등 간격) ──────────────────────────────────────────────
  let gradeTxt, gradeColor, gradeEmoji, strategy;

  const krwNeg  = krwChg != null && krwChg > 3;
  const ratePop = us10yChg != null && us10yChg > 0.05;

  if (score >= 80) {
    gradeTxt = '과열 국면'; gradeColor = '#4a9eff'; gradeEmoji = '🔵';
    strategy = '단계적 비중 축소 검토 — 고점 추격 매수 자제. 수익 실현 구간 설정 권고. 신규 진입 시 손절선 엄격히 관리.';
  } else if (score >= 60) {
    gradeTxt = '우호 국면'; gradeColor = '#2dce89'; gradeEmoji = '🟢';
    if (krwNeg)
      strategy = '수급 긍정이나 환율 약세 — 외국인 지속성 확인 필요. 수출주·환헤지 비중 점검.';
    else
      strategy = '매수 우위 환경 — 주도 업종 중심 분할 진입 검토. 모멘텀 종목 비중 확대 가능.';
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
        font-size:9px;color:var(--text3);margin-top:3px;padding:0 1px">
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
