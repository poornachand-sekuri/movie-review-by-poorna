import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const ROOT = process.cwd();
const STUDIO_JS = fs.readFileSync(path.join(ROOT, 'public/admin/social-studio.js'), 'utf8');
const RICH_JS = fs.readFileSync(path.join(ROOT, 'public/admin/social-rich-editor.js'), 'utf8');
const BULK_ZIP_JS=fs.readFileSync(path.join(ROOT,'public/admin/social-bulk-zip.js'),'utf8');
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
  const downloadedBlobs=[];
  const buttons = Object.fromEntries(['post','story'].map(kind=>[kind,{dataset:{socialFormat:kind},listeners:{},classList:{toggle(){}},addEventListener(type,cb){this.listeners[type]=cb;}}]));
  const formatKeys=['instagram-post','instagram-story','facebook-post','facebook-story','x-post','whatsapp-channel','whatsapp-status'];
  const bulkButtons=Object.fromEntries(formatKeys.map(format=>
    [format,{dataset:{bulkFormat:format},listeners:{},disabled:true,textContent:'',
      addEventListener(type,callback){this.listeners[type]=callback;}}]));
  const savedDirectoryFiles=new Map();
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
      fillText(str,x,y){drawnText.push(String(str));styledDraws.push({text:String(str),color:this.fillStyle,font:this.font,x,y,align:this.textAlign,width:this.measureText(str).width});},strokeText(){},
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
    querySelectorAll:selector=>selector==='[data-social-format]'?Object.values(buttons):selector==='[data-bulk-format]'?Object.values(bulkButtons):[],
    fonts:{ready:Promise.resolve(),load:()=>Promise.resolve([])},
    createElement(tag){ if(tag==='option')return {value:'',textContent:''};
      if(tag==='canvas')return {width:1080,height:1080,getContext:()=>makeContext(),toBlob(callback){callback(new Blob([new Uint8Array([137,80,78,71])],{type:'image/png'}));}};
      return {click(){},remove(){},set href(url){},set download(name){}};
    },
    body:{appendChild(){}},
  };
  class ImageMock {
    constructor(){this.width=1080;this.height=1920;}
    set src(v){this._src=v;queueMicrotask(()=>
      options.failImageSrc?.(v)?this.onerror?.():this.onload?.());}
    get src(){return this._src;}
  }
  const win={addEventListener:(type,cb)=>callbacks.set(type,cb),dispatchEvent(e){return callbacks.get(e.type)?.(e);}};
  if(options.directoryMode){
    win.showDirectoryPicker=async()=>({
      async getFileHandle(filename){
        return {async createWritable(){
          const chunks=[];
          return {async write(bytes){chunks.push(bytes);},
            async close(){savedDirectoryFiles.set(filename,new Blob(chunks,{type:'application/zip'}));},
            async abort(){savedDirectoryFiles.delete(filename);}};
        }};
      }
    });
  }
  const sample={
    i:7,t:'TOXIC: A FAIRY TALE FOR GROWN-UPS',s:'toxic-a-fairy-tale-for-grown-ups',
    l:'Telugu',rd:'2026-08-26',r:2.25,m:'https://assets.moviereviewbypoorna.com/reviews/toxic/poster.jpg',
    v:'Geetu aimed for a Joker-like mindf*er, but ended up making a JOKER out of everyone involved!!!!'
  };
  const fetchMock=options.fetchMock|| (async url=>({
    ok:true,json:async()=>url.includes('compact=1')?[{i:7,t:sample.t}]:sample
  }));
  const BrowserURL=class extends URL{};
  BrowserURL.createObjectURL=blob=>{downloadedBlobs.push(blob);return 'blob:test-bulk';};
  BrowserURL.revokeObjectURL=()=>{};
  const ctx={
    document,window:win,Image:ImageMock,
    fetch:fetchMock,Event:class {constructor(type){this.type=type;}},
    requestAnimationFrame:cb=>setImmediate(cb),
    setTimeout,clearTimeout,URL:BrowserURL,Blob,TextEncoder,Uint8Array,Uint32Array,DataView,FormData,File:class{},
    Intl,Date,Number,String,Array,Math,Promise,console,navigator:{clipboard:{writeText:async text=>{copied.push(text);}}},
  };
  vm.runInNewContext(BULK_ZIP_JS,ctx,{filename:'social-bulk-zip.js'});
  vm.runInNewContext(STUDIO_JS,ctx,{filename:'social-studio.js'});
  return {element,callbacks,document,drawnText,filledRects,pixelFills,buttons,bulkButtons,savedDirectoryFiles,styledDraws,copied,downloadedBlobs,window:win};
}
const settle=async()=>{for(let i=0;i<6;i++)await new Promise(resolve=>setImmediate(resolve));};


async function zipEntries(blob){
  const bytes=new Uint8Array(await blob.arrayBuffer());
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const entries=new Map();let offset=0;
  while(offset+30<=bytes.length&&view.getUint32(offset,true)===0x04034b50){
    const fileSize=view.getUint32(offset+18,true);
    const nameSize=view.getUint16(offset+26,true),extra=view.getUint16(offset+28,true);
    const name=new TextDecoder().decode(bytes.subarray(offset+30,offset+30+nameSize));
    const start=offset+30+nameSize+extra;
    entries.set(name,bytes.slice(start,start+fileSize));
    offset=start+fileSize;
  }
  assert.equal(view.getUint32(offset,true),0x02014b50,'Expected central ZIP directory');
  return entries;
}

function bulkFixture(reviews,options={}){
  let writes=0;
  const h=harness({directoryMode:reviews.length>100,failImageSrc:options.failImageSrc,
    fetchMock:async(url,opts)=>{
    if(opts?.method&&opts.method!=='GET'){writes++;return {ok:true,json:async()=>({})};}
    if(url.includes('compact=1'))return {ok:true,json:async()=>reviews};
    if(url.includes('/api/admin/editorial?reviewId='))return {ok:true,json:async()=>({presets:{},drafts:{}})};
    if(url==='/api/admin/editorial')return {ok:true,json:async()=>({presets:{}})};
    if(url.includes('/api/admin/social-poster?'))return {ok:true,headers:{get:()=>'image/jpeg'},
      blob:async()=>new Blob([new Uint8Array([255,216,255])],{type:'image/jpeg'})};
    return {ok:true,json:async()=>reviews.find(x=>x.i===Number(url.split('/').pop()))||reviews[0]};
  }});
  return {h,writeCount:()=>writes};
}

