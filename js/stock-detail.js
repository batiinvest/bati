// stock-detail.js — 종목 상세 통합 모달 (전 페이지 공용: data-stock-open 위임 → openStockDetail)
// financials.js에서 분리 (2026-07-17) — 기업 분석 페이지와 별개로 시황·스크리너·투자노트 등에서 호출
// 의존: config.js(sb·포맷터·escapeHtml류), financials.js(FIN 네임스페이스 — 먼저 로드)

// ══════════════════════════════════════════
//  📊 종목 상세 통합 모달 — 펀드매니저 뷰
// ══════════════════════════════════════════
async function openStockDetail(code, name, initTab = 'overview') {
  const _canEditSD = typeof canEdit === 'function' ? canEdit() : true;
  const _sdSafeName = escJsStr(name || '');
  document.getElementById('m-stock-detail')?.remove();
  const modal = document.createElement('div');
  modal.id = 'm-stock-detail';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:var(--z-modal-top);display:flex;align-items:center;justify-content:center;padding:12px;backdrop-filter:blur(3px)';

  modal.innerHTML = `
    <div style="background:var(--bg2);border-radius:14px;width:100%;max-width:1100px;
      height:90vh;overflow:hidden;display:flex;flex-direction:column;
      box-shadow:0 16px 64px rgba(0,0,0,.7);border:1px solid var(--border2)">

      <!-- 헤더 -->
      <div style="padding:14px 20px 10px;border-bottom:1px solid var(--border);flex-shrink:0;
        background:linear-gradient(135deg,var(--bg2) 0%,var(--bg3) 100%)">
        <div style="display:flex;align-items:flex-start;justify-content:space-between">
          <div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
              <span style="font-size:20px;font-weight:700">${escapeHtml(name)}</span>
              <span style="font-size:11px;color:var(--text2);padding:2px 7px;background:var(--bg3);
                border-radius:4px;border:1px solid var(--border);font-family:monospace">${escapeHtml(code)}</span>
              <span id="sd-industry-badge" style="font-size:11px;color:var(--tg)"></span>
            </div>
            <div id="sd-sub-info" style="font-size:11px;color:var(--text2)"></div>
          </div>
          <div style="display:flex;align-items:center;gap:12px">
            <div id="sd-price-badge" style="text-align:right"></div>
            ${_canEditSD ? `<button onclick="document.getElementById('m-stock-detail').remove();openReportFor('${code}','${_sdSafeName}')"
              style="background:var(--bg3);border:1px solid var(--border);cursor:pointer;color:var(--tg);
                font-size:12px;font-weight:600;padding:6px 12px;line-height:1;border-radius:6px;transition:.15s;white-space:nowrap"
              title="종목 리포트 전체 보기">전체 리포트 →</button>
            <button id="sd-watch-btn" onclick="window.sdToggleWatch('${code}','${_sdSafeName}')"
              style="background:var(--bg3);border:1px solid var(--border);cursor:pointer;color:var(--text1);
                font-size:12px;font-weight:600;padding:6px 12px;line-height:1;border-radius:6px;transition:.15s;white-space:nowrap"
              title="관심종목 추가/해제">⭐ 관심</button>` : ''}
            <button onclick="document.getElementById('m-stock-detail').remove()"
              style="background:var(--bg3);border:1px solid var(--border);cursor:pointer;
                color:var(--text2);font-size:18px;padding:2px 8px;line-height:1;
                border-radius:6px;transition:.15s" onmouseover="this.style.color='var(--text)'"
              onmouseout="this.style.color='var(--text3)'">×</button>
          </div>
        </div>
      </div>

      <!-- 탭 -->
      <div style="display:flex;border-bottom:1px solid var(--border);flex-shrink:0;padding:0 20px;
        background:var(--bg2);overflow-x:auto;scrollbar-width:none">
        ${[
          ['overview',  _ICO.doc,     '종합'],
          ['market',    _ICO.bar,     '시장 데이터'],
          ['financial', _ICO.coin,    '재무제표'],
          ['supply',    _ICO.shuffle, '수급'],
          ['opinion',   _ICO.target,  '증권사 의견'],
        ].map(([id, ic, lb]) => `
          <button id="sd-tab-${id}" onclick="window.sdSwitchTab('${id}')"
            style="background:none;border:none;border-bottom:2px solid transparent;
              padding:10px 16px;cursor:pointer;font-size:13px;font-weight:600;
              color:var(--text2);white-space:nowrap;transition:.15s;flex-shrink:0">
            ${ic}${lb}
          </button>`).join('')}
      </div>

      <!-- 콘텐츠 -->
      <div id="sd-body" style="overflow-y:auto;padding:20px;flex:1;min-height:0">
        <div style="text-align:center;color:var(--text2);padding:60px">
          <span class="loading"></span> 로딩 중...
        </div>
      </div>
    </div>`;

  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  // ESC 닫기 — 모달이 다른 경로(X·배경·전체 리포트)로 제거됐으면 리스너만 정리
  document.addEventListener('keydown', function _sdEsc(e) {
    if (!document.body.contains(modal)) { document.removeEventListener('keydown', _sdEsc); return; }
    if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', _sdEsc); }
  });
  document.body.appendChild(modal);

  // 기본 정보 로드
  FIN.sdCode = code; FIN.sdName = name;
  try {
    const { data: ci } = await sb.from('companies')
      .select('industry,sub_industry,market')
      .or(`code.eq.${code},code.eq.${code}.KS,code.eq.${code}.KQ`)
      .limit(1).maybeSingle();
    if (ci) {
      const ib = document.getElementById('sd-industry-badge');
      const si = document.getElementById('sd-sub-info');
      if (ib) ib.textContent = ci.industry || '';
      if (si) si.textContent = [ci.sub_industry, ci.market].filter(Boolean).join(' · ');
    }
  } catch(e) {}

  // 관심종목 등록 여부 반영 (버튼 토글 상태)
  if (_canEditSD) _sdCheckWatch(code);

  // 최신 시세로 헤더 가격 업데이트
  try {
    const { data: lp } = await sb.from('market_data')
      .select('price,price_change_rate,price_change,base_date')
      .eq('stock_code', code)
      .order('base_date', { ascending: false }).limit(1).maybeSingle();
    if (lp) {
      const pb = document.getElementById('sd-price-badge');
      if (pb) {
        const cc = chgColor(lp.price_change_rate);
        pb.innerHTML =
          `<div style="font-size:24px;font-weight:700">${lp.price?.toLocaleString()}원</div>` +
          `<div style="display:flex;gap:6px;justify-content:flex-end;margin-top:2px">` +
            `<span style="color:${cc};font-weight:700;font-size:14px">${chgStr(lp.price_change_rate)}</span>` +
            (lp.price_change != null ? `<span style="color:${cc};font-size:12px">${lp.price_change>0?'+':''}${lp.price_change?.toLocaleString()}원</span>` : '') +
            `<span style="color:var(--text2);font-size:11px">${lp.base_date}</span>` +
          `</div>`;
      }
    }
  } catch(e) {}

  window.sdSwitchTab = async (tab) => {
    ['overview','market','financial','supply','opinion'].forEach(t => {
      const btn = document.getElementById('sd-tab-'+t);
      if (btn) {
        btn.style.color = t===tab ? 'var(--tg)' : 'var(--text3)';
        btn.style.borderBottomColor = t===tab ? 'var(--tg)' : 'transparent';
      }
    });
    const body = document.getElementById('sd-body');
    if (!body) return;
    body.innerHTML = '<div style="text-align:center;color:var(--text2);padding:60px"><span class="loading"></span></div>';
    const fns = {
      overview:  _sdOverview,
      market:    _sdMarket,
      financial: _sdFinancial,
      supply:    _sdSupply,
      opinion:   _sdOpinion,
    };
    if (fns[tab]) await fns[tab](body, code, name);
  };

  await window.sdSwitchTab(initTab);
}

