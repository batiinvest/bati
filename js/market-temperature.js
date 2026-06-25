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
 * ── 배점 구조 (총 100점) — 단일일 노이즈 제거, 추세/레벨 기반 ──────
 *  ① S&P500 5일 추세      15pt  5거래일 누적 (밤사이 단일일 노이즈 제거)
 *  ② USD/KRW 5일추세+레벨 15pt  원화 강세/약세 추세 + 고환율(>1450) 레짐 캡
 *  ③ 코스피/닥 5일 추세   20pt  5거래일 누적 등락률
 *  ④ 외국인 수급 5일 누적 20pt  지속성(누적) — 당일 1회는 반전 잦아 제외
 *  ⑤ VIX 레벨 + 5일 방향  15pt  내재변동성 레벨 + 급등/급락 가감
 *  ⑥ 미 10년 금리 레벨    15pt  금리 레벨(할인율 부담) + 5일 추세
 * ─────────────────────────────────────────────────────────
 * ※ 최종 점수는 전일과 EMA 스무딩(0.7/0.3)으로 휘프소(국면 일별 반전) 억제
 *
 * ── 등급 구간 (20점 균등 간격) ──
 *  🔴 위험   0~19   현금 비중 극대화
 *  🟠 경계  20~39   방어적 포지션 유지
 *  🟡 중립  40~59   선별적 접근
 *  🟢 우호  60~79   적극 탐색 가능
 *  🔵 과열  80~100  단계적 비중 축소 검토
 */

