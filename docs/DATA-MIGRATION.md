# Content Migration Plan

## Source of truth during the rebuild

Until cutover approval, the current production content remains authoritative and untouched.

The new D1 database is populated by copying the existing review catalogue and cast/crew data. The migration does not delete, rewrite or relocate production content or R2 media.

## Mapping

Legacy review fields are mapped as follows:

| Legacy | D1 field |
| --- | --- |
| `i` | `legacy_id` |
| `s` | `slug` |
| `t` | `title` |
| `l` | `language` |
| `rd` | `release_date` |
| `d` | `reviewed_date` |
| `r` | `rating` |
| `v` | `verdict` |
| `e` | `excerpt` |
| `body` | `body_html` |
| `m` | `poster_url` |
| `gallery` | `review_gallery` rows |
| `c` | `extra_json.legacyC` until its original meaning is confirmed |

Cast/crew groups become normalized `people` and `review_credits` rows. Existing source roles map to `actor`, `actress`, `director` and `music_director`. The role column is intentionally open-ended so future credits can add writer, cinematographer, editor or other roles without redesigning the table.

## Verification requirement

Migration is not considered successful merely because an import command completes.

Before the new application is allowed to depend on D1, verification must confirm:

1. Review count matches the live combined catalogue at migration time.
2. Every source slug exists exactly once.
3. Legacy IDs match where present.
4. Titles, languages, dates, ratings, verdicts, excerpts and full review HTML match their sources.
5. Poster and gallery URLs match their sources.
6. Cast/crew names, roles and ordering match their sources.
7. A SHA-256 copy of every legacy review record matches the audit row stored in D1.
8. Foreign-key and database integrity checks return clean results.
9. Search index results are rebuilt and spot-checked after the import.

## Rollback

The existing production JSON/R2 content is retained throughout staging and launch validation. D1 becomes canonical only after the new site is approved and the migration verification report is clean.
