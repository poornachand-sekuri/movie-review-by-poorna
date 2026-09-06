const AUDITORIUM_RUNTIME_BASE = 'https://assets.moviereviewbypoorna.com/ui/pages/content/v4/res%70onsive';

export type AuditoriumRuntimeAsset = {
  src: string;
  width: number;
  height: number;
};

function asset(file: string, width: number, height: number): AuditoriumRuntimeAsset {
  return {
    src: `${AUDITORIUM_RUNTIME_BASE}/${file}`,
    width,
    height,
  };
}

/**
 * Confirmed from the current R2 content/v4/responsive runtime files on 2026-09-06.
 * Do not add guessed filenames here. The background is intentionally absent until
 * its artwork is finalized and uploaded.
 */
export const auditoriumRuntimeAssets = {
  topNavigation: asset('02_Movie_Reviews_By_Poorna_Banner_runtime_q99.webp', 2048, 682),
  clapboard: asset('03_Clapboard_Details_transparent_runtime_q99.webp', 1536, 1024),
  theater: asset('04_Theater_Seats_Reactions_transparent_runtime_q99.webp', 1448, 1086),
  shareReview: asset('05_Share_This_Review_transparent_runtime_q99.webp', 2021, 374),
  relatedReviews: asset('06_Related_Reviews_transparent_runtime_q99.webp', 2172, 724),
  shareOpinion: asset('07_Share_Your_Opinion_Panel_runtime_q99.webp', 1080, 1456),
  bottomNavigation: asset('08_Lounge_Cini_Cafe_Banner_runtime_q99.webp', 2048, 682),

  // Alternate interaction states. These are deliberately not part of normal flow.
  theaterFocus: asset('09_Theater_Focus_Overlay_transparent_runtime_q99.webp', 1448, 1086),
  shareOpinionExit: asset('10_Share_Your_Opinion_With_Exit_runtime_q99.webp', 1080, 1456),
} as const;
