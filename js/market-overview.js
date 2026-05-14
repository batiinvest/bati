// market-overview.js — 시황 탭: 매크로 지표, 흐름 차트, 전체 종목 동향
// 의존: config.js (sb, chgColor, chgStr, getIndustryMap, getLatestMarketDate), investment.js (INV_ALL_METRICS, INV, mkIndexCard)

// ── companies industry 매핑: config.js의 getIndustryMap() 전역 캐시 사용 ──

// ── 시황 차트 접기/펼치기 ──
function toggleTrendChart() {
  const body   = document.getElementById('inv-trend-body');
  const toggle = document.getElementById('inv-trend-toggle');
  if (!body) return;
  const open = body.style.display === 'none';
  body.style.display = open ? 'block' : 'none';
  if (toggle) toggle.textContent = open ? '접기 ▴' : '펼치기 ▾';
  if (open) loadTrendChart();
}

// ── 전체 종목 + 산업별 동향 ──
async function loadMacroData() {
  const { data } = await sb.from('macro_data')
    .select('*').order('base_date', { ascending: false }).limit(1);
  const m = data?.[0] || {};

  const globalEl = document.getElementById('inv-global');
  if (globalEl) globalEl.innerHTML = [
    mkIndexCard('S&P 500',     m.sp500,    m.sp500_chg,    '',  'USA'),
    mkIndexCard('나스닥',       m.nasdaq,   m.nasdaq_chg,   '',  'USA'),
    mkIndexCard('다우존스',     m.dow,      m.dow_chg,      '',  'USA'),
    mkIndexCard('VIX',         m.vix,      m.vix_chg,      '',  '공포지수'),
    mkIndexCard('미 10년 금리', m.us10y,    m.us10y_chg,    '%', '국채'),
  ].join('');

  const domEl = document.getElementById('inv-domestic');
  if (domEl) domEl.innerHTML = [
    mkIndexCard('코스피',    m.kospi,    m.kospi_chg,    '',  'KOSPI'),
    mkIndexCard('코스닥',    m.kosdaq,   m.kosdaq_chg,   '',  'KOSDAQ'),
  ].join('');

  const fxEl = document.getElementById('inv-fx');
  if (fxEl) fxEl.innerHTML = [
    mkIndexCard('USD/KRW', m.usd_krw, m.usd_krw_chg, '원', '달러'),
    mkIndexCard('JPY/KRW', m.jpy_krw, m.jpy_krw_chg, '원', '100엔'),
    mkIndexCard('EUR/KRW', m.eur_krw, m.eur_krw_chg, '원', '유로'),
    mkIndexCard('CNY/KRW', m.cny_krw, m.cny_krw_chg, '원', '위안'),
  ].join('');

  const commEl = document.getElementById('inv-commodity');
  if (commEl) commEl.innerHTML = [
    mkIndexCard('WTI 유가', m.wti,    m.wti_chg,    '$', '배럴'),
    mkIndexCard('금',       m.gold,   m.gold_chg,   '$', '온스'),
    mkIndexCard('천연가스',  m.gas,    m.gas_chg,    '$', 'MMBtu'),
    mkIndexCard('구리',     m.copper, m.copper_chg, '$', '파운드'),
  ].join('');
}

// ── 흐름 비교 차트 ──
let _invTrendChart = null;

function toggleInvMetric(col) {
  if (INV.selected.has(col)) {
    INV.selected.delete(col);
  } else {
    if (INV.selected.size >= 8) { return; }
    INV.selected.add(col);
  }
  const lbl = document.getElementById('inv-lbl-' + col);
  const m   = INV_ALL_METRICS.find(x => x.col === col);
  if (lbl && m) {
    lbl.style.background  = INV.selected.has(col) ? m.color + '22' : '';
    lbl.style.borderColor = INV.selected.has(col) ? m.color : 'var(--border)';
    lbl.style.color       = INV.selected.has(col) ? m.color : '';
  }
  loadTrendChart();
}

function initInvCheckboxStyles() {
  INV_ALL_METRICS.forEach(m => {
    const lbl = document.getElementById('inv-lbl-' + m.col);
    if (!lbl) return;
    if (INV.selected.has(m.col)) {
      lbl.style.background  = m.color + '22';
      lbl.style.borderColor = m.color;
      lbl.style.color       = m.color;
    }
  });
}

