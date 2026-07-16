// 기업 분석 리포트 — 서브 컴포넌트 카드 (의견배지·증권사·실적·종합판단·세그먼트·밸류에이션·재무건전성·수급·카탈리스트) (report.js에서 분할)

// ── 서브 컴포넌트 ─────────────────────────────────────────────────────────────

// 인라인 배지 (가로 레이아웃용 — 작고 컴팩트)
function _rpOpinionBadgeInline(opinion) {
  const map = {
    'buy':'#22c55e','적극매수':'#22c55e','매수':'#22c55e',
    'hold':'#f59e0b','보유':'#f59e0b','중립':'#f59e0b',
    'sell':'#ef4444','매도':'#ef4444',
  };
  const label = { 'buy':'BUY','매수':'BUY','적극매수':'BUY','hold':'HOLD','보유':'HOLD','중립':'HOLD','sell':'SELL','매도':'SELL' };
  const key = opinion?.toLowerCase();
  const col = map[key] || 'var(--text3)';
  const lbl = label[key] || (opinion || '—');
  return `<span style="font-size:12px;font-weight:800;color:${col};padding:3px 10px;
    border-radius:100px;background:${col}20;border:1px solid ${col}50">${lbl}</span>`;
}

// 증권사 목표주가 세로 목록 (카드 우측 배치용)
function _rpAnalystList(analysts, currentPrice) {
  const opMap = { '매수':'BUY','적극매수':'BUY','중립':'HOLD','보유':'HOLD','매도':'SELL' };
  const colMap = { BUY:'#22c55e', HOLD:'#f59e0b', SELL:'#ef4444' };

  if (!analysts?.length) return `
    <div style="display:flex;align-items:center;justify-content:center;color:var(--text1);font-size:12px">
      증권사 의견 없음
    </div>`;

  const seen = new Set();
  const items = analysts.filter(a => { if (seen.has(a.firm_name)) return false; seen.add(a.firm_name); return true; });
  const tps   = items.filter(a => a.target_price > 0).map(a => a.target_price);
  const avgTp = tps.length ? Math.round(tps.reduce((s,v)=>s+v,0)/tps.length) : null;
  const avgGap = avgTp && currentPrice ? ((avgTp - currentPrice) / currentPrice * 100) : null;

  return `<div style="display:flex;flex-direction:column;gap:0;min-width:0;height:100%">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <span style="font-size:11px;font-weight:700;color:var(--text1)">증권사 목표주가</span>
      ${avgTp ? `<span style="font-size:11px;color:var(--text1)">
        평균 <b style="color:var(--text1)">${fmtNum(avgTp)}원</b>
        ${avgGap != null ? `<span style="font-weight:700;color:${avgGap>0?'var(--red)':'var(--blue)'}">
          ${avgGap>0?'▲':'▼'}${Math.abs(avgGap).toFixed(1)}%</span>` : ''}
      </span>` : ''}
    </div>
    <div style="display:flex;flex-direction:column;gap:4px;overflow-y:auto;flex:1">
      ${items.map(a => {
        const op   = opMap[a.opinion] || a.opinion || '—';
        const col  = colMap[op] || 'var(--text2)';
        // 가격: 만원 단위로 압축 (480,000 → 48만)
        const tp   = a.target_price ? Math.round(a.target_price/10000)+'만원' : '—';
        const gap  = a.gap_rate;
        const gCol = gap > 0 ? 'var(--red)' : gap < 0 ? 'var(--blue)' : 'var(--text2)';
        const gStr = gap != null ? (gap>=0?'+':'')+gap.toFixed(1)+'%' : '';
        return `<div style="display:grid;grid-template-columns:34px 1fr 42px 44px;
          align-items:center;gap:5px;padding:5px 8px;
          border-radius:var(--radius-sm);background:var(--bg3)">
          <span style="font-size:11px;font-weight:800;color:${col}">${op}</span>
          <span style="font-size:12px;color:var(--text1);min-width:0;overflow:hidden;
            text-overflow:ellipsis;white-space:nowrap">${a.firm_name||''}</span>
          <span style="font-size:12px;font-weight:700;color:var(--text1);
            text-align:right;white-space:nowrap">${tp}</span>
          <span style="font-size:12px;font-weight:700;color:${gCol};
            text-align:right;white-space:nowrap">${gStr}</span>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

// 증권사 목표주가 가로 그리드
function _rpAnalystGrid(analysts, currentPrice) {
  const opMap = { '매수':'BUY','적극매수':'BUY','중립':'HOLD','보유':'HOLD','매도':'SELL' };
  const colMap = { BUY:'#22c55e', HOLD:'#f59e0b', SELL:'#ef4444' };

  if (!analysts?.length) return `
    <div style="border-top:1px solid var(--border);padding-top:10px">
      <div style="font-size:11px;font-weight:700;color:var(--text1);margin-bottom:6px">증권사 목표주가</div>
      <div style="font-size:12px;color:var(--text1);padding:8px 0">등록된 증권사 의견이 없습니다</div>
    </div>`;

  // 증권사별 최신 1건만
  const seen = new Set();
  const latest = analysts.filter(a => { if (seen.has(a.firm_name)) return false; seen.add(a.firm_name); return true; });

  // 평균 목표주가
  const tps = latest.filter(a => a.target_price > 0).map(a => a.target_price);
  const avgTp = tps.length ? Math.round(tps.reduce((s,v) => s+v, 0) / tps.length) : null;
  const avgGap = avgTp && currentPrice ? ((avgTp - currentPrice) / currentPrice * 100) : null;

  return `
    <div style="border-top:1px solid var(--border);padding-top:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <span style="font-size:11px;font-weight:700;color:var(--text1)">증권사 목표주가</span>
        ${avgTp ? `<span style="font-size:11px;color:var(--text1)">
          평균 <b style="color:var(--text1)">${fmtNum(avgTp)}원</b>
          ${avgGap != null ? `<span style="margin-left:4px;font-weight:700;
            color:${avgGap>0?'var(--red)':'var(--blue)'}">${avgGap>0?'▲':'▼'}${Math.abs(avgGap).toFixed(1)}%</span>` : ''}
        </span>` : ''}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(82px,1fr));gap:6px">
        ${latest.map(a => {
          const op  = opMap[a.opinion] || a.opinion || '—';
          const col = colMap[op] || 'var(--text2)';
          const tp  = a.target_price ? fmtNum(a.target_price) : '—';
          const gap = a.gap_rate;
          const gCol = gap > 0 ? 'var(--red)' : gap < 0 ? 'var(--blue)' : 'var(--text2)';
          const gStr = gap != null ? (gap >= 0 ? '▲+' : '▼') + Math.abs(gap).toFixed(1) + '%' : '';
          const dt  = a.opinion_date ? a.opinion_date.slice(2,10).replace(/-/g,'.') : '';
          return `<div style="padding:8px 6px;border-radius:var(--radius-sm);background:var(--bg3);
            border:1px solid ${col}30;text-align:center">
            <div style="font-size:11px;color:var(--text1);overflow:hidden;text-overflow:ellipsis;
              white-space:nowrap;margin-bottom:4px">${a.firm_name||''}</div>
            <div style="font-size:11px;font-weight:800;color:${col};margin-bottom:3px">${op}</div>
            <div style="font-size:13px;font-weight:700;color:var(--text1);margin-bottom:2px">${tp}</div>
            ${tp !== '—' ? `<div style="font-size:11px;color:var(--text1);margin-bottom:1px">원</div>` : ''}
            ${gStr ? `<div style="font-size:11px;font-weight:700;color:${gCol}">${gStr}</div>` : ''}
            <div style="font-size:11px;color:var(--text1);margin-top:3px;opacity:.7">${dt}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

function _rpOpinionBadge(opinion) {
  const map = {
    'buy':    { label: 'BUY',    color: '#22c55e', bg: '#22c55e20', icon: '★' },
    'hold':   { label: 'HOLD',   color: '#f59e0b', bg: '#f59e0b20', icon: '◆' },
    'sell':   { label: 'SELL',   color: '#ef4444', bg: '#ef444420', icon: '▼' },
    '매수':   { label: 'BUY',    color: '#22c55e', bg: '#22c55e20', icon: '★' },
    '보유':   { label: 'HOLD',   color: '#f59e0b', bg: '#f59e0b20', icon: '◆' },
    '매도':   { label: 'SELL',   color: '#ef4444', bg: '#ef444420', icon: '▼' },
  };
  const o = map[opinion?.toLowerCase()] || map['hold'];
  return `<div style="text-align:center;padding:12px 8px;border-radius:var(--radius-sm);
    background:${o.bg};border:1.5px solid ${o.color}40">
    <div style="font-size:24px;color:${o.color};margin-bottom:2px">${o.icon}</div>
    <div style="font-size:18px;font-weight:800;color:${o.color};letter-spacing:1px">${o.label}</div>
  </div>`;
}

function _rpFormatNote(note) {
  if (!note) return '';
  return note.split('\n').filter(l => l.trim()).slice(0, 5).map(line =>
    `<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:4px">
      <span style="color:#4ade80;font-weight:700;font-size:12px;margin-top:1px">•</span>
      <span>${line.trim()}</span>
    </div>`
  ).join('');
}

function _rpEarningsCard(fin) {
  if (!fin?.length) return `
    <div class="card" style="padding:16px">
      ${_rpSecT('분기 실적 트렌드')}
      <div style="padding:20px;text-align:center;color:var(--text3);font-size:12px">재무 데이터 없음</div>
    </div>`;

  // 최신순으로 정렬된 fin → 오래된 것부터 표시
  const items = [...fin].reverse();
  const maxRev = Math.max(...items.map(f => f.revenue || 0));
  const maxOp  = Math.max(...items.map(f => Math.abs(f.operating_profit || 0)));
  const CHART_H = 100; // 차트 높이(px)

  const yoy    = fin.length >= 2 && fin[0].revenue && fin[1].revenue
    ? (fin[0].revenue - fin[1].revenue) / fin[1].revenue * 100 : null;
  const opYoy  = fin.length >= 2 && fin[1].operating_profit
    ? (fin[0].operating_profit - fin[1].operating_profit) / Math.abs(fin[1].operating_profit) * 100 : null;
  const opMargin = fin[0]?.revenue > 0
    ? (fin[0].operating_profit || 0) / fin[0].revenue * 100 : null;

  // 핵심 KPI chips 생성
  const chip = (label, value, color) => value != null ? `
    <span style="display:inline-flex;align-items:center;gap:4px;padding:3px 9px;
      border-radius:100px;background:${color}18;border:1px solid ${color}40;white-space:nowrap">
      <span style="font-size:11px;color:var(--text1)">${label}</span>
      <span style="font-size:12px;font-weight:700;color:${color}">${value}</span>
    </span>` : '';

  return `<div class="card" style="padding:16px">

    <!-- ① 타이틀 + KPI chips -->
    ${_rpSecT('분기 실적 트렌드', '* 단위: 억원, %')}
    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:14px">
      ${chip('매출 YoY', yoy != null ? (yoy>=0?'+':'')+yoy.toFixed(1)+'%' : null, yoy>=0?'var(--red)':'var(--blue)')}
      ${chip('영업이익 YoY', opYoy != null ? (opYoy>=0?'+':'')+opYoy.toFixed(1)+'%' : null, opYoy>=0?'var(--red)':'var(--blue)')}
      ${chip('영업이익률', opMargin != null ? opMargin.toFixed(1)+'%' : null, opMargin >= 15 ? '#4ade80' : opMargin >= 5 ? 'var(--text2)' : 'var(--red)')}
      ${chip('최근 매출', fmtCap(fin[0].revenue||0), 'var(--text2)')}
    </div>

    <!-- ② 바 차트 -->
    <div style="display:flex;align-items:flex-end;gap:6px;height:${CHART_H}px">
      ${items.map(f => {
        const rev  = f.revenue || 0;
        const op   = f.operating_profit || 0;
        const revH = maxRev > 0 ? Math.max(4, Math.round(rev / maxRev * CHART_H)) : 4;
        const opH  = maxOp  > 0 ? Math.max(4, Math.round(Math.abs(op) / maxOp * CHART_H)) : 4;
        const opC  = op >= 0 ? '#2AABEE' : '#f5365c';
        return `<div style="flex:1;min-width:0;display:flex;gap:2px;align-items:flex-end;height:${CHART_H}px">
          <div style="flex:1;min-width:0;background:#4a9eff44;border-radius:3px 3px 0 0;height:${revH}px"
            title="매출 ${fmtCap(rev)}"></div>
          <div style="flex:1;min-width:0;background:${opC};opacity:.8;border-radius:3px 3px 0 0;height:${opH}px"
            title="영업이익 ${op<0?'▼':''}${fmtCap(Math.abs(op))}"></div>
        </div>`;
      }).join('')}
    </div>

    <!-- 기간 라벨 -->
    <div style="display:flex;gap:6px;margin-top:6px">
      ${items.map(f => `
        <div style="flex:1;min-width:0;text-align:center">
          <div style="font-size:11px;font-weight:600;color:var(--text1)">${f.bsns_year||''}</div>
          <div style="font-size:12px;color:var(--text1)">${f.quarter||''}</div>
        </div>`).join('')}
    </div>

    <!-- 범례 -->
    <div style="display:flex;gap:12px;font-size:11px;color:var(--text1);margin-top:8px">
      <span style="display:flex;align-items:center;gap:4px">
        <span style="width:9px;height:9px;background:#4a9eff55;border-radius:2px;display:inline-block"></span>매출
      </span>
      <span style="display:flex;align-items:center;gap:4px">
        <span style="width:9px;height:9px;background:#2AABEE;border-radius:2px;display:inline-block"></span>영업이익
      </span>
    </div>

    <!-- 실적 수치 테이블 -->
    <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border);overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px;white-space:nowrap">
        <thead>
          <tr style="background:var(--bg3)">
            <th style="padding:6px 8px;text-align:left;color:var(--text1);font-weight:600;
              border-bottom:1px solid var(--border);width:80px">항목</th>
            ${items.map(f => `
              <th style="padding:6px 8px;text-align:right;color:var(--text1);font-weight:600;
                border-bottom:1px solid var(--border)">
                <div>${f.bsns_year||''}</div>
                <div style="color:var(--tg);font-weight:700">${f.quarter||''}</div>
              </th>`).join('')}
          </tr>
        </thead>
        <tbody>
          <!-- 매출 -->
          <tr>
            <td style="padding:6px 8px;color:var(--text1);border-bottom:1px solid var(--border)10;
              display:flex;align-items:center;gap:5px">
              <span style="width:8px;height:8px;border-radius:2px;background:#4a9eff55;flex-shrink:0"></span>매출
            </td>
            ${items.map(f => `
              <td style="padding:6px 8px;text-align:right;color:var(--text1);font-weight:600;
                border-bottom:1px solid var(--border)10">
                ${fmtCap(f.revenue||0)}
              </td>`).join('')}
          </tr>
          <!-- 영업이익 -->
          <tr>
            <td style="padding:6px 8px;color:var(--text1);border-bottom:1px solid var(--border)10;
              display:flex;align-items:center;gap:5px">
              <span style="width:8px;height:8px;border-radius:2px;background:#2AABEE;flex-shrink:0"></span>영업이익
            </td>
            ${items.map(f => {
              const op = f.operating_profit || 0;
              const col = op >= 0 ? 'var(--text1)' : 'var(--blue)';
              return `<td style="padding:6px 8px;text-align:right;color:${col};font-weight:600;
                border-bottom:1px solid var(--border)10">
                ${op < 0 ? '▼' : ''}${fmtCap(Math.abs(op))}
              </td>`;
            }).join('')}
          </tr>
          <!-- 순이익 -->
          ${items.some(f => f.net_income != null) ? `
          <tr>
            <td style="padding:6px 8px;color:var(--text1);border-bottom:1px solid var(--border)10;
              display:flex;align-items:center;gap:5px">
              <span style="width:8px;height:8px;border-radius:2px;background:#a78bfa;flex-shrink:0"></span>순이익
            </td>
            ${items.map(f => {
              const ni = f.net_income;
              if (ni == null) return `<td style="padding:6px 8px;text-align:right;color:var(--text1);
                border-bottom:1px solid var(--border)10">—</td>`;
              const col = ni >= 0 ? 'var(--text1)' : 'var(--blue)';
              return `<td style="padding:6px 8px;text-align:right;color:${col};font-weight:600;
                border-bottom:1px solid var(--border)10">
                ${ni < 0 ? '▼' : ''}${fmtCap(Math.abs(ni))}
              </td>`;
            }).join('')}
          </tr>` : ''}
          <!-- 영업이익률 -->
          <tr>
            <td style="padding:6px 8px;color:var(--text1);display:flex;align-items:center;gap:5px">
              <span style="width:8px;height:8px;border-radius:2px;background:var(--border);flex-shrink:0"></span>영업이익률
            </td>
            ${items.map(f => {
              const m = f.revenue > 0 ? (f.operating_profit||0) / f.revenue * 100 : null;
              const col = m == null ? 'var(--text2)' : m >= 10 ? '#4ade80' : m >= 0 ? 'var(--text1)' : 'var(--blue)';
              return `<td style="padding:6px 8px;text-align:right;color:${col};font-weight:600">
                ${m != null ? m.toFixed(1)+'%' : '—'}
              </td>`;
            }).join('')}
          </tr>
        </tbody>
      </table>
    </div>
  </div>`;
}

// ── 종합 투자 판단 (펀드매니저 관점) ─────────────────────────────────────────
function _rpSynthesis(latestF, latest, fin) {
  const per = latest?.per, pbr = latest?.pbr;
  const roe = latestF?.roe, roa = latestF?.roa;
  const opm = latestF?.operating_margin, npm = latestF?.net_margin;
  const debt = latestF?.debt_ratio;
  const prev = fin?.[1];

  // QoQ 추세
  const roeTrend = roe != null && prev?.roe != null ? roe - prev.roe : null;
  const opmTrend = opm != null && prev?.operating_margin != null ? opm - prev.operating_margin : null;

  const signals = [];

  // 퀄리티 프리미엄 — 고PER + 고ROE (비싸지만 근거 있는 프리미엄)
  if (per != null && per > 20 && roe != null && roe > 15 && opm != null && opm > 10)
    signals.push({ type:'good', icon:'💎',
      msg: `PER ${per?.toFixed(1)}x + ROE ${roe?.toFixed(1)}% — 퀄리티 프리미엄. 높은 수익성이 고평가를 정당화 (PEG 관점 추가 확인 권장)` });

  // Value Trap 경고 — 수익성 대비 고평가
  if (per > 15 && roe != null && roe < 5)
    signals.push({ type:'warn', icon:'⚠️',
      msg: `PER ${per?.toFixed(1)}x 대비 ROE ${roe?.toFixed(1)}% — 수익성 대비 고평가, 가치함정(Value Trap) 주의` });

  // 저평가 가치주
  if (per != null && per < 10 && pbr != null && pbr < 1)
    signals.push({ type:'good', icon:'✅',
      msg: `PER ${per?.toFixed(1)}x · PBR ${pbr?.toFixed(2)}x — 저평가 가치주 구간` });

  // 고수익 우량주
  if (roe != null && roe > 20 && opm != null && opm > 15)
    signals.push({ type:'good', icon:'✅',
      msg: `ROE ${roe?.toFixed(1)}% · 영업이익률 ${opm?.toFixed(1)}% — 고수익성 우량주` });

  // 자본배분 여력 — 저부채 + 고마진 = 추가 투자/환원 여력
  if (debt != null && debt < 60 && opm != null && opm > 15 && npm != null && npm > 10)
    signals.push({ type:'good', icon:'🏗️',
      msg: `부채비율 ${debt?.toFixed(0)}% · 순이익률 ${npm?.toFixed(1)}% — 저부채+고마진, 자본배분 여력 충분 (배당·자사주·M&A 잠재력)` });

  // 부채 과다
  if (debt != null && debt > 200)
    signals.push({ type:'bad', icon:'🔴',
      msg: `부채비율 ${debt?.toFixed(0)}% — 레버리지 과다, 금리 위험 노출` });

  // ROE 추세
  if (roeTrend != null && Math.abs(roeTrend) >= 1.5)
    signals.push({
      type: roeTrend > 0 ? 'good' : 'warn', icon: roeTrend > 0 ? '📈' : '📉',
      msg: `ROE ${roeTrend > 0 ? '개선' : '악화'} (${roeTrend > 0 ? '+' : ''}${roeTrend.toFixed(1)}%p QoQ) — 수익성 ${roeTrend > 0 ? '회복 신호' : '훼손 주의'}` });

  // 영업이익률 추세
  if (opmTrend != null && Math.abs(opmTrend) >= 2)
    signals.push({
      type: opmTrend > 0 ? 'good' : 'warn', icon: opmTrend > 0 ? '📈' : '📉',
      msg: `영업이익률 ${opmTrend > 0 ? '상승' : '하락'} (${opmTrend > 0 ? '+' : ''}${opmTrend.toFixed(1)}%p QoQ)` });

  if (!signals.length)
    signals.push({ type:'neutral', icon:'ℹ️', msg: '특이 신호 없음 — 추가 정성 분석 필요' });

  return signals;
}

// ── 신호등 헬퍼 ──────────────────────────────────────────────────────────────
// 반환: { color, bg, icon, grade } — 강(녹)/중(황)/약(적)
function _rpSignal(type, val) {
  if (val == null) return null;
  const rules = {
    // 낮을수록 좋음
    per:      val < 10  ? 'strong' : val < 20  ? 'mid' : 'weak',
    pbr:      val < 1   ? 'strong' : val < 2.5 ? 'mid' : 'weak',
    debt:     val < 50  ? 'strong' : val < 100 ? 'mid' : 'weak',
    // 높을수록 좋음
    roe:      val > 20  ? 'strong' : val > 10  ? 'mid' : 'weak',
    roa:      val > 10  ? 'strong' : val > 5   ? 'mid' : 'weak',
    opm:      val > 15  ? 'strong' : val > 5   ? 'mid' : 'weak',
    npm:      val > 10  ? 'strong' : val > 3   ? 'mid' : 'weak',
    equity:   'mid',  // 절대값은 신호등 없음
    assets:   'mid',
  };
  const grade = rules[type] || 'mid';
  const map = {
    strong: { color:'#22c55e', bg:'#22c55e18', icon:'●', label:'양호' },
    mid:    { color:'#f59e0b', bg:'#f59e0b18', icon:'●', label:'보통' },
    weak:   { color:'#ef4444', bg:'#ef444418', icon:'●', label:'주의' },
  };
  return { ...map[grade], grade };
}

// ── 제품/사업부별 매출 트렌드 카드 ────────────────────────────────────────────
function _rpSegmentCard(rows) {
  _rpSegSel = null; // 카드 재생성 시 선택 초기화
  if (!rows?.length) return `
    <div class="card" style="padding:16px">
      ${_rpSecT('제품·사업부별 매출')}
      <div style="color:var(--text3);font-size:12px;padding:20px;text-align:center">
        DART 파일을 업로드하면 제품별 매출 데이터가 표시됩니다
      </div>
    </div>`;

  // ── 기간 / 세그먼트 / 팔레트 ──────────────────────────────────────────────
  const periodSet = [];
  const seen = new Set();
  for (const r of rows) {
    const key = `${r.bsns_year}.${r.quarter}`;
    if (!seen.has(key)) { seen.add(key); periodSet.push({ key, bsns_year: r.bsns_year, quarter: r.quarter }); }
  }
  const periods = periodSet.slice(-6);

  const dataMap = {};
  for (const r of rows) {
    const key = `${r.bsns_year}.${r.quarter}`;
    if (!dataMap[key]) dataMap[key] = {};
    dataMap[key][r.category] = { revenue: r.revenue, ratio: r.revenue_ratio };
  }

  const latestKey   = periods[periods.length - 1]?.key;
  const latestData  = latestKey ? (dataMap[latestKey] || {}) : {};
  const latestTotal = Object.values(latestData).reduce((s, v) => s + (v.revenue || 0), 0);
  const prevKey     = periods.length >= 2 ? periods[periods.length - 2].key : null;

  const _allSegs = [...new Set(rows.filter(r => r.category !== '합계').map(r => r.category))];
  const segNames = _allSegs.sort((a, b) =>
    ((latestData[b]?.revenue) || 0) - ((latestData[a]?.revenue) || 0)
  );
  const COLORS = ['#2AABEE','#4ade80','#fb923c','#a78bfa','#f59e0b','#34d399','#f87171','#60a5fa'];

  // 캐시 저장
  _rpSegCache = { periods, dataMap, segNames, COLORS, latestKey, latestData, latestTotal, prevKey };

  return `<div class="card" style="padding:16px;display:flex;flex-direction:column;gap:8px">
    ${_rpSecT('제품·사업부별 매출', '* 단위: 백만원, %')}
    <div id="rp-seg-inner">${_rpSegInner(_rpSegCache, null)}</div>
  </div>`;
}

// ── 세그먼트 카드 내부 (필터 적용 가능) ──────────────────────────────────────
function _rpSegInner(cache, selected) {
  if (!cache) return '';
  const { periods, dataMap, segNames, COLORS, latestKey, latestData, latestTotal, prevKey } = cache;
  const CHART_H = 160;

  // 스파크라인
  const sparkline = (segName, color) => {
    const vals = periods.map(p => (dataMap[p.key]?.[segName]?.revenue) || 0);
    if (vals.every(v => v === 0)) return '';
    const max = Math.max(...vals, 1);
    const W = 52, H = 20;
    const pts = vals.map((v, i) => {
      const x = vals.length > 1 ? (i / (vals.length - 1)) * W : W / 2;
      const y = H - 2 - Math.round((v / max) * (H - 4));
      return x.toFixed(1) + ',' + y;
    }).join(' ');
    const lastX = vals.length > 1 ? W : W / 2;
    const lastY = H - 2 - Math.round((vals[vals.length - 1] / max) * (H - 4));
    return `<svg width="${W}" height="${H}" style="flex-shrink:0;overflow:visible">`
      + `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" opacity=".85"/>`
      + `<circle cx="${lastX}" cy="${lastY}" r="2.5" fill="${color}"/></svg>`;
  };

  // ── 차트 ────────────────────────────────────────────────────────────────
  let chartHTML = '';
  if (selected) {
    // 단일 세그먼트 바 차트
    const si    = segNames.indexOf(selected);
    const color = COLORS[si % COLORS.length];
    const vals  = periods.map(p => (dataMap[p.key]?.[selected]?.revenue) || 0);
    const max   = Math.max(...vals, 1);
    chartHTML = `
      <div style="display:flex;align-items:flex-end;gap:5px;height:${CHART_H}px">
        ${periods.map((p, pi) => {
          const v    = vals[pi];
          const barH = max > 0 ? Math.max(4, Math.round(v / max * CHART_H)) : 4;
          const isLatest = pi === periods.length - 1;
          return `<div style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:stretch;justify-content:flex-end;height:${CHART_H}px">
            <div style="font-size:11px;font-weight:600;color:${color};text-align:center;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${fmtCap(v*1e6)}</div>
            <div style="height:${barH}px;border-radius:3px 3px 0 0;background:${color};opacity:${isLatest?1:.7};
              ${isLatest?'box-shadow:0 0 0 2px '+color+'60':''}"></div>
          </div>`;
        }).join('')}
      </div>`;
  } else {
    // 전체 누적 바
    const periodTotals = periods.map(p => segNames.reduce((s, n) => s + ((dataMap[p.key]?.[n]?.revenue) || 0), 0));
    const maxTotal = Math.max(...periodTotals, 1);
    chartHTML = `
      <div style="display:flex;align-items:flex-end;gap:5px;height:${CHART_H}px">
        ${periods.map((p, pi) => {
          const total  = periodTotals[pi];
          const barH   = maxTotal > 0 ? Math.max(4, Math.round(total / maxTotal * CHART_H)) : 4;
          const isLatest = pi === periods.length - 1;
          const segs = segNames.map((name, si) => {
            const rev   = (dataMap[p.key]?.[name]?.revenue) || 0;
            const ratio = total > 0 ? (rev / total * 100) : 0;
            return { name, rev, ratio, color: COLORS[si % COLORS.length] };
          }).filter(s => s.rev > 0).reverse();
          return `<div style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:stretch;justify-content:flex-end;height:${CHART_H}px">
            <div style="font-size:11px;font-weight:600;color:var(--text1);text-align:center;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${fmtCap(total*1e6)}</div>
            <div style="height:${barH}px;border-radius:3px 3px 0 0;overflow:hidden;display:flex;flex-direction:column;
              ${isLatest?'box-shadow:0 0 0 2px rgba(255,255,255,.22)':''}">
              ${segs.map(s => `<div style="flex:${s.ratio};background:${s.color};min-height:2px"
                title="${s.name}: ${fmtCap(s.rev*1e6)} (${s.ratio.toFixed(1)}%)"></div>`).join('')}
            </div>
          </div>`;
        }).join('')}
      </div>`;
  }

  // 기간 라벨
  const periodLabels = `
    <div style="display:flex;gap:5px;margin-top:5px">
      ${periods.map((p, pi) => `
        <div style="flex:1;min-width:0;text-align:center">
          <div style="font-size:11px;font-weight:${pi===periods.length-1?700:500};
            color:${pi===periods.length-1?'var(--text1)':'var(--text2)'}">${p.bsns_year}</div>
          <div style="font-size:11px;color:${pi===periods.length-1?'var(--tg)':'var(--text2)'}">${p.quarter}</div>
        </div>`).join('')}
    </div>`;

  // ── 세그먼트 목록 ────────────────────────────────────────────────────────
  const listHTML = segNames.filter(n => latestData[n]?.revenue).map((name, si) => {
    const { revenue, ratio } = latestData[name] || {};
    const pct      = ratio ?? (latestTotal > 0 ? revenue / latestTotal * 100 : 0);
    const color    = COLORS[si % COLORS.length];
    const isTop    = si === 0;
    const isSel    = selected === name;
    const prevRev  = prevKey ? (dataMap[prevKey]?.[name]?.revenue ?? null) : null;
    const qoq      = prevRev != null && prevRev > 0 ? ((revenue - prevRev) / prevRev * 100) : null;
    const trendIcon  = qoq == null ? '—' : qoq > 3 ? '▲' : qoq < -3 ? '▼' : '→';
    const trendColor = qoq == null ? 'var(--text2)' : qoq > 0 ? '#f87171' : qoq < 0 ? '#60a5fa' : 'var(--text2)';
    const qoqStr   = qoq == null ? '' : (qoq >= 0 ? '+' : '') + qoq.toFixed(1) + '%';
    // 선택됐으면 테두리 강조, 아니면 흐리게
    const opacity  = selected && !isSel ? 'opacity:.4;' : '';
    const border   = isSel ? `border:1.5px solid ${color}` : `border:1px solid ${isTop ? color+'40' : 'transparent'}`;
    const bg       = isSel ? color+'22' : (isTop ? color+'14' : 'var(--bg3)');
    return `<div onclick="rpSegFilter('${escJsStr(name)}',this)"
      style="padding:7px 10px;border-radius:var(--radius-sm);background:${bg};${border};
        cursor:pointer;transition:opacity .2s;${opacity}user-select:none"
      onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity=''">
      <div style="display:flex;align-items:center;gap:7px">
        <span style="font-size:11px;font-weight:800;color:${color};min-width:18px;text-align:center;
          background:${color}22;border-radius:3px;padding:1px 4px">${si+1}</span>
        <span style="font-size:${isTop?'13px':'12px'};font-weight:${isTop||isSel?700:500};color:var(--text1);
          flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(name)}</span>
        ${sparkline(name, color)}
        <span style="font-size:12px;color:var(--text1);white-space:nowrap">${fmtCap(revenue*1e6)}</span>
        <span style="font-size:${isTop?'13px':'12px'};font-weight:700;color:${color};min-width:38px;text-align:right">${pct.toFixed(1)}%</span>
        <span style="font-size:12px;font-weight:700;color:${trendColor};min-width:56px;text-align:right;white-space:nowrap">${trendIcon} ${qoqStr}</span>
      </div>
      <div style="height:3px;border-radius:2px;background:${color}22;overflow:hidden;margin-top:5px">
        <div style="height:100%;width:${pct}%;background:${color};border-radius:2px"></div>
      </div>
    </div>`;
  }).join('');

  const headerRight = selected
    ? `<button onclick="rpSegFilter(null)" style="font-size:11px;padding:2px 10px;border:1px solid var(--border);
        border-radius:100px;background:var(--bg3);color:var(--text1);cursor:pointer">전체 보기</button>`
    : `<span style="font-size:11px;color:var(--text1)">스파크라인 · QoQ</span>`;

  return `
    <div>${chartHTML}</div>
    ${periodLabels}
    <div style="border-top:1px solid var(--border);padding-top:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:11px;color:var(--text1)">최신 (${latestKey?.replace('.',' ')}) 구성</span>
        ${headerRight}
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">${listHTML}</div>
    </div>`;
}

// ── 세그먼트 필터 토글 ─────────────────────────────────────────────────────────
function rpSegFilter(name) {
  if (!_rpSegCache) return;
  _rpSegSel = (_rpSegSel === name || name == null) ? null : name;
  const el = document.getElementById('rp-seg-inner');
  if (el) el.innerHTML = _rpSegInner(_rpSegCache, _rpSegSel);
}

function _rpValuationCard(latestF, latest) {
  const ps     = _rpData.peerStats || null;
  const fin    = _rpData.fin || [];
  const prev   = fin[1] || {};
  const prices = _rpData.price || [];

  // QoQ 추세 화살표
  const trend = (cur, old) => {
    if (cur == null || old == null) return '';
    const d = cur - old;
    if (Math.abs(d) < 0.1) return `<span style="font-size:11px;color:var(--text1)"> →</span>`;
    return d > 0
      ? `<span style="font-size:11px;color:#f87171"> ▲${d.toFixed(1)}</span>`
      : `<span style="font-size:11px;color:#60a5fa"> ▼${Math.abs(d).toFixed(1)}</span>`;
  };

  // PER/PBR 역사적 추세 (시장 데이터 기준)
  const prevMkt = prices[1] || {};
  const metrics = [
    { key:'per', label:'PER', desc:'주가수익비율',   val: latest?.per,   peer: ps?.per, unit:'x', fmt: v=>v.toFixed(1), lowerBetter:true,  prevVal: prevMkt?.per },
    { key:'pbr', label:'PBR', desc:'주가순자산비율', val: latest?.pbr,   peer: ps?.pbr, unit:'x', fmt: v=>v.toFixed(2), lowerBetter:true,  prevVal: prevMkt?.pbr },
    { key:'roe', label:'ROE', desc:'자기자본이익률', val: latestF?.roe,  peer: ps?.roe, unit:'%', fmt: v=>v.toFixed(1), lowerBetter:false, prevVal: prev?.roe },
    { key:'roa', label:'ROA', desc:'총자산이익률',  val: latestF?.roa,  peer: ps?.roa, unit:'%', fmt: v=>v.toFixed(1), lowerBetter:false, prevVal: prev?.roa },
  ];

  // ── PER·PBR 12분기 밸류에이션 밴드 차트 ──
  const _rpValBandChart = () => {
    // 분기별 데이터 (오래된 순 정렬) — per/pbr이 있는 항목만
    const qFin = [...fin].reverse().filter(r => r.quarter); // 분기만, 오래된→최신
    const perQ  = qFin.filter(r => r.per  != null && r.per  > 0 && r.per  < 500);
    const pbrQ  = qFin.filter(r => r.pbr  != null && r.pbr  > 0 && r.pbr  < 50);

    const curPer = latest?.per;
    const curPbr = latest?.pbr;

    // 두 지표 모두 분기 데이터 없으면 일봉 fallback
    if (perQ.length < 3 && pbrQ.length < 3) {
      // 일봉 기반 간소 PER 차트 (기존 로직 유지)
      const perHistory = prices.filter(p => p.per != null && p.per > 0 && p.per < 200).map(p => p.per);
      if (perHistory.length < 10 || curPer == null) return '';
      const mn = Math.min(...perHistory), mx = Math.max(...perHistory);
      const avg = perHistory.reduce((s,v)=>s+v,0)/perHistory.length;
      const range = mx - mn || 1;
      const W=200,H=32,pts=perHistory.slice(0,120).reverse();
      const xs=pts.map((_,i)=>(i/(pts.length-1))*W);
      const ys=pts.map(v=>H-((v-mn)/range)*H);
      const path=xs.map((x,i)=>`${i===0?'M':'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
      const avgY=(H-((avg-mn)/range)*H).toFixed(1);
      const curY=(H-((curPer-mn)/range)*H).toFixed(1);
      const pctPos=((curPer-mn)/range*100).toFixed(0);
      const bandColor=curPer>avg*1.3?'#f87171':curPer<avg*0.8?'#4ade80':'#f59e0b';
      return `<div style="margin-bottom:10px;padding:10px 14px;background:var(--bg3);border-radius:var(--radius-sm)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span style="font-size:11px;font-weight:700;color:var(--text1)">PER 히스토리 (최근 ${pts.length}거래일)</span>
          <div style="display:flex;gap:10px;font-size:11px;color:var(--text1)">
            <span>최저 <b style="color:#4ade80">${mn.toFixed(1)}x</b></span>
            <span>평균 <b style="color:#f59e0b">${avg.toFixed(1)}x</b></span>
            <span>최고 <b style="color:#f87171">${mx.toFixed(1)}x</b></span>
          </div>
        </div>
        <svg width="100%" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="display:block;height:32px">
          <line x1="0" y1="${avgY}" x2="${W}" y2="${avgY}" stroke="#f59e0b" stroke-width="1" stroke-dasharray="3,2" opacity="0.6"/>
          <path d="${path}" fill="none" stroke="var(--border)" stroke-width="1.2" opacity="0.7"/>
          <circle cx="${xs[xs.length-1].toFixed(1)}" cy="${curY}" r="3" fill="${bandColor}" stroke="var(--bg3)" stroke-width="1.5"/>
        </svg>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text1);margin-top:3px">
          <span>← ${pts.length}거래일 전</span>
          <span style="color:${bandColor};font-weight:700">현재 ${curPer.toFixed(1)}x (하위 ${pctPos}%)</span>
          <span>현재 →</span>
        </div>
      </div>`;
    }

    // ── 분기별 밴드 차트 생성 헬퍼 ──
    const makeBandChart = (data, curVal, label, unit, maxCap) => {
      if (data.length < 2) return '';
      const vals   = data.map(r => r[label === 'PER' ? 'per' : 'pbr']);
      const labels = data.map(r => `${String(r.bsns_year).slice(2)}/${r.quarter||'Y'}`);
      const mn     = Math.min(...vals);
      const mx     = Math.max(...vals);
      const avg    = vals.reduce((s,v)=>s+v,0)/vals.length;
      const range  = mx - mn || 1;
      const W = 360, H = 60, PAD = 4;
      const n = vals.length;
      const barW  = Math.floor((W - PAD * 2) / n) - 2;
      const barGap = Math.floor((W - PAD * 2) / n);

      // y 좌표 (아래=0, 위=H)
      const toY = v => PAD + (H - PAD * 2) * (1 - (v - mn) / range);
      const avgY = toY(avg).toFixed(1);
      const minY = toY(mn).toFixed(1);
      const maxY = toY(mx).toFixed(1);

      const pct  = curVal != null ? ((curVal - mn) / range * 100).toFixed(0) : null;
      const curColor = curVal == null ? '#888'
        : (label === 'PER' || label === 'PBR')
          ? (curVal > avg * 1.2 ? '#f87171' : curVal < avg * 0.85 ? '#4ade80' : '#f59e0b')
          : (curVal > avg * 1.1 ? '#4ade80' : curVal < avg * 0.9 ? '#f87171' : '#f59e0b');

      const bars = vals.map((v, i) => {
        const x   = PAD + i * barGap;
        const y   = toY(v);
        const bH  = Math.max(2, (H - PAD) - y);
        const isLast = i === n - 1;
        const col = isLast ? curColor : 'rgba(255,255,255,0.12)';
        return `<rect x="${x}" y="${y.toFixed(1)}" width="${barW}" height="${bH.toFixed(1)}"
          rx="1" fill="${col}" opacity="${isLast ? 1 : 0.8}"/>`;
      }).join('');

      // x축 레이블 (첫/중간/마지막만)
      const xLabels = [0, Math.floor(n/2), n-1].map(i => {
        const x = PAD + i * barGap + barW / 2;
        return `<text x="${x.toFixed(1)}" y="${H + 10}" font-size="7" fill="var(--text2)"
          text-anchor="middle">${labels[i]||''}</text>`;
      }).join('');

      return `
      <div style="margin-bottom:8px;padding:10px 14px;background:var(--bg3);border-radius:var(--radius-sm)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:4px">
          <span style="font-size:11px;font-weight:700;color:var(--text1)">${label} 분기별 밴드 (${n}분기)</span>
          <div style="display:flex;gap:10px;font-size:11px;color:var(--text1)">
            <span>최저 <b style="color:#4ade80">${mn.toFixed(unit==='x'?1:2)}${unit}</b></span>
            <span>평균 <b style="color:#f59e0b">${avg.toFixed(unit==='x'?1:2)}${unit}</b></span>
            <span>최고 <b style="color:#f87171">${mx.toFixed(unit==='x'?1:2)}${unit}</b></span>
          </div>
        </div>
        <svg width="100%" viewBox="0 0 ${W} ${H+14}" style="display:block;overflow:visible">
          <!-- 밴드 배경 (min~max) -->
          <rect x="${PAD}" y="${maxY}" width="${W - PAD*2}" height="${((H - PAD) - parseFloat(maxY)).toFixed(1)}"
            fill="rgba(255,255,255,0.03)" rx="2"/>
          <!-- 바 -->
          ${bars}
          <!-- 평균선 -->
          <line x1="${PAD}" y1="${avgY}" x2="${W-PAD}" y2="${avgY}"
            stroke="#f59e0b" stroke-width="1" stroke-dasharray="4,3" opacity="0.7"/>
          <!-- 최저선 -->
          <line x1="${PAD}" y1="${minY}" x2="${W-PAD}" y2="${minY}"
            stroke="#4ade80" stroke-width="0.7" stroke-dasharray="2,3" opacity="0.5"/>
          <!-- 최고선 -->
          <line x1="${PAD}" y1="${maxY}" x2="${W-PAD}" y2="${maxY}"
            stroke="#f87171" stroke-width="0.7" stroke-dasharray="2,3" opacity="0.5"/>
          <!-- x축 레이블 -->
          ${xLabels}
        </svg>
        ${curVal != null ? `
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text1);margin-top:2px">
          <span>← ${n}분기 이전</span>
          <span style="color:${curColor};font-weight:700">
            현재 ${curVal.toFixed(unit==='x'?1:2)}${unit}
            ${pct != null ? `(역사적 하위 ${pct}%)` : ''}
          </span>
          <span>최근 →</span>
        </div>` : ''}
      </div>`;
    };

    return `
      ${makeBandChart(perQ, curPer, 'PER', 'x', 200)}
      ${makeBandChart(pbrQ, curPbr, 'PBR', 'x', 50)}
    `;
  };

  // 종합 판단
  const synthesis = _rpSynthesis(latestF, latest, fin);

  // peer 대비 평가: lowerBetter → 낮을수록 저평가 / 높을수록 고평가
  const peerJudge = (val, peer, lowerBetter) => {
    if (val == null || peer == null) return null;
    const diff = (val - peer) / peer * 100;
    const isGood = lowerBetter ? diff < -15 : diff > 15;
    const isBad  = lowerBetter ? diff > 15  : diff < -15;
    return {
      diff,
      color: isGood ? '#4ade80' : isBad ? '#f87171' : '#f59e0b',
      label: isGood ? '업종 대비 유리' : isBad ? '업종 대비 불리' : '업종 수준',
      diffStr: (diff >= 0 ? '+' : '') + diff.toFixed(1) + '%',
    };
  };

  const peerHeader = ps
    ? `<div style="font-size:11px;color:var(--text3)">
        ${ps.industry} 동종 ${ps.count}개사 중앙값 비교
        <span style="margin-left:4px">|</span>
        <span style="margin-left:4px"><span style="color:#4ade80">●</span> 유리
        <span style="color:#f59e0b">●</span> 중립
        <span style="color:#f87171">●</span> 불리</span>
      </div>`
    : `<div style="font-size:11px;color:var(--text3)">업종 비교 로딩 중...</div>`;

  return `<div id="rp-val-card" class="card" style="padding:16px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:6px">
      <span style="display:inline-flex;align-items:center;gap:7px">
        <span style="width:3px;height:13px;background:var(--tg);border-radius:2px"></span>
        <span style="font-size:13px;font-weight:700;color:var(--text1)">밸류에이션 & 수익성</span>
      </span>
      ${peerHeader}
    </div>

    <!-- 종합 투자 판단 -->
    <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:12px;
      padding:10px 12px;background:var(--bg3);border-radius:var(--radius-sm);
      border-left:3px solid var(--tg)">
      <div style="font-size:11px;font-weight:700;color:var(--tg);letter-spacing:.6px;margin-bottom:2px">
        펀드매니저 종합 판단
      </div>
      ${synthesis.map(s => {
        const col = s.type==='good'?'#4ade80' : s.type==='bad'?'#f87171' : s.type==='warn'?'#f59e0b' : 'var(--text2)';
        return `<div style="font-size:12px;color:var(--text1);line-height:1.5">
          <span style="color:${col};font-weight:700">●</span> ${s.msg}</div>`;
      }).join('')}
    </div>

    <!-- PER·PBR 밸류에이션 밴드 -->
    ${_rpValBandChart()}

    <div style="display:flex;flex-direction:column;gap:8px">
      ${metrics.map(m => {
        const sig   = _rpSignal(m.key, m.val);
        const judge = peerJudge(m.val, m.peer, m.lowerBetter);
        // 포지션 바: 업종 내 상대 위치 (0~100%)
        const barPct = m.val != null && m.peer != null
          ? Math.min(100, Math.max(0, m.lowerBetter
              ? (1 - m.val / (m.peer * 2)) * 100        // 낮을수록 왼쪽 = 좋음
              : (m.val / (m.peer * 2)) * 100))           // 높을수록 오른쪽 = 좋음
          : null;
        const jColor = judge?.color || sig?.color || 'var(--border)';
        return `<div style="padding:10px 14px;background:var(--bg3);border-radius:var(--radius-sm);
          border-left:3px solid ${jColor}">

          <!-- 1줄: 지표 + 현재값 + 화살표 + 중앙값 + 판단 배지 -->
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span style="font-size:12px;font-weight:700;color:var(--text1);min-width:28px">${m.label}</span>
            <span style="font-size:20px;font-weight:800;color:var(--text1)">${m.val != null ? m.fmt(m.val)+m.unit : '—'}</span>${trend(m.val, m.prevVal)}
            ${m.peer != null ? `
              <span style="font-size:12px;color:var(--text1)">vs</span>
              <div>
                <div style="font-size:11px;color:var(--text1)">업종 중앙</div>
                <div style="font-size:15px;font-weight:700;color:var(--text1)">${m.fmt(m.peer)}${m.unit}</div>
              </div>
              ${judge ? `
              <span style="margin-left:auto;font-size:11px;font-weight:700;
                padding:3px 8px;border-radius:100px;
                background:${judge.color}20;color:${judge.color};
                border:1px solid ${judge.color}40;white-space:nowrap">
                ${judge.diffStr}&nbsp;${judge.label.replace('업종 대비 ','')}
              </span>` : ''}` : `
              <span style="flex:1;font-size:11px;color:var(--text1)">${m.desc}</span>
              ${sig ? `<span style="font-size:11px;font-weight:700;color:${sig.color}">${sig.label}</span>` : ''}`}
          </div>

          <!-- 2줄: 포지션 바 -->
          ${barPct != null ? `
          <div style="position:relative;height:4px;border-radius:2px;background:var(--border)">
            <!-- 중앙값 기준선 -->
            <div style="position:absolute;left:50%;top:-3px;bottom:-3px;width:1.5px;
              background:var(--text2);opacity:.5;border-radius:1px"></div>
            <!-- 채움 바 -->
            <div style="position:absolute;top:0;height:100%;border-radius:2px;
              background:${jColor};opacity:.6;
              left:${Math.min(barPct,50).toFixed(1)}%;
              width:${Math.abs(barPct-50).toFixed(1)}%"></div>
            <!-- 현재 위치 마커 -->
            <div style="position:absolute;top:50%;left:${barPct.toFixed(1)}%;
              transform:translate(-50%,-50%);width:10px;height:10px;
              border-radius:50%;background:${jColor};
              border:2px solid var(--bg3)"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11px;
            color:var(--text1);margin-top:3px">
            <span>${m.lowerBetter ? '◀ 저평가' : '◀ 저수익'}</span>
            <span style="opacity:.6">│ 업종 중앙</span>
            <span>${m.lowerBetter ? '고평가 ▶' : '고수익 ▶'}</span>
          </div>` : ''}
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function _rpFinHealthCard(f) {
  const fin  = _rpData.fin || [];
  const prev = fin[1] || {};
  const ps   = _rpData.peerStats || null;

  const trend = (cur, old) => {
    if (cur == null || old == null) return '';
    const d = cur - old;
    if (Math.abs(d) < 0.1) return '';
    return d > 0
      ? `<span style="font-size:11px;color:#f87171">▲${d.toFixed(1)}</span>`
      : `<span style="font-size:11px;color:#60a5fa">▼${Math.abs(d).toFixed(1)}</span>`;
  };

  // 이자보상배율 근사 (영업이익 / 금융비용 — 금융비용 없으면 skip)
  const icr = null; // 별도 데이터 필요

  // EBITDA/FCF (financials에서)
  const ebitda = f.ebitda;
  const fcf    = f.fcf;
  const mktCap = _rpData.price?.[0]?.market_cap;
  const fcfYield = fcf != null && mktCap > 0 ? (fcf / mktCap * 100) : null;

  const rows = [
    { key:'debt', label:'부채비율',   val: f.debt_ratio,       prev: prev?.debt_ratio,       unit:'%',  fmt: v=>v.toFixed(0),
      hint: f.debt_ratio > 200 ? '레버리지 과다' : f.debt_ratio > 100 ? '보통 수준' : '안정적' },
    { key:'opm',  label:'영업이익률', val: f.operating_margin, prev: prev?.operating_margin,  unit:'%',  fmt: v=>v.toFixed(1),
      hint: f.operating_margin > 20 ? '고마진 사업' : f.operating_margin > 10 ? '양호' : '마진 압박' },
    { key:'npm',  label:'순이익률',   val: f.net_margin,       prev: prev?.net_margin,        unit:'%',  fmt: v=>v.toFixed(1),
      hint: null },
    ...(fcfYield != null ? [{ key:'fcf', label:'FCF 수익률', val: fcfYield, prev: null, unit:'%', fmt: v=>v.toFixed(1),
      hint: fcfYield > 5 ? '현금창출 우수' : fcfYield > 2 ? '양호' : '현금창출 부족' }] : []),
    ...(ebitda != null ? [{ key:'ebitda', label:'EBITDA', val: ebitda, prev: null, unit:'', fmt: v=>fmtCap(v),
      hint: null }] : []),
    { key:'equity', label:'자기자본', val: f.total_equity, prev: null, unit:'', fmt: v=>fmtCap(v), hint:null },
  ].filter(k => k.val != null);

  if (!rows.length) return `<div class="card" style="padding:16px">
    ${_rpSecT('재무 건전성')}
    <div style="color:var(--text3);font-size:12px;text-align:center;padding:12px">재무 데이터 없음</div>
  </div>`;

  // 재무 → 투자 연결 스토리
  const _finStory = () => {
    const debt = f.debt_ratio, opm = f.operating_margin, npm = f.net_margin;
    const stories = [];
    if (debt != null && opm != null && debt < 60 && opm > 15)
      stories.push({ icon:'🏗️', color:'#4ade80',
        text:`저부채(${debt.toFixed(0)}%) + 고마진(${opm.toFixed(1)}%) → 자본배분 여력: 추가 투자·배당·자사주 소각 가능` });
    if (debt != null && debt > 150 && opm != null && opm < 10)
      stories.push({ icon:'⚠️', color:'#f87171',
        text:`고부채(${debt.toFixed(0)}%) + 저마진(${opm.toFixed(1)}%) → 이자비용 부담 구간, 금리 상승 시 실적 훼손 위험` });
    if (npm != null && opm != null && opm - npm > 10)
      stories.push({ icon:'🔍', color:'#f59e0b',
        text:`영업이익률(${opm.toFixed(1)}%) vs 순이익률(${npm.toFixed(1)}%) 괴리 ${(opm-npm).toFixed(1)}%p — 금융비용·세금 구조 점검 필요` });
    if (!stories.length) return '';
    return `<div style="display:flex;flex-direction:column;gap:4px;margin-top:10px;
      padding:8px 12px;background:var(--bg3);border-radius:var(--radius-sm);
      border-left:3px solid var(--border)">
      <div style="font-size:11px;font-weight:700;color:var(--text1);letter-spacing:.5px;margin-bottom:2px">투자 연결 시사점</div>
      ${stories.map(s => `<div style="font-size:11px;color:var(--text1);line-height:1.5">
        <span style="color:${s.color};font-weight:700">●</span> ${s.text}</div>`).join('')}
    </div>`;
  };

  return `<div class="card" style="padding:16px">
    ${_rpSecT('재무 건전성', '* 단위: %, 원')}
    <div style="display:flex;flex-direction:column;gap:6px">
      ${rows.map(k => {
        const sig  = _rpSignal(k.key, k.val);
        const disp = k.fmt(k.val) + k.unit;
        return `<div style="display:flex;align-items:center;gap:10px;padding:7px 12px;
          border-radius:var(--radius-sm);border-left:3px solid ${sig?.color||'var(--border)'};
          background:var(--bg3)">
          <div style="min-width:64px">
            <div style="font-size:12px;color:var(--text1)">${k.label}</div>
          </div>
          <div style="flex:1;min-width:0">
            ${k.hint ? `<div style="font-size:11px;color:${sig?.color||'var(--text2)'}">${k.hint}</div>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:6px;white-space:nowrap">
            ${trend(k.val, k.prev)}
            ${sig ? `<span style="font-size:11px;padding:1px 6px;border-radius:100px;
              background:${sig.color}20;color:${sig.color};font-weight:700">${sig.label}</span>` : ''}
            <span style="font-size:15px;font-weight:800;color:var(--text1)">${disp}</span>
          </div>
        </div>`;
      }).join('')}
    </div>
    ${_finStory()}
  </div>`;
}

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
