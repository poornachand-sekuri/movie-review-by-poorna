(()=>{
  const mq=matchMedia('(max-width:760px)');
  let loading=false;
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function stars(r){
    const n=Number(r);
    if(!Number.isFinite(n))return '<span class="rating-stars">☆☆☆☆☆</span>';
    const full=Math.max(0,Math.min(5,Math.round(n)));
    return `<span class="rating-stars">${'★'.repeat(full)}${'☆'.repeat(5-full)}</span>`;
  }
  function media(q){
    const m=q?.m||'';
    return m?(m.startsWith('http')?m:'https://moviereviewbypoorna.wordpress.com'+m):'';
  }
  async function ensureFifthRelated(){
    if(!mq.matches||loading)return;
    const grid=document.querySelector('.content-master .content-related-grid');
    if(!grid||grid.children.length>=5)return;
    loading=true;
    try{
      const raw=await fetch('/data/index.json').then(r=>r.json());
      const match=decodeURIComponent(location.pathname).match(/^\/reviews\/([^/]+)\/?$/);
      const slug=match?.[1]||'';
      const ix=raw.findIndex(q=>q.s===slug);
      if(ix<0)return;
      const used=new Set([...grid.querySelectorAll('a[href]')].map(a=>decodeURIComponent(a.getAttribute('href')||'').match(/^\/reviews\/([^/]+)\/?$/)?.[1]).filter(Boolean));
      const ordered=[...raw.slice(ix+1),...raw.slice(0,ix)];
      const q=ordered.find(item=>item?.s&&!used.has(item.s));
      if(!q)return;
      const a=document.createElement('a');
      a.className='content-related-card';
      a.href=`/reviews/${encodeURIComponent(q.s)}/`;
      const src=media(q);
      a.innerHTML=`<div class="master-poster ${src?'':'noimg'}">${src?`<img src="${esc(src)}" alt="${esc(q.t)} poster">`:''}</div><div class="copy"><div class="title">${esc(q.t)}</div><div class="master-stars">${stars(q.r)}</div></div>`;
      grid.appendChild(a);
    }catch(e){console.error('Fifth related review failed',e)}finally{loading=false}
  }
  const app=document.getElementById('app');
  if(app)new MutationObserver(()=>ensureFifthRelated()).observe(app,{childList:true,subtree:true});
  mq.addEventListener?.('change',()=>ensureFifthRelated());
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>ensureFifthRelated());else ensureFifthRelated();
  setTimeout(ensureFifthRelated,0);
})();
