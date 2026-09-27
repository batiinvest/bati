-- =====================================================================
--  주도 업종 — 태린이아빠 방식 (2026-09-27)
--  Supabase SQL Editor에서 1회 실행하세요.
--  실행 전에도 앱·백엔드는 동작합니다 — 시황의 '주도 업종' 카드만 '준비 중'으로 나옵니다.
--
--  [원본] 2026-09-25 영상 「미장 투자방식 일부 개선 신고가전략 + 빈집매수 보완」 1:00~1:35
--  국내 주도 업종 = ① 6개월 수익률을 하방 표준편차로 나눈 값이 센 업종
--                ∩ ② 장 마감 후 기관·외국인 수급으로 최근 꾸준히 매수가 발생한 업종
--
--  [구성]
--  ① sector_index — 업종별 시가총액 가중 일별 수익률(수정주가). 6개월 모멘텀 계산용.
--     market_data 보존이 120일이라 6개월 가격 이력을 따로 쌓는다(업종 61개 × 일수, 작다).
--  ② flow_concepts에 주도 업종 판정 컬럼 추가 — 기존 '사모·투신·연금·외국인 매수 순위'와
--     같은 행(판정일 × 업종)에 모멘텀·꾸준한 매수·주도 여부를 함께 둔다.
-- =====================================================================

-- ① 업종 지수
create table if not exists sector_index (
  grp        text     not null,   -- 비교 집단 '업종:반도체와반도체장비' 등 (flow_concepts.grp와 같은 키)
  base_date  date     not null,
  ret        numeric  not null,   -- 그날 업종 수익률(시가총액 가중, 전일 시총 비중)
  n_stocks   smallint,            -- 계산에 들어간 종목 수
  primary key (grp, base_date)
);

alter table sector_index enable row level security;
drop policy if exists "sector_index_read" on sector_index;
create policy "sector_index_read" on sector_index
  for select to anon, authenticated using (true);

-- ② 주도 업종 판정
alter table flow_concepts add column if not exists mom_6m     numeric;   -- 126거래일 수익률
alter table flow_concepts add column if not exists down_dev   numeric;   -- 하방 표준편차(일간)
alter table flow_concepts add column if not exists mom_score  numeric;   -- 수익률 ÷ 하방 표준편차
alter table flow_concepts add column if not exists mom_rank   smallint;  -- 모멘텀 순위(1=최상위)
alter table flow_concepts add column if not exists pos_days   smallint;  -- 최근 20거래일 중 업종 기관+외국인 순매수 일수
alter table flow_concepts add column if not exists net_ratio  numeric;   -- 20거래일 순매수 합 ÷ 시가총액(%)
alter table flow_concepts add column if not exists flow_rank  smallint;  -- 꾸준한 매수 순위(1=최상위)
alter table flow_concepts add column if not exists lead       boolean;   -- 주도 업종 = 모멘텀 상위 ∩ 꾸준한 매수 상위
alter table flow_concepts add column if not exists n_fill     smallint;  -- 업종 안 빈집 종목 수
alter table flow_concepts add column if not exists n_start    smallint;  -- 업종 안 '이제 시작' 종목 수

comment on column flow_concepts.lead is '주도 업종(태린이아빠 2026-09): 6개월 수익률÷하방표준편차 상위 25% ∩ 기관·외국인 꾸준한 순매수 상위 25%';
