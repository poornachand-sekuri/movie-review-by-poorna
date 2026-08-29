(()=>{
  const HOST='https://assets.moviereviewbypoorna.com';
  const ASSETS={
    'home-desktop':[
      `${HOST}/master/final_home_desktop.avif?v=5`,
      `${HOST}/final_home_desktop.avif?v=5`,
      `${HOST}/master/home-desktop.avif?v=5`
    ],
    'home-mobile':[
      `${HOST}/master/final_home_mobile.avif?v=5`,
      `${HOST}/final_home_mobile.avif?v=5`,
      `${HOST}/master/home-mobile.avif?v=5`
    ],
    'content-desktop':[
      `${HOST}/master/final_content_desktop.avif?v=5`,
      `${HOST}/final_content_desktop.avif?v=5`,
      `${HOST}/master/content-desktop.avif?v=5`
    ],
    'content-mobile':[
      `${HOST}/master/final_content_mobile_blank_clapboard.avif?v=5`,
      `${HOST}/final_content_mobile_blank_clapboard.avif?v=5`,
      `${HOST}/master/content-mobile.avif?v=5`
    ]
  };

  function keyFor(img){
    const mobile=matchMedia('(max-width:760px)').matches;
    return `${img.dataset.masterKey}-${mobile?'mobile':'desktop'}`;
  }

  function loadCandidate(img,index=0){
    const key=keyFor(img), list=ASSETS[key]||[];
    if(!list.length)return;
    const safeIndex=Math.min(index,list.length-1);
    img.dataset.assetKey=key;
    img.dataset.assetIndex=String(safeIndex);
    const url=list[safeIndex];
    if(img.getAttribute('src')!==url)img.setAttribute('src',url);
  }

  function prepare(img){
    if(!img||!img.matches?.('img.master-art[data-master-key]'))return;
    const currentKey=keyFor(img);
    if(img.dataset.assetKey!==currentKey)loadCandidate(img,0);
    if(img.dataset.assetRefreshBound==='1')return;
    img.dataset.assetRefreshBound='1';
    img.addEventListener('error',()=>{
      const key=keyFor(img), list=ASSETS[key]||[];
      const current=Number(img.dataset.assetIndex||0);
      if(current<list.length-1)loadCandidate(img,current+1);
      else console.error('Master artwork failed to load',key,list);
    });
  }

  function apply(root=document){
    if(root?.matches?.('img.master-art[data-master-key]'))prepare(root);
    root?.querySelectorAll?.('img.master-art[data-master-key]').forEach(prepare);
  }

  const app=document.getElementById('app');
  if(app){
    new MutationObserver(mutations=>{
      mutations.forEach(m=>{
        if(m.type==='attributes'&&m.target?.matches?.('img.master-art[data-master-key]')){
          const img=m.target, key=keyFor(img), list=ASSETS[key]||[];
          if(list.length&&!list.includes(img.getAttribute('src')))loadCandidate(img,Number(img.dataset.assetIndex||0));
          prepare(img);
        }
        m.addedNodes?.forEach(n=>{if(n.nodeType===1)apply(n)});
      });
    }).observe(app,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>apply());else apply();
  matchMedia('(max-width:760px)').addEventListener?.('change',()=>apply());
})();
