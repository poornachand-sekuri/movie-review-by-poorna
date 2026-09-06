const AUDITORIUM_RUNTIME_BASE = 'https://assets.moviereviewbypoorna.com/ui/pages/content/v4/res%70onsive';
const AUDITORIUM_CACHE_KEY = 'auditorium-v4-20260906';

export type AuditoriumAssetKey =
  | 'background'
  | 'topNavigation'
  | 'clapboard'
  | 'theaterScreen'
  | 'shareReview'
  | 'relatedReviews'
  | 'shareOpinion'
  | 'bottomNavigation';

/**
 * Keep the runtime artwork names isolated here. The first filename is the
 * preferred production name; the remaining names are safe fallbacks for
 * already-uploaded v4 exports that used the adjacent section numbering or
 * "Panel/Section" suffix.
 */
export const auditoriumAssetFiles: Readonly<Record<AuditoriumAssetKey, readonly string[]>> = {
  background: [
    '01_Auditorium_Background_runtime_q99.webp',
    '01_The_Auditorium_Background_runtime_q99.webp',
    '01_Theater_Ambiance_Background_runtime_q99.webp',
    '01_Theater_Auditorium_Background_runtime_q99.webp',
  ],
  topNavigation: [
    '02_Top_Navigation_runtime_q99.webp',
    '01_Top_Navigation_runtime_q99.webp',
    '02_Top_Navigation_Banner_runtime_q99.webp',
    '01_Top_Navigation_Banner_runtime_q99.webp',
  ],
  clapboard: [
    '03_Clapboard_runtime_q99.webp',
    '02_Clapboard_runtime_q99.webp',
    '03_Clapboard_Section_runtime_q99.webp',
    '03_Clapboard_Details_runtime_q99.webp',
    '02_Clapboard_Section_runtime_q99.webp',
  ],
  theaterScreen: [
    '04_Theater_Screen_runtime_q99.webp',
    '03_Theater_Screen_runtime_q99.webp',
    '04_Theater_Screen_Section_runtime_q99.webp',
    '04_Auditorium_Theater_Screen_runtime_q99.webp',
    '03_Theater_Screen_Section_runtime_q99.webp',
  ],
  shareReview: [
    '05_Share_This_Review_runtime_q99.webp',
    '04_Share_This_Review_runtime_q99.webp',
    '05_Share_This_Review_Panel_runtime_q99.webp',
    '04_Share_This_Review_Panel_runtime_q99.webp',
  ],
  relatedReviews: [
    '06_Related_Reviews_runtime_q99.webp',
    '05_Related_Reviews_runtime_q99.webp',
    '06_Related_Reviews_Panel_runtime_q99.webp',
    '05_Related_Reviews_Panel_runtime_q99.webp',
  ],
  shareOpinion: [
    '07_Share_Your_Opinion_runtime_q99.webp',
    '06_Share_Your_Opinion_runtime_q99.webp',
    '07_Share_Your_Opinion_Panel_runtime_q99.webp',
    '06_Share_Your_Opinion_Panel_runtime_q99.webp',
  ],
  bottomNavigation: [
    '08_Bottom_Navigation_runtime_q99.webp',
    '07_Bottom_Navigation_runtime_q99.webp',
    '08_Bottom_Navigation_Banner_runtime_q99.webp',
    '07_Bottom_Navigation_Banner_runtime_q99.webp',
    '08_Lounge_Cini_Cafe_Banner_runtime_q99.webp',
  ],
} as const;

function runtimeUrl(file: string): string {
  return `${AUDITORIUM_RUNTIME_BASE}/${file}?v=${AUDITORIUM_CACHE_KEY}`;
}

export const auditoriumAssetCandidates = Object.fromEntries(
  Object.entries(auditoriumAssetFiles).map(([key, files]) => [
    key,
    files.map(runtimeUrl),
  ]),
) as Readonly<Record<AuditoriumAssetKey, readonly string[]>>;

export const auditoriumRuntimeAssets = Object.fromEntries(
  Object.entries(auditoriumAssetCandidates).map(([key, urls]) => [key, urls[0]]),
) as Readonly<Record<AuditoriumAssetKey, string>>;

export const auditoriumCriticalImages = [
  auditoriumRuntimeAssets.background,
  auditoriumRuntimeAssets.topNavigation,
  auditoriumRuntimeAssets.clapboard,
  auditoriumRuntimeAssets.theaterScreen,
] as const;

export const auditoriumRuntimeBase = AUDITORIUM_RUNTIME_BASE;
