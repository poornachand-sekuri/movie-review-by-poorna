(()=>{
  const nativeFetch=window.fetch.bind(window);
  let byId=new Map();
  let catalogPromise=null;

  const hasText=v=>typeof v==='string'&&v.trim()!=='';
  function mergeReview(base,live){
    if(!live)return base;
    return {
      ...base,
      ...live,
      t:hasText(live.t)?live.t:base.t,
      s:hasText(live.s)?live.s:base.s,
      d:hasText(live.d)?live.d:base.d,
      l:hasText(live.l)?live.l:base.l,
      m:hasText(live.m)?live.m:base.m,
      e:hasText(live.e)?live.e:base.e,
      rd:hasText(live.rd)?live.rd:base.rd,
      r:live.r==null?base.r:live.r,
      v:hasText(live.v)?live.v:base.v,
      body:base.body||'',
      gallery:Array.isArray(base.gallery)?base.gallery:[]
    };
  }

  async function mergedCatalog(){
    if(catalogPromise)return catalogPromise;
    catalogPromise=(async()=>{
      const staticRes=await nativeFetch('/data/index.json?native-cutover=2',{credentials:'same-origin',cache:'no-store'});
      if(!staticRes.ok)throw new Error('static catalog unavailable');
      const base=await staticRes.json();
      let merged=base;
      try{
        const apiRes=await nativeFetch('/api/reviews',{credentials:'same-origin',cache:'no-store'});
        if(apiRes.ok){
          const live=await apiRes.json();
          const liveById=new Map(live.map(x=>[Number(x.i),x]));
          const baseIds=new Set(base.map(x=>Number(x.i)));
          merged=base.map(x=>mergeReview(x,liveById.get(Number(x.i))));
          for(const item of live){if(!baseIds.has(Number(item.i)))merged.push(item)}
        }
      }catch{}
      byId=new Map(merged.map(x=>[Number(x.i),x]));
      return merged;
    })().catch(e=>{catalogPromise=null;throw e});
    return catalogPromise;
  }

  function jsonResponse(data){
    return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
  }

  window.fetch=async function(input,init){
    const raw=typeof input==='string'?input:input?.url;
    let url;try{url=new URL(raw,location.href)}catch{return nativeFetch(input,init)}

    if(url.origin===location.origin&&url.pathname==='/data/index.json'){
      try{return jsonResponse(await mergedCatalog())}catch{return nativeFetch(input,init)}
    }

    const wp=url.hostname==='public-api.wordpress.com'&&url.pathname.match(/\/posts\/(\d+)\/?$/);
    if(wp){
      const id=Number(wp[1]);
      try{
        if(!byId.size)await mergedCatalog();
        const item=byId.get(id);
        if(item?.s){
          try{
            const r=await nativeFetch(`/api/reviews/${encodeURIComponent(item.s)}`,{credentials:'same-origin',cache:'no-store'});
            if(r.ok){const full=await r.json();if(hasText(full.body))return jsonResponse({content:full.body})}
          }catch{}
          if(hasText(item.body))return jsonResponse({content:item.body});
        }
      }catch{}
      return nativeFetch(input,init);
    }

    return nativeFetch(input,init);
  };
})();