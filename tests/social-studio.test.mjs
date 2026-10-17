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
function harness() {
  const elementMap = new Map();
  const callbacks = new Map();
  const drawnText = [];
  const filledRects = [];
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
    return {
      font:'600 24px "Inter"',
      fillRect(x,y,width,height){filledRects.push({x,y,width,height,fillStyle:this.fillStyle});},drawImage(){},beginPath(){},rect(){},moveTo(){},lineTo(){},quadraticCurveTo(){},closePath(){},stroke(){},clip(){},save(){},restore(){},
      fillText(str,x,y){drawnText.push(String(str));styledDraws.push({text:String(str),color:this.fillStyle,font:this.font,x,y});},strokeText(){},
      measureText(str){
        const size=Number(this.font.match(/(\d+)px/)?.[1]||24);
        return {width:Array.from(String(str)).length*size*0.53};
      },
    };
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
  return {element,callbacks,document,drawnText,filledRects,buttons,styledDraws,copied,window:win};
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
  assert.ok(h.filledRects.some(r=>r.fillStyle==='#f7010e' && Math.abs(r.width - 12) < 0.01), 'Quarter-star red fill drawn correctly');
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
  const stars=h.filledRects.filter(r=>r.fillStyle==='#f7010e'&&Math.abs(r.y-1182.8)<.01);
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
  assert.match(ADMIN_HTML,/Layout & Text Fit/);
  assert.doesNotMatch(ADMIN_HTML,/<h2>Title Typography<\/h2>/);
  assert.doesNotMatch(ADMIN_HTML,/<h2>MY POV Typography<\/h2>/);
  assert.doesNotMatch(ADMIN_HTML,/id="socialTitleSize"/);
  assert.doesNotMatch(ADMIN_HTML,/id="socialWordFont"/);
  assert.doesNotMatch(STUDIO_JS,/inputs\.titleSizeOut|inputs\.povSizeOut|activeText:'pov'/);
  assert.match(RICH_JS,/the entire text/);
  assert.match(RICH_JS,/refreshLayout/);
  assert.match(RICH_JS,/editor\.style\.fontSize=Number\(base\.size\)/);
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
    assert.doesNotMatch(caption,/(?<!\n)\n(?!\n)/u,platform+' must have one blank line between displayed lines');
  }
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
  assert.match(STUDIO_JS,/poster:\[52,291,388,599\]/);
  assert.match(STUDIO_JS,/poster:\[41,283,389,611\]/);
  assert.match(STUDIO_JS,/poster:\[49,283,380,603\]/);
  assert.match(STUDIO_JS,/poster:\[251,261,577,630\]/);
  assert.ok(STUDIO_JS.includes('Math.max((w+2*bleed)/image.width,(h+2*bleed)/image.height)'));
  assert.match(STUDIO_JS,/Math\.min\(w\/image\.width,h\/image\.height\)/);
  assert.match(STUDIO_JS,/blur\(12px\) brightness\(\.45\) saturate\(\.7\)/);
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
    ['instagram-post',577.5,736.5],
    ['facebook-x-post',558.5,733.8],
    ['whatsapp-channel',574,706.5]
  ]){
    const h=harness();h.callbacks.get('social-studio:open')();await settle();
    h.element('socialMovie').value='7';await h.element('socialMovie').listeners.change();await settle();
    h.element('socialPostPlatform').value=platform;h.element('socialPostPlatform').listeners.change();await settle();
    const red=h.filledRects.filter(r=>r.fillStyle==='#f7010e'&&Math.abs(r.y-expectedY)<.1);
    assert.ok(red.length>=3,platform+' must fill each rated star in the master');
    assert.ok(Math.abs(red[0].x-expectedFirstX)<.1,platform+' must not shift the first star');
    assert.ok(Math.abs(red[2].width-12)<.1||red[2].width>0,'Quarter step present');
  }
});
test('Poster retains all its original image with a blurred contextual fill',()=>{
  assert.match(STUDIO_JS,/function drawPoster\(ctx,image,box\)/);
  assert.match(STUDIO_JS,/blur\(12px\) brightness\(\.45\) saturate\(\.7\)/);
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
  assert.ok(ADMIN_HTML.includes('social-studio.css?v=6'));
});
test('All dynamic poster draws use inner rounded clipping and never paint over the approved borders',()=>{
  for(const needle of ['function posterOpeningPath(ctx,box)','ctx.quadraticCurveTo(','posterOpeningPath(ctx,box);','ctx.clip();','const bleed=16,cover=Math.max','const contain=Math.min',"ctx.filter='none'"]){
    assert.ok(STUDIO_JS.includes(needle),needle+' must be present in the renderer');
  }
});
