-- 미국 지표(미국 위험신호 · 미국 피어앤그리드 · 미국 유동성 체크) — 태린이아빠 대시보드 이식 3 (2026-11-12)
-- Supabase SQL Editor에서 한 번 실행. 여러 번 실행해도 안전합니다.

-- 1) 미국 지수·ETF 일별 종가 — 위험신호(QQQ · TIP)와 피어앤그리드 원재료. 계산은 화면(js/us-market.js)
--    백엔드 collect_us_index.py (매일 06:50 · 08:10, yfinance 수정 전 종가, 2024-01-01부터)
create table if not exists us_index_daily (
  base_date date primary key,   -- 미국 거래일
  spx numeric,                  -- S&P500 (^GSPC)
  ndx numeric,                  -- NASDAQ 종합 (^IXIC)
  vix numeric,                  -- VIX (^VIX)
  tnx numeric,                  -- 미국 10년 금리 (^TNX, %)
  fvx numeric,                  -- 미국 5년 금리 (^FVX, %)
  hyg numeric,                  -- 하이일드 회사채 ETF
  ief numeric,                  -- 7~10년 국채 ETF
  qqq numeric,
  tip numeric                   -- 물가연동국채 ETF
);

alter table us_index_daily enable row level security;
drop policy if exists "us_index_daily_read" on us_index_daily;
create policy "us_index_daily_read" on us_index_daily for select to anon, authenticated using (true);

-- 2) 미국 유동성 체크 — 하루 한 줄, 계산 결과 묶음(숫자 + 판정 코드)
--    백엔드 collect_us_liquidity.py (매일 07:10 · 12:10, FRED 15종)
create table if not exists us_liquidity_daily (
  base_date  date primary key,  -- 계산한 날(한국 날짜)
  payload    jsonb not null,
  updated_at timestamptz default now()
);

alter table us_liquidity_daily enable row level security;
drop policy if exists "us_liquidity_daily_read" on us_liquidity_daily;
create policy "us_liquidity_daily_read" on us_liquidity_daily for select to anon, authenticated using (true);
