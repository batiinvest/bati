-- =====================================================================
--  시장 전체 투자자별 매매동향 (KIS FHPTJ04040000) — collect_investor_market.py가 매일 수집
--  Supabase SQL Editor에서 1회 실행하세요.
--  이 테이블이 없어도 앱은 정상 동작합니다.
--  출처: KIS 시장별 투자자매매동향(일별) — 코스피(0001/KSP)·코스닥(1001/KSQ)
--  단위: 백만원 (*_ntby_tr_pbmn 그대로). 양수=순매수. 당일분은 장 마감 후 확정.
-- =====================================================================

create table if not exists market_investor_flow (
  base_date    date primary key,
  kospi_indi   bigint,   -- 코스피 개인 순매수 (백만원)
  kospi_frgn   bigint,   -- 코스피 외국인 순매수
  kospi_orgn   bigint,   -- 코스피 기관 순매수
  kosdaq_indi  bigint,   -- 코스닥 개인 순매수
  kosdaq_frgn  bigint,   -- 코스닥 외국인 순매수
  kosdaq_orgn  bigint,   -- 코스닥 기관 순매수
  collected_at timestamptz default now()
);

-- RLS: 쓰기는 서버(service key, RLS 우회)만 — 클라이언트는 읽기 전용
alter table market_investor_flow enable row level security;

drop policy if exists "market_investor_flow_read" on market_investor_flow;
create policy "market_investor_flow_read" on market_investor_flow
  for select to anon, authenticated using (true);
