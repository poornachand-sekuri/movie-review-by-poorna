const CINI_CAFE_RUNTIME_BASE = 'https://assets.moviereviewbypoorna.com/ui/pages/cine-cafe/v4/res%70onsive';

export const ciniCafeRuntimeAsset = {
  src: `${CINI_CAFE_RUNTIME_BASE}/01_Cini_Cafe_UI_runtime_q99.webp`,
  width: 1024,
  height: 1536,
} as const;

export const ciniCafeCriticalImages = [ciniCafeRuntimeAsset.src] as const;