test('Each of seven format-specific ZIPs has ONLY Images/ and Captions/ with matching names',async()=>{
  const reviews=[{i:7,t:'JYO ACHYUTANANDA',s:'jyo-achyutananda',rd:'2016-09-09',
    v:'Sensible and witty. A memorable little movie.',l:'Telugu',r:4.25,
    m:'https://assets.moviereviewbypoorna.com/reviews/jyo/poster.jpg'}];
  const {h,writeCount}=bulkFixture(reviews);
  h.callbacks.get('social-studio:open')();await settle();
  const formats=['instagram-post','instagram-story','facebook-post','facebook-story','x-post','whatsapp-channel','whatsapp-status'];
  const expectedStem='001_2016-09-09_JYO_ACHYUTANANDA_7';
  for(const format of formats){
    assert.equal(h.bulkButtons[format].disabled,false,format+' download enabled');
    await h.bulkButtons[format].listeners.click();await settle();
    const entries=await zipEntries(h.downloadedBlobs.at(-1));
    assert.deepEqual([...entries.keys()].sort(),[
      format.endsWith('-story')?'Captions/000_STORY_LINKS.txt':'Captions/000_EXPORT_REPORT.txt',
      ...(format.endsWith('-story')?[]:['Captions/'+expectedStem+'.txt']),
      'Images/'+expectedStem+'.png'
    ].sort(),format+' ZIP has only its intended text files');
    if(format==='x-post'){
      const caption=new TextDecoder().decode(entries.get('Captions/'+expectedStem+'.txt'));
      assert.match(caption,/has reached the Auditorium!/);
      assert.match(caption,/FULL REVIEW: .*utm_source=x/);
      for(const label of ['📸 IG:','ⓕ FB:','𝕏 X:','💬 WA:'])assert.ok(caption.includes(label));
      assert.doesNotMatch(caption,/=== X FOLLOW-UP|_Reply|POST 2\/2/);
      assert.ok(xWeightedTestLength(caption)<=280,'X ZIP must contain one publishable caption');
    }
    if(format.endsWith('-story')){
      const storyLinks=new TextDecoder().decode(entries.get('Captions/000_STORY_LINKS.txt'));
      assert.match(storyLinks,/001 \| JYO ACHYUTANANDA/);
      assert.match(storyLinks,/STICKER TEXT: 🎟️ READ FULL REVIEW/);
      assert.match(storyLinks,new RegExp('utm_source='+format.split('-')[0]));
      assert.match(storyLinks,/EXPORT REPORT/);
      assert.equal([...entries.keys()].filter(k=>k.endsWith('.txt')).length,1);
    }else{
      assert.match(new TextDecoder().decode(entries.get('Captions/'+expectedStem+'.txt')),/JYO ACHYUTANANDA|review/i);
      assert.match(new TextDecoder().decode(entries.get('Captions/000_EXPORT_REPORT.txt')),/oldest.*last/i);
    }
  }
  assert.equal(h.downloadedBlobs.length,7,'Each button downloads one distinct ZIP');
  assert.equal(writeCount(),0,'No review or social account writes');
});

test('WhatsApp Channel and Status must never download captions-only ZIPs when poster decoding fails',async()=>{
  const reviews=[{i:7,t:'BROKEN POSTER',s:'broken-poster',rd:'2026-07-01',
    v:'Test movie.',l:'Telugu',r:3,
    m:'https://assets.moviereviewbypoorna.com/reviews/broken-poster/poster.jpg'}];
  for(const format of ['whatsapp-channel','whatsapp-status']){
    const {h}=bulkFixture(reviews,{failImageSrc:url=>url.includes('/api/admin/social-poster?')});
    h.callbacks.get('social-studio:open')();await settle();
    await h.bulkButtons[format].listeners.click();await settle();
    assert.equal(h.downloadedBlobs.length,0,format+' must not silently download text-only archives');
    const message=h.element('socialBulkStatus').textContent;
    assert.match(message,/ZIP export failed: No PNG images generated/);
    assert.match(message,/Original poster unavailable: Image unavailable/);
    assert.match(message,/BROKEN POSTER/);
    assert.equal(h.bulkButtons[format].disabled,false,'Export button restored after failure');
  }
});

test('Partial image failures omit orphan captions and retain the reason in the export report',async()=>{
  const reviews=[
    {i:3,t:'WORKING POSTER',s:'working',rd:'2016-01-01',
      v:'A short review.',l:'Telugu',r:4,
      m:'https://assets.moviereviewbypoorna.com/reviews/working/poster.jpg'},
    {i:4,t:'BROKEN POSTER',s:'broken',rd:'2016-02-01',
      v:'A short review.',l:'Telugu',r:3,
      m:'https://assets.moviereviewbypoorna.com/reviews/broken/poster.jpg'}
  ];
  const {h}=bulkFixture(reviews,{failImageSrc:url=>url.includes('social-poster?')&&
    url.includes('broken')});
  h.callbacks.get('social-studio:open')();await settle();
  await h.bulkButtons['whatsapp-channel'].listeners.click();await settle();
  assert.equal(h.downloadedBlobs.length,1,'Partial ZIP remains usable');
  const entries=await zipEntries(h.downloadedBlobs[0]);
  assert.deepEqual([...entries.keys()].sort(),[
    'Images/001_2016-01-01_WORKING_POSTER_3.png',
    'Captions/001_2016-01-01_WORKING_POSTER_3.txt',
    'Captions/000_EXPORT_REPORT.txt'
  ].sort(),'Every caption must have matching image; broken review is only in audit');
  const report=new TextDecoder().decode(entries.get('Captions/000_EXPORT_REPORT.txt'));
  assert.match(report,/BROKEN POSTER.+IMAGE NEEDS REVIEW/);
  assert.match(report,/Original poster unavailable/);
  assert.match(h.element('socialBulkStatus').textContent,/1 image\(s\) need review/);
});

