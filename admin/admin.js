(()=>{
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const state={panel:'dashboard',analytics:null,comments:[],commentStatus:'pending',reviews:[],current:null,isNew:false,slugTouched:false,posterFile:null,galleryFiles:[],gallery:[],reactionsSynced:false};
  const el={
    login:$('#loginView'),admin:$('#adminView'),loginForm:$('#loginForm'),loginPassword:$('#loginPassword'),loginError:$('#loginError'),logout:$('#logoutBtn'),toast:$('#toast'),
    dashboard:$('#dashboardPanel'),commentsPanel:$('#commentsPanel'),reviewsPanel:$('#reviewsPanel'),days:$('#analyticsDays'),refreshAnalytics:$('#refreshAnalytics'),syncReactions:$('#syncReactions'),reactionSyncStatus:$('#reactionSyncStatus'),
    metricViews:$('#metricViews'),metricVisitors:$('#metricVisitors'),metricReviews:$('#metricReviews'),metricPending:$('#metricPending'),metricLikes:$('#metricLikes'),metricDislikes:$('#metricDislikes'),analyticsSince:$('#analyticsSince'),trafficBreakdown:$('#trafficBreakdown'),dailyViews:$('#dailyViews'),topPagesBody:$('#topPagesBody'),reactionBody:$('#reactionBody'),pendingNavBadge:$('#pendingNavBadge'),
    commentTabs:$('#commentTabs'),commentTarget:$('#commentTarget'),commentSearch:$('#commentSearch'),commentList:$('#commentList'),refreshComments:$('#refreshComments'),
    list:$('#reviewList'),count:$('#reviewCount'),search:$('#reviewSearch'),form:$('#reviewForm'),empty:$('#emptyState'),newBtn:$('#newReviewBtn'),title:$('#title'),slug:$('#slug'),publishDate:$('#publishDate'),releaseDate:$('#releaseDate'),language:$('#language'),rating:$('#rating'),posterUrl:$('#posterUrl'),posterFile:$('#posterFile'),posterPreview:$('#posterPreview'),clearPoster:$('#clearPosterBtn'),deletePosterR2:$('#deletePosterR2Btn'),verdict:$('#verdict'),excerpt:$('#excerpt'),reviewEditor:$('#reviewEditor'),actors:$('#actors'),actresses:$('#actresses'),directors:$('#directors'),musicDirectors:$('#musicDirectors'),galleryFiles:$('#galleryFiles'),galleryGrid:$('#galleryGrid'),sourceBadge:$('#sourceBadge'),reviewIdText:$('#reviewIdText'),editorTitle:$('#editorTitle'),preview:$('#previewLink'),deleteBtn:$('#deleteBtn'),mobileDelete:$('#mobileDeleteBtn'),confirm:$('#confirmDialog'),confirmTitle:$('#confirmTitle'),confirmText:$('#confirmText')
  };

  const slugify=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,100);
  const fmtDateTime=s=>{const d=new Date(s);return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(d)};
  const num=n=>new Intl.NumberFormat('en-IN').format(Number(n)||0);
  const listNames=value=>String(value||'').split(/[,\n]/).map(v=>v.trim()).filter(Boolean);

  async function api(path,opts={}){
    const headers={...(opts.headers||{})};
    if(opts.body && !(opts.body instanceof FormData) && !headers['content-type']) headers['content-type']='application/json';
    const res=await fetch(path,{credentials:'same-origin',...opts,headers});
    let data={};try{data=await res.json()}catch{}
    if(!res.ok){const err=new Error(data.error||`Request failed (${res.status})`);err.status=res.status;throw err}
    return data;
  }
  function toast(message,error=false){el.toast.textContent=message;el.toast.className='toast show'+(error?' error':'');clearTimeout(toast.t);toast.t=setTimeout(()=>el.toast.className='toast',3600)}

  async function boot(){try{await api('/api/admin/session');showAdmin()}catch{showLogin()}}
  function showLogin(){el.login.classList.remove('hidden');el.admin.classList.add('hidden');setTimeout(()=>el.loginPassword.focus(),50)}
  function showAdmin(){el.login.classList.add('hidden');el.admin.classList.remove('hidden');setPanel('dashboard')}
  el.loginForm.addEventListener('submit',async event=>{event.preventDefault();el.loginError.textContent='';try{await api('/api/admin/login',{method:'POST',body:JSON.stringify({password:el.loginPassword.value})});el.loginPassword.value='';showAdmin()}catch(err){el.loginError.textContent=err.message}});
  el.logout.addEventListener('click',async()=>{try{await api('/api/admin/logout',{method:'POST',body:'{}'})}catch{}showLogin()});

  $$('.nav-tab').forEach(button=>button.addEventListener('click',()=>setPanel(button.dataset.panel)));
  async function setPanel(panel){
    state.panel=panel;
    $$('.nav-tab').forEach(button=>button.classList.toggle('active',button.dataset.panel===panel));
    el.dashboard.classList.toggle('hidden',panel!=='dashboard');
    el.commentsPanel.classList.toggle('hidden',panel!=='comments');
    el.reviewsPanel.classList.toggle('hidden',panel!=='reviews');
    el.admin.classList.remove('editing');
    if(panel==='dashboard') await loadAnalytics({sync:!state.reactionsSynced});
    if(panel==='comments') await loadComments();
    if(panel==='reviews'&&!state.reviews.length) await loadReviews();
  }

  async function syncAllReactions(){
    el.syncReactions.disabled=true;let cursor=0,total=0,synced=0;
    el.reactionSyncStatus.textContent='Reading live reaction stores…';
    try{
      while(true){
        const data=await api(`/api/admin/reactions/sync?cursor=${cursor}&limit=20`,{method:'POST',body:'{}'});
        cursor=data.nextCursor;synced+=data.synced;total=data.total;
        el.reactionSyncStatus.textContent=`Synced ${synced} of ${total} review reaction counts…`;
        if(data.done)break;
      }
      state.reactionsSynced=true;
      el.reactionSyncStatus.textContent=`Live reaction totals synchronized across ${total} reviews.`;
    }catch(err){el.reactionSyncStatus.textContent=err.message;toast(err.message,true)}finally{el.syncReactions.disabled=false}
  }

  async function loadAnalytics({sync=false}={}){
    el.refreshAnalytics.disabled=true;
    try{
      if(sync) await syncAllReactions();
      const data=await api(`/api/admin/analytics?days=${encodeURIComponent(el.days.value)}`);
      state.analytics=data;renderAnalytics(data);updateCommentBadges(data.commentCounts||{});
    }catch(err){toast(err.message,true)}finally{el.refreshAnalytics.disabled=false}
  }
  el.refreshAnalytics.addEventListener('click',()=>loadAnalytics());
  el.days.addEventListener('change',()=>loadAnalytics());
  el.syncReactions.addEventListener('click',async()=>{await syncAllReactions();await loadAnalytics()});

  function renderAnalytics(data){
    el.metricViews.textContent=num(data.views);el.metricVisitors.textContent=num(data.uniqueVisitors);el.metricReviews.textContent=num(data.reviewCount);el.metricPending.textContent=num(data.commentCounts?.pending);el.metricLikes.textContent=num(data.reactionTotals?.like);el.metricDislikes.textContent=num(data.reactionTotals?.dislike);el.analyticsSince.textContent=`Since ${data.since||'—'}`;
    const byType=data.byType||[];const maxType=Math.max(1,...byType.map(x=>Number(x.views)||0));const labels={'home':'Home','review':'Content','cine-cafe':'Cine Café','search':'Search','other':'Other'};
    el.trafficBreakdown.innerHTML=byType.length?byType.map(item=>`<div class="traffic-row"><span>${esc(labels[item.pageType]||item.pageType)}</span><div class="traffic-track"><div class="traffic-fill" style="width:${Math.max(2,Math.round((Number(item.views)||0)/maxType*100))}%"></div></div><strong>${num(item.views)}</strong></div>`).join(''):'<div class="comment-admin-empty">Traffic tracking starts after this Admin release goes live.</div>';
    const daily=data.daily||[];const maxDaily=Math.max(1,...daily.map(x=>Number(x.views)||0));el.dailyViews.innerHTML=daily.length?daily.map(item=>`<div class="daily-bar-wrap" data-tip="${esc(item.day)} · ${num(item.views)} views"><div class="daily-bar" style="height:${Math.max(2,Math.round((Number(item.views)||0)/maxDaily*100))}%"></div></div>`).join(''):'<div class="comment-admin-empty">No daily traffic yet.</div>';
    el.topPagesBody.innerHTML=(data.topPages||[]).map(item=>`<tr><td>${esc(item.title||item.pageKey)}</td><td><span class="page-type-pill ${esc(item.pageType)}">${esc(labels[item.pageType]||item.pageType)}</span></td><td class="number-cell">${num(item.views)}</td><td class="number-cell">${num(item.visitors)}</td></tr>`).join('')||'<tr><td colspan="4">No traffic data yet.</td></tr>';
    el.reactionBody.innerHTML=(data.reactions||[]).map(item=>`<tr><td>${esc(item.title||item.slug)}</td><td class="number-cell">${num(item.like)}</td><td class="number-cell">${num(item.dislike)}</td><td class="number-cell">${num((Number(item.like)||0)+(Number(item.dislike)||0))}</td></tr>`).join('')||'<tr><td colspan="4">No reaction data yet.</td></tr>';
  }

  function updateCommentBadges(counts){
    $$('[data-count]').forEach(node=>node.textContent=num(counts[node.dataset.count]||0));
    const pending=Number(counts.pending)||0;el.pendingNavBadge.textContent=pending?`(${pending})`:'';
  }
  el.commentTabs.addEventListener('click',event=>{const button=event.target.closest('[data-status]');if(!button)return;state.commentStatus=button.dataset.status;$$('[data-status]',el.commentTabs).forEach(x=>x.classList.toggle('active',x===button));loadComments()});
  el.commentTarget.addEventListener('change',loadComments);el.refreshComments.addEventListener('click',loadComments);el.commentSearch.addEventListener('input',renderComments);
  async function loadComments(){
    el.commentList.innerHTML='<div class="comment-admin-empty">Loading comments…</div>';
    const params=new URLSearchParams({status:state.commentStatus,limit:'200'});if(el.commentTarget.value)params.set('target',el.commentTarget.value);
    try{const data=await api(`/api/admin/comments?${params}`);state.comments=data.comments||[];updateCommentBadges(data.counts||{});renderComments()}catch(err){el.commentList.innerHTML=`<div class="comment-admin-empty">${esc(err.message)}</div>`}
  }
  function renderComments(){
    const q=el.commentSearch.value.trim().toLowerCase();const items=state.comments.filter(c=>!q||`${c.name} ${c.email} ${c.comment} ${c.target_type} ${c.target_id}`.toLowerCase().includes(q));
    el.commentList.innerHTML=items.length?items.map(c=>`<article class="admin-comment-card" data-comment-id="${esc(c.id)}"><div class="admin-comment-top"><div><span class="comment-target">${c.target_type==='home'?'HOME PAGE':`REVIEW · ${esc(c.target_id)}`}</span><h3>${esc(c.name)}</h3><p>${esc(c.email)}</p></div><span class="comment-status-pill ${esc(c.status)}">${esc(c.status)}</span></div><blockquote>${esc(c.comment)}</blockquote><div class="admin-comment-foot"><time>${esc(fmtDateTime(c.created_at))}</time><div class="comment-actions">${c.status!=='approved'&&c.status!=='deleted'?'<button data-comment-action="approve" class="approve">APPROVE</button>':''}${c.status!=='rejected'&&c.status!=='deleted'?'<button data-comment-action="reject" class="reject">REJECT</button>':''}${c.status==='approved'?'<button data-comment-action="delete" class="delete">DELETE APPROVED</button>':c.status!=='deleted'?'<button data-comment-action="delete" class="delete">DELETE</button>':''}</div></div></article>`).join(''):'<div class="comment-admin-empty">No comments in this queue.</div>';
  }
  el.commentList.addEventListener('click',async event=>{const button=event.target.closest('[data-comment-action]');if(!button)return;const card=button.closest('[data-comment-id]');const action=button.dataset.commentAction;if(action==='delete'&&!await confirmAction('Delete this comment?','The comment will no longer be visible publicly.'))return;button.disabled=true;try{await api(`/api/admin/comments/${encodeURIComponent(card.dataset.commentId)}`,{method:'POST',body:JSON.stringify({action})});toast(action==='approve'?'Comment approved.':action==='reject'?'Comment rejected.':'Comment deleted.');await loadComments();if(state.panel==='dashboard')await loadAnalytics()}catch(err){toast(err.message,true)}finally{button.disabled=false}});

  async function loadReviews(){const data=await api('/api/admin/reviews');state.reviews=data;renderReviewList();el.count.textContent=`${data.length} review${data.length===1?'':'s'}`}
  function renderReviewList(){const q=el.search.value.trim().toLowerCase();const items=state.reviews.filter(r=>!q||(`${r.t} ${r.l||''} ${(r.d||'').slice(0,4)}`).toLowerCase().includes(q));el.list.innerHTML=items.map(r=>`<button class="review-item ${state.current&&Number(state.current.i)===Number(r.i)?'active':''}" data-id="${r.i}"><div class="review-thumb">${r.m?`<img src="${esc(r.m)}" alt="">`:''}</div><div><h4>${esc(r.t)}</h4><p>${esc(r.l||'')} · ${esc((r.d||'').slice(0,4))}</p></div><span class="source-dot ${r.managed?'managed':''}" title="${r.managed?'Admin managed':'Base catalog'}"></span></button>`).join('')||'<div class="comment-admin-empty">No matching reviews.</div>'}
  el.search.addEventListener('input',renderReviewList);el.list.addEventListener('click',event=>{const button=event.target.closest('[data-id]');if(button)openReview(Number(button.dataset.id))});el.newBtn.addEventListener('click',newReview);$$('[data-new-review]').forEach(button=>button.addEventListener('click',newReview));

  async function openReview(id){try{const review=await api(`/api/admin/reviews/${id}`);state.current=review;state.isNew=false;state.slugTouched=true;state.posterFile=null;state.galleryFiles=[];state.gallery=[...(review.gallery||[])];fillForm(review);showEditor();renderReviewList()}catch(err){toast(err.message,true)}}
  function newReview(){state.current=null;state.isNew=true;state.slugTouched=false;state.posterFile=null;state.galleryFiles=[];state.gallery=[];el.form.reset();el.reviewEditor.innerHTML='';el.rating.value='';el.publishDate.value=new Date().toISOString().slice(0,10);el.language.value='Telugu';el.sourceBadge.textContent='NEW';el.sourceBadge.className='badge';el.reviewIdText.textContent='';el.editorTitle.textContent='New Review';el.preview.classList.add('disabled');el.preview.href='#';el.deleteBtn.classList.add('hidden');el.mobileDelete.classList.add('hidden');updateStars();renderPoster();renderGallery();updateCounts();showEditor();renderReviewList();setTimeout(()=>el.title.focus(),50)}
  function fillForm(r){el.title.value=r.t||'';el.slug.value=r.s||'';el.publishDate.value=r.d||'';el.releaseDate.value=r.rd||'';el.language.value=r.l||'';el.rating.value=r.r==null?'':String(r.r);el.posterUrl.value=r.m||'';el.verdict.value=r.v||'';el.excerpt.value=r.e||'';el.reviewEditor.innerHTML=r.body||'';el.actors.value=(r.cast_crew?.actors||[]).join(', ');el.actresses.value=(r.cast_crew?.actresses||[]).join(', ');el.directors.value=(r.cast_crew?.directors||[]).join(', ');el.musicDirectors.value=(r.cast_crew?.music_directors||[]).join(', ');el.sourceBadge.textContent=r.managed?'MANAGED':'BASE';el.sourceBadge.className='badge'+(r.managed?' managed':'');el.reviewIdText.textContent=`ID ${r.i}`;el.editorTitle.textContent=r.t||'Edit Review';el.preview.href=`/?review=${encodeURIComponent(r.s)}`;el.preview.classList.remove('disabled');el.deleteBtn.classList.remove('hidden');el.mobileDelete.classList.remove('hidden');updateStars();renderPoster();renderGallery();updateCounts()}
  function showEditor(){el.empty.classList.add('hidden');el.form.classList.remove('hidden');el.admin.classList.add('editing');window.scrollTo(0,0)}
  document.addEventListener('click',event=>{if(innerWidth<=820&&event.target.closest('.editor-head')&&event.clientX<55){el.admin.classList.remove('editing');el.form.classList.add('hidden');el.empty.classList.remove('hidden')}});

  el.title.addEventListener('input',()=>{if(!state.slugTouched)el.slug.value=slugify(el.title.value);el.editorTitle.textContent=el.title.value||'New Review'});el.slug.addEventListener('input',()=>{state.slugTouched=true;el.slug.value=slugify(el.slug.value)});el.posterUrl.addEventListener('input',renderPoster);el.posterFile.addEventListener('change',()=>{state.posterFile=el.posterFile.files?.[0]||null;renderPoster()});
  function renderPoster(){if(state.posterFile){el.posterPreview.innerHTML=`<img src="${URL.createObjectURL(state.posterFile)}" alt="Poster preview">`}else if(el.posterUrl.value){el.posterPreview.innerHTML=`<img src="${esc(el.posterUrl.value)}" alt="Poster preview">`}else el.posterPreview.innerHTML='<span>NO POSTER</span>';el.deletePosterR2.disabled=!isOwnedR2Url(el.posterUrl.value)}
  function isOwnedR2Url(url){return String(url||'').startsWith('https://assets.moviereviewbypoorna.com/reviews/')}
  el.clearPoster.addEventListener('click',()=>{state.posterFile=null;el.posterFile.value='';el.posterUrl.value='';renderPoster()});
  el.deletePosterR2.addEventListener('click',async()=>{const url=el.posterUrl.value.trim();if(!isOwnedR2Url(url))return toast('This poster is not an R2 review image.',true);if(!await confirmAction('Delete this R2 image?','This permanently removes the image object. Save the review afterward to keep the poster field empty.'))return;try{await deleteMedia(url);el.posterUrl.value='';state.posterFile=null;renderPoster();toast('R2 poster deleted. Save the review to publish the change.')}catch(err){toast(err.message,true)}});

  $$('#starPicker [data-rating]').forEach(button=>button.addEventListener('click',()=>{el.rating.value=button.dataset.rating;updateStars()}));function updateStars(){const n=Number(el.rating.value)||0;$$('#starPicker button[data-rating]').forEach(button=>{if(!button.classList.contains('clear-rating')){const x=Number(button.dataset.rating);button.textContent=x<=n?'★':'☆';button.classList.toggle('active',x<=n)}})}
  el.verdict.addEventListener('input',updateCounts);el.excerpt.addEventListener('input',updateCounts);function updateCounts(){$('#verdictCount').textContent=el.verdict.value.length;$('#excerptCount').textContent=el.excerpt.value.length}
  $$('.editor-toolbar [data-cmd]').forEach(button=>button.addEventListener('click',()=>{el.reviewEditor.focus();document.execCommand(button.dataset.cmd,false,button.dataset.value||null)}));$('#linkBtn').addEventListener('click',()=>{const url=prompt('Link URL');if(url){el.reviewEditor.focus();document.execCommand('createLink',false,url)}});

  el.galleryFiles.addEventListener('change',()=>{state.galleryFiles=[...el.galleryFiles.files];$('#pendingGalleryText').textContent=state.galleryFiles.length?`${state.galleryFiles.length} image${state.galleryFiles.length===1?'':'s'} ready to upload on Save`:'';renderGallery()});
  function renderGallery(){const existing=state.gallery.map((url,index)=>`<div class="gallery-item"><img src="${esc(url)}" alt="Review image"><div class="gallery-actions"><button type="button" data-remove-gallery="${index}">REMOVE</button>${isOwnedR2Url(url)?`<button type="button" data-delete-gallery="${index}">DELETE</button>`:''}</div></div>`);const pending=state.galleryFiles.map((file,index)=>`<div class="gallery-item"><img src="${URL.createObjectURL(file)}" alt="Pending upload"><div class="gallery-actions"><button type="button" data-remove-pending="${index}">×</button></div></div>`);el.galleryGrid.innerHTML=[...existing,...pending].join('')}
  el.galleryGrid.addEventListener('click',async event=>{const remove=event.target.closest('[data-remove-gallery]');if(remove){state.gallery.splice(Number(remove.dataset.removeGallery),1);renderGallery();return}const pending=event.target.closest('[data-remove-pending]');if(pending){state.galleryFiles.splice(Number(pending.dataset.removePending),1);renderGallery();return}const del=event.target.closest('[data-delete-gallery]');if(del){const index=Number(del.dataset.deleteGallery);const url=state.gallery[index];if(!await confirmAction('Delete this R2 gallery image?','The object will be permanently removed from movie-review-assets.'))return;try{await deleteMedia(url);state.gallery.splice(index,1);renderGallery();toast('R2 gallery image deleted. Save the review to publish the gallery change.')}catch(err){toast(err.message,true)}}});

  async function upload(file,slug,kind){const fd=new FormData();fd.append('file',file);fd.append('slug',slug);fd.append('kind',kind);return api('/api/admin/media',{method:'POST',body:fd})}
  async function deleteMedia(url){return api('/api/admin/media',{method:'DELETE',body:JSON.stringify({url})})}
  function reviewPayload(poster,gallery){return{t:el.title.value.trim(),s:slugify(el.slug.value||el.title.value),d:el.publishDate.value,l:el.language.value.trim(),m:poster,rd:el.releaseDate.value,r:el.rating.value===''?null:Number(el.rating.value),v:el.verdict.value.trim(),e:el.excerpt.value.trim(),body:el.reviewEditor.innerHTML.trim(),gallery,cast_crew:{actors:listNames(el.actors.value),actresses:listNames(el.actresses.value),directors:listNames(el.directors.value),music_directors:listNames(el.musicDirectors.value)}}}
  el.form.addEventListener('submit',async event=>{event.preventDefault();const submitters=$$('button[type="submit"]',el.form);submitters.forEach(button=>{button.disabled=true;button.dataset.oldText=button.textContent;button.textContent='SAVING…'});try{const slug=slugify(el.slug.value||el.title.value);if(!slug)throw new Error('Please enter a valid title and slug.');let poster=el.posterUrl.value.trim();if(state.posterFile){toast('Uploading poster to R2…');poster=(await upload(state.posterFile,slug,'poster')).url}let gallery=[...state.gallery];if(state.galleryFiles.length){toast(`Uploading ${state.galleryFiles.length} gallery image${state.galleryFiles.length===1?'':'s'}…`);for(const file of state.galleryFiles)gallery.push((await upload(file,slug,'gallery')).url)}const payload=reviewPayload(poster,gallery);let result;if(state.isNew)result=await api('/api/admin/reviews',{method:'POST',body:JSON.stringify(payload)});else result=await api(`/api/admin/reviews/${state.current.i}`,{method:'PUT',body:JSON.stringify(payload)});toast('Review saved and published to the live catalog.');state.posterFile=null;state.galleryFiles=[];state.gallery=gallery;state.isNew=false;state.current=result.review;await loadReviews();await openReview(result.review.i)}catch(err){toast(err.message,true)}finally{submitters.forEach(button=>{button.disabled=false;button.textContent=button.dataset.oldText||'SAVE REVIEW'})}});

  [el.deleteBtn,el.mobileDelete].forEach(button=>button.addEventListener('click',async()=>{if(!state.current)return;if(!await confirmAction('Delete this review?','This removes the review from Home, Content, search and Cine Café. R2 images are retained for safety unless you delete them separately.'))return;try{await api(`/api/admin/reviews/${state.current.i}`,{method:'DELETE'});toast('Review deleted from the live catalog.');state.current=null;state.isNew=false;el.form.classList.add('hidden');el.empty.classList.remove('hidden');el.admin.classList.remove('editing');await loadReviews()}catch(err){toast(err.message,true)}}));

  function confirmAction(title,text){if(el.confirm?.showModal){el.confirmTitle.textContent=title;el.confirmText.textContent=text;el.confirm.showModal();return new Promise(resolve=>el.confirm.addEventListener('close',()=>resolve(el.confirm.returnValue==='confirm'),{once:true}))}return Promise.resolve(confirm(`${title}\n\n${text}`))}

  boot();
})();
