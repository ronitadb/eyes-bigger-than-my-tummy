# SQL for the database

Ronit runs every change herself, in the Neon SQL Editor.

- **Files in this folder** are waiting to be run.
- **`applied/`** holds everything already run, kept as the record of how the
  database came to be what it is. **Do not run them again.** Some would now do
  damage: the old `seed-article-card-*.sql` and `seed-cards-*.sql` address
  articles by slug, and since article 3 was inserted and the rest moved down
  (`renumber-articles-insert-03.sql`), those slugs point at different articles.

When a file here has been run, move it into `applied/`.
