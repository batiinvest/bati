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
 *  ① S&P500 방향         15pt  코스피 최대 선행지표 (상관계수 ~0.7)
 *  ② USD/KRW 환율 방향   15pt  외국인 자금 유입 채널 (수출주 역효과 감안 하향)
 *  ③ 코스피/닥 5일 추세  20pt  단기 추세 (5거래일 누적 등락률)
 *  ④ 외국인 수급 방향    20pt  매수 주체 확인 (금액 기준 억원)
 *  ⑤ VIX 글로벌 공포지수 15pt  간접 글로벌 리스크
 *  ⑥ 미 10년 금리 방향   15pt  성장주 할인율 직결
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

  // ① S&P500 방향 (max 15) — 코스피 최대 선행지표, 상관계수 ~0.7
  const sp5Chg = m.sp500_chg ?? null;
  const _sp5Scale = [[2.0,15],[1.0,12],[0.3,9],[-0.3,6],[-1.0,3]];
  const sp5Pts = sp5Chg !== null
    ? (_sp5Scale.find(([t]) => sp5Chg >= t)?.[1] ?? 0)
    : 7; // 데이터 없을 때 중립
  score += sp5Pts;
  const sp5Str = sp5Chg != null
    ? `${sp5Chg >= 0 ? '+' : ''}${Number(sp5Chg).toFixed(2)}%`
    : '—';
  parts.push({ label: `S&P500 ${sp5Str}`, pts: sp5Pts, max: 15,
    hint: sp5Chg != null ? (sp5Chg >= 0.3 ? '코스피 매수 유리' : sp5Chg <= -0.3 ? '코스피 매도 압력' : '보합') : '데이터 없음' });

  // ② USD/KRW 환율 방향 (max 15) — 수출주 역효과 감안해 25→15pt
  // 원화 강세(달러↓) = 외국인 자금 유입 선호 / 원화 약세 = 이탈 압력
  const krwChg = m.usd_krw_chg ?? null;
  const krwLvl = m.usd_krw     ?? null;
  let krwPts = 7; // 데이터 없을 때 중립
  if (krwChg !== null) {
    const chgPct = krwLvl ? (krwChg / krwLvl) * 100 : 0;
    const _krwScale = [[-0.5,15],[-0.2,12],[-0.05,10],[0.05,7],[0.2,4],[0.5,2]];
    krwPts = _krwScale.find(([t]) => chgPct < t)?.[1] ?? 0;
  }
  score += krwPts;
  const krwStr = krwChg != null
    ? `${krwChg >= 0 ? '+' : ''}${Number(krwChg).toFixed(0)}원`
    : '—';
  const krwHint = krwChg != null
    ? (krwChg < 0 ? '원화 강세 ▲' : krwChg > 0 ? '원화 약세 ▼' : '보합')
    : '데이터 없음';
  parts.push({ label: `USD/KRW ${krwStr}`, pts: krwPts, max: 15, hint: krwHint });

  // ③ 코스피/닥 5일 추세 (max 20)
  // 당일 등락만 반영하면 결과를 점수로 재포장하는 동어반복이 됨.
  // 최근 5 거래일 누적 등락률로 단기 추세를 평가한다.
  // 데이터가 1건뿐이면 당일 등락으로 fallback.
  const _krRows = window._macroRows || [];
  const kr5dSum = _krRows.reduce((s, r) =>
    s + (((r.kospi_chg ?? 0) + (r.kosdaq_chg ?? 0)) / 2), 0);
  // 임계값: 5일 누적 기준 (max 20pt로 조정)
  const _krScale = [[5.0,20],[2.5,17],[0.5,13],[-0.5,9],[-2.5,5],[-5.0,2]];
  // 데이터 없으면 중립 10pt (다른 지표의 null 중립 비율 ~47% 기준)
  const krPts = _krRows.length === 0 ? 10 : (_krScale.find(([t]) => kr5dSum >= t)?.[1] ?? 0);
  score += krPts;
  const kr5dLabel = _krRows.length >= 2 ? '5일' : _krRows.length === 1 ? '당일' : '—';
  const krHint = _krRows.length === 0
    ? '데이터 없음'
    : kr5dSum >= 0.5 ? '단기 추세 상승'
    : kr5dSum <= -0.5 ? '단기 추세 하락'
    : '추세 중립';
  parts.push({
    label: `코스피/닥 ${kr5dLabel} ${_krRows.length > 0 ? (kr5dSum >= 0 ? '+' : '') + kr5dSum.toFixed(2) + '%' : '—'}`,
    pts: krPts, max: 20,
    hint: krHint,
  });

  // ④ 외국인 수급 방향 (max 20)
  // 금액(억원) 기준 — 주(株) 단위는 저가주·고가주 가중치 왜곡 발생
  const frgnAmt = rows.reduce((s, r) =>
    s + ((r.foreign_net_buy ?? 0) * (r.price ?? 0)) / 1e8, 0);
  // 임계값: 억원 기준 (500억, 200억, 50억, 보합, -200억, -500억)
  const _frgnScale = [[500,20],[200,16],[50,12],[0,8],[-200,4],[-500,1]];
  const frgnPts = _frgnScale.find(([t]) => frgnAmt > t)?.[1] ?? 0;
  score += frgnPts;
  const frgnAbsStr = Math.abs(frgnAmt) >= 1000
    ? (frgnAmt / 1000).toFixed(1) + '천억'
    : Math.round(frgnAmt).toLocaleString() + '억';
  const fStr = (frgnAmt >= 0 ? '+' : '-') + frgnAbsStr;
  const frgnHint = frgnAmt >= 500 ? '강한 매수세'
    : frgnAmt >= 50  ? '매수 우위'
    : frgnAmt >= -50 ? '보합'
    : frgnAmt >= -200 ? '매도 우위'
    : '강한 매도세';
  parts.push({ label: `외국인 ${fStr}`, pts: frgnPts, max: 20, hint: frgnHint });

  // ⑤ VIX 글로벌 공포지수 (max 15)
  // 미 S&P500 기반 간접지표 — 글로벌 위험선호도 반영
  // 임계값: 2023~2026 실제 VIX 분포 반영 (평균 15~20, 역대 저점 10~12)
  const vix = m.vix ?? null;
  const _vixScale = [[15,15],[18,12],[21,9],[24,6],[28,3],[35,1]];
  const vixPts = vix !== null
    ? (_vixScale.find(([t]) => vix < t)?.[1] ?? 0)
    : 7; // 데이터 없을 때 중립
  score += vixPts;
  const vixHint = vix != null
    ? (vix < 18 ? '안정 국면' : vix < 24 ? '주의 구간' : '공포 구간')
    : '데이터 없음';
  parts.push({
    label: vix != null ? `VIX ${Number(vix).toFixed(1)}` : 'VIX —',
    pts: vixPts, max: 15, hint: vixHint,
  });

  // ⑥ 미 10년 국채금리 방향 (max 15)
  // 금리 하락 = 유동성 확대 + 성장주 할인율 완화 = 긍정
  // 반도체·IT 비중 높은 코스피 특성상 금리 민감도 높음
  const us10yChg = m.us10y_chg ?? null;
  const _ratesScale = [[-0.06,15],[-0.02,12],[0.02,7],[0.06,3]];
  const ratesPts = us10yChg !== null
    ? (_ratesScale.find(([t]) => us10yChg < t)?.[1] ?? 0)
    : 7; // 데이터 없을 때 중립
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
  const spDrop  = sp5Chg != null && sp5Chg < -1.5; // S&P 급락 플래그

  if (score >= 80) {
    gradeTxt = '과열 국면'; gradeColor = '#a78bfa'; gradeEmoji = '🟣';
    strategy = '단계적 비중 축소 — 신고가 추격 매수 자제. 보유 종목 목표가 도달 시 1/3씩 수익 실현. 손절선은 매입가 -5% 이내로 엄격히 관리.';
  } else if (score >= 60) {
    gradeTxt = '우호 국면'; gradeColor = '#2dce89'; gradeEmoji = '🟢';
    if (krwNeg)
      strategy = '수급 긍정이나 환율 약세 주의 — 외국인 순매수 지속성 확인 필요. 수출주 비중 점검, 내수·방어주 우선 대응.';
    else
      strategy = '매수 우위 환경 — 외국인 순매수 상위 섹터 중심 1/3씩 분할 진입. 추세 추종 전략 유효, 손절선 설정 후 비중 확대.';
  } else if (score >= 40) {
    gradeTxt = '중립 국면'; gradeColor = '#f59e0b'; gradeEmoji = '🟡';
    if (spDrop)
      strategy = '미국 급락 후 국면 — 코스피 갭다운 가능성. 장 초반 15분 매도 압력 확인 후 진입 판단. 반등 시 단기 매도 우선.';
    else if (ratePop)
      strategy = '금리 상승 압력 주의 — 고PER 성장·바이오주 비중 축소 검토. 은행·에너지·배당주로 방어 분산.';
    else
      strategy = '선별 접근 — 외국인·기관 동시 순매수 섹터만 소량 진입. 시장 방향성 확인 전 신규 포지션 자제, 기존 보유 유지.';
  } else if (score >= 20) {
    gradeTxt = '경계 국면'; gradeColor = '#fb6340'; gradeEmoji = '🟠';
    strategy = '방어적 포지션 — 현금 비중 50% 이상 유지. VIX 하락 + 외국인 순매수 전환 확인 시 소량 타진. 낙폭 과대 대형주 단기 반등 관찰.';
  } else {
    gradeTxt = '위험 국면'; gradeColor = '#f5365c'; gradeEmoji = '🔴';
    strategy = '현금 비중 극대화 — 신규 진입 전면 자제. 기존 포지션 손절 기준 재점검 후 실행. VIX 30 이상·외국인 연속 매수 전환 시 역발상 진입 준비.';
  }

  return { score, gradeTxt, gradeColor, gradeEmoji, parts, strategy };
}


