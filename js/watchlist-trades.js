// 투자노트 — 거래 기록·포지션 계산·매매 복기·현금/목표비중 저장 (watchlist.js에서 분할)

// =============================================
//  매수 / 매도 거래 기록 (portfolio_transactions)
// =============================================

// 거래 내역 → 현재 포지션(수량/평단/실현손익) 계산 (이동평균법)
function computePosition(txs) {
  let qty = 0, avgCost = 0, realized = 0, buyQty = 0, sellQty = 0;
  // 신용(신용융자) 잔고: 신용매수 금액 누계 − 신용매도(상환) 금액 누계
  let creditBuyAmt = 0, creditSellAmt = 0, creditBuyQty = 0, creditSellQty = 0;
  const sorted = [...txs].sort((a, b) => {
    const d = (a.trade_date || '').localeCompare(b.trade_date || '');
    return d !== 0 ? d : (a.id || 0) - (b.id || 0);
  });
  for (const t of sorted) {
    const px  = Number(t.price)    || 0;
    const q   = Number(t.quantity) || 0;
    const fee = Number(t.fee)      || 0;
    const isCredit = t.trade_method === 'credit';
    if (t.trade_type === 'buy') {
      const totalCost = avgCost * qty + px * q + fee;
      qty += q; buyQty += q;
      avgCost = qty > 0 ? totalCost / qty : 0;
      if (isCredit) { creditBuyAmt += px * q; creditBuyQty += q; }
    } else { // sell — 이동평균 유지, 실현손익만 누적
      const sq = Math.min(q, qty);
      realized += (px - avgCost) * sq - fee;
      qty -= sq; sellQty += sq;
      if (qty <= 0) qty = 0;
      if (isCredit) { creditSellAmt += px * q; creditSellQty += q; } // 신용 상환
    }
  }
  return {
    qty, avgCost: Math.round(avgCost), realized: Math.round(realized), buyQty, sellQty, count: txs.length,
    creditLoan: Math.max(0, Math.round(creditBuyAmt - creditSellAmt)), // 신용융자 잔고(원)
    creditQty:  Math.max(0, creditBuyQty - creditSellQty),             // 신용으로 보유 중인 수량
  };
}

let _wlTxAvailable = true; // portfolio_transactions 테이블 존재 여부 (없으면 수동 평단 모드)

// 종목들의 거래내역 일괄 조회 → { stock_code: [txs] }
async function fetchTransactions(codes) {
  if (!codes.length || !_wlTxAvailable) return {};
  try {
    const { data, error } = await sb.from('portfolio_transactions')
      .select('*')
      .in('stock_code', codes)
      .order('trade_date', { ascending: true });
    if (error) throw error;
    const map = {};
    (data || []).forEach(t => { (map[t.stock_code] = map[t.stock_code] || []).push(t); });
    return map;
  } catch (e) {
    _wlTxAvailable = false;
    console.warn('portfolio_transactions 테이블 미설정 — 수동 평단 모드로 동작:', e?.message || e);
    return {};
  }
}

// =============================================
//  매매 복기 (트레이드 저널) — trade_journal 테이블
// =============================================

// 거래내역 → 라운드트립 복기 지표 (보유기간·진입/청산가·수익률)
function computeRoundTrip(txs) {
  const pos = computePosition(txs);
  let buyAmt = 0, buyQty = 0, sellAmt = 0, sellQty = 0, buyCost = 0;
  let firstBuy = null, lastSell = null;
  const sorted = [...txs].sort((a, b) =>
    (a.trade_date || '').localeCompare(b.trade_date || '') || (a.id || 0) - (b.id || 0));
  for (const t of sorted) {
    const px = Number(t.price) || 0, q = Number(t.quantity) || 0, fee = Number(t.fee) || 0;
    if (t.trade_type === 'buy') {
      buyAmt += px * q; buyQty += q; buyCost += px * q + fee;
      if (!firstBuy) firstBuy = t.trade_date;
    } else {
      sellAmt += px * q; sellQty += q; lastSell = t.trade_date;
    }
  }
  return {
    ...pos,
    avgBuy:    buyQty  ? Math.round(buyAmt / buyQty)   : null,
    avgSell:   sellQty ? Math.round(sellAmt / sellQty) : null,
    returnPct: buyCost ? pos.realized / buyCost * 100  : null,
    holdDays:  (firstBuy && lastSell) ? Math.max(0, Math.round((new Date(lastSell) - new Date(firstBuy)) / 86400000)) : null,
    closedDate: lastSell,
  };
}

