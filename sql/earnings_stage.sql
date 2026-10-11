-- =====================================================================
--  실적 국면 — 종목별 분기 국면 (2026-10-11)
--  Supabase SQL Editor에서 1회 실행하세요.
--  실행 전에도 앱·백엔드는 동작합니다 — '실적 국면' 페이지만 '준비 중'으로 나옵니다.
--
--  [원본] 태린이아빠 「확정실적 분석」 '데이터정리' 시트 — 분기 매출·영업이익 전년비, 스프레드,
--    매출 8분기 최고, 직전 국면으로 1·2·2.5·3·4·NA를 매긴다.
--  계산: 백엔드 earnings_stage.py (매일 20:10·07:40, financials 전체를 다시 읽어 처음부터 계산)
--  화면: js/earnings-stage.js
-- =====================================================================

create table if not exists earnings_stage (
  stock_code  text primary key,
  period      text,              -- 최근 분기 (매출이 있는 마지막 분기, 예: 2026Q2)
  stage       text,              -- 최근 분기 국면 '1' '2' '2.5' '3' '4' 'NA' (null = 입력 없음)
  prev_stage  text,              -- 그 직전 분기 국면
  sales_yoy   double precision,  -- 매출 전년비 % = (당−전년)/|전년|×100
  op_yoy      double precision,  -- 영업이익 전년비 %
  spread      double precision,  -- 매출 전년비 − 영업이익 전년비
  sales_high  boolean,           -- 당분기 매출 = 최근 8분기 최고
  revenue     double precision,  -- 최근 분기 매출 (억원)
  op          double precision,  -- 최근 분기 영업이익 (억원)
  fs_div      text,              -- CFS(연결) / OFS(별도)
  trail       jsonb,             -- 최근 8분기 국면 [["2025Q3","2.5"], ...]
  history     jsonb,             -- 분기별 [{p, rev, op, sg, og, sp, hi, st}] (억원·%)
  updated_at  timestamptz not null default now()
);
create index if not exists earnings_stage_period_stage on earnings_stage (period, stage);

alter table earnings_stage enable row level security;
drop policy if exists "earnings_stage_read" on earnings_stage;
create policy "earnings_stage_read" on earnings_stage for select to anon, authenticated using (true);
-- 쓰기는 백엔드 서비스 키만 (RLS 우회)
