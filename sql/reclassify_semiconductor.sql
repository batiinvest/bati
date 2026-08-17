-- reclassify_semiconductor.sql
-- 국내 반도체 종목 재분류 — 인포그래픽 '국내 반도체 종목 한눈에 모아보기'(@going_tothe_moon) 기준
-- companies.industry='반도체' 통일 + sub_industry 를 10개 소섹터로 재지정 (총 65종목)
-- 비상장 3종(퓨리오사AI·리벨리온·세미파이브)은 companies 테이블에 없어 제외됨
-- 생성: 2026-08-17 / 실행: Supabase SQL Editor
-- 롤백: sql/reclassify_semiconductor_rollback.sql

BEGIN;

-- 1) 메모리 (2)
UPDATE companies SET industry='반도체', sub_industry='메모리'
 WHERE code IN ('005930','000660');

-- 2) 전공정장비 (9)
UPDATE companies SET industry='반도체', sub_industry='전공정장비'
 WHERE code IN ('036930','240810','095610','084370','319660','403870','089970','281820','140860');

-- 3) 후공정장비 (12)
UPDATE companies SET industry='반도체', sub_industry='후공정장비'
 WHERE code IN ('042700','489790','039030','031980','089030','064290','098460','420770','232140','003160','253590','092870');

-- 4) 부품 (10)
UPDATE companies SET industry='반도체', sub_industry='부품'
 WHERE code IN ('058470','095340','131290','101490','064760','166090','036810','074600','101160','252990');

-- 5) 소재 (7)
UPDATE companies SET industry='반도체', sub_industry='소재'
 WHERE code IN ('357780','014680','005290','220260','093370','102710','104830');

-- 6) 기판 (7)
UPDATE companies SET industry='반도체', sub_industry='기판'
 WHERE code IN ('009150','011070','007660','353200','222800','356860','007810');

-- 7) OSAT (5)
UPDATE companies SET industry='반도체', sub_industry='OSAT'
 WHERE code IN ('067310','036540','033640','131970','200470');

-- 8) 팹리스 (3)
UPDATE companies SET industry='반도체', sub_industry='팹리스'
 WHERE code IN ('080220','440110','108320');

-- 9) 디자인하우스·IP (5)
UPDATE companies SET industry='반도체', sub_industry='디자인하우스·IP'
 WHERE code IN ('399720','200710','394280','432720','094360');

-- 10) 유리기판 (5)
UPDATE companies SET industry='반도체', sub_industry='유리기판'
 WHERE code IN ('011790','161580','204270','089010','112290');

COMMIT;

-- 확인: 소섹터별 종목 수 (합계 65)
SELECT sub_industry, count(*) AS n
  FROM companies
 WHERE industry='반도체'
   AND sub_industry IN ('메모리','전공정장비','후공정장비','부품','소재','기판','OSAT','팹리스','디자인하우스·IP','유리기판')
 GROUP BY sub_industry
 ORDER BY n DESC;
