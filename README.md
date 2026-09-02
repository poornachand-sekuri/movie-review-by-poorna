# Movie Review By Poorna — Fresh Rebuild

This branch is a clean implementation. Existing production frontend code is reference-only and must not be copied into this branch.

## Architecture priorities

1. Visual Quality
2. Cross-device layout quality
3. Performance
4. Maintainability

## Site concept

Movie Review By Poorna is designed as one virtual movie theater with connected spaces:

- Home: The Lobby
- Individual Review: The Screening Room
- Search: The Movie Café
- Admin: The Projection Booth

All pages must share one cinematic design language while each space retains its own purpose and mood.

## Implementation rules

- AVIF artwork provides cinematic appearance and visual framing.
- HTML owns semantic content and accessibility.
- CSS owns layout, sizing, spacing, and adaptation across viewport/container sizes.
- TypeScript is preferred for application logic and contracts.
- Client-side JavaScript must be minimized and justified.
- Review content and existing review media are migrated as data, not by copying old UI implementation.
- Production `main` remains untouched until the rebuild is approved.
