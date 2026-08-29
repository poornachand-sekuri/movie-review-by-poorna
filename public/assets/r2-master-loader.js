const R2_MASTER_BASE='https://assets.moviereviewbypoorna.com/master';
const R2_MASTER_ASSETS={
  'home-desktop':`${R2_MASTER_BASE}/home-desktop.avif`,
  'home-mobile':`${R2_MASTER_BASE}/home-mobile.avif`,
  'content-desktop':`${R2_MASTER_BASE}/content-desktop.avif`,
  'content-mobile':`${R2_MASTER_BASE}/content-mobile.avif`
};
loadMasterAsset=async function(){
  const img=document.querySelector('[data-master-key]');
  if(!img)return;
  const mobile=matchMedia('(max-width:760px)').matches;
  const key=`${img.dataset.masterKey}-${mobile?'mobile':'desktop'}`;
  const url=R2_MASTER_ASSETS[key];
  if(!url)throw new Error(`Unknown master artwork: ${key}`);
  img.src=url;
};
