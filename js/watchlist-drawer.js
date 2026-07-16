// 투자노트 — 종목 상세 드로어 (행 클릭, watchlist.js에서 분할)

// =============================================
//  종목 상세 드로어 (행 클릭) — reference 정보 + 직접 편집 (모바일 친화)
// =============================================

// 행 클릭 → 드로어 열기 (버튼·인라인편집 셀 클릭은 가드로 제외)
function wlOpenDrawer(ev, code) {
  if (ev && ev.target.closest('button, input, textarea, select, a, .wl-editable, .wl-rowmenu')) return;
  WL.drawerCode = code;
  if (!document.getElementById('wl-drawer')) {
    const bd = document.createElement('div');
    bd.id = 'wl-drawer-backdrop'; bd.className = 'wl-drawer-backdrop';
    bd.onclick = wlCloseDrawer;
    document.body.appendChild(bd);
    const dr = document.createElement('div');
    dr.id = 'wl-drawer'; dr.className = 'wl-drawer';
    document.body.appendChild(dr);
    document.addEventListener('keydown', wlDrawerKey);
  }
  wlRenderDrawer(code);
  requestAnimationFrame(() => {
    document.getElementById('wl-drawer-backdrop')?.classList.add('open');
    document.getElementById('wl-drawer')?.classList.add('open');
  });
}

function wlDrawerKey(e) { if (e.key === 'Escape') wlCloseDrawer(); }

function wlCloseDrawer() {
  document.getElementById('wl-drawer-backdrop')?.classList.remove('open');
  document.getElementById('wl-drawer')?.classList.remove('open');
  document.removeEventListener('keydown', wlDrawerKey);
  setTimeout(() => {
    document.getElementById('wl-drawer-backdrop')?.remove();
    document.getElementById('wl-drawer')?.remove();
  }, 220);
  WL.drawerCode = null;
}

