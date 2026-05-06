// earnings-surge.js — 공시 탭: 실적 급등 종목 (등급 카드, 미니차트)
// 의존: config.js (sb, fmtCap, chgColor, chgStr, fetchAllPages), financials.js (openFinTrend)

// ── 실적 급등 종목 ──
let _earningsMetric    = 'revenue';
let _earningsSurgeTab  = 'revenue';

function setEarningsMetric(el, metric) {
  _earningsMetric = metric;
  document.querySelectorAll('[data-earnings]').forEach(b =>
    b.classList.toggle('active', b.dataset.earnings === metric));
  loadEarningsSurge();
}

let _surgeGradeFilter = 'all';

function setSurgeGrade(el, grade) {
  _surgeGradeFilter = grade;
  document.querySelectorAll('[data-surge-grade]').forEach(b =>
    b.classList.toggle('active', b.dataset.surgeGrade === grade));
  renderSurgeList();
}

let _surgeAllResults = []; // 전체 결과 캐시

function renderSurgeList() {
  const el = document.getElementById('inv-earnings-list');
  if (!el || !_surgeAllResults.length) return;

  const filtered = _surgeGradeFilter === 'all'
    ? _surgeAllResults
    : _surgeAllResults.filter(r => r._grade === _surgeGradeFilter);

  if (!filtered.length) {
    el.innerHTML = `<div style="padding:1.5rem;text-align:center;color:var(--text3);font-size:12px">${_surgeGradeFilter} 등급 종목 없음</div>`;
    return;
  }

  // 등급별 그룹핑 (전체 필터 시) 또는 단일 등급
  const gradeOrder = ['S','A','B','관찰'];
  const gradesToShow = _surgeGradeFilter === 'all'
    ? gradeOrder.filter(g => filtered.some(r => r._grade === g))
    : [_surgeGradeFilter];

  el.innerHTML = renderSurgeHTML(filtered, gradesToShow, _surgeHistMap);
}

function setEarningsSurgeTab(tab) {
  _earningsSurgeTab = tab;
  const revBtn = document.getElementById('inv-surge-tab-rev');
  const opBtn  = document.getElementById('inv-surge-tab-op');
  if (revBtn) {
    revBtn.classList.toggle('active', tab === 'revenue');
    revBtn.style.borderBottom = tab === 'revenue' ? '2px solid var(--accent)' : '2px solid transparent';
  }
  if (opBtn) {
    opBtn.classList.toggle('active', tab === 'operating_profit');
    opBtn.style.borderBottom = tab === 'operating_profit' ? '2px solid var(--accent)' : '2px solid transparent';
  }
  loadEarningsSurge();
}

