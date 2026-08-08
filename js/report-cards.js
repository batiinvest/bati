// 기업 분석 리포트 — 서브 컴포넌트 카드 (의견배지·증권사·실적·종합판단·세그먼트·밸류에이션·재무건전성·수급·카탈리스트) (report.js에서 분할)

// ── 오늘의 공시·뉴스 요약 카드 (daily_summaries — 백엔드 18:55 생성) ───────────
// items = {disclosures:[{category,report_nm,rcept_no}], news:[{title,link,time,sources}]}
// + ai_summary(대형/긴급만 Gemini 2줄). 요약 자체가 없으면 카드 생략(개요 상단 공간 절약).
// 색상은 반드시 hex — 칩 배경이 `${col}22`(JS 문자열 8자리 hex 연결)로 만들어지므로
// var(--...) 토큰을 쓰면 CSS가 `var(--x)22`를 이어붙이지 못해 배경이 투명해진다.
const _RP_CAT_COL = {
  '주요경영사항': '#f59e0b', '지분공시': '#c084fc', '대량보유': '#e879f9',
  '최대주주변동': '#f59e0b', '임원/주식': '#a78bfa', '기업설명회(IR)': '#22d3ee',
  '실적': '#4ade80', '잠정실적': '#4ade80', '배당': '#38bdf8', '기타': '#94a3b8',
};

