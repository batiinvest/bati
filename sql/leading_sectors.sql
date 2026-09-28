-- =====================================================================
--  태린이아빠 국내 전략 — 주도 업종 · RS · 후보 조건 (2026-09-28)
--  Supabase SQL Editor에서 1회 실행하세요.
--  실행 전에도 앱·백엔드는 동작합니다 — 이 부분만 빠지고 기존 수급빈집은 그대로 나옵니다.
--
--  [원본] 2026-09-19 영상 「1년간 미장에서 52주 신고가 전략, 다음을 위해 전략 업그레이드」
--   ① 주도 업종 = 6개월 수익률 ÷ 하방 표준편차 순위 ∩ 장 마감 후 기관·외국인 수급을 쪼개 보아 꾸준히 매수가 들어오는 섹터
--      (매수는 2024-10 영상의 방식 — 사모·투신·연금·외국인 매수, "이때 매수만 본다")
--   ② 그 안에서 수급 오실레이터 빈집
--   ③ 거래대금 상위 · 컨센 상향 · 250일 신고가 중 하나(확률 높이기)
--   일일 스크린: RS 70 이상 · 그날 거래대금/기관·외국인 매수 상위 150 안에서 수급이 빈 종목
--
--  [구성]
--  ① market_data.lead_flags  — 종목별 조건 묶음(판정일 행)
--       {"lead": 주도업종 소속, "mid": 중분류코드, "rs": RS(1~99), "tv": 거래대금 상위150,
--        "nb": 기관+외국인 순매수 상위150, "cons": 30일 내 영업익 추정 상향, "nh": 52주 신고가}
--  ② leading_sectors — 판정일별 WICS 중분류 28개 보드(모멘텀·수급 꾸준함·이평·신고가 군집)
--       기업분석 표 보드와 오늘의 시황 '주도 업종' 카드가 같이 읽는다
--  ③ bulk_patch_market_data — lead_flags 키 추가(보낸 키만 고친다)
-- =====================================================================

alter table market_data add column if not exists lead_flags jsonb;
comment on column market_data.lead_flags is
  '태린이아빠 전략 조건: {lead,mid,rs,tv,nb,cons,nh} — 판정일 행에만. collect_leading.py';

create table if not exists leading_sectors (
  base_date       date     not null,   -- 판정일
  mid_code        text     not null,   -- WICS 중분류 코드 (G4530 …)
  name            text,                -- 반도체와반도체장비 …
  ret_6m          numeric,             -- 6개월 수익률(%) — FnGuide WICS 지수
  down_dev        numeric,             -- 일간 하방 표준편차(%)
  score           numeric,             -- 6개월 수익률 ÷ 하방 표준편차
  mom_rank        smallint,            -- 모멘텀 순위(1 = 최상위)
  n_sectors       smallint,
  above_ma11      boolean,             -- 지수가 11일 이동평균 위
  above_ma20      boolean,
  above_ma50      boolean,             -- 10주선(50일)
  buy_rank        smallint,            -- 사모·투신·연금·외국인 매수 순위(1 = 최상위, 최근 20거래일) — 주도 조건
  buy_score       numeric,             -- 매수 7개 지표 백분위 평균
  flow_pos_days   smallint,            -- 참고: 최근 N일 중 기관+외국인 순매수(+) 일수
  flow_days       smallint,
  flow_cum        bigint,              -- 최근 N일 기관+외국인 순매수 누적(원, 수량×종가)
  flow_cum_ratio  numeric,             -- 누적 ÷ 업종 시가총액(%)
  newhigh_5d      smallint,            -- 최근 5거래일 52주 신고가 종목 수(군집)
  n_stocks        integer,
  leading         boolean  not null,   -- 주도 업종 = 모멘텀 상위 ∩ 매수 상위
  n_empty         smallint,            -- 업종 안 빈집(수급 오실레이터 자기 이력 하위 50%) 종목 수
  n_start         smallint,            -- 업종 안 수급 단계 '이제 시작' 종목 수
  spark           jsonb,               -- 6개월 지수 추이(첫날=1) — 시황 카드 스파크라인
  primary key (base_date, mid_code)
);

alter table leading_sectors enable row level security;
drop policy if exists "leading_sectors_read" on leading_sectors;
create policy "leading_sectors_read" on leading_sectors
  for select to anon, authenticated using (true);

create or replace function bulk_patch_market_data(payload jsonb)
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  update market_data m
     set pef_buy_amt      = case when p.value ? 'pef_buy_amt'      then nullif(p.value ->> 'pef_buy_amt',      '')::bigint   else m.pef_buy_amt      end,
         trust_buy_amt    = case when p.value ? 'trust_buy_amt'    then nullif(p.value ->> 'trust_buy_amt',    '')::bigint   else m.trust_buy_amt    end,
         pension_buy_amt  = case when p.value ? 'pension_buy_amt'  then nullif(p.value ->> 'pension_buy_amt',  '')::bigint   else m.pension_buy_amt  end,
         foreign_buy_amt  = case when p.value ? 'foreign_buy_amt'  then nullif(p.value ->> 'foreign_buy_amt',  '')::bigint   else m.foreign_buy_amt  end,
         flow_quad        = case when p.value ? 'flow_quad'        then p.value ->> 'flow_quad'                             else m.flow_quad        end,
         flow_pctl        = case when p.value ? 'flow_pctl'        then nullif(p.value ->> 'flow_pctl',        '')::numeric  else m.flow_pctl        end,
         flow_supplied    = case when p.value ? 'flow_supplied'    then (p.value ->> 'flow_supplied')::boolean              else m.flow_supplied    end,
         flow_supply_rank = case when p.value ? 'flow_supply_rank' then nullif(p.value ->> 'flow_supply_rank', '')::smallint else m.flow_supply_rank end,
         flow_gauge       = case when p.value ? 'flow_gauge'       then p.value -> 'flow_gauge'                             else m.flow_gauge       end,
         lead_flags       = case when p.value ? 'lead_flags'       then p.value -> 'lead_flags'                             else m.lead_flags       end,
         updated_at       = now()
    from jsonb_array_elements(payload) as p
   where m.stock_code = p.value ->> 'stock_code'
     and m.base_date  = (p.value ->> 'base_date')::date;
  get diagnostics n = row_count;
  return n;
end;
$$;
