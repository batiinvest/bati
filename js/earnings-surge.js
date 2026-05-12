// earnings-surge.js — 공시 탭: 실적 급등 종목 (등급 카드, 미니차트)
// 의존: config.js (sb, fmtCap, chgColor, chgStr, fetchAllPages), financials.js (openFinTrend)
//
// [v2] 등급 계산 제거 — grade.py → earnings_grade_history DB에서 읽기
//   gradeRow() 로직은 grade.py 단일 구현으로 일원화

let _earningsSurgeTab  = 'revenue';
let _surgeGradeFilter  = 'all';
let _surgeAllResults   = [];

// ── 탭/필터 토글 ──
function setEarningsSurgeTab(tab) {
  _earningsSurgeTab = tab;
  ['revenue','operating_profit'].forEach(t => {
    const btn = document.getElementById('inv-surge-tab-' + (t === 'revenue' ? 'rev' : 'op'));
    if (btn) {
      btn.classList.toggle('active', tab === t);
      btn.style.borderBottom = tab === t ? '2px solid var(--accent)' : '2px solid transparent';
    }
  });
  loadEarningsSurge();
}

function setSurgeGrade(el, grade) {
  _surgeGradeFilter = grade;
  document.querySelectorAll('[data-surge-grade]').forEach(b =>
    b.classList.toggle('active', b.dataset.surgeGrade === grade));
  renderSurgeList();
}

function renderSurgeList() {
  const el = document.getElementById('inv-earnings-list');
  if (!el || !_surgeAllResults.length) return;

  const filtered = _surgeGradeFilter === 'all'
    ? _surgeAllResults
    : _surgeAllResults.filter(r => r.grade === _surgeGradeFilter);

  if (!filtered.length) {
    el.innerHTML = `<div style="padding:1.5rem;text-align:center;color:var(--text3);font-size:12px">${_surgeGradeFilter} 등급 종목 없음</div>`;
    return;
  }

  const gradeOrder = ['S','A','B','관찰'];
  const gradesToShow = _surgeGradeFilter === 'all'
    ? gradeOrder.filter(g => filtered.some(r => r.grade === g))
    : [_surgeGradeFilter];

  el.innerHTML = renderSurgeHTML(filtered, gradesToShow, window._surgeHistMap || {});
}

