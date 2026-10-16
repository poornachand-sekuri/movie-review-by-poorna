(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const inputs = {
    movie: $('socialMovie'), status: $('socialMovieStatus'), title: $('socialTitle'), pov: $('socialPov'),
    titleAuto: $('socialTitleAuto'), titleSize: $('socialTitleSize'), titleSizeOut: $('socialTitleSizeOut'),
    titleFont: $('socialTitleFont'), titleWeight: $('socialTitleWeight'), titleAlign: $('socialTitleAlign'), titleCase: $('socialTitleCase'),
    povAuto: $('socialPovAuto'), povSize: $('socialPovSize'), povSizeOut: $('socialPovSizeOut'),
    povFont: $('socialPovFont'), povWeight: $('socialPovWeight'), povAlign: $('socialPovAlign'), povLine: $('socialPovLine'),
    postFile: $('socialPostFile'), storyFile: $('socialStoryFile'), save: $('socialSaveTemplates'),
    assetsStatus: $('socialAssetsStatus'), canvas: $('socialCanvas'), warnings: $('socialWarnings'),
    dlPost: $('socialDownloadPost'), dlStory: $('socialDownloadStory'),
    editingMode: $('socialEditingMode'), language: $('socialLanguage'), releaseDate: $('socialReleaseDate'), rating: $('socialRating'),
    captionPlatform: $('socialCaptionPlatform'),captionText: $('socialCaptionText'),trackedUrl: $('socialTrackedUrl'),
    copyCaption: $('socialCopyCaption'),copyLink: $('socialCopyLink'),downloadCaptions: $('socialDownloadCaptions'),captionStatus: $('socialCaptionStatus')
  };
  if (!inputs.canvas) return;
  const state = {
    initialized: false, review: null, poster: null, format: 'post',
    masters: { post: null, story: null }, renders: {}, errors: {},
    seq: 0, saved: {}, templateUploads: 0, drafts: { post:null, story:null }, captions:{}
  };
  const REPO_ASSET_ORIGIN = 'https://assets.moviereviewbypoorna.com/';
  const geometry = {
    post: {
      size: [1080,1080],
      poster: [158,215,310,505],
      title: [572,221,423,95],
      pov: [92,807,897,198],
    },
    story: {
      size: [1080,1920],
      poster: [155,330,314,675],
      title: [588,343,400,126],
      pov: [123,1139,837,267],
    }
  };
  function errorMessage(error) { return error instanceof Error ? error.message : String(error); }
  function safeSlug(value) { return String(value || 'movie').replace(/[^a-z0-9-]/gi, '-').slice(0,100); }
  function siteUrl(review) { return 'moviereviewbypoorna.com/review/' + safeSlug(review.s || ''); }
  function apiImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Image unavailable: ' + src.split('?')[0]));
      image.src = src;
    });
  }
  async function jsonApi(url, opts) {
    const res = await fetch(url, Object.assign({ credentials:'same-origin' }, opts || {}));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Request failed: ' + res.status);
    return data;
  }
  async function loadMaster(kind) {
    try { state.masters[kind] = await apiImage('/api/admin/social-master?kind=' + kind + '&v=' + Date.now()); }
    catch { state.masters[kind] = null; }
  }
  async function loadPoster(url) {
    if (!url) return null;
    if (!url.startsWith(REPO_ASSET_ORIGIN)) throw new Error('Poster must use the configured R2 asset domain, not a replacement image.');
    return apiImage('/api/admin/social-poster?url=' + encodeURIComponent(url));
  }
  async function initialize() {
    if (state.initialized) return;
    state.initialized = true;
    inputs.status.textContent = 'Loading saved movie list…';
    try {
      const results = await Promise.all([
        jsonApi('/api/admin/reviews?compact=1'),
        loadMaster('post'), loadMaster('story'),
        document.fonts.ready
      ]);
      for (const review of results[0]) {
        const opt = document.createElement('option');
        opt.value = String(review.i);
        opt.textContent = review.t;
        inputs.movie.appendChild(opt);
      }
      inputs.status.textContent = results[0].length + ' saved reviews available.';
      updateAssetStatus();
      await refreshAll();
    } catch(err) {
      inputs.status.textContent = errorMessage(err);
      state.initialized = false;
    }
  }
  function updateAssetStatus() {
    inputs.assetsStatus.textContent = 'Post: ' + (state.masters.post ? 'loaded' : 'not uploaded') +
      ' · Story: ' + (state.masters.story ? 'loaded' : 'not uploaded') + '.';
  }
  async function chooseMovie() {
    const id = inputs.movie.value;
    const sequence = ++state.seq;
    state.review = null;
    state.poster = null;
    inputs.title.value = ''; inputs.pov.value = ''; state.drafts={ post:null,story:null }; state.captions={};
    if (!id) { updateCaptionEditor(); await refreshAll(); return; }
    inputs.status.textContent = 'Loading selected review and original poster…';
    try {
      const review = await jsonApi('/api/admin/reviews/' + encodeURIComponent(id));
      if (sequence !== state.seq) return;
      state.review = review;
      state.drafts.post=defaultDraft(review);
      state.drafts.story=defaultDraft(review);
      state.format='post'; applyDraft('post');
      state.captions=makeCaptions(review);
      updateCaptionEditor();
      try { const original = await loadPoster(review.m || ''); if (sequence !== state.seq) return; state.poster = original; }
      catch (err) { if (sequence !== state.seq) return; inputs.status.textContent = errorMessage(err); }
      if (sequence !== state.seq) return;
      if (state.poster) inputs.status.textContent = 'Loaded "' + review.t + '" and its original stored poster.';
      await refreshAll();
    } catch (err) {
      if (sequence !== state.seq) return;
      inputs.status.textContent = errorMessage(err);
      await refreshAll();
    }
  }

  const platforms = {
    'instagram-post':'instagram', 'instagram-story':'instagram',
    'facebook-post':'facebook','facebook-story':'facebook',
    'x-post':'x','whatsapp-channel':'whatsapp','whatsapp-status':'whatsapp'
  };
  function trackedUrl(platform) {
    if (!state.review) return '';
    const slug = safeSlug(state.review.s);
    const u = new URL('https://moviereviewbypoorna.com/review/' + slug);
    u.searchParams.set('utm_source', platforms[platform] || 'social');
    u.searchParams.set('utm_medium', platform.endsWith('story') || platform.endsWith('status') ? 'story' : 'social');
    u.searchParams.set('utm_campaign', slug);
    return u.toString();
  }
  function makeCaptions(review) {
    const title=review.t || '';
    const pov=review.v || '';
    const link=(k)=> {
      const slug=safeSlug(review.s);
      const url=new URL('https://moviereviewbypoorna.com/review/'+slug);
      url.searchParams.set('utm_source',platforms[k]);
      url.searchParams.set('utm_medium',k.endsWith('story') || k.endsWith('status') ? 'story' : 'social');
      url.searchParams.set('utm_campaign',slug);
      return url.toString();
    };
    return {
      'instagram-post': title + '\n\n' + pov + '\n\nFull review in the Auditorium. Link also available via Story or profile.\n' + link('instagram-post') + '\n\n#MovieReviewsByPoorna #MovieReview',
      'instagram-story': title + '\n\n' + pov + '\n\nTap the link sticker to read the full review.\n' + link('instagram-story'),
      'facebook-post': 'Now reviewed: ' + title + '\n\n' + pov + '\n\nRead the full review:\n' + link('facebook-post'),
      'facebook-story': title + '\n\n' + pov + '\n\nFull review via link sticker:\n' + link('facebook-story'),
      'x-post': (title + '\n\n' + pov + '\n\nFull review: ' + link('x-post')),
      'whatsapp-channel': '🎬 ' + title + '\n\nMY POV: ' + pov + '\n\nRead the full review:\n' + link('whatsapp-channel'),
      'whatsapp-status': '🎬 ' + title + '\n\n' + pov + '\n\nFull review:\n' + link('whatsapp-status')
    };
  }
  function updateCaptionEditor() {
    const key=inputs.captionPlatform.value;
    inputs.captionText.value=state.captions[key] || '';
    inputs.trackedUrl.value=trackedUrl(key);
    inputs.captionStatus.textContent=state.review?'Edit and copy the caption for '+inputs.captionPlatform.selectedOptions?.[0]?.textContent+'.':'Select a saved review.';
  }
  async function copyText(value,message) {
    if(!value) {inputs.captionStatus.textContent='Nothing to copy yet.';return;}
    try {
      await navigator.clipboard.writeText(value);
      inputs.captionStatus.textContent=message;
    } catch {
      inputs.captionStatus.textContent='Clipboard permission denied. Select and copy the text above.';
    }
  }
  function downloadCaptions() {
    if(!state.review)return;
    const labels={
      'instagram-post':'Instagram Post','instagram-story':'Instagram Story',
      'facebook-post':'Facebook Post','facebook-story':'Facebook Story',
      'x-post':'X Post','whatsapp-channel':'WhatsApp Channel',
      'whatsapp-status':'WhatsApp Status'
    };
    const text=Object.entries(labels).map(([k,label])=>'=== '+label+' ===\n'+(state.captions[k]||'')+'\n').join('\n');
    const blob=new Blob([text],{type:'text/plain;charset=utf-8'});
    const link=document.createElement('a');
    link.href=URL.createObjectURL(blob);
    link.download=safeSlug(state.review.s)+'_social_captions.txt';
    document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  }
  function defaultDraft(review) {
    return {
      title:review.t || '',pov:review.v || '',language:review.l || '',
      releaseDate:review.rd || '', rating:review.r == null?'':String(review.r),
      titleCase:'uppercase',
      titleStyle:{ family:'Oswald', weight:'700', align:'left',size:58,auto:true,line:1.11 },
      povStyle:{ family:'Inter',weight:'600',align:'left',size:42,auto:true,line:1.28 }
    };
  }
  function persistDraft(){
    const draft=state.drafts[state.format];
    if(!draft)return;
    draft.title=inputs.title.value;draft.pov=inputs.pov.value;
    draft.language=inputs.language.value;draft.releaseDate=inputs.releaseDate.value;
    const r=inputs.rating.value;
    if(r!=='' && (!Number.isFinite(Number(r)) || Number(r)<0 || Number(r)>5 || !Number.isInteger(Number(r)*4))) {
      inputs.rating.setCustomValidity('Use a rating from 0 to 5 in 0.25 increments.');
    } else inputs.rating.setCustomValidity('');
    draft.rating=r;
    draft.titleCase=inputs.titleCase.value;
    draft.titleStyle={family:inputs.titleFont.value,weight:inputs.titleWeight.value,
      align:inputs.titleAlign.value,size:Number(inputs.titleSize.value),auto:inputs.titleAuto.checked,line:1.11};
    draft.povStyle={family:inputs.povFont.value,weight:inputs.povWeight.value,align:inputs.povAlign.value,
      size:Number(inputs.povSize.value),auto:inputs.povAuto.checked,line:Number(inputs.povLine.value)};
  }
  function applyDraft(kind){
    const draft=state.drafts[kind];if(!draft)return;
    inputs.title.value=draft.title;inputs.pov.value=draft.pov;
    inputs.language.value=draft.language;inputs.releaseDate.value=draft.releaseDate;
    inputs.rating.value=draft.rating;
    inputs.rating.setCustomValidity('');
    inputs.titleCase.value=draft.titleCase;
    for(const prefix of ['title','pov']){
      const style=draft[prefix+'Style'];
      inputs[prefix+'Font'].value=style.family;
      inputs[prefix+'Weight'].value=style.weight;
      inputs[prefix+'Align'].value=style.align;
      inputs[prefix+'Size'].value=String(style.size);
      inputs[prefix+'Auto'].checked=style.auto;
    }
    inputs.povLine.value=String(draft.povStyle.line);
    inputs.titleSizeOut.textContent=String(draft.titleStyle.size)+'px';
    inputs.povSizeOut.textContent=String(draft.povStyle.size)+'px';
    inputs.editingMode.textContent=kind==='post'?'POST IMAGE':'STORY IMAGE';
    document.querySelectorAll('[data-social-format]').forEach(button=>button.classList.toggle('active',button.dataset.socialFormat===kind));
  }

  function dateShort(text) {
    if (!/^\d{4}-\d\d-\d\d$/.test(String(text || ''))) return 'Not set';
    const parts = text.split('-').map(Number);
    const date = new Date(Date.UTC(parts[0], parts[1]-1, parts[2]));
    return new Intl.DateTimeFormat('en-GB', { day:'2-digit', month:'short', year:'numeric', timeZone:'UTC' }).format(date);
  }
  function setFont(ctx, options, size) {
    ctx.font = options.weight + ' ' + size + 'px "' + options.family + '"';
  }
  function wrapLines(ctx, text, maxWidth) {
    const paragraphs = String(text).replace(/\r\n/g, '\n').split('\n');
    const lines = [];
    for (const paragraph of paragraphs) {
      if (!paragraph.trim()) { lines.push(''); continue; }
      const tokens = paragraph.trim().split(/\s+/u);
      let current = '';
      for (const token of tokens) {
        const merged = current ? current + ' ' + token : token;
        if (ctx.measureText(merged).width <= maxWidth) { current = merged; continue; }
        if (current) { lines.push(current); current = ''; }
        if (ctx.measureText(token).width <= maxWidth) { current = token; continue; }
        let piece = '';
        for (const ch of Array.from(token)) {
          if (piece && ctx.measureText(piece + ch).width > maxWidth) { lines.push(piece); piece = ch; }
          else piece += ch;
        }
        current = piece;
      }
      if (current) lines.push(current);
    }
    return lines;
  }
  function textOptions(prefix,kind) {
    const draft=state.drafts[kind];
    return draft ? draft[prefix+'Style'] : {
      family:'Inter',weight:'600',align:'left',size:42,auto:true,line:1.2
    };
  }
  function drawFitted(ctx, value, box, options, maxLines, minimum) {
    const [x,y,width,height] = box;
    const availableWidth = width - 4;
    let layout = null;
    const lowerBound = options.auto ? minimum : options.size;
    for (let size = options.size; size >= lowerBound; size--) {
      setFont(ctx, options, size);
      const lines = wrapLines(ctx, value, availableWidth);
      const lineH = size * options.line;
      if (lines.length <= maxLines && lines.length * lineH <= height) { layout = {size,lines,lineH}; break; }
    }
    if (!layout) return { ok:false, message:'Text cannot fit without clipping in the approved panel. Lower the preferred font size or edit the promotional copy.' };
    setFont(ctx, options, layout.size);
    ctx.textAlign = options.align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f1f1f1';
    const px = options.align === 'center' ? x + width/2 : x + 2;
    const total = layout.lineH * layout.lines.length;
    const initial = y + Math.max(0, (height-total)/2) + layout.lineH/2;
    layout.lines.forEach((line,idx) => ctx.fillText(line,px,initial+idx*layout.lineH));
    return { ok:true,size:layout.size };
  }
  function drawContain(ctx,image,box) {
    if (!image) return;
    const [x,y,w,h] = box;
    const ratio = Math.min(w/image.width, h/image.height);
    const width = image.width*ratio, height = image.height*ratio;
    ctx.fillStyle = '#050505';
    ctx.fillRect(x,y,w,h);
    ctx.drawImage(image, x+(w-width)/2, y+(h-height)/2, width, height);
  }
  function starPath(ctx,cx,cy,r) {
    ctx.beginPath();
    for(let k=0;k<10;k++) {
      const a = -Math.PI/2 + Math.PI*k/5, radius=k%2 ? r*0.47:r;
      const x=cx+Math.cos(a)*radius,y=cy+Math.sin(a)*radius;
      if(k===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }
    ctx.closePath();
  }
  // Render exactly five stars. The stored quarter-star value controls the red
  // fractional fill; no numeric rating is displayed on promotional artwork.
  function drawRating(ctx, rating, x, y, r, gap) {
    const valid = rating !== null && rating !== undefined && rating !== '' && Number.isFinite(Number(rating));
    const value = valid ? Math.max(0, Math.min(5, Number(rating))) : 0;
    for (let i = 0; i < 5; i++) {
      const cx = x + i * gap;
      starPath(ctx, cx, y, r);
      ctx.strokeStyle = '#f1f1f1';
      ctx.lineWidth = 2.2;
      ctx.stroke();
      const filledFraction = Math.max(0, Math.min(1, value - i));
      if (filledFraction > 0) {
        ctx.save();
        starPath(ctx, cx, y, r);
        ctx.clip();
        ctx.fillStyle = '#f7010e';
        ctx.fillRect(cx - r, y - r, 2 * r * filledFraction, 2 * r);
        ctx.restore();
      }
    }
  }
  function label(ctx,txt,x,y,size) {
    ctx.fillStyle='#c6c6c6';ctx.font='500 '+size+'px "Oswald"';ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(txt,x,y);
  }
  function value(ctx,txt,x,y,size,width) {
    let pointSize=size;
    while(pointSize>17){ctx.font='600 '+pointSize+'px "Inter"';if(ctx.measureText(txt).width<=width)break;pointSize--;}
    ctx.fillStyle='#f1f1f1';ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(txt,x,y);
  }
  function drawPostMeta(ctx,kind) {
    const d=state.drafts[kind];
    label(ctx,'WATCHED IN',589,377,25);
    value(ctx,d.language || 'Not set',588,432,31,397);
    label(ctx,"POORNA'S RATING",589,503,24);
    drawRating(ctx,d.rating,605,558,22,62);
    label(ctx,'RELEASE DATE',588,634,24);
    value(ctx,dateShort(d.releaseDate),588,691,30,397);
  }
  function drawStoryMeta(ctx,kind) {
    const d=state.drafts[kind];
    label(ctx,'WATCHED IN',598,560,25);
    value(ctx,d.language || 'Not set',599,641,29,374);
    label(ctx,"POORNA'S RATING",599,728,24);
    drawRating(ctx,d.rating,628,803,21,63);
    label(ctx,'RELEASE DATE',599,889,24);
    value(ctx,dateShort(d.releaseDate),599,959,28,374);
  }
  function makeImageCanvas(kind) {
    const canvas=document.createElement('canvas');
    canvas.width=geometry[kind].size[0];
    canvas.height=geometry[kind].size[1];
    return canvas;
  }
  function renderFrame(kind) {
    const canvas=makeImageCanvas(kind), ctx=canvas.getContext('2d');
    const errors=[];
    ctx.fillStyle='#050505';ctx.fillRect(0,0,canvas.width,canvas.height);
    const bg=state.masters[kind];
    if (bg) ctx.drawImage(bg,0,0,canvas.width,canvas.height);
    else errors.push('Approved '+kind+' master background is not yet uploaded.');
    const review=state.review;
    if(!review){errors.push('Select a saved movie.');return {canvas,errors};}
    if (!state.poster) errors.push('Original R2 movie poster could not be loaded.');
    else drawContain(ctx,state.poster,geometry[kind].poster);
    const draft=state.drafts[kind];
    const title=draft?.title || '';
    const pov=draft?.pov || '';
    if(!title.trim()) errors.push('Movie Title is empty.');
    else {
      const titleOptions=textOptions('title',kind);
      const normalized=draft.titleCase==='uppercase'?title.toUpperCase():title;
      const fit=drawFitted(ctx,normalized,geometry[kind].title,titleOptions,3,kind==='post'?24:30);
      if(!fit.ok) errors.push('Movie Title: '+fit.message);
    }
    if (kind==='post') drawPostMeta(ctx,kind);
    else drawStoryMeta(ctx,kind);
    if(state.drafts[kind] && state.drafts[kind].rating !== '' && !Number.isInteger(Number(state.drafts[kind].rating)*4))errors.push('Rating must use 0.25 increments.');
    if(!pov.trim()) errors.push('MY POV is empty.');
    else {
      const fit=drawFitted(ctx,pov,geometry[kind].pov,textOptions('pov',kind),kind==='post'?8:10,kind==='post'?22:24);
      if(!fit.ok) errors.push('MY POV: '+fit.message);
    }
    return {canvas,errors};
  }
  let drawQueued=false;
  async function refreshAll(){
    await Promise.all([document.fonts.load('700 60px "Oswald"'), document.fonts.load('600 48px "Inter"'),document.fonts.load('600 48px "Source Serif 4"'),document.fonts.load('700 60px "Cinzel"')]);
    state.renders.post=renderFrame('post');
    state.renders.story=renderFrame('story');
    displayCurrent();
  }
  function requestRefresh() {
    if(drawQueued)return;
    drawQueued=true;
    requestAnimationFrame(()=>{drawQueued=false;refreshAll().catch(e=>{inputs.warnings.textContent=errorMessage(e);});});
  }
  function displayCurrent() {
    const result=state.renders[state.format];
    if(!result)return;
    const c=inputs.canvas;c.width=result.canvas.width;c.height=result.canvas.height;
    c.getContext('2d').drawImage(result.canvas,0,0);
    const errors=result.errors;
    inputs.warnings.className='social-warning '+(errors.length?'error':'success');
    inputs.warnings.textContent=errors.length?errors.join('\n'):'Preview ready. Original review data remains unchanged.';
    inputs.dlPost.disabled=!state.renders.post || state.renders.post.errors.length>0;
    inputs.dlStory.disabled=!state.renders.story || state.renders.story.errors.length>0;
  }
  function switchFormat(kind){
    persistDraft();
    state.format=kind;
    applyDraft(kind);
    document.querySelectorAll('[data-social-format]').forEach(button=>{
      button.classList.toggle('active',button.dataset.socialFormat===kind);
    });
    displayCurrent();
  }
  async function checkDimensions(file,kind) {
    const bitmap=await createImageBitmap(file);
    const valid=bitmap.width===1080 && bitmap.height===(kind==='post'?1080:1920);
    bitmap.close();
    if(!valid) throw new Error('The '+kind+' master must be exactly 1080 × '+(kind==='post'?'1080':'1920')+' pixels.');
  }
  async function uploadMasters(){
    const files=[['post',inputs.postFile.files[0]],['story',inputs.storyFile.files[0]]].filter(x=>x[1]);
    if(!files.length){inputs.assetsStatus.textContent='Select at least one master PNG/WebP file.';return;}
    inputs.save.disabled=true;
    try {
      for(const [kind,file] of files) {
        await checkDimensions(file,kind);
        const form=new FormData();form.append('kind',kind);form.append('file',file);
        await jsonApi('/api/admin/social-master',{method:'POST',body:form});
        await loadMaster(kind);
      }
      inputs.postFile.value='';inputs.storyFile.value='';
      updateAssetStatus();
      await refreshAll();
    } catch(err) {inputs.assetsStatus.textContent='Upload failed: '+errorMessage(err);}
    finally{inputs.save.disabled=false;}
  }
  function downloadImage(kind) {
    const result=state.renders[kind];
    if(!result || result.errors.length)return;
    result.canvas.toBlob(blob=>{
      if(!blob){inputs.warnings.textContent='PNG export failed.';return;}
      const link=document.createElement('a');
      link.href=URL.createObjectURL(blob);
      link.download=safeSlug(state.review.s)+'_'+kind+'_social.png';
      document.body.appendChild(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(link.href),1000);
    },'image/png');
  }
  inputs.movie.addEventListener('change',chooseMovie);
  inputs.captionPlatform.addEventListener('change',updateCaptionEditor);
  inputs.captionText.addEventListener('input',()=>{if(state.review)state.captions[inputs.captionPlatform.value]=inputs.captionText.value;});
  inputs.copyCaption.addEventListener('click',()=>copyText(inputs.captionText.value,'Caption copied.'));
  inputs.copyLink.addEventListener('click',()=>copyText(inputs.trackedUrl.value,'Tracked URL copied.'));
  inputs.downloadCaptions.addEventListener('click',downloadCaptions);
  inputs.save.addEventListener('click',uploadMasters);
  inputs.dlPost.addEventListener('click',()=>downloadImage('post'));
  inputs.dlStory.addEventListener('click',()=>downloadImage('story'));
  document.querySelectorAll('[data-social-format]').forEach(button=>button.addEventListener('click',()=>switchFormat(button.dataset.socialFormat)));
  for(const name of ['title','pov','language','releaseDate','rating','titleSize','titleFont','titleWeight','titleAlign','titleCase','titleAuto','povSize','povFont','povWeight','povAlign','povLine','povAuto']) {
    const input=inputs[name];
    input.addEventListener('input',()=>{
      inputs.titleSizeOut.textContent=inputs.titleSize.value+'px';
      inputs.povSizeOut.textContent=inputs.povSize.value+'px';
      persistDraft(); requestRefresh();
    });
    input.addEventListener('change',()=>{persistDraft();requestRefresh();});
  }
  window.addEventListener('social-studio:open',initialize);
})();