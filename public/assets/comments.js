(()=>{
  const PATH=decodeURIComponent(location.pathname).replace(/\/+$/,'/')||'/';
  const reviewMatch=PATH.match(/^\/reviews\/([^/]+)\/$/);
  const target=PATH==='/'?{scope:'home',slug:''}:reviewMatch?{scope:'review',slug:reviewMatch[1]}:null;
  if(!target)return;

  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const fmtDate=s=>{const d=new Date(s);return isNaN(d)?'':d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})};
  let mounted=false;

  function markup(){
    const sub=target.scope==='home'?'Share a thought about Movie Reviews by Poorna.':'Share your thoughts on this movie review.';
    return `<section class="comments-section" data-comments-root>
      <div class="comments-shell">
        <div class="comments-head"><div><span class="comments-kicker">★ AUDIENCE VOICES</span><h2>Audience Comments</h2><p>${sub}</p></div><span class="comments-count" data-comments-count>0 Published</span></div>
        <div class="comments-list" data-comments-list><div class="comments-loading">Loading comments…</div></div>
        <form class="comment-form" data-comment-form>
          <div class="comment-form-head"><h3>Leave a Comment</h3><p>Comments appear only after approval by the site admin.</p></div>
          <div class="comment-grid">
            <label><span>Name *</span><input name="name" maxlength="60" autocomplete="name" required></label>
            <label><span>Email <small>(not published)</small></span><input name="email" maxlength="160" type="email" autocomplete="email"></label>
          </div>
          <label class="comment-wide"><span>Comment *</span><textarea name="comment" maxlength="1200" rows="5" required placeholder="Write your comment…"></textarea></label>
          <label class="comment-hp" aria-hidden="true"><span>Website</span><input name="website" tabindex="-1" autocomplete="off"></label>
          <div class="comment-submit-row"><button type="submit">SUBMIT FOR APPROVAL →</button><span class="comment-status" data-comment-status></span></div>
        </form>
      </div>
    </section>`;
  }

  function mount(){
    if(mounted||document.querySelector('[data-comments-root]'))return;
    const mobile=document.querySelector('.mobile-v2');
    if(mobile){
      const footer=mobile.querySelector('.m2-footer-art');
      if(!footer)return;
      footer.insertAdjacentHTML('beforebegin',markup());
    }else{
      const page=document.querySelector('.master-page');
      if(!page)return;
      page.insertAdjacentHTML('afterend',markup());
    }
    mounted=true;
    wire();
    loadComments();
  }

  async function api(url,opts={}){
    const res=await fetch(url,{...opts,headers:{'content-type':'application/json',...(opts.headers||{})}});
    let data={};try{data=await res.json()}catch{}
    if(!res.ok)throw new Error(data.error||`Request failed (${res.status})`);
    return data;
  }

  async function loadComments(){
    const list=document.querySelector('[data-comments-list]');
    const count=document.querySelector('[data-comments-count]');
    if(!list)return;
    const qs=new URLSearchParams({scope:target.scope});if(target.slug)qs.set('slug',target.slug);
    try{
      const data=await api(`/api/comments?${qs}`);
      const items=Array.isArray(data.comments)?data.comments:[];
      count.textContent=`${items.length} Published`;
      list.innerHTML=items.length?items.map(c=>`<article class="comment-card"><div class="comment-avatar">${esc((c.name||'?').trim().charAt(0).toUpperCase())}</div><div class="comment-copy"><div class="comment-meta"><strong>${esc(c.name)}</strong><time>${esc(fmtDate(c.created_at))}</time></div><p>${esc(c.comment)}</p></div></article>`).join(''):'<div class="comments-empty">No published comments yet. Be the first to join the conversation.</div>';
    }catch{
      count.textContent='Comments';
      list.innerHTML='<div class="comments-empty">Comments are temporarily unavailable.</div>';
    }
  }

  function wire(){
    const form=document.querySelector('[data-comment-form]');
    const status=document.querySelector('[data-comment-status]');
    if(!form)return;
    form.addEventListener('submit',async e=>{
      e.preventDefault();
      const btn=form.querySelector('button[type="submit"]');
      const fd=new FormData(form);
      btn.disabled=true;btn.textContent='SUBMITTING…';status.textContent='';status.className='comment-status';
      try{
        await api('/api/comments',{method:'POST',body:JSON.stringify({scope:target.scope,slug:target.slug,name:fd.get('name'),email:fd.get('email'),comment:fd.get('comment'),website:fd.get('website')})});
        form.reset();status.textContent='Thanks — your comment is awaiting admin approval.';status.className='comment-status success';
      }catch(err){status.textContent=err.message;status.className='comment-status error'}
      finally{btn.disabled=false;btn.textContent='SUBMIT FOR APPROVAL →'}
    });
  }

  const obs=new MutationObserver(mount);obs.observe(document.getElementById('app')||document.body,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
  setTimeout(mount,0);
})();
