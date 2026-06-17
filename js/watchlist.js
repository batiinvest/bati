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
    document.getElementById('wl-auto-price').textContent = m.price ? m.price.toLocaleString()+'원' : '—';
    document.getElementById('wl-auto-chg').innerHTML = m.price_change_rate != null
      ? `<span style="color:${chgColor(m.price_change_rate)}">${m.price_change_rate>0?'+':''}${m.price_change_rate.toFixed(2)}%</span>` : '—';
    document.getElementById('wl-auto-cap').textContent = m.market_cap ? fmtEok(m.market_cap / 1e8) : '—';
    document.getElementById('wl-auto-per').textContent = m.per ? m.per.toFixed(1) : '—';
    document.getElementById('wl-auto-pbr').textContent = m.pbr ? m.pbr.toFixed(2) : '—';

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
//  관심종목 (Watchlist) 페이지
// =============================================

function pWatchlist() {
  return `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:8px">
    <div style="display:flex;gap:6px;align-items:center">
      <button class="chip active" data-group="all"    onclick="setWlGroup(this,'all')">전체</button>
      <button class="chip"        data-group="보유중"  onclick="setWlGroup(this,'보유중')">보유중</button>
      <button class="chip"        data-group="관심"    onclick="setWlGroup(this,'관심')">관심</button>
      <button class="chip"        data-group="후보"    onclick="setWlGroup(this,'후보')">후보</button>
      <span id="wl-count" style="font-size:12px;color:var(--text2);margin-left:4px"></span>
    </div>
    <button class="btn btn-primary" onclick="openWatchlistModal(null)">+ 종목 추가</button>
  </div>
  <div id="wl-summary" style="margin-bottom:.75rem"></div>
  <div id="wl-list"></div>`;
}

function setWlGroup(el, group) {
  document.querySelectorAll('.chip[data-group]').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  window._wlGroup = group;
  loadWatchlist();
}

