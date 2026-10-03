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
      .order('stock_code')   // 페이지 경계 결정성 (무정렬 페이징은 누락/중복 가능)
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
    // 그리드는 클래스로 — 인라인이면 모바일 미디어쿼리가 못 이겨 375px에서 차트가 짜부됨
    '<div class="ind-detail-grid">' +
      '<div style="padding:12px 14px;overflow-y:auto;min-width:0" id="ind-left">' +
        '<canvas id="ind-bar-chart" style="width:100%;height:' + bHeight + 'px"></canvas>' +
      '</div>' +
      '<div id="ind-right" style="overflow-y:auto;max-height:520px">' +
        '<div style="display:flex;align-items:center;justify-content:center;height:100%;min-height:200px;color:var(--text2);font-size:calc(13px*var(--m-body));flex-direction:column;gap:8px">' +
          '<div style="font-size:calc(22px*var(--m-title))">←</div>' +
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
        '<div style="font-size:calc(14px*var(--m-body));font-weight:700">' + indName + '</div>' +
        '<div style="display:flex;align-items:center;gap:10px">' +
          '<span style="font-size:calc(14px*var(--m-body));font-weight:800;color:' + avgClr + '">' + avgStr + '</span>' +
          '<span style="color:var(--red);font-size:calc(12px*var(--m-sub));font-weight:600">▲ ' + d.rise + '</span>' +
          '<span style="color:var(--blue);font-size:calc(12px*var(--m-sub));font-weight:600">▼ ' + d.fall + '</span>' +
          (d.flat ? '<span style="color:var(--text2);font-size:calc(12px*var(--m-sub))">━ ' + d.flat + '</span>' : '') +
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
        '<span style="font-size:calc(11px*var(--m-label));padding:2px 7px;border-radius:4px;background:var(--bg3);color:var(--text1);white-space:nowrap">' +
        escapeHtml(st.corp_name) + ' <span style="color:' + clr + ';font-weight:600">' + chgStr(st.price_change_rate) + '</span></span>';

      leftHtml +=
        '<div class="sub-sector-row" data-si="' + si + '" style="padding:10px 16px;border-bottom:1px solid var(--border);cursor:pointer">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">' +
            '<span style="font-size:calc(12px*var(--m-sub));font-weight:700">' + s.sub + '</span>' +
            '<span style="font-size:calc(13px*var(--m-body));font-weight:800;color:' + chgColor(s.avg) + '">' + chgStr(s.avg) + '</span>' +
            '<span style="font-size:calc(11px*var(--m-label));color:var(--text2)">▲' + s.rise + ' ▼' + s.fall + ' · ' + s.total + '개</span>' +
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
    const thStyle = col => 'cursor:pointer;text-align:right;font-size:calc(11px*var(--m-label));padding:4px 4px;color:' +
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
      // 고정폭 컬럼 합계(~370px+종목명)가 좁은 화면에서 잘리지 않도록
      // 패널(#sub-stock-panel)은 가로 스크롤, 내용은 최소폭 확보 (.ind-stock-panel-inner)
      return '<div class="ind-stock-panel-inner">' +
        '<div style="padding:10px 14px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--bg2);z-index:1;display:flex;justify-content:space-between;align-items:center">' +
          '<span style="font-size:calc(13px*var(--m-body));font-weight:700">' + title + '</span>' +
          '<div style="display:flex;align-items:center;gap:10px">' +
            '<span style="color:var(--red);font-size:calc(12px*var(--m-sub));font-weight:600">▲ ' + r + '</span>' +
            '<span style="color:var(--blue);font-size:calc(12px*var(--m-sub));font-weight:600">▼ ' + f + '</span>' +
            (fl ? '<span style="color:var(--text2);font-size:calc(12px*var(--m-sub))">━ ' + fl + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:' + COLS + ';gap:0;padding:4px 14px;border-bottom:1px solid var(--border);background:var(--bg3)">' +
          '<span></span>' +
          '<span style="font-size:calc(11px*var(--m-label));color:var(--text1)">종목</span>' +
          th('price', '현재가') +
          th('price_change_rate', '등락률') +
          th('market_cap', '시총') +
          th('foreign_net_buy', '외국인순매수') +
          th('foreign_hold_rate', '외국인보유율') +
        '</div>' +
        all.map((st, i) =>
          '<div class="stock-row" data-stock-open="' + st.stock_code + '" data-stock-name="' + escAttr(st.corp_name || '') + '" ' +
            'style="display:grid;grid-template-columns:' + COLS + ';align-items:center;gap:0;padding:6px 14px;border-bottom:1px solid var(--border)">' +
            '<span style="font-size:calc(11px*var(--m-label));color:var(--text2)">' + (i+1) + '</span>' +
            '<span style="font-size:calc(13px*var(--m-body))">' + escapeHtml(st.corp_name) + '</span>' +
            '<span style="font-size:calc(12px*var(--m-sub));color:var(--text1);text-align:right;padding-right:8px">' +
              fmtPrice(st.price) +
            '</span>' +
            '<span style="font-size:calc(13px*var(--m-body));font-weight:700;color:' + chgColor(st.price_change_rate) + ';text-align:right">' +
              chgStr(st.price_change_rate) +
            '</span>' +
            '<span style="font-size:calc(11px*var(--m-label));color:var(--text1);text-align:right;padding-right:6px">' +
              (st.market_cap != null ? fmtCap(st.market_cap) : '—') +
            '</span>' +
            '<span style="font-size:calc(11px*var(--m-label));text-align:right;padding-right:4px;color:' + ((st.foreign_net_buy||0)<0?'var(--blue)':'var(--red)') + '">' + (st.foreign_net_buy!=null?st.foreign_net_buy.toLocaleString():'—') + '</span>' +
            '<span style="font-size:calc(11px*var(--m-label));text-align:right;color:var(--text1)">' + (st.foreign_hold_rate!=null?st.foreign_hold_rate.toFixed(1)+'%':'—') + '</span>' +
          '</div>'
        ).join('') +
        '</div>';   // /.ind-stock-panel-inner
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
      '<div class="ind-sub-grid">' +
        '<div id="sub-left" style="overflow-y:auto">' + leftHtml + '</div>' +
        '<div id="sub-stock-panel">' + initStockPanel + '</div>' +
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

  // 기관·외국인 수급 (신고가 위젯은 10-03 '오늘의 아이디어 = 태린 후보'로 바뀌며 없앴다)
  loadFlowData();

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
        if (el) el.innerHTML = '<div style="padding:1.5rem;text-align:center;color:var(--text2);font-size:calc(12px*var(--m-sub))">데이터 없음</div>';
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
      if (el) el.innerHTML = '<div style="padding:1.5rem;text-align:center;color:var(--text2);font-size:calc(12px*var(--m-sub))">로드 실패</div>';
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
      ? '오늘 외국인·기관 동시 순매수 종목 없음<br><span style="font-size:calc(11px*var(--m-label))">외국인↔기관 매수 방향 상이</span>'
      : tab === 'orgn' ? '기관 집계 전<br><span style="font-size:calc(11px*var(--m-label))">09:35·11:25·13:25·14:35</span>' : '데이터 없음';
    body.innerHTML = `<div style="padding:1.5rem;color:var(--text2);font-size:calc(12px*var(--m-sub));text-align:center">${msg}</div>`;
    return;
  }

  // ── 컬럼 레이아웃 ────────────────────────────────────────────────────────────
  // both: 종목 | 등락 | 외국인억/기관억 (3열 통합)
  // frgn: 종목 | 등락 | 금액 | 보유율
  // orgn: 종목 | 등락 | 금액
  const CFG = {
    both: { cols: '1fr 44px 82px',
            hdr: `<span style="font-size:calc(11px*var(--m-label));color:var(--text2)">종목</span>
                  <span style="font-size:calc(11px*var(--m-label));color:var(--text2);text-align:right">등락</span>
                  <span style="font-size:calc(11px*var(--m-label));text-align:right"><span style="color:var(--tg)">외</span><span style="color:var(--text2)">/</span><span style="color:var(--yellow)">기</span>(억)</span>` },
    frgn: { cols: '1fr 44px 52px 44px',
            hdr: `<span style="font-size:calc(11px*var(--m-label));color:var(--text2)">종목</span>
                  <span style="font-size:calc(11px*var(--m-label));color:var(--text2);text-align:right">등락</span>
                  <span style="font-size:calc(11px*var(--m-label));color:${_frgnSellMode?'var(--blue)':'var(--tg)'};text-align:right">금액(억)</span>
                  <span style="font-size:calc(11px*var(--m-label));color:var(--text2);text-align:right">보유율</span>` },
    orgn: { cols: '1fr 44px 52px',
            hdr: `<span style="font-size:calc(11px*var(--m-label));color:var(--text2)">종목</span>
                  <span style="font-size:calc(11px*var(--m-label));color:var(--text2);text-align:right">등락</span>
                  <span style="font-size:calc(11px*var(--m-label));color:var(--yellow);text-align:right">금액(억)</span>` },
  };
  const { cols, hdr } = CFG[tab];

  // ── 외국인 열: 순매수/순매도 토글 바 ────────────────────────────────────────
  const frgnToggle = tab === 'frgn'
    ? `<div style="display:flex;gap:4px;padding:4px 8px;border-bottom:1px solid var(--border);background:var(--bg2)">
         <button class="chip ${!_frgnSellMode?'active':''}" onclick="_setFlowMode(false)"
           style="font-size:calc(11px*var(--m-label));padding:2px 8px;flex:1">순매수 ▲</button>
         <button class="chip ${_frgnSellMode?'active':''}" onclick="_setFlowMode(true)"
           style="font-size:calc(11px*var(--m-label));padding:2px 8px;flex:1;${_frgnSellMode?'color:var(--blue)':''}">순매도 ▼</button>
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
      cells = `<span style="font-size:calc(11px*var(--m-label));font-weight:600;text-align:right">` +
        `<span style="color:var(--tg)">${fAmt}</span>` +
        `<span style="color:var(--text2)">/</span>` +
        `<span style="color:var(--yellow)">${oAmt}</span></span>`;
    } else if (tab === 'frgn') {
      const amtClr = _frgnSellMode ? 'var(--blue)' : 'var(--tg)';
      const amt    = _flowAmtFmt(r.foreign_net_buy, r.price);
      const holdRate = r.foreign_hold_rate != null
        ? `<span style="font-size:calc(11px*var(--m-label));color:var(--text2);text-align:right">${r.foreign_hold_rate.toFixed(1)}%</span>`
        : `<span style="font-size:calc(11px*var(--m-label));color:var(--text2);text-align:right">—</span>`;
      cells = `<span style="font-size:calc(11px*var(--m-label));font-weight:600;text-align:right;color:${amtClr}">${amt}</span>${holdRate}`;
    } else {
      const amt = _flowAmtFmt(r.institution_net_buy, r.price);
      cells = `<span style="font-size:calc(11px*var(--m-label));font-weight:600;text-align:right;color:var(--yellow)">${amt}</span>`;
    }

    return `<div class="stock-row" data-stock-open="${r.stock_code}" data-stock-name="${escAttr(name)}"
      style="display:grid;grid-template-columns:${cols};align-items:center;padding:5px 8px;border-bottom:1px solid rgba(255,255,255,.04)">
      <span style="font-size:calc(12px*var(--m-sub));overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escAttr(name)}">${dispName}</span>
      <span style="font-size:calc(11px*var(--m-label));font-weight:700;color:${chgColor(r.price_change_rate)};text-align:right">${chgStr(r.price_change_rate)}</span>
      ${cells}
    </div>`;
  };

  const topHtml   = rows.slice(0, TOP_N).map(mkRow).join('');
  const extraRows = rows.slice(TOP_N);
  const moreHtml  = extraRows.length
    ? `<div id="flow-more-${tab}" style="display:none">${extraRows.map(mkRow).join('')}</div>
       <div style="padding:5px 8px;text-align:center;cursor:pointer;font-size:calc(11px*var(--m-label));color:var(--text2);
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
