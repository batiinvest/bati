// company.js — 모니터링 종목 관리 페이지
// DB: companies (code, name, industry, sub_industry, is_monitored)

function pCompany() {
  return `
  <div style="display:grid;grid-template-columns:320px 1fr;gap:0;min-height:calc(100vh - 56px);align-items:start">
    <div style="border-right:1px solid var(--border);padding:1.25rem;position:sticky;top:56px;
      height:calc(100vh - 56px);overflow-y:auto;background:var(--bg2)">
      <div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:12px">🔍 기업 검색</div>
      <div style="position:relative;margin-bottom:8px">
        <input type="text" id="mon-search" class="form-input"
          placeholder="종목명 또는 코드..."
          oninput="monSearch(this.value)"
          style="width:100%;box-sizing:border-box;padding-left:32px">
        <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text3)">🔍</span>
      </div>
      <div id="mon-search-results" style="margin-bottom:12px"></div>
      <div id="mon-add-panel" style="display:none;padding:12px;background:var(--bg3);border-radius:8px;margin-bottom:12px">
        <div style="font-size:12px;font-weight:600;margin-bottom:8px">추가할 위치 선택</div>
        <select id="mon-sel-industry" class="form-input" style="width:100%;margin-bottom:6px;font-size:13px"
          onchange="monUpdateSubSel()">
          <option value="">산업 선택...</option>
        </select>
        <select id="mon-sel-sub" class="form-input" style="width:100%;margin-bottom:8px;font-size:13px">
          <option value="">서브섹터 선택...</option>
        </select>
        <button class="btn btn-sm" style="width:100%;background:var(--tg);color:#fff" onclick="monAddSelected()">
          ✚ 모니터링에 추가
        </button>
        <div id="mon-sel-label" style="font-size:11px;color:var(--text3);margin-top:6px;text-align:center"></div>
      </div>
      <hr style="border:none;border-top:1px solid var(--border);margin:16px 0">
      <div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:10px">🏗 산업 추가</div>
      <div style="display:flex;gap:6px;margin-bottom:8px">
        <input type="text" id="mon-new-industry" class="form-input" placeholder="새 산업명..."
          style="flex:1;font-size:12px" onkeydown="if(event.key==='Enter')monAddIndustry()">
        <button class="btn btn-sm" onclick="monAddIndustry()">추가</button>
      </div>
    </div>
    <div style="padding:1.25rem" id="mon-main">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">
        <h2 style="font-size:16px;font-weight:700;margin:0">⭐ 모니터링 종목 관리</h2>
        <div style="font-size:12px;color:var(--text3)" id="mon-summary"></div>
      </div>
      <div id="mon-board">
        <div style="color:var(--text3);font-size:13px;padding:40px;text-align:center"><span class="loading"></span> 로딩 중...</div>
      </div>
    </div>
  </div>`;
}

// ── 상태 ──────────────────────────────────────
let _monData     = {};
let _monInds     = [];
let _monSelStock = null;

async function loadCompanyPage() {
  await _monLoadBoard();
}

// ── 보드 로드 ───────────────────────────────────
async function _monLoadBoard() {
  const board = document.getElementById('mon-board');
  const sumEl = document.getElementById('mon-summary');

  const { data: companies } = await sb.from('companies')
    .select('code,name,industry,sub_industry,is_monitored,market')
    .eq('is_monitored', true)
    .order('name');

  if (!companies?.length) {
    if (board) board.innerHTML = '<div style="color:var(--text3);padding:40px;text-align:center">모니터링 종목이 없습니다</div>';
    return;
  }
  if (sumEl) sumEl.textContent = `총 ${companies.length}개 종목`;

  const grouped = {};
  companies.forEach(c => {
    const ind = (c.industry && c.industry.trim()) ? c.industry.trim() : '미분류';
    const sub = (c.sub_industry && c.sub_industry.trim()) ? c.sub_industry.trim() : '기타';
    if (!grouped[ind]) grouped[ind] = {};
    if (!grouped[ind][sub]) grouped[ind][sub] = [];
    grouped[ind][sub].push(c);
  });
  _monData = grouped;
  _monInds = Object.keys(grouped).sort((a,b) => a === '미분류' ? 1 : b === '미분류' ? -1 : a.localeCompare(b));

  if (board) board.innerHTML = _monInds.map(ind => _renderIndustryCard(ind, grouped[ind])).join('');
  _monInitDnd();
  _monUpdateSelects();
}

