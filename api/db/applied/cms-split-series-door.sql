-- The series door on /materials now has two editable parts: the thesis, and
-- the button that opens /about-series. Ronit's current text holds both, one per
-- line; split it, word for word, into the two fields.

UPDATE page_content
SET content = 'גם אם ניקח את הילד הכי ׳טוב׳, את ההורים הכי ׳טובים׳ ואת המטפלת הכי ׳טובה׳ - עדיין יהיה חסך. החסך מקורו מבני, ולא אישיותי.',
    updated_at = now()
WHERE page_slug = 'materials' AND block_id = 'door-series'
  AND content LIKE '%לקריאת הטיעון שסדרת המאמרים בוחנת%';

INSERT INTO page_content (page_slug, block_id, content)
VALUES ('materials', 'door-series-cta', 'לקריאת הטיעון שסדרת המאמרים בוחנת')
ON CONFLICT (page_slug, block_id) DO NOTHING;