async function openFinTrend(code, name)     { openStockDetail(code, name, 'financial'); }
async function openMarketDetail(code, name) { openStockDetail(code, name, 'market'); }

// ── 상세 모달 → 관심종목(워치리스트) 토글 ────────────────────────────────────
// 버튼 상태 반영: 'in'(등록됨, ✓) / 'out'(미등록, ⭐)
function _sdSetWatchBtn(state) {
  const btn = document.getElementById('sd-watch-btn');
  if (!btn) return;
  btn.disabled = false;
  if (state === 'in') {
    btn.textContent      = '✓ 관심';
    btn.style.color      = 'var(--tg)';
    btn.style.borderColor = 'var(--tg)';
    btn.onmouseover = function(){ this.style.borderColor = 'var(--red)'; };
    btn.onmouseout  = function(){ this.style.borderColor = 'var(--tg)';  };
    btn.title = '관심 해제';
  } else {
    btn.textContent      = '⭐ 관심';
    btn.style.color      = 'var(--text1)';
    btn.style.borderColor = 'var(--border)';
    btn.onmouseover = function(){ this.style.borderColor = 'var(--tg)';    };
    btn.onmouseout  = function(){ this.style.borderColor = 'var(--border)'; };
    btn.title = '관심종목에 추가';
  }
}

// 현재 등록 여부 조회 → 버튼 상태 반영 (모달 오픈 시)
async function _sdCheckWatch(code) {
  const bare = String(code).replace(/\.(KS|KQ)$/, '');
  try {
    const { data } = await sb.from('watchlist')
      .select('id')
      .or(`stock_code.eq.${bare},stock_code.eq.${bare}.KS,stock_code.eq.${bare}.KQ`)
      .limit(1);
    _sdSetWatchBtn(data && data.length ? 'in' : 'out');
  } catch(e) { /* 조회 실패 시 기본(⭐) 유지 */ }
}

