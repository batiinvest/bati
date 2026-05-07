// disclosure.js — 공시 탭: 오늘 실적 공시, 전체 공시 토글
// 의존: config.js (sb)

// ── 전체 공시 토글 ──
let _allDiscLoaded = false;

function toggleAllDisclosures() {
  const panel = document.getElementById('inv-all-disclosure');
  const btn   = document.getElementById('inv-disclosure-expand-btn');
  if (!panel) return;

  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  btn.textContent = isOpen ? '+ 전체 공시' : '− 전체 공시';

  if (!isOpen && !_allDiscLoaded) {
    _allDiscLoaded = true;
    loadAllDisclosures();
  }
}

async function loadAllDisclosures() {
  const el = document.getElementById('inv-all-disclosure-list');
  if (!el) return;

  el.innerHTML = `<div style="padding:1.25rem;text-align:center;color:var(--text3);font-size:12px"><span class="loading"></span> 공시 목록 불러오는 중...</div>`;

  const { data: cfg } = await sb.from('app_config')
    .select('value').eq('key', 'today_all_disclosures').single();

  if (!cfg?.value) {
    el.innerHTML = `<div style="padding:1.25rem;text-align:center;color:var(--text3);font-size:12px">전체 공시 데이터 없음 (매일 18:30 업데이트)</div>`;
    return;
  }

  let all = [];
  try { all = JSON.parse(cfg.value); } catch { }

  if (!all.length) {
    el.innerHTML = `<div style="padding:1.25rem;text-align:center;color:var(--text3);font-size:12px">오늘 공시 없음</div>`;
    return;
  }

  // ── 시총 1000억 미만 필터링 (실적공시 종목은 예외) ──────────
  // corp_code → stock_code 매핑 후 market_data 시총 조회
  const corpCodes = [...new Set(all.map(d => d.corp_code).filter(Boolean))];
  const CAP_THRESHOLD = 100_000_000_000; // 1000억 (원 단위)

  // 실적공시 종목은 시총 무관 표시
  let earningsCorpCodes = new Set();
  try {
    const { data: ecfg } = await sb.from('app_config')
      .select('value').eq('key', 'today_earnings_corps').single();
    const ecorps = ecfg?.value ? JSON.parse(ecfg.value) : [];
    ecorps.forEach(c => { if (c.corp_code) earningsCorpCodes.add(c.corp_code); });
  } catch(e) { /* 무시 */ }

  let capMap = {};  // corp_code → market_cap
  try {
    // companies 테이블에서 corp_code → stock_code 매핑
    const { data: companies } = await sb.from('companies')
      .select('corp_code,code')
      .in('corp_code', corpCodes.slice(0, 500));  // Supabase in() 제한

    const codeMap = {};  // corp_code → stock_code (suffix 제거)
    (companies || []).forEach(c => {
      codeMap[c.corp_code] = c.code?.replace(/\.(KS|KQ)$/, '');
    });

    const stockCodes = [...new Set(Object.values(codeMap).filter(Boolean))];

    // 최신 market_data에서 시총 조회
    const { data: mktDate } = await sb.from('market_data')
      .select('base_date').order('base_date', { ascending: false }).limit(1);
    const maxDate = mktDate?.[0]?.base_date;

    if (maxDate && stockCodes.length) {
      const { data: mktData } = await sb.from('market_data')
        .select('stock_code,market_cap')
        .eq('base_date', maxDate)
        .in('stock_code', stockCodes.slice(0, 500));

      const mktMap = {};  // stock_code → market_cap
      (mktData || []).forEach(m => { mktMap[m.stock_code] = m.market_cap; });

      // corp_code → market_cap
      Object.entries(codeMap).forEach(([corpCode, stockCode]) => {
        if (mktMap[stockCode] != null) capMap[corpCode] = mktMap[stockCode];
      });
    }
  } catch(e) { /* 시총 조회 실패 시 필터링 스킵 */ }

  const beforeCount = all.length;
  all = all.filter(d => {
    if (!d.corp_code) return true;               // corp_code 없으면 포함
    if (earningsCorpCodes.has(d.corp_code)) return true;  // 실적공시 종목 예외
    const cap = capMap[d.corp_code];
    if (cap == null) return true;                // 시총 정보 없으면 포함
    return cap >= CAP_THRESHOLD;
  });
  const filteredCount = beforeCount - all.length;

  // 카테고리 분류 (투자 판단 중요도 순)
  const CATEGORIES = [
    { label: '사업보고서',  color: '#2AABEE', bg: 'rgba(42,171,238,.12)',  match: ['사업보고서'] },
    { label: '반기보고서',  color: '#2dce89', bg: 'rgba(45,206,137,.12)',  match: ['반기보고서'] },
    { label: '분기보고서',  color: '#fb6340', bg: 'rgba(251,99,64,.12)',   match: ['분기보고서'] },
    { label: '기업설명회(IR)', color: '#22d3ee', bg: 'rgba(34,211,238,.12)',  match: ['기업설명회', 'IR개최', 'NDR'] },
    { label: '잠정실적',    color: '#f59e0b', bg: 'rgba(245,158,11,.12)',  match: ['잠정', '결산실적', '실적(공정공시)'] },
    { label: '주요사항',    color: '#ffd600', bg: 'rgba(255,214,0,.12)',   match: ['주요사항보고'] },
    { label: '증자/감자',   color: '#a78bfa', bg: 'rgba(167,139,250,.12)', match: ['유상증자', '무상증자', '감자'] },
    { label: '합병/분할',   color: '#f87171', bg: 'rgba(248,113,113,.12)', match: ['합병', '분할', '영업양수', '영업양도'] },
    { label: '사채/전환',   color: '#60a5fa', bg: 'rgba(96,165,250,.12)',  match: ['전환사채', '신주인수권', '교환사채', '사채권'] },
    { label: '자사주',      color: '#34d399', bg: 'rgba(52,211,153,.12)',  match: ['자기주식'] },
    { label: '배당',        color: '#fbbf24', bg: 'rgba(251,191,36,.12)',  match: ['배당'] },
    { label: '최대주주변동',  color: '#f97316', bg: 'rgba(249,115,22,.12)',  match: ['최대주주등소유주식변동', '최대주주변동'] },
    { label: '대량보유',     color: '#e879f9', bg: 'rgba(232,121,249,.12)', match: ['대량보유상황보고서', '대량보유'] },
    { label: '거래계획(예고)',color: '#67e8f9', bg: 'rgba(103,232,249,.12)', match: ['거래계획보고서'] },
    { label: '지분공시',    color: '#a259ff', bg: 'rgba(162,89,255,.12)',  match: ['소유상황보고서', '임원ㆍ주요주주', '임원·주요주주'] },
    { label: '임원/주식',   color: '#c084fc', bg: 'rgba(192,132,252,.12)', match: ['임원', '주요주주'] },
    { label: '감사보고서',  color: '#94a3b8', bg: 'rgba(148,163,184,.12)', match: ['감사보고서', '내부회계'] },
    { label: '공정공시',    color: '#00d4aa', bg: 'rgba(0,212,170,.12)',   match: ['공정공시'] },
    { label: '증권신고',    color: '#64748b', bg: 'rgba(100,116,139,.12)', match: ['증권신고서', '투자설명서'] },
    { label: '기타',        color: '#8b90a7', bg: 'rgba(139,144,167,.12)', match: null },
  ];

  const categorized = {};
  CATEGORIES.forEach(c => categorized[c.label] = []);

  all.forEach(d => {
    const nm = d.report_nm || '';
    let matched = false;
    for (const cat of CATEGORIES.slice(0, -1)) {
      if (cat.match.some(m => nm.includes(m))) {
        categorized[cat.label].push(d);
        matched = true;
        break;
      }
    }
    if (!matched) categorized['기타'].push(d);
  });

  // DART 원본 링크 — rcpNo 파라미터 사용
  const dartLink = (d) =>
    d.rcept_no ? `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${d.rcept_no}` : null;

  // insider_trades DB에서 오늘 지분변동 조회
  const today = new Date().toISOString().slice(0, 10);
  let insiderMap = {};  // rcept_no → [rows]
  try {
    const { data: insiders, error: insiderErr } = await sb.from('insider_trades')
      .select('rcept_no,reporter,relation,trade_date,reason,shares_change,shares_after,price,stock_type')
      .eq('base_date', today);
    console.log('[insider_trades] 조회결과:', insiders?.length, '건, 오류:', insiderErr);
    (insiders || []).forEach(r => {
      if (!insiderMap[r.rcept_no]) insiderMap[r.rcept_no] = [];
      insiderMap[r.rcept_no].push(r);
    });
    // corp_code 기준 합산 맵 (지분공시 중복 카드 묶기용)
    window._corpInsiderMap = {};
    (insiders || []).forEach(r => {
      if (!r.corp_code) return;
      if (!window._corpInsiderMap[r.corp_code]) window._corpInsiderMap[r.corp_code] = [];
      window._corpInsiderMap[r.corp_code].push(r);
    });
    window._insiderMap = insiderMap;
    console.log('[insiderMap] 키 수:', Object.keys(insiderMap).length);
  } catch(e) {
    console.warn('[insider_trades] 조회 실패:', e);
  }

  const fmtShares = n => n != null ? Math.abs(n).toLocaleString() + '주' : '';
  const reasonBadge = (rows, type) => {
    if (!rows?.length) return '';
    if (type === 'plan') {
      // 거래계획: 예정 취득/처분 표시
      let buy = 0, sell = 0;
      const periods = new Set();
      rows.forEach(r => {
        const chg = r.shares_change || 0;
        if (chg > 0) buy += chg;
        else if (chg < 0) sell += Math.abs(chg);
        if (r.plan_period) periods.add(r.plan_period);
      });
      const periodTxt = periods.size ? ` (${[...periods][0]})` : '';
      const parts = [];
      if (buy)  parts.push(`<span style="color:var(--red);font-size:10px;font-weight:600">▲예정취득 ${buy.toLocaleString()}주</span>`);
      if (sell) parts.push(`<span style="color:var(--blue);font-size:10px;font-weight:600">▼예정처분 ${sell.toLocaleString()}주</span>`);
      if (parts.length && periodTxt) parts.push(`<span style="color:var(--text3);font-size:10px">${periodTxt}</span>`);
      return parts.join(' ');
    }
    if (type === 'major') {
      // 최대주주변동: DART 원문 확인 유도
      return `<span style="color:var(--yellow);font-size:10px;font-weight:600">⚠ 최대주주 지분변동</span>`;
    }
    if (type === 'bulk') {
      const row = rows[0];
      const chg = row.shares_change;
      const bfRt = row.hold_ratio_before != null ? row.hold_ratio_before.toFixed(2) + '%' : '';
      const afRt = row.hold_ratio_after  != null ? row.hold_ratio_after.toFixed(2)  + '%' : '';
      const rtTxt = (bfRt && afRt && bfRt !== afRt) ? `${bfRt}→${afRt}` : (afRt || bfRt || '');
      if (chg > 0)  return `<span style="color:var(--red);font-size:10px;font-weight:600">▲취득 ${Math.abs(chg).toLocaleString()}주${rtTxt?' ('+rtTxt+')':''}</span>`;
      if (chg < 0)  return `<span style="color:var(--blue);font-size:10px;font-weight:600">▼처분 ${Math.abs(chg).toLocaleString()}주${rtTxt?' ('+rtTxt+')':''}</span>`;
      if (rtTxt)    return `<span style="color:var(--text3);font-size:10px">보유 ${rtTxt} (변동없음)</span>`;
      return `<span style="color:var(--text3);font-size:10px">변동없음</span>`;
    }
    // 임원 지분공시
    let buy = 0, sell = 0;
    rows.forEach(r => {
      const chg = r.shares_change || 0;
      if (chg > 0) buy += chg;
      else if (chg < 0) sell += Math.abs(chg);
    });
    const parts = [];
    if (buy)  parts.push(`<span style="color:var(--red);font-size:10px;font-weight:600">▲취득 ${buy.toLocaleString()}주</span>`);
    if (sell) parts.push(`<span style="color:var(--blue);font-size:10px;font-weight:600">▼처분 ${sell.toLocaleString()}주</span>`);
    return parts.join(' ');
  };

  const catHTML = CATEGORIES.map(cat => {
    const items = categorized[cat.label];
    if (!items.length) return '';

    const isInsider  = cat.label === '지분공시';
    const isBulk     = cat.label === '대량보유';
    const isMajor    = cat.label === '최대주주변동';
    const isPlan     = cat.label === '거래계획(예고)';
    const needsBadge = isInsider || isBulk || isMajor || isPlan;
    const badgeType  = isBulk ? 'bulk' : isMajor ? 'major' : isPlan ? 'plan' : 'insider';

    // 지분공시: corp_code 기준으로 deduplicate (동일기업 여러 임원 → 1개 카드로 합산)
    let displayItems = items;
    if (isInsider) {
      const seenCorps = {};
      displayItems = [];
      items.forEach(d => {
        const key = d.corp_code || d.corp_name;
        if (!seenCorps[key]) {
          seenCorps[key] = true;
          displayItems.push(d);
        }
      });
    }

    return `
      <div style="padding:.75rem 1rem;border-bottom:1px solid var(--border)">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <span style="font-size:12px;font-weight:600;padding:2px 8px;border-radius:100px;background:${cat.bg};color:${cat.color}">${cat.label}</span>
          <span style="font-size:11px;color:var(--text3)">${displayItems.length}건${isInsider && displayItems.length < items.length ? ` (${items.length}건 공시)` : ''}</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(${needsBadge?'240':'180'}px,1fr));gap:6px">
          ${displayItems.map(d => {
            const link    = dartLink(d);
            // 지분공시는 corp_code 기준 합산, 나머지는 rcept_no 기준
            const insider = needsBadge
              ? (isInsider && d.corp_code && window._corpInsiderMap?.[d.corp_code]
                  ? window._corpInsiderMap[d.corp_code]
                  : insiderMap[d.rcept_no])
              : null;
            const badge   = reasonBadge(insider, badgeType);
            return `<div style="display:flex;flex-direction:column;gap:3px;padding:6px 10px;
                background:var(--bg3);border-radius:var(--radius-sm);
                border:1px solid ${badge ? 'var(--border2)' : 'var(--border)'};
                cursor:${link?'pointer':'default'}"
                ${link ? `onclick="window.open('${link}','_blank')"` : ''}>
              <div style="display:flex;align-items:center;gap:6px">
                <span style="font-size:12px;font-weight:500;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                      title="${d.report_nm}">${d.corp_name}</span>
                ${link ? `<a href="${link}" target="_blank"
                    style="font-size:10px;color:var(--tg);flex-shrink:0;text-decoration:none"
                    onclick="event.stopPropagation()" title="${d.report_nm}">DART↗</a>` : ''}
              </div>
              ${badge ? `<div style="display:flex;gap:6px;flex-wrap:wrap">${badge}</div>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>`;
  }).join('');

  el.innerHTML = `
    ${catHTML}
    <div style="padding:4px 1rem 10px;font-size:11px;color:var(--text3)">
      총 ${all.length}건 표시
      ${filteredCount > 0 ? `<span style="margin-left:6px">(시총 1000억 미만 ${filteredCount}건 제외)</span>` : ''}
    </div>`;
}

// ── 오늘 실적 공시 목록 ──
async function loadTodayDisclosures() {
  const el     = document.getElementById('inv-disclosure-list');
  const dateEl = document.getElementById('inv-disclosure-date');
  if (!el) return;

  // 날짜는 항상 오늘 날짜로 표시 (DB description 의존 제거)
  if (dateEl) {
    const _d = new Date();
    const today = `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`;
    dateEl.textContent = today + ' 기준';
  }

  const { data: cfg } = await sb.from('app_config')
    .select('value,description')
    .eq('key', 'today_earnings_corps')
    .single();

  if (!cfg?.value) {
    el.innerHTML = `<div style="padding:1.25rem;text-align:center;color:var(--text3);font-size:12px">
      오늘 공시 데이터 없음 (매일 18:30 업데이트)
    </div>`;
    return;
  }

  let corps = [];
  try { corps = JSON.parse(cfg.value); } catch { }

  if (!corps.length) {
    el.innerHTML = `<div style="padding:1.25rem;text-align:center;color:var(--text3);font-size:12px">오늘 실적 공시 없음</div>`;
    return;
  }

  // 보고서 종류별 배지 색상
  const reprtColor = (nm, isAmended) => {
    const base = nm.includes('사업보고서') ? { bg:'rgba(42,171,238,.15)',  color:'#2AABEE', label:'연간' }
                : nm.includes('반기')      ? { bg:'rgba(45,206,137,.15)',  color:'#2dce89', label:'반기' }
                : nm.includes('분기')      ? { bg:'rgba(251,99,64,.15)',   color:'#fb6340', label:'분기' }
                :                            { bg:'rgba(139,144,167,.15)', color:'#8b90a7', label:'공시' };
    if (isAmended) {
      return { ...base, label: base.label + '(정정)', bg:'rgba(253,203,110,.15)', color:'#f59e0b' };
    }
    return base;
  };

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;padding:.75rem 1rem">
      ${corps.map(c => {
        const badge = reprtColor(c.report_nm || '', c.is_amended);
        return `<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg3);border-radius:var(--radius-sm);border:1px solid ${c.is_amended ? 'rgba(245,158,11,.3)' : 'var(--border)'}">
          <span style="font-size:10px;padding:2px 6px;border-radius:100px;background:${badge.bg};color:${badge.color};font-weight:600;white-space:nowrap">${badge.label}</span>
          <span style="font-size:13px;font-weight:500;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.corp_name}</span>
        </div>`;
      }).join('')}
    </div>
    <div style="padding:4px 1rem 8px;font-size:11px;color:var(--text3)">
      총 ${corps.length}개 종목 공시 · 재무 데이터 수집 완료
    </div>`;
}

