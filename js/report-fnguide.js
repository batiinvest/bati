// report-fnguide.js — 종목 리포트: FnGuide 스타일 밴드·카드 + 기업개요/재무분석/투자지표 탭
// report-cards.js에서 분할 (2026-07-17) — _rpSecT·_rpAggAnnual은 report-cards/stock-detail도 참조하는 공용
// 의존: config.js(sb·포맷터), report.js(_rpStock·_rpData — 런타임 참조)

// ═══ FnGuide 기업현황 스타일 카드 (2026-07 재구성) ═══════════════════════════

// 공통 섹션 타이틀 (FnGuide 스타일 — 악센트 바 + 타이틀 + 우측 보조텍스트)
function _rpSecT(title, right = '', color = 'var(--tg)') {
  return `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:10px">
    <span style="display:inline-flex;align-items:center;gap:7px">
      <span style="width:3px;height:13px;background:${color};border-radius:2px;flex-shrink:0"></span>
      <span style="font-size:13px;font-weight:700;color:var(--text1)">${title}</span>
    </span>
    ${right ? `<span style="font-size:11px;color:var(--text3)">${right}</span>` : ''}
  </div>`;
}

// 발행주식수 추정 (시총 ÷ 주가 — 동일 base_date 행이라 정합)
function _rpShares(latest) {
  return latest?.market_cap > 0 && latest?.price > 0
    ? Math.round(latest.market_cap / latest.price) : null;
}

// 분기(순액) 행 → 연간 합산 행 (4분기 완결 연도만 — financials Q4는 순액이므로 합산 필수)
// flow: 4분기 합산 / stock: Q4 시점값 / 비율(마진·ROE·ROA)은 합산 기준 재계산
function _rpAggAnnual(rows, opts = {}) {
  const flow  = opts.flow  || ['revenue', 'operating_profit', 'net_income'];
  const stock = opts.stock || ['total_assets', 'total_equity', 'debt_ratio'];
  const byYear = {};
  for (const r of rows || []) {
    if (!r.bsns_year || !r.quarter) continue;
    (byYear[r.bsns_year] = byYear[r.bsns_year] || []).push(r);
  }
  const out = [];
  for (const y of Object.keys(byYear)) {
    const uq = [...new Map(byYear[y].map(r => [r.quarter, r])).values()];
    if (uq.length < 4) continue; // 미완결 연도(분기 누락) 제외
    const q4  = uq.find(r => r.quarter === 'Q4') || uq[uq.length - 1];
    const agg = { bsns_year: y, quarter: 'FY' };
    for (const c of flow)  agg[c] = uq.every(r => r[c] != null) ? uq.reduce((s, r) => s + r[c], 0) : null;
    for (const c of stock) if (c in q4) agg[c] = q4[c];
    if (agg.revenue > 0) {
      if (agg.operating_profit != null) agg.operating_margin = agg.operating_profit / agg.revenue * 100;
      if (agg.net_income != null)       agg.net_margin       = agg.net_income / agg.revenue * 100;
      if (agg.ebitda != null)           agg.ebitda_margin    = agg.ebitda / agg.revenue * 100;
      if (agg.gross_profit != null)     agg.gross_margin     = agg.gross_profit / agg.revenue * 100;
    }
    if (agg.total_equity > 0 && agg.net_income != null) agg.roe = agg.net_income / agg.total_equity * 100;
    if (agg.total_assets > 0 && agg.net_income != null) agg.roa = agg.net_income / agg.total_assets * 100;
    out.push(agg);
  }
  return out.sort((a, b) => String(a.bsns_year).localeCompare(String(b.bsns_year))); // 오래된 → 최신
}

// ① 스냅샷 밴드 — EPS·BPS·PER·업종PER·PBR·현재가 (FnGuide 상단 지표 밴드)
function _rpSnapshotBand(latest, annual, company) {
  const shares = _rpShares(latest);
  const a   = annual?.[0] || {};
  const eps = shares && a.net_income   != null ? a.net_income   / shares : null;
  const bps = shares && a.total_equity != null ? a.total_equity / shares : null;
  const chg = latest?.price_change_rate ?? 0;
  const chgCol = chg > 0 ? 'var(--red)' : chg < 0 ? 'var(--blue)' : 'var(--text3)';
  const yearHint = a.bsns_year ? `${a.bsns_year}/12` : '';

  const cell = (label, val, opt = {}) => `
    <div style="flex:1;min-width:88px;padding:10px 8px;text-align:center;
      border-right:1px solid var(--border)">
      <div style="font-size:11px;color:var(--text2);margin-bottom:3px">${label}
        ${opt.hint ? `<span style="opacity:.65">(${opt.hint})</span>` : ''}</div>
      <div ${opt.id ? `id="${opt.id}"` : ''} style="font-size:16px;font-weight:800;
        font-variant-numeric:tabular-nums;color:${opt.color || 'var(--text1)'}">${val}</div>
      ${opt.sub ? `<div style="font-size:11px;font-weight:600;color:${opt.color || 'var(--text2)'}">${opt.sub}</div>` : ''}
    </div>`;

  // 시장·업종 태그 라인
  const esc  = typeof escapeHtml === 'function' ? escapeHtml : (s => s ?? '');
  const tags = [company?.market, company?.industry, company?.sub_industry,
    a.bsns_year ? '12월 결산' : null].filter(Boolean);

  return `<div class="card" style="padding:0;overflow:hidden">
    <div style="display:flex;flex-wrap:wrap;border-bottom:1px solid var(--border)">
      ${cell('EPS', eps != null ? fmtNum(eps) : '—', { hint: yearHint })}
      ${cell('BPS', bps != null ? fmtNum(bps) : '—', { hint: yearHint })}
      ${cell('PER', latest?.per ? latest.per.toFixed(2) : '—')}
      ${cell('업종PER', '—', { id: 'rp-snap-indper' })}
      ${cell('PBR', latest?.pbr ? latest.pbr.toFixed(2) : '—')}
      ${cell('현재가', latest?.price ? fmtNum(latest.price) : '—',
        { color: chgCol, sub: (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%' })}
    </div>
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:7px 14px;background:var(--bg2)">
      ${tags.map(t => `<span class="chip chip-sm" style="cursor:default">${esc(t)}</span>`).join('')}
      ${company?.product ? `<span style="font-size:11px;color:var(--text2);min-width:0;
        overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(company.product)}</span>` : ''}
      ${latest?.base_date ? `<span style="margin-left:auto;font-size:11px;color:var(--text3)">[기준: ${latest.base_date}]</span>` : ''}
    </div>
  </div>`;
}

// ② 시세 및 주주현황 (좌: 시세 표 · 우: 주가/거래량 차트)
function _rpQuoteCard(latest, prices) {
  const price = latest?.price || 0;
  const chg   = latest?.price_change_rate ?? 0;
  const pc    = latest?.price_change;
  const chgCol = chg > 0 ? 'var(--red)' : chg < 0 ? 'var(--blue)' : 'var(--text3)';
  const shares = _rpShares(latest);
  const high52 = latest?.w52_high || 0;
  const low52  = latest?.w52_low  || 0;
  const pos52  = high52 > low52 ? Math.round((price - low52) / (high52 - low52) * 100) : null;

  const retCell = v => {
    if (v == null) return '<span style="color:var(--text3)">—</span>';
    const c = v > 0 ? 'var(--red)' : v < 0 ? 'var(--blue)' : 'var(--text3)';
    return `<span style="color:${c};font-weight:700">${v >= 0 ? '+' : ''}${v.toFixed(2)}%</span>`;
  };

  const rows = [
    ['주가 / 전일대비 / 등락률',
      price ? `${fmtNum(price)}원 / ${pc != null ? (pc >= 0 ? '+' : '') + fmtNum(pc) + '원' : '—'} /
        <span style="color:${chgCol};font-weight:700">${(chg >= 0 ? '+' : '') + chg.toFixed(2)}%</span>` : '—'],
    ['52주 최고 / 최저',
      high52 ? `${fmtNum(high52)}원 / ${fmtNum(low52)}원` : '—'],
    ['거래량 / 거래대금',
      latest?.volume ? `${fmtNum(latest.volume)}주 / ${fmtCap(latest.trading_value || 0)}` : '—'],
    ['시가총액', latest?.market_cap ? fmtCap(latest.market_cap) : '—'],
    ['발행주식수 <span style="opacity:.6">(추정)</span>', shares ? fmtNum(shares) + '주' : '—'],
    ['외국인 지분율', latest?.foreign_hold_rate != null ? latest.foreign_hold_rate.toFixed(2) + '%' : '—'],
    ['수익률 (1W / 1M / 3M / 1Y)',
      [latest?.week_return, latest?.month_return, latest?.quarter_return, latest?.year_return]
        .map(retCell).join(' / ')],
  ];

  return `<div class="card" style="padding:16px">
    ${_rpSecT('시세 및 주주현황', latest?.base_date ? `[기준: ${latest.base_date}]` : '')}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;align-items:start">

      <!-- 좌: 시세 표 -->
      <div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          ${rows.map(([k, v]) => `
          <tr>
            <td style="padding:7px 10px;background:var(--bg3);color:var(--text2);
              border-bottom:1px solid var(--border);white-space:nowrap;width:44%">${k}</td>
            <td style="padding:7px 10px;text-align:right;color:var(--text1);font-weight:600;
              font-variant-numeric:tabular-nums;border-bottom:1px solid var(--border)">${v}</td>
          </tr>`).join('')}
        </table>
        ${pos52 != null ? `
        <div style="margin-top:12px;padding:0 2px">
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text2);margin-bottom:5px">
            <span>52주 가격 위치</span>
            <span style="font-weight:700;color:var(--tg)">${pos52}%</span>
          </div>
          <div style="height:5px;border-radius:3px;background:var(--border);position:relative">
            <div style="position:absolute;left:0;top:0;height:100%;width:${pos52}%;
              background:linear-gradient(90deg,var(--blue),var(--tg));border-radius:3px"></div>
            <div style="position:absolute;top:-4px;left:calc(${pos52}% - 6px);width:12px;height:12px;
              border-radius:50%;background:white;border:2px solid var(--tg);box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:11px;color:var(--text3)">
            <span>저 ${fmtNum(low52)}</span><span>고 ${fmtNum(high52)}</span>
          </div>
        </div>` : ''}
      </div>

      <!-- 우: 주가/거래량 차트 -->
      ${_rpPriceVolChart(prices)}
    </div>
  </div>`;
}

