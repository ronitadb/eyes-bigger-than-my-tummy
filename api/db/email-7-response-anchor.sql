-- The article 2 email ("מאמר 2") links to the response form as
-- library/article-02#story-submit-form. That id exists only on /materials (the
-- general story form); on an article page the response form is #echo, so the
-- link landed at the top of the article. Point it at #echo.

UPDATE email_templates SET
  body = replace(body, 'library/article-02#story-submit-form', 'library/article-02#echo'),
  updated_at = now()
WHERE id = 7 AND body LIKE '%library/article-02#story-submit-form%';
