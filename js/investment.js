// investment.js — 투자현황 페이지
// 의존: config.js (INDUSTRIES, CATS, fetchAllPages, fmtCap, loadingHTML)

function pInvestment() {
  return `
  <div id="inv-body">
    <div style="display:flex;gap:8px;margin-bottom:1rem;flex-wrap:wrap;align-items:center">
      <select class="form-select" id="inv-industry" onchange="loadInvestment()" style="width:130px;padding:6px 10px">
        <option value="all">전체 산업</option>
        ${INDUSTRIES.map(i => `<option value="${i}">${i}</option>`).join('')}
      </select>
      <span style="font-size:12px;color:var(--text3)" id="inv-date"></span>
      <button class="btn btn-sm" style="margin-left:auto" onclick="loadInvestment()">새로고침</button>
    </div>

    <div class="inv-summary-grid" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:1rem" id="inv-summary">
      <div class="metric-card"><div class="metric-label">급등 (상위 5%)</div><div class="metric-value" style="color:var(--red)" id="inv-surge">—</div></div>
      <div class="metric-card"><div class="metric-label">급락 (하위 5%)</div><div class="metric-value" style="color:var(--blue)" id="inv-drop">—</div></div>
      <div class="metric-card"><div class="metric-label">산업 평균 등락률</div><div class="metric-value" id="inv-avg">—</div></div>
    </div>

    <div class="inv-main-grid" style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;margin-bottom:1rem">
      <div class="card">
        <div class="card-header"><span class="card-title">시총 Top 10</span></div>
        <div id="inv-cap-list" style="padding:.5rem 0"></div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">등락률 순위</span></div>
        <div id="inv-chg-list" style="padding:.5rem 0"></div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">산업별 등락률</span><span style="font-size:11px;color:var(--text3)">각 산업 상위 3종목</span></div>
      <div id="inv-industry-list" style="padding:.5rem 0"></div>
    </div>
  </div>`;
}

