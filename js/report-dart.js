// 기업 분석 리포트 — DART 분석 탭 (lazy 로드·MD 딥파싱·사업섹션 파서·아코디언·업로드) (report.js에서 분할)

// ── DART 탭: lazy fetch + 펀드매니저 리포트 렌더 ─────────────────────────────
async function _rpLoadAndRenderDart(body) {
  if (!_rpStock) return;

  const { data, error } = await sb.from('dart_reports')
    .select('report_type,receive_date,raw_md,summary')
    .eq('stock_code', _rpStock.code)
    .order('receive_date', { ascending: false })
    .limit(1).maybeSingle();

  if (error || !data) {
    body.innerHTML = `
      <div style="padding:32px;text-align:center;color:var(--text2);font-size:calc(13px*var(--m-body))">
        <div style="margin-bottom:12px;font-size:calc(28px*var(--m-title))">📄</div>
        <div style="font-weight:600;margin-bottom:6px;font-size:calc(15px*var(--m-title))">DART 분석 리포트 없음</div>
        <div style="font-size:calc(12px*var(--m-sub));margin-bottom:16px">사업보고서 분석 MD 파일을 업로드하면 여기에 표시됩니다</div>
        <button onclick="document.getElementById('rp-dart-file').click()"
          style="padding:8px 18px;border:1px solid var(--tg);border-radius:var(--radius-sm);
            background:none;color:var(--tg);font-size:calc(13px*var(--m-body));cursor:pointer">DART 업로드</button>
      </div>`;
    return;
  }

  const s   = data.summary || {};
  const dp  = _mdDeepParse(data.raw_md || '');
  const pts  = s.investment_points || [];
  const risks = s.risk_points || [];
  const watch = _rpData.watch;

  // ── 헬퍼 ──
  const esc = escapeHtml;
  const kv  = (k, v, c) => v ? `
    <div style="padding:10px 14px;background:var(--bg3);border-radius:var(--radius-sm);
      border:1px solid var(--border);min-width:0">
      <div style="font-size:calc(12px*var(--m-sub));color:var(--text1);margin-bottom:3px;white-space:nowrap">${k}</div>
      <div style="font-size:calc(13px*var(--m-body));font-weight:700;color:${c||'var(--text1)'}; word-break:break-all">${esc(v)}</div>
    </div>` : '';
  const sectionTitle = t => typeof _rpSecT === 'function' ? _rpSecT(t) : `
    <div style="font-size:calc(11px*var(--m-label));font-weight:700;text-transform:uppercase;letter-spacing:.8px;
      color:var(--text2);margin-bottom:10px">${t}</div>`;
  const bullet = (text, color) => `
    <div style="display:flex;align-items:flex-start;gap:8px;padding:7px 10px;margin-bottom:4px;
      background:${color}08;border-radius:var(--radius-sm);border-left:2px solid ${color}50">
      <span style="font-size:calc(13px*var(--m-body));color:var(--text1);line-height:1.6">${esc(text)}</span>
    </div>`;

  body.innerHTML = `
  <div style="display:flex;flex-direction:column;gap:18px">

  <!-- ① 리포트 헤더 ─────────────────────────────── -->
  <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px;
    padding-bottom:14px;border-bottom:2px solid color-mix(in srgb, var(--tg) 25%, transparent)">
    <div>
      <div style="font-size:calc(20px*var(--m-title));font-weight:800;color:var(--text1)">${esc(dp.stockName || _rpStock?.name || '')}</div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap">
        <span style="font-size:calc(12px*var(--m-sub));color:var(--text2)">${esc(dp.stockCode || _rpStock?.code || '')}</span>
        <span style="font-size:calc(12px*var(--m-sub));padding:2px 9px;border-radius:100px;
          background:color-mix(in srgb, var(--tg) 12%, transparent);color:var(--tg);font-weight:600">${esc(data.report_type||'')}</span>
        <span style="font-size:calc(12px*var(--m-sub));color:var(--text2)">접수 ${esc(data.receive_date||'')}</span>
        ${dp.listedDate ? `<span style="font-size:calc(12px*var(--m-sub));color:var(--text2)">상장 ${esc(dp.listedDate)}</span>` : ''}
      </div>
    </div>
    <button onclick="document.getElementById('rp-dart-file').click()"
      style="padding:5px 12px;font-size:calc(11px*var(--m-label));border:1px solid var(--border);
        border-radius:var(--radius-sm);background:var(--bg3);color:var(--text2);cursor:pointer;white-space:nowrap">
      최신 업로드
    </button>
  </div>

  <!-- ② 핵심 지표 대시보드 ──────────────────────── -->
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px">
    ${kv('주식 희석률',
      s.dilution_ratio != null ? s.dilution_ratio.toFixed(2)+'%' : null,
      (s.dilution_ratio||0) > 5 ? 'var(--red)' : '#4ade80')}
    ${kv('보호예수 비율', s.lockup_ratio ? s.lockup_ratio.toFixed(1)+'%' : null)}
    ${kv('보호예수 해제일', s.lockup_end)}
    ${kv('최대주주+특관 지분',
      s.related_party_ratio ? s.related_party_ratio.toFixed(1)+'%' : null,
      (s.related_party_ratio||0) >= 30 ? '#4ade80' : 'var(--red)')}
    ${kv('최대주주', dp.majorShareholder)}
    ${kv('계열사', dp.subsidiaries?.length ? dp.subsidiaries.length+'개사' : null)}
  </div>

  <!-- ③ 투자 포인트 | 리스크 ────────────────────── -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
    <div style="background:var(--bg2);border:1px solid #4ade8030;border-radius:var(--radius-sm);padding:14px">
      ${sectionTitle('핵심 투자 포인트')}
      ${pts.length
        ? pts.map(t => bullet(t,'#4ade80')).join('')
        : `<div style="font-size:calc(12px*var(--m-sub));color:var(--text2);padding:8px">투자판단 항목 없음</div>`}
    </div>
    <div style="background:var(--bg2);border:1px solid #f8717130;border-radius:var(--radius-sm);padding:14px">
      ${sectionTitle('주요 리스크')}
      ${risks.length
        ? risks.map(t => bullet(t,'#f87171')).join('')
        : `<div style="font-size:calc(12px*var(--m-sub));color:var(--text2);padding:8px">리스크 항목 없음</div>`}
    </div>
  </div>

  <!-- ④ 기업 개요 | 주주 구조 ─────────────────── -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">

    <!-- 기업 개요 -->
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px">
      ${sectionTitle('기업 개요')}
      <div style="display:flex;flex-direction:column;gap:6px">
        ${dp.mainBusiness ? `
          <div style="font-size:calc(12px*var(--m-sub));color:var(--text1);line-height:1.6;padding:8px;
            background:var(--bg3);border-radius:var(--radius-sm)">${esc(dp.mainBusiness)}</div>` : ''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:4px">
          ${dp.established ? `<div style="font-size:calc(12px*var(--m-sub));color:var(--text1)">설립 <span style="color:var(--text1);font-weight:600">${esc(dp.established)}</span></div>` : ''}
          ${dp.listedDate  ? `<div style="font-size:calc(12px*var(--m-sub));color:var(--text1)">상장 <span style="color:var(--text1);font-weight:600">${esc(dp.listedDate)}</span></div>` : ''}
          ${dp.location    ? `<div style="font-size:calc(12px*var(--m-sub));color:var(--text1);grid-column:1/-1">소재 <span style="color:var(--text1)">${esc(dp.location)}</span></div>` : ''}
        </div>
      </div>
    </div>

    <!-- 주주 구조 -->
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px">
      ${sectionTitle('주주 구조')}
      <div style="display:flex;flex-direction:column;gap:6px">
        ${dp.majorShareholder ? `
          <div style="display:flex;justify-content:space-between;align-items:center;
            padding:7px 10px;background:var(--bg3);border-radius:var(--radius-sm)">
            <div>
              <div style="font-size:calc(13px*var(--m-body));font-weight:700;color:var(--text1)">${esc(dp.majorShareholder)}</div>
              <div style="font-size:calc(12px*var(--m-sub));color:var(--text1)">최대주주</div>
            </div>
            ${dp.majorShareholderRatio ? `<div style="font-size:calc(16px*var(--m-title));font-weight:800;color:var(--tg)">${esc(dp.majorShareholderRatio)}</div>` : ''}
          </div>` : ''}
        ${s.related_party_ratio ? `
          <div style="display:flex;justify-content:space-between;padding:6px 10px;
            font-size:calc(12px*var(--m-sub));color:var(--text1)">
            <span>최대주주+특수관계인</span>
            <span style="font-weight:700;color:var(--text1)">${s.related_party_ratio.toFixed(1)}%</span>
          </div>` : ''}
        ${s.lockup_ratio ? `
          <div style="display:flex;justify-content:space-between;padding:6px 10px;
            font-size:calc(12px*var(--m-sub));color:var(--text1)">
            <span>보호예수 (해제 ${esc(s.lockup_end||'-')})</span>
            <span style="font-weight:700;color:var(--text1)">${s.lockup_ratio.toFixed(1)}%</span>
          </div>` : ''}
        ${dp.majorShareholder ? `
          <!-- 지분율 바 -->
          ${(() => {
            const total = Math.min(s.related_party_ratio||0, 100);
            return `<div style="margin-top:4px">
              <div style="height:6px;border-radius:3px;background:var(--border);position:relative;overflow:hidden">
                <div style="position:absolute;left:0;top:0;height:100%;width:${total}%;
                  background:linear-gradient(90deg,var(--tg),color-mix(in srgb, var(--tg) 50%, transparent));border-radius:3px"></div>
              </div>
              <div style="display:flex;justify-content:space-between;margin-top:3px;font-size:calc(12px*var(--m-sub));color:var(--text1)">
                <span>0%</span><span style="color:var(--tg);font-weight:600">${total.toFixed(1)}%</span><span>100%</span>
              </div>
            </div>`;
          })()}` : ''}
      </div>
    </div>
  </div>

  <!-- ⑤ 계열사 현황 ───────────────────────────── -->
  ${dp.subsidiaries?.length ? `
  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px">
    ${sectionTitle('계열사 현황')}
    ${_rpSubsContent(dp.subsidiaries, dp.subsidiarySummary)}
  </div>` : ''}

  <!-- ⑥ 섹션별 상세 분석 (아코디언) ─────────── -->
  <div>
    ${sectionTitle('섹션별 상세 분석')}
    <div style="display:flex;flex-direction:column;gap:4px">
      ${_mdToAccordion(data.raw_md||'')}
    </div>
  </div>

  </div>`;
}

// ── MD 깊은 파싱 (렌더 전용) ──────────────────────────────────────────────────
function _mdDeepParse(md) {
  const lines = md.split('\n');

  function secLines(h2keyword) {
    const si = lines.findIndex(l => l.startsWith('## ') && l.includes(h2keyword));
    if (si < 0) return [];
    const ei = lines.findIndex((l,i) => i > si && /^## /.test(l));
    return lines.slice(si+1, ei > 0 ? ei : lines.length);
  }
  function subLines(keyword, src) {
    const si = src.findIndex(l => l.startsWith('### ') && l.includes(keyword));
    if (si < 0) return [];
    const ei = src.findIndex((l,i) => i > si && /^#{2,3} /.test(l));
    return src.slice(si+1, ei > 0 ? ei : src.length);
  }
  function lv(keyword, src) {
    const l = (src||lines).find(l => new RegExp(`[-*]\\s*${keyword}[:：]`).test(l));
    return l ? l.replace(new RegExp(`.*${keyword}[:：]\\s*`), '').trim() : null;
  }

  // 문서 개요
  const stockCode = (() => {
    const l = lines.find(l => /\|\s*종목코드\s*\|/.test(l));
    return l ? l.split('|')[2]?.trim() : null;
  })();
  const stockName = (() => {
    const l = lines.find(l => /\|\s*회사명\s*\|/.test(l));
    return l ? l.split('|')[2]?.trim() : null;
  })();

  // 2-1 기본정보
  const sec2 = secLines('2. 기업정보');
  const basic = subLines('2-1', sec2);
  const mainBusinessRaw = lv('주요사업', basic);
  const mainBusiness = mainBusinessRaw?.slice(0, 120) + (mainBusinessRaw?.length > 120 ? '...' : '');

  // 2-4 계열회사 (단위: 천원) — 관계·지분율·역할·국가·매출·순손익·자본·자산·부채·검토의견
  const subSec = subLines('2-4', sec2);
  const subsidiaries = [];
  const num천 = (s, kw) => {  // "kw 1,462천원" / "kw -143,014천원" → 정수(천원 그대로), 없으면 null
    const m = (s || '').match(new RegExp(kw + '\\s*(-?[\\d,]+)\\s*천원'));
    return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
  };
  let cur = null;
  for (const l of subSec) {
    const h5 = l.match(/^##### (.+)/);
    if (h5) {
      if (cur) subsidiaries.push(cur);
      cur = { name: h5[1].trim(), relation: null, ownership: null, role: null, country: null,
        revenue: null, netIncome: null, equity: null, assets: null, liabilities: null,
        opinion: null, note: null };
      continue;
    }
    if (!cur) continue;
    const relM = l.match(/관계\/지분율[:：]\s*(.+)/);        // 종속기업 / 100%
    if (relM) { const p = relM[1].split('/').map(s => s.trim()); cur.relation = p[0] || null; cur.ownership = p[1] || null; }
    const roleM = l.match(/역할[:：]\s*(.+)/);               // 반도체장비 제조 및 판매 / 독일
    if (roleM) {
      const p = roleM[1].split('/').map(s => s.trim()).filter(Boolean);
      if (p.length >= 2) { cur.country = p[p.length - 1]; cur.role = p.slice(0, -1).join(' / '); }
      else cur.role = p[0] || null;
    }
    const rev = num천(l, '매출'); if (rev != null) cur.revenue = rev;          // "매출 -"는 null 유지
    const eq  = num천(l, '자본'); if (eq  != null) cur.equity = eq;
    const as  = num천(l, '자산'); if (as  != null) cur.assets = as;
    const li  = num천(l, '부채'); if (li  != null) cur.liabilities = li;
    const netM = l.match(/순(이익|손실)\s*(-?[\d,]+)\s*천원/);
    if (netM) cur.netIncome = parseInt(netM[2].replace(/,/g, ''), 10) * (netM[1] === '손실' ? -1 : 1);
    const opM = l.match(/검토의견[:：]\s*(.+)/); if (opM) cur.opinion = opM[1].trim();
    if (l.includes('자본잠식')) cur.note = '자본잠식';
  }
  if (cur) subsidiaries.push(cur);
  for (const s of subsidiaries) if (s.equity != null && s.equity < 0 && !s.note) s.note = '자본잠식';

  const subsidiarySummary = {
    count:        lv('계열회사 수', subSec),
    revenueSum:   lv('계열회사 매출 합계', subSec),
    lossCount:    lv('손실 계열회사', subSec),
    financeCheck: lv('재무 체크', subSec),
  };

  // 3-1 주주
  const sec3 = secLines('3. 주주');
  const sh = subLines('3-1', sec3);
  const majorRaw = lv('최대주주', sh);
  const majorShareholder   = majorRaw?.split('(')[0]?.trim() || majorRaw;
  const majorShRatioRaw    = lv('최대주주', sh)?.match(/([\d.]+)%/);
  const majorShareholderRatio = majorShRatioRaw ? majorShRatioRaw[1]+'%' : null;

  return {
    stockCode, stockName,
    mainBusiness,
    established: lv('설립일', basic),
    listedDate:  lv('상장일', basic),
    location:    lv('소재지', basic),
    subsidiaries,
    subsidiarySummary,
    majorShareholder,
    majorShareholderRatio,
  };
}

// ── 계열사 현황 상세 렌더 (2-4 파싱결과 공용 — 기업개요 탭·DART 탭) · 단위 천원 ──
function _rpSubsContent(subs, summary) {
  const esc = typeof escapeHtml === 'function' ? escapeHtml : (v => v ?? '');
  if (!subs || !subs.length) return '';
  const fmtKW = v => {  // v: 천원 → 억/만/원
    if (v == null) return '—';
    const won = v * 1000, abs = Math.abs(won), sg = won < 0 ? '-' : '';
    if (abs >= 1e12) return sg + (abs / 1e12).toFixed(1) + '조';
    if (abs >= 1e8)  return sg + (abs / 1e8).toFixed(1) + '억';
    if (abs >= 1e4)  return sg + Math.round(abs / 1e4).toLocaleString() + '만';
    if (abs === 0)   return '0';
    return sg + Math.round(abs).toLocaleString() + '원';
  };
  const relColor = r => /종속/.test(r || '') ? '#2AABEE' : /관계|공동/.test(r || '') ? '#a78bfa' : 'var(--text2)';

  // 요약 스트립
  let summaryHTML = '';
  if (summary && (summary.count || summary.revenueSum || summary.lossCount || summary.financeCheck)) {
    const chip = (label, val, col) => val ? `<span style="display:inline-flex;align-items:baseline;gap:4px">
      <span style="color:var(--text3)">${label}</span><b style="color:${col || 'var(--text1)'}">${esc(val)}</b></span>` : '';
    summaryHTML = `<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:baseline;font-size:calc(11px*var(--m-label));margin-bottom:10px;
      padding:8px 11px;background:var(--bg3);border-radius:var(--radius-sm)">
      ${chip('계열사', summary.count)}${chip('매출합계', summary.revenueSum)}${chip('손실', summary.lossCount, '#f5a623')}
      ${summary.financeCheck ? `<span style="color:#ef4444;flex-basis:100%;line-height:1.5">⚠ ${esc(summary.financeCheck)}</span>` : ''}</div>`;
  }

  // ── 단일 표 렌더 ──────────────────────────────────────────────────────────
  const th = (label, align) => `<th style="padding:7px 9px;text-align:${align || 'left'};color:var(--text2);
    font-weight:600;border-bottom:1px solid var(--border);white-space:nowrap">${label}</th>`;
  const td = (v, align, col, bold) => `<td style="padding:7px 9px;text-align:${align || 'left'};
    border-bottom:1px solid var(--border);color:${col || 'var(--text1)'};${bold ? 'font-weight:700;' : ''}
    font-variant-numeric:tabular-nums">${v}</td>`;
  const COLS = 11;

  const rows = subs.map(s => {
    const insolvent = (s.note && s.note.includes('자본잠식')) || (s.equity != null && s.equity < 0);
    const isLoss = s.netIncome != null && s.netIncome < 0;
    const rc = relColor(s.relation);
    const badge = insolvent
      ? `<span style="font-size:calc(10px*var(--m-label));padding:1px 7px;border-radius:100px;background:#ef444420;color:#ef4444;font-weight:700">자본잠식</span>`
      : isLoss
      ? `<span style="font-size:calc(10px*var(--m-label));padding:1px 7px;border-radius:100px;background:#f5a62320;color:#f5a623;font-weight:700">순손실</span>`
      : `<span style="font-size:calc(10px*var(--m-label));padding:1px 7px;border-radius:100px;background:#4ade8020;color:#4ade80;font-weight:700">정상</span>`;
    const debtRatio = (s.equity != null && s.equity > 0 && s.liabilities != null) ? (s.liabilities / s.equity * 100) : null;
    const rowBg = insolvent ? 'background:#ef44440a' : '';
    return `<tr style="${rowBg}">
      ${td(esc(s.name), 'left', 'var(--text1)', true)}
      ${td(s.relation ? `<span style="font-size:calc(10px*var(--m-label));padding:1px 6px;border-radius:100px;background:${rc}1f;color:${rc};font-weight:600">${esc(s.relation)}</span>` : '—', 'left')}
      ${td(s.ownership ? esc(s.ownership) : '—', 'right')}
      ${td(s.country ? esc(s.country) : '—', 'center', 'var(--text2)')}
      ${td(s.role ? esc(s.role) : '—', 'left', 'var(--text2)')}
      ${td(s.revenue != null ? fmtKW(s.revenue) : '—', 'right')}
      ${td(s.netIncome != null ? fmtKW(s.netIncome) : '—', 'right', s.netIncome == null ? 'var(--text3)' : isLoss ? 'var(--blue)' : 'var(--red)', true)}
      ${td(s.equity != null ? fmtKW(s.equity) : '—', 'right', s.equity != null && s.equity < 0 ? '#ef4444' : 'var(--text1)')}
      ${td(s.assets != null ? fmtKW(s.assets) : '—', 'right', 'var(--text2)')}
      ${td(s.liabilities != null ? fmtKW(s.liabilities) : '—', 'right', 'var(--text2)')}
      ${td(debtRatio != null ? Math.round(debtRatio).toLocaleString() + '%' : '—', 'right', debtRatio != null && debtRatio > 200 ? '#f5a623' : 'var(--text1)')}
      ${td(badge, 'center')}
    </tr>${s.opinion ? `<tr style="${rowBg}"><td colspan="${COLS + 1}" style="padding:2px 9px 9px;border-bottom:1px solid var(--border);
      font-size:calc(11px*var(--m-label));color:var(--text3);line-height:1.55;white-space:normal">
      <span style="color:var(--text2)">검토의견</span> · ${esc(s.opinion)}</td></tr>` : ''}`;
  }).join('');

  return summaryHTML + `<div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:calc(12px*var(--m-sub));white-space:nowrap">
      <thead><tr style="background:var(--bg3)">
        ${th('계열사')}${th('관계')}${th('지분', 'right')}${th('국가', 'center')}${th('역할')}
        ${th('매출', 'right')}${th('순손익', 'right')}${th('자본', 'right')}${th('자산', 'right')}${th('부채', 'right')}${th('부채비율', 'right')}${th('상태', 'center')}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

// ── 사업 섹션 파서 (4-1 ~ 4-5) ───────────────────────────────────────────────
function _rpParseBusinessSections(md, stockCode) {
  const lines = md.split('\n');

  // "25.1Q" → {bsns_year:2025, quarter:'Q1'}
  const parsePeriod = s => {
    const m = s.trim().match(/^(\d{2})\.(\d)Q$/);
    return m ? { bsns_year: 2000 + parseInt(m[1]), quarter: 'Q' + m[2] } : null;
  };

  // "3,596 (42%)" → {amount:3596, ratio:42.00} / "3,596" → {amount:3596, ratio:null}
  const parseAmtRatio = s => {
    const str = (s||'').trim();
    if (!str || str === '-') return { amount: null, ratio: null };
    const rm = str.match(/\((\d+\.?\d*)%\)/);
    const ratio = rm ? parseFloat(rm[1]) : null;
    const n = parseInt(str.replace(/\(.*?\)/,'').replace(/,/g,'').replace(/-/g,'').trim());
    const neg = /^-/.test(str.replace(/\(.*?\)/,'').trim());
    const amount = isNaN(n) ? null : (neg ? -n : n);
    return { amount, ratio };
  };

  // "8,222,688" or "27%" or "-" → {value, isPct}
  const parseNumOrPct = s => {
    const str = (s||'').trim();
    if (!str || str === '-') return { value: null, isPct: false };
    const pm = str.match(/^(\d+\.?\d*)%$/);
    if (pm) return { value: parseFloat(pm[1]), isPct: true };
    const n = parseInt(str.replace(/,/g,''));
    return { value: isNaN(n) ? null : n, isPct: false };
  };

  // 특정 h3 섹션의 테이블 행 추출
  const getSectionTable = h3 => {
    const si = lines.findIndex(l => l.startsWith('### ') && l.includes(h3));
    if (si < 0) return [];
    const ei = lines.findIndex((l,i) => i > si && /^#{2,3} /.test(l));
    return lines.slice(si, ei > 0 ? ei : lines.length)
      .filter(l => /^\|/.test(l) && !/^\|[-:\s|]+$/.test(l));
  };

  // 키워드(소제목) 다음의 '첫 번째 연속 표'만 추출 — 한 섹션에 표 여러 개일 때 분리용
  const firstTableAfter = kw => {
    let i = lines.findIndex(l => l.includes(kw));
    if (i < 0) return [];
    while (i < lines.length && !/^\s*\|/.test(lines[i])) i++;
    const tbl = [];
    while (i < lines.length && /^\s*\|/.test(lines[i])) {
      const t = lines[i].trim();
      if (!/^\|[-:\s|]+$/.test(t)) tbl.push(t);
      i++;
    }
    return tbl;
  };

  const parseRow = r => r.split('|').slice(1,-1).map(c => c.trim());

  const result = { segmentRevenue: [], rawMaterial: [], production: [], orderBacklog: [] };

  // ── 4-1. 매출(제품별) ─ 차원 컬럼(사업부문·품목) 자동 감지 ──────────────────
  // 헤더에서 기간("25.1Q") 컬럼이 처음 나오는 위치 이전까지를 차원 컬럼으로 본다.
  //   "| 사업부문 | 품목 | 23.1Q | ... |" → 차원 2개(category=사업부문, subcategory=품목)
  //   "| 구분 | 25.1Q | ... |"           → 차원 1개(category=구분)
  const t41 = getSectionTable('4-1');
  if (t41.length >= 2) {
    const header = parseRow(t41[0]);
    let dimN = header.findIndex(h => parsePeriod(h));  // 첫 기간 컬럼 위치
    if (dimN < 1) dimN = 1;                             // 기간 미인식 시 차원 1개로 폴백
    const periods = header.slice(dimN).map(parsePeriod);
    for (const row of t41.slice(1)) {
      const cols = parseRow(row);
      const category    = (cols[0] || '').trim();
      const subcategory = dimN >= 2 ? (cols[1] || '').trim() : '';
      if (!category || category === '합계' || subcategory === '합계') continue;
      cols.slice(dimN).forEach((v, pi) => {
        if (!periods[pi]) return;
        const { amount, ratio } = parseAmtRatio(v);
        if (amount == null) return;
        result.segmentRevenue.push({
          stock_code: stockCode, ...periods[pi],
          segment_type: 'product', category, subcategory,
          revenue: amount, revenue_ratio: ratio,
        });
      });
    }
  }

  // ── 4-2. 매출(국내/해외) ─────────────────────────────────────────────────
  const t42 = getSectionTable('4-2');
  if (t42.length >= 2) {
    const periods = parseRow(t42[0]).slice(2).map(parsePeriod);
    for (const row of t42.slice(1)) {
      const cols = parseRow(row);
      const category = cols[0], sub = cols[1];
      if (!category || category === '합계' || sub === '합계') continue;
      cols.slice(2).forEach((v, pi) => {
        if (!periods[pi]) return;
        const str = v.replace(/,/g,'').trim();
        if (!str || str === '-') return;
        const n = parseInt(str);
        if (isNaN(n)) return;
        result.segmentRevenue.push({
          stock_code: stockCode, ...periods[pi],
          segment_type: 'region', category, subcategory: sub||'',
          revenue: n, revenue_ratio: null,
        });
      });
    }
  }

  // ── 4-3. 원재료 ──────────────────────────────────────────────────────────
  const t43 = getSectionTable('4-3');
  if (t43.length >= 2) {
    const periods = parseRow(t43[0]).slice(2).map(parsePeriod);
    for (const row of t43.slice(1)) {
      const cols = parseRow(row);
      const pname = cols[0], mname = cols[1];
      if (!mname || pname === '합계') continue;
      cols.slice(2).forEach((v, pi) => {
        if (!periods[pi]) return;
        const n = parseInt(v.replace(/,/g,'').trim());
        if (isNaN(n)) return;
        result.rawMaterial.push({
          stock_code: stockCode, ...periods[pi],
          data_type: 'usage', product_name: pname||'', material_name: mname,
          origin: '', amount: n,
        });
      });
    }
  }

  // ── 4-4. 원재료 가격변동추이 ─────────────────────────────────────────────
  const t44 = getSectionTable('4-4');
  if (t44.length >= 2) {
    const periods = parseRow(t44[0]).slice(2).map(parsePeriod);
    for (const row of t44.slice(1)) {
      const cols = parseRow(row);
      const mname = cols[0], origin = cols[1];
      if (!mname) continue;
      cols.slice(2).forEach((v, pi) => {
        if (!periods[pi]) return;
        const n = parseInt(v.replace(/,/g,'').trim());
        if (isNaN(n)) return;
        result.rawMaterial.push({
          stock_code: stockCode, ...periods[pi],
          data_type: 'price', product_name: '', material_name: mname,
          origin: origin||'', amount: n,
        });
      });
    }
  }

  // ── 4-5. 생산능력·생산실적·가동률 ─────────────────────────────────────────
  //  신형: "생산능력 추이"(품목|기간, 대) · "생산실적 추이"(품목|기간) · "가동률 추이"(항목|기간)
  //  구형: "공장/지표 | 기간" 단일표
  {
    const prodMap = {};
    const put = (name, p, field, val) => {
      if (val == null) return;
      const key = `${p.bsns_year}_${p.quarter}_${name}`;
      (prodMap[key] ||= { stock_code: stockCode, bsns_year: p.bsns_year, quarter: p.quarter,
        factory_name: name, capacity: null, actual: null, utilization_rate: null });
      prodMap[key][field] = val;
    };
    const numOnly = v => { const s = (v || '').replace(/,/g, '').replace(/[^\d.\-]/g, '').trim();
      const n = parseFloat(s); return s === '' || isNaN(n) ? null : Math.round(n); };
    const pctOnly = v => { const m = (v || '').match(/(-?[\d.]+)\s*%/); return m ? parseFloat(m[1]) : null; };
    const byItem = (tbl, field, parse) => {
      if (tbl.length < 2) return;
      const h = parseRow(tbl[0]); let d = h.findIndex(x => parsePeriod(x)); if (d < 1) d = 1;
      const P = h.slice(d).map(parsePeriod);
      for (const row of tbl.slice(1)) {
        const cols = parseRow(row); const name = (cols[0] || '').trim();
        if (!name || name === '합계') continue;
        cols.slice(d).forEach((v, pi) => { if (P[pi]) put(name, P[pi], field, parse(v)); });
      }
    };
    const tCap = firstTableAfter('생산능력 추이');
    const tAct = firstTableAfter('생산실적 추이');
    const tUtil = firstTableAfter('가동률 추이');
    if (tCap.length || tAct.length || tUtil.length) {
      byItem(tCap, 'capacity', numOnly);
      byItem(tAct, 'actual', numOnly);
      if (tUtil.length >= 2) {  // '평균가동률' 행만 utilization_rate로
        const h = parseRow(tUtil[0]); let d = h.findIndex(x => parsePeriod(x)); if (d < 1) d = 1;
        const P = h.slice(d).map(parsePeriod);
        const urow = tUtil.slice(1).find(row => /가동률/.test(parseRow(row)[0] || ''));
        if (urow) parseRow(urow).slice(d).forEach((v, pi) => { if (P[pi]) put('평균가동률', P[pi], 'utilization_rate', pctOnly(v)); });
      }
    } else {
      const t45 = getSectionTable('4-5');
      if (t45.length >= 2) {
        const P = parseRow(t45[0]).slice(1).map(parsePeriod);
        const mm = { '생산능력': 'capacity', '생산실적': 'actual', '가동률': 'utilization_rate' };
        for (const row of t45.slice(1)) {
          const cols = parseRow(row);
          const [factory, metricKr] = (cols[0] || '').split('/').map(s => s.trim());
          const field = mm[metricKr];
          if (!factory || !field) continue;
          cols.slice(1).forEach((v, pi) => { if (!P[pi]) return; const { value } = parseNumOrPct(v); put(factory, P[pi], field, value); });
        }
      }
    }
    result.production = Object.values(prodMap).filter(r =>
      r.capacity != null || r.actual != null || r.utilization_rate != null);
  }

  // ── 4-6. 수주현황 — "수주잔고 추이"(품목 | 기간…) 표만 파싱 ─────────────────────
  // 같은 4-6 섹션의 스냅샷(수주총액/기납품액…)·판매계약 표가 섞이지 않도록 소제목 기준 첫 표만.
  // 잔고는 기말 잔액(stock). 매출처럼 합산하지 않음. segment_type='backlog'로 저장.
  const t46 = firstTableAfter('수주잔고 추이');
  if (t46.length >= 2) {
    const header = parseRow(t46[0]);
    let dimN = header.findIndex(h => parsePeriod(h));
    const periods = dimN >= 1 ? header.slice(dimN).map(parsePeriod) : [];
    // 기간 컬럼이 실제로 있을 때만(= 수주잔고 추이 표).
    if (periods.some(Boolean)) {
      for (const row of t46.slice(1)) {
        const cols = parseRow(row);
        const category = (cols[0] || '').trim();
        if (!category || category === '합계') continue;
        cols.slice(dimN).forEach((v, pi) => {
          if (!periods[pi]) return;
          const n = parseInt((v || '').replace(/,/g, '').trim(), 10);
          if (isNaN(n)) return;
          result.orderBacklog.push({
            stock_code: stockCode, ...periods[pi],
            segment_type: 'backlog', category, subcategory: '',
            revenue: n, revenue_ratio: null,
          });
        });
      }
    }
  }

  return result;
}

// ── 금액 포맷 (억/조) ─────────────────────────────────────────────────────────
function _fmtBillions(won) {
  if (won == null) return '—';
  const abs = Math.abs(won);
  const sign = won < 0 ? '-' : '';
  if (abs >= 1e12) return sign + (abs/1e12).toFixed(1) + '조';
  if (abs >= 1e8)  return sign + (abs/1e8).toFixed(1) + '억';
  if (abs >= 1e4)  return sign + Math.round(abs/1e4) + '만';
  return sign + abs.toLocaleString('ko-KR');
}

// ── MD → 아코디언 섹션 HTML ───────────────────────────────────────────────────
function _mdToAccordion(md) {
  const lines = md.split('\n');
  const esc  = escapeHtml;
  const inl  = s => esc(s)
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/`(.+?)`/g,'<code style="background:var(--bg3);padding:1px 4px;border-radius:3px;font-size:calc(11px*var(--m-label))">$1</code>');
  const keyword = t => {
    if (/^투자판단[:：]/.test(t)) return `<span style="color:#4ade80;font-weight:600">${inl(t)}</span>`;
    if (/^리스크[:：]/.test(t))   return `<span style="color:#f87171;font-weight:600">${inl(t)}</span>`;
    if (/^검토의견[:：]/.test(t)) return `<span style="color:#60a5fa;font-weight:600">${inl(t)}</span>`;
    if (/^중요도[:：]/.test(t))   return `<span style="color:#f59e0b;font-weight:600">${inl(t)}</span>`;
    return inl(t);
  };

  let html = '', i = 0, secOpen = false, secN = 0;

  const parseTable = tableLines => {
    const rows = tableLines.filter(l => !/^\|[-:\s|]+$/.test(l));
    if (!rows.length) return '';
    const cols = r => r.split('|').slice(1,-1).map(c => c.trim());
    const hdr = cols(rows[0]);
    return `<div style="overflow-x:auto;margin:4px 0">
      <table style="width:100%;border-collapse:collapse;font-size:calc(12px*var(--m-sub))">
        <thead><tr style="background:var(--bg2)">
          ${hdr.map(h=>`<th style="padding:5px 8px;text-align:left;font-weight:600;color:var(--text1);
            border-bottom:1px solid var(--border);white-space:nowrap">${inl(h)}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${rows.slice(1).map((r,ri)=>`<tr style="background:${ri%2?'var(--bg3)':''}">
            ${cols(r).map(c=>`<td style="padding:4px 8px;color:var(--text1);
              border-bottom:1px solid var(--border);line-height:1.5;font-size:calc(12px*var(--m-sub))">${inl(c)}</td>`).join('')}
          </tr>`).join('')}
        </tbody>
      </table></div>`;
  };

  while (i < lines.length) {
    const line = lines[i].trimEnd();

    if (/^# /.test(line)) { i++; continue; }

    if (/^## /.test(line)) {
      if (secOpen) html += '</div></div>';
      secN++;
      const title = line.replace(/^## /,'').trim();
      const sid = `dac-${secN}`;
      // 1번 섹션(문서 개요)은 기본 닫힘, 나머지는 기본 닫힘
      html += `
        <div style="border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden">
          <div onclick="(function(b,a){b.style.display=b.style.display==='none'?'flex':'none';
              a.style.transform=b.style.display==='none'?'rotate(0)':'rotate(90deg)'})(
              document.getElementById('${sid}'),this.querySelector('span'))"
            style="padding:9px 14px;background:var(--bg2);cursor:pointer;display:flex;
              align-items:center;gap:8px;font-size:calc(13px*var(--m-body));font-weight:700;color:var(--text1);user-select:none">
            <span style="font-size:calc(11px*var(--m-label));color:var(--text2);transition:transform .15s">▶</span>
            ${esc(title)}
          </div>
          <div id="${sid}" style="display:none;padding:12px 14px;flex-direction:column;gap:6px">`;
      secOpen = true;
      i++; continue;
    }

    if (/^### /.test(line)) {
      html += `<div style="font-size:calc(12px*var(--m-sub));font-weight:700;color:var(--tg);margin-top:10px;margin-bottom:4px;
        padding-bottom:3px;border-bottom:1px solid var(--border2)">${esc(line.replace(/^### /,'').trim())}</div>`;
      i++; continue;
    }
    if (/^#### /.test(line)) {
      html += `<div style="font-size:calc(12px*var(--m-sub));font-weight:700;color:var(--text1);margin-top:6px">${esc(line.replace(/^#### /,'').trim())}</div>`;
      i++; continue;
    }
    if (/^##### /.test(line)) {
      html += `<div style="font-size:calc(11px*var(--m-label));font-weight:600;color:var(--text2);margin-top:4px">${esc(line.replace(/^##### /,'').trim())}</div>`;
      i++; continue;
    }
    if (/^---+$/.test(line.trim())) { i++; continue; }

    if (/^\|/.test(line)) {
      const tbl = [];
      while (i < lines.length && /^\|/.test(lines[i].trimEnd())) { tbl.push(lines[i].trimEnd()); i++; }
      html += parseTable(tbl);
      continue;
    }

    if (/^[-*] /.test(line)) {
      const t = line.replace(/^[-*] /,'').trim();
      html += `<div style="display:flex;align-items:flex-start;gap:6px;padding:1px 0">
        <span style="color:var(--text2);font-size:calc(11px*var(--m-label));margin-top:5px;flex-shrink:0">◦</span>
        <span style="font-size:calc(12px*var(--m-sub));color:var(--text1);line-height:1.6">${keyword(t)}</span>
      </div>`;
      i++; continue;
    }

    if (!line.trim()) { i++; continue; }
    html += `<div style="font-size:calc(12px*var(--m-sub));color:var(--text1);line-height:1.6">${inl(line.trim())}</div>`;
    i++;
  }

  if (secOpen) html += '</div></div>';
  return html;
}

// ── DART MD 파서 ─────────────────────────────────────────────────────────────
function _rpParseMd(text) {
  const lines = text.split('\n');

  function tableVal(sectionKeyword, key) {
    const si = lines.findIndex(l => l.includes(sectionKeyword));
    if (si < 0) return null;
    for (let i = si; i < Math.min(si + 40, lines.length); i++) {
      const m = lines[i].match(/\|\s*(.+?)\s*\|\s*(.+?)\s*\|/);
      if (m && m[1].trim() === key) return m[2].trim();
    }
    return null;
  }

  function lineVal(keyword) {
    const l = lines.find(l => l.match(new RegExp(`[-*]\\s*${keyword}[:：]`)));
    return l ? l.replace(new RegExp(`.*${keyword}[:：]\\s*`), '').trim() : null;
  }

  function allTagged(tag) {
    return lines
      .filter(l => l.match(new RegExp(`^[-*]\\s*${tag}[:：]`)))
      .map(l => l.replace(new RegExp(`^[-*]\\s*${tag}[:：]\\s*`), '').trim())
      .filter(Boolean);
  }

  const stockCode  = tableVal('문서 개요', '종목코드') || '';
  const stockName  = tableVal('문서 개요', '회사명') || '';
  const reportType = tableVal('문서 개요', '원문 기준') || '';
  const receiveDate = tableVal('문서 개요', '접수일') || '';

  const dilutionRatioRaw = lineVal('전체 잠재 물량');
  const dilutionRatio = dilutionRatioRaw ? parseFloat(dilutionRatioRaw.match(/([\d.]+)%/)?.[1] ?? '0') : 0;

  const lockupRaw = lineVal('보호예수 물량');
  const lockupRatio = lockupRaw ? parseFloat(lockupRaw.match(/([\d.]+)%/)?.[1] ?? '0') : 0;
  const lockupEnd = lineVal('주요 반환예정일');

  const majorRaw = lineVal('최대주주 및 특수관계인 지분');
  const relatedPartyRatio = majorRaw ? parseFloat(majorRaw.match(/([\d.]+)%/)?.[1] ?? '0') : 0;

  return {
    stock_code:   stockCode,
    stock_name:   stockName,
    report_type:  reportType,
    receive_date: receiveDate,
    summary: {
      dilution_ratio:     dilutionRatio,
      lockup_ratio:       lockupRatio,
      lockup_end:         lockupEnd,
      related_party_ratio: relatedPartyRatio,
      investment_points:  allTagged('투자판단'),
      risk_points:        allTagged('리스크'),
      review_points:      allTagged('검토의견'),
    },
  };
}

// ── DART 업로드 ───────────────────────────────────────────────────────────────
async function rpUploadDart(input) {
  const file = input.files?.[0];
  if (!file) return;

  let text;
  try { text = await file.text(); } catch(e) { toast('파일 읽기 실패', 'error'); return; }

  let parsed;
  try { parsed = _rpParseMd(text); } catch(e) { toast('MD 파싱 실패: ' + e.message, 'error'); return; }

  if (!parsed.stock_code) { toast('종목코드를 파싱할 수 없습니다 (문서 개요 섹션 확인)', 'warn'); return; }

  toast('저장 중...', 'info');
  const { error } = await sb.from('dart_reports').upsert({
    stock_code:   parsed.stock_code,
    stock_name:   parsed.stock_name,
    report_type:  parsed.report_type,
    receive_date: parsed.receive_date,
    raw_md:       text,
    summary:      parsed.summary,
  }, { onConflict: 'stock_code,report_type' });

  if (error) { toast('저장 실패: ' + error.message, 'error'); return; }

  // 4-1 ~ 4-5 사업 섹션 파싱 & 저장
  try {
    const biz = _rpParseBusinessSections(text, parsed.stock_code);
    // 동일 충돌키 중복 제거 (마지막 값 우선) — Postgres 배치 upsert의 "cannot affect row a second time" 방지
    const _dedup = (arr, keys) => {
      const m = new Map();
      for (const r of arr) m.set(keys.map(k => r[k] ?? '').join(''), r);
      return [...m.values()];
    };
    // 제품/지역 매출 + 수주잔고는 같은 테이블(dart_segment_revenue), segment_type로 구분 → 한 번에 upsert
    const segRows  = _dedup([...biz.segmentRevenue, ...biz.orderBacklog],
      ['stock_code','bsns_year','quarter','segment_type','category','subcategory']);
    const rawRows  = _dedup(biz.rawMaterial,    ['stock_code','bsns_year','quarter','data_type','product_name','material_name','origin']);
    const prodRows = _dedup(biz.production,      ['stock_code','bsns_year','quarter','factory_name']);
    const saves = [];
    if (segRows.length)
      saves.push(sb.from('dart_segment_revenue').upsert(segRows,
        { onConflict: 'stock_code,bsns_year,quarter,segment_type,category,subcategory' }));
    if (rawRows.length)
      saves.push(sb.from('dart_raw_material').upsert(rawRows,
        { onConflict: 'stock_code,bsns_year,quarter,data_type,product_name,material_name,origin' }));
    if (prodRows.length)
      saves.push(sb.from('dart_production').upsert(prodRows,
        { onConflict: 'stock_code,bsns_year,quarter,factory_name' }));
    await Promise.all(saves);
    const counts = `세그먼트 ${segRows.length}건 / 원재료 ${rawRows.length}건 / 생산 ${prodRows.length}건`;
    toast(`${parsed.stock_name} DART 저장 완료 (${counts})`, 'success');
  } catch(e) {
    toast(`DART 기본 저장 완료, 사업 섹션 저장 실패: ${e.message}`, 'warn');
  }
  input.value = '';

  // 저장 후 전체 리로드 — 방금 저장한 세그먼트(제품별 매출)까지 재조회해야
  // 기업현황 탭의 '제품·사업부별 매출' 그래프에 즉시 반영된다.
  // (기존엔 dart만 갱신 → segment 미조회로 재업로드 전까지 그래프 비어 보임)
  _rpStock = { code: parsed.stock_code, name: parsed.stock_name };
  try {
    await rpLoadReport();  // price·fin·watch·dart·analyst·segment·company·summary 전부 재조회 + 렌더
  } catch (e) {
    // 데이터 로드 실패해도 DART 탭은 자체 조회로 표시 가능
  }
  setTimeout(() => rpSetTab(RP_TABS.indexOf('DART 분석')), 50);
}
