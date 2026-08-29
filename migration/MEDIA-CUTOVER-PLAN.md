# WordPress Media → First-Party R2 Cutover

## Goal

Move every legacy WordPress media dependency into the existing Cloudflare R2 bucket without exposing Cloudflare credentials or requiring manual re-upload.

## Source snapshot

The immutable migration snapshot currently contains 137 published reviews and 137 unique media URLs. `migration/raw/` remains the audit source until final cutover is approved.

## Target convention

Each migrated review poster will use:

`reviews/<review-slug>/poster.<ext>`

Public URL:

`https://assets.moviereviewbypoorna.com/reviews/<review-slug>/poster.<ext>`

The original extension/content type will be retained when practical. We will not blindly transcode source images during migration.

## Secure migration mechanism

The final migration branch will expose an **admin-authenticated, temporary migration operation** in the Worker.

For each compiled native review the operation will:

1. Read the preserved `poster_source` URL from the completed migration catalog.
2. Reject any source that is not an expected `moviereviewbypoorna.wordpress.com/wp-content/uploads/` URL.
3. Fetch the source image server-side.
4. Require a successful response with an `image/*` content type.
5. Write the exact image bytes to the `REVIEW_ASSETS` R2 binding under the review-specific target key.
6. Record content type, source URL, byte size and migration timestamp as R2 metadata.
7. Verify the newly written R2 object can be read back and has the expected byte size.
8. Update the native review record to the first-party R2 public URL only after the write verifies successfully.

## Safety rules

- The endpoint remains behind the existing Admin authentication/session system.
- Migration runs in small batches so a timeout cannot leave the whole archive in an unknown state.
- Re-running is idempotent: an already verified target is skipped unless explicitly forced.
- A migration ledger records per-review status: `pending`, `copied`, `verified`, or `failed`.
- WordPress source URLs remain in the immutable raw snapshot for audit only; they are not retained in the production review records after cutover.
- Production WordPress fallback code is removed only after 137/137 native records and 137/137 media objects pass validation.

## Final zero-dependency gate

Before production merge, automated checks must report:

- 137 / 137 reviews editorially migrated.
- 137 / 137 required poster images verified in R2.
- zero `wordpress.com` URLs in public/native production review data.
- zero `/wp-content/` references in public/native production review data.
- zero runtime calls to `public-api.wordpress.com`.
- no `WP_API`, `WP_POSTS`, `absoluteLegacyImage`, or browser WordPress fallback remaining in production code.

The raw migration snapshot can remain in Git history as an archival/audit source, but no live request path may depend on WordPress after cutover.
