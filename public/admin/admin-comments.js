(()=>{
  const $=s=>document.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const fmt=s=>{const d=new Date(s);return isNaN(d)?'':d.toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})};
  let panel, list, countBadge, search, status='pending', counts={};

  async function api(path,opts={}){const res=await fetch(path,{credentials:'same-origin',...opts,headers:{...(opts.body?{'content-type':'application/json'}:{}),...(opts.headers||{})}});let data={};try{data=await res.json()}catch{}if(!res.ok)throw new Error(data.error||`Request failed (${res.status})`);return data}

  function ensure(){
    if(panel)return;
    const top=$('.top-actions');if(!top)return;
    const btn=document.createElement('button');btn.className='ghost admin-comments-open';btn.innerHTML='COMMENTS <span data-comment-pending-badge></span>';btn.addEventListener('click',openPanel);top.prepend(btn);
    document.body.insertAdjacentHTML('beforeend',`<section class="admin-comments-panel hidden" data-admin-comments-panel>
      <div class="admin-comments-bar"><div><span class="eyebrow">MODERATION</span><h2>Audience Comments</h2></div><button class="ghost" data-comments-close>CLOSE</button></div>
      <div class="admin-comments-tools"><div class="comment-tabs"><button data-comment-status="pending" class="active">Pending <b data-count-pending>0</b></button><button data-comment-status="published">Published <b data-count-published>0</b></button><button data-comment-status="rejected">Rejected <b data-count-rejected>0</b></button><button data-comment-status="all">All <b data-count-all>0</b></button></div><input type="search" data-comment-search placeholder="Search comments, names, email or page…"></div>
      <div class="admin-comments-list" data-admin-comments-list></div>
    </section>`);
    panel=$('[data-admin-comments-panel]');list=$('[data-admin-comments-list]');search=$('[data-comment-search]');countBadge=$('[data-comment-pending-badge]');
    $('[data-comments-close]').addEventListener('click',()=>panel.classList.add('hidden'));
    panel.querySelector('.comment-tabs').addEventListener('click',e=>{const b=e.target.closest('[data-comment-status]');if(!b)return;status=b.dataset.commentStatus;panel.querySelectorAll('[data-comment-status]').forEach(x=>x.classList.toggle('active',x===b));load()});
    search.addEventListener('input',()=>{clearTimeout(search._t);search._t=setTimeout(load,250)});
    list.addEventListener('click',handleAction);
    refreshBadge();
  }

  async function refreshBadge(){try{const data=await api('/api/admin/comments?status=all');counts=data.counts||{};renderCounts()}catch{}}
  function renderCounts(){['pending','published','rejected','all'].forEach(k=>{const n=panel?.querySelector(`[data-count-${k}]`);if(n)n.textContent=counts[k]||0});if(countBadge){const n=counts.pending||0;countBadge.textContent=n?`(${n})`:'';countBadge.classList.toggle('hot',n>0)}}
  async function openPanel(){panel.classList.remove('hidden');await load()}
  async function load(){list.innerHTML='<div class="comment-admin-empty">Loading comments…</div>';const qs=new URLSearchParams({status});if(search.value.trim())qs.set('q',search.value.trim());try{const data=await api(`/api/admin/comments?${qs}`);counts=data.counts||counts;renderCounts();render(data.comments||[])}catch(err){list.innerHTML=`<div class="comment-admin-empty error">${esc(err.message)}</div>`}}
  function render(items){list.innerHTML=items.length?items.map(c=>`<article class="admin-comment-card" data-comment-id="${esc(c.id)}"><div class="admin-comment-top"><div><span class="comment-target">${c.scope==='home'?'HOME PAGE':`REVIEW · ${esc(c.slug)}`}</span><h3>${esc(c.name)}</h3><p>${c.email?esc(c.email):'<em>No email supplied</em>'}</p></div><span class="comment-status-pill ${esc(c.status)}">${esc(c.status)}</span></div><blockquote>${esc(c.comment)}</blockquote><div class="admin-comment-foot"><time>${esc(fmt(c.created_at))}</time><div class="comment-actions">${c.status!=='published'?'<button data-action="published" class="publish">PUBLISH</button>':''}${c.status!=='rejected'?'<button data-action="rejected" class="reject">REJECT</button>':''}${c.status!=='pending'?'<button data-action="pending" class="ghosty">MOVE TO PENDING</button>':''}<button data-action="delete" class="delete">DELETE</button></div></div></article>`).join(''):'<div class="comment-admin-empty">No comments in this queue.</div>'}
  async function handleAction(e){const btn=e.target.closest('[data-action]');if(!btn)return;const card=btn.closest('[data-comment-id]');const id=card.dataset.commentId;const action=btn.dataset.action;if(action==='delete'&&!confirm('Delete this comment permanently?'))return;btn.disabled=true;try{if(action==='delete')await api(`/api/admin/comments/${encodeURIComponent(id)}`,{method:'DELETE'});else await api(`/api/admin/comments/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({status:action})});await load();await refreshBadge()}catch(err){alert(err.message)}finally{btn.disabled=false}}

  const obs=new MutationObserver(ensure);obs.observe(document.body,{childList:true,subtree:true});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensure);else ensure();
})();
