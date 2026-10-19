import { getContentDb } from '../cloudflare/content-db';

export const EDITORIAL_FONTS = ['Inter','Oswald','Cinzel','Source Serif 4','Bebas Neue','Anton','Barlow Condensed','Montserrat','Playfair Display','Poppins','Rajdhani','Merriweather'] as const;
export const EDITORIAL_KEYS = ['social.title','social.pov','social.language','review.verdict','review.body'] as const;
export type EditorialKey = typeof EDITORIAL_KEYS[number];
export type EditorialStyle = {
  family:string;size:number;weight:string;color:string;align:'left'|'center'|'right';line:number;auto:boolean;
};
export type EditorialMark = {
  start:number;end:number;color?:string;font?:string;size?:number;weight?:string;italic?:boolean;underline?:boolean;effect?:string;
};
export const EDITORIAL_DEFAULTS: Record<EditorialKey,EditorialStyle> = {
  'social.title': {family:'Oswald',size:59,weight:'700',color:'#060505',align:'center',line:1.11,auto:true},
  'social.pov': {family:'Inter',size:48,weight:'600',color:'#F1F1F1',align:'left',line:1.22,auto:true},
  'social.language': {family:'Oswald',size:38,weight:'700',color:'#F1F1F1',align:'center',line:1.1,auto:true},
  'review.verdict': {family:'Barlow Condensed',size:48,weight:'600',color:'#FFE2B6',align:'left',line:1.3,auto:true},
  'review.body': {family:'Inter',size:16,weight:'400',color:'#F1EDE8',align:'left',line:1.55,auto:true},
};
const COLOR=/^#[0-9a-fA-F]{6}$/;
const WEIGHTS=new Set(['400','500','600','700','800']);
const EFFECTS=new Set(['none','glow','shadow','outline']);
const isObj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const clamp=(v:unknown,min:number,max:number,def:number)=>typeof v==='number'&&Number.isFinite(v)?Math.max(min,Math.min(max,v)):def;
const hex=(v:unknown,def:string)=>typeof v==='string'&&COLOR.test(v)?v.toUpperCase():def;
const parse=(s:string|null,def:unknown):unknown=>{try{return s?JSON.parse(s):def;}catch{return def;}};

