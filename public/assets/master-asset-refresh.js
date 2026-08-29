(()=>{
  const BASE='https://assets.moviereviewbypoorna.com/master';
  const ASSETS={
    'home-desktop':`${BASE}/home-desktop.avif?v=4`,
    'home-mobile':`${BASE}/home-mobile.avif?v=4`,
    'content-desktop':`${BASE}/content-desktop.avif?v=4`,
    'content-mobile':`${BASE}/content-mobile.avif?v=4`
  };
  function apply(root=document){
    const imgs=[];
    if(root?.matches?.('img.master-art[data-master-key]'))imgs.push(root);
    root?.querySelectorAll?.('img.master-art[data-master-key]').forEach(i=>imgs.push(i));
    imgs.forEach(img=>{
      const mobile=matchMedia('(max-width:760px)').matches;
      const key=`${img.dataset.masterKey}-${mobile?'mobile':'desktop'}`;
      const url=ASSETS[key];
      if(url&&img.getAttribute('src')!==url)img.setAttribute('src',url);
    });
  }
  const app=document.getElementById('app');
  if(app){
    new MutationObserver(mutations=>{
      mutations.forEach(m=>{
        if(m.type==='attributes'&&m.target?.matches?.('img.master-art[data-master-key]'))apply(m.target);
        m.addedNodes?.forEach(n=>{if(n.nodeType===1)apply(n)});
      });
    }).observe(app,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>apply());else apply();
  matchMedia('(max-width:760px)').addEventListener?.('change',()=>apply());
})();
