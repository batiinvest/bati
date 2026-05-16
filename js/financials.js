// financials.js — 재무 조회 (시장/재무제표/종합)
// fmtCap, chgColor, chgStr, loadingHTML, emptyHTML, errorHTML, fetchAllPages → config.js 참조

function pFinancials() {
  const industries = ['전체', ...INDUSTRIES];
  return `
  <div class="tabs" style="margin-bottom:.75rem">
    <button class="tab fin-tab ${F.mode==='market'?'active':''}" data-mode="market" onclick="F.mode='market';loadFinancials()">시장 데이터</button>
    <button class="tab fin-tab ${F.mode==='financial'?'active':''}" data-mode="financial" onclick="F.mode='financial';loadFinancials()">재무제표</button>
    <button class="tab fin-tab ${F.mode==='combined'?'active':''}" data-mode="combined" onclick="F.mode='combined';loadFinancials()">종합</button>
  </div>

  <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:1rem">
    <select class="form-select" id="fin-scope" onchange="F.scope=this.value;loadFinancials()" style="width:130px;padding:6px 10px">
      <option value="monitored" ${F.scope==='monitored'?'selected':''}>모니터링 종목</option>
      <option value="all" ${F.scope==='all'?'selected':''}>전체</option>
    </select>
    <input class="search-box" id="fin-q" placeholder="종목명 검색..." oninput="F.q=this.value;loadFinancials()" style="max-width:160px">
    <select class="form-select" id="fin-ind" onchange="F.industry=this.value;loadFinancials()" style="width:120px;padding:6px 10px">
      ${industries.map(i=>`<option value="${i}" ${F.industry===i?'selected':''}>${i}</option>`).join('')}
    </select>
    <span style="font-size:12px;color:var(--text3)" id="fin-count"></span>
    <div style="margin-left:auto;display:flex;gap:6px">
      <button class="btn btn-sm" onclick="loadFinancials()">새로고침</button>
      <button class="btn btn-sm" onclick="exportFinancials()">CSV 다운로드</button>
    </div>
  </div>

  <div class="card" id="fin-table">
    ${loadingHTML()}
  </div>`;
}

let _finData = [];

async function loadFinancials() {
  const el = document.getElementById('fin-table');
  if (!el) return;

  // 산업 필터용 companies 매핑: config.js 전역 캐시 사용
  if (!window._finIndMap) {
    const map = await getIndustryMap();  // config.js 전역 캐시 (이미 로드된 경우 즉시 반환)
    window._finIndMap = map;             // 기존 참조 코드(_finIndMap)와 호환성 유지
  }

  // 탭 active 상태 업데이트
  document.querySelectorAll('.fin-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.mode === F.mode);
  });

  el.innerHTML = loadingHTML();

  try {
    if (F.mode === 'market') {
      await loadMarketData(el);
    } else if (F.mode === 'financial') {
      await loadFinancialData(el);
    } else {
      await loadCombinedData(el);
    }
  } catch(e) {
    el.innerHTML = `${errorHTML(e.message)}`;
  }
}