async function loadEarningsSurge() {
  const el = document.getElementById('inv-earnings-list');
  if (!el) return;
  el.innerHTML = `<div style="padding:1.5rem;text-align:center;color:var(--text3);font-size:12px"><span class="loading"></span></div>`;

  const qoqThreshold = parseFloat(document.getElementById('inv-surge-qoq')?.value || 20);
  const yoyThreshold = parseFloat(document.getElementById('inv-surge-yoy')?.value || 20);
  const metric = _earningsSurgeTab;

  try {
    localStorage.setItem('earnings_surge_qoq', qoqThreshold);
    localStorage.setItem('earnings_surge_yoy', yoyThreshold);
  } catch(e) {}

  // 분기 목록 조회 (최초 1회)
  const qSelect = document.getElementById('inv-earnings-quarter');
  if (qSelect && (qSelect.options.length === 0 || qSelect.options[0].value === '')) {
    const { data: quarters } = await sb.from('financials')
      .select('bsns_year,quarter').eq('fs_div', 'CFS')
      .order('bsns_year', { ascending: false })
      .order('quarter', { ascending: false })
      .limit(1000);
    const seen = new Set();
    const qList = (quarters||[]).filter(r => {
      const key = `${r.bsns_year}-${r.quarter}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    }).slice(0, 12);
    if (qList.length) {
      qSelect.innerHTML = qList.map((q,i) =>
        `<option value="${q.bsns_year}-${q.quarter}">${q.bsns_year} ${q.quarter}${i===0?' (최신)':''}</option>`
      ).join('');
    }
  }

  const selVal = qSelect?.value || '';
  let filterYear = null, filterQuarter = null;
  if (selVal) [filterYear, filterQuarter] = selVal.split('-');

  const qoqCol = metric === 'revenue' ? 'revenue_qoq' : 'op_profit_qoq';
  const yoyCol = metric === 'revenue' ? 'revenue_yoy' : 'op_profit_yoy';

  let query = sb.from('financials')
    .select('corp_name,stock_code,bsns_year,quarter,revenue,operating_profit,operating_margin,other_operating_income,revenue_yoy,revenue_qoq,op_profit_yoy,op_profit_qoq')
    .eq('fs_div', 'CFS');
  if (filterYear)    query = query.eq('bsns_year', filterYear);
  if (filterQuarter) query = query.eq('quarter', filterQuarter);

  const { data: rows } = await query
    .order('bsns_year', { ascending: false })
    .order('quarter', { ascending: false })
    .limit(3000);

  if (!rows?.length) {
    el.innerHTML = `<div style="padding:1.5rem;text-align:center;color:var(--text3);font-size:12px">데이터 없음</div>`;
    return;
  }

  let targets = rows;
  if (!filterYear) {
    const latestMap = {};
    rows.forEach(r => { if (!latestMap[r.stock_code]) latestMap[r.stock_code] = r; });
    targets = Object.values(latestMap);
  }

  // ── 실적 급등 등급 평가 ──
  const MIN_REVENUE = 5_000_000_000; // 50억 최소 규모
  const opCol  = 'operating_profit';
  const opYoy  = 'op_profit_yoy';
  const opQoq  = 'op_profit_qoq';

  const gradeRow = (r, histAll) => {
    const rev    = r[metric];
    const yoy    = r[yoyCol];
    const qoq    = r[qoqCol];
    const op     = r[opCol];
    const opY    = r[opYoy];
    const margin = r.operating_margin;
    const revAbs = Math.abs(rev || 0);

    // 규모 필터 (50억 미만 제외)
    if (revAbs < MIN_REVENUE) return null;

    const hist = histAll[r.stock_code] || [];
    const histSorted = [...hist].sort((a,b) =>
      a.bsns_year !== b.bsns_year ? a.bsns_year.localeCompare(b.bsns_year) : a.quarter.localeCompare(b.quarter));
    const curIdx = histSorted.findIndex(h => h.bsns_year === r.bsns_year && h.quarter === r.quarter);
    const prevQ  = curIdx > 0 ? histSorted[curIdx-1] : null;
    const prevQ2 = curIdx > 1 ? histSorted[curIdx-2] : null;
    const prevY  = hist.find(h => h.bsns_year === String(parseInt(r.bsns_year)-1) && h.quarter === r.quarter);
    const prevYVal   = prevY ? prevY[metric] : null;
    const prevMargin = prevY ? prevY.operating_margin : null;

    // 베이스효과: 전년동기가 현재의 10% 미만 + YoY 200% 초과 → 제외
    if (prevYVal != null && Math.abs(prevYVal) < revAbs * 0.1 && yoy != null && yoy > 200) return null;

    // 영업손실 심화 제외
    if (op != null && op < 0 && opY != null && opY < -50) return null;

    // 일회성 이익 제외: other_operating_income이 영업이익의 50% 이상
    const ooi = r.other_operating_income;
    if (ooi != null && op != null && op > 0 && ooi > op * 0.5) return null;

    let grade = null, score = 0;

    // 🏆 S급: YoY 매출 30%↑ + 영업이익 20%↑ + 이익률 개선(2%p↑) + 연속성
    if (yoy != null && yoy >= 30 && opY != null && opY >= 20) {
      const marginImproved = margin != null && prevMargin != null && (margin - prevMargin) >= 2;
      const continuous     = prevQ && prevQ[yoyCol] != null && prevQ[yoyCol] >= 20;
      if (marginImproved && continuous) {
        grade = 'S'; score = 100 + (yoy||0) + (opY||0) + (margin||0);
      } else if (marginImproved || continuous) {
        // 이익률 개선 or 연속성 중 하나만 충족 → A급으로 강등
        grade = 'A'; score = 85 + (yoy||0) + (opY||0);
      }
    }

    // 🥇 A급: YoY 매출 30%↑ + 흑자전환 또는 영업이익 성장
    if (!grade && yoy != null && yoy >= 30) {
      const isBlackTurn = prevYVal != null && prevYVal < 0 && (rev||0) > 0;
      const opGood      = opY != null && opY >= 0;
      if (isBlackTurn || opGood) {
        grade = 'A'; score = 80 + (yoy||0);
      }
    }

    // 🥈 B급: YoY 매출 20%↑ + 영업이익 흑자 유지
    if (!grade && yoy != null && yoy >= yoyThreshold && op != null && op >= 0) {
      grade = 'B'; score = 50 + (yoy||0);
    }

    // ⚡ 관찰: QoQ 급등 + 적자 축소(2분기 연속) 또는 흑자전환 조짐
    if (!grade && qoq != null && qoq >= qoqThreshold) {
      const isBlack      = prevQ && prevQ[opCol] < 0 && (op||0) > 0;   // 적자→흑자
      const isTurn       = prevQ && prevQ2 && prevQ[metric] < prevQ2[metric] && rev > prevQ[metric]; // 하락 후 반등
      // 적자 축소 2분기 연속: op < 0이지만 줄어드는 중
      const lossReduce   = op != null && op < 0 && prevQ && prevQ[opCol] < 0
                        && op > prevQ[opCol]  // 이번이 전분기보다 덜 적자
                        && prevQ2 && prevQ[opCol] > prevQ2[opCol]; // 전분기도 전전분기보다 덜 적자
      if (isBlack || isTurn || lossReduce) {
        grade = '관찰'; score = 30 + (qoq||0);
      }
    }

    if (!grade) return null;
    return { ...r, _grade: grade, _score: score };
  };



  // histRows 미리 조회 (등급 평가용)
  const previewCodes = [...new Set(targets.map(r => r.stock_code))];

  // 배치로 나눠서 전체 히스토리 조회 (Supabase in() 제한 대응)
  const previewHist = [];
  for (let i = 0; i < previewCodes.length; i += 200) {
    const batch = previewCodes.slice(i, i + 200);
    const { data } = await sb.from('financials')
      .select('stock_code,bsns_year,quarter,revenue,operating_profit,operating_margin,other_operating_income,revenue_yoy,revenue_qoq,op_profit_yoy,op_profit_qoq')
      .eq('fs_div', 'CFS')
      .in('stock_code', batch)
      .order('bsns_year', { ascending: false })
      .order('quarter', { ascending: false })
      .limit(batch.length * 12);
    if (data) previewHist.push(...data);
  }

  const previewHistMap = {};
  (previewHist||[]).forEach(r => {
    if (!previewHistMap[r.stock_code]) previewHistMap[r.stock_code] = [];
    previewHistMap[r.stock_code].push(r);
  });

  const surges = targets
    .map(r => gradeRow(r, previewHistMap))
    .filter(Boolean)
    .sort((a,b) => {
      const gradeOrder = {'S':4,'A':3,'B':2,'관찰':1};
      const gd = (gradeOrder[b._grade]||0) - (gradeOrder[a._grade]||0);
      return gd !== 0 ? gd : b._score - a._score;
    })
    .slice(0, 60); // 전체 60개 캐시

  if (!surges.length) {
    el.innerHTML = `<div style="padding:1.5rem;text-align:center;color:var(--text3);font-size:12px">기준 충족 종목 없음</div>`;
    return;
  }

  // 급등 종목의 최근 분기 데이터 조회
  const codes = [...new Set(surges.map(r => r.stock_code))];
  const { data: histRows } = await sb.from('financials')
    .select('corp_name,stock_code,bsns_year,quarter,revenue,operating_profit,revenue_yoy,revenue_qoq,op_profit_yoy,op_profit_qoq')
    .eq('fs_div', 'CFS')
    .in('stock_code', codes)
    .order('bsns_year', { ascending: false })
    .order('quarter', { ascending: false })
    .limit(codes.length * 20);

  const histMap = {};
  (histRows||[]).forEach(r => {
    if (!histMap[r.stock_code]) histMap[r.stock_code] = [];
    histMap[r.stock_code].push(r);
  });

  // 캐시 저장 후 렌더링
  _surgeAllResults = surges;
  window._surgeHistMap = histMap;

  // 등급 이력 조회 (신규/향상/강등 표시용)
  const { data: gradeHist } = await sb.from('earnings_grade_history')
    .select('stock_code,bsns_year,quarter,grade')
    .in('stock_code', codes)
    .order('bsns_year', { ascending: false })
    .order('quarter', { ascending: false })
    .limit(codes.length * 8);

  const gradeHistMap = {};
  (gradeHist||[]).forEach(r => {
    if (!gradeHistMap[r.stock_code]) gradeHistMap[r.stock_code] = [];
    gradeHistMap[r.stock_code].push(r);
  });
  window._surgeGradeHistMap = gradeHistMap;

  renderSurgeList();
}

function renderSurgeHTML(surges, gradesToShow, histMap) {
  const metric = _earningsSurgeTab || 'revenue';
  const qoqCol = metric === 'revenue' ? 'revenue_qoq' : 'op_profit_qoq';
  const yoyCol = metric === 'revenue' ? 'revenue_yoy' : 'op_profit_yoy';
  const gradeHistMap = window._surgeGradeHistMap || {};
  const gradeOrder   = ['S','A','B','관찰'];
  const GRADE_ORDER  = {'S':4,'A':3,'B':2,'관찰':1};

  // 등급 이력 분석 함수
  const getGradeMeta = (r) => {
    const hist = (gradeHistMap[r.stock_code] || [])
      .filter(h => !(h.bsns_year === r.bsns_year && h.quarter === r.quarter))
      .sort((a,b) => a.bsns_year !== b.bsns_year
        ? b.bsns_year.localeCompare(a.bsns_year)
        : b.quarter.localeCompare(a.quarter));

    const curRank  = GRADE_ORDER[r._grade] || 0;
    const prevGrade = hist[0]?.grade;
    const prevRank  = GRADE_ORDER[prevGrade] || 0;

    // 연속 유지 분기 계산
    let streak = 1;
    for (const h of hist) {
      if (h.grade === r._grade) streak++;
      else break;
    }

    let statusBadge = '';
    let histLine    = '';

    // 상태 배지
    if (!hist.length) {
      statusBadge = `<span style="font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(45,206,137,.2);color:#2dce89;font-weight:600">신규진입</span>`;
    } else if (curRank > prevRank) {
      statusBadge = `<span style="font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(255,214,0,.2);color:#ffd600;font-weight:600">등급향상 ↑</span>`;
    } else if (curRank < prevRank) {
      statusBadge = `<span style="font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(245,54,92,.15);color:#f5365c;font-weight:600">등급하락 ↓</span>`;
    } else if (streak >= 3) {
      statusBadge = `<span style="font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(42,171,238,.15);color:#2AABEE;font-weight:600">${streak}분기 연속</span>`;
    }

    // 이력 흐름 텍스트 (최근 3분기 → 현재)
    const recentHist = hist.slice(0, 2).reverse(); // 최근 2분기만
    if (recentHist.length) {
      const GRADE_COLORS = {'S':'#ffd600','A':'#fb6340','B':'#2AABEE','관찰':'#2dce89'};
      const flowItems = [...recentHist, { grade: r._grade, bsns_year: r.bsns_year, quarter: r.quarter, isCurrent: true }];
      histLine = `<div style="display:flex;align-items:center;gap:3px;margin-top:3px">
        ${flowItems.map((h, i) => {
          const c    = GRADE_COLORS[h.grade] || '#8b90a7';
          const qLabel = h.bsns_year.slice(2) + h.quarter;
          return `${i > 0 ? '<span style="color:var(--text3);font-size:11px;margin:0 1px">→</span>' : ''}
            <span style="font-size:10px;font-weight:600;padding:0px 5px;border-radius:3px;
              background:${h.isCurrent ? c+'30' : 'transparent'};
              color:${h.isCurrent ? c : 'var(--text2)'};
              border:1px solid ${h.isCurrent ? c+'60' : 'var(--border)'}"
            >${h.grade}급<span style="font-size:9px;color:${h.isCurrent ? c+'bb' : 'var(--text3)'};margin-left:2px">${qLabel}</span></span>`;
        }).join('')}
      </div>`;
    }

    return { statusBadge, histLine, streak, hist };
  };

  const chgBadge = (v, label, prevVal, curVal) => {
    if (v == null) return '';
    const color = v > 0 ? 'var(--red)' : 'var(--blue)';
    const fromTo = (prevVal != null && curVal != null)
      ? ` <span style="color:var(--text3);font-size:10px">(${fmtCap(prevVal)}→${fmtCap(curVal)})</span>`
      : '';
    return `<span style="font-size:11px;color:${color}">${v>0?'▲':'▼'}${Math.abs(v).toFixed(1)}% <span style="color:var(--text3);font-size:10px">${label}</span>${fromTo}</span>`;
  };

  // 연간 집계 함수
  const calcAnnual = (hist, metric) => {
    const byYear = {};
    hist.forEach(r => {
      if (!byYear[r.bsns_year]) byYear[r.bsns_year] = 0;
      byYear[r.bsns_year] += (r[metric] || 0);
    });
    return Object.entries(byYear)
      .sort(([a],[b]) => a.localeCompare(b))
      .slice(-3); // 최근 3년
  };

  const renderBars = (items, maxVal, labelFn) => {
    if (!items.length || !maxVal) return '';
    return items.map(([label, val]) => {
      const pct = Math.abs(val) / maxVal * 100;
      const color = val >= 0 ? '#2AABEE' : 'var(--red)';
      return `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;flex:1;min-width:0">
        <div style="font-size:9px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%">${labelFn(label)}</div>
        <div style="width:100%;background:var(--bg3);border-radius:2px;height:32px;display:flex;align-items:flex-end">
          <div style="width:100%;background:${color};border-radius:2px;height:${Math.max(pct,3)}%;opacity:0.85"></div>
        </div>
        <div style="font-size:9px;color:var(--text2);white-space:nowrap">${fmtCap(val)}</div>
      </div>`;
    }).join('');
  };

  // ── 등급별 섹션 렌더링 ──
  const GRADE_LABELS = {
    'S': { label: 'S급 — YoY 30%↑ + 영업이익 20%↑ + 이익률 개선 + 연속 성장', color: '#ffd600' },
    'A': { label: 'A급 — YoY 30%↑ + 흑자전환 또는 영업이익 성장',              color: '#fb6340' },
    'B': { label: 'B급 — YoY 20%↑ + 영업이익 흑자 유지',                      color: '#2AABEE' },
    '관찰': { label: '관찰 — QoQ 급등 + 적자 축소 또는 흑자전환 조짐',              color: '#2dce89' },
  };

  const renderMiniBar = (vals, maxVal, colors) => {
    if (!vals.length || !maxVal) return '';
    return vals.map(([lbl, val]) => {
      const pct   = Math.abs(val) / maxVal * 100;
      const color = val >= 0 ? (colors||'#2AABEE') : '#f5365c';
      return `<div style="display:flex;flex-direction:column;align-items:center;gap:1px;flex:1;min-width:0">
        <div style="font-size:8px;color:var(--text3);white-space:nowrap">${lbl}</div>
        <div style="width:100%;background:var(--bg3);border-radius:2px;height:24px;display:flex;align-items:flex-end">
          <div style="width:100%;background:${color};border-radius:2px;height:${Math.max(pct,3)}%;opacity:0.85"></div>
        </div>
        <div style="font-size:8px;color:var(--text2);white-space:nowrap">${fmtCap(val)}</div>
      </div>`;
    }).join('');
  };

  // 등급별로 그룹핑
  // 등급별 그룹핑
  const gradeGroups = {};
  surges.forEach(r => {
    if (!gradeGroups[r._grade]) gradeGroups[r._grade] = [];
    gradeGroups[r._grade].push(r);
  });

  let html = gradeOrder.filter(g => gradeGroups[g] && (gradesToShow.includes(g))).map(grade => {
    const items = gradeGroups[grade];
    const meta  = GRADE_LABELS[grade];
    return `
    <div style="border-bottom:2px solid var(--border)">
      <div style="padding:6px 14px;background:var(--bg3);display:flex;align-items:center;gap:8px">
        <span style="font-size:13px;font-weight:800;padding:2px 10px;border-radius:4px;background:${ {'S':'rgba(255,214,0,.15)','A':'rgba(251,99,64,.15)','B':'rgba(42,171,238,.15)','관찰':'rgba(45,206,137,.15)'}[grade] };color:${ {'S':'#ffd600','A':'#fb6340','B':'#2AABEE','관찰':'#2dce89'}[grade] }">${grade}급</span>
        <span style="font-size:12px;color:${meta.color};font-weight:600">${meta.label}</span>
        <span style="font-size:11px;color:var(--text3);margin-left:auto">${items.length}개</span>
      </div>
      ${items.map((r, i) => {
        const hist = histMap[r.stock_code] || [];
        const histSorted2 = [...hist].sort((a,b) =>
          a.bsns_year !== b.bsns_year ? a.bsns_year.localeCompare(b.bsns_year) : a.quarter.localeCompare(b.quarter));

        // 최근 6분기 데이터
        const recent = histSorted2.slice(-6);
        const revVals = recent.map(h => [h.bsns_year.slice(2)+h.quarter, h.revenue||0]);
        const opVals  = recent.map(h => [h.bsns_year.slice(2)+h.quarter, h.operating_profit||0]);
        const revMax  = Math.max(...revVals.map(([,v]) => Math.abs(v)), 1);
        const opMax   = Math.max(...opVals.map(([,v]) => Math.abs(v)), 1);

        // 이전값
        const curIdx2  = histSorted2.findIndex(h => h.bsns_year === r.bsns_year && h.quarter === r.quarter);
        const prevQ2   = curIdx2 > 0 ? histSorted2[curIdx2-1] : null;
        const prevY2   = hist.find(h => h.bsns_year === String(parseInt(r.bsns_year)-1) && h.quarter === r.quarter);

        // QoQ/YoY 시그널
        let qoqSig = '', yoySig = '';
        const cur2 = r.revenue, p12 = prevQ2?.revenue, p22 = histSorted2[curIdx2-2]?.revenue;
        if (p12 != null && p12 < 0 && cur2 > 0)          qoqSig = '💚';
        else if (p12 != null && p22 != null && p12 < p22 && cur2 > p12) qoqSig = '↩️';
        else if (p12 != null && p22 != null && cur2 > p12 && p12 > p22) qoqSig = '🔥';
        if (prevY2?.revenue != null && prevY2.revenue < 0 && cur2 > 0) yoySig = '🔄';
        else if (r.revenue_yoy != null) {
          const ppy = hist.find(h => h.bsns_year === String(parseInt(r.bsns_year)-2) && h.quarter === r.quarter);
          if (ppy && ppy.revenue && prevY2?.revenue && prevY2.revenue > ppy.revenue) yoySig = '📊';
        }

        const gradeMeta = getGradeMeta(r);

        return `<div style="display:grid;grid-template-columns:200px 1fr 1fr;align-items:stretch;gap:0;padding:8px 14px;border-bottom:1px solid var(--border);cursor:pointer"
          onclick="openFinTrend('${r.stock_code}','${r.corp_name}')"
          onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">

          <!-- 종목 정보 -->
          <div style="padding-right:12px;border-right:1px solid var(--border);display:flex;flex-direction:column;justify-content:center;gap:3px">
            <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
              <span style="font-size:11px;font-weight:700;padding:1px 6px;border-radius:4px;background:${ {'S':'rgba(255,214,0,.15)','A':'rgba(251,99,64,.15)','B':'rgba(42,171,238,.15)','관찰':'rgba(45,206,137,.15)'}[r._grade]||'var(--bg3)' };color:${ {'S':'#ffd600','A':'#fb6340','B':'#2AABEE','관찰':'#2dce89'}[r._grade]||'var(--text)' }">${r._grade}급</span>
              <span style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.corp_name}</span>
              ${gradeMeta.statusBadge}
            </div>
            <div style="font-size:10px;color:var(--text3)">${r.bsns_year} ${r.quarter}</div>
            ${gradeMeta.histLine}
            <div style="display:flex;flex-direction:column;gap:2px;margin-top:2px">
              <div style="font-size:11px">
                <span style="color:var(--text3)">매출</span> <b>${fmtCap(r.revenue)}</b>
                ${r.revenue_yoy != null ? `<span style="color:${r.revenue_yoy>0?'var(--red)':'var(--blue)'}"> ${r.revenue_yoy>0?'▲':'▼'}${Math.abs(r.revenue_yoy).toFixed(1)}%</span>` : ''}
                ${r.revenue_qoq != null ? `<span style="color:var(--text3);font-size:10px"> QoQ ${r.revenue_qoq>0?'▲':'▼'}${Math.abs(r.revenue_qoq).toFixed(1)}%</span>` : ''}
                ${qoqSig}${yoySig}
              </div>
              <div style="font-size:11px">
                <span style="color:var(--text3)">영업익</span> <b style="color:${(r.operating_profit||0)>=0?'var(--green)':'var(--red)'}">${fmtCap(r.operating_profit)}</b>
                ${r.op_profit_yoy != null ? `<span style="color:${r.op_profit_yoy>0?'var(--red)':'var(--blue)'}"> ${r.op_profit_yoy>0?'▲':'▼'}${Math.abs(r.op_profit_yoy).toFixed(1)}%</span>` : ''}
                <span style="color:var(--text3);font-size:10px"> ${r.operating_margin != null ? r.operating_margin.toFixed(1)+'%' : ''}</span>
              </div>
            </div>
          </div>

          <!-- 매출 미니바 -->
          <div style="padding:4px 10px;border-right:1px solid var(--border)">
            <div style="font-size:9px;color:var(--text3);margin-bottom:3px">매출액</div>
            <div style="display:flex;gap:2px;align-items:flex-end;height:42px">
              ${renderMiniBar(revVals, revMax, '#2AABEE')}
            </div>
          </div>

          <!-- 영업이익 미니바 -->
          <div style="padding:4px 10px">
            <div style="font-size:9px;color:var(--text3);margin-bottom:3px">영업이익</div>
            <div style="display:flex;gap:2px;align-items:flex-end;height:42px">
              ${renderMiniBar(opVals, opMax, '#2dce89')}
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  }).join('') + `<div style="padding:6px 12px;font-size:11px;color:var(--text3)">매출 50억↑ · S/A/B/관찰 등급 · 클릭 시 재무 추이</div>`;
  return html;
}

