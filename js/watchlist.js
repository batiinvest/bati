// 투자노트 — 메인 테이블·필터·요약 카드·인라인 편집
// 분할: watchlist-trades.js(거래·복기), watchlist-drawer.js(드로어), watchlist-form.js(검색·모달폼)

// 페이지 상태 네임스페이스 — 구 window._wl* 수렴 (group·sort·actionFilter·pipeFilter·drawerCode·cache·shares·prefill·benchCache·tradeType·journalSnap)
const WL = {};

// =============================================
//  관심종목 (Watchlist) 페이지
// =============================================

function pWatchlist() {
  return `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:8px">
    <div style="display:flex;gap:6px;align-items:center">
      <button class="chip active" data-group="all"      onclick="setWlGroup(this,'all')">전체</button>
      <button class="chip"        data-group="보유중"    onclick="setWlGroup(this,'보유중')">보유중</button>
      <button class="chip"        data-group="pipeline"  onclick="setWlGroup(this,'pipeline')">파이프라인</button>
      <button class="chip"        data-group="청산"      onclick="setWlGroup(this,'청산')">청산</button>
      <span id="wl-count" style="font-size:12px;color:var(--text2);margin-left:4px"></span>
    </div>
    <button class="btn btn-primary" onclick="openWatchlistModal(null)">+ 종목 추가</button>
  </div>
  <div id="wl-today" style="margin-bottom:.75rem"></div>
  <div id="wl-summary" style="margin-bottom:.75rem"></div>
  <div id="wl-list"></div>`;
}

function setWlGroup(el, group) {
  document.querySelectorAll('.chip[data-group]').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  WL.group = group;
  WL.actionFilter = null; // 탭 전환 시 액션 필터 초기화
  WL.pipeFilter   = null; // 파이프라인 하위 필터(관심/후보) 초기화
  loadWatchlist();
}

// 파이프라인 탭 하위 필터 (관심 / 후보) — 같은 칩 재클릭 시 해제
function wlSetPipeFilter(cat) {
  WL.pipeFilter = (WL.pipeFilter === cat) ? null : cat;
  loadWatchlist();
}

// '오늘의 액션' 필터 토글 (손절 도달 / 매수구간 / 점검 임박) — 같은 칩 재클릭 시 해제
function wlSetActionFilter(type) {
  WL.actionFilter = (WL.actionFilter === type) ? null : type;
  loadWatchlist();
}

// 벤치마크(코스피/코스닥) 기간 수익률 — macro_data 시계열에서 계산 (세션 캐시)
async function fetchBenchmarkReturns() {
  if (WL.benchCache) return WL.benchCache;
  try {
    const { data } = await sb.from('macro_data')
      .select('base_date,kospi,kosdaq')
      .order('base_date', { ascending: false })
      .limit(130);
    if (!data || !data.length) return null;
    const latest = data[0];
    // base_date <= (latest - days) 중 가장 최근 행 (data는 내림차순)
    const pickPast = (days) => {
      const t = new Date(latest.base_date); t.setDate(t.getDate() - days);
      for (const r of data) { if (new Date(r.base_date) <= t) return r; }
      return data[data.length - 1];
    };
    const ret = (cur, past) => (cur != null && past != null && past != 0) ? (cur - past) / past * 100 : null;
    const mk = (idx) => {
      const w = pickPast(7), m = pickPast(30), q = pickPast(90);
      return { w: ret(latest[idx], w[idx]), m: ret(latest[idx], m[idx]), q: ret(latest[idx], q[idx]) };
    };
    const result = { kospi: mk('kospi'), kosdaq: mk('kosdaq'), baseDate: latest.base_date };
    WL.benchCache = result;
    return result;
  } catch (e) { return null; }
}