let _journalAvailable = true; // trade_journal 테이블 존재 여부 (없으면 복기 기능 비활성)

// 종목들의 복기 일괄 조회 → { stock_code: journal } (종목당 최신 1건)
async function fetchJournals(codes) {
  if (!codes.length || !_journalAvailable) return {};
  try {
    const { data, error } = await sb.from('trade_journal')
      .select('*').in('stock_code', codes).order('updated_at', { ascending: false });
    if (error) throw error;
    const map = {};
    (data || []).forEach(j => { if (!map[j.stock_code]) map[j.stock_code] = j; });
    return map;
  } catch (e) {
    _journalAvailable = false;
    console.warn('trade_journal 테이블 미설정 — 복기 기능 비활성:', e?.message || e);
    return {};
  }
}

async function saveJournal(payload) {
  try {
    const { data: existing } = await sb.from('trade_journal')
      .select('id').eq('stock_code', payload.stock_code)
      .order('updated_at', { ascending: false }).limit(1);
    payload.updated_at = new Date().toISOString();
    let error;
    if (existing?.[0]?.id) ({ error } = await sb.from('trade_journal').update(payload).eq('id', existing[0].id));
    else                   ({ error } = await sb.from('trade_journal').insert(payload));
    if (error) throw error;
  } catch (e) {
    alert('복기 저장 실패 — trade_journal 테이블이 필요합니다.\n\n'
      + 'Supabase SQL Editor에서 sql/trade_journal.sql 을 1회 실행하세요.\n\n' + (e?.message || e));
    return;
  }
  document.getElementById('m-journal')?.remove();
  loadWatchlist();
}

