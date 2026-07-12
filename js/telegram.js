// telegram.js — 봇 요청 큐 (bot_requests 테이블) + 멤버 수 동기화
//
// ⚠️ 프론트는 더 이상 Telegram API를 직접 호출하지 않는다 (봇 토큰 미보유).
//    쓰기 작업(동기화·발송)은 bot_requests에 요청을 큐잉하고 상태를 폴링만 한다.
//    실제 텔레그램 호출은 백엔드 bot_requests.py (run_all 워치독, 60초 tick).
//    테이블 미생성 시: sql/bot_requests.sql을 Supabase SQL Editor에서 실행.

// ── 요청 큐잉 — 생성된 요청 id 반환 ──────────────────────────────────────────
async function enqueueBotRequest(reqType, payload = {}) {
  const { data, error } = await sb.from('bot_requests')
    .insert({ req_type: reqType, payload, requested_by: A.user?.id || null })
    .select('id')
    .single();
  if (error) {
    if (/bot_requests|relation .* does not exist|schema cache/i.test(error.message || ''))
      throw new Error('bot_requests 테이블이 없습니다 — sql/bot_requests.sql을 Supabase에서 실행하세요.');
    throw error;
  }
  return data.id;
}

// ── 요청 완료 대기 (3초 폴링) — done이면 result 반환, error/시간초과면 throw ──
// onTick(row, elapsedSec): 진행 표시용 콜백 (선택)
async function waitBotRequest(id, { timeoutMs = 240000, intervalMs = 3000, onTick } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    await new Promise(r => setTimeout(r, intervalMs));
    const { data } = await sb.from('bot_requests')
      .select('status,result').eq('id', id).single();
    if (onTick) onTick(data, Math.round((Date.now() - t0) / 1000));
    if (data?.status === 'done')  return data.result || {};
    if (data?.status === 'error') throw new Error(data.result?.error || '봇 처리 실패');
  }
  throw new Error('시간 초과 — 봇이 지연 처리 중일 수 있습니다. 잠시 후 목록을 새로고침하세요.');
}

// ══════════════════════════════════════════
//  SYNC — 멤버 수 동기화 (백엔드 위임)
// ══════════════════════════════════════════
const _SYNC_BTN_HTML = '<svg style="width:13px;height:13px;vertical-align:middle;margin-right:4px" viewBox="0 0 16 16" fill="none"><path d="M13.5 8A5.5 5.5 0 112.5 5M2.5 2v3h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="btn-label">멤버 수 동기화</span>';

async function syncAll() {
  if (!canEdit()) { toast('권한이 없습니다.', 'error'); return; }
  const btn = document.getElementById('sync-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="loading"></span>요청 중...'; }
  try {
    const reqId = await enqueueBotRequest('sync_all');
    toast('📡 동기화 요청 전송 — 봇이 1분 내 처리합니다', 'info');
    const res = await waitBotRequest(reqId, {
      onTick: (row, sec) => {
        const b = document.getElementById('sync-btn');
        if (b) b.innerHTML = `<span class="loading"></span>${row?.status === 'processing' ? '동기화 중' : '대기 중'}... ${sec}초`;
      },
    });
    await loadRooms();
    if (A.page === 'rooms' || A.page === 'overview') draw();
    toast(`✓ 동기화 완료 — ${res.updated ?? 0}/${res.total ?? A.rooms.length}개 방 변경`, 'success');
  } catch (e) {
    toast('동기화 실패: ' + e.message, 'error');
  } finally {
    const b = document.getElementById('sync-btn');
    if (b) { b.disabled = false; b.innerHTML = _SYNC_BTN_HTML; }
  }
}

// ══════════════════════════════════════════
//  SYNC DESC — 종목방 그룹 설명(소개글) 편집·일괄 교체 (백엔드 위임)
//  템플릿은 app_config.room_desc_template 단일 출처 — {name} 자리에 종목명 치환.
//  백엔드 bot_requests._handle_sync_desc가 같은 키를 읽어 발송한다.
// ══════════════════════════════════════════
const _DESC_BTN_LABEL = '📌 저장 + 일괄 적용';
const DESC_SAMPLE_NAME = '펩트론';
const DESC_TEMPLATE_DEFAULT = [
  '<{name} 채팅방>',
  '📈 {name} 관련 정보를 실시간으로 공유하는 방입니다.',
  '• 공시 및 뉴스 실시간 제공',
  '• 시세 알림',
  '• IR 자료 및 증권사 리포트',
  '',
  '☕️ 후원: https://litt.ly/batiinvest',
  '📬 문의: @BatiInvestment',
  '⛔️ 퇴장 기준',
  '① 광고·욕설·비하·반말·선동 등 비매너',
  '② 3일 이상 미접속(미활동)',
  '③ 규정 위반 시 즉시 퇴장',
].join('\n');

// app_config에서 템플릿 로드 (없으면 기본값) → 에디터·미리보기 초기화
async function loadDescTemplate() {
  const ta = document.getElementById('desc-template');
  if (!ta) return;
  try {
    const { data } = await sb.from('app_config').select('value').eq('key', 'room_desc_template');
    ta.value = (data?.[0]?.value || '').trim() || DESC_TEMPLATE_DEFAULT;
  } catch (e) {
    ta.value = DESC_TEMPLATE_DEFAULT;
  }
  ta.placeholder = '';
  descPreview();
}

