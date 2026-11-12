-- =====================================================================
--  SIO — 종목군별 시장 내부 강도(과매도·과매수) (2026-11-12)
--  Supabase SQL Editor에서 1회 실행하세요 (전체를 한 번에).
--  실행 전에도 앱·백엔드는 동작합니다 — 오늘의 시황 '과매도·과매수' 카드만 '준비 중'으로 나옵니다.
--
--  [원본] 태린이아빠 Market Dashboard '한국 과매도 과매수 점검'
--         코스피200 · 코스닥150 · 코스피대형주에서 오른 종목과 내린 종목의 거래량·등락폭 쏠림
--  수집·계산: 백엔드 collect_sio.py (평일 16:02 · 18:46, 처음엔 남아 있는 날짜 전부 채움)
-- =====================================================================

create table if not exists sio_daily (
  base_date  date     not null,
  grp        text     not null,   -- k200 코스피200 · kq150 코스닥150 · klarge 코스피대형주
  sio        numeric,             -- −1 ~ +1 : 상승 쪽이 우세하면 +상승평균, 아니면 −하락평균
  up_avg     numeric,             -- (상승 종목 거래량 비중 + 상승 종목 등락폭 비중) ÷ 2
  down_avg   numeric,             -- 같은 식을 내린 종목으로
  up_cnt     smallint,            -- 오른 종목 수
  down_cnt   smallint,            -- 내린 종목 수
  n          smallint,            -- 구성종목 수
  up_vol     numeric,             -- 상승 종목 거래량 비중 (0~1)
  up_pt      numeric,             -- 상승 종목 등락폭 비중 (0~1)
  primary key (base_date, grp)
);

alter table sio_daily enable row level security;
drop policy if exists "sio_daily_read" on sio_daily;
create policy "sio_daily_read" on sio_daily for select to anon, authenticated using (true);
