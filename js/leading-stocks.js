/**
 * leading-stocks.js — 주도주 탐색기
 *
 * leading_stocks 테이블(백엔드 일배치 생성)에서 오늘의 주도주 Top 10 렌더링.
 * 데이터 없으면 "백엔드 미실행" 안내 + 어드민 전용 실행 트리거 버튼.
 *
 * 스코어 구성 (합계 100):
 *   price_momentum (max 30) : 5일/20일 수익률 복합 백분위
 *   volume_surge   (max 25) : 당일 거래대금 / 20일 평균 배율 (최대 5배 캡)
 *   foreign_flow   (max 25) : 3일 누적 외국인 순매수 백분위
 *   hgpr_score     (max 20) : 52주 신고가 여부
 *
 * 의존: sb (config.js), chgColor/chgStr/isAdmin (config.js)
 */

let _lsTab = 'all';

// ── 데이터 로드 ────────────────────────────────────────────────────────────────
async function loadLeadingStocks() {
  const el = document.getElementById('ls-body');
  if (!el) return;

  try {
    // 최신 날짜
    const { data: dateRow } = await sb.from('leading_stocks')
      .select('base_date')
      .order('base_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!dateRow) {
      el.innerHTML = _lsEmptyHtml();
      return;
    }

    const { data, error } = await sb.from('leading_stocks')
      .select('stock_code,corp_name,market,industry,total_score,price_momentum,volume_surge,foreign_flow,hgpr_score,price_chg_5d,price_chg_20d,volume_ratio,foreign_3d_sum,market_cap,rank')
      .eq('base_date', dateRow.base_date)
      .order('rank', { ascending: true })
      .limit(50);

    if (error) throw error;

    // 날짜 표시
    const dateEl = document.getElementById('ls-date');
    if (dateEl) dateEl.textContent = dateRow.base_date + ' 기준';

    window._lsAllData = data || [];
    renderLeadingStocks();
  } catch(e) {
    console.error('[LeadingStocks]', e);
    const elE = document.getElementById('ls-body');
    if (elE) elE.innerHTML = `<div style="padding:1rem;text-align:center;color:var(--text3);font-size:12px">조회 실패: ${e.message}</div>`;
  }
}

// ── 탭 전환 ───────────────────────────────────────────────────────────────────
function switchLsTab(tab) {
  _lsTab = tab;
  document.querySelectorAll('[data-ls-tab]').forEach(b =>
    b.classList.toggle('active', b.dataset.lsTab === tab));
  renderLeadingStocks();
}

