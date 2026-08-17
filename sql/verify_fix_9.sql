-- verify_fix_9.sql
-- product/sector 대조 검증 결과 반영: 비반도체 3종 제외 + 버킷 6종 재배치
-- 생성: 2026-08-17 / 짝: verify_fix_9_rollback.sql / 서버 SB_SERVICE_KEY REST PATCH로 적용

BEGIN;

-- (1) 비반도체 3종 제외 — 실제 사업 기준 타산업 이동
UPDATE companies SET industry='바이오', sub_industry=NULL WHERE code='199550'; -- 레이저옵텍: 피부미용·의료 레이저기기
UPDATE companies SET industry='소비재', sub_industry=NULL WHERE code='009780'; -- 엠에스씨: 식품첨가물
UPDATE companies SET industry='뷰티',   sub_industry=NULL WHERE code='453860'; -- 에이에스텍: 자외선차단제 원료

-- (2) 버킷 재배치 6종 (반도체 유지)
UPDATE companies SET sub_industry='부품'     WHERE code='088280'; -- 쏘닉스: RF필터 소자(제조) → 부품
UPDATE companies SET sub_industry='후공정장비' WHERE code IN ('224060','271830'); -- 더코디·팸텍: 검사/제조 장비
UPDATE companies SET sub_industry='기판'     WHERE code IN ('009470','252990','195870'); -- 삼화전기·샘씨엔에스·해성디에스: 수동소자/세라믹기판/패키지 substrate

COMMIT;

-- 확인
SELECT code, name, industry, sub_industry FROM companies
 WHERE code IN ('199550','009780','453860','088280','224060','271830','009470','252990','195870')
 ORDER BY industry, sub_industry, name;
