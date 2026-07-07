// market-overview.js — 시황 탭: 매크로 지표, 흐름 차트, 전체 종목 동향
// 의존: config.js (sb, chgColor, chgStr, fmtCap, getIndustryMap, IND_COLORS, getLatestMarketDate), investment.js (INV_ALL_METRICS, INV)

// ── 흐름 비교 차트 전역 변수 ──
let _invTrendChart = null;

// ── 시황 차트 접기/펼치기 ──
function toggleTrendChart() {
  toggleSection('inv-trend-body', 'inv-trend-toggle', ['접기 ▴', '펼치기 ▾'], loadTrendChart);
}

// ── 전체 종목 + 산업별 동향 ──
async function loadMarketOverview(maxDate) {
  // 전체 종목 조회 — 페이지네이션 (Supabase 기본 limit 1000 우회)
  const industryMap = await getIndustryMap();
  const all = await fetchAllPages(
    sb.from('market_data')
      .select('stock_code,corp_name,price,price_change_rate,volume,trading_value,market,market_cap,foreign_net_buy,foreign_hold_rate')
      .eq('base_date', maxDate)
      .not('price_change_rate', 'is', null)
  );
  // 급등/급락 카드에서 재활용 — investment.js가 INV.allMarketRows 참조
  INV.allMarketRows = all;
  const enriched = all.map(r => ({
    ...r,
    industry:    industryMap[r.stock_code] || r.market || '기타',
    sub_industry: (CACHE.subIndustryMap || {})[r.stock_code] || '기타',
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

  // ── 시장 breadth → 탑바 스트립의 코스피·코스닥 지수 밑에 노출 ──
  // 지수값/등락률은 _renderTopbarStrip(chart-macro.js)이 그리고, 그 밑에 상승종목수(breadth) 미니 바.
  INV.marketBreadth = { kospi, kosdaq, total: { total: enriched.length, rise, fall, flat }, avg };
  if (typeof _renderTopbarStrip === 'function') _renderTopbarStrip();

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

  INV.indMapData = indMap;

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
        '<div style="display:flex;align-items:center;justify-content:center;height:100%;min-height:200px;color:var(--text2);font-size:13px;flex-direction:column;gap:8px">' +
          '<div style="font-size:22px">←</div>' +
          '<div>막대를 클릭하면 세부 섹터를 볼 수 있습니다</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  if (window.Chart) {
    const canvas = document.getElementById('ind-bar-chart');
    if (!canvas) return;
    // 이전 인스턴스 정리 — canvas는 innerHTML로 갈려도 Chart 객체(리사이즈 리스너)는 남아 누수
    if (INV.indBarChart) { try { INV.indBarChart.destroy(); } catch (e) {} INV.indBarChart = null; }
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
              const val   = ds.data[i];
              const ind   = chart.data.labels[i];
              const iData = (INV.indMapData || {})[ind];
              const isPos = val >= 0;
              const mainClr  = isPos ? 'rgba(245,54,92,1)' : 'rgba(42,171,238,1)';
              const x        = isPos ? bar.x + 4 : bar.x - 4;
              const align    = isPos ? 'left' : 'right';

              ctx.save();
              // ① 등락률 (+X%)
              const mainTxt = (isPos ? '+' : '') + val + '%';
              ctx.font = 'bold 11px sans-serif';
              ctx.fillStyle = mainClr;
              ctx.textAlign = align;
              ctx.textBaseline = 'middle';
              ctx.fillText(mainTxt, x, bar.y);

              // ② 종목 수 (▲N▼N) — 등락률 바로 뒤에
              if (iData) {
                const mainW  = ctx.measureText(mainTxt).width;
                const gap    = 5;
                const x2     = isPos ? x + mainW + gap : x - mainW - gap;
                const cntTxt = `▲${iData.rise}▼${iData.fall}`;
                ctx.font = '10px sans-serif';
                ctx.fillStyle = 'rgba(168,173,196,0.65)';
                ctx.textAlign = align;
                ctx.fillText(cntTxt, x2, bar.y);
              }
              ctx.restore();
            });
          });
        }
      }]
    });
    INV.indBarChart = chart;

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
    const d = INV.indMapData[indName];
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
          (d.flat ? '<span style="color:var(--text2);font-size:12px">━ ' + d.flat + '</span>' : '') +
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
        '<span style="font-size:11px;padding:2px 7px;border-radius:4px;background:var(--bg3);color:var(--text1);white-space:nowrap">' +
        st.corp_name + ' <span style="color:' + clr + ';font-weight:600">' + chgStr(st.price_change_rate) + '</span></span>';

      leftHtml +=
        '<div class="sub-sector-row" data-si="' + si + '" style="padding:10px 16px;border-bottom:1px solid var(--border);cursor:pointer">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">' +
            '<span style="font-size:12px;font-weight:700">' + s.sub + '</span>' +
            '<span style="font-size:13px;font-weight:800;color:' + chgColor(s.avg) + '">' + chgStr(s.avg) + '</span>' +
            '<span style="font-size:11px;color:var(--text2)">▲' + s.rise + ' ▼' + s.fall + ' · ' + s.total + '개</span>' +
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
      : '<span style="color:var(--text2)">—</span>';
    const thStyle = col => 'cursor:pointer;text-align:right;font-size:11px;padding:4px 4px;color:' +
      (col===_sortCol?'var(--tg)':'var(--text2)') + ';white-space:nowrap;user-select:none';
    const th = (col, label) =>
      '<span style="' + thStyle(col) + '" onclick="INV.moSort(\'' + col + '\')">' + label + sortIcon(col) + '</span>';

    const renderStockPanel = (title, avg, stocks, rise, fall, flat) => {
      const all = [...stocks].sort((a, b) => {
        const va = a[_sortCol] ?? -Infinity;
        const vb = b[_sortCol] ?? -Infinity;
        return _sortDir * (vb - va);
      });
      const r = rise != null ? rise : all.filter(s => s.price_change_rate > 0).length;
      const f = fall != null ? fall : all.filter(s => s.price_change_rate < 0).length;
      const fl = flat != null ? flat : all.filter(s => s.price_change_rate === 0).length;
      const COLS = '16px 1fr 80px 62px 68px 70px 70px';
      return '<div style="padding:10px 14px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--bg2);z-index:1;display:flex;justify-content:space-between;align-items:center">' +
          '<span style="font-size:13px;font-weight:700">' + title + '</span>' +
          '<div style="display:flex;align-items:center;gap:10px">' +
            '<span style="color:var(--red);font-size:12px;font-weight:600">▲ ' + r + '</span>' +
            '<span style="color:var(--blue);font-size:12px;font-weight:600">▼ ' + f + '</span>' +
            (fl ? '<span style="color:var(--text2);font-size:12px">━ ' + fl + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:' + COLS + ';gap:0;padding:4px 14px;border-bottom:1px solid var(--border);background:var(--bg3)">' +
          '<span></span>' +
          '<span style="font-size:11px;color:var(--text1)">종목</span>' +
          th('price', '현재가') +
          th('price_change_rate', '등락률') +
          th('market_cap', '시총') +
          th('foreign_net_buy', '외국인순매수') +
          th('foreign_hold_rate', '외국인보유율') +
        '</div>' +
        all.map((st, i) =>
          '<div class="stock-row" data-stock-open="' + st.stock_code + '" data-stock-name="' + escAttr(st.corp_name || '') + '" ' +
            'style="display:grid;grid-template-columns:' + COLS + ';align-items:center;gap:0;padding:6px 14px;border-bottom:1px solid var(--border)">' +
            '<span style="font-size:11px;color:var(--text2)">' + (i+1) + '</span>' +
            '<span style="font-size:13px">' + escapeHtml(st.corp_name) + '</span>' +
            '<span style="font-size:12px;color:var(--text1);text-align:right;padding-right:8px">' +
              fmtPrice(st.price) +
            '</span>' +
            '<span style="font-size:13px;font-weight:700;color:' + chgColor(st.price_change_rate) + ';text-align:right">' +
              chgStr(st.price_change_rate) +
            '</span>' +
            '<span style="font-size:11px;color:var(--text1);text-align:right;padding-right:6px">' +
              (st.market_cap != null ? fmtCap(st.market_cap) : '—') +
            '</span>' +
            '<span style="font-size:11px;text-align:right;padding-right:4px;color:' + ((st.foreign_net_buy||0)<0?'var(--blue)':'var(--red)') + '">' + (st.foreign_net_buy!=null?st.foreign_net_buy.toLocaleString():'—') + '</span>' +
            '<span style="font-size:11px;text-align:right;color:var(--text1)">' + (st.foreign_hold_rate!=null?st.foreign_hold_rate.toFixed(1)+'%':'—') + '</span>' +
          '</div>'
        ).join('');
    };

    INV.moSort = col => {
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

  // 산업별 흐름 비교 차트 로드 → 완료 후 US vs KR 차트 로드 (IND.krDates 의존)
  await loadIndTrendChart();
  loadUsEtfBanner();
  loadUskrChart();

  // 투자포인트 요약 (다른 데이터 로드 완료 후)
  // 신고가 종목
  loadNewHighStocks();

  loadFlowData();
  // 기관/외국인 수급

  setTimeout(loadMarketInsight, 1500);
}



// ══════════════════════════════════════════
// 📈 신고가 종목 (오늘의 시황)
// ══════════════════════════════════════════

let _hgprData   = null;   // { w52: [...], yr: [...], hist: [...] }
let _hgprTab    = 'monitored';
let _hgprExpanded = false;
const HGPR_PAGE = 10;

async function loadNewHighStocks() {
  const body = document.getElementById('hgpr-body');
  if (!body) return;

  const today = kstToday();  // config.js 공통 KST 기준

  const _HGPR_SEL = 'stock_code,corp_name,price,price_change_rate,market_cap,listing_shares,hgpr_cls,hgpr_cls_code';

  // 52주 신고가 종목만 조회 (근접 제외)
  const _HGPR_VALS = ['신고가', '52주 신고가', '1'];
  let targetDate = today;
  let { data: rows } = await sb.from('market_data')
    .select(_HGPR_SEL)
    .eq('base_date', today)
    .in('hgpr_cls_code', _HGPR_VALS)
    .order('market_cap', { ascending: false });

  if (!rows?.length) {
    const { data: latest } = await sb.from('market_data')
      .select('base_date').in('hgpr_cls_code', _HGPR_VALS)
      .order('base_date', { ascending: false }).limit(1);
    if (!latest?.length) {
      body.innerHTML = '<div style="padding:1rem;color:var(--text2);font-size:12px;text-align:center">신고가 데이터 없음 — 장 마감 후 수집됩니다</div>';
      return;
    }
    targetDate = latest[0].base_date;
    const { data: rows2 } = await sb.from('market_data')
      .select(_HGPR_SEL)
      .eq('base_date', targetDate)
      .in('hgpr_cls_code', _HGPR_VALS)
      .order('market_cap', { ascending: false });
    rows = rows2 || [];
  }

  // market_cap null 종목 보완: ① price×listing_shares 직접 계산 ② 역사적 최근값 조회
  const _nullCapCodes = (rows || []).filter(r => !r.market_cap).map(r => r.stock_code);
  if (_nullCapCodes.length) {
    // ① 현재 행에 listing_shares가 있으면 즉시 계산
    rows = rows.map(r => {
      if (r.market_cap) return r;
      if (r.listing_shares && r.price) return { ...r, market_cap: r.listing_shares * r.price };
      return r;
    });

    // ② 여전히 null인 종목 → 역사적 비-null 최근값 조회
    const _stillNull = rows.filter(r => !r.market_cap).map(r => r.stock_code);
    if (_stillNull.length) {
      const { data: _capRows } = await sb.from('market_data')
        .select('stock_code,market_cap,listing_shares,price')
        .in('stock_code', _stillNull)
        .order('base_date', { ascending: false })
        .limit(_stillNull.length * 30);
      const _capMap = {};
      for (const r of (_capRows || [])) {
        if (_capMap[r.stock_code]) continue;
        const cap = r.market_cap ||
          (r.listing_shares && r.price ? r.listing_shares * r.price : null);
        if (cap) _capMap[r.stock_code] = cap;
      }
      rows = rows.map(r => r.market_cap ? r : { ...r, market_cap: _capMap[r.stock_code] || null });
    }
  }

  // 모니터링 종목 + 산업 정보 — getIndustryMap() 캐시 재활용 (companies 중복 조회 방지)
  const _indMap  = await getIndustryMap();
  const _subMap  = CACHE.subIndustryMap || {};
  const monMap = {};  // code → { industry, sub_industry }
  Object.keys(_indMap).forEach(code => {
    monMap[code] = { industry: _indMap[code], sub_industry: _subMap[code] || '' };
  });

  // 과거 7일 이력
  const codes = rows.map(r => r.stock_code);
  const date7 = offsetDate(-7);  // KST 기준 7일 전
  const { data: hist7 } = await sb.from('market_data')
    .select('stock_code,base_date,hgpr_cls_code')
    .in('stock_code', codes)
    .gte('base_date', date7)
    .in('hgpr_cls_code', _HGPR_VALS)
    .order('base_date', { ascending: false });

  const histMap = {};
  (hist7 || []).forEach(r => {
    if (!histMap[r.stock_code]) histMap[r.stock_code] = [];
    histMap[r.stock_code].push(r.base_date);
  });

  // 각 행에 메타 추가 (+ _allMarketRows에서 volume/foreign_net_buy 조인)
  const _mrMap = {};
  (INV.allMarketRows || []).forEach(r => { _mrMap[r.stock_code] = r; });

  const enriched = rows.map(r => {
    const dates  = (histMap[r.stock_code] || []).sort().reverse();
    const count7 = dates.length;
    let streak = 0, prev = null;
    for (const d of dates) {
      if (!prev) { streak = 1; prev = d; continue; }
      const diff = (new Date(prev) - new Date(d)) / 86400000;
      if (diff <= 1) { streak++; prev = d; } else break;
    }
    const mon = monMap[r.stock_code];
    const mr  = _mrMap[r.stock_code] || {};
    const tv  = (mr.volume || 0) * (r.price || mr.price || 0);
    return { ...r,
      streak, count7, isFirst: count7 === 1,
      isMonitored: !!mon,
      industry:    mon?.industry    || '기타',
      sub_industry:mon?.sub_industry || '',
      tv,
      foreign_net_buy: mr.foreign_net_buy ?? null,
    };
  });

  // 탭 데이터 구성
  _hgprData = {
    monitored: enriched.filter(r =>  r.isMonitored),
    all:       enriched.filter(r => !r.isMonitored),  // 모니터링 종목 제외
  };

  // 기준일 표시 (today가 아니라 실제 조회된 거래일)
  setAsOf('hgpr-date', targetDate);

  _hgprExpanded = false;
  renderHgprTab(_hgprTab);
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

  const rows = _hgprData[tab] || [];

  if (!rows.length) {
    body.innerHTML = '<div style="padding:1rem;color:var(--text2);font-size:12px;text-align:center">해당 신고가 종목 없음</div>';
    return;
  }

  const clsColor = { '0':'var(--text3)', '1':'var(--tg)', '2':'#fb923c', '3':'#f5a623',
                     '신고가':'var(--tg)', '52주 신고가':'var(--tg)', '신고가 근접':'var(--text3)',
                     '연간 신고가':'#fb923c', '역사적 신고가':'#f5a623' };
  const clsLabel = { '0':'근접', '1':'52주', '2':'연간', '3':'역사적',
                     '신고가':'52주', '52주 신고가':'52주', '신고가 근접':'근접',
                     '연간 신고가':'연간', '역사적 신고가':'역사적' };

  const rowHtml = (r, showIndustry) => {
    const chg    = r.price_change_rate;
    const chgTxt = chg != null ? (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%' : '—';
    const chgClr = chg != null && chg >= 0 ? 'var(--red)' : 'var(--blue)';
    const cap    = r.market_cap ? fmtCap(r.market_cap) : '—';
    const badge  = clsLabel[r.hgpr_cls_code] || '';
    const bClr   = clsColor[r.hgpr_cls_code] || 'var(--tg)';
    const histBadges = [];
    if (r.isFirst)   histBadges.push(`<span style="font-size:11px;padding:1px 5px;border-radius:3px;background:rgba(245,54,92,.15);color:var(--red);font-weight:600">🎯첫</span>`);
    if (r.streak>=2) histBadges.push(`<span style="font-size:11px;padding:1px 5px;border-radius:3px;background:rgba(251,99,64,.15);color:var(--yellow);font-weight:600">🔥${r.streak}일</span>`);
    else if (r.count7>=3) histBadges.push(`<span style="font-size:11px;padding:1px 5px;border-radius:3px;background:rgba(42,171,238,.15);color:var(--tg);font-weight:600">📈${r.count7}회</span>`);
    const indCell = showIndustry
      ? `<td style="padding:5px 10px;font-size:11px;color:var(--text2)">${r.industry}</td>`
      : '';
    return `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:5px 12px;font-weight:500;font-size:13px;white-space:nowrap">${r.corp_name||r.stock_code}</td>
      <td style="padding:5px 12px;text-align:right;font-weight:500;white-space:nowrap">${fmtPrice(r.price)}</td>
      <td style="padding:5px 12px;text-align:right;color:${chgClr};font-weight:600">${chgTxt}</td>
      <td style="padding:5px 12px;text-align:right;color:var(--text2);font-size:12px">${cap}</td>
      ${indCell}
      <td style="padding:5px 12px">
        <div style="display:flex;align-items:center;gap:3px;flex-wrap:wrap">
          <span style="font-size:11px;padding:1px 5px;border-radius:3px;background:${bClr}22;color:${bClr};font-weight:600">${badge}</span>
          ${histBadges.join('')}
        </div>
      </td>
    </tr>`;
  };

  const theadBase = `<tr style="background:var(--bg3)">
    <th style="padding:5px 12px;font-size:11px;color:var(--text2);font-weight:500;text-align:left">종목명</th>
    <th style="padding:5px 12px;font-size:11px;color:var(--text2);font-weight:500;text-align:right;width:110px">현재가</th>
    <th style="padding:5px 12px;font-size:11px;color:var(--text2);font-weight:500;text-align:right;width:80px">등락률</th>
    <th style="padding:5px 12px;font-size:11px;color:var(--text2);font-weight:500;text-align:right;width:110px">시총</th>`;

  if (tab === 'monitored') {
    // 산업별 그룹핑 (시총 내림차순)
    const byInd = {};
    rows.forEach(r => {
      const ind = r.industry || '기타';
      if (!byInd[ind]) byInd[ind] = [];
      byInd[ind].push(r);
    });
    const indOrder = Object.keys(byInd).sort((a,b) => {
      const maxStreakA = Math.max(...byInd[a].map(r => r.streak || 0));
      const maxStreakB = Math.max(...byInd[b].map(r => r.streak || 0));
      return maxStreakB - maxStreakA ||
        (byInd[b].reduce((s,r)=>s+(r.market_cap||0),0)) -
        (byInd[a].reduce((s,r)=>s+(r.market_cap||0),0));
    });

    const clrMap = { '0':'var(--text3)','1':'var(--tg)','2':'#fb923c','3':'#f5a623',
                     '신고가':'var(--tg)','52주 신고가':'var(--tg)','신고가 근접':'var(--text3)',
                     '연간 신고가':'#fb923c','역사적 신고가':'#f5a623' };
    const lbMap  = { '0':'근접','1':'52주','2':'연간','3':'역사적',
                     '신고가':'52주','52주 신고가':'52주','신고가 근접':'근접',
                     '연간 신고가':'연간','역사적 신고가':'역사적' };

    const streakBadge = r => {
      if (r.streak >= 3)  return `<span style="display:inline-block;min-width:52px;text-align:center;font-size:11px;padding:1px 5px;border-radius:10px;background:rgba(245,54,92,.18);color:var(--red);font-weight:700">🔥${r.streak}일 연속</span>`;
      if (r.streak === 2) return `<span style="display:inline-block;min-width:52px;text-align:center;font-size:11px;padding:1px 5px;border-radius:10px;background:rgba(251,99,64,.15);color:var(--yellow);font-weight:700">🔥2일 연속</span>`;
      if (r.isFirst)      return `<span style="display:inline-block;min-width:52px;text-align:center;font-size:11px;padding:1px 5px;border-radius:10px;background:rgba(42,171,238,.15);color:var(--tg);font-weight:700">🎯 첫 신고가</span>`;
      if (r.count7 >= 3)  return `<span style="display:inline-block;min-width:52px;text-align:center;font-size:11px;padding:1px 5px;border-radius:10px;background:rgba(45,206,137,.12);color:var(--green);font-weight:700">📈${r.count7}회</span>`;
      return `<span style="display:inline-block;min-width:52px;font-size:11px;padding:1px 5px;color:var(--text2)">—</span>`;
    };

    const makeRow = r => {
      const bClr  = clrMap[r.hgpr_cls_code] || 'var(--tg)';
      const clsLb = lbMap[r.hgpr_cls_code]  || '';
      const chg   = r.price_change_rate;
      const chgTxt = chg!=null ? (chg>=0?'+':'')+chg.toFixed(2)+'%' : '—';
      const chgClr = chg>=0 ? 'var(--red)' : 'var(--blue)';

      // ── Phase 2: 거래대금 + 외국인 배지 ──────────────────────
      const tvStr = r.tv >= 1e10
        ? '<span style="font-size:11px;padding:1px 4px;border-radius:3px;background:rgba(245,158,11,.12);color:#f59e0b;font-weight:600">' +
          fmtTV(r.tv) + '</span>'
        : '';
      const frgnBadge = r.foreign_net_buy != null && r.foreign_net_buy !== 0
        ? (r.foreign_net_buy > 0
            ? '<span style="font-size:11px;padding:1px 4px;border-radius:3px;background:rgba(42,171,238,.12);color:var(--tg);font-weight:600">외↑</span>'
            : '<span style="font-size:11px;padding:1px 4px;border-radius:3px;background:rgba(74,158,255,.10);color:var(--blue);font-weight:600">외↓</span>')
        : '';

      return `<div class="stock-row" data-stock-open="${r.stock_code}" data-stock-name="${escAttr(r.corp_name||r.stock_code)}"
        style="display:grid;grid-template-columns:1fr auto 52px 70px;align-items:center;gap:6px;
          padding:5px 10px;border-bottom:1px solid var(--border);
          border-left:2px solid ${bClr}">
        <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${escapeHtml(r.corp_name||r.stock_code)}
        </div>
        <div style="display:flex;align-items:center;gap:3px;flex-wrap:nowrap">
          ${streakBadge(r)}${tvStr}${frgnBadge}
        </div>
        <div style="text-align:right;font-size:12px;font-weight:700;color:${chgClr}">${chgTxt}</div>
        <div style="text-align:right;font-size:11px;color:var(--text2)">${r.market_cap?fmtCap(r.market_cap):'—'}</div>
      </div>`;
    };

    const cols = indOrder.map(ind => {
      const indRows = [...byInd[ind]].sort((a, b) =>
        (b.streak || 0) - (a.streak || 0) ||
        (b.count7 || 0) - (a.count7 || 0) ||
        (b.market_cap || 0) - (a.market_cap || 0)
      );
      const rows_html = indRows.map(makeRow).join('');
      return `<div style="min-width:0;background:var(--bg3);border-radius:8px;
        border:1px solid var(--border);overflow:hidden">
        <div style="padding:6px 10px;font-size:11px;font-weight:700;color:var(--tg);
          background:rgba(42,171,238,.06);border-bottom:1px solid var(--border);
          display:flex;align-items:center;justify-content:space-between">
          <span>${ind}</span>
          <span style="font-weight:400;color:var(--text2);font-size:11px">${indRows.length}개</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 90px 52px 70px;
          padding:4px 10px 3px;background:var(--bg2);border-bottom:1px solid var(--border)">
          <span style="font-size:11px;color:var(--text2)">종목</span>
          <span style="font-size:11px;color:var(--text2);text-align:center">연속/첫신고가</span>
          <span style="font-size:11px;color:var(--text2);text-align:right">등락률</span>
          <span style="font-size:11px;color:var(--text2);text-align:right">시총</span>
        </div>
        ${rows_html}
      </div>`;
    }).join('');

    const colCount = Math.min(Math.max(indOrder.length, 2), 5);
    body.innerHTML = `<div style="padding:.5rem .75rem 0">
      <div style="display:grid;grid-template-columns:repeat(${colCount},1fr);gap:10px;align-items:start">
        ${cols}
      </div>
    </div>`;
  } else {
    // 전체 종목 — streak 그룹별 카드 (가로 배치)
    const clrMap = { '신고가':'var(--tg)','52주 신고가':'var(--tg)','신고가 근접':'var(--text3)',
                     '연간 신고가':'#fb923c','역사적 신고가':'#f5a623' };

    // ─── 그룹 정의 (우선순위 순) ───
    const streakVals = [...new Set(rows.map(r => r.streak||0).filter(s => s >= 2))]
                         .sort((a, b) => b - a);
    const used = new Set();
    const _groupDefs = [];

    // 연속 N일 그룹 (높은 순)
    for (const s of streakVals) {
      const isHot = s >= 3;
      _groupDefs.push({
        title:     `${s}일 연속`,
        icon:      '🔥',
        hdrBg:     isHot ? 'rgba(245,54,92,.12)' : 'rgba(251,99,64,.09)',
        textColor: isHot ? 'var(--red)' : 'var(--yellow)',
        filter:    r => (r.streak||0) === s,
      });
    }
    // 오늘 첫 신고가
    _groupDefs.push({
      title: '첫 신고가', icon: '🎯',
      hdrBg: 'rgba(42,171,238,.09)', textColor: 'var(--tg)',
      filter: r => r.isFirst,
    });
    // 7일 내 반복 진입 (연속 아님)
    _groupDefs.push({
      title: '반복 진입', icon: '📈',
      hdrBg: 'rgba(45,206,137,.07)', textColor: 'var(--green)',
      filter: r => !r.isFirst && (r.streak||0) < 2 && (r.count7||0) >= 2,
    });
    // 나머지
    _groupDefs.push({
      title: '신고가', icon: '',
      hdrBg: 'rgba(255,255,255,.02)', textColor: 'var(--text2)',
      filter: () => true,
    });

    // 각 그룹에 종목 배분 (중복 방지)
    const groups = [];
    for (const def of _groupDefs) {
      const members = rows
        .filter(r => !used.has(r.stock_code) && def.filter(r))
        .sort((a, b) => (b.market_cap||0) - (a.market_cap||0));
      if (!members.length) continue;
      members.forEach(r => used.add(r.stock_code));
      groups.push({ ...def, members });
    }

    // ─── 카드 1개 렌더링 ───
    const CARD_LIMIT = 10;
    const makeCard = g => {
      const shown = g.members.slice(0, CARD_LIMIT);
      const extra = g.members.length - CARD_LIMIT;

      const itemsHtml = shown.map(r => {
        const bClr   = clrMap[r.hgpr_cls_code] || 'var(--tg)';
        const chg    = r.price_change_rate;
        const chgClr = (chg||0) >= 0 ? 'var(--red)' : 'var(--blue)';
        const chgTxt = chg != null ? (chg>=0?'+':'')+chg.toFixed(2)+'%' : '—';
        return `<div class="stock-row" data-stock-open="${r.stock_code}" data-stock-name="${escAttr(r.corp_name||r.stock_code)}"
          style="display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:6px;
            padding:5px 10px;border-bottom:1px solid var(--border);
            border-left:2px solid ${bClr}">
          <div style="min-width:0">
            <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(r.corp_name||r.stock_code)}</div>
            <div style="font-size:11px;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(r.industry||'')}</div>
          </div>
          <div style="font-size:12px;font-weight:700;color:${chgClr};white-space:nowrap">${chgTxt}</div>
          <div style="font-size:11px;color:var(--text2);white-space:nowrap;text-align:right">${r.market_cap?fmtCap(r.market_cap):'—'}</div>
        </div>`;
      }).join('');

      const moreHtml = extra > 0
        ? `<div style="padding:6px 10px;text-align:center;font-size:11px;color:var(--text2);
            border-top:1px solid var(--border)">+${extra}개 더</div>`
        : '';

      return `<div style="flex:1 1 180px;min-width:180px;max-width:260px;
        background:var(--bg3);border-radius:8px;border:1px solid var(--border);overflow:hidden">
        <div style="padding:7px 10px;background:${g.hdrBg};border-bottom:1px solid var(--border);
          display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:11px;font-weight:700;color:${g.textColor}">${g.icon}${g.icon?' ':''}${g.title}</span>
          <span style="font-size:11px;font-weight:400;color:var(--text2)">${g.members.length}개</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr auto auto;gap:6px;
          padding:3px 10px;background:var(--bg2);border-bottom:1px solid var(--border)">
          <span style="font-size:11px;color:var(--text2)">종목</span>
          <span style="font-size:11px;color:var(--text2)">등락</span>
          <span style="font-size:11px;color:var(--text2);text-align:right">시총</span>
        </div>
        ${itemsHtml}${moreHtml}
      </div>`;
    };

    body.innerHTML = `<div style="padding:.5rem .75rem">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:start">
        ${groups.map(makeCard).join('')}
      </div>
    </div>`;
  }
}


// ══════════════════════════════════════════
// 💰 기관/외국인 수급 — 3열 그리드 (동시매수 | 외국인순매수/순매도 | 기관)
// ══════════════════════════════════════════

let _flowData     = null;   // 외국인+기관 합산 풀 데이터
let _flowBothData = null;   // 동시매수 전용 (외국인 AND 기관 순매수)
let _flowSellData = null;   // 외국인 순매도 데이터
let _flowDate     = null;   // 집계 기준일
let _frgnSellMode = false;  // 외국인 열: false=순매수, true=순매도

// 억원 환산 포맷 (주수 × 가격 기준)
function _flowAmtFmt(shares, price) {
  if (!shares || !price) return '—';
  const amt = Math.abs(shares) * price / 1e8;
  if (amt >= 100) return Math.round(amt) + '억';
  if (amt >= 10)  return amt.toFixed(1) + '억';
  if (amt >= 1)   return amt.toFixed(2) + '억';
  return (amt * 100).toFixed(0) + '백만';
}

async function loadFlowData() {
  const loading = '<div style="padding:1.5rem;text-align:center;color:var(--text2)"><span class="loading"></span></div>';
  ['flow-body-both','flow-body-frgn','flow-body-orgn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = loading;
  });

  try {
    const maxDate = await getLatestMarketDate();
    if (!maxDate) {
      ['flow-body-both','flow-body-frgn','flow-body-orgn'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<div style="padding:1.5rem;text-align:center;color:var(--text2);font-size:12px">데이터 없음</div>';
      });
      return;
    }
    _flowDate = maxDate;

    setAsOf('flow-date-label', maxDate);

    const SEL = 'stock_code,corp_name,price,price_change_rate,market_cap,foreign_net_buy,institution_net_buy,foreign_hold_rate,market';

    // 3개 쿼리 병렬 실행 — 각 열의 AND 조건을 서버에서 처리해 누락 방지
    const [frgnRes, orgnRes, bothRes, sellRes] = await Promise.all([
      // 외국인 순매수 (금액 상위)
      sb.from('market_data').select(SEL).eq('base_date', maxDate)
        .gt('foreign_net_buy', 0).order('foreign_net_buy', { ascending: false }).limit(50),
      // 기관 순매수 (금액 상위)
      sb.from('market_data').select(SEL).eq('base_date', maxDate)
        .gt('institution_net_buy', 0).order('institution_net_buy', { ascending: false }).limit(50),
      // 동시매수 — 외국인 AND 기관 동시 순매수 (서버 AND 조건)
      sb.from('market_data').select(SEL).eq('base_date', maxDate)
        .gt('foreign_net_buy', 0).gt('institution_net_buy', 0)
        .order('foreign_net_buy', { ascending: false }).limit(50),
      // 외국인 순매도
      sb.from('market_data').select(SEL).eq('base_date', maxDate)
        .lt('foreign_net_buy', 0).order('foreign_net_buy', { ascending: true }).limit(50),
    ]);

    if (frgnRes.error) throw frgnRes.error;

    // _flowData: 외국인·기관·동시매수 모두 포함 (중복 제거)
    const combined = [...(frgnRes.data||[]), ...(orgnRes.data||[]), ...(bothRes.data||[])];
    const seen = new Set();
    _flowData = combined.filter(r => {
      if (seen.has(r.stock_code)) return false;
      seen.add(r.stock_code); return true;
    });

    // 동시매수 전용 데이터 (별도 보관)
    _flowBothData = bothRes.data || [];
    _flowSellData = sellRes.data || [];

    renderAllFlowData();
  } catch(e) {
    console.error('[FlowData] 최종 오류:', e?.message || e);
    ['flow-body-both','flow-body-frgn','flow-body-orgn'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<div style="padding:1.5rem;text-align:center;color:var(--text2);font-size:12px">로드 실패</div>';
    });
  }
}

