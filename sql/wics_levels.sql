-- =====================================================================
--  companies에 WICS 상위 2단계 이름 컬럼 추가 (2026-09-26)
--  Supabase SQL Editor에서 1회 실행하세요.
--
--  [배경]
--  WICS는 3단계다 — 대분류(섹터) > 중분류 > 소분류(업종).
--  그런데 DB에는 `wics_code`(G453010)와 `wics_industry`(소분류 이름)만 있었다.
--  계층은 코드 안에 들어 있으니 잘라 쓸 수 있지만, 코드에 대응하는 **한글 이름**이
--  어디에도 없어 화면 코드가 이름표를 들고 있었다. 그 이름표가 틀려도 DB만 봐서는
--  알 수 없고, 실제로 G4535를 '전기·전자제품'으로 잘못 적어 2차전지주 80종목이
--  '반도체와반도체장비'로 보이던 일이 있었다.
--  → 이름을 DB에 함께 저장해 단일 소스로 삼는다. 채우는 쪽은 collect_wics.py 하나다.
--
--  [값]
--  FnGuide 공식 분류표 그대로 (https://www.wiseindex.com/About/WICS)
--    wics_sector : 대분류 10종  (코드 앞 3자 G45 → 'IT')
--    wics_mid    : 중분류 28종  (코드 앞 5자 G4530 → '반도체와반도체장비')
--
--  [실행 후]
--  collect_wics.py가 매일 08:20에 채운다. 즉시 채우려면 서버에서 한 번 실행하면 된다.
-- =====================================================================

alter table companies add column if not exists wics_sector text;
alter table companies add column if not exists wics_mid    text;

comment on column companies.wics_sector is 'WICS 대분류(섹터) 이름 — wics_code 앞 3자에 대응. FnGuide 공식 명칭';
comment on column companies.wics_mid    is 'WICS 중분류 이름 — wics_code 앞 5자에 대응. FnGuide 공식 명칭';