async function loadWatchlist() {
  const group = WL.group || 'all';
  const listEl = document.getElementById('wl-list');
  if (!listEl) return;
  listEl.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text2)"><span class="loading"></span></div>';

  // 전체 행을 불러온 뒤 거래내역 기반으로 '청산' 여부를 파생 (탭 필터는 effPos 계산 후 JS에서)
  const { data: allRows, error } = await sb.from('watchlist').select('*').order('created_at', { ascending: false });
  if (error) { listEl.innerHTML = '<div style="color:var(--red);padding:1rem">로드 실패</div>'; return; }

  // 현재가 일괄 조회 — 최근 3주 범위 + 전량 페이징
  // (기간 무제한 + 기본 limit 1000은 종목 수가 늘면 뒤쪽 종목 현재가가 조용히 잘림)
  const codes = (allRows || []).map(r => r.stock_code);
  let priceMap = {};
  if (codes.length) {
    try {
      const mkt = await fetchAllPages(
        sb.from('market_data')
          .select('stock_code,price,price_change_rate,per,pbr,market_cap,market,week_return,month_return,quarter_return')
          .in('stock_code', codes)
          .gte('base_date', offsetDate(-21))
          .order('base_date', { ascending: false })
          .order('stock_code')   // 페이지 경계 결정성 확보
      );
      (mkt || []).forEach(r => { if (!priceMap[r.stock_code]) priceMap[r.stock_code] = r; });
    } catch (e) { console.warn('현재가 조회 실패:', e?.message || e); }
  }

  // 산업명 조회 (companies 테이블)
  let industryMap = {};
  if (codes.length) {
    const { data: comps } = await sb.from('companies')
      .select('code,industry')
      .in('code', codes);
    (comps || []).forEach(r => { industryMap[r.code] = r.industry; });
  }

  // financials 조회 (bsns_year + quarter DESC = 최신 분기 우선)
  let roeMap = {}, opmMap = {}, revMap = {}, opMap = {};
  if (codes.length) {
    try {
      const { data: fins, error: finErr } = await sb.from('financials')
        .select('stock_code,bsns_year,quarter,revenue,operating_profit,roe')
        .in('stock_code', codes)
        .order('bsns_year', { ascending: false })
        .order('quarter',   { ascending: false });
      if (finErr) throw finErr;
      (fins || []).forEach(r => {
        if (!roeMap[r.stock_code] && r.roe != null)          roeMap[r.stock_code] = r.roe;
        if (!revMap[r.stock_code] && r.revenue)              revMap[r.stock_code] = r.revenue;
        if (!opMap[r.stock_code]  && r.operating_profit)     opMap[r.stock_code]  = r.operating_profit;
        if (!opmMap[r.stock_code] && r.revenue && r.operating_profit)
          opmMap[r.stock_code] = r.operating_profit / r.revenue * 100;
      });
    } catch (e) { console.warn('financials 조회 실패:', e?.message || e); }
  }

  // 거래 내역 조회 → 포지션(평단/수량/실현손익) 자동 계산
  const txMap = await fetchTransactions(codes);
  const positionMap = {};
  Object.keys(txMap).forEach(code => { positionMap[code] = computePosition(txMap[code]); });

  // 거래내역 있으면 그 값을, 없으면 watchlist 수동 입력값을 사용
  const effPos = (w) => {
    const p = positionMap[w.stock_code];
    if (p && p.count) return {
      avg: p.qty > 0 ? p.avgCost : null,
      qty: p.qty > 0 ? p.qty : null,
      realized: p.realized,
      hasTx: true,
      closed: p.qty === 0 && p.count > 0,
      creditLoan: p.creditLoan || 0,
      creditQty:  p.creditQty  || 0,
    };
    return { avg: w.avg_price, qty: w.quantity, realized: 0, hasTx: false, closed: false, creditLoan: 0, creditQty: 0 };
  };

  // ── 탭별 표시 집합 파생: 전량 매도(closed) + 저장 그룹 '보유중' → '청산'으로 분류 ──
  // 사용자가 수동으로 관심/후보로 되돌렸으면 그 의도 존중(청산으로 강제하지 않음).
  const wlCategory = (w) => {
    const e = effPos(w);
    return (e.closed && w.group_name === '보유중') ? '청산' : w.group_name;
  };
  // 집계·'오늘 할 일'은 항상 전체 포트폴리오 기준 → 탭 전환에도 헤드라인 손익 불변
  const portfolioRows = allRows || [];

  // ── 탭 필터: 전체 / 보유중 / 파이프라인(관심·후보, 하위필터) / 청산 ──
  const pipeFilter = WL.pipeFilter || null; // '관심' | '후보' | null
  const tabFilter = (w) => {
    const cat = wlCategory(w);
    if (group === 'all')      return true;
    if (group === '보유중')   return cat === '보유중';
    if (group === '청산')     return cat === '청산';
    if (group === 'pipeline') return (cat === '관심' || cat === '후보') && (!pipeFilter || cat === pipeFilter);
    return cat === group; // 하위호환 (관심/후보 직접 지정 시)
  };
  const data = portfolioRows.filter(tabFilter);

  // ── 포트폴리오 집계 (요약 카드 + 비중 컬럼 공용) — 전체 기준 ──────────────
  const holding = portfolioRows.filter(w => { const e = effPos(w); return e.avg && e.qty && priceMap[w.stock_code]?.price; });
  const valMap = {};
  let totalCost = 0, totalVal = 0, totalTgtVal = 0;
  for (const w of holding) {
    const e = effPos(w);
    const v = priceMap[w.stock_code].price * e.qty;
    valMap[w.stock_code] = v;
    totalCost += e.avg * e.qty;
    totalVal  += v;
    if (w.target_price) totalTgtVal += w.target_price * e.qty;
  }
  const totalPnl      = totalVal - totalCost;
  const totalPnlPct   = totalCost > 0 ? totalPnl / totalCost * 100 : null;
  const totalRealized = portfolioRows.reduce((s, w) => s + effPos(w).realized, 0);
  const cash          = await getPortfolioCash();
  const targetWeights = await getTargetWeights();
  const journalMap    = await fetchJournals(codes);
  const bench         = await fetchBenchmarkReturns();
  const totalAssets   = totalVal + cash;
  const cashRatio     = totalAssets > 0 ? cash / totalAssets * 100 : 0;
  // 신용융자: 잔고 합계, 순자산(=총자산−융자), 레버리지(=융자/순자산)
  const totalCreditLoan = portfolioRows.reduce((s, w) => s + (effPos(w).creditLoan || 0), 0);
  const netAssets       = totalAssets - totalCreditLoan;
  const leveragePct     = netAssets > 0 ? totalCreditLoan / netAssets * 100 : 0;

  // ── '오늘 할 일' 집합 — 전체 포트폴리오 기준 (손절·목표도달·익절구간·매수구간·점검·리밸런싱·복기) ──
  const stopHitCodes = new Set(), targetHitCodes = new Set(), trimZoneCodes = new Set(), buyZoneCodes = new Set(), checkDueCodes = new Set(), needJournalCodes = new Set(), rebalCodes = new Set();
  const REBAL_WARN = 5;        // 목표비중 갭 ±5%p 이상이면 리밸런싱 액션
  const TRIM_ZONE_PCT = 0.9;   // 목표가의 90% 도달부터 '익절 구간' (분할 익절 준비)
  const _now = new Date();
  for (const w of portfolioRows) {
    const price = priceMap[w.stock_code]?.price;
    const e = effPos(w);
    if (e.avg && e.qty && price && w.stop_price   && price <= w.stop_price)   stopHitCodes.add(w.stock_code);
    if (e.avg && e.qty && price && w.target_price && price >= w.target_price) targetHitCodes.add(w.stock_code); // 목표 도달 → 익절 검토
    else if (e.avg && e.qty && price && w.target_price && price >= w.target_price * TRIM_ZONE_PCT) trimZoneCodes.add(w.stock_code); // 목표 90%↑ → 분할 익절
    if (price && w.watch_price && price <= w.watch_price) buyZoneCodes.add(w.stock_code);
    if (w.next_check_date && !e.closed && Math.ceil((new Date(w.next_check_date) - _now) / 86400000) <= 3) checkDueCodes.add(w.stock_code);
    if (_journalAvailable && e.closed && !journalMap[w.stock_code]) needJournalCodes.add(w.stock_code);
    const tw = targetWeights[w.stock_code];
    if (tw != null && valMap[w.stock_code] != null && totalAssets > 0 &&
        Math.abs(valMap[w.stock_code] / totalAssets * 100 - tw) >= REBAL_WARN) rebalCodes.add(w.stock_code);
  }
  // 활성 필터가 가리키는 집합이 비면 자동 해제 (예: 거래 기록 후 손절 해소)
  if (WL.actionFilter) {
    const _s = WL.actionFilter === 'stop'    ? stopHitCodes
             : WL.actionFilter === 'target'  ? targetHitCodes
             : WL.actionFilter === 'trim'    ? trimZoneCodes
             : WL.actionFilter === 'buy'     ? buyZoneCodes
             : WL.actionFilter === 'check'   ? checkDueCodes
             : WL.actionFilter === 'rebal'   ? rebalCodes
             : WL.actionFilter === 'journal' ? needJournalCodes : null;
    if (!_s || _s.size === 0) WL.actionFilter = null;
  }

  document.getElementById('wl-count').textContent = `${data.length}개${pipeFilter?` · ${pipeFilter}`:''}`;

  // ── '오늘 할 일' — 카운트 칩이 아니라 실행 버튼 달린 행 (전체 포트폴리오 기준) ──
  const todayEl = document.getElementById('wl-today');
  if (todayEl) {
    const esc    = s => (s || '').replace(/'/g, "\\'");
    const byCode = {}; portfolioRows.forEach(w => { byCode[w.stock_code] = w; });
    const aBtn   = (label, color, handler) =>
      `<button class="btn btn-sm" style="color:${color};font-weight:700;white-space:nowrap" onclick="event.stopPropagation();${handler}">${label}</button>`;
    const itemRow = (accent, icon, code, ctxHtml, actionsHtml) => {
      const w = byCode[code]; if (!w) return '';
      return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--bg2);border:1px solid var(--border);border-left:3px solid ${accent};border-radius:6px">
        <span style="font-size:15px;line-height:1">${icon}</span>
        <div style="min-width:0;flex:1">
          <div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${w.corp_name}
            <span style="font-size:11px;color:var(--text3);font-weight:400">${(w.stock_code||'').split('.')[0]}</span></div>
          <div style="font-size:11px;color:var(--text2);line-height:1.4">${ctxHtml}</div>
        </div>
        <div style="display:flex;gap:4px;align-items:center">${actionsHtml}</div>
      </div>`;
    };
    const groups = [];

    if (stopHitCodes.size) {
      const rows = [...stopHitCodes].map(code => {
        const w = byCode[code], p = priceMap[code]?.price, e = effPos(w);
        const lossPct = (e.avg && p) ? (p - e.avg) / e.avg * 100 : null;
        const ctx = `현재가 ${p?p.toLocaleString():'—'}원 · 손절 ${w.stop_price?.toLocaleString()}원 이탈${lossPct!=null?` · <span style="color:${chgColor(lossPct)};font-weight:600">${lossPct.toFixed(1)}%</span>`:''}`;
        return itemRow('var(--red)','🛑',code,ctx,
          aBtn('매도','var(--sell)',`openTradeModal(${w.id},'${code}','${esc(w.corp_name)}','sell',${p||'null'})`)
        + aBtn('이력','var(--text2)',`openTradeHistory('${code}','${esc(w.corp_name)}')`));
      }).join('');
      groups.push({ label:'손절 도달', count:stopHitCodes.size, color:'var(--red)', rows });
    }
    if (targetHitCodes.size) {
      const rows = [...targetHitCodes].map(code => {
        const w = byCode[code], p = priceMap[code]?.price, e = effPos(w);
        const gainPct = (e.avg && p) ? (p - e.avg) / e.avg * 100 : null;
        const overPct = (w.target_price && p) ? (p - w.target_price) / w.target_price * 100 : null;
        const ctx = `현재가 ${p?p.toLocaleString():'—'}원 ≥ 목표 ${w.target_price?.toLocaleString()}원${overPct!=null&&overPct>0?` (+${overPct.toFixed(1)}%)`:''}${gainPct!=null?` · 평가 <span style="color:${chgColor(gainPct)};font-weight:600">${gainPct>=0?'+':''}${gainPct.toFixed(1)}%</span>`:''} · 익절 검토`;
        return itemRow('var(--up)','🎯',code,ctx,
          aBtn('매도','var(--sell)',`openTradeModal(${w.id},'${code}','${esc(w.corp_name)}','sell',${p||'null'})`)
        + aBtn('이력','var(--text2)',`openTradeHistory('${code}','${esc(w.corp_name)}')`));
      }).join('');
      groups.push({ label:'목표 도달 (익절 검토)', count:targetHitCodes.size, color:'var(--up)', rows });
    }
    if (trimZoneCodes.size) {
      const rows = [...trimZoneCodes].map(code => {
        const w = byCode[code], p = priceMap[code]?.price, e = effPos(w);
        const reach   = (w.target_price && p) ? p / w.target_price * 100 : null;
        const up      = (w.target_price && p) ? (w.target_price - p) / p * 100 : null;
        const gainPct = (e.avg && p) ? (p - e.avg) / e.avg * 100 : null;
        const ctx = `현재가 ${p?p.toLocaleString():'—'}원 · 목표까지 +${up!=null?up.toFixed(1):'—'}%${reach!=null?` (도달률 ${reach.toFixed(0)}%)`:''}${gainPct!=null?` · 평가 <span style="color:${chgColor(gainPct)};font-weight:600">${gainPct>=0?'+':''}${gainPct.toFixed(1)}%</span>`:''} · 분할 익절`;
        return itemRow('var(--accent)','✂️',code,ctx,
          aBtn('매도','var(--sell)',`openTradeModal(${w.id},'${code}','${esc(w.corp_name)}','sell',${p||'null'})`)
        + aBtn('이력','var(--text2)',`openTradeHistory('${code}','${esc(w.corp_name)}')`));
      }).join('');
      groups.push({ label:'익절 구간 (분할 익절)', count:trimZoneCodes.size, color:'var(--accent)', rows });
    }
    if (buyZoneCodes.size) {
      const rows = [...buyZoneCodes].map(code => {
        const w = byCode[code], p = priceMap[code]?.price;
        const rr = (w.target_price && w.stop_price && p && p > w.stop_price) ? (w.target_price - p)/(p - w.stop_price) : null;
        const ctx = `현재가 ${p?p.toLocaleString():'—'}원 ≤ 관심가 ${w.watch_price?.toLocaleString()}원${rr!=null?` · 손익비 ${rr.toFixed(1)}:1`:''}`;
        return itemRow('var(--buy)','✅',code,ctx,
          aBtn('매수','var(--buy)',`openTradeModal(${w.id},'${code}','${esc(w.corp_name)}','buy',${p||'null'})`));
      }).join('');
      groups.push({ label:'매수 구간', count:buyZoneCodes.size, color:'var(--buy)', rows });
    }
    if (rebalCodes.size) {
      const rows = [...rebalCodes].map(code => {
        const w = byCode[code], curPct = valMap[code]/totalAssets*100, tw = targetWeights[code];
        const gap = curPct - tw, tradeAmt = (tw - curPct)/100*totalAssets, p = priceMap[code]?.price;
        const ctx = `현재 ${curPct.toFixed(1)}% · 목표 ${tw.toFixed(1)}% (<span style="color:var(--accent);font-weight:600">${gap>=0?'+':''}${gap.toFixed(1)}%p</span>) → ${tradeAmt>0?'매수':'매도'} ${fmtWon(Math.abs(tradeAmt))}`;
        return itemRow('var(--accent)','⚖️',code,ctx, tradeAmt>0
          ? aBtn('매수','var(--buy)',`openTradeModal(${w.id},'${code}','${esc(w.corp_name)}','buy',${p||'null'})`)
          : aBtn('매도','var(--sell)',`openTradeModal(${w.id},'${code}','${esc(w.corp_name)}','sell',${p||'null'})`));
      }).join('');
      groups.push({ label:'리밸런싱', count:rebalCodes.size, color:'var(--accent)', rows });
    }
    if (checkDueCodes.size) {
      const rows = [...checkDueCodes].map(code => {
        const w = byCode[code];
        const d = Math.ceil((new Date(w.next_check_date) - _now)/86400000);
        const dLabel = d<0?`${Math.abs(d)}일 초과`:d===0?'오늘':`D-${d}`;
        const ctx = `${w.next_check_date} · ${dLabel}${w.next_check_memo?` · ${w.next_check_memo}`:''}`;
        return itemRow('var(--accent)','📅',code,ctx,
          aBtn('수정','var(--text1)',`openWatchlistModal(${w.id})`));
      }).join('');
      groups.push({ label:'점검 임박', count:checkDueCodes.size, color:'var(--accent)', rows });
    }
    if (_journalAvailable && needJournalCodes.size) {
      const rows = [...needJournalCodes].map(code => {
        const w = byCode[code], e = effPos(w);
        const ctx = `청산 완료 · 실현 <span style="color:${chgColor(e.realized)};font-weight:600">${fmtWon(e.realized,true)}</span> · 복기 미작성`;
        return itemRow('var(--tg)','📝',code,ctx,
          aBtn('복기','var(--accent)',`openJournalModal('${code}','${esc(w.corp_name)}')`));
      }).join('');
      groups.push({ label:'복기 필요', count:needJournalCodes.size, color:'var(--tg)', rows });
    }

    if (!groups.length) {
      todayEl.innerHTML = '';
    } else {
      const totalN = groups.reduce((s,g) => s + g.count, 0);
      const sections = groups.map(g => `
        <div style="margin-top:8px">
          <div style="font-size:11px;font-weight:700;color:${g.color};margin-bottom:5px">${g.label} <span style="color:var(--text3);font-weight:600">${g.count}</span></div>
          <div style="display:flex;flex-direction:column;gap:6px">${g.rows}</div>
        </div>`).join('');
      todayEl.innerHTML = `
        <div style="background:var(--signal-hot);border:1px solid var(--accent);border-radius:10px;padding:12px 14px">
          <div style="font-size:12px;font-weight:800;letter-spacing:.04em;color:var(--text1)">🔔 오늘 할 일 <span style="color:var(--accent)">${totalN}</span></div>
          ${sections}
        </div>`;
    }
  }

  // ── 드로어가 즉시 렌더하도록 현재 데이터 스냅샷 캐시 (재조회 없이 행 클릭 → 상세) ──
  const _byCode = {}, _effMap = {};
  portfolioRows.forEach(w => { _byCode[w.stock_code] = w; _effMap[w.stock_code] = effPos(w); });
  WL.cache = {
    byCode: _byCode, effMap: _effMap, priceMap, industryMap,
    roeMap, opmMap, revMap, opMap, valMap, totalAssets, journalMap, targetWeights,
  };
  // 드로어가 열려 있고 현재 사용자가 드로어 내부를 편집 중이 아니면 최신 데이터로 갱신
  if (document.getElementById('wl-drawer') && WL.drawerCode) {
    const ae = document.activeElement;
    if (!(ae && ae.closest && ae.closest('.wl-drawer'))) wlRenderDrawer(WL.drawerCode);
  }

  // ── 포트폴리오 요약 카드 ─────────────────────────────────────────────────
  const summaryEl = document.getElementById('wl-summary');
  if (summaryEl) {
    // 평균 업사이드/손익비/PER 계산
    const withTarget = (data||[]).filter(w => w.target_price && priceMap[w.stock_code]?.price);
    const withStopAndTarget = withTarget.filter(w => w.stop_price && w.stop_price < priceMap[w.stock_code]?.price);
    const avgUpside = withTarget.length
      ? withTarget.reduce((s,w) => s + (w.target_price - priceMap[w.stock_code].price) / priceMap[w.stock_code].price * 100, 0) / withTarget.length
      : null;
    const avgRR = withStopAndTarget.length
      ? withStopAndTarget.reduce((s,w) => {
          const cur = priceMap[w.stock_code].price;
          return s + (w.target_price - cur) / (cur - w.stop_price);
        }, 0) / withStopAndTarget.length
      : null;
    const codesWithPer = (data||[]).filter(w => priceMap[w.stock_code]?.per != null);
    const avgPer = codesWithPer.length
      ? codesWithPer.reduce((s,w) => s + priceMap[w.stock_code].per, 0) / codesWithPer.length
      : null;

    const bigCard  = (label, value, sub='', valueColor='var(--text)') =>
      `<div style="padding:12px 14px;background:var(--bg2);border-radius:8px;border:1px solid var(--border)">
        <div style="font-size:var(--fs-label);color:var(--text1);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">${label}</div>
        <div style="font-size:var(--fs-big);font-weight:700;color:${valueColor};font-variant-numeric:tabular-nums;line-height:1">${value}</div>
        ${sub ? `<div style="font-size:11px;color:var(--text2);margin-top:4px">${sub}</div>` : ''}
      </div>`;
    const statChip = (label, value, color='var(--text1)') =>
      `<span style="white-space:nowrap"><span style="color:var(--text2)">${label}</span> <b style="color:${color};font-weight:700">${value}</b></span>`;

    // 현금 KPI — 인라인 편집 가능
    const cashCard = `
      <div style="padding:12px 14px;background:var(--bg2);border-radius:8px;border:1px solid var(--border)">
        <div style="font-size:var(--fs-label);color:var(--text1);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">현금 · 기동률</div>
        <div style="display:flex;align-items:baseline;gap:3px">
          <input id="wl-cash-input" type="text" inputmode="numeric" value="${cash.toLocaleString()}"
            onfocus="this.value=this.value.replace(/[^0-9]/g,'');this.select()"
            onblur="savePortfolioCash(this.value)"
            onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape')loadWatchlist()"
            title="클릭해서 현금 잔고 입력"
            style="width:100%;background:transparent;border:none;border-bottom:1px dashed var(--border2);color:var(--text);font-size:var(--fs-big);font-weight:700;font-variant-numeric:tabular-nums;padding:0 0 1px;outline:none">
          <span style="font-size:13px;color:var(--text2);font-weight:600">원</span>
        </div>
        <div style="font-size:11px;color:var(--text2);margin-top:4px">기동률 ${cashRatio.toFixed(1)}%</div>
      </div>`;

    // ── 집중도 (최대 단일 종목 / 상위 섹터) — 총자산 대비, 임계 초과 시 ⚠️ ──
    const concChips = [];
    if (holding.length && totalAssets > 0) {
      const STOCK_WARN = 25, SECTOR_WARN = 40; // 단일 종목 25% / 섹터 40% 초과 시 경고
      const topPos = holding
        .map(w => ({ name: w.corp_name, pct: (valMap[w.stock_code] || 0) / totalAssets * 100 }))
        .sort((a, b) => b.pct - a.pct)[0];
      if (topPos) {
        const warn = topPos.pct >= STOCK_WARN;
        concChips.push(statChip(`${warn ? '⚠️ ' : ''}최대 종목`,
          `${topPos.name} ${topPos.pct.toFixed(1)}%`, warn ? 'var(--accent)' : 'var(--text1)'));
      }
      const sectorVal = {}, sectorCnt = {};
      holding.forEach(w => {
        const sec = industryMap[w.stock_code] || w.industry || '기타';
        sectorVal[sec] = (sectorVal[sec] || 0) + (valMap[w.stock_code] || 0);
        sectorCnt[sec] = (sectorCnt[sec] || 0) + 1;
      });
      const topSec = Object.entries(sectorVal)
        .map(([name, v]) => ({ name, pct: v / totalAssets * 100, cnt: sectorCnt[name] }))
        .sort((a, b) => b.pct - a.pct)[0];
      // 섹터에 2종목 이상일 때만 표시 (단일 종목 칩과 중복 방지)
      if (topSec && topSec.cnt >= 2) {
        const warn = topSec.pct >= SECTOR_WARN;
        concChips.push(statChip(`${warn ? '⚠️ ' : ''}상위 섹터`,
          `${topSec.name} ${topSec.pct.toFixed(1)}% · ${topSec.cnt}종목`, warn ? 'var(--accent)' : 'var(--text1)'));
      }
    }

    const secondaryStats = [
      statChip('종목', `${(data||[]).length}개${holding.length?` · 보유 ${holding.length}`:''}`),
      avgUpside!=null ? statChip('평균 업사이드', `${avgUpside>=0?'+':''}${avgUpside.toFixed(1)}%`, chgColor(avgUpside)) : '',
      avgRR!=null     ? statChip('손익비', `${avgRR.toFixed(1)} : 1`, avgRR>=2?'var(--up)':avgRR>=1?'var(--accent)':'var(--text1)') : '',
      avgPer!=null    ? statChip('평균 PER', `${avgPer.toFixed(1)}x`) : '',
      totalCreditLoan > 0 ? statChip('🔻 신용융자', fmtWon(totalCreditLoan), 'var(--accent)') : '',
      totalCreditLoan > 0 ? statChip('순자산', fmtWon(netAssets)) : '',
      totalCreditLoan > 0 ? statChip('레버리지', `${leveragePct.toFixed(0)}%`, leveragePct>=50?'var(--down)':'var(--text1)') : '',
      ...concChips,
    ].filter(Boolean).join('');

    // (옛 '오늘의 액션' 카운트 칩 바 → 상단 #wl-today 실행 행으로 대체됨)

    // ── 청산 탭: 매매 복기 통계 대시보드 (무관한 일반 요약 대신) ──
    if (group === '청산' && _journalAvailable) {
      const journals = Object.values(journalMap);
      const n        = journals.length;
      const avg      = (arr, k) => arr.length ? arr.reduce((s,j)=>s+Number(j[k]),0)/arr.length : null;
      const withRet  = journals.filter(j => j.return_pct != null);
      const wins     = withRet.filter(j => j.return_pct > 0);
      const losses   = withRet.filter(j => j.return_pct <= 0);
      const winRate  = withRet.length ? wins.length / withRet.length * 100 : null;
      const avgRet   = avg(withRet, 'return_pct');
      const avgWin   = avg(wins, 'return_pct');
      const avgLoss  = avg(losses, 'return_pct');
      const withHold = journals.filter(j => j.hold_days != null);
      const avgHold  = withHold.length ? Math.round(avg(withHold, 'hold_days')) : null;
      const avgScore = avg(journals.filter(j => j.process_score != null), 'process_score');
      const realizedSum = journals.reduce((s,j)=>s+(Number(j.realized)||0),0);
      const reasonCnt = {};
      journals.forEach(j => { if (j.sell_reason) reasonCnt[j.sell_reason] = (reasonCnt[j.sell_reason]||0)+1; });
      const reasonRows = Object.entries(reasonCnt).sort((a,b)=>b[1]-a[1]);

      const dcard = (label, val, sub='', color='var(--text)') =>
        `<div style="padding:10px 12px;background:var(--bg2);border-radius:8px;border:1px solid var(--border);min-width:108px;flex:1">
           <div style="font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:.05em">${label}</div>
           <div style="font-size:18px;font-weight:700;color:${color};line-height:1.1;margin-top:2px;font-variant-numeric:tabular-nums">${val}</div>
           ${sub?`<div style="font-size:11px;color:var(--text2);margin-top:2px">${sub}</div>`:''}
         </div>`;

      const dash = n === 0
        ? `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:16px;text-align:center;color:var(--text2);font-size:13px;margin-bottom:.6rem">
             청산 종목을 복기하면 승률·수익률·보유기간·프로세스 통계가 쌓입니다.${needJournalCodes.size?` <b style="color:var(--accent)">미작성 ${needJournalCodes.size}건</b>`:''}
           </div>`
        : `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px 14px;margin-bottom:.6rem">
             <div style="font-size:11px;color:var(--text1);font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">매매 복기 통계 <span style="color:var(--text2);font-weight:400;text-transform:none">· 복기 ${n}건${needJournalCodes.size?` · 미작성 ${needJournalCodes.size}`:''}</span></div>
             <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:${reasonRows.length?'12px':'0'}">
               ${dcard('승률', winRate!=null?`${winRate.toFixed(0)}%`:'—', withRet.length?`승 ${wins.length} · 패 ${losses.length}`:'', winRate!=null?(winRate>=50?'var(--red)':'var(--blue)'):'var(--text)')}
               ${dcard('평균 수익률', avgRet!=null?`${avgRet>=0?'+':''}${avgRet.toFixed(1)}%`:'—', (avgWin!=null||avgLoss!=null)?`승 ${avgWin!=null?'+'+avgWin.toFixed(1):'—'}% · 패 ${avgLoss!=null?avgLoss.toFixed(1):'—'}%`:'', chgColor(avgRet))}
               ${dcard('누적 실현', fmtWon(realizedSum, true), '', chgColor(realizedSum))}
               ${dcard('평균 보유', avgHold!=null?`${avgHold}일`:'—')}
               ${dcard('평균 프로세스', avgScore!=null?`★ ${avgScore.toFixed(1)}`:'—', '', avgScore!=null?'var(--accent)':'var(--text)')}
             </div>
             ${reasonRows.length?`<div style="font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">매도 사유</div>
               <div style="display:flex;gap:6px;flex-wrap:wrap">
                 ${reasonRows.map(([r,c])=>`<span style="font-size:11px;background:var(--bg3);border-radius:100px;padding:3px 9px;color:var(--text1)">${r} <b style="color:var(--tg)">${c}</b></span>`).join('')}
               </div>`:''}
           </div>`;
      summaryEl.innerHTML = dash;
    } else {
    // ── 포트폴리오 vs 벤치마크 (가치가중 · 시장 기간수익률 기준 종목선택 알파) ──
    const benchCard = (() => {
      if (!bench || !holding.length) return '';
      const periods = [
        { lbl:'1주', pk:'week_return',    bk:'w' },
        { lbl:'1달', pk:'month_return',   bk:'m' },
        { lbl:'3달', pk:'quarter_return', bk:'q' },
      ];
      const calc = (pk, bk) => {
        let wsum = 0, prSum = 0, beSum = 0;
        for (const w of holding) {
          const pm = priceMap[w.stock_code]; if (!pm) continue;
          const r = pm[pk]; if (r == null) continue;
          const wt = valMap[w.stock_code] || 0; if (wt <= 0) continue;
          const idx = (pm.market === 'KOSDAQ') ? bench.kosdaq : bench.kospi;
          const be = idx ? idx[bk] : null;
          wsum += wt; prSum += r * wt; if (be != null) beSum += be * wt;
        }
        return wsum ? { port: prSum / wsum, bench: beSum / wsum } : null;
      };
      const cols = periods.map(p => ({ ...p, v: calc(p.pk, p.bk) }));
      if (cols.every(c => !c.v)) return '';
      const pct  = x => x == null ? '—' : `${x >= 0 ? '+' : ''}${x.toFixed(1)}%`;
      const ppt  = x => x == null ? '—' : `${x >= 0 ? '+' : ''}${x.toFixed(1)}p`;
      const cell = (txt, color) => `<td style="text-align:right;padding:3px 10px;font-variant-numeric:tabular-nums;color:${color || 'var(--text1)'};font-weight:600">${txt}</td>`;
      const head = label => `<td style="padding:3px 10px;color:var(--text2);white-space:nowrap">${label}</td>`;
      return `
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px 14px;margin-bottom:.75rem">
          <div style="font-size:11px;color:var(--text1);font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">
            포트폴리오 vs 벤치마크
            <span style="color:var(--text2);font-weight:400;text-transform:none">· 보유 ${holding.length}종목 · 가치가중 · 시장 기간수익률(코스피/코스닥) 대비</span>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead><tr><td style="padding:3px 10px"></td>${cols.map(c => `<td style="text-align:right;padding:3px 10px;color:var(--text2);font-weight:600">${c.lbl}</td>`).join('')}</tr></thead>
            <tbody>
              <tr>${head('내 보유')}${cols.map(c => cell(pct(c.v ? c.v.port : null), c.v ? chgColor(c.v.port) : null)).join('')}</tr>
              <tr>${head('벤치마크')}${cols.map(c => cell(pct(c.v ? c.v.bench : null), 'var(--text2)')).join('')}</tr>
              <tr style="border-top:1px solid var(--border)">${head('알파')}${cols.map(c => { const a = c.v ? c.v.port - c.v.bench : null; return cell(ppt(a), a != null ? chgColor(a) : null); }).join('')}</tr>
            </tbody>
          </table>
        </div>`;
    })();
    summaryEl.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:.6rem">
        ${totalAssets > 0 ? bigCard('총자산',
          fmtWon(totalAssets),
          `보유 ${fmtWon(totalVal)} + 현금 ${fmtWon(cash)}`) : ''}
        ${(holding.length || totalRealized) ? bigCard('총손익',
          fmtWon(totalRealized+totalPnl, true),
          `${totalPnlPct!=null?`평가 ${totalPnlPct>=0?'+':''}${totalPnlPct.toFixed(1)}%`:''}${totalRealized?` · 실현 ${fmtWon(totalRealized, true)}`:''}`,
          chgColor(totalRealized+totalPnl)) : ''}
        ${cashCard}
      </div>
      <div style="display:flex;gap:8px 18px;flex-wrap:wrap;font-size:12px;color:var(--text2);margin-bottom:.75rem;padding:0 2px">
        ${secondaryStats}
      </div>
      ${benchCard}
      ${((holding.length >= 1 && cash > 0) || holding.length >= 2) && totalAssets > 0 ? (() => {
        // 자산 배분 바 — 현금 포함 총자산 기준
        const denom = totalAssets;
        const positions = holding.map(w => {
          const e = effPos(w);
          return {
            name: w.corp_name,
            val:  priceMap[w.stock_code].price * e.qty,
            cost: e.avg * e.qty,
          };
        }).sort((a, b) => b.val - a.val);
        const barColors = ['#4a9eff','#ffc107','var(--tg)','#e879f9','#f97316','#22d3ee','#a3e635','#f43f5e'];
        const rows = positions.map((p, i) => {
          const pct   = denom > 0 ? p.val / denom * 100 : 0;
          const pnl   = p.val - p.cost;
          const pnlPct = p.cost > 0 ? pnl / p.cost * 100 : 0;
          const color = barColors[i % barColors.length];
          const pnlColor = chgColor(pnl);
          return `
            <div style="display:grid;grid-template-columns:100px 1fr 60px 70px;align-items:center;gap:8px;padding:4px 0">
              <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
              <div style="background:var(--bg3);border-radius:4px;height:8px;overflow:hidden">
                <div style="height:100%;width:${pct.toFixed(1)}%;background:${color};border-radius:4px;transition:width .3s"></div>
              </div>
              <div style="font-size:12px;font-weight:700;text-align:right">${pct.toFixed(1)}%</div>
              <div style="font-size:11px;font-weight:600;color:${pnlColor};text-align:right">${pnl>=0?'+':''}${pnlPct.toFixed(1)}%</div>
            </div>`;
        }).join('');
        const cashPct = denom > 0 ? cash / denom * 100 : 0;
        const cashRow = cash > 0 ? `
          <div style="display:grid;grid-template-columns:100px 1fr 60px 70px;align-items:center;gap:8px;padding:4px 0;border-top:1px dashed var(--border);margin-top:4px">
            <div style="font-size:12px;font-weight:600;color:var(--text2)">💰 현금</div>
            <div style="background:var(--bg3);border-radius:4px;height:8px;overflow:hidden">
              <div style="height:100%;width:${cashPct.toFixed(1)}%;background:repeating-linear-gradient(45deg,var(--text3),var(--text3) 4px,transparent 4px,transparent 8px);border-radius:4px"></div>
            </div>
            <div style="font-size:12px;font-weight:700;text-align:right">${cashPct.toFixed(1)}%</div>
            <div></div>
          </div>` : '';
        return `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px 14px;margin-bottom:.75rem">
          <div style="font-size:11px;color:var(--text1);font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">자산 배분 <span style="color:var(--text2);font-weight:400;text-transform:none">(현금 포함 총자산 기준)</span></div>
          ${rows}${cashRow}
        </div>`;
      })() : ''}`;
    }
  }

  const groupColors    = { '관심': '#4a9eff', '후보': '#ffc107', '보유중': 'var(--tg)', '청산': '#6b7694' };
  const groupTextColors = { '관심': '#0a1f3d', '후보': '#2d1f00', '보유중': '#002b1e', '청산': '#0f1117' };

  // ── 파이프라인 탭 하위 필터 (관심 / 후보) ──
  let pipeBar = '';
  if (group === 'pipeline') {
    const nWatch = portfolioRows.filter(w => wlCategory(w) === '관심').length;
    const nCand  = portfolioRows.filter(w => wlCategory(w) === '후보').length;
    const subChip = (cat, n, color) => {
      const on = pipeFilter === cat;
      return `<button onclick="wlSetPipeFilter('${cat}')" style="padding:3px 12px;font-size:12px;border-radius:100px;cursor:pointer;font-family:inherit;
        border:1px solid ${on?color:'var(--border2)'};background:${on?color:'transparent'};color:${on?'#0f1117':'var(--text1)'};font-weight:${on?'700':'500'}">${cat} <b style="color:${on?'#0f1117':'var(--text2)'}">${n}</b></button>`;
    };
    pipeBar = `<div style="display:flex;gap:6px;align-items:center;margin-bottom:.6rem">
      ${subChip('관심', nWatch, '#4a9eff')}${subChip('후보', nCand, '#ffc107')}
      ${pipeFilter?`<button onclick="wlSetPipeFilter('${pipeFilter}')" style="background:none;border:none;color:var(--text2);font-size:11px;cursor:pointer;text-decoration:underline">전체 보기</button>`:''}
    </div>`;
  }

  if (!data?.length) {
    const emptyMsg = group === '청산'
      ? '청산 완료된 종목이 없어요.'
      : group === '보유중'
      ? '보유 중인 종목이 없어요.<br>매수 거래를 기록하면 자동으로 보유중에 표시됩니다.'
      : '등록된 종목이 없어요.<br>+ 종목 추가 버튼을 눌러 추가해주세요.';
    listEl.innerHTML = `${pipeBar}<div style="text-align:center;padding:3rem;color:var(--text2)">${emptyMsg}</div>`;
    return;
  }

  // ── 정렬 ─────────────────────────────────────────────────────────────────
  if (!WL.sort) WL.sort = { key: null, asc: true };
  const { key: sortKey, asc: sortAsc } = WL.sort;

  const sortVal = (w) => {
    const mkt = priceMap[w.stock_code] || {};
    switch (sortKey) {
      case 'name':     return w.corp_name || '';
      case 'industry': return industryMap[w.stock_code] || w.industry || '';
      case 'price':    return mkt.price || 0;
      case 'rev':      return revMap[w.stock_code] || 0;
      case 'op':       return opMap[w.stock_code] || 0;
      case 'roe':      return roeMap[w.stock_code] || 0;
      case 'opm':      return opmMap[w.stock_code] || 0;
      case 'ret':      return mkt.week_return ?? -9999;
      case 'cap':      return mkt.market_cap || 0;
      case 'watch':    return w.watch_price || 0;
      case 'target':   return (w.target_price && mkt.price) ? (w.target_price - mkt.price) / mkt.price : 0;
      case 'pnl':      { const e = effPos(w); return (e.avg && mkt.price) ? (mkt.price - e.avg) / e.avg : -9999; }
      case 'check':    return w.next_check_date || 'zzzz';
      default:         return 0;
    }
  };
  const sorted = sortKey
    ? [...data].sort((a, b) => {
        const va = sortVal(a), vb = sortVal(b);
        if (va < vb) return sortAsc ? -1 : 1;
        if (va > vb) return sortAsc ? 1 : -1;
        return 0;
      })
    : data;

  // ── 탭별 컬럼 셋 (보유중=포지션 / 파이프라인=밸류·진입 / 전체=혼합) ──────────
  const view = group === '보유중' ? 'holding'
             : group === '청산' ? 'closed'
             : (group === 'pipeline' || group === '관심' || group === '후보') ? 'watch'
             : 'all';
  const COLVIEWS = {
    holding: ['name','price','ret','cost','weight','target','check','actions'],
    watch:   ['name','industry','price','ret','cap','rev','op','roe','opm','watch','target','thesis','check','actions'],
    all:     ['name','industry','price','ret','cap','watch','target','cost','weight','thesis','check','actions'],
    closed:  ['name','industry','price','cost','thesis','actions'],
  };
  const cols = COLVIEWS[view];

  // ── 테이블 헤더 ───────────────────────────────────────────────────────────
  const thBase = 'font-size:11px;color:var(--text2);font-weight:500;padding:8px 10px;text-align:left;border-bottom:1px solid var(--border);white-space:nowrap;cursor:pointer;user-select:none';
  const thActive = 'color:var(--text1);font-weight:700';
  const arrow = (k) => sortKey === k ? (sortAsc ? ' ↑' : ' ↓') : '';
  const th = (k, label) => {
    const active = sortKey === k ? thActive : '';
    return `<th style="${thBase};${active}" onclick="wlSortBy('${k}')">${label}${arrow(k)}</th>`;
  };
  const thStyle = thBase; // 버튼 없는 빈 컬럼용
  const thMap = {
    name:     th('name',    '종목'),
    industry: th('industry','산업'),
    price:    th('price',   '현재가'),
    ret:      th('ret',     '등락률'),
    rev:      th('rev',     '매출'),
    op:       th('op',      '영업이익'),
    roe:      th('roe',     'ROE'),
    opm:      th('opm',     'OPM'),
    cap:      th('cap',     '시총'),
    watch:    th('watch',   '<span style="color:#4a9eff">●</span> 관심가'),
    target:   th('target',  '<span style="color:#a78bfa">●</span> 목표가 · 업사이드'),
    cost:     th('pnl',     '<span style="color:var(--accent)">●</span> 평단 · 손익'),
    weight:   `<th style="${thStyle};cursor:default">비중</th>`,
    thesis:   `<th style="${thStyle};cursor:default">투자포인트</th>`,
    check:    th('check',   '다음 점검'),
    actions:  `<th style="${thStyle};cursor:default"></th>`,
  };
  // 셀에 data-col 부여 → 좁은 화면에서 CSS로 컬럼별 숨김/고정 (탭별 컬럼 구성 무관)
  const colTag = (html, k) => html.replace(/^<t([hd])/, `<t$1 data-col="${k}"`);
  const header = `<tr>${cols.map(k => colTag(thMap[k], k)).join('')}</tr>`;

  // ── '오늘의 액션' 필터 적용 ──
  const _afCodes = WL.actionFilter === 'stop'    ? stopHitCodes
                 : WL.actionFilter === 'target'  ? targetHitCodes
                 : WL.actionFilter === 'trim'    ? trimZoneCodes
                 : WL.actionFilter === 'buy'     ? buyZoneCodes
                 : WL.actionFilter === 'check'   ? checkDueCodes
                 : WL.actionFilter === 'rebal'   ? rebalCodes
                 : WL.actionFilter === 'journal' ? needJournalCodes : null;
  const visRows = _afCodes ? sorted.filter(w => _afCodes.has(w.stock_code)) : sorted;

  // ── 각 행 ─────────────────────────────────────────────────────────────────
  const tdStyle = 'padding:9px 10px;border-bottom:1px solid var(--border);vertical-align:middle';

  const rows = visRows.map(w => {
    const mkt   = priceMap[w.stock_code] || {};
    const price = mkt.price;
    const chg   = mkt.price_change_rate;
    const cap   = mkt.market_cap;
    const wkRet = mkt.week_return ?? null;
    const moRet = mkt.month_return ?? null;
    const qtRet = mkt.quarter_return ?? null;
    const capEok = cap ? cap / 1e8 : null;
    const rev   = revMap[w.stock_code] ?? null;
    const op    = opMap[w.stock_code]  ?? null;
    const roe   = roeMap[w.stock_code] ?? null;
    const opm   = opmMap[w.stock_code] ?? null;

    // 포지션·손절·목표 도달 판정 (목표가 셀 + 배경색 공용)
    const e = effPos(w);
    const isHolding   = !!(e.avg && e.qty && price);
    const isStopHit   = isHolding && w.stop_price   && price <= w.stop_price;
    const isTargetHit = isHolding && w.target_price && price >= w.target_price;
    const isTrimZone  = isHolding && w.target_price && !isTargetHit && price >= w.target_price * TRIM_ZONE_PCT;

    // 발행주식수 추정 (시총/현재가)
    const shares = (cap && price) ? cap / price : null;
    const capOfPrice = p => {
      if (!shares || !p) return null;
      const eok = p * shares / 1e8;
      if (eok > 50000000) return null; // 5경 이상은 데이터 이상으로 간주
      return fmtEok(eok);
    };

    // ── 관심가 (watch_price): 현재가 대비 갭% ───────────────────────────
    const watchGap = (w.watch_price && price) ? (w.watch_price - price) / price * 100 : null;
    const isAtBuy = w.watch_price && price && price <= w.watch_price;
    let watchCell;
    if (w.watch_price) {
      const gap = watchGap != null ? Math.abs(watchGap).toFixed(1) + '%' : '—';
      const watchCapStr = capOfPrice(w.watch_price);
      if (isAtBuy) {
        watchCell = `<div style="color:var(--buy);font-weight:700;font-size:12px">✅ 매수 구간</div>
                     <div style="font-size:12px;font-weight:600"><span style="font-size:11px;font-weight:700;color:#4a9eff">진입 </span>${w.watch_price.toLocaleString()}원</div>
                     ${watchCapStr ? `<div style="font-size:11px;color:var(--text1)">${watchCapStr}</div>` : ''}`;
      } else {
        watchCell = `<div style="font-size:12px;font-weight:600"><span style="font-size:11px;font-weight:700;color:#4a9eff">진입 </span>${w.watch_price.toLocaleString()}원</div>
                     ${watchCapStr ? `<div style="font-size:11px;color:var(--text1)">${watchCapStr}</div>` : ''}
                     <div style="font-size:11px;color:var(--blue)">▼ ${gap} 하락 시 진입</div>`;
      }
    } else {
      watchCell = `<span style="color:var(--text3);font-size:12px">—</span>`;
    }

    // ── 목표가 · 업사이드 (보유 중 목표 도달 시 🎯 익절 신호) ──────────────
    const upsidePct = (w.target_price && price) ? (w.target_price - price) / price * 100 : null;
    let tgtCell;
    if (w.target_price) {
      const tgtCapStr = capOfPrice(w.target_price);
      let upsideLine;
      if (isTargetHit) {
        const overPct = (price - w.target_price) / w.target_price * 100;
        upsideLine = `<div style="font-size:12px;font-weight:700;color:var(--up)">🎯 목표 도달${overPct>0?` +${overPct.toFixed(1)}%`:''}</div>`;
      } else if (isTrimZone) {
        upsideLine = `<div style="font-size:12px;font-weight:700;color:var(--accent)">✂️ 익절 구간 ${(price/w.target_price*100).toFixed(0)}%</div>
                      <div style="font-size:11px;font-weight:600;color:${chgColor(upsidePct)}">남은 +${upsidePct.toFixed(1)}%</div>`;
      } else {
        upsideLine = `<div style="font-size:12px;font-weight:700;color:${chgColor(upsidePct)}">${upsidePct!=null?(upsidePct>0?'+':'')+upsidePct.toFixed(1)+'%':'—'}</div>`;
      }
      tgtCell = `<div style="font-size:12px;font-weight:600"><span style="font-size:11px;font-weight:700;color:#a78bfa">목표 </span>${w.target_price.toLocaleString()}원</div>
                 ${tgtCapStr ? `<div style="font-size:11px;color:var(--text1)">${tgtCapStr}</div>` : ''}
                 ${upsideLine}`;
    } else {
      tgtCell = `<span style="color:var(--text3);font-size:12px">—</span>`;
    }

    // ── 매수가 · 평가손익 (거래기록 기반 effPos) ──────────────────────────
    let costCell;
    if (e.avg && e.qty && price) {
      const pnlPct = (price - e.avg) / e.avg * 100;
      const color  = chgColor(pnlPct);
      const pnlStr = (pnlPct >= 0 ? '+' : '') + pnlPct.toFixed(1) + '%';
      const stopPct = w.stop_price && price ? (w.stop_price - price) / price * 100 : null;
      costCell = `<div style="font-size:12px"><span style="font-size:11px;font-weight:700;color:var(--accent)">평단 </span>${e.avg.toLocaleString()}원 <span style="color:var(--text2)">· ${e.qty.toLocaleString()}주</span></div>
                  <div style="font-size:12px;font-weight:700;color:${color}">${pnlStr} · ${fmtWon((price-e.avg)*e.qty, true)}</div>
                  ${e.realized ? `<div style="font-size:11px;color:${chgColor(e.realized)}">실현 ${fmtWon(e.realized, true)}</div>` : ''}
                  ${e.creditLoan > 0 ? `<div style="font-size:11px;color:var(--accent)">🔻 신용 융자 ${fmtWon(e.creditLoan)}${e.creditQty?` (${e.creditQty.toLocaleString()}주)`:''}</div>` : ''}
                  ${w.stop_price ? `<div style="font-size:11px;color:${isStopHit?'var(--down)':'var(--text2)'};font-weight:${isStopHit?'700':'400'}">${isStopHit?'⚠️ ':''}손절 ${w.stop_price.toLocaleString()}원${stopPct!=null?` (${stopPct.toFixed(1)}%)`:''}</div>` : ''}`;
    } else if (e.closed) {
      const jr = _journalAvailable ? journalMap[w.stock_code] : null;
      const jName = (w.corp_name || '').replace(/'/g, "\\'");
      const jLine = !_journalAvailable ? ''
        : jr ? `<div style="font-size:11px;color:var(--accent);cursor:pointer" title="복기 보기/수정" onclick="event.stopPropagation();openJournalModal('${w.stock_code}','${jName}')">${_ICO.pen}${'★'.repeat(jr.process_score||0)||'기록'}${jr.lesson?` · ${jr.lesson.length>16?jr.lesson.slice(0,16)+'…':jr.lesson}`:''}</div>`
             : `<div style="font-size:11px;color:var(--text3);cursor:pointer" title="복기 작성" onclick="event.stopPropagation();openJournalModal('${w.stock_code}','${jName}')">${_ICO.pen}복기 필요</div>`;
      costCell = `<div style="font-size:12px;color:var(--text2);font-weight:600">청산 완료</div>
                  <div style="font-size:12px;font-weight:700;color:${chgColor(e.realized)}">실현 ${fmtWon(e.realized, true)}</div>
                  ${jLine}`;
    } else {
      costCell = `<span style="color:var(--text3);font-size:12px">—</span>`;
    }

    // ── 투자포인트 (1개) ─────────────────────────────────────────────────
    const thesisCell = w.thesis_1
      ? `<div style="font-size:12px;color:var(--text1);max-width:200px;white-space:normal;line-height:1.4">${w.thesis_1}</div>
         ${w.thesis_2 ? `<div style="font-size:11px;color:var(--text2);margin-top:2px;max-width:200px;white-space:normal">${w.thesis_2}</div>` : ''}`
      : `<span style="color:var(--text3);font-size:12px">—</span>`;

    // ── 다음 점검일 ──────────────────────────────────────────────────────
    let checkCell = `<span style="color:var(--text3);font-size:12px">—</span>`;
    if (w.next_check_date) {
      const daysLeft = Math.ceil((new Date(w.next_check_date) - new Date()) / 86400000);
      const dateColor = daysLeft <= 3 ? 'var(--accent)' : daysLeft < 0 ? 'var(--down)' : 'var(--text2)';
      checkCell = `<div style="font-size:12px;color:${dateColor};font-weight:${daysLeft<=3?'700':'400'}">${w.next_check_date}</div>
                   <div style="font-size:11px;color:${dateColor}">${daysLeft<0?`${Math.abs(daysLeft)}일 초과`:daysLeft===0?'오늘':`D-${daysLeft}`}</div>`;
    }

    // ── 행 배경: 손절 도달(적색) > 목표 도달(호박색) > 매수 구간(녹색) ─────
    const baseBg = isStopHit ? 'rgba(255,59,92,.08)' : isTargetHit ? 'rgba(240,165,0,.07)' : isAtBuy ? 'rgba(0,192,135,.05)' : '';
    const rowBg = baseBg ? `background:${baseBg}` : '';
    const nameEsc = (w.corp_name || '').replace(/'/g, "\\'");

    // 비중 (총자산 대비)
    const wPct = (valMap[w.stock_code] && totalAssets) ? valMap[w.stock_code] / totalAssets * 100 : null;
    const cat = wlCategory(w); // 표시용 그룹 (전량 매도 시 '청산' 파생)

    // ── 비중 셀: 현재 비중 + (목표 설정 시) 목표·갭·필요 매매금액 ──
    const tw = targetWeights[w.stock_code];
    let weightCell;
    if (wPct == null) {
      weightCell = tw != null
        ? `<div style="font-size:11px;color:var(--text2)">목표 ${tw.toFixed(1)}%</div><div style="font-size:11px;color:var(--text3)">미보유</div>`
        : `<span style="color:var(--text3);font-size:12px">—</span>`;
    } else if (tw != null) {
      const gap      = wPct - tw;                         // +면 초과, -면 미달
      const tradeAmt = (tw - wPct) / 100 * totalAssets;   // +면 매수, -면 매도 필요
      const balanced = Math.abs(gap) < 1;                 // 1%p 이내면 균형
      const action   = balanced ? '✓ 균형'
        : tradeAmt > 0 ? `매수 ${fmtWon(tradeAmt)}` : `매도 ${fmtWon(-tradeAmt)}`;
      weightCell = `<div style="font-size:13px;font-weight:700">${wPct.toFixed(1)}%</div>
        <div style="font-size:11px;color:var(--text2)">목표 ${tw.toFixed(1)}%</div>
        <div style="font-size:11px;font-weight:600;color:${balanced?'var(--up)':'var(--accent)'}">${gap>=0?'+':''}${gap.toFixed(1)}%p · ${action}</div>`;
    } else {
      weightCell = `<div style="font-size:13px;font-weight:700">${wPct.toFixed(1)}%</div>
        <div style="font-size:11px;color:var(--text2)">총자산 대비</div>`;
    }

    const tdMap = {
      name: `<td style="${tdStyle}">
        <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
          <span style="font-size:15px;font-weight:700">${w.corp_name}</span>
          <span style="font-size:11px;padding:1px 6px;border-radius:100px;background:${groupColors[cat]||'#888'};color:${groupTextColors[cat]||'#111'};font-weight:700">${cat}</span>
        </div>
        ${w.catalyst ? `<div style="font-size:11px;color:var(--tg);margin-top:2px">⚡ ${w.catalyst}</div>` : ''}
      </td>`,
      industry: `<td style="${tdStyle}"><div style="font-size:12px;color:var(--text1)">${industryMap[w.stock_code] || w.industry || '—'}</div></td>`,
      price: `<td style="${tdStyle}">
        <div style="font-size:13px;font-weight:700">${fmtPrice(price)}</div>
        <div style="font-size:11px;font-weight:600;color:${chgColor(chg)}">${chg!=null?(chg>=0?'+':'')+chg.toFixed(2)+'%':''}</div>
      </td>`,
      ret: `<td style="${tdStyle}">
        ${[['1주',wkRet],['1개월',moRet],['3개월',qtRet]].map(([lbl,v]) =>
          `<div style="display:flex;justify-content:space-between;gap:8px;font-size:11px;line-height:1.6">
             <span style="color:var(--text2)">${lbl}</span>
             ${v!=null ? `<span style="font-weight:600;color:${chgColor(v)}">${v>=0?'+':''}${v.toFixed(1)}%</span>` : `<span style="color:var(--text3)">—</span>`}
           </div>`
        ).join('')}
      </td>`,
      rev: `<td style="${tdStyle}"><div style="font-size:12px;font-weight:600">${rev!=null ? fmtEok(rev/1e8) : '—'}</div></td>`,
      op:  `<td style="${tdStyle}"><div style="font-size:12px;font-weight:600;color:${op!=null?chgColor(op):'inherit'}">${op!=null ? fmtEok(op/1e8) : '—'}</div></td>`,
      roe: `<td style="${tdStyle}"><div style="font-size:12px;font-weight:600;color:${roe!=null?chgColor(roe):'inherit'}">${roe!=null ? roe.toFixed(1)+'%' : '—'}</div></td>`,
      opm: `<td style="${tdStyle}"><div style="font-size:12px;font-weight:600;color:${opm!=null&&opm>=0?chgColor(opm):'inherit'}">${opm!=null&&opm>=0 ? opm.toFixed(1)+'%' : '—'}</div></td>`,
      cap: `<td style="${tdStyle}"><div style="font-size:12px;font-weight:600">${capEok ? fmtEok(capEok) : '—'}</div></td>`,
      watch: `<td class="wl-editable" style="${tdStyle};border-left:2px solid #4a9eff" title="더블클릭으로 편집" ondblclick="wlInlineEdit(this,${w.id},'watch_price',${w.watch_price||'null'},'number')">${watchCell}</td>`,
      target: `<td class="wl-editable" style="${tdStyle};border-left:2px solid #a78bfa" title="더블클릭으로 편집" ondblclick="wlInlineEdit(this,${w.id},'target_price',${w.target_price||'null'},'number')">${tgtCell}</td>`,
      cost: `<td class="${e.hasTx?'':'wl-editable'}" style="${tdStyle};border-left:2px solid var(--accent)" title="${e.hasTx?'거래기록으로 자동 계산 — 더블클릭 시 이력':'더블클릭으로 편집'}"
        ondblclick="${e.hasTx?`openTradeHistory('${w.stock_code}','${nameEsc}')`:`wlInlineEditCost(this,${w.id},${w.avg_price||'null'},${w.quantity||'null'})`}">${costCell}</td>`,
      weight: `<td class="wl-editable" style="${tdStyle}" title="더블클릭으로 목표 비중 설정" ondblclick="wlEditTargetWeight(this,'${w.stock_code}',${tw ?? 'null'})">${weightCell}</td>`,
      thesis: `<td class="wl-editable" style="${tdStyle};max-width:210px" title="더블클릭으로 편집" ondblclick="wlInlineEdit(this,${w.id},'thesis_1',${JSON.stringify(w.thesis_1||'')},'text')">${thesisCell}</td>`,
      check: `<td class="wl-editable" style="${tdStyle}" title="더블클릭으로 편집" ondblclick="wlInlineEdit(this,${w.id},'next_check_date',${JSON.stringify(w.next_check_date||'')},'date')">${checkCell}</td>`,
      actions: `<td style="${tdStyle};white-space:nowrap">
        <div style="display:flex;gap:4px;align-items:center;position:relative">
          <button class="btn btn-sm" style="color:var(--buy);font-weight:700" title="매수 기록"
            onclick="openTradeModal(${w.id},'${w.stock_code}','${nameEsc}','buy',${price||'null'})">매수</button>
          <button class="btn btn-sm" style="color:var(--sell);font-weight:700" title="매도 기록"
            onclick="openTradeModal(${w.id},'${w.stock_code}','${nameEsc}','sell',${price||'null'})">매도</button>
          <button class="btn btn-sm" title="더보기"
            onclick="wlToggleRowMenu(this,${w.id},'${w.stock_code}','${nameEsc}',${e.hasTx},${e.closed})">⋯</button>
        </div>
      </td>`,
    };

    return `<tr style="cursor:pointer;${rowBg}" onclick="wlOpenDrawer(event,'${w.stock_code}')" onmouseover="this.style.background='rgba(255,255,255,.02)'" onmouseout="this.style.background='${baseBg}'">${cols.map(k => colTag(tdMap[k], k)).join('')}</tr>`;
  }).join('');

  // 색점 범례 — 헤더 ●가 가리키는 가격 컬럼의 의미 (표시 중인 컬럼만)
  const _legendItems = [
    cols.includes('watch')  ? '<span><span style="color:#4a9eff">●</span> 관심가 · 진입 대기 기준</span>' : '',
    cols.includes('target') ? '<span><span style="color:#a78bfa">●</span> 목표가 · 익절 기준(업사이드)</span>' : '',
    cols.includes('cost')   ? '<span><span style="color:var(--accent)">●</span> 평단 · 보유 원가(손익)</span>' : '',
  ].filter(Boolean);
  const _legend = _legendItems.length
    ? `<div style="display:flex;gap:14px;flex-wrap:wrap;padding:6px 4px 0;font-size:11px;color:var(--text3)">${_legendItems.join('')}</div>` : '';

  listEl.innerHTML = `${pipeBar}
    <div class="card" style="overflow-x:auto;padding:0">
      <table class="wl-table" style="width:100%;border-collapse:collapse">
        <thead>${header}</thead>
        <tbody>${rows}</tbody>
      </table>
    </div>${_legend}`;
}

// ── 인라인 편집 ──────────────────────────────────────────────────────────────
async function wlInlineEdit(td, id, field, curVal, type = 'number') {
  if (td.querySelector('input,textarea')) return; // 이미 편집 중
  const isDate = type === 'date';
  const isText = type === 'text';

  const el = document.createElement(isText ? 'textarea' : 'input');
  el.type = isDate ? 'date' : isText ? undefined : 'number';
  el.value = curVal ?? '';
  el.style.cssText = `width:100%;box-sizing:border-box;background:var(--bg2);color:var(--text1);
    border:1px solid var(--tg);border-radius:4px;padding:4px 6px;font-size:12px;
    ${isText ? 'height:60px;resize:vertical' : ''}`;

  td.innerHTML = '';
  td.appendChild(el);
  el.focus();
  if (!isDate) el.select();

  const save = async () => {
    let val = el.value.trim();
    if (val === String(curVal ?? '')) { loadWatchlist(); return; } // 변경 없음
    const payload = {};
    if (type === 'number') payload[field] = val ? parseFloat(val) : null;
    else payload[field] = val || null;
    payload.updated_at = new Date().toISOString();
    await sb.from('watchlist').update(payload).eq('id', id);
    loadWatchlist();
  };

  el.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !isText) { e.preventDefault(); save(); }
    if (e.key === 'Escape') loadWatchlist();
  });
  if (isDate) {
    el.addEventListener('change', save); // date picker는 change 이벤트로 저장
  } else {
    el.addEventListener('blur', save);
  }
}