// ── 온도 계산 ─────────────────────────────────────────────────────────────────
function _calcTemperature(prevScore = null, foreign5dEok = null) {
  const m    = window._macroData     || {};
  const rows = window._allMarketRows || [];
  // 5일치 매크로(오래된→최신) — 추세/레벨 계산용 (window._macroRows = 5일치)
  const mr   = (window._macroRows || []).slice().sort((a, b) => (a.base_date > b.base_date ? 1 : -1));
  const n    = mr.length;
  const sumChg = key => mr.reduce((s, r) => s + (r[key] ?? 0), 0);   // 5일 누적 변화

  let score = 0;
  const parts = [];

  // ① S&P500 5일 추세 (max 15) — 단일일 노이즈 제거, 5거래일 누적 등락으로 레짐 판정
  const sp5sum = sumChg('sp500_chg');
  const _spScale = [[4.0,15],[1.5,12],[0.3,9],[-0.3,6],[-1.5,3],[-4.0,1]];
  const sp5Pts = n >= 2 ? (_spScale.find(([t]) => sp5sum >= t)?.[1] ?? 0) : 7;
  score += sp5Pts;
  const sp5Str = n >= 2 ? `${sp5sum >= 0 ? '+' : ''}${sp5sum.toFixed(1)}%` : '—';
  parts.push({ label: `S&P500 5일 ${sp5Str}`, pts: sp5Pts, max: 15,
    hint: n < 2 ? '데이터 없음' : sp5sum >= 0.5 ? '상승 추세' : sp5sum <= -0.5 ? '하락 추세' : '추세 중립' });

  // ② USD/KRW 5일 추세 + 레벨 (max 15) — 하루 변동은 노이즈. 5일 추세(강세/약세) + 고환율 레짐 캡
  const fxLvl = m.usd_krw ?? null;
  const fxOld = n >= 2 ? (mr[0].usd_krw ?? null) : null;
  const fx5pct = (fxLvl && fxOld) ? ((fxLvl - fxOld) / fxOld) * 100 : null;   // +면 5일 약세
  const _fxScale = [[-1.0,15],[-0.4,12],[-0.1,10],[0.1,7],[0.4,4],[1.0,2]];
  let krwPts = fx5pct != null ? (_fxScale.find(([t]) => fx5pct < t)?.[1] ?? 0) : 7;
  if (fxLvl && fxLvl > 1450) krwPts = Math.min(krwPts, 9);   // 고환율(원화 약세) 스트레스 레짐 상한
  score += krwPts;
  const krwStr = fxLvl != null ? `${Math.round(fxLvl)}원` : '—';
  const krwHint = fx5pct == null ? '데이터 없음'
    : (fxLvl > 1450 ? '고환율 부담 · ' : '') + (fx5pct < -0.1 ? '원화 강세 ▲' : fx5pct > 0.1 ? '원화 약세 ▼' : '보합');
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

  // ④ 외국인 수급 — 5일 누적(억원) (max 20)
  // 당일 순매수는 다음날 반전이 흔해 노이즈 → 5거래일 누적(지속성)으로 판정.
  // foreign5dEok(sector_daily_summary 합산) 없으면 당일 합산(_allMarketRows)으로 폴백.
  let frgnAmt, frgnPts;
  if (foreign5dEok != null) {
    frgnAmt = foreign5dEok;
    const _f5 = [[30000,20],[10000,16],[3000,12],[0,8],[-10000,4],[-30000,1]];
    frgnPts = _f5.find(([t]) => frgnAmt > t)?.[1] ?? 0;
  } else {
    frgnAmt = rows.reduce((s, r) => s + ((r.foreign_net_buy ?? 0) * (r.price ?? 0)) / 1e8, 0);
    const _f1 = [[500,20],[200,16],[50,12],[0,8],[-200,4],[-500,1]];
    frgnPts = _f1.find(([t]) => frgnAmt > t)?.[1] ?? 0;
  }
  score += frgnPts;
  const _fAbs = Math.abs(frgnAmt);
  const frgnAbsStr = _fAbs >= 10000 ? (_fAbs / 10000).toFixed(1) + '조' : Math.round(_fAbs).toLocaleString() + '억';
  const fStr = (frgnAmt >= 0 ? '+' : '-') + frgnAbsStr;
  const frgnHint = (foreign5dEok != null ? '5일 누적 · ' : '당일 · ') +
    (frgnPts >= 16 ? '강한 매수' : frgnPts >= 12 ? '매수 우위' : frgnPts >= 8 ? '보합' : frgnPts >= 4 ? '매도 우위' : '강한 매도');
  parts.push({ label: `외국인 ${fStr}`, pts: frgnPts, max: 20, hint: frgnHint });

  // ⑤ VIX 글로벌 공포지수 (max 15)
  // 미 S&P500 기반 간접지표 — 글로벌 위험선호도 반영
  // 임계값: 2023~2026 실제 VIX 분포 반영 (평균 15~20, 역대 저점 10~12)
  // 레벨은 내재변동성(상태변수)이라 단일 시점도 유효 → 레벨 점수 + 5일 급등/급락만 보조 가감.
  const vix = m.vix ?? null;
  const _vixScale = [[15,15],[18,12],[21,9],[24,6],[28,3],[35,1]];
  let vixPts = vix !== null ? (_vixScale.find(([t]) => vix < t)?.[1] ?? 0) : 7;
  const vixOld = n >= 2 ? (mr[0].vix ?? null) : null;
  let vixDir = '';
  if (vix != null && vixOld != null) {
    if (vix > vixOld + 2)      { vixPts = Math.max(0, vixPts - 2);  vixDir = ' · 5일 급등 ▲'; }
    else if (vix < vixOld - 2) { vixPts = Math.min(15, vixPts + 2); vixDir = ' · 5일 급락 ▼'; }
  }
  score += vixPts;
  const vixHint = (vix != null
    ? (vix < 18 ? '안정 국면' : vix < 24 ? '주의 구간' : '공포 구간')
    : '데이터 없음') + vixDir;
  parts.push({ label: vix != null ? `VIX ${Number(vix).toFixed(1)}` : 'VIX —', pts: vixPts, max: 15, hint: vixHint });

  // ⑥ 미 10년 국채금리 방향 (max 15)
  // 금리 하락 = 유동성 확대 + 성장주 할인율 완화 = 긍정
  // 반도체·IT 비중 높은 코스피 특성상 금리 민감도 높음
  // 하루 bp 변동은 노이즈 → 금리 '레벨'(할인율 부담) 기준 + 5일 추세 가감.
  const y10 = m.us10y ?? null;
  const _yLvl = [[3.5,15],[4.0,12],[4.3,9],[4.6,6],[5.0,3]];   // y < t (낮을수록 우호)
  let ratesPts = y10 != null ? (_yLvl.find(([t]) => y10 < t)?.[1] ?? 1) : 7;
  const yOld = n >= 2 ? (mr[0].us10y ?? null) : null;
  let yDir = '';
  if (y10 != null && yOld != null) {
    const d = y10 - yOld;
    if (d > 0.1)       { ratesPts = Math.max(0, ratesPts - 3);  yDir = ' · 5일 상승 ▲'; }
    else if (d < -0.1) { ratesPts = Math.min(15, ratesPts + 3); yDir = ' · 5일 하락 ▼'; }
  }
  score += ratesPts;
  const ratesStr = y10 != null ? `${Number(y10).toFixed(2)}%` : '—';
  const ratesHint = (y10 != null
    ? (y10 < 4.0 ? '완화적' : y10 < 4.6 ? '부담 구간' : '고금리 역풍')
    : '데이터 없음') + yDir;
  parts.push({ label: `미10년금리 ${ratesStr}`, pts: ratesPts, max: 15, hint: ratesHint });

  // ── 휘프소(whipsaw) 억제: 전일 점수와 EMA 스무딩 (단일일 노이즈로 국면이 매일 뒤집히는 것 방지) ──
  if (prevScore != null && !isNaN(prevScore)) score = Math.round(0.7 * score + 0.3 * prevScore);

  // ── 등급 결정 (20점 균등 간격) ──────────────────────────────────────────────
  let gradeTxt, gradeColor, gradeEmoji, strategy;

  const krwNeg  = fx5pct != null && fx5pct > 0.5;                          // 5일 원화 약세
  const ratePop = (y10 != null && yOld != null) && (y10 - yOld) > 0.1;     // 5일 금리 급등
  const spDrop  = m.sp500_chg != null && m.sp500_chg < -1.5;              // 밤사이 미국 급락(오늘 갭다운 우려)

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

// ── 5일 누적 외국인 수급(억원) — sector_daily_summary.foreign_net_5d 산업 합산 ──
async function _loadForeign5dFlow() {
  try {
    const { data: latest } = await sb.from('sector_daily_summary')
      .select('base_date').order('base_date', { ascending: false }).limit(1).maybeSingle();
    if (!latest?.base_date) return null;
    const { data } = await sb.from('sector_daily_summary')
      .select('foreign_net_5d').eq('base_date', latest.base_date);
    if (!data || !data.length) return null;
    const sumMil = data.reduce((s, r) => s + (r.foreign_net_5d || 0), 0);   // 백만원
    return sumMil / 100;   // 억원
  } catch (e) {
    console.warn('[온도계] 5일 수급 조회 실패:', e);
    return null;
  }
}


// ── 렌더링 ────────────────────────────────────────────────────────────────────
async function renderMarketTemperature() {
  const el = document.getElementById('market-temp-body');
  if (!el) return;

  const m       = window._macroData || {};
  const today   = m.base_date || new Date().toISOString().slice(0, 10);

  // 전일 점수(스무딩용) + 5일 누적 외국인 수급 선행 로드
  const [prev, foreign5d] = await Promise.all([
    _loadPrevTempScore(today),
    _loadForeign5dFlow(),
  ]);
  const t = _calcTemperature(prev ? prev.score : null, foreign5d);
  await _saveTempScore(today, t.score);

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