function _rpSummaryCard(s) {
  if (!s) return '';
  const esc = escapeHtml;
  const dcnt = s.disclosure_cnt || 0, ncnt = s.news_cnt || 0;
  const items = (typeof s.items === 'string') ? (() => { try { return JSON.parse(s.items); } catch { return {}; } })() : (s.items || {});
  const discs = items.disclosures || [];
  const news  = items.news || [];
  const dateStr = (s.base_date || '').slice(2).replace(/-/g, '/');

  // 최신 요약이 오늘이 아닐 수 있음(주말·무활동) → 기준일 명시
  const bd = s.base_date ? new Date(s.base_date + 'T00:00:00') : null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const stale = bd ? (today - bd) / 86400000 >= 1 : false;
  const sub = `공시 ${dcnt} · 뉴스 ${ncnt}${stale ? ` · ${dateStr} 기준` : ''}`;

  if (dcnt === 0 && ncnt === 0) {
    return `<div class="card" style="padding:14px">
      ${_rpSecT('오늘의 공시·뉴스 요약', dateStr + ' 기준')}
      <div style="color:var(--text3);font-size:12px;text-align:center;padding:14px">최근 공시·뉴스 없음</div>
    </div>`;
  }

  const aiHTML = s.ai_summary ? `
    <div style="margin-top:8px;padding:10px 12px;background:var(--bg3);border-left:3px solid var(--tg);
      border-radius:4px;font-size:13px;color:var(--text1);line-height:1.6;white-space:pre-line">${esc(s.ai_summary)}</div>` : '';

  const discHTML = discs.length ? `
    <div style="display:flex;flex-direction:column;gap:5px;margin-top:10px">
      ${discs.map(d => {
        const cat = d.category || '기타';
        const col = _RP_CAT_COL[cat] || '#94a3b8';
        const nm  = esc((d.report_nm || '').trim());
        const url = safeUrl(`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${encodeURIComponent(d.rcept_no || '')}`);
        return `<div style="display:flex;align-items:flex-start;gap:7px;font-size:12px">
          <span style="flex-shrink:0;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;
            background:${col}22;color:${col}">${esc(cat)}</span>
          ${url ? `<a href="${escAttr(url)}" target="_blank" rel="noopener" style="color:var(--text1);text-decoration:none;line-height:1.4">${nm}</a>`
                : `<span style="color:var(--text1);line-height:1.4">${nm}</span>`}
        </div>`;
      }).join('')}
    </div>` : '';

  const newsHTML = news.length ? `
    <div style="display:flex;flex-direction:column;gap:5px;margin-top:${discs.length ? '10' : '8'}px">
      ${news.map(n => {
        const url  = safeUrl(n.link);
        const t    = esc(n.title || '');
        // sources = cluster_news가 저장한 매체 수(정수). 배열이 아니라 카운트.
        const nsrc = (typeof n.sources === 'number') ? n.sources : (Array.isArray(n.sources) ? n.sources.length : 0);
        const meta = [nsrc > 1 ? `${nsrc}개 매체` : '', esc(n.time || '')].filter(Boolean).join(' · ');
        return `<div style="display:flex;align-items:flex-start;gap:7px;font-size:12px">
          <span style="flex-shrink:0;color:var(--tg);margin-top:1px">📰</span>
          <div style="line-height:1.4">
            ${url ? `<a href="${escAttr(url)}" target="_blank" rel="noopener" style="color:var(--text1);text-decoration:none">${t}</a>`
                  : `<span style="color:var(--text1)">${t}</span>`}
            ${meta ? `<span style="color:var(--text3);font-size:11px;margin-left:4px">${meta}</span>` : ''}
          </div>
        </div>`;
      }).join('')}
    </div>` : '';

  return `<div class="card" style="padding:14px">
    ${_rpSecT('오늘의 공시·뉴스 요약', sub)}
    ${aiHTML}${discHTML}${newsHTML}
  </div>`;
}

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
            <td style="padding:6px 8px;color:var(--text1);border-bottom:1px solid var(--border);
              display:flex;align-items:center;gap:5px">
              <span style="width:8px;height:8px;border-radius:2px;background:#4a9eff55;flex-shrink:0"></span>매출
            </td>
            ${items.map(f => `
              <td style="padding:6px 8px;text-align:right;color:var(--text1);font-weight:600;
                border-bottom:1px solid var(--border)">
                ${fmtCap(f.revenue||0)}
              </td>`).join('')}
          </tr>
          <!-- 영업이익 -->
          <tr>
            <td style="padding:6px 8px;color:var(--text1);border-bottom:1px solid var(--border);
              display:flex;align-items:center;gap:5px">
              <span style="width:8px;height:8px;border-radius:2px;background:#2AABEE;flex-shrink:0"></span>영업이익
            </td>
            ${items.map(f => {
              const op = f.operating_profit || 0;
              const col = op >= 0 ? 'var(--text1)' : 'var(--blue)';
              return `<td style="padding:6px 8px;text-align:right;color:${col};font-weight:600;
                border-bottom:1px solid var(--border)">
                ${op < 0 ? '▼' : ''}${fmtCap(Math.abs(op))}
              </td>`;
            }).join('')}
          </tr>
          <!-- 순이익 -->
          ${items.some(f => f.net_income != null) ? `
          <tr>
            <td style="padding:6px 8px;color:var(--text1);border-bottom:1px solid var(--border);
              display:flex;align-items:center;gap:5px">
              <span style="width:8px;height:8px;border-radius:2px;background:#a78bfa;flex-shrink:0"></span>순이익
            </td>
            ${items.map(f => {
              const ni = f.net_income;
              if (ni == null) return `<td style="padding:6px 8px;text-align:right;color:var(--text1);
                border-bottom:1px solid var(--border)">—</td>`;
              const col = ni >= 0 ? 'var(--text1)' : 'var(--blue)';
              return `<td style="padding:6px 8px;text-align:right;color:${col};font-weight:600;
                border-bottom:1px solid var(--border)">
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

// ── 세그먼트 라벨: 품목(subcategory) 우선, 없으면 사업부문(category) ──────────
// 4-1 표는 "사업부문 | 품목" 2단 구조 → 품목이 더 구체적인 대표 라벨
function _rpSegLabel(r) {
  const c = (r.category || '').trim();
  const s = (r.subcategory || '').trim();
  return s && s !== c ? s : c;
}

// ── 제품/사업부별 매출 트렌드 카드 (연간/분기 토글 + 그래프) ──────────────────
function _rpSegmentCard(rows) {
  _rpSegSel  = null;      // 카드 재생성 시 선택 초기화
  _rpSegMode = 'year';    // 기본: 연간(연도별)

  const clean = (rows || []).filter(r =>
    (r.category || '').trim() !== '합계' && (r.subcategory || '').trim() !== '합계');

  if (!clean.length) return `
    <div class="card" style="padding:16px">
      ${_rpSecT('제품·사업부별 매출')}
      <div style="color:var(--text3);font-size:12px;padding:20px;text-align:center">
        DART 파일을 업로드하면 사업별 매출이 연도별로 표시됩니다
      </div>
    </div>`;

  _rpSegCache = _rpBuildSegCache(clean);

  const modeBtn = (m, label) => `<button onclick="rpSegMode('${m}')" data-seg-mode="${m}"
    style="padding:3px 13px;font-size:11px;font-weight:600;border:none;cursor:pointer;
      background:${_rpSegMode === m ? 'var(--tg)' : 'transparent'};
      color:${_rpSegMode === m ? '#fff' : 'var(--text2)'}">${label}</button>`;

  return `<div class="card" style="padding:16px;display:flex;flex-direction:column;gap:8px">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
      <span style="display:inline-flex;align-items:center;gap:7px">
        <span style="width:3px;height:13px;background:var(--tg);border-radius:2px"></span>
        <span style="font-size:13px;font-weight:700;color:var(--text1)">제품·사업부별 매출</span>
        <span style="font-size:11px;color:var(--text3)">단위: 매출액(백만원)</span>
      </span>
      <div style="display:inline-flex;border:1px solid var(--border);border-radius:100px;overflow:hidden">
        ${modeBtn('year', '연간')}${modeBtn('quarter', '분기')}
      </div>
    </div>
    <div id="rp-seg-inner">${_rpSegInner(_rpSegCache, null, _rpSegMode)}</div>
  </div>`;
}

