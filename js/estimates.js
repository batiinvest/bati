// estimates.js — '오늘의 아이디어 > 전망' 탭: 미래 실적 추정치 (KIS 리서치 연간 추정)
// 데이터: estimate_revisions(추정치 상향 감지 이력) + consensus_estimates(최신 추정 스냅샷)
//   백엔드 collect_estimates.py가 매일 18:40 수집. 커버리지는 모니터링 종목 중 애널리스트
//   커버 종목만(약 91/312) — 소형주는 추정치 자체가 없다.
// 의존: config.js (sb, chgColor), financials.js (openMarketDetail)

// 금액(억원) → '3.3조' / '4,360억'
function _estWon(v) {
  if (v == null) return '-';
  return Math.abs(v) >= 1e4 ? (v / 1e4).toFixed(1) + '조' : Math.round(v).toLocaleString() + '억';
}

// +12.3% (한국식: 양수=빨강)
function _estPct(v) {
  if (v == null) return '<span style="color:var(--text2)">-</span>';
  const s = (v > 0 ? '+' : '') + v.toFixed(1) + '%';
  return `<span style="color:${chgColor(v)};font-weight:700">${s}</span>`;
}

// '2026.12' → "'26E"
function _estYearChip(period) {
  return `'${String(period).slice(2, 4)}E`;
}

async function loadEstimateOutlook() {
  const el = document.getElementById('idea-outlook-body');
  if (!el) return;

  try {
    const cutoff = new Date(Date.now() - 60 * 86400e3).toISOString().slice(0, 10);
    const [revRes, estRes] = await Promise.all([
      sb.from('estimate_revisions')
        .select('stock_code,stock_name,fiscal_period,new_est_date,revenue_change_pct,op_profit_change_pct')
        .gte('new_est_date', cutoff)
        .order('new_est_date', { ascending: false })
        .limit(300),
      sb.from('consensus_estimates')
        .select('stock_code,stock_name,fiscal_period,est_date,revenue,revenue_yoy,op_profit,op_profit_yoy')
        .eq('is_estimate', true)
        .order('est_date', { ascending: false })
        .limit(1000),
    ]);
    if (revRes.error) throw revRes.error;
    if (estRes.error) throw estRes.error;
    renderEstimateOutlook(revRes.data || [], estRes.data || []);
  } catch (e) {
    console.warn('[전망] 추정치 로드 실패', e);
    el.innerHTML = `<div style="padding:1.5rem;text-align:center;color:var(--text2);font-size:12px">
      추정치 데이터 없음 — 백엔드 수집(매일 18:40) 후 표시됩니다</div>`;
  }
}

function renderEstimateOutlook(revisions, estimates) {
  const el = document.getElementById('idea-outlook-body');
  if (!el) return;

  const sectionHdr = (t, sub) => `
    <div style="padding:6px 12px 4px;font-size:11px;font-weight:700;color:var(--text2);display:flex;gap:6px;align-items:baseline">
      ${t}<span style="font-weight:400;font-size:10px">${sub}</span>
    </div>`;

  // ── ① 추정치 상향 — 종목당 최신 갱신 1건 (상향된 것만), 상향폭 큰 순 ──
  const upByStock = {};
  revisions.forEach(r => {
    const up = (r.op_profit_change_pct ?? 0) > 0 || (r.revenue_change_pct ?? 0) > 0;
    if (!up) return;
    const cur = upByStock[r.stock_code];
    // 같은 종목이면 최신 est_date > 가까운 연도 우선
    if (!cur || r.new_est_date > cur.new_est_date ||
        (r.new_est_date === cur.new_est_date && r.fiscal_period < cur.fiscal_period)) {
      upByStock[r.stock_code] = r;
    }
  });
  const upRows = Object.values(upByStock)
    .sort((a, b) => Math.max(b.op_profit_change_pct ?? -1e9, b.revenue_change_pct ?? -1e9)
                  - Math.max(a.op_profit_change_pct ?? -1e9, a.revenue_change_pct ?? -1e9))
    .slice(0, 12);

  const upHtml = upRows.length ? upRows.map(r => {
    const safeName = (r.stock_name || r.stock_code).replace(/'/g, "\\'");
    return `
    <div onclick="openMarketDetail('${r.stock_code}','${safeName}')"
      style="display:flex;align-items:center;gap:8px;padding:6px 12px;border-bottom:1px solid var(--border);cursor:pointer"
      onmouseover="this.style.background='rgba(255,255,255,.03)'" onmouseout="this.style.background=''">
      <span style="flex:1;font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.stock_name || r.stock_code}
        <span style="font-size:9px;color:var(--text2);font-weight:600;margin-left:3px">${_estYearChip(r.fiscal_period)}</span></span>
      <span style="font-size:11px;white-space:nowrap">매출 ${_estPct(r.revenue_change_pct)}</span>
      <span style="font-size:11px;white-space:nowrap">영업익 ${_estPct(r.op_profit_change_pct)}</span>
      <span style="font-size:9px;color:var(--text2);white-space:nowrap">${String(r.new_est_date).slice(5)}</span>
    </div>`;
  }).join('')
  : `<div style="padding:.8rem 12px;color:var(--text2);font-size:11px">
       최근 60일 내 감지된 상향 조정 없음 — 애널리스트가 추정치를 올리면 자동 표시됩니다</div>`;

  // ── ② 고성장 전망 — 종목별 최신 추정(est_date 최대) 중 가장 가까운 미래 연도 ──
  const growByStock = {};
  estimates.forEach(r => {
    const cur = growByStock[r.stock_code];
    if (!cur || r.est_date > cur.est_date ||
        (r.est_date === cur.est_date && r.fiscal_period < cur.fiscal_period)) {
      growByStock[r.stock_code] = r;
    }
  });
  const growRows = Object.values(growByStock)
    .filter(r => r.revenue_yoy != null)
    .sort((a, b) => b.revenue_yoy - a.revenue_yoy)
    .slice(0, 12);

  const growHtml = growRows.length ? growRows.map((r, i) => {
    const safeName = (r.stock_name || r.stock_code).replace(/'/g, "\\'");
    return `
    <div onclick="openMarketDetail('${r.stock_code}','${safeName}')"
      style="display:flex;align-items:center;gap:8px;padding:6px 12px;border-bottom:1px solid var(--border);cursor:pointer"
      onmouseover="this.style.background='rgba(255,255,255,.03)'" onmouseout="this.style.background=''">
      <span style="width:16px;font-size:11px;color:var(--text2);font-weight:600;flex-shrink:0">${i + 1}</span>
      <span style="flex:1;font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.stock_name || r.stock_code}
        <span style="font-size:9px;color:var(--text2);font-weight:600;margin-left:3px">${_estYearChip(r.fiscal_period)}</span></span>
      <span style="font-size:10px;color:var(--text2);white-space:nowrap">매출 ${_estWon(r.revenue)}</span>
      <span style="font-size:11px;white-space:nowrap">${_estPct(r.revenue_yoy)}</span>
      <span style="font-size:11px;white-space:nowrap">영업익 ${_estPct(r.op_profit_yoy)}</span>
    </div>`;
  }).join('')
  : `<div style="padding:.8rem 12px;color:var(--text2);font-size:11px">추정치 데이터 수집 대기 중</div>`;

  el.innerHTML =
    sectionHdr('📈 추정치 상향', '최근 60일 · 상향폭 순 · 클릭→상세') + upHtml +
    sectionHdr('🚀 고성장 전망', '내년 매출 증가율 순 (연간 추정)') + growHtml;
}
