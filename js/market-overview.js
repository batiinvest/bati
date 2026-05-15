// market-overview.js — 시황 탭: 매크로 지표, 흐름 차트, 전체 종목 동향
// 의존: config.js (sb, chgColor, chgStr, getIndustryMap, getLatestMarketDate), investment.js (INV_ALL_METRICS, INV, mkIndexCard)

// ── 흐름 비교 차트 전역 변수 ──
let _invTrendChart = null;

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
async function loadMarketOverview(maxDate) {
  // 전체 종목 조회 — 페이지네이션 (Supabase 기본 limit 1000 우회)
  const industryMap = await getIndustryMap();
  let all = [];
  let from = 0;
  while (true) {
    const { data } = await sb.from('market_data')
      .select('stock_code,corp_name,price,price_change_rate,market,market_cap')
      .eq('base_date', maxDate)
      .not('price_change_rate', 'is', null)
      .range(from, from + 999);
    if (!data?.length) break;
    all = all.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  const enriched = all.map(r => ({
    ...r,
    industry:    industryMap[r.stock_code] || r.market || '기타',
    sub_industry: (window._subIndustryMap || {})[r.stock_code] || '기타',
  }));

  // ── 전체/시장별 집계 ──────────────────────────────────────────
  const rise  = enriched.filter(r => r.price_change_rate > 0).length;
  const fall  = enriched.filter(r => r.price_change_rate < 0).length;
  const flat  = enriched.length - rise - fall;
  const avg   = enriched.reduce((s,r) => s + r.price_change_rate, 0) / enriched.length;

  const mkStat = (mkt) => {
    const m = enriched.filter(r => r.market === mkt);
    const r = m.filter(r => r.price_change_rate > 0).length;
    const f = m.filter(r => r.price_change_rate < 0).length;
    return { total: m.length, rise: r, fall: f, flat: m.length - r - f };
  };
  const kospi  = mkStat('KOSPI');
  const kosdaq = mkStat('KOSDAQ');

  // ── 시장별 종목 현황 카드 ─────────────────────────────────────
  const _mkCard = (id, label, st, color, indexVal, indexChg) => {
    const el = document.getElementById(id);
    if (!el || !st.total) return;
    const pct = (st.rise / st.total * 100).toFixed(0);
    const valStr = indexVal != null
      ? indexVal.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})
      : '';
    el.innerHTML =
      // 헤더: 라벨 — 지수값 — 등락률 한 줄
      '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:6px">' +
        '<span style="font-size:12px;font-weight:700;color:' + color + '">' + label + '</span>' +
        (indexVal != null
          ? '<span style="font-size:15px;font-weight:800;margin-left:4px">' + valStr + '</span>' +
            '<span style="font-size:12px;font-weight:700;color:' + chgColor(indexChg) + '">' + chgStr(indexChg) + '</span>'
          : '') +
        '<span style="margin-left:auto;font-size:10px;color:var(--text3)">' + st.total.toLocaleString() + '개</span>' +
      '</div>' +
      // 바
      '<div style="height:5px;border-radius:3px;overflow:hidden;background:rgba(255,255,255,0.08);margin-bottom:6px;display:flex">' +
        '<div style="width:' + pct + '%;background:var(--red)"></div>' +
        '<div style="flex:1;background:var(--blue)"></div>' +
      '</div>' +
      // 수치
      '<div style="display:flex;gap:8px;font-size:11px">' +
        '<span style="color:var(--red);font-weight:700">▲ ' + st.rise.toLocaleString() + '</span>' +
        '<span style="color:var(--blue);font-weight:700">▼ ' + st.fall.toLocaleString() + '</span>' +
        '<span style="color:var(--text3)">━ ' + st.flat.toLocaleString() + '</span>' +
        '<span style="margin-left:auto;color:var(--text3)">총 ' + st.total.toLocaleString() + '개</span>' +
      '</div>';
  };

  // ── 전체 요약 카드 ────────────────────────────────────────────
  const totalEl = document.getElementById('inv-total-summary');
  if (totalEl) {
    const risePct = (rise / enriched.length * 100).toFixed(0);
    totalEl.innerHTML =
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;width:100%">' +
        '<div id="inv-mkt-kospi"  style="padding:10px 14px;background:var(--bg3);border-radius:8px"></div>' +
        '<div id="inv-mkt-kosdaq" style="padding:10px 14px;background:var(--bg3);border-radius:8px"></div>' +
        '<div id="inv-mkt-total"  style="padding:10px 14px;background:var(--bg3);border-radius:8px"></div>' +
      '</div>';

    // 전체 종목 카드 직접 렌더링
    const totalCard = document.getElementById('inv-mkt-total');
    if (totalCard) {
      const avg_ = avg;
      totalCard.innerHTML =
        '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:6px">' +
          '<span style="font-size:12px;font-weight:700;color:var(--text3)">전체</span>' +
          '<span style="font-size:15px;font-weight:800;margin-left:4px">' + enriched.length.toLocaleString() + '개</span>' +
          '<span style="font-size:12px;font-weight:700;color:' + chgColor(avg_) + '">평균 ' + chgStr(avg_) + '</span>' +
          '<span style="margin-left:auto;font-size:10px;color:var(--text3)">' + enriched.length.toLocaleString() + '개</span>' +
        '</div>' +
        '<div style="height:5px;border-radius:3px;overflow:hidden;background:rgba(255,255,255,0.08);margin-bottom:6px;display:flex">' +
          '<div style="width:' + risePct + '%;background:var(--red)"></div>' +
          '<div style="width:' + ((enriched.length-rise-fall)/enriched.length*100).toFixed(1) + '%;background:rgba(255,255,255,0.06)"></div>' +
          '<div style="flex:1;background:var(--blue)"></div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;font-size:11px">' +
          '<span style="color:var(--red);font-weight:700">▲ ' + rise.toLocaleString() + '</span>' +
          '<span style="color:var(--blue);font-weight:700">▼ ' + fall.toLocaleString() + '</span>' +
          '<span style="color:var(--text3)">━ ' + flat.toLocaleString() + '</span>' +
        '</div>';
    }
  }

  // macro_data에서 코스피/코스닥 지수값 조회
  let _kospiVal = null, _kospiChg = null, _kosdaqVal = null, _kosdaqChg = null;
  try {
    const { data: _macro } = await sb.from('macro_data')
      .select('kospi,kospi_chg,kosdaq,kosdaq_chg')
      .order('base_date', {ascending: false}).limit(1).single();
    if (_macro) {
      _kospiVal  = _macro.kospi;  _kospiChg  = _macro.kospi_chg;
      _kosdaqVal = _macro.kosdaq; _kosdaqChg = _macro.kosdaq_chg;
    }
  } catch(e) { /* null 유지 */ }

  _mkCard('inv-mkt-kospi',  '코스피', kospi,  '#2AABEE', _kospiVal,  _kospiChg);
  _mkCard('inv-mkt-kosdaq', '코스닥', kosdaq, '#2dce89', _kosdaqVal, _kosdaqChg);

  // ── 산업별 + 세부섹터별 집계 ─────────────────────────────────
  const indMap = {};
  enriched.forEach(r => {
    const ind = r.industry || '기타';
    const sub = r.sub_industry || '기타';
    if (ind === 'KOSPI' || ind === 'KOSDAQ' || ind === '기타') return;
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

  const indGrid = document.getElementById('inv-industry-chart');
  if (!indGrid) return;

  const indRows = Object.entries(indMap)
    .map(([ind, d]) => ({ ind, ...d, avg: d.sumChg / d.total }))
    .sort((a, b) => b.avg - a.avg);

  window._indMapData = indMap;

  const sorted = indRows.slice().sort((a, b) => b.avg - a.avg);
  const labels  = sorted.map(d => d.ind);
  const values  = sorted.map(d => parseFloat(d.avg.toFixed(2)));
  const colors  = values.map(v => v >= 0 ? 'rgba(245,54,92,0.85)' : 'rgba(42,171,238,0.85)');
  const bHeight = Math.max(sorted.length * 36 + 60, 300);

  indGrid.innerHTML =
    '<div style="display:grid;grid-template-columns:420px 1fr;min-height:400px">' +
      '<div style="border-right:1px solid var(--border);padding:12px 14px;overflow-y:auto;max-height:520px" id="ind-left">' +
        '<canvas id="ind-bar-chart" style="width:100%;height:' + bHeight + 'px"></canvas>' +
      '</div>' +
      '<div id="ind-right" style="overflow-y:auto;max-height:520px">' +
        '<div style="display:flex;align-items:center;justify-content:center;height:100%;min-height:200px;color:var(--text3);font-size:13px;flex-direction:column;gap:8px">' +
          '<div style="font-size:22px">←</div>' +
          '<div>막대를 클릭하면 세부 섹터를 볼 수 있습니다</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  if (window.Chart) {
    const canvas = document.getElementById('ind-bar-chart');
    if (!canvas) return;
    const chart = new window.Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderRadius: 3,
          barThickness: 20,
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        onClick: (e, els) => {
          if (els.length) {
            window.showIndDetail(labels[els[0].index]);
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => '  ' + (ctx.raw > 0 ? '+' : '') + ctx.raw + '%'
            },
            backgroundColor: '#1a1d27',
            titleColor: '#f0f2f8',
            bodyColor: '#a8adc4',
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: {
              color: '#6e7491', font: { size: 11 },
              callback: v => (v > 0 ? '+' : '') + v + '%'
            },
          },
          y: {
            grid: { display: false },
            ticks: { color: '#c0c4d8', font: { size: 12 }, cursor: 'pointer' }
          }
        }
      },
      plugins: [{
        id: 'valueLabels',
        afterDatasetsDraw(chart) {
          const ctx = chart.ctx;
          chart.data.datasets.forEach((ds, di) => {
            chart.getDatasetMeta(di).data.forEach((bar, i) => {
              const val = ds.data[i];
              const txt = (val > 0 ? '+' : '') + val + '%';
              const x   = val >= 0 ? bar.x + 4 : bar.x - 4;
              ctx.save();
              ctx.font = 'bold 11px sans-serif';
              ctx.fillStyle = val >= 0 ? 'rgba(245,54,92,1)' : 'rgba(42,171,238,1)';
              ctx.textAlign = val >= 0 ? 'left' : 'right';
              ctx.textBaseline = 'middle';
              ctx.fillText(txt, x, bar.y);
              ctx.restore();
            });
          });
        }
      }]
    });
    window._indBarChart = chart;

    // y축 라벨 위에 클릭 가능한 오버레이 생성
    setTimeout(() => {
      const container = canvas.parentElement;
      container.style.position = 'relative';
      // 기존 오버레이 제거
      container.querySelectorAll('.ind-label-overlay').forEach(el => el.remove());

      const yAxis = chart.scales.y;
      labels.forEach((label, i) => {
        const yPx = yAxis.getPixelForValue(i);
        const barH = yAxis.getPixelForValue(0) - yAxis.getPixelForValue(1);
        const div = document.createElement('div');
        div.className = 'ind-label-overlay';
        div.style.cssText =
          'position:absolute;left:0;width:' + yAxis.right + 'px;' +
          'top:' + (yPx - barH / 2) + 'px;height:' + barH + 'px;' +
          'cursor:pointer;z-index:10;';
        div.addEventListener('click', () => window.showIndDetail(label));
        div.addEventListener('mouseover', () => div.style.background = 'rgba(255,255,255,0.04)');
        div.addEventListener('mouseout',  () => div.style.background = '');
        container.appendChild(div);
      });
    }, 100);
  }

  window.showIndDetail = (indName) => {
    const d = window._indMapData[indName];
    if (!d) return;
    const subRows = Object.entries(d.subs)
      .map(([sub, s]) => ({ sub, ...s, avg: s.sumChg / s.total }))
      .sort((a, b) => b.avg - a.avg);
    const panel = document.getElementById('ind-right');
    if (!panel) return;

    // 헤더
    let leftHtml =
      '<div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:var(--bg2);z-index:1">' +
        '<div style="font-size:14px;font-weight:700">' + indName + '</div>' +
        '<div style="display:flex;gap:8px;align-items:center">' +
          '<span style="font-size:11px;color:var(--text3)">▲' + d.rise + ' ▼' + d.fall + ' · ' + d.total + '개</span>' +
          '<span style="font-size:14px;font-weight:800;color:' + chgColor(d.avg) + '">' + chgStr(d.avg) + '</span>' +
        '</div>' +
      '</div>';

    // 섹터 목록
    subRows.forEach((s, si) => {
      const top3 = [...s.stocks].sort((a,b) => b.price_change_rate - a.price_change_rate).slice(0,3);
      const top3Codes = new Set(top3.map(x => x.stock_code));
      const bot2 = [...s.stocks]
        .filter(x => x.price_change_rate < 0 && !top3Codes.has(x.stock_code))
        .sort((a,b) => a.price_change_rate - b.price_change_rate).slice(0,2);
      const mkTag = (st, clr) =>
        '<span style="font-size:11px;padding:2px 7px;border-radius:4px;background:var(--bg3);color:var(--text2);white-space:nowrap">' +
        st.corp_name + ' <span style="color:' + clr + ';font-weight:600">' + chgStr(st.price_change_rate) + '</span></span>';

      leftHtml +=
        '<div class="sub-sector-row" data-si="' + si + '" style="padding:10px 16px;border-bottom:1px solid var(--border);cursor:pointer">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">' +
            '<span style="font-size:12px;font-weight:700">' + s.sub + '</span>' +
            '<span style="font-size:13px;font-weight:800;color:' + chgColor(s.avg) + '">' + chgStr(s.avg) + '</span>' +
            '<span style="font-size:10px;color:var(--text3)">▲' + s.rise + ' ▼' + s.fall + ' · ' + s.total + '개</span>' +
          '</div>' +
          '<div style="display:flex;gap:3px;flex-wrap:wrap">' +
            top3.map(st => mkTag(st, chgColor(st.price_change_rate))).join('') +
            bot2.map(st => mkTag(st, 'var(--blue)')).join('') +
          '</div>' +
        '</div>';
    });

    // 전체 종목 렌더링 함수
    const renderStockPanel = (title, avg, stocks, rise, fall, flat) => {
      const all = [...stocks].sort((a,b) => b.price_change_rate - a.price_change_rate);
      const r = rise  != null ? rise  : all.filter(s => s.price_change_rate > 0).length;
      const f = fall  != null ? fall  : all.filter(s => s.price_change_rate < 0).length;
      const fl= flat  != null ? flat  : all.filter(s => s.price_change_rate === 0).length;
      return '<div style="padding:10px 14px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--bg2);z-index:1;display:flex;justify-content:space-between;align-items:center">' +
          '<span style="font-size:13px;font-weight:700">' + title + '</span>' +
          '<div style="display:flex;align-items:center;gap:10px">' +
            '<span style="font-size:14px;font-weight:800;color:' + chgColor(avg) + '">' + chgStr(avg) + '</span>' +
            '<span style="color:var(--red);font-size:12px;font-weight:600">▲ ' + r + '</span>' +
            '<span style="color:var(--blue);font-size:12px;font-weight:600">▼ ' + f + '</span>' +
            (fl ? '<span style="color:var(--text3);font-size:12px">━ ' + fl + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:16px 1fr 90px 70px 80px;gap:0;font-size:11px;padding:4px 14px;color:var(--text2);border-bottom:1px solid var(--border)">' +
          '<span></span><span>종목</span><span style="text-align:right;padding-right:0;text-align:right">현재가</span>' +
          '<span style="text-align:right;padding-right:0;text-align:right">등락률</span>' +
          '<span style="text-align:right;min-width:60px">시총</span>' +
        '</div>' +
        all.map((st, i) =>
          '<div style="display:grid;grid-template-columns:16px 1fr 90px 70px 80px;align-items:center;gap:0;padding:7px 14px;border-bottom:1px solid var(--border)">' +
            '<span style="font-size:11px;color:var(--text3)">' + (i+1) + '</span>' +
            '<span style="font-size:13px">' + st.corp_name + '</span>' +
            '<span style="font-size:12px;color:var(--text1);text-align:right;padding-right:12px">' +
              (st.price != null ? st.price.toLocaleString() + '원' : '—') +
            '</span>' +
            '<span style="font-size:13px;font-weight:700;color:' + chgColor(st.price_change_rate) + ';text-align:right">' +
              chgStr(st.price_change_rate) +
            '</span>' +
            '<span style="font-size:12px;color:var(--text2);text-align:right;min-width:60px">' +
              (st.market_cap != null ? fmtCap(st.market_cap) : '—') +
            '</span>' +
          '</div>'
        ).join('');
    };

    // 초기 우측 패널 = 전체 종목
    const initStockPanel = renderStockPanel(indName + ' 전체', d.avg, d.stocks, d.rise, d.fall, d.flat);

    panel.innerHTML =
      '<div style="display:grid;grid-template-columns:1fr 1fr;min-height:300px">' +
        '<div id="sub-left" style="border-right:1px solid var(--border);overflow-y:auto;max-height:480px">' + leftHtml + '</div>' +
        '<div id="sub-stock-panel" style="overflow-y:auto;max-height:480px">' + initStockPanel + '</div>' +
      '</div>';

    // 섹터 클릭 이벤트
    panel.querySelectorAll('.sub-sector-row').forEach(row => {
      row.addEventListener('mouseover', () => { if (!row.dataset.active) row.style.background = 'var(--bg3)'; });
      row.addEventListener('mouseout',  () => { if (!row.dataset.active) row.style.background = ''; });
      row.addEventListener('click', () => {
        const si = parseInt(row.dataset.si);
        panel.querySelectorAll('.sub-sector-row').forEach(r => {
          delete r.dataset.active;
          r.style.background = '';
          r.style.borderLeft = '';
        });
        row.dataset.active = '1';
        row.style.background = 'var(--bg3)';
        row.style.borderLeft = '3px solid var(--tg)';

        const s = subRows[si];
        const sp = document.getElementById('sub-stock-panel');
        if (!s || !sp) return;
        sp.innerHTML = renderStockPanel(s.sub, s.avg, s.stocks, s.rise, s.fall, s.flat);
      });
    });

  };
  if (sorted.length) window.showIndDetail(sorted[0].ind);
}