// ── 세그먼트 캐시: 분기/연간 두 축 동시 구성 ──────────────────────────────────
function _rpBuildSegCache(rows) {
  const COLORS = ['#2AABEE','#4ade80','#fb923c','#a78bfa','#f59e0b','#34d399','#f87171','#60a5fa','#22d3ee','#e879f9'];

  const norm = rows.map(r => ({
    seg: _rpSegLabel(r), bsns_year: +r.bsns_year, quarter: r.quarter, revenue: +r.revenue || 0,
  })).filter(r => r.seg && r.bsns_year);

  // 분기 축
  const qMap = {}, qSeen = new Set(), qPeriods = [];
  for (const r of norm) {
    const key = `${r.bsns_year}.${r.quarter}`;
    if (!qSeen.has(key)) {
      qSeen.add(key);
      qPeriods.push({ key, top: String(r.bsns_year), sub: r.quarter,
        sort: r.bsns_year * 10 + (parseInt(String(r.quarter).replace(/\D/g, '')) || 0) });
    }
    (qMap[key] ||= {}); qMap[key][r.seg] = (qMap[key][r.seg] || 0) + r.revenue;
  }
  qPeriods.sort((a, b) => a.sort - b.sort);

  // 연간 축 (분기 합산 + 분기 커버리지 추적)
  const yMap = {}, yQ = {};
  for (const r of norm) {
    const y = String(r.bsns_year);
    (yMap[y] ||= {}); yMap[y][r.seg] = (yMap[y][r.seg] || 0) + r.revenue;
    (yQ[y] ||= new Set()).add(r.quarter);
  }
  const yPeriods = Object.keys(yMap).map(Number).sort((a, b) => a - b).map(y => {
    const qn = yQ[String(y)].size, partial = qn < 4;
    return { key: String(y), top: String(y), sub: partial ? `${qn}Q누적` : '연간', partial };
  });

  return {
    COLORS,
    segNames: [...new Set(norm.map(r => r.seg))],
    quarter: { periods: qPeriods, dataMap: qMap },
    year:    { periods: yPeriods, dataMap: yMap },
  };
}

