// 투자노트 — 종목 검색·손익비 계산기·시총↔주가 연동·추가/수정 모달 폼 (watchlist.js에서 분할)

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
  const shares = WL.shares;
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

let _wlSearchTimer = null;

async function searchWatchlistStock(query) {
  const dd = document.getElementById('wl-search-dropdown');
  if (!query || query.length < 1) { dd.style.display = 'none'; return; }

  // config.js 공용 searchCompanies 사용 — 기존 전 상장사 풀 캐시(수천 행 선로드) 제거
  clearTimeout(_wlSearchTimer);
  _wlSearchTimer = setTimeout(async () => {
    const { data: results } = await searchCompanies(query, {
      scope: 'active', limit: 10,
      cols: 'code,name,industry,sub_industry,market',
    });

    if (!results?.length) { dd.style.display = 'none'; return; }

    dd.style.display = 'block';
    dd.innerHTML = results.map(c => {
    const code = (c.code||'').split('.')[0];
    return `<div onclick="selectWatchlistStock('${code}','${escJsStr(c.name)}','${escJsStr(c.industry||'')}','${escJsStr(c.market||'')}')"
      style="padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;font-size:13px"
      onmouseover="this.style.background='var(--bg2)'" onmouseout="this.style.background=''">
      <span style="font-weight:500">${escapeHtml(c.name)}</span>
      <span style="font-size:11px;color:var(--text2)">${code}</span>
      ${c.industry ? `<span style="font-size:10px;padding:1px 6px;border-radius:100px;background:var(--bg3);color:var(--text2)">${escapeHtml(c.industry)}</span>` : ''}
      <span style="font-size:10px;color:var(--text2);margin-left:auto">${escapeHtml(c.market||'')}</span>
    </div>`;
    }).join('');
  }, 200);
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
      WL.shares = Math.round(m.market_cap / m.price); // 원/원 = 주수
      document.getElementById('wl-shares-hint').textContent =
        `발행주식수 약 ${Math.round(WL.shares/10000).toLocaleString()}만주 기준`;
    } else {
      WL.shares = null;
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
  if (!id && WL.prefill) {
    Object.assign(w, WL.prefill);
    WL.prefill = null;
  }

  // 수정 모드: stock_code로 market data 선로드 → WL.shares 세팅 (시총↔주가 연동)
  // await으로 폼 렌더 전에 완료 → race condition 방지
  WL.shares = null;
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
        WL.shares = Math.round(m.market_cap / m.price);
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
  const defaultGroup = w.group_name || (WL.group === '보유중' ? '보유중' : '관심');
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
          💡 평단·수량은 테이블의 <b style="color:var(--buy)">매수</b>/<b style="color:var(--sell)">매도</b> 버튼으로 거래를 기록하면 자동 계산됩니다. (수동 입력도 가능)
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
    if (hint && WL.shares) hint.textContent = `발행주식수 약 ${Math.round(WL.shares/10000).toLocaleString()}만주 기준`;
    if (rrCur && m.price && !rrCur.value) { rrCur.value = m.price; _calcRR(); }
    // 기존 저장값 있으면 시총 단위 힌트 미리 표시
    if (w.watch_price && WL.shares) {
      const wCap = Math.round(w.watch_price * WL.shares / 1e8);
      const wcEl = document.getElementById('wl-watch_cap');
      if (wcEl && !wcEl.value) wcEl.value = wCap;
      _showCapUnit('wl-watch-cap-unit', wCap);
    }
    if (w.target_price && WL.shares) {
      const tCap = Math.round(w.target_price * WL.shares / 1e8);
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