function _renderIndustryCard(ind, subs) {
  const total = Object.values(subs).reduce((s, arr) => s + arr.length, 0);
  const subKeys = Object.keys(subs).sort();
  return `
  <div class="card" style="margin-bottom:12px" data-industry="${ind}">
    <div class="card-header" style="flex-wrap:wrap;gap:8px">
      <span style="font-size:14px;font-weight:700">${ind}</span>
      <span style="font-size:11px;color:var(--text3)">${total}개</span>
      <div style="margin-left:auto;display:flex;gap:6px;align-items:center">
        <input type="text" placeholder="서브섹터 추가..." class="form-input"
          id="mon-new-sub-${CSS.escape(ind)}" style="font-size:11px;padding:3px 8px;width:130px"
          onkeydown="if(event.key==='Enter')monAddSub('${ind.replace(/'/g,"\\'")}')">
        <button class="btn btn-sm" onclick="monAddSub('${ind.replace(/'/g,"\\'")}')">추가</button>
        <button class="btn btn-sm" onclick="monDeleteIndustry('${ind.replace(/'/g,"\\'")}')}"
          style="color:var(--text3);background:none;border-color:var(--border)">✕</button>
      </div>
    </div>
    <div style="padding:.5rem 1rem 1rem;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px">
      ${subKeys.map(sub => _renderSubCard(ind, sub, subs[sub])).join('')}
      <div class="mon-drop-zone" data-industry="${ind}" data-sub=""
        style="border:2px dashed var(--border);border-radius:8px;padding:12px;min-height:60px;
          text-align:center;color:var(--text3);font-size:11px;display:flex;align-items:center;justify-content:center">
        ＋ 서브섹터 없이 추가
      </div>
    </div>
  </div>`;
}

function _renderSubCard(ind, sub, stocks) {
  return `
  <div class="mon-sub-card" data-industry="${ind}" data-sub="${sub}"
    style="background:var(--bg3);border-radius:8px;padding:10px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <span style="font-size:12px;font-weight:700">${sub}</span>
      <div style="display:flex;gap:6px;align-items:center">
        <span style="font-size:11px;color:var(--text3)">${stocks.length}개</span>
        <button onclick="monDeleteSub('${ind.replace(/'/g,"\\'")}','${sub.replace(/'/g,"\\'")}')}"
          style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:11px;padding:0">✕</button>
      </div>
    </div>
    <div class="mon-drop-zone" data-industry="${ind}" data-sub="${sub}"
      style="display:flex;flex-direction:column;gap:3px;min-height:24px">
      ${stocks.map(s => _renderStockChip(s)).join('')}
    </div>
  </div>`;
}