// ── 점수 저장 / 조회 (app_config) ───────────────────────────────────────────
async function _saveTempScore(dateStr, score) {
  try {
    await sb.from('app_config')
      .upsert({ key: `market_temp_${dateStr}`, value: String(score) }, { onConflict: 'key' });
  } catch (e) {
    console.warn('[온도계] 점수 저장 실패:', e);
  }
}

async function _loadPrevTempScore(dateStr) {
  // dateStr 기준 직전 영업일 점수 조회 (최근 7일 내 가장 최신 키)
  try {
    const { data } = await sb.from('app_config')
      .select('key,value')
      .like('key', 'market_temp_%')
      .lt('key', `market_temp_${dateStr}`)
      .order('key', { ascending: false })
      .limit(1);
    if (data && data.length > 0) {
      const val = parseInt(data[0].value, 10);
      const prevDate = data[0].key.replace('market_temp_', '');
      return isNaN(val) ? null : { score: val, date: prevDate };
    }
  } catch (e) {
    console.warn('[온도계] 이전 점수 조회 실패:', e);
  }
  return null;
}


// ── 렌더링 ────────────────────────────────────────────────────────────────────
async function renderMarketTemperature() {
  const el = document.getElementById('market-temp-body');
  if (!el) return;

  const t       = _calcTemperature();
  const m       = window._macroData || {};
  const today   = m.base_date || new Date().toISOString().slice(0, 10);

  // 오늘 점수 저장 + 전일 점수 조회 (병렬)
  const [, prev] = await Promise.all([
    _saveTempScore(today, t.score),
    _loadPrevTempScore(today),
  ]);

  // 전일 대비 변화 뱃지
  let diffBadge = '';
  if (prev !== null) {
    const diff     = t.score - prev.score;
    const diffAbs  = Math.abs(diff);
    const diffSign = diff > 0 ? '▲' : diff < 0 ? '▼' : '─';
    // 색상: 과열·우호(≥60) 구간에서 상승은 위험 심화 → 빨강, 하락은 냉각 → 초록
    // 경계·위험(<40) 구간에서 상승은 회복 → 초록, 하락은 악화 → 빨강
    // 중립(40~59): 상승 = 긍정(초록)
    let diffColor;
    if (diff === 0) {
      diffColor = 'var(--text3)';
    } else if (t.score >= 60) {
      diffColor = diff > 0 ? 'var(--red)' : 'var(--tg)';
    } else if (t.score < 40) {
      diffColor = diff > 0 ? 'var(--tg)' : 'var(--red)';
    } else {
      diffColor = diff > 0 ? 'var(--tg)' : 'var(--red)';
    }
    const diffStr  = diff === 0 ? '전일 동일' : `전일比 ${diffSign} ${diffAbs}`;
    diffBadge = `<span style="font-size:11px;font-weight:600;color:${diffColor};
      margin-left:6px">${diffStr}</span>
      <span style="font-size:10px;color:var(--text2);margin-left:4px">(전일 ${prev.score}점)</span>`;
  }

  // ── A. 환경(Regime) + 통합 행동지침 → #market-temp-body ──
  el.innerHTML = `
  <div style="display:flex;align-items:center;gap:16px;margin-bottom:10px">

    <!-- 숫자 스코어 -->
    <div style="text-align:center;min-width:54px;flex-shrink:0">
      <div style="font-size:36px;font-weight:800;line-height:1;color:${t.gradeColor};
        font-variant-numeric:tabular-nums">${t.score}</div>
      <div style="font-size:10px;color:var(--text2);margin-top:2px">/ 100</div>
    </div>

    <!-- 게이지 + 등급 -->
    <div style="flex:1">
      <div style="font-size:14px;font-weight:700;color:${t.gradeColor};
        margin-bottom:4px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        ${t.gradeEmoji} ${t.gradeTxt}
        ${diffBadge}
      </div>
      <!-- 포인터 마커 -->
      <div style="position:relative;height:7px;margin-bottom:2px">
        <div style="position:absolute;left:${t.score}%;transform:translateX(-50%);
          width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;
          border-top:6px solid ${t.gradeColor}"></div>
      </div>
      <div class="temp-gauge-bar">
        <!-- 구간별 그라데이션 바 (위험→경계→중립→우호→과열) -->
        <div class="temp-gauge-fill" style="width:${t.score}%;
          background:linear-gradient(90deg,#f5365c 0%,#fb6340 20%,#f59e0b 40%,#2dce89 60%,#a78bfa 80%,#a78bfa 100%);
          opacity:0.9"></div>
        ${[20, 40, 60, 80].map(v =>
          `<div style="position:absolute;left:${v}%;top:0;bottom:0;
            width:1px;background:rgba(0,0,0,.4);z-index:1"></div>`
        ).join('')}
      </div>
      <div style="display:flex;justify-content:space-between;
        font-size:9px;color:var(--text2);margin-top:3px;padding:0 1px">
        <span>위험</span><span>경계</span><span>중립</span><span>우호</span><span>과열</span>
      </div>
    </div>
  </div>

  <!-- 통합 행동지침 (레짐 단일 소스 = 온도계 점수/국면) -->
  <div style="font-size:11.5px;color:var(--text1);
    padding:8px 11px;background:var(--bg3);border-radius:5px;
    border-left:2px solid ${t.gradeColor};line-height:1.6">
    <span style="color:${t.gradeColor};font-weight:700">행동지침 · </span>${t.strategy}
  </div>`;

  // ── C. 근거(Evidence) 6지표 → #mj-evidence (기본 접힘) ──
  const ev = document.getElementById('mj-evidence');
  if (ev) {
    const factors = t.parts.map(p => {
      const pct      = Math.round(p.pts / p.max * 100);
      // 바 색상: 빨강/초록 사용 금지 (시장 상승/하락 색상과 충돌)
      const barColor = pct >= 70 ? '#2AABEE' : pct >= 40 ? '#f59e0b' : '#64748b';
      return `
      <div class="temp-detail-row">
        <span style="min-width:140px;color:var(--text1);font-size:11px">${p.label}${p.hint ? ` <span style="color:var(--text2);font-size:10px">${p.hint}</span>` : ''}</span>
        <div class="temp-detail-bar">
          <div class="temp-detail-fill" style="width:${pct}%;background:${barColor}"></div>
        </div>
        <span style="min-width:34px;text-align:right;font-size:11px;font-weight:600;color:var(--text1)">${p.pts}<span style="color:var(--text2);font-weight:400">/${p.max}</span></span>
      </div>`;
    }).join('');
    ev.innerHTML = `
      <div onclick="toggleMjEvidence()" style="cursor:pointer;display:flex;align-items:center;gap:8px;padding:8px 1rem;font-size:11px;color:var(--text2)"
        onmouseover="this.style.background='rgba(255,255,255,.02)'" onmouseout="this.style.background=''">
        <span style="font-weight:600">판단 근거</span>
        <span style="font-size:10px">S&amp;P·환율·5일추세·수급·VIX·금리 6지표 (점수 산출 기준)</span>
        <span id="mj-ev-toggle" style="margin-left:auto;font-size:10px">펼치기 ▾</span>
      </div>
      <div id="mj-ev-body" style="display:none;padding:2px 1rem 10px">
        <div style="display:flex;flex-direction:column;gap:5px">${factors}</div>
      </div>`;
  }

  // 날짜 표시
  const dateEl = document.getElementById('market-temp-date');
  if (dateEl) dateEl.textContent = today ? `${today} 기준` : '';
}

// ── 근거(6지표) 접기/펼치기 ─────────────────────────────────────────────────
function toggleMjEvidence() {
  const body = document.getElementById('mj-ev-body');
  const tog  = document.getElementById('mj-ev-toggle');
  if (!body) return;
  const open = body.style.display === 'none';
  body.style.display = open ? 'block' : 'none';
  if (tog) tog.textContent = open ? '접기 ▴' : '펼치기 ▾';
}
