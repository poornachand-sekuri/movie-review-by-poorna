(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const inputs = {
    movie: $('socialMovie'), status: $('socialMovieStatus'), title: $('socialTitle'), pov: $('socialPov'),
    titleAuto: $('socialTitleAuto'), titleAlign: $('socialTitleAlign'), titleCase: $('socialTitleCase'),
    povAuto: $('socialPovAuto'), povAlign: $('socialPovAlign'), povLine: $('socialPovLine'),
    instagramFile: $('socialInstagramFile'), facebookXFile: $('socialFacebookXFile'), whatsAppFile: $('socialWhatsAppFile'), storyFile: $('socialStoryFile'), postPlatform: $('socialPostPlatform'), save: $('socialSaveTemplates'),
    assetsStatus: $('socialAssetsStatus'), canvas: $('socialCanvas'), warnings: $('socialWarnings'),
    dlPost: $('socialDownloadPost'), dlStory: $('socialDownloadStory'),
    editingMode: $('socialEditingMode'), language: $('socialLanguage'), rating: $('socialRating'),
    captionPlatform: $('socialCaptionPlatform'),captionText: $('socialCaptionText'),trackedUrl: $('socialTrackedUrl'),
    copyCaption: $('socialCopyCaption'),copyLink: $('socialCopyLink'),downloadCaptions: $('socialDownloadCaptions'),captionStatus: $('socialCaptionStatus')
  };
  if (!inputs.canvas) return;
  const state = {
    initialized: false, review: null, poster: null, format: 'post',
    masters: { 'instagram-post':null, 'facebook-x-post':null, 'whatsapp-channel':null, story:null }, postPlatform:'instagram-post', renders: {},
    seq: 0, drafts: { post:null, story:null }, captions:{}
  };
  const REPO_ASSET_ORIGIN = 'https://assets.moviereviewbypoorna.com/';
  // Pixel coordinates for the four October 17 approved ticket masters.
  const geometry = {
    post: {
      size:[1080,1080],poster:[53,291,380,598],title:[504,335,490,85],pov:[484,754,523,120],
      language:{cx:589,y:627,max:225},rating:{x:757,y:599,r:25,gap:59}
    },
    story: {
      size:[1080,1920],poster:[246,254,568,624],title:[156,925,768,96],pov:[93,1352,892,220],
      language:{cx:254,y:1212,max:310},rating:{x:569,y:1195,r:30,gap:79}
    }
  };
  const POST_KINDS=['instagram-post','facebook-x-post','whatsapp-channel'];
  function errorMessage(error) { return error instanceof Error ? error.message : String(error); }
  function safeSlug(value) { return String(value || 'movie').replace(/[^a-z0-9-]/gi, '-').slice(0,100); }
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
        ...POST_KINDS.map(loadMaster), loadMaster('story'),
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
    inputs.assetsStatus.textContent = [...POST_KINDS,'story'].map(kind => kind+': '+(state.masters[kind]?'loaded':'not uploaded')).join(' · ')+'.';
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
  function trackedUrlFor(review,platform) {
    const slug=safeSlug(review.s);
    const url=new URL('https://moviereviewbypoorna.com/review/'+slug);
    url.searchParams.set('utm_source',platforms[platform]||'social');
    url.searchParams.set('utm_medium',platform.endsWith('story')||platform.endsWith('status')?'story':'social');
    url.searchParams.set('utm_campaign',slug);
    return url.toString();
  }
  function trackedUrl(platform) {
    return state.review?trackedUrlFor(state.review,platform):'';
  }
  function makeCaptions(review) {
    const title=String(review.t||'').trim(),link=key=>trackedUrlFor(review,key);
    // Images contain rating, language and MY POV. Captions invite the next click.
    // Story/Status entries are posting notes; no duplicate public Story caption needed.
    const instagram='https://www.instagram.com/moviereviewbypoorna/';
    const channel='https://whatsapp.com/channel/0029VaKoQMp2UPBPOlNDg546';
    const tags='#MovieReviewsByPoorna #MovieReview';
    const xBase='🎬 '+title+'\n🍿 My verdict is up. Agree or disagree?\n🎟️ '+link('x-post');
    const xCaption=xBase.length+1+tags.length<=280?xBase+'\n'+tags:xBase;
    return {
      'instagram-post':'🎬 '+title+' is now screening in the Auditorium!\n🍿 Worth your popcorn? Find out in the full review.\n🎟️ Link in bio.\n📣 Join our WhatsApp Channel: '+channel+'\n'+tags,
      'instagram-story':'🎬 STORY PUBLISHING NOTE (do not paste as a caption)\n🎟️ Place the native link sticker in the reserved zone: '+link('instagram-story'),
      'facebook-post':'🎬 '+title+' is now screening in my Auditorium!\n🍿 Agree with my verdict?\n🎟️ Read the full review: '+link('facebook-post')+'\n📸 Follow on Instagram: '+instagram,
      'facebook-story':'🎬 STORY PUBLISHING NOTE (no caption required)\n🎟️ Attach the review URL using the native story-link feature, where available: '+link('facebook-story'),
      'x-post':xCaption,
      'whatsapp-channel':'🎬 *'+title+'*\n🍿 My verdict is up. Have you watched it yet?\n🎟️ Full review: '+link('whatsapp-channel')+'\n📸 More reviews on Instagram: '+instagram,
      'whatsapp-status':'🎬 STATUS PUBLISHING NOTE (no repeated MY POV)\n🎟️ Add the link where your Status editor supports it; otherwise publish a linked text Status: '+link('whatsapp-status')
    };
  }
  function updateCaptionEditor() {
    const key=inputs.captionPlatform.value;
    inputs.captionText.value=state.captions[key] || '';
    inputs.trackedUrl.value=trackedUrl(key);
    const isStory=key.endsWith('story')||key.endsWith('status');
    inputs.captionStatus.textContent=state.review?(isStory?'Story/Status posting instructions (not a public caption). Copy the tracked link for the native link feature.':'Edit and copy the short promotional caption for '+inputs.captionPlatform.selectedOptions?.[0]?.textContent+'.'):'Select a saved review.';
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

  function adjustStyleRanges(oldText,newText,ranges) {
    if(!ranges?.length)return [];
    let prefix=0;
    while(prefix<oldText.length&&prefix<newText.length&&oldText[prefix]===newText[prefix])prefix++;
    let suffix=0;
    while(suffix<oldText.length-prefix&&suffix<newText.length-prefix&&oldText[oldText.length-1-suffix]===newText[newText.length-1-suffix])suffix++;
    const delta=newText.length-oldText.length;
    return ranges.flatMap(r=>{
      if(r.end<=prefix)return [r];
      if(r.start>=oldText.length-suffix)return [{...r,start:r.start+delta,end:r.end+delta}];
      return [];
    });
  }
  function drawStyled(ctx,text,box,options,maxLines,minimum,ranges=[]) {
    if(!ranges?.length)return drawFitted(ctx,text,box,options,maxLines,minimum);
    const [x,y,width,height]=box,raw=String(text),maxW=width-6;
    // Split each word at its formatting boundaries. Previously a selection
    // touching one letter styled the *whole* word in the PNG export.
    const splitToken=(token,start,scale)=>{
      const end=start+token.length;
      const boundaries=new Set([start,end]);
      for(const r of ranges){
        if(r.start>start&&r.start<end)boundaries.add(r.start);
        if(r.end>start&&r.end<end)boundaries.add(r.end);
      }
      const positions=[...boundaries].sort((a,b)=>a-b),parts=[];
      for(let i=1;i<positions.length;i++){
        const at=positions[i-1],stop=positions[i];
        let style=null;
        for(const range of ranges)if(range.start<=at&&range.end>=stop)style=range;
        const size=Math.max(18,(style?.size||options.size)*scale);
        const family=style?.font||options.family,weight=style?.weight||options.weight;
        const font=(style?.italic?'italic ':'')+weight+' '+size+'px "'+family+'"';
        const segment=raw.slice(at,stop);
        ctx.font=font;
        parts.push({text:segment,font,style,width:ctx.measureText(segment).width,size});
      }
      return parts;
    };
    const tokens=[...raw.matchAll(/\S+|[^\S\n]+|\n/g)];
    let layout=null;
    for(let base=options.size;base>=(options.auto?minimum:options.size);base--){
      const scale=base/options.size,lines=[];
      let row={pieces:[],width:0,height:base*options.line},failed=false;
      const flush=()=>{lines.push(row);row={pieces:[],width:0,height:base*options.line};};
      for(const match of tokens){
        const token=match[0];
        if(token==='\n'){flush();continue;}
        if(!token.trim() && !row.pieces.length)continue;
        const parts=splitToken(token,match.index,scale);
        const groupWidth=parts.reduce((sum,p)=>sum+p.width,0);
        if(token.trim() && row.pieces.length && row.width+groupWidth>maxW)flush();
        if(!token.trim() && !row.pieces.length)continue;
        if(groupWidth>maxW || row.width+groupWidth>maxW){failed=true;break;}
        for(const piece of parts){
          row.pieces.push(piece);row.width+=piece.width;
          row.height=Math.max(row.height,piece.size*options.line);
        }
      }
      if(!failed && (row.pieces.length||!lines.length))flush();
      const totalHeight=lines.reduce((sum,line)=>sum+line.height,0);
      if(!failed&&lines.length<=maxLines&&totalHeight<=height){layout={lines,height:totalHeight,scale};break;}
    }
    if(!layout)return {ok:false,message:'Selected text formatting cannot fit inside the panel. Reduce the font size or enable auto-fit.'};
    let py=y+(height-layout.height)/2;
    for(const row of layout.lines){
      let px=x+3+(options.align==='center'?(maxW-row.width)/2:0);
      for(const piece of row.pieces){
        ctx.save();
        ctx.font=piece.font;
        ctx.textAlign='left';ctx.textBaseline='middle';
        ctx.fillStyle=piece.style?.color||options.color||'#f1f1f1';
        if(piece.style?.effect==='glow'){
          ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=Math.max(5,piece.size*.3);
        }else if(piece.style?.effect==='shadow'){
          ctx.shadowColor='#000000';ctx.shadowBlur=8;ctx.shadowOffsetX=3;ctx.shadowOffsetY=3;
        }else if(piece.style?.effect==='outline'){
          ctx.strokeStyle='#f1f1f1';ctx.lineWidth=1.5;
          ctx.strokeText(piece.text,px,py+row.height/2);
        }
        ctx.fillText(piece.text,px,py+row.height/2);
        if(piece.style?.underline){
          ctx.shadowBlur=0;
          ctx.fillRect(px,py+row.height/2+piece.size*.31,piece.width,Math.max(1,piece.size*.05));
        }
        ctx.restore();px+=piece.width;
      }
      py+=row.height;
    }
    return {ok:true,scale:layout.scale};
  }

  function defaultDraft(review) {
    return {
      title:review.t || '',pov:review.v || '',styles:{title:[],pov:[]},language:review.l || '',
      rating:review.r == null?'':String(review.r),
      titleCase:'uppercase',
      titleStyle:{ family:'Oswald', weight:'700', align:'center',color:'#060505',size:59,auto:true,line:1.11 },
      povStyle:{ family:'Inter',weight:'600',align:'left',color:'#f1f1f1',size:37,auto:true,line:1.22 }
    };
  }
  function persistDraft(){
    const draft=state.drafts[state.format];
    if(!draft)return;
    for(const field of ['title','pov']) {
      if(draft[field]!==inputs[field].value) {
        draft.styles[field]=adjustStyleRanges(draft[field],inputs[field].value,draft.styles[field]);
        draft[field]=inputs[field].value;
      }
    }
    draft.language=inputs.language.value;
    const r=inputs.rating.value;
    if(r!=='' && (!Number.isFinite(Number(r)) || Number(r)<0 || Number(r)>5 || !Number.isInteger(Number(r)*4))) {
      inputs.rating.setCustomValidity('Use a rating from 0 to 5 in 0.25 increments.');
    } else inputs.rating.setCustomValidity('');
    draft.rating=r;
    draft.titleCase=inputs.titleCase.value;
    // Font, size, color and emphasis are controlled by each inline toolbar.
    // Preserve those span styles; layout controls only affect alignment and fit.
    draft.titleStyle.align=inputs.titleAlign.value;
    draft.titleStyle.auto=inputs.titleAuto.checked;
    draft.povStyle.align=inputs.povAlign.value;
    draft.povStyle.auto=inputs.povAuto.checked;
    draft.povStyle.line=Number(inputs.povLine.value);
  }
  function applyDraft(kind){
    const draft=state.drafts[kind];if(!draft)return;
    inputs.title.value=draft.title;inputs.pov.value=draft.pov;
    inputs.language.value=draft.language;
    inputs.rating.value=draft.rating;
    inputs.rating.setCustomValidity('');
    inputs.titleCase.value=draft.titleCase;
    for(const prefix of ['title','pov']){
      const style=draft[prefix+'Style'];
      inputs[prefix+'Align'].value=style.align;
      inputs[prefix+'Auto'].checked=style.auto;
    }
    inputs.povLine.value=String(draft.povStyle.line);
    inputs.editingMode.textContent=kind==='post'?'POST IMAGE · '+state.postPlatform.toUpperCase().replaceAll('-',' '):'STORY IMAGE';
    window.SocialStudioRich?.sync();
    document.querySelectorAll('[data-social-format]').forEach(button=>button.classList.toggle('active',button.dataset.socialFormat===kind));
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
    ctx.fillStyle = options.color || '#f1f1f1';
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
  function drawLanguage(ctx,value,place) {
    const language=String(value||'').trim();
    if(!language)return;
    ctx.save();
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillStyle='#f1f1f1';
    ctx.shadowColor='rgba(247,1,14,.2)';ctx.shadowBlur=3;
    let size=32;
    while(size>18){
      ctx.font='700 '+size+'px "Oswald"';
      if(ctx.measureText(language).width<=place.max)break;
      size--;
    }
    ctx.fillText(language,place.cx,place.y);
    ctx.restore();
  }
  function drawApprovedMeta(ctx,kind) {
    const draft=state.drafts[kind],g=geometry[kind];
    // Section headers are baked into the master; only render dynamic values.
    drawLanguage(ctx,draft.language,g.language);
    drawRating(ctx,draft.rating,g.rating.x,g.rating.y,g.rating.r,g.rating.gap);
  }
  function makeImageCanvas(kind) {
    const canvas=document.createElement('canvas');
    canvas.width=geometry[kind].size[0];
    canvas.height=geometry[kind].size[1];
    return canvas;
  }
  function renderFrame(kind) {
    const canvas=makeImageCanvas(kind), ctx=canvas.getContext('2d');
    const errors=[],notes=[];
    ctx.fillStyle='#050505';ctx.fillRect(0,0,canvas.width,canvas.height);
    const masterKind=kind==='post'?state.postPlatform:'story';
    const bg=state.masters[masterKind];
    if (bg) ctx.drawImage(bg,0,0,canvas.width,canvas.height);
    else errors.push('Approved '+masterKind+' master background is not yet uploaded.');
    const review=state.review;
    if(!review){errors.push('Select a saved movie.');return {canvas,errors,notes};}
    if (!state.poster) errors.push('Original R2 movie poster could not be loaded.');
    else drawContain(ctx,state.poster,geometry[kind].poster);
    const draft=state.drafts[kind];
    const title=draft?.title || '';
    const pov=draft?.pov || '';
    if(!title.trim()) errors.push('Movie Title is empty.');
    else {
      const titleOptions=textOptions('title',kind);
      const normalized=draft.titleCase==='uppercase'?title.toUpperCase():title;
      const fit=drawStyled(ctx,normalized,geometry[kind].title,titleOptions,3,kind==='post'?24:30,draft.styles.title);
      if(!fit.ok) errors.push('Movie Title: '+fit.message);
      else if(titleOptions.auto) {
        const ratio=fit.scale??((fit.size||titleOptions.size)/titleOptions.size);
        if(ratio<.98)notes.push('Title auto-fit reduced font sizes to '+Math.round(ratio*100)+'% to stay inside the frame.');
      }
    }
    drawApprovedMeta(ctx,kind);
    if(state.drafts[kind] && state.drafts[kind].rating !== '' && !Number.isInteger(Number(state.drafts[kind].rating)*4))errors.push('Rating must use 0.25 increments.');
    if(!pov.trim()) errors.push('MY POV is empty.');
    else {
      const fit=drawStyled(ctx,pov,geometry[kind].pov,textOptions('pov',kind),kind==='post'?8:10,kind==='post'?22:24,draft.styles.pov);
      if(!fit.ok) errors.push('MY POV: '+fit.message);
      else if(draft.povStyle.auto) {
        const ratio=fit.scale??((fit.size||draft.povStyle.size)/draft.povStyle.size);
        if(ratio<.98)notes.push('MY POV auto-fit reduced font sizes to '+Math.round(ratio*100)+'% to stay inside the frame.');
      }
    }
    return {canvas,errors,notes};
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
    inputs.warnings.textContent=errors.length?errors.join('\n'):
      'Preview ready. Original review data remains unchanged.'+(result.notes?.length?'\n'+result.notes.join('\n'):'');
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
    const valid=bitmap.width===1080 && bitmap.height===(kind==='story'?1920:1080);
    bitmap.close();
    if(!valid) throw new Error('The '+kind+' master must be exactly 1080 × '+(kind==='story'?'1920':'1080')+' pixels.');
  }
  async function uploadMasters(){
    const files=[['instagram-post',inputs.instagramFile.files[0]],['facebook-x-post',inputs.facebookXFile.files[0]],['whatsapp-channel',inputs.whatsAppFile.files[0]],['story',inputs.storyFile.files[0]]].filter(x=>x[1]);
    if(!files.length){inputs.assetsStatus.textContent='Select at least one master PNG/WebP file.';return;}
    inputs.save.disabled=true;
    try {
      for(const [kind,file] of files) {
        await checkDimensions(file,kind);
        const form=new FormData();form.append('kind',kind);form.append('file',file);
        await jsonApi('/api/admin/social-master',{method:'POST',body:form});
        await loadMaster(kind);
      }
      inputs.instagramFile.value='';inputs.facebookXFile.value='';inputs.whatsAppFile.value='';inputs.storyFile.value='';
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
      link.download=safeSlug(state.review.s)+'_'+(kind==='post'?state.postPlatform:'story')+'_social.png';
      document.body.appendChild(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(link.href),1000);
    },'image/png');
  }
  // The inline rich editors update these hidden model fields through a bridge.
  window.SocialStudioRichBridge={
    getDraft:()=>state.drafts[state.format],
    format:()=>state.format,
    setText:(field,text)=>{
      if(field!=='title'&&field!=='pov')return;
      inputs[field].value=text;
      persistDraft();
      requestRefresh();
    },
    refresh:requestRefresh,
  };
  inputs.movie.addEventListener('change',chooseMovie);
  inputs.postPlatform.addEventListener('change',()=>{state.postPlatform=inputs.postPlatform.value;applyDraft(state.format);requestRefresh();});
  inputs.captionPlatform.addEventListener('change',updateCaptionEditor);
  inputs.captionText.addEventListener('input',()=>{if(state.review)state.captions[inputs.captionPlatform.value]=inputs.captionText.value;});
  inputs.copyCaption.addEventListener('click',()=>copyText(inputs.captionText.value,'Caption copied.'));
  inputs.copyLink.addEventListener('click',()=>copyText(inputs.trackedUrl.value,'Tracked URL copied.'));
  inputs.downloadCaptions.addEventListener('click',downloadCaptions);
  inputs.save.addEventListener('click',uploadMasters);
  inputs.dlPost.addEventListener('click',()=>downloadImage('post'));
  inputs.dlStory.addEventListener('click',()=>downloadImage('story'));
  document.querySelectorAll('[data-social-format]').forEach(button=>button.addEventListener('click',()=>switchFormat(button.dataset.socialFormat)));
  for(const name of ['title','pov','language','rating','titleAlign','titleCase','titleAuto','povAlign','povLine','povAuto']) {
    const input=inputs[name];
    input.addEventListener('input',()=>{
      persistDraft();
      window.SocialStudioRich?.refreshLayout?.();
      requestRefresh();
    });
    input.addEventListener('change',()=>{persistDraft();window.SocialStudioRich?.refreshLayout?.();requestRefresh();});
  }
  window.addEventListener('social-studio:open',initialize);
})();