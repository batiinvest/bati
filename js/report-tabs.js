// report-tabs.js — 종목 리포트: 지분현황/최근리포트/금감원공시 탭 + 카탈리스트 카드
// report-cards.js에서 분할 (2026-07-17)
// 의존: config.js(sb·포맷터), report-fnguide.js(_rpSecT), report.js(_rpStock — 런타임 참조)

// ═══ 지분현황 탭 (FnGuide c1070001 스타일) ═══════════════════════════════════
// 내부자거래 차트(주가+취득/처분 마커) + 주주구성 요약 + 외국인 지분율 추이 + 지분 변동내역

const _RP_OWN_CATS = ['지분공시', '대량보유', '최대주주변동', '임원/주식', '거래계획(예고)'];

async function _rpLoadAndRenderOwnership(body) {
  if (!_rpStock || !body) return;
  try {
    const [compRes, dartRes] = await Promise.all([
      sb.from('companies').select('corp_code').eq('code', _rpStock.code).maybeSingle(),
      sb.from('dart_reports').select('report_type,receive_date,raw_md,summary')
        .eq('stock_code', _rpStock.code).order('receive_date', { ascending: false }).limit(1).maybeSingle(),
    ]);
    let discs = [];
    if (compRes.data?.corp_code) {
      const { data } = await sb.from('daily_disclosures')
        .select('base_date,report_nm,category,rcept_no,insider_summary')
        .eq('corp_code', compRes.data.corp_code)
        .in('category', _RP_OWN_CATS)
        .order('base_date', { ascending: false }).limit(40);
      discs = data || [];
    }
    const dart = dartRes.data || null;
    const dp = dart?.raw_md && typeof _mdDeepParse === 'function' ? _mdDeepParse(dart.raw_md) : {};
    body.innerHTML = _rpOwnershipTab({
      discs, dp, s: dart?.summary || {}, dart,
      prices: _rpData.price || [], latest: _rpData.price?.[0] || {},
    });
  } catch (e) {
    body.innerHTML = `<div style="padding:20px;text-align:center;color:var(--red);font-size:12px">지분현황 로드 실패: ${e.message}</div>`;
  }
}

// insider_summary → 내역 텍스트
function _rpInsBadge(s) {
  if (!s) return '';
  const parts = [];
  if (s.buy)  parts.push(`<span style="color:var(--red);font-weight:700">▲취득 ${(+s.buy).toLocaleString()}주</span>`);
  if (s.sell) parts.push(`<span style="color:var(--blue);font-weight:700">▼처분 ${(+s.sell).toLocaleString()}주</span>`);
  if (s.ratio_before != null && s.ratio_after != null)
    parts.push(`<span style="color:var(--text2)">${s.ratio_before}% → <b style="color:var(--text1)">${s.ratio_after}%</b></span>`);
  if (s.type === 'major') parts.push(`<span style="color:#f59e0b;font-weight:700">⚠ 최대주주 변동</span>`);
  if (s.type === 'plan') parts.push(`<span style="color:var(--text2)">예정${s.period ? ' (' + s.period + ')' : ''}</span>`);
  return parts.join(' ');
}

