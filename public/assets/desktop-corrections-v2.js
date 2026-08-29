(()=>{
  function normalizeRatings(root=document){
    root.querySelectorAll('.rating-number').forEach(n=>n.remove());
    root.querySelectorAll('.rating-pending').forEach(n=>{
      n.className='rating-stars';
      n.textContent='☆☆☆☆☆';
    });
  }
  function addLink(layer,cls,label){
    if(layer.querySelector('.'+cls))return;
    const a=document.createElement('a');
    a.className=`master-hot view-all-link ${cls}`;
    a.href='/reviews/';
    a.setAttribute('aria-label',label);
    const s=document.createElement('span');
    s.className='sr-only';
    s.textContent=label;
    a.appendChild(s);
    layer.appendChild(a);
  }
  function apply(){
    const page=document.querySelector('.master-page');
    if(!page)return;
    normalizeRatings(page);
    const layer=page.querySelector('.master-layer');
    if(layer){
      if(page.classList.contains('home-master')){
        addLink(layer,'view-all-recent','View all recent reviews');
        addLink(layer,'view-all-previous','View all previously reviewed movies');
      }
      if(page.classList.contains('content-master')){
        addLink(layer,'view-all-related','View all reviews');
      }
    }
    const body=page.querySelector('.content-review-body');
    if(body){
      body.classList.add('interactive');
      body.tabIndex=0;
      body.setAttribute('aria-label','Movie review text. Scroll for more.');
    }
    if(page.classList.contains('content-master')&&matchMedia('(min-width:761px)').matches){
      const art=page.querySelector('.master-art[data-master-key="content"]');
      const v3='https://assets.moviereviewbypoorna.com/master/content-desktop.avif?v=3';
      if(art&&art.src!==v3)art.src=v3;
    }
  }
  const app=document.getElementById('app');
  if(app)new MutationObserver(apply).observe(app,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply);else apply();
  setTimeout(apply,0);
})();