test('One Download All click bundles seven independently usable ZIPs on fallback browsers',async()=>{
  const reviews=[{i:9,t:'A Movie',s:'a-movie',rd:'2000-01-01',d:'2000-02-02',
    v:'Enjoyable.',l:'Telugu',r:3,m:'https://assets.moviereviewbypoorna.com/reviews/test/poster.jpg'}];
  const {h,writeCount}=bulkFixture(reviews);
  h.callbacks.get('social-studio:open')();await settle();
  await h.element('socialBulkAll').listeners.click();await settle();
  assert.equal(h.downloadedBlobs.length,1,'Single outer download avoids blocked multiple downloads');
  const archive=await zipEntries(h.downloadedBlobs[0]);
  assert.equal(archive.size,7,'Seven nested platform ZIPs');
  const names=[...archive.keys()];
  for(const label of ['Instagram_Post','Instagram_Story','Facebook_Post','Facebook_Story',
    'X_Post','WhatsApp_Channel','WhatsApp_Story']){
    const key=names.find(name=>name.includes(label));
    assert.ok(key,'Missing '+label+' ZIP');
    const nested=await zipEntries(new Blob([archive.get(key)]));
    assert.ok(nested.has('Images/001_2000-01-01_A_Movie_9.png'),label+' image');
    if(label==='Instagram_Story'||label==='Facebook_Story'){
      assert.ok(nested.has('Captions/000_STORY_LINKS.txt'),label+' consolidated links');
      assert.equal([...nested.keys()].filter(k=>k.endsWith('.txt')).length,1);
    }else assert.ok(nested.has('Captions/001_2000-01-01_A_Movie_9.txt'),label+' caption');
  }
  assert.equal(writeCount(),0);
});

test('Download All streams seven standalone ZIP files into a chosen folder when supported',async()=>{
  const reviews=[{i:7,t:'NEWEST',s:'newest',rd:'2026-10-18',d:'2026-10-18',
    v:'Recent.',l:'Telugu',r:4,m:'https://assets.moviereviewbypoorna.com/reviews/test/poster.jpg'},
    {i:4,t:'OLDEST',s:'oldest',rd:'2001-01-01',d:'2026-10-19',
    v:'Classic.',l:'Telugu',r:3,m:'https://assets.moviereviewbypoorna.com/reviews/test/poster.jpg'},
    {i:6,t:'MIDDLE MOVIE',s:'middle',rd:'2016-05-01',d:'2026-10-17',
    v:'Good.',l:'Telugu',r:3,m:'https://assets.moviereviewbypoorna.com/reviews/test/poster.jpg'},
    {i:2,t:'UNKNOWN',s:'unknown',rd:'',d:'2026-10-19',
    v:'No release info.',l:'Telugu',r:2,m:'https://assets.moviereviewbypoorna.com/reviews/test/poster.jpg'}
  ];
  const {h,writeCount}=bulkFixture(reviews);
  // Enable folder picker explicitly for a small fixture too.
  const saved=h.savedDirectoryFiles;
  h.window.showDirectoryPicker=async()=>({
    async getFileHandle(name){return {async createWritable(){
      const chunks=[];
      return {async write(bytes){chunks.push(bytes);},
        async close(){saved.set(name,new Blob(chunks,{type:'application/zip'}));}};}};}
  });
  h.callbacks.get('social-studio:open')();await settle();
  await h.element('socialBulkAll').listeners.click();await settle();
  assert.equal(saved.size,7,'Seven individual ZIPs should be created with one folder selection');
  assert.equal(h.downloadedBlobs.length,0,'Native folder selection does not trigger seven browser downloads');
  for(const archive of saved.values()){
    const entries=await zipEntries(archive);
    const paths=[...entries.keys()].filter(name=>name.startsWith('Images/'));
    assert.deepEqual(paths,[
      'Images/001_date-not-set_UNKNOWN_2.png',
      'Images/002_2001-01-01_OLDEST_4.png',
      'Images/003_2016-05-01_MIDDLE_MOVIE_6.png',
      'Images/004_2026-10-18_NEWEST_7.png'
    ],'File upload order must be oldest-to-newest, unknown date first');
    for(const image of paths){
      const isStory=[...entries.keys()].includes('Captions/000_STORY_LINKS.txt');
      if(isStory){
        const links=new TextDecoder().decode(entries.get('Captions/000_STORY_LINKS.txt'));
        assert.ok(links.includes(image.split('/')[1].split('_').slice(2,-1).join('_').replaceAll('_',' ')) ||
          links.includes('STICKER TEXT:'),'Story links index required');
        assert.equal([...entries.keys()].filter(k=>k.endsWith('.txt')).length,1);
      }else{
        const caption=image.replace('Images/','Captions/').replace(/\.png$/,'.txt');
        assert.ok(entries.has(caption),'Matching caption required for '+image);
      }
    }
  }
  assert.equal(writeCount(),0);
});

