// screener.js — 종목 스크리너 페이지
// 의존: config.js (INDUSTRIES, fetchAllPages, fmtCap, loadingHTML, emptyHTML)

function pScreener() {
  return `
  <div class="screener-layout" style="display:grid;grid-template-columns:280px 1fr;gap:1rem;align-items:start">
    <div class="card screener-filter" style="position:sticky;top:1rem">
      <div class="card-header"><span class="card-title">필터 조건</span></div>
      <div style="padding:.75rem 1rem;display:flex;flex-direction:column;gap:1rem">
        <div>
          <div style="font-size:12px;color:var(--text2);margin-bottom:6px">산업</div>
          <select class="form-select" id="sc-industry" style="width:100%">
            <option value="">전체</option>
            ${INDUSTRIES.map(i => `<option>${i}</option>`).join('')}
          </select>
        </div>
        <div>
          <div style="font-size:12px;color:var(--text2);margin-bottom:6px">시장</div>
          <select class="form-select" id="sc-market" style="width:100%">
            <option value="">전체</option>
            <option value="KOSPI">코스피</option>
            <option value="KOSDAQ">코스닥</option>
          </select>
        </div>
        <div style="border-top:1px solid var(--border);padding-top:.75rem">
          <div style="font-size:11px;font-weight:600;color:var(--text3);margin-bottom:.75rem">밸류에이션</div>
          ${[['sc-per-min','sc-per-max','PER'],['sc-pbr-min','sc-pbr-max','PBR']].map(([a,b,l])=>`
            <div style="margin-bottom:.75rem">
              <div style="font-size:12px;color:var(--text2);margin-bottom:4px">${l}</div>
              <div style="display:flex;gap:6px;align-items:center">
                <input type="number" class="form-input" id="${a}" placeholder="최소" style="width:70px;padding:4px 8px;font-size:12px">
                <span style="color:var(--text3);font-size:12px">~</span>
                <input type="number" class="form-input" id="${b}" placeholder="최대" style="width:70px;padding:4px 8px;font-size:12px">
              </div>
            </div>`).join('')}
        </div>
        <div style="border-top:1px solid var(--border);padding-top:.75rem">
          <div style="font-size:11px;font-weight:600;color:var(--text3);margin-bottom:.75rem">수익성</div>
          ${[['sc-margin-min','sc-margin-max','영업이익률(%)'],['sc-roe-min','sc-roe-max','ROE(%)'],['sc-roa-min','sc-roa-max','ROA(%)']].map(([a,b,l])=>`
            <div style="margin-bottom:.75rem">
              <div style="font-size:12px;color:var(--text2);margin-bottom:4px">${l}</div>
              <div style="display:flex;gap:6px;align-items:center">
                <input type="number" class="form-input" id="${a}" placeholder="최소" style="width:70px;padding:4px 8px;font-size:12px">
                <span style="color:var(--text3);font-size:12px">~</span>
                <input type="number" class="form-input" id="${b}" placeholder="최대" style="width:70px;padding:4px 8px;font-size:12px">
              </div>
            </div>`).join('')}
        </div>
        <div style="border-top:1px solid var(--border);padding-top:.75rem">
          <div style="font-size:11px;font-weight:600;color:var(--text3);margin-bottom:.75rem">재무건전성</div>
          ${[['sc-debt-min','sc-debt-max','부채비율(%)'],['sc-cr-min','sc-cr-max','유동비율(%)']].map(([a,b,l])=>`
            <div style="margin-bottom:.75rem">
              <div style="font-size:12px;color:var(--text2);margin-bottom:4px">${l}</div>
              <div style="display:flex;gap:6px;align-items:center">
                <input type="number" class="form-input" id="${a}" placeholder="최소" style="width:70px;padding:4px 8px;font-size:12px">
                <span style="color:var(--text3);font-size:12px">~</span>
                <input type="number" class="form-input" id="${b}" placeholder="최대" style="width:70px;padding:4px 8px;font-size:12px">
              </div>
            </div>`).join('')}
        </div>
        <div style="border-top:1px solid var(--border);padding-top:.75rem">
          <div style="font-size:11px;font-weight:600;color:var(--text3);margin-bottom:.75rem">시가총액</div>
          <div style="display:flex;gap:6px;align-items:center">
            <input type="number" class="form-input" id="sc-cap-min" placeholder="최소(억)" style="width:90px;padding:4px 8px;font-size:12px">
            <span style="color:var(--text3);font-size:12px">~</span>
            <input type="number" class="form-input" id="sc-cap-max" placeholder="최대(억)" style="width:90px;padding:4px 8px;font-size:12px">
          </div>
        </div>
        <div style="border-top:1px solid var(--border);padding-top:.75rem">
          <div style="font-size:11px;font-weight:600;color:var(--text3);margin-bottom:.75rem">프리셋</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            <button class="btn btn-sm" onclick="applyPreset('value')">가치주</button>
            <button class="btn btn-sm" onclick="applyPreset('growth')">성장주</button>
            <button class="btn btn-sm" onclick="applyPreset('quality')">우량주</button>
            <button class="btn btn-sm" onclick="applyPreset('reset')">초기화</button>
          </div>
        </div>
        <button class="btn btn-primary" onclick="runScreener()" style="width:100%">검색</button>
      </div>
    </div>
    <div>
      <div id="sc-result" style="color:var(--text3);font-size:13px;padding:2rem;text-align:center">
        조건을 설정하고 검색 버튼을 눌러주세요.
      </div>
    </div>
  </div>`;
}