async function loadMarketData(el) {
  // 모니터링 종목 코드 목록 로드
  let monitoredCodes = null;
  let allCodesSet = null;

  if (F.scope === 'monitored') {
    // 모니터링 종목만
    const compData = await fetchAllPages(
      sb.from('companies').select('code').eq('is_monitored', true)
    );
    monitoredCodes = new Set(compData.map(c => c.code));
  }

  // 가장 최신 base_date — config.js 전역 캐시 사용
  const maxDate = await getLatestMarketDate();

  // 최신 날짜 데이터 전체 로드
  let allMkt = [];
  if (maxDate) {
    allMkt = await fetchAllPages(
      sb.from('market_data').select('*').eq('base_date', maxDate)
    );
  }

  // scope 필터
  const data = monitoredCodes
    ? allMkt.filter(r => monitoredCodes.has(r.stock_code))
    : allMkt;

  // 종목당 최신 1개 (혹시 중복 있을 경우 대비)
  const latest = {};
  (data || []).forEach(r => {
    if (!latest[r.stock_code]) latest[r.stock_code] = r;
  });
  let rows = Object.values(latest);

  // 필터
  if (F.q) rows = rows.filter(r => r.corp_name.includes(F.q));

  // 산업 필터 — companies 테이블과 조인 불가하니 종목 목록으로 필터
  if (F.industry !== '전체') {
    const indStocks = new Set(
      Object.entries(window._finIndMap || {}).filter(([,ind]) => ind === F.industry).map(([code]) => code)
    );
    rows = rows.filter(r => indStocks.has(r.stock_code));
  }

  // 정렬
  rows.sort((a, b) => {
    const av = a[F.sortBy] ?? -Infinity;
    const bv = b[F.sortBy] ?? -Infinity;
    return F.sortDir === 'desc' ? bv - av : av - bv;
  });

  _finData = rows;
  const cnt = document.getElementById('fin-count');
  if (cnt) cnt.textContent = `${rows.length}개`;

  if (!rows.length) {
    el.innerHTML = emptyHTML();
    return;
  }

  const sortBtn = (col, label) => {
    const active = F.sortBy === col;
    const dir = active && F.sortDir === 'desc' ? '↑' : '↓';
    return `<span style="cursor:pointer;${active?'color:var(--tg)':''}" onclick="F.sortBy='${col}';F.sortDir=F.sortBy==='${col}'&&F.sortDir==='desc'?'asc':'desc';loadFinancials()">${label}${active?dir:''}</span>`;
  };

  el.innerHTML = `<div class="table-wrap"><table>
    <thead><tr>
      <th>종목명</th>
      <th>${sortBtn('market_cap','시가총액')}</th>
      <th>${sortBtn('price','현재가')}</th>
      <th>${sortBtn('price_change_rate','등락률')}</th>
      <th>${sortBtn('per','PER')}</th>
      <th>${sortBtn('pbr','PBR')}</th>
      <th>${sortBtn('eps','EPS')}</th>
      <th>${sortBtn('volume','거래량')}</th>
      <th>기준일</th>
    </tr></thead>
    <tbody>${rows.map(r => {
      const chg = r.price_change_rate;
      const cap = fmtCap(r.market_cap);
      return `<tr>
        <td style="font-weight:500;cursor:pointer;color:var(--tg)" onclick="openStockDetail('${r.stock_code}','${r.corp_name}','market')">${r.corp_name}</td>
        <td>${cap}</td>
        <td>${r.price ? r.price.toLocaleString() + '원' : '—'}</td>
        <td style="color:${chgColor(chg)};font-weight:500">${chgStr(chg)}</td>
        <td>${r.per != null && r.per !== 0 ? r.per.toFixed(1) : '—'}</td>
        <td>${r.pbr != null && r.pbr !== 0 ? r.pbr.toFixed(2) : '—'}</td>
        <td>${r.eps ? r.eps.toLocaleString() : '—'}</td>
        <td>${r.volume ? r.volume.toLocaleString() : '—'}</td>
        <td style="font-size:11px;color:var(--text3)">${r.base_date || '—'}</td>
      </tr>`;
    }).join('')}
    </tbody></table></div>`;
}

async function loadFinancialData(el) {
  // 종목당 최신 분기 데이터 — 전체 조회 후 stock_code 기준 최신 1개 추출
  // 모니터링 종목 코드 목록 (scope='monitored' 시)
  let monitoredCodesFin = null;
  if (F.scope === 'monitored') {
    const compData = await fetchAllPages(
      sb.from('companies').select('code').eq('is_monitored', true)
    );
    monitoredCodesFin = new Set(compData.map(c => c.code));
  }

  const allFin = await fetchAllPages(
    sb.from('financials').select('*')
      .order('bsns_year', { ascending: false })
      .order('quarter', { ascending: false })
  );
  const data = monitoredCodesFin
    ? allFin.filter(r => monitoredCodesFin.has(r.stock_code))
    : allFin;

  // 종목당 최신 1개 (bsns_year+quarter 기준)
  const latest = {};
  (data || []).forEach(r => {
    const key = r.stock_code;
    if (!latest[key]) {
      latest[key] = r;
    } else {
      // 더 최신 데이터로 교체
      const cur = latest[key];
      if (r.bsns_year > cur.bsns_year ||
         (r.bsns_year === cur.bsns_year && r.quarter > cur.quarter)) {
        latest[key] = r;
      }
    }
  });
  let rows = Object.values(latest);

  if (F.q) rows = rows.filter(r => r.corp_name.includes(F.q));
  if (F.industry !== '전체') {
    const indStocks = new Set(
      Object.entries(window._finIndMap || {}).filter(([,ind]) => ind === F.industry).map(([code]) => code)
    );
    rows = rows.filter(r => indStocks.has(r.stock_code));
  }

  const sortCol = { 'market_cap': 'revenue', 'price': 'operating_profit' }[F.sortBy] || F.sortBy;
  rows.sort((a, b) => {
    const av = a[sortCol] ?? -Infinity;
    const bv = b[sortCol] ?? -Infinity;
    return F.sortDir === 'desc' ? bv - av : av - bv;
  });

  _finData = rows;
  const cnt = document.getElementById('fin-count');
  if (cnt) cnt.textContent = `${rows.length}개`;

  const fmt = v => fmtCap(v);  // fmtCap: 조/억 단위 자동 변환
  const pct = v => v != null ? v.toFixed(1) + '%' : '—';

  el.innerHTML = `<div class="table-wrap"><table>
    <thead><tr>
      <th>종목명</th><th>기간</th>
      <th>매출액</th><th>매출총이익</th><th>GPM</th>
      <th>영업이익</th><th>영업이익률</th>
      <th>순이익</th><th>순이익률</th>
      <th>ROE</th><th>부채비율</th>
      <th>자산총계</th><th>영업현금흐름</th>
    </tr></thead>
    <tbody>${rows.map(r => {
      const opColor = r.operating_profit > 0 ? 'var(--green)' : r.operating_profit < 0 ? 'var(--red)' : 'var(--text2)';
      const niColor = (r.net_income||0) >= 0 ? '' : 'var(--red)';
      const gpColor = (r.gross_profit||0) >= 0 ? '' : 'var(--red)';
      const ocfColor = (r.operating_cashflow||0) >= 0 ? 'var(--green)' : 'var(--red)';
      return `<tr>
        <td style="font-weight:500;cursor:pointer;color:var(--tg)" onclick="openStockDetail('${r.stock_code}','${r.corp_name}','financial')">${r.corp_name}</td>
        <td style="font-size:11px;color:var(--text2);white-space:nowrap">${r.bsns_year} ${r.quarter}</td>
        <td>${fmt(r.revenue)}</td>
        <td style="color:${gpColor}">${r.gross_profit ? fmt(r.gross_profit) : '—'}</td>
        <td>${pct(r.gross_margin)}</td>
        <td style="color:${opColor}">${fmt(r.operating_profit)}</td>
        <td>${pct(r.operating_margin)}</td>
        <td style="color:${niColor}">${fmt(r.net_income)}</td>
        <td>${pct(r.net_margin)}</td>
        <td>${pct(r.roe)}</td>
        <td>${pct(r.debt_ratio)}</td>
        <td>${fmt(r.total_assets)}</td>
        <td style="color:${ocfColor}">${r.operating_cashflow ? fmt(r.operating_cashflow) : '—'}</td>
      </tr>`;
    }).join('')}
    </tbody></table></div>`;
}