test('Seven downloadable format buttons and standalone bulk-all button are wired',()=>{
  for(const format of ['instagram-post','instagram-story','facebook-post','facebook-story',
    'x-post','whatsapp-channel','whatsapp-status'])
    assert.ok(ADMIN_HTML.includes('data-bulk-format="'+format+'"'),format+' ZIP button');
  assert.match(ADMIN_HTML,/id="socialBulkAll"/);
  assert.match(ADMIN_HTML,/social-studio\.js\?v=24/);
  assert.match(STUDIO_JS,/const BULK_FORMATS=Object\.freeze/);
  assert.match(STUDIO_JS,/function sortedBulkReviews\(\)/);
  assert.match(STUDIO_JS,/function exportBulkFormats\(requestedFormat\)/);
  const exporter=STUDIO_JS.slice(STUDIO_JS.indexOf('  // Seven self-contained format archives'),
    STUDIO_JS.indexOf('  // The inline rich editors update'));
  assert.doesNotMatch(exporter,/saveEditorialOp\(|method:'PUT'|method:'POST'/);
  assert.match(exporter,/Captions\/000_EXPORT_REPORT\.txt/);
  assert.match(exporter,/showDirectoryPicker/);
});

test('Admin routes and approved master image endpoints are present and protected',()=>{
  assert.match(ADMIN_HTML,/data-panel="social"/);
  assert.match(ADMIN_HTML,/id="socialCanvas"/);
  assert.match(ADMIN_HTML,/social-studio\.js/);
  assert.match(ADMIN_API,/if \(!\(await isAdminAuthenticated\(request\)\)\)/);
  assert.match(ADMIN_API,/pathname === '\/api\/admin\/social-master'/);
  assert.match(ADMIN_API,/pathname === '\/api\/admin\/social-poster'/);
  assert.match(ADMIN_API,/getSocialPoster\(url\.searchParams\.get\('url'\)\)/);
});



test('Facebook and X movie titles are optically centered on their baked red stars',async()=>{
  // Actual screenshots provided for Oopiri, 24, Brahmotsavam, Gentleman,
  // Kabali, Janatha Garage, Jyo Achyutananda and Pink measured red star
  // centers at (515.5,360) and (983.5,360). Their midpoint is x=749.5.
  const screenshots=['OOPIRI','24','BRAHMOTSAVAM','GENTLEMAN','KABALI',
    'JANATHA GARAGE','JYO ACHYUTANANDA','PINK'];
  for(const movieTitle of screenshots){
    const review={i:7,t:movieTitle,s:'social-regression',rd:'2016-09-09',
      v:'Good movie, memorable characters.',l:'Telugu',r:3.75,
      m:'https://assets.moviereviewbypoorna.com/reviews/test/poster.jpg'};
    const h=harness({fetchMock:async url=>({
      ok:true,json:async()=>url.includes('compact=1')?[review]:
        url.includes('/api/admin/editorial?')?{drafts:{},presets:{}}:review
    })});
    h.callbacks.get('social-studio:open')();await settle();
    h.element('socialMovie').value='7';
    await h.element('socialMovie').listeners.change();await settle();
    const oldCount=h.styledDraws.length;
    h.element('socialPostPlatform').value='facebook-x-post';
    h.element('socialPostPlatform').listeners.change();await settle();
    const ink=h.styledDraws.slice(oldCount).filter(d=>d.color==='#060505'&&
      d.y>330&&d.y<405&&d.text.trim());
    assert.ok(ink.length,'Facebook/X should render title: '+movieTitle);
    assert.ok(ink.every(d=>d.align==='center'),'Title must be centered, '+movieTitle);
    for(const d of ink){
      assert.ok(Math.abs(d.x-750)<=1,'Title should anchor at star midpoint x=749.5: '+movieTitle+' x='+d.x);
      assert.ok(Math.abs(d.y-365.5)<=1,'Optical baseline should be 365.5, not 379.5: '+movieTitle+' y='+d.y);
      assert.ok(d.x-d.width/2>=565 && d.x+d.width/2<=933,
        'Title may not overlap the red stars: '+movieTitle);
    }
    assert.ok(ink.some(d=>d.text===movieTitle),'Prefer one line: '+movieTitle);
  }
});

test('Facebook/X centers even saved left-aligned rich title spans without modifying saved styles',async()=>{
  const review={i:7,t:'JYO ACHYUTANANDA',s:'jyo-achyutananda',rd:'2016-09-09',
    v:'Fun film.',l:'Telugu',r:4,
    m:'https://assets.moviereviewbypoorna.com/reviews/test/poster.jpg'};
  const h=harness({fetchMock:async url=>({
    ok:true,json:async()=>url.includes('compact=1')?[review]:
      url.includes('/api/admin/editorial?')?{drafts:{},presets:{}}:review
  })});
  h.callbacks.get('social-studio:open')();await settle();
  h.element('socialMovie').value='7';
  await h.element('socialMovie').listeners.change();await settle();
  h.element('socialPostPlatform').value='facebook-x-post';
  h.element('socialPostPlatform').listeners.change();await settle();
  const saved=h.window.SocialStudioRichBridge.getDraft();
  saved.titleStyle.align='left';
  saved.styles.title=[{start:0,end:3,color:'#060505',font:'Oswald',size:55}];
  const from=h.styledDraws.length;
  h.window.SocialStudioRichBridge.refresh();await settle();
  const pieces=h.styledDraws.slice(from).filter(d=>d.color==='#060505'&&d.y>330&&d.y<405);
  assert.ok(pieces.length>=2,'Rich text is drawn in separately styled spans');
  const y=pieces[0].y;
  assert.ok(pieces.every(d=>Math.abs(d.y-y)<.01),'One rich title row');
  const left=Math.min(...pieces.map(d=>d.x));
  const right=Math.max(...pieces.map(d=>d.x+d.width));
  assert.ok(Math.abs((left+right)/2-750)<=1,'Word-level styling must remain centered at x=750');
  assert.ok(Math.abs(y-365.5)<=2,'Word-level styling must remain vertically centered');
  assert.equal(saved.titleStyle.align,'left','Output correction must not rewrite the saved style');
  // Both Facebook Post and X Post use this same master in the ZIP renderer.
  assert.match(STUDIO_JS,/'facebook-post':\{label:'Facebook_Post',kind:'post',design:'facebook-x-post'\}/);
  assert.match(STUDIO_JS,/'x-post':\{label:'X_Post',kind:'post',design:'facebook-x-post'\}/);
  assert.match(STUDIO_JS,/return renderFrame\(kind\);/);
});

test('Movie title prefers one centered line before falling back to wrapping',async()=>{
  for(const movieTitle of ['JYO ACHYUTANANDA','GAUTAMIPUTRA SATAKARNI']){
    const review={i:7,t:movieTitle,v:'Brief and witty!',l:'Telugu',r:3,
      m:'https://assets.moviereviewbypoorna.com/reviews/test/poster.jpg'};
    const h=harness({fetchMock:async url=>({
      ok:true,json:async()=>url.includes('compact=1')?[review]:
        url.includes('/api/admin/editorial?')?{drafts:{},presets:{}}:review
    })});
    h.element('socialAutoFitOnLoad').checked=true;
    h.callbacks.get('social-studio:open')();await settle();
    h.element('socialMovie').value='7';
    await h.element('socialMovie').listeners.change();await settle();
    const titleInk=h.styledDraws.filter(x=>x.color==='#060505'&&x.text.trim());
    const post=titleInk.filter(x=>x.y>330&&x.y<440);
    const story=titleInk.filter(x=>x.y>950&&x.y<1045);
    // Canvas renders more than once while fonts/poster load; check every
    // version uses the *complete* single-line title, not number of draw calls.
    assert.ok(post.length>0&&story.length>0,'Both previews should render a title');
    assert.ok(post.every(line=>line.text===movieTitle),'Post should prefer one intact title line');
    assert.ok(story.every(line=>line.text===movieTitle),'Story should prefer one intact title line');
    assert.ok(post.every(line=>line.align==='center'),'Post title should be centered');
    assert.ok(story.every(line=>line.align==='center'),'Story title should be centered');
  }
});

test('Auto-fit seeks the largest size needed per format without rewriting saved style',async()=>{
  const review={
    i:7,t:'GAUTAMIPUTRA SATAKARNI',
    v:'Telugu pride hype pakkana petti normal historical movie ga chusthe GOOD one 👍 Krish sharp ga handles it, dialogues roar... and honestly Satakarni ga Balayya ne set avthadu.',
    l:'Telugu',r:3,m:'https://assets.moviereviewbypoorna.com/reviews/gps/poster.jpg'
  };
  const saved={
    title:review.t,pov:review.v,language:review.l,rating:'3',titleCase:'uppercase',
    titleStyle:{family:'Oswald',size:59,weight:'700',color:'#060505',align:'center',line:1.11,auto:true},
    povStyle:{family:'Inter',size:20,weight:'600',color:'#f1f1f1',align:'left',line:1.22,auto:true},
    languageStyle:{family:'Oswald',size:38,color:'#f1f1f1',auto:true},
    styles:{title:[],pov:[]}
  };
  const h=harness({fetchMock:async url=>({
    ok:true,json:async()=>url.includes('compact=1')?[review]:
      url.includes('/api/admin/editorial?')?{drafts:{shared:saved},presets:{}}:review
  })});
  h.callbacks.get('social-studio:open')();await settle();
  h.element('socialMovie').value='7';await h.element('socialMovie').listeners.change();await settle();
  assert.equal(h.window.SocialStudioRichBridge.getDraft().povStyle.size,20,
    'Auto-sizing must not overwrite movie-saved styling');
  assert.equal(h.element('socialPov').value,review.v,'Every original MY POV character remains in the editor');
  const post=h.styledDraws.filter(x=>x.y>750&&x.y<880&&x.color==='#f1f1f1');
  const story=h.styledDraws.filter(x=>x.y>1395&&x.y<1590&&x.color==='#f1f1f1');
  assert.ok(post.length&&story.length,'MY POV should be visible in both preview images');
  const sizes=items=>items.map(item=>Number(item.font.match(/(\d+(?:\.\d+)?)px/)?.[1]||0));
  assert.ok(sizes(post).some(size=>size>=19),'Post should retain a practical best-fit size');
  assert.ok(sizes(story).some(size=>size>=24),'Story should retain an independent larger best-fit size');
  assert.ok(h.element('socialWarnings').textContent.length>0,'The editor should give clear fit feedback');
});

test('Manual font-size changes stay respected rather than blocked by automatic thresholds',async()=>{
  const h=harness();h.callbacks.get('social-studio:open')();await settle();
  h.element('socialMovie').value='7';await h.element('socialMovie').listeners.change();await settle();
  const draft=h.window.SocialStudioRichBridge.getDraft();
  draft.pov='Short and witty.';
  draft.povStyle.auto=false;
  draft.povStyle.size=18;
  h.window.SocialStudioRichBridge.refresh();await settle();
  assert.equal(h.element('socialDownloadPost').disabled,false,
    'A manual, intentionally selected smaller font must be accepted if it fits');
});

test('Too-long MY POV is visibly previewed, never silently blank or exportable',async()=>{
  const sample={
    i:7,t:'GAUTAMIPUTRA SATAKARNI',l:'Telugu',r:3,
    m:'https://assets.moviereviewbypoorna.com/reviews/test/poster.jpg',
    v:'Telugu pride hype pakkana petti normal historical movie ga chusthe GOOD one. '
       +'Krish sharp ga handles it, dialogues roar and honestly Satakarni ga Balayya ne set avthadu.'
  };
  const h=harness({fetchMock:async url=>({
    ok:true,json:async()=>url.includes('compact=1')?[sample]:
      url.includes('/api/admin/editorial?')?{drafts:{},presets:{}}:sample
  })});
  h.element('socialAutoFitOnLoad').checked=true;
  h.callbacks.get('social-studio:open')();await settle();
  h.element('socialMovie').value='7';await h.element('socialMovie').listeners.change();await settle();
  assert.equal(h.element('socialPov').value,sample.v,'The source MY POV must remain verbatim');
  const drawnPov=h.styledDraws.filter(x=>x.y>=750&&x.y<=890&&x.text.trim());
  assert.ok(drawnPov.length>0,'MY POV must be visible in the Post preview');
  // An impossible amount of text must show a clear excerpt and warning,
  // but downloading remains disabled rather than exporting truncated prose.
  h.element('socialPov').value='Telugu pride hype '+ 'very long emotional story '.repeat(150);
  h.element('socialPov').listeners.input();await settle();
  assert.equal(h.element('socialDownloadPost').disabled,true);
  assert.ok(h.styledDraws.some(x=>x.text.includes('MY POV NEEDS REVIEW')),
    'Canvas must not appear blank when fitting fails');
  assert.ok(h.styledDraws.some(x=>x.text.startsWith('Telugu pride')),
    'The fallback preview must show actual source content');
  assert.match(h.element('socialWarnings').textContent,/preview shows a readable excerpt/i);
});

test('Approved Post and Story titles remain inside star-free center strip on multiple long movie titles',async()=>{
  const samples=[
    'GAUTAMIPUTRA SATAKARNI','JYO ACHYUTANANDA','MANA OORI RAMAYANAM'
  ];
  for(const title of samples){
    const review={i:7,t:title,v:'A clever, sweet and emotional movie with a natural flow and good moments.',
      l:'Telugu',r:3,m:'https://assets.moviereviewbypoorna.com/reviews/test/poster.jpg'};
    const h=harness({fetchMock:async url=>({
      ok:true,json:async()=>url.includes('compact=1')?[review]:
        url.includes('/api/admin/editorial?')?{drafts:{},presets:{}}:review
    })});
    h.element('socialAutoFitOnLoad').checked=true;
    h.callbacks.get('social-studio:open')();await settle();
    h.element('socialMovie').value='7';
    await h.element('socialMovie').listeners.change();await settle();

    const ink=h.styledDraws.filter(item=>item.color==='#060505'&&item.text.trim());
    const post=ink.filter(item=>item.y>330&&item.y<430);
    const story=ink.filter(item=>item.y>950&&item.y<1045);
    assert.ok(post.length,title+' should have drawn a Post title');
    assert.ok(story.length,title+' should have drawn a Story title');
    const extent=item=>item.align==='center'?
      [item.x-item.width/2,item.x+item.width/2]:[item.x,item.x+item.width];
    for(const item of post){
      const [left,right]=extent(item);
      assert.ok(left>=569&&right<=918,title+' Post title must not overlap stars at x=513..544 and x=949..987: '+left+'..'+right);
    }
    for(const item of story){
      const [left,right]=extent(item);
      assert.ok(left>=230&&right<=850,title+' Story title must not overlap stars at x=131..182 and x=899..950: '+left+'..'+right);
    }
    const storyVisualY=story.reduce((sum,item)=>sum+item.y,0)/story.length;
    assert.ok(storyVisualY>976&&storyVisualY<1014,title+' Story title must sit near the stars vertical center (y≈991), got '+storyVisualY);
  }
});

test('Previously saved tiny Post-fit MY POV is not reused at a tiny Story size',async()=>{
  const review={i:7,t:'JYO ACHYUTANANDA',v:'Sensibile, clean, witty, emotional. '+ 'Strong performances and a natural story. '.repeat(3),
    l:'Telugu',r:4,m:'https://assets.moviereviewbypoorna.com/reviews/jyo/poster.jpg'};
  const draft={
    title:review.t,pov:review.v,language:review.l,rating:'4',titleCase:'uppercase',
    titleStyle:{family:'Oswald',weight:'700',align:'center',color:'#060505',size:38,auto:true,line:1.11},
    povStyle:{family:'Inter',weight:'600',align:'left',color:'#f1f1f1',size:20,auto:true,line:1.22},
    languageStyle:{family:'Oswald',size:38,color:'#f1f1f1',auto:true},
    styles:{title:[],pov:[]}
  };
  const h=harness({fetchMock:async url=>({
    ok:true,json:async()=>url.includes('compact=1')?[review]:
      url.includes('/api/admin/editorial?')?{drafts:{shared:draft},presets:{}}:review
  })});
  h.callbacks.get('social-studio:open')();await settle();
  h.element('socialMovie').value='7';
  await h.element('socialMovie').listeners.change();await settle();
  assert.equal(h.window.SocialStudioRichBridge.getDraft().povStyle.size,20,
    'Do not overwrite or silently rewrite a manually saved D1 movie style');
  const storyPovInk=h.styledDraws.filter(item=>item.y>1400&&item.y<1600&&item.text.trim());
  assert.ok(storyPovInk.length,'Story should render the MY POV');
  assert.ok(storyPovInk.every(item=>Number(item.font.match(/(\d+(?:\.\d+)?)px/)?.[1]||0)>=30),
    'Story MY POV must render at 30px or larger, even if old shared draft is Post-sized');
  assert.equal(h.element('socialDownloadStory').disabled,false,
    'Story export stays enabled when its own readable fit succeeds');
});

test('Smart-fit tools are visible, non-destructive, and use approved safe title boxes',async()=>{
  for(const id of ['socialAutoFitOnLoad','socialRecalculateFit','socialScanAllFits',
    'socialPrepareFits','socialFitStatus','socialFitReport'])
    assert.ok(ADMIN_HTML.includes('id="'+id+'"'),id+' must be present in the admin');
  assert.match(STUDIO_JS,/function safeTextBox\(box,field,kind\)/);
  assert.match(STUDIO_JS,/safeTextBox\(g\.title,'title',kind\)/);
  assert.match(STUDIO_JS,/safeTextBox\(g\.pov,'pov',kind\)/);
  assert.match(STUDIO_JS,/status:messages\.length\?'review':'ready'/);
  assert.match(STUDIO_JS,/Object\.values\(editorial\?\.drafts\|\|\{\}\)\.some\(Boolean\)/);
  const h=harness();
  h.element('socialAutoFitOnLoad').checked=true;
  h.callbacks.get('social-studio:open')();await settle();
  h.element('socialMovie').value='7';
  await h.element('socialMovie').listeners.change();await settle();
  const draft=h.window.SocialStudioRichBridge.getDraft();
  assert.equal(draft.title,'TOXIC: A FAIRY TALE FOR GROWN-UPS');
  assert.match(draft.pov,/Geetu aimed for a Joker-like/);
  assert.ok(draft.titleStyle.size<=59&&draft.titleStyle.size>=30,'Safe shared preferred title size');
  assert.ok(draft.povStyle.size<=48&&draft.povStyle.size>=20,'Safe shared preferred MY POV size');
  assert.ok(h.element('socialFitStatus').textContent.length>0,'Fit recommendation shown on load');
  assert.equal(typeof h.element('socialRecalculateFit').listeners.click,'function');
  await h.element('socialRecalculateFit').listeners.click();await settle();
  assert.equal(h.window.SocialStudioRichBridge.getDraft().title,draft.title);
  assert.match(h.element('socialFitStatus').textContent,/Recalculated|review|fit/i);
});

test('Bulk scan protects saved styling and never silently writes review data',async()=>{
  const originalTitle='Toxic';
  let writes=0;
  const h=harness({fetchMock:async(url,opts)=>{
    if(opts?.method==='PUT'){writes++;return {ok:true,json:async()=>({saved:true})};}
    if(url.includes('compact=1'))return {ok:true,json:async()=>[{i:7,t:originalTitle,v:'Brief popcorn review.',l:'Telugu',r:3,m:'https://assets.moviereviewbypoorna.com/reviews/toxic/poster.jpg'}]};
    if(url.includes('/api/admin/editorial?'))return {ok:true,json:async()=>({drafts:{shared:{title:'SAVED MANUALLY'}},presets:{}})};
    if(url==='/api/admin/editorial')return {ok:true,json:async()=>({presets:{}})};
    return {ok:true,json:async()=>({i:7,t:originalTitle,v:'Brief popcorn review.',l:'Telugu',r:3,m:'https://assets.moviereviewbypoorna.com/reviews/toxic/poster.jpg'})};
  }});
  h.callbacks.get('social-studio:open')();await settle();
  await h.element('socialScanAllFits').listeners.click();await settle();
  assert.equal(writes,0,'Scanning must never perform a write');
  assert.match(h.element('socialFitStatus').textContent,/1 protected saved styles/);
  assert.equal(h.element('socialPrepareFits').disabled,true,'Saved styles must never be overwritten');
});

test('Bulk saving requires an explicit action and uses protected insert-only endpoint',async()=>{
  const review={i:7,t:'Jyo Achyutananda',v:'Sweet and witty!',l:'Telugu',r:4,m:'https://assets.moviereviewbypoorna.com/reviews/jyo/poster.jpg'};
  const submitted=[];
  const h=harness({fetchMock:async(url,opts)=>{
    if(opts?.method==='PUT'){
      const body=JSON.parse(opts.body);submitted.push(body);
      return {ok:true,json:async()=>({saved:true,created:true})};
    }
    if(url.includes('compact=1'))return {ok:true,json:async()=>[review]};
    if(url.includes('/api/admin/editorial?'))return {ok:true,json:async()=>({drafts:{},presets:{}})};
    if(url==='/api/admin/editorial')return {ok:true,json:async()=>({presets:{}})};
    return {ok:true,json:async()=>review};
  }});
  h.callbacks.get('social-studio:open')();await settle();
  await h.element('socialScanAllFits').listeners.click();await settle();
  assert.equal(submitted.length,0);
  assert.equal(h.element('socialPrepareFits').disabled,false,'Safe fitted recommendations are eligible');
  await h.element('socialPrepareFits').listeners.click();await settle();
  assert.equal(submitted.length,1);
  assert.equal(submitted[0].type,'prepare-social');
  assert.equal(submitted[0].reviewId,7);
  assert.equal(submitted[0].draft.title,review.t,'Original movie title must not be changed');
  assert.equal(submitted[0].draft.pov,review.v,'Original MY POV must not be rewritten');
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
  assert.ok(drawn('Telugu',620.5),'Post language is centered below the WATCHED IN label');
  assert.ok(drawn('Telugu',1231.5),'Story language is centered below the WATCHED IN label');
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



test('WATCHED IN values are centered horizontally and vertically in every approved format',async()=>{
  const h=harness();
  h.callbacks.get('social-studio:open')();await settle();
  h.element('socialMovie').value='7';
  await h.element('socialMovie').listeners.change();await settle();
  const samples=[
    {platform:'instagram-post',x:589.5,y:620.5,left:463,right:716,top:569,bottom:672},
    {platform:'facebook-x-post',x:575.5,y:601,left:449,right:702,top:548,bottom:654},
    {platform:'whatsapp-channel',x:566.5,y:618,left:449,right:684,top:568,bottom:668}
  ];
  for(const expected of samples){
    const before=h.styledDraws.length;
    h.element('socialPostPlatform').value=expected.platform;
    h.element('socialPostPlatform').listeners.change();await settle();
    const ink=h.styledDraws.slice(before).find(item=>item.text==='Telugu'&&item.y<800);
    assert.ok(ink,expected.platform+' language should render');
    assert.equal(ink.align,'center',expected.platform+' should use centered text alignment');
    assert.equal(ink.x,(expected.left+expected.right)/2,expected.platform+' exact horizontal center');
    assert.equal(ink.y,(expected.top+expected.bottom)/2,expected.platform+' exact vertical center');
    assert.ok(ink.x-ink.width/2>expected.left+8&&ink.x+ink.width/2<expected.right-8,
      expected.platform+' should not cross the metadata divider or panel border');
  }
  const story=h.styledDraws.find(item=>item.text==='Telugu'&&item.y>1100&&item.y<1300);
  assert.ok(story,'Story language renders');
  assert.equal(story.align,'center');
  assert.equal(story.x,(52+459)/2);
  assert.equal(story.y,(1187+1276)/2);
});
test('Story metadata uses two columns and retains an empty dynamic title ticket',async()=>{
  const h=harness();h.callbacks.get('social-studio:open')();await settle();
  h.element('socialMovie').value='7';await h.element('socialMovie').listeners.change();await settle();
  assert.ok(h.styledDraws.some(x=>x.text==='Telugu'&&x.y===1231.5));
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
  // Keep this example within the readability floor; truly crowded rich copy
  // should be flagged instead of silently shrunk under the approved minimum.
  draft.pov='Geetu makes this a fun, unusual watch.';
  h.element('socialPov').value=draft.pov;
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
    if(platform==='instagram-story'||platform==='facebook-story'){
      assert.match(caption,/STICKER TEXT: 🎟️ READ FULL REVIEW/);
      assert.match(caption,/LINK: https:\/\/moviereviewbypoorna.com\/review\//);
      assert.doesNotMatch(caption,/FOLLOW MOVIE|Instagram:|Facebook:|WhatsApp Channel:/);
    }else for(const link of links)assert.ok(caption.includes(link),platform+' must promote '+link);
    const symbols=platform==='x-post'?
      ['📸 IG:','ⓕ FB:','𝕏 X:','💬 WA:']:
      ['📸 Instagram:','ⓕ Facebook:','𝕏 X:','💬 WhatsApp'];
    if(platform!=='instagram-story'&&platform!=='facebook-story')
      for(const symbol of symbols)assert.ok(caption.includes(symbol),
        platform+' must include '+symbol+' and the real link in the same post');
    assert.ok(!caption.includes('🔵 Facebook')&&!caption.includes('🟢 WhatsApp'),platform+' must not use generic colored dots');
    // The single X post groups links on consecutive lines to fit 280
    // weighted characters; every other platform retains airy blank lines.
    if(platform!=='x-post')
      assert.doesNotMatch(caption,/(?<!\n)\n(?!\n)/u,
        platform+' must have one blank line between displayed lines');
    else
      assert.match(caption,/📸 IG: [^\n]+\nⓕ FB: [^\n]+\n𝕏 X: [^\n]+\n💬 WA: /u,
        'X uses four compact account lines in one post');
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
const xWeightedTestLength=value=>[...String(value)
  .replace(/https?:\/\/[^\s]+/gu,'x'.repeat(23))]
  .reduce((sum,ch)=>sum+(ch.codePointAt(0)<0x1100?1:2),0);


test('One X post contains movie promo, tracked review link and all four account URLs',async()=>{
  const h=harness();h.callbacks.get('social-studio:open')();await settle();
  h.element('socialMovie').value='7';await h.element('socialMovie').listeners.change();await settle();
  h.element('socialCaptionPlatform').value='x-post';
  h.element('socialCaptionPlatform').listeners.change();
  const main=h.element('socialCaptionText').value;
  assert.match(main,/🎬 TOXIC: A FAIRY TALE FOR GROWN-UPS has reached the Auditorium!/u);
  assert.match(main,/🍿 Worth your popcorn\?/u);
  assert.match(main,/🎟️ FULL REVIEW: https:\/\/moviereviewbypoorna\.com\/review\/toxic-a-fairy-tale-for-grown-ups\?utm_source=x/u);
  assert.match(main,/#MovieReviewsByPoorna/);
  const urlNames=[
    ['📸 IG:','https://www.instagram.com/moviereviewbypoorna/'],
    ['ⓕ FB:','https://www.facebook.com/moviereviewbypoorna'],
    ['𝕏 X:','https://x.com/reviewbypoorna'],
    ['💬 WA:','https://whatsapp.com/channel/0029VaKoQMp2UPBPOlNDg546']
  ];
  for(const [symbol,url] of urlNames){
    assert.ok(main.includes(symbol+' '+url),'Main single post needs '+symbol+' with clickable URL');
  }
  assert.doesNotMatch(main,/=== X FOLLOW-UP|Post 2\/2|_Reply/);
  assert.ok(xWeightedTestLength(main)<=280,'All-in-one X post must fit weighted 280 limit');
  assert.equal(h.element('socialCopyCaption').textContent,'COPY X POST');
  assert.ok(!ADMIN_HTML.includes('socialCopyXReply'),'No second X copy button');
  assert.ok(!ADMIN_HTML.includes('socialXReplyEditor'),'No second X editor');
  assert.match(h.element('socialCaptionStatus').textContent,/One X post per movie/i);
  h.element('socialCopyCaption').listeners.click();await settle();
  assert.deepEqual(h.copied,[main.trim()],'One copy action must include entire X post');
  h.element('socialCaptionPlatform').value='facebook-post';
  h.element('socialCaptionPlatform').listeners.change();
  assert.equal(h.element('socialCopyCaption').textContent,'COPY MESSAGE');
  assert.match(h.element('socialCaptionText').value,/📸 Instagram:/);
});

test('Single X caption degrades optional wording before dropping a required link',async()=>{
  const review={i:9,t:'LONG TITLE '.repeat(9).trim(),s:'long-title',
    v:'My original POV is preserved.',l:'Telugu',r:4,
    m:'https://assets.moviereviewbypoorna.com/reviews/test/poster.jpg'};
  const h=harness({fetchMock:async url=>({
    ok:true,json:async()=>url.includes('compact=1')?[review]:
      url.includes('/api/admin/editorial?')?{drafts:{},presets:{}}:review
  })});
  h.callbacks.get('social-studio:open')();await settle();
  h.element('socialMovie').value='9';await h.element('socialMovie').listeners.change();await settle();
  h.element('socialCaptionPlatform').value='x-post';
  h.element('socialCaptionPlatform').listeners.change();
  const caption=h.element('socialCaptionText').value;
  assert.ok(caption.includes(review.t),'Do not clip original movie title for X');
  assert.ok(caption.includes('utm_source=x'),'Review URL must remain tracked');
  for(const link of [
    'https://www.instagram.com/moviereviewbypoorna/',
    'https://www.facebook.com/moviereviewbypoorna',
    'https://x.com/reviewbypoorna',
    'https://whatsapp.com/channel/0029VaKoQMp2UPBPOlNDg546'
  ])assert.ok(caption.includes(link),'Keep all account links if fitting by removing optional wording');
  assert.ok(xWeightedTestLength(caption)<=280,'One X post fits weighted 280 characters');
  h.element('socialCaptionText').value=caption+' EXTRA WORDS'.repeat(50);
  h.element('socialCaptionText').listeners.input();
  const count=h.copied.length;
  h.element('socialCopyCaption').listeners.click();await settle();
  assert.equal(h.copied.length,count,'Do not copy X posts that exceed 280');
  assert.match(h.element('socialCaptionStatus').textContent,/exceeds 280 weighted characters/);
});

test('X all-in-one caption stays within limit for long names without silently truncating URLs',async()=>{
  for(const title of ['ISM','RANABAALI','BRAHMOTSAVAM','JYO ACHYUTANANDA','GAUTAMIPUTRA SATAKARNI']){
    const review={i:10,t:title,s:'example-movie',rd:'2016-09-09',
      v:'Reviewed.',l:'Telugu',r:3,
      m:'https://assets.moviereviewbypoorna.com/reviews/test/poster.jpg'};
    const h=harness({fetchMock:async url=>({
      ok:true,json:async()=>url.includes('compact=1')?[review]:
        url.includes('/api/admin/editorial?')?{drafts:{},presets:{}}:review
    })});
    h.callbacks.get('social-studio:open')();await settle();
    h.element('socialMovie').value='10';await h.element('socialMovie').listeners.change();await settle();
    h.element('socialCaptionPlatform').value='x-post';h.element('socialCaptionPlatform').listeners.change();
    const caption=h.element('socialCaptionText').value;
    assert.ok(caption.includes(title),'Exact movie title '+title);
    assert.ok(xWeightedTestLength(caption)<=280,'X post within standard limit for '+title);
    assert.match(caption,/utm_source=x/,'Review URL is tracked');
    assert.equal((caption.match(/https?:\/\/\S+/g)||[]).length,5,'All five URLs in a single post');
  }
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
  assert.ok(!ADMIN_HTML.includes('socialCopyXReply'),'X single-post UI no longer has a reply copy button');
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
  assert.ok(ADMIN_HTML.includes('social-studio.css?v=11'));
  assert.ok(ADMIN_HTML.includes('social-studio.js?v=24'));
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
