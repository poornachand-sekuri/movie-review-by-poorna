import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const ROOT = process.cwd();
const STUDIO_JS = fs.readFileSync(path.join(ROOT, 'public/admin/social-studio.js'), 'utf8');
const RICH_JS = fs.readFileSync(path.join(ROOT, 'public/admin/social-rich-editor.js'), 'utf8');
const ADMIN_HTML = fs.readFileSync(path.join(ROOT, 'src/admin/projector-room.html'), 'utf8');
const ADMIN_API = fs.readFileSync(path.join(ROOT, 'src/pages/api/admin/[...path].ts'), 'utf8');
function harness(options={}) {
  const elementMap = new Map();
  const callbacks = new Map();
  const drawnText = [];
  const filledRects = [];
  const pixelFills=[];
  const styledDraws = [];
  const copied = [];
  const buttons = Object.fromEntries(['post','story'].map(kind=>[kind,{dataset:{socialFormat:kind},listeners:{},classList:{toggle(){}},addEventListener(type,cb){this.listeners[type]=cb;}}]));
  function element(id) {
    if(!elementMap.has(id))elementMap.set(id,{
      id, value:'', checked:false, textContent:'', className:'', disabled:false, files:[],
      listeners:{},
      classList:{toggle(){}, add(){},remove(){}},
      appendChild(){}, setCustomValidity(message){this.validationMessage=message;}, addEventListener(type,callback){this.listeners[type]=callback;},
      getContext(){return makeContext()},
      toBlob(callback){callback({size:123,type:'image/png'});},
    });
    return elementMap.get(id);
  }
  function makeContext(){
    const ctx={
      font:'600 24px "Inter"',
      fillRect(x,y,width,height){filledRects.push({x,y,width,height,fillStyle:this.fillStyle});},drawImage(){},beginPath(){},rect(){},moveTo(){},lineTo(){},quadraticCurveTo(){},closePath(){},stroke(){},clip(){},save(){},restore(){},
      fillText(str,x,y){drawnText.push(String(str));styledDraws.push({text:String(str),color:this.fillStyle,font:this.font,x,y});},strokeText(){},
      measureText(str){
        const size=Number(this.font.match(/(\d+)px/)?.[1]||24);
        return {width:Array.from(String(str)).length*size*0.53};
      },
    };
    if(options.pixelStars){
      // Synthetic printed outline: a closed white ring with dark center.
      // The renderer must recolor only enclosed pixels, never the white edge.
      ctx.getImageData=(x,y,w,h)=>{
        const data=new Uint8ClampedArray(w*h*4);
        const cx=w/2,cy=h/2,outer=Math.min(w,h)*.32;
        for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){
          const q=(yy*w+xx)*4,d=Math.hypot(xx-cx,yy-cy);
          const white=d>outer-2&&d<outer+1;
          data[q]=data[q+1]=data[q+2]=white?241:0;
          data[q+3]=255;
        }
        return {data,width:w,height:h};
      };
      ctx.putImageData=(imageData,x,y)=>pixelFills.push({imageData,x,y});
    }
    return ctx;
  }
  const defaults={
    socialTitleAuto:true,socialTitleAlign:'left',socialTitleCase:'uppercase',
    socialPovAuto:true,socialPovAlign:'left',socialPovLine:'1.28',
    socialCaptionPlatform:'instagram-post'
  };
  for(const [id,value] of Object.entries(defaults)){
    if(typeof value==='boolean') element(id).checked=value;
    else element(id).value=value;
  }
  const document={
    getElementById:element,
    querySelectorAll:selector=>selector==='[data-social-format]'?Object.values(buttons):[],
    fonts:{ready:Promise.resolve(),load:()=>Promise.resolve([])},
    createElement(tag){ if(tag==='option')return {value:'',textContent:''};
      if(tag==='canvas')return {width:1080,height:1080,getContext:()=>makeContext(),toBlob(callback){callback({size:100,type:'image/png'});}};
      return {click(){},remove(){},set href(url){},set download(name){}};
    },
    body:{appendChild(){}},
  };
  class ImageMock {
    constructor(){this.width=1080;this.height=1920;}
    set src(v){this._src=v;queueMicrotask(()=>this.onload?.());}
    get src(){return this._src;}
  }
  const win={addEventListener:(type,cb)=>callbacks.set(type,cb),dispatchEvent(e){return callbacks.get(e.type)?.(e);}};
  const sample={
    i:7,t:'TOXIC: A FAIRY TALE FOR GROWN-UPS',s:'toxic-a-fairy-tale-for-grown-ups',
    l:'Telugu',rd:'2026-08-26',r:2.25,m:'https://assets.moviereviewbypoorna.com/reviews/toxic/poster.jpg',
    v:'Geetu aimed for a Joker-like mindf*er, but ended up making a JOKER out of everyone involved!!!!'
  };
  const fetchMock=async url=>({
    ok:true,json:async()=>url.includes('compact=1')?[{i:7,t:sample.t}]:sample
  });
  const ctx={
    document,window:win,Image:ImageMock,
    fetch:fetchMock,Event:class {constructor(type){this.type=type;}},
    requestAnimationFrame:cb=>setImmediate(cb),
    setTimeout,clearTimeout,URL,Blob,FormData,File:class{},
    Intl,Date,Number,String,Array,Math,Promise,console,navigator:{clipboard:{writeText:async text=>{copied.push(text);}}},
  };
  vm.runInNewContext(STUDIO_JS,ctx,{filename:'social-studio.js'});
  return {element,callbacks,document,drawnText,filledRects,pixelFills,buttons,styledDraws,copied,window:win};
}
const settle=async()=>{for(let i=0;i<6;i++)await new Promise(resolve=>setImmediate(resolve));};