// 목표 비중(%) 인라인 편집 — app_config에 저장 (빈 값/0이면 목표 해제)
async function wlEditTargetWeight(td, stockCode, curWeight) {
  if (td.querySelector('input')) return;
  const prev = td.innerHTML;
  td.innerHTML = `<div style="display:flex;align-items:center;gap:3px">
    <input id="_ieTw" type="number" step="0.5" min="0" max="100" value="${curWeight ?? ''}" placeholder="목표"
      style="width:54px;box-sizing:border-box;background:var(--bg2);color:var(--text1);border:1px solid var(--tg);border-radius:4px;padding:3px 5px;font-size:12px">
    <span style="font-size:11px;color:var(--text2)">%</span>
  </div>`;
  const el = document.getElementById('_ieTw');
  el.focus(); el.select();
  let done = false;
  const save = () => {
    if (done) return; done = true;
    const v = el.value.trim();
    if (v === String(curWeight ?? '')) { loadWatchlist(); return; } // 변경 없음
    saveTargetWeight(stockCode, v === '' ? null : parseFloat(v));
  };
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); save(); }
    if (e.key === 'Escape') { done = true; td.innerHTML = prev; }
  });
  el.addEventListener('blur', save);
}

async function wlInlineEditCost(td, id, curAvg, curQty) {
  if (td.querySelector('input')) return;
  td.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:4px">
      <div>
        <div style="font-size:11px;color:var(--text2);margin-bottom:2px">매수가 (원)</div>
        <input id="_ieCost" type="number" value="${curAvg||''}" placeholder="매수가"
          style="width:100%;box-sizing:border-box;background:var(--bg2);color:var(--text1);border:1px solid var(--tg);border-radius:4px;padding:3px 6px;font-size:12px">
      </div>
      <div>
        <div style="font-size:11px;color:var(--text2);margin-bottom:2px">수량 (주)</div>
        <input id="_ieQty" type="number" value="${curQty||''}" placeholder="수량"
          style="width:100%;box-sizing:border-box;background:var(--bg2);color:var(--text1);border:1px solid var(--tg);border-radius:4px;padding:3px 6px;font-size:12px">
      </div>
    </div>`;
  const costEl = document.getElementById('_ieCost');
  const qtyEl  = document.getElementById('_ieQty');
  costEl.focus();

  let saved = false;
  const save = async () => {
    if (saved) return;
    saved = true;
    const avg = costEl.value.trim();
    const qty = qtyEl.value.trim();
    if (avg === String(curAvg??'') && qty === String(curQty??'')) { loadWatchlist(); return; }
    await sb.from('watchlist').update({
      avg_price: avg ? parseFloat(avg) : null,
      quantity:  qty ? parseInt(qty)   : null,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    loadWatchlist();
  };

  [costEl, qtyEl].forEach(el => {
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); save(); }
      if (e.key === 'Escape') loadWatchlist();
    });
    el.addEventListener('blur', () => setTimeout(save, 150)); // 다른 필드 클릭 허용
  });
}

function wlSortBy(key) {
  if (WL.sort.key === key) {
    WL.sort.asc = !WL.sort.asc;
  } else {
    WL.sort = { key, asc: true };
  }
  loadWatchlist();
}

// 행 더보기 메뉴 (이력 / 수정 / 삭제)
function wlToggleRowMenu(btn, id, code, name, hasTx, isClosed) {
  const open = btn.parentElement.querySelector('.wl-rowmenu');
  document.querySelectorAll('.wl-rowmenu').forEach(m => m.remove());
  if (open) return; // 토글 닫기
  const menu = document.createElement('div');
  menu.className = 'wl-rowmenu';
  menu.style.cssText = 'position:absolute;right:0;top:calc(100% + 4px);z-index:60;background:var(--bg1,var(--bg));border:1px solid var(--border2);border-radius:8px;box-shadow:0 6px 16px rgba(0,0,0,.4);min-width:120px;overflow:hidden';
  const item = (label, handler, color) =>
    `<div onclick="${handler}" style="padding:9px 14px;font-size:12px;cursor:pointer;color:${color||'var(--text1)'};white-space:nowrap"
       onmouseover="this.style.background='var(--bg2)'" onmouseout="this.style.background=''">${label}</div>`;
  menu.innerHTML =
    (hasTx ? item('거래 이력', `openTradeHistory('${code}','${name}')`) : '') +
    (isClosed && _journalAvailable ? item(_ICO.pen + '복기', `openJournalModal('${code}','${name}')`, 'var(--accent)') : '') +
    item('수정', `openWatchlistModal(${id})`) +
    item('삭제', `deleteWatchlist(${id},'${name}')`, 'var(--red)');
  btn.parentElement.appendChild(menu);
  setTimeout(() => document.addEventListener('click', function close(ev) {
    if (!menu.contains(ev.target) && ev.target !== btn) { menu.remove(); document.removeEventListener('click', close); }
  }), 0);
}

async function deleteWatchlist(id, name) {
  if (!confirm(`${name}을 관심종목에서 삭제할까요?`)) return;
  // 드로어로 보고 있던 종목이면 닫기 (loadWatchlist 후 캐시에서 사라지므로 미리 처리)
  if (WL.drawerCode && WL.cache?.byCode?.[WL.drawerCode]?.id === id) wlCloseDrawer();
  await sb.from('watchlist').delete().eq('id', id);
  loadWatchlist();
}