async function loadMacroData() {
  const { data } = await sb.from('macro_data')
    .select('*').order('base_date', { ascending: false }).limit(1);
  const m = data?.[0] || {};

  const globalEl = document.getElementById('inv-global');
  if (globalEl) globalEl.innerHTML = [
    mkIndexCard('S&P 500',     m.sp500,       m.sp500_chg,       '',  'USA 현물'),
    mkIndexCard('나스닥',       m.nasdaq,      m.nasdaq_chg,      '',  'USA 현물'),
    mkIndexCard('다우존스',     m.dow,         m.dow_chg,         '',  'USA 현물'),
    mkIndexCard('S&P 선물',    m.sp500_fut,   m.sp500_fut_chg,   '',  '선물'),
    mkIndexCard('나스닥 선물',  m.nasdaq_fut,  m.nasdaq_fut_chg,  '',  '선물'),
    mkIndexCard('다우 선물',    m.dow_fut,     m.dow_fut_chg,     '',  '선물'),
    mkIndexCard('VIX',         m.vix,         m.vix_chg,         '',  '공포지수'),
    mkIndexCard('미 10년 금리', m.us10y,       m.us10y_chg,       '%', '국채'),
  ].join('');

  const domEl = document.getElementById('inv-domestic');
  if (domEl) domEl.innerHTML = [
    mkIndexCard('코스피', m.kospi,  m.kospi_chg,  '', 'KOSPI'),
    mkIndexCard('코스닥', m.kosdaq, m.kosdaq_chg, '', 'KOSDAQ'),
  ].join('');

  const fxEl = document.getElementById('inv-fx');
  if (fxEl) fxEl.innerHTML = [
    mkIndexCard('USD/KRW', m.usd_krw, m.usd_krw_chg, '원', '달러'),
    mkIndexCard('JPY/KRW', m.jpy_krw, m.jpy_krw_chg, '원', '100엔'),
    mkIndexCard('EUR/KRW', m.eur_krw, m.eur_krw_chg, '원', '유로'),
    mkIndexCard('CNY/KRW', m.cny_krw, m.cny_krw_chg, '원', '위안'),
  ].join('');

  const cmdEl = document.getElementById('inv-commodity');
  if (cmdEl) cmdEl.innerHTML = [
    mkIndexCard('WTI 유가',  m.wti,    m.wti_chg,    '$', '배럴'),
    mkIndexCard('금',        m.gold,   m.gold_chg,   '$', '온스'),
    mkIndexCard('천연가스',   m.gas,    m.gas_chg,    '$', 'MMBtu'),
    mkIndexCard('구리',      m.copper, m.copper_chg, '$', '파운드'),
  ].join('');

  // 전체 종목 동향 카드 헤더 배너에 글로벌 지수 인라인 표시
  const bannerEl = document.getElementById('inv-banner-content');
  if (bannerEl) {
    const mkB = (label, val, chg, unit) => {
      if (val == null || isNaN(Number(val))) return '';
      const clr = chg != null ? chgColor(chg) : 'var(--text2)';
      const valStr = unit === '%'
        ? Number(val).toFixed(3) + '%'
        : Number(val).toLocaleString(undefined, {maximumFractionDigits: 2});
      const chgHtml = chg != null
        ? '<span style="color:' + clr + ';font-size:10px">' + (chg>0?'+':'') + chg.toFixed(2) + '%</span>'
        : '';
      return '<div style="display:flex;flex-direction:column;gap:1px;flex-shrink:0">' +
        '<span style="font-size:10px;color:var(--text2);line-height:1;font-weight:500">' + label + '</span>' +
        '<div style="display:flex;align-items:baseline;gap:3px">' +
          '<span style="font-size:12px;font-weight:700;color:var(--text1)">' + valStr + '</span>' +
          chgHtml +
        '</div>' +
      '</div>';
    };
    const sep = '<div style="width:1px;background:var(--border);height:28px;flex-shrink:0;align-self:center"></div>';
    bannerEl.innerHTML =
      '<div style="display:flex;gap:10px;align-items:center;flex-wrap:nowrap">' +
      [
        mkB('S&P500',    m.sp500,       m.sp500_chg),
        sep,
        mkB('나스닥',     m.nasdaq,      m.nasdaq_chg),
        sep,
        mkB('다우',       m.dow,         m.dow_chg),
        sep,
        mkB('S&P선물',   m.sp500_fut,   m.sp500_fut_chg),
        sep,
        mkB('나스닥선물', m.nasdaq_fut,  m.nasdaq_fut_chg),
        sep,
        mkB('다우선물',   m.dow_fut,     m.dow_fut_chg),
        sep,
        mkB('VIX',        m.vix,         m.vix_chg),
        sep,
        mkB('미10년',     m.us10y,       m.us10y_chg, '%'),
        sep,
        mkB('달러',       m.usd_krw,     m.usd_krw_chg),
        sep,
        mkB('엔',         m.jpy_krw,     m.jpy_krw_chg),
        sep,
        mkB('유로',       m.eur_krw,     m.eur_krw_chg),
      ].filter(s => s && s !== sep).join(sep) +
      '</div>';
  }
}

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

  const { data: rawRows } = await sb.from('macro_data')
    .select(cols)
    .order('base_date', { ascending: false })
    .limit(INV.period);

  const rows = (rawRows || []).reverse();

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