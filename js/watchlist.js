// fmtEok → config.js 참조

function fmtPriceKr(price) {
  // 원 단위 주가를 보기 쉽게
  if (price == null || isNaN(price)) return '—';
  if (price >= 100000000) return `${(price/100000000).toFixed(2)}억원`;
  if (price >= 10000) return `${price.toLocaleString()}원`;
  return `${price.toLocaleString()}원`;
}

// ── 손익비(R/R) + 포지션 크기 계산기 ──────────────────────────────────────
function _calcRR() {
  const gn = id => { const v = document.getElementById(id)?.value; return v !== '' && v != null ? parseFloat(v) : null; };
  const curPrice  = gn('wl-rr-cur');
  const tgtPrice  = gn('wl-rr-tgt');
  const stopPrice = gn('wl-rr-stop');
  const account   = gn('wl-rr-account');
  const riskPct   = gn('wl-rr-risk');
  const out       = document.getElementById('wl-rr-output');
  if (!out) return;

  const rows = [];

  // 손익비
  if (curPrice && tgtPrice && stopPrice && stopPrice < curPrice) {
    const gain = tgtPrice - curPrice;
    const risk = curPrice - stopPrice;
    const rr   = gain / risk;
    const color = rr >= 2 ? 'var(--green)' : rr >= 1 ? 'var(--yellow,#ffd600)' : 'var(--red)';
    rows.push(`<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:12px;color:var(--text2)">손익비 (R:R)</span>
      <span style="font-size:13px;font-weight:700;color:${color}">1 : ${rr.toFixed(2)}</span>
    </div>`);

    // 포지션 크기
    if (account && riskPct && risk > 0) {
      const maxLoss  = account * 10000 * (riskPct / 100);  // account는 만원 단위
      const qty      = Math.floor(maxLoss / risk);
      const lossAmt  = qty * risk;
      const gainAmt  = qty * gain;
      rows.push(`<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border)">
        <span style="font-size:12px;color:var(--text2)">추천 매수 수량</span>
        <span style="font-size:13px;font-weight:700">${qty.toLocaleString()}주</span>
      </div>`);
      rows.push(`<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border)">
        <span style="font-size:12px;color:var(--text2)">예상 손실 (손절 시)</span>
        <span style="font-size:13px;font-weight:600;color:var(--red)">-${Math.round(lossAmt).toLocaleString()}원</span>
      </div>`);
      rows.push(`<div style="display:flex;justify-content:space-between;padding:5px 0">
        <span style="font-size:12px;color:var(--text2)">예상 수익 (목표 시)</span>
        <span style="font-size:13px;font-weight:600;color:var(--green)">+${Math.round(gainAmt).toLocaleString()}원</span>
      </div>`);
    }
  } else if (curPrice && tgtPrice && stopPrice) {
    rows.push(`<div style="font-size:12px;color:var(--red);padding:5px 0">손절가는 현재가보다 낮아야 합니다.</div>`);
  }

  out.innerHTML = rows.length
    ? `<div style="background:var(--bg3);border-radius:6px;padding:8px 12px">${rows.join('')}</div>`
    : `<div style="font-size:12px;color:var(--text2);padding:5px 0">현재가·목표가·손절가를 입력하면 자동 계산됩니다.</div>`;
}

// 목표가 입력 시 RR 자동 연동
function syncRRTarget(val) {
  const el = document.getElementById('wl-rr-tgt');
  if (el && val) el.value = val;
  _calcRR();
}

function _syncPriceCap(prefix, from, val) {
  const shares = window._wlShares;
  const hint = document.getElementById(`${prefix}-cap-hint`);
  if (!shares || !val) { if (hint) hint.textContent = ''; return; }

  if (from === 'price') {
    const price = parseFloat(val);
    if (!isNaN(price)) {
      const capEok = Math.round(price * shares / 1e8);
      document.getElementById(`${prefix}_cap`).value = capEok;
      if (hint) hint.innerHTML = `<span style="color:var(--tg)">≈ ${fmtEok(capEok)}</span>`;
    }
  } else {
    const capEok = parseFloat(val);
    if (!isNaN(capEok)) {
      const price = Math.round(capEok * 1e8 / shares);
      document.getElementById(`${prefix}_price`).value = price;
      if (hint) hint.innerHTML = `<span style="color:var(--tg)">≈ ${fmtPriceKr(price)}</span>`;
    }
  }
}

function syncWlPrice(from, val)      { _syncPriceCap('wl-target', from, val); }
function syncWlWatchPrice(from, val) { _syncPriceCap('wl-watch',  from, val); }

// 억원 입력 시 조·억 단위 힌트 표시
function _showCapUnit(elId, val) {
  const el = document.getElementById(elId);
  if (!el) return;
  const eok = parseFloat(val);
  if (!val || isNaN(eok) || eok <= 0) { el.textContent = ''; return; }
  if (eok >= 10000) {
    const jo = Math.floor(eok / 10000);
    const rem = Math.round(eok % 10000);
    el.textContent = rem > 0 ? `${jo}조 ${rem.toLocaleString()}억` : `${jo}조`;
  } else {
    el.textContent = `${eok.toLocaleString()}억`;
  }
}

let _wlCompanies = null;

async function searchWatchlistStock(query) {
  const dd = document.getElementById('wl-search-dropdown');
  if (!query || query.length < 1) { dd.style.display = 'none'; return; }

  // 전체 companies 캐시 로드 (최초 1회)
  if (!_wlCompanies) {
    _wlCompanies = await fetchAllPages(
      sb.from('companies')
        .select('code,name,industry,sub_industry,market')
        .eq('active', true)
    );
  }

  const q = query.toLowerCase();
  const results = _wlCompanies.filter(c =>
    c.name?.toLowerCase().includes(q) ||
    (c.code || '').replace('.KS','').replace('.KQ','').includes(q)
  ).slice(0, 10);

  if (!results.length) { dd.style.display = 'none'; return; }

  dd.style.display = 'block';
  dd.innerHTML = results.map(c => {
    const code = (c.code||'').split('.')[0];
    return `<div onclick="selectWatchlistStock('${code}','${c.name}','${c.industry||''}','${c.market||''}')"
      style="padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;font-size:13px"
      onmouseover="this.style.background='var(--bg2)'" onmouseout="this.style.background=''">
      <span style="font-weight:500">${c.name}</span>
      <span style="font-size:11px;color:var(--text2)">${code}</span>
      ${c.industry ? `<span style="font-size:10px;padding:1px 6px;border-radius:100px;background:var(--bg3);color:var(--text2)">${c.industry}</span>` : ''}
      <span style="font-size:10px;color:var(--text2);margin-left:auto">${c.market||''}</span>
    </div>`;
  }).join('');
}