function setInvPeriod(period) {
  INV.period = period;
  document.querySelectorAll('[data-inv-period]').forEach(b =>
    b.classList.toggle('active', b.dataset.invPeriod === String(period)));
  loadTrendChart();
}

async function loadTrendChart() {
  const canvas = document.getElementById('inv-trend-chart');
  const empty  = document.getElementById('inv-trend-empty');
  if (!canvas) return;

  initInvCheckboxStyles();

  if (!INV.selected.size) {
    canvas.style.display = 'none';
    if (empty) { empty.style.display = 'flex'; empty.textContent = '지표를 선택해주세요.'; }
    return;
  }

  const selectedMetrics = INV_ALL_METRICS.filter(m => INV.selected.has(m.col));
  const cols = ['base_date', ...selectedMetrics.map(m => m.col)].join(',');

  const { data: rows } = await sb.from('macro_data')
    .select(cols)
    .order('base_date', { ascending: true })
    .limit(INV.period);

  if (!rows?.length) {
    canvas.style.display = 'none';
    if (empty) { empty.style.display = 'flex'; empty.textContent = '데이터 수집 중... (매일 09:00, 16:10 업데이트)'; }
    return;
  }
  canvas.style.display = 'block';
  if (empty) empty.style.display = 'none';

  const labels = rows.map(r => r.base_date);

  const datasets = selectedMetrics.map(m => {
    const values = rows.map(r => r[m.col]);
    const base   = values.find(v => v != null);
    const normalized = values.map(v => v != null && base ? Math.round(v / base * 10000) / 100 : null);
    return {
      label:           m.name,
      data:            normalized,
      borderColor:     m.color,
      backgroundColor: m.color + '15',
      borderWidth:     2,
      pointRadius:     2,
      pointHoverRadius:5,
      tension:         0.3,
      fill:            false,
      spanGaps:        true,
    };
  });

  if (_invTrendChart) { _invTrendChart.destroy(); _invTrendChart = null; }

  _invTrendChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(2)}`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: 'var(--text3)', maxTicksLimit: 7, maxRotation: 0 },
          grid:  { color: 'var(--border)' },
        },
        y: {
          ticks: { color: 'var(--text3)', callback: v => v + '' },
          grid:  { color: 'var(--border)' },
        }
      }
    }
  });
}

async function loadMarketOverview(maxDate) {
  // 전체 종목 조회 — 페이지네이션 (Supabase 기본 limit 1000 우회)
  let all = [], from = 0;
  while (true) {
    const { data, error } = await sb.from('market_data')
      .select('stock_code,corp_name,price_change_rate,market_cap,market')
      .eq('base_date', maxDate)
      .order('price_change_rate', { ascending: false })
      .range(from, from + 999);
    if (error || !data?.length) break;
    all = all.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }

  const rows = (all||[]).filter(r => r.price_change_rate != null);
  if (!rows.length) return;

  // companies industry 매핑 — 세션 캐시 사용 (매 호출마다 풀스캔 방지)
  const industryMap = await getIndustryMap();

  const enriched = rows.map(r => ({
    ...r,
    industry:    industryMap[r.stock_code] || r.market || '기타',
    sub_industry: (window._subIndustryMap || {})[r.stock_code] || '기타',
  }));

  // ── 전체/시장별 집계 (배너/카드보다 먼저 선언) ────────────────
  const rise  = enriched.filter(r => r.price_change_rate > 0).length;
  const fall  = enriched.filter(r => r.price_change_rate < 0).length;
  const flat  = enriched.length - rise - fall;
  const avg   = enriched.reduce((s,r) => s + r.price_change_rate, 0) / enriched.length;
  const top   = [...enriched].sort((a,b) => b.price_change_rate - a.price_change_rate)[0];
  const bot   = [...enriched].sort((a,b) => a.price_change_rate - b.price_change_rate)[0];

  const mkStat = (mkt) => {
    const m = enriched.filter(r => r.market === mkt);
    const r = m.filter(r => r.price_change_rate > 0).length;
    const f = m.filter(r => r.price_change_rate < 0).length;
    return { total: m.length, rise: r, fall: f, flat: m.length - r - f };
  };
  const kospi  = mkStat('KOSPI');
  const kosdaq = mkStat('KOSDAQ');

  // ── 시장 요약 배너 ─────────────────────────────────────────
  const bannerEl = document.getElementById('inv-banner-content');
  if (bannerEl) {
    const bannerItems = [
      { label: '코스피',
        val: kospi.total ? `▲${kospi.rise} ▼${kospi.fall}` : '—',
        color: kospi.rise > kospi.fall ? 'var(--red)' : 'var(--blue)' },
      { label: '코스닥',
        val: kosdaq.total ? `▲${kosdaq.rise} ▼${kosdaq.fall}` : '—',
        color: kosdaq.rise > kosdaq.fall ? 'var(--red)' : 'var(--blue)' },
      { label: '평균',  val: chgStr(avg), color: chgColor(avg) },
      { label: rise > fall ? '상승 우위' : fall > rise ? '하락 우위' : '팽팽',
        val:   rise > fall ? `+${rise-fall}개` : fall > rise ? `-${fall-rise}개` : '0',
        color: rise > fall ? 'var(--red)' : fall > rise ? 'var(--blue)' : 'var(--text3)' },
    ];
    bannerEl.innerHTML = bannerItems.map(b => `
      <div style="display:flex;align-items:center;gap:5px;font-size:12px">
        <span style="color:var(--text3)">${b.label}</span>
        <span style="font-weight:700;color:${b.color}">${b.val}</span>
      </div>`).join('<span style="color:var(--border);font-size:14px">|</span>');
  }

  // ── 시장별 종목 현황 카드 ────────────────────────────────────
  const _mkCard = (id, label, st, color, indexVal, indexChg) => {
    const el = document.getElementById(id);
    if (!el || !st.total) return;
    const pct = (st.rise / st.total * 100).toFixed(0);
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
        <span style="font-size:11px;font-weight:700;color:${color}">${label}</span>
        ${indexVal != null
          ? `<span style="font-size:11px;font-weight:700">${indexVal.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
              <span style="color:${chgColor(indexChg)}">${chgStr(indexChg)}</span></span>`
          : ''}
      </div>
      <div style="height:5px;border-radius:3px;overflow:hidden;background:var(--bg2);margin-bottom:3px;display:flex">
        <div style="width:${pct}%;background:var(--red)"></div>
        <div style="flex:1;background:var(--blue)"></div>
      </div>
      <div style="display:flex;gap:6px;font-size:10px">
        <span style="color:var(--red)">▲${st.rise}</span>
        <span style="color:var(--blue)">▼${st.fall}</span>
        <span style="color:var(--text3)">━${st.flat}</span>
        <span style="margin-left:auto;color:var(--text3)">${st.total}개</span>
      </div>`;
  };
  const totalEl = document.getElementById('inv-total-summary');
  if (totalEl) {
    const risePct = (rise / enriched.length * 100).toFixed(0);
    const fallPct = (fall / enriched.length * 100).toFixed(0);
    totalEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:0;width:100%;flex-wrap:nowrap">

        <!-- 전체 종목 수 -->
        <div style="padding:0 20px 0 0;border-right:1px solid var(--border);flex-shrink:0">
          <div style="font-size:11px;color:var(--text3);margin-bottom:2px">전체 종목</div>
          <div style="font-size:22px;font-weight:800">${enriched.length.toLocaleString()}개</div>
        </div>

        <!-- 상승/보합/하락 바 + 수치 -->
        <div style="flex:1;padding:0 20px;border-right:1px solid var(--border)">
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px">
            <span style="color:var(--red);font-weight:700">▲ ${rise.toLocaleString()} <span style="font-weight:400;font-size:11px">(${risePct}%)</span></span>
            <span style="color:var(--text3)">━ ${(enriched.length-rise-fall).toLocaleString()}</span>
            <span style="color:var(--blue);font-weight:700">▼ ${fall.toLocaleString()} <span style="font-weight:400;font-size:11px">(${fallPct}%)</span></span>
          </div>
          <div style="display:flex;height:10px;border-radius:5px;overflow:hidden;background:var(--bg3)">
            <div style="width:${risePct}%;background:var(--red);transition:width .4s"></div>
            <div style="width:${(enriched.length-rise-fall)/enriched.length*100}%;background:var(--bg3)"></div>
            <div style="flex:1;background:var(--blue)"></div>
          </div>
        </div>

        <!-- 평균 등락률 -->
        <div style="padding:0 20px;border-right:1px solid var(--border);flex-shrink:0;text-align:center">
          <div style="font-size:11px;color:var(--text3);margin-bottom:2px">평균 등락률</div>
          <div style="font-size:22px;font-weight:800;color:${chgColor(avg)}">${chgStr(avg)}</div>
        </div>

        <!-- 코스피/코스닥 종목 현황 -->
        <div style="display:flex;flex-direction:column;gap:5px;flex:1;padding:0 0 0 20px">
          <div id="inv-mkt-kospi"  style="padding:5px 12px;background:var(--bg3);border-radius:6px;flex:1;display:flex;flex-direction:column;justify-content:space-between"></div>
          <div id="inv-mkt-kosdaq" style="padding:5px 12px;background:var(--bg3);border-radius:6px;flex:1;display:flex;flex-direction:column;justify-content:space-between"></div>
        </div>

      </div>`;
  }

  // macro_data에서 코스피/코스닥 지수값 조회
  let _kospiVal = null, _kospiChg = null, _kosdaqVal = null, _kosdaqChg = null;
  try {
    const { data: _macro } = await sb.from('macro_data')
      .select('kospi,kospi_chg,kosdaq,kosdaq_chg')
      .order('base_date', { ascending: false }).limit(1).single();
    if (_macro) {
      _kospiVal  = _macro.kospi;  _kospiChg  = _macro.kospi_chg;
      _kosdaqVal = _macro.kosdaq; _kosdaqChg = _macro.kosdaq_chg;
    }
  } catch(e) { /* 없으면 null 유지 */ }

  _mkCard('inv-mkt-kospi',  '코스피 종목', kospi,  '#2AABEE', _kospiVal,  _kospiChg);
  _mkCard('inv-mkt-kosdaq', '코스닥 종목', kosdaq, '#2dce89', _kosdaqVal, _kosdaqChg);

  // 산업별 집계
  // ── 산업별 + 세부섹터별 집계 ─────────────────────────────────
  const indMap = {};
  enriched.forEach(r => {
    const ind = r.industry || '기타';
    const sub = r.sub_industry || '기타';
    if (!indMap[ind]) indMap[ind] = { rise:0, fall:0, flat:0, total:0, sumChg:0, stocks:[], subs:{} };
    indMap[ind].total++;
    indMap[ind].sumChg += r.price_change_rate;
    indMap[ind].stocks.push(r);
    if (r.price_change_rate > 0)      indMap[ind].rise++;
    else if (r.price_change_rate < 0) indMap[ind].fall++;
    else                               indMap[ind].flat++;
    if (!indMap[ind].subs[sub]) indMap[ind].subs[sub] = { rise:0, fall:0, flat:0, total:0, sumChg:0, stocks:[] };
    indMap[ind].subs[sub].total++;
    indMap[ind].subs[sub].sumChg += r.price_change_rate;
    indMap[ind].subs[sub].stocks.push(r);
    if (r.price_change_rate > 0)      indMap[ind].subs[sub].rise++;
    else if (r.price_change_rate < 0) indMap[ind].subs[sub].fall++;
    else                               indMap[ind].subs[sub].flat++;
  });

  const indGrid = document.getElementById('inv-industry-grid');
  if (!indGrid) return;

  const indRows = Object.entries(indMap)
    .map(([ind, d]) => ({ ind, ...d, avg: d.sumChg / d.total }))
    .sort((a, b) => b.avg - a.avg);

  indGrid.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;min-height:300px">
      <div style="border-right:1px solid var(--border);overflow-y:auto;max-height:520px" id="ind-left">
        ${indRows.map(d => {
          const barW = Math.round(d.rise / d.total * 100);
          const bgA  = Math.min(Math.abs(d.avg) / 5, 1) * 0.07;
          const bg   = d.avg > 0 ? \`rgba(245,54,92,\${bgA})\` : d.avg < 0 ? \`rgba(42,171,238,\${bgA})\` : 'transparent';
          return \`
          <div class="ind-row" data-ind="\${d.ind}"
            onclick="showIndDetail('\${d.ind}')"
            style="padding:10px 14px;border-bottom:1px solid var(--border);cursor:pointer;position:relative"
            onmouseover="this.style.background='var(--bg3)'"
            onmouseout="if(this.dataset.active!=='1')this.style.background=''"
            id="ind-row-\${d.ind}">
            <div style="position:absolute;inset:0;background:\${bg};pointer-events:none"></div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;position:relative">
              <span style="font-size:13px;font-weight:700">\${d.ind}</span>
              <div style="display:flex;align-items:center;gap:10px">
                <span style="font-size:10px;color:var(--text3)">▲\${d.rise} ▼\${d.fall} ━\${d.flat}</span>
                <span style="font-size:14px;font-weight:800;color:\${chgColor(d.avg)}">\${chgStr(d.avg)}</span>
              </div>
            </div>
            <div style="display:flex;height:6px;border-radius:3px;overflow:hidden;background:var(--bg3);position:relative">
              <div style="width:\${barW}%;background:var(--red)"></div>
              <div style="flex:1;background:var(--blue)"></div>
            </div>
          </div>\`;
        }).join('')}
      </div>
      <div id="ind-right" style="overflow-y:auto;max-height:520px">
        <div style="display:flex;align-items:center;justify-content:center;height:100%;min-height:200px;
          color:var(--text3);font-size:13px;flex-direction:column;gap:8px">
          <div style="font-size:22px">←</div>
          <div>산업을 선택하세요</div>
        </div>
      </div>
    </div>`;

  window._indMapData = indMap;
  window.showIndDetail = (indName) => {
    document.querySelectorAll('.ind-row').forEach(el => {
      const active = el.dataset.ind === indName;
      el.dataset.active = active ? '1' : '';
      el.style.borderLeft = active ? '3px solid var(--tg)' : '';
      el.style.background = active ? 'var(--bg3)' : '';
    });
    const d = window._indMapData[indName];
    if (!d) return;
    const subRows = Object.entries(d.subs)
      .map(([sub, s]) => ({ sub, ...s, avg: s.sumChg / s.total }))
      .sort((a, b) => b.avg - a.avg);
    const panel = document.getElementById('ind-right');
    if (!panel) return;
    panel.innerHTML = \`
      <div style="padding:12px 16px;border-bottom:1px solid var(--border);
        display:flex;justify-content:space-between;align-items:center;
        position:sticky;top:0;background:var(--bg2);z-index:1">
        <div style="font-size:14px;font-weight:700">\${indName}</div>
        <span style="font-size:13px;font-weight:800;color:\${chgColor(d.avg)}">\${chgStr(d.avg)} · \${d.total}개</span>
      </div>
      \${subRows.map(s => {
        const bw = Math.round(s.rise / s.total * 100);
        const top4 = [...s.stocks].sort((a,b) => b.price_change_rate - a.price_change_rate).slice(0,4);
        return \`
        <div style="padding:12px 16px;border-bottom:1px solid var(--border)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
            <span style="font-size:12px;font-weight:600;color:var(--text2)">\${s.sub}</span>
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:10px;color:var(--text3)">▲\${s.rise} ▼\${s.fall} · \${s.total}개</span>
              <span style="font-size:13px;font-weight:700;color:\${chgColor(s.avg)}">\${chgStr(s.avg)}</span>
            </div>
          </div>
          <div style="height:5px;border-radius:3px;overflow:hidden;background:var(--bg3);margin-bottom:8px;display:flex">
            <div style="width:\${bw}%;background:var(--red)"></div>
            <div style="flex:1;background:var(--blue)"></div>
          </div>
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            \${top4.map(stock => \`
              <span style="font-size:10px;padding:2px 7px;border-radius:4px;
                background:var(--bg3);color:\${chgColor(stock.price_change_rate)};white-space:nowrap">
                \${stock.corp_name} \${chgStr(stock.price_change_rate)}
              </span>\`).join('')}
          </div>
        </div>\`;
      }).join('')}\`;
  };

  if (indRows.length) window.showIndDetail(indRows[0].ind);
}