// ②-보조: 주가 라인 + 거래량 바 차트 (SVG)
function _rpPriceVolChart(prices) {
  const pts = [...(prices || [])].reverse().filter(r => r.price > 0);
  if (pts.length < 2) return `<div style="display:flex;align-items:center;justify-content:center;
    min-height:180px;color:var(--text3);font-size:12px">주가 데이터 없음</div>`;

  const n = pts.length;
  const W = 640, PH = 150, GAP = 6, VH = 36;
  const vals  = pts.map(r => r.price);
  const minP  = Math.min(...vals), maxP = Math.max(...vals);
  const range = maxP - minP || 1;
  const X = i => n > 1 ? (i / (n - 1)) * W : W / 2;
  const Y = v => 8 + (1 - (v - minP) / range) * (PH - 16);

  const line = vals.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const fill = `M0,${PH} L${line.split(' ').join(' L')} L${W},${PH} Z`;
  const lastP = vals[n - 1];
  const lineColor = lastP >= vals[0] ? '#f87171' : '#60a5fa';

  // 거래량 바
  const maxV = Math.max(...pts.map(r => r.volume || 0), 1);
  const barW = Math.max(0.8, W / n - 0.4);
  const volBars = pts.map((r, i) => {
    const h = Math.max(0.5, (r.volume || 0) / maxV * VH);
    const c = (r.price_change_rate ?? 0) >= 0 ? '#f87171' : '#60a5fa';
    return `<rect x="${(X(i) - barW / 2).toFixed(1)}" y="${(PH + GAP + VH - h).toFixed(1)}"
      width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${c}" opacity=".4"/>`;
  }).join('');

  // 고/저/현재 라벨 (HTML 오버레이 — % 좌표)
  const minIdx = vals.indexOf(minP), maxIdx = vals.indexOf(maxP);
  const H = PH + GAP + VH;
  const pctX = i => n > 1 ? (i / (n - 1)) * 100 : 50;
  const pctY = v => Y(v) / H * 100;
  const lblPos = xp => xp > 72 ? `right:${Math.max(100 - xp, 1).toFixed(1)}%` : `left:${Math.max(xp, 1).toFixed(1)}%`;
  const minDate = pts[minIdx]?.base_date?.slice(2, 10) || '';
  const maxDate = pts[maxIdx]?.base_date?.slice(2, 10) || '';
  const showCur = Math.abs(100 - pctX(maxIdx)) > 12;

  // X축 눈금 (5개)
  const tickN  = Math.min(5, n);
  const ticks  = Array.from({ length: tickN }, (_, i) => {
    const idx = Math.round(i / (tickN - 1) * (n - 1));
    return { xPct: pctX(idx), date: (pts[idx]?.base_date || '').slice(0, 7) };
  });

  const periodRet = minP > 0 ? (lastP - minP) / minP * 100 : null;

  return `<div style="display:flex;flex-direction:column;min-width:0">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
      <span style="font-size:11px;font-weight:700;color:var(--text2)">주가 / 거래량 (최근 ${n}거래일)</span>
      ${periodRet != null ? `<span style="font-size:11px;font-weight:700;
        color:${periodRet >= 0 ? '#f87171' : '#60a5fa'}">저점 대비 ${periodRet >= 0 ? '+' : ''}${periodRet.toFixed(1)}%</span>` : ''}
    </div>
    <div style="position:relative">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:190px;display:block">
        <defs>
          <linearGradient id="rp-pv-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${lineColor}" stop-opacity="0.28"/>
            <stop offset="100%" stop-color="${lineColor}" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <path d="${fill}" fill="url(#rp-pv-fill)"/>
        <polyline points="${line}" fill="none" stroke="${lineColor}" stroke-width="1.8"
          stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
        <line x1="0" y1="${PH + GAP / 2}" x2="${W}" y2="${PH + GAP / 2}" stroke="var(--border)" stroke-width="0.6"/>
        ${volBars}
        <circle cx="${X(minIdx).toFixed(1)}" cy="${Y(minP).toFixed(1)}" r="3.5" fill="#60a5fa" vector-effect="non-scaling-stroke"/>
        <circle cx="${X(maxIdx).toFixed(1)}" cy="${Y(maxP).toFixed(1)}" r="3.5" fill="#f87171" vector-effect="non-scaling-stroke"/>
        <circle cx="${X(n - 1).toFixed(1)}" cy="${Y(lastP).toFixed(1)}" r="4" fill="white"
          stroke="${lineColor}" stroke-width="2" vector-effect="non-scaling-stroke"/>
      </svg>
      <div style="position:absolute;top:0;${lblPos(pctX(maxIdx))};pointer-events:none;white-space:nowrap">
        <div style="font-size:11px;color:#f87171;font-weight:700;background:var(--bg2);
          padding:1px 5px;border-radius:3px;border:1px solid #f8717150;line-height:1.4">
          ▲ ${fmtNum(maxP)} <span style="font-weight:400">${maxDate}</span></div>
      </div>
      <div style="position:absolute;top:calc(${pctY(minP).toFixed(1)}% + 6px);${lblPos(pctX(minIdx))};pointer-events:none;white-space:nowrap">
        <div style="font-size:11px;color:#60a5fa;font-weight:700;background:var(--bg2);
          padding:1px 5px;border-radius:3px;border:1px solid #60a5fa50;line-height:1.4">
          ▼ ${fmtNum(minP)} <span style="font-weight:400">${minDate}</span></div>
      </div>
      ${showCur ? `
      <div style="position:absolute;right:2px;top:calc(${pctY(lastP).toFixed(1)}% - 22px);pointer-events:none">
        <div style="font-size:11px;color:${lineColor};font-weight:700;background:var(--bg2);
          padding:1px 5px;border-radius:3px;border:1px solid ${lineColor}50;white-space:nowrap">${fmtNum(lastP)}</div>
      </div>` : ''}
    </div>
    <div style="position:relative;height:15px;margin-top:2px">
      ${ticks.map(t => `
        <div style="position:absolute;left:${t.xPct.toFixed(1)}%;transform:translateX(-50%);
          font-size:11px;color:var(--text3);white-space:nowrap">${t.date}</div>`).join('')}
    </div>
  </div>`;
}

// ③ 투자의견 컨센서스 — 평균 목표주가·의견 분포·증권사 테이블 + 내 의견
function _rpConsensusCard(analysts, currentPrice, watch) {
  const esc   = typeof escapeHtml === 'function' ? escapeHtml : (s => s ?? '');
  const opMap = { '매수': 'BUY', '적극매수': 'BUY', 'buy': 'BUY', '중립': 'HOLD', '보유': 'HOLD', 'hold': 'HOLD', '매도': 'SELL', 'sell': 'SELL' };
  const colMap = { BUY: '#22c55e', HOLD: '#f59e0b', SELL: '#ef4444' };

  // 증권사별 최신 1건
  const seen = new Set();
  const items = (analysts || []).filter(a => {
    if (seen.has(a.firm_name)) return false; seen.add(a.firm_name); return true;
  });
  const tps    = items.filter(a => a.target_price > 0).map(a => a.target_price);
  const avgTp  = tps.length ? Math.round(tps.reduce((s, v) => s + v, 0) / tps.length) : null;
  const avgGap = avgTp && currentPrice ? (avgTp - currentPrice) / currentPrice * 100 : null;

  // 의견 분포
  const dist = { BUY: 0, HOLD: 0, SELL: 0 };
  items.forEach(a => { const k = opMap[a.opinion?.toLowerCase?.() ? a.opinion.toLowerCase() : a.opinion] || opMap[a.opinion]; if (dist[k] != null) dist[k]++; });
  const distTotal = dist.BUY + dist.HOLD + dist.SELL;

  // 내 의견
  const myTp  = watch?.target_price || 0;
  const myUp  = myTp && currentPrice ? (myTp - currentPrice) / currentPrice * 100 : null;

  const summaryCol = `
    <div style="display:flex;flex-direction:column;gap:10px;padding-right:14px;border-right:1px solid var(--border)">
      <div>
        <div style="font-size:11px;color:var(--text2)">평균 목표주가 <span style="opacity:.65">(${items.length}개사)</span></div>
        <div style="font-size:24px;font-weight:800;font-variant-numeric:tabular-nums">
          ${avgTp ? fmtNum(avgTp) + '<span style="font-size:13px;font-weight:600">원</span>' : '—'}</div>
        ${avgGap != null ? `<div style="font-size:13px;font-weight:700;
          color:${avgGap > 0 ? 'var(--red)' : 'var(--blue)'}">
          ${avgGap > 0 ? '▲' : '▼'} ${Math.abs(avgGap).toFixed(1)}% ${avgGap > 0 ? '상승여력' : '하락위험'}</div>` : ''}
      </div>
      ${distTotal ? `
      <div>
        <div style="font-size:11px;color:var(--text2);margin-bottom:5px">투자의견 분포</div>
        <div style="display:flex;height:8px;border-radius:4px;overflow:hidden;background:var(--border)">
          ${['BUY', 'HOLD', 'SELL'].filter(k => dist[k]).map(k =>
            `<div style="flex:${dist[k]};background:${colMap[k]}" title="${k} ${dist[k]}"></div>`).join('')}
        </div>
        <div style="display:flex;gap:10px;margin-top:5px;flex-wrap:wrap">
          ${['BUY', 'HOLD', 'SELL'].map(k => `<span style="font-size:11px;color:${colMap[k]};font-weight:700">
            ${k} ${dist[k]}</span>`).join('')}
        </div>
      </div>` : ''}
      <div style="border-top:1px solid var(--border);padding-top:8px">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:11px;color:var(--text2)">내 의견</span>
          ${_rpOpinionBadgeInline(watch?.opinion)}
        </div>
        ${myTp ? `<div style="font-size:12px;color:var(--text1);margin-top:5px">
          목표가 <b>${fmtNum(myTp)}원</b>
          ${myUp != null ? `<span style="font-weight:700;color:${myUp > 0 ? 'var(--red)' : 'var(--blue)'}">
            (${myUp > 0 ? '+' : ''}${myUp.toFixed(1)}%)</span>` : ''}</div>`
          : `<div style="font-size:11px;color:var(--text3);margin-top:5px">투자노트에서 목표주가 설정</div>`}
        <a onclick="go('watchlist')" style="font-size:11px;color:var(--tg);cursor:pointer">투자노트 편집 →</a>
      </div>
    </div>`;

  const tableCol = items.length ? `
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px;white-space:nowrap">
        <thead><tr style="background:var(--bg3)">
          ${['제공처', '최종일자', '투자의견', '목표주가', '괴리율'].map((h, i) => `
            <th style="padding:6px 10px;text-align:${i === 0 ? 'left' : 'right'};color:var(--text2);
              font-weight:600;border-bottom:1px solid var(--border)">${h}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${items.map(a => {
            const op  = opMap[a.opinion] || a.opinion || '—';
            const col = colMap[op] || 'var(--text2)';
            const gap = a.gap_rate;
            const gCol = gap > 0 ? 'var(--red)' : gap < 0 ? 'var(--blue)' : 'var(--text3)';
            return `<tr>
              <td style="padding:7px 10px;color:var(--text1);font-weight:600;border-bottom:1px solid var(--border)">${esc(a.firm_name || '')}</td>
              <td style="padding:7px 10px;text-align:right;color:var(--text3);border-bottom:1px solid var(--border)">${(a.opinion_date || '').slice(2, 10).replace(/-/g, '/')}</td>
              <td style="padding:7px 10px;text-align:right;font-weight:800;color:${col};border-bottom:1px solid var(--border)">${op}</td>
              <td style="padding:7px 10px;text-align:right;font-weight:700;color:var(--text1);
                font-variant-numeric:tabular-nums;border-bottom:1px solid var(--border)">${a.target_price ? fmtNum(a.target_price) : '—'}</td>
              <td style="padding:7px 10px;text-align:right;font-weight:700;color:${gCol};
                font-variant-numeric:tabular-nums;border-bottom:1px solid var(--border)">${gap != null ? (gap >= 0 ? '+' : '') + gap.toFixed(1) + '%' : '—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      <div style="font-size:11px;color:var(--text3);margin-top:6px">* 증권사별 최근 발표 기준</div>
    </div>`
    : `<div style="display:flex;align-items:center;justify-content:center;color:var(--text3);font-size:12px">
        등록된 증권사 의견이 없습니다</div>`;

  return `<div class="card" style="padding:16px">
    ${_rpSecT('투자의견 컨센서스')}
    <div style="display:grid;grid-template-columns:190px 1fr;gap:14px">
      ${summaryCol}
      ${tableCol}
    </div>
  </div>`;
}

// ④ 연간 실적 요약 표 (FnGuide 추정실적 컨센서스 자리 — 실적(A) 기준)
function _rpAnnualTable(annual, latest) {
  if (!annual?.length) return '';
  const rows = [...annual].sort((a, b) => String(a.bsns_year).localeCompare(String(b.bsns_year)));
  const shares = _rpShares(latest);
  const eok = v => v == null ? '—' : fmtNum(v / 1e8);
  const yoy = (cur, prev) => {
    if (cur == null || prev == null || prev === 0) return '—';
    const r = (cur - prev) / Math.abs(prev) * 100;
    const c = r > 0 ? 'var(--red)' : r < 0 ? 'var(--blue)' : 'var(--text3)';
    return `<span style="color:${c}">${r >= 0 ? '+' : ''}${r.toFixed(1)}</span>`;
  };
  const num = (v, digits = 2) => v == null ? '—' : v.toFixed(digits);

  return `<div class="card" style="padding:16px">
    ${_rpSecT('연간 실적 요약', '* 단위: 억원, %, 배 · IFRS 연결')}
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px;white-space:nowrap">
        <thead><tr style="background:var(--bg3)">
          ${['재무연월', '매출액', '전년대비', '영업이익', '전년대비', '당기순이익', '영업이익률(%)', 'EPS(원)', 'ROE(%)', '부채비율(%)'].map((h, i) => `
            <th style="padding:6px 10px;text-align:${i === 0 ? 'left' : 'right'};color:var(--text2);
              font-weight:600;border-bottom:1px solid var(--border)">${h}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${rows.map((r, i) => {
            const prev = rows[i - 1];
            const eps  = shares && r.net_income != null ? Math.round(r.net_income / shares) : null;
            const isLast = i === rows.length - 1;
            const td = (v, extra = '') => `<td style="padding:7px 10px;text-align:right;
              font-variant-numeric:tabular-nums;border-bottom:1px solid var(--border);
              ${isLast ? 'font-weight:700;color:var(--text1);background:var(--tg)0d' : 'color:var(--text1)'};${extra}">${v}</td>`;
            return `<tr>
              <td style="padding:7px 10px;font-weight:${isLast ? 700 : 600};color:var(--text1);
                border-bottom:1px solid var(--border);${isLast ? 'background:var(--tg)0d' : ''}">${r.bsns_year}(A)</td>
              ${td(eok(r.revenue))}
              ${td(yoy(r.revenue, prev?.revenue))}
              ${td(eok(r.operating_profit))}
              ${td(yoy(r.operating_profit, prev?.operating_profit))}
              ${td(eok(r.net_income))}
              ${td(num(r.operating_margin, 1))}
              ${td(eps != null ? fmtNum(eps) : '—')}
              ${td(num(r.roe, 1))}
              ${td(num(r.debt_ratio, 1))}
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div style="font-size:11px;color:var(--text3);margin-top:6px">
      * (A)=실적, 연간=분기 순액 4개 합산(완결 연도만) · ROE=연간순이익÷기말자본 · EPS는 현재 발행주식수 기준 추정 · PER/PBR 연간 히스토리·컨센서스(E)는 데이터 수집 예정</div>
  </div>`;
}

// ═══ 기업개요 탭 (FnGuide c1020001 스타일) ═══════════════════════════════════

// 탭 진입 시 데이터 로드 + 렌더 (DART raw_md 파싱·지역세그먼트·생산·최근공시)
async function _rpLoadAndRenderProfile(body) {
  if (!_rpStock || !body) return;
  try {
    const [compRes, dartRes, regionRes, prodRes] = await Promise.all([
      sb.from('companies').select('corp_code,market,sector,product,industry,sub_industry')
        .eq('code', _rpStock.code).maybeSingle(),
      sb.from('dart_reports').select('report_type,receive_date,raw_md,summary')
        .eq('stock_code', _rpStock.code).order('receive_date', { ascending: false }).limit(1).maybeSingle(),
      sb.from('dart_segment_revenue').select('bsns_year,quarter,category,subcategory,revenue')
        .eq('stock_code', _rpStock.code).eq('segment_type','region')
        .order('bsns_year', { ascending: true }).order('quarter', { ascending: true }),
      sb.from('dart_production').select('bsns_year,quarter,factory_name,capacity,actual,utilization_rate')
        .eq('stock_code', _rpStock.code)
        .order('bsns_year', { ascending: true }).order('quarter', { ascending: true }),
    ]);

    // 최근 공시 (corp_code 기준)
    let discs = [];
    if (compRes.data?.corp_code) {
      const { data } = await sb.from('daily_disclosures')
        .select('base_date,report_nm,category,rcept_no')
        .eq('corp_code', compRes.data.corp_code)
        .order('base_date', { ascending: false }).limit(8);
      discs = data || [];
    }

    const dart = dartRes.data || null;
    const dp   = dart?.raw_md && typeof _mdDeepParse === 'function' ? _mdDeepParse(dart.raw_md) : {};

    body.innerHTML = _rpProfileTab({
      comp: compRes.data || {}, dart, dp, discs,
      region: regionRes.data || [], prod: prodRes.data || [],
      latest: _rpData.price?.[0] || {}, segment: _rpData.segment || [],
    });
  } catch (e) {
    body.innerHTML = `<div style="padding:20px;text-align:center;color:var(--red);font-size:12px">기업개요 로드 실패: ${e.message}</div>`;
  }
}

// 기업개요 탭 렌더 — 기본정보·최근공시(연혁)·매출구성·내수/수출·생산·계열사
function _rpProfileTab({ comp, dart, dp, discs, region, prod, latest, segment }) {
  const esc = typeof escapeHtml === 'function' ? escapeHtml : (s => s ?? '');
  const secT = t => `<div style="display:flex;align-items:center;gap:7px;margin-bottom:10px">
    <span style="width:3px;height:13px;background:var(--tg);border-radius:2px"></span>
    <span style="font-size:13px;font-weight:700;color:var(--text1)">${t}</span></div>`;
  const box = inner => `<div style="background:var(--bg2);border:1px solid var(--border);
    border-radius:var(--radius-sm);padding:14px">${inner}</div>`;
  const empty = msg => `<div style="font-size:12px;color:var(--text3);padding:10px 0;text-align:center">${msg}</div>`;

  // ── ① 기업 기본정보 표 ─────────────────────────────────────────────────
  const shares = _rpShares(latest);
  const infoRows = [
    ['설립일 / 상장일', [dp.established, dp.listedDate].filter(Boolean).map(esc).join(' / ') || null],
    ['본사 소재지', dp.location ? esc(dp.location) : null],
    ['시장 / 업종', [comp.market, comp.sector].filter(Boolean).map(esc).join(' / ') || null],
    ['분석 산업', [comp.industry, comp.sub_industry].filter(Boolean).map(esc).join(' · ') || null],
    ['주력 제품', comp.product ? esc(comp.product) : null],
    ['주요 사업', dp.mainBusiness ? esc(dp.mainBusiness) : null],
    ['발행주식수 <span style="opacity:.6">(추정)</span>', shares ? fmtNum(shares) + '주' : null],
    ['최대주주', dp.majorShareholder
      ? esc(dp.majorShareholder) + (dp.majorShareholderRatio ? ` <b style="color:var(--tg)">${esc(dp.majorShareholderRatio)}</b>` : '') : null],
  ].filter(([, v]) => v != null);

  const infoHTML = box(`
    ${secT('기업 기본정보')}
    ${infoRows.length ? `
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      ${infoRows.map(([k, v]) => `<tr>
        <td style="padding:7px 10px;background:var(--bg3);color:var(--text2);white-space:nowrap;
          border-bottom:1px solid var(--border);width:130px">${k}</td>
        <td style="padding:7px 10px;color:var(--text1);border-bottom:1px solid var(--border);line-height:1.5">${v}</td>
      </tr>`).join('')}
    </table>
    ${dart?.receive_date ? `<div style="font-size:11px;color:var(--text3);margin-top:6px">
      * DART ${esc(dart.report_type || '')} 기준 [접수: ${esc(dart.receive_date)}]</div>` : ''}`
    : empty('DART 리포트(.md)를 업로드하면 기본정보가 표시됩니다')}`);

  // ── ② 최근 공시 (연혁 타임라인) ────────────────────────────────────────
  const discHTML = box(`
    ${secT('최근 공시 이력')}
    ${discs.length ? `
    <div style="display:flex;flex-direction:column">
      ${discs.map(d => `
      <div style="display:flex;align-items:baseline;gap:10px;padding:6px 2px;
        border-bottom:1px solid var(--border)">
        <span style="font-size:11px;color:var(--text3);font-variant-numeric:tabular-nums;
          white-space:nowrap;width:72px">${(d.base_date || '').slice(2)}</span>
        ${d.category ? `<span class="chip chip-sm" style="cursor:default;flex-shrink:0">${esc(d.category)}</span>` : ''}
        <a href="https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${encodeURIComponent(d.rcept_no || '')}"
          target="_blank" rel="noopener"
          style="font-size:12px;color:var(--text1);min-width:0;overflow:hidden;
            text-overflow:ellipsis;white-space:nowrap;text-decoration:none">${esc(d.report_nm || '')}</a>
      </div>`).join('')}
    </div>`
    : empty('최근 공시 데이터 없음')}`);

  // ── ③ 주요제품 매출구성 (최신 기간, %) ─────────────────────────────────
  let segHTML = '';
  {
    const rows = (segment || []).filter(r => r.category !== '합계');
    const periods = [...new Set(rows.map(r => `${r.bsns_year}.${r.quarter}`))];
    const lastKey = periods[periods.length - 1];
    const lastRows = rows.filter(r => `${r.bsns_year}.${r.quarter}` === lastKey);
    const total = lastRows.reduce((s, r) => s + (r.revenue || 0), 0);
    const COLORS = ['#2AABEE','#4ade80','#fb923c','#a78bfa','#f59e0b','#34d399','#f87171','#60a5fa'];
    const items = lastRows.map(r => ({
      name: r.category,
      pct: r.revenue_ratio ?? (total > 0 ? r.revenue / total * 100 : 0),
    })).sort((a, b) => b.pct - a.pct);

    segHTML = box(`
      <div style="display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:6px">
        ${secT('주요제품 매출구성')}
        ${lastKey ? `<span style="font-size:11px;color:var(--text3)">* 단위: % [기준: ${lastKey.replace('.', ' ')}]</span>` : ''}
      </div>
      ${items.length ? `
      <!-- 100% 스택 바 -->
      <div style="display:flex;height:14px;border-radius:4px;overflow:hidden;margin-bottom:12px;background:var(--border)">
        ${items.map((it, i) => `<div style="flex:${Math.max(it.pct, 0.5)};background:${COLORS[i % COLORS.length]}"
          title="${esc(it.name)} ${it.pct.toFixed(2)}%"></div>`).join('')}
      </div>
      <div style="display:flex;flex-direction:column;gap:7px">
        ${items.map((it, i) => `
        <div style="display:flex;align-items:center;gap:8px">
          <span style="width:9px;height:9px;border-radius:2px;background:${COLORS[i % COLORS.length]};flex-shrink:0"></span>
          <span style="font-size:12px;color:var(--text1);flex:1;min-width:0;overflow:hidden;
            text-overflow:ellipsis;white-space:nowrap">${esc(it.name)}</span>
          <div style="flex:2;height:5px;border-radius:3px;background:var(--border);overflow:hidden">
            <div style="height:100%;width:${Math.min(it.pct, 100)}%;background:${COLORS[i % COLORS.length]};border-radius:3px"></div>
          </div>
          <span style="font-size:12px;font-weight:700;color:var(--text1);width:52px;text-align:right;
            font-variant-numeric:tabular-nums">${it.pct.toFixed(2)}</span>
        </div>`).join('')}
      </div>`
      : empty('DART 업로드 시 제품별 매출구성이 표시됩니다')}`);
  }

  // ── ④ 내수 및 수출구성 ─────────────────────────────────────────────────
  let regionHTML = '';
  {
    const isDom = s => /내수|국내/.test(s || '');
    const isExp = s => /수출|해외/.test(s || '');
    // category/subcategory 중 내수·수출 축 자동 감지
    const axisInSub = (region || []).some(r => isDom(r.subcategory) || isExp(r.subcategory));
    const rows = (region || []).map(r => axisInSub
      ? { prod: r.category, axis: r.subcategory, ...r }
      : { prod: r.subcategory || r.category, axis: r.category, ...r })
      .filter(r => (isDom(r.axis) || isExp(r.axis)) && r.prod && r.prod !== '합계');

    const periods = [...new Set(rows.map(r => `${r.bsns_year}.${r.quarter}`))].slice(-3);
    const prods = [...new Set(rows.filter(r => periods.includes(`${r.bsns_year}.${r.quarter}`)).map(r => r.prod))];

    regionHTML = box(`
      <div style="display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:6px">
        ${secT('내수 및 수출구성')}
        <span style="font-size:11px;color:var(--text3)">* 단위: %</span>
      </div>
      ${prods.length ? `
      <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px;white-space:nowrap">
        <thead>
          <tr style="background:var(--bg3)">
            <th style="padding:6px 10px;text-align:left;color:var(--text2);font-weight:600;border-bottom:1px solid var(--border)">제품명</th>
            ${periods.map(p => `<th colspan="2" style="padding:6px 10px;text-align:center;color:var(--text2);
              font-weight:600;border-bottom:1px solid var(--border)">${p.replace('.', ' ')}</th>`).join('')}
          </tr>
          <tr style="background:var(--bg3)">
            <th style="border-bottom:1px solid var(--border)"></th>
            ${periods.map(() => `
              <th style="padding:4px 10px;text-align:right;color:var(--text3);font-weight:500;border-bottom:1px solid var(--border)">내수</th>
              <th style="padding:4px 10px;text-align:right;color:var(--text3);font-weight:500;border-bottom:1px solid var(--border)">수출</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${prods.map(pn => `<tr>
            <td style="padding:7px 10px;color:var(--text1);font-weight:600;border-bottom:1px solid var(--border)">${esc(pn)}</td>
            ${periods.map(p => {
              const pr = rows.filter(r => `${r.bsns_year}.${r.quarter}` === p && r.prod === pn);
              const dom = pr.filter(r => isDom(r.axis)).reduce((s, r) => s + (r.revenue || 0), 0);
              const exp = pr.filter(r => isExp(r.axis)).reduce((s, r) => s + (r.revenue || 0), 0);
              const tot = dom + exp;
              const cell = v => tot > 0 ? (v / tot * 100).toFixed(2) : '—';
              return `
                <td style="padding:7px 10px;text-align:right;color:var(--text1);
                  font-variant-numeric:tabular-nums;border-bottom:1px solid var(--border)">${cell(dom)}</td>
                <td style="padding:7px 10px;text-align:right;color:var(--tg);font-weight:600;
                  font-variant-numeric:tabular-nums;border-bottom:1px solid var(--border)">${cell(exp)}</td>`;
            }).join('')}
          </tr>`).join('')}
        </tbody>
      </table>
      </div>`
      : empty('DART 업로드 시 내수/수출 구성이 표시됩니다')}`);
  }

  // ── ⑤ 생산실적 및 가동률 ───────────────────────────────────────────────
  let prodHTML = '';
  {
    const periods = [...new Set((prod || []).map(r => `${r.bsns_year}.${r.quarter}`))];
    const lastKey = periods[periods.length - 1];
    const lastRows = (prod || []).filter(r => `${r.bsns_year}.${r.quarter}` === lastKey);

    prodHTML = box(`
      <div style="display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:6px">
        ${secT('생산능력 및 가동률')}
        ${lastKey ? `<span style="font-size:11px;color:var(--text3)">[기준: ${lastKey.replace('.', ' ')}]</span>` : ''}
      </div>
      ${lastRows.length ? `
      <div style="display:flex;flex-direction:column;gap:7px">
        ${lastRows.map(r => {
          const u = r.utilization_rate;
          const uCol = u == null ? 'var(--text3)' : u >= 90 ? '#f87171' : u >= 70 ? '#4ade80' : '#f59e0b';
          return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;
            background:var(--bg3);border-radius:var(--radius-sm);flex-wrap:wrap">
            <span style="font-size:12px;font-weight:700;color:var(--text1);min-width:90px">${esc(r.factory_name)}</span>
            <span style="font-size:12px;color:var(--text2)">생산능력 <b style="color:var(--text1)">${r.capacity != null ? fmtNum(r.capacity) : '—'}</b></span>
            <span style="font-size:12px;color:var(--text2)">생산실적 <b style="color:var(--text1)">${r.actual != null ? fmtNum(r.actual) : '—'}</b></span>
            <div style="margin-left:auto;display:flex;align-items:center;gap:8px;min-width:150px">
              <div style="flex:1;height:5px;border-radius:3px;background:var(--border);overflow:hidden">
                <div style="height:100%;width:${Math.min(u || 0, 100)}%;background:${uCol};border-radius:3px"></div>
              </div>
              <span style="font-size:12px;font-weight:700;color:${uCol};width:50px;text-align:right">
                ${u != null ? u.toFixed(1) + '%' : '—'}</span>
            </div>
          </div>`;
        }).join('')}
      </div>`
      : empty('DART 업로드 시 생산실적·가동률이 표시됩니다')}`);
  }

  // ── ⑥ 계열사 현황 ──────────────────────────────────────────────────────
  const subs = dp.subsidiaries || [];
  const fmtB = typeof _fmtBillions === 'function' ? _fmtBillions : (v => v != null ? fmtNum(v) : '—');
  const subsHTML = box(`
    ${secT('계열사 현황')}
    ${subs.length ? `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:7px">
      ${subs.map(s => {
        const isLoss = s.netIncome != null && s.netIncome < 0;
        return `<div style="padding:8px 12px;background:var(--bg3);border-radius:var(--radius-sm)">
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:12px;font-weight:700;color:var(--text1);min-width:0;overflow:hidden;
              text-overflow:ellipsis;white-space:nowrap;flex:1">${esc(s.name)}</span>
            ${s.note ? `<span style="font-size:11px;padding:1px 6px;border-radius:100px;
              background:#ef444420;color:#ef4444;font-weight:700;flex-shrink:0">${esc(s.note)}</span>` : ''}
          </div>
          <div style="display:flex;gap:12px;margin-top:3px;font-size:11px;color:var(--text2);flex-wrap:wrap">
            ${s.role ? `<span>${esc(s.role)}</span>` : ''}
            ${s.revenue != null ? `<span>매출 <b style="color:var(--text1)">${fmtB(s.revenue)}</b></span>` : ''}
            ${s.netIncome != null ? `<span>순손익 <b style="color:${isLoss ? 'var(--blue)' : 'var(--red)'}">${fmtB(s.netIncome)}</b></span>` : ''}
          </div>
        </div>`;
      }).join('')}
    </div>`
    : empty('DART 업로드 시 계열사 현황이 표시됩니다')}`);

  return `<div style="display:flex;flex-direction:column;gap:12px">
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:12px">
      ${infoHTML}
      ${discHTML}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:12px">
      ${segHTML}
      ${regionHTML}
    </div>
    ${prodHTML}
    ${subsHTML}
  </div>`;
}

// ═══ 재무분석 탭 (FnGuide c1030001 스타일) ═══════════════════════════════════
// 서브탭(포괄손익계산서/재무상태표/현금흐름표) + 연간/분기 토글 + 이중축 차트 + YoY/QoQ 상세표

const RPF = { stmt: 'is', view: 'annual', rows: [] };

async function _rpLoadAndRenderFinAnalysis(body) {
  if (!_rpStock || !body) return;
  try {
    const { data } = await sb.from('financials')
      .select('bsns_year,quarter,revenue,cogs,gross_profit,sga,rd_expense,operating_profit,other_operating_income,other_operating_expense,pretax_income,net_income,total_assets,current_assets,non_current_assets,total_liabilities,current_liabilities,total_equity,capital_stock,retained_earnings,operating_cashflow,investing_cashflow,financing_cashflow,capex,capex_intangible,capex_total,da,ebitda,fcf,operating_margin,net_margin,debt_ratio,current_ratio')
      .eq('stock_code', _rpStock.code).eq('fs_div', 'CFS')
      .order('bsns_year', { ascending: true }).order('quarter', { ascending: true });
    RPF.rows = data || [];
    RPF._annual = null; // 연간 합산 캐시 무효화
    RPF.stmt = 'is'; RPF.view = 'annual';
    if (!RPF.rows.length) {
      body.innerHTML = '<div style="color:var(--text2);padding:40px;text-align:center;font-size:12px">재무 데이터 없음</div>';
      return;
    }
    body.innerHTML = `
      <div style="display:flex;gap:6px;margin-bottom:12px;align-items:center;flex-wrap:wrap">
        <button id="rpf-st-is" class="chip active" onclick="rpfSet('stmt','is')">포괄손익계산서</button>
        <button id="rpf-st-bs" class="chip"        onclick="rpfSet('stmt','bs')">재무상태표</button>
        <button id="rpf-st-cf" class="chip"        onclick="rpfSet('stmt','cf')">현금흐름표</button>
        <div style="margin-left:auto;display:flex;gap:4px;align-items:center">
          <button id="rpf-vw-annual"  class="chip chip-sm active" onclick="rpfSet('view','annual')">연간</button>
          <button id="rpf-vw-quarter" class="chip chip-sm"        onclick="rpfSet('view','quarter')">분기</button>
          <span style="font-size:11px;color:var(--text3);margin-left:6px">* 단위: 억원, % · IFRS연결</span>
        </div>
      </div>
      <div id="rpf-body"></div>`;
    rpfRender();
  } catch (e) {
    body.innerHTML = `<div style="padding:20px;text-align:center;color:var(--red);font-size:12px">재무분석 로드 실패: ${e.message}</div>`;
  }
}

function rpfSet(key, val) {
  RPF[key] = val;
  ['is','bs','cf'].forEach(s => document.getElementById('rpf-st-' + s)?.classList.toggle('active', RPF.stmt === s));
  ['annual','quarter'].forEach(v => document.getElementById('rpf-vw-' + v)?.classList.toggle('active', RPF.view === v));
  rpfRender();
}

// 연간 합산용 컬럼 정의 (financials Q4는 분기 순액 — Q4 필터가 아닌 4분기 합산이 정답)
const RPF_FLOW_COLS = ['revenue','cogs','gross_profit','sga','rd_expense','operating_profit','other_operating_income','other_operating_expense','pretax_income','net_income','operating_cashflow','investing_cashflow','financing_cashflow','capex','capex_intangible','capex_total','da','ebitda','fcf'];
const RPF_STOCK_COLS = ['total_assets','current_assets','non_current_assets','total_liabilities','current_liabilities','total_equity','capital_stock','retained_earnings','debt_ratio','current_ratio'];

function _rpfAnnual() {
  if (!RPF._annual) RPF._annual = _rpAggAnnual(RPF.rows, { flow: RPF_FLOW_COLS, stock: RPF_STOCK_COLS });
  return RPF._annual;
}

// 표시 기간 목록 (연간=4분기 합산 최근 5개, 분기=최근 6개)
function _rpfPeriods() {
  return RPF.view === 'annual' ? _rpfAnnual().slice(-5) : RPF.rows.slice(-6);
}

// 직전 비교 행 (QoQ: 직전 분기 / YoY: 전년 동분기·전년)
function _rpfPrevRow(r, mode) {
  if (RPF.view === 'annual') {
    const a = _rpfAnnual();
    const prev = a[a.indexOf(r) - 1];
    return prev && Number(prev.bsns_year) === Number(r.bsns_year) - 1 ? prev : null;
  }
  if (mode === 'yoy') {
    return RPF.rows.find(x => String(x.bsns_year) === String(Number(r.bsns_year) - 1) && x.quarter === r.quarter) || null;
  }
  const idx = RPF.rows.indexOf(r);
  return idx > 0 ? RPF.rows[idx - 1] : null;
}

// 이익률 재계산 (저장값은 일부 행에서 누적/순액 기준 혼재 — 금액 기준 재계산 우선)
function _rpfOpm(r) { return r.revenue > 0 && r.operating_profit != null ? r.operating_profit / r.revenue * 100 : r.operating_margin; }
function _rpfNpm(r) { return r.revenue > 0 && r.net_income != null ? r.net_income / r.revenue * 100 : r.net_margin; }

// ── 이중축 그룹바+라인 SVG 차트 ──────────────────────────────────────────────
// bars: [{name,color,vals[]}] (좌축) / lines: [{name,color,vals[]}] (우축)
// opts: { barUnit:'억', lineUnit:'%', lineDec:1 }
function _rpfChart(title, labels, bars, lines, opts = {}) {
  const barUnit  = opts.barUnit  ?? '억';
  const lineUnit = opts.lineUnit ?? '%';
  const lineDec  = opts.lineDec  ?? 1;
  const n = labels.length;
  if (!n) return '';
  const W = 640, H = 170, TOP = 10, BOT = 20, PAD = 10;
  const plotH = H - TOP - BOT;

  const allBar = bars.flatMap(b => b.vals).filter(v => v != null && isFinite(v));
  let bMin = Math.min(0, ...allBar), bMax = Math.max(0, ...allBar);
  if (bMax === bMin) { bMax = bMin + 1; }
  const yB = v => TOP + (bMax - v) / (bMax - bMin) * plotH;

  const allLine = (lines || []).flatMap(l => l.vals).filter(v => v != null && isFinite(v));
  let lMin = Math.min(0, ...allLine), lMax = Math.max(...allLine, 1);
  if (lMax === lMin) lMax = lMin + 1;
  const yL = v => TOP + (lMax - v) / (lMax - lMin) * plotH;

  const groupW = (W - PAD * 2) / n;
  const bw = Math.min(20, groupW * 0.7 / Math.max(bars.length, 1));
  const x0 = i => PAD + i * groupW + groupW / 2;

  const barRects = bars.map((b, bi) => b.vals.map((v, i) => {
    if (v == null || !isFinite(v)) return '';
    const x = x0(i) - (bars.length * bw) / 2 + bi * bw;
    const y1 = yB(Math.max(v, 0)), y2 = yB(Math.min(v, 0));
    return `<rect x="${x.toFixed(1)}" y="${y1.toFixed(1)}" width="${(bw - 1.5).toFixed(1)}"
      height="${Math.max(y2 - y1, 1).toFixed(1)}" rx="1.5" fill="${b.color}" opacity=".85">
      <title>${b.name} ${labels[i]}: ${v.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}${barUnit}</title></rect>`;
  }).join('')).join('');

  const linePaths = (lines || []).map(l => {
    const pts = l.vals.map((v, i) => v != null && isFinite(v) ? `${x0(i).toFixed(1)},${yL(v).toFixed(1)}` : null).filter(Boolean);
    if (pts.length < 2) return '';
    return `<polyline points="${pts.join(' ')}" fill="none" stroke="${l.color}" stroke-width="2"
        stroke-linejoin="round" stroke-linecap="round"/>` +
      l.vals.map((v, i) => v != null && isFinite(v)
        ? `<circle cx="${x0(i).toFixed(1)}" cy="${yL(v).toFixed(1)}" r="2.8" fill="${l.color}">
            <title>${l.name} ${labels[i]}: ${v.toLocaleString('ko-KR', { maximumFractionDigits: lineDec })}${lineUnit}</title></circle>` : '').join('');
  }).join('');

  const legend = [...bars.map(b => ({ ...b, shape: 'rect' })), ...(lines || []).map(l => ({ ...l, shape: 'line' }))]
    .map(s => `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--text2)">
      ${s.shape === 'rect'
        ? `<span style="width:9px;height:9px;border-radius:2px;background:${s.color};display:inline-block"></span>`
        : `<span style="width:12px;height:2.5px;border-radius:2px;background:${s.color};display:inline-block"></span>`}
      ${s.name}</span>`).join('');

  return `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px 14px">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:6px">
      <span style="font-size:12px;font-weight:700;color:var(--text1)">${title}</span>
      <div style="display:flex;gap:10px;flex-wrap:wrap">${legend}</div>
    </div>
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block;overflow:visible">
      <line x1="${PAD}" y1="${yB(0).toFixed(1)}" x2="${W - PAD}" y2="${yB(0).toFixed(1)}"
        stroke="var(--border)" stroke-width="1"/>
      ${barRects}
      ${linePaths}
      ${labels.map((lb, i) => `<text x="${x0(i).toFixed(1)}" y="${H - 4}" font-size="9"
        fill="var(--text3)" text-anchor="middle">${lb}</text>`).join('')}
    </svg>
  </div>`;
}

// ── 계정과목 정의 ─────────────────────────────────────────────────────────────
function _rpfRowDefs() {
  const taxCalc = r => r.pretax_income != null && r.net_income != null ? r.pretax_income - r.net_income : null;
  const gpCalc  = r => r.gross_profit ?? (r.revenue != null && r.cogs != null ? r.revenue - r.cogs : null);
  const defs = {
    is: [
      { k: 'revenue',                 label: '매출액(수익)',          bold: 1 },
      { k: 'cogs',                    label: '매출원가',              ind: 1 },
      { k: '_gp',                     label: '매출총이익',            bold: 1, calc: gpCalc },
      { k: 'sga',                     label: '판매비와관리비',        ind: 1 },
      { k: 'rd_expense',              label: 'R&D비용',               ind: 2 },
      { k: 'operating_profit',        label: '영업이익',              bold: 1, sign: 1 },
      { k: 'other_operating_income',  label: '기타영업수익',          ind: 1 },
      { k: 'other_operating_expense', label: '기타영업비용',          ind: 1 },
      { k: 'pretax_income',           label: '법인세비용차감전이익' },
      { k: '_tax',                    label: '법인세비용(계산)',      ind: 1, calc: taxCalc },
      { k: 'net_income',              label: '당기순이익',            bold: 1, sign: 1 },
      { k: '_opm',                    label: '영업이익률',            pct: 1, calc: _rpfOpm },
      { k: '_npm',                    label: '순이익률',              pct: 1, calc: _rpfNpm },
    ],
    bs: [
      { k: 'total_assets',       label: '자산총계',   bold: 1 },
      { k: 'current_assets',     label: '유동자산',   ind: 1 },
      { k: 'non_current_assets', label: '비유동자산', ind: 1 },
      { k: 'total_liabilities',  label: '부채총계',   bold: 1 },
      { k: 'current_liabilities',label: '유동부채',   ind: 1 },
      { k: 'total_equity',       label: '자본총계',   bold: 1 },
      { k: 'capital_stock',      label: '자본금',     ind: 1 },
      { k: 'retained_earnings',  label: '이익잉여금', ind: 1 },
      { k: 'debt_ratio',         label: '부채비율',   pct: 1 },
      { k: 'current_ratio',      label: '유동비율',   pct: 1 },
    ],
    cf: [
      { k: 'operating_cashflow', label: '영업활동현금흐름', bold: 1, sign: 1 },
      { k: 'investing_cashflow', label: '투자활동현금흐름', sign: 1 },
      { k: 'financing_cashflow', label: '재무활동현금흐름', sign: 1 },
      { k: 'capex',              label: 'CAPEX(유형)',      ind: 1 },
      { k: 'capex_intangible',   label: 'CAPEX(무형)',      ind: 1 },
      { k: 'capex_total',        label: 'CAPEX 합계',       ind: 1 },
      { k: 'da',                 label: 'D&A',              ind: 1 },
      { k: 'ebitda',             label: 'EBITDA',           bold: 1, sign: 1 },
      { k: 'fcf',                label: 'FCF',              bold: 1, sign: 1 },
    ],
  };
  return defs[RPF.stmt] || defs.is;
}

// ── 렌더 ─────────────────────────────────────────────────────────────────────
function rpfRender() {
  const el = document.getElementById('rpf-body');
  if (!el) return;
  const periods = _rpfPeriods();
  if (!periods.length) {
    el.innerHTML = '<div style="color:var(--text2);padding:30px;text-align:center;font-size:12px">해당 뷰의 데이터 없음</div>';
    return;
  }
  const labels = periods.map(r => RPF.view === 'annual'
    ? String(r.bsns_year) : `${String(r.bsns_year).slice(2)} ${r.quarter}`);
  const eokV = v => v != null ? v / 1e8 : null;

  // ── 차트 (재무제표 종류별) ──
  let charts = '';
  if (RPF.stmt === 'is') {
    charts = _rpfChart('주요재무항목', labels,
      [
        { name: '매출액',     color: '#4a9eff', vals: periods.map(r => eokV(r.revenue)) },
        { name: '영업이익',   color: '#2AABEE', vals: periods.map(r => eokV(r.operating_profit)) },
        { name: '당기순이익', color: '#a78bfa', vals: periods.map(r => eokV(r.net_income)) },
      ],
      [
        { name: '영업이익률', color: '#f59e0b', vals: periods.map(_rpfOpm) },
        { name: '순이익률',   color: '#4ade80', vals: periods.map(_rpfNpm) },
      ]);
    // 수익성장성지표 (YoY %)
    const grow = key => periods.map(r => {
      const prev = _rpfPrevRow(r, 'yoy');
      const cur = r[key], old = prev?.[key];
      return cur != null && old != null && old !== 0 ? (cur - old) / Math.abs(old) * 100 : null;
    });
    charts += '<div style="height:10px"></div>' + _rpfChart('수익성장성지표 (YoY)', labels, [],
      [
        { name: '매출액증가율',   color: '#4a9eff', vals: grow('revenue') },
        { name: '영업이익증가율', color: '#f59e0b', vals: grow('operating_profit') },
        { name: '순이익증가율',   color: '#a78bfa', vals: grow('net_income') },
      ]);
  } else if (RPF.stmt === 'bs') {
    charts = _rpfChart('재무상태 주요항목', labels,
      [
        { name: '자산총계', color: '#4a9eff', vals: periods.map(r => eokV(r.total_assets)) },
        { name: '부채총계', color: '#f87171', vals: periods.map(r => eokV(r.total_liabilities)) },
        { name: '자본총계', color: '#4ade80', vals: periods.map(r => eokV(r.total_equity)) },
      ],
      [{ name: '부채비율', color: '#f59e0b', vals: periods.map(r => r.debt_ratio) }]);
  } else {
    charts = _rpfChart('현금흐름 주요항목', labels,
      [
        { name: '영업CF', color: '#4ade80', vals: periods.map(r => eokV(r.operating_cashflow)) },
        { name: '투자CF', color: '#f87171', vals: periods.map(r => eokV(r.investing_cashflow)) },
        { name: '재무CF', color: '#f59e0b', vals: periods.map(r => eokV(r.financing_cashflow)) },
        { name: 'FCF',    color: '#2AABEE', vals: periods.map(r => eokV(r.fcf)) },
      ], []);
  }

  // ── 상세 표 ──
  const eok = v => v == null ? '—'
    : (v / 1e8).toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const pctF = v => v == null ? '—' : v.toFixed(1);
  const growCell = (cur, old, isPct) => {
    if (cur == null || old == null) return '<span style="color:var(--text3)">—</span>';
    if (isPct) {
      const d = cur - old;
      const c = d > 0 ? 'var(--red)' : d < 0 ? 'var(--blue)' : 'var(--text3)';
      return `<span style="color:${c}">${d >= 0 ? '+' : ''}${d.toFixed(1)}p</span>`;
    }
    if (old === 0) return '<span style="color:var(--text3)">—</span>';
    const g = (cur - old) / Math.abs(old) * 100;
    const c = g > 0 ? 'var(--red)' : g < 0 ? 'var(--blue)' : 'var(--text3)';
    return `<span style="color:${c}">${g >= 0 ? '+' : ''}${g.toFixed(1)}</span>`;
  };

  const lastR = periods[periods.length - 1];
  const growCols = RPF.view === 'annual'
    ? [{ label: '전년대비<br>(YoY)', prev: _rpfPrevRow(lastR, 'yoy') }]
    : [{ label: '전분기대비<br>(QoQ)', prev: _rpfPrevRow(lastR, 'qoq') },
       { label: '전년동기대비<br>(YoY)', prev: _rpfPrevRow(lastR, 'yoy') }];

  const defs = _rpfRowDefs();
  const table = `
  <div style="overflow-x:auto;margin-top:12px">
    <table style="width:100%;border-collapse:collapse;font-size:12px;white-space:nowrap">
      <thead><tr style="background:var(--bg3)">
        <th style="padding:7px 10px;text-align:left;color:var(--text2);font-weight:600;
          border-bottom:1px solid var(--border);position:sticky;left:0;background:var(--bg3)">항목</th>
        ${labels.map((lb, i) => `<th style="padding:7px 10px;text-align:right;color:var(--text2);font-weight:600;
          border-bottom:1px solid var(--border);${i === labels.length - 1 ? 'color:var(--tg)' : ''}">${lb}</th>`).join('')}
        ${growCols.map(g => `<th style="padding:7px 10px;text-align:right;color:var(--text2);font-weight:600;
          border-bottom:1px solid var(--border);font-size:11px;line-height:1.3">${g.label}</th>`).join('')}
      </tr></thead>
      <tbody>
        ${defs.map(d => {
          const val = r => d.calc ? d.calc(r) : r[d.k];
          const cells = periods.map((r, i) => {
            const v = val(r);
            const col = d.sign && v != null && v < 0 ? 'var(--blue)' : 'var(--text1)';
            return `<td style="padding:6px 10px;text-align:right;font-variant-numeric:tabular-nums;
              border-bottom:1px solid var(--border);color:${col};
              ${d.bold ? 'font-weight:700' : ''};${i === periods.length - 1 ? 'background:var(--tg)0d' : ''}">
              ${d.pct ? pctF(v) : eok(v)}</td>`;
          }).join('');
          const gCells = growCols.map(g => `<td style="padding:6px 10px;text-align:right;font-weight:600;
            font-variant-numeric:tabular-nums;border-bottom:1px solid var(--border)">
            ${growCell(val(lastR), g.prev ? val(g.prev) : null, !!d.pct)}</td>`).join('');
          return `<tr>
            <td style="padding:6px 10px;color:var(--text1);border-bottom:1px solid var(--border);
              position:sticky;left:0;background:var(--bg2);
              ${d.bold ? 'font-weight:700' : ''};padding-left:${10 + (d.ind || 0) * 14}px">
              ${d.ind ? '<span style="color:var(--text3)">· </span>' : ''}${d.label}${d.pct ? ' <span style="color:var(--text3);font-size:11px">(%)</span>' : ''}</td>
            ${cells}${gCells}
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>
  <div style="font-size:11px;color:var(--text3);margin-top:6px">
    * 연간=분기 순액 4개 합산(완결 연도만, 재무상태표는 Q4 시점) · 이익률은 금액 기준 재계산 · 법인세비용은 세전이익-순이익 계산치 · 강조열은 최근 기간</div>`;

  el.innerHTML = charts + table;
}

// ═══ 투자지표 탭 (FnGuide c1040001 스타일) ═══════════════════════════════════
// 재무비율(수익성/성장성/안정성/활동성 서브탭) + 가치지표(주당·배수) — 연간/분기 토글

const RPI = { cat: 'profit', view: 'annual', rows: [], shares: null };

async function _rpLoadAndRenderInvMetrics(body) {
  if (!_rpStock || !body) return;
  try {
    const { data } = await sb.from('financials')
      .select('bsns_year,quarter,revenue,cogs,gross_profit,operating_profit,net_income,total_assets,total_equity,capital_stock,retained_earnings,operating_cashflow,ebitda,operating_margin,net_margin,gross_margin,roe,roa,debt_ratio,current_ratio')
      .eq('stock_code', _rpStock.code).eq('fs_div', 'CFS')
      .order('bsns_year', { ascending: true }).order('quarter', { ascending: true });
    RPI.rows = data || [];
    RPI._annual = null; // 연간 합산 캐시 무효화
    RPI.shares = _rpShares(_rpData.price?.[0]);
    RPI.cat = 'profit'; RPI.view = 'annual';
    if (!RPI.rows.length) {
      body.innerHTML = '<div style="color:var(--text2);padding:40px;text-align:center;font-size:12px">재무 데이터 없음</div>';
      return;
    }
    body.innerHTML = `
      <div style="display:flex;gap:6px;margin-bottom:12px;align-items:center;flex-wrap:wrap">
        <span style="font-size:13px;font-weight:700;color:var(--text1)">재무비율</span>
        <button id="rpi-cat-profit"    class="chip active" onclick="rpiSet('cat','profit')">수익성</button>
        <button id="rpi-cat-growth"    class="chip"        onclick="rpiSet('cat','growth')">성장성</button>
        <button id="rpi-cat-stability" class="chip"        onclick="rpiSet('cat','stability')">안정성</button>
        <button id="rpi-cat-activity"  class="chip"        onclick="rpiSet('cat','activity')">활동성</button>
        <div style="margin-left:auto;display:flex;gap:4px;align-items:center">
          <button id="rpi-vw-annual"  class="chip chip-sm active" onclick="rpiSet('view','annual')">연간</button>
          <button id="rpi-vw-quarter" class="chip chip-sm"        onclick="rpiSet('view','quarter')">분기</button>
          <span style="font-size:11px;color:var(--text3);margin-left:6px">* 단위: %, %p, 원, 배 · IFRS연결</span>
        </div>
      </div>
      <div id="rpi-ratio-body"></div>
      <div style="display:flex;align-items:center;gap:8px;margin:18px 0 12px">
        <span style="font-size:13px;font-weight:700;color:var(--text1)">가치지표</span>
        <span style="font-size:11px;color:var(--text3)">주당지표는 현재 발행주식수(시총÷주가) 기준 추정</span>
      </div>
      <div id="rpi-value-body"></div>`;
    rpiRender();
  } catch (e) {
    body.innerHTML = `<div style="padding:20px;text-align:center;color:var(--red);font-size:12px">투자지표 로드 실패: ${e.message}</div>`;
  }
}

function rpiSet(key, val) {
  RPI[key] = val;
  ['profit','growth','stability','activity'].forEach(c =>
    document.getElementById('rpi-cat-' + c)?.classList.toggle('active', RPI.cat === c));
  ['annual','quarter'].forEach(v =>
    document.getElementById('rpi-vw-' + v)?.classList.toggle('active', RPI.view === v));
  rpiRender();
}

function _rpiAnnual() {
  if (!RPI._annual) RPI._annual = _rpAggAnnual(RPI.rows, {
    flow:  ['revenue','cogs','gross_profit','operating_profit','net_income','operating_cashflow','ebitda'],
    stock: ['total_assets','total_equity','capital_stock','retained_earnings','debt_ratio','current_ratio'],
  });
  return RPI._annual;
}
function _rpiPeriods() {
  return RPI.view === 'annual' ? _rpiAnnual().slice(-5) : RPI.rows.slice(-6);
}
function _rpiPrev(r, mode) {
  if (RPI.view === 'annual') {
    const a = _rpiAnnual();
    const prev = a[a.indexOf(r) - 1];
    return prev && Number(prev.bsns_year) === Number(r.bsns_year) - 1 ? prev : null;
  }
  if (mode === 'yoy') {
    return RPI.rows.find(x => String(x.bsns_year) === String(Number(r.bsns_year) - 1) && x.quarter === r.quarter) || null;
  }
  const idx = RPI.rows.indexOf(r);
  return idx > 0 ? RPI.rows[idx - 1] : null;
}

// ── 지표 정의 ────────────────────────────────────────────────────────────────
// fmt: pct(%·소수2) | won(원) | x(배) — grow: pp(%p차) | pct(증감률%)
function _rpiDefs() {
  const S = RPI.shares;
  const gm  = r => {
    const gp = r.gross_profit ?? (r.revenue != null && r.cogs != null ? r.revenue - r.cogs : null);
    return r.revenue > 0 && gp != null ? gp / r.revenue * 100 : r.gross_margin;
  };
  const em  = r => r.revenue > 0 && r.ebitda != null ? r.ebitda / r.revenue * 100 : null;
  const eqR = r => r.total_assets > 0 && r.total_equity != null ? r.total_equity / r.total_assets * 100 : null;
  const rsv = r => r.capital_stock > 0 && r.retained_earnings != null ? r.retained_earnings / r.capital_stock * 100 : null;
  const grow = key => r => {
    const p = _rpiPrev(r, 'yoy');
    return r[key] != null && p?.[key] != null && p[key] !== 0
      ? (r[key] - p[key]) / Math.abs(p[key]) * 100 : null;
  };
  const turn = key => r => {
    const p = _rpiPrev(r, RPI.view === 'annual' ? 'yoy' : 'qoq');
    const avg = r[key] != null ? (p?.[key] != null ? (r[key] + p[key]) / 2 : r[key]) : null;
    return avg > 0 && r.revenue != null ? r.revenue / avg : null;
  };
  const defs = {
    profit: [
      { label: '매출총이익률',  v: gm,       fmt: 'pct', grow: 'pp' },
      { label: '영업이익률',    v: _rpfOpm,  fmt: 'pct', grow: 'pp', bold: 1 },
      { label: '순이익률',      v: _rpfNpm,  fmt: 'pct', grow: 'pp' },
      { label: 'EBITDA마진율',  v: em,       fmt: 'pct', grow: 'pp' },
      { label: 'ROE',           v: r => r.roe, fmt: 'pct', grow: 'pp', bold: 1 },
      { label: 'ROA',           v: r => r.roa, fmt: 'pct', grow: 'pp' },
    ],
    growth: [
      { label: '매출액증가율',    v: grow('revenue'),          fmt: 'pct', grow: 'pp', bold: 1 },
      { label: '영업이익증가율',  v: grow('operating_profit'), fmt: 'pct', grow: 'pp' },
      { label: '순이익증가율',    v: grow('net_income'),       fmt: 'pct', grow: 'pp' },
      { label: '총자산증가율',    v: grow('total_assets'),     fmt: 'pct', grow: 'pp' },
      { label: '자기자본증가율',  v: grow('total_equity'),     fmt: 'pct', grow: 'pp' },
    ],
    stability: [
      { label: '부채비율',        v: r => r.debt_ratio,    fmt: 'pct', grow: 'pp', bold: 1 },
      { label: '유동비율',        v: r => r.current_ratio, fmt: 'pct', grow: 'pp' },
      { label: '자기자본비율',    v: eqR,                  fmt: 'pct', grow: 'pp' },
      { label: '유보율(근사)',    v: rsv,                  fmt: 'pct', grow: 'pp' },
    ],
    activity: [
      { label: '총자산회전율',    v: turn('total_assets'), fmt: 'x', grow: 'pp', unit: '회', bold: 1 },
      { label: '자기자본회전율',  v: turn('total_equity'), fmt: 'x', grow: 'pp', unit: '회' },
    ],
    value: [
      { label: 'EPS', v: r => S && r.net_income != null ? r.net_income / S : null,         fmt: 'won', grow: 'pct', bold: 1 },
      { label: 'BPS', v: r => S && r.total_equity != null ? r.total_equity / S : null,      fmt: 'won', grow: 'pct' },
      { label: 'CPS', v: r => S && r.operating_cashflow != null ? r.operating_cashflow / S : null, fmt: 'won', grow: 'pct' },
      { label: 'SPS', v: r => S && r.revenue != null ? r.revenue / S : null,                fmt: 'won', grow: 'pct' },
    ],
  };
  return defs;
}

// ── 지표 표 빌더 (기간 컬럼 + YoY/QoQ 증감) ─────────────────────────────────
function _rpiTable(defs, periods, labels) {
  const fmtV = (d, v) => {
    if (v == null || !isFinite(v)) return '—';
    if (d.fmt === 'won') return fmtNum(v);
    return v.toFixed(2);
  };
  const growCell = (d, cur, old) => {
    if (cur == null || old == null || !isFinite(cur) || !isFinite(old)) return '<span style="color:var(--text3)">—</span>';
    let g, suffix = '';
    if (d.grow === 'pp') { g = cur - old; suffix = 'p'; }
    else { if (old === 0) return '<span style="color:var(--text3)">—</span>'; g = (cur - old) / Math.abs(old) * 100; }
    const c = g > 0 ? 'var(--red)' : g < 0 ? 'var(--blue)' : 'var(--text3)';
    return `<span style="color:${c}">${g >= 0 ? '+' : ''}${g.toFixed(d.grow === 'pp' ? 2 : 1)}${suffix}</span>`;
  };
  const lastR = periods[periods.length - 1];
  const growCols = RPI.view === 'annual'
    ? [{ label: '전년대비<br>(YoY)', prev: _rpiPrev(lastR, 'yoy') }]
    : [{ label: '전분기대비<br>(QoQ)', prev: _rpiPrev(lastR, 'qoq') },
       { label: '전년동기대비<br>(YoY)', prev: _rpiPrev(lastR, 'yoy') }];

  return `<div style="overflow-x:auto;margin-top:12px">
    <table style="width:100%;border-collapse:collapse;font-size:12px;white-space:nowrap">
      <thead><tr style="background:var(--bg3)">
        <th style="padding:7px 10px;text-align:left;color:var(--text2);font-weight:600;
          border-bottom:1px solid var(--border);position:sticky;left:0;background:var(--bg3)">항목</th>
        ${labels.map((lb, i) => `<th style="padding:7px 10px;text-align:right;color:var(--text2);font-weight:600;
          border-bottom:1px solid var(--border);${i === labels.length - 1 ? 'color:var(--tg)' : ''}">${lb}</th>`).join('')}
        ${growCols.map(g => `<th style="padding:7px 10px;text-align:right;color:var(--text2);font-weight:600;
          border-bottom:1px solid var(--border);font-size:11px;line-height:1.3">${g.label}</th>`).join('')}
      </tr></thead>
      <tbody>
        ${defs.map(d => {
          const unit = d.unit ?? (d.fmt === 'pct' ? '%' : d.fmt === 'won' ? '원' : '배');
          const cells = periods.map((r, i) => {
            const v = d.v(r);
            const col = v != null && v < 0 ? 'var(--blue)' : 'var(--text1)';
            return `<td style="padding:6px 10px;text-align:right;font-variant-numeric:tabular-nums;
              border-bottom:1px solid var(--border);color:${col};${d.bold ? 'font-weight:700' : ''};
              ${i === periods.length - 1 ? 'background:var(--tg)0d' : ''}">${fmtV(d, v)}</td>`;
          }).join('');
          const gCells = growCols.map(g => `<td style="padding:6px 10px;text-align:right;font-weight:600;
            font-variant-numeric:tabular-nums;border-bottom:1px solid var(--border)">
            ${growCell(d, d.v(lastR), g.prev ? d.v(g.prev) : null)}</td>`).join('');
          return `<tr>
            <td style="padding:6px 10px;color:var(--text1);border-bottom:1px solid var(--border);
              position:sticky;left:0;background:var(--bg2);${d.bold ? 'font-weight:700' : ''}">
              ${d.label} <span style="color:var(--text3);font-size:11px">(${unit})</span></td>
            ${cells}${gCells}
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;
}

function rpiRender() {
  const ratioEl = document.getElementById('rpi-ratio-body');
  const valueEl = document.getElementById('rpi-value-body');
  if (!ratioEl || !valueEl) return;
  const periods = _rpiPeriods();
  if (!periods.length) {
    ratioEl.innerHTML = '<div style="color:var(--text2);padding:30px;text-align:center;font-size:12px">해당 뷰의 데이터 없음</div>';
    valueEl.innerHTML = '';
    return;
  }
  const labels = periods.map(r => RPI.view === 'annual'
    ? String(r.bsns_year) : `${String(r.bsns_year).slice(2)} ${r.quarter}`);
  const defs = _rpiDefs();
  const eokV = v => v != null ? v / 1e8 : null;
  const seriesOf = d => periods.map(r => d.v(r));
  const byLabel = (cat, lb) => defs[cat].find(d => d.label === lb);

  // ── 재무비율 차트 ──
  let charts = '';
  if (RPI.cat === 'profit') {
    charts = _rpfChart('수익성지표', labels,
      [{ name: '매출액', color: '#4a9eff', vals: periods.map(r => eokV(r.revenue)) }],
      [
        { name: '영업이익률', color: '#f59e0b', vals: seriesOf(byLabel('profit','영업이익률')) },
        { name: '순이익률',   color: '#4ade80', vals: seriesOf(byLabel('profit','순이익률')) },
      ]);
    charts += '<div style="height:10px"></div>' + _rpfChart('투자수익률', labels,
      [{ name: '당기순이익', color: '#a78bfa', vals: periods.map(r => eokV(r.net_income)) }],
      [
        { name: 'ROE', color: '#f59e0b', vals: seriesOf(byLabel('profit','ROE')) },
        { name: 'ROA', color: '#2AABEE', vals: seriesOf(byLabel('profit','ROA')) },
      ]);
  } else if (RPI.cat === 'growth') {
    charts = _rpfChart('성장성지표 (YoY)', labels, [],
      ['매출액증가율','영업이익증가율','순이익증가율'].map((lb, i) => ({
        name: lb, color: ['#4a9eff','#f59e0b','#a78bfa'][i], vals: seriesOf(byLabel('growth', lb)) })));
  } else if (RPI.cat === 'stability') {
    charts = _rpfChart('안정성지표', labels, [],
      ['부채비율','유동비율','자기자본비율'].map((lb, i) => ({
        name: lb, color: ['#f87171','#4ade80','#2AABEE'][i], vals: seriesOf(byLabel('stability', lb)) })));
  } else {
    charts = _rpfChart('활동성지표', labels, [],
      ['총자산회전율','자기자본회전율'].map((lb, i) => ({
        name: lb, color: ['#4a9eff','#f59e0b'][i], vals: seriesOf(byLabel('activity', lb)) })),
      { lineUnit: '회', lineDec: 2 });
  }
  ratioEl.innerHTML = charts + _rpiTable(defs[RPI.cat], periods, labels);

  // ── 가치지표 (차트 2 + 표) ──
  const vCharts = _rpfChart('주당지표', labels, [],
    ['EPS','BPS','SPS'].map((lb, i) => ({
      name: lb, color: ['#2AABEE','#4ade80','#f59e0b'][i], vals: seriesOf(byLabel('value', lb)) })),
    { lineUnit: '원', lineDec: 0 });
  valueEl.innerHTML = vCharts + _rpiTable(defs.value, periods, labels)
    + `<div style="font-size:11px;color:var(--text3);margin-top:6px">
      * 주당지표(EPS/BPS/CPS/SPS)는 현재 발행주식수 고정 가정 · 현재 PER/PBR은 상단 지표 밴드 참고 —
      과거 배수(PER/PBR/PSR) 히스토리·DPS/배당지표는 시세 데이터 축적·수집 후 제공</div>`;
}