async function loadCombinedData(el) {
  // 시장 + 재무 병합 (병렬 조회)
  const [allM, allF] = await Promise.all([
    fetchAllPages(
      sb.from('market_data')
        .select('stock_code,corp_name,market_cap,price,price_change_rate,per,pbr')
        .order('base_date', { ascending: false })
    ),
    fetchAllPages(
      sb.from('financials')
        .select('stock_code,revenue,operating_profit,net_income,operating_margin,roe,debt_ratio,bsns_year,quarter')
        .order('bsns_year', { ascending: false })
        .order('quarter', { ascending: false })
    ),
  ]);
  const mktRes = { data: allM };
  const finRes = { data: allF };

  const mktMap = {};
  (mktRes.data || []).forEach(r => { if (!mktMap[r.stock_code]) mktMap[r.stock_code] = r; });
  const finMap = {};
  (finRes.data || []).forEach(r => {
    const cur = finMap[r.stock_code];
    if (!cur || r.bsns_year > cur.bsns_year ||
       (r.bsns_year === cur.bsns_year && r.quarter > cur.quarter)) {
      finMap[r.stock_code] = r;
    }
  });

  const allCodes = new Set([...Object.keys(mktMap), ...Object.keys(finMap)]);
  let rows = [...allCodes].map(code => ({
    stock_code: code,
    corp_name: (mktMap[code] || finMap[code])?.corp_name || code,
    ...mktMap[code],
    ...finMap[code],
  }));

  if (F.q) rows = rows.filter(r => r.corp_name.includes(F.q));
  if (F.industry !== '전체') {
    const indStocks = new Set(
      Object.entries(window._finIndMap || {}).filter(([,ind]) => ind === F.industry).map(([code]) => code)
    );
    rows = rows.filter(r => indStocks.has(r.stock_code));
  }

  rows.sort((a,b) => ((b.market_cap||0) - (a.market_cap||0)));
  _finData = rows;
  const cnt = document.getElementById('fin-count');
  if (cnt) cnt.textContent = `${rows.length}개`;

  const fmt = v => fmtCap(v);  // fmtCap: 조/억 단위 자동 변환
  const pct = v => v != null ? v.toFixed(1)+'%' : '—';

  el.innerHTML = `<div class="table-wrap"><table>
    <thead><tr>
      <th>종목명</th><th>시가총액</th><th>현재가</th><th>등락률</th>
      <th>PER</th><th>PBR</th><th>매출액</th><th>영업이익</th>
      <th>영업이익률</th><th>ROE</th><th>기간</th>
    </tr></thead>
    <tbody>${rows.map(r => {
      const chg = r.price_change_rate;
      return `<tr>
        <td style="font-weight:500">${r.corp_name}</td>
        <td>${fmtCap(r.market_cap)}</td>
        <td>${r.price?r.price.toLocaleString()+'원':'—'}</td>
        <td style="color:${chgColor(chg)};font-weight:500">${chgStr(chg)}</td>
        <td>${r.per!=null?r.per.toFixed(1):'—'}</td>
        <td>${r.pbr!=null?r.pbr.toFixed(2):'—'}</td>
        <td>${fmt(r.revenue)}</td>
        <td>${fmt(r.operating_profit)}</td>
        <td>${pct(r.operating_margin)}</td>
        <td>${pct(r.roe)}</td>
        <td style="font-size:11px;color:var(--text3)">${r.bsns_year?r.bsns_year+' '+r.quarter:'—'}</td>
      </tr>`;
    }).join('')}
    </tbody></table></div>`;
}