function _renderStockChip(s) {
  const code = s.code.replace(/\.(KS|KQ)$/, '');
  const mkt  = s.code.endsWith('.KS') ? 'KOSPI' : 'KOSDAQ';
  const safeName = s.name.replace(/'/g, "\\'");
  return `
  <div class="mon-stock-chip" draggable="true"
    data-code="${code}" data-name="${s.name}"
    data-industry="${s.industry||''}" data-sub="${s.sub_industry||''}"
    style="display:flex;align-items:center;justify-content:space-between;padding:5px 8px;
      background:var(--bg2);border-radius:4px;cursor:grab;border:1px solid transparent;
      font-size:12px;transition:border-color .15s"
    onmouseenter="this.style.borderColor='var(--tg)'"
    onmouseleave="this.style.borderColor='transparent'">
    <div style="display:flex;align-items:center;gap:6px;overflow:hidden">
      <span style="font-size:10px;color:var(--text3);flex-shrink:0">${code}</span>
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.name}</span>
      <span style="font-size:9px;color:var(--text3);flex-shrink:0">${mkt}</span>
    </div>
    <button onclick="monRemoveStock('${code}','${safeName}')"
      style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:12px;
        padding:0 2px;flex-shrink:0;line-height:1"
      onmouseenter="this.style.color='var(--red)'"
      onmouseleave="this.style.color='var(--text3)'">✕</button>
  </div>`;
}

// ── 드래그앤드롭 ────────────────────────────────
function _monInitDnd() {
  let dragging = null;

  document.querySelectorAll('.mon-stock-chip').forEach(chip => {
    chip.addEventListener('dragstart', e => {
      dragging = chip;
      setTimeout(() => chip.style.opacity = '0.4', 0);
      e.dataTransfer.effectAllowed = 'move';
    });
    chip.addEventListener('dragend', () => {
      chip.style.opacity = '1';
      dragging = null;
    });
  });

  document.querySelectorAll('.mon-drop-zone').forEach(zone => {
    zone.addEventListener('dragover', e => {
      e.preventDefault();
      zone.style.outline = '2px solid var(--tg)';
    });
    zone.addEventListener('dragleave', () => zone.style.outline = '');
    zone.addEventListener('drop', async e => {
      e.preventDefault();
      zone.style.outline = '';
      if (!dragging) return;
      const code   = dragging.dataset.code;
      const name   = dragging.dataset.name;
      const newInd = zone.dataset.industry;
      const newSub = zone.dataset.sub;
      if (dragging.dataset.industry === newInd && dragging.dataset.sub === newSub) return;
      await _monMoveStock(code, name, newInd, newSub);
    });
  });
}

async function _monMoveStock(code, name, newInd, newSub) {
  try {
    for (const c of [code, code+'.KS', code+'.KQ']) {
      await sb.from('companies').update({ industry: newInd||null, sub_industry: newSub||null })
        .eq('code', c);
    }
    await _monLoadBoard();
    toast(`✅ ${name} → ${newInd}${newSub ? '/'+newSub : ''}`, 'success');
  } catch(e) { toast('이동 실패: '+e.message, 'error'); }
}

// ── 종목 삭제 ───────────────────────────────────
async function monRemoveStock(code, name) {
  if (!confirm(`'${name}'을(를) 모니터링에서 제거할까요?\n(기업 데이터는 유지됩니다)`)) return;
  try {
    for (const c of [code, code+'.KS', code+'.KQ']) {
      await sb.from('companies').update({ is_monitored: false }).eq('code', c)
    }
    await sb.from('app_config').upsert({ key:'reload_flag', value:String(Date.now()),
      description:'모니터링 종목 제거' }, { onConflict:'key' });
    await _monLoadBoard();
    toast(`🗑 ${name} 모니터링 제거`, 'success');
  } catch(e) { toast('삭제 실패: '+e.message, 'error'); }
}

// ── 검색 ────────────────────────────────────────
async function monSearch(q) {
  const el = document.getElementById('mon-search-results');
  if (!el) return;
  if (!q) { el.innerHTML=''; _monSelStock=null; document.getElementById('mon-add-panel').style.display='none'; return; }

  const { data } = await sb.from('companies')
    .select('code,name,industry,sub_industry,is_monitored,market')
    .or(`name.ilike.%${q}%,code.ilike.%${q}%`)
    .order('is_monitored', { ascending:false }).limit(12);

  if (!data?.length) { el.innerHTML='<div style="font-size:12px;color:var(--text3);padding:6px">검색 결과 없음</div>'; return; }

  el.innerHTML = data.map(c => {
    const code = c.code.replace(/\.(KS|KQ)$/, '');
    const mon  = c.is_monitored;
    return `<div style="display:flex;align-items:center;justify-content:space-between;
        padding:6px 10px;border-radius:6px;cursor:pointer;font-size:12px;margin-bottom:2px;
        background:${mon?'rgba(42,171,238,0.08)':'var(--bg3)'}"
        onclick="monSelectStock('${code}','${c.name.replace(/'/g,"\\'")}','${c.industry||''}','${c.sub_industry||''}')">
      <div>
        <span style="color:var(--text3);font-size:10px;margin-right:4px">${code}</span>
        <span style="font-weight:600">${c.name}</span>
      </div>
      <span style="font-size:10px;color:${mon?'var(--tg)':'var(--text3)'}">${mon?'✓모니터링':'+ 추가'}</span>
    </div>`;
  }).join('');
}

function monSelectStock(code, name, industry, sub) {
  _monSelStock = { code, name, industry, sub };
  const panel = document.getElementById('mon-add-panel');
  const label = document.getElementById('mon-sel-label');
  if (panel) panel.style.display = 'block';
  if (label) label.textContent   = `선택: ${name} (${code})`;
  const indSel = document.getElementById('mon-sel-industry');
  if (indSel && industry) {
    indSel.value = industry;
    monUpdateSubSel();
    const subSel = document.getElementById('mon-sel-sub');
    if (subSel && sub) subSel.value = sub;
  }
}

function _monUpdateSelects() {
  const indSel = document.getElementById('mon-sel-industry');
  if (!indSel) return;
  indSel.innerHTML = '<option value="">산업 선택...</option>' +
    _monInds.map(ind => `<option value="${ind}">${ind}</option>`).join('');
}

function monUpdateSubSel() {
  const ind    = document.getElementById('mon-sel-industry')?.value;
  const subSel = document.getElementById('mon-sel-sub');
  if (!subSel) return;
  const subs = ind && _monData[ind] ? Object.keys(_monData[ind]).sort() : [];
  subSel.innerHTML = '<option value="">서브섹터 선택...</option>' +
    subs.map(s => `<option value="${s}">${s}</option>`).join('');
}

async function monAddSelected() {
  if (!_monSelStock) { toast('종목을 먼저 선택하세요', 'error'); return; }
  const ind = document.getElementById('mon-sel-industry')?.value;
  const sub = document.getElementById('mon-sel-sub')?.value;
  if (!ind) { toast('산업을 선택하세요', 'error'); return; }
  const { code, name } = _monSelStock;
  try {
    for (const c of [code, code+'.KS', code+'.KQ']) {
      await sb.from('companies').update({ is_monitored:true, industry:ind, sub_industry:sub||null })
        .eq('code', c)
    }
    await sb.from('app_config').upsert({ key:'reload_flag', value:String(Date.now()),
      description:'모니터링 종목 추가' }, { onConflict:'key' });
    document.getElementById('mon-add-panel').style.display = 'none';
    document.getElementById('mon-search').value = '';
    document.getElementById('mon-search-results').innerHTML = '';
    _monSelStock = null;
    await _monLoadBoard();
    toast(`✅ ${name} → ${ind}${sub?'/'+sub:''} 추가`, 'success');
  } catch(e) { toast('추가 실패: '+e.message, 'error'); }
}

// ── 산업/서브섹터 관리 ─────────────────────────
async function monAddIndustry() {
  const input = document.getElementById('mon-new-industry');
  const val   = input?.value.trim();
  if (!val) return;
  if (_monInds.includes(val)) { toast('이미 존재합니다', 'error'); return; }
  _monData[val] = {};
  _monInds = Object.keys(_monData).sort();
  document.getElementById('mon-board').innerHTML = _monInds.map(i => _renderIndustryCard(i, _monData[i])).join('');
  _monInitDnd(); _monUpdateSelects();
  input.value = '';
  toast(`✅ '${val}' 추가 (종목 추가 시 저장)`, 'success');
}

async function monDeleteIndustry(ind) {
  const stocks = Object.values(_monData[ind]||{}).flat();
  const msg = stocks.length
    ? `'${ind}' 산업의 ${stocks.length}개 종목을 모두 모니터링에서 제거할까요?`
    : `'${ind}' 산업을 삭제할까요?`;
  if (!confirm(msg)) return;
  for (const s of stocks) {
    for (const c of [s.code, s.code+'.KS', s.code+'.KQ']) {
      await sb.from('companies').update({ is_monitored:false }).eq('code',c)
    }
  }
  if (stocks.length) {
    await sb.from('app_config').upsert({ key:'reload_flag', value:String(Date.now()),
      description:'산업 삭제' }, { onConflict:'key' });
  }
  delete _monData[ind];
  _monInds = Object.keys(_monData).sort();
  await _monLoadBoard();
  toast(`🗑 산업 '${ind}' 삭제`, 'success');
}

async function monAddSub(ind) {
  const input = document.getElementById(`mon-new-sub-${CSS.escape(ind)}`);
  const val   = input?.value.trim();
  if (!val) return;
  if (_monData[ind]?.[val]) { toast('이미 존재합니다', 'error'); return; }
  if (!_monData[ind]) _monData[ind] = {};
  _monData[ind][val] = [];
  document.getElementById('mon-board').innerHTML = _monInds.map(i => _renderIndustryCard(i, _monData[i])).join('');
  _monInitDnd(); _monUpdateSelects();
  toast(`✅ 서브섹터 '${val}' 추가`, 'success');
}

async function monDeleteSub(ind, sub) {
  const stocks = _monData[ind]?.[sub] || [];
  if (stocks.length && !confirm(`'${sub}'의 ${stocks.length}개 종목을 서브섹터에서 제거할까요?\n(모니터링은 유지)`)) return;
  for (const s of stocks) {
    for (const c of [s.code, s.code+'.KS', s.code+'.KQ']) {
      await sb.from('companies').update({ sub_industry:null }).eq('code',c)
    }
  }
  delete _monData[ind][sub];
  document.getElementById('mon-board').innerHTML = _monInds.map(i => _renderIndustryCard(i, _monData[i])).join('');
  _monInitDnd();
  toast(`🗑 서브섹터 '${sub}' 삭제`, 'success');
}
