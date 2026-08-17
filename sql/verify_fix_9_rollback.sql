-- verify_fix_9_rollback.sql
-- verify_fix_9.sql 원복 (직전 상태로)

BEGIN;
-- 비반도체 3종 → 반도체 복원
UPDATE companies SET industry='반도체', sub_industry='전공정장비' WHERE code='199550'; -- 레이저옵텍
UPDATE companies SET industry='반도체', sub_industry='부품'       WHERE code='009780'; -- 엠에스씨
UPDATE companies SET industry='반도체', sub_industry='소재'       WHERE code='453860'; -- 에이에스텍
-- 버킷 재배치 6종 → 부품 복원
UPDATE companies SET sub_industry='후공정장비' WHERE code='088280'; -- 쏘닉스
UPDATE companies SET sub_industry='부품'       WHERE code IN ('224060','271830','009470','252990','195870'); -- 더코디·팸텍·삼화전기·샘씨엔에스·해성디에스
COMMIT;
