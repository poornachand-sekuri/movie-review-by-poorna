(()=>{
  const HOST='https://assets.moviereviewbypoorna.com';
  const VERSION='7';
  const names={
    'home-desktop':'home-desktop.avif',
    'home-mobile':'home-mobile.avif',
    'content-desktop':'content-desktop.avif',
    'content-mobile':'content-mobile.avif'
  };
  function candidates(key){
    const name=names[key];
    if(!name)return[];
    return [
      `${HOST}/assets/master/${name}?v=${VERSION}`,
      `${HOST}/master/${name}?v=${VERSION}`,
      `/assets/master/${name}?v=${VERSION}`
    ];
  }
  function keyFor(img){
    const mobile=matchMedia('(max-width:760px)').matches;
    return `${img.dataset.masterKey}-${mobile?'mobile':'desktop'}`;
  }
  function setCandidate(img,index){
    const key=keyFor(img),list=candidates(key);
    if(!list.length)return;
    const i=Math.min(Math.max(index,0),list.length-1);
    img.dataset.masterAssetKey=key;
    img.dataset.masterAssetIndex=String(i);
    const url=list[i];
    if(img.getAttribute('src')!==url)img.setAttribute('src',url);
  }
  function prepare(img){
    if(!img||!img.matches?.('img.master-art[data-master-key]'))return;
    const key=keyFor(img);
    if(img.dataset.masterAssetKey!==key)setCandidate(img,0);
    if(img.dataset.masterAssetBound==='1')return;
    img.dataset.masterAssetBound='1';
    img.addEventListener('error',()=>{
      const list=candidates(keyFor(img));
      const current=Number(img.dataset.masterAssetIndex||0);
      if(current<list.length-1)setCandidate(img,current+1);
      else console.error('All master artwork URLs failed',keyFor(img),list);
    });
  }
  function apply(root=document){
    if(root?.matches?.('img.master-art[data-master-key]'))prepare(root);
    root?.querySelectorAll?.('img.master-art[data-master-key]').forEach(prepare);
  }
  const app=document.getElementById('app');
  if(app)new MutationObserver(mutations=>mutations.forEach(m=>{
    if(m.type==='attributes'&&m.target?.matches?.('img.master-art[data-master-key]')){
      const img=m.target,key=keyFor(img),list=candidates(key);
      if(list.length&&!list.includes(img.getAttribute('src')))setCandidate(img,Number(img.dataset.masterAssetIndex||0));
      prepare(img);
    }
    m.addedNodes?.forEach(n=>{if(n.nodeType===1)apply(n)});
  })).observe(app,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>apply());else apply();
  matchMedia('(max-width:760px)').addEventListener?.('change',()=>apply());
})();
