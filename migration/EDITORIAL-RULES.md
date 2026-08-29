# Full WordPress Migration — Editorial Standard

This migration converts every legacy WordPress review into a native Movie Reviews by Poorna record while preserving Poorna's personal voice.

## Core principle

Correct the writing without rewriting the personality.

Keep the review recognisably Poorna: conversational, enthusiastic, opinionated, humorous, emoji-friendly and willing to use deliberate emphasis/capitalisation. Remove errors and legacy formatting, not character.

## Review-body cleanup rules

1. Remove legacy opener labels such as `Watched #MovieName:`, `watched #MovieName -`, `#MovieName:` or a standalone movie hashtag used as a heading.
2. Do not replace the removed label with another artificial heading. Start with the actual first thought/sentence.
3. Keep hashtags only when they naturally belong inside a sentence or joke; do not use the movie hashtag as a review title substitute.
4. Correct spelling, obvious typos, grammar, missing articles/prepositions and malformed sentences while preserving meaning.
5. Remove accidental duplicate words, duplicate sentences and duplicate paragraphs.
6. Normalise broken whitespace and paragraph boundaries.
7. Preserve intentional humour, slang, anecdotes, names, emojis and conversational asides.
8. Preserve deliberate ALL-CAPS emphasis where it is clearly stylistic. Avoid adding new unnecessary caps.
9. Preserve enthusiastic punctuation when it is clearly part of the voice, but reduce obvious accidental punctuation noise where readability suffers.
10. Do not invent opinions, scenes, performances or claims that are not present in the source review.
11. Do not change the verdict merely to make the prose smoother.
12. Existing embedded images must be migrated to first-party R2 URLs; no WordPress media URL may remain in final HTML.

## Native fields to populate

### Rating
- Use the review's own sentiment only.
- Scale: 1–5 stars, matching the Admin UI.
- 5 = exceptional / wholehearted recommendation / strong repeat-watch enthusiasm.
- 4 = clearly liked / recommended, with some reservations.
- 3 = mixed-to-positive or average / worthwhile but notable issues.
- 2 = clearly disliked, with limited positives.
- 1 = strongly negative / little to recommend.
- When sentiment is genuinely ambiguous, prefer the conservative middle value and flag it for manual review rather than fabricate certainty.

### Popcorn Verdict
- One crisp sentence in Poorna's voice.
- Target roughly 70–160 characters.
- Capture the emotional bottom line, not a plot summary.
- Avoid repeating the movie title unless it improves the sentence.
- Do not begin with `Watched`, a hashtag, `Review:`, or `Verdict:`.

### Short Excerpt
- 1–3 compact sentences suitable for cards/search/Admin.
- Target roughly 180–450 characters.
- Summarise what Poorna liked/disliked and the overall recommendation.
- Preserve personality but avoid spoilers and duplicated wording from the Popcorn Verdict where possible.

### Release Date
- Treat as objective metadata.
- Verify from a reliable public source during migration; do not infer from the WordPress publish date.

### Language
- Preserve known language from the archive, but replace `To be added` when it can be reliably determined.

### Poster / gallery
- Download the actual source image binary once.
- Store under the first-party R2 domain (`assets.moviereviewbypoorna.com`).
- Rewrite poster, inline image, `srcset` and gallery references to first-party URLs.

## Migration completion rule

A review is considered fully migrated only when:

- full cleaned body is stored natively;
- Rating, Popcorn Verdict and Short Excerpt are populated;
- release date/language are populated or explicitly flagged for manual verification;
- poster and embedded images are first-party assets;
- no `wordpress.com`, `wordpress.com/wp-content`, `public-api.wordpress.com`, or legacy `/wp-content/` dependency remains for that review;
- source content is retained separately long enough to compare during manual QA.

The final production cutover happens only after the entire archive passes a zero-WordPress-reference audit.