// 가장 긴 종목명 — 255자 초과 검사는 최악 케이스 기준
function _descWorstName() {
  return A.rooms.filter(r => r.room_type === 'company')
    .reduce((w, r) => ((r.name || '').length > w.length ? r.name : w), DESC_SAMPLE_NAME);
}

// 미리보기 + 글자 수 검사 (그룹 설명은 plain text — HTML 파싱 없음)
function descPreview() {
  const ta = document.getElementById('desc-template');
  if (!ta) return;
  const t = ta.value;
  const rendered = t.replace(/\{name\}/g, DESC_SAMPLE_NAME);
  const prevEl = document.getElementById('desc-prev');
  if (prevEl) {
    prevEl.innerHTML = rendered.trim()
      ? `<div class="nt-bubble">${escapeHtml(rendered)}</div>`
      : '<div class="nt-tg-empty">내용을 입력하면 그룹 설명 모양으로<br>여기에 표시됩니다</div>';
  }
  const cnt = document.getElementById('desc-count');
  if (cnt) {
    const worst = _descWorstName();
    const worstLen = t.replace(/\{name\}/g, worst).length;
    const over = worstLen > 255;
    cnt.innerHTML = `${rendered.length.toLocaleString()}자 (예: ${DESC_SAMPLE_NAME}) · 최장 종목명(${escapeHtml(worst)}) 기준 ` +
      `<b style="color:${over ? 'var(--red)' : 'var(--green)'}">${worstLen}/255자</b>${over ? ' — 초과! 내용을 줄여주세요' : ''}`;
  }
}

// 템플릿 저장 (app_config upsert) — silent=true면 toast 생략
async function saveDescTemplate(silent = false) {
  if (!canEdit()) { toast('권한이 없습니다.', 'error'); return false; }
  const ta = document.getElementById('desc-template');
  const value = (ta?.value || '').trim();
  if (!value) { toast('소개글 내용을 입력하세요.', 'error'); return false; }
  const { error } = await sb.from('app_config')
    .upsert({ key: 'room_desc_template', value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) { toast('저장 실패: ' + error.message, 'error'); return false; }
  if (!silent) toast('소개글 템플릿 저장 완료', 'success');
  return true;
}

async function syncDescriptions() {
  if (!canEdit()) { toast('권한이 없습니다.', 'error'); return; }
  const ta = document.getElementById('desc-template');
  const worstLen = (ta?.value || '').replace(/\{name\}/g, _descWorstName()).length;
  if (worstLen > 255) { toast(`최장 종목명 기준 ${worstLen}자 — 255자 제한을 초과합니다. 내용을 줄여주세요.`, 'error'); return; }
  const count = A.rooms.filter(r => r.room_type === 'company').length;
  if (!confirm(`종목 채팅방 ${count}개의 그룹 설명(소개글)을 위 템플릿으로 일괄 교체합니다.\n{name} 자리는 각 종목명으로 자동 치환되며, 기존 설명은 덮어써집니다.\n\n진행할까요?`)) return;
  if (!(await saveDescTemplate(true))) return;   // 템플릿 저장 후 적용 (봇이 같은 키를 읽음)
  const btn = document.getElementById('desc-sync-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="loading"></span>요청 중...'; }
  try {
    const reqId = await enqueueBotRequest('sync_desc');
    toast('📡 소개글 일괄 교체 요청 전송 — 봇이 처리합니다', 'info');
    const res = await waitBotRequest(reqId, {
      timeoutMs: 300000,
      onTick: (row, sec) => {
        const b = document.getElementById('desc-sync-btn');
        if (b) b.innerHTML = `<span class="loading"></span>${row?.status === 'processing' ? '교체 중' : '대기 중'}... ${sec}초`;
      },
    });
    const msg = `✓ 소개글 교체 완료 — 적용 ${res.ok ?? 0} · 동일 ${res.skip ?? 0} · 실패 ${res.fail ?? 0} (총 ${res.total ?? 0})`;
    toast(msg, res.fail ? 'info' : 'success');
    if (res.fail && res.fails?.length) console.warn('[sync_desc] 실패 목록:', res.fails);
  } catch (e) {
    toast('소개글 교체 실패: ' + e.message, 'error');
  } finally {
    const b = document.getElementById('desc-sync-btn');
    if (b) { b.disabled = false; b.innerHTML = _DESC_BTN_LABEL; }
  }
}

async function syncOne(id) {
  if (!canEdit()) { toast('권한이 없습니다.', 'error'); return; }
  const r = A.rooms.find(x => x.id === id); if (!r) return;
  toast(`📡 ${r.name} 동기화 요청 — 봇이 1분 내 처리합니다`, 'info');
  try {
    const reqId = await enqueueBotRequest('sync_one', { room_id: id });
    const res = await waitBotRequest(reqId);
    await loadRooms();
    if (A.page === 'rooms' || A.page === 'overview') draw();
    const cur = A.rooms.find(x => x.id === id);
    toast(`✓ ${r.name}: ${(res.members ?? cur?.members ?? 0).toLocaleString()}명`, 'success');
  } catch (e) {
    toast('동기화 실패: ' + e.message, 'error');
  }
}