test('Admin routes and approved master image endpoints are present and protected',()=>{
  assert.match(ADMIN_HTML,/data-panel="social"/);
  assert.match(ADMIN_HTML,/id="socialCanvas"/);
  assert.match(ADMIN_HTML,/social-studio\.js/);
  assert.match(ADMIN_API,/if \(!\(await isAdminAuthenticated\(request\)\)\)/);
  assert.match(ADMIN_API,/pathname === '\/api\/admin\/social-master'/);
  assert.match(ADMIN_API,/pathname === '\/api\/admin\/social-poster'/);
  assert.match(ADMIN_API,/getSocialPoster\(url\.searchParams\.get\('url'\)\)/);
});

test('Social Studio initializes, previews movie data, and retains the original verdict', async()=>{
  const h=harness();
  h.callbacks.get('social-studio:open')();
  await settle();
  const movies=h.element('socialMovie');
  assert.equal(typeof movies.listeners.change,'function');
  movies.value='7';
  await movies.listeners.change();
  await settle();
  assert.equal(h.element('socialTitle').value,'TOXIC: A FAIRY TALE FOR GROWN-UPS');
  assert.match(h.element('socialPov').value,/Geetu aimed for a Joker-like/);
  assert.equal(h.element('socialDownloadPost').disabled,false);
  assert.equal(h.element('socialDownloadStory').disabled,false);
  assert.ok(h.drawnText.some(t=>t.includes('JOKER')));
  assert.ok(!h.drawnText.some(t=>/2\.25\/5/.test(t)));
  assert.ok(h.filledRects.some(r=>r.fillStyle==='#f7010e' && Math.abs(r.width - 10) < 0.01), 'Quarter-star red fill drawn correctly');
});

test('MY POV overflow blocks PNG exports instead of silently truncating', async()=>{
  const h=harness();h.callbacks.get('social-studio:open')();await settle();
  h.element('socialMovie').value='7';
  await h.element('socialMovie').listeners.change();await settle();
  h.element('socialPov').value='VERY LONG UNBROKEN VERDICT '.repeat(150);
  h.element('socialPov').listeners.input();
  await settle();
  assert.equal(h.element('socialDownloadPost').disabled,true);
  assert.equal(h.element('socialDownloadStory').disabled,false,'Story remains valid when only Post text overflows');
  assert.match(h.element('socialWarnings').textContent,/cannot fit inside the panel/);
});

