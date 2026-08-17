-- exclude_nonsemi_18.sql
-- 반도체로 잘못 분류돼 있던 비반도체 의심 18종을 반도체에서 제외 (best-fit 산업 재지정, sub_industry 초기화)
-- 생성: 2026-08-17 / 짝: exclude_nonsemi_18_rollback.sql
-- 서버 SB_SERVICE_KEY REST PATCH로 적용됨 (SQL은 재현/기록용)

BEGIN;

-- 테크 (14): 전자·모바일·디스플·통신·SW·화학 기타
UPDATE companies SET industry='테크', sub_industry=NULL
 WHERE code IN ('060720','025000','056190','288980','148150','050890','149950','173130','051370','020760','033240','073010','402030','121850');

-- 로봇 (1): 라온로보틱스
UPDATE companies SET industry='로봇', sub_industry=NULL WHERE code='232680';

-- 우주 (1): 제노코
UPDATE companies SET industry='우주', sub_industry=NULL WHERE code='361390';

-- 2차전지 (1): 한중엔시에스 (EV 배터리 냉각)
UPDATE companies SET industry='2차전지', sub_industry=NULL WHERE code='107640';

-- 뷰티 (1): 씨큐브 (진주광택 안료 = 화장품 소재)
UPDATE companies SET industry='뷰티', sub_industry=NULL WHERE code='101240';

COMMIT;

-- 확인: 반도체 총수는 18 감소해야 함
SELECT industry, count(*) FROM companies
 WHERE code IN ('060720','025000','056190','288980','148150','050890','149950','173130','051370','020760','033240','073010','402030','121850','232680','361390','107640','101240')
 GROUP BY industry ORDER BY industry;