function applyPreset(type) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  ['sc-per-min','sc-per-max','sc-pbr-min','sc-pbr-max','sc-margin-min','sc-margin-max',
   'sc-roe-min','sc-roe-max','sc-roa-min','sc-roa-max','sc-debt-min','sc-debt-max',
   'sc-cr-min','sc-cr-max','sc-cap-min','sc-cap-max'].forEach(id => set(id, ''));
  if (type === 'value')   { set('sc-per-max','15'); set('sc-pbr-max','1.5'); set('sc-margin-min','5'); set('sc-debt-max','100'); }
  else if (type==='growth')  { set('sc-margin-min','15'); set('sc-roe-min','15'); set('sc-per-max','50'); }
  else if (type==='quality') { set('sc-margin-min','10'); set('sc-roe-min','10'); set('sc-debt-max','100'); set('sc-cr-min','150'); }
}

async function runScreener() {
  const el = document.getElementById('sc-result');
  el.innerHTML = loadingHTML('검색 중...');
  const g = id => { const v = document.getElementById(id)?.value; return v ? parseFloat(v) : null; };
  const industry = document.getElementById('sc-industry')?.value || '';
  const market   = document.getElementById('sc-market')?.value   || '';
  const filters  = {
    perMin:g('sc-per-min'),perMax:g('sc-per-max'),pbrMin:g('sc-pbr-min'),pbrMax:g('sc-pbr-max'),
    marginMin:g('sc-margin-min'),marginMax:g('sc-margin-max'),roeMin:g('sc-roe-min'),roeMax:g('sc-roe-max'),
    roaMin:g('sc-roa-min'),roaMax:g('sc-roa-max'),debtMin:g('sc-debt-min'),debtMax:g('sc-debt-max'),
    crMin:g('sc-cr-min'),crMax:g('sc-cr-max'),capMin:g('sc-cap-min'),capMax:g('sc-cap-max'),
  };

  const {data:latestDate} = await sb.from('market_data').select('base_date').order('base_date',{ascending:false}).limit(1);
  const maxDate = latestDate?.[0]?.base_date;

  const [finRows, mktRows, compRows] = await Promise.all([
    fetchAllPages(sb.from('financials').select('stock_code,operating_margin,roe,roa,debt_ratio,current_ratio,bsns_year,quarter').order('bsns_year',{ascending:false}).order('quarter',{ascending:false})),
    fetchAllPages(sb.from('market_data').select('stock_code,corp_name,market_cap,price,price_change_rate,per,pbr,market').eq('base_date',maxDate)),
    fetchAllPages(sb.from('companies').select('code,industry')),
  ]);

  const finMap={}, indMap={};
  finRows.forEach(r => { if (!finMap[r.stock_code]) finMap[r.stock_code]=r; });
  compRows.forEach(r => { indMap[r.code]=r.industry||''; });

  let combined = mktRows.map(m => ({...m, industry:indMap[m.stock_code]||'', ...(finMap[m.stock_code]||{}), capEok:m.market_cap?Math.round(m.market_cap/1e8):null}));

  const inRange = (val,min,max) => { if (val==null) return (min==null&&max==null); if (min!=null&&val<min) return false; if (max!=null&&val>max) return false; return true; };

  combined = combined.filter(r => {
    if (industry && r.industry!==industry) return false;
    if (market   && r.market!==market)     return false;
    if (!inRange(r.per,            filters.perMin,    filters.perMax))    return false;
    if (!inRange(r.pbr,            filters.pbrMin,    filters.pbrMax))    return false;
    if (!inRange(r.operating_margin,filters.marginMin,filters.marginMax)) return false;
    if (!inRange(r.roe,            filters.roeMin,    filters.roeMax))    return false;
    if (!inRange(r.roa,            filters.roaMin,    filters.roaMax))    return false;
    if (!inRange(r.debt_ratio,     filters.debtMin,   filters.debtMax))   return false;
    if (!inRange(r.current_ratio,  filters.crMin,     filters.crMax))     return false;
    if (!inRange(r.capEok,         filters.capMin,    filters.capMax))    return false;
    return true;
  });
  combined.sort((a,b) => (b.market_cap||0)-(a.market_cap||0));

  if (!combined.length) { el.innerHTML = emptyHTML('조건에 맞는 종목이 없습니다.'); return; }

  const pct=v=>v!=null?v.toFixed(1)+'%':'—', num=v=>v!=null?v.toFixed(1):'—';
  // chgColor, chgStr → config.js 전역 함수 사용 (한국 주식 관행: 상승=빨강)

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem">
      <span style="font-size:13px;font-weight:600">${combined.length}개 종목</span>
      <button class="btn btn-sm" onclick="exportScreener()">CSV 다운로드</button>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>종목명</th><th>산업</th><th>시장</th><th>시가총액</th><th>현재가</th><th>등락률</th><th>PER</th><th>PBR</th><th>영업이익률</th><th>ROE</th><th>ROA</th><th>부채비율</th></tr></thead>
      <tbody>${combined.map(r=>`<tr>
        <td style="font-weight:600;cursor:pointer;color:var(--tg)" onclick="openFinTrend('${r.stock_code}','${r.corp_name}')">${r.corp_name}</td>
        <td><span class="badge badge-cat">${r.industry||'—'}</span></td>
        <td style="font-size:11px;color:var(--text3)">${r.market||'—'}</td>
        <td style="font-size:12px">${fmtCap(r.market_cap)}</td>
        <td style="font-size:12px">${r.price?r.price.toLocaleString()+'원':'—'}</td>
        <td style="font-size:12px;color:${chgColor(r.price_change_rate)}">${chgStr(r.price_change_rate)}</td>
        <td>${num(r.per)}</td><td>${num(r.pbr)}</td>
        <td style="color:${r.operating_margin>0?'var(--green)':'var(--text2)'}">
${pct(r.operating_margin)}</td>
        <td>${pct(r.roe)}</td><td>${pct(r.roa)}</td><td>${pct(r.debt_ratio)}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  window._screenerData = combined;
}

function exportScreener() {
  if (!window._screenerData?.length) return;
  const keys=['corp_name','industry','market','capEok','price','price_change_rate','per','pbr','operating_margin','roe','roa','debt_ratio'];
  const headers=['종목명','산업','시장','시총(억)','현재가','등락률','PER','PBR','영업이익률','ROE','ROA','부채비율'];
  const csv=[headers.join(','),...window._screenerData.map(r=>keys.map(k=>r[k]??'').join(','))].join('\n');
  const a=document.createElement('a');
  a.href='data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(csv);
  a.download='screener_'+new Date().toISOString().slice(0,10)+'.csv';
  a.click();
}
