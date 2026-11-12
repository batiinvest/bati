-- 시장 점검 결과 묶음(공용) — 태린이아빠 대시보드 이식 5~ (2026-11-12)
-- Supabase SQL Editor에서 한 번 실행. 여러 번 실행해도 안전합니다.
-- 백엔드가 계산한 하루치 결과(숫자 + 판정 코드)를 kind별로 한 줄씩 넣는다. 문장은 화면이 붙인다.
--   kind = 'jp_tw'  일본·대만 AI·반도체 공급망 시세 점검 (collect_jp_tw.py, 평일 16:40 · 18:20)
--   이후 이식하는 화면(AI 하드웨어 모멘텀 등)도 이 표를 같이 쓴다 — 새 SQL 없이 kind만 늘어난다.

create table if not exists market_snapshot (
  kind       text not null,     -- 어떤 점검인지
  base_date  date not null,     -- 기준일(그 점검의 마지막 거래일)
  payload    jsonb not null,
  updated_at timestamptz default now(),
  primary key (kind, base_date)
);

alter table market_snapshot enable row level security;
drop policy if exists "market_snapshot_read" on market_snapshot;
create policy "market_snapshot_read" on market_snapshot for select to anon, authenticated using (true);
