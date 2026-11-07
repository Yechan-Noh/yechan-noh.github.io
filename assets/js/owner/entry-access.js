(() => {
  'use strict';
  const base=document.currentScript.dataset.base||'';
  const key='mtsg-overview-entry-v1';
  const panel=document.querySelector('[data-owner-panel]');
  const status=document.querySelector('[data-owner-status]');
  let entered=location.hash==='#overview';
  try { entered ||= sessionStorage.getItem(key)==='yes'; } catch {}
  if(!entered){status.textContent='Open this page from the website’s overview entry.';return;}
  try {
    sessionStorage.setItem(key,'yes');
    localStorage.removeItem('mtsg-owner-session-v2');
    sessionStorage.removeItem('mtsg-owner-session-v1');
  } catch {}
  history.replaceState(null,'',location.pathname+location.search);
  window.MTSGAnalytics?.excludeOwner();
  // This is a navigation shortcut, not authentication. The read-only server
  // exposes only this site's reports; Google credentials never reach the browser.
  const connection={backendUrl:'https://mtsg-analytics-reader.yemin-family.chatgpt.site'};
  const view=document.createElement('div'); view.dataset.privateView='';
  document.body.append(view); panel.hidden=true;
  let overview;
  function close(){overview?.dispose();try{sessionStorage.removeItem(key);}catch{}location.assign(base+'/');}
  overview=window.MTSGOverview.mount({root:view,propertyId:'499333574',getSession:()=>connection,onRenew:()=>overview.reload(),onSignOut:close});
  window.addEventListener('pagehide',()=>overview?.dispose(),{once:true});
  window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
})();
