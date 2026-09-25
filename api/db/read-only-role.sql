-- A read-only role, so Claude can check the database's actual state instead of
-- inferring it — and can verify a migration after it runs instead of asking what
-- the editor printed.
--
-- Deliberately narrow. "Read-only" is not "harmless": this database holds the
-- email addresses of 46 people who registered for a Zoom series, and of everyone
-- who has sent in a story. None of that is granted here.
--
--   granted : articles, page_content, email_templates  (content Ronit authors)
--             stories — every column EXCEPT email
--   withheld: zoom_participants, zoom_meetings, email_logs, contacts,
--             contact_tags, tags, campaigns, campaign_contacts,
--             outreach_activities, outreach_templates
--
-- Run once in the Neon SQL Editor. Replace the password before running.

-- 1. The role. Choose a long random password — this string is the credential.
CREATE ROLE claude_ro WITH LOGIN PASSWORD 'REPLACE_WITH_A_LONG_RANDOM_PASSWORD';

-- 2. It may connect, and look at the public schema. Nothing more.
GRANT CONNECT ON DATABASE neondb TO claude_ro;
GRANT USAGE  ON SCHEMA public   TO claude_ro;

-- 3. Content tables, in full.
GRANT SELECT ON articles        TO claude_ro;
GRANT SELECT ON page_content    TO claude_ro;
GRANT SELECT ON email_templates TO claude_ro;

-- 4. Stories by column, so the submitters' addresses stay out of reach.
GRANT SELECT (id, sender, title, body, attribution, consent, status,
              has_file, file_name, created_at, published_at,
              article_id, accent)
  ON stories TO claude_ro;

-- 5. No blanket default for future tables: a table added later is unreadable
--    until it is granted deliberately. The safer direction to be wrong in.

-- 6. Belt and braces — the role cannot write even if something above is wider
--    than intended, and cannot create objects of its own.
ALTER ROLE claude_ro SET default_transaction_read_only = on;
REVOKE CREATE ON SCHEMA public FROM claude_ro;

-- 7. Check what was actually granted.
SELECT table_name, string_agg(DISTINCT privilege_type, ', ') AS privs
FROM information_schema.table_privileges
WHERE grantee = 'claude_ro'
GROUP BY table_name ORDER BY table_name;

SELECT table_name, column_name
FROM information_schema.column_privileges
WHERE grantee = 'claude_ro'
ORDER BY table_name, column_name;