async function selectWatchlistStock(code, name, industry, market) {
  // 기본 정보 입력
  document.getElementById('wl-search').value = name;
  document.getElementById('wl-stock_code').value = code;
  document.getElementById('wl-corp_name').value = name;
  document.getElementById('wl-industry').value = industry;
  document.getElementById('wl-search-dropdown').style.display = 'none';

  // 시장 데이터 자동 입력
  const { data: mkt } = await sb.from('market_data')
    .select('price,price_change_rate,market_cap,per,pbr')
    .eq('stock_code', code)
    .order('base_date', { ascending: false })
    .limit(1);

  if (mkt?.[0]) {
    const m = mkt[0];
    const _set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const _html = (id, val) => { const el = document.getElementById(id); if (el) el.innerHTML = val; };
    _set('wl-auto-price', fmtPrice(m.price));
    _html('wl-auto-chg', m.price_change_rate != null
      ? `<span style="color:${chgColor(m.price_change_rate)}">${m.price_change_rate>0?'+':''}${m.price_change_rate.toFixed(2)}%</span>` : '—');
    _set('wl-auto-cap', m.market_cap ? fmtEok(m.market_cap / 1e8) : '—');
    _set('wl-auto-per', m.per ? m.per.toFixed(1) : '—');
    _set('wl-auto-pbr', m.pbr ? m.pbr.toFixed(2) : '—');

    // RR 계산기 현재가 자동 연동
    const rrCur = document.getElementById('wl-rr-cur');
    if (rrCur && m.price) { rrCur.value = m.price; _calcRR(); }

    // 주식수 = 시총 / 현재가 (계산용 저장)
    if (m.market_cap && m.price) {
      window._wlShares = Math.round(m.market_cap / m.price); // 원/원 = 주수
      document.getElementById('wl-shares-hint').textContent =
        `발행주식수 약 ${Math.round(window._wlShares/10000).toLocaleString()}만주 기준`;
    } else {
      window._wlShares = null;
      document.getElementById('wl-shares-hint').textContent = '';
    }
  }

  // 재무 데이터 자동 입력 (업계 평균 PER 참고용)
  const { data: fin } = await sb.from('financials')
    .select('operating_margin,roe,debt_ratio')
    .eq('stock_code', code)
    .order('bsns_year', { ascending: false })
    .order('quarter', { ascending: false })
    .limit(1);

  if (fin?.[0]) {
    const f = fin[0];
    // 밸류에이션 메모에 기본값 제안
    const memo = document.getElementById('wl-valuation_note');
    if (memo && !memo.value) {
      const hints = [];
      if (f.operating_margin != null) hints.push(`영업이익률 ${f.operating_margin.toFixed(1)}%`);
      if (f.roe != null) hints.push(`ROE ${f.roe.toFixed(1)}%`);
      if (f.debt_ratio != null) hints.push(`부채비율 ${f.debt_ratio.toFixed(1)}%`);
      if (hints.length) memo.placeholder = `최근 재무: ${hints.join(', ')}`;
    }
  }
}

