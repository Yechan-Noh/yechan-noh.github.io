(() => {
 const button=document.getElementById('motion');
 if(!button)return;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let paused=reduced.matches;
 function label(){button.dataset.paused=String(paused);button.setAttribute('aria-label',paused?'Play CMBL animation':'Pause CMBL animation');button.title=paused?'Play animation':'Pause animation';}
 button.addEventListener('click',()=>{paused=!paused;label();window.dispatchEvent(new CustomEvent('cmbl-motion',{detail:!paused}));});
 reduced.addEventListener('change',e=>{if(e.matches){paused=true;label();}});
 label();
})();
