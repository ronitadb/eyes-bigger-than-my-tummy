-- Three additions, each earned by reading five working cards.

-- האסימון — what should land in the reader. Present in all five cards, twice
-- over in card 3. Different in kind from core_sentence: that one holds the
-- article, this one names the realisation the chain is aimed at.
ALTER TABLE articles ADD COLUMN IF NOT EXISTS asimon TEXT;

-- Which earlier articles this one rests on.
-- Every card opens with תפקיד המאמר בשרשרת, positioning itself against what
-- came before — card 5 against articles 3 AND 4 at once. So the chain is a
-- graph, not a line, and the honest direction is backward. Forward links are
-- derived: if 5 builds on 3, then 3 leads to 5.
-- Distinct from related_ids, which stays editorial (לקריאה נוספת).
ALTER TABLE articles ADD COLUMN IF NOT EXISTS builds_on INTEGER[] NOT NULL DEFAULT '{}';

-- The movement this article belongs to. Card 4 names one explicitly
-- ("מאמר 4 פותח ציר חדש בסדרה"), but card 5 draws on both sides of that
-- boundary — so the value is stored and the public index stays flat until the
-- groupings are real.
ALTER TABLE articles ADD COLUMN IF NOT EXISTS axis TEXT;