async function loadWatchlist() {
  const group = window._wlGroup || 'all';
  const listEl = document.getElementById('wl-list');
  if (!listEl) return;
  listEl.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text2)"><span class="loading"></span></div>';

  let q = sb.from('watchlist').select('*').order('created_at', { ascending: false });
  if (group !== 'all') q = q.eq('group_name', group);
  const { data, error } = await q;
  if (error) { listEl.innerHTML = '<div style="color:var(--red);padding:1rem">로드 실패</div>'; return; }

  // 현재가 일괄 조회
  const codes = (data || []).map(r => r.stock_code);
  let priceMap = {};
  if (codes.length) {
    const { data: mkt } = await sb.from('market_data')
      .select('stock_code,price,price_change_rate,per,pbr,market_cap')
      .in('stock_code', codes)
      .order('base_date', { ascending: false });
    (mkt || []).forEach(r => { if (!priceMap[r.stock_code]) priceMap[r.stock_code] = r; });
  }

  // ROE 조회 (financials) — 실패해도 무시
  let roeMap = {};
  if (codes.length) {
    try {
      const { data: fins, error: roeErr } = await sb.from('financials')
        .select('stock_code,roe')
        .in('stock_code', codes)
        .not('roe', 'is', null)
        .order('period', { ascending: false });
      if (roeErr) throw roeErr;
      (fins || []).forEach(r => { if (!roeMap[r.stock_code]) roeMap[r.stock_code] = r.roe; });
    } catch (e) { console.warn('ROE 조회 실패:', e?.message || e); }
  }

  // OPM 조회 — operating_profit 우선, 없으면 operating_income 시도
  let opmMap = {};
  if (codes.length) {
    for (const col of ['operating_profit', 'operating_income']) {
      try {
        const { data: fins, error: opmErr } = await sb.from('financials')
          .select(`stock_code,revenue,${col}`)
          .in('stock_code', codes)
          .not(col, 'is', null)
          .order('period', { ascending: false });
        if (opmErr) throw opmErr;
        (fins || []).forEach(r => {
          if (!opmMap[r.stock_code] && r.revenue && r[col]) {
            opmMap[r.stock_code] = r[col] / r.revenue * 100;
          }
        });
        break; // 성공하면 다음 컬럼 시도 안 함
      } catch (e) { console.warn(`OPM(${col}) 조회 실패:`, e?.message || e); }
    }
  }

  document.getElementById('wl-count').textContent = `${(data||[]).length}개`;

  // ── 포트폴리오 요약 카드 ─────────────────────────────────────────────────
  const summaryEl = document.getElementById('wl-summary');
  if (summaryEl) {
    const holding = (data || []).filter(w => w.avg_price && w.quantity && priceMap[w.stock_code]?.price);
    let totalCost = 0, totalVal = 0, totalTgtVal = 0, tgtCount = 0;
    for (const w of holding) {
      const mkt = priceMap[w.stock_code];
      const cost = w.avg_price * w.quantity;
      const val  = mkt.price  * w.quantity;
      totalCost += cost;
      totalVal  += val;
      if (w.target_price) { totalTgtVal += w.target_price * w.quantity; tgtCount++; }
    }
    const totalPnl    = totalVal - totalCost;
    const totalPnlPct = totalCost > 0 ? totalPnl / totalCost * 100 : null;
    const tgtUpside   = totalTgtVal > 0 && totalVal > 0 ? (totalTgtVal - totalVal) / totalVal * 100 : null;

    // 매수 구간 종목 수
    const buyZoneCount = (data || []).filter(w => {
      const mkt = priceMap[w.stock_code];
      if (!mkt?.price || !mkt?.market_cap || !w.watch_price) return false;
      const shares = mkt.market_cap / mkt.price;
      const buyCap = w.watch_price * shares;
      return mkt.market_cap <= buyCap;
    }).length;

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

    const pnlColor = totalPnl >= 0 ? 'var(--up)' : 'var(--down)';
    const kpiCard  = (label, value, sub='', valueColor='var(--text)') =>
      `<div style="flex:1;min-width:130px;padding:12px 14px;background:var(--bg2);border-radius:8px;border:1px solid var(--border)">
        <div style="font-size:var(--fs-label);color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">${label}</div>
        <div style="font-size:var(--fs-big);font-weight:700;color:${valueColor};font-variant-numeric:tabular-nums;line-height:1">${value}</div>
        ${sub ? `<div style="font-size:10px;color:var(--text3);margin-top:4px">${sub}</div>` : ''}
      </div>`;

    summaryEl.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin-bottom:.75rem">
        ${kpiCard('평균 업사이드',
          avgUpside!=null ? `${avgUpside>=0?'+':''}${avgUpside.toFixed(1)}%` : '—',
          `목표가 보유 ${withTarget.length}개`,
          avgUpside!=null&&avgUpside>0 ? 'var(--up)' : 'var(--text)')}
        ${kpiCard('평균 PER',
          avgPer!=null ? avgPer.toFixed(1)+'x' : '—',
          `${codesWithPer.length}개 기준`)}
        ${kpiCard('총 종목 수',
          `${(data||[]).length}개`,
          holding.length ? `보유중 ${holding.length}개` : '관심/후보')}
        ${kpiCard('손익비 평균',
          avgRR!=null ? `${avgRR.toFixed(1)} : 1` : '—',
          `손절가 설정 ${withStopAndTarget.length}개`,
          avgRR!=null&&avgRR>=2 ? 'var(--up)' : avgRR!=null&&avgRR>=1 ? 'var(--accent)' : 'var(--text)')}
        ${holding.length ? kpiCard('평가손익',
          `${totalPnl>=0?'+':''}${fmtNet(totalPnl)}`,
          totalPnlPct!=null ? `${totalPnlPct>=0?'+':''}${totalPnlPct.toFixed(1)}%` : '',
          pnlColor) : ''}
        ${buyZoneCount ? kpiCard('매수구간 진입', `${buyZoneCount}개`, '관심가 이하 도달', 'var(--up)') : ''}
      </div>`;
  }

  const groupColors    = { '관심': '#4a9eff', '후보': '#ffc107', '보유중': 'var(--tg)' };
  const groupTextColors = { '관심': '#0a1f3d', '후보': '#2d1f00', '보유중': '#002b1e' };

  if (!data?.length) {
    listEl.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--text2)">등록된 관심종목이 없어요.<br>+ 종목 추가 버튼을 눌러 추가해주세요.</div>';
    return;
  }

  // ── 정렬 ─────────────────────────────────────────────────────────────────
  if (!window._wlSort) window._wlSort = { key: null, asc: true };
  const { key: sortKey, asc: sortAsc } = window._wlSort;

  const sortVal = (w) => {
    const mkt = priceMap[w.stock_code] || {};
    switch (sortKey) {
      case 'name':     return w.corp_name || '';
      case 'price':    return mkt.price || 0;
      case 'per':      return mkt.per || 0;
      case 'pbr':      return mkt.pbr || 0;
      case 'roe':      return roeMap[w.stock_code] || 0;
      case 'opm':      return opmMap[w.stock_code] || 0;
      case 'cap':      return mkt.market_cap || 0;
      case 'watch':    return w.watch_price || 0;
      case 'target':   return (w.target_price && mkt.price) ? (w.target_price - mkt.price) / mkt.price : 0;
      case 'pnl':      return (w.avg_price && mkt.price) ? (mkt.price - w.avg_price) / w.avg_price : 0;
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

  // ── 테이블 헤더 ───────────────────────────────────────────────────────────
  const thBase = 'font-size:11px;color:var(--text2);font-weight:500;padding:8px 10px;text-align:left;border-bottom:1px solid var(--border);white-space:nowrap;cursor:pointer;user-select:none';
  const thActive = 'color:var(--text1);font-weight:700';
  const arrow = (k) => sortKey === k ? (sortAsc ? ' ↑' : ' ↓') : '';
  const th = (k, label) => {
    const active = sortKey === k ? thActive : '';
    return `<th style="${thBase};${active}" onclick="wlSortBy('${k}')">${label}${arrow(k)}</th>`;
  };
  const thStyle = thBase; // 버튼 없는 빈 컬럼용
  const header = `
    <tr>
      ${th('name',   '종목')}
      ${th('price',  '현재가')}
      ${th('per',    'PER')}
      ${th('pbr',    'PBR')}
      ${th('roe',    'ROE')}
      ${th('opm',    'OPM')}
      ${th('cap',    '시총')}
      ${th('watch',  '관심가')}
      ${th('target', '목표가 · 업사이드')}
      ${th('pnl',    '매수가 · 손익')}
      <th style="${thStyle};cursor:default">투자포인트</th>
      ${th('check',  '다음 점검')}
      <th style="${thStyle};cursor:default"></th>
    </tr>`;

  // ── 각 행 ─────────────────────────────────────────────────────────────────
  const tdStyle = 'padding:9px 10px;border-bottom:1px solid var(--border);vertical-align:middle';

  const rows = sorted.map(w => {
    const mkt   = priceMap[w.stock_code] || {};
    const price = mkt.price;
    const chg   = mkt.price_change_rate;
    const cap   = mkt.market_cap;
    const capEok = cap ? cap / 1e8 : null;
    const per   = mkt.per;
    const pbr   = mkt.pbr;
    const roe   = roeMap[w.stock_code] ?? null;
    const opm   = opmMap[w.stock_code] ?? null;

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
                     <div style="font-size:12px;font-weight:600">${w.watch_price.toLocaleString()}원</div>
                     ${watchCapStr ? `<div style="font-size:11px;color:var(--text1)">${watchCapStr}</div>` : ''}`;
      } else {
        watchCell = `<div style="font-size:12px;font-weight:600">${w.watch_price.toLocaleString()}원</div>
                     ${watchCapStr ? `<div style="font-size:11px;color:var(--text1)">${watchCapStr}</div>` : ''}
                     <div style="font-size:11px;color:var(--down)">▼ ${gap} 하락 시 진입</div>`;
      }
    } else {
      watchCell = `<span style="color:var(--text3);font-size:12px">—</span>`;
    }

    // ── 목표가 · 업사이드 ────────────────────────────────────────────────
    const upsidePct = (w.target_price && price) ? (w.target_price - price) / price * 100 : null;
    let tgtCell;
    if (w.target_price) {
      const color = upsidePct > 0 ? 'var(--up)' : 'var(--down)';
      const tgtCapStr = capOfPrice(w.target_price);
      tgtCell = `<div style="font-size:12px;font-weight:600">${w.target_price.toLocaleString()}원</div>
                 ${tgtCapStr ? `<div style="font-size:11px;color:var(--text1)">${tgtCapStr}</div>` : ''}
                 <div style="font-size:12px;font-weight:700;color:${color}">${upsidePct!=null?(upsidePct>0?'+':'')+upsidePct.toFixed(1)+'%':'—'}</div>`;
    } else {
      tgtCell = `<span style="color:var(--text3);font-size:12px">—</span>`;
    }

    // ── 매수가 · 평가손익 ────────────────────────────────────────────────
    let costCell;
    if (w.avg_price && price) {
      const pnlPct = (price - w.avg_price) / w.avg_price * 100;
      const color  = pnlPct >= 0 ? 'var(--up)' : 'var(--down)';
      const pnlStr = (pnlPct >= 0 ? '+' : '') + pnlPct.toFixed(1) + '%';
      costCell = `<div style="font-size:12px">${w.avg_price.toLocaleString()}원</div>
                  <div style="font-size:12px;font-weight:700;color:${color}">${pnlStr}${w.quantity ? ` · ${fmtNet((price-w.avg_price)*w.quantity)}` : ''}</div>`;
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

    // ── 행 배경: 매수 구간 강조 ─────────────────────────────────────────
    const rowBg = isAtBuy ? 'background:rgba(0,192,135,.05)' : '';

    return `
    <tr style="${rowBg}" onmouseover="this.style.background='rgba(255,255,255,.02)'" onmouseout="this.style.background='${isAtBuy?'rgba(0,192,135,.05)':''}'">
      <td style="${tdStyle}">
        <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
          <span style="font-size:15px;font-weight:700">${w.corp_name}</span>
          <span style="font-size:11px;padding:1px 6px;border-radius:100px;background:${groupColors[w.group_name]||'#888'};color:${groupTextColors[w.group_name]||'#111'};font-weight:700">${w.group_name}</span>
        </div>
        ${w.industry ? `<div style="font-size:11px;color:var(--text2);margin-top:1px">${w.industry}</div>` : ''}
        ${w.catalyst ? `<div style="font-size:11px;color:var(--tg);margin-top:1px">⚡ ${w.catalyst}</div>` : ''}
      </td>
      <td style="${tdStyle}">
        <div style="font-size:13px;font-weight:700">${price ? price.toLocaleString()+'원' : '—'}</div>
        <div style="font-size:11px;font-weight:600;color:${chgColor(chg)}">${chg!=null?(chg>=0?'+':'')+chg.toFixed(2)+'%':''}</div>
      </td>
      <td style="${tdStyle}"><div style="font-size:12px;font-weight:600">${per!=null ? per.toFixed(1)+'x' : '—'}</div></td>
      <td style="${tdStyle}"><div style="font-size:12px;font-weight:600">${pbr!=null ? pbr.toFixed(2)+'x' : '—'}</div></td>
      <td style="${tdStyle}"><div style="font-size:12px;font-weight:600;color:${roe!=null?(roe>=0?'var(--up)':'var(--down)'):'inherit'}">${roe!=null ? roe.toFixed(1)+'%' : '—'}</div></td>
      <td style="${tdStyle}"><div style="font-size:12px;font-weight:600;color:${opm!=null?(opm>=0?'var(--up)':'var(--down)'):'inherit'}">${opm!=null ? opm.toFixed(1)+'%' : '—'}</div></td>
      <td style="${tdStyle}">
        <div style="font-size:12px;font-weight:600">${capEok ? fmtEok(capEok) : '—'}</div>
      </td>
      <td style="${tdStyle}">${watchCell}</td>
      <td style="${tdStyle}">${tgtCell}</td>
      <td style="${tdStyle}">${costCell}</td>
      <td style="${tdStyle};max-width:210px">${thesisCell}</td>
      <td style="${tdStyle}">${checkCell}</td>
      <td style="${tdStyle};white-space:nowrap">
        <div style="display:flex;gap:5px">
          <button class="btn btn-sm" onclick="openWatchlistModal(${w.id})">수정</button>
          <button class="btn btn-sm" style="color:var(--red)" onclick="deleteWatchlist(${w.id},'${w.corp_name}')">삭제</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  listEl.innerHTML = `
    <div class="card" style="overflow-x:auto;padding:0">
      <table class="wl-table" style="width:100%;border-collapse:collapse">
        <thead>${header}</thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function wlSortBy(key) {
  if (window._wlSort.key === key) {
    window._wlSort.asc = !window._wlSort.asc;
  } else {
    window._wlSort = { key, asc: true };
  }
  loadWatchlist();
}

async function deleteWatchlist(id, name) {
  if (!confirm(`${name}을 관심종목에서 삭제할까요?`)) return;
  await sb.from('watchlist').delete().eq('id', id);
  loadWatchlist();
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

  const isHolding = (w.group_name === '보유중');

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
            ${['관심','후보','보유중'].map(g=>`<option value="${g}" ${(w.group_name||(window._wlGroup!=='all'?window._wlGroup:'관심'))===g?'selected':''}>${g}</option>`).join('')}
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
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          ${inp('avg_price','평균 매수가 (원)','','number')}
          ${inp('quantity','보유 수량 (주)','','number')}
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
    if (priceEl) priceEl.textContent = m.price ? m.price.toLocaleString()+'원' : '—';
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
  const g = field => document.getElementById('wl-' + field)?.value?.trim() || null;
  const n = field => { const v = g(field); return v ? parseFloat(v) : null; };
  const i = field => { const v = g(field); return v ? parseInt(v) : null; };

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
    valuation_note:  g('valuation_note'),
    competitor:      g('competitor'),
    peer_per:        n('peer_per'),
    next_check_date: g('next_check_date') || null,
    next_check_memo: g('next_check_memo'),
    updated_at:      new Date().toISOString(),
  };

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