export function sanitizeStyle(value:unknown,key:EditorialKey):EditorialStyle {
  const base=EDITORIAL_DEFAULTS[key],v=isObj(value)?value:{};
  return {
    family:typeof v.family==='string'&&EDITORIAL_FONTS.some(x=>x===v.family)?v.family:base.family,
    size:clamp(v.size,key.startsWith('social.')?18:10,key.startsWith('social.')?100:48,base.size),
    weight:typeof v.weight==='string'&&WEIGHTS.has(v.weight)?v.weight:base.weight,
    color:hex(v.color,base.color),
    align:v.align==='center'||v.align==='right'?v.align:v.align==='left'?'left':base.align,
    line:clamp(v.line,1,2,base.line),
    auto:typeof v.auto==='boolean'?v.auto:base.auto,
  };
}
export function sanitizeMarks(value:unknown,len:number):EditorialMark[] {
  if(!Array.isArray(value))return [];
  const result:EditorialMark[]=[];
  for(const item of value.slice(0,120)){
    if(!isObj(item))continue;
    const start=Number(item.start),end=Number(item.end);
    if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<=start||end>len)continue;
    const mark:EditorialMark={start,end};
    if(typeof item.color==='string'&&COLOR.test(item.color))mark.color=item.color.toUpperCase();
    if(typeof item.font==='string'&&EDITORIAL_FONTS.some(x=>x===item.font))mark.font=item.font;
    if(typeof item.size==='number'&&Number.isFinite(item.size))mark.size=Math.max(10,Math.min(100,item.size));
    if(typeof item.weight==='string'&&WEIGHTS.has(item.weight))mark.weight=item.weight;
    if(typeof item.italic==='boolean')mark.italic=item.italic;
    if(typeof item.underline==='boolean')mark.underline=item.underline;
    if(typeof item.effect==='string'&&EFFECTS.has(item.effect))mark.effect=item.effect;
    result.push(mark);
  }
  return result.sort((a,b)=>a.start-b.start||a.end-b.end);
}
export function sanitizeSocialDraft(value:unknown):Record<string,unknown> {
  if(!isObj(value))throw new Error('Invalid social draft.');
  const title=String(value.title??'').slice(0,180),pov=String(value.pov??'').slice(0,1500),language=String(value.language??'').slice(0,60);
  const styles=isObj(value.styles)?value.styles:{};
  const rating=value.rating==null?'':String(value.rating);
  if(rating!==''&&(!Number.isFinite(Number(rating))||Number(rating)<0||Number(rating)>5||!Number.isInteger(Number(rating)*4)))throw new Error('Rating must use 0.25 increments.');
  return {
    title,pov,language,rating,titleCase:value.titleCase==='original'?'original':'uppercase',
    titleStyle:sanitizeStyle(value.titleStyle,'social.title'),
    povStyle:sanitizeStyle(value.povStyle,'social.pov'),
    languageStyle:sanitizeStyle(value.languageStyle,'social.language'),
    styles:{title:sanitizeMarks(styles.title,title.length),pov:sanitizeMarks(styles.pov,pov.length)},
  };
}
export async function getEditorialPresets():Promise<Record<EditorialKey,EditorialStyle>> {
  const rows=await getContentDb().prepare('SELECT preset_key,style_json FROM editorial_presets').run<{preset_key:string;style_json:string}>();
  const presets=structuredClone(EDITORIAL_DEFAULTS);
  for(const row of rows.results){const key=row.preset_key as EditorialKey;if(EDITORIAL_KEYS.includes(key))presets[key]=sanitizeStyle(parse(row.style_json,null),key);}
  return presets;
}
export async function getSocialEditorial(reviewId:number):Promise<{presets:Record<EditorialKey,EditorialStyle>;drafts:Record<string,unknown>}> {
  const [presets,rows]=await Promise.all([getEditorialPresets(),
    getContentDb().prepare('SELECT format,draft_json FROM social_promotional_drafts WHERE review_id=?1').bind(reviewId).run<{format:string;draft_json:string}>()]);
  const drafts:Record<string,unknown>={};
  for(const row of rows.results)drafts[row.format]=parse(row.draft_json,null);
  return {presets,drafts};
}
export async function saveEditorialPreset(key:EditorialKey,style:unknown):Promise<EditorialStyle> {
  if(!EDITORIAL_KEYS.includes(key))throw new Error('Invalid editorial preset.');
  const normalized=sanitizeStyle(style,key);
  await getContentDb().prepare('INSERT INTO editorial_presets(preset_key,style_json) VALUES(?1,?2) ON CONFLICT(preset_key) DO UPDATE SET style_json=excluded.style_json,updated_at=CURRENT_TIMESTAMP').bind(key,JSON.stringify(normalized)).run();
  return normalized;
}
export async function saveSocialEditorial(reviewId:number,format:string,draft:unknown):Promise<void> {
  if(!Number.isInteger(reviewId)||reviewId<=0||!['shared','post','story'].includes(format))throw new Error('Invalid review or format.');
  const normalized=sanitizeSocialDraft(draft);
  await getContentDb().prepare('INSERT INTO social_promotional_drafts(review_id,format,draft_json) VALUES(?1,?2,?3) ON CONFLICT(review_id,format) DO UPDATE SET draft_json=excluded.draft_json,updated_at=CURRENT_TIMESTAMP').bind(reviewId,format,JSON.stringify(normalized)).run();
}
/** Insert-only bulk recommendation. Never overwrite existing shared/Post/Story
 * movie styling, even if an editor saved changes during a long bulk scan. */