// 복기 모달 — 자동 지표 + 회고 입력
async function openJournalModal(stockCode, corpName) {
  document.getElementById('m-journal')?.remove();
  const nm = escJsStr(corpName || '');

  const { data: txs } = await sb.from('portfolio_transactions')
    .select('*').eq('stock_code', stockCode).order('trade_date', { ascending: true });
  const rt = computeRoundTrip(txs || []);
  const { data: wlRows } = await sb.from('watchlist')
    .select('id,thesis_1,risk_1,target_price,stop_price').eq('stock_code', stockCode).limit(1);
  const w = wlRows?.[0] || {};
  let j = {};
  if (_journalAvailable) {
    try {
      const { data: jr } = await sb.from('trade_journal')
        .select('*').eq('stock_code', stockCode).order('updated_at', { ascending: false }).limit(1);
      j = jr?.[0] || {};
    } catch (e) { _journalAvailable = false; }
  }

  // 거래내역이 나중에 바뀌어도 복기 시점 값 보존 (저장 스냅샷)
  WL.journalSnap = {
    watchlist_id: w.id || null,
    closed_date:  rt.closedDate || null,
    realized:     rt.realized ?? null,
    return_pct:   rt.returnPct != null ? Math.round(rt.returnPct * 10) / 10 : null,
    hold_days:    rt.holdDays ?? null,
    avg_buy:      rt.avgBuy ?? null,
    avg_sell:     rt.avgSell ?? null,
    thesis:       w.thesis_1 || null,
  };

  const targetHitPct = (w.target_price && rt.avgSell) ? rt.avgSell / w.target_price * 100 : null;
  const reasons = ['목표 달성','손절 룰','펀더멘털 훼손','더 좋은 기회','패닉·감정','자금 필요','기타'];
  const auto = (label, val, color = 'var(--text1)') =>
    `<div style="flex:1;min-width:90px;background:var(--bg2);border-radius:8px;padding:8px 10px">
       <div style="font-size:11px;color:var(--text2)">${label}</div>
       <div style="font-size:14px;font-weight:700;color:${color}">${val}</div></div>`;

  const overlay = document.createElement('div');
  overlay.id = 'm-journal';
  overlay.className = 'modal-overlay open';
  overlay.innerHTML = `
    <div class="modal" style="width:520px;max-width:95vw;max-height:90vh;overflow-y:auto">
      <div class="modal-header">
        <span class="modal-title">${escapeHtml(corpName)} · ${_ICO.pen}매매 복기</span>
        <button class="modal-close" onclick="document.getElementById('m-journal').remove()">×</button>
      </div>
      <div style="padding:1.25rem;display:flex;flex-direction:column;gap:14px">
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${auto('실현손익', rt.realized!=null?fmtWon(rt.realized,true):'—', chgColor(rt.realized))}
          ${auto('수익률', rt.returnPct!=null?`${rt.returnPct>=0?'+':''}${rt.returnPct.toFixed(1)}%`:'—', chgColor(rt.returnPct))}
          ${auto('보유기간', rt.holdDays!=null?`${rt.holdDays}일`:'—')}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${auto('진입 → 청산', `${rt.avgBuy?rt.avgBuy.toLocaleString():'—'} → ${rt.avgSell?rt.avgSell.toLocaleString():'—'}`)}
          ${auto('목표가 대비', targetHitPct!=null?`${targetHitPct.toFixed(0)}% 도달`:'—')}
        </div>
        ${w.thesis_1 ? `<div style="font-size:12px;background:var(--bg3);border-radius:6px;padding:8px 10px;line-height:1.5">
          <span style="color:var(--text2)">당시 근거 · </span>${escapeHtml(w.thesis_1)}${w.risk_1?`<br><span style="color:var(--text2)">리스크 · </span>${escapeHtml(w.risk_1)}`:''}</div>` : ''}
        <div>
          <div style="font-size:12px;color:var(--text1);margin-bottom:4px">매도 사유</div>
          <select class="form-select" id="j-reason" style="width:100%">
            <option value="">선택…</option>
            ${reasons.map(r=>`<option value="${r}" ${j.sell_reason===r?'selected':''}>${r}</option>`).join('')}
          </select>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <div style="font-size:12px;color:var(--text1);margin-bottom:4px">잘한 점</div>
            <textarea class="form-input" id="j-well" placeholder="예: 분할 매수로 평단 낮춤" style="width:100%;box-sizing:border-box;height:54px;resize:vertical">${escapeHtml(j.did_well||'')}</textarea>
          </div>
          <div>
            <div style="font-size:12px;color:var(--text1);margin-bottom:4px">아쉬운 점</div>
            <textarea class="form-input" id="j-poorly" placeholder="예: 목표 직전 조기 청산" style="width:100%;box-sizing:border-box;height:54px;resize:vertical">${escapeHtml(j.did_poorly||'')}</textarea>
          </div>
        </div>
        <div>
          <div style="font-size:12px;color:var(--text1);margin-bottom:4px">교훈 (다음 거래에 적용)</div>
          <input type="text" class="form-input" id="j-lesson" placeholder="예: 목표가 80%부터 분할 매도 룰화" value="${escAttr(j.lesson||'')}" style="width:100%;box-sizing:border-box">
        </div>
        <div>
          <div style="font-size:12px;color:var(--text1);margin-bottom:4px">프로세스 점수 <span style="color:var(--text2);font-weight:400">(결과와 무관하게 판단·실행의 질)</span></div>
          <span id="j-stars">${[1,2,3,4,5].map(n=>`<span onclick="_setJournalScore(${n})" data-star="${n}" style="cursor:pointer;font-size:22px;color:${(j.process_score||0)>=n?'var(--accent)':'var(--text3)'}">★</span>`).join('')}</span>
          <input type="hidden" id="j-process" value="${j.process_score||''}">
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn" onclick="document.getElementById('m-journal').remove()">취소</button>
          <button class="btn btn-primary" onclick="saveJournalFromForm('${stockCode}','${nm}')">복기 저장</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

function _setJournalScore(n) {
  const inp = document.getElementById('j-process'); if (inp) inp.value = n;
  document.querySelectorAll('#j-stars [data-star]').forEach(s => {
    s.style.color = Number(s.dataset.star) <= n ? 'var(--accent)' : 'var(--text3)';
  });
}

function saveJournalFromForm(stockCode, corpName) {
  const g = id => document.getElementById(id)?.value?.trim() || null;
  const snap = WL.journalSnap || {};
  saveJournal({
    stock_code:    stockCode,
    corp_name:     corpName,
    watchlist_id:  snap.watchlist_id || null,
    closed_date:   snap.closed_date || null,
    sell_reason:   g('j-reason'),
    did_well:      g('j-well'),
    did_poorly:    g('j-poorly'),
    lesson:        g('j-lesson'),
    process_score: parseInt(document.getElementById('j-process')?.value) || null,
    realized:      snap.realized ?? null,
    return_pct:    snap.return_pct ?? null,
    hold_days:     snap.hold_days ?? null,
    avg_buy:       snap.avg_buy ?? null,
    avg_sell:      snap.avg_sell ?? null,
    thesis:        snap.thesis || null,
  });
}

// 매수/매도 입력 모달
function openTradeModal(watchlistId, stockCode, corpName, type, curPrice) {
  document.getElementById('m-trade')?.remove();
  const isBuy = type === 'buy';
  const today = todayStr();
  const nm = escJsStr(corpName || '');
  WL.tradeType = type; // _tradePreview에서 신용 안내 분기용
  const overlay = document.createElement('div');
  overlay.id = 'm-trade';
  overlay.className = 'modal-overlay open';
  overlay.innerHTML = `
    <div class="modal" style="width:430px;max-width:94vw">
      <div class="modal-header">
        <span class="modal-title">${escapeHtml(corpName)} · <span style="color:${isBuy?'var(--buy)':'var(--sell)'}">${isBuy ? '매수' : '매도'}</span> 기록</span>
        <button class="modal-close" onclick="document.getElementById('m-trade').remove()">×</button>
      </div>
      <div style="padding:1.25rem;display:flex;flex-direction:column;gap:12px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <div style="font-size:12px;color:var(--text1);margin-bottom:4px">거래일</div>
            <input type="date" class="form-input" id="trade-date" value="${today}" style="width:100%;box-sizing:border-box">
          </div>
          <div>
            <div style="font-size:12px;color:var(--text1);margin-bottom:4px">${isBuy?'매수':'매도'}가 (원)</div>
            <input type="number" class="form-input" id="trade-price" value="${curPrice||''}" placeholder="체결가"
              oninput="_tradePreview()" style="width:100%;box-sizing:border-box">
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <div style="font-size:12px;color:var(--text1);margin-bottom:4px">수량 (주)</div>
            <input type="number" class="form-input" id="trade-qty" placeholder="수량"
              oninput="_tradePreview()" style="width:100%;box-sizing:border-box">
          </div>
          <div>
            <div style="font-size:12px;color:var(--text1);margin-bottom:4px">수수료·세금 (원)</div>
            <input type="number" class="form-input" id="trade-fee" value="0"
              oninput="_tradePreview()" style="width:100%;box-sizing:border-box">
          </div>
        </div>
        <div>
          <div style="font-size:12px;color:var(--text1);margin-bottom:4px">거래 구분</div>
          <div style="display:flex;gap:6px">
            <button type="button" id="tm-cash"   onclick="_setTradeMethod('cash')"   style="flex:1;padding:7px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;border:1px solid var(--tg);background:var(--tg);color:#fff">현금</button>
            <button type="button" id="tm-credit" onclick="_setTradeMethod('credit')" style="flex:1;padding:7px;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;font-family:inherit;border:1px solid var(--border2);background:var(--bg3);color:var(--text1)">신용 ${isBuy?'(융자 매수)':'(상환 매도)'}</button>
          </div>
          <input type="hidden" id="trade-method" value="cash">
        </div>
        <div>
          <div style="font-size:12px;color:var(--text1);margin-bottom:4px">메모 (선택)</div>
          <input type="text" class="form-input" id="trade-memo" placeholder="예: 분할 1차, 실적 발표 후"
            style="width:100%;box-sizing:border-box">
        </div>
        <div id="trade-preview" style="font-size:12px;color:var(--text2);background:var(--bg2);border-radius:6px;padding:8px 12px"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn" onclick="document.getElementById('m-trade').remove()">취소</button>
          <button class="btn btn-primary" style="background:${isBuy?'var(--buy)':'var(--sell)'};border-color:transparent;color:#fff"
            onclick="saveTrade(${watchlistId},'${stockCode}','${nm}','${type}')">${isBuy?'매수 기록':'매도 기록'}</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.getElementById('trade-qty').focus();
  _tradePreview();
}

