-- =====================================================================
--  수급 칸(게이지) — 태린이아빠 수급오실레이터 엑셀의 '여러 칸' (2026-09-27)
--  Supabase SQL Editor에서 1회 실행하세요.
--  실행 전에도 앱·백엔드는 동작합니다 — 칸만 빠지고 빈집 판정은 그대로 나옵니다.
--
--  [원본] 2026-09-25 영상 「미장 투자방식 일부 개선 신고가전략 + 빈집매수 보완」 속 국내
--  수급오실레이터 엑셀: 종목 차트 옆에 '상위 10% · 상위 25% · 평균 · 하위 25% · 하위 10% · 현재'
--  칸이 있고, 현재값이 넘어선 칸이 분홍색으로 채워진다(삼성전자: 현재 0.02% → 평균·하위25%·
--  하위10% 3칸). 5칸이 다 차면 '다 찼다', 바닥에서 올라오면 '이제 시작'.
--
--  [값] flow_gauge = {"lv": [상위10, 상위25, 평균, 하위25, 하위10], "cur": 현재, "prev": 전일}
--       (수급오실레이터 %, 빈집 판정과 같은 비교 구간의 자기 이력 분포)
--       칸 수·단계 이름은 화면이 계산한다(config.js flowGauge).
-- =====================================================================

alter table market_data add column if not exists flow_gauge jsonb;

comment on column market_data.flow_gauge is
  '수급 칸: {"lv":[상위10,상위25,평균,하위25,하위10],"cur":현재,"prev":전일} — 수급오실레이터(%) 자기 이력 분포. 판정일 행에만';

-- 부분 일괄 갱신 함수에 flow_gauge 키 추가 (payload에 있는 키만 고친다 — 나머지는 기존 값 유지)
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
         updated_at       = now()
    from jsonb_array_elements(payload) as p
   where m.stock_code = p.value ->> 'stock_code'
     and m.base_date  = (p.value ->> 'base_date')::date;
  get diagnostics n = row_count;
  return n;
end;
$$;