function renderAllFlowData() {
  _renderFlowCol('both', 'flow-body-both');
  _renderFlowCol('frgn', 'flow-body-frgn');
  _renderFlowCol('orgn', 'flow-body-orgn');
}

// 외국인 열 순매수/순매도 모드 전환
function _setFlowMode(sell) {
  _frgnSellMode = sell;
  _renderFlowCol('frgn', 'flow-body-frgn');
}

function _renderFlowCol(tab, bodyId) {
  const body = document.getElementById(bodyId);
  if (!body || !_flowData) return;

  // ── 데이터 선택 및 정렬 (금액 기준) ─────────────────────────────────────────
  let rows;
  if (tab === 'both') {
    // _flowBothData: 서버에서 AND 조건으로 가져온 동시매수 전용 데이터
    rows = (_flowBothData || [])
      .sort((a, b) => {
        // 동시매수: (외국인 금액 + 기관 금액) 합산 기준
        const aAmt = ((a.foreign_net_buy||0) + (a.institution_net_buy||0)) * (a.price||0);
        const bAmt = ((b.foreign_net_buy||0) + (b.institution_net_buy||0)) * (b.price||0);
        return bAmt - aAmt;
      }).slice(0, 20);
  } else if (tab === 'frgn') {
    if (_frgnSellMode) {
      // 외국인 순매도 모드
      rows = (_flowSellData || [])
        .sort((a, b) => ((a.foreign_net_buy||0)*(a.price||0)) - ((b.foreign_net_buy||0)*(b.price||0)))
        .slice(0, 20);
    } else {
      rows = _flowData
        .filter(r => (r.foreign_net_buy ?? 0) > 0)
        .sort((a, b) => ((b.foreign_net_buy||0)*(b.price||0)) - ((a.foreign_net_buy||0)*(a.price||0)))
        .slice(0, 20);
    }
  } else {
    rows = _flowData
      .filter(r => (r.institution_net_buy ?? 0) > 0)
      .sort((a, b) => ((b.institution_net_buy||0)*(b.price||0)) - ((a.institution_net_buy||0)*(a.price||0)))
      .slice(0, 20);
  }

  if (!rows.length) {
    const msg = tab === 'both'
      ? '오늘 외국인·기관 동시 순매수 종목 없음<br><span style="font-size:11px">외국인↔기관 매수 방향 상이</span>'
      : tab === 'orgn' ? '기관 집계 전<br><span style="font-size:11px">09:35·11:25·13:25·14:35</span>' : '데이터 없음';
    body.innerHTML = `<div style="padding:1.5rem;color:var(--text2);font-size:12px;text-align:center">${msg}</div>`;
    return;
  }

  // ── 컬럼 레이아웃 ────────────────────────────────────────────────────────────
  // both: 종목 | 등락 | 외국인억/기관억 (3열 통합)
  // frgn: 종목 | 등락 | 금액 | 보유율
  // orgn: 종목 | 등락 | 금액
  const CFG = {
    both: { cols: '1fr 44px 82px',
            hdr: `<span style="font-size:11px;color:var(--text2)">종목</span>
                  <span style="font-size:11px;color:var(--text2);text-align:right">등락</span>
                  <span style="font-size:11px;text-align:right"><span style="color:var(--tg)">외</span><span style="color:var(--text2)">/</span><span style="color:var(--yellow)">기</span>(억)</span>` },
    frgn: { cols: '1fr 44px 52px 44px',
            hdr: `<span style="font-size:11px;color:var(--text2)">종목</span>
                  <span style="font-size:11px;color:var(--text2);text-align:right">등락</span>
                  <span style="font-size:11px;color:${_frgnSellMode?'var(--blue)':'var(--tg)'};text-align:right">금액(억)</span>
                  <span style="font-size:11px;color:var(--text2);text-align:right">보유율</span>` },
    orgn: { cols: '1fr 44px 52px',
            hdr: `<span style="font-size:11px;color:var(--text2)">종목</span>
                  <span style="font-size:11px;color:var(--text2);text-align:right">등락</span>
                  <span style="font-size:11px;color:var(--yellow);text-align:right">금액(억)</span>` },
  };
  const { cols, hdr } = CFG[tab];

  // ── 외국인 열: 순매수/순매도 토글 바 ────────────────────────────────────────
  const frgnToggle = tab === 'frgn'
    ? `<div style="display:flex;gap:4px;padding:4px 8px;border-bottom:1px solid var(--border);background:var(--bg2)">
         <button class="chip ${!_frgnSellMode?'active':''}" onclick="_setFlowMode(false)"
           style="font-size:11px;padding:2px 8px;flex:1">순매수 ▲</button>
         <button class="chip ${_frgnSellMode?'active':''}" onclick="_setFlowMode(true)"
           style="font-size:11px;padding:2px 8px;flex:1;${_frgnSellMode?'color:var(--blue)':''}">순매도 ▼</button>
       </div>`
    : '';

  const header = `<div style="display:grid;grid-template-columns:${cols};padding:4px 8px;background:var(--bg3);border-bottom:1px solid var(--border)">${hdr}</div>`;

  // ── 행 렌더링 ────────────────────────────────────────────────────────────────
  const TOP_N = 5;
  const mkRow = r => {
    const name     = r.corp_name || r.stock_code;
    const dispName = escapeHtml(name.length > 7 ? name.slice(0, 7) + '…' : name);

    let cells;
    if (tab === 'both') {
      const fAmt = _flowAmtFmt(r.foreign_net_buy, r.price);
      const oAmt = _flowAmtFmt(r.institution_net_buy, r.price);
      cells = `<span style="font-size:11px;font-weight:600;text-align:right">` +
        `<span style="color:var(--tg)">${fAmt}</span>` +
        `<span style="color:var(--text2)">/</span>` +
        `<span style="color:var(--yellow)">${oAmt}</span></span>`;
    } else if (tab === 'frgn') {
      const amtClr = _frgnSellMode ? 'var(--blue)' : 'var(--tg)';
      const amt    = _flowAmtFmt(r.foreign_net_buy, r.price);
      const holdRate = r.foreign_hold_rate != null
        ? `<span style="font-size:11px;color:var(--text2);text-align:right">${r.foreign_hold_rate.toFixed(1)}%</span>`
        : `<span style="font-size:11px;color:var(--text2);text-align:right">—</span>`;
      cells = `<span style="font-size:11px;font-weight:600;text-align:right;color:${amtClr}">${amt}</span>${holdRate}`;
    } else {
      const amt = _flowAmtFmt(r.institution_net_buy, r.price);
      cells = `<span style="font-size:11px;font-weight:600;text-align:right;color:var(--yellow)">${amt}</span>`;
    }

    return `<div class="stock-row" data-stock-open="${r.stock_code}" data-stock-name="${escAttr(name)}"
      style="display:grid;grid-template-columns:${cols};align-items:center;padding:5px 8px;border-bottom:1px solid rgba(255,255,255,.04)">
      <span style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escAttr(name)}">${dispName}</span>
      <span style="font-size:11px;font-weight:700;color:${chgColor(r.price_change_rate)};text-align:right">${chgStr(r.price_change_rate)}</span>
      ${cells}
    </div>`;
  };

  const topHtml   = rows.slice(0, TOP_N).map(mkRow).join('');
  const extraRows = rows.slice(TOP_N);
  const moreHtml  = extraRows.length
    ? `<div id="flow-more-${tab}" style="display:none">${extraRows.map(mkRow).join('')}</div>
       <div style="padding:5px 8px;text-align:center;cursor:pointer;font-size:11px;color:var(--text2);
         border-top:1px solid var(--border)" onclick="toggleFlowMore('${tab}')">
         <span id="flow-more-btn-${tab}">더보기 ▾ (${extraRows.length}개)</span>
       </div>`
    : '';

  body.innerHTML = frgnToggle + header + topHtml + moreHtml;
}

function toggleFlowMore(tab) {
  const moreDiv = document.getElementById(`flow-more-${tab}`);
  const open    = toggleSection(`flow-more-${tab}`, null, null);
  const btn     = document.getElementById(`flow-more-btn-${tab}`);
  if (btn && open != null) btn.textContent = open
    ? '접기 ▴'
    : `더보기 ▾ (${moreDiv.children.length}개)`;
}
