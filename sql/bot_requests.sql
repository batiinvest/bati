-- bot_requests.sql — 봇 쓰기 작업 큐 (멤버 동기화·공지 발송의 백엔드 이관)
-- ⚠️ Supabase SQL Editor에서 수동 실행 필요 (1회)
--
-- 배경:
--   기존에는 프론트가 tg_bot_token으로 브라우저에서 직접 Telegram API를 호출했다
--   (토큰 노출·클라이언트 발송). 이관 후 프론트는 이 테이블에 요청만 넣고
--   상태를 폴링하며, 실제 텔레그램 호출은 백엔드 bot_requests.py가 수행한다
--   (run_all 워치독 60초 tick).
--
-- req_type / payload:
--   sync_all      {}                                — 전체 방 멤버 수 동기화
--   sync_one      { room_id }                       — 개별 방 동기화
--   notice        { target, content, parse_mode }   — 그룹/개별 공지 (target: all|open|산업명|room:ID|admin_direct|bati_direct)
--   notice_single { room_id, content }              — 방 상세 모달의 단건 발송
--   ping          {}                                — 봇 연결 테스트 (getMe)
--
-- status: pending → processing → done | error
-- result: { updated, total } | { sent_count, ok_count, parts } | { username } | { error }
--
-- 실행 후 확인:
--   1) editor 계정으로 '멤버 수 동기화' 클릭 → 1분 내 완료 toast + rooms.members 갱신
--   2) 공지 발송 → notice_history에 기록 (sent_by = 요청자)
--   3) viewer 계정으로는 insert가 RLS로 거부되는지 확인

create table if not exists public.bot_requests (
  id           bigint generated always as identity primary key,
  req_type     text not null,
  payload      jsonb default '{}'::jsonb,
  status       text not null default 'pending',
  result       jsonb,
  requested_by uuid references auth.users(id),
  created_at   timestamptz default now(),
  processed_at timestamptz
);

create index if not exists bot_requests_pending_idx
  on public.bot_requests (status, created_at) where status = 'pending';

-- 역할 판별 헬퍼 — app_config_rls.sql과 동일 정의 (독립 실행 가능하도록 중복 생성)
create or replace function public.is_editor()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from app_users u
    where u.id = auth.uid() and u.role in ('admin', 'editor')
  );
$$;

alter table public.bot_requests enable row level security;

drop policy if exists bot_requests_select on public.bot_requests;
drop policy if exists bot_requests_insert on public.bot_requests;

-- SELECT: 본인 요청 또는 editor 이상 (폴링용)
create policy bot_requests_select on public.bot_requests
  for select to authenticated
  using (requested_by = auth.uid() or public.is_editor());

-- INSERT: editor 이상 + 본인 명의만 (동기화·발송은 editor 권한 작업)
create policy bot_requests_insert on public.bot_requests
  for insert to authenticated
  with check (public.is_editor() and requested_by = auth.uid());

-- UPDATE/DELETE 정책 없음 — 상태 갱신은 백엔드(service_role, RLS 우회) 전용
