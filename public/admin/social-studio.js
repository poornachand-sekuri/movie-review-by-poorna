(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const inputs = {
    movie: $('socialMovie'), status: $('socialMovieStatus'), title: $('socialTitle'), pov: $('socialPov'),
    titleAuto: $('socialTitleAuto'), titleAlign: $('socialTitleAlign'), titleCase: $('socialTitleCase'),
    povAuto: $('socialPovAuto'), povAlign: $('socialPovAlign'), povLine: $('socialPovLine'),
    languageFont: $('socialLanguageFont'), languageSize: $('socialLanguageSize'), languageColor: $('socialLanguageColor'), languageAuto: $('socialLanguageAuto'),
    instagramFile: $('socialInstagramFile'), facebookXFile: $('socialFacebookXFile'), whatsAppFile: $('socialWhatsAppFile'), storyFile: $('socialStoryFile'), postPlatform: $('socialPostPlatform'), save: $('socialSaveTemplates'),
    assetsStatus: $('socialAssetsStatus'), canvas: $('socialCanvas'), warnings: $('socialWarnings'),
    dlPost: $('socialDownloadPost'), dlStory: $('socialDownloadStory'),
    editingMode: $('socialEditingMode'), language: $('socialLanguage'), rating: $('socialRating'),
    captionPlatform: $('socialCaptionPlatform'),captionText: $('socialCaptionText'),trackedUrl: $('socialTrackedUrl'),
    copyCaption: $('socialCopyCaption'),copyXReply: $('socialCopyXReply'),copyLink: $('socialCopyLink'),downloadCaptions: $('socialDownloadCaptions'),captionStatus: $('socialCaptionStatus'),
    editorialStatus: $('socialEditorialStatus'), saveMovieStyle: $('socialSaveMovieStyle'), saveDefaults: $('socialSaveDefaults'), applyBoth: $('socialApplyBoth'),
    overrideFormat: $('socialOverrideFormat'), resetOverride: $('socialResetOverride'),
    autoFitOnLoad: $('socialAutoFitOnLoad'), recalculateFit: $('socialRecalculateFit'),
    scanFits: $('socialScanAllFits'), prepareFits: $('socialPrepareFits'),
    fitStatus: $('socialFitStatus'), fitReport: $('socialFitReport'),
    bulkDownload: $('socialBulkDownload'), bulkCancel: $('socialBulkCancel'), bulkStatus: $('socialBulkStatus')
  };
  if (!inputs.canvas) return;
  const state = {
    initialized: false, review: null, poster: null, format: 'post',
    masters: { 'instagram-post':null, 'facebook-x-post':null, 'whatsapp-channel':null, story:null }, postPlatform:'instagram-post', renders: {},
    seq: 0, drafts: { post:null, story:null }, captions:{}, presets:null, sharedDraft:null, savedOverrides:{}, editorialLoaded:false,
    reviewCatalog:[], bulkFits:[], scanning:false, bulkSession:null, bulkCursor:0
  };
  const REPO_ASSET_ORIGIN = 'https://assets.moviereviewbypoorna.com/';
  const SOCIAL_FONTS=['Inter','Oswald','Cinzel','Source Serif 4','Bebas Neue','Anton','Barlow Condensed','Montserrat','Playfair Display','Poppins','Rajdhani','Merriweather'];
  const COLOR_HEX=/^#[0-9a-f]{6}$/i;
  // Poster apertures are strictly inset inside the bright ornamental frame edges,
  // pixel-measured from the final 1080px masters. Never draw over master borders.
  // FB star centers measured from the five baked white outlines (y=575.8, not 580.5).
  // Star outlines are PRINTED in the source PNG: we fill them, never draw duplicates.
  const geometry={
    post:{
      size:[1080,1080],poster:[59,299,375,580],title:[505,333,477,90],
      pov:[485,748,517,128],language:{cx:594,y:622,max:223},
      rating:{centers:[760.5,818.4,876.5,934,991.5],y:601.5,r:24}
    },
    story:{
      size:[1080,1920],poster:[259,276,562,602],title:[162,926,756,103],
      pov:[99,1388,870,197],language:{cx:251,y:1211,max:290},
      rating:{centers:[577.8,665,751,837.8,921.6],y:1215.8,r:33}
    }
  };
  const postOverrides={
    'facebook-x-post':{
      poster:[48,293,378,592],title:[504,329,478,93],
      pov:[486,745,515,129],language:{cx:592,y:613,max:217},
      rating:{centers:[755.9,817.5,878.5,939.9,1000.6],y:575.8,r:24.5}
    },
    'whatsapp-channel':{
      poster:[56,283,365,594],title:[503,335,480,90],
      pov:[485,750,518,127],language:{cx:585,y:627,max:214},
      rating:{centers:[732.5,796.4,861.8,926.7,991.1],y:600,r:26}
    }
  };
  const POST_KINDS=['instagram-post','facebook-x-post','whatsapp-channel'];
  function layoutFor(kind){
    return kind==='story'?geometry.story:{...geometry.post,...postOverrides[state.postPlatform]};
  }
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
      state.reviewCatalog=results[0];
      for (const review of results[0]) {
        const opt = document.createElement('option');
        opt.value = String(review.i);
        opt.textContent = review.rd ? review.t + ' · Released ' + review.rd : review.t + ' · Release date not set';
        inputs.movie.appendChild(opt);
      }
      inputs.status.textContent = results[0].length + ' saved reviews available.';
      if(inputs.bulkDownload){
        inputs.bulkDownload.disabled=!results[0].length;
        inputs.bulkStatus.textContent=results[0].length+' movies ready. Export uses saved styles and the original D1 review content.';
      }
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
      const [review,editorial]=await Promise.all([
        jsonApi('/api/admin/reviews/' + encodeURIComponent(id)),
        jsonApi('/api/admin/editorial?reviewId='+encodeURIComponent(id)).catch(()=>null)
      ]);
      if (sequence !== state.seq) return;
      state.review = review;
      state.presets=editorial?.presets||null;
      const base=editorial?.drafts?.shared||defaultDraft(review);
      state.sharedDraft=cloneDraft(base);
      state.savedOverrides=editorial?.drafts||{};
      state.drafts.post=cloneDraft(editorial?.drafts?.post||base);
      state.drafts.story=cloneDraft(editorial?.drafts?.story||base);
      const protectedStyles=Object.values(editorial?.drafts||{}).some(Boolean);
      if(inputs.autoFitOnLoad?.checked && !protectedStyles){
        const proposal=await recommendFit(base);
        if(sequence!==state.seq)return;
        state.sharedDraft=cloneDraft(proposal.draft);
        state.drafts.post=cloneDraft(proposal.draft);
        state.drafts.story=cloneDraft(proposal.draft);
        showFitStatus(proposal.status==='ready'
          ?'Recommended title, MY POV and language fit prepared for Post and Story. Review the preview, then save if you like.'
          :'Automatic preflight: '+proposal.messages.join(' ')+' Review before saving.');
      }else{
        showFitStatus(protectedStyles
          ?'Previously saved styling retained. Choose RECALCULATE CURRENT FIT to preview new settings without saving.'
          :'Auto-fit on load is off. Turn it on for future unsaved movies.');
      }
      state.format='post'; applyDraft('post');
      if(inputs.overrideFormat)inputs.overrideFormat.checked=false;
      state.editorialLoaded=!!editorial?.presets;
      showEditorialStatus(editorial?.presets?'Reusable styles loaded. Changes are not saved until you save them.':'Default styles loaded. Editorial storage unavailable; check before saving.');
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
    // A very long title slug must not make the first X post exceed its limit.
    // Retain source/medium tracking even when dropping the optional campaign key.
    if(platform==='x-post' && url.toString().length>190)url.searchParams.delete('utm_campaign');
    return url.toString();
  }
  function trackedUrl(platform) {
    return state.review?trackedUrlFor(state.review,platform):'';
  }
  // Canonical account links match the public Stay Connected section.
  const SOCIAL_ACCOUNTS=Object.freeze({
    instagram:'https://www.instagram.com/moviereviewbypoorna/',
    facebook:'https://www.facebook.com/moviereviewbypoorna',
    x:'https://x.com/reviewbypoorna',
    whatsapp:'https://whatsapp.com/channel/0029VaKoQMp2UPBPOlNDg546'
  });
  const X_REPLY_SEPARATOR='=== X FOLLOW-UP REPLY (POST 2/2) ===';
  // Extra blank line after EVERY copy line, including cross-platform links.
  const spaced=lines=>lines.filter(Boolean).join('\n\n');
  const followEverywhere=()=>[
    '📣 FOLLOW MOVIE REVIEWS BY POORNA EVERYWHERE',
    '📸 Instagram: '+SOCIAL_ACCOUNTS.instagram,
    'ⓕ Facebook: '+SOCIAL_ACCOUNTS.facebook,
    '𝕏 X: '+SOCIAL_ACCOUNTS.x,
    '💬 WhatsApp Channel: '+SOCIAL_ACCOUNTS.whatsapp
  ];
  // The follow-up reply is deliberately compact enough for an individual X post.
  const xFollowUp=()=>spaced([
    '🎬 More movie talk, four ways to follow:',
    '📸 Instagram: '+SOCIAL_ACCOUNTS.instagram,
    'ⓕ Facebook: '+SOCIAL_ACCOUNTS.facebook,
    '𝕏 X: '+SOCIAL_ACCOUNTS.x,
    '💬 WhatsApp: '+SOCIAL_ACCOUNTS.whatsapp
  ]);
  function splitXThread(message){
    const index=message.indexOf(X_REPLY_SEPARATOR);
    return index<0?{main:message.trim(),reply:''}:{
      main:message.slice(0,index).trim(),reply:message.slice(index+X_REPLY_SEPARATOR.length).trim()
    };
  }
  function makeCaptions(review) {
    const title=String(review.t||'').trim(),link=platform=>trackedUrlFor(review,platform);
    // Images already contain rating/language/MY POV; these messages promote reviews and other channels.
    // Instagram post URLs are plain text rather than tappable links; the clickable path remains bio.
    const xUrl=link('x-post');
    let xMain=spaced(['🎬 '+title,'🍿 My verdict is up. What do you think?','🎟️ Full review: '+xUrl]);
    if(xMain.length>280){
      const room=Math.max(0,280-spaced(['🎬 ','🍿 Verdict is up!','🎟️ '+xUrl]).length);
      xMain=spaced(['🎬 '+title.slice(0,room),'🍿 Verdict is up!','🎟️ '+xUrl]);
    }
    const xReply=xFollowUp();
    return {
      'instagram-post':spaced([
        '🎬 '+title+' has reached the Auditorium!',
        '🍿 Worth your popcorn? My full review has the answer!',
        '🎟️ FULL REVIEW LINK IN BIO',
        '🎞️ THE MOVIE TALK DOESN\'T END HERE!',
        ...followEverywhere().slice(1),
        '🎥 ONE LOVE. MANY SCREENS.',
        '#MovieReviewsByPoorna #MovieReview'
      ]),
      'instagram-story':spaced([
        '🎬 INSTAGRAM STORY PUBLISHING NOTE (not a Story caption)',
        '🎟️ Add a native Link sticker in the reserved safe area: '+link('instagram-story'),
        '📣 Our other platforms:',
        ...followEverywhere().slice(1)
      ]),
      'facebook-post':spaced([
        '🎬 '+title+' has reached the Auditorium!',
        '🍿 Have you watched it? Tell me what you think.',
        '🎟️ FULL REVIEW: '+link('facebook-post'),
        ...followEverywhere(),
        '#MovieReviewsByPoorna #MovieReview'
      ]),
      'facebook-story':spaced([
        '🎬 FACEBOOK STORY PUBLISHING NOTE (not a Story caption)',
        '🎟️ Attach the full review URL using the available native Story link option: '+link('facebook-story'),
        ...followEverywhere()
      ]),
      'x-post':spaced([xMain,X_REPLY_SEPARATOR,xReply]),
      'whatsapp-channel':spaced([
        '🎬 *'+title+'*',
        '🍿 My verdict is up. What is yours?',
        '🎟️ FULL REVIEW: '+link('whatsapp-channel'),
        ...followEverywhere()
      ]),
      'whatsapp-status':spaced([
        '🎬 WHATSAPP STATUS PUBLISHING NOTE (do not paste as Story text)',
        '🎟️ Add the review link using the available Status link option, or a separate linked text Status: '+link('whatsapp-status'),
        ...followEverywhere()
      ])
    };
  }
  function updateCaptionEditor() {
    const key=inputs.captionPlatform.value;
    inputs.captionText.value=state.captions[key] || '';
    inputs.trackedUrl.value=trackedUrl(key);
    const isStory=key.endsWith('story')||key.endsWith('status');
    const isX=key==='x-post';
    inputs.copyCaption.textContent=isX?'COPY X POST 1/2':'COPY MESSAGE';
    inputs.copyXReply.hidden=!isX;
    inputs.captionStatus.textContent=state.review?(isX?'Two-post X thread: copy and publish Post 1, then copy the links reply as Post 2. Both stay within X limits.':isStory?'Story/Status publishing notes, not text to overlay on the image. Copy the native review link separately.':'Editable social caption with a blank line between every line and all four social account URLs.'):'Select a saved review.';
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
  function drawStyled(ctx,text,box,options,maxLines,minimum,ranges=[],preferSingleLine=false) {
    if(!ranges?.length)return drawFitted(ctx,text,box,options,maxLines,minimum,preferSingleLine);
    // Preserve manual size decisions. For auto-fit, measure the largest
    // comfortable size first; minimum is a fallback, not the default size.
    if(options.auto&&options.size<minimum)options={...options,size:minimum};
    const [x,y,width,height]=box,raw=String(text),maxW=width-10;
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
        const rawSize=Math.min(100,(Number(style?.size)||options.size)*scale);
        const size=Math.max(options.auto?minimum:12,rawSize);
        const family=SOCIAL_FONTS.includes(style?.font)?style.font:options.family;
        const weight=['400','600','700','800'].includes(String(style?.weight))?style.weight:options.weight;
        const font=(style?.italic?'italic ':'')+weight+' '+size+'px "'+family+'"';
        const segment=raw.slice(at,stop);
        ctx.font=font;
        const measured=ctx.measureText(segment).width;
        parts.push({text:segment,font,style,width:measured,size});
      }
      return parts;
    };
    const tokens=[...raw.matchAll(/\S+|[^\S\n]+|\n/g)];
    let layout=null;
    // Title priority: search all readable sizes for a SINGLE LINE before
    // considering wrapping. MY POV retains natural multi-line composition.
    for(const singleLine of preferSingleLine?[true,false]:[false]){
    for(let base=options.size;base>=(options.auto?minimum:options.size);base--){
      const scale=base/options.size,lines=[];
      const lineFactor=options.tightPov?Math.max(1.1,Math.min(1.12,options.line||1.12)):Math.max(1.25,options.line);
      let row={pieces:[],width:0,height:base*lineFactor},failed=false;
      const flush=()=>{lines.push(row);row={pieces:[],width:0,height:base*lineFactor};};
      for(const match of tokens){
        const token=match[0];
        if(token==='\n'){if(singleLine){failed=true;break;}flush();continue;}
        if(!token.trim() && !row.pieces.length)continue;
        const parts=splitToken(token,match.index,scale);
        const groupWidth=parts.reduce((sum,p)=>sum+p.width,0);
        if(!Number.isFinite(groupWidth)||parts.some(p=>p.width<=0&&p.text.trim())){failed=true;break;}
        if(token.trim() && row.pieces.length && row.width+groupWidth>maxW){
          if(singleLine){failed=true;break;}
          flush();
        }
        if(!token.trim() && !row.pieces.length)continue;
        if(groupWidth>maxW || row.width+groupWidth>maxW){failed=true;break;}
        for(const piece of parts){
          row.pieces.push(piece);row.width+=piece.width;
          row.height=Math.max(row.height,piece.size*lineFactor+(options.tightPov?0.5:5));
        }
      }
      if(!failed && (row.pieces.length||!lines.length))flush();
      const totalHeight=lines.reduce((sum,line)=>sum+line.height,0);
      if(!failed&&lines.length<=(singleLine?1:maxLines)&&totalHeight<=height){layout={lines,height:totalHeight,scale};break;}
    }
    if(layout)break;
    }
    if(!layout)return {ok:false,message:'Selected text formatting cannot fit inside the panel. Reduce the font size or enable auto-fit.'};
    ctx.save();ctx.beginPath();ctx.rect(x,y,width,height);ctx.clip();
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
          ctx.strokeText(piece.text,px,py+row.height/2,Math.max(1,piece.width));
        }
        ctx.fillText(piece.text,px,py+row.height/2,Math.max(1,piece.width));
        if(piece.style?.underline){
          ctx.shadowBlur=0;
          ctx.fillRect(px,py+row.height/2+piece.size*.31,piece.width,Math.max(1,piece.size*.05));
        }
        ctx.restore();px+=piece.width;
      }
      py+=row.height;
    }
    ctx.restore();
    return {ok:true,scale:layout.scale,size:Math.round(options.size*layout.scale),lines:layout.lines.length};
  }

  const cloneDraft=value=>JSON.parse(JSON.stringify(value));
  function showEditorialStatus(message) {if(inputs.editorialStatus)inputs.editorialStatus.textContent=message;}
  function defaultDraft(review, presets=state.presets) {
    const preset=presets||{};
    return {
      title:review.t || '',pov:review.v || '',styles:{title:[],pov:[]},language:review.l || '',
      rating:review.r == null?'':String(review.r),
      titleCase:'uppercase',
      titleStyle:cloneDraft(preset['social.title']||{ family:'Oswald', weight:'700', align:'center',color:'#060505',size:59,auto:true,line:1.11 }),
      povStyle:cloneDraft(preset['social.pov']||{ family:'Inter',weight:'600',align:'left',color:'#f1f1f1',size:48,auto:true,line:1.22 }),
      languageStyle:cloneDraft(preset['social.language']||{family:'Oswald',size:38,color:'#f1f1f1',auto:true})
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
    draft.languageStyle={
      family:SOCIAL_FONTS.includes(inputs.languageFont.value)?inputs.languageFont.value:'Oswald',
      size:Math.max(18,Math.min(52,Number(inputs.languageSize.value)||38)),
      color:COLOR_HEX.test(inputs.languageColor.value)?inputs.languageColor.value:'#f1f1f1',
      auto:inputs.languageAuto.checked
    };
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
    const languageStyle=draft.languageStyle||{family:'Oswald',size:38,color:'#f1f1f1',auto:true};
    inputs.languageFont.value=languageStyle.family;
    inputs.languageSize.value=String(languageStyle.size);
    inputs.languageColor.value=languageStyle.color;
    inputs.languageAuto.checked=languageStyle.auto;
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
    if(inputs.overrideFormat)inputs.overrideFormat.checked=!!state.savedOverrides[kind];
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
  function drawFitted(ctx,value,box,options,maxLines,minimum,preferSingleLine=false){
    // Manual font sizes are respected exactly; only automatic fitting
    // considers a safe minimum when selecting its smallest candidate.
    if(options.auto&&options.size<minimum)options={...options,size:minimum};
    const [x,y,width,height]=box,availableWidth=width-12;
    let layout=null;
    const lowerBound=options.auto?minimum:options.size;
    // A one-line title is preferred whenever the complete title fits
    // at or above the readable minimum. Only then allow multiple lines.
    for(const singleLine of preferSingleLine?[true,false]:[false]){
      for(let size=options.size;size>=lowerBound;size--){
        setFont(ctx,options,size);
        const lines=singleLine
          ?(String(value).includes('\n')||ctx.measureText(String(value)).width>availableWidth?null:[String(value)])
          :wrapLines(ctx,value,availableWidth);
        if(!lines)continue;
        const lineFactor=options.tightPov?Math.max(1.1,Math.min(1.12,options.line||1.12)):Math.max(1.25,options.line);
        const lineH=size*lineFactor;
        if(lines.length<=(singleLine?1:maxLines) && lines.length*lineH<=height){
          layout={size,lines,lineH};break;
        }
      }
      if(layout)break;
    }
    if(!layout)return {ok:false,message:'Text cannot fit inside the panel. Reduce the preferred font size or shorten the promotional copy.'};
    ctx.save();ctx.beginPath();ctx.rect(x,y,width,height);ctx.clip();
    setFont(ctx,options,layout.size);
    ctx.textAlign=options.align;ctx.textBaseline='middle';
    ctx.fillStyle=options.color||'#f1f1f1';
    const px=options.align==='center'?x+width/2:x+6;
    const initial=y+(height-layout.lineH*layout.lines.length)/2+layout.lineH/2;
    layout.lines.forEach((line,i)=>ctx.fillText(line,px,initial+i*layout.lineH));
    ctx.restore();
    return {ok:true,size:layout.size,lines:layout.lines.length};
  }
  // A fit error must never look like a missing review. Display as much of
  // the REAL original MY POV as is readable, visibly label the incomplete
  // preview, and block export. This never replaces or truncates saved content.
  function drawUnfittedPovPreview(ctx,value,box,options,minimum){
    const [x,y,width,height]=box;
    const size=minimum,lineHeight=size*1.12;
    const fontOptions={...options,size};
    setFont(ctx,fontOptions,size);
    const lines=wrapLines(ctx,value,width-12);
    const maxVisible=Math.max(1,Math.floor((height-lineHeight)/lineHeight));
    ctx.save();ctx.beginPath();ctx.rect(x,y,width,height);ctx.clip();
    ctx.textAlign='left';ctx.textBaseline='middle';
    ctx.fillStyle=options.color||'#f1f1f1';
    for(let i=0;i<Math.min(maxVisible,lines.length);i++){
      ctx.fillText(lines[i],x+6,y+lineHeight*(i+.5));
    }
    ctx.font='700 '+Math.min(size,19)+'px "Inter"';
    ctx.fillStyle='#ffbf47';
    ctx.fillText('… MY POV NEEDS REVIEW',x+6,y+height-12);
    ctx.restore();
  }
  // Same image policy as Now Reviewed on Lounge: contain the entire original
  // poster over a softly blurred, darkened cover version of that poster.
  // Ticket corners are integral to the approved artwork. A conservatively inset
  // rounded aperture preserves every ornamental border and curved corner.
  function posterOpeningPath(ctx,box) {
    const [x,y,w,h]=box;
    const r=Math.min(20,w/12,h/12);
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.lineTo(x+w-r,y);
    ctx.quadraticCurveTo(x+w,y,x+w,y+r);
    ctx.lineTo(x+w,y+h-r);
    ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    ctx.lineTo(x+r,y+h);
    ctx.quadraticCurveTo(x,y+h,x,y+h-r);
    ctx.lineTo(x,y+r);
    ctx.quadraticCurveTo(x,y,x+r,y);
    ctx.closePath();
  }
  // The decorative ticket stars are *inside* the title rectangle in the
  // approved masters. Reserve their full width plus breathing room, not merely
  // the surrounding frame. Measurements from the supplied 1080px exports:
  // Post stars x=513..544 and 949..987; Story x=131..182 and 899..950.
  // Story title ink was about 18px above the star centers; correct its optical
  // baseline without moving the baked artwork.
  function safeTextBox(box,field,kind) {
    const [x,y,w,h]=box;
    if(field==='title'){
      const starGutter=kind==='story'?72:70;
      const verticalInset=kind==='story'?10:8;
      const opticalShift=kind==='story'?18:4;
      return [x+starGutter,y+verticalInset+opticalShift,
        w-2*starGutter,h-2*verticalInset];
    }
    if(kind==='post'){
      // Take back unused black-panel space previously lost to aggressive
      // inset padding, without entering the red frame or MY POV header.
      return [x-6,y+3,w+12,h+1];
    }
    const horiz=15,vert=10;
    return [x+horiz,y+vert,w-2*horiz,h-2*vert];
  }
  // Platform-local readability limits: a compact Post must never force its
  // smaller type onto the much larger Story MY POV panel.
  // Readability preferences guide warnings; they must not erase content.
  // Search from a comfortable starting size and use smaller type only when
  // necessary to show every word. Admin can always override manually.
  const TEXT_MINIMUM={post:{title:24,pov:19},story:{title:30,pov:24}};
  const POV_COMFORTABLE={post:22,story:30};
  function textMinimum(field,kind){return TEXT_MINIMUM[kind][field];}
  function povFitOptions(kind,style){
    return {...style,tightPov:true,
      size:style.auto?Math.max(style.size||0,kind==='story'?38:32):style.size};
  }
  function drawPoster(ctx,image,box) {
    if(!image)return;
    const [x,y,w,h]=box;
    ctx.save();
    posterOpeningPath(ctx,box);
    ctx.clip();
    // Inset -16px matches review-image-fit.css; soften the BACKGROUND only.
    const bleed=16,cover=Math.max((w+2*bleed)/image.width,(h+2*bleed)/image.height);
    const iw=image.width*cover,ih=image.height*cover;
    ctx.filter='blur(14px) brightness(.33) saturate(.75)';
    ctx.drawImage(image,x+(w-iw)/2,y+(h-ih)/2,iw,ih);
    ctx.filter='none';
    const contain=Math.min(w/image.width,h/image.height);
    const fw=image.width*contain,fh=image.height*contain;
    ctx.drawImage(image,x+(w-fw)/2,y+(h-fh)/2,fw,fh);
    ctx.restore();
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
  // Locate the INSIDE of the baked white outline, rather than drawing a
  // second star polygon over it. A one-pixel guard preserves antialiased edges.
  function fillBakedStar(ctx,cx,cy,r,fraction) {
    if(typeof ctx.getImageData!=='function'||typeof ctx.putImageData!=='function')return false;
    const radius=Math.ceil(r+8),left=Math.round(cx-radius),top=Math.round(cy-radius);
    const side=radius*2+1;
    let pixels;
    try{pixels=ctx.getImageData(left,top,side,side);}catch{return false;}
    const {data,width,height}=pixels,N=width*height;
    if(N!==side*side||!data||data.length!==N*4)return false;
    const outline=new Uint8Array(N),blocked=new Uint8Array(N);
    for(let p=0;p<N;p++){
      const i=p*4;
      outline[p]=data[i]>115&&data[i+1]>115&&data[i+2]>115 ? 1:0;
    }
    // Dilate the printed white outline by one pixel to protect its feathered edge.
    for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
      const p=y*width+x;
      if(outline[p]){
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)
          blocked[p+dy*width+dx]=1;
      }
    }
    const seedX=Math.round(cx-left),seedY=Math.round(cy-top);
    const seed=seedY*width+seedX;
    if(seedX<1||seedX>=width-1||seedY<1||seedY>=height-1||blocked[seed])return false;
    const queue=new Int32Array(N),visited=new Uint8Array(N);
    let head=0,tail=1,touchesBoundary=false;
    queue[0]=seed;visited[seed]=1;
    while(head<tail){
      const p=queue[head++],x=p%width,y=Math.floor(p/width);
      if(!x||!y||x===width-1||y===height-1){touchesBoundary=true;break;}
      for(const next of [p-1,p+1,p-width,p+width]){
        if(!blocked[next]&&!visited[next]){visited[next]=1;queue[tail++]=next;}
      }
    }
    // A broken or mismatched star outline should not flood the rating panel.
    if(touchesBoundary||tail<70||tail>Math.floor(N*0.45))return false;
    const maxX=cx-(r+4)+2*(r+4)*fraction;
    for(let i=0;i<tail;i++){
      const p=queue[i],x=left+(p%width);
      if(x>=maxX)continue;
      const index=p*4;
      data[index]=247;data[index+1]=1;data[index+2]=14;
    }
    ctx.putImageData(pixels,left,top);
    return true;
  }
  // Fallback only for legacy/unsupported Canvas contexts. The screenshot
  // exports use the original white-outline-aware pixel fill above.
  function drawRating(ctx,rating,place) {
    const valid=rating!==null&&rating!==undefined&&rating!==''&&Number.isFinite(Number(rating));
    const value=valid?Math.max(0,Math.min(5,Number(rating))):0;
    for(let i=0;i<5;i++){
      const fraction=Math.max(0,Math.min(1,value-i));
      if(!fraction)continue;
      const cx=place.centers[i],cy=place.y,r=place.r;
      if(fillBakedStar(ctx,cx,cy,r,fraction))continue;
      ctx.save();
      starPath(ctx,cx,cy,r-4);
      ctx.clip();
      ctx.fillStyle='#f7010e';
      ctx.fillRect(cx-r+4,cy-r+4,2*(r-4)*fraction,2*(r-4));
      ctx.restore();
    }
  }
  function drawLanguage(ctx,value,place,style) {
    const language=String(value||'').trim();
    if(!language)return {ok:true};
    const settings=style||{family:'Oswald',size:38,color:'#f1f1f1',auto:true};
    const family=SOCIAL_FONTS.includes(settings.family)?settings.family:'Oswald';
    const color=COLOR_HEX.test(settings.color||'')?settings.color:'#f1f1f1';
    const preferred=Math.max(18,Math.min(52,Number(settings.size)||38));
    ctx.save();
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillStyle=color;
    // Restrained cinema-red glow: complements baked white labels rather than
    // overpowering the stars or turning longer language names into a blur.
    ctx.shadowColor='rgba(247,1,14,.17)';ctx.shadowBlur=2;
    let size=preferred;
    while(size>=18){
      ctx.font='700 '+size+'px "'+family+'"';
      if(ctx.measureText(language).width<=place.max-8)break;
      if(!settings.auto)break;
      size--;
    }
    if(ctx.measureText(language).width>place.max-8){
      ctx.restore();
      return {ok:false,message:'WATCHED IN value is too long for this font and size. Enable auto-fit or choose a narrower font.'};
    }
    ctx.fillText(language,place.cx,place.y);
    ctx.restore();
    return {ok:true,size};
  }
  function drawApprovedMeta(ctx,kind) {
    const draft=state.drafts[kind],g=layoutFor(kind);
    // Headers and white outlines are baked into the approved master.
    const languageResult=drawLanguage(ctx,draft.language,g.language,draft.languageStyle);
    drawRating(ctx,draft.rating,g.rating);
    return languageResult;
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
    else drawPoster(ctx,state.poster,layoutFor(kind).poster);
    const draft=state.drafts[kind],g=layoutFor(kind);
    const title=draft?.title || '';
    const pov=draft?.pov || '';
    if(!title.trim()) errors.push('Movie Title is empty.');
    else {
      const titleOptions=textOptions('title',kind);
      const normalized=draft.titleCase==='uppercase'?title.toUpperCase():title;
      const fit=drawStyled(ctx,normalized,safeTextBox(g.title,'title',kind),titleOptions,3,textMinimum('title',kind),draft.styles.title,true);
      if(!fit.ok) errors.push('Movie Title: '+fit.message);
      else if(titleOptions.auto) {
        const ratio=fit.scale??((fit.size||titleOptions.size)/titleOptions.size);
        if(ratio<.98)notes.push('Title auto-fit reduced font sizes to '+Math.round(ratio*100)+'% to stay inside the frame.');
      }
    }
    const watchedFit=drawApprovedMeta(ctx,kind);
    if(!watchedFit.ok)errors.push(watchedFit.message);
    if(state.drafts[kind] && state.drafts[kind].rating !== '' && !Number.isInteger(Number(state.drafts[kind].rating)*4))errors.push('Rating must use 0.25 increments.');
    if(!pov.trim()) errors.push('MY POV is empty.');
    else {
      const povOptions=povFitOptions(kind,textOptions('pov',kind));
      const fit=drawStyled(ctx,pov,safeTextBox(g.pov,'pov',kind),povOptions,kind==='post'?8:10,textMinimum('pov',kind),draft.styles.pov);
      if(!fit.ok){
        errors.push('MY POV: '+fit.message+' This preview shows a readable excerpt; PNG export is blocked until all words fit.');
        drawUnfittedPovPreview(ctx,pov,safeTextBox(g.pov,'pov',kind),povOptions,textMinimum('pov',kind));
      }
      else if(draft.povStyle.auto) {
        if(fit.size<POV_COMFORTABLE[kind]){
          notes.push('MY POV fits at '+fit.size+'px, below the recommended '+POV_COMFORTABLE[kind]+
            'px. Review and adjust the font or copy if you prefer.');
        }else if(fit.size<povOptions.size-1){
          notes.push('MY POV fitted at '+fit.size+'px for '+kind.toUpperCase()+
            '. You can adjust it in the editor.');
        }
      }
    }
    return {canvas,errors,notes};
  }

  function showFitStatus(message) {
    if(inputs.fitStatus)inputs.fitStatus.textContent=message;
  }
  async function loadDraftFonts(drafts) {
    const fonts=new Set(['Oswald','Inter']);
    for(const draft of drafts){
      if(!draft)continue;
      for(const field of ['title','pov']){
        if(SOCIAL_FONTS.includes(draft[field+'Style']?.family))fonts.add(draft[field+'Style'].family);
        for(const range of draft.styles?.[field]||[])if(SOCIAL_FONTS.includes(range.font))fonts.add(range.font);
      }
      if(SOCIAL_FONTS.includes(draft.languageStyle?.family))fonts.add(draft.languageStyle.family);
    }
    await Promise.all([...fonts].map(font=>document.fonts.load('700 48px "'+font+'"').catch(()=>[])));
  }
  // Preview/export and preflight share the exact canvas text measurer and safe
  // regions. Only title/Pov layout and display sizes are recommended; original
  // movie text, rating, poster, word-level marks and source review are not edited.
  async function recommendFit(source){
    const draft=cloneDraft(source);
    draft.titleStyle.auto=true;draft.povStyle.auto=true;draft.languageStyle.auto=true;
    await loadDraftFonts([draft]);
    const canvas=makeImageCanvas('post'),ctx=canvas.getContext('2d');
    const cases=[
      {kind:'post',layout:geometry.post},
      ...Object.values(postOverrides).map(overrides=>({kind:'post',layout:{...geometry.post,...overrides}})),
      {kind:'story',layout:geometry.story}
    ];
    const sizes={title:[],pov:[]},messages=[];
    if(!String(draft.title||'').trim())messages.push('Movie Title missing.');
    if(!String(draft.pov||'').trim())messages.push('MY POV missing.');
    for(const {kind,layout} of cases){
      const specs=[
        {field:'title',value:draft.titleCase==='uppercase'?draft.title.toUpperCase():draft.title,limit:3,min:textMinimum('title',kind)},
        {field:'pov',value:draft.pov,limit:kind==='post'?8:10,min:textMinimum('pov',kind)}
      ];
      for(const {field,value,limit,min} of specs){
        if(!value?.trim())continue;
        const fitOptions=field==='pov'?povFitOptions(kind,draft.povStyle):draft.titleStyle;
        const result=drawStyled(ctx,value,safeTextBox(layout[field],field,kind),fitOptions,limit,min,draft.styles?.[field]||[],field==='title');
        if(result.ok)sizes[field].push({kind,size:result.size});
        else messages.push((kind==='story'?'Story':'Post')+' '+field.toUpperCase()+' cannot fit at a readable size.');
      }
      const lang=drawLanguage(ctx,draft.language,layout.language,draft.languageStyle);
      if(!lang.ok)messages.push('WATCHED IN does not fit all formats.');
    }
    // Deliberately do NOT write the smallest measured size into the shared
    // draft. That previous step transferred tiny Post type into Story even when
    // Story had enough space for larger, readable text. Each canvas now fits
    // independently from the same unchanged preferred size.
    // Text may technically fit at a very small size. Flag that for human
    // review instead of declaring the result publication-ready.
    if(sizes.title.some(x=>x.kind==='post'&&x.size<=26))
      messages.push('Post title is near its minimum readable size.');
    if(sizes.pov.some(x=>x.kind==='post'&&x.size<POV_COMFORTABLE.post))
      messages.push('Post MY POV is below the preferred font size; you can adjust it.');
    if(sizes.pov.some(x=>x.kind==='story'&&x.size<POV_COMFORTABLE.story))
      messages.push('Story MY POV is below the preferred font size; you can adjust it.');
    if(!draft.language?.trim())messages.push('WATCHED IN is missing.');
    return {draft,status:messages.length?'review':'ready',messages:[...new Set(messages)]};
  }
  const escapeFitText=value=>String(value??'').replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[ch]);
  function renderFitReport(){
    if(!inputs.fitReport)return;
    inputs.fitReport.innerHTML=state.bulkFits.map(item=>
      '<button class="social-fit-review" type="button" data-auto-review-id="'+Number(item.review.i)+'">'+
      '<span>'+escapeFitText(item.review.t)+'</span><small>'+
      (item.status==='saved'?'Saved styling kept':item.status==='ready'?'Ready to save':
        item.status==='prepared'?'Recommendation saved':item.status==='review'?'Needs review':'Scan failed')+
      '</small></button>'
    ).join('');
    if(inputs.prepareFits)inputs.prepareFits.disabled=!state.bulkFits.some(x=>x.status==='ready');
  }
  async function recalculateCurrentFit(){
    if(!state.review)return showFitStatus('Select a movie first.');
    persistDraft();
    inputs.recalculateFit.disabled=true;
    try{
      const proposal=await recommendFit(state.drafts[state.format]);
      state.drafts[state.format]=proposal.draft;
      applyDraft(state.format);
      await refreshAll();
      showFitStatus(proposal.status==='ready'
        ?'Recalculated fit for current '+state.format.toUpperCase()+'. Review the preview. Save Movie Style when satisfied.'
        :proposal.messages.join(' ')+' Changes are preview-only until saved.');
    }catch(error){showFitStatus('Fit recalculation failed: '+errorMessage(error));}
    finally{inputs.recalculateFit.disabled=false;}
  }
  async function scanAllFits(){
    if(state.scanning)return;
    state.scanning=true;
    state.bulkFits=[];
    inputs.scanFits.disabled=true;
    if(inputs.prepareFits)inputs.prepareFits.disabled=true;
    try{
      const response=await jsonApi('/api/admin/editorial');
      const presets=response.presets;
      const catalog=state.reviewCatalog;
      await loadDraftFonts(catalog.map(review=>defaultDraft(review,presets)));
      for(let i=0;i<catalog.length;i++){
        const review=catalog[i];
        try{
          const saved=await jsonApi('/api/admin/editorial?reviewId='+encodeURIComponent(review.i));
          if(Object.values(saved.drafts||{}).some(Boolean)){
            state.bulkFits.push({review,status:'saved'});
          }else{
            const proposal=await recommendFit(defaultDraft(review,presets));
            if(!review.m){
              proposal.status='review';
              proposal.messages.push('Original poster missing.');
            }
            state.bulkFits.push({review,...proposal});
          }
        }catch(error){state.bulkFits.push({review,status:'error',messages:[errorMessage(error)]});}
        if(i%5===0||i===catalog.length-1){
          showFitStatus('Scanned '+(i+1)+' / '+catalog.length+' movies. No movie styling has been saved or replaced.');
        }
      }
      renderFitReport();
      const counts=status=>state.bulkFits.filter(r=>r.status===status).length;
      showFitStatus('Scan complete: '+counts('ready')+' ready, '+counts('review')+' need review, '+
        counts('saved')+' protected saved styles, '+counts('error')+' scan errors. Open any row to review.');
    }catch(error){showFitStatus('Bulk scan failed: '+errorMessage(error));}
    finally{state.scanning=false;inputs.scanFits.disabled=false;}
  }
  async function saveSafeRecommendations(){
    const eligible=state.bulkFits.filter(r=>r.status==='ready');
    if(!eligible.length)return;
    inputs.prepareFits.disabled=true;
    inputs.scanFits.disabled=true;
    let created=0,skipped=0,errors=0;
    try{
      for(const item of eligible){
        try{
          // The server performs an atomic insert-only write. A concurrent
          // manually saved movie draft is never overwritten.
          const result=await saveEditorialOp({type:'prepare-social',reviewId:Number(item.review.i),draft:item.draft});
          item.status=result.created?'prepared':'saved';
          if(result.created)created++;else skipped++;
        }catch(error){item.status='error';item.messages=[errorMessage(error)];errors++;}
      }
      renderFitReport();
      showFitStatus('Completed: '+created+' new shared recommendations saved; '+skipped+
        ' existing movie styles protected; '+errors+' errors. Open any movie to review and refine.');
    }finally{
      inputs.scanFits.disabled=false;
      renderFitReport();
    }
  }

  let drawQueued=false;
  async function refreshAll(){
    // Wait for newly selected Google Fonts BEFORE measuring canvas text;
    // otherwise the export may differ from the rich-text editor preview.
    const fonts=new Set(['Oswald','Inter']);
    for(const draft of Object.values(state.drafts)){
      if(!draft)continue;
      for(const field of ['title','pov']){
        fonts.add(draft[field+'Style'].family);
        for(const range of draft.styles?.[field]||[])if(SOCIAL_FONTS.includes(range.font))fonts.add(range.font);
      }
      if(SOCIAL_FONTS.includes(draft.languageStyle?.family))fonts.add(draft.languageStyle.family);
    }
    await Promise.all([...fonts].map(font=>document.fonts.load('700 48px "'+font+'"').catch(()=>[])));
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

  // BULK SOCIAL RELAUNCH: All rendering uses the same approved, per-platform
  // canvas geometry and saved D1 movie styles as the manual exports. No data
  // writes: images and captions are generated locally in the administrator's
  // browser and packaged in a single streaming archive when supported.
  const SOCIAL_BULK_MAP={
    'instagram-post':'instagram-post.png','facebook-post':'facebook-x-post.png',
    'x-post':'facebook-x-post.png','whatsapp-channel':'whatsapp-channel.png',
    'instagram-story':'story.png','facebook-story':'story.png','whatsapp-status':'story.png'
  };
  const SOCIAL_CAPTION_FILES=[
    'instagram-post','instagram-story','facebook-post','facebook-story',
    'x-post','whatsapp-channel','whatsapp-status'
  ];
  function setBulkStatus(message){
    if(inputs.bulkStatus)inputs.bulkStatus.textContent=message;
  }
  function bulkFolder(review){
    const date=/^\\d{4}-\\d{2}-\\d{2}$/.test(review.rd||'')?review.rd:'no-release-date';
    return 'movies/'+date+'_'+safeSlug(review.s||review.t)+'_'+Number(review.i);
  }
  function writeBlobToDownload(blob,name){
    const anchor=document.createElement('a');
    anchor.href=URL.createObjectURL(blob);
    anchor.download=name;
    document.body.appendChild(anchor);anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(anchor.href),1000);
  }
  function canvasPng(canvas){
    return new Promise((resolve,reject)=>{
      canvas.toBlob(blob=>blob?resolve(blob):reject(Error('PNG conversion failed.')),'image/png');
    });
  }
  function renderBulkFrame(review,poster,drafts,kind,postPlatform){
    // All shared state changes are synchronous, restored before yielding, and
    // do not alter the selected movie or any saved editorial record.
    const prior={review:state.review,poster:state.poster,drafts:state.drafts,postPlatform:state.postPlatform};
    try{
      state.review=review;state.poster=poster;state.drafts=drafts;state.postPlatform=postPlatform;
      return renderFrame(kind);
    }finally{
      state.review=prior.review;state.poster=prior.poster;
      state.drafts=prior.drafts;state.postPlatform=prior.postPlatform;
    }
  }
  const csvCell=value=>'"'+String(value??'').replace(/"/g,'""').replace(/\\r?\\n/g,' ')+'"';
  async function addBulkMovie(zip,review,presets,manifest){
    const dir=bulkFolder(review),notes=[],written=[];
    const captions=makeCaptions(review);
    for(const platform of SOCIAL_CAPTION_FILES){
      const text=captions[platform]||'';
      await zip.add(dir+'/captions/'+platform+'.txt',text+'\\n');
    }
    const reviewUrl='https://moviereviewbypoorna.com/review/'+safeSlug(review.s);
    let editorial;
    try{
      editorial=await jsonApi('/api/admin/editorial?reviewId='+encodeURIComponent(review.i));
    }catch(error){
      notes.push('Editorial storage unavailable: '+errorMessage(error));
    }
    const saved=editorial?.drafts||{};
    const protectedMovie=Object.values(saved).some(Boolean);
    let base=saved.shared||defaultDraft(review,editorial?.presets||presets);
    let preflight=null;
    if(editorial && !protectedMovie){
      try{
        preflight=await recommendFit(base);
        base=preflight.draft;
        if(preflight.status==='review')notes.push(...preflight.messages);
      }catch(error){notes.push('Auto-fit unavailable: '+errorMessage(error));}
    }
    const drafts={
      post:cloneDraft(saved.post||base),
      story:cloneDraft(saved.story||base)
    };
    const meta={
      movie_id:review.i,title:review.t,slug:review.s,release_date:review.rd||null,
      watched_in:review.l||'',rating:review.r,original_my_pov:review.v||'',
      original_poster_url:review.m||null,full_review_url:reviewUrl,
      tracked_links:Object.fromEntries(SOCIAL_CAPTION_FILES.map(platform=>[platform,trackedUrlFor(review,platform)])),
      image_for_platform:SOCIAL_BULK_MAP,
      style_source:protectedMovie?'saved-movie-styling':'shared-default-auto-fit',
      note:'The same approved Story image serves Instagram Story, Facebook Story and WhatsApp Status. The Facebook/X Post design also serves X. Review captions before publication.'
    };
    let poster=null;
    if(!review.m){
      notes.push('Original movie poster missing.');
    }else{
      try{poster=await loadPoster(review.m);}catch(error){
        notes.push('Original poster unavailable: '+errorMessage(error));
      }
      try{
        const posterResponse=await fetch('/api/admin/social-poster?url='+encodeURIComponent(review.m),{credentials:'same-origin'});
        if(posterResponse.ok){
          const contentType=posterResponse.headers?.get?.('content-type')||'';
          const ext=contentType.includes('png')?'png':contentType.includes('webp')?'webp':'jpg';
          await zip.add(dir+'/original_poster.'+ext,await posterResponse.blob());
        }else notes.push('Poster original could not be archived; source URL is in metadata.');
      }catch{notes.push('Poster original could not be archived; source URL is in metadata.');}
    }
    if(!editorial)notes.push('Promotional images skipped to protect unknown saved styles.');
    else if(!poster)notes.push('Promotional images skipped because original poster could not load.');
    else{
      await loadDraftFonts(Object.values(drafts));
      for(const [kind,postPlatform,fileName] of [
        ['post','instagram-post','instagram-post.png'],
        ['post','facebook-x-post','facebook-x-post.png'],
        ['post','whatsapp-channel','whatsapp-channel.png'],
        ['story','story','story.png']
      ]){
        try{
          const frame=renderBulkFrame(review,poster,drafts,kind,postPlatform);
          if(frame.errors.length){
            notes.push(fileName+' NEEDS REVIEW: '+frame.errors.join('; '));
            continue;
          }
          await zip.add(dir+'/images/'+fileName,await canvasPng(frame.canvas));
          written.push(fileName);
          if(frame.notes?.length)notes.push(fileName+': '+frame.notes.join(' / '));
        }catch(error){notes.push(fileName+' export failed: '+errorMessage(error));}
      }
    }
    meta.exported_images=written;
    meta.review_notes=notes;
    await zip.add(dir+'/movie_details.json',JSON.stringify(meta,null,2)+'\\n');
    manifest.push({
      movie:review.t,release:review.rd||'',review:reviewUrl,
      images:written.length,status:written.length===4?'IMAGE PACK READY':'NEEDS REVIEW',
      notes:notes.join(' | '),directory:dir
    });
  }
  async function exportAllSocialPacks(){
    if(state.bulkSession||!state.reviewCatalog.length)return;
    const zipModule=window.MovieReviewBulkZip;
    if(!zipModule){setBulkStatus('ZIP packager failed to load. Reload Projector Room.');return;}
    const missing=[...POST_KINDS,'story'].filter(k=>!state.masters[k]);
    if(missing.length){
      setBulkStatus('Cannot export until all four approved masters are loaded: '+missing.join(', ')+'.');
      return;
    }
    const supportsDisk=typeof window.showSaveFilePicker==='function';
    const from=supportsDisk?0:state.bulkCursor;
    const to=supportsDisk?state.reviewCatalog.length:Math.min(from+5,state.reviewCatalog.length);
    if(from>=to){state.bulkCursor=0;setBulkStatus('All batches downloaded. Click again to start a new set.');return;}
    const part=state.reviewCatalog.slice(from,to);
    const today=new Date().toISOString().slice(0,10);
    const fileName='Movie_Reviews_By_Poorna_Social_Relaunch_'+today+
      (supportsDisk?'':'_movies_'+(from+1)+'-'+to)+'.zip';
    let sink,zip;
    // Must call the native picker within the user-triggered click. With Chrome
    // this streams the single large ZIP to disk rather than collecting all PNGs
    // in JS memory. Other browsers download small, manageable ZIP batches.
    try{
      if(supportsDisk){
        const handle=await window.showSaveFilePicker({suggestedName:fileName,
          types:[{description:'ZIP archive',accept:{'application/zip':['.zip']}}]});
        sink=await handle.createWritable();
      }else sink=zipModule.memorySink();
    }catch(error){
      if(error?.name==='AbortError'){setBulkStatus('Export cancelled before starting.');return;}
      setBulkStatus('Could not open ZIP destination: '+errorMessage(error));return;
    }
    state.bulkSession={cancelled:false};
    inputs.bulkDownload.disabled=true;
    inputs.bulkCancel.hidden=false;
    const manifest=[],problems=[];
    zip=new zipModule.ZipWriter(sink);
    try{
      await zip.add('START_HERE.txt',[
        'MOVIE REVIEWS BY POORNA - SOCIAL MEDIA RELAUNCH',
        '============================================',
        'All movies appear in descending release-date order.',
        'Each movie has up to FOUR original approved-design PNGs:',
        '  images/instagram-post.png -> Instagram feed post',
        '  images/facebook-x-post.png -> Facebook feed and X post',
        '  images/whatsapp-channel.png -> WhatsApp Channel',
        '  images/story.png -> Instagram Story, Facebook Story, WhatsApp Status',
        'Seven platform-specific caption files are under captions/.',
        'For Instagram posts, full-review link is in bio/comments; Story uses a link sticker.',
        'The original poster (if available), rating, source MY POV and tracked URLs are in each movie folder.',
        'Review manifest.csv before posting. NEEDS REVIEW means one or more images',
        'were NOT exported due to missing assets or unsafe text overflow.',
        'This archive does not modify existing site reviews, saved styling or social accounts.',
        'IMPORTANT: Back up old social content before archiving/deleting older posts.',
        'Verify replacement posts and profile/bio links before removing old posts.',
        ''
      ].join('\\n'));
      // Presets are also attached to editorial per movie; avoid depending on
      // a second global fetch by gracefully using built-in defaults if needed.
      let presets={};
      try{presets=(await jsonApi('/api/admin/editorial')).presets||{};}
      catch{problems.push('Shared editorial presets could not be loaded; movie-level stored styles are still checked.');}
      for(let n=0;n<part.length;n++){
        if(state.bulkSession.cancelled)break;
        const review=part[n];
        setBulkStatus('Preparing '+(from+n+1)+' / '+state.reviewCatalog.length+
          ': '+review.t+' · '+(n+1)+'/'+part.length+' in this ZIP');
        try{await addBulkMovie(zip,review,presets,manifest);}
        catch(error){
          manifest.push({movie:review.t,release:review.rd||'',review:'',images:0,
            status:'ERROR',notes:errorMessage(error),directory:bulkFolder(review)});
        }
      }
      const headers=['Movie','Release Date','Review URL','Images Created (of 4)','Status','Notes','Folder'];
      const csv=[headers.map(csvCell).join(','),
        ...manifest.map(entry=>[
          entry.movie,entry.release,entry.review,entry.images,entry.status,entry.notes,entry.directory
        ].map(csvCell).join(','))].join('\\r\\n');
      await zip.add('manifest.csv',csv+'\\r\\n');
      await zip.add('EXPORT_REPORT.txt',[
        'Movies examined: '+manifest.length,
        'Complete image packs: '+manifest.filter(x=>x.images===4).length,
        'Movies needing review: '+manifest.filter(x=>x.images!==4).length,
        ...problems,
        '',
        'See manifest.csv for every omitted image and the reason.',
        'No movie data or social posts were modified.'
      ].join('\\n'));
      await zip.close();
      if(!supportsDisk){
        writeBlobToDownload(sink.blob(),fileName);
        state.bulkCursor=to===state.reviewCatalog.length?0:to;
      }
      const ready=manifest.filter(x=>x.images===4).length;
      const remaining=supportsDisk?0:state.reviewCatalog.length-to;
      setBulkStatus((state.bulkSession.cancelled?'Partial archive saved. ':'ZIP ready. ')+
        manifest.length+' movies, '+ready+' complete image packs; '+
        (manifest.length-ready)+' need review. '+
        (remaining?'Next click downloads the next '+Math.min(5,remaining)+' movies.':'All available movies processed.')+
        ' Check manifest.csv before publishing.');
    }catch(error){
      setBulkStatus('Bulk export failed: '+errorMessage(error)+'. Please retry. No website data was modified.');
      try{await sink.abort?.();}catch{}
    }finally{
      state.bulkSession=null;
      inputs.bulkDownload.disabled=false;
      inputs.bulkCancel.hidden=true;
      if(!supportsDisk)
        inputs.bulkDownload.textContent=state.bulkCursor?'DOWNLOAD NEXT BATCH · ZIP':'DOWNLOAD ALL MOVIES · ZIP';
    }
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
  async function saveEditorialOp(payload) {
    return jsonApi('/api/admin/editorial',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  }
  async function runEditorialSave(button,work,success){
    if(!state.review){showEditorialStatus('Select a movie first.');return;}
    if(button)button.disabled=true;
    try{await work();showEditorialStatus(success);}catch(error){showEditorialStatus('Not saved: '+errorMessage(error));}
    finally{if(button)button.disabled=false;}
  }
  inputs.bulkDownload?.addEventListener('click',exportAllSocialPacks);
  inputs.bulkCancel?.addEventListener('click',()=>{if(state.bulkSession){
    state.bulkSession.cancelled=true;
    setBulkStatus('Stopping after the current movie. The completed files will remain in a partial ZIP.');
  }});
  inputs.recalculateFit?.addEventListener('click',recalculateCurrentFit);
  inputs.scanFits?.addEventListener('click',scanAllFits);
  inputs.prepareFits?.addEventListener('click',saveSafeRecommendations);
  inputs.fitReport?.addEventListener('click',event=>{
    const button=event.target.closest('[data-auto-review-id]');
    if(!button)return;
    inputs.movie.value=button.dataset.autoReviewId;
    chooseMovie();
  });
  if(inputs.saveMovieStyle)inputs.saveMovieStyle.addEventListener('click',()=>runEditorialSave(inputs.saveMovieStyle,async()=>{
    persistDraft();
    const format=inputs.overrideFormat.checked?state.format:'shared';
    const current=cloneDraft(state.drafts[state.format]);
    await saveEditorialOp({type:'social',reviewId:Number(state.review.i),format,draft:current});
    state.savedOverrides[format]=current;
    if(format==='shared'){
      state.sharedDraft=cloneDraft(current);
      state.drafts.post=cloneDraft(current);state.drafts.story=cloneDraft(current);
      await Promise.all(['post','story'].filter(k=>state.savedOverrides[k]).map(k=>saveEditorialOp({type:'reset-social',reviewId:Number(state.review.i),format:k})));
      delete state.savedOverrides.post;delete state.savedOverrides.story;
      applyDraft(state.format);
    }
  },'Movie styling saved in D1. It will be available next time.'));
  if(inputs.saveDefaults)inputs.saveDefaults.addEventListener('click',()=>runEditorialSave(inputs.saveDefaults,async()=>{
    persistDraft();const current=state.drafts[state.format];
    await Promise.all([
      ['social.title',current.titleStyle],['social.pov',current.povStyle],['social.language',current.languageStyle]
    ].map(([key,style])=>saveEditorialOp({type:'preset',key,style})));
    state.presets={'social.title':cloneDraft(current.titleStyle),'social.pov':cloneDraft(current.povStyle),'social.language':cloneDraft(current.languageStyle)};
  },'Shared defaults saved for all future movie drafts. Existing movie-specific overrides remain unchanged.'));
  if(inputs.applyBoth)inputs.applyBoth.addEventListener('click',()=>{
    if(!state.review)return;
    persistDraft();
    const draft=cloneDraft(state.drafts[state.format]);
    state.drafts.post=cloneDraft(draft);state.drafts.story=cloneDraft(draft);
    applyDraft(state.format);requestRefresh();
    showEditorialStatus('Applied to Post and Story. Choose Save Movie Style to keep it across sessions.');
  });
  if(inputs.resetOverride)inputs.resetOverride.addEventListener('click',()=>runEditorialSave(inputs.resetOverride,async()=>{
    const format=state.format;
    await saveEditorialOp({type:'reset-social',reviewId:Number(state.review.i),format});
    delete state.savedOverrides[format];
    state.drafts[format]=cloneDraft(state.sharedDraft||defaultDraft(state.review));
    inputs.overrideFormat.checked=false;applyDraft(format);requestRefresh();
  },'Platform override reset to the shared movie styling.'));
  inputs.movie.addEventListener('change',chooseMovie);
  inputs.postPlatform.addEventListener('change',()=>{state.postPlatform=inputs.postPlatform.value;applyDraft(state.format);requestRefresh();});
  inputs.captionPlatform.addEventListener('change',updateCaptionEditor);
  inputs.captionText.addEventListener('input',()=>{if(state.review)state.captions[inputs.captionPlatform.value]=inputs.captionText.value;});
  inputs.copyCaption.addEventListener('click',()=>{const copy=inputs.captionPlatform.value==='x-post'?splitXThread(inputs.captionText.value).main:inputs.captionText.value;if(inputs.captionPlatform.value==='x-post'&&copy.length>280){inputs.captionStatus.textContent='The edited X main post exceeds 280 characters. Shorten it before copying.';return;}copyText(copy,'Message copied.');});
  inputs.copyXReply.addEventListener('click',()=>{
    if(inputs.captionPlatform.value!=='x-post')return;
    const reply=splitXThread(inputs.captionText.value).reply;
    if(reply.length>280){inputs.captionStatus.textContent='The edited X reply exceeds 280 characters. Shorten it before copying.';return;}
    copyText(reply,'X follow-up reply copied.');
  });
  inputs.copyLink.addEventListener('click',()=>copyText(inputs.trackedUrl.value,'Tracked URL copied.'));
  inputs.downloadCaptions.addEventListener('click',downloadCaptions);
  inputs.save.addEventListener('click',uploadMasters);
  inputs.dlPost.addEventListener('click',()=>downloadImage('post'));
  inputs.dlStory.addEventListener('click',()=>downloadImage('story'));
  document.querySelectorAll('[data-social-format]').forEach(button=>button.addEventListener('click',()=>switchFormat(button.dataset.socialFormat)));
  for(const name of ['title','pov','language','languageFont','languageSize','languageColor','languageAuto','rating','titleAlign','titleCase','titleAuto','povAlign','povLine','povAuto']) {
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