-- The community section and its texts moved from /materials to /voices, and
-- /materials#articles' note to /library. The CMS stores edits per page, so the
-- ones Ronit made on /materials are copied to the page that now holds those
-- texts: the paragraphs she hid (an empty override hides a line) stay hidden,
-- and "מהאימיילים שלכם אליי" stays her heading.
--
-- A copy, not a move: the /materials rows no longer match anything on that
-- page, and leaving them makes this safe to run before or after the deploy.
-- ON CONFLICT: an edit already made on the new page wins.

INSERT INTO page_content (page_slug, block_id, content)
SELECT 'voices', block_id, content FROM page_content
WHERE page_slug = 'materials'
  AND block_id IN ('door2-title','door2-sub','p23','p24','p25','p26','li1','li2',
                   'stories-eyebrow','stories-title')
ON CONFLICT (page_slug, block_id) DO NOTHING;

INSERT INTO page_content (page_slug, block_id, content)
SELECT 'library', block_id, content FROM page_content
WHERE page_slug = 'materials' AND block_id = 'articles-note'
ON CONFLICT (page_slug, block_id) DO NOTHING;