// 토글: 미등록→추가('관심'), 등록→해제(단, 보유/노트 보호)
window.sdToggleWatch = async function(code, name) {
  if (typeof canEdit === 'function' && !canEdit()) {
    if (typeof toast === 'function') toast('권한이 없습니다.', 'error');
    return;
  }
  const bare = String(code).replace(/\.(KS|KQ)$/, '');
  try {
    const { data } = await sb.from('watchlist')
      .select('id,group_name,quantity,thesis_1,catalyst,target_price,watch_price,risk_1')
      .or(`stock_code.eq.${bare},stock_code.eq.${bare}.KS,stock_code.eq.${bare}.KQ`)
      .limit(1);
    const row = data && data[0];

    if (!row) {
      // ── 추가 ──
      const ind = document.getElementById('sd-industry-badge')?.textContent?.trim() || null;
      const { error } = await sb.from('watchlist').insert({
        stock_code: bare,
        corp_name:  name,
        industry:   ind || null,
        group_name: '관심',
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      _sdSetWatchBtn('in');
      if (typeof toast === 'function') toast('⭐ 관심종목에 추가했습니다.', 'success');
    } else {
      // ── 해제 ── 보유 포지션은 거래기록 꼬임 방지 위해 차단
      const isPosition = row.group_name === '보유중' || (row.quantity && row.quantity > 0);
      if (isPosition) {
        if (typeof toast === 'function') toast('보유 종목입니다 — 투자노트에서 관리하세요. (여기서 해제 불가)', 'info');
        _sdSetWatchBtn('in');
        return;
      }
      // 메모가 있는 관심/후보는 실수 삭제 방지 위해 확인
      const hasNotes = row.thesis_1 || row.catalyst || row.target_price || row.watch_price || row.risk_1;
      if (hasNotes && !confirm(`'${name}'에 작성한 투자노트(근거·목표가 등)가 함께 삭제됩니다. 관심에서 제거할까요?`)) {
        _sdSetWatchBtn('in');
        return;
      }
      const { error } = await sb.from('watchlist').delete().eq('id', row.id);
      if (error) throw error;
      _sdSetWatchBtn('out');
      if (typeof toast === 'function') toast('관심종목에서 제거했습니다.', 'success');
    }
    // 워치리스트 화면이 떠 있으면 갱신
    if (typeof loadWatchlist === 'function' && document.getElementById('wl-body')) loadWatchlist();
  } catch(e) {
    console.error('[sdToggleWatch]', e);
    if (typeof toast === 'function') toast('처리 실패: ' + e.message, 'error');
  }
};

// ─────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────
const _sdRow2 = (label, val, color='') =>
  `<div style="display:flex;justify-content:space-between;align-items:center;
    padding:5px 0;border-bottom:1px solid var(--border)">
    <span style="font-size:12px;color:var(--text)">${label}</span>
    <span style="font-size:13px;font-weight:600;color:${color||'var(--text1)'}">${val}</span>
  </div>`;

const _sdSec = (title, content, accent='var(--tg)') =>
  `<div style="background:var(--bg3);border-radius:10px;padding:14px 16px;
    border:1px solid var(--border);border-top:2px solid ${accent}">
    <div style="font-size:11px;font-weight:700;color:var(--text1);
      letter-spacing:.6px;margin-bottom:10px">${title}</div>
    ${content}
  </div>`;

const _sdPct = v => v != null ? v.toFixed(1)+'%' : '—';
const _sdNum = v => v != null ? v.toLocaleString() : '—';
const _sdCap = v => v != null ? fmtCap(v) : '—';
const _sdWon = fmtPrice;  // config.js 전역 헬퍼 — 동일 동작

function _sdW52bar(r) {
  const hi = r.w52_high||0, lo = r.w52_low||0, cur = r.price||0;
  const pct = hi>lo ? Math.round((cur-lo)/(hi-lo)*100) : 50;
  const c = pct>=80?'var(--red)':pct<=20?'var(--blue)':'var(--tg)';
  return `
    <div style="margin:8px 0 4px">
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text1);margin-bottom:4px">
        <span>저 ${_sdWon(lo)}</span>
        <span style="color:${c};font-weight:700">현재 ${pct}%</span>
        <span>고 ${_sdWon(hi)}</span>
      </div>
      <div style="height:5px;background:var(--border);border-radius:3px;position:relative">
        <div style="position:absolute;left:0;width:${pct}%;height:100%;
          background:${c};border-radius:3px;opacity:.5"></div>
        <div style="position:absolute;left:${pct}%;transform:translateX(-50%);
          width:11px;height:11px;background:${c};border:2px solid var(--bg2);
          border-radius:50%;top:-3px"></div>
      </div>
    </div>`;
}

function _sdRetStr(hist, days) {
  if (!hist || hist.length <= days) return '—';
  const sorted = [...hist].sort((a,b)=>a.base_date.localeCompare(b.base_date));
  const cur  = sorted[sorted.length-1]?.price;
  const past = sorted[Math.max(0, sorted.length-1-days)]?.price;
  if (!cur || !past) return '—';
  const ret = ((cur-past)/past*100).toFixed(2);
  return `<span style="color:${ret>=0?'var(--red)':'var(--blue)'}">${ret>=0?'+':''}${ret}%</span>`;
}

// ─────────────────────────────────────────
// 탭1: 종합 Overview
// ─────────────────────────────────────────
async function _sdOverview(body, code, name) {
  try {
    const [
      { data: md },
      { data: fins },
      { data: opinions },
      { data: hist90 },
    ] = await Promise.all([
      sb.from('market_data').select('*').eq('stock_code', code)
        .order('base_date', { ascending:false }).limit(1).maybeSingle(),
      sb.from('financials').select('bsns_year,quarter,revenue,operating_profit,net_income,operating_margin,net_margin,roe,roa,debt_ratio,total_assets,total_equity,operating_cashflow,fcf,fcf_direct,fcf_indirect,capex,capex_intangible,capex_total,depreciation,amortization,da,ebitda')
        .eq('stock_code', code).eq('fs_div','CFS')
        .order('bsns_year',{ascending:false}).order('quarter',{ascending:false}).limit(8),
      sb.from('analyst_opinions').select('firm_name,opinion,target_price,gap_rate,opinion_date')
        .eq('stock_code', code).in('opinion_code',['1','2'])
        .order('opinion_date',{ascending:false}).limit(10),
      sb.from('market_data').select('base_date,price,price_change_rate,volume,foreign_net_buy')
        .eq('stock_code', code).order('base_date',{ascending:false}).limit(90),
    ]);

    const r = md || {};
    const latestFin = fins?.[0] || {};
    const prevFin   = fins?.[1] || {};

    // 컨센서스
    const tgPrices = (opinions||[]).map(o=>o.target_price).filter(v=>v>0);
    const avgTarget = tgPrices.length ? Math.round(tgPrices.reduce((a,b)=>a+b,0)/tgPrices.length) : null;
    const upside = avgTarget && r.price ? ((avgTarget-r.price)/r.price*100).toFixed(1) : null;
    const buyCount = (opinions||[]).length;

    // QoQ 영업이익 성장
    const qoqOp = latestFin.operating_profit && prevFin.operating_profit
      ? ((latestFin.operating_profit-prevFin.operating_profit)/Math.abs(prevFin.operating_profit)*100).toFixed(1)
      : null;

    const signalItems = [];
    if (r.hgpr_cls) signalItems.push(`<span style="background:rgba(42,171,238,.15);color:var(--tg);padding:2px 8px;border-radius:4px;font-size:11px">📈 ${r.hgpr_cls}</span>`);
    if (r.is_caution) signalItems.push(`<span style="background:rgba(245,54,92,.15);color:var(--red);padding:2px 8px;border-radius:4px;font-size:11px">⚠️ 투자유의</span>`);
    if (r.manage_issue_code && r.manage_issue_code!=='0') signalItems.push(`<span style="background:rgba(245,54,92,.2);color:var(--red);padding:2px 8px;border-radius:4px;font-size:11px">🚨 관리종목</span>`);
    if (r.is_short_over) signalItems.push(`<span style="background:rgba(251,99,64,.15);color:var(--yellow);padding:2px 8px;border-radius:4px;font-size:11px">🔥 단기과열</span>`);
    if (upside > 0) signalItems.push(`<span style="background:rgba(45,206,137,.12);color:var(--green);padding:2px 8px;border-radius:4px;font-size:11px">🎯 목표가 +${upside}%</span>`);

    body.innerHTML = `
      <!-- 시그널 배지 -->
      ${signalItems.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">${signalItems.join('')}</div>` : ''}

      <!-- 핵심 지표 5개 KPI -->
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:14px">
        ${[
          ['시가총액', _sdCap(r.market_cap), 'var(--tg)'],
          ['PER / PBR', `${r.per!=null&&r.per!==0?r.per.toFixed(1):'—'}배 / ${r.pbr!=null&&r.pbr!==0?r.pbr.toFixed(2):'—'}배`, ''],
          ['영업이익률', _sdPct(latestFin.operating_margin), latestFin.operating_margin>=15?'var(--green)':latestFin.operating_margin>=0?'var(--text1)':'var(--red)'],
          ['ROE', _sdPct(latestFin.roe), latestFin.roe>=15?'var(--green)':latestFin.roe>=0?'var(--text1)':'var(--red)'],
          ['외국인 보유율', r.foreign_hold_rate!=null?r.foreign_hold_rate.toFixed(1)+'%':'—', ''],
        ].map(([lb,v,c])=>`
          <div style="background:var(--bg3);border-radius:8px;padding:12px 14px;border:1px solid var(--border);text-align:center">
            <div style="font-size:11px;color:var(--text1);margin-bottom:6px">${lb}</div>
            <div style="font-size:16px;font-weight:700;color:${c||'var(--text1)'}">${v}</div>
          </div>`).join('')}
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:14px">
        <!-- 가격 범위 -->
        ${_sdSec('가격 범위 · 수익률', `
          ${_sdW52bar(r)}
          ${_sdRow2('52주 고가', _sdWon(r.w52_high), 'var(--red)')}
          ${_sdRow2('52주 저가', _sdWon(r.w52_low), 'var(--blue)')}
          <div style="height:8px"></div>
          ${_sdRow2('1주 수익률',  _sdRetStr(hist90, 5))}
          ${_sdRow2('1달 수익률',  _sdRetStr(hist90, 21))}
          ${_sdRow2('3달 수익률',  _sdRetStr(hist90, 63))}
        `, 'var(--tg)')}

        <!-- 최근 실적 -->
        ${_sdSec(`최근 실적 (${latestFin.bsns_year||'—'} ${latestFin.quarter||'—'})`, `
          ${_sdRow2('매출액', _sdCap(latestFin.revenue))}
          ${_sdRow2('영업이익', _sdCap(latestFin.operating_profit), (latestFin.operating_profit||0)>0?'var(--green)':(latestFin.operating_profit||0)<0?'var(--red)':'')}
          ${_sdRow2('영업이익률', _sdPct(latestFin.operating_margin), (latestFin.operating_margin||0)>=10?'var(--green)':'var(--text1)')}
          ${_sdRow2('순이익', _sdCap(latestFin.net_income), (latestFin.net_income||0)>0?'var(--red)':'var(--blue)')}
          ${_sdRow2('FCF', _sdCap(latestFin.fcf), (latestFin.fcf||0)>0?'var(--green)':'var(--red)')}
          ${latestFin.ebitda!=null?_sdRow2('EBITDA', _sdCap(latestFin.ebitda), (latestFin.ebitda||0)>0?'var(--red)':'var(--blue)'):''}
          ${qoqOp != null ? _sdRow2('QoQ 영업이익', `<span style="color:${qoqOp>=0?'var(--red)':'var(--blue)'}">${qoqOp>=0?'+':''}${qoqOp}%</span>`) : ''}
          ${_sdRow2('ROE', _sdPct(latestFin.roe))}
          ${_sdRow2('부채비율', _sdPct(latestFin.debt_ratio))}
        `, 'var(--green)')}

        <!-- 증권사 컨센서스 -->
        ${_sdSec('증권사 컨센서스', `
          ${avgTarget ? `
            <div style="text-align:center;margin-bottom:10px">
              <div style="font-size:11px;color:var(--text1);margin-bottom:2px">평균 목표주가</div>
              <div style="font-size:22px;font-weight:700;color:var(--text1)">${avgTarget.toLocaleString()}원</div>
              ${upside != null ? `<div style="font-size:14px;color:${upside>=0?'var(--green)':'var(--red)'};font-weight:600">현재가 대비 ${upside>=0?'+':''}${upside}%</div>` : ''}
            </div>` : '<div style="color:var(--text2);font-size:12px;padding:8px 0">컨센서스 없음</div>'}
          ${_sdRow2('커버리지', `${buyCount}개 증권사`)}
          ${(opinions||[]).slice(0,4).map(o=>
            `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);font-size:12px">
              <span style="color:var(--text1)">${o.firm_name}</span>
              <span style="color:${o.opinion?.includes('매수')||o.opinion==='BUY'?'var(--red)':'var(--text2)'}">
                ${o.opinion} ${o.target_price?o.target_price.toLocaleString()+'원':''}
              </span>
            </div>`).join('')}
        `, 'var(--yellow)')}
      </div>`;
  } catch(e) {
    body.innerHTML = `<div style="color:var(--red);padding:20px">오류: ${e.message}</div>`;
  }
}

// ─────────────────────────────────────────
// 탭2: 시장 데이터 (전체 필드)
// ─────────────────────────────────────────
async function _sdMarket(body, code, name) {
  try {
    const { data: r } = await sb.from('market_data')
      .select('*').eq('stock_code', code)
      .order('base_date', { ascending:false }).limit(1).maybeSingle();
    const { data: hist } = await sb.from('market_data')
      .select('base_date,price,price_change_rate,market_cap,volume,trading_value,per,pbr,foreign_net_buy,foreign_hold_rate,program_net_buy,short_sell_qty')
      .eq('stock_code', code)
      .order('base_date', { ascending:false }).limit(90);

    if (!r) { body.innerHTML='<div style="color:var(--text2);padding:40px;text-align:center">데이터 없음</div>'; return; }

    const sorted = (hist||[]).slice().reverse();

    body.innerHTML = `
      <!-- 3종 차트 -->
      <div style="background:var(--bg3);border-radius:10px;border:1px solid var(--border);
        padding:14px 16px;margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;color:var(--text1);letter-spacing:.6px;margin-bottom:10px">
          주가 · 거래량 · 외국인 지분율
        </div>
        <div style="display:grid;grid-template-columns:1fr;gap:8px">
          <div>
            <div style="font-size:11px;color:var(--tg);margin-bottom:3px;font-weight:600">주가 (원)</div>
            <div style="position:relative;height:130px"><canvas id="sd-chart-price"></canvas></div>
          </div>
          <div>
            <div style="font-size:11px;color:var(--green);margin-bottom:3px;font-weight:600">거래량</div>
            <div style="position:relative;height:80px"><canvas id="sd-chart-volume"></canvas></div>
          </div>
          <div>
            <div style="font-size:11px;color:var(--yellow);margin-bottom:3px;font-weight:600">외국인 보유율 (%)</div>
            <div style="position:relative;height:80px"><canvas id="sd-chart-foreign"></canvas></div>
          </div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-bottom:16px">
        ${_sdSec('VALUATION', `
          ${_sdRow2('시가총액', _sdCap(r.market_cap))}
          ${_sdRow2('PER', r.per&&r.per!==0?r.per.toFixed(1)+'배':'—')}
          ${_sdRow2('PBR', r.pbr&&r.pbr!==0?r.pbr.toFixed(2)+'배':'—')}
          ${_sdRow2('EPS', _sdWon(r.eps))}
          ${_sdRow2('BPS', _sdWon(r.bps))}
          ${_sdRow2('결산월', r.fiscal_month?r.fiscal_month+'월':'—')}
        `)}
        ${_sdSec('가격 · 거래', `
          ${_sdRow2('현재가', _sdWon(r.price))}
          ${r.open_price  ? _sdRow2('시가',    _sdWon(r.open_price)) : ''}
          ${r.high_price  ? _sdRow2('고가',    _sdWon(r.high_price), 'var(--red)') : ''}
          ${r.low_price   ? _sdRow2('저가',    _sdWon(r.low_price),  'var(--blue)') : ''}
          ${r.base_price  ? _sdRow2('기준가',  _sdWon(r.base_price)) : ''}
          ${r.limit_high  ? _sdRow2('상한가',  _sdWon(r.limit_high), 'var(--red)') : ''}
          ${r.limit_low   ? _sdRow2('하한가',  _sdWon(r.limit_low),  'var(--blue)') : ''}
          ${r.vwap        ? _sdRow2('VWAP',    _sdWon(r.vwap)) : ''}
          ${_sdRow2('거래량', _sdNum(r.volume))}
          ${_sdRow2('거래대금', _sdCap(r.trading_value))}
          ${r.vol_turnover ? _sdRow2('거래회전율', _sdPct(r.vol_turnover)) : ''}
        `)}
        ${_sdSec('52주 · 수익률', `
          ${_sdW52bar(r)}
          ${_sdRow2('52주 고가', _sdWon(r.w52_high), 'var(--red)')}
          ${_sdRow2('52주 저가', _sdWon(r.w52_low), 'var(--blue)')}
          ${_sdRow2('52주 고가일', r.w52_high_date||'—')}
          ${_sdRow2('52주 고가대비', _sdPct(r.price && r.w52_high ? (r.price - r.w52_high) / r.w52_high * 100 : null))}
          ${_sdRow2('52주 저가대비', _sdPct(r.price && r.w52_low  ? (r.price - r.w52_low)  / r.w52_low  * 100 : null))}
          ${_sdRow2('1주 수익률', _sdRetStr(hist,5))}
          ${_sdRow2('1달 수익률', _sdRetStr(hist,21))}
          ${_sdRow2('3달 수익률', _sdRetStr(hist,63))}
        `)}
        ${_sdSec('종목 상태', `
          ${_sdRow2('시장경고', r.market_warn_code&&r.market_warn_code!=='00'?`<span style="color:var(--yellow)">${{'01':'주의','02':'경고','03':'위험예고','04':'위험'}[r.market_warn_code]||r.market_warn_code}</span>`:'정상')}
          ${r.manage_issue_code&&r.manage_issue_code!=='0'?_sdRow2('관리종목','<span style="color:var(--red)">지정</span>'):''}
          ${r.is_short_over ?_sdRow2('단기과열','<span style="color:var(--yellow)">예</span>'):''}
          ${r.is_liquidation?_sdRow2('정리매매','<span style="color:var(--red)">예</span>'):''}
          ${r.hgpr_cls      ?_sdRow2('신고가구분', r.hgpr_cls):''}
          ${_sdRow2('상장주수', _sdNum(r.listing_shares)+'주')}
          ${_sdRow2('시장', r.market||'—')}
        `)}
      </div>
      <div style="font-size:11px;font-weight:700;color:var(--text1);letter-spacing:.6px;margin-bottom:8px">
        최근 시장 데이터 (${sorted.length}일)
      </div>
      <div class="table-wrap"><table>
        <thead><tr>
          <th>기준일</th><th style="text-align:right">종가</th><th style="text-align:right">등락률</th>
          <th style="text-align:right">시가총액</th><th style="text-align:right">거래량</th>
          <th style="text-align:right">거래대금</th><th style="text-align:right">외국인순매수</th>
          <th style="text-align:right">외국인보유율</th><th style="text-align:right">PER</th><th style="text-align:right">PBR</th>
        </tr></thead>
        <tbody>${sorted.slice().reverse().map(h=>{
          const hc = h.price_change_rate;
          return `<tr>
            <td style="font-size:11px;color:var(--text2)">${h.base_date}</td>
            <td style="text-align:right;font-weight:600">${fmtPrice(h.price)}</td>
            <td style="text-align:right;color:${chgColor(hc)};font-weight:600">${chgStr(hc)}</td>
            <td style="text-align:right;color:var(--text1)">${h.market_cap?_sdCap(h.market_cap):'—'}</td>
            <td style="text-align:right;color:var(--text1)">${h.volume?h.volume.toLocaleString():'—'}</td>
            <td style="text-align:right;color:var(--text1)">${h.trading_value?_sdCap(h.trading_value):'—'}</td>
            <td style="text-align:right;color:${(h.foreign_net_buy||0)<0?'var(--blue)':'var(--red)'}">
              ${h.foreign_net_buy!=null?h.foreign_net_buy.toLocaleString():'—'}
            </td>
            <td style="text-align:right;color:var(--text1)">${h.foreign_hold_rate!=null?h.foreign_hold_rate.toFixed(1)+'%':'—'}</td>
            <td style="text-align:right;color:var(--text1)">${h.per&&h.per!==0?h.per.toFixed(1):'—'}</td>
            <td style="text-align:right;color:var(--text1)">${h.pbr&&h.pbr!==0?h.pbr.toFixed(2):'—'}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>`;

    // 3종 차트 초기화
    const _sdChartOpts = (fmt, tickLimit=8) => ({
      responsive:true, maintainAspectRatio:false, animation:false,
      plugins:{ legend:{display:false}, tooltip:{callbacks:{label:ctx=>fmt(ctx.raw)}} },
      scales:{
        x:{ grid:{color:'rgba(255,255,255,.03)'}, ticks:{color:'rgba(255,255,255,.25)',maxTicksLimit:tickLimit,font:{size:9}} },
        y:{ grid:{color:'rgba(255,255,255,.03)'}, ticks:{color:'rgba(255,255,255,.25)',font:{size:9},callback:v=>fmt(v)} },
      },
    });
    const _makeChart = (id, type, data, color, fill, fmt) => {
      const canvas = document.getElementById(id);
      if (!canvas || !window.Chart) return;
      return new window.Chart(canvas.getContext('2d'), {
        type,
        data:{ labels: sorted.map(r=>r.base_date.slice(5)), datasets:[{
          data, borderColor: Array.isArray(color)?undefined:color,
          backgroundColor: type==='bar'?color:fill,
          borderWidth: type==='line'?2:0, pointRadius:0, tension:0.3,
          fill: fill!==false,
        }]},
        options: _sdChartOpts(fmt),
      });
    };
    setTimeout(() => {
      _makeChart('sd-chart-price',
        'line',
        sorted.map(r=>r.price),
        'rgba(42,171,238,.9)', 'rgba(42,171,238,.07)',
        v => v!=null?v.toLocaleString()+'원':''
      );
      _makeChart('sd-chart-volume',
        'bar',
        sorted.map(r=>r.volume),
        sorted.map(r=>(r.volume||0)>0?'rgba(45,206,137,.65)':'rgba(255,255,255,.1)'),
        false,
        v => v!=null?(v/10000).toFixed(0)+'만':''
      );
      _makeChart('sd-chart-foreign',
        'line',
        sorted.map(r=>r.foreign_hold_rate),
        'rgba(251,99,64,.9)', 'rgba(251,99,64,.07)',
        v => v!=null?v.toFixed(1)+'%':''
      );
    }, 50);
  } catch(e) { body.innerHTML=`<div style="color:var(--red);padding:20px">오류: ${e.message}</div>`; }
}

// ─────────────────────────────────────────
// 탭3: 재무제표 (기존 차트 포함)
// ─────────────────────────────────────────
async function _sdFinancial(body, code, name) {
  await _renderFinancialTab(body, code, name);
}

// ─────────────────────────────────────────
// 탭4: 수급 상세
// ─────────────────────────────────────────
async function _sdSupply(body, code, name) {
  try {
    const { data: hist } = await sb.from('market_data')
      .select('base_date,price,price_change_rate,foreign_net_buy,foreign_hold_rate,foreign_hold_qty,program_net_buy,short_sell_qty,loan_balance_rate,volume,trading_value')
      .eq('stock_code', code)
      .order('base_date', { ascending:false }).limit(30);

    const { data: latest } = await sb.from('market_data')
      .select('foreign_hold_rate,foreign_hold_qty,foreign_net_buy,program_net_buy,short_sell_qty,loan_balance_rate,volume,trading_value,listing_shares')
      .eq('stock_code', code)
      .order('base_date',{ascending:false}).limit(1).maybeSingle();

    const r = latest || {};
    const rows = (hist||[]).slice().reverse();

    // 외국인 누적 (최근 5일/10일/20일)
    const fNet = (days) => {
      const sl = rows.slice(-days);
      const sum = sl.reduce((a,h)=>a+(h.foreign_net_buy||0),0);
      return `<span style="color:${sum>=0?'var(--red)':'var(--blue)'}">${sum>=0?'+':''}${sum.toLocaleString()}</span>`;
    };

    body.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px">
        ${_sdSec('외국인 수급', `
          ${_sdRow2('보유율', r.foreign_hold_rate!=null?r.foreign_hold_rate.toFixed(2)+'%':'—')}
          ${_sdRow2('보유수량', r.foreign_hold_qty!=null?_sdNum(r.foreign_hold_qty)+'주':'—')}
          ${_sdRow2('당일 순매수', r.foreign_net_buy!=null?`<span style="color:${(r.foreign_net_buy||0)>=0?'var(--red)':'var(--blue)'}">
            ${r.foreign_net_buy.toLocaleString()}주</span>`:'—')}
          ${_sdRow2('5일 누적', fNet(5)+'주')}
          ${_sdRow2('10일 누적', fNet(10)+'주')}
          ${_sdRow2('20일 누적', fNet(20)+'주')}
        `, 'var(--tg)')}
        ${_sdSec('프로그램 · 공매도', `
          ${_sdRow2('프로그램 순매수', r.program_net_buy!=null?`<span style="color:${(r.program_net_buy||0)>=0?'var(--red)':'var(--blue)'}">
            ${_sdNum(r.program_net_buy)}주</span>`:'—')}
          ${_sdRow2('공매도 체결수량', r.short_sell_qty!=null?_sdNum(r.short_sell_qty)+'주':'—')}
          ${_sdRow2('융자잔고율', r.loan_balance_rate!=null?r.loan_balance_rate.toFixed(2)+'%':'—')}
        `, 'var(--yellow)')}
        ${_sdSec('거래 강도', `
          ${_sdRow2('거래량', _sdNum(r.volume))}
          ${_sdRow2('거래대금', _sdCap(r.trading_value))}
          ${_sdRow2('상장주수', r.listing_shares?_sdNum(r.listing_shares)+'주':'—')}
          ${r.listing_shares&&r.volume?_sdRow2('일 회전율', (r.volume/r.listing_shares*100).toFixed(3)+'%'):''}
        `, 'var(--green)')}
      </div>
      <div style="font-size:11px;font-weight:700;color:var(--text1);letter-spacing:.6px;margin-bottom:8px">최근 30일 수급 추이</div>
      <div class="table-wrap"><table>
        <thead><tr>
          <th>기준일</th><th style="text-align:right">종가</th><th style="text-align:right">등락률</th>
          <th style="text-align:right">외국인순매수</th><th style="text-align:right">외국인보유율</th>
          <th style="text-align:right">프로그램순매수</th><th style="text-align:right">공매도</th>
          <th style="text-align:right">융자잔고율</th>
        </tr></thead>
        <tbody>${rows.slice().reverse().map(h=>{
          const hc = h.price_change_rate;
          return `<tr>
            <td style="font-size:11px;color:var(--text2)">${h.base_date}</td>
            <td style="text-align:right;font-weight:600">${fmtPrice(h.price)}</td>
            <td style="text-align:right;color:${chgColor(hc)};font-weight:600">${chgStr(hc)}</td>
            <td style="text-align:right;color:${(h.foreign_net_buy||0)<0?'var(--blue)':'var(--red)'}">
              ${h.foreign_net_buy!=null?h.foreign_net_buy.toLocaleString():'—'}
            </td>
            <td style="text-align:right">${h.foreign_hold_rate!=null?h.foreign_hold_rate.toFixed(1)+'%':'—'}</td>
            <td style="text-align:right;color:${(h.program_net_buy||0)<0?'var(--blue)':'var(--red)'}">
              ${h.program_net_buy!=null?h.program_net_buy.toLocaleString():'—'}
            </td>
            <td style="text-align:right;color:var(--text1)">${h.short_sell_qty!=null?h.short_sell_qty.toLocaleString():'—'}</td>
            <td style="text-align:right;color:var(--text1)">${h.loan_balance_rate!=null?h.loan_balance_rate.toFixed(2)+'%':'—'}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>`;
  } catch(e) { body.innerHTML=`<div style="color:var(--red);padding:20px">오류: ${e.message}</div>`; }
}

// ─────────────────────────────────────────
// 탭5: 증권사 투자의견
// ─────────────────────────────────────────
async function _sdOpinion(body, code, name) {
  try {
    const { data: opinions } = await sb.from('analyst_opinions')
      .select('*').eq('stock_code', code)
      .order('opinion_date',{ascending:false}).limit(100);

    if (!opinions?.length) {
      body.innerHTML = '<div style="color:var(--text2);padding:60px;text-align:center">증권사 투자의견 없음<br><span style="font-size:11px">수집된 데이터가 없습니다</span></div>';
      return;
    }

    // 컨센서스 요약
    const recent = opinions.filter(o => {
      const d = new Date(o.opinion_date);
      return (Date.now()-d.getTime()) < 90*24*60*60*1000;
    });
    const tgPrices = recent.map(o=>o.target_price).filter(v=>v>0);
    const avgTarget = tgPrices.length ? Math.round(tgPrices.reduce((a,b)=>a+b,0)/tgPrices.length) : null;
    const maxTarget = tgPrices.length ? Math.max(...tgPrices) : null;
    const minTarget = tgPrices.length ? Math.min(...tgPrices) : null;
    const buyCnt    = recent.filter(o=>['1','2'].includes(o.opinion_code)).length;
    const holdCnt   = recent.filter(o=>o.opinion_code==='3').length;

    // 최신 현재가
    const { data: lp } = await sb.from('market_data')
      .select('price').eq('stock_code',code)
      .order('base_date',{ascending:false}).limit(1).maybeSingle();
    const curPrice = lp?.price;
    const upside = avgTarget&&curPrice ? ((avgTarget-curPrice)/curPrice*100).toFixed(1) : null;

    body.innerHTML = `
      <!-- 컨센서스 요약 -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
        ${[
          ['평균 목표주가', fmtPrice(avgTarget), upside!=null?`현재가 대비 ${upside>=0?'+':''}${upside}%`:''],
          ['목표가 범위', maxTarget?`${minTarget?.toLocaleString()}~${maxTarget?.toLocaleString()}원`:'—', ''],
          ['매수 의견', `${buyCnt}개`, `전체 ${recent.length}개 중`],
          ['중립/기타', `${holdCnt}개`, ''],
        ].map(([lb,v,sub])=>`
          <div style="background:var(--bg3);border-radius:8px;padding:12px 14px;border:1px solid var(--border);text-align:center">
            <div style="font-size:11px;color:var(--text1);margin-bottom:4px">${lb}</div>
            <div style="font-size:18px;font-weight:700">${v}</div>
            ${sub?`<div style="font-size:11px;color:${upside&&upside>=0?'var(--green)':'var(--text2)'};margin-top:2px">${sub}</div>`:''}
          </div>`).join('')}
      </div>
      <!-- 의견 목록 -->
      <div class="table-wrap"><table>
        <thead><tr>
          <th>날짜</th><th>증권사</th><th style="text-align:center">투자의견</th>
          <th>직전의견</th><th style="text-align:right">목표주가</th>
          <th style="text-align:right">괴리율</th>
        </tr></thead>
        <tbody>${opinions.map(o=>{
          const isBuy = ['1','2'].includes(o.opinion_code)||o.opinion?.includes('매수')||o.opinion==='BUY';
          const opColor = isBuy ? 'var(--red)' : o.opinion?.includes('매도')||o.opinion==='SELL' ? 'var(--blue)' : 'var(--text2)';
          const gapColor = (o.gap_rate||0) < -20 ? 'var(--yellow)' : 'var(--text2)';
          // 의견 변화 감지
          const changed = o.opinion !== o.prev_opinion ? '🔄' : '';
          return `<tr>
            <td style="font-size:11px;color:var(--text2)">${o.opinion_date}</td>
            <td style="font-weight:500">${o.firm_name}</td>
            <td style="text-align:center">
              <span style="color:${opColor};font-weight:700">${changed}${o.opinion||'—'}</span>
            </td>
            <td style="color:var(--text2);font-size:12px">${o.prev_opinion||'—'}</td>
            <td style="text-align:right;font-weight:600">${fmtPrice(o.target_price)}</td>
            <td style="text-align:right;color:${gapColor}">${o.gap_rate!=null?o.gap_rate.toFixed(1)+'%':'—'}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>`;
  } catch(e) { body.innerHTML=`<div style="color:var(--red);padding:20px">오류: ${e.message}</div>`; }
}

async function _renderFinancialTab(body, code, name) {
  try {
    const { data: fins } = await sb.from('financials')
      .select('bsns_year,quarter,revenue,operating_profit,net_income,operating_margin,net_margin,roe,roa,debt_ratio,total_assets,total_equity,operating_cashflow,cogs_ratio,gross_margin,sga_ratio')
      .eq('stock_code', code)
      .order('bsns_year').order('quarter');

    if (!fins?.length) {
      body.innerHTML = '<div style="color:var(--text2);padding:40px;text-align:center">재무 데이터 없음</div>';
      return;
    }

    const fmt  = (v) => {
      if (v == null) return '—';
      const 億 = Math.round(v / 100000000);
      if (Math.abs(億) >= 10000) {
        const 조 = Math.floor(億 / 10000);
        const 나머지 = Math.abs(億) % 10000;
        return 나머지 > 0 ? `${조}조 ${나머지.toLocaleString()}억` : `${조}조`;
      }
      return 億.toLocaleString() + '억';
    };
    const pct  = (v) => v!=null ? v.toFixed(1)+'%' : '—';
    const fmtB = (v) => v==null ? null : Math.round(v/100000000);

    body.innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:16px;align-items:center;flex-wrap:wrap">
        <button id="btn-quarter" class="chip active" onclick="FIN.view='quarter';FIN.render()">분기별</button>
        <button id="btn-annual"  class="chip"        onclick="FIN.view='annual'; FIN.render()">연간별 <span style="font-size:11px;color:var(--text2)">(4분기 합산)</span></button>
        <button id="btn-qcomp"   class="chip"        onclick="FIN.view='qcomp';  FIN.render()">분기비교</button>
        <div style="display:flex;gap:4px;margin-left:auto;align-items:center">
          <button id="btn-chart-rev"  class="chip active" onclick="FIN.chart='revenue'; FIN.drawChart()">매출·영업이익</button>
          <button id="btn-chart-gpm"  class="chip"        onclick="FIN.chart='gpm';     FIN.drawChart()">매출·GPM·판관비</button>
          <button id="btn-chart-cf"   class="chip"        onclick="FIN.chart='cf';      FIN.drawChart()">현금흐름</button>
          <div style="display:flex;align-items:center;gap:6px;margin-left:8px;border-left:1px solid var(--border);padding-left:8px">
            <span style="font-size:11px;color:var(--text2)">차트</span>
            <button onclick="FIN.resizeChart(-60)" style="background:none;border:1px solid var(--border);border-radius:4px;cursor:pointer;color:var(--text1);width:22px;height:22px;font-size:14px;line-height:1">−</button>
            <button onclick="FIN.resizeChart(+60)" style="background:none;border:1px solid var(--border);border-radius:4px;cursor:pointer;color:var(--text1);width:22px;height:22px;font-size:14px;line-height:1">+</button>
          </div>
        </div>
      </div>
      <div id="fin-chart-wrap" style="position:relative;height:220px;margin-bottom:16px">
        <canvas id="fin-chart-canvas"></canvas>
      </div>
      <div id="fin-table-area" class="table-wrap"><table>
        <thead><tr>
          <th>기간</th>
          <th style="text-align:right">매출액</th>
          <th style="text-align:right">영업이익</th>
          <th style="text-align:right">영업이익률</th>
          <th style="text-align:right">순이익</th>
          <th style="text-align:right">순이익률</th>
          <th style="text-align:right">ROE</th>
          <th style="text-align:right">부채비율</th>
          <th style="text-align:right">영업현금흐름</th>
        </tr></thead>
        <tbody id="fin-table-body"></tbody>
      </table></div>`;

    FIN.chartH = 220;
    FIN.resizeChart = (delta) => {
      FIN.chartH = Math.max(160, Math.min(600, FIN.chartH + delta));
      const wrap = document.getElementById('fin-chart-wrap');
      if (wrap) wrap.style.height = FIN.chartH + 'px';
      FIN.drawChart();
    };

    let finChart  = null;
    let finCharts = [];   // qcomp 모드의 4개 미니차트

    const _destroyAll = () => {
      if (finChart)  { finChart.destroy();  finChart  = null; }
      finCharts.forEach(c => c?.destroy());
      finCharts = [];
    };

    FIN.view  = 'quarter';
    FIN.chart = 'revenue';
    FIN.compQ = 'Q1';
    FIN.rows     = fins;
    FIN._annual  = null;

    FIN.getRows = () => {
      if (FIN.view === 'annual') {
        // 분기 행은 순액이므로 연간 = 4분기 합산 (_rpAggAnnual: report-cards.js 공용 헬퍼)
        // 저장된 Q4 마진은 연간 기준 잔재가 많아 마진·ROE·ROA는 합산 금액으로 재계산됨
        if (!FIN._annual) {
          const agg = _rpAggAnnual(FIN.rows, {
            flow:  ['revenue', 'operating_profit', 'net_income', 'operating_cashflow'],
            stock: ['total_assets', 'total_equity', 'debt_ratio'],
          });
          const byYear = {};
          for (const r of FIN.rows) (byYear[r.bsns_year] = byYear[r.bsns_year] || []).push(r);
          for (const a of agg) {
            // 비율 컬럼(GPM·판관비율·매출원가율)은 매출 가중평균으로 연간화
            const qs = byYear[a.bsns_year] || [];
            for (const c of ['gross_margin', 'sga_ratio', 'cogs_ratio']) {
              if (a.revenue > 0 && qs.every(r => r[c] != null && r.revenue != null))
                a[c] = qs.reduce((s, r) => s + r.revenue * r[c], 0) / a.revenue;
            }
            a.label = a.bsns_year + '년';
          }
          FIN._annual = agg;
        }
        return FIN._annual;
      } else {
        // quarter / qcomp 모두 전체 분기 반환 (qcomp는 render에서 피벗 처리)
        return FIN.rows.map(f => ({...f, label: f.bsns_year+' '+f.quarter}));
      }
    };

    FIN.drawChart = () => {
      ['rev','gpm','cf'].forEach(t => {
        const b = document.getElementById('btn-chart-'+t);
        if (b) b.classList.toggle('active', t === {revenue:'rev',gpm:'gpm',cf:'cf'}[FIN.chart]);
      });
      if (!window.Chart) return;
      _destroyAll();

      // ── 분기비교: 4개 미니차트 ──────────────────────────────────────────
      if (FIN.view === 'qcomp') {
        const wrap = document.getElementById('fin-chart-wrap');
        if (!wrap) return;
        const allRows = FIN.getRows();
        const QUARTERS = ['Q1','Q2','Q3','Q4'];
        const COLORS   = ['rgba(42,171,238,0.7)','rgba(45,206,137,0.7)','rgba(251,163,35,0.7)','rgba(245,54,92,0.7)'];

        wrap.style.height = 'auto';
        wrap.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          ${QUARTERS.map((q,i) => `
            <div style="background:var(--bg3);border-radius:8px;padding:8px">
              <div style="font-size:11px;font-weight:700;color:var(--text1);margin-bottom:4px">${q.replace('Q','')}분기</div>
              <div style="position:relative;height:130px"><canvas id="fin-qc-${q}"></canvas></div>
            </div>`).join('')}
        </div>`;

        QUARTERS.forEach((q, qi) => {
          const qRows  = allRows.filter(r => r.quarter === q);
          const canvas = document.getElementById(`fin-qc-${q}`);
          if (!canvas || !qRows.length) return;
          const labels = qRows.map(r => r.bsns_year + '년');
          finCharts.push(new window.Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
              labels,
              datasets: [
                {
                  label: '매출액',
                  data: qRows.map(r => fmtB(r.revenue)),
                  backgroundColor: 'rgba(42,171,238,0.55)',
                  borderRadius: 3, yAxisID: 'y',
                },
                {
                  label: '영업이익',
                  data: qRows.map(r => fmtB(r.operating_profit)),
                  backgroundColor: COLORS[qi],
                  borderRadius: 3, yAxisID: 'y',
                },
                {
                  label: '영업이익률(%)',
                  data: qRows.map(r => r.operating_margin?.toFixed(1) ?? null),
                  type: 'line',
                  borderColor: 'rgba(255,193,7,0.9)',
                  backgroundColor: 'transparent',
                  pointBackgroundColor: 'rgba(255,193,7,0.9)',
                  tension: 0.3, borderWidth: 2, yAxisID: 'y2',
                },
              ],
            },
            options: {
              responsive: true, maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: { backgroundColor: '#1a1d27', titleColor: '#f0f2f8', bodyColor: '#a8adc4' },
              },
              scales: {
                x: { ticks: { color: '#6e7491', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
                y: { ticks: { color: '#6e7491', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
                y2: {
                  ticks: { color: '#a8adc4', font: { size: 9 }, callback: v => v + '%' },
                  grid: { drawOnChartArea: false }, position: 'right',
                },
              },
            },
          }));
        });
        return;
      }

      // ── 분기별 / 연간별: 기존 단일 차트 ────────────────────────────────
      const rows   = FIN.getRows();
      const labels = rows.map(r => r.label);
      const canvas = document.getElementById('fin-chart-canvas');
      if (!canvas) return;

      let datasets, chartType;

      if (FIN.chart === 'revenue') {
        // 매출액(막대) + 영업이익(막대) + 영업이익률(라인, 우축)
        chartType = 'bar';
        datasets = [
          {
            label: '매출액',
            data: rows.map(r => fmtB(r.revenue)),
            backgroundColor: 'rgba(42,171,238,0.65)',
            borderRadius: 3,
            yAxisID: 'y',
          },
          {
            label: '영업이익',
            data: rows.map(r => fmtB(r.operating_profit)),
            backgroundColor: 'rgba(245,54,92,0.65)',
            borderRadius: 3,
            yAxisID: 'y',
          },
          {
            label: '영업이익률(%)',
            data: rows.map(r => r.operating_margin?.toFixed(1) ?? null),
            type: 'line',
            borderColor: 'rgba(255,193,7,0.9)',
            backgroundColor: 'transparent',
            pointBackgroundColor: 'rgba(255,193,7,0.9)',
            tension: 0.3,
            yAxisID: 'y2',
            borderWidth: 2,
          },
        ];
      } else if (FIN.chart === 'gpm') {
        // 매출액(막대) + GPM(라인) + 판관비비율(라인), 우축 %
        chartType = 'bar';
        datasets = [
          {
            label: '매출액',
            data: rows.map(r => fmtB(r.revenue)),
            backgroundColor: 'rgba(42,171,238,0.55)',
            borderRadius: 3,
            yAxisID: 'y',
          },
          {
            label: '매출총이익률(%)',
            data: rows.map(r => r.gross_margin?.toFixed(1) ?? null),
            type: 'line',
            borderColor: 'rgba(45,206,137,0.9)',
            backgroundColor: 'transparent',
            pointBackgroundColor: 'rgba(45,206,137,0.9)',
            tension: 0.3,
            yAxisID: 'y2',
            borderWidth: 2,
          },
          {
            label: '판관비율(%)',
            data: rows.map(r => r.sga_ratio?.toFixed(1) ?? null),
            type: 'line',
            borderColor: 'rgba(255,193,7,0.9)',
            backgroundColor: 'transparent',
            pointBackgroundColor: 'rgba(255,193,7,0.9)',
            tension: 0.3,
            yAxisID: 'y2',
            borderWidth: 2,
            borderDash: [4, 3],
          },
        ];
      } else {
        // 현금흐름 막대
        chartType = 'bar';
        datasets = [
          {
            label: '영업현금흐름',
            data: rows.map(r => fmtB(r.operating_cashflow)),
            backgroundColor: rows.map(r => (fmtB(r.operating_cashflow) ?? 0) >= 0
              ? 'rgba(45,206,137,0.7)' : 'rgba(245,54,92,0.7)'),
            borderRadius: 3,
            yAxisID: 'y',
          },
        ];
      }

      const hasY2 = ['revenue','gpm'].includes(FIN.chart);
      finChart = new window.Chart(canvas.getContext('2d'), {
        type: chartType,
        data: { labels, datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { labels: { color: '#a8adc4', font: { size: 11 }, boxWidth: 12 } },
            tooltip: { backgroundColor: '#1a1d27', titleColor: '#f0f2f8', bodyColor: '#a8adc4' },
          },
          scales: {
            x: { ticks: { color: '#6e7491', font: { size: 10 }, maxRotation: 45 }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { ticks: { color: '#6e7491', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' }, position: 'left' },
            ...(hasY2 ? {
              y2: {
                ticks: { color: '#a8adc4', font: { size: 10 }, callback: v => v + '%' },
                grid: { drawOnChartArea: false },
                position: 'right',
              }
            } : {}),
          },
        },
      });
    };

    FIN.render = () => {
      ['quarter','annual','qcomp'].forEach(t => {
        const b = document.getElementById('btn-'+t);
        if (b) b.classList.toggle('active', t === FIN.view);
      });

      // qcomp ↔ 일반 전환 시 차트 wrap 복원
      const wrap = document.getElementById('fin-chart-wrap');
      if (wrap && FIN.view !== 'qcomp') {
        if (!wrap.querySelector('#fin-chart-canvas')) {
          wrap.style.height = FIN.chartH + 'px';
          wrap.innerHTML = '<canvas id="fin-chart-canvas"></canvas>';
        }
      }

      const rows = FIN.getRows();
      const area = document.getElementById('fin-table-area');

      if (FIN.view === 'qcomp') {
        // ── 분기비교: Q1/Q2/Q3/Q4 각각 연도별 YoY 비교 ─────────────────
        const metrics = [
          { label: '매출액',       fn: r => `<b>${fmt(r.revenue)}</b>` },
          { label: '영업이익',     fn: r => fmt(r.operating_profit) },
          { label: '영업이익률',   fn: r => `<span style="color:${(r.operating_margin??0)>=0?'var(--red)':'var(--blue)'}">${pct(r.operating_margin)}</span>` },
          { label: '순이익',       fn: r => fmt(r.net_income) },
          { label: '순이익률',     fn: r => `<span style="color:${(r.net_margin??0)>=0?'var(--red)':'var(--blue)'}">${pct(r.net_margin)}</span>` },
          { label: 'ROE',          fn: r => pct(r.roe) },
          { label: '부채비율',     fn: r => pct(r.debt_ratio) },
          { label: '영업현금흐름', fn: r => fmt(r.operating_cashflow) },
        ];

        const makeQTable = (q) => {
          const qRows = rows.filter(r => r.quarter === q);
          if (!qRows.length) return '';
          const years = qRows.map(r => r.bsns_year);
          return `
            <div style="margin-bottom:20px">
              <div style="font-size:12px;font-weight:700;color:var(--text1);margin-bottom:6px;padding:4px 0;border-bottom:1px solid var(--border)">
                ${q.replace('Q','') + '분기'} 연도별 비교
              </div>
              <div style="overflow-x:auto"><table style="font-size:12px;width:100%">
                <thead><tr>
                  <th style="text-align:left;min-width:76px">지표</th>
                  ${years.map(y => `<th style="text-align:right;min-width:60px">${y}년</th>`).join('')}
                </tr></thead>
                <tbody>
                  ${metrics.map(m => `<tr>
                    <td style="font-size:11px;color:var(--text2);padding:5px 4px">${m.label}</td>
                    ${qRows.map(r => `<td style="text-align:right;padding:5px 8px">${m.fn(r)}</td>`).join('')}
                  </tr>`).join('')}
                </tbody>
              </table></div>
            </div>`;
        };

        area.innerHTML = ['Q1','Q2','Q3','Q4'].map(makeQTable).join('');

      } else {
        // ── 분기별 / 연간별: 기간 행 × 지표 열 기존 테이블 ──────────────
        const tableRows = [...rows].reverse();
        area.innerHTML = `<table>
          <thead><tr>
            <th>기간</th>
            <th style="text-align:right">매출액</th>
            <th style="text-align:right">영업이익</th>
            <th style="text-align:right">영업이익률</th>
            <th style="text-align:right">순이익</th>
            <th style="text-align:right">순이익률</th>
            <th style="text-align:right">ROE</th>
            <th style="text-align:right">부채비율</th>
            <th style="text-align:right">영업현금흐름</th>
          </tr></thead>
          <tbody>${tableRows.map(f => `<tr>
            <td style="font-size:12px;color:var(--text2);white-space:nowrap">${f.label}</td>
            <td style="text-align:right;font-weight:600">${fmt(f.revenue)}</td>
            <td style="text-align:right">${fmt(f.operating_profit)}</td>
            <td style="text-align:right;color:${f.operating_margin>=0?'var(--red)':'var(--blue)'}">${pct(f.operating_margin)}</td>
            <td style="text-align:right">${fmt(f.net_income)}</td>
            <td style="text-align:right;color:${f.net_margin>=0?'var(--red)':'var(--blue)'}">${pct(f.net_margin)}</td>
            <td style="text-align:right">${pct(f.roe)}</td>
            <td style="text-align:right">${pct(f.debt_ratio)}</td>
            <td style="text-align:right">${fmt(f.operating_cashflow)}</td>
          </tr>`).join('')}</tbody>
        </table>`;
      }

      FIN.drawChart();
    };

    FIN.render();

  } catch(e) {
    body.innerHTML = `<div style="color:var(--red);padding:20px">오류: ${e.message}</div>`;
  }
}