test('Four approved templates share two export dimensions',()=>{
  assert.match(STUDIO_JS,/post:\s*\{\s*size:\s*\[1080,1080\]/);
  assert.match(STUDIO_JS,/story:\s*\{\s*size:\s*\[1080,1920\]/);
  assert.match(STUDIO_JS,/for\(let i=0;i<5;i\+\+\)/);
  assert.doesNotMatch(STUDIO_JS,/numericX|value\.toFixed\(2\).*\/5/);
  assert.doesNotMatch(STUDIO_JS,/\.slice\(0,\s*\d+\)\s*\+\s*['"]\.\.\./);
});


test('Post and Story captions use separate tracked links and can be independently edited', async()=>{
  const h=harness();h.callbacks.get('social-studio:open')();await settle();
  h.element('socialMovie').value='7';await h.element('socialMovie').listeners.change();await settle();
  assert.match(h.element('socialCaptionText').value,/LINK IN BIO/i);
  assert.match(h.element('socialTrackedUrl').value,/utm_campaign=toxic-a-fairy-tale-for-grown-ups/);
  h.element('socialCaptionText').value='MY CUSTOM IG MESSAGE';
  h.element('socialCaptionText').listeners.input();
  h.element('socialCaptionPlatform').value='facebook-post';
  h.element('socialCaptionPlatform').listeners.change();
  assert.match(h.element('socialCaptionText').value,/Auditorium/);
  assert.match(h.element('socialTrackedUrl').value,/utm_source=facebook/);
  h.element('socialCaptionPlatform').value='instagram-post';
  h.element('socialCaptionPlatform').listeners.change();
  assert.equal(h.element('socialCaptionText').value,'MY CUSTOM IG MESSAGE');
});
test('Separate Post/Story drafts preserve title, MY POV, metadata and layout controls',async()=>{
  const h=harness();h.callbacks.get('social-studio:open')();await settle();
  h.element('socialMovie').value='7';await h.element('socialMovie').listeners.change();await settle();
  h.element('socialTitle').value='CUSTOM POST TITLE';h.element('socialTitle').listeners.input();
  h.element('socialLanguage').value='Tamil';h.element('socialLanguage').listeners.input();
  h.element('socialPovAlign').value='center';h.element('socialPovAlign').listeners.input();
  h.buttons.story.listeners.click();
  assert.equal(h.element('socialTitle').value,'TOXIC: A FAIRY TALE FOR GROWN-UPS');
  assert.equal(h.element('socialLanguage').value,'Telugu');
  assert.equal(h.element('socialPovAlign').value,'left');
  h.element('socialPov').value='STORY ONLY VERDICT';h.element('socialPov').listeners.input();
  h.buttons.post.listeners.click();
  assert.equal(h.element('socialTitle').value,'CUSTOM POST TITLE');
  assert.equal(h.element('socialPovAlign').value,'center');
  assert.equal(h.element('socialLanguage').value,'Tamil');
  h.buttons.story.listeners.click();
  assert.equal(h.element('socialPov').value,'STORY ONLY VERDICT');
});

test('Inline rich-text toolbars replace detached per-word editor controls',()=>{
  assert.match(ADMIN_HTML,/data-rich-toolbar="title"/);
  assert.match(ADMIN_HTML,/data-rich-toolbar="pov"/);
  assert.match(ADMIN_HTML,/data-rich-editor="title"/);
  assert.match(ADMIN_HTML,/data-rich-editor="pov"/);
  assert.match(ADMIN_HTML,/social-rich-editor\.js/);
  assert.doesNotMatch(ADMIN_HTML,/id="socialApplyWordStyle"/);
  assert.match(RICH_JS,/window\.SocialStudioRich\s*=/);
  assert.match(RICH_JS,/selectionOffsets/);
  assert.match(RICH_JS,/mutateRanges/);
  assert.match(RICH_JS,/plainInsert/);
  assert.match(RICH_JS,/clipboardData\?\.getData\('text\/plain'\)/);
  assert.match(RICH_JS,/socialStyle/);
  assert.match(STUDIO_JS,/window\.SocialStudioRichBridge/);
  assert.match(STUDIO_JS,/window\.SocialStudioRich\?\.sync\(\)/);
  assert.doesNotThrow(()=>new vm.Script(RICH_JS));
});

test('Locked master icons and metadata headers are not redrawn over approved art',async()=>{
  const h=harness();h.callbacks.get('social-studio:open')();await settle();
  h.element('socialMovie').value='7';await h.element('socialMovie').listeners.change();await settle();
  const drawn=(value,y)=>h.styledDraws.some(d=>d.text===value && d.y===y);
  assert.ok(drawn('Telugu',622),'Post language is positioned in left metadata panel');
  assert.ok(drawn('Telugu',1211),'Story language is positioned in left metadata panel');
  assert.ok(!h.drawnText.includes('RELEASE DATE'),'No release date overlay');
  assert.ok(!h.drawnText.includes("POORNA'S RATING"),'Master already contains rating header');
  assert.ok(h.styledDraws.some(d=>d.text==='Telugu' && d.font.includes('Oswald')));
  assert.ok(!h.drawnText.some(d=>d.includes('2.25/5')),'No numeric rating');
});
test('Rich edits support color, font, size, glow, italic and underline on exports',()=>{
  assert.match(ADMIN_HTML,/data-rich-action="color"/);
  assert.match(RICH_JS,/style\.color/);
  assert.match(RICH_JS,/style\.font/);
  assert.match(RICH_JS,/style\.italic/);
  assert.match(RICH_JS,/style\.underline/);
  assert.match(STUDIO_JS,/style\?\.italic/);
  assert.match(STUDIO_JS,/piece\.style\?\.underline/);
});


test('Story metadata uses two columns and retains an empty dynamic title ticket',async()=>{
  const h=harness();h.callbacks.get('social-studio:open')();await settle();
  h.element('socialMovie').value='7';await h.element('socialMovie').listeners.change();await settle();
  assert.ok(h.styledDraws.some(x=>x.text==='Telugu'&&x.y===1211));
  assert.ok(!h.drawnText.some(x=>/RELEASE DATE|26 Aug 2026/.test(x)));
  const stars=h.filledRects.filter(r=>r.fillStyle==='#f7010e'&&Math.abs(r.y-1186.8)<.01);
  assert.ok(stars.length>=2,'Five quarter-filled rating stars sit in Story rating panel');
});
test('MY POV has top inset and stays inside the new approved red panel',()=>{
  assert.ok(STUDIO_JS.includes('pov:[485,748,517,128]'));
  assert.ok(STUDIO_JS.includes('pov:[99,1388,870,197]'));
  assert.ok(748+128<891,'Post MY POV has interior bottom clearance');
  assert.ok(1388+197<1612,'Story MY POV has interior bottom clearance');
});

test('Partial-word selection renders only selected letters in the chosen color and font',async()=>{
  const h=harness();h.callbacks.get('social-studio:open')();await settle();
  h.element('socialMovie').value='7';await h.element('socialMovie').listeners.change();await settle();
  const draft=h.window.SocialStudioRichBridge.getDraft();
  draft.styles.pov=[{start:0,end:3,color:'#19f9ff',font:'Cinzel',size:50,effect:'glow'}];
  h.window.SocialStudioRichBridge.refresh();await settle();
  assert.ok(h.styledDraws.some(d=>d.text==='Gee'&&d.color==='#19f9ff'&&d.font.includes('Cinzel')),
    'Only first three letters of Geetu should get the custom style');
  assert.ok(h.styledDraws.some(d=>d.text==='tu'&&d.color==='#f1f1f1'),
    'Remaining letters in the same word must retain silver/white');
  assert.ok(!h.drawnText.some(d=>d==='2.25/5'),'Stars must stay numeric-free');
});

test('No duplicate typography sliders and obsolete detached word controls remain',()=>{
  assert.match(ADMIN_HTML,/Layout &amp; Text Fit/);
  assert.doesNotMatch(ADMIN_HTML,/<h2>Title Typography<\/h2>/);
  assert.doesNotMatch(ADMIN_HTML,/<h2>MY POV Typography<\/h2>/);
  assert.doesNotMatch(ADMIN_HTML,/id="socialTitleSize"/);
  assert.doesNotMatch(ADMIN_HTML,/id="socialWordFont"/);
  assert.doesNotMatch(STUDIO_JS,/inputs\.titleSizeOut|inputs\.povSizeOut|activeText:'pov'/);
  assert.match(RICH_JS,/the entire text/);
  assert.match(RICH_JS,/refreshLayout/);
  assert.match(RICH_JS,/editor\.style\.fontSize='19px'/);
});


test('Title and MY POV keep text-fit controls inline with their respective editors',()=>{
  const title=ADMIN_HTML.indexOf('id="socialTitleRich"');
  const pov=ADMIN_HTML.indexOf('id="socialPovRich"');
  const watched=ADMIN_HTML.indexOf('id="socialLanguage"');
  assert.ok(title>=0 && pov>title && watched>pov,'Title, MY POV and WATCHED IN remain ordered');
  const titleSection=ADMIN_HTML.slice(title,pov);
  const povSection=ADMIN_HTML.slice(pov,watched);
  for(const id of ['socialTitleAlign','socialTitleCase','socialTitleAuto']){
    assert.ok(titleSection.includes('id="'+id+'"'),id+' must be located directly with title');
    assert.ok(!povSection.includes('id="'+id+'"'),id+' must not be duplicated with MY POV');
  }
  for(const id of ['socialPovAlign','socialPovLine','socialPovAuto']){
    assert.ok(povSection.includes('id="'+id+'"'),id+' must be located directly with MY POV');
    assert.ok(!titleSection.includes('id="'+id+'"'),id+' must not be duplicated with title');
  }
  for(const id of ['socialTitleAlign','socialTitleCase','socialTitleAuto','socialPovAlign','socialPovLine','socialPovAuto']){
    assert.equal(ADMIN_HTML.split('id="'+id+'"').length-1,1,id+' must retain exactly one unique DOM ID');
  }
  assert.equal((ADMIN_HTML.match(/<fieldset class="social-inline-fit"/g)||[]).length,2);
  assert.doesNotMatch(ADMIN_HTML,/class="social-group social-fit-controls"/);
  assert.match(ADMIN_HTML,/id="socialLanguageAuto"/,'WATCHED IN auto-fit stays in its current place');
  assert.match(ADMIN_HTML,/id="socialSaveDefaults"/,'persistent style-save action remains');
  assert.match(ADMIN_HTML,/id="socialOverrideFormat"/,'per-format overrides remain');
});

test('All seven platform messages include the four canonical accounts with a blank line between every line',async()=>{
  const h=harness();h.callbacks.get('social-studio:open')();await settle();
  h.element('socialMovie').value='7';await h.element('socialMovie').listeners.change();await settle();
  const links=[
    'https://www.instagram.com/moviereviewbypoorna/',
    'https://www.facebook.com/moviereviewbypoorna',
    'https://x.com/reviewbypoorna',
    'https://whatsapp.com/channel/0029VaKoQMp2UPBPOlNDg546'
  ];
  for(const platform of ['instagram-post','instagram-story','facebook-post','facebook-story','x-post','whatsapp-channel','whatsapp-status']){
    h.element('socialCaptionPlatform').value=platform;
    h.element('socialCaptionPlatform').listeners.change();
    const caption=h.element('socialCaptionText').value;
    assert.match(caption,/🎬/u,platform+' cinema icon');
    assert.match(caption,/🎟️/u,platform+' review CTA icon');
    assert.doesNotMatch(caption,/Geetu aimed for a Joker-like/,platform+' should not duplicate the full MY POV');
    assert.match(h.element('socialTrackedUrl').value,/utm_source=/);
    if(platform!=='instagram-post')assert.match(caption,/utm_source=/);
    for(const link of links)assert.ok(caption.includes(link),platform+' must promote '+link);
    for(const symbol of ['📸 Instagram:','ⓕ Facebook:','𝕏 X:','💬 WhatsApp']){
      assert.ok(caption.includes(symbol),platform+' needs the finalized '+symbol+' caption symbol');
    }
    assert.ok(!caption.includes('🔵 Facebook')&&!caption.includes('🟢 WhatsApp'),platform+' must not use generic colored dots');
    assert.doesNotMatch(caption,/(?<!\n)\n(?!\n)/u,platform+' must have one blank line between displayed lines');
  }
  h.element('socialCaptionPlatform').value='instagram-post';
  h.element('socialCaptionPlatform').listeners.change();
  assert.match(h.element('socialCaptionText').value,/🎞️ THE MOVIE TALK DOESN'T END HERE!/);
  assert.match(h.element('socialCaptionText').value,/🎥 ONE LOVE. MANY SCREENS./);
  assert.doesNotMatch(h.element('socialCaptionText').value,/caption URLs are not tappable/i);
  h.element('socialCaptionPlatform').value='whatsapp-channel';
  h.element('socialCaptionPlatform').listeners.change();
  assert.match(h.element('socialCaptionText').value,/Instagram: /);
  assert.match(h.element('socialCaptionText').value,/Facebook: /);
  assert.match(h.element('socialCaptionText').value,/WhatsApp Channel:/);
});
test('X captions are safely split into two copyable posts, including all four follow links',async()=>{
  const h=harness();h.callbacks.get('social-studio:open')();await settle();
  h.element('socialMovie').value='7';await h.element('socialMovie').listeners.change();await settle();
  h.element('socialCaptionPlatform').value='x-post';
  h.element('socialCaptionPlatform').listeners.change();
  const text=h.element('socialCaptionText').value;
  const [main,reply]=text.split('=== X FOLLOW-UP REPLY (POST 2/2) ===').map(x=>x.trim());
  assert.ok(main&&reply,'X uses separate main post and follow-up reply');
  assert.ok(main.length<=280,'X main is too long: '+main.length);
  assert.ok(reply.length<=280,'X follow-up is too long: '+reply.length);
  assert.match(main,/utm_source=x/);
  assert.match(reply,/x\.com\/reviewbypoorna/);
  assert.equal(h.element('socialCopyCaption').textContent,'COPY X POST 1/2');
  assert.equal(h.element('socialCopyXReply').hidden,false);
  h.element('socialCopyCaption').listeners.click();await settle();
  h.element('socialCopyXReply').listeners.click();await settle();
  assert.deepEqual(h.copied,[main,reply]);
  h.element('socialCaptionPlatform').value='facebook-post';
  h.element('socialCaptionPlatform').listeners.change();
  assert.equal(h.element('socialCopyXReply').hidden,true);
  assert.equal(h.element('socialCopyCaption').textContent,'COPY MESSAGE');
});
test('Approved poster openings use the existing-site contain and softened full-frame technique',()=>{
  assert.match(STUDIO_JS,/poster:\[59,299,375,580\]/);
  assert.match(STUDIO_JS,/poster:\[48,293,378,592\]/);
  assert.match(STUDIO_JS,/poster:\[56,283,365,594\]/);
  assert.match(STUDIO_JS,/poster:\[259,276,562,602\]/);
  assert.ok(STUDIO_JS.includes('Math.max((w+2*bleed)/image.width,(h+2*bleed)/image.height)'));
  assert.match(STUDIO_JS,/Math\.min\(w\/image\.width,h\/image\.height\)/);
  assert.match(STUDIO_JS,/blur\(14px\) brightness\(\.33\) saturate\(\.75\)/);
  assert.match(STUDIO_JS,/posterOpeningPath\(ctx,box\);/);
  assert.ok(!!ADMIN_HTML.match(/socialCopyXReply/),'X reply copy button is available');
});

test('Admin UI allows 4 approved masters and Post platform selection without editing review records',async()=>{
  for(const id of ['socialInstagramFile','socialFacebookXFile','socialWhatsAppFile','socialStoryFile','socialPostPlatform'])
    assert.ok(ADMIN_HTML.includes('id="'+id+'"'),id+' must exist');
  assert.match(ADMIN_API,/facebook-x-post/);
  const h=harness();h.callbacks.get('social-studio:open')();await settle();
  h.element('socialMovie').value='7';await h.element('socialMovie').listeners.change();await settle();
  const selected=h.element('socialPostPlatform');
  selected.value='facebook-x-post';selected.listeners.change();await settle();
  assert.match(h.element('socialEditingMode').textContent,/FACEBOOK X POST/);
  selected.value='whatsapp-channel';selected.listeners.change();await settle();
  assert.match(h.element('socialEditingMode').textContent,/WHATSAPP CHANNEL/);
  assert.ok(!STUDIO_JS.includes('drawPostMeta('));
});

test('Rating fills exactly the five baked stars without adding another set of outlines',async()=>{
  assert.doesNotMatch(STUDIO_JS,/ctx\.stroke\(\)/);
  assert.match(STUDIO_JS,/Star outlines are PRINTED|empty white outlines are baked/);
  for(const [platform,expectedY,expectedFirstX] of [
    ['instagram-post',581.5,740.5],
    ['facebook-x-post',555.3,735.4],
    ['whatsapp-channel',578,710.5]
  ]){
    const h=harness();h.callbacks.get('social-studio:open')();await settle();
    h.element('socialMovie').value='7';await h.element('socialMovie').listeners.change();await settle();
    h.element('socialPostPlatform').value=platform;h.element('socialPostPlatform').listeners.change();await settle();
    const red=h.filledRects.filter(r=>r.fillStyle==='#f7010e'&&Math.abs(r.y-expectedY)<.1);
    assert.ok(red.length>=3,platform+' must fill each rated star in the master');
    assert.ok(Math.abs(red[0].x-expectedFirstX)<.1,platform+' must not shift the first star');
    assert.ok(red[2].width>0,'Quarter step present');
  }
});
test('Poster retains all its original image with a blurred contextual fill',()=>{
  assert.match(STUDIO_JS,/function drawPoster\(ctx,image,box\)/);
  assert.match(STUDIO_JS,/blur\(14px\) brightness\(\.33\) saturate\(\.75\)/);
  assert.match(STUDIO_JS,/Math\.min\(w\/image\.width,h\/image\.height\)/);
  assert.match(STUDIO_JS,/posterOpeningPath\(ctx,box\);/);
});
test('Rich text is clipped to panel and line heights cannot overlap the header',()=>{
  assert.match(STUDIO_JS,/ctx\.rect\(x,y,width,height\);ctx\.clip\(\)/);
  assert.match(STUDIO_JS,/Math\.max\(1\.25,options\.line\)/);
  assert.match(STUDIO_JS,/pov:\[99,1388,870,197\]/);
});

test('Social Studio uses branded, accessible icon links for all four official accounts',()=>{
  for(const network of ['instagram','facebook','x','whatsapp']){
    assert.ok(ADMIN_HTML.includes('social-platform-icon--'+network+'"'),'A branded '+network+' link is rendered');
  }
  assert.ok(ADMIN_HTML.includes('aria-label="Open our official social media accounts"'));
  assert.ok(ADMIN_HTML.includes('https://x.com/reviewbypoorna'));
  assert.ok(ADMIN_HTML.includes('https://whatsapp.com/channel/'));
  assert.ok(ADMIN_HTML.includes('social-studio.css?v=9'));
  assert.ok(ADMIN_HTML.includes('social-studio.js?v=12'));
  assert.ok(ADMIN_HTML.includes('social-rich-editor.js?v=4'));

});
test('All dynamic poster draws use inner rounded clipping and never paint over the approved borders',()=>{
  for(const needle of ['function posterOpeningPath(ctx,box)','ctx.quadraticCurveTo(','posterOpeningPath(ctx,box);','ctx.clip();','const bleed=16,cover=Math.max','const contain=Math.min',"ctx.filter='none'"]){
    assert.ok(STUDIO_JS.includes(needle),needle+' must be present in the renderer');
  }
});

test('Pixels inside baked stars fill red while the original white outline stays intact',async()=>{
  const h=harness({pixelStars:true});
  h.callbacks.get('social-studio:open')();await settle();
  h.element('socialMovie').value='7';await h.element('socialMovie').listeners.change();await settle();
  assert.ok(h.pixelFills.length>=6,'Image-data star fills should run on Post and Story');
  const pixels=h.pixelFills[0].imageData,bytes=pixels.data;
  let red=0,white=0,brokenWhite=0;
  const side=pixels.width, cx=side/2,cy=pixels.height/2,outer=side*.32;
  for(let y=0;y<pixels.height;y++)for(let x=0;x<pixels.width;x++){
    const k=(y*pixels.width+x)*4,d=Math.hypot(x-cx,y-cy);
    const isRed=bytes[k]===247&&bytes[k+1]===1&&bytes[k+2]===14;
    if(isRed)red++;
    if(d>outer-2&&d<outer+1){
      white++;
      if(isRed)brokenWhite++;
    }
  }
  assert.ok(red>70,'Interior is filled with the correct red');
  assert.ok(white>80,'Synthetic white ring was supplied');
  assert.equal(brokenWhite,0,'Printed star outlines must stay white');
});
test('Poster rectangles have verified clearances from the four approved master borders',()=>{
  const boxes=[
    {id:'Instagram',x:59,y:299,w:375,h:580,left:51,right:440,top:290,bottom:890},
    {id:'Facebook/X',x:48,y:293,w:378,h:592,left:41,right:430,top:283,bottom:895},
    {id:'WhatsApp Channel',x:56,y:283,w:365,h:594,left:50,right:428,top:273,bottom:887},
    {id:'Story',x:259,y:276,w:562,h:602,left:250,right:829,top:263,bottom:890}
  ];
  for(const b of boxes){
    assert.ok(b.x>=b.left+5,b.id+' left inner clearance');
    assert.ok(b.x+b.w<=b.right-3,b.id+' right inner clearance');
    assert.ok(b.y>=b.top+5,b.id+' top inner clearance');
    assert.ok(b.y+b.h<=b.bottom-5,b.id+' bottom inner clearance');
    assert.ok(STUDIO_JS.includes('poster:['+[b.x,b.y,b.w,b.h].join(',')+']'),b.id+' measured aperture used');
  }
  assert.ok(STUDIO_JS.includes('y:575.8,r:24.5'),'Facebook rating centered on baked white stars');
});

test('Both promotional rich editors provide twelve fonts, fourteen colors and custom HEX',()=>{
  const fonts=['Inter','Oswald','Cinzel','Source Serif 4','Bebas Neue','Anton',
    'Barlow Condensed','Montserrat','Playfair Display','Poppins','Rajdhani','Merriweather'];
  const palettes=['#060505','#F1F1F1','#FFF7E6','#F7010E','#F7D154','#FFBF47',
    '#FF8F59','#19F9FF','#4F9FFF','#C770FF','#F578BA','#42D7A4','#B4D6FF','#AEB7C2'];
  const blocks=['title','pov'].map(field=>{
    const start=ADMIN_HTML.indexOf('data-rich-toolbar="'+field+'"');
    const end=ADMIN_HTML.indexOf('data-rich-editor="'+field+'"',start);
    assert.ok(start>=0&&end>start,field+' formatting toolbar exists');
    return ADMIN_HTML.slice(start,end);
  });
  for(const block of blocks){
    for(const font of fonts)assert.ok(block.includes('value="'+font+'"'),font+' font available in both editors');
    for(const hex of palettes)assert.ok(block.includes('data-rich-color="'+hex+'"'),hex+' quick color available');
    assert.ok(block.includes('data-rich-action="hex"'),'Custom HEX entry');
    assert.ok(block.includes('data-rich-action="color"'),'Unrestricted color wheel');
    assert.equal((block.match(/data-rich-color=/g)||[]).length,14);
  }
  assert.ok(STUDIO_JS.includes('SOCIAL_FONTS.includes(style?.font)'),'export renderer uses expanded fonts');
  assert.ok(RICH_JS.includes("command==='hex'"),'Selected text can use a custom HEX');
  assert.ok(RICH_JS.includes('editor.style.color=base.color'),'Preview respects base text color');
  assert.ok(STUDIO_JS.includes("document.fonts.load('700 48px"),'Fonts load before measurement and image export');
});
test('WATCHED IN supports per-format font, font size, auto-fit and color without editing the movie record',async()=>{
  for(const id of ['socialLanguageFont','socialLanguageSize','socialLanguageColor','socialLanguageAuto'])
    assert.ok(ADMIN_HTML.includes('id="'+id+'"'),id+' must be editable');
  const h=harness();
  h.callbacks.get('social-studio:open')();await settle();
  h.element('socialMovie').value='7';await h.element('socialMovie').listeners.change();await settle();
  assert.ok(h.styledDraws.some(x=>x.text==='Telugu'&&x.font.includes('Oswald')),'Default cinematic font');
  const before=h.styledDraws.length;
  h.element('socialLanguageFont').value='Montserrat';
  h.element('socialLanguageFont').listeners.input();await settle();
  h.element('socialLanguageSize').value='44';
  h.element('socialLanguageSize').listeners.input();await settle();
  h.element('socialLanguageColor').value='#f7d154';
  h.element('socialLanguageColor').listeners.input();await settle();
  assert.ok(h.styledDraws.slice(before).some(x=>x.text==='Telugu'&&x.font.includes('Montserrat')&&x.color==='#f7d154'));
  assert.equal(h.element('socialLanguageFont').value,'Montserrat');
  h.buttons.story.listeners.click();await settle();
  assert.equal(h.element('socialLanguageFont').value,'Oswald','Story draft keeps its own typography');
  h.buttons.post.listeners.click();await settle();
  assert.equal(h.element('socialLanguageFont').value,'Montserrat','Post language styling is preserved');
  assert.equal(h.element('socialLanguageColor').value,'#f7d154');
});
test('WATCHED IN long values auto-fit or warn before download, never cross section borders',async()=>{
  const h=harness();
  h.callbacks.get('social-studio:open')();await settle();
  h.element('socialMovie').value='7';await h.element('socialMovie').listeners.change();await settle();
  h.element('socialLanguage').value='Telugu / Hindi / Tamil / Kannada';
  h.element('socialLanguage').listeners.input();await settle();
  assert.match(h.element('socialWarnings').textContent,/WATCHED IN value is too long|Preview ready/);
  h.element('socialLanguageAuto').checked=false;
  h.element('socialLanguageAuto').listeners.change();await settle();
  assert.match(h.element('socialWarnings').textContent,/WATCHED IN value is too long/);
  assert.equal(h.element('socialDownloadPost').disabled,true);
});


test('Unified style actions are present and save without changing original review fields', async()=>{
  assert.match(ADMIN_HTML,/id="socialSaveMovieStyle"/);
  assert.match(ADMIN_HTML,/id="socialSaveDefaults"/);
  assert.match(ADMIN_HTML,/id="socialApplyBoth"/);
  assert.match(ADMIN_HTML,/id="socialOverrideFormat"/);
  assert.match(STUDIO_JS,/type:'social'/);
  assert.match(STUDIO_JS,/type:'preset'/);
  assert.match(STUDIO_JS,/\/api\/admin\/editorial/);
});
test('Shared format styling can be copied without changing the original source review',async()=>{
  const h=harness();h.callbacks.get('social-studio:open')();await settle();
  h.element('socialMovie').value='7';await h.element('socialMovie').listeners.change();await settle();
  h.buttons.story.listeners.click();
  h.element('socialPov').value='STORY PERSONALIZATION';
  h.element('socialPov').listeners.input();await settle();
  h.element('socialApplyBoth').listeners.click();await settle();
  h.buttons.post.listeners.click();
  assert.equal(h.element('socialPov').value,'STORY PERSONALIZATION');
  await h.element('socialSaveMovieStyle').listeners.click();await settle();
  assert.match(h.element('socialEditorialStatus').textContent,/saved in D1/i);
});
test('Editorial schema is additive and production Worker deploy gates on migration',()=>{
  const migration=fs.readFileSync(path.join(ROOT,'migrations/0009_unified_editorial.sql'),'utf8');
  const deploy=fs.readFileSync(path.join(ROOT,'scripts/cloudflare.mjs'),'utf8');
  assert.match(migration,/CREATE TABLE IF NOT EXISTS editorial_presets/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS social_promotional_drafts/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS review_verdict_formatting/);
  assert.doesNotMatch(migration,/DROP TABLE|DELETE FROM reviews|UPDATE reviews/);
  assert.match(deploy,/apply-unified-editorial\.mjs/);
});
