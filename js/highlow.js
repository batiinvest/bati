// highlow.js — 52주 신고가/신저가 근접 대시보드
// 의존: config.js (sb, fetchAllPages, fmtCap, chgColor, chgStr, getIndustryMap, getLatestMarketDate)
//
// 신고가 근접: 현재가 ≥ 52주 고가 × 0.95 (5% 이내)
// 신저가 근접: 현재가 ≤ 52주 저가 × 1.05 (5% 이내)

let _hlTab  = 'high';   // 'high' | 'low'
let _hlGrp  = 'all';    // 'all' | 산업명
let _hlData = { high: [], low: [] };

function pHighLow() {
  return `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:8px">
    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
      <button class="chip active" data-hl-tab="high" onclick="switchHlTab('high')">📈 52주 고가 근접</button>
      <button class="chip"        data-hl-tab="low"  onclick="switchHlTab('low')">📉 52주 저가 근접</button>
      <span style="width:1px;height:14px;background:var(--border2);margin:0 4px"></span>
      <button class="chip active" data-hl-grp="all"  onclick="switchHlGrp(this,'all')">전체</button>
      ${INDUSTRIES.map(i => `<button class="chip" data-hl-grp="${i}" onclick="switchHlGrp(this,'${i}')">${i}</button>`).join('')}
    </div>
    <span id="hl-date" style="font-size:11px;color:var(--text2)"></span>
  </div>
  <div id="hl-desc" style="font-size:12px;color:var(--text2);margin-bottom:.75rem"></div>
  <div id="hl-body">${loadingHTML('조회 중...')}</div>`;
}

function switchHlTab(tab) {
  _hlTab = tab;
  document.querySelectorAll('[data-hl-tab]').forEach(b =>
    b.classList.toggle('active', b.dataset.hlTab === tab));
  renderHighLow();
}

function switchHlGrp(el, grp) {
  _hlGrp = grp;
  document.querySelectorAll('[data-hl-grp]').forEach(b =>
    b.classList.toggle('active', b.dataset.hlGrp === grp));
  renderHighLow();
}

async function loadHighLow() {
  const el = document.getElementById('hl-body');
  if (!el) return;

  try {
    const [maxDate, indMap] = await Promise.all([
      getLatestMarketDate(),
      getIndustryMap(),
    ]);
    if (!maxDate) { el.innerHTML = emptyHTML('시장 데이터 없음'); return; }

    document.getElementById('hl-date').textContent = maxDate + ' 기준';

    const monCodes = Object.keys(indMap);
    if (!monCodes.length) { el.innerHTML = emptyHTML('모니터링 종목 없음'); return; }

    // 모니터링 종목만 조회 (전체 상장사 포함 시 폭락 종목이 잘못 노출됨)
    const allRows = [];
    for (let i = 0; i < monCodes.length; i += 500) {
      const { data } = await sb.from('market_data')
        .select('stock_code,corp_name,market,price,price_change_rate,market_cap,w52_high,w52_low')
        .eq('base_date', maxDate)
        .not('w52_high', 'is', null)
        .not('w52_low',  'is', null)
        .not('price',    'is', null)
        .in('stock_code', monCodes.slice(i, i + 500))
        .order('market_cap', { ascending: false });
      if (data) allRows.push(...data);
    }
    const rows = allRows;

    const high = [], low = [];
    for (const r of rows) {
      const { price, w52_high, w52_low } = r;
      const industry = indMap[r.stock_code] || '';
      const rec = { ...r, industry };

      if (w52_high > 0 && price >= w52_high * 0.95) {
        rec._pctFromHigh = ((price - w52_high) / w52_high * 100);  // 0 or negative = 돌파
        rec._proximity   = price / w52_high;                         // 1.0 = 신고가
        high.push(rec);
      }
      if (w52_low > 0 && price <= w52_low * 1.05) {
        rec._pctFromLow = ((price - w52_low) / w52_low * 100);      // 0 or positive = 반등
        rec._proximity  = price / w52_low;                           // 1.0 = 신저가
        low.push(rec);
      }
    }

    // 신고가: 현재가/52주고가 내림차순 (가장 가까운 순)
    high.sort((a, b) => b._proximity - a._proximity);
    // 신저가: 현재가/52주저가 오름차순 (가장 가까운 순)
    low.sort((a, b) => a._proximity - b._proximity);

    _hlData = { high, low };
    renderHighLow();
  } catch(e) {
    console.error('[HighLow]', e);
    if (el) el.innerHTML = emptyHTML('조회 실패: ' + e.message);
  }
}