// ── 렌더링 ────────────────────────────────────────────────────────────────────
function renderLeadingStocks() {
  const el = document.getElementById('ls-body');
  if (!el) return;

  const all = window._lsAllData || [];
  if (!all.length) { el.innerHTML = _lsEmptyHtml(); return; }

  let rows = all;
  if (_lsTab === 'kospi')  rows = all.filter(r => r.market === 'KOSPI');
  if (_lsTab === 'kosdaq') rows = all.filter(r => r.market === 'KOSDAQ');
  rows = rows.slice(0, 10);

  if (!rows.length) {
    el.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--text3);font-size:12px">해당 시장 데이터 없음</div>';
    return;
  }

  el.innerHTML = rows.map((r, i) => {
    const total = r.total_score ?? 0;
    const scoreColor = total >= 75 ? '#2dce89' : total >= 50 ? '#f59e0b' : 'var(--text3)';

    // 스코어 구성 미니 바
    const miniBar = (label, val, max, color) => {
      const pct = Math.round((val || 0) / max * 100);
      return `<div style="display:flex;align-items:center;gap:3px">
        <span style="font-size:9px;color:var(--text3);width:28px;flex-shrink:0">${label}</span>
        <div style="flex:1;height:3px;border-radius:2px;background:rgba(255,255,255,.08);overflow:hidden;min-width:20px">
          <div style="height:100%;width:${pct}%;background:${color};border-radius:2px"></div>
        </div>
        <span style="font-size:9px;color:var(--text3);width:18px;text-align:right;flex-shrink:0">${val || 0}</span>
      </div>`;
    };

    const mktTag = (r.market === 'KOSDAQ' && _lsTab === 'all')
      ? '<span style="font-size:9px;color:var(--text3);margin-left:2px;font-weight:600">Q</span>' : '';
    const indTag = r.industry
      ? `<span style="font-size:10px;color:var(--text3)">${r.industry}</span>` : '';
    const chg5dStr = r.price_chg_5d != null
      ? `<span style="font-size:10px;color:${chgColor(r.price_chg_5d)}">${r.price_chg_5d >= 0 ? '+' : ''}${Number(r.price_chg_5d).toFixed(1)}%</span>`
      : '';
    const volRatio = r.volume_ratio != null && r.volume_ratio > 1.5
      ? `<span style="font-size:9px;color:#f59e0b;padding:1px 4px;border-radius:3px;background:rgba(245,158,11,.1)">거래 ${Number(r.volume_ratio).toFixed(1)}x</span>` : '';
    const frgnTag = r.foreign_3d_sum != null && r.foreign_3d_sum !== 0
      ? (r.foreign_3d_sum > 0
          ? `<span style="font-size:9px;color:var(--tg);padding:1px 4px;border-radius:3px;background:rgba(42,171,238,.1)">외국인↑</span>`
          : `<span style="font-size:9px;color:var(--blue);padding:1px 4px;border-radius:3px;background:rgba(74,158,255,.08)">외국인↓</span>`)
      : '';

    return `
    <div style="display:flex;align-items:flex-start;gap:8px;padding:7px 12px;border-bottom:1px solid var(--border)">
      <!-- 순위 -->
      <div style="min-width:20px;padding-top:3px;flex-shrink:0">
        <span style="font-size:${i < 3 ? '13' : '11'}px;font-weight:700;color:${i < 3 ? scoreColor : 'var(--text3)'}">${r.rank}</span>
      </div>
      <!-- 종목 정보 + 스코어 바 -->
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:4px;margin-bottom:5px;flex-wrap:wrap">
          <span style="font-size:13px;font-weight:600">${r.corp_name || r.stock_code}${mktTag}</span>
          ${chg5dStr}${indTag}${volRatio}${frgnTag}
        </div>
        <div style="display:flex;flex-direction:column;gap:2px">
          ${miniBar('가격', r.price_momentum, 30, '#4a9eff')}
          ${miniBar('거래대금', r.volume_surge, 25, '#f59e0b')}
          ${miniBar('외국인', r.foreign_flow, 25, '#2AABEE')}
          ${miniBar('신고가', r.hgpr_score, 20, '#2dce89')}
        </div>
      </div>
      <!-- 총점 -->
      <div style="text-align:right;flex-shrink:0;padding-top:2px">
        <div style="font-size:18px;font-weight:800;line-height:1;color:${scoreColor};font-variant-numeric:tabular-nums">${total}</div>
        <div style="font-size:9px;color:var(--text3);margin-top:1px">/ 100</div>
      </div>
    </div>`;
  }).join('');
}

// ── 빈 상태 HTML ──────────────────────────────────────────────────────────────
function _lsEmptyHtml() {
  const isAdm = typeof isAdmin === 'function' && isAdmin();
  const adminBtn = isAdm
    ? `<button onclick="triggerLeadingStocks()"
        style="margin-top:8px;font-size:11px;padding:4px 12px;border-radius:5px;
               border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer">
        지금 계산 요청
       </button>`
    : '';
  return `<div style="padding:1.5rem;text-align:center;color:var(--text3);font-size:12px;line-height:1.8">
    백엔드 미실행 — 매일 장 마감 후 자동 생성됩니다<br>
    <span style="font-size:11px;color:var(--text3);opacity:.7">(leading_stocks_generator.py)</span>
    ${adminBtn}
  </div>`;
}

// ── 어드민 전용: 백엔드 트리거 ─────────────────────────────────────────────────
window.triggerLeadingStocks = async function() {
  try {
    await sb.from('app_config').upsert({
      key: 'run_leading_stocks_flag',
      value: String(Date.now()),
      description: '주도주 탐색기 수동 생성 트리거',
    }, { onConflict: 'key' });
    if (typeof toast === 'function') toast('📡 주도주 탐색기 계산 요청 완료', 'info');
  } catch(e) {
    if (typeof toast === 'function') toast('트리거 실패: ' + e.message, 'error');
  }
};
