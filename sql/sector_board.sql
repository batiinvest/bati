-- =====================================================================
--  업종 보드 통일(WICS 중분류 28개) — 쏠림지수 · 브레드스 국면 · 관심도 (2026-09-29)
--  Supabase SQL Editor에서 1회 실행하세요 (전체를 한 번에).
--  실행 전에도 앱·백엔드는 동작합니다 — 주도 업종 카드의 새 줄·열만 비어 있습니다.
--
--  [원본] 태린이아빠 「특정업종 쏠림지수 국내」·「업종지수 활용한 추세 및 비추세 전략」·
--         「외국인기관수급오실레이터 (업종)」의 업종비중(관심도)
--  수집·계산: 백엔드 collect_sector_market.py · collect_leading.py (평일 18:50)
-- =====================================================================

-- ① WICS 중분류 지수 종가 (wiseindex) — 쏠림지수·120일선 계산용, 2021년부터
create table if not exists wics_index_daily (
  base_date  date     not null,
  mid_code   text     not null,   -- G4530 …
  close_idx  numeric  not null,
  primary key (base_date, mid_code)
);

-- ② 시장 전체 업종 지표 — 날짜당 1행
create table if not exists sector_market_daily (
  base_date   date primary key,
  spread      numeric,    -- 롱숏: (등락률 1~5위 업종 합 − 나머지 합) ÷ 업종 수 (%p)
  spread_idx  numeric,    -- 지수화: 전일 + (1 + 롱숏)
  macd        numeric,    -- EMA12 − EMA26
  sig         numeric,    -- MACD 9일 단순평균
  osc         numeric,    -- 업종 쏠림지수 = MACD − 시그널 (원본 차트의 선)
  corr30      numeric,    -- 업종 수익률과 코스피200 동일가중의 30일 상관 평균
  breadth     numeric,    -- 120일선 위 업종 비율(0~1)
  n_above     smallint,
  n_sectors   smallint,
  regime      text,       -- trend(≥60%) · range(40~60%) · recover(30~40%) · contra(<30%)
  top5        jsonb       -- 그날 등락률 상위 5개 업종 코드
);

-- ③ 주도 업종 보드 확장 — 오늘 등락 · 관심도(거래대금 · 연기금·사모·투신 매수)
alter table leading_sectors add column if not exists ret_1d    numeric;  -- WICS 지수 전일 대비(%)
alter table leading_sectors add column if not exists tv_now    bigint;   -- 업종 거래대금 합(원), 판정일
alter table leading_sectors add column if not exists tv_avg5   bigint;   -- 최근 5거래일 평균(판정일 포함)
alter table leading_sectors add column if not exists tv_avg20  bigint;   -- 최근 20거래일 평균
alter table leading_sectors add column if not exists buy3_now  bigint;   -- 연기금+사모+투신 매수대금(원), buy_date 하루
alter table leading_sectors add column if not exists buy3_avg5 bigint;   -- 최근 5거래일 평균(buy_date 포함)
alter table leading_sectors add column if not exists buy_date  date;     -- 매수대금 기준일(KIS가 전일까지만 줘 판정일보다 하루 늦다)

alter table wics_index_daily    enable row level security;
alter table sector_market_daily enable row level security;
drop policy if exists "wics_index_daily_read"    on wics_index_daily;
drop policy if exists "sector_market_daily_read" on sector_market_daily;
create policy "wics_index_daily_read"    on wics_index_daily    for select to anon, authenticated using (true);
create policy "sector_market_daily_read" on sector_market_daily for select to anon, authenticated using (true);
