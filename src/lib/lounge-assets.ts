const LOUNGE_RUNTIME_BASE = 'https://assets.moviereviewbypoorna.com/ui/pages/home/v4/res%70onsive';

export const loungeRuntimeAssets = {
  background: `${LOUNGE_RUNTIME_BASE}/01_Movie_Reviews_By_Poorna_Premier_Lounge_Background_runtime_q99.webp`,
  topBanner: `${LOUNGE_RUNTIME_BASE}/02_Movie_Reviews_By_Poorna_Banner_runtime_q99.webp`,
  nowReviewed: `${LOUNGE_RUNTIME_BASE}/03_Now_Reviewed_Panel_runtime_q99.webp`,
} as const;

/**
 * First-paint artwork that must already be paintable before the loading curtain
 * leaves on a cold Lobby visit. Keep the background first because it is the
 * largest visual and is also preloaded from <head> at high priority.
 */
export const loungeCriticalImages = [
  loungeRuntimeAssets.background,
  loungeRuntimeAssets.topBanner,
  loungeRuntimeAssets.nowReviewed,
] as const;