export async function prepareSocialEditorialIfAbsent(reviewId:number,draft:unknown):Promise<boolean> {
  if(!Number.isInteger(reviewId)||reviewId<=0)throw new Error('Invalid review.');
  const normalized=sanitizeSocialDraft(draft);
  const result=await getContentDb().prepare(`
    INSERT INTO social_promotional_drafts (review_id,format,draft_json)
    SELECT ?1,'shared',?2
    WHERE NOT EXISTS (
      SELECT 1 FROM social_promotional_drafts WHERE review_id=?1
    )
  `).bind(reviewId,JSON.stringify(normalized)).run();
  return Number(result.meta.changes||0)>0;
}
export async function deleteSocialOverride(reviewId:number,format:string):Promise<void> {
  if(!Number.isInteger(reviewId)||reviewId<=0||!['post','story'].includes(format))throw new Error('Invalid review or format.');
  await getContentDb().prepare('DELETE FROM social_promotional_drafts WHERE review_id=?1 AND format=?2').bind(reviewId,format).run();
}
export async function getAdminVerdictMarks(reviewId:number):Promise<EditorialMark[]> {
  const r=await getContentDb().prepare('SELECT marks_json FROM review_verdict_formatting WHERE review_id=?1').bind(reviewId).first<{marks_json:string}>();
  return sanitizeMarks(parse(r?.marks_json??null,[]),260);
}
export async function saveVerdictMarks(reviewId:number,verdict:string,marks:unknown):Promise<EditorialMark[]> {
  if(!Number.isInteger(reviewId)||reviewId<=0)throw new Error('Invalid review.');
  const clean=sanitizeMarks(marks,verdict.length);
  await getContentDb().prepare('INSERT INTO review_verdict_formatting(review_id,marks_json) VALUES(?1,?2) ON CONFLICT(review_id) DO UPDATE SET marks_json=excluded.marks_json,updated_at=CURRENT_TIMESTAMP').bind(reviewId,JSON.stringify(clean)).run();
  return clean;
}
export async function getPublicEditorial(reviewId:number):Promise<{verdict:EditorialStyle;body:EditorialStyle;marks:EditorialMark[];hasVerdictPreset:boolean;hasBodyPreset:boolean}> {
  // One indexed query for a single displayed movie, never for browse/search lists.
  const sql="SELECT (SELECT style_json FROM editorial_presets WHERE preset_key='review.verdict') AS verdict_style, (SELECT style_json FROM editorial_presets WHERE preset_key='review.body') AS body_style, (SELECT marks_json FROM review_verdict_formatting WHERE review_id=?1) AS marks_json";
  const row=await getContentDb().prepare(sql).bind(reviewId).first<{verdict_style:string|null;body_style:string|null;marks_json:string|null}>();
  return {verdict:sanitizeStyle(parse(row?.verdict_style??null,null),'review.verdict'),body:sanitizeStyle(parse(row?.body_style??null,null),'review.body'),marks:sanitizeMarks(parse(row?.marks_json??null,[]),260),hasVerdictPreset:!!row?.verdict_style,hasBodyPreset:!!row?.body_style};
}
const escapeHtml=(s:string):string=>s.replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]??x));
export function renderMarkedVerdict(text:string,marks:EditorialMark[]):string {
  if(!text)return '';
  const cut=new Set([0,text.length]);
  for(const m of marks)if(m.start>=0&&m.end<=text.length&&m.end>m.start){cut.add(m.start);cut.add(m.end);}
  const bounds=[...cut].sort((a,b)=>a-b);let html='';
  for(let i=1;i<bounds.length;i++){
    const start=bounds[i-1]!,end=bounds[i]!,chunk=escapeHtml(text.slice(start,end));
    const matching=marks.filter(m=>m.start<=start&&m.end>=end);
    if(!matching.length){html+=chunk;continue;}
    const style=Object.assign({},...matching) as EditorialMark;
    const css=[
      style.color&&COLOR.test(style.color)?'color:'+style.color:'',
      style.weight&&WEIGHTS.has(style.weight)?'font-weight:'+style.weight:'',
      style.italic?'font-style:italic':'',style.underline?'text-decoration:underline':'',
      style.font&&EDITORIAL_FONTS.some(x=>x===style.font)?'font-family:"'+style.font+'"':'',
    ].filter(Boolean).join(';');
    html+=css?'<span style="'+css+'">'+chunk+'</span>':chunk;
  }
  return html;
}
export function editorialCss(style:EditorialStyle):string {
  return 'font-family:"'+style.family+'",sans-serif;font-weight:'+style.weight+';color:'+style.color+';text-align:'+style.align+';line-height:'+style.line;
}