// ── 세그먼트 카드 내부 (mode: 'year'|'quarter', 필터 적용 가능) ───────────────
function _rpSegInner(cache, selected, mode) {
  if (!cache) return '';
  mode = mode || 'year';
  const axis = cache[mode] || cache.year;
  const { COLORS } = cache;
  const CHART_H = 168;
  const changeLabel = mode === 'year' ? 'YoY' : 'QoQ';

  const periods = axis.periods.slice(mode === 'year' ? -6 : -8);
  const dataMap = axis.dataMap;
  if (!periods.length) return `<div style="color:var(--text3);font-size:12px;padding:20px;text-align:center">표시할 매출 데이터 없음</div>`;

  const lastP       = periods[periods.length - 1];
  const latestKey   = lastP?.key;
  const latestData  = dataMap[latestKey] || {};
  const latestPartial = !!lastP?.partial;
  const prevKey     = periods.length >= 2 ? periods[periods.length - 2].key : null;

  // 세그먼트: 최신 기간 매출 내림차순
  const segNames = [...cache.segNames].sort((a, b) => (latestData[b] || 0) - (latestData[a] || 0));
  const latestTotal = segNames.reduce((s, n) => s + (latestData[n] || 0), 0);

  // 스파크라인
  const sparkline = (segName, color) => {
    const vals = periods.map(p => dataMap[p.key]?.[segName] || 0);
    if (vals.every(v => v === 0)) return '';
    const max = Math.max(...vals, 1), W = 54, H = 20;
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

  // ── 차트 ──
  let chartHTML;
  if (selected) {
    // 단일 세그먼트 바 차트
    const si    = segNames.indexOf(selected);
    const color = COLORS[si % COLORS.length];
    const vals  = periods.map(p => dataMap[p.key]?.[selected] || 0);
    const max   = Math.max(...vals, 1);
    chartHTML = `
      <div style="display:flex;align-items:flex-end;gap:6px;height:${CHART_H}px">
        ${periods.map((p, pi) => {
          const v = vals[pi], barH = Math.max(4, Math.round(v / max * CHART_H));
          const isLatest = pi === periods.length - 1;
          return `<div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:flex-end;height:${CHART_H}px">
            <div style="font-size:11px;font-weight:600;color:${color};text-align:center;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${v ? fmtCap(v * 1e6) : ''}</div>
            <div style="height:${barH}px;border-radius:3px 3px 0 0;background:${color};opacity:${isLatest ? 1 : .72};
              ${isLatest ? 'box-shadow:0 0 0 2px ' + color + '55' : ''}"></div>
          </div>`;
        }).join('')}
      </div>`;
  } else {
    // 전체 누적(스택) 바
    const totals = periods.map(p => segNames.reduce((s, n) => s + (dataMap[p.key]?.[n] || 0), 0));
    const maxTotal = Math.max(...totals, 1);
    chartHTML = `
      <div style="display:flex;align-items:flex-end;gap:6px;height:${CHART_H}px">
        ${periods.map((p, pi) => {
          const total = totals[pi], barH = Math.max(4, Math.round(total / maxTotal * CHART_H));
          const isLatest = pi === periods.length - 1;
          const segs = segNames.map((name, si) => ({
            name, rev: dataMap[p.key]?.[name] || 0, color: COLORS[si % COLORS.length],
          })).filter(s => s.rev > 0).reverse();
          return `<div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:flex-end;height:${CHART_H}px">
            <div style="font-size:11px;font-weight:600;color:var(--text1);text-align:center;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${total ? fmtCap(total * 1e6) : ''}</div>
            <div style="height:${barH}px;border-radius:3px 3px 0 0;overflow:hidden;display:flex;flex-direction:column;
              ${isLatest ? 'box-shadow:0 0 0 2px rgba(255,255,255,.22)' : ''}">
              ${segs.map(s => `<div style="flex:${s.rev};background:${s.color};min-height:2px"
                title="${escapeHtml(s.name)}: ${fmtCap(s.rev * 1e6)} (${total > 0 ? (s.rev / total * 100).toFixed(1) : 0}%)"></div>`).join('')}
            </div>
          </div>`;
        }).join('')}
      </div>`;
  }

  // 기간 라벨 (상단=연도 / 하단=분기 or 연간·N Q누적)
  const periodLabels = `
    <div style="display:flex;gap:6px;margin-top:5px">
      ${periods.map((p, pi) => {
        const isLast = pi === periods.length - 1;
        return `<div style="flex:1;min-width:0;text-align:center">
          <div style="font-size:11px;font-weight:${isLast ? 700 : 500};color:${isLast ? 'var(--text1)' : 'var(--text2)'}">${p.top}</div>
          <div style="font-size:10px;color:${isLast ? 'var(--tg)' : 'var(--text3)'}">${p.sub}</div>
        </div>`;
      }).join('')}
    </div>`;

  // ── 세그먼트 목록 ──
  const listHTML = segNames.filter(n => latestData[n]).map((name, si) => {
    const revenue = latestData[name] || 0;
    const pct     = latestTotal > 0 ? revenue / latestTotal * 100 : 0;
    const color   = COLORS[si % COLORS.length];
    const isTop   = si === 0, isSel = selected === name;
    const prevRev = prevKey ? (dataMap[prevKey]?.[name] ?? null) : null;
    // 최신 연도가 부분(N분기 누적)이면 YoY 비교는 왜곡 → 생략
    const chg = (!latestPartial && prevRev != null && prevRev > 0) ? (revenue - prevRev) / prevRev * 100 : null;
    const icon    = chg == null ? '' : chg > 3 ? '▲' : chg < -3 ? '▼' : '→';
    const chgCol  = chg == null ? 'var(--text3)' : chg > 0 ? '#f87171' : chg < 0 ? '#60a5fa' : 'var(--text2)';
    const chgStr  = chg == null ? '' : (chg >= 0 ? '+' : '') + chg.toFixed(1) + '%';
    const opacity = selected && !isSel ? 'opacity:.4;' : '';
    const border  = isSel ? `border:1.5px solid ${color}` : `border:1px solid ${isTop ? color + '40' : 'transparent'}`;
    const bg      = isSel ? color + '22' : (isTop ? color + '14' : 'var(--bg3)');
    return `<div onclick="rpSegFilter('${escJsStr(name)}')"
      style="padding:7px 10px;border-radius:var(--radius-sm);background:${bg};${border};
        cursor:pointer;transition:opacity .2s;${opacity}user-select:none"
      onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity=''">
      <div style="display:flex;align-items:center;gap:7px">
        <span style="font-size:11px;font-weight:800;color:${color};min-width:18px;text-align:center;
          background:${color}22;border-radius:3px;padding:1px 4px">${si + 1}</span>
        <span style="font-size:${isTop ? '13px' : '12px'};font-weight:${isTop || isSel ? 700 : 500};color:var(--text1);
          flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(name)}</span>
        ${sparkline(name, color)}
        <span style="font-size:12px;color:var(--text1);white-space:nowrap">${fmtCap(revenue * 1e6)}</span>
        <span style="font-size:${isTop ? '13px' : '12px'};font-weight:700;color:${color};min-width:40px;text-align:right">${pct.toFixed(1)}%</span>
        <span style="font-size:12px;font-weight:700;color:${chgCol};min-width:58px;text-align:right;white-space:nowrap">${icon} ${chgStr}</span>
      </div>
      <div style="height:3px;border-radius:2px;background:${color}22;overflow:hidden;margin-top:5px">
        <div style="height:100%;width:${pct}%;background:${color};border-radius:2px"></div>
      </div>
    </div>`;
  }).join('');

  const latestLabel = lastP ? `${lastP.top}${latestPartial ? ' ' + lastP.sub : ''}` : '';
  const headerRight = selected
    ? `<button onclick="rpSegFilter(null)" style="font-size:11px;padding:2px 10px;border:1px solid var(--border);
        border-radius:100px;background:var(--bg3);color:var(--text1);cursor:pointer">전체 보기</button>`
    : `<span style="font-size:11px;color:var(--text3)">사업 클릭 → 단일 추이 · ${changeLabel}</span>`;

  return `
    <div>${chartHTML}</div>
    ${periodLabels}
    <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:6px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:11px;color:var(--text2)">${latestLabel} 구성 · ${segNames.filter(n => latestData[n]).length}개 사업</span>
        ${headerRight}
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">${listHTML}</div>
      ${latestPartial ? `<div style="font-size:11px;color:var(--text3);margin-top:8px">* 최신 연도는 분기 누적(연환산 아님) — ${changeLabel} 비교는 생략</div>` : ''}
    </div>`;
}

// ── 세그먼트 필터 토글 (특정 세그먼트만 단일 바 차트로) ───────────────────────
function rpSegFilter(name) {
  if (!_rpSegCache) return;
  _rpSegSel = (_rpSegSel === name || name == null) ? null : name;
  const el = document.getElementById('rp-seg-inner');
  if (el) el.innerHTML = _rpSegInner(_rpSegCache, _rpSegSel, _rpSegMode);
}

// ── 연간/분기 축 전환 ─────────────────────────────────────────────────────────
function rpSegMode(m) {
  if (!_rpSegCache || (m !== 'year' && m !== 'quarter')) return;
  _rpSegMode = m;
  _rpSegSel = null;
  const el = document.getElementById('rp-seg-inner');
  if (el) el.innerHTML = _rpSegInner(_rpSegCache, null, m);
  document.querySelectorAll('[data-seg-mode]').forEach(b => {
    const on = b.getAttribute('data-seg-mode') === m;
    b.style.background = on ? 'var(--tg)' : 'transparent';
    b.style.color = on ? '#fff' : 'var(--text2)';
  });
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


// (2026-07-17) 3분할: FnGuide 밴드·기업개요·재무분석·투자지표 → report-fnguide.js,
//   지분현황·최근리포트·금감원공시·카탈리스트 → report-tabs.js (이 파일은 기업현황 서브 카드 전담)