async function loadInvestment() {
  const industry = document.getElementById('inv-industry')?.value || 'all';

  // 1) 최신 base_date 확인
  const { data: dateRow } = await sb.from('market_data')
    .select('base_date').order('base_date', { ascending: false }).limit(1);
  const maxDate = dateRow?.[0]?.base_date;
  if (!maxDate) return;
  const dateEl = document.getElementById('inv-date');
  if (dateEl) dateEl.textContent = `기준: ${maxDate}`;

  // 2) 최신 날짜 데이터 전체 조회
  const mktRaw = await fetchAllPages(
    sb.from('market_data')
      .select('stock_code,corp_name,market_cap,price,price_change_rate,per,pbr')
      .eq('base_date', maxDate)
  );
  if (!mktRaw.length) return;

  // 3) companies에서 산업 정보
  const compData = await fetchAllPages(
    sb.from('companies').select('code,industry,sub_industry').eq('active', true)
  );
  const industryMap = {};
  compData.forEach(s => {
    const code = (s.code || '').split('.')[0];
    if (code) industryMap[code] = { industry: s.industry || '기타', sub_industry: s.sub_industry || '' };
  });

  // 산업 정보 합산
  let allData = mktRaw.map(r => ({
    ...r,
    industry:     (industryMap[r.stock_code] || {}).industry     || '기타',
    sub_industry: (industryMap[r.stock_code] || {}).sub_industry || '',
  }));

  // 산업 필터
  const filtered = industry === 'all' ? allData : allData.filter(r => r.industry === industry);
  const withChg  = filtered.filter(r => r.price_change_rate != null);

  // 요약 지표
  const sorted   = [...withChg].sort((a,b) => (b.price_change_rate||0) - (a.price_change_rate||0));
  const top5pct  = Math.max(1, Math.floor(sorted.length * 0.05));
  const surgeAvg = sorted.slice(0, top5pct).reduce((s,r) => s + r.price_change_rate, 0) / top5pct;
  const dropAvg  = sorted.slice(-top5pct).reduce((s,r) => s + r.price_change_rate, 0) / top5pct;
  const avg      = withChg.reduce((s,r) => s + (r.price_change_rate||0), 0) / (withChg.length || 1);

  const surgeEl = document.getElementById('inv-surge');
  const dropEl  = document.getElementById('inv-drop');
  const avgEl   = document.getElementById('inv-avg');
  if (surgeEl) surgeEl.textContent = `+${surgeAvg.toFixed(2)}%`;
  if (dropEl)  dropEl.textContent  = `${dropAvg.toFixed(2)}%`;
  if (avgEl)  { avgEl.textContent  = `${avg >= 0 ? '+' : ''}${avg.toFixed(2)}%`; avgEl.style.color = avg >= 0 ? 'var(--red)' : 'var(--blue)'; }

  // 시총 Top 10
  const capTop = [...filtered].filter(r => r.market_cap).sort((a,b) => (b.market_cap||0) - (a.market_cap||0)).slice(0,10);
  const capEl  = document.getElementById('inv-cap-list');
  if (capEl) {
    capEl.innerHTML = capTop.map((r,i) => {
      const chg = r.price_change_rate;
      const chgColor = chg > 0 ? 'var(--red)' : chg < 0 ? 'var(--blue)' : 'var(--text3)';
      const chgStr   = chg != null ? `${chg > 0 ? '+' : ''}${chg.toFixed(2)}%` : '—';
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 12px;border-bottom:1px solid var(--border)">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:11px;color:var(--text3);width:14px">${i+1}</span>
          <div>
            <div style="font-size:13px;font-weight:500">${r.corp_name}</div>
            <div style="font-size:11px;color:var(--text3)">${r.industry||''}</div>
          </div>
        </div>
        <div style="text-align:right">
          <div style="font-size:12px;font-weight:500">${fmtCap(r.market_cap)}</div>
          <div style="font-size:11px;color:${chgColor}">${chgStr}</div>
        </div>
      </div>`;
    }).join('');
  }

  // 등락률 Top/Bottom 10
  const chgTop    = sorted.slice(0, 10);
  const chgBottom = sorted.slice(-10).reverse();
  const chgEl     = document.getElementById('inv-chg-list');
  if (chgEl) {
    chgEl.innerHTML = `
      <div class="inv-chg-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:0">
        <div>
          <div style="font-size:11px;color:var(--text3);padding:4px 12px;font-weight:500">급등</div>
          ${chgTop.map(r => `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 12px;border-bottom:1px solid var(--border)">
            <div>
              <div style="font-size:12px;font-weight:500">${r.corp_name}</div>
              <div style="font-size:10px;color:var(--text3)">${r.industry||''}</div>
            </div>
            <span style="font-size:12px;font-weight:500;color:var(--red)">+${r.price_change_rate.toFixed(2)}%</span>
          </div>`).join('')}
        </div>
        <div style="border-left:1px solid var(--border)">
          <div style="font-size:11px;color:var(--text3);padding:4px 12px;font-weight:500">급락</div>
          ${chgBottom.map(r => `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 12px;border-bottom:1px solid var(--border)">
            <div>
              <div style="font-size:12px;font-weight:500">${r.corp_name}</div>
              <div style="font-size:10px;color:var(--text3)">${r.industry||''}</div>
            </div>
            <span style="font-size:12px;font-weight:500;color:var(--blue)">${r.price_change_rate.toFixed(2)}%</span>
          </div>`).join('')}
        </div>
      </div>`;
  }

  // 산업별 등락률
  const targetInds = industry === 'all' ? INDUSTRIES : [industry];
  const isSingle   = industry !== 'all';
  const indEl      = document.getElementById('inv-industry-list');
  if (indEl) {
    indEl.innerHTML = targetInds.map(ind => {
      const indStocks = withChg.filter(r => r.industry === ind).sort((a,b) => (b.price_change_rate||0) - (a.price_change_rate||0));
      if (!indStocks.length) return '';
      const indAvg = indStocks.reduce((s,r) => s + (r.price_change_rate||0), 0) / indStocks.length;

      if (isSingle) {
        const subMap = {};
        indStocks.forEach(r => { const sub = r.sub_industry || '기타'; if (!subMap[sub]) subMap[sub] = []; subMap[sub].push(r); });
        const subEntries = Object.entries(subMap).sort((a,b) => {
          const avgA = a[1].reduce((s,r) => s+(r.price_change_rate||0),0)/a[1].length;
          const avgB = b[1].reduce((s,r) => s+(r.price_change_rate||0),0)/b[1].length;
          return avgB - avgA;
        });
        return `<div style="padding:8px 0">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:0 12px;margin-bottom:8px">
            <span style="font-size:13px;font-weight:600">${ind}</span>
            <span style="font-size:12px;color:${indAvg>=0?'var(--red)':'var(--blue)'};font-weight:500">전체 평균 ${indAvg>=0?'+':''}${indAvg.toFixed(2)}%</span>
          </div>
          ${subEntries.map(([sub, stocks]) => {
            const subAvg = stocks.reduce((s,r) => s+(r.price_change_rate||0),0)/stocks.length;
            const icon = subAvg > 1 ? '🔥' : subAvg > 0 ? '🔺' : subAvg < 0 ? '🔹' : '⬜';
            return `<div style="padding:7px 12px;border-top:1px solid var(--border)">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">
                <span style="font-size:12px;font-weight:500;color:var(--text1)">${icon} ${sub}</span>
                <span style="font-size:11px;color:${subAvg>=0?'var(--red)':'var(--blue)'}">${subAvg>=0?'+':''}${subAvg.toFixed(2)}%</span>
              </div>
              <div style="display:flex;gap:5px;flex-wrap:wrap">
                ${stocks.map(r => {
                  const chg = r.price_change_rate || 0;
                  const color = chg > 0 ? 'rgba(45,206,137,.12)' : chg < 0 ? 'rgba(74,158,255,.12)' : 'rgba(128,128,128,.1)';
                  const tc = chg > 0 ? 'var(--green)' : chg < 0 ? 'var(--blue)' : 'var(--text3)';
                  return `<span style="font-size:11px;padding:2px 8px;border-radius:100px;background:${color};color:${tc}">${r.corp_name} ${chg>=0?'+':''}${chg.toFixed(1)}%</span>`;
                }).join('')}
              </div>
            </div>`;
          }).join('')}
        </div>`;
      } else {
        const top3 = indStocks.slice(0, 3);
        const bot3 = indStocks.slice(-3).reverse();
        return `<div style="padding:10px 12px;border-bottom:1px solid var(--border)">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
            <span style="font-size:13px;font-weight:500">${ind}</span>
            <span style="font-size:12px;color:${indAvg>=0?'var(--red)':'var(--blue)'};font-weight:500">평균 ${indAvg>=0?'+':''}${indAvg.toFixed(2)}%</span>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${top3.map(r => `<span style="font-size:11px;padding:2px 8px;border-radius:100px;background:rgba(45,206,137,.12);color:var(--green)">${r.corp_name} +${r.price_change_rate.toFixed(1)}%</span>`).join('')}
            ${bot3.map(r => `<span style="font-size:11px;padding:2px 8px;border-radius:100px;background:rgba(74,158,255,.12);color:var(--blue)">${r.corp_name} ${r.price_change_rate.toFixed(1)}%</span>`).join('')}
          </div>
        </div>`;
      }
    }).filter(Boolean).join('');
  }
}
