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
      fillRect(x,y,width,height){filledRects.push({x,y,width,height,fillStyle:this.fillStyle});},drawImage(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},stroke(){},clip(){},save(){},restore(){},
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
    Intl,Date,Number,String,Array,Math,Promise,console,
  };
  vm.runInNewContext(STUDIO_JS,ctx,{filename:'social-studio.js'});
  return {element,callbacks,document,drawnText,filledRects,buttons,styledDraws,window:win};
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
  assert.ok(h.filledRects.some(r=>r.fillStyle==='#f7010e' && Math.abs(r.width - 10.5) < 0.01), 'Quarter-star red fill drawn correctly');
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
  assert.match(h.element('socialWarnings').textContent,/cannot fit without clipping/);
});

test('Post and Story use only two approved template dimensions',()=>{
  assert.match(STUDIO_JS,/post:\s*\{\s*size: \[1080,1080\]/);
  assert.match(STUDIO_JS,/story:\s*\{\s*size: \[1080,1920\]/);
  assert.match(STUDIO_JS,/for\s*\(let i = 0; i < 5; i\+\+\)/);
  assert.doesNotMatch(STUDIO_JS,/numericX|value\.toFixed\(2\).*\/5/);
  assert.doesNotMatch(STUDIO_JS,/\.slice\(0,\s*\d+\)\s*\+\s*['"]\.\.\./);
});


test('Post and Story captions use separate tracked links and can be independently edited', async()=>{
  const h=harness();h.callbacks.get('social-studio:open')();await settle();
  h.element('socialMovie').value='7';await h.element('socialMovie').listeners.change();await settle();
  assert.match(h.element('socialCaptionText').value,/utm_source=instagram/);
  assert.match(h.element('socialTrackedUrl').value,/utm_campaign=toxic-a-fairy-tale-for-grown-ups/);
  h.element('socialCaptionText').value='MY CUSTOM IG MESSAGE';
  h.element('socialCaptionText').listeners.input();
  h.element('socialCaptionPlatform').value='facebook-post';
  h.element('socialCaptionPlatform').listeners.change();
  assert.match(h.element('socialCaptionText').value,/NOW REVIEWED/);
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

test('Metadata headers and silver value typography are rendered inside the frames',async()=>{
  const h=harness();h.callbacks.get('social-studio:open')();await settle();
  h.element('socialMovie').value='7';await h.element('socialMovie').listeners.change();await settle();
  for(const text of ['WATCHED IN',"POORNA'S RATING",'RELEASE DATE','Telugu','26 Aug 2026']) {
    assert.ok(h.drawnText.includes(text),'Expected text drawn: '+text);
  }
  assert.ok(h.styledDraws.some(d=>d.text==='Telugu' && d.font.includes('Cinzel') && d.y===439));
  assert.ok(h.styledDraws.some(d=>d.text==='26 Aug 2026' && d.font.includes('Cinzel') && d.y===700));
  assert.ok(h.styledDraws.some(d=>d.text==='Telugu' && d.font.includes('Cinzel') && d.y===650));
  assert.ok(h.styledDraws.some(d=>d.text==='26 Aug 2026' && d.font.includes('Cinzel') && d.y===978));
  assert.ok(h.styledDraws.some(d=>d.text==='WATCHED IN' && d.y===382));
  assert.ok(h.styledDraws.some(d=>d.text==='WATCHED IN' && d.y===575));
  assert.ok(!h.drawnText.some(d=>/2\.25\/5/.test(d)),'No numeric rating may be added');
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


test('Story metadata rows respect the approved master divider coordinates',async()=>{
  const h=harness();h.callbacks.get('social-studio:open')();await settle();
  h.element('socialMovie').value='7';await h.element('socialMovie').listeners.change();await settle();
  // Silver master row edges: [538,705], [705,866], [866,1039].
  // Headings must sit at least 20px within the rows, and values at least 25px.
  const drawn=(text,y)=>h.styledDraws.some(d=>d.text===text && d.y===y);
  assert.ok(drawn('WATCHED IN',575));
  assert.ok(drawn('Telugu',650));
  assert.ok(drawn("POORNA'S RATING",737));
  assert.ok(drawn('RELEASE DATE',902));
  assert.ok(drawn('26 Aug 2026',978));
  const stars=h.filledRects.filter(r=>r.fillStyle==='#f7010e' && r.y===792);
  assert.ok(stars.length>=2,'Story rating must be red stars centered inside row 2');
  const rows=[[538,705],[705,866],[866,1039]];
  for(const [i,ys] of [[0,[575,650]],[1,[737,813]],[2,[902,978]]]){
    assert.ok(ys.every(y=>y>rows[i][0]+20 && y<rows[i][1]-25),'Story row '+i+' must have padding');
  }
  assert.ok(!h.drawnText.some(t=>/2\.25\/5/.test(t)));
});

test('Post MY POV has inset space below the header and remains inside its panel',()=>{
  assert.match(STUDIO_JS,/pov: \[92,824,897,181\]/);
  const [top,height]=[824,181];
  assert.ok(top>=820,'Post MY POV content must start beneath the red tab');
  assert.ok(top+height<1017,'Post MY POV must remain inside the original bottom border');
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

test('All seven generated captions have cinema-themed calls to action and accurate tracked URLs',async()=>{
  const h=harness();h.callbacks.get('social-studio:open')();await settle();
  h.element('socialMovie').value='7';await h.element('socialMovie').listeners.change();await settle();
  const platforms=['instagram-post','instagram-story','facebook-post','facebook-story','x-post','whatsapp-channel','whatsapp-status'];
  for(const platform of platforms){
    h.element('socialCaptionPlatform').value=platform;
    h.element('socialCaptionPlatform').listeners.change();
    const caption=h.element('socialCaptionText').value;
    assert.match(caption,/🎬/u,platform+' should have cinema icon');
    assert.match(caption,/🎟️/u,platform+' should have review CTA icon');
    assert.ok(caption.includes('utm_source='),platform+' must contain tracked URL');
  }
  h.element('socialCaptionPlatform').value='x-post';
  h.element('socialCaptionPlatform').listeners.change();
  assert.ok(h.element('socialCaptionText').value.length<=280,'X caption fits within 280 characters');
  h.element('socialCaptionPlatform').value='whatsapp-channel';
  h.element('socialCaptionPlatform').listeners.change();
  assert.match(h.element('socialCaptionText').value,/\*MY POV\*/);
  assert.match(h.element('socialCaptionText').value,/Geetu aimed for a Joker-like/);
});
