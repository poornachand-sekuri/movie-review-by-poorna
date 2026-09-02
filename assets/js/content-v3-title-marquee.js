function mountContentTitleMarquee(){
  const title=document.querySelector('.content-v3 .cv3-title');
  if(!title||title.dataset.marqueeMounted==='true') return false;
  title.dataset.marqueeMounted='true';
  const text=title.textContent.trim();
  title.replaceChildren();
  const track=document.createElement('span');
  track.className='cv3-title-track';
  track.textContent=text;
  title.append(track);

  let frame=0;
  const update=()=>{
    cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>{
      title.classList.remove('is-marquee');
      title.style.removeProperty('--cv3-title-shift');
      title.style.removeProperty('--cv3-title-duration');
      const available=Math.max(0,title.clientWidth-8);
      const overflow=Math.ceil(track.scrollWidth-available);
      if(overflow>2){
        const shift=overflow+14;
        title.style.setProperty('--cv3-title-shift',`${shift}px`);
        title.style.setProperty('--cv3-title-duration',`${Math.max(5.5,Math.min(11,shift/12)).toFixed(1)}s`);
        title.classList.add('is-marquee');
      }
    });
  };

  update();
  if('ResizeObserver' in window){
    const observer=new ResizeObserver(update);
    observer.observe(title);
  }else{
    window.addEventListener('resize',update,{passive:true});
  }
  return true;
}

if(!mountContentTitleMarquee()){
  const observer=new MutationObserver(()=>{
    if(mountContentTitleMarquee()) observer.disconnect();
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
}
