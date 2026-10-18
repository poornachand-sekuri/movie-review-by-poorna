(() => {
  'use strict';
  // A small plain-text rich editor. Formatting is stored as ranges in the
  // promotional draft, never as untrusted HTML or in the saved movie review.
  const FIELDS=['title','pov'];
  const editors=Object.fromEntries(FIELDS.map(k=>[k,document.querySelector('[data-rich-editor="'+k+'"]')]));
  const toolbars=Object.fromEntries(FIELDS.map(k=>[k,document.querySelector('[data-rich-toolbar="'+k+'"]')]));
  if (!editors.title || !editors.pov) return;
  const savedSelection={title:null,pov:null};
  let syncing=false;
  const bridge=()=>window.SocialStudioRichBridge;
  const colorPattern=/^#[0-9A-Fa-f]{6}$/;
  function styleAt(ranges,start,end) {
    let result=null;
    for(const range of ranges||[]) {
      if(range.start<end && range.end>start) result={...result,...range};
    }
    if(!result)return null;
    const {start:s,end:e,...style}=result;
    return style;
  }
  function compactRanges(ranges){
    const sorted=ranges.filter(r=>r.end>r.start).sort((a,b)=>a.start-b.start);
    const out=[];
    for(const r of sorted){
      const prev=out[out.length-1];
      if(prev && prev.end===r.start && JSON.stringify({...prev,start:0,end:0})===JSON.stringify({...r,start:0,end:0}))prev.end=r.end;
      else out.push({...r});
    }
    return out;
  }
  function mutateRanges(text,ranges,start,end,patch,clear){
    const positions=new Set([0,text.length,start,end]);
    for(const r of ranges||[]){positions.add(Math.max(0,Math.min(text.length,r.start)));positions.add(Math.max(0,Math.min(text.length,r.end)));}
    const boundaries=[...positions].sort((a,b)=>a-b),result=[];
    for(let i=1;i<boundaries.length;i++){
      const a=boundaries[i-1],b=boundaries[i];
      if(b<=a)continue;
      let style=styleAt(ranges,a,b);
      if(a>=start && b<=end)style=clear?null:{...style,...patch};
      if(style && Object.keys(style).length)result.push({start:a,end:b,...style});
    }
    return compactRanges(result);
  }
  function drawEditor(field){
    const editor=editors[field],draft=bridge()?.getDraft();
    if(!draft)return;
    syncing=true;
    const text=String(draft[field]||''),ranges=draft.styles?.[field]||[];
    const boundaries=new Set([0,text.length]);
    for(const r of ranges){boundaries.add(Math.max(0,Math.min(text.length,r.start)));boundaries.add(Math.max(0,Math.min(text.length,r.end)));}
    const bounds=[...boundaries].sort((a,b)=>a-b);
    const fragment=document.createDocumentFragment();
    for(let i=1;i<bounds.length;i++){
      const a=bounds[i-1],b=bounds[i],part=text.slice(a,b);
      if(!part)continue;
      const style=styleAt(ranges,a,b);
      if(!style){fragment.appendChild(document.createTextNode(part));continue;}
      const span=document.createElement('span');
      span.dataset.socialStyle=JSON.stringify(style);
      if(style.color && colorPattern.test(style.color))span.style.color=style.color;
      if(style.font)span.style.fontFamily='"'+style.font.replace(/[^a-zA-Z0-9 ]/g,'')+'"';
      if(Number.isFinite(Number(style.size)))span.style.fontSize=Math.max(17,Math.min(23,Math.round(Number(style.size)*.4)))+'px';
      if(style.weight)span.style.fontWeight=String(style.weight);
      if(style.italic)span.style.fontStyle='italic';
      if(style.underline)span.style.textDecoration='underline';
      if(style.effect==='glow'){span.style.textShadow='0 0 7px currentColor';}
      if(style.effect==='shadow'){span.style.textShadow='2px 2px 4px #000';}
      if(style.effect==='outline'){span.style.webkitTextStroke='.6px #f1f1f1';}
      span.textContent=part;
      fragment.appendChild(span);
    }
    editor.replaceChildren(fragment);
    const base=draft[field+'Style'];
    editor.style.fontFamily='"'+base.family+'"';
    editor.style.color=base.color||(field==='title'?'#060505':'#f1f1f1');
    // The editor remains readable; the canvas underneath is the pixel-accurate export preview.
    editor.style.fontSize='19px';
    editor.style.fontWeight=base.weight;
    editor.style.lineHeight='1.55';
    editor.style.textAlign=base.align;
    syncing=false;
  }
  function scanEditor(field){
    const editor=editors[field],segments=[];
    function walk(node,inherited,root){
      if(node.nodeType===Node.TEXT_NODE){
        if(node.nodeValue)segments.push({text:node.nodeValue,style:inherited});
        return;
      }
      if(node.nodeType!==Node.ELEMENT_NODE)return;
      if(node.tagName==='BR'){segments.push({text:'\n',style:inherited});return;}
      let style=inherited;
      if(node.dataset?.socialStyle) {
        try{style={...inherited,...JSON.parse(node.dataset.socialStyle)};}catch{/* plain text only */}
      }
      if(!root && (node.tagName==='DIV'||node.tagName==='P') && segments.length && !segments[segments.length-1].text.endsWith('\n'))segments.push({text:'\n',style:null});
      for(const child of node.childNodes)walk(child,style,false);
    }
    walk(editor,null,true);
    let text='',ranges=[];
    for(const piece of segments){
      const start=text.length;text+=piece.text.replace(/\u00a0/g,' ');
      if(piece.style)ranges.push({start,end:text.length,...piece.style});
    }
    return {text,ranges:compactRanges(ranges)};
  }
  function syncFromEditor(field){
    if(syncing)return;
    const draft=bridge()?.getDraft();
    if(!draft)return;
    const data=scanEditor(field);
    draft[field]=data.text;
    draft.styles[field]=data.ranges;
    bridge()?.setText(field,data.text);
  }
  function selectionOffsets(field){
    const sel=window.getSelection?.(),editor=editors[field];
    if(!sel || !sel.rangeCount || !editor)return null;
    const range=sel.getRangeAt(0);
    if(!(editor===range.startContainer || editor.contains(range.startContainer)))return null;
    if(!(editor===range.endContainer || editor.contains(range.endContainer)))return null;
    const prefix=document.createRange();
    prefix.selectNodeContents(editor);
    prefix.setEnd(range.startContainer,range.startOffset);
    const before=prefix.toString().length;
    const len=range.toString().length;
    return {start:before,end:before+len};
  }
  function updateToolbar(field){
    const toolbar=toolbars[field],draft=bridge()?.getDraft();
    if(!toolbar||!draft)return;
    const selection=savedSelection[field];
    const at=selection?.start??0;
    const range=styleAt(draft.styles?.[field]||[],at,at+1)||{};
    const base=draft[field+'Style'];
    const values={font:range.font||base.family,size:range.size||base.size,
      color:range.color||base.color||(field==='title'?'#060505':'#f1f1f1'),effect:range.effect||'none'};
    values.hex=values.color.toUpperCase();
    for(const [action,value] of Object.entries(values)){
      const control=toolbar.querySelector('[data-rich-action="'+action+'"]');
      if(control)control.value=String(value);
    }
  }
  function saveSelection(field){
    const result=selectionOffsets(field);
    if(result){savedSelection[field]=result;updateToolbar(field);}
  }
  function selectText(field,start,end){
    const editor=editors[field],selection=window.getSelection();
    const range=document.createRange();
    const cursor=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT);
    let node,at=0,startPoint=null,endPoint=null;
    while((node=cursor.nextNode())){
      const next=at+node.nodeValue.length;
      if(!startPoint && start<=next)startPoint=[node,Math.min(node.nodeValue.length,start-at)];
      if(!endPoint && end<=next){endPoint=[node,Math.min(node.nodeValue.length,end-at)];break;}
      at=next;
    }
    if(!startPoint || !endPoint)return;
    range.setStart(...startPoint);range.setEnd(...endPoint);
    selection.removeAllRanges();selection.addRange(range);
    savedSelection[field]={start,end};
  }
  function applyStyle(field,patch,clear){
    const draft=bridge()?.getDraft();
    if(!draft)return;
    const selected=savedSelection[field] || selectionOffsets(field);
    const fullText=String(draft[field]||'');
    if(!fullText.length){setHint(field,'Enter some text to format.');return;}
    // No highlighted text means the entire Title or MY POV, not a silent no-op.
    const sel=selected && selected.end>selected.start
      ? selected : {start:0,end:fullText.length};
    if(!(selected && selected.end>selected.start)){
      // Whole-text commands set the reusable base AND the export style ranges.
      const base=draft[field+'Style'];
      if(!clear){
        if(patch?.font)base.family=patch.font;
        if(patch?.size)base.size=patch.size;
        if(patch?.color)base.color=patch.color;
        if(patch?.weight)base.weight=patch.weight;
      }
    }
    draft.styles[field]=mutateRanges(fullText,draft.styles[field]||[],sel.start,sel.end,patch,clear);
    drawEditor(field);
    editors[field].focus();
    selectText(field,sel.start,sel.end);
    setHint(field,'Formatting applied to '+(selected && selected.end>selected.start?'selected words':'the entire text')+' in '+bridge().format().toUpperCase()+'.');
    bridge()?.refresh();
  }
  function setHint(field,message) {
    const hint=toolbars[field].closest('.social-rich-shell').querySelector('.social-rich-hint');
    if(hint)hint.textContent=message;
  }
  function action(field,command,value){
    if(command==='clear')return applyStyle(field,null,true);
    if(command==='font'){
      const select=toolbars[field].querySelector('[data-rich-action="font"]');
      if(![...select.options].some(option=>option.value===value))return;
      return applyStyle(field,{font:value},false);
    }
    if(command==='size')return applyStyle(field,{size:Math.max(18,Math.min(100,Number(value)||42))},false);
    if((command==='color'||command==='hex') && colorPattern.test(value))return applyStyle(field,{color:value.toUpperCase()},false);
    if(command==='hex')setHint(field,'Enter a 6-digit hex color such as #F7010E.');
    if(command==='effect')return applyStyle(field,{effect:value},false);
    const draft=bridge()?.getDraft(),sel=savedSelection[field];
    if(!draft)return;
    const start=sel && sel.end>sel.start?sel.start:0;
    const existing=styleAt(draft.styles[field]||[],start,start+1)||{};
    if(command==='bold') {
      const currentWeight=existing.weight||draft[field+'Style'].weight;
      return applyStyle(field,{weight:currentWeight==='700'?'400':'700'},false);
    }
    if(command==='italic')return applyStyle(field,{italic:!existing.italic},false);
    if(command==='underline')return applyStyle(field,{underline:!existing.underline},false);
  }
  function plainInsert(text){
    const sel=window.getSelection();
    if(!sel?.rangeCount)return;
    const range=sel.getRangeAt(0);
    range.deleteContents();
    const item=document.createTextNode(text);
    range.insertNode(item);
    range.setStartAfter(item);range.collapse(true);
    sel.removeAllRanges();sel.addRange(range);
  }
  FIELDS.forEach(field=>{
    const editor=editors[field],toolbar=toolbars[field];
    editor.addEventListener('input',()=>syncFromEditor(field));
    editor.addEventListener('focus',()=>saveSelection(field));
    editor.addEventListener('keyup',()=>saveSelection(field));
    editor.addEventListener('mouseup',()=>saveSelection(field));
    editor.addEventListener('keydown',e=>{
      if((e.ctrlKey||e.metaKey)&&!e.altKey){
        const cmd={b:'bold',i:'italic',u:'underline'}[e.key.toLowerCase()];
        if(cmd){e.preventDefault();saveSelection(field);action(field,cmd);return;}
      }
      if(e.key==='Enter'){
        e.preventDefault();plainInsert('\n');
        editor.dispatchEvent(new Event('input',{bubbles:true}));
      }
    });
    editor.addEventListener('paste',e=>{
      e.preventDefault();
      plainInsert(e.clipboardData?.getData('text/plain')||'');
      editor.dispatchEvent(new Event('input',{bubbles:true}));
    });
    toolbar.addEventListener('pointerdown',()=>{
      const active=selectionOffsets(field);
      if(active)savedSelection[field]=active;
    },true);
    toolbar.addEventListener('click',event=>{
      const target=event.target.closest('button');
      if(!target)return;
      const cmd=target.dataset.richAction;
      if(cmd)action(field,cmd);
      if(target.dataset.richColor){
        toolbar.querySelector('[data-rich-action="color"]').value=target.dataset.richColor;
        toolbar.querySelector('[data-rich-action="hex"]').value=target.dataset.richColor.toUpperCase();
        action(field,'color',target.dataset.richColor);
      }
    });
    toolbar.addEventListener('change',event=>{
      const control=event.target;
      const cmd=control.dataset.richAction;
      if(['font','size','color','hex','effect'].includes(cmd))action(field,cmd,control.value);
    });
    const more=document.createElement('button');
    more.type='button';
    more.dataset.richExpand='true';
    more.textContent='MORE COLORS & EFFECTS';
    more.setAttribute('aria-expanded','false');
    more.addEventListener('click',()=>{
      const visible=toolbar.classList.toggle('show-advanced');
      more.setAttribute('aria-expanded',String(visible));
      more.textContent=visible?'LESS OPTIONS':'MORE COLORS & EFFECTS';
    });
    toolbar.appendChild(more);
    const hint=document.createElement('p');
    hint.className='social-rich-hint';
    hint.textContent='Select words to format them, or leave text unselected to format the entire box.';
    toolbar.parentElement.appendChild(hint);
  });
  document.addEventListener('selectionchange',()=>{
    for(const field of FIELDS)saveSelection(field);
  });
  window.SocialStudioRich={
    sync(){
      if(!bridge()?.getDraft())return;
      FIELDS.forEach(field=>{drawEditor(field);savedSelection[field]=null;updateToolbar(field);});
    },
    refreshLayout(){
      if(!bridge()?.getDraft())return;
      // Update base alignment/line spacing in-place to preserve the current selection.
      for(const field of FIELDS){
        const base=bridge().getDraft()[field+'Style'];
        editors[field].style.lineHeight='1.55';
        editors[field].style.textAlign=base.align;
      }
    }
  };
})();