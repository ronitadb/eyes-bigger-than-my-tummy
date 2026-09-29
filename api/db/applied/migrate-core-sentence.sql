-- משפט אחד שמחזיק את כל המאמר.
--
-- Both working cards produced one independently — article 1 as section כב,
-- article 2 as section 26 — which is why it earns a field of its own rather
-- than living inside the canvas. It is not the summary (that is the card text
-- and the og:description) and not the lead title. It is the sentence a draft
-- gets checked against.
--
-- Private for now. Never selected by the public page.
ALTER TABLE articles ADD COLUMN IF NOT EXISTS core_sentence TEXT;
