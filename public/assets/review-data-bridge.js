(()=>{
  const nativeFetch=window.fetch.bind(window);
  let byId=new Map();
  let catalogPromise=null;
  async function apiCatalog(){
    if(catalogPromise)return catalogPromise;
    catalogPromise=(async()=>{try{const r=await nativeFetch('/api/reviews',{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw new Error('api unavailable');const data=await r.clone().json();byId=new Map(data.map(x=>[Number(x.i),x]));return {response:r,data}}catch(e){catalogPromise=null;throw e}})();
    return catalogPromise;
  }
  window.fetch=async function(input,init){
    const raw=typeof input==='string'?input:input?.url;
    let url;try{url=new URL(raw,location.href)}catch{return nativeFetch(input,init)}
    if(url.origin===location.origin&&url.pathname==='/data/index.json'){
      try{return (await apiCatalog()).response.clone()}catch{return nativeFetch(input,init)}
    }
    const wp=url.hostname==='public-api.wordpress.com'&&url.pathname.match(/\/posts\/(\d+)\/?$/);
    if(wp){
      const id=Number(wp[1]);
      try{
        if(!byId.size)await apiCatalog();
        const item=byId.get(id);
        if(item?.s){
          const r=await nativeFetch(`/api/reviews/${encodeURIComponent(item.s)}`,{credentials:'same-origin',cache:'no-store'});
          if(r.ok){const full=await r.json();if(full.body){return new Response(JSON.stringify({content:full.body}),{status:200,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}})}}
        }
      }catch{}
      return nativeFetch(input,init);
    }
    return nativeFetch(input,init);
  };
})();