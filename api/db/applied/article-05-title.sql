-- מאמר 5: the title pointed, with its source, as article 3's (Ronit, 2026-11-07).
-- Same field and form as article 3's ״וְנַפְשׁוֹ קְשׁוּרָה בְנַפְשׁוֹ״ (בראשית מד, ל):
-- the source in brackets at the end of title_lead, which the page sets small
-- after the line (titleLead → span.a-title-cite). No code change.
-- Guard: only the unpointed title as loaded. Expect UPDATE 1.

UPDATE articles SET
  title_lead = '״לֹא טוֹב הֱיוֹת הָאָדָם לְבַדּוֹ״ (בראשית ב, יח)',
  updated_at = now()
WHERE slug = 'article-05'
  AND title_lead = '״לא טוב היות האדם לבדו״';
