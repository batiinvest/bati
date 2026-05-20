// market-overview.js — KR 산업 동향 (loadMarketOverview)
// 의존: config.js (sb, chgColor, chgStr, fmtCap, getIndustryMap, IND_COLORS)

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
      .select('stock_code,corp_name,price,price_change_rate,market,market_cap,week_return,month_return,quarter_return')
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

  // ── 산업별 + 세부섹터별 집계 (모니터링 종목만) ─────────────────
  // industryMap 키 = 모니터링 종목 코드만 포함 (getIndustryMap is_monitored=true 필터)
  const monitoredSet = new Set(Object.keys(industryMap));
  const indMap = {};
  enriched.forEach(r => {
    if (!monitoredSet.has(r.stock_code)) return;  // ✅ 비모니터링 종목 제외
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
    '<div style="display:grid;grid-template-columns:3fr 7fr;min-height:400px">' +
      '<div style="border-right:1px solid var(--border);padding:12px 14px;overflow-y:auto;max-height:520px;min-width:0" id="ind-left">' +
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
    d.avg = d.total ? d.sumChg / d.total : 0;
    const subRows = Object.entries(d.subs)
      .map(([sub, s]) => ({ sub, ...s, avg: s.sumChg / s.total }))
      .sort((a, b) => b.avg - a.avg);
    const panel = document.getElementById('ind-right');
    if (!panel) return;

    // 헤더
    const avgStr = (d.avg != null && !isNaN(d.avg)) ? chgStr(d.avg) : '—';
    const avgClr = (d.avg != null && !isNaN(d.avg)) ? chgColor(d.avg) : 'var(--text3)';

    let leftHtml =
      '<div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:var(--bg2);z-index:1">' +
        '<div style="font-size:14px;font-weight:700">' + indName + '</div>' +
        '<div style="display:flex;align-items:center;gap:10px">' +
          '<span style="font-size:14px;font-weight:800;color:' + avgClr + '">' + avgStr + '</span>' +
          '<span style="color:var(--red);font-size:12px;font-weight:600">▲ ' + d.rise + '</span>' +
          '<span style="color:var(--blue);font-size:12px;font-weight:600">▼ ' + d.fall + '</span>' +
          (d.flat ? '<span style="color:var(--text3);font-size:12px">━ ' + d.flat + '</span>' : '') +
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
    // ── 정렬 상태 ──
    let _sortCol = 'price_change_rate', _sortDir = -1;

    const sortIcon = col => col === _sortCol ? (_sortDir > 0 ? ' ▲' : ' ▼') : '';
    const retStr = v => v != null
      ? '<span style="color:' + (v>=0?'var(--red)':'var(--blue)') + '">' + (v>=0?'+':'') + v.toFixed(1) + '%</span>'
      : '<span style="color:var(--text3)">—</span>';
    const thStyle = col => 'cursor:pointer;text-align:right;font-size:11px;padding:4px 4px;color:' +
      (col===_sortCol?'var(--tg)':'var(--text2)') + ';white-space:nowrap;user-select:none';
    const th = (col, label) =>
      '<span style="' + thStyle(col) + '" onclick="window._moSort(\'' + col + '\')">' + label + sortIcon(col) + '</span>';

    const renderStockPanel = (title, avg, stocks, rise, fall, flat) => {
      const all = [...stocks].sort((a, b) => {
        const va = a[_sortCol] ?? -Infinity;
        const vb = b[_sortCol] ?? -Infinity;
        return _sortDir * (vb - va);
      });
      const r = rise != null ? rise : all.filter(s => s.price_change_rate > 0).length;
      const f = fall != null ? fall : all.filter(s => s.price_change_rate < 0).length;
      const fl = flat != null ? flat : all.filter(s => s.price_change_rate === 0).length;
      const COLS = '16px 1fr 80px 62px 68px 54px 58px 60px';
      return '<div style="padding:10px 14px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--bg2);z-index:1;display:flex;justify-content:space-between;align-items:center">' +
          '<span style="font-size:13px;font-weight:700">' + title + '</span>' +
          '<div style="display:flex;align-items:center;gap:10px">' +
            '<span style="color:var(--red);font-size:12px;font-weight:600">▲ ' + r + '</span>' +
            '<span style="color:var(--blue);font-size:12px;font-weight:600">▼ ' + f + '</span>' +
            (fl ? '<span style="color:var(--text3);font-size:12px">━ ' + fl + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:' + COLS + ';gap:0;padding:4px 14px;border-bottom:1px solid var(--border);background:var(--bg3)">' +
          '<span></span>' +
          '<span style="font-size:11px;color:var(--text2)">종목</span>' +
          th('price', '현재가') +
          th('price_change_rate', '등락률') +
          th('market_cap', '시총') +
          th('week_return', '1주') +
          th('month_return', '1개월') +
          th('quarter_return', '3개월') +
        '</div>' +
        all.map((st, i) =>
          '<div style="display:grid;grid-template-columns:' + COLS + ';align-items:center;gap:0;padding:6px 14px;border-bottom:1px solid var(--border);cursor:pointer" ' +
            'onclick="openStockDetail(\'' + st.stock_code + '\',\'' + (st.corp_name||'').replace(/'/g,"\\\\'" ) + '\')" ' +
            'onmouseenter="this.style.background=\'var(--bg3)\'" onmouseleave="this.style.background=\'\'"> ' +
            '<span style="font-size:11px;color:var(--text3)">' + (i+1) + '</span>' +
            '<span style="font-size:13px">' + st.corp_name + '</span>' +
            '<span style="font-size:12px;color:var(--text1);text-align:right;padding-right:8px">' +
              (st.price != null ? st.price.toLocaleString() + '원' : '—') +
            '</span>' +
            '<span style="font-size:13px;font-weight:700;color:' + chgColor(st.price_change_rate) + ';text-align:right">' +
              chgStr(st.price_change_rate) +
            '</span>' +
            '<span style="font-size:11px;color:var(--text2);text-align:right;padding-right:6px">' +
              (st.market_cap != null ? fmtCap(st.market_cap) : '—') +
            '</span>' +
            '<span style="font-size:11px;text-align:right;padding-right:4px">' + retStr(st.week_return) + '</span>' +
            '<span style="font-size:11px;text-align:right;padding-right:4px">' + retStr(st.month_return) + '</span>' +
            '<span style="font-size:11px;text-align:right">' + retStr(st.quarter_return) + '</span>' +
          '</div>'
        ).join('');
    };

    window._moSort = col => {
      if (_sortCol === col) _sortDir *= -1;
      else { _sortCol = col; _sortDir = -1; }
      const sp = document.getElementById('sub-stock-panel');
      if (!sp) return;
      const activeRow = panel.querySelector('.sub-sector-row[data-active]');
      if (activeRow) {
        const si = parseInt(activeRow.dataset.si);
        const s = subRows[si];
        if (s) sp.innerHTML = renderStockPanel(s.sub, s.avg, s.stocks, s.rise, s.fall, s.flat);
      } else {
        sp.innerHTML = renderStockPanel(indName + ' 전체', d.avg, d.stocks, d.rise, d.fall, d.flat);
      }
    };

    // 초기 우측 패널 = 전체 종목
    const initStockPanel = renderStockPanel(indName + ' 전체', d.avg, d.stocks, d.rise, d.fall, d.flat);

    panel.innerHTML =
      '<div style="display:grid;grid-template-columns:3fr 4fr;min-height:300px">' +
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

  // US ETF 매핑 먼저 로드 (us_etf_map → USKR_MAP)
  await loadUskrMap();

  // 산업별 흐름 비교 차트 로드 → 완료 후 US vs KR 차트 로드 (_krIndDates 의존)
  await loadIndTrendChart();
  loadUsEtfBanner();
  loadUskrChart();

  // 투자포인트 요약 (다른 데이터 로드 완료 후)
  // 신고가 종목
  // KRX 업종지수
  loadKrxIndustry();

  loadNewHighStocks();

  loadFlowData();
  // 기관/외국인 수급

  setTimeout(loadMarketInsight, 1500);
}



// ══════════════════════════════════════════
// 📈 신고가 종목 (오늘의 시황)
// ══════════════════════════════════════════

let _hgprData   = null;   // { w52: [...], yr: [...], hist: [...] }
let _hgprTab    = 'w52';
let _hgprExpanded = false;
const HGPR_PAGE = 10;

async function loadNewHighStocks() {
  const body = document.getElementById('hgpr-body');
  if (!body) return;

  // 오늘 날짜 (KST 기준 — UTC+9)
  const _kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const today = _kst.toISOString().split('T')[0];

  const { data: rows, error } = await sb.from('market_data')
    .select('stock_code,corp_name,price,price_change_rate,market_cap,hgpr_cls,hgpr_cls_code')
    .eq('base_date', today)
    .not('hgpr_cls_code', 'is', null)
    .neq('hgpr_cls_code', '')
    .order('market_cap', { ascending: false });

  if (error || !rows?.length) {
    // 오늘 데이터 없으면 최신 수집일로 재시도
    const { data: latest } = await sb.from('market_data')
      .select('base_date')
      .not('hgpr_cls_code', 'is', null)
      .order('base_date', { ascending: false })
      .limit(1);

    if (!latest?.length) {
      body.innerHTML = '<div style="padding:1rem;color:var(--text3);font-size:12px;text-align:center">신고가 데이터 없음 — 장 마감 후 수집됩니다</div>';
      return;
    }

    const { data: rows2 } = await sb.from('market_data')
      .select('stock_code,corp_name,price,price_change_rate,market_cap,hgpr_cls,hgpr_cls_code')
      .eq('base_date', latest[0].base_date)
      .not('hgpr_cls_code', 'is', null)
      .neq('hgpr_cls_code', '')
      .order('market_cap', { ascending: false });

    _hgprData = _groupHgpr(rows2 || []);
  } else {
    _hgprData = _groupHgpr(rows);
  }

  _hgprExpanded = false;
  renderHgprTab(_hgprTab);
}

function _groupHgpr(rows) {
  return {
    // '1'=52주 신고가 갱신, '0'=신고가 근접 — 모두 52주 탭에 표시
    w52:  rows.filter(r => r.hgpr_cls_code === '1' || r.hgpr_cls_code === '0'),
    yr:   rows.filter(r => r.hgpr_cls_code === '2'),
    hist: rows.filter(r => r.hgpr_cls_code === '3'),
  };
}

function switchHgprTab(tab) {
  _hgprTab = tab;
  _hgprExpanded = false;
  document.querySelectorAll('[data-hgpr-tab]').forEach(b =>
    b.classList.toggle('active', b.dataset.hgprTab === tab));
  renderHgprTab(tab);
}

function toggleHgprExpand() {
  _hgprExpanded = !_hgprExpanded;
  renderHgprTab(_hgprTab);
}

function renderHgprTab(tab) {
  const body = document.getElementById('hgpr-body');
  if (!body || !_hgprData) return;

  const all   = _hgprData[tab] || [];
  const shown = _hgprExpanded ? all : all.slice(0, HGPR_PAGE);

  const clsColor = { '0':'var(--text3)', '1':'var(--tg)', '2':'#fb923c', '3':'#f5a623' };
  const clsLabel = { '0':'근접', '1':'52주', '2':'연간', '3':'역사적' };

  if (!shown.length) {
    body.innerHTML = '<div style="padding:1rem;color:var(--text3);font-size:12px;text-align:center">해당 신고가 종목 없음</div>';
    return;
  }

  const rows_html = shown.map(r => {
    const chg    = r.price_change_rate;
    const chgTxt = chg != null ? (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%' : '—';
    const chgClr = chg != null && chg >= 0 ? 'var(--red)' : 'var(--blue)';
    const cap    = r.market_cap ? fmtCap(r.market_cap) : '—';
    const badge  = clsLabel[r.hgpr_cls_code] || '';
    const bClr   = clsColor[r.hgpr_cls_code] || 'var(--tg)';
    return `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:6px 12px;font-weight:500;font-size:13px">${r.corp_name || r.stock_code}</td>
      <td style="padding:6px 12px;text-align:right;font-weight:500">${r.price ? r.price.toLocaleString() + '원' : '—'}</td>
      <td style="padding:6px 12px;text-align:right;color:${chgClr};font-weight:500">${chgTxt}</td>
      <td style="padding:6px 12px;text-align:right;color:var(--text3);font-size:12px">${cap}</td>
      <td style="padding:6px 12px;text-align:center">
        <span style="font-size:10px;padding:1px 6px;border-radius:3px;
          background:${bClr}22;color:${bClr};font-weight:600">${badge}</span>
      </td>
    </tr>`;
  }).join('');

  const toggleBtn = all.length > HGPR_PAGE ? `
    <tr>
      <td colspan="5" style="padding:8px 12px;text-align:center">
        <button onclick="toggleHgprExpand()"
          style="font-size:12px;background:none;border:1px solid var(--border);
            border-radius:4px;cursor:pointer;color:var(--text3);padding:4px 16px">
          ${_hgprExpanded ? '▲ 접기' : `▼ 전체 보기 (${all.length}개)`}
        </button>
      </td>
    </tr>` : '';

  body.innerHTML = `
    <div style="padding:0 .5rem">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:var(--bg3)">
            <th style="padding:5px 12px;text-align:left;font-size:11px;color:var(--text3);font-weight:500">종목명</th>
            <th style="padding:5px 12px;text-align:right;font-size:11px;color:var(--text3);font-weight:500">현재가</th>
            <th style="padding:5px 12px;text-align:right;font-size:11px;color:var(--text3);font-weight:500">등락률</th>
            <th style="padding:5px 12px;text-align:right;font-size:11px;color:var(--text3);font-weight:500">시총</th>
            <th style="padding:5px 12px;text-align:center;font-size:11px;color:var(--text3);font-weight:500">구분</th>
          </tr>
        </thead>
        <tbody>${rows_html}${toggleBtn}</tbody>
      </table>
    </div>`;
}


// ══════════════════════════════════════════
// 💰 기관/외국인 수급 (오늘의 시황)
// ══════════════════════════════════════════

let _flowData = null;   // { frgn_buy, orgn_buy, both_buy }
let _flowTab  = 'both';

async function loadFlowData() {
  const body = document.getElementById('flow-body');
  if (!body) return;

  const _kst  = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const today = _kst.toISOString().split('T')[0];

  // market_data에서 외국인/기관 순매수 데이터 조회
  const { data: rows } = await sb.from('market_data')
    .select('stock_code,corp_name,price,price_change_rate,market_cap,foreign_net_buy')
    .eq('base_date', today)
    .not('foreign_net_buy', 'is', null)
    .order('market_cap', { ascending: false })
    .limit(100);

  if (!rows?.length) {
    body.innerHTML = '<div style="padding:1rem;color:var(--text3);font-size:12px;text-align:center">수급 데이터 없음 — 장중/장마감 후 수집됩니다</div>';
    return;
  }

  const frgn_buy = rows.filter(r => (r.foreign_net_buy || 0) > 0)
    .sort((a,b) => b.foreign_net_buy - a.foreign_net_buy).slice(0, 20);
  const orgn_buy = [];   // 기관순매수: FHKST01010100 미제공 — 별도 API 필요
  const both_buy = frgn_buy.slice(0, 10);  // 외국인 순매수 상위로 대체

  _flowData = { frgn_buy, orgn_buy, both_buy };
  renderFlowTab(_flowTab);
}

function switchFlowTab(tab) {
  _flowTab = tab;
  document.querySelectorAll('[data-flow-tab]').forEach(b =>
    b.classList.toggle('active', b.dataset.flowTab === tab));
  renderFlowTab(tab);
}

function renderFlowTab(tab) {
  const body = document.getElementById('flow-body');
  if (!body || !_flowData) return;

  const data = _flowData[tab === 'frgn' ? 'frgn_buy' : tab === 'orgn' ? 'orgn_buy' : 'both_buy'] || [];

  if (!data.length) {
    body.innerHTML = '<div style="padding:1rem;color:var(--text3);font-size:12px;text-align:center">해당 수급 데이터 없음</div>';
    return;
  }

  const rows_html = data.map(r => {
    const chg    = r.price_change_rate;
    const chgTxt = chg != null ? (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%' : '—';
    const chgClr = chg != null && chg >= 0 ? 'var(--red)' : 'var(--blue)';
    const fNet   = r.foreign_net_buy || 0;
    return `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:6px 12px;font-weight:500;font-size:13px">${r.corp_name || r.stock_code}</td>
      <td style="padding:6px 12px;text-align:right;font-weight:500">${r.price ? r.price.toLocaleString()+'원' : '—'}</td>
      <td style="padding:6px 12px;text-align:right;color:${chgClr};font-weight:500">${chgTxt}</td>
      <td style="padding:6px 12px;text-align:right;font-size:12px;color:var(--tg)">${fNet > 0 ? '+'+fNet.toLocaleString() : fNet.toLocaleString()}</td>
    </tr>`;
  }).join('');

  body.innerHTML = `
    <div style="padding:0 .5rem">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:var(--bg3)">
            <th style="padding:5px 12px;text-align:left;font-size:11px;color:var(--text3);font-weight:500">종목명</th>
            <th style="padding:5px 12px;text-align:right;font-size:11px;color:var(--text3);font-weight:500">현재가</th>
            <th style="padding:5px 12px;text-align:right;font-size:11px;color:var(--text3);font-weight:500">등락률</th>
            <th style="padding:5px 12px;text-align:right;font-size:11px;color:var(--tg);font-weight:500">외국인↑</th>

          </tr>
        </thead>
        <tbody>${rows_html}</tbody>
      </table>
    </div>`;
}


// ══════════════════════════════════════════
// 📊 KRX 업종지수 카드
// ══════════════════════════════════════════

let _krxData = null;   // { kospi: [...], kosdaq: [...] }
let _krxTab  = 'kospi';

async function loadKrxIndustry() {
  const body = document.getElementById('krx-body');
  if (!body) return;

  const _kst  = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const today = _kst.toISOString().split('T')[0];

  // krx_industry 테이블에서 조회
  const { data: rows } = await sb.from('krx_industry')
    .select('*')
    .eq('base_date', today)
    .order('change_rate', { ascending: false });

  if (!rows?.length) {
    // 최신 날짜 fallback
    const { data: latest } = await sb.from('krx_industry')
      .select('base_date')
      .order('base_date', { ascending: false })
      .limit(1);

    if (!latest?.length) {
      body.innerHTML = '<div style="padding:1rem;color:var(--text3);font-size:12px;text-align:center">업종지수 데이터 없음 — 12:05 또는 16:40 수집됩니다</div>';
      return;
    }

    const { data: rows2 } = await sb.from('krx_industry')
      .select('*')
      .eq('base_date', latest[0].base_date)
      .order('change_rate', { ascending: false });

    _krxData = _groupKrx(rows2 || []);
  } else {
    _krxData = _groupKrx(rows);
  }

  renderKrxTab(_krxTab);
}

function _groupKrx(rows) {
  return {
    kospi:  rows.filter(r => r.market === 'KOSPI'  || r.industry_code?.startsWith('0')),
    kosdaq: rows.filter(r => r.market === 'KOSDAQ' || r.industry_code?.startsWith('1')),
  };
}

function switchKrxTab(tab) {
  _krxTab = tab;
  document.querySelectorAll('[data-krx-tab]').forEach(b =>
    b.classList.toggle('active', b.dataset.krxTab === tab));
  renderKrxTab(tab);
}

function renderKrxTab(tab) {
  const body = document.getElementById('krx-body');
  if (!body || !_krxData) return;

  const rows = _krxData[tab] || [];
  if (!rows.length) {
    body.innerHTML = '<div style="padding:1rem;color:var(--text3);font-size:12px;text-align:center">데이터 없음</div>';
    return;
  }

  const rowsHtml = rows.map(r => {
    const chg  = r.change_rate || 0;
    const chgC = chg > 0 ? 'var(--red)' : chg < 0 ? 'var(--blue)' : 'var(--text3)';
    const chgStr = (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%';

    // 확산도 프로그레스 바
    const adv  = r.advance_ratio;
    const total = (r.up_cnt||0) + (r.down_cnt||0) + (r.flat_cnt||0);
    const upPct  = total ? Math.round((r.up_cnt||0)   / total * 100) : 0;
    const flatPct= total ? Math.round((r.flat_cnt||0) / total * 100) : 0;
    const downPct= 100 - upPct - flatPct;

    const diffBar = total ? `
      <div style="display:flex;height:4px;border-radius:2px;overflow:hidden;width:80px;gap:1px">
        <div style="width:${upPct}%;background:var(--red)"></div>
        <div style="width:${flatPct}%;background:var(--text3)"></div>
        <div style="width:${downPct}%;background:var(--blue)"></div>
      </div>
      <span style="font-size:10px;color:var(--text3)">▲${r.up_cnt||0} ─${r.flat_cnt||0} ▼${r.down_cnt||0}</span>` : '—';

    return `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:6px 12px;font-weight:500;font-size:13px;white-space:nowrap">${r.industry_name}</td>
      <td style="padding:6px 12px;text-align:right;font-size:12px;color:var(--text3)">${r.index_val ? r.index_val.toFixed(2) : '—'}</td>
      <td style="padding:6px 12px;text-align:right;color:${chgC};font-weight:600">${chgStr}</td>
      <td style="padding:6px 12px">
        <div style="display:flex;flex-direction:column;gap:3px">${diffBar}</div>
      </td>
      <td style="padding:6px 12px;text-align:right;font-size:11px;color:${(adv||0)>=60?'var(--red)':(adv||0)<=40?'var(--blue)':'var(--text3)'};font-weight:600">
        ${adv != null ? adv.toFixed(0)+'%' : '—'}
      </td>
    </tr>`;
  }).join('');

  body.innerHTML = `
    <div style="padding:0 .5rem">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:var(--bg3)">
            <th style="padding:5px 12px;text-align:left;font-size:11px;color:var(--text3);font-weight:500">업종명</th>
            <th style="padding:5px 12px;text-align:right;font-size:11px;color:var(--text3);font-weight:500">지수</th>
            <th style="padding:5px 12px;text-align:right;font-size:11px;color:var(--text3);font-weight:500">등락률</th>
            <th style="padding:5px 12px;text-align:left;font-size:11px;color:var(--text3);font-weight:500">확산도 (상승/보합/하락)</th>
            <th style="padding:5px 12px;text-align:right;font-size:11px;color:var(--text3);font-weight:500">상승비율</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;
}
