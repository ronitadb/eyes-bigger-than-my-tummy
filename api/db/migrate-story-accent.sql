-- The decorative band behind a story's text.
--
-- Per story rather than global, so fourteen windows are not identical. Shape:
--   {"on":true,"x":4,"y":0,"w":20,"h":100}
-- x/y/w/h are percentages of the story's own text area, so the band scrolls
-- with the words rather than sitting fixed behind them.
ALTER TABLE stories ADD COLUMN IF NOT EXISTS accent JSONB;
