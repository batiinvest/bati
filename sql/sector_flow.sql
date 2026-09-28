-- =====================================================================
--  업종 수급 오실레이터 — WICS 중분류 × 시장 (2026-09-29)
--  Supabase SQL Editor에서 1회 실행하세요 (전체를 한 번에).
--  실행 전에도 앱·백엔드는 동작합니다 — 업종 수급 열·차트만 비어 있습니다.
--
--  [원본] 태린이아빠 「외국인기관수급오실레이터 (업종)(매일).xlsm」
--    업종 5일 누적 (외국인+기관) 순매수대금 ÷ 업종 시가총액 → MACD(12,26) − 시그널(9)
--  수집·계산: 백엔드 collect_sector_flow.py (평일 18:50 수급 정산 뒤)
-- =====================================================================

-- ① 원자료 합계 — 날짜 × WICS 소분류 × 시장. 중분류·섹터 등 어떤 묶음도 여기서 다시 합친다
create table if not exists sector_flow_daily (
  base_date  date     not null,
  wics_code  text     not null,   -- WICS 소분류 7자리(G453010). 중분류 = 앞 5자리
  market     text     not null,   -- KOSPI | KOSDAQ
  net_amt    bigint,              -- 외국인+기관 순매수 금액(원) = Σ 순매수 수량 × 종가
  cap        bigint,              -- 시가총액 합(원)
  cap_flow   bigint,              -- 그중 수급이 있는 종목의 시가총액 합(커버리지 분모)
  n_stocks   smallint,
  n_flow     smallint,
  primary key (base_date, wics_code, market)
);

-- ② 오실레이터 — 날짜 × 중분류 × 시장(ALL·KOSPI·KOSDAQ)
create table if not exists sector_flow_osc (
  base_date  date     not null,
  mid_code   text     not null,   -- WICS 중분류(G4530) — leading_sectors.mid_code와 같은 키
  market     text     not null,   -- ALL | KOSPI | KOSDAQ
  name       text,
  x          numeric,             -- 5일 비율(%) = 5일 순매수 ÷ 시가총액
  osc        numeric,             -- 오실레이터 = MACD − 시그널
  pct        numeric,             -- 최근 63거래일 안 현재 위치(0~100)
  gauge      jsonb,               -- 수급 칸 {lv:[상위10,상위25,평균,하위25,하위10], cur, prev}
  stage      text,                -- start · fill · top · turn · drain (종목 수급 칸과 같은 규칙)
  cover      numeric,             -- 그날 시가총액 중 수급이 있는 비중
  primary key (base_date, mid_code, market)
);
create index if not exists sector_flow_osc_mid on sector_flow_osc (mid_code, market, base_date);

alter table sector_flow_daily enable row level security;
alter table sector_flow_osc   enable row level security;
drop policy if exists "sector_flow_daily_read" on sector_flow_daily;
drop policy if exists "sector_flow_osc_read"   on sector_flow_osc;
create policy "sector_flow_daily_read" on sector_flow_daily for select to anon, authenticated using (true);
create policy "sector_flow_osc_read"   on sector_flow_osc   for select to anon, authenticated using (true);