// ══════════════════════════════════════════
//  📊 종목 상세 통합 모달 (시장데이터 + 재무제표)
// ══════════════════════════════════════════
async function openStockDetail(code, name, initTab = 'market') {
  document.getElementById('m-stock-detail')?.remove();

  const modal = document.createElement('div');
  modal.id = 'm-stock-detail';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';

  modal.innerHTML = `
    <div style="background:var(--bg2);border-radius:12px;width:100%;max-width:960px;
      height:85vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,.5)">

      <!-- 헤더 -->
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);flex-shrink:0">
        <div style="display:flex;align-items:flex-start;justify-content:space-between">
          <div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <span style="font-size:18px;font-weight:700;color:var(--text1)">${name}</span>
              <span style="font-size:12px;color:var(--text3);padding:2px 6px;background:var(--bg3);border-radius:4px;border:1px solid var(--border)">${code}</span>
            </div>
            <div id="sd-industry" style="font-size:11px;color:var(--text3)"></div>
          </div>
          <div style="display:flex;align-items:center;gap:12px">
            <div id="sd-price-badge" style="text-align:right"></div>
            <button onclick="document.getElementById('m-stock-detail').remove()"
              style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:20px;padding:0 4px;line-height:1">×</button>
          </div>
        </div>
      </div>

      <!-- 탭 -->
      <div style="display:flex;gap:0;border-bottom:1px solid var(--border);flex-shrink:0;padding:0 20px">
        <button id="sd-tab-market" onclick="sdSwitchTab('market')"
          style="background:none;border:none;border-bottom:2px solid transparent;
            padding:10px 16px;cursor:pointer;font-size:13px;font-weight:600;
            color:var(--text3);transition:.15s">
          📊 시장 데이터
        </button>
        <button id="sd-tab-financial" onclick="sdSwitchTab('financial')"
          style="background:none;border:none;border-bottom:2px solid transparent;
            padding:10px 16px;cursor:pointer;font-size:13px;font-weight:600;
            color:var(--text3);transition:.15s">
          💰 재무제표
        </button>
      </div>

      <!-- 콘텐츠 -->
      <div id="sd-body" style="overflow-y:auto;padding:20px;flex:1">
        <div style="text-align:center;color:var(--text3);padding:40px">
          <span class="loading"></span> 로딩 중...
        </div>
      </div>
    </div>`;

  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);

  // 산업 정보 로드
  try {
    const { data: ci } = await sb.from('companies')
      .select('industry,sub_industry')
      .or(`code.eq.${code},code.eq.${code}.KS,code.eq.${code}.KQ`)
      .limit(1).single();
    if (ci) {
      const el = document.getElementById('sd-industry');
      if (el) {
        const parts = [ci.industry, ci.sub_industry].filter(Boolean);
        el.innerHTML = parts.map((p,i) =>
          `<span style="color:${i===0?'var(--tg)':'var(--text3)'}">${p}</span>`
        ).join(' <span style="color:var(--text3)">›</span> ');
      }
    }
  } catch(e) {}

  // 탭 전환
  window._sdCode = code;
  window._sdName = name;
  window.sdSwitchTab = async (tab) => {
    ['market','financial'].forEach(t => {
      const btn = document.getElementById('sd-tab-'+t);
      if (btn) {
        btn.style.color = t === tab ? 'var(--tg)' : 'var(--text3)';
        btn.style.borderBottomColor = t === tab ? 'var(--tg)' : 'transparent';
      }
    });
    const body = document.getElementById('sd-body');
    if (!body) return;
    body.innerHTML = '<div style="text-align:center;color:var(--text3);padding:40px"><span class="loading"></span></div>';
    if (tab === 'market') {
      await _renderMarketTab(body, window._sdCode, window._sdName);
    } else {
      await _renderFinancialTab(body, window._sdCode, window._sdName);
    }
  };

  await sdSwitchTab(initTab);
}

async function openFinTrend(stockCode, corpName) {
  openStockDetail(stockCode, corpName, 'financial');
}

async function openMarketDetail(code, name) {
  openStockDetail(code, name, 'market');
}

