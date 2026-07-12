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
      <div style="padding:32px;text-align:center;color:var(--text2);font-size:13px">
        <div style="margin-bottom:12px;font-size:28px">📄</div>
        <div style="font-weight:600;margin-bottom:6px;font-size:15px">DART 분석 리포트 없음</div>
        <div style="font-size:12px;margin-bottom:16px">사업보고서 분석 MD 파일을 업로드하면 여기에 표시됩니다</div>
        <button onclick="document.getElementById('rp-dart-file').click()"
          style="padding:8px 18px;border:1px solid var(--tg);border-radius:var(--radius-sm);
            background:none;color:var(--tg);font-size:13px;cursor:pointer">DART 업로드</button>
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
      <div style="font-size:12px;color:var(--text1);margin-bottom:3px;white-space:nowrap">${k}</div>
      <div style="font-size:13px;font-weight:700;color:${c||'var(--text1)'}; word-break:break-all">${esc(v)}</div>
    </div>` : '';
  const sectionTitle = t => typeof _rpSecT === 'function' ? _rpSecT(t) : `
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;
      color:var(--text2);margin-bottom:10px">${t}</div>`;
  const bullet = (text, color) => `
    <div style="display:flex;align-items:flex-start;gap:8px;padding:7px 10px;margin-bottom:4px;
      background:${color}08;border-radius:var(--radius-sm);border-left:2px solid ${color}50">
      <span style="font-size:13px;color:var(--text1);line-height:1.6">${esc(text)}</span>
    </div>`;

  body.innerHTML = `
  <div style="display:flex;flex-direction:column;gap:18px">

  <!-- ① 리포트 헤더 ─────────────────────────────── -->
  <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px;
    padding-bottom:14px;border-bottom:2px solid var(--tg)40">
    <div>
      <div style="font-size:20px;font-weight:800;color:var(--text1)">${esc(dp.stockName || _rpStock?.name || '')}</div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap">
        <span style="font-size:12px;color:var(--text2)">${esc(dp.stockCode || _rpStock?.code || '')}</span>
        <span style="font-size:12px;padding:2px 9px;border-radius:100px;
          background:var(--tg)20;color:var(--tg);font-weight:600">${esc(data.report_type||'')}</span>
        <span style="font-size:12px;color:var(--text2)">접수 ${esc(data.receive_date||'')}</span>
        ${dp.listedDate ? `<span style="font-size:12px;color:var(--text2)">상장 ${esc(dp.listedDate)}</span>` : ''}
      </div>
    </div>
    <button onclick="document.getElementById('rp-dart-file').click()"
      style="padding:5px 12px;font-size:11px;border:1px solid var(--border);
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
        : `<div style="font-size:12px;color:var(--text2);padding:8px">투자판단 항목 없음</div>`}
    </div>
    <div style="background:var(--bg2);border:1px solid #f8717130;border-radius:var(--radius-sm);padding:14px">
      ${sectionTitle('주요 리스크')}
      ${risks.length
        ? risks.map(t => bullet(t,'#f87171')).join('')
        : `<div style="font-size:12px;color:var(--text2);padding:8px">리스크 항목 없음</div>`}
    </div>
  </div>

  <!-- ④ 기업 개요 | 주주 구조 ─────────────────── -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">

    <!-- 기업 개요 -->
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px">
      ${sectionTitle('기업 개요')}
      <div style="display:flex;flex-direction:column;gap:6px">
        ${dp.mainBusiness ? `
          <div style="font-size:12px;color:var(--text1);line-height:1.6;padding:8px;
            background:var(--bg3);border-radius:var(--radius-sm)">${esc(dp.mainBusiness)}</div>` : ''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:4px">
          ${dp.established ? `<div style="font-size:12px;color:var(--text1)">설립 <span style="color:var(--text1);font-weight:600">${esc(dp.established)}</span></div>` : ''}
          ${dp.listedDate  ? `<div style="font-size:12px;color:var(--text1)">상장 <span style="color:var(--text1);font-weight:600">${esc(dp.listedDate)}</span></div>` : ''}
          ${dp.location    ? `<div style="font-size:12px;color:var(--text1);grid-column:1/-1">소재 <span style="color:var(--text1)">${esc(dp.location)}</span></div>` : ''}
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
              <div style="font-size:13px;font-weight:700;color:var(--text1)">${esc(dp.majorShareholder)}</div>
              <div style="font-size:12px;color:var(--text1)">최대주주</div>
            </div>
            ${dp.majorShareholderRatio ? `<div style="font-size:16px;font-weight:800;color:var(--tg)">${esc(dp.majorShareholderRatio)}</div>` : ''}
          </div>` : ''}
        ${s.related_party_ratio ? `
          <div style="display:flex;justify-content:space-between;padding:6px 10px;
            font-size:12px;color:var(--text1)">
            <span>최대주주+특수관계인</span>
            <span style="font-weight:700;color:var(--text1)">${s.related_party_ratio.toFixed(1)}%</span>
          </div>` : ''}
        ${s.lockup_ratio ? `
          <div style="display:flex;justify-content:space-between;padding:6px 10px;
            font-size:12px;color:var(--text1)">
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
                  background:linear-gradient(90deg,var(--tg),var(--tg)80);border-radius:3px"></div>
              </div>
              <div style="display:flex;justify-content:space-between;margin-top:3px;font-size:12px;color:var(--text1)">
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
    <div style="display:flex;flex-direction:column;gap:6px">
      ${dp.subsidiaries.map(sub => {
        const isLoss    = sub.netIncome != null && sub.netIncome < 0;
        const isInsolvent = sub.note?.includes('자본잠식');
        const badge = isInsolvent
          ? `<span style="font-size:11px;padding:2px 6px;border-radius:100px;background:#ef444420;color:#ef4444;font-weight:700">자본잠식</span>`
          : isLoss
          ? `<span style="font-size:11px;padding:2px 6px;border-radius:100px;background:#f5a62320;color:#f5a623;font-weight:700">순손실</span>`
          : `<span style="font-size:11px;padding:2px 6px;border-radius:100px;background:#4ade8020;color:#4ade80;font-weight:700">정상</span>`;
        return `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;
          background:var(--bg3);border-radius:var(--radius-sm);flex-wrap:wrap">
          <div style="min-width:120px">
            <div style="font-size:13px;font-weight:700;color:var(--text1)">${esc(sub.name)}</div>
            ${sub.role ? `<div style="font-size:12px;color:var(--text1)">${esc(sub.role)}</div>` : ''}
          </div>
          ${badge}
          <div style="margin-left:auto;display:flex;gap:16px;font-size:12px;flex-wrap:wrap">
            ${sub.revenue    != null ? `<span style="color:var(--text2)">매출 <b style="color:var(--text1)">${_fmtBillions(sub.revenue)}</b></span>` : ''}
            ${sub.netIncome  != null ? `<span style="color:var(--text2)">순손익 <b style="color:${isLoss?'var(--blue)':'var(--red)'}">${_fmtBillions(sub.netIncome)}</b></span>` : ''}
          </div>
        </div>`;
      }).join('')}
    </div>
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

  // 2-4 계열회사
  const subSec = subLines('2-4', sec2);
  const subsidiaries = [];
  let cur = null;
  for (const l of subSec) {
    const h5 = l.match(/^##### (.+)/);
    if (h5) {
      if (cur) subsidiaries.push(cur);
      cur = { name: h5[1].trim(), role: null, revenue: null, netIncome: null, note: null };
    } else if (cur) {
      const rev = l.match(/매출\s+([\d,]+)/);   if (rev) cur.revenue   = parseInt(rev[1].replace(/,/g,''));
      const net = l.match(/순손[실익]\s*([-]?[\d,]+)/); if (net) cur.netIncome = parseInt(net[1].replace(/,/g,'')) * (l.includes('순손실') ? -1 : 1);
      const role = l.match(/역할[:：]\s*(.+?)[\s/]/); if (role) cur.role = role[1];
      if (l.includes('자본잠식')) cur.note = '자본잠식';
    }
  }
  if (cur) subsidiaries.push(cur);

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
    majorShareholder,
    majorShareholderRatio,
  };
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

  const parseRow = r => r.split('|').slice(1,-1).map(c => c.trim());

  const result = { segmentRevenue: [], rawMaterial: [], production: [] };

  // ── 4-1. 매출(제품별) ────────────────────────────────────────────────────
  const t41 = getSectionTable('4-1');
  if (t41.length >= 2) {
    const periods = parseRow(t41[0]).slice(1).map(parsePeriod);
    for (const row of t41.slice(1)) {
      const cols = parseRow(row);
      const seg = cols[0];
      if (!seg || seg === '합계') continue;
      cols.slice(1).forEach((v, pi) => {
        if (!periods[pi]) return;
        const { amount, ratio } = parseAmtRatio(v);
        if (amount == null) return;
        result.segmentRevenue.push({
          stock_code: stockCode, ...periods[pi],
          segment_type: 'product', category: seg, subcategory: '',
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

  // ── 4-5. 생산능력 및 생산실적 ─────────────────────────────────────────────
  const t45 = getSectionTable('4-5');
  if (t45.length >= 2) {
    const periods = parseRow(t45[0]).slice(1).map(parsePeriod);
    const metricMap = { '생산능력':'capacity', '생산실적':'actual', '가동률':'utilization_rate' };
    const temp = {};
    for (const row of t45.slice(1)) {
      const cols = parseRow(row);
      const [factory, metricKr] = cols[0].split('/').map(s => s.trim());
      const metricEn = metricMap[metricKr];
      if (!factory || !metricEn) continue;
      cols.slice(1).forEach((v, pi) => {
        if (!periods[pi]) return;
        const p = periods[pi];
        const key = `${stockCode}_${p.bsns_year}_${p.quarter}_${factory}`;
        if (!temp[key]) temp[key] = {
          stock_code: stockCode, ...p, factory_name: factory,
          capacity: null, actual: null, utilization_rate: null,
        };
        const { value } = parseNumOrPct(v);
        if (value != null) temp[key][metricEn] = value;
      });
    }
    result.production = Object.values(temp).filter(r =>
      r.capacity != null || r.actual != null || r.utilization_rate != null
    );
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
    .replace(/`(.+?)`/g,'<code style="background:var(--bg3);padding:1px 4px;border-radius:3px;font-size:11px">$1</code>');
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
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:var(--bg2)">
          ${hdr.map(h=>`<th style="padding:5px 8px;text-align:left;font-weight:600;color:var(--text1);
            border-bottom:1px solid var(--border);white-space:nowrap">${inl(h)}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${rows.slice(1).map((r,ri)=>`<tr style="background:${ri%2?'var(--bg3)20':''}">
            ${cols(r).map(c=>`<td style="padding:4px 8px;color:var(--text1);
              border-bottom:1px solid var(--border)10;line-height:1.5;font-size:12px">${inl(c)}</td>`).join('')}
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
              align-items:center;gap:8px;font-size:13px;font-weight:700;color:var(--text1);user-select:none">
            <span style="font-size:11px;color:var(--text2);transition:transform .15s">▶</span>
            ${esc(title)}
          </div>
          <div id="${sid}" style="display:none;padding:12px 14px;flex-direction:column;gap:6px">`;
      secOpen = true;
      i++; continue;
    }

    if (/^### /.test(line)) {
      html += `<div style="font-size:12px;font-weight:700;color:var(--tg);margin-top:10px;margin-bottom:4px;
        padding-bottom:3px;border-bottom:1px solid var(--border)30">${esc(line.replace(/^### /,'').trim())}</div>`;
      i++; continue;
    }
    if (/^#### /.test(line)) {
      html += `<div style="font-size:12px;font-weight:700;color:var(--text1);margin-top:6px">${esc(line.replace(/^#### /,'').trim())}</div>`;
      i++; continue;
    }
    if (/^##### /.test(line)) {
      html += `<div style="font-size:11px;font-weight:600;color:var(--text2);margin-top:4px">${esc(line.replace(/^##### /,'').trim())}</div>`;
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
        <span style="color:var(--text2);font-size:11px;margin-top:5px;flex-shrink:0">◦</span>
        <span style="font-size:12px;color:var(--text1);line-height:1.6">${keyword(t)}</span>
      </div>`;
      i++; continue;
    }

    if (!line.trim()) { i++; continue; }
    html += `<div style="font-size:12px;color:var(--text1);line-height:1.6">${inl(line.trim())}</div>`;
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
    const saves = [];
    if (biz.segmentRevenue.length)
      saves.push(sb.from('dart_segment_revenue').upsert(biz.segmentRevenue,
        { onConflict: 'stock_code,bsns_year,quarter,segment_type,category,subcategory' }));
    if (biz.rawMaterial.length)
      saves.push(sb.from('dart_raw_material').upsert(biz.rawMaterial,
        { onConflict: 'stock_code,bsns_year,quarter,data_type,product_name,material_name,origin' }));
    if (biz.production.length)
      saves.push(sb.from('dart_production').upsert(biz.production,
        { onConflict: 'stock_code,bsns_year,quarter,factory_name' }));
    await Promise.all(saves);
    const counts = `세그먼트 ${biz.segmentRevenue.length}건 / 원재료 ${biz.rawMaterial.length}건 / 생산 ${biz.production.length}건`;
    toast(`${parsed.stock_name} DART 저장 완료 (${counts})`, 'success');
  } catch(e) {
    toast(`DART 기본 저장 완료, 사업 섹션 저장 실패: ${e.message}`, 'warn');
  }
  input.value = '';

  const dartPayload = { report_type: parsed.report_type, receive_date: parsed.receive_date, summary: parsed.summary };

  if (_rpStock?.code === parsed.stock_code) {
    // 같은 종목 선택 중 → 데이터 갱신 후 DART 탭으로 이동
    _rpData.dart = dartPayload;
    rpRenderReport();
    setTimeout(() => rpSetTab(RP_TABS.indexOf('DART 분석')), 50);
  } else {
    // 종목 미선택이거나 다른 종목 → 해당 종목 리포트 로드 후 DART 탭
    _rpStock = { code: parsed.stock_code, name: parsed.stock_name };
    const el = document.getElementById('content');
    if (el) el.innerHTML = pReport();
    const body = document.getElementById('rp-body');
    if (body) body.innerHTML = _rpSkeleton();
    try {
      const [priceRes, finRes, watchRes] = await Promise.all([
        sb.from('market_data').select('price,price_change_rate,market_cap,volume,trading_value,foreign_hold_rate,w52_high,w52_low')
          .eq('stock_code', parsed.stock_code).order('base_date', { ascending: false }).limit(60),
        sb.from('financials').select('bsns_year,quarter,revenue,operating_profit,net_income,total_assets,total_equity,debt_ratio,roe,roa,operating_margin,net_margin')
          .eq('stock_code', parsed.stock_code).eq('fs_div','CFS').order('bsns_year', { ascending: false }).order('quarter', { ascending: false }).limit(8),
        sb.from('watchlist').select('note,target_price,opinion,buy_price,created_at')
          .eq('stock_code', parsed.stock_code).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ]);
      _rpData = { price: priceRes.data || [], fin: finRes.data || [], watch: watchRes.data || null, dart: dartPayload };
      rpRenderReport();
      setTimeout(() => rpSetTab(RP_TABS.indexOf('DART 분석')), 50);
    } catch(e) {
      // DB 데이터 없어도 DART는 보여주기
      _rpData = { price: [], fin: [], watch: null, dart: dartPayload };
      rpRenderReport();
      setTimeout(() => rpSetTab(RP_TABS.indexOf('DART 분석')), 50);
    }
  }
}
