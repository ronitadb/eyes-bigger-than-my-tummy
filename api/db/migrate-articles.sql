-- הספרייה המשותפת — articles
--
-- Blocks are stored as JSONB rather than as separate rows: an article is always
-- read and written whole, never queried by block, so a join table would buy
-- nothing and cost ordering headaches.
--
-- `chain` and `notes` are PRIVATE (מאחורי הקלעים). They are never rendered.
-- The public page is server-rendered and simply does not select them.

CREATE TABLE IF NOT EXISTS articles (
  id            SERIAL PRIMARY KEY,
  slug          TEXT UNIQUE NOT NULL,

  -- כותרת ראשית is two lines with different designs, not one string.
  title_lead    TEXT,           -- the literary line: "אם אין אני לי, מי לי?"
  title_topic   TEXT,           -- the precise topic line

  summary       TEXT,           -- card text + og:description
  blocks        JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Private. The ordered domino statements Ronit writes before the prose.
  chain         JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes         TEXT,

  term_name     TEXT,           -- the concept this article contributes to the מילון
  hero_image    TEXT,
  hero_credit   TEXT,

  external_pubs JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{name,url,date}]
  related_ids   INTEGER[] NOT NULL DEFAULT '{}',
  story_ids     INTEGER[] NOT NULL DEFAULT '{}',

  -- planned   = title shown on the index as "בקרוב", no page
  -- draft     = invisible to the public, being written
  -- published = live
  -- hidden    = withdrawn
  status        TEXT NOT NULL DEFAULT 'planned'
                CHECK (status IN ('planned','draft','published','hidden')),

  sort_order    INTEGER NOT NULL DEFAULT 0,
  published_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS articles_status_idx ON articles (status, sort_order);

-- הדים: a response belongs to an article. Reuses the whole stories pipeline —
-- moderation, consent, attribution, withdrawal — rather than duplicating it.
-- NULL means a free-standing story, which is what every existing row is.
ALTER TABLE stories ADD COLUMN IF NOT EXISTS article_id INTEGER REFERENCES articles(id) ON DELETE SET NULL;

-- The ten placeholders. Numbered for now; Ronit replaces the titles in the CMS.
INSERT INTO articles (slug, title_topic, sort_order, status)
SELECT 'article-' || LPAD(n::text, 2, '0'), 'מאמר ' || n, n, 'planned'
FROM generate_series(1, 10) AS n
ON CONFLICT (slug) DO NOTHING;