// ── 메인 로드 ──
async function loadEarningsSurge() {
  const el = document.getElementById('inv-earnings-list');
  if (!el) return;
  el.innerHTML = `<div style="padding:1.5rem;text-align:center;color:var(--text3);font-size:12px"><span class="loading"></span></div>`;

  // ── 1. 분기 목록 (최초 1회) ──
  const qSelect = document.getElementById('inv-earnings-quarter');
  if (qSelect && (qSelect.options.length === 0 || qSelect.options[0].value === '')) {
    const { data: quarters } = await sb.from('earnings_grade_history')
      .select('bsns_year,quarter')
      .order('bsns_year', { ascending: false })
      .order('quarter',   { ascending: false })
      .limit(1000);
    const seen = new Set();
    const qList = (quarters || []).filter(r => {
      const key = `${r.bsns_year}-${r.quarter}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    }).slice(0, 12);
    if (qList.length) {
      qSelect.innerHTML = qList.map((q, i) =>
        `<option value="${q.bsns_year}-${q.quarter}">${q.bsns_year} ${q.quarter}${i === 0 ? ' (최신)' : ''}</option>`
      ).join('');
    }
  }

  const selVal = qSelect?.value || '';
  let filterYear = null, filterQuarter = null;
  if (selVal) [filterYear, filterQuarter] = selVal.split('-');

  // ── 2. earnings_grade_history에서 해당 분기 등급 조회 ──
  // grade.py에서 계산한 결과를 그대로 사용 (isTurn 포함)
  let gradeQuery = sb.from('earnings_grade_history')
    .select('stock_code,corp_name,bsns_year,quarter,grade,score,rev_yoy,op_yoy,revenue,operating_profit,operating_margin')
    .order('score', { ascending: false })
    .limit(200);

  if (filterYear)    gradeQuery = gradeQuery.eq('bsns_year', filterYear);
  if (filterQuarter) gradeQuery = gradeQuery.eq('quarter',   filterQuarter);

  const { data: gradeRows } = await gradeQuery;

  if (!gradeRows?.length) {
    el.innerHTML = `<div style="padding:1.5rem;text-align:center;color:var(--text3);font-size:12px">등급 데이터 없음 — 18:30 재무수집 후 갱신됩니다</div>`;
    return;
  }

  // ── 3. 해당 종목들의 financials 히스토리 (미니바 + 등급 흐름용) ──
  const codes = [...new Set(gradeRows.map(r => r.stock_code))];
  const histRows = [];
  for (let i = 0; i < codes.length; i += 200) {
    const batch = codes.slice(i, i + 200);
    const { data } = await sb.from('financials')
      .select('stock_code,bsns_year,quarter,revenue,operating_profit,revenue_yoy,revenue_qoq,op_profit_yoy,op_profit_qoq')
      .eq('fs_div', 'CFS')
      .in('stock_code', batch)
      .order('bsns_year', { ascending: false })
      .order('quarter',   { ascending: false })
      .limit(batch.length * 12);
    if (data) histRows.push(...data);
  }
  const histMap = {};
  histRows.forEach(r => {
    if (!histMap[r.stock_code]) histMap[r.stock_code] = [];
    histMap[r.stock_code].push(r);
  });

  // ── 4. 등급 이력 (신규/향상/강등/연속 배지용) ──
  const { data: gradeHist } = await sb.from('earnings_grade_history')
    .select('stock_code,bsns_year,quarter,grade')
    .in('stock_code', codes)
    .order('bsns_year', { ascending: false })
    .order('quarter',   { ascending: false })
    .limit(codes.length * 8);

  const gradeHistMap = {};
  (gradeHist || []).forEach(r => {
    if (!gradeHistMap[r.stock_code]) gradeHistMap[r.stock_code] = [];
    gradeHistMap[r.stock_code].push(r);
  });

  _surgeAllResults       = gradeRows;
  window._surgeHistMap   = histMap;
  window._surgeGradeHistMap = gradeHistMap;

  renderSurgeList();
}

// ── 렌더링 ──
function renderSurgeHTML(surges, gradesToShow, histMap) {
  const metric = _earningsSurgeTab || 'revenue';
  const gradeHistMap = window._surgeGradeHistMap || {};
  const GRADE_ORDER  = { 'S': 4, 'A': 3, 'B': 2, '관찰': 1 };

  // 등급 이력 분석 (배지 + 흐름 텍스트)
  const getGradeMeta = (r) => {
    const hist = (gradeHistMap[r.stock_code] || [])
      .filter(h => !(h.bsns_year === r.bsns_year && h.quarter === r.quarter))
      .sort((a, b) => a.bsns_year !== b.bsns_year
        ? b.bsns_year.localeCompare(a.bsns_year)
        : b.quarter.localeCompare(a.quarter));

    const curRank  = GRADE_ORDER[r.grade] || 0;
    const prevGrade = hist[0]?.grade;
    const prevRank  = GRADE_ORDER[prevGrade] || 0;

    let streak = 1;
    for (const h of hist) {
      if (h.grade === r.grade) streak++;
      else break;
    }

    let statusBadge = '', histLine = '';

    if (!hist.length) {
      statusBadge = `<span style="font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(45,206,137,.2);color:#2dce89;font-weight:600">신규진입</span>`;
    } else if (curRank > prevRank) {
      statusBadge = `<span style="font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(255,214,0,.2);color:#ffd600;font-weight:600">등급향상 ↑</span>`;
    } else if (curRank < prevRank) {
      statusBadge = `<span style="font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(245,54,92,.15);color:#f5365c;font-weight:600">등급하락 ↓</span>`;
    } else if (streak >= 3) {
      statusBadge = `<span style="font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(42,171,238,.15);color:#2AABEE;font-weight:600">${streak}분기 연속</span>`;
    }

    const recentHist = hist.slice(0, 2).reverse();
    if (recentHist.length) {
      const GRADE_COLORS = { 'S': '#ffd600', 'A': '#fb6340', 'B': '#2AABEE', '관찰': '#2dce89' };
      const flowItems = [...recentHist, { grade: r.grade, bsns_year: r.bsns_year, quarter: r.quarter, isCurrent: true }];
      histLine = `<div style="display:flex;align-items:center;gap:3px;margin-top:3px">
        ${flowItems.map((h, i) => {
          const c = GRADE_COLORS[h.grade] || '#8b90a7';
          const qLabel = h.bsns_year.slice(2) + h.quarter;
          return `${i > 0 ? '<span style="color:var(--text3);font-size:11px;margin:0 1px">→</span>' : ''}
            <span style="font-size:10px;font-weight:600;padding:0px 5px;border-radius:3px;
              background:${h.isCurrent ? c + '30' : 'transparent'};
              color:${h.isCurrent ? c : 'var(--text2)'};
              border:1px solid ${h.isCurrent ? c + '60' : 'var(--border)'}">
            ${h.grade}급<span style="font-size:9px;color:${h.isCurrent ? c + 'bb' : 'var(--text3)'};margin-left:2px">${qLabel}</span></span>`;
        }).join('')}
      </div>`;
    }

    return { statusBadge, histLine, streak };
  };

  const renderMiniBar = (vals, maxVal, colors) => {
    if (!vals.length || !maxVal) return '';
    return vals.map(([lbl, val]) => {
      const pct   = Math.abs(val) / maxVal * 100;
      const color = val >= 0 ? (colors || '#2AABEE') : '#f5365c';
      return `<div style="display:flex;flex-direction:column;align-items:center;gap:1px;flex:1;min-width:0">
        <div style="font-size:8px;color:var(--text3);white-space:nowrap">${lbl}</div>
        <div style="width:100%;background:var(--bg3);border-radius:2px;height:24px;display:flex;align-items:flex-end">
          <div style="width:100%;background:${color};border-radius:2px;height:${Math.max(pct, 3)}%;opacity:0.85"></div>
        </div>
        <div style="font-size:8px;color:var(--text2);white-space:nowrap">${fmtCap(val)}</div>
      </div>`;
    }).join('');
  };

  const GRADE_BG    = { 'S': 'rgba(255,214,0,.15)', 'A': 'rgba(251,99,64,.15)', 'B': 'rgba(42,171,238,.15)', '관찰': 'rgba(45,206,137,.15)' };
  const GRADE_COLOR = { 'S': '#ffd600', 'A': '#fb6340', 'B': '#2AABEE', '관찰': '#2dce89' };
  const GRADE_LABELS = {
    'S':   'S급 — YoY 30%↑ + 영업이익 20%↑ + 이익률 개선 + 연속 성장',
    'A':   'A급 — YoY 30%↑ + 흑자전환 또는 영업이익 성장',
    'B':   'B급 — YoY 20%↑ + 영업이익 흑자 유지',
    '관찰': '관찰 — QoQ 급등 + 적자 축소 또는 흑자전환 조짐',
  };

  const gradeGroups = {};
  surges.forEach(r => {
    if (!gradeGroups[r.grade]) gradeGroups[r.grade] = [];
    gradeGroups[r.grade].push(r);
  });

  const gradeOrder = ['S','A','B','관찰'];
  return gradeOrder.filter(g => gradeGroups[g] && gradesToShow.includes(g)).map(grade => {
    const items = gradeGroups[grade];
    return `
    <div style="border-bottom:2px solid var(--border)">
      <div style="padding:6px 14px;background:var(--bg3);display:flex;align-items:center;gap:8px">
        <span style="font-size:13px;font-weight:800;padding:2px 10px;border-radius:4px;background:${GRADE_BG[grade]};color:${GRADE_COLOR[grade]}">${grade}급</span>
        <span style="font-size:12px;color:${GRADE_COLOR[grade]};font-weight:600">${GRADE_LABELS[grade]}</span>
        <span style="font-size:11px;color:var(--text3);margin-left:auto">${items.length}개</span>
      </div>
      ${items.map(r => {
        const hist = histMap[r.stock_code] || [];
        const histSorted = [...hist].sort((a, b) =>
          a.bsns_year !== b.bsns_year ? a.bsns_year.localeCompare(b.bsns_year) : a.quarter.localeCompare(b.quarter));
        const recent = histSorted.slice(-6);
        const revVals = recent.map(h => [h.bsns_year.slice(2) + h.quarter, h.revenue || 0]);
        const opVals  = recent.map(h => [h.bsns_year.slice(2) + h.quarter, h.operating_profit || 0]);
        const revMax  = Math.max(...revVals.map(([, v]) => Math.abs(v)), 1);
        const opMax   = Math.max(...opVals.map(([, v]) => Math.abs(v)), 1);

        const curIdx  = histSorted.findIndex(h => h.bsns_year === r.bsns_year && h.quarter === r.quarter);
        const prevQ   = curIdx > 0 ? histSorted[curIdx - 1] : null;
        const prevQ2  = curIdx > 1 ? histSorted[curIdx - 2] : null;

        // QoQ/YoY 시그널 이모지 (표시용 — 계산은 백엔드)
        let qoqSig = '', yoySig = '';
        const cur2 = r.revenue, p1 = prevQ?.revenue, p2 = prevQ2?.revenue;
        if (p1 != null && p1 < 0 && cur2 > 0)               qoqSig = '💚';
        else if (p1 != null && p2 != null && p1 < p2 && cur2 > p1) qoqSig = '↩️';
        else if (p1 != null && p2 != null && cur2 > p1 && p1 > p2) qoqSig = '🔥';

        const gradeMeta = getGradeMeta(r);

        return `<div style="display:grid;grid-template-columns:200px 1fr 1fr;align-items:stretch;padding:8px 14px;border-bottom:1px solid var(--border);cursor:pointer"
          onclick="openFinTrend('${r.stock_code}','${r.corp_name}')"
          onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">

          <div style="padding-right:12px;border-right:1px solid var(--border);display:flex;flex-direction:column;justify-content:center;gap:3px">
            <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
              <span style="font-size:11px;font-weight:700;padding:1px 6px;border-radius:4px;background:${GRADE_BG[r.grade]};color:${GRADE_COLOR[r.grade]}">${r.grade}급</span>
              <span style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.corp_name}</span>
              ${gradeMeta.statusBadge}
            </div>
            <div style="font-size:10px;color:var(--text3)">${r.bsns_year} ${r.quarter}</div>
            ${gradeMeta.histLine}
            <div style="display:flex;flex-direction:column;gap:2px;margin-top:2px">
              <div style="font-size:11px">
                <span style="color:var(--text3)">매출</span> <b>${fmtCap(r.revenue)}</b>
                ${r.rev_yoy != null ? `<span style="color:${r.rev_yoy > 0 ? 'var(--red)' : 'var(--blue)'}"> ${r.rev_yoy > 0 ? '▲' : '▼'}${Math.abs(r.rev_yoy).toFixed(1)}%</span>` : ''}
                ${qoqSig}${yoySig}
              </div>
              <div style="font-size:11px">
                <span style="color:var(--text3)">영업익</span>
                <b style="color:${(r.operating_profit || 0) >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtCap(r.operating_profit)}</b>
                ${r.op_yoy != null ? `<span style="color:${r.op_yoy > 0 ? 'var(--red)' : 'var(--blue)'}"> ${r.op_yoy > 0 ? '▲' : '▼'}${Math.abs(r.op_yoy).toFixed(1)}%</span>` : ''}
                <span style="color:var(--text3);font-size:10px">${r.operating_margin != null ? r.operating_margin.toFixed(1) + '%' : ''}</span>
              </div>
            </div>
          </div>

          <div style="padding:4px 10px;border-right:1px solid var(--border)">
            <div style="font-size:9px;color:var(--text3);margin-bottom:3px">매출액</div>
            <div style="display:flex;gap:2px;align-items:flex-end;height:42px">
              ${renderMiniBar(revVals, revMax, '#2AABEE')}
            </div>
          </div>

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
}
