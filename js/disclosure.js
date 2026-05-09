// disclosure.js — 공시 탭: 오늘 실적 공시, 전체 공시 토글
// 의존: config.js (sb)
//
// [v2] 백엔드 _preprocess_disclosures() 전처리 결과를 그대로 사용
//   - 노이즈 필터, 상장 필터, 시총 필터, 카테고리 분류, insider 요약
//     → 모두 백엔드에서 처리 후 app_config에 저장
//   - 프론트 Supabase 쿼리: 기존 4~5회 → 1회

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

  // ── 단일 쿼리: 백엔드에서 전처리 완료된 공시 목록 ──
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

  // 카테고리 정의 (색상/스타일 — 분류 로직은 백엔드에서 완료)
  const CATEGORY_STYLE = {
    '사업보고서':    { color: '#2AABEE', bg: 'rgba(42,171,238,.12)' },
    '반기보고서':    { color: '#2dce89', bg: 'rgba(45,206,137,.12)' },
    '분기보고서':    { color: '#fb6340', bg: 'rgba(251,99,64,.12)'  },
    '기업설명회(IR)':{ color: '#22d3ee', bg: 'rgba(34,211,238,.12)' },
    '잠정실적':      { color: '#f59e0b', bg: 'rgba(245,158,11,.12)' },
    '주요사항':      { color: '#ffd600', bg: 'rgba(255,214,0,.12)'  },
    '증자/감자':     { color: '#a78bfa', bg: 'rgba(167,139,250,.12)'},
    '합병/분할':     { color: '#f87171', bg: 'rgba(248,113,113,.12)'},
    '사채/전환':     { color: '#60a5fa', bg: 'rgba(96,165,250,.12)' },
    '자사주':        { color: '#34d399', bg: 'rgba(52,211,153,.12)' },
    '배당':          { color: '#fbbf24', bg: 'rgba(251,191,36,.12)' },
    '최대주주변동':  { color: '#f97316', bg: 'rgba(249,115,22,.12)' },
    '대량보유':      { color: '#e879f9', bg: 'rgba(232,121,249,.12)'},
    '거래계획(예고)':{ color: '#67e8f9', bg: 'rgba(103,232,249,.12)'},
    '거래계획(철회)':{ color: '#94a3b8', bg: 'rgba(148,163,184,.12)'},
    '지분공시':      { color: '#a259ff', bg: 'rgba(162,89,255,.12)' },
    '임원/주식':     { color: '#c084fc', bg: 'rgba(192,132,252,.12)'},
    '감사보고서':    { color: '#94a3b8', bg: 'rgba(148,163,184,.12)'},
    '공정공시':      { color: '#00d4aa', bg: 'rgba(0,212,170,.12)'  },
    '주식매수선택권':{ color: '#a3e635', bg: 'rgba(163,230,53,.12)' },
    '주요경영사항':  { color: '#fb923c', bg: 'rgba(251,146,60,.12)' },
    '증권신고':      { color: '#64748b', bg: 'rgba(100,116,139,.12)'},
    '기타':          { color: '#8b90a7', bg: 'rgba(139,144,167,.12)'},
  };
  const CATEGORY_ORDER = Object.keys(CATEGORY_STYLE);

  // 카테고리별 그룹핑 (분류는 d.category 필드 사용)
  const categorized = {};
  CATEGORY_ORDER.forEach(c => { categorized[c] = []; });
  all.forEach(d => {
    const cat = d.category || '기타';
    if (categorized[cat]) categorized[cat].push(d);
    else categorized['기타'].push(d);
  });

  // DART 원본 링크
  const dartLink = (d) =>
    d.rcept_no ? `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${d.rcept_no}` : null;

  // insider_summary → 배지 HTML (백엔드에서 요약된 값 사용)
  const reasonBadge = (summary) => {
    if (!summary) return '';
    const { type, buy, sell, change, ratio_before, ratio_after, period } = summary;

    if (type === 'plan') {
      const parts = [];
      if (buy)  parts.push(`<span style="color:var(--red);font-size:10px;font-weight:600">▲예정취득 ${buy.toLocaleString()}주</span>`);
      if (sell) parts.push(`<span style="color:var(--blue);font-size:10px;font-weight:600">▼예정처분 ${sell.toLocaleString()}주</span>`);
      if (period) parts.push(`<span style="color:var(--text3);font-size:10px">(${period})</span>`);
      return parts.join(' ');
    }
    if (type === 'major') {
      return `<span style="color:var(--yellow);font-size:10px;font-weight:600">⚠ 최대주주 지분변동</span>`;
    }
    if (type === 'bulk') {
      const bfRt = ratio_before != null ? ratio_before.toFixed(2) + '%' : '';
      const afRt = ratio_after  != null ? ratio_after.toFixed(2)  + '%' : '';
      const rtTxt = (bfRt && afRt && bfRt !== afRt) ? `${bfRt}→${afRt}` : (afRt || bfRt || '');
      if (change > 0)  return `<span style="color:var(--red);font-size:10px;font-weight:600">▲취득 ${Math.abs(change).toLocaleString()}주${rtTxt ? ' (' + rtTxt + ')' : ''}</span>`;
      if (change < 0)  return `<span style="color:var(--blue);font-size:10px;font-weight:600">▼처분 ${Math.abs(change).toLocaleString()}주${rtTxt ? ' (' + rtTxt + ')' : ''}</span>`;
      if (rtTxt)       return `<span style="color:var(--text3);font-size:10px">보유 ${rtTxt} (변동없음)</span>`;
      return `<span style="color:var(--text3);font-size:10px">변동없음</span>`;
    }
    // insider
    const parts = [];
    if (buy)  parts.push(`<span style="color:var(--red);font-size:10px;font-weight:600">▲취득 ${buy.toLocaleString()}주</span>`);
    if (sell) parts.push(`<span style="color:var(--blue);font-size:10px;font-weight:600">▼처분 ${sell.toLocaleString()}주</span>`);
    return parts.join(' ');
  };

  // 지분공시: corp_code 기준으로 deduplicate
  const deduplicateByCorpCode = (items) => {
    const seen = {};
    return items.filter(d => {
      const key = d.corp_code || d.corp_name;
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  };

  const NEEDS_BADGE = new Set(['지분공시', '대량보유', '최대주주변동', '거래계획(예고)']);

  const catHTML = CATEGORY_ORDER.map(label => {
    const items = categorized[label];
    if (!items.length) return '';

    const style = CATEGORY_STYLE[label];
    const isInsider  = label === '지분공시';
    const needsBadge = NEEDS_BADGE.has(label);

    const displayItems = isInsider ? deduplicateByCorpCode(items) : items;

    return `
      <div style="padding:.75rem 1rem;border-bottom:1px solid var(--border)">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <span style="font-size:12px;font-weight:600;padding:2px 8px;border-radius:100px;background:${style.bg};color:${style.color}">${label}</span>
          <span style="font-size:11px;color:var(--text3)">${displayItems.length}건${isInsider && displayItems.length < items.length ? ` (${items.length}건 공시)` : ''}</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(${needsBadge ? '240' : '180'}px,1fr));gap:6px">
          ${displayItems.map(d => {
            const link    = dartLink(d);
            const summary = d.insider_summary || null;
            const badge   = needsBadge ? reasonBadge(summary) : '';

            const origCount = isInsider && d.corp_code
              ? items.filter(x => x.corp_code === d.corp_code).length : 1;
            const countBadge = isInsider && origCount > 1
              ? `<span style="display:inline-flex;align-items:center;justify-content:center;
                  min-width:18px;height:18px;padding:0 5px;border-radius:100px;
                  background:var(--tg);color:#fff;font-size:10px;font-weight:700;
                  flex-shrink:0">${origCount}</span>` : '';

            return `<div style="display:flex;flex-direction:column;gap:3px;padding:6px 10px;
                background:var(--bg3);border-radius:var(--radius-sm);
                border:1px solid ${badge ? 'var(--border2)' : 'var(--border)'};
                cursor:${link ? 'pointer' : 'default'}"
                ${link ? `onclick="window.open('${link}','_blank')"` : ''}>
              <div style="display:flex;align-items:center;gap:6px">
                <span style="font-size:12px;font-weight:500;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                      title="${d.report_nm}">${d.corp_name}</span>
                ${countBadge}
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
    </div>`;
}

// ── 오늘 실적 공시 목록 ──
async function loadTodayDisclosures() {
  const el     = document.getElementById('inv-disclosure-list');
  const dateEl = document.getElementById('inv-disclosure-date');
  if (!el) return;

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
