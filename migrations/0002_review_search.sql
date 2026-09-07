CREATE VIRTUAL TABLE review_search USING fts5(
  title,
  language,
  excerpt,
  verdict,
  search_text,
  content='reviews',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER reviews_search_after_insert
AFTER INSERT ON reviews
BEGIN
  INSERT INTO review_search(rowid, title, language, excerpt, verdict, search_text)
  VALUES (new.id, new.title, new.language, new.excerpt, new.verdict, new.search_text);
END;

CREATE TRIGGER reviews_search_after_delete
AFTER DELETE ON reviews
BEGIN
  INSERT INTO review_search(review_search, rowid, title, language, excerpt, verdict, search_text)
  VALUES ('delete', old.id, old.title, old.language, old.excerpt, old.verdict, old.search_text);
END;

CREATE TRIGGER reviews_search_after_update
AFTER UPDATE ON reviews
BEGIN
  INSERT INTO review_search(review_search, rowid, title, language, excerpt, verdict, search_text)
  VALUES ('delete', old.id, old.title, old.language, old.excerpt, old.verdict, old.search_text);

  INSERT INTO review_search(rowid, title, language, excerpt, verdict, search_text)
  VALUES (new.id, new.title, new.language, new.excerpt, new.verdict, new.search_text);
END;

INSERT INTO review_search(rowid, title, language, excerpt, verdict, search_text)
SELECT id, title, language, excerpt, verdict, search_text
FROM reviews;
