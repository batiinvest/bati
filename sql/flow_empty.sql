-- =====================================================================
--  market_data에 수급 '빈집' 판정 컬럼 추가 (2026-09-27)
--  Supabase SQL Editor에서 1회 실행하세요.
--
--  [배경]
--  빈집은 수급 이력 63거래일로 5일 오실레이터를 만들고 자기 이력 백분위를 내야
--  나오는 값이라, 화면에서 계산하면 표 로딩에 2.8만 행을 더 받아야 한다
--  (첫 로딩을 2.0초 → 1.0초로 줄인 것과 정면으로 상충).
--  → 수급 수집 직후 백엔드가 계산해 넣고, 화면은 컬럼 하나만 읽는다.
--
--  [값]  수급 지도(flow-map.js)의 빈집 모드와 같은 정의
--    flow_quad  'fill' 빈집(공급강도 상위 + 현재 수급 하위) · 'full' 이미 채워짐
--               · 'bnce' 유출 중 일시 유입 · 'cold' 소외
--    flow_pctl  자기 이력 대비 현재 오실레이터 백분위(0~100). 30 이하가 '진짜 빈집'
--
--  수급(foreign_net_buy·institution_net_buy)이 있는 종목만 채워진다 — 현재 452종목.
--  나머지는 NULL로 남고 화면에서도 판정 없음으로 표시된다.
-- =====================================================================

alter table market_data add column if not exists flow_quad text;
alter table market_data add column if not exists flow_pctl numeric;

comment on column market_data.flow_quad is
  '수급 빈집 사분면: fill(빈집)/full(채워짐)/bnce(일시유입)/cold(소외). flow-map.js 빈집 모드와 동일 정의';
comment on column market_data.flow_pctl is
  '5일 수급오실레이터의 자기 이력 백분위(0~100). 30 이하면 뚜렷한 빈집';
