(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const editor=$('verdictRich'),source=$('verdict');
  if(!editor||!source)return;
  const font=$('verdictFont'),color=$('verdictColor'),body=$('reviewEditor');
  let marks=[],currentId=0,version=0,presets=null,savedSelection=null,lastText='';
  const clone=v=>JSON.parse(JSON.stringify(v));
  const validHex=/^#[0-9a-f]{6}$/i;
  const request=async (url,options)=>{
    const response=await fetch(url,{credentials:'same-origin',...options});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'Editorial request failed.');
    return data;
  };
  const write=(type,rest)=>request('/api/admin/editorial',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({type,...rest})});
  const textOf=()=>editor.textContent||'';
  const lengthOf=s=>[...s].length;
  function selected(){
    const selection=window.getSelection?.();
    if(!selection?.rangeCount)return null;
    const range=selection.getRangeAt(0);
    if(!editor.contains(range.startContainer)||!editor.contains(range.endContainer))return null;
    const prefix=document.createRange();prefix.selectNodeContents(editor);prefix.setEnd(range.startContainer,range.startOffset);
    const start=prefix.toString().length;
    return {start,end:start+range.toString().length};
  }
  function styleAt(start,end){
    return Object.assign({},...marks.filter(r=>r.start<end&&r.end>start).map(r=>{const {start:a,end:b,...style}=r;return style;}));
  }
  function render(){
    const value=source.value;
    const points=new Set([0,value.length]);
    for(const m of marks){points.add(Math.max(0,Math.min(value.length,m.start)));points.add(Math.max(0,Math.min(value.length,m.end)));}
    const bounds=[...points].sort((a,b)=>a-b),fragment=document.createDocumentFragment();
    for(let i=1;i<bounds.length;i++){
      const start=bounds[i-1],end=bounds[i],piece=value.slice(start,end);
      const style=styleAt(start,end);
      if(!Object.keys(style).length){fragment.appendChild(document.createTextNode(piece));continue;}
      const span=document.createElement('span');
      span.textContent=piece;
      if(style.color&&validHex.test(style.color))span.style.color=style.color;
      if(style.font)span.style.fontFamily='"'+String(style.font).replace(/[^a-z0-9 ]/gi,'')+'"';
      if(style.weight)span.style.fontWeight=style.weight;
      if(style.italic)span.style.fontStyle='italic';
      if(style.underline)span.style.textDecoration='underline';
      fragment.appendChild(span);
    }
    editor.replaceChildren(fragment);
  }
  function shiftMarks(previous,next){
    if(previous===next)return;
    let prefix=0;
    while(prefix<previous.length&&prefix<next.length&&previous[prefix]===next[prefix])prefix++;
    let suffix=0;
    while(suffix<previous.length-prefix&&suffix<next.length-prefix&&previous[previous.length-1-suffix]===next[next.length-1-suffix])suffix++;
    const shift=next.length-previous.length;
    marks=marks.flatMap(r=>r.end<=prefix?[r]:r.start>=previous.length-suffix?[{...r,start:r.start+shift,end:r.end+shift}]:[]);
  }
  editor.addEventListener('input',()=>{
    const next=textOf().replace(/\u00a0/g,' ');
    if(lengthOf(next)>260){
      editor.textContent=lastText;
      source.value=lastText;
      marks=[];
      render();
      editor.focus();
      return;
    }
    shiftMarks(lastText,next);
    source.value=next;
    lastText=next;
    const count=$('verdictCount');if(count)count.textContent=String(next.length);
  });
  editor.addEventListener('paste',event=>{
    event.preventDefault();
    const text=event.clipboardData?.getData('text/plain')||'';
    const selection=window.getSelection();if(!selection?.rangeCount)return;
    const selectedLength=selection.toString().length;
    const remaining=Math.max(0,260-source.value.length+selectedLength);
    const clean=[...text].slice(0,remaining).join('');
    const range=selection.getRangeAt(0);range.deleteContents();
    const node=document.createTextNode(clean);range.insertNode(node);range.setStartAfter(node);range.collapse(true);
    selection.removeAllRanges();selection.addRange(range);
    editor.dispatchEvent(new Event('input',{bubbles:true}));
  });
  editor.addEventListener('mouseup',()=>{savedSelection=selected();});
  editor.addEventListener('keyup',()=>{savedSelection=selected();});
  function apply(patch,clear=false){
    const value=source.value;if(!value)return;
    const selection=selected()||savedSelection;
    const start=selection&&selection.end>selection.start?selection.start:0;
    const end=selection&&selection.end>selection.start?selection.end:value.length;
    const points=new Set([0,value.length,start,end]);
    for(const mark of marks){points.add(mark.start);points.add(mark.end);}
    const bounds=[...points].sort((a,b)=>a-b),out=[];
    for(let i=1;i<bounds.length;i++){
      const a=bounds[i-1],b=bounds[i],inside=a>=start&&b<=end;
      if(b<=a)continue;
      const style=inside?(clear?{}:{...styleAt(a,b),...patch}):styleAt(a,b);
      if(Object.keys(style).length)out.push({start:a,end:b,...style});
    }
    marks=out;render();savedSelection=null;
  }
  document.querySelectorAll('[data-verdict-action]').forEach(button=>button.addEventListener('click',()=>{
    const cmd=button.dataset.verdictAction;
    if(cmd==='clear')return apply({},true);
    const at=(selected()||savedSelection)?.start||0;
    const current=styleAt(at,at+1);
    if(cmd==='bold')apply({weight:current.weight==='700'?'400':'700'});
    if(cmd==='italic')apply({italic:!current.italic});
    if(cmd==='underline')apply({underline:!current.underline});
  }));
  color.addEventListener('change',()=>apply({color:color.value}));
  font.addEventListener('change',()=>apply({font:font.value}));
  function setReview(record){
    const ticket=++version;
    currentId=Number(record?.i)||0;
    marks=[];
    source.value=String(record?.v||'');
    lastText=source.value;
    editor.textContent=source.value;
    const count=$('verdictCount');if(count)count.textContent=String(source.value.length);
    if(!currentId)return;
    request('/api/admin/editorial?reviewId='+currentId).then(data=>{
      if(ticket!==version)return;
      marks=Array.isArray(data.verdictMarks)?data.verdictMarks:[];
      presets=data.presets||null;
      if(presets?.['review.verdict']){
        const p=presets['review.verdict'];if([...font.options].some(x=>x.value===p.family))font.value=p.family;
        if(validHex.test(p.color))color.value=p.color;
      }
      if(presets?.['review.body']){
        const p=presets['review.body'];const bodyFont=$('bodyFont'),bodyColor=$('bodyColor');
        if([...bodyFont.options].some(x=>x.value===p.family))bodyFont.value=p.family;
        if(validHex.test(p.color))bodyColor.value=p.color;
      }
      render();
    }).catch(err=>{console.warn('Could not load saved editorial formatting',err);});
  }
  function setNew(){setReview(null);}
  async function saveMarks(reviewId){
    const id=Number(reviewId);if(!id)return;
    return write('verdict',{reviewId:id,marks:clone(marks)});
  }
  const defaults={
    'review.verdict':{family:'Barlow Condensed',size:32,weight:'600',color:'#FFE2B6',align:'left',line:1.3,auto:true},
    'review.body':{family:'Inter',size:16,weight:'400',color:'#F1EDE8',align:'left',line:1.55,auto:true},
  };
  async function saveDefault(key,style,button){
    button.disabled=true;
    try{await write('preset',{key,style});button.textContent='SAVED ✓';}
    catch(error){button.textContent='NOT SAVED';console.error(error);}
    finally{setTimeout(()=>{button.textContent='SAVE DEFAULT';button.disabled=false;},1800);}
  }
  $('verdictSaveDefault').addEventListener('click',()=>saveDefault('review.verdict',{
    ...(presets?.['review.verdict']||defaults['review.verdict']),family:font.value,color:color.value
  },$('verdictSaveDefault')));
  $('bodySaveDefault').addEventListener('click',()=>saveDefault('review.body',{
    ...(presets?.['review.body']||defaults['review.body']),family:$('bodyFont').value,color:$('bodyColor').value
  },$('bodySaveDefault')));
  function styleBodySelected(property,value){
    if(!body)return;
    const sel=window.getSelection?.();
    if(!sel?.rangeCount||!body.contains(sel.anchorNode)||!body.contains(sel.focusNode))return;
    const range=sel.getRangeAt(0);
    if(range.collapsed)return;
    const span=document.createElement('span');
    span.style[property]=value;
    try{range.surroundContents(span);}catch{
      const fragment=range.extractContents();span.appendChild(fragment);range.insertNode(span);
    }
    sel.removeAllRanges();const next=document.createRange();next.selectNodeContents(span);sel.addRange(next);
    body.dispatchEvent(new Event('input',{bubbles:true}));
  }
  $('bodyFont').addEventListener('change',()=>styleBodySelected('fontFamily','"'+$('bodyFont').value+'"'));
  $('bodyColor').addEventListener('change',()=>styleBodySelected('color',$('bodyColor').value));
  window.ReviewEditorial={setReview,setNew,saveMarks,getMarks:()=>clone(marks)};
})();