export const CONFIG = {
  dataBase: '/data',
  uiAssetBase: 'https://assets.moviereviewbypoorna.com/ui/pages/content/v2/mobile',
  apiBase: '',
  relatedToCommentsGapPx: 56,
  assets: {
    header: '01-top-logo-header-LOCKED.avif',
    clapTop: '03-clapboard-top-LOCKED.avif',
    clapBody: '04-clapboard-body-NO-SCREW-PLATE-LOCKED.avif',
    likeFrame: '05-like-dislike-interaction-frame-TALLER-LOCKED.avif',
    posterFrame: '06-poster-frame-LOCKED.avif',
    theaterTop: '/assets/images/content-v2/theater-top-q58.avif?v=20260901-runtime-1',
    theaterMiddle: '/assets/images/content-v2/theater-middle-q58.avif?v=20260901-runtime-1',
    theaterBottom: '/assets/images/content-v2/theater-bottom-q58.avif?v=20260901-runtime-1',
    relatedHeader: '10-related-reviews-header-LOCKED.avif',
    relatedReel: '11-related-reviews-film-reel-strip-LOCKED.avif',
    commentsHeader: '13-share-your-opinion-header-LOCKED.avif',
    commentsShell: '14-comments-horizontal-shell-SPACING-PATCH-LOCKED.avif'
  }
};

export function uiAsset(name) {
  const asset = CONFIG.assets[name];
  if (typeof asset !== 'string') return '';
  if (asset.startsWith('/') || /^https?:\/\//i.test(asset)) return asset;
  return `${CONFIG.uiAssetBase}/${asset}`;
}