function _rpOwnershipTab({ discs, dp, s, dart, prices, latest }) {
  const esc = typeof escapeHtml === 'function' ? escapeHtml : (v => v ?? '');
  const secT = t => `<div style="display:flex;align-items:center;gap:7px;margin-bottom:10px">
    <span style="width:3px;height:13px;background:var(--tg);border-radius:2px"></span>
    <span style="font-size:13px;font-weight:700;color:var(--text1)">${t}</span></div>`;
  const box = inner => `<div style="background:var(--bg2);border:1px solid var(--border);
    border-radius:var(--radius-sm);padding:14px">${inner}</div>`;
  const empty = msg => `<div style="font-size:12px;color:var(--text3);padding:10px 0;text-align:center">${msg}</div>`;

  // ── ① 내부자거래·주가 차트 ─────────────────────────────────────────────
  let chartHTML = empty('주가 데이터 없음');
  const pts = [...prices].reverse().filter(r => r.price > 0);
  if (pts.length >= 2) {
    const n = pts.length;
    const W = 640, PH = 150, GAP = 6, VH = 34, H = PH + GAP + VH;
    const vals = pts.map(r => r.price);
    const minP = Math.min(...vals), maxP = Math.max(...vals);
    const range = maxP - minP || 1;
    const X = i => n > 1 ? (i / (n - 1)) * W : W / 2;
    const Y = v => 8 + (1 - (v - minP) / range) * (PH - 16);
    const line = vals.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
    const fill = `M0,${PH} L${line.split(' ').join(' L')} L${W},${PH} Z`;
    const lineColor = vals[n - 1] >= vals[0] ? '#f87171' : '#60a5fa';

    // 공시일 → 가격 인덱스 매핑 (해당일 없으면 직전 거래일)
    const dateIdx = {};
    pts.forEach((r, i) => { if (r.base_date) dateIdx[r.base_date] = i; });
    const firstDate = pts[0].base_date || '';
    const findIdx = d => {
      if (!d || d < firstDate) return -1;
      if (dateIdx[d] != null) return dateIdx[d];
      for (let i = n - 1; i >= 0; i--) if (pts[i].base_date && pts[i].base_date <= d) return i;
      return -1;
    };

    // 마커·내부자 거래량 바
    const events = (discs || []).map(d => ({ ...d, idx: findIdx(d.base_date) })).filter(d => d.idx >= 0);
    const maxIns = Math.max(...events.map(d => Math.max(+d.insider_summary?.buy || 0, +d.insider_summary?.sell || 0)), 1);
    const markers = events.map(d => {
      const is = d.insider_summary || {};
      const isBuy = +is.buy > 0, isSell = +is.sell > 0;
      const col = isBuy && !isSell ? '#f87171' : isSell && !isBuy ? '#60a5fa' : '#f59e0b';
      const tip = `${d.base_date} ${d.category} — ${(d.report_nm || '').slice(0, 40)}`
        + (is.buy ? ` ▲${(+is.buy).toLocaleString()}주` : '') + (is.sell ? ` ▼${(+is.sell).toLocaleString()}주` : '');
      const vol = Math.max(+is.buy || 0, +is.sell || 0);
      const bh = vol > 0 ? Math.max(2, vol / maxIns * VH) : 0;
      return `<circle cx="${X(d.idx).toFixed(1)}" cy="${Y(vals[d.idx]).toFixed(1)}" r="4"
          fill="${col}" stroke="var(--bg2)" stroke-width="1.5"><title>${tip}</title></circle>`
        + (bh ? `<rect x="${(X(d.idx) - 2).toFixed(1)}" y="${(PH + GAP + VH - bh).toFixed(1)}"
          width="4" height="${bh.toFixed(1)}" rx="1" fill="${col}" opacity=".75"><title>${tip}</title></rect>` : '');
    }).join('');

    const tickN = Math.min(5, n);
    const ticks = Array.from({ length: tickN }, (_, i) => {
      const idx = Math.round(i / (tickN - 1) * (n - 1));
      return { xPct: n > 1 ? idx / (n - 1) * 100 : 50, date: (pts[idx]?.base_date || '').slice(0, 7) };
    });

    chartHTML = `
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:6px;font-size:11px;color:var(--text2)">
        <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#f87171"></span> 취득</span>
        <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#60a5fa"></span> 처분</span>
        <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#f59e0b"></span> 보고/기타</span>
        <span style="margin-left:auto;color:var(--text3)">하단 바 = 내부자 거래량 · 마커에 마우스오버 시 상세</span>
      </div>
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:200px;display:block" preserveAspectRatio="none">
        <defs><linearGradient id="rp-own-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${lineColor}" stop-opacity="0.22"/>
          <stop offset="100%" stop-color="${lineColor}" stop-opacity="0"/>
        </linearGradient></defs>
        <path d="${fill}" fill="url(#rp-own-fill)"/>
        <polyline points="${line}" fill="none" stroke="${lineColor}" stroke-width="1.6"
          stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
        <line x1="0" y1="${PH + GAP / 2}" x2="${W}" y2="${PH + GAP / 2}" stroke="var(--border)" stroke-width="0.6"/>
        ${markers}
      </svg>
      <div style="position:relative;height:15px;margin-top:2px">
        ${ticks.map(t => `<div style="position:absolute;left:${t.xPct.toFixed(1)}%;transform:translateX(-50%);
          font-size:11px;color:var(--text3);white-space:nowrap">${t.date}</div>`).join('')}
      </div>
      ${events.length ? '' : `<div style="font-size:11px;color:var(--text3);text-align:center;margin-top:4px">기간 내 지분 관련 공시 없음</div>`}`;
  }

  // ── ② 주주 구성 요약 ───────────────────────────────────────────────────
  const rp = s.related_party_ratio != null ? +s.related_party_ratio : null;
  const fr = latest?.foreign_hold_rate != null ? +latest.foreign_hold_rate : null;
  const freeFloat = rp != null ? Math.max(0, 100 - rp) : null;
  const other = rp != null && fr != null ? Math.max(0, 100 - rp - fr) : null;
  const kv = (label, val, sub) => `
    <div style="padding:10px 12px;background:var(--bg3);border-radius:var(--radius-sm)">
      <div style="font-size:11px;color:var(--text2);margin-bottom:3px">${label}</div>
      <div style="font-size:16px;font-weight:800;font-variant-numeric:tabular-nums">${val}</div>
      ${sub ? `<div style="font-size:11px;color:var(--text3);margin-top:2px">${sub}</div>` : ''}
    </div>`;
  const ownHTML = box(`
    ${secT('주주 구성')}
    ${(rp != null || dp.majorShareholder || fr != null) ? `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:12px">
      ${dp.majorShareholder ? kv('최대주주', esc(dp.majorShareholder), dp.majorShareholderRatio ? '지분 ' + esc(dp.majorShareholderRatio) : '') : ''}
      ${rp != null ? kv('최대주주+특수관계인', rp.toFixed(1) + '%') : ''}
      ${fr != null ? kv('외국인 지분율', fr.toFixed(2) + '%', latest.base_date ? '기준 ' + latest.base_date : '') : ''}
      ${freeFloat != null ? kv('유동주식비율 (추정)', freeFloat.toFixed(1) + '%', '100% − 최대주주측') : ''}
      ${s.lockup_ratio ? kv('보호예수', (+s.lockup_ratio).toFixed(1) + '%', s.lockup_end ? '해제 ' + esc(s.lockup_end) : '') : ''}
    </div>
    ${rp != null ? `
    <div style="display:flex;height:16px;border-radius:5px;overflow:hidden;background:var(--border)">
      <div style="flex:${rp};background:var(--tg)" title="최대주주+특관 ${rp.toFixed(1)}%"></div>
      ${fr != null ? `<div style="flex:${Math.min(fr, freeFloat)};background:#f59e0b" title="외국인 ${fr.toFixed(2)}%"></div>` : ''}
      ${other != null ? `<div style="flex:${other};background:#4ade80" title="기타 유동 ${other.toFixed(1)}%"></div>` : ''}
    </div>
    <div style="display:flex;gap:12px;margin-top:6px;font-size:11px;color:var(--text2);flex-wrap:wrap">
      <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--tg)"></span> 최대주주+특관 ${rp.toFixed(1)}%</span>
      ${fr != null ? `<span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#f59e0b"></span> 외국인 ${fr.toFixed(2)}%</span>` : ''}
      ${other != null ? `<span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#4ade80"></span> 기타 유동 ${other.toFixed(1)}%</span>` : ''}
    </div>` : ''}
    ${dart?.receive_date ? `<div style="font-size:11px;color:var(--text3);margin-top:8px">* DART ${esc(dart.report_type || '')} 기준 [접수: ${esc(dart.receive_date)}] · 외국인 지분율은 시장 데이터</div>` : ''}`
    : empty('DART 리포트(.md)를 업로드하면 주주 구성이 표시됩니다')}`);

  // ── ③ 외국인 지분율 추이 ───────────────────────────────────────────────
  let frHTML = '';
  const frPts = pts.filter(r => r.foreign_hold_rate != null);
  if (frPts.length >= 2) {
    const n = frPts.length, W = 640, H = 120;
    const fvals = frPts.map(r => r.foreign_hold_rate);
    const mn = Math.min(...fvals), mx = Math.max(...fvals);
    const rg = (mx - mn) || 1;
    const X = i => (i / (n - 1)) * W;
    const Y = v => 8 + (1 - (v - mn) / rg) * (H - 16);
    const line = fvals.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
    const cur = fvals[n - 1], first = fvals[0];
    const col = cur >= first ? '#f59e0b' : '#60a5fa';
    frHTML = box(`
      <div style="display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:6px">
        ${secT('외국인 지분율 추이')}
        <span style="font-size:11px;color:var(--text2)">
          최저 <b style="color:#60a5fa">${mn.toFixed(2)}%</b> · 최고 <b style="color:#f87171">${mx.toFixed(2)}%</b> ·
          현재 <b style="color:${col}">${cur.toFixed(2)}%</b></span>
      </div>
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:110px;display:block" preserveAspectRatio="none">
        <polyline points="${line}" fill="none" stroke="${col}" stroke-width="1.8"
          stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
        <circle cx="${W}" cy="${Y(cur).toFixed(1)}" r="4" fill="${col}" vector-effect="non-scaling-stroke"/>
      </svg>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text3);margin-top:2px">
        <span>${(frPts[0].base_date || '').slice(0, 7)}</span><span>${(frPts[n - 1].base_date || '').slice(0, 7)}</span>
      </div>`);
  }

  // ── ④ 지분 변동내역 (최근 공시) ────────────────────────────────────────
  const catCol = { '지분공시': '#c084fc', '대량보유': '#e879f9', '최대주주변동': '#f59e0b', '임원/주식': '#a78bfa', '거래계획(예고)': '#22d3ee' };
  const listHTML = box(`
    ${secT('지분 변동내역 (최근 ' + (discs?.length || 0) + '건)')}
    ${discs?.length ? `
    <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:12px;white-space:nowrap">
      <thead><tr style="background:var(--bg3)">
        ${['공시일', '구분', '공시명', '내역'].map((h, i) => `<th style="padding:6px 10px;text-align:left;
          color:var(--text2);font-weight:600;border-bottom:1px solid var(--border)">${h}</th>`).join('')}
      </tr></thead>
      <tbody>
        ${discs.map(d => {
          const c = catCol[d.category] || 'var(--text2)';
          return `<tr>
            <td style="padding:6px 10px;color:var(--text3);font-variant-numeric:tabular-nums;
              border-bottom:1px solid var(--border)">${(d.base_date || '').slice(2)}</td>
            <td style="padding:6px 10px;border-bottom:1px solid var(--border)">
              <span style="font-size:11px;padding:2px 8px;border-radius:100px;background:${c}20;
                color:${c};font-weight:700">${esc(d.category || '')}</span></td>
            <td style="padding:6px 10px;border-bottom:1px solid var(--border);max-width:340px;
              overflow:hidden;text-overflow:ellipsis">
              <a href="https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${encodeURIComponent(d.rcept_no || '')}"
                target="_blank" rel="noopener" style="color:var(--text1);text-decoration:none">${esc(d.report_nm || '')}</a></td>
            <td style="padding:6px 10px;border-bottom:1px solid var(--border);font-size:11px">${_rpInsBadge(d.insider_summary)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    </div>`
    : empty('지분 관련 공시 데이터 없음 (지분공시·대량보유·최대주주변동·임원/주식)')}`);

  return `<div style="display:flex;flex-direction:column;gap:12px">
    ${box(secT('내부자거래 · 주가') + chartHTML)}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:12px">
      ${ownHTML}
      ${frHTML}
    </div>
    ${listHTML}
  </div>`;
}

// ═══ 최근리포트 탭 (FnGuide c1080001 스타일) ═════════════════════════════════
// 증권사 투자의견 이력 — 일자/제공처/의견(직전 대비)/목표가(직전 대비 ▲▼N=)/괴리율

async function _rpLoadAndRenderReports(body) {
  if (!_rpStock || !body) return;
  try {
    const { data } = await sb.from('analyst_opinions')
      .select('firm_name,opinion,prev_opinion,target_price,gap_rate,opinion_date,opinion_code')
      .eq('stock_code', _rpStock.code)
      .order('opinion_date', { ascending: false }).limit(100);
    const rows = data || [];
    if (!rows.length) {
      body.innerHTML = '<div style="color:var(--text2);padding:40px;text-align:center;font-size:12px">수집된 증권사 리포트/투자의견 없음</div>';
      return;
    }
    const esc = typeof escapeHtml === 'function' ? escapeHtml : (s => s ?? '');
    const price = _rpData.price?.[0]?.price || 0;

    // 3개월 컨센서스 요약
    const recent = rows.filter(o => (Date.now() - new Date(o.opinion_date).getTime()) < 90 * 86400e3);
    const tps = recent.map(o => o.target_price).filter(v => v > 0);
    const avgTp = tps.length ? Math.round(tps.reduce((s, v) => s + v, 0) / tps.length) : null;
    const upside = avgTp && price ? (avgTp - price) / price * 100 : null;
    const kv = (label, val, sub, subCol) => `
      <div style="padding:10px 12px;background:var(--bg3);border-radius:var(--radius-sm);text-align:center">
        <div style="font-size:11px;color:var(--text2);margin-bottom:3px">${label}</div>
        <div style="font-size:16px;font-weight:800;font-variant-numeric:tabular-nums">${val}</div>
        ${sub ? `<div style="font-size:11px;color:${subCol || 'var(--text3)'};margin-top:2px">${sub}</div>` : ''}
      </div>`;

    // 목표가 변화: 같은 증권사의 직전(더 오래된) 목표가와 비교
    const tpChange = (r, i) => {
      const prev = rows.slice(i + 1).find(x => x.firm_name === r.firm_name && x.target_price > 0);
      if (!r.target_price) return '';
      if (!prev) return '<span style="color:var(--tg);font-weight:700" title="신규">N</span>';
      if (r.target_price > prev.target_price)
        return `<span style="color:var(--red);font-weight:700" title="직전 ${fmtNum(prev.target_price)}원 대비 상향">▲</span>`;
      if (r.target_price < prev.target_price)
        return `<span style="color:var(--blue);font-weight:700" title="직전 ${fmtNum(prev.target_price)}원 대비 하향">▼</span>`;
      return '<span style="color:var(--text3)" title="변동없음">=</span>';
    };
    const opCol = o => ['1', '2'].includes(o.opinion_code) || /매수|BUY/i.test(o.opinion || '') ? '#22c55e'
      : /매도|SELL/i.test(o.opinion || '') ? '#ef4444' : '#f59e0b';

    body.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:14px">
        ${kv('평균 목표주가 <span style="opacity:.65">(3개월)</span>', avgTp ? fmtNum(avgTp) + '원' : '—',
          upside != null ? `현재가 대비 ${upside >= 0 ? '+' : ''}${upside.toFixed(1)}%` : '',
          upside >= 0 ? 'var(--red)' : 'var(--blue)')}
        ${kv('목표가 범위', tps.length ? `${fmtNum(Math.min(...tps))}~${fmtNum(Math.max(...tps))}` : '—', tps.length ? '원' : '')}
        ${kv('의견 수 <span style="opacity:.65">(3개월)</span>', recent.length + '건',
          `매수 ${recent.filter(o => ['1','2'].includes(o.opinion_code)).length} · 기타 ${recent.filter(o => !['1','2'].includes(o.opinion_code)).length}`)}
        ${kv('전체 이력', rows.length + '건', `${(rows[rows.length-1]?.opinion_date || '').slice(0,7)} ~`)}
      </div>
      <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px;white-space:nowrap">
        <thead><tr style="background:var(--bg3)">
          ${['일자', '제공처', '투자의견', '직전의견', '목표가', '변동', '괴리율'].map((h, i) => `
            <th style="padding:7px 10px;text-align:${i <= 1 ? 'left' : i === 5 ? 'center' : 'right'};color:var(--text2);
              font-weight:600;border-bottom:1px solid var(--border)">${h}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${rows.map((r, i) => {
            const col = opCol(r);
            const changed = r.prev_opinion && r.opinion !== r.prev_opinion;
            const gap = r.gap_rate;
            const gCol = gap > 0 ? 'var(--red)' : gap < 0 ? 'var(--blue)' : 'var(--text3)';
            return `<tr>
              <td style="padding:7px 10px;color:var(--text3);font-variant-numeric:tabular-nums;
                border-bottom:1px solid var(--border)">${(r.opinion_date || '').slice(2).replace(/-/g, '/')}</td>
              <td style="padding:7px 10px;color:var(--text1);font-weight:600;border-bottom:1px solid var(--border)">${esc(r.firm_name || '')}</td>
              <td style="padding:7px 10px;text-align:right;font-weight:800;color:${col};
                border-bottom:1px solid var(--border)">${esc(r.opinion || '—')}${changed ? ' <span style="color:#f59e0b;font-weight:700" title="직전 의견에서 변경">●</span>' : ''}</td>
              <td style="padding:7px 10px;text-align:right;color:var(--text3);border-bottom:1px solid var(--border)">${esc(r.prev_opinion || '—')}</td>
              <td style="padding:7px 10px;text-align:right;font-weight:700;color:var(--text1);
                font-variant-numeric:tabular-nums;border-bottom:1px solid var(--border)">${r.target_price ? fmtNum(r.target_price) : '—'}</td>
              <td style="padding:7px 10px;text-align:center;border-bottom:1px solid var(--border)">${tpChange(r, i)}</td>
              <td style="padding:7px 10px;text-align:right;font-weight:700;color:${gCol};
                font-variant-numeric:tabular-nums;border-bottom:1px solid var(--border)">${gap != null ? (gap >= 0 ? '+' : '') + gap.toFixed(1) + '%' : '—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-top:6px">
        * 변동: N=신규 · ▲=직전 대비 상향 · ▼=하향 · ==변동없음 (같은 증권사 직전 목표가 기준) · 리포트 원문/제목은 데이터 미수집</div>`;
  } catch (e) {
    body.innerHTML = `<div style="padding:20px;text-align:center;color:var(--red);font-size:12px">리포트 이력 로드 실패: ${e.message}</div>`;
  }
}

// ═══ 금감원공시 탭 (FnGuide 금감원공시 스타일) ═══════════════════════════════
// daily_disclosures 전체 목록 + 카테고리 필터 칩

const RFD = { rows: [], cat: 'all' };

async function _rpLoadAndRenderFss(body) {
  if (!_rpStock || !body) return;
  try {
    const { data: comp } = await sb.from('companies')
      .select('corp_code').eq('code', _rpStock.code).maybeSingle();
    if (!comp?.corp_code) {
      body.innerHTML = '<div style="color:var(--text2);padding:40px;text-align:center;font-size:12px">DART 고유코드(corp_code) 미등록 종목 — 공시 조회 불가</div>';
      return;
    }
    const { data } = await sb.from('daily_disclosures')
      .select('base_date,report_nm,category,rcept_no,insider_summary')
      .eq('corp_code', comp.corp_code)
      .order('base_date', { ascending: false }).limit(150);
    RFD.rows = data || [];
    RFD.cat = 'all';
    if (!RFD.rows.length) {
      body.innerHTML = '<div style="color:var(--text2);padding:40px;text-align:center;font-size:12px">수집된 공시 없음 (매일 18:30 업데이트)</div>';
      return;
    }
    // 카테고리 칩 (건수순)
    const counts = {};
    RFD.rows.forEach(r => { const c = r.category || '기타'; counts[c] = (counts[c] || 0) + 1; });
    const cats = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const esc = typeof escapeHtml === 'function' ? escapeHtml : (s => s ?? '');
    body.innerHTML = `
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;align-items:center">
        <button id="rfd-cat-all" class="chip chip-sm active" onclick="rpFssFilter('all')">전체 ${RFD.rows.length}</button>
        ${cats.map(([c, n]) => `<button id="rfd-cat-${esc(c)}" class="chip chip-sm"
          onclick="rpFssFilter('${typeof escJsStr === 'function' ? escJsStr(c) : c.replace(/'/g, "\\'")}')">${esc(c)} ${n}</button>`).join('')}
        <span style="margin-left:auto;font-size:11px;color:var(--text3)">최근 ${RFD.rows.length}건 · 공시명 클릭 시 DART 원문</span>
      </div>
      <div id="rfd-list"></div>`;
    _rpFssRenderList();
  } catch (e) {
    body.innerHTML = `<div style="padding:20px;text-align:center;color:var(--red);font-size:12px">공시 로드 실패: ${e.message}</div>`;
  }
}

function rpFssFilter(cat) {
  RFD.cat = cat;
  document.querySelectorAll('[id^="rfd-cat-"]').forEach(b =>
    b.classList.toggle('active', b.id === 'rfd-cat-' + (cat === 'all' ? 'all' : cat)));
  _rpFssRenderList();
}

function _rpFssRenderList() {
  const el = document.getElementById('rfd-list');
  if (!el) return;
  const esc = typeof escapeHtml === 'function' ? escapeHtml : (s => s ?? '');
  const rows = RFD.cat === 'all' ? RFD.rows : RFD.rows.filter(r => (r.category || '기타') === RFD.cat);
  if (!rows.length) {
    el.innerHTML = '<div style="color:var(--text3);padding:30px;text-align:center;font-size:12px">해당 카테고리 공시 없음</div>';
    return;
  }
  el.innerHTML = `
    <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:12px;white-space:nowrap">
      <thead><tr style="background:var(--bg3)">
        ${['공시일', '구분', '공시명', '비고'].map(h => `<th style="padding:6px 10px;text-align:left;
          color:var(--text2);font-weight:600;border-bottom:1px solid var(--border)">${h}</th>`).join('')}
      </tr></thead>
      <tbody>
        ${rows.map(d => `<tr>
          <td style="padding:6px 10px;color:var(--text3);font-variant-numeric:tabular-nums;
            border-bottom:1px solid var(--border)">${(d.base_date || '').slice(2)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid var(--border)">
            <span class="chip chip-sm" style="cursor:default">${esc(d.category || '기타')}</span></td>
          <td style="padding:6px 10px;border-bottom:1px solid var(--border);max-width:420px;
            overflow:hidden;text-overflow:ellipsis">
            <a href="https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${encodeURIComponent(d.rcept_no || '')}"
              target="_blank" rel="noopener" style="color:var(--text1);text-decoration:none">${esc(d.report_nm || '')}</a></td>
          <td style="padding:6px 10px;border-bottom:1px solid var(--border);font-size:11px">${_rpInsBadge(d.insider_summary)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    </div>`;
}

function _rpCatalystCard() {
  const catalysts = [
    { horizon: '단기 (1M)',  color: '#f59e0b', items: ['분기 실적 발표', '주요 수주 발표'] },
    { horizon: '중기 (3M)',  color: '#22d3ee', items: ['신제품 출시', '설비 가동률 개선'] },
    { horizon: '장기 (12M)', color: '#60a5fa', items: ['시장 점유율 확대', '해외 매출 성장'] },
  ];
  return `<div class="card" style="padding:16px">
    ${_rpSecT('카탈리스트')}
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
      ${catalysts.map(c => `
      <div style="padding:10px;border-radius:var(--radius-sm);border:1px solid ${c.color}30;background:${c.color}08">
        <div style="font-size:11px;font-weight:700;color:${c.color};margin-bottom:8px">${c.horizon}</div>
        ${c.items.map(item => `
        <div style="display:flex;align-items:flex-start;gap:5px;margin-bottom:5px">
          <span style="color:${c.color};font-size:11px;margin-top:2px">◦</span>
          <span style="font-size:12px;color:var(--text1)">${item}</span>
        </div>`).join('')}
      </div>`).join('')}
    </div>
    <div style="margin-top:8px;font-size:11px;color:var(--text3)">
      * 투자노트에 카탈리스트를 직접 입력하면 여기에 반영됩니다</div>
  </div>`;
}