function renderHighLow() {
  const el   = document.getElementById('hl-body');
  const desc = document.getElementById('hl-desc');
  if (!el) return;

  const isHigh  = _hlTab === 'high';
  let rows      = isHigh ? _hlData.high : _hlData.low;
  const total   = rows.length;

  if (_hlGrp !== 'all') rows = rows.filter(r => r.industry === _hlGrp);

  if (!rows.length) {
    if (desc) desc.textContent = '';
    el.innerHTML = emptyHTML(total ? `${_hlGrp} 산업 해당 종목 없음` : '해당 조건 종목 없음');
    return;
  }

  if (desc) {
    desc.textContent = isHigh
      ? `52주 고가 대비 5% 이내 근접 종목 — 오늘 갱신 여부와 무관하게 현재 고가권에 있는 종목 (${rows.length}개)`
      : `52주 저가 대비 5% 이내 근접 종목 — 역발상 저점 투자 후보 (${rows.length}개)`;
  }

  // 산업별 그루핑 (전체 탭일 때)
  if (_hlGrp === 'all') {
    // 산업 집계
    const byInd = {};
    for (const r of rows) {
      const ind = r.industry || '기타';
      if (!byInd[ind]) byInd[ind] = [];
      byInd[ind].push(r);
    }
    const indOrder = Object.keys(byInd).sort((a, b) => byInd[b].length - byInd[a].length);

    el.innerHTML = indOrder.map(ind => `
      <div style="margin-bottom:1.25rem">
        <div style="font-size:12px;font-weight:600;color:var(--text2);margin-bottom:.5rem;padding:0 2px">
          <span class="badge badge-cat">${ind}</span>
          <span style="margin-left:6px;font-size:11px;color:var(--text2)">${byInd[ind].length}개</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:.5rem">
          ${byInd[ind].map(r => _hlCard(r, isHigh)).join('')}
        </div>
      </div>`).join('');
  } else {
    el.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:.5rem">
        ${rows.map(r => _hlCard(r, isHigh)).join('')}
      </div>`;
  }
}

function _hlCard(r, isHigh) {
  const pctFromRef  = isHigh ? r._pctFromHigh : r._pctFromLow;
  const refLabel    = isHigh ? '52주 고가' : '52주 저가';
  const refPrice    = isHigh ? r.w52_high   : r.w52_low;
  const atPeak      = isHigh ? pctFromRef >= 0 : pctFromRef <= 0;
  const borderColor = isHigh
    ? (atPeak ? 'var(--green)' : 'rgba(45,206,137,.3)')
    : (atPeak ? 'var(--red)'  : 'rgba(255,99,99,.3)');
  const accentColor = isHigh ? 'var(--green)' : 'var(--red)';
  const badge       = isHigh
    ? (atPeak ? '🔥 신고가' : `고가 ${Math.abs(pctFromRef).toFixed(1)}% 이내`)
    : (atPeak ? '⚠️ 신저가' : `저가 ${Math.abs(pctFromRef).toFixed(1)}% 이내`);

  return `
  <div style="background:var(--bg1);border:1px solid ${borderColor};border-radius:8px;padding:10px 12px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
      <div>
        <div style="font-size:13px;font-weight:700;display:flex;align-items:center;gap:5px">${r.corp_name}${typeof wlBadge==='function'?wlBadge(r.stock_code):''}</div>
        <div style="font-size:10px;color:var(--text2);margin-top:1px">${r.stock_code} · ${r.market || ''}</div>
      </div>
      <span style="font-size:10px;padding:2px 7px;border-radius:100px;
                   background:${isHigh ? 'rgba(45,206,137,.15)' : 'rgba(255,99,99,.15)'};
                   color:${accentColor};white-space:nowrap">${badge}</span>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:baseline">
      <div>
        <span style="font-size:15px;font-weight:700">${fmtPrice(r.price)}</span>
        <span style="font-size:11px;margin-left:5px;color:${chgColor(r.price_change_rate)}">${chgStr(r.price_change_rate)}</span>
      </div>
      <div style="font-size:11px;color:var(--text2);text-align:right">
        ${refLabel}<br>
        <span style="font-weight:600;color:${accentColor}">${fmtPrice(refPrice)}</span>
      </div>
    </div>
    <div style="font-size:11px;color:var(--text2);margin-top:5px">${fmtCap(r.market_cap)}</div>
  </div>`;
}