// 드로어 내용 렌더 — WL.cache 스냅샷에서 (재조회 없음)
function wlRenderDrawer(code) {
  const dr = document.getElementById('wl-drawer'); if (!dr) return;
  const C = WL.cache || {};
  const w = C.byCode?.[code];
  if (!w) { wlCloseDrawer(); return; }
  const mkt = C.priceMap?.[code] || {};
  const e   = C.effMap?.[code] || { avg:null, qty:null, realized:0, hasTx:false, closed:false };
  const price = mkt.price, chg = mkt.price_change_rate, cap = mkt.market_cap;
  const shares = (cap && price) ? cap / price : null;
  const nm = escJsStr(w.corp_name);
  const tw = C.targetWeights?.[code];

  const cat = (e.closed && w.group_name === '보유중') ? '청산' : w.group_name;
  const grpColor = { '관심':'#4a9eff','후보':'#ffc107','보유중':'var(--tg)','청산':'#6b7694' }[cat] || '#888';
  const grpText  = { '관심':'#0a1f3d','후보':'#2d1f00','보유중':'#002b1e','청산':'#0f1117' }[cat] || '#111';

  // ── 헤더 ──
  const head = `<div class="wl-drawer-head">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
      <div style="min-width:0">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span style="font-size:18px;font-weight:800">${escapeHtml(w.corp_name)}</span>
          <span style="font-size:11px;padding:1px 7px;border-radius:100px;background:${grpColor};color:${grpText};font-weight:700">${cat}</span>
        </div>
        <div style="font-size:12px;color:var(--text2);margin-top:2px">${(code||'').split('.')[0]} · ${C.industryMap?.[code] || w.industry || '—'}</div>
      </div>
      <button class="modal-close" onclick="wlCloseDrawer()">×</button>
    </div>
    <div style="display:flex;align-items:baseline;gap:8px;margin-top:8px">
      <span style="font-size:22px;font-weight:800;font-variant-numeric:tabular-nums">${fmtPrice(price)}</span>
      <span style="font-size:13px;font-weight:700;color:${chgColor(chg)}">${chg!=null ? (chg>=0?'+':'')+chg.toFixed(2)+'%' : ''}</span>
    </div>
  </div>`;

  // ── 핵심 지표 (표에서 이관한 펀더멘털·밸류) ──
  const roe = C.roeMap?.[code], opm = C.opmMap?.[code], rev = C.revMap?.[code], op = C.opMap?.[code];
  const metric = (label, val, color) =>
    `<div style="background:var(--bg2);border-radius:6px;padding:7px 9px">
       <div style="font-size:11px;color:var(--text2)">${label}</div>
       <div style="font-size:13px;font-weight:700;color:${color||'var(--text)'};font-variant-numeric:tabular-nums">${val}</div></div>`;
  const metricsGrid = `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">
    ${metric('시총', cap ? fmtEok(cap/1e8) : '—')}
    ${metric('PER', mkt.per!=null ? mkt.per.toFixed(1) : '—')}
    ${metric('PBR', mkt.pbr!=null ? mkt.pbr.toFixed(2) : '—')}
    ${metric('ROE', roe!=null ? roe.toFixed(1)+'%' : '—', roe!=null?chgColor(roe):null)}
    ${metric('OPM', opm!=null ? opm.toFixed(1)+'%' : '—', opm!=null&&opm>=0?chgColor(opm):null)}
    ${metric('매출', rev!=null ? fmtEok(rev/1e8) : '—')}
    ${metric('영업이익', op!=null ? fmtEok(op/1e8) : '—', op!=null?chgColor(op):null)}
  </div>`;
  const retLine = `<div style="font-size:11px;color:var(--text2)">등락 ${
    [['1주',mkt.week_return],['1개월',mkt.month_return],['3개월',mkt.quarter_return]]
      .map(([l,v]) => `${l} <b style="color:${v!=null?chgColor(v):'var(--text3)'}">${v!=null?(v>=0?'+':'')+v.toFixed(1)+'%':'—'}</b>`).join(' · ')}</div>`;

  // ── 포지션 / 청산 ──
  let posHtml = '';
  const acts = `<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
    <button class="btn btn-sm" style="color:var(--buy);font-weight:700" onclick="openTradeModal(${w.id},'${code}','${nm}','buy',${price||'null'})">매수</button>
    <button class="btn btn-sm" style="color:var(--sell);font-weight:700" onclick="openTradeModal(${w.id},'${code}','${nm}','sell',${price||'null'})">매도</button>
    ${e.hasTx ? `<button class="btn btn-sm" onclick="openTradeHistory('${code}','${nm}')">거래 이력</button>` : ''}
    ${e.closed && _journalAvailable ? `<button class="btn btn-sm" style="color:var(--accent)" onclick="openJournalModal('${code}','${nm}')">${_ICO.pen}복기</button>` : ''}
  </div>`;
  if (e.avg && e.qty && price) {
    const pnl = (price - e.avg) * e.qty, pnlPct = (price - e.avg) / e.avg * 100;
    const wPct = (C.valMap?.[code] && C.totalAssets) ? C.valMap[code] / C.totalAssets * 100 : null;
    const isStopHit = w.stop_price && price <= w.stop_price;
    posHtml = `<div>
      <div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">포지션</div>
      <div style="background:var(--bg2);border-radius:8px;padding:10px 12px;display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;font-size:12px">
        <div><span style="color:var(--text2)">평단·수량</span><br><b>${e.avg.toLocaleString()}원 · ${e.qty.toLocaleString()}주</b></div>
        <div><span style="color:var(--text2)">평가손익</span><br><b style="color:${chgColor(pnlPct)}">${pnlPct>=0?'+':''}${pnlPct.toFixed(1)}% · ${fmtWon(pnl,true)}</b></div>
        ${e.realized ? `<div><span style="color:var(--text2)">실현손익</span><br><b style="color:${chgColor(e.realized)}">${fmtWon(e.realized,true)}</b></div>` : ''}
        ${wPct!=null ? `<div><span style="color:var(--text2)">비중</span><br><b>${wPct.toFixed(1)}%${tw!=null?` <span style="color:var(--text2)">/ 목표 ${tw}%</span>`:''}</b></div>` : ''}
        ${w.stop_price ? `<div><span style="color:var(--text2)">손절가</span><br><b style="color:${isStopHit?'var(--down)':'var(--text)'}">${isStopHit?'⚠️ ':''}${w.stop_price.toLocaleString()}원</b></div>` : ''}
        ${e.creditLoan > 0 ? `<div><span style="color:var(--text2)">🔻 신용 융자</span><br><b style="color:var(--accent)">${fmtWon(e.creditLoan)}${e.creditQty?` · ${e.creditQty.toLocaleString()}주`:''}</b></div>` : ''}
      </div>${acts}
    </div>`;
  } else if (e.closed) {
    posHtml = `<div>
      <div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">청산</div>
      <div style="background:var(--bg2);border-radius:8px;padding:10px 12px;font-size:13px">
        실현손익 <b style="color:${chgColor(e.realized)}">${fmtWon(e.realized,true)}</b></div>${acts}
    </div>`;
  } else {
    posHtml = `<div>${acts}</div>`;
  }

  // ── 계획 (직접 편집) ──
  const av = s => (s==null?'':String(s)).replace(/"/g,'&quot;');
  const iS = 'background:var(--bg2);border:1px solid var(--border2);border-radius:6px;padding:6px 8px;color:var(--text);font-size:13px;width:100%;box-sizing:border-box';
  const lbl = t => `<span style="font-size:11px;color:var(--text2)">${t}</span>`;
  const fNum = (field,label,ph='') => `<label style="display:flex;flex-direction:column;gap:3px">${lbl(label)}<input type="number" value="${av(w[field])}" placeholder="${ph}" onkeydown="if(event.key==='Enter')this.blur()" onblur="wlDrawerEdit(event,'${code}','${field}','num')" style="${iS}"></label>`;
  const fDate = (field,label) => `<label style="display:flex;flex-direction:column;gap:3px">${lbl(label)}<input type="date" value="${av(w[field])}" onchange="wlDrawerEdit(event,'${code}','${field}','date')" style="${iS}"></label>`;
  const fWeight = () => `<label style="display:flex;flex-direction:column;gap:3px">${lbl('목표 비중 %')}<input type="number" step="0.5" min="0" max="100" value="${av(tw)}" placeholder="목표%" onkeydown="if(event.key==='Enter')this.blur()" onblur="wlDrawerEditWeight(event,'${code}')" style="${iS}"></label>`;
  const fLine = (field,label,ph='') => `<label style="display:flex;flex-direction:column;gap:3px">${lbl(label)}<input type="text" value="${av(w[field])}" placeholder="${ph}" onkeydown="if(event.key==='Enter')this.blur()" onblur="wlDrawerEdit(event,'${code}','${field}','text')" style="${iS}"></label>`;
  const fText = (field,label,ph='') => `<label style="display:flex;flex-direction:column;gap:3px">${lbl(label)}<textarea placeholder="${ph}" onblur="wlDrawerEdit(event,'${code}','${field}','text')" style="${iS};height:52px;resize:vertical">${w[field]||''}</textarea></label>`;

  const upsidePct = (w.target_price && price) ? (w.target_price - price) / price * 100 : null;
  const watchGap  = (w.watch_price && price) ? (w.watch_price - price) / price * 100 : null;
  const rr = (w.target_price && w.stop_price && price && price > w.stop_price) ? (w.target_price - price) / (price - w.stop_price) : null;
  const isTgtHit = e.avg && e.qty && price && w.target_price && price >= w.target_price;
  const isTrim   = e.avg && e.qty && price && w.target_price && !isTgtHit && price >= w.target_price * 0.9;
  const derived = [
    isTgtHit ? `<b style="color:var(--up)">🎯 목표 도달 — 익절 검토</b>`
    : isTrim ? `<b style="color:var(--accent)">✂️ 익절 구간 ${(price/w.target_price*100).toFixed(0)}%</b> · 남은 +${upsidePct.toFixed(1)}%`
    : upsidePct!=null ? `업사이드 <b style="color:${chgColor(upsidePct)}">${upsidePct>=0?'+':''}${upsidePct.toFixed(1)}%</b>` : '',
    watchGap!=null  ? `관심가까지 <b style="color:var(--blue)">${watchGap>=0?'+':''}${watchGap.toFixed(1)}%</b>` : '',
    rr!=null        ? `손익비 <b style="color:${rr>=2?'var(--up)':rr>=1?'var(--accent)':'var(--text1)'}">${rr.toFixed(1)}:1</b>` : '',
  ].filter(Boolean).join(' · ');

  const planSection = `<div>
    <div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">계획 <span style="font-weight:400;text-transform:none">· 클릭해서 바로 편집</span></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      ${fNum('watch_price','관심가(진입)')}${fNum('target_price','목표가')}${fNum('stop_price','🛑 손절가')}${fWeight()}${fDate('next_check_date','📅 다음 점검일')}
    </div>
    ${derived ? `<div style="font-size:11px;color:var(--text2);margin-top:8px">${derived}</div>` : ''}
  </div>`;

  const logicSection = `<div>
    <div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">투자 논리</div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${fText('thesis_1','💡 투자 근거')}
      ${fText('risk_1','⚠️ 핵심 리스크')}
      ${fLine('break_condition','❌ 무효화 조건 (깨지면 매도)')}
      ${fLine('catalyst','⚡ 상승 트리거')}
      ${fLine('next_check_memo','📌 점검 메모')}
    </div>
  </div>`;

  const footer = `<div style="display:flex;gap:8px;justify-content:space-between;padding-top:4px;border-top:1px solid var(--border)">
    <button class="btn btn-sm" onclick="openWatchlistModal(${w.id})">전체 수정</button>
    <button class="btn btn-sm" style="color:var(--red)" onclick="deleteWatchlist(${w.id},'${nm}')">삭제</button>
  </div>`;

  dr.innerHTML = head + `<div class="wl-drawer-body">${metricsGrid}${retLine}${posHtml}${planSection}${logicSection}${footer}</div>`;
}

// 드로어 내 필드 직접 편집 → watchlist 저장 + 갱신 (포커스가 드로어 밖일 때만 재렌더; 탭 이동 중 포커스 뺏김 방지)
async function wlDrawerEdit(ev, code, field, kind) {
  const w = WL.cache?.byCode?.[code]; if (!w) return;
  const v = (ev.target.value ?? '').trim();
  const out = kind === 'num' ? (v ? parseFloat(v) : null)
            : kind === 'int' ? (v ? parseInt(v)   : null)
            : (v || null); // text / date
  if (String(w[field] ?? '') === String(out ?? '')) return; // 변경 없음
  await sb.from('watchlist').update({ [field]: out, updated_at: new Date().toISOString() }).eq('id', w.id);
  await loadWatchlist(); // 캐시·표 갱신 + (포커스 드로어 밖이면) 드로어 재렌더
}

// 목표 비중은 app_config에 저장 (saveTargetWeight 내부에서 loadWatchlist 호출)
async function wlDrawerEditWeight(ev, code) {
  const v = (ev.target.value ?? '').trim();
  const cur = WL.cache?.targetWeights?.[code];
  const next = v === '' ? null : parseFloat(v);
  if (String(cur ?? '') === String(next ?? '')) return;
  await saveTargetWeight(code, next);
}
