(()=>{
  const nativeFetch=window.fetch.bind(window);
  let catalogPromise=null;
  async function apiCatalog(){
    if(catalogPromise)return catalogPromise;
    catalogPromise=(async()=>{try{const r=await nativeFetch('/api/reviews',{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw new Error('api unavailable');return {response:r}}catch(e){catalogPromise=null;throw e}})();
    return catalogPromise;
  }
  window.fetch=async function(input,init){
    const raw=typeof input==='string'?input:input?.url;
    let url;try{url=new URL(raw,location.href)}catch{return nativeFetch(input,init)}
    if(url.origin===location.origin&&url.pathname==='/data/index.json'){
      try{return (await apiCatalog()).response.clone()}catch{return nativeFetch(input,init)}
    }
    return nativeFetch(input,init);
  };
})();
