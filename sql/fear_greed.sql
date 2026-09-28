-- =====================================================================
--  한국 피어앤그리드(Fear & Greed) — 원재료 일별 (2026-09-28)
--  Supabase SQL Editor에서 1회 실행하세요.
--  실행 전에도 앱·백엔드는 동작합니다 — 시황의 '피어앤그리드' 카드만 '준비 중'으로 나옵니다.
--
--  [원본] 태린이아빠 「한국 피어앤그리드오실레이터」 — 5요소 × 20%
--    ① 125일 모멘텀 ② ATM 풋/콜(5일 평균) ③ VKOSPI ④ 10년−5년 국채선물지수 ⑤ RSI 10일
--  계산(MinMax·가중합·EMA20·MACD 오실레이터)은 프론트(js/fear-greed.js)가 이 표로 한다.
--  수집: 백엔드 collect_fear_greed.py (평일 18:22)
-- =====================================================================

create table if not exists fear_greed_daily (
  base_date  date primary key,
  kospi      numeric,   -- 코스피 종가
  kosdaq     numeric,   -- 코스닥 종가
  vkospi     numeric,   -- 코스피 200 변동성지수
  bond10     numeric,   -- 10년 국채선물지수
  bond3      numeric,   -- 국채선물지수(3년) — bond5 합성용
  bond5      numeric,   -- 5년 국채선물 추종 지수(3년 70% + 10년 30% 일간 합성)
  call_vol   bigint,    -- 코스피200 옵션 콜 매수 거래량 합계(계약)
  put_vol    bigint,    -- 코스피200 옵션 풋 매수 거래량 합계(계약)
  updated_at timestamptz not null default now()
);

alter table fear_greed_daily enable row level security;
drop policy if exists "fear_greed_daily_read" on fear_greed_daily;
create policy "fear_greed_daily_read" on fear_greed_daily
  for select to anon, authenticated using (true);