// 드롭다운 외부 클릭 시 닫기
document.addEventListener('click', e => {
  const dd = document.getElementById('wl-search-dropdown');
  if (dd && !dd.contains(e.target) && e.target.id !== 'wl-search') {
    dd.style.display = 'none';
  }
});


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
  const nm = (corpName || '').replace(/'/g, "\\'");

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
  window._journalSnap = {
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
       <div style="font-size:10px;color:var(--text2)">${label}</div>
       <div style="font-size:14px;font-weight:700;color:${color}">${val}</div></div>`;

  const overlay = document.createElement('div');
  overlay.id = 'm-journal';
  overlay.className = 'modal-overlay open';
  overlay.innerHTML = `
    <div class="modal" style="width:520px;max-width:95vw;max-height:90vh;overflow-y:auto">
      <div class="modal-header">
        <span class="modal-title">${corpName} · 📝 매매 복기</span>
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
          <span style="color:var(--text2)">당시 근거 · </span>${w.thesis_1}${w.risk_1?`<br><span style="color:var(--text2)">리스크 · </span>${w.risk_1}`:''}</div>` : ''}
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
            <textarea class="form-input" id="j-well" placeholder="예: 분할 매수로 평단 낮춤" style="width:100%;box-sizing:border-box;height:54px;resize:vertical">${j.did_well||''}</textarea>
          </div>
          <div>
            <div style="font-size:12px;color:var(--text1);margin-bottom:4px">아쉬운 점</div>
            <textarea class="form-input" id="j-poorly" placeholder="예: 목표 직전 조기 청산" style="width:100%;box-sizing:border-box;height:54px;resize:vertical">${j.did_poorly||''}</textarea>
          </div>
        </div>
        <div>
          <div style="font-size:12px;color:var(--text1);margin-bottom:4px">교훈 (다음 거래에 적용)</div>
          <input type="text" class="form-input" id="j-lesson" placeholder="예: 목표가 80%부터 분할 매도 룰화" value="${(j.lesson||'').replace(/"/g,'&quot;')}" style="width:100%;box-sizing:border-box">
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
  const snap = window._journalSnap || {};
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
  const today = new Date().toISOString().slice(0, 10);
  const nm = (corpName || '').replace(/'/g, "\\'");
  window._tradeType = type; // _tradePreview에서 신용 안내 분기용
  const overlay = document.createElement('div');
  overlay.id = 'm-trade';
  overlay.className = 'modal-overlay open';
  overlay.innerHTML = `
    <div class="modal" style="width:430px;max-width:94vw">
      <div class="modal-header">
        <span class="modal-title">${corpName} · <span style="color:${isBuy?'var(--up)':'var(--down)'}">${isBuy ? '매수' : '매도'}</span> 기록</span>
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
          <button class="btn btn-primary" style="background:${isBuy?'var(--up)':'var(--down)'};border-color:transparent;color:#fff"
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
  const isBuy  = window._tradeType !== 'sell';
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
  const nm = (corpName || '').replace(/'/g, "\\'");
  const overlay = document.createElement('div');
  overlay.id = 'm-tradehist';
  overlay.className = 'modal-overlay open';
  overlay.innerHTML = `
    <div class="modal" style="width:600px;max-width:96vw;max-height:88vh;overflow-y:auto">
      <div class="modal-header">
        <span class="modal-title">${corpName} · 거래 이력</span>
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
      <td style="padding:7px 8px;font-size:12px;font-weight:700;color:${isBuy?'var(--up)':'var(--down)'}">${isBuy?'매수':'매도'}${t.trade_method==='credit'?` <span style="font-size:9px;padding:1px 4px;border-radius:3px;background:var(--accent);color:#1b1300;font-weight:700">신용</span>`:''}</td>
      <td style="padding:7px 8px;font-size:12px;text-align:right">${Number(t.price).toLocaleString()}원</td>
      <td style="padding:7px 8px;font-size:12px;text-align:right">${Number(t.quantity).toLocaleString()}주</td>
      <td style="padding:7px 8px;font-size:12px;text-align:right">${Math.round(amt).toLocaleString()}원</td>
      <td style="padding:7px 8px;font-size:11px;color:var(--text2)">${t.memo||''}</td>
      <td style="padding:7px 8px;text-align:right">
        <button class="btn btn-sm" style="color:var(--red)" title="삭제"
          onclick="deleteTrade(${t.id},'${stockCode}','${nm}')">×</button></td>
    </tr>`;
  }).join('');

  const card = (label, val, color='var(--text)') =>
    `<div style="flex:1;min-width:120px;background:var(--bg2);border-radius:8px;padding:10px 12px">
       <div style="font-size:10px;color:var(--text2)">${label}</div>
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
      <button class="btn btn-sm" style="color:var(--up)" onclick="openTradeModal(${txs[0].watchlist_id},'${stockCode}','${nm}','buy',null)">+ 매수</button>
      <button class="btn btn-sm" style="color:var(--down)" onclick="openTradeModal(${txs[0].watchlist_id},'${stockCode}','${nm}','sell',null)">+ 매도</button>
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
  window._wlGroup = group;
  window._wlActionFilter = null; // 탭 전환 시 액션 필터 초기화
  window._wlPipeFilter   = null; // 파이프라인 하위 필터(관심/후보) 초기화
  loadWatchlist();
}

// 파이프라인 탭 하위 필터 (관심 / 후보) — 같은 칩 재클릭 시 해제
function wlSetPipeFilter(cat) {
  window._wlPipeFilter = (window._wlPipeFilter === cat) ? null : cat;
  loadWatchlist();
}

// '오늘의 액션' 필터 토글 (손절 도달 / 매수구간 / 점검 임박) — 같은 칩 재클릭 시 해제
function wlSetActionFilter(type) {
  window._wlActionFilter = (window._wlActionFilter === type) ? null : type;
  loadWatchlist();
}

async function loadWatchlist() {
  const group = window._wlGroup || 'all';
  const listEl = document.getElementById('wl-list');
  if (!listEl) return;
  listEl.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text2)"><span class="loading"></span></div>';

  // 전체 행을 불러온 뒤 거래내역 기반으로 '청산' 여부를 파생 (탭 필터는 effPos 계산 후 JS에서)
  const { data: allRows, error } = await sb.from('watchlist').select('*').order('created_at', { ascending: false });
  if (error) { listEl.innerHTML = '<div style="color:var(--red);padding:1rem">로드 실패</div>'; return; }

  // 현재가 일괄 조회
  const codes = (allRows || []).map(r => r.stock_code);
  let priceMap = {};
  if (codes.length) {
    const { data: mkt } = await sb.from('market_data')
      .select('stock_code,price,price_change_rate,per,pbr,market_cap,week_return,month_return,quarter_return')
      .in('stock_code', codes)
      .order('base_date', { ascending: false });
    (mkt || []).forEach(r => { if (!priceMap[r.stock_code]) priceMap[r.stock_code] = r; });
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
  const pipeFilter = window._wlPipeFilter || null; // '관심' | '후보' | null
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
  if (window._wlActionFilter) {
    const _s = window._wlActionFilter === 'stop'    ? stopHitCodes
             : window._wlActionFilter === 'target'  ? targetHitCodes
             : window._wlActionFilter === 'trim'    ? trimZoneCodes
             : window._wlActionFilter === 'buy'     ? buyZoneCodes
             : window._wlActionFilter === 'check'   ? checkDueCodes
             : window._wlActionFilter === 'rebal'   ? rebalCodes
             : window._wlActionFilter === 'journal' ? needJournalCodes : null;
    if (!_s || _s.size === 0) window._wlActionFilter = null;
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
          aBtn('매도','var(--down)',`openTradeModal(${w.id},'${code}','${esc(w.corp_name)}','sell',${p||'null'})`)
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
          aBtn('매도','var(--down)',`openTradeModal(${w.id},'${code}','${esc(w.corp_name)}','sell',${p||'null'})`)
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
          aBtn('매도','var(--down)',`openTradeModal(${w.id},'${code}','${esc(w.corp_name)}','sell',${p||'null'})`)
        + aBtn('이력','var(--text2)',`openTradeHistory('${code}','${esc(w.corp_name)}')`));
      }).join('');
      groups.push({ label:'익절 구간 (분할 익절)', count:trimZoneCodes.size, color:'var(--accent)', rows });
    }
    if (buyZoneCodes.size) {
      const rows = [...buyZoneCodes].map(code => {
        const w = byCode[code], p = priceMap[code]?.price;
        const rr = (w.target_price && w.stop_price && p && p > w.stop_price) ? (w.target_price - p)/(p - w.stop_price) : null;
        const ctx = `현재가 ${p?p.toLocaleString():'—'}원 ≤ 관심가 ${w.watch_price?.toLocaleString()}원${rr!=null?` · 손익비 ${rr.toFixed(1)}:1`:''}`;
        return itemRow('var(--up)','✅',code,ctx,
          aBtn('매수','var(--up)',`openTradeModal(${w.id},'${code}','${esc(w.corp_name)}','buy',${p||'null'})`));
      }).join('');
      groups.push({ label:'매수 구간', count:buyZoneCodes.size, color:'var(--up)', rows });
    }
    if (rebalCodes.size) {
      const rows = [...rebalCodes].map(code => {
        const w = byCode[code], curPct = valMap[code]/totalAssets*100, tw = targetWeights[code];
        const gap = curPct - tw, tradeAmt = (tw - curPct)/100*totalAssets, p = priceMap[code]?.price;
        const ctx = `현재 ${curPct.toFixed(1)}% · 목표 ${tw.toFixed(1)}% (<span style="color:var(--accent);font-weight:600">${gap>=0?'+':''}${gap.toFixed(1)}%p</span>) → ${tradeAmt>0?'매수':'매도'} ${fmtWon(Math.abs(tradeAmt))}`;
        return itemRow('var(--accent)','⚖️',code,ctx, tradeAmt>0
          ? aBtn('매수','var(--up)',`openTradeModal(${w.id},'${code}','${esc(w.corp_name)}','buy',${p||'null'})`)
          : aBtn('매도','var(--down)',`openTradeModal(${w.id},'${code}','${esc(w.corp_name)}','sell',${p||'null'})`));
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
  window._wlCache = {
    byCode: _byCode, effMap: _effMap, priceMap, industryMap,
    roeMap, opmMap, revMap, opMap, valMap, totalAssets, journalMap, targetWeights,
  };
  // 드로어가 열려 있고 현재 사용자가 드로어 내부를 편집 중이 아니면 최신 데이터로 갱신
  if (document.getElementById('wl-drawer') && window._wlDrawerCode) {
    const ae = document.activeElement;
    if (!(ae && ae.closest && ae.closest('.wl-drawer'))) wlRenderDrawer(window._wlDrawerCode);
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
           <div style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.05em">${label}</div>
           <div style="font-size:18px;font-weight:700;color:${color};line-height:1.1;margin-top:2px;font-variant-numeric:tabular-nums">${val}</div>
           ${sub?`<div style="font-size:10px;color:var(--text2);margin-top:2px">${sub}</div>`:''}
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
             ${reasonRows.length?`<div style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">매도 사유</div>
               <div style="display:flex;gap:6px;flex-wrap:wrap">
                 ${reasonRows.map(([r,c])=>`<span style="font-size:11px;background:var(--bg3);border-radius:100px;padding:3px 9px;color:var(--text1)">${r} <b style="color:var(--tg)">${c}</b></span>`).join('')}
               </div>`:''}
           </div>`;
      summaryEl.innerHTML = dash;
    } else {
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
  if (!window._wlSort) window._wlSort = { key: null, asc: true };
  const { key: sortKey, asc: sortAsc } = window._wlSort;

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
  const _afCodes = window._wlActionFilter === 'stop'    ? stopHitCodes
                 : window._wlActionFilter === 'target'  ? targetHitCodes
                 : window._wlActionFilter === 'trim'    ? trimZoneCodes
                 : window._wlActionFilter === 'buy'     ? buyZoneCodes
                 : window._wlActionFilter === 'check'   ? checkDueCodes
                 : window._wlActionFilter === 'rebal'   ? rebalCodes
                 : window._wlActionFilter === 'journal' ? needJournalCodes : null;
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
        watchCell = `<div style="color:var(--up);font-weight:700;font-size:12px">✅ 매수 구간</div>
                     <div style="font-size:12px;font-weight:600"><span style="font-size:10px;font-weight:700;color:#4a9eff">진입 </span>${w.watch_price.toLocaleString()}원</div>
                     ${watchCapStr ? `<div style="font-size:11px;color:var(--text1)">${watchCapStr}</div>` : ''}`;
      } else {
        watchCell = `<div style="font-size:12px;font-weight:600"><span style="font-size:10px;font-weight:700;color:#4a9eff">진입 </span>${w.watch_price.toLocaleString()}원</div>
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
      tgtCell = `<div style="font-size:12px;font-weight:600"><span style="font-size:10px;font-weight:700;color:#a78bfa">목표 </span>${w.target_price.toLocaleString()}원</div>
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
      costCell = `<div style="font-size:12px"><span style="font-size:10px;font-weight:700;color:var(--accent)">평단 </span>${e.avg.toLocaleString()}원 <span style="color:var(--text2)">· ${e.qty.toLocaleString()}주</span></div>
                  <div style="font-size:12px;font-weight:700;color:${color}">${pnlStr} · ${fmtWon((price-e.avg)*e.qty, true)}</div>
                  ${e.realized ? `<div style="font-size:11px;color:${chgColor(e.realized)}">실현 ${fmtWon(e.realized, true)}</div>` : ''}
                  ${e.creditLoan > 0 ? `<div style="font-size:11px;color:var(--accent)">🔻 신용 융자 ${fmtWon(e.creditLoan)}${e.creditQty?` (${e.creditQty.toLocaleString()}주)`:''}</div>` : ''}
                  ${w.stop_price ? `<div style="font-size:11px;color:${isStopHit?'var(--down)':'var(--text2)'};font-weight:${isStopHit?'700':'400'}">${isStopHit?'⚠️ ':''}손절 ${w.stop_price.toLocaleString()}원${stopPct!=null?` (${stopPct.toFixed(1)}%)`:''}</div>` : ''}`;
    } else if (e.closed) {
      const jr = _journalAvailable ? journalMap[w.stock_code] : null;
      const jName = (w.corp_name || '').replace(/'/g, "\\'");
      const jLine = !_journalAvailable ? ''
        : jr ? `<div style="font-size:11px;color:var(--accent);cursor:pointer" title="복기 보기/수정" onclick="event.stopPropagation();openJournalModal('${w.stock_code}','${jName}')">📝 ${'★'.repeat(jr.process_score||0)||'기록'}${jr.lesson?` · ${jr.lesson.length>16?jr.lesson.slice(0,16)+'…':jr.lesson}`:''}</div>`
             : `<div style="font-size:11px;color:var(--text3);cursor:pointer" title="복기 작성" onclick="event.stopPropagation();openJournalModal('${w.stock_code}','${jName}')">📝 복기 필요</div>`;
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
          <button class="btn btn-sm" style="color:var(--up);font-weight:700" title="매수 기록"
            onclick="openTradeModal(${w.id},'${w.stock_code}','${nameEsc}','buy',${price||'null'})">매수</button>
          <button class="btn btn-sm" style="color:var(--down);font-weight:700" title="매도 기록"
            onclick="openTradeModal(${w.id},'${w.stock_code}','${nameEsc}','sell',${price||'null'})">매도</button>
          <button class="btn btn-sm" title="더보기"
            onclick="wlToggleRowMenu(this,${w.id},'${w.stock_code}','${nameEsc}',${e.hasTx},${e.closed})">⋯</button>
        </div>
      </td>`,
    };

    return `<tr style="cursor:pointer;${rowBg}" onclick="wlOpenDrawer(event,'${w.stock_code}')" onmouseover="this.style.background='rgba(255,255,255,.02)'" onmouseout="this.style.background='${baseBg}'">${cols.map(k => colTag(tdMap[k], k)).join('')}</tr>`;
  }).join('');

  listEl.innerHTML = `${pipeBar}
    <div class="card" style="overflow-x:auto;padding:0">
      <table class="wl-table" style="width:100%;border-collapse:collapse">
        <thead>${header}</thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
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
        <div style="font-size:10px;color:var(--text2);margin-bottom:2px">매수가 (원)</div>
        <input id="_ieCost" type="number" value="${curAvg||''}" placeholder="매수가"
          style="width:100%;box-sizing:border-box;background:var(--bg2);color:var(--text1);border:1px solid var(--tg);border-radius:4px;padding:3px 6px;font-size:12px">
      </div>
      <div>
        <div style="font-size:10px;color:var(--text2);margin-bottom:2px">수량 (주)</div>
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
  if (window._wlSort.key === key) {
    window._wlSort.asc = !window._wlSort.asc;
  } else {
    window._wlSort = { key, asc: true };
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
    (isClosed && _journalAvailable ? item('📝 복기', `openJournalModal('${code}','${name}')`, 'var(--accent)') : '') +
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
  if (window._wlDrawerCode && window._wlCache?.byCode?.[window._wlDrawerCode]?.id === id) wlCloseDrawer();
  await sb.from('watchlist').delete().eq('id', id);
  loadWatchlist();
}

// =============================================
//  종목 상세 드로어 (행 클릭) — reference 정보 + 직접 편집 (모바일 친화)
// =============================================

// 행 클릭 → 드로어 열기 (버튼·인라인편집 셀 클릭은 가드로 제외)
function wlOpenDrawer(ev, code) {
  if (ev && ev.target.closest('button, input, textarea, select, a, .wl-editable, .wl-rowmenu')) return;
  window._wlDrawerCode = code;
  if (!document.getElementById('wl-drawer')) {
    const bd = document.createElement('div');
    bd.id = 'wl-drawer-backdrop'; bd.className = 'wl-drawer-backdrop';
    bd.onclick = wlCloseDrawer;
    document.body.appendChild(bd);
    const dr = document.createElement('div');
    dr.id = 'wl-drawer'; dr.className = 'wl-drawer';
    document.body.appendChild(dr);
    document.addEventListener('keydown', wlDrawerKey);
  }
  wlRenderDrawer(code);
  requestAnimationFrame(() => {
    document.getElementById('wl-drawer-backdrop')?.classList.add('open');
    document.getElementById('wl-drawer')?.classList.add('open');
  });
}

function wlDrawerKey(e) { if (e.key === 'Escape') wlCloseDrawer(); }

function wlCloseDrawer() {
  document.getElementById('wl-drawer-backdrop')?.classList.remove('open');
  document.getElementById('wl-drawer')?.classList.remove('open');
  document.removeEventListener('keydown', wlDrawerKey);
  setTimeout(() => {
    document.getElementById('wl-drawer-backdrop')?.remove();
    document.getElementById('wl-drawer')?.remove();
  }, 220);
  window._wlDrawerCode = null;
}

// 드로어 내용 렌더 — window._wlCache 스냅샷에서 (재조회 없음)
function wlRenderDrawer(code) {
  const dr = document.getElementById('wl-drawer'); if (!dr) return;
  const C = window._wlCache || {};
  const w = C.byCode?.[code];
  if (!w) { wlCloseDrawer(); return; }
  const mkt = C.priceMap?.[code] || {};
  const e   = C.effMap?.[code] || { avg:null, qty:null, realized:0, hasTx:false, closed:false };
  const price = mkt.price, chg = mkt.price_change_rate, cap = mkt.market_cap;
  const shares = (cap && price) ? cap / price : null;
  const nm = (w.corp_name || '').replace(/'/g, "\\'");
  const tw = C.targetWeights?.[code];

  const cat = (e.closed && w.group_name === '보유중') ? '청산' : w.group_name;
  const grpColor = { '관심':'#4a9eff','후보':'#ffc107','보유중':'var(--tg)','청산':'#6b7694' }[cat] || '#888';
  const grpText  = { '관심':'#0a1f3d','후보':'#2d1f00','보유중':'#002b1e','청산':'#0f1117' }[cat] || '#111';

  // ── 헤더 ──
  const head = `<div class="wl-drawer-head">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
      <div style="min-width:0">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span style="font-size:18px;font-weight:800">${w.corp_name}</span>
          <span style="font-size:11px;padding:1px 7px;border-radius:100px;background:${grpColor};color:${grpText};font-weight:700">${cat}</span>
        </div>
        <div style="font-size:12px;color:var(--text2);margin-top:2px">${(code||'').split('.')[0]} · ${C.industryMap?.[code] || w.industry || '—'}</div>
      </div>
      <button class="modal-close" onclick="wlCloseDrawer()">×</button>
    </div>
    <div style="display:flex;align-items:baseline;gap:8px;margin-top:8px">
      <span style="font-size:22px;font-weight:800;font-variant-numeric:tabular-nums">${fmtPrice(price)}</span>
      <span style="font-size:13px;font-weight:700;color:${chgColor(chg)}">${chg!=null ? (chg>=0?'+':'')+chg.toFixed(2)+'%' : ''}</span>
    </div>
  </div>`;

  // ── 핵심 지표 (표에서 이관한 펀더멘털·밸류) ──
  const roe = C.roeMap?.[code], opm = C.opmMap?.[code], rev = C.revMap?.[code], op = C.opMap?.[code];
  const metric = (label, val, color) =>
    `<div style="background:var(--bg2);border-radius:6px;padding:7px 9px">
       <div style="font-size:10px;color:var(--text2)">${label}</div>
       <div style="font-size:13px;font-weight:700;color:${color||'var(--text)'};font-variant-numeric:tabular-nums">${val}</div></div>`;
  const metricsGrid = `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">
    ${metric('시총', cap ? fmtEok(cap/1e8) : '—')}
    ${metric('PER', mkt.per!=null ? mkt.per.toFixed(1) : '—')}
    ${metric('PBR', mkt.pbr!=null ? mkt.pbr.toFixed(2) : '—')}
    ${metric('ROE', roe!=null ? roe.toFixed(1)+'%' : '—', roe!=null?chgColor(roe):null)}
    ${metric('OPM', opm!=null ? opm.toFixed(1)+'%' : '—', opm!=null&&opm>=0?chgColor(opm):null)}
    ${metric('매출', rev!=null ? fmtEok(rev/1e8) : '—')}
    ${metric('영업이익', op!=null ? fmtEok(op/1e8) : '—', op!=null?chgColor(op):null)}
  </div>`;
  const retLine = `<div style="font-size:11px;color:var(--text2)">등락 ${
    [['1주',mkt.week_return],['1개월',mkt.month_return],['3개월',mkt.quarter_return]]
      .map(([l,v]) => `${l} <b style="color:${v!=null?chgColor(v):'var(--text3)'}">${v!=null?(v>=0?'+':'')+v.toFixed(1)+'%':'—'}</b>`).join(' · ')}</div>`;

  // ── 포지션 / 청산 ──
  let posHtml = '';
  const acts = `<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
    <button class="btn btn-sm" style="color:var(--up);font-weight:700" onclick="openTradeModal(${w.id},'${code}','${nm}','buy',${price||'null'})">매수</button>
    <button class="btn btn-sm" style="color:var(--down);font-weight:700" onclick="openTradeModal(${w.id},'${code}','${nm}','sell',${price||'null'})">매도</button>
    ${e.hasTx ? `<button class="btn btn-sm" onclick="openTradeHistory('${code}','${nm}')">거래 이력</button>` : ''}
    ${e.closed && _journalAvailable ? `<button class="btn btn-sm" style="color:var(--accent)" onclick="openJournalModal('${code}','${nm}')">📝 복기</button>` : ''}
  </div>`;
  if (e.avg && e.qty && price) {
    const pnl = (price - e.avg) * e.qty, pnlPct = (price - e.avg) / e.avg * 100;
    const wPct = (C.valMap?.[code] && C.totalAssets) ? C.valMap[code] / C.totalAssets * 100 : null;
    const isStopHit = w.stop_price && price <= w.stop_price;
    posHtml = `<div>
      <div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">포지션</div>
      <div style="background:var(--bg2);border-radius:8px;padding:10px 12px;display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;font-size:12px">
        <div><span style="color:var(--text2)">평단·수량</span><br><b>${e.avg.toLocaleString()}원 · ${e.qty.toLocaleString()}주</b></div>
        <div><span style="color:var(--text2)">평가손익</span><br><b style="color:${chgColor(pnlPct)}">${pnlPct>=0?'+':''}${pnlPct.toFixed(1)}% · ${fmtWon(pnl,true)}</b></div>
        ${e.realized ? `<div><span style="color:var(--text2)">실현손익</span><br><b style="color:${chgColor(e.realized)}">${fmtWon(e.realized,true)}</b></div>` : ''}
        ${wPct!=null ? `<div><span style="color:var(--text2)">비중</span><br><b>${wPct.toFixed(1)}%${tw!=null?` <span style="color:var(--text2)">/ 목표 ${tw}%</span>`:''}</b></div>` : ''}
        ${w.stop_price ? `<div><span style="color:var(--text2)">손절가</span><br><b style="color:${isStopHit?'var(--down)':'var(--text)'}">${isStopHit?'⚠️ ':''}${w.stop_price.toLocaleString()}원</b></div>` : ''}
        ${e.creditLoan > 0 ? `<div><span style="color:var(--text2)">🔻 신용 융자</span><br><b style="color:var(--accent)">${fmtWon(e.creditLoan)}${e.creditQty?` · ${e.creditQty.toLocaleString()}주`:''}</b></div>` : ''}
      </div>${acts}
    </div>`;
  } else if (e.closed) {
    posHtml = `<div>
      <div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">청산</div>
      <div style="background:var(--bg2);border-radius:8px;padding:10px 12px;font-size:13px">
        실현손익 <b style="color:${chgColor(e.realized)}">${fmtWon(e.realized,true)}</b></div>${acts}
    </div>`;
  } else {
    posHtml = `<div>${acts}</div>`;
  }

  // ── 계획 (직접 편집) ──
  const av = s => (s==null?'':String(s)).replace(/"/g,'&quot;');
  const iS = 'background:var(--bg2);border:1px solid var(--border2);border-radius:6px;padding:6px 8px;color:var(--text);font-size:13px;width:100%;box-sizing:border-box';
  const lbl = t => `<span style="font-size:11px;color:var(--text2)">${t}</span>`;
  const fNum = (field,label,ph='') => `<label style="display:flex;flex-direction:column;gap:3px">${lbl(label)}<input type="number" value="${av(w[field])}" placeholder="${ph}" onkeydown="if(event.key==='Enter')this.blur()" onblur="wlDrawerEdit(event,'${code}','${field}','num')" style="${iS}"></label>`;
  const fDate = (field,label) => `<label style="display:flex;flex-direction:column;gap:3px">${lbl(label)}<input type="date" value="${av(w[field])}" onchange="wlDrawerEdit(event,'${code}','${field}','date')" style="${iS}"></label>`;
  const fWeight = () => `<label style="display:flex;flex-direction:column;gap:3px">${lbl('목표 비중 %')}<input type="number" step="0.5" min="0" max="100" value="${av(tw)}" placeholder="목표%" onkeydown="if(event.key==='Enter')this.blur()" onblur="wlDrawerEditWeight(event,'${code}')" style="${iS}"></label>`;
  const fLine = (field,label,ph='') => `<label style="display:flex;flex-direction:column;gap:3px">${lbl(label)}<input type="text" value="${av(w[field])}" placeholder="${ph}" onkeydown="if(event.key==='Enter')this.blur()" onblur="wlDrawerEdit(event,'${code}','${field}','text')" style="${iS}"></label>`;
  const fText = (field,label,ph='') => `<label style="display:flex;flex-direction:column;gap:3px">${lbl(label)}<textarea placeholder="${ph}" onblur="wlDrawerEdit(event,'${code}','${field}','text')" style="${iS};height:52px;resize:vertical">${w[field]||''}</textarea></label>`;

  const upsidePct = (w.target_price && price) ? (w.target_price - price) / price * 100 : null;
  const watchGap  = (w.watch_price && price) ? (w.watch_price - price) / price * 100 : null;
  const rr = (w.target_price && w.stop_price && price && price > w.stop_price) ? (w.target_price - price) / (price - w.stop_price) : null;
  const isTgtHit = e.avg && e.qty && price && w.target_price && price >= w.target_price;
  const isTrim   = e.avg && e.qty && price && w.target_price && !isTgtHit && price >= w.target_price * 0.9;
  const derived = [
    isTgtHit ? `<b style="color:var(--up)">🎯 목표 도달 — 익절 검토</b>`
    : isTrim ? `<b style="color:var(--accent)">✂️ 익절 구간 ${(price/w.target_price*100).toFixed(0)}%</b> · 남은 +${upsidePct.toFixed(1)}%`
    : upsidePct!=null ? `업사이드 <b style="color:${chgColor(upsidePct)}">${upsidePct>=0?'+':''}${upsidePct.toFixed(1)}%</b>` : '',
    watchGap!=null  ? `관심가까지 <b style="color:var(--blue)">${watchGap>=0?'+':''}${watchGap.toFixed(1)}%</b>` : '',
    rr!=null        ? `손익비 <b style="color:${rr>=2?'var(--up)':rr>=1?'var(--accent)':'var(--text1)'}">${rr.toFixed(1)}:1</b>` : '',
  ].filter(Boolean).join(' · ');

  const planSection = `<div>
    <div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">계획 <span style="font-weight:400;text-transform:none">· 클릭해서 바로 편집</span></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      ${fNum('watch_price','관심가(진입)')}${fNum('target_price','목표가')}${fNum('stop_price','🛑 손절가')}${fWeight()}${fDate('next_check_date','📅 다음 점검일')}
    </div>
    ${derived ? `<div style="font-size:11px;color:var(--text2);margin-top:8px">${derived}</div>` : ''}
  </div>`;

  const logicSection = `<div>
    <div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">투자 논리</div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${fText('thesis_1','💡 투자 근거')}
      ${fText('risk_1','⚠️ 핵심 리스크')}
      ${fLine('break_condition','❌ 무효화 조건 (깨지면 매도)')}
      ${fLine('catalyst','⚡ 상승 트리거')}
      ${fLine('next_check_memo','📌 점검 메모')}
    </div>
  </div>`;

  const footer = `<div style="display:flex;gap:8px;justify-content:space-between;padding-top:4px;border-top:1px solid var(--border)">
    <button class="btn btn-sm" onclick="openWatchlistModal(${w.id})">전체 수정</button>
    <button class="btn btn-sm" style="color:var(--red)" onclick="deleteWatchlist(${w.id},'${nm}')">삭제</button>
  </div>`;

  dr.innerHTML = head + `<div class="wl-drawer-body">${metricsGrid}${retLine}${posHtml}${planSection}${logicSection}${footer}</div>`;
}

// 드로어 내 필드 직접 편집 → watchlist 저장 + 갱신 (포커스가 드로어 밖일 때만 재렌더; 탭 이동 중 포커스 뺏김 방지)
async function wlDrawerEdit(ev, code, field, kind) {
  const w = window._wlCache?.byCode?.[code]; if (!w) return;
  const v = (ev.target.value ?? '').trim();
  const out = kind === 'num' ? (v ? parseFloat(v) : null)
            : kind === 'int' ? (v ? parseInt(v)   : null)
            : (v || null); // text / date
  if (String(w[field] ?? '') === String(out ?? '')) return; // 변경 없음
  await sb.from('watchlist').update({ [field]: out, updated_at: new Date().toISOString() }).eq('id', w.id);
  await loadWatchlist(); // 캐시·표 갱신 + (포커스 드로어 밖이면) 드로어 재렌더
}

// 목표 비중은 app_config에 저장 (saveTargetWeight 내부에서 loadWatchlist 호출)
async function wlDrawerEditWeight(ev, code) {
  const v = (ev.target.value ?? '').trim();
  const cur = window._wlCache?.targetWeights?.[code];
  const next = v === '' ? null : parseFloat(v);
  if (String(cur ?? '') === String(next ?? '')) return;
  await saveTargetWeight(code, next);
}

function openWatchlistModal(id) {
  const existing = document.getElementById('m-watchlist');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'm-watchlist';
  overlay.className = 'modal-overlay open';
  overlay.innerHTML = `
    <div class="modal" style="width:720px;max-width:96vw;max-height:90vh;overflow-y:auto">
      <div class="modal-header">
        <span class="modal-title">${id ? '관심종목 수정' : '관심종목 추가'}</span>
        <button class="modal-close" onclick="document.getElementById('m-watchlist').remove()">×</button>
      </div>
      <div id="wl-modal-body" style="padding:1.25rem">
        <div style="text-align:center;color:var(--text2)"><span class="loading"></span></div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  renderWatchlistForm(id);
}

async function renderWatchlistForm(id) {
  const body = document.getElementById('wl-modal-body');
  let w = {};
  if (id) {
    const { data } = await sb.from('watchlist').select('*').eq('id', id).single();
    w = data || {};
  }
  // 스크리너 원클릭 추가: prefill 적용 (stock_code/corp_name만 미리 채움)
  if (!id && window._wlPrefill) {
    Object.assign(w, window._wlPrefill);
    window._wlPrefill = null;
  }

  // 수정 모드: stock_code로 market data 선로드 → _wlShares 세팅 (시총↔주가 연동)
  // await으로 폼 렌더 전에 완료 → race condition 방지
  window._wlShares = null;
  let _mktCache = null;
  if (w.stock_code) {
    const { data: mkt } = await sb.from('market_data')
      .select('price,price_change_rate,market_cap,per,pbr')
      .eq('stock_code', w.stock_code)
      .order('base_date', { ascending: false })
      .limit(1);
    const m = mkt?.[0];
    if (m) {
      _mktCache = m;
      if (m.market_cap && m.price) {
        window._wlShares = Math.round(m.market_cap / m.price);
      }
    }
  }

  const inp = (field, label, placeholder='', type='text', readonly=false) => `
    <div>
      <div style="font-size:12px;color:var(--text1);margin-bottom:4px">${label}</div>
      <input type="${type}" class="form-input" id="wl-${field}" value="${w[field]||''}"
        placeholder="${placeholder}" ${readonly?'readonly style="width:100%;box-sizing:border-box;opacity:0.7"':'style="width:100%;box-sizing:border-box"'}>
    </div>`;
  const ta = (field, label, placeholder='') => `
    <div>
      <div style="font-size:12px;color:var(--text1);margin-bottom:4px">${label}</div>
      <textarea class="form-input" id="wl-${field}" placeholder="${placeholder}"
        style="width:100%;box-sizing:border-box;height:60px;resize:vertical">${w[field]||''}</textarea>
    </div>`;

  // 탭값(all/pipeline/청산)은 실제 그룹명이 아니므로 보유중 탭에서만 그룹 프리필, 그 외 '관심'
  const defaultGroup = w.group_name || (window._wlGroup === '보유중' ? '보유중' : '관심');
  const isHolding = (defaultGroup === '보유중');

  body.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:1rem">

      <!-- 종목 검색 -->
      <div style="display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end">
        <div>
          <div style="font-size:12px;color:var(--text1);margin-bottom:4px">종목 검색</div>
          <div style="position:relative">
            <input type="text" class="form-input" id="wl-search"
              placeholder="종목명 또는 코드 입력..."
              value="${w.corp_name||''}"
              oninput="searchWatchlistStock(this.value)"
              style="width:100%;box-sizing:border-box">
            <div id="wl-search-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;background:var(--bg1);border:1px solid var(--border);border-radius:8px;z-index:999;max-height:200px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,.3)"></div>
          </div>
          <input type="hidden" id="wl-stock_code" value="${w.stock_code||''}">
          <input type="hidden" id="wl-corp_name"  value="${w.corp_name||''}">
          <input type="hidden" id="wl-industry"   value="${w.industry||''}">
        </div>
        <div>
          <div style="font-size:12px;color:var(--text1);margin-bottom:4px">그룹</div>
          <select class="form-select" id="wl-group_name" style="width:100px"
            onchange="document.getElementById('wl-holding-section').style.display=this.value==='보유중'?'':'none'">
            ${['관심','후보','보유중'].map(g=>`<option value="${g}" ${defaultGroup===g?'selected':''}>${g}</option>`).join('')}
          </select>
        </div>
      </div>

      <!-- 시장 데이터 자동입력 -->
      <div style="background:var(--bg2);border-radius:8px;padding:10px 14px">
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
          <div><div style="font-size:10px;color:var(--text2)">현재가</div><div id="wl-auto-price" style="font-size:13px;font-weight:600">—</div></div>
          <div><div style="font-size:10px;color:var(--text2)">등락률</div><div id="wl-auto-chg"  style="font-size:13px;font-weight:600">—</div></div>
          <div><div style="font-size:10px;color:var(--text2)">시총</div>  <div id="wl-auto-cap"  style="font-size:13px;font-weight:600">—</div></div>
          <div><div style="font-size:10px;color:var(--text2)">PER</div>   <div id="wl-auto-per"  style="font-size:13px;font-weight:600">—</div></div>
        </div>
        <div id="wl-shares-hint" style="font-size:11px;color:var(--text2);margin-top:6px"></div>
      </div>

      <!-- 매수 목표 시총 ↔ 업사이드 -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div style="background:var(--bg2);border-radius:8px;padding:10px 12px">
          <div style="font-size:11px;color:var(--tg);font-weight:600;margin-bottom:8px">매수 목표 시총</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div>
              <div style="font-size:10px;color:var(--text2);margin-bottom:3px">주가 (원)</div>
              <input type="number" class="form-input" id="wl-watch_price" value="${w.watch_price||''}"
                placeholder="예: 60,000" oninput="syncWlWatchPrice('price',this.value)"
                style="width:100%;box-sizing:border-box;font-size:12px">
              <div id="wl-watch-cap-hint" style="font-size:10px;color:var(--tg);margin-top:3px"></div>
            </div>
            <div>
              <div style="font-size:10px;color:var(--text2);margin-bottom:3px">시총 (억원)</div>
              <input type="number" class="form-input" id="wl-watch_cap"
                placeholder="억원" oninput="syncWlWatchPrice('cap',this.value);_showCapUnit('wl-watch-cap-unit',this.value)"
                style="width:100%;box-sizing:border-box;font-size:12px">
              <div id="wl-watch-cap-unit" style="font-size:11px;color:var(--tg);margin-top:3px;font-weight:600"></div>
            </div>
          </div>
        </div>
        <div style="background:var(--bg2);border-radius:8px;padding:10px 12px">
          <div style="font-size:11px;color:var(--text2);font-weight:600;margin-bottom:8px">업사이드 목표 시총</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div>
              <div style="font-size:10px;color:var(--text2);margin-bottom:3px">주가 (원)</div>
              <input type="number" class="form-input" id="wl-target_price" value="${w.target_price||''}"
                placeholder="예: 100,000" oninput="syncWlPrice('price',this.value);syncRRTarget(this.value)"
                style="width:100%;box-sizing:border-box;font-size:12px">
              <div id="wl-target-cap-hint" style="font-size:10px;color:var(--text2);margin-top:3px"></div>
            </div>
            <div>
              <div style="font-size:10px;color:var(--text2);margin-bottom:3px">시총 (억원)</div>
              <input type="number" class="form-input" id="wl-target_cap"
                placeholder="억원" oninput="syncWlPrice('cap',this.value);_showCapUnit('wl-target-cap-unit',this.value)"
                style="width:100%;box-sizing:border-box;font-size:12px">
              <div id="wl-target-cap-unit" style="font-size:11px;color:var(--text2);margin-top:3px;font-weight:600"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- 보유중 전용 -->
      <div id="wl-holding-section" style="display:${isHolding?'':'none'}">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
          ${inp('avg_price','평균 매수가 (원)','','number')}
          ${inp('quantity','보유 수량 (주)','','number')}
          ${inp('stop_price','🛑 손절가 (원)','','number')}
        </div>
        <div style="font-size:11px;color:var(--text2);margin-top:6px">
          💡 평단·수량은 테이블의 <b style="color:var(--up)">매수</b>/<b style="color:var(--down)">매도</b> 버튼으로 거래를 기록하면 자동 계산됩니다. (수동 입력도 가능)
        </div>
      </div>

      <!-- 투자 근거 + 리스크 -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        ${ta('thesis_1','💡 투자 근거','핵심 투자 이유')}
        ${ta('risk_1','⚠️ 핵심 리스크','가장 큰 하방 리스크')}
      </div>

      <!-- 손익비 + 포지션 크기 계산기 -->
      <div style="border:1px solid var(--border);border-radius:8px;padding:12px">
        <div style="font-size:11px;font-weight:600;color:var(--text2);margin-bottom:10px">📐 손익비 · 포지션 크기 계산기</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:8px">
          <div>
            <div style="font-size:10px;color:var(--text2);margin-bottom:3px">현재가 (원)</div>
            <input type="number" class="form-input" id="wl-rr-cur" placeholder="자동 입력"
              oninput="_calcRR()" style="width:100%;box-sizing:border-box;font-size:12px">
          </div>
          <div>
            <div style="font-size:10px;color:var(--text2);margin-bottom:3px">목표가 (원)</div>
            <input type="number" class="form-input" id="wl-rr-tgt"
              value="${w.target_price||''}" placeholder="업사이드와 연동"
              oninput="_calcRR()" style="width:100%;box-sizing:border-box;font-size:12px">
          </div>
          <div>
            <div style="font-size:10px;color:var(--text2);margin-bottom:3px">손절가 (원)</div>
            <input type="number" class="form-input" id="wl-rr-stop" placeholder="예: 45,000"
              oninput="_calcRR()" style="width:100%;box-sizing:border-box;font-size:12px">
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
          <div>
            <div style="font-size:10px;color:var(--text2);margin-bottom:3px">계좌 총액 (만원)</div>
            <input type="number" class="form-input" id="wl-rr-account" placeholder="예: 5000"
              oninput="_calcRR()" style="width:100%;box-sizing:border-box;font-size:12px">
          </div>
          <div>
            <div style="font-size:10px;color:var(--text2);margin-bottom:3px">리스크 허용 비율 (%)</div>
            <input type="number" class="form-input" id="wl-rr-risk" placeholder="예: 1" step="0.5" min="0.1" max="10"
              oninput="_calcRR()" style="width:100%;box-sizing:border-box;font-size:12px">
          </div>
        </div>
        <div id="wl-rr-output">
          <div style="font-size:12px;color:var(--text2);padding:5px 0">현재가·목표가·손절가를 입력하면 자동 계산됩니다.</div>
        </div>
      </div>

      <!-- 상승 트리거 -->
      ${inp('catalyst','⚡ 상승 트리거','예: 2025 Q2 FDA 임상 결과 발표')}

      <div style="display:flex;gap:8px;justify-content:flex-end;padding-top:.25rem">
        <button class="btn" onclick="document.getElementById('m-watchlist').remove()">취소</button>
        <button class="btn btn-primary" onclick="saveWatchlist(${id||'null'})">저장</button>
      </div>
    </div>`;

  // _mktCache로 auto-info 영역 채우기 (await 완료 후 폼이 DOM에 들어갔으므로 안전)
  if (_mktCache) {
    const m = _mktCache;
    const priceEl = document.getElementById('wl-auto-price');
    const chgEl   = document.getElementById('wl-auto-chg');
    const capEl   = document.getElementById('wl-auto-cap');
    const perEl   = document.getElementById('wl-auto-per');
    const hint    = document.getElementById('wl-shares-hint');
    const rrCur   = document.getElementById('wl-rr-cur');
    if (priceEl) priceEl.textContent = fmtPrice(m.price);
    if (chgEl)   chgEl.innerHTML = m.price_change_rate != null
      ? `<span style="color:${chgColor(m.price_change_rate)}">${m.price_change_rate>0?'+':''}${m.price_change_rate.toFixed(2)}%</span>` : '—';
    if (capEl)   capEl.textContent = m.market_cap ? fmtEok(m.market_cap / 1e8) : '—';
    if (perEl)   perEl.textContent = m.per ? m.per.toFixed(1) : '—';
    if (hint && window._wlShares) hint.textContent = `발행주식수 약 ${Math.round(window._wlShares/10000).toLocaleString()}만주 기준`;
    if (rrCur && m.price && !rrCur.value) { rrCur.value = m.price; _calcRR(); }
    // 기존 저장값 있으면 시총 단위 힌트 미리 표시
    if (w.watch_price && window._wlShares) {
      const wCap = Math.round(w.watch_price * window._wlShares / 1e8);
      const wcEl = document.getElementById('wl-watch_cap');
      if (wcEl && !wcEl.value) wcEl.value = wCap;
      _showCapUnit('wl-watch-cap-unit', wCap);
    }
    if (w.target_price && window._wlShares) {
      const tCap = Math.round(w.target_price * window._wlShares / 1e8);
      const tcEl = document.getElementById('wl-target_cap');
      if (tcEl && !tcEl.value) tcEl.value = tCap;
      _showCapUnit('wl-target-cap-unit', tCap);
    }
  }
}

async function saveWatchlist(id) {
  // 폼에 렌더되지 않은 필드는 payload에서 제외 → 수정 저장 시 기존 값 보존
  // (예: 인라인으로 넣은 next_check_date, 다른 화면에서 채운 risk_2·valuation_note 등이
  //  모달 저장 한 번으로 null이 되어 사라지던 문제 방지)
  const MISSING = Symbol('missing');
  const g = field => { const el = document.getElementById('wl-' + field); return el ? (el.value?.trim() || null) : MISSING; };
  const n = field => { const v = g(field); return v === MISSING ? MISSING : (v ? parseFloat(v) : null); };
  const i = field => { const v = g(field); return v === MISSING ? MISSING : (v ? parseInt(v) : null); };

  const payload = {
    stock_code:      g('stock_code'),
    corp_name:       g('corp_name'),
    group_name:      g('group_name') || '관심',
    catalyst:        g('catalyst'),
    thesis_1:        g('thesis_1'),
    thesis_2:        g('thesis_2'),
    thesis_3:        g('thesis_3'),
    risk_1:          g('risk_1'),
    risk_2:          g('risk_2'),
    risk_3:          g('risk_3'),
    break_condition: g('break_condition'),
    target_price:    n('target_price'),
    watch_price:     n('watch_price'),
    avg_price:       n('avg_price'),
    quantity:        i('quantity'),
    stop_price:      n('stop_price'),
    valuation_note:  g('valuation_note'),
    competitor:      g('competitor'),
    peer_per:        n('peer_per'),
    next_check_date: g('next_check_date'),
    next_check_memo: g('next_check_memo'),
    updated_at:      new Date().toISOString(),
  };
  // 폼에 없던 필드(MISSING) 제거 — 기존 DB 값을 null로 덮어쓰지 않도록
  Object.keys(payload).forEach(k => { if (payload[k] === MISSING) delete payload[k]; });

  if (!payload.stock_code || !payload.corp_name) {
    alert('종목코드와 종목명은 필수입니다.');
    return;
  }

  if (id) {
    await sb.from('watchlist').update(payload).eq('id', id);
  } else {
    await sb.from('watchlist').insert(payload);
  }

  document.getElementById('m-watchlist').remove();
  loadWatchlist();
}
