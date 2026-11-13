(() => {
  'use strict';
  const PROJECT='river-autumn-403814', DATASET='analytics_499333574';
  const ENDPOINT=`https://bigquery.googleapis.com/bigquery/v2/projects/${PROJECT}`;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cache=new Map();
  const clear=()=>cache.clear();
  function querySpec(range, filters={}) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(range.start)||!/^\d{4}-\d{2}-\d{2}$/.test(range.end))throw new Error('Invalid date range.');
    // Group by the real browser + session key, never by city or time proximity.
    const query=`WITH events AS (
      SELECT event_timestamp, event_name, user_pseudo_id,
        (SELECT value.int_value FROM UNNEST(event_params) WHERE key='ga_session_id') AS sid,
        (SELECT value.int_value FROM UNNEST(event_params) WHERE key='ga_session_number') AS session_number,
        COALESCE(session_traffic_source_last_click.cross_channel_campaign.source, collected_traffic_source.manual_source) AS source,
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key='link_url') AS link_url,
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key='content_label') AS content_label,
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key='page_location') AS url,
        COALESCE((SELECT value.int_value FROM UNNEST(event_params) WHERE key='engagement_time_msec'),0) AS engagement,
        geo.city AS city, geo.region AS region, geo.country AS country, device.category AS device
      FROM \`${PROJECT}.${DATASET}.events_*\`
      WHERE _TABLE_SUFFIX BETWEEN @start AND @end
    ), site AS (
      SELECT *,REGEXP_EXTRACT(url,r'^https?://[^/]+([^?#]*)') AS path FROM events
      WHERE NET.HOST(url)='yechan-noh.github.io' AND user_pseudo_id IS NOT NULL AND sid IS NOT NULL
    ), visits AS (
      SELECT TO_HEX(SHA256(CONCAT(user_pseudo_id,':',CAST(sid AS STRING)))) AS id,
        TO_HEX(SHA256(user_pseudo_id)) AS browser_id,
        MAX(session_number)>1 AS returning,
        ARRAY_AGG(source IGNORE NULLS ORDER BY event_timestamp LIMIT 1)[SAFE_OFFSET(0)] AS source,
        ARRAY_AGG(IF(event_name IN ('research_topic','research_paper','research_cv','research_email'),STRUCT(CAST(event_timestamp/1000 AS INT64) AS time_ms,content_label AS label,link_url AS url),NULL) IGNORE NULLS ORDER BY event_timestamp LIMIT 100) AS actions,
        CAST(MIN(event_timestamp)/1000 AS INT64) AS first_ms,
        CAST(MAX(event_timestamp)/1000 AS INT64) AS last_ms,
        SUM(engagement)/1000.0 AS engagement_seconds,
        ARRAY_AGG(STRUCT(city,region,country,device) ORDER BY event_timestamp LIMIT 1)[OFFSET(0)] AS location,
        COUNTIF(event_name='page_view') AS page_views,
        ARRAY_AGG(IF(event_name='page_view',STRUCT(CAST(event_timestamp/1000 AS INT64) AS time_ms,path AS path),NULL)
          IGNORE NULLS ORDER BY event_timestamp LIMIT 200) AS pages
      FROM site
      WHERE REGEXP_CONTAINS(path,r'^(/MPSG(/.*)?|/|/index\\.html|/(people|research|publication|publications|news|gallery|contact)(/.*)?)$')
        AND NOT REGEXP_CONTAINS(path,r'^/(MPSG/)?(owner|dashboard)(/|$)')
      GROUP BY user_pseudo_id,sid
      HAVING page_views>0
    )
    SELECT TO_JSON_STRING(v) AS visit FROM visits v
    WHERE (@country='' OR location.country=@country) AND (@device='' OR location.device=@device)
    ORDER BY first_ms DESC LIMIT 501`;
    return {query,useLegacySql:false,location:'US',timeoutMs:10000,maxResults:501,maximumBytesBilled:'100000000',parameterMode:'NAMED',queryParameters:Object.entries({start:range.start.replaceAll('-',''),end:range.end.replaceAll('-',''),country:filters.country||'',device:filters.device||''}).map(([name,value])=>({name,parameterType:{type:'STRING'},parameterValue:{value}}))};
  }
  function messageFor(status, body) {
    const text=body.error?.message||'';
    if(status===401||/insufficient authentication scopes/i.test(text))return 'Connect visit records with Google to allow read-only access.';
    if(status===404||/not found.*(dataset|table)|(dataset|table).*not found|does not match any table/i.test(text))return 'Waiting for the first daily export. The connection was created on November 6, 2026; earlier individual visits cannot be recovered here. Google normally starts exporting within 24 hours, but delivery can take longer.';
    if(/maximum bytes billed|quota|billingTierLimitExceeded/i.test(text)||status===429)return 'The query limit was reached. Choose a shorter date range; no billing upgrade is required by this dashboard.';
    if(status===403)return 'Google has not granted access to these visit records. Check the connected account and BigQuery permissions.';
    return 'Visit records could not be loaded. Please try again later.';
  }
  async function loadVisits({range,filters,token,backendUrl,signal,fetcher=fetch}) {
    if(backendUrl) {
      const r=await fetcher(backendUrl+'/visits',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({range:{start:range.start,end:range.end},filters}),cache:'no-store',credentials:'omit',signal});
      const body=await r.json();
      if(!r.ok)throw new Error(body.error?.message||'Visit records could not be loaded.');
      if(!Array.isArray(body.visits))throw new Error('The visit response is incomplete.');
      return body;
    }
    async function call(url,opts={}) {
      const r=await fetcher(url,{...opts,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},cache:'no-store',credentials:'omit',signal});
      const body=await r.json();
      if(!r.ok||body.errors?.length){const e=new Error(messageFor(r.status,body));e.connect=r.status===401||/insufficient authentication scopes/i.test(body.error?.message||'');throw e;}
      return body;
    }
    let body=await call(ENDPOINT+'/queries',{method:'POST',body:JSON.stringify(querySpec(range,filters))});
    let polls=0;
    while(body.jobComplete===false) {
      if(++polls>6)throw new Error('The visit query is taking too long. Please retry shortly.');
      const ref=body.jobReference;
      if(ref?.projectId!==PROJECT||!ref.jobId)throw new Error('Invalid query reference.');
      body=await call(`${ENDPOINT}/queries/${encodeURIComponent(ref.jobId)}?location=US&timeoutMs=10000&maxResults=501`);
    }
    const all=[];
    function collect(result){for(const row of result.rows||[])all.push(JSON.parse(row.f[0].v));}
    collect(body);
    while(body.pageToken && all.length<501) {
      const ref=body.jobReference;
      body=await call(`${ENDPOINT}/queries/${encodeURIComponent(ref.jobId)}?location=US&maxResults=501&pageToken=${encodeURIComponent(body.pageToken)}`);collect(body);
    }
    return {visits:all.slice(0,500),limited:all.length>500||Boolean(body.pageToken),total:Number(body.totalRows||all.length)};
  }

  function canonical(path) {return (path||'/').replace(/^\/MPSG(?=\/|$)/,'').replace(/^\/index\.html$/,'/')||'/';}
  function pageName(path) {
    const p=canonical(path), names={'/':'Home','/people/':'People','/research/':'Research','/publications/':'Publications','/news/':'News','/gallery/':'Gallery','/contact/':'Contact'};
    return names[p.endsWith('/')?p:p+'/']||p;
  }
  function compactPages(pages=[]) {
    const list=[];
    for(const p of pages){const last=list.at(-1);if(last&&canonical(last.path)===canonical(p.path))last.repeat++;else list.push({...p,repeat:1});}
    return list;
  }
  function researchToPapers(v) {const paths=(v.pages||[]).map(p=>canonical(p.path));const start=paths.findIndex(p=>/^\/research(\/|$)/.test(p));return start>=0&&paths.slice(start+1).some(p=>/^\/publications(\/|$)/.test(p));}
  function journeySummary(data) {const research=data.filter(v=>(v.pages||[]).some(p=>/^\/research(\/|$)/.test(canonical(p.path)))).length;return {research,continued:data.filter(researchToPapers).length,returning:data.filter(v=>v.returning).length,scholar:data.filter(v=>/scholar\.google/i.test(v.source||'')).length};}
  function filterVisits(data,{search='',city='',kind='',browser=''}={}) {
    return data.filter(v=>(!city||JSON.stringify([v.location.country,v.location.region,v.location.city])===city)&&(!browser||v.browser_id===browser)&&
      (!kind||kind==='returning'&&v.returning||kind==='research'&&(v.pages||[]).some(p=>/^\/(research|publications)(\/|$)/.test(canonical(p.path)))||kind==='actions'&&(v.actions||[]).length||kind==='sequence'&&researchToPapers(v))&&
      `${v.location.city} ${v.location.region} ${v.source||''} ${(v.pages||[]).map(p=>pageName(p.path)).join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  }
  function renderVisits(data,timezone,search='',options={}) {
    const time=ms=>new Intl.DateTimeFormat('en-US',{timeZone:timezone,month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(Number(ms)));
    const mins=s=>{const n=Math.round(Number(s)||0);return n>=60?`${Math.floor(n/60)}m ${n%60}s`:`${n}s`;};
    const visible=filterVisits(data,{...options,search});
    return visible.map(v=>`<details class="ov-city ov-session" data-session="${esc(v.id)}"><summary><span><strong>${esc(v.location.city||'City unavailable')} <em class="ov-badge">${v.returning?'Returning browser':v.returning===false?'First session':'History unavailable'}</em></strong><small>${esc(time(v.first_ms))} · ${esc(v.location.region)} · ${esc(v.location.device)}</small><span class="ov-route">${compactPages(v.pages).slice(0,5).map(p=>esc(pageName(p.path))+(p.repeat>1?` ×${p.repeat}`:'')).join(' → ')}${compactPages(v.pages).length>5?' → …':''}</span></span><span><b>${Number(v.page_views)} ${Number(v.page_views)===1?'view':'views'}</b><small>${esc(mins(v.engagement_seconds))} active</small></span></summary><div class="ov-session-detail"><p class="ov-visit-meta"><span>Source: ${esc(v.source||'Unattributed')}</span><span>Observed interval: ${esc(mins((v.last_ms-v.first_ms)/1000))}</span><span>Visit ${esc(v.id.slice(0,8))}</span></p>${v.browser_id?`<button type="button" data-visit-browser="${esc(v.browser_id)}">Other visits from this browser</button>`:''}<ol class="ov-visit-path">${compactPages(v.pages).map(p=>`<li><time>${esc(time(p.time_ms))}</time><strong>${esc(pageName(p.path))}</strong>${p.repeat>1?` · ${p.repeat} consecutive views`:''}<small>${esc(p.path)}</small></li>`).join('')}</ol>${(v.actions||[]).length?`<h3>Recorded selections</h3><ul>${v.actions.map(a=>`<li>${esc(time(a.time_ms))} · ${esc(a.label||a.url||'Link selected')}</li>`).join('')}</ul>`:''}${v.page_views>200?'<p class="ov-help">First 200 page views shown.</p>':''}</div></details>`).join('')||'<p class="ov-empty">No exported visits match this selection.</p>';
  }
  function mount({root,range,filters,timezone,getSession,onRenew,onSelectCity,onClearCity,onSummary,initialCity='',initialKind=''}) {
    if(!root)return;
    let controller=new AbortController(),disposed=false,data=[],needsPermission=false,loaded=false,attempted=false;
    const view={city:initialCity,kind:initialKind,browser:'',search:''};
    root.innerHTML=`<div class="ov-card-title"><div><p class="ov-eyebrow">Visit explorer</p><h2>One visit. Every recorded step.</h2><p class="ov-help">Daily event exports · November 5, 2026 onward · ${esc(timezone)}</p></div><button type="button" data-visit-load>Load visit records</button></div><p data-visit-status role="status">Open Visits to load records. Aggregate reports remain available in Overview.</p><div class="ov-visit-controls"><label>Find city, page or source<input type="search" data-visit-search placeholder="Research, Chicago, scholar…"></label><label>Show<select data-visit-kind><option value="">All visits</option><option value="returning">Returning browsers</option><option value="research">Research or Publications</option><option value="actions">Recorded selections</option><option value="sequence">Research → Publications</option></select></label><button type="button" data-visit-clear>Clear visit filters</button></div><p class="ov-help" data-visit-filter></p><div data-visit-insights></div><div class="ov-visit-list" data-visit-list></div><p class="ov-help">Locations are approximate. A browser identifier is not a person's identity. Active time is foreground engagement, not measured reading time. Sessions crossing the selected dates may be partial.</p>`;
    const find=q=>root.querySelector(q),button=find('[data-visit-load]'),status=find('[data-visit-status]'),list=find('[data-visit-list]');
    function draw(){list.innerHTML=renderVisits(data,timezone,view.search,view);find('[data-visit-kind]').value=view.kind;find('[data-visit-filter]').textContent=[view.city?'City: '+JSON.parse(view.city).slice().reverse().join(', '):'',view.browser?'Same browser in selected dates':'',loaded?`${filterVisits(data,view).length} matching ${filterVisits(data,view).length===1?'visit':'visits'}`:''].filter(Boolean).join(' · ');}
    async function load(fresh=false) {
      if(disposed||!getSession())return;
      if(range.end<'2026-11-05'){attempted=true;status.textContent='Individual visit exports begin November 5, 2026. This selection is before collection began. Historical city and page totals are available in Overview.';return;}
      const key=JSON.stringify([range.start,range.end,filters]);
      attempted=true;button.disabled=true;status.textContent='Loading daily visit records…';
      try {
        const saved=cache.get(key),result=!fresh&&saved&&Date.now()-saved.at<180000?saved.result:await loadVisits({range,filters,token:getSession().token,backendUrl:getSession().backendUrl,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(65000)])});
        if(disposed||!getSession())return;
        cache.set(key,{at:Date.now(),result});if(cache.size>12)cache.delete(cache.keys().next().value);
        data=result.visits;loaded=true;draw();const insight=journeySummary(data);find('[data-visit-insights]').innerHTML=`<div class="ov-journey"><div><strong>${insight.continued} / ${insight.research}</strong><span>Research visits continued to Publications</span></div><div><strong>${insight.returning}</strong><span>Returning-browser sessions</span></div><div><strong>${insight.scholar}</strong><span>Google Scholar sessions</span></div></div><p class="ov-help">Within the loaded exports${result.limited?' (latest 500 only)':''}. Missing earlier exports can limit these counts.</p>`;
        status.textContent=`${data.length} exported ${data.length===1?'visit':'visits'}${result.limited?' · Latest 500 shown; narrow the dates for the rest':''}. ${data.length?'Latest recorded visit: '+new Date(Math.max(...data.map(v=>v.first_ms))).toLocaleString('en-US',{timeZone:timezone}):'No visits in the exported selection.'}`;
        onSummary?.({returning:data.filter(v=>v.returning).length,research:data.filter(v=>(v.pages||[]).some(p=>/^\/(research|publications)(\/|$)/.test(canonical(p.path)))).length,limited:result.limited});
      } catch(e) {if(disposed||controller.signal.aborted)return;list.replaceChildren();status.textContent=e.name==='TimeoutError'?'Visit records took too long to respond. Use Load visit records to retry.':e.message;if(e.connect){needsPermission=true;button.textContent='Renew read-only access';}}
      finally{if(!disposed)button.disabled=false;}
    }
    button.addEventListener('click',()=>needsPermission?onRenew():load(true));
    find('[data-visit-search]').addEventListener('input',e=>{view.search=e.target.value;draw();});
    find('[data-visit-kind]').addEventListener('change',e=>{view.kind=e.target.value;draw();});
    find('[data-visit-clear]').addEventListener('click',()=>{view.city=view.kind=view.browser=view.search='';find('[data-visit-search]').value='';onClearCity?.();draw();});
    list.addEventListener('click',e=>{const b=e.target.closest('[data-visit-browser]');if(b){view.browser=b.dataset.visitBrowser;draw();}});
    list.addEventListener('toggle',e=>{if(e.target.open){const v=data.find(v=>v.id===e.target.dataset.session);if(v)onSelectCity?.(JSON.stringify([v.location.country,v.location.region,v.location.city]));}},true);
    return {load:()=>loaded||attempted?undefined:load(),setCity(city){view.city=city;draw();},setKind(kind){view.kind=kind;draw();},dispose(){disposed=true;controller.abort();data=[];root.replaceChildren();}};
  }
  const api={mount,clear,canonical,pageName};
  if(typeof window!=='undefined')window.MTSGVisits=api;
  if(typeof module!=='undefined')module.exports={...api,querySpec,messageFor,loadVisits,renderVisits,compactPages,filterVisits,journeySummary,researchToPapers};
})();
