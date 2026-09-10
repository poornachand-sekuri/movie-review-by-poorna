const AUDITORIUM_RUNTIME_BASE = 'https://assets.moviereviewbypoorna.com/ui/pages/content/v4/res%70onsive';
const AUDITORIUM_ARTWORK_VERSION = '20260908-native';

export type AuditoriumRuntimeAsset = {
  src: string;
  width: number;
  height: number;
};

function asset(file: string, width: number, height: number, version = AUDITORIUM_ARTWORK_VERSION): AuditoriumRuntimeAsset {
  return {
    src: `${AUDITORIUM_RUNTIME_BASE}/${file}?v=${version}`,
    width,
    height,
  };
}

/**
 * Confirmed against the R2 uploads on 2026-09-08. Normal-flow artwork uses
 * lossless files at the measured source dimensions, preserving RGB and alpha.
 * CSS retains main's established viewport adaptation and overlay registration.
 */
export const auditoriumRuntimeAssets = {
  topNavigation: asset('02_Movie_Reviews_By_Poorna_Banner_lossless.webp', 2048, 682),
  clapboard: asset('03_Clapboard_Details_transparent_lossless.webp', 1536, 1024),
  theater: asset('04_Theater_Seats_Reactions_master_lossless.webp', 1448, 1086),
  shareReview: asset('05_Share_This_Review_transparent_lossless.webp', 2021, 374),
  relatedReviews: asset('06_Related_Reviews_transparent_lossless.webp', 2172, 724),
  shareOpinion: asset('07_Share_Your_Opinion_Panel_lossless.webp', 1080, 1456),
  bottomNavigation: asset('08_Lounge_Cini_Cafe_Banner_lossless.webp', 2048, 682),
  background: asset('01_Auditorium_Background_master_lossless.webp', 965, 1630),

  // Alternate interaction states. These are deliberately not part of normal flow.
  theaterFocus: asset('09_Theater_Focus_Overlay_transparent_lossless.webp', 821, 1915, '20260910-focus-portrait'),
  shareOpinionExit: asset('10_Share_Your_Opinion_With_Exit_lossless.webp', 1080, 1456),
} as const;
