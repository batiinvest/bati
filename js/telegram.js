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
