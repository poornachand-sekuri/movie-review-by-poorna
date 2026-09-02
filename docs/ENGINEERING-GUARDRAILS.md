# Engineering Guardrails

## Decision order

Every implementation decision is evaluated in this order:

1. Visual Quality
2. Cross-device layout quality
3. Performance
4. Maintainability

A lower priority must not silently damage a higher priority. When a visual choice has a material performance cost, the cost must be surfaced before implementation.

## One-theater design system

Movie Review By Poorna is one virtual movie theater. Every public/admin page is a connected space in the same building and must share the same design DNA: typography, materials, lighting, signage, spacing rhythm, motion language, controls and AVIF art direction.

Locked page identities:

- Home: The Lobby
- Individual review: The Screening Room
- Search: The Movie Café
- Admin: The Projection Booth

Each page can have its own room-specific mood, but it must never look like a separate website.

## AVIF ownership

AVIF artwork owns cinematic appearance, texture, lighting, frames and decorative environment.

HTML owns semantic content, accessibility and document structure.

CSS owns geometry, flow, spacing, sizing and viewport/container adaptation.

Live review text, movie titles, dates, ratings, navigation labels, search results and form content must not be baked into AVIF artwork.

Complex artwork may use separate compact, medium and wide art-direction variants. Variants are chosen by layout need, not by individual phone model.

## Performance gates

- Server-render useful page content at the Cloudflare edge; do not require client JavaScript for first content paint.
- Client-side framework hydration is opt-in per interactive component, never page-wide by default.
- A new third-party browser script requires a performance/privacy review before adoption.
- Home and search must never download every full review body just to render cards/results.
- Review pages should fetch/render the active review plus only the compact related/list data they need.
- R2 UI artwork must use versioned immutable URLs.
- Below-the-fold imagery is lazy loaded unless a measured UX reason requires otherwise.
- Any single above-the-fold AVIF over 600 KB triggers an explicit performance review.
- Any page whose above-the-fold visual assets exceed 1.2 MB triggers an explicit performance review.
- These image thresholds are review gates, not automatic visual-quality compromises.

## Content architecture

D1 is the canonical structured content store for the new build.

Core/searchable fields use typed columns. Credits and gallery items use related tables. Optional experimental fields may use `extra_json`; fields that become important/searchable are promoted to proper columns through a versioned migration.

R2 stores media and UI artwork, not review business data.

Durable Objects remain the preferred persistence mechanism for high-write interaction state such as reactions, comments and analytics unless measurements justify a change.

## Migration safety

Legacy content is copied, never moved destructively.

The current production catalogue and R2 media remain untouched during migration and staging verification. Imported records retain a source hash and source JSON audit copy so migration correctness can be checked before cutover.

## Code quality

- TypeScript strict mode is mandatory.
- Dependencies are pinned intentionally and upgraded deliberately.
- Components are organized by responsibility, not by one-off page patches.
- No accumulated override stylesheet strategy.
- No screen-specific pixel patches for individual devices.
- Reusable design tokens will be defined once and consumed by all pages.
- Production changes require automated validation plus visual checks at representative compact, medium and wide viewports.