// 거래 구분(현금/신용) 토글
function _setTradeMethod(m) {
  const inp = document.getElementById('trade-method'); if (inp) inp.value = m;
  const cash = document.getElementById('tm-cash'), credit = document.getElementById('tm-credit');
  const on  = el => { el.style.background = 'var(--tg)'; el.style.borderColor = 'var(--tg)'; el.style.color = '#fff'; el.style.fontWeight = '700'; };
  const off = el => { el.style.background = 'var(--bg3)'; el.style.borderColor = 'var(--border2)'; el.style.color = 'var(--text1)'; el.style.fontWeight = '500'; };
  if (cash && credit) { (m === 'cash' ? on : off)(cash); (m === 'credit' ? on : off)(credit); }
  _tradePreview();
}

function _tradePreview() {
  const price  = parseFloat(document.getElementById('trade-price')?.value) || 0;
  const qty    = parseFloat(document.getElementById('trade-qty')?.value)   || 0;
  const fee    = parseFloat(document.getElementById('trade-fee')?.value)   || 0;
  const method = document.getElementById('trade-method')?.value || 'cash';
  const isBuy  = WL.tradeType !== 'sell';
  const el = document.getElementById('trade-preview');
  if (!el) return;
  if (!price || !qty) { el.textContent = '체결가와 수량을 입력하면 거래대금이 계산됩니다.'; return; }
  const amt = price * qty + fee;
  const creditNote = method === 'credit'
    ? `<div style="margin-top:4px;color:var(--accent)">🔻 신용 ${isBuy ? `융자금 ${Math.round(price*qty).toLocaleString()}원 발생` : `상환 ${Math.round(price*qty).toLocaleString()}원`} (이자는 비용란에)</div>`
    : '';
  el.innerHTML = `거래대금 <b style="color:var(--text1)">${Math.round(amt).toLocaleString()}원</b>
    <span style="color:var(--text3)">(${qty.toLocaleString()}주 × ${price.toLocaleString()}원${fee?` + 비용 ${fee.toLocaleString()}원`:''})</span>${creditNote}`;
}

async function saveTrade(watchlistId, stockCode, corpName, type) {
  const price = parseFloat(document.getElementById('trade-price')?.value);
  const qty   = parseInt(document.getElementById('trade-qty')?.value);
  const fee   = parseFloat(document.getElementById('trade-fee')?.value) || 0;
  const date  = document.getElementById('trade-date')?.value;
  const memo  = document.getElementById('trade-memo')?.value?.trim() || null;
  const method = document.getElementById('trade-method')?.value === 'credit' ? 'credit' : 'cash';
  if (!price || !qty || qty <= 0) { alert('체결가와 수량을 정확히 입력해주세요.'); return; }
  if (!date) { alert('거래일을 입력해주세요.'); return; }

  const payload = {
    watchlist_id: watchlistId, stock_code: stockCode, corp_name: corpName,
    trade_type: type, trade_date: date, price, quantity: qty, fee, memo, trade_method: method,
  };
  let { error } = await sb.from('portfolio_transactions').insert(payload);
  // trade_method 컬럼이 아직 없으면(구 스키마) 제외하고 재시도 — 거래는 보존
  if (error && /trade_method/i.test(error.message || '')) {
    delete payload.trade_method;
    ({ error } = await sb.from('portfolio_transactions').insert(payload));
    if (!error && method === 'credit')
      alert('거래는 저장됐지만 신용 구분은 기록되지 않았습니다.\nSupabase SQL Editor에서 sql/portfolio_transactions.sql 을 다시 실행하면 신용 거래가 추적됩니다.');
  }
  if (error) {
    alert('거래 기록 저장 실패 — portfolio_transactions 테이블이 필요합니다.\n\n' + error.message);
    return;
  }

  await syncPositionToWatchlist(watchlistId, stockCode); // 평단·수량·그룹 캐시 갱신
  document.getElementById('m-trade')?.remove();
  loadWatchlist();
}

