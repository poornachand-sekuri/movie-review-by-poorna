export const CONFIG = {
  dataBase: '/public/data',
  uiAssetBase: 'https://assets.moviereviewbypoorna.com/ui/pages/content/v2/mobile',
  apiBase: '',
  relatedToCommentsGapPx: 56,
  assets: {
    header: '01-top-logo-header-LOCKED.avif',
    clapTop: '03-clapboard-top-LOCKED.avif',
    clapBody: '04-clapboard-body-NO-SCREW-PLATE-LOCKED.avif',
    likeFrame: '05-like-dislike-interaction-frame-TALLER-LOCKED.avif',
    posterFrame: '06-poster-frame-LOCKED.avif',
    theaterTop: '07-theater-top-LOCKED.avif',
    theaterMiddle: '08-theater-middle-stretchable-LOCKED.avif',
    theaterBottom: '09-theater-bottom-seats-LOCKED.avif',
    relatedHeader: '10-related-reviews-header-LOCKED.avif',
    relatedReel: '11-related-reviews-film-reel-strip-LOCKED.avif',
    commentsHeader: '13-share-your-opinion-header-LOCKED.avif',
    commentsShell: '14-comments-horizontal-shell-SPACING-PATCH-LOCKED.avif'
  }
};

export function uiAsset(name) {
  return `${CONFIG.uiAssetBase}/${CONFIG.assets[name]}`;
}