async function _renderMarketTab(body, code, name) {
  try {
    const { data: latest } = await sb.from('market_data')
      .select('*').eq('stock_code', code)
      .order('base_date', { ascending: false }).limit(1).single();
    const { data: history } = await sb.from('market_data')
      .select('base_date,price,price_change_rate,market_cap,volume,per,pbr,foreign_net_buy')
      .eq('stock_code', code)
      .order('base_date', { ascending: false }).limit(90);

    if (!latest) { body.innerHTML = '<div style="color:var(--text3);padding:40px;text-align:center">데이터 없음</div>'; return; }

    // 헤더 뱃지 업데이트 (탭 전환해도 유지)
    const priceBadge = document.getElementById('sd-price-badge');
    if (priceBadge && latest.price) {
      const chgVal = latest.price_change_rate;
      const chgAmt = latest.price_change;
      priceBadge.innerHTML =
        `<div style="font-size:22px;font-weight:700;color:var(--text1)">${latest.price.toLocaleString()}원</div>` +
        `<div style="display:flex;align-items:center;gap:6px;justify-content:flex-end;margin-top:2px">` +
          `<span style="font-size:14px;font-weight:700;color:${chgColor(chgVal)}">${chgStr(chgVal)}</span>` +
          (chgAmt != null ? `<span style="font-size:12px;color:${chgColor(chgVal)}">${chgAmt>0?'+':''}${chgAmt.toLocaleString()}원</span>` : '') +
          `<span style="font-size:11px;color:var(--text3)">${latest.base_date}</span>` +
        `</div>`;
    }

    const r = latest;
    const chg = r.price_change_rate;
    const hist = (history || []).reverse();
    const hi52 = r.week52_high || 0, lo52 = r.week52_low || 0, cur = r.price || 0;
    const rangePct = hi52 > lo52 ? Math.round((cur - lo52) / (hi52 - lo52) * 100) : 50;

    const retStr = (days) => {
      if (hist.length <= days) return '—';
      const past = hist[Math.max(0, hist.length - 1 - days)]?.price;
      if (!past || !cur) return '—';
      const ret = ((cur - past) / past * 100).toFixed(2);
      return `<span style="color:${ret>=0?'var(--red)':'var(--blue)'}">${ret>=0?'+':''}${ret}%</span>`;
    };

    const row2 = (label, val, color='') =>
      `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--border)">
        <span style="font-size:12px;color:var(--text2)">${label}</span>
        <span style="font-size:13px;font-weight:600;color:${color||'var(--text1)'};">${val}</span>
      </div>`;
    const section = (title, content) =>
      `<div style="background:var(--bg3);border-radius:10px;padding:14px 16px;border:1px solid var(--border)">
        <div style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:.8px;margin-bottom:10px">${title}</div>
        ${content}
      </div>`;

    body.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px">
        ${section('VALUATION', `
          ${row2('시가총액', r.market_cap ? fmtCap(r.market_cap) : '—')}
          ${row2('PER', r.per!=null&&r.per!==0 ? r.per.toFixed(1)+'배' : '—')}
          ${row2('PBR', r.pbr!=null&&r.pbr!==0 ? r.pbr.toFixed(2)+'배' : '—')}
          ${row2('EPS', r.eps ? r.eps.toLocaleString()+'원' : '—')}
          ${row2('BPS', r.bps ? r.bps.toLocaleString()+'원' : '—')}
          ${row2('상장주식수', r.listing_shares ? r.listing_shares.toLocaleString()+'주' : '—')}
        `)}
        ${section('수급', `
          ${row2('외국인 보유율', r.foreign_hold_rate!=null ? r.foreign_hold_rate.toFixed(2)+'%' : '—')}
          ${row2('외국인 순매수', r.foreign_net_buy!=null ? r.foreign_net_buy.toLocaleString()+'주' : '—', r.foreign_net_buy<0?'var(--blue)':'var(--red)')}
          ${row2('프로그램 순매수', r.program_net_buy!=null ? r.program_net_buy.toLocaleString()+'주' : '—', r.program_net_buy<0?'var(--blue)':'var(--red)')}
          ${row2('거래량', r.volume ? r.volume.toLocaleString() : '—')}
          ${row2('거래대금', r.trading_value ? fmtCap(r.trading_value) : '—')}
          ${row2('거래회전율', r.vol_turnover!=null ? r.vol_turnover.toFixed(2)+'%' : '—')}
          ${row2('대출잔고율', r.loan_balance_rate!=null ? r.loan_balance_rate.toFixed(2)+'%' : '—')}
          ${r.market_warn_code && r.market_warn_code !== '00' ? row2('투자경고', r.market_warn_code, 'var(--red)') : ''}
        `)}
        ${section('가격 범위 · 수익률', `
          ${row2('52주 최고', r.week52_high ? r.week52_high.toLocaleString()+'원' : '—', 'var(--red)')}
          ${row2('52주 최저', r.week52_low ? r.week52_low.toLocaleString()+'원' : '—', 'var(--blue)')}
          <div style="margin:8px 0 12px">
            <div style="height:5px;background:var(--border);border-radius:3px;position:relative">
              <div style="position:absolute;left:0;width:${rangePct}%;height:100%;background:var(--tg);border-radius:3px;opacity:.4"></div>
              <div style="position:absolute;left:${rangePct}%;transform:translateX(-50%);width:12px;height:12px;
                background:var(--tg);border:2px solid var(--bg2);border-radius:50%;top:-4px"></div>
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:10px;color:var(--text3)">
              <span>${lo52.toLocaleString()}원</span>
              <span style="color:var(--tg);font-weight:700">현재 ${rangePct}%</span>
              <span>${hi52.toLocaleString()}원</span>
            </div>
          </div>
          ${row2('1주 수익률', r.week_return!=null ? `<span style="color:${r.week_return>=0?'var(--red)':'var(--blue)'}">${r.week_return>=0?'+':''}${r.week_return.toFixed(2)}%</span>` : retStr(5))}
          ${row2('1달 수익률', r.month_return!=null ? `<span style="color:${r.month_return>=0?'var(--red)':'var(--blue)'}">${r.month_return>=0?'+':''}${r.month_return.toFixed(2)}%</span>` : retStr(21))}
          ${row2('3달 수익률', r.quarter_return!=null ? `<span style="color:${r.quarter_return>=0?'var(--red)':'var(--blue)'}">${r.quarter_return>=0?'+':''}${r.quarter_return.toFixed(2)}%</span>` : retStr(63))}
          ${row2('1년 수익률', r.year_return!=null ? `<span style="color:${r.year_return>=0?'var(--red)':'var(--blue)'}">${r.year_return>=0?'+':''}${r.year_return.toFixed(2)}%</span>` : retStr(252))}
        `)}
      </div>
      <div style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:.8px;margin-bottom:8px">최근 시장 데이터 (${hist.length}일)</div>
      <div class="table-wrap"><table>
        <thead><tr>
          <th>기준일</th><th>종가</th><th>등락률</th><th>시가총액</th>
          <th>거래량</th><th>외국인순매수</th><th>PER</th><th>PBR</th>
        </tr></thead>
        <tbody>${hist.slice().reverse().map(h => {
          const hc = h.price_change_rate;
          return `<tr>
            <td style="font-size:11px;color:var(--text3)">${h.base_date}</td>
            <td style="font-weight:600">${h.price ? h.price.toLocaleString()+'원' : '—'}</td>
            <td style="color:${chgColor(hc)};font-weight:600">${chgStr(hc)}</td>
            <td style="color:var(--text2)">${h.market_cap ? fmtCap(h.market_cap) : '—'}</td>
            <td style="color:var(--text2)">${h.volume ? h.volume.toLocaleString() : '—'}</td>
            <td style="color:${h.foreign_net_buy<0?'var(--blue)':'var(--red)'}">
              ${h.foreign_net_buy!=null ? h.foreign_net_buy.toLocaleString() : '—'}
            </td>
            <td style="color:var(--text2)">${h.per!=null&&h.per!==0 ? h.per.toFixed(1) : '—'}</td>
            <td style="color:var(--text2)">${h.pbr!=null&&h.pbr!==0 ? h.pbr.toFixed(2) : '—'}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>`;
  } catch(e) {
    body.innerHTML = `<div style="color:var(--red);padding:20px">오류: ${e.message}</div>`;
  }
}

async function _renderFinancialTab(body, code, name) {
  try {
    const { data: fins } = await sb.from('financials')
      .select('bsns_year,quarter,revenue,operating_profit,net_income,operating_margin,net_margin,roe,roa,debt_ratio,total_assets,total_equity,operating_cashflow,cogs_ratio,gross_margin,sga_ratio')
      .eq('stock_code', code)
      .order('bsns_year').order('quarter');

    if (!fins?.length) {
      body.innerHTML = '<div style="color:var(--text3);padding:40px;text-align:center">재무 데이터 없음</div>';
      return;
    }

    const fmt  = (v) => {
      if (v == null) return '—';
      const 億 = Math.round(v / 100000000);
      if (Math.abs(億) >= 10000) {
        const 조 = Math.floor(億 / 10000);
        const 나머지 = Math.abs(億) % 10000;
        return 나머지 > 0 ? `${조}조 ${나머지.toLocaleString()}억` : `${조}조`;
      }
      return 億.toLocaleString() + '억';
    };
    const pct  = (v) => v!=null ? v.toFixed(1)+'%' : '—';
    const fmtB = (v) => v==null ? null : Math.round(v/100000000);

    body.innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:16px;align-items:center;flex-wrap:wrap">
        <button id="btn-quarter" class="chip active" onclick="window._finView='quarter';window._finRender()">분기별</button>
        <button id="btn-annual"  class="chip"        onclick="window._finView='annual'; window._finRender()">연간별</button>
        <button id="btn-qcomp"   class="chip"        onclick="window._finView='qcomp';  window._finRender()">분기비교</button>
        <div style="display:flex;gap:4px;margin-left:auto;align-items:center">
          <button id="btn-chart-rev"  class="chip active" onclick="window._finChart='revenue'; window._finDrawChart()">매출·영업이익</button>
          <button id="btn-chart-gpm"  class="chip"        onclick="window._finChart='gpm';     window._finDrawChart()">매출·GPM·판관비</button>
          <button id="btn-chart-cf"   class="chip"        onclick="window._finChart='cf';      window._finDrawChart()">현금흐름</button>
          <div style="display:flex;align-items:center;gap:6px;margin-left:8px;border-left:1px solid var(--border);padding-left:8px">
            <span style="font-size:11px;color:var(--text3)">차트</span>
            <button onclick="window._finResizeChart(-60)" style="background:none;border:1px solid var(--border);border-radius:4px;cursor:pointer;color:var(--text2);width:22px;height:22px;font-size:14px;line-height:1">−</button>
            <button onclick="window._finResizeChart(+60)" style="background:none;border:1px solid var(--border);border-radius:4px;cursor:pointer;color:var(--text2);width:22px;height:22px;font-size:14px;line-height:1">+</button>
          </div>
        </div>
      </div>
      <div id="fin-qcomp-sel" style="display:none;gap:6px;align-items:center;margin-bottom:12px">
        <span style="font-size:11px;color:var(--text3);margin-right:2px">비교 분기:</span>
        ${['Q1','Q2','Q3','Q4'].map(q => `
          <button id="btn-qc-${q}" class="chip ${q==='Q1'?'active':''}"
            onclick="window._finCompQ='${q}';
              ['Q1','Q2','Q3','Q4'].forEach(x=>document.getElementById('btn-qc-'+x)?.classList.toggle('active',x==='${q}'));
              window._finRender()">
            ${q}
          </button>`).join('')}
      </div>
      <div id="fin-chart-wrap" style="position:relative;height:220px;margin-bottom:16px">
        <canvas id="fin-chart-canvas"></canvas>
      </div>
      <div class="table-wrap"><table>
        <thead><tr>
          <th>기간</th>
          <th style="text-align:right">매출액</th>
          <th style="text-align:right">영업이익</th>
          <th style="text-align:right">영업이익률</th>
          <th style="text-align:right">순이익</th>
          <th style="text-align:right">순이익률</th>
          <th style="text-align:right">ROE</th>
          <th style="text-align:right">부채비율</th>
          <th style="text-align:right">영업현금흐름</th>
        </tr></thead>
        <tbody id="fin-table-body"></tbody>
      </table></div>`;

    window._finChartH = 220;
    window._finResizeChart = (delta) => {
      window._finChartH = Math.max(160, Math.min(600, window._finChartH + delta));
      const wrap = document.getElementById('fin-chart-wrap');
      if (wrap) wrap.style.height = window._finChartH + 'px';
      window._finDrawChart();
    };

    let finChart = null;

    window._finView  = 'quarter';
    window._finChart = 'revenue';
    window._finCompQ = 'Q1';
    window._fins     = fins;

    window._finGetRows = () => {
      if (window._finView === 'annual') {
        return window._fins.filter(f => f.quarter === 'Q4').map(f => ({...f, label: f.bsns_year+'년'}));
      } else if (window._finView === 'qcomp') {
        // 분기비교: 선택된 분기만 연도별로 정렬
        const q = window._finCompQ || 'Q1';
        return window._fins.filter(f => f.quarter === q).map(f => ({...f, label: f.bsns_year+' '+f.quarter}));
      } else {
        return window._fins.map(f => ({...f, label: f.bsns_year+' '+f.quarter}));
      }
    };

    window._finDrawChart = () => {
      ['rev','gpm','cf'].forEach(t => {
        const b = document.getElementById('btn-chart-'+t);
        if (b) b.classList.toggle('active', t === {revenue:'rev',gpm:'gpm',cf:'cf'}[window._finChart]);
      });
      const rows = window._finGetRows();
      const labels = rows.map(r => r.label);
      const canvas = document.getElementById('fin-chart-canvas');
      if (!canvas || !window.Chart) return;
      if (finChart) { finChart.destroy(); finChart = null; }

      let datasets, chartType;

      if (window._finChart === 'revenue') {
        // 매출액(막대) + 영업이익(막대) + 영업이익률(라인, 우축)
        chartType = 'bar';
        datasets = [
          {
            label: '매출액',
            data: rows.map(r => fmtB(r.revenue)),
            backgroundColor: 'rgba(42,171,238,0.65)',
            borderRadius: 3,
            yAxisID: 'y',
          },
          {
            label: '영업이익',
            data: rows.map(r => fmtB(r.operating_profit)),
            backgroundColor: 'rgba(245,54,92,0.65)',
            borderRadius: 3,
            yAxisID: 'y',
          },
          {
            label: '영업이익률(%)',
            data: rows.map(r => r.operating_margin?.toFixed(1) ?? null),
            type: 'line',
            borderColor: 'rgba(255,193,7,0.9)',
            backgroundColor: 'transparent',
            pointBackgroundColor: 'rgba(255,193,7,0.9)',
            tension: 0.3,
            yAxisID: 'y2',
            borderWidth: 2,
          },
        ];
      } else if (window._finChart === 'gpm') {
        // 매출액(막대) + GPM(라인) + 판관비비율(라인), 우축 %
        chartType = 'bar';
        datasets = [
          {
            label: '매출액',
            data: rows.map(r => fmtB(r.revenue)),
            backgroundColor: 'rgba(42,171,238,0.55)',
            borderRadius: 3,
            yAxisID: 'y',
          },
          {
            label: '매출총이익률(%)',
            data: rows.map(r => r.gross_margin?.toFixed(1) ?? null),
            type: 'line',
            borderColor: 'rgba(45,206,137,0.9)',
            backgroundColor: 'transparent',
            pointBackgroundColor: 'rgba(45,206,137,0.9)',
            tension: 0.3,
            yAxisID: 'y2',
            borderWidth: 2,
          },
          {
            label: '판관비율(%)',
            data: rows.map(r => r.sga_ratio?.toFixed(1) ?? null),
            type: 'line',
            borderColor: 'rgba(255,193,7,0.9)',
            backgroundColor: 'transparent',
            pointBackgroundColor: 'rgba(255,193,7,0.9)',
            tension: 0.3,
            yAxisID: 'y2',
            borderWidth: 2,
            borderDash: [4, 3],
          },
        ];
      } else {
        // 현금흐름 막대
        chartType = 'bar';
        datasets = [
          {
            label: '영업현금흐름',
            data: rows.map(r => fmtB(r.operating_cashflow)),
            backgroundColor: rows.map(r => (fmtB(r.operating_cashflow) ?? 0) >= 0
              ? 'rgba(45,206,137,0.7)' : 'rgba(245,54,92,0.7)'),
            borderRadius: 3,
            yAxisID: 'y',
          },
        ];
      }

      const hasY2 = ['revenue','gpm'].includes(window._finChart);
      finChart = new window.Chart(canvas.getContext('2d'), {
        type: chartType,
        data: { labels, datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { labels: { color: '#a8adc4', font: { size: 11 }, boxWidth: 12 } },
            tooltip: { backgroundColor: '#1a1d27', titleColor: '#f0f2f8', bodyColor: '#a8adc4' },
          },
          scales: {
            x: { ticks: { color: '#6e7491', font: { size: 10 }, maxRotation: 45 }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { ticks: { color: '#6e7491', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' }, position: 'left' },
            ...(hasY2 ? {
              y2: {
                ticks: { color: '#a8adc4', font: { size: 10 }, callback: v => v + '%' },
                grid: { drawOnChartArea: false },
                position: 'right',
              }
            } : {}),
          },
        },
      });
    };

    window._finRender = () => {
      ['quarter','annual','qcomp'].forEach(t => {
        const b = document.getElementById('btn-'+t);
        if (b) b.classList.toggle('active', t === window._finView);
      });

      // 분기비교 모드: 분기 선택 버튼 표시
      const qsel = document.getElementById('fin-qcomp-sel');
      if (qsel) qsel.style.display = window._finView === 'qcomp' ? 'flex' : 'none';

      const rows = window._finGetRows();
      document.getElementById('fin-table-body').innerHTML = rows.map(f => `<tr>
        <td style="font-size:12px;color:var(--text3);white-space:nowrap">${f.label}</td>
        <td style="text-align:right;font-weight:600">${fmt(f.revenue)}</td>
        <td style="text-align:right">${fmt(f.operating_profit)}</td>
        <td style="text-align:right;color:${f.operating_margin>=0?'var(--red)':'var(--blue)'}">${pct(f.operating_margin)}</td>
        <td style="text-align:right">${fmt(f.net_income)}</td>
        <td style="text-align:right;color:${f.net_margin>=0?'var(--red)':'var(--blue)'}">${pct(f.net_margin)}</td>
        <td style="text-align:right">${pct(f.roe)}</td>
        <td style="text-align:right">${pct(f.debt_ratio)}</td>
        <td style="text-align:right">${fmt(f.operating_cashflow)}</td>
      </tr>`).join('');
      window._finDrawChart();
    };

    window._finRender();

  } catch(e) {
    body.innerHTML = `<div style="color:var(--red);padding:20px">오류: ${e.message}</div>`;
  }
}