// 거래내역 기반 포지션을 watchlist 행에 반영 (avg_price/quantity/group 캐시 동기화)
async function syncPositionToWatchlist(watchlistId, stockCode) {
  let wid = watchlistId;
  if (!wid && stockCode) {
    const { data } = await sb.from('watchlist').select('id').eq('stock_code', stockCode).limit(1);
    wid = data?.[0]?.id;
  }
  if (!wid) return;
  const { data: txs } = await sb.from('portfolio_transactions')
    .select('*').eq('stock_code', stockCode).order('trade_date', { ascending: true });
  const pos = computePosition(txs || []);
  const patch = {
    avg_price:  pos.qty > 0 ? pos.avgCost : null,
    quantity:   pos.qty > 0 ? pos.qty     : null,
    updated_at: new Date().toISOString(),
  };
  if (pos.qty > 0) patch.group_name = '보유중';
  await sb.from('watchlist').update(patch).eq('id', wid);
}

// 거래 이력 조회 모달
async function openTradeHistory(stockCode, corpName) {
  document.getElementById('m-tradehist')?.remove();
  const nm = escJsStr(corpName);
  const overlay = document.createElement('div');
  overlay.id = 'm-tradehist';
  overlay.className = 'modal-overlay open';
  overlay.innerHTML = `
    <div class="modal" style="width:600px;max-width:96vw;max-height:88vh;overflow-y:auto">
      <div class="modal-header">
        <span class="modal-title">${escapeHtml(corpName)} · 거래 이력</span>
        <button class="modal-close" onclick="document.getElementById('m-tradehist').remove()">×</button>
      </div>
      <div id="tradehist-body" style="padding:1.25rem">
        <div style="text-align:center;color:var(--text2)"><span class="loading"></span></div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  const { data: txs, error } = await sb.from('portfolio_transactions')
    .select('*').eq('stock_code', stockCode)
    .order('trade_date', { ascending: false }).order('id', { ascending: false });
  const body = document.getElementById('tradehist-body');
  if (!body) return;
  if (error)        { body.innerHTML = `<div style="color:var(--red)">조회 실패: ${error.message}</div>`; return; }
  if (!txs?.length) { body.innerHTML = `<div style="color:var(--text2);text-align:center;padding:1rem">거래 내역이 없습니다.</div>`; return; }

  const pos = computePosition(txs);
  const rows = txs.map(t => {
    const isBuy = t.trade_type === 'buy';
    const amt = Number(t.price) * Number(t.quantity) + (Number(t.fee) || 0);
    return `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:7px 8px;font-size:12px">${t.trade_date}</td>
      <td style="padding:7px 8px;font-size:12px;font-weight:700;color:${isBuy?'var(--buy)':'var(--sell)'}">${isBuy?'매수':'매도'}${t.trade_method==='credit'?` <span style="font-size:11px;padding:1px 4px;border-radius:3px;background:var(--accent);color:#1b1300;font-weight:700">신용</span>`:''}</td>
      <td style="padding:7px 8px;font-size:12px;text-align:right">${Number(t.price).toLocaleString()}원</td>
      <td style="padding:7px 8px;font-size:12px;text-align:right">${Number(t.quantity).toLocaleString()}주</td>
      <td style="padding:7px 8px;font-size:12px;text-align:right">${Math.round(amt).toLocaleString()}원</td>
      <td style="padding:7px 8px;font-size:11px;color:var(--text2)">${escapeHtml(t.memo||'')}</td>
      <td style="padding:7px 8px;text-align:right">
        <button class="btn btn-sm" style="color:var(--red)" title="삭제"
          onclick="deleteTrade(${t.id},'${stockCode}','${nm}')">×</button></td>
    </tr>`;
  }).join('');

  const card = (label, val, color='var(--text)') =>
    `<div style="flex:1;min-width:120px;background:var(--bg2);border-radius:8px;padding:10px 12px">
       <div style="font-size:11px;color:var(--text2)">${label}</div>
       <div style="font-size:15px;font-weight:700;color:${color}">${val}</div>
     </div>`;
  body.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
      ${card('현재 보유', pos.qty.toLocaleString()+'주')}
      ${card('평균 매수가', pos.qty>0 ? pos.avgCost.toLocaleString()+'원' : '청산')}
      ${card('실현손익', `${pos.realized>=0?'+':''}${pos.realized.toLocaleString()}원`, chgColor(pos.realized))}
      ${pos.creditLoan>0 ? card('🔻 신용융자', pos.creditLoan.toLocaleString()+'원', 'var(--accent)') : ''}
    </div>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr style="border-bottom:1px solid var(--border2)">
        <th style="padding:6px 8px;text-align:left;font-size:11px;color:var(--text2)">거래일</th>
        <th style="padding:6px 8px;text-align:left;font-size:11px;color:var(--text2)">구분</th>
        <th style="padding:6px 8px;text-align:right;font-size:11px;color:var(--text2)">단가</th>
        <th style="padding:6px 8px;text-align:right;font-size:11px;color:var(--text2)">수량</th>
        <th style="padding:6px 8px;text-align:right;font-size:11px;color:var(--text2)">금액</th>
        <th style="padding:6px 8px;text-align:left;font-size:11px;color:var(--text2)">메모</th>
        <th style="padding:6px 8px"></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:12px;text-align:right">
      <button class="btn btn-sm" style="color:var(--buy)" onclick="openTradeModal(${txs[0].watchlist_id},'${stockCode}','${nm}','buy',null)">+ 매수</button>
      <button class="btn btn-sm" style="color:var(--sell)" onclick="openTradeModal(${txs[0].watchlist_id},'${stockCode}','${nm}','sell',null)">+ 매도</button>
    </div>`;
}

