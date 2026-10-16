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
    dlPost: $('socialDownloadPost'), dlStory: $('socialDownloadStory')
  };
  if (!inputs.canvas) return;
  const state = {
    initialized: false, review: null, poster: null, format: 'post',
    masters: { post: null, story: null }, renders: {}, errors: {},
    seq: 0, saved: {}, templateUploads: 0
  };
  const REPO_ASSET_ORIGIN = 'https://assets.moviereviewbypoorna.com/';
  const geometry = {
    post: {
      size: [1080,1080],
      poster: [163,206,308,462],
      title: [558,207,445,119],
      pov: [126,752,829,132],
      footer: [221,929,782,83],
    },
    story: {
      size: [1080,1920],
      poster: [349,244,463,617],
      title: [192,909,796,128],
      pov: [166,1291,781,165],
      footer: [204,1515,801,78],
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
    inputs.title.value = ''; inputs.pov.value = '';
    if (!id) { await refreshAll(); return; }
    inputs.status.textContent = 'Loading selected review and original poster…';
    try {
      const review = await jsonApi('/api/admin/reviews/' + encodeURIComponent(id));
      if (sequence !== state.seq) return;
      state.review = review;
      inputs.title.value = review.t || '';
      inputs.pov.value = review.v || '';
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
  function textOptions(prefix) {
    const title = prefix === 'title';
    return {
      family: inputs[title ? 'titleFont' : 'povFont'].value,
      weight: inputs[title ? 'titleWeight' : 'povWeight'].value,
      align: inputs[title ? 'titleAlign' : 'povAlign'].value,
      size: Number(inputs[title ? 'titleSize' : 'povSize'].value),
      auto: inputs[title ? 'titleAuto' : 'povAuto'].checked,
      line: title ? 1.11 : Number(inputs.povLine.value),
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
  function drawPostMeta(ctx,review) {
    label(ctx,'WATCHED IN',589,363,26);
    value(ctx,review.l || 'Not set',590,408,34,415);
    label(ctx,"POORNA'S RATING",588,477,24);
    drawRating(ctx,review.r,612,521,21,58);
    label(ctx,'RELEASE DATE',588,594,24);
    value(ctx,dateShort(review.rd),589,641,32,430);
  }
  function drawStoryMeta(ctx,review) {
    label(ctx,'WATCHED IN',166,1090,24);
    value(ctx,review.l || 'Not set',166,1141,29,238);
    label(ctx,"POORNA'S RATING",426,1090,23);
    drawRating(ctx,review.r,451,1140,17,44);
    label(ctx,'RELEASE DATE',805,1090,24);
    value(ctx,dateShort(review.rd),803,1145,23,230);
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
    const title = inputs.title.value;
    const pov = inputs.pov.value;
    if(!title.trim()) errors.push('Movie Title is empty.');
    else {
      const titleOptions=textOptions('title');
      const normalized=inputs.titleCase.value==='uppercase'?title.toUpperCase():title;
      const fit=drawFitted(ctx,normalized,geometry[kind].title,titleOptions,3,kind==='post'?24:30);
      if(!fit.ok) errors.push('Movie Title: '+fit.message);
    }
    if (kind==='post') drawPostMeta(ctx,review);
    else drawStoryMeta(ctx,review);
    if(!pov.trim()) errors.push('MY POV is empty.');
    else {
      const fit=drawFitted(ctx,pov,geometry[kind].pov,textOptions('pov'),kind==='post'?5:6,kind==='post'?22:24);
      if(!fit.ok) errors.push('MY POV: '+fit.message);
    }
    // Footer is a distinct dynamic text layer. The approved artwork is never modified.
    const url = siteUrl(review);
    if(kind==='post'){
      const fit=drawFitted(ctx,'FULL REVIEW IN THE AUDITORIUM',[230,931,746,34],{family:'Oswald',weight:'700',align:'center',size:27,auto:true,line:1.05},1,20);
      const link=drawFitted(ctx,url,[228,973,750,28],{family:'Inter',weight:'500',align:'center',size:20,auto:true,line:1.04},1,14);
      if(!fit.ok||!link.ok)errors.push('Review URL does not fit in the footer.');
    } else {
      const link=drawFitted(ctx,url,[210,1544,780,39],{family:'Inter',weight:'600',align:'center',size:24,auto:true,line:1.02},1,15);
      if(!link.ok)errors.push('Review URL does not fit in the Story footer.');
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
    state.format=kind;
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
  inputs.save.addEventListener('click',uploadMasters);
  inputs.dlPost.addEventListener('click',()=>downloadImage('post'));
  inputs.dlStory.addEventListener('click',()=>downloadImage('story'));
  document.querySelectorAll('[data-social-format]').forEach(button=>button.addEventListener('click',()=>switchFormat(button.dataset.socialFormat)));
  for(const name of ['title','pov','titleSize','titleFont','titleWeight','titleAlign','titleCase','titleAuto','povSize','povFont','povWeight','povAlign','povLine','povAuto']) {
    const input=inputs[name];
    input.addEventListener('input',()=>{
      inputs.titleSizeOut.textContent=inputs.titleSize.value+'px';
      inputs.povSizeOut.textContent=inputs.povSize.value+'px';
      requestRefresh();
    });
    input.addEventListener('change',requestRefresh);
  }
  window.addEventListener('social-studio:open',initialize);
})();