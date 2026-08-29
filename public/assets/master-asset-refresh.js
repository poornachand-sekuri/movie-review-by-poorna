(()=>{
  const BASE='https://assets.moviereviewbypoorna.com/master';
  const VERSION='9';
  const ASSETS={
    'home-desktop':`${BASE}/home-desktop.avif?v=${VERSION}`,
    'home-mobile':`${BASE}/home-mobile.avif?v=${VERSION}`,
    'content-desktop':`${BASE}/content-desktop.avif?v=${VERSION}`,
    'content-mobile':`${BASE}/content-mobile.avif?v=${VERSION}`
  };
  function keyFor(img){
    const mobile=matchMedia('(max-width:760px)').matches;
    return `${img.dataset.masterKey}-${mobile?'mobile':'desktop'}`;
  }
  function applyTo(img){
    if(!img||!img.matches?.('img.master-art[data-master-key]'))return;
    const key=keyFor(img),url=ASSETS[key];
    if(url&&img.getAttribute('src')!==url)img.setAttribute('src',url);
  }
  function apply(root=document){
    if(root?.matches?.('img.master-art[data-master-key]'))applyTo(root);
    root?.querySelectorAll?.('img.master-art[data-master-key]').forEach(applyTo);
  }
  const app=document.getElementById('app');
  if(app)new MutationObserver(mutations=>mutations.forEach(m=>{
    if(m.type==='attributes'&&m.target?.matches?.('img.master-art[data-master-key]'))applyTo(m.target);
    m.addedNodes?.forEach(n=>{if(n.nodeType===1)apply(n)});
  })).observe(app,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>apply());else apply();
  matchMedia('(max-width:760px)').addEventListener?.('change',()=>apply());
})();
