-- =====================================================================
--  수급빈집 1단계 '유동성 공급 컨셉' 필터 (2026-09-27)
--  Supabase SQL Editor에서 1회 실행하세요.
--  실행 전에도 앱·백엔드는 동작합니다 — 컨셉 필터만 빠지고 기존 빈집 판정은 그대로 나옵니다.
--
--  [배경]
--  태린이아빠 원본은 빈집을 찾기 전에 '유동성이 공급되는 컨셉'부터 고른다(영상 속 시트
--  원문: "1. 유동성 공급이 되는 컨셉을 분류한다 — 이때 매수만 본다"). 근거 표는 종목별
--  사모·투신·연금·외국인의 '시가총액 대비 매수 순위'와 '매수대금 순위'이고, 이를 업종별로
--  모아 컨셉을 정한다(기준: 외국인 금액대비 · 기관 시총대비 · 기관 금액대비).
--  → 투자자 유형별 매수대금을 쌓고(KIS FHPTJ04160001), 업종 단위로 순위를 매겨
--    상위 업종 종목만 '빈집'으로 부른다.
--
--  [구성]
--  ① market_data 매수대금 4종(백만원) — 사모·투신·연기금·외국인 (*_shnu_tr_pbmn)
--  ② market_data 공급 판정 2종 — 판정일 행에 기록
--  ③ flow_concepts — 판정일별 업종 순위표(화면의 '지금 공급 업종' 목록)
--  ④ bulk_patch_market_data — payload에 있는 키만 고치는 일괄 UPDATE
-- =====================================================================

-- ① 투자자 유형별 매수대금 (백만원, 거래소 집계). 기관계 순매수 = 증권+보험+투신+사모+은행+종금+연기금
alter table market_data add column if not exists pef_buy_amt     bigint;   -- 사모펀드 매수대금
alter table market_data add column if not exists trust_buy_amt   bigint;   -- 투신 매수대금
alter table market_data add column if not exists pension_buy_amt bigint;   -- 연기금 매수대금
alter table market_data add column if not exists foreign_buy_amt bigint;   -- 외국인 매수대금

-- ② 빈집 판정일 행의 업종 공급 판정. NULL = 판정 불가(매수대금 부족 등) — 화면은 필터 없이 표시
alter table market_data add column if not exists flow_supplied    boolean;  -- 소속 업종이 공급 상위인가
alter table market_data add column if not exists flow_supply_rank smallint; -- 소속 업종의 공급 순위(1=최상위)

comment on column market_data.pef_buy_amt     is '사모펀드 매수대금(백만원) — KIS FHPTJ04160001 pe_fund_shnu_tr_pbmn';
comment on column market_data.trust_buy_amt   is '투신 매수대금(백만원) — ivtr_shnu_tr_pbmn';
comment on column market_data.pension_buy_amt is '연기금 매수대금(백만원) — fund_shnu_tr_pbmn';
comment on column market_data.foreign_buy_amt is '외국인 매수대금(백만원) — frgn_shnu_tr_pbmn';
comment on column market_data.flow_supplied    is '수급빈집 1단계: 소속 업종이 유동성 공급 상위(상위 25%)인가. NULL=판정 불가';
comment on column market_data.flow_supply_rank is '수급빈집 1단계: 소속 업종의 유동성 공급 순위(1=최상위)';

-- ③ 업종 공급 순위표
create table if not exists flow_concepts (
  base_date  date     not null,   -- 빈집 판정일
  grp        text     not null,   -- 비교 집단 '업종:반도체와반도체장비' / '중분류:…' / '섹터:…'
  rank       smallint not null,   -- 1 = 가장 많이 사는 업종
  n_groups   smallint not null,   -- 순위를 매긴 집단 수
  supplied   boolean  not null,   -- 상위 25% 안인가
  n_stocks   integer,             -- 집단 종목 수
  score      numeric,             -- 7개 지표 백분위 평균(0~100)
  measures   jsonb,               -- 지표별 백분위 {"사모시총":…, "외국인금액":…}
  data_from  date,                -- 매수대금 집계 구간
  data_to    date,
  primary key (base_date, grp)
);

alter table flow_concepts enable row level security;
drop policy if exists "flow_concepts_read" on flow_concepts;
create policy "flow_concepts_read" on flow_concepts
  for select to anon, authenticated using (true);

-- ④ 일괄 UPDATE — payload에 '있는 키만' 고친다(없는 키는 기존 값 유지).
--    bulk_update_market_flow는 두 컬럼을 늘 덮어써서, 다른 컬럼만 보내면 수급이 NULL로 지워진다.
--    그래서 별도 함수로 둔다. 존재하지 않는 (stock_code, base_date)는 매칭되지 않는다(스켈레톤 행 없음).
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
         updated_at       = now()
    from jsonb_array_elements(payload) as p
   where m.stock_code = p.value ->> 'stock_code'
     and m.base_date  = (p.value ->> 'base_date')::date;
  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function bulk_patch_market_data(jsonb) is
  'market_data 부분 일괄 갱신 — payload에 있는 키만 고친다(매수대금 4종·빈집 판정 4종). collect_flow_empty용.';