async function deleteTrade(txId, stockCode, corpName) {
  if (!confirm('이 거래 기록을 삭제할까요?')) return;
  const { data: tx } = await sb.from('portfolio_transactions').select('watchlist_id').eq('id', txId).single();
  await sb.from('portfolio_transactions').delete().eq('id', txId);
  await syncPositionToWatchlist(tx?.watchlist_id, stockCode);
  openTradeHistory(stockCode, corpName); // 모달 갱신
  loadWatchlist();
}

// ── 현금 잔고 (app_config key: portfolio_cash) ────────────────────────────────
async function getPortfolioCash() {
  try {
    const { data } = await sb.from('app_config').select('value').eq('key', 'portfolio_cash').limit(1);
    const v = parseFloat(data?.[0]?.value);
    return isNaN(v) ? 0 : v;
  } catch (e) { return 0; }
}

async function savePortfolioCash(raw) {
  const num = Math.max(0, parseFloat(String(raw).replace(/[^0-9.]/g, '')) || 0);
  const { error } = await sb.from('app_config').upsert(
    { key: 'portfolio_cash', value: String(Math.round(num)), updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );
  if (error) { alert('현금 저장 실패: ' + error.message); return; }
  loadWatchlist();
}

// ── 목표 비중 (app_config key: portfolio_target_weights, JSON {stock_code: pct}) ──
// 스키마 변경 없이 현금과 동일한 app_config 패턴으로 저장 → 리밸런싱 갭 계산
async function getTargetWeights() {
  try {
    const { data } = await sb.from('app_config').select('value').eq('key', 'portfolio_target_weights').limit(1);
    const obj = JSON.parse(data?.[0]?.value || '{}');
    return (obj && typeof obj === 'object') ? obj : {};
  } catch (e) { return {}; }
}

async function saveTargetWeight(stockCode, weight) {
  const map = await getTargetWeights();
  if (weight == null || isNaN(weight) || weight <= 0) delete map[stockCode];
  else map[stockCode] = Math.min(100, Math.round(weight * 10) / 10); // 0.1% 단위, 최대 100%
  const { error } = await sb.from('app_config').upsert(
    { key: 'portfolio_target_weights', value: JSON.stringify(map), updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );
  if (error) { alert('목표 비중 저장 실패: ' + error.message); return; }
  loadWatchlist();
}

