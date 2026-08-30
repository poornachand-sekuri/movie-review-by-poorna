# Mobile Content Page QA Checklist

Use this checklist before merging `fresh-take-mobile-v2` into `main`.

## Asset availability

All finalized AVIFs must load from:

`https://assets.moviereviewbypoorna.com/ui/pages/content/v2/mobile/`

Expected files:

- `01-top-logo-header-LOCKED.avif`
- `03-clapboard-top-LOCKED.avif`
- `04-clapboard-body-NO-SCREW-PLATE-LOCKED.avif`
- `05-like-dislike-interaction-frame-TALLER-LOCKED.avif`
- `06-poster-frame-LOCKED.avif`
- `07-theater-top-LOCKED.avif`
- `08-theater-middle-stretchable-LOCKED.avif`
- `09-theater-bottom-seats-LOCKED.avif`
- `10-related-reviews-header-LOCKED.avif`
- `11-related-reviews-film-reel-strip-LOCKED.avif`
- `13-share-your-opinion-header-LOCKED.avif`
- `14-comments-horizontal-shell-SPACING-PATCH-LOCKED.avif`

## Clapboard

- Asset 03 overlaps Asset 04 slightly and reads as one clapboard.
- No old decorative screw/hinge plate appears beneath the clapper.
- Poster never touches the top-left hinge/clapper area.
- Poster uses `object-fit: contain` and is never cropped.
- Title, language, release date, Cast & Crew, rating and My POV are live text.
- Long Cast & Crew values wrap without escaping the frame.

## Reactions

- `Do You Like This Review?` stays completely inside the taller frame.
- Thumbs Up and Thumbs Down are live SVG buttons.
- Icons, labels and counts are not clipped at the bottom.
- Tap targets remain usable at 320px width.

## Theater / review length

Review typography is locked at 18px / 1.7 line-height on mobile and must not shrink for long reviews.

Stress-test these known records:

- `gentleman` — very short review
- `crew` — medium review
- `thammudu` — very long review
- `brahmotsavam` — long body with many `<br><br>` sequences
- `kannapa` — ordered-list content (`<ol>/<li>`)

For every length:

- Theater Top remains fixed.
- Theater Middle grows with content.
- Theater Bottom + Seats follows the content naturally.
- No internal review scrollbar.
- No clipping.
- No Read More.
- Seats-to-Related-Reviews gap remains visually constant.

## Related Reviews

- Current review is excluded.
- Maximum four results.
- Cast matches rank before director matches.
- Music-only matching is fallback-only.
- Posters stay fully inside reel windows with `object-fit: contain`.
- Poster, title and stars never overlap each other.
- Reel remains horizontally swipeable on mobile.
- Related Reviews → Share Your Opinion gap remains fixed.

## Comments

- Horizontal Recent Comments / Add Your Comment architecture remains intact.
- Name, Email, Comment and Submit label are live HTML.
- Textarea has clear breathing room before the Submit frame.
- Without `apiBase`, UI clearly behaves as preview mode and does not pretend comments are persisted.
- Production comments must eventually follow Submitted → Pending → Approved/Rejected workflow.

## Navigation / search

- Header menu hotspot opens drawer.
- Search hotspot opens search dialog.
- Search works by title and language.
- Long movie titles wrap cleanly.

## Data safety

Do not modify these files during visual QA:

- `public/data/index.json`
- `public/data/cast-crew.json`
- `public/data/related-review-rules.json`

## Minimum viewport checks

Test at least:

- 320px wide
- 360px wide
- 390px wide
- 430px wide
- 520px content cap

There must be no page-level horizontal overflow. The Related Reviews reel is the only intended horizontal scroller.
