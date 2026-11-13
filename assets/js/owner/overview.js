(() => {
  'use strict';
  const BASE = '';
  // Retain historical project URLs alongside the new site's main routes.
  const SITE_PATHS = '^(/MPSG(/.*)?|/|/index\\.html|/(people|research|publication|publications|news|gallery|contact)(/.*)?)$';
  const TOTALS = ['activeUsers', 'sessions', 'screenPageViews', 'engagedSessions', 'userEngagementDuration', 'averageSessionDuration', 'newUsers'];
  const DAY_MS = 86400000;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const number = n => n == null ? '—' : Number(n).toLocaleString('en-US', {maximumFractionDigits:0});
  const ratio = (a, b) => b > 0 ? a / b : null;
  const percent = n => n == null ? '—' : `${(n * 100).toFixed(1)}%`;
  function duration(n) {
    if (n == null || !Number.isFinite(n)) return '—';
    const seconds = Math.round(Math.max(0, n));
    return seconds >= 3600 ? `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m` : seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
  }
  function delta(now, before, rate = false) {
    if (now == null || before == null) return 'No comparison available';
    if (rate) return `${now >= before ? '+' : ''}${((now - before) * 100).toFixed(1)} pp`;
    if (!before) return now ? 'Prior period: 0' : 'No change';
    return `${now >= before ? '+' : ''}${((now - before) / before * 100).toFixed(0)}%`;
  }
  const dateKey = date => date.replaceAll('-', '');
  const isoDate = key => key.length === 8 ? `${key.slice(0,4)}-${key.slice(4,6)}-${key.slice(6)}` : key;
  const dateObject = date => new Date(`${date}T12:00:00Z`);
  const addDays = (date, count) => new Date(dateObject(date).getTime() + count * DAY_MS).toISOString().slice(0,10);
  const daysBetween = (a, b) => Math.round((dateObject(b) - dateObject(a)) / DAY_MS) + 1;
  const dateFormatters = new Map();
  function dateLabel(date, options = {}) {
    const key = JSON.stringify(options);
    if (!dateFormatters.has(key)) dateFormatters.set(key,new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC',...options}));
    return dateFormatters.get(key).format(dateObject(date));
  }
  function todayInZone(zone, now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {timeZone:zone, year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(now);
    const get = key => parts.find(p => p.type === key).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }
  function validDate(date) { return /^\d{4}-\d{2}-\d{2}$/.test(date || '') && !Number.isNaN(dateObject(date).getTime()) && dateObject(date).toISOString().slice(0,10) === date; }
  function periodFor(value, today, options = {}) {
    let start, end, displayEnd, shift, label;
    if (value === 'week') {
      const offset = Math.min(0, options.weekOffset || 0);
      const weekday = dateObject(today).getUTCDay();
      start = addDays(today, -((weekday + 6) % 7) + offset * 7);
      displayEnd = addDays(start, 6); end = displayEnd < today ? displayEnd : today;
      shift = 7; label = offset === 0 ? 'This week' : offset === -1 ? 'Last week' : 'Week of ' + dateLabel(start);
    } else if (value === 'custom') {
      start = options.start; end = options.end;
      if (!validDate(start) || !validDate(end) || start > end || end > today || daysBetween(start, end) > 93) throw new Error('Choose a valid range of up to 93 days, ending no later than today.');
      displayEnd = end; shift = daysBetween(start, end); label = 'Custom range';
    } else {
      const length = [7,28,90].includes(Number(value)) ? Number(value) : 28;
      end = addDays(today, -1); start = addDays(end, -(length - 1)); displayEnd = end; shift = length; label = `Last ${length} days`;
    }
    return {start, end, displayEnd, shift, label, today, mode:value, comparisonStart:addDays(start,-shift), comparisonEnd:addDays(end,-shift)};
  }
  function focusRange(period, day) {
    if (day && (!validDate(day) || day < period.start || day > period.end)) throw new Error('This day is outside the selected period.');
    const start = day || period.start, end = day || period.end;
    return {...period, start, end, comparisonStart:addDays(start, -period.shift), comparisonEnd:addDays(end, -period.shift)};
  }
  // Reports are immutable response snapshots; release parsed rows with their report.
  const parsedRows = new WeakMap();
  function rows(report) {
    if (!report || !Array.isArray(report.metricHeaders)) throw new Error('The analytics response is incomplete.');
    if (parsedRows.has(report)) return parsedRows.get(report);
    const parsed = (report.rows || []).map(row => {
      const value = {};
      (report.dimensionHeaders || []).forEach((header,i) => value[header.name] = row.dimensionValues?.[i]?.value ?? '');
      report.metricHeaders.forEach((header,i) => {
        const n = Number(row.metricValues?.[i]?.value);
        if (!Number.isFinite(n)) throw new Error('Invalid analytics value.');
        value[header.name] = n;
      });
      return value;
    });
    parsedRows.set(report, parsed);
    return parsed;
  }
  const match = (fieldName, value, matchType = 'EXACT') => ({filter:{fieldName, stringFilter:{matchType, value, caseSensitive:false}}});
  function request(range, dimensions, metrics, filters = {}, options = {}) {
    const expressions = [match('hostName','yechan-noh.github.io'), match('pagePath',SITE_PATHS,'FULL_REGEXP'), {notExpression:{orGroup:{expressions:['/dashboard','/owner','/MPSG/dashboard','/MPSG/owner'].map(path => match('pagePath',path,'BEGINS_WITH'))}}}];
    if (filters.country) expressions.push(match('country', filters.country));
    if (filters.device) expressions.push(match('deviceCategory', filters.device));
    if (filters.city) {const [country,region,city]=JSON.parse(filters.city);expressions.push(match('country',country),match('region',region),match('city',city));}
    if (options.path) expressions.push(match('pagePath',options.path,'FULL_REGEXP'));
    if (options.returning) expressions.push(match('newVsReturning','returning'));
    if (options.us) expressions.push(match('countryId','US'));
    if (options.event) expressions.push(match('eventName',options.event));
    return {dateRanges:[{startDate:range.start,endDate:range.end}], dimensions:dimensions.map(name=>({name})), metrics:metrics.map(name=>({name})), dimensionFilter:{andGroup:{expressions}}, limit:String(options.limit || 200),
      ...(options.sort ? {orderBys:[{metric:{metricName:options.sort},desc:true}]} : dimensions.length === 1 && dimensions[0] === 'date' ? {orderBys:[{dimension:{dimensionName:'date'}}]} : {})};
  }
  function requests(range, filters = {}, daily = true) {
    const previous = {start:range.comparisonStart,end:range.comparisonEnd};
    return {
      current:request(range,[],TOTALS,filters),
      returning:request(range,[],['sessions'],filters,{returning:true}),
      research:request(range,[],['sessions'],filters,{path:'^/(MPSG/)?(research|publications)(/.*)?$'}),
      links:request(range,['linkUrl'],['eventCount'],filters,{event:'click',sort:'eventCount',limit:1000}), previous:request(previous,[],TOTALS,filters),
      ...(daily ? {daily:request(range,['date'],TOTALS,filters,{limit:100})} : {}),
      pages:request(range,['pagePath'],['screenPageViews','activeUsers','userEngagementDuration'],filters,{sort:'screenPageViews',limit:200}),
      sources:request(range,['sessionSourceMedium'],['sessions','engagedSessions','userEngagementDuration'],filters,{sort:'sessions'}),
      locations:request(range,['country','region','city'],['sessions','activeUsers','userEngagementDuration'],{...filters,city:''},{sort:'sessions',limit:500}),
      cityPages:request(range,['date','country','region','city','pagePath'],['screenPageViews','userEngagementDuration'],filters,{sort:'screenPageViews',limit:10000}),
      countries:request(range,['countryId','country'],['sessions'],filters,{sort:'sessions',limit:300}),
      // A non-US country selection cannot contain US states. Avoid contradictory geo filters.
      ...(!filters.country || filters.country==='United States' ? {states:request(range,['region'],['sessions'],filters,{sort:'sessions',us:true,limit:100})} : {}),
      devices:request(range,['deviceCategory'],['sessions'],filters,{sort:'sessions'}),
      hours:request(range,['dateHour'],['screenPageViews'],filters,{limit:3000}),
      events:request(range,['eventName'],['eventCount'],filters,{sort:'eventCount'}),
      outbound:request(range,['linkDomain'],['eventCount'],filters,{sort:'eventCount',event:'click'})
    };
  }
  function emptyTotals() { return Object.fromEntries(TOTALS.map(key=>[key,0])); }
  function dailySeries(report, period) {
    const byDate = new Map(rows(report).map(r=>[isoDate(r.date), r]));
    return Array.from({length:daysBetween(period.start,period.displayEnd)}, (_,i)=> {
      const date = addDays(period.start,i);
      return {...emptyTotals(),...byDate.get(date),date,future:date > period.today,today:date === period.today};
    });
  }
  function table(headings, body, empty = 'No activity reported for this selection.') {
    return body.length ? `<div class="ov-scroll"><table><thead><tr>${headings.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${body.map(cells=>`<tr>${cells.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : `<p class="ov-empty">${esc(empty)}</p>`;
  }
  function bars(data, key, metric, denominator) {
    const max = Math.max(1,...data.map(r=>r[metric]));
    return data.length ? `<ul class="ov-bars">${data.map(r=>`<li><div><span>${esc(r[key])}</span><strong>${number(r[metric])}<small>${percent(ratio(r[metric],denominator))}</small></strong></div><div class="ov-track"><span style="width:${r[metric]/max*100}%"></span></div></li>`).join('')}</ul>` : '<p class="ov-empty">No activity reported.</p>';
  }
  function mapGraphic(shape, data, key, title) {
    if (!shape) return '<p class="ov-empty">Map unavailable. Location values are still listed below.</p>';
    const counts = new Map(data.map(r=>[r[key],r.sessions]));
    const max = Math.max(1,...data.map(r=>r.sessions)), mapped = new Set(shape.regions.map(r=>r.id));
    const unknown = data.filter(r=>!mapped.has(r[key])).reduce((n,r)=>n+r.sessions,0);
    const active = shape.regions.filter(r=>(counts.get(r.id)||0)>0);
    const paths = shape.regions.filter(r=>r.path).map(r=> {
      const n = counts.get(r.id)||0, fill = n ? `hsl(195, 25%, ${82-48*Math.sqrt(n/max)}%)` : '#e7edef';
      return `<path d="${r.path}" fill="${fill}" stroke="#fff" stroke-width=".65" aria-hidden="true"/>`;
    }).join('');
    const points = active.map(r=> {
      const n = counts.get(r.id), label = `${r.name}: ${number(n)} sessions`;
      return `<circle cx="${r.center[0]}" cy="${r.center[1]}" r="${4+9*Math.sqrt(n/max)}" fill="#42636e" fill-opacity=".72" stroke="white" stroke-width="1.5" tabindex="0" role="button" aria-label="${esc(label)}" data-map-label="${esc(label)}"><title>${esc(label)}</title></circle>`;
    }).join('');
    return `<div class="ov-map"><svg viewBox="0 0 ${shape.width} ${shape.height}" role="group" aria-label="${esc(title)}"><title>${esc(title)}</title>${paths}${points}</svg><p data-map-detail aria-live="polite">${active.length} ${key==='region'?'states / DC':'countries / territories'} · Tap a marker for sessions</p><div class="ov-map-key"><span><i></i> No activity reported</span><span class="ov-scale"></span><span>Fewer → more sessions</span></div>${unknown?`<p class="ov-help">${number(unknown)} sessions have an unmapped or unknown location.</p>`:''}</div>`;
  }
  function calendar(data, period, selected, metric) {
    const max = Math.max(1,...data.map(r=>r[metric]));
    if (period.mode !== 'week') {
      const x = i => 38 + i * 900 / Math.max(1,data.length-1), y = n => 160 - n / max * 125;
      return `<div class="ov-trend"><svg viewBox="0 0 980 200" role="group" aria-label="Daily activity; select a point to inspect that day">${[0,.5,1].map(f=>`<line x1="38" x2="938" y1="${y(max*f)}" y2="${y(max*f)}" stroke="#e6ecee"/><text x="28" y="${y(max*f)+4}" text-anchor="end">${metric==='userEngagementDuration'?esc(duration(max*f)):number(max*f)}</text>`).join('')}<path d="${data.map((r,i)=>`${i?'L':'M'}${x(i)},${y(r[metric])}`).join(' ')}" fill="none" stroke="#42636e" stroke-width="2.5"/>${data.map((r,i)=>`<circle cx="${x(i)}" cy="${y(r[metric])}" r="${selected===r.date?6:4}" tabindex="0" role="button" data-day="${r.date}" aria-label="Inspect ${dateLabel(r.date,{weekday:'long'})}: ${metric==='userEngagementDuration'?duration(r[metric]):number(r[metric])}"><title>${r.date}: ${metric==='userEngagementDuration'?duration(r[metric]):number(r[metric])}</title></circle>`).join('')}<text x="38" y="190">${dateLabel(period.start)}</text><text x="938" y="190" text-anchor="end">${dateLabel(period.end)}</text></svg></div>`;
    }
    return `<div class="ov-week" aria-label="Days of the selected week">${data.map(r=>`<button type="button" class="ov-day${selected===r.date?' is-selected':''}${r.today?' is-today':''}" data-day="${r.date}" aria-pressed="${selected===r.date}" ${r.future?'disabled':''}><span class="ov-day-label">${dateLabel(r.date,{weekday:'short',month:undefined,day:undefined})}<small>${dateLabel(r.date)}${r.today?' · today':''}</small></span><strong>${r.future?'—':metric==='userEngagementDuration'?duration(r[metric]):number(r[metric])}</strong><span class="ov-day-track"><i style="height:${r.future?0:Math.max(3,r[metric]/max*100)}%"></i></span><span class="ov-day-foot">${r.future?'Upcoming':`${number(r.sessions)} visits · ${duration(ratio(r.userEngagementDuration,r.sessions))} / visit`}</span>${r.today?'<em>Partial data</em>':''}</button>`).join('')}</div>`;
  }
  function heatmap(data, range) {
    const dates = Array.from({length:daysBetween(range.start,range.end)},(_,i)=>addDays(range.start,i));
    const cells = new Map(data.map(r=>[r.dateHour,r.screenPageViews]));
    const max = Math.max(1,...data.map(r=>r.screenPageViews));
    return `<div class="ov-heat-scroll"><div class="ov-heat" style="--heat-rows:${dates.length}"><span></span>${Array.from({length:24},(_,h)=>`<span class="ov-heat-label">${h%3===0?String(h).padStart(2,'0'):''}</span>`).join('')}${dates.map(date=>{const shortDate=dateLabel(date);return `<span class="ov-heat-date">${dateLabel(date,{weekday:'short'})}</span>${Array.from({length:24},(_,h)=> {
      const count = cells.get(dateKey(date)+String(h).padStart(2,'0'))||0;
      const label = `${shortDate} · ${String(h).padStart(2,'0')}:00–${String(h).padStart(2,'0')}:59 · ${number(count)} views reported`;
      return `<button type="button" class="ov-heat-cell" data-hour="${esc(label)}" aria-label="${esc(label)}" style="--cell:${count?`hsl(195,25%,${84-51*Math.sqrt(count/max)}%)`:'#f0f3f4'}"><title>${esc(label)}</title></button>`;
    }).join('')}`;}).join('')}</div></div><p class="ov-help" data-hour-detail aria-live="polite">Tap a cell for the hour and page-view count. Hours use the reporting timezone.</p>`;
  }
  function dailyTable(data) {
    return table(['Day','Active users','Visits','Page views','Total engagement','Engagement / visit'],data.filter(r=>!r.future).map(r=>[`<button class="ov-text-button" data-day="${r.date}">${dateLabel(r.date,{weekday:'short'})}${r.today?' · partial':''}</button>`,number(r.activeUsers),number(r.sessions),number(r.screenPageViews),duration(r.userEngagementDuration),duration(ratio(r.userEngagementDuration,r.sessions))]));
  }
  function notices(reports) {
    const data = Object.values(reports), notes=[];
    if (data.some(r=>r.metadata?.subjectToThresholding)) notes.push('Google privacy thresholds may omit some activity.');
    if (data.some(r=>r.metadata?.dataLossFromOtherRow)) notes.push('Some categories are grouped as “(other)”.');
    if (data.some(r=>r.metadata?.samplingMetadatas?.length)) notes.push('Some results are sampled.');
    const limited = Object.entries(reports).filter(([,r])=>r.rowCount>(r.rows||[]).length).map(([key])=>key);
    if (limited.length) notes.push(`Top rows only in: ${limited.join(', ')}. Overall totals are queried separately; exports contain loaded rows.`);
    return notes;
  }
  function cityPagesTable(data, search = '') {
    const groups = new Map();
    for (const r of data) {
      if (!`${r.city} ${r.region} ${r.country}`.toLowerCase().includes(search.toLowerCase())) continue;
      const key = JSON.stringify([r.country,r.region,r.city]);
      if (!groups.has(key)) groups.set(key,{...r,views:0,engagement:0,items:[]});
      const group=groups.get(key); group.views+=r.screenPageViews; group.engagement+=r.userEngagementDuration; group.items.push(r);
    }
    return [...groups.values()].sort((a,b)=>b.views-a.views).slice(0,100).map(g=>`<details class="ov-city"><summary><span><strong>${esc(g.city==='(not set)'?'City unavailable':g.city)}</strong><small>${esc(g.region)} · ${esc(g.country)}</small></span><span>${number(g.views)} ${g.views===1?'view':'views'}<small>${duration(g.engagement)} engagement</small></span></summary>${table(['Day','Page','Views','Engagement'],g.items.sort((a,b)=>b.date.localeCompare(a.date)||b.screenPageViews-a.screenPageViews).map(r=>[esc(isoDate(r.date)),esc(pageName(r.pagePath)),number(r.screenPageViews),duration(r.userEngagementDuration)]))}</details>`).join('') || '<p class="ov-empty">No city-level page activity reported.</p>';
  }
  function layout() {
    return `<header class="ov-header"><div><a href="${BASE}/">CMBL</a><span>SITE ANALYTICS</span></div><nav><span class="ov-readonly">Read-only connection</span><a href="${BASE}/">Website ↗</a><button type="button" data-ov-signout>Close overview</button></nav></header>
    <main class="ov-main"><div class="ov-title"><div><p class="ov-eyebrow">Computational Molecular Biomimetics Lab</p><h1>Site overview</h1><p class="ov-subtitle">Visits, locations and interest in your work.</p></div><button type="button" data-ov-refresh>↻ Refresh data</button></div>
    <p class="ov-owner-status" data-ov-owner-status></p>
    <form class="ov-toolbar" data-ov-form><label>Reporting period<select aria-label="Reporting period" data-ov-period><option value="week">This week</option><option value="last-week">Last week</option><option value="7">Last 7 days</option><option value="28">Last 28 days</option><option value="90">Last 90 days</option><option value="custom">Custom dates</option></select></label><div class="ov-custom" data-ov-custom hidden><label>From<input type="date" data-ov-start aria-label="From date" required></label><label>Through<input type="date" data-ov-end aria-label="Through date" required></label><button type="submit">Apply dates</button></div><label>Country<select aria-label="Country" data-ov-country><option value="">All countries</option></select></label><label>Device<select aria-label="Device" data-ov-device><option value="">All devices</option><option>desktop</option><option>mobile</option><option>tablet</option><option>smart tv</option></select></label><button class="ov-reset" type="button" data-ov-reset>Reset filters</button></form>
    <div class="ov-statusline"><p data-ov-status role="status" aria-live="polite">Connecting to Google Analytics…</p><span data-ov-zone></span></div><button type="button" data-ov-connect hidden>Renew Google connection</button><nav class="ov-tabs" aria-label="Analytics views"><button type="button" data-ov-tab="overview" aria-pressed="true">Overview</button><button type="button" data-ov-tab="visits" aria-pressed="false">Visits</button><button type="button" data-ov-tab="content" aria-pressed="false">Content</button></nav><div data-ov-content hidden></div>
    <footer class="ov-notes"><p>Reports are fetched through a read-only CMBL server connection and cached briefly. No Google credentials are stored in this page or the public source. Access through the hidden website entry does not require a login. This dashboard does not record analytics events.</p><details><summary>How to read these reports</summary><p>Visits are GA4 sessions. Active users are deduplicated within each report, not verified individuals; daily or page-level users must not be added to calculate unique people. New users are first_visit / first_open users, not a reliable count of people who have never seen your work.</p><p>Engagement means time the website was in the foreground, not measured reading time. Engagement per visit = total user engagement seconds / sessions. Average session duration is a separate GA metric. Zero seconds can mean no engagement event was reported. An engaged session meets your property’s engagement criteria.</p><p>Weeks run Monday–Sunday in the GA property’s timezone. Today is partial and can change as Google processes events; comparison periods include the corresponding full day. Recent completed days can also change. Missing rows may reflect consent, blockers, thresholds, or processing rather than no visits.</p><p>Locations are approximate and cannot identify a professor, committee, institution, or individual visitor. Sessions can appear in multiple geographic rows, so those counts need not sum to the overall total. Earlier data may include your visits. Future visits from an owner-excluded browser are not sent to Google. Open the overview once on each browser to exclude its future visits; clearing site storage removes that exclusion. Country and device filters affect all reports; the page search only filters the page table.</p><p>Traffic from this website’s current pages and historical /MPSG/ addresses is queried; owner routes are excluded. Maps: Natural Earth / US Census. City centers: <a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">GeoNames (CC BY 4.0)</a>. Unmatched or ambiguous cities stay in the list. <a href="https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema" target="_blank" rel="noopener noreferrer">Google’s metric definitions ↗</a></p></details></footer></main>`;
  }

  const canonical=p=>(p||'/').replace(/^\/MPSG(?=\/|$)/,'').replace(/^\/index\.html$/,'/')||'/';
  const pageName=p=>({'/':'Home','/people/':'People','/research/':'Research','/publications/':'Publications','/news/':'News','/gallery/':'Gallery','/contact/':'Contact'}[canonical(p)]||canonical(p));
  function mergePages(data) {
    const grouped=new Map();
    for(const r of data){const path=canonical(r.pagePath);if(!grouped.has(path))grouped.set(path,{pagePath:path,screenPageViews:0,userEngagementDuration:0});const g=grouped.get(path);g.screenPageViews+=r.screenPageViews;g.userEngagementDuration+=r.userEngagementDuration;}
    return [...grouped.values()].sort((a,b)=>b.screenPageViews-a.screenPageViews);
  }
  const paperLink=url=>/^https?:\/\/(?:[^/]+\.)?(doi\.org|biorxiv\.org|arxiv\.org|pubs\.acs\.org|journals\.aps\.org|science\.org|onlinelibrary\.wiley\.com|nature\.com|sciencedirect\.com)(\/|$)/i.test(url||'')||/\/files\/.*\.pdf(?:[?#]|$)/i.test(url||'')&&!/cv|resume/i.test(url);
  function pageTable(data,search='') {return table(['Page','Views','Active time'],mergePages(data).filter(r=>pageName(r.pagePath).toLowerCase().includes(search.toLowerCase())).map(r=>[`<strong>${esc(pageName(r.pagePath))}</strong><small class="ov-cell-sub">${esc(r.pagePath)}</small>`,number(r.screenPageViews),duration(r.userEngagementDuration)]));}
  function locationData(reports) {
    if(reports?.locations)return {data:rows(reports.locations),metric:'sessions',label:'visits'};
    if(!reports?.cityPages)return {data:[],metric:'screenPageViews',label:'page views',unavailable:true};
    const grouped=new Map();
    for(const r of rows(reports.cityPages)){
      const key=JSON.stringify([r.country,r.region,r.city]);
      if(!grouped.has(key))grouped.set(key,{country:r.country,region:r.region,city:r.city,screenPageViews:0,userEngagementDuration:0});
      const value=grouped.get(key);value.screenPageViews+=r.screenPageViews;value.userEngagementDuration+=r.userEngagementDuration;
    }
    return {data:[...grouped.values()].sort((a,b)=>b.screenPageViews-a.screenPageViews),metric:'screenPageViews',label:'page views'};
  }
  function geography(locations,maps,state,metric='sessions') {
    const geo=maps?.cities,view=state.mapView||'us', shape=geo?.[view];
    const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
    const key=r=>JSON.stringify([r.country,r.region,r.city]);
    const max=Math.max(1,...locations.map(r=>r[metric]));let mapped=0;
    const points=locations.map(r=>{const k=[r.country,r.region,r.city].map(norm).join('|'), c=geo?.lookup?.[k]||(r.country==='South Korea'?geo?.lookup?.[k.replace(/si$/,'')]:null);if(!c||!c[view])return '';mapped++;const [x,y]=c[view];return `<circle cx="${x}" cy="${y}" r="${4+10*Math.sqrt(r[metric]/max)}" data-city="${esc(key(r))}" data-map-label="${esc(r.city)}: ${number(r[metric])} ${metric==='sessions'?'visits':'page views'}" role="button" tabindex="0" aria-label="${esc(r.city)}: ${number(r[metric])} ${metric==='sessions'?'visits':'page views'}" class="${(state.highlightCity||state.city)===key(r)?'selected':''}"><title>${esc(r.city)} · ${number(r[metric])} ${metric==='sessions'?'visits':'page views'}</title></circle>`;}).join('');
    return `<div class="ov-map-shell"><div class="ov-card-title"><div><p class="ov-eyebrow">Geography</p><h2>${metric==='sessions'?'Where visits begin':'Where pages are viewed'}</h2></div><div class="ov-segments">${['us','world'].map(v=>`<button type="button" data-map-view="${v}" aria-pressed="${v===view}">${v==='us'?'United States':'World'}</button>`).join('')}</div></div><button type="button" data-map-collapse aria-expanded="false" class="ov-map-mobile">Show map</button><div class="ov-map">${shape?`<svg viewBox="0 0 ${shape.width} ${shape.height}" role="group" aria-label="City locations"><path d="${shape.path}" fill="#e5ecee" stroke="#fff" stroke-width=".65"/>${points}</svg>`:'<p class="ov-empty">Loading map. City records are listed alongside.</p>'}<p data-map-detail aria-live="polite">Approximate city centers · ${mapped} mapped locations${locations.length>mapped?' · Other locations remain in the list':''}</p></div></div>`;
  }
  function cityList(data,state,metric='sessions') {return `<div class="ov-location-list">${data.filter(r=>`${r.city} ${r.region} ${r.country}`.toLowerCase().includes((state.locationSearch||'').toLowerCase())).slice(0,100).map(r=>`<button type="button" data-city="${esc(JSON.stringify([r.country,r.region,r.city]))}" aria-pressed="${state.city===JSON.stringify([r.country,r.region,r.city])}"><span><strong>${esc(r.city==='(not set)'?'City unavailable':r.city)}</strong><small>${esc(r.region)} · ${esc(r.country)}</small></span><span><b>${number(r[metric])} ${metric==='sessions'?'visits':'views'}</b><small>${duration(r.userEngagementDuration)} active</small></span></button>`).join('')||'<p class="ov-empty">No matching locations.</p>'}</div>`;}
  const unavailable=()=>'<p class="ov-empty">Report unavailable or still loading. This does not mean zero visits.</p>';
  function renderContent(detail,range) {
    const parsed=Object.fromEntries(['pages','links','events','hours'].filter(k=>detail[k]).map(k=>[k,rows(detail[k])]));
    const {pages=[],links=[],events=[],hours=[]}=parsed;
    const paperLinks=links.filter(r=>paperLink(r.linkUrl));
    return `<div class="ov-explore"><section class="ov-card"><p class="ov-eyebrow">Content performance</p><h2>Pages and active time</h2><label class="ov-inline-search">Find page<input data-ov-search placeholder="Research, publications…"></label><div data-content-pages>${detail.pages?pageTable(pages):unavailable()}</div><p class="ov-help">Old and new addresses are combined. Active time is foreground engagement, not measured reading time.</p></section><section class="ov-card"><p class="ov-eyebrow">Next steps</p><h2>Paper links selected</h2>${!detail.links?unavailable():table(['Destination','Clicks'],paperLinks.map(r=>[esc(r.linkUrl),number(r.eventCount)]),'No paper-link clicks were reported for these dates. Unrecorded clicks cannot be recovered.')}</section></div>
    <section class="ov-card ov-actions"><p class="ov-eyebrow">Research selections</p><h2>Topics, CV and contact</h2><p class="ov-help">Dedicated measurement begins November 6, 2026. Earlier dates were not measured with these events.</p>${!parsed.events?'<p class="ov-empty">Action report is unavailable. Other reports are unaffected.</p>':table(['Recorded action','Count'],events.filter(r=>/^research_(topic|paper|cv|email)$/.test(r.eventName)).map(r=>[esc(r.eventName.replace('research_','')),number(r.eventCount)]),'No dedicated selections recorded yet. This is not evidence that earlier visitors took no action.')}</section>
    <section class="ov-card"><p class="ov-eyebrow">Timing</p><h2>Activity by hour</h2>${parsed.hours?heatmap(hours,range):'<p class="ov-empty">Hourly report is unavailable. Other reports are unaffected.</p>'}</section>`;
  }
  function render(parent,detail,period,state,maps,timezone,deferContent=false) {
    const parsed=Object.fromEntries(Object.entries(detail).map(([k,r])=>[k,rows(r)]));
    const {pages=[],sources=[],locations=[],cityPages=[],hours=[],events=[],links=[]}=parsed;
    const c=parsed.current?.[0]||emptyTotals(),p=parsed.previous?(parsed.previous[0]||emptyTotals()):{},range=focusRange(period,state.day),daily=dailySeries(parent.daily,period);
    const location=locationData(detail),mapLocations=location.data,paperLinks=links.filter(r=>paperLink(r.linkUrl));
    const kpis=[['Visits',c.sessions,'visits','',`${number(p.sessions)} in the comparison period`],['Returning sessions',parsed.returning?(parsed.returning[0]?.sessions||0):null,'visits','returning','GA returning-browser classification'],['Research & Publications',parsed.research?(parsed.research[0]?.sessions||0):null,'visits','research','Sessions viewing either page'],['Paper link clicks',parsed.links?paperLinks.reduce((n,r)=>n+r.eventCount,0):null,'content','','Recorded outbound paper links']];
    const notes=notices(detail);
    return `<div class="ov-focus"><div><span class="ov-focus-dot"></span><div><p class="ov-eyebrow">${state.day?'Selected day':period.label}</p><h2>${dateLabel(range.start)}${range.end===range.start?'':' – '+dateLabel(range.end)}</h2><p>${state.city?esc(JSON.parse(state.city).slice().reverse().join(', ')):state.country||'All locations'} · ${state.device||'All devices'}</p></div></div><div>${state.day?'<button type="button" data-ov-all>Full period</button>':''}${state.city?'<button type="button" data-clear-city>Clear city</button>':''}</div></div>
    <section class="ov-kpis">${kpis.map(([label,n,tab,kind,note])=>`<button type="button" data-kpi-tab="${tab}" data-kind="${kind}"><span>${label}</span><strong>${number(n)}</strong><small>${note}</small></button>`).join('')}</section><p class="ov-comparison">${number(p.sessions)} → ${number(c.sessions)} visits · Compared with ${dateLabel(range.comparisonStart)}–${dateLabel(range.comparisonEnd)}${range.end===period.today?' · Today is partial; the comparison day is complete':''}</p>
    ${notes.length?`<p class="ov-warning">${notes.map(esc).join(' ')}</p>`:''}
    <section class="ov-card ov-calendar"><div class="ov-card-title"><div><p class="ov-eyebrow">Daily activity · all cities in selected country</p><h2>${dateLabel(period.start)} – ${dateLabel(period.displayEnd)}</h2></div><div class="ov-calendar-controls">${period.mode==='week'?`<button type="button" data-ov-week="-1" aria-label="Previous week">←</button><button type="button" data-ov-week="1" aria-label="Next week" ${state.weekOffset>=0?'disabled':''}>→</button>`:''}<label>Chart<select data-ov-metric aria-label="Daily chart"><option value="sessions" ${state.metric==='sessions'?'selected':''}>Visits</option><option value="screenPageViews" ${state.metric==='screenPageViews'?'selected':''}>Page views</option><option value="userEngagementDuration" ${state.metric==='userEngagementDuration'?'selected':''}>Active time</option></select></label></div></div><div data-daily-chart>${calendar(daily,period,state.day,state.metric||'sessions')}</div></section>
    <div data-panel="overview"><div class="ov-explore"><section class="ov-card" data-geography>${location.unavailable?unavailable():geography(mapLocations,maps,state,location.metric)}</section><section class="ov-card"><div class="ov-card-title"><div><p class="ov-eyebrow">Locations</p><h2>Explore a city</h2></div><label>Find location<input data-ov-location-search value="${esc(state.locationSearch||'')}" placeholder="City or region…"></label></div><p class="ov-help">Select a city to filter this period and open its visit records.${!detail.locations&&detail.cityPages?' Counts below are page views from the city/page report, not visits.':''}</p><div data-city-list>${location.unavailable?unavailable():cityList(mapLocations,state,location.metric)}</div></section></div>
    <section class="ov-card ov-city-pages"><div class="ov-card-title"><div><p class="ov-eyebrow">Available aggregate data</p><h2>Pages viewed by city</h2><p class="ov-help">Daily totals, including historical records. These rows are not individual visits.</p></div><label>Find city<input data-ov-city-search placeholder="City…"></label></div><div data-ov-city-pages>${detail.cityPages?cityPagesTable(cityPages):unavailable()}</div></section>
    <div class="ov-explore"><section class="ov-card"><p class="ov-eyebrow">Content</p><h2>Pages receiving attention</h2><div data-ov-pages>${detail.pages?pageTable(pages):unavailable()}</div></section><section class="ov-card"><p class="ov-eyebrow">Discovery</p><h2>How visitors find you</h2>${detail.sources?bars(sources.slice(0,6),'sessionSourceMedium','sessions',c.sessions):unavailable()}</section></div></div>
    <div data-panel="visits" hidden><section class="ov-card ov-visits" data-ov-visits></section></div>
    <div data-panel="content" hidden>${deferContent?'':renderContent(detail,range)}</div>
    <section class="ov-export"><div><h2>Export this selection</h2><p>Only loaded report rows. Individual visits remain private in this browser.</p></div><div><select data-ov-export-type aria-label="Export report"><option value="daily">Daily summary</option><option value="locations">Locations</option><option value="cityPages">City and pages</option><option value="pages">Pages</option><option value="sources">Traffic sources</option></select><button type="button" data-ov-export>Download CSV</button></div></section>`;
  }
  function csv(data) {
    if (!data.length) return '';
    const keys = [...new Set(data.flatMap(row=>Object.keys(row)))];
    const cell = value => {let s=String(value??'');if(typeof value!=='number'&&/^[=+\-@\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
    return '\uFEFF'+[keys.map(cell).join(','),...data.map(row=>keys.map(key=>cell(row[key])).join(','))].join('\r\n');
  }
  function exportRows(type, parent, detail, range, timezone) {
    const selected = type==='daily'?parent.daily:detail[type];
    return rows(selected).map(r=>({report:type,timezone,period_start:type==='daily'?parent.current.dateRanges?.[0]?.startDate||'':range.start,period_end:type==='daily'?parent.current.dateRanges?.[0]?.endDate||'':range.end,...r,...('date' in r?{date:isoDate(r.date)}:{})}));
  }
  function normalizeReport(report, query) {
    // GA can omit column headers on a recognized report with no matching rows.
    // Do not accept a missing/malformed response or discard nonempty rows.
    const empty=report && (!report.rows || Array.isArray(report.rows)&&report.rows.length===0) && Number(report.rowCount||0)===0;
    if (!Array.isArray(report?.metricHeaders) && empty && (report.kind==='analyticsData#runReport' || report.metadata?.emptyReason)) {
      return {...report,dimensionHeaders:query.dimensions||[],metricHeaders:query.metrics||[],rows:[],rowCount:0};
    }
    return report;
  }
  async function fetchReports(specs, {propertyId,session,signal,fetcher=fetch,onProgress=()=>{},partial=false,timeoutMs=22000}) {
    const entries=Object.entries(specs), result={}, failures={};
    Object.defineProperty(result,'failures',{value:failures});
    const batchSize=session.backendUrl?1:5, batches=[];
    for(let i=0;i<entries.length;i+=batchSize)batches.push(entries.slice(i,i+batchSize));
    let next=0,done=0;
    async function run(batch) {
      const controller=new AbortController();
      const cancel=()=>controller.abort(signal.reason);
      if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
      const timer=setTimeout(()=>controller.abort(new DOMException('The report timed out.','TimeoutError')),timeoutMs);
      try {
        const response=await fetcher(session.backendUrl ? session.backendUrl+'/reports' : `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:batchRunReports`, {method:'POST',headers:{...(session.backendUrl?{}:{Authorization:'Bearer '+session.token}),'Content-Type':'application/json'},body:JSON.stringify({requests:batch.map(([,query])=>query)}),cache:'no-store',credentials:'omit',signal:controller.signal});
        const body=await response.json();
        if(!response.ok) {
          const error=new Error(response.status===429?'The reporting limit was reached. Please retry later.':body.error?.message||'Analytics could not be loaded. Please retry.');
          error.connect=!session.backendUrl&&(response.status===401||response.status===403);
          throw error;
        }
        if(!Array.isArray(body.reports)||body.reports.length!==batch.length)throw new Error('The analytics response is incomplete.');
        const validated=body.reports.map((raw,j)=>{const report=normalizeReport(raw,batch[j][1]);rows(report);return report;});
        validated.forEach((report,j)=>result[batch[j][0]]=report);
      } catch(error) {
        if(signal?.aborted)throw signal.reason||error;
        if(!partial)throw error;
        for(const [key] of batch)failures[key]=error.message;
      } finally {clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
      done+=batch.length;onProgress(done,entries.length,result);
    }
    async function worker(){while(next<batches.length){if(signal?.aborted)throw signal.reason;await run(batches[next++]);}}
    // Bounded concurrency: no 16-request burst, and no serial head-of-line blocking.
    await Promise.all(Array.from({length:session.backendUrl?Math.min(3,batches.length):1},worker));
    return result;
  }
  function mount({root,propertyId,clientId,getSession,onRenew,onSignOut,reportingTimezone}) {
    root.className='ov-root'; root.innerHTML=layout();
    const find=selector=>root.querySelector(selector), content=find('[data-ov-content]'), status=find('[data-ov-status]'), refresh=find('[data-ov-refresh]'), connect=find('[data-ov-connect]');
    const ownerStatus=window.MTSGAnalytics?.status();
    find('[data-ov-owner-status]').textContent=ownerStatus?.persisted ? 'Your visits from this browser are excluded from now on, even after closing this overview. Historical data is unchanged.' : 'Owner exclusion is active for this page. Allow site storage to keep this browser excluded on future visits.';
    const state={weekOffset:0,day:null,metric:'sessions',country:'',device:'',pageSort:'views',search:'',locationSearch:'',tab:'overview',mapView:'us',city:'',visitKind:''};
    let contentReady=false,visits,controller,revision=0,removed=false,timezone=reportingTimezone,parent,detail,period,maps,loadedAt;
    const cache=new Map();
    const mapPromise=fetch(BASE+'/assets/js/owner/city-map.json',{credentials:'omit',signal:AbortSignal.timeout(6000)}).then(r=>r.ok?r.json():null).then(cities=>({cities})).catch(()=>null);
    const clearData=()=> {parent=detail=null;cache.clear();content.replaceChildren();content.hidden=true;};
    function activate(tab) {
      state.tab=tab;root.querySelectorAll('[data-panel]').forEach(el=>el.hidden=el.dataset.panel!==tab);
      root.querySelectorAll('[data-ov-tab]').forEach(el=>el.setAttribute('aria-pressed',el.dataset.ovTab===tab));
      if(tab==='content'&&detail&&!contentReady){
        find('[data-panel="content"]').innerHTML=renderContent(detail,focusRange(period,state.day));
        contentReady=true;
      }
      if(tab==='visits') {
        if(!visits&&period)visits=window.MTSGVisits?.mount({root:find('[data-ov-visits]'),range:focusRange(period,state.day),filters:{country:state.country,device:state.device},timezone,getSession,onRenew,initialCity:state.city,initialKind:state.visitKind,onClearCity:()=>{state.city='';load({focusOnly:true});},onSelectCity:city=>{state.highlightCity=city;const geo=find('[data-geography]');if(geo&&detail)geo.innerHTML=geography(locationData(detail).data,maps,state,locationData(detail).metric);}});
        visits?.load();
      }
    }
    function draw() {if(parent&&detail&&!removed){
      visits?.dispose();visits=null;contentReady=false;
      content.innerHTML=render(parent,detail,period,state,maps,timezone,true);content.hidden=false;
      activate(state.tab);
    }}
    function updateCountries() {
      if(state.country||!parent)return;
      const select=find('[data-ov-country]');
      select.innerHTML='<option value="">All countries</option>'+[...new Set((parent.countries?rows(parent.countries):locationData(parent).data).map(r=>r.country))].filter(country=>country&&country!=='(not set)').map(country=>({country})).sort((a,b)=>a.country.localeCompare(b.country)).map(r=>`<option>${esc(r.country)}</option>`).join('');
    }
    async function load({fresh=false,focusOnly=false}={}) {
      const version=++revision;
      controller?.abort();controller=new AbortController();
      const signal=controller.signal;
      connect.hidden=true;refresh.disabled=true;root.setAttribute('aria-busy','true');
      visits?.dispose();visits=null;detail=null;contentReady=false;content.hidden=true;content.replaceChildren();status.textContent='Loading your Google Analytics data…';
      const session=getSession();
      if(!session){clearData();status.textContent='Renew your Google sign-in to load the report.';connect.hidden=false;refresh.disabled=false;root.removeAttribute('aria-busy');return;}
      try {
        if(fresh){cache.clear();window.MTSGVisits?.clear();}
        if(!timezone) {
          const bootstrap=await fetchReports({zone:request({start:'yesterday',end:'yesterday'},[],['sessions'])},{propertyId,session,signal});
          timezone=bootstrap.zone.metadata?.timeZone;
          if(!timezone)throw new Error('Google did not return the reporting timezone. Please retry.');
          // Validate the property timezone before making calendar-date requests.
          todayInZone(timezone);
        }
        const today=todayInZone(timezone);
        find('[data-ov-period] option[value="week"]').textContent=state.weekOffset ? 'Calendar week' : 'This week';
        find('[data-ov-zone]').textContent=timezone+' · GA reporting timezone';
        find('[data-ov-start]').max=today;find('[data-ov-end]').max=today;
        if(!focusOnly||!period||period.today!==today) {
          state.day=null;
          period=periodFor(find('[data-ov-period]').value,today,{weekOffset:state.weekOffset,start:find('[data-ov-start]').value,end:find('[data-ov-end]').value});
          if(!find('[data-ov-start]').value){find('[data-ov-start]').value=period.start;find('[data-ov-end]').value=period.end;}
        }
        content.innerHTML='<div data-panel="overview"><p class="ov-empty">Loading summary reports… You can open Visits independently.</p></div><div data-panel="visits" hidden><div data-ov-visits></div></div><div data-panel="content" hidden><p class="ov-empty">Content reports are loading.</p></div>';content.hidden=false;activate(state.tab);
        const range=focusRange(period,state.day), key=JSON.stringify([range.start,range.end,range.comparisonStart,state.country,state.device,state.city]);
        const saved=cache.get(key);
        let reports;
        if(saved&&Date.now()-saved.time<180000)reports=saved.reports;
        else {
          const all=requests(range,{country:state.country,device:state.device,city:state.city});
          // These old reports no longer feed any visible component.
          const specs=Object.fromEntries(['current','daily','previous','countries','locations','pages','sources','returning','research','links','cityPages','hours','events'].filter(k=>all[k]).map(k=>[k,all[k]]));
          reports=await fetchReports(specs,{propertyId,session,signal,partial:true,onProgress:(done,total,partial)=>{
            if(removed||version!==revision)return;
            status.textContent=`Loading reports ${done} of ${total}…`;
            // Show the complete overview before optional timing/action reports.
            if(partial.current&&partial.daily&&!detail){if(!state.day&&!state.city||!parent)parent=partial;detail=partial;updateCountries();draw();}
          }});
          if(removed||version!==revision||!getSession())return;
          if(!Object.keys(reports.failures||{}).length)cache.set(key,{time:Date.now(),reports});
          if(cache.size>16)cache.delete(cache.keys().next().value);
        }
        if(!reports.current||!reports.daily)throw new Error('The summary or daily report is unavailable. '+Object.values(reports.failures||{}).slice(0,1).join(' '));
        maps=maps||await mapPromise;
        if(removed||version!==revision||!getSession())return;
        if(!state.day&&!state.city||!parent)parent=reports;
        detail=reports;loadedAt=new Date();updateCountries();draw();
        status.textContent=Object.keys(reports.failures||{}).length?`Loaded ${Object.keys(reports).length} reports. Unavailable: ${Object.keys(reports.failures).join(', ')}. Refresh to retry.`:`Updated ${loadedAt.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} · Recent data can change as Google processes events.`;
      } catch(error) {
        if(removed||version!==revision||signal.aborted)return;
        if(detail){status.textContent='Overview loaded. Some additional reports did not respond; refresh to retry.';return;}
        parent=detail=null;
        const overviewPanel=find('[data-panel="overview"]');if(overviewPanel)overviewPanel.innerHTML='<p class="ov-empty">Summary reports are temporarily unavailable. Choose another reporting period or open Visits for city, time and page-by-page records from the daily export.</p>';
        const contentPanel=find('[data-panel="content"]');if(contentPanel)contentPanel.innerHTML='<p class="ov-empty">Content reports are temporarily unavailable. Page-by-page records remain accessible in Visits.</p>';
        status.textContent=error.name==='TimeoutError'?'Google took too long to respond. Please refresh to retry.':error.message;
        connect.hidden=!error.connect;
      } finally {if(!removed&&version===revision){refresh.disabled=false;root.removeAttribute('aria-busy');}}
    }
    const filterLoad=()=> {state.day=null;state.city='';parent=null;state.country=find('[data-ov-country]').value;state.device=find('[data-ov-device]').value;load();};
    find('[data-ov-period]').addEventListener('change',e=> {
      if(e.target.value==='last-week'){e.target.value='week';state.weekOffset=-1;}else state.weekOffset=0;
      find('[data-ov-custom]').hidden=e.target.value!=='custom';
      if(e.target.value!=='custom')filterLoad();
    });
    find('[data-ov-form]').addEventListener('submit',e=>{e.preventDefault();if(find('[data-ov-period]').value==='custom')filterLoad();});
    find('[data-ov-country]').addEventListener('change',filterLoad);find('[data-ov-device]').addEventListener('change',filterLoad);
    refresh.addEventListener('click',()=>load({fresh:true}));
    find('[data-ov-reset]').addEventListener('click',()=>{find('[data-ov-country]').value='';find('[data-ov-device]').value='';filterLoad();});
    connect.addEventListener('click',onRenew);find('[data-ov-signout]').addEventListener('click',onSignOut);
    root.addEventListener('click',e=> {
      const tab=e.target.closest('[data-ov-tab],[data-kpi-tab]');if(tab){if(tab.dataset.kpiTab){state.visitKind=tab.dataset.kind||'';visits?.setKind(state.visitKind);}activate(tab.dataset.ovTab||tab.dataset.kpiTab);return;}
      const collapse=e.target.closest('[data-map-collapse]');if(collapse){const open=collapse.getAttribute('aria-expanded')!=='true';collapse.setAttribute('aria-expanded',String(open));collapse.textContent=open?'Hide map':'Show map';collapse.closest('.ov-map-shell').classList.toggle('is-open',open);return;}
      const mv=e.target.closest('[data-map-view]');if(mv){state.mapView=mv.dataset.mapView;find('[data-geography]').innerHTML=geography(locationData(detail).data,maps,state,locationData(detail).metric);return;}
      const city=e.target.closest('[data-city]');if(city){state.highlightCity='';state.city=city.dataset.city;state.tab='visits';load({focusOnly:true});return;}
      if(e.target.closest('[data-clear-city]')){state.city=state.highlightCity='';load({focusOnly:true});return;}
      const day=e.target.closest('[data-day]');
      if(day&&!day.disabled){state.highlightCity='';state.day=day.dataset.day;load({focusOnly:true});return;}
      if(e.target.closest('[data-ov-all]')){state.day=null;load({focusOnly:true});return;}
      const week=e.target.closest('[data-ov-week]');
      if(week&&!week.disabled){state.city='';parent=null;state.weekOffset=Math.min(0,state.weekOffset+Number(week.dataset.ovWeek));load();return;}
      const point=e.target.closest('[data-map-label]');if(point)point.closest('.ov-map').querySelector('[data-map-detail]').textContent=point.dataset.mapLabel;
      const hour=e.target.closest('[data-hour]');if(hour)find('[data-hour-detail]').textContent=hour.dataset.hour;
      if(e.target.closest('[data-ov-export]')&&parent&&detail) {
        const type=find('[data-ov-export-type]').value, range=focusRange(period,state.day);
        if(!(type==='daily'?parent.daily:detail[type])){status.textContent='This report is unavailable. Please refresh before exporting.';return;}
        const data=exportRows(type,parent,detail,range,timezone).map(row=>({...row,period_start:type==='daily'?period.start:range.start,period_end:type==='daily'?period.end:range.end}));
        if(!data.length){status.textContent='There are no rows to export for this selection.';return;}
        const url=URL.createObjectURL(new Blob([csv(data)],{type:'text/csv;charset=utf-8'})), link=document.createElement('a');link.href=url;link.download=`CMBL-${type}-${type==='daily'?period.start:range.start}-${type==='daily'?period.end:range.end}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      }
    });
    root.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('svg [data-day],svg [data-map-label],svg [data-city]')){e.preventDefault();e.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}});
    root.addEventListener('focusin',e=>{if(e.target.matches('[data-map-label]'))e.target.closest('.ov-map').querySelector('[data-map-detail]').textContent=e.target.dataset.mapLabel;});
    root.addEventListener('mouseover',e=>{const point=e.target.closest('[data-map-label]');if(point)point.closest('.ov-map').querySelector('[data-map-detail]').textContent=point.dataset.mapLabel;});
    root.addEventListener('change',e=>{if(e.target.matches('[data-ov-metric]')){state.metric=e.target.value;find('[data-daily-chart]').innerHTML=calendar(dailySeries(parent.daily,period),period,state.day,state.metric);}if(e.target.matches('[data-ov-page-sort]')){state.pageSort=e.target.value;draw();}});
    root.addEventListener('input',e=> {
      if(e.target.matches('[data-ov-city-search]')){find('[data-ov-city-pages]').innerHTML=cityPagesTable(detail.cityPages?rows(detail.cityPages):[],e.target.value);return;}
      if(!e.target.matches('[data-ov-search],[data-ov-location-search]'))return;
      if(e.target.matches('[data-ov-location-search]')){state.locationSearch=e.target.value;find('[data-city-list]').innerHTML=cityList(locationData(detail).data,state,locationData(detail).metric);}
      else {state.search=e.target.value;find('[data-content-pages]').innerHTML=pageTable(detail.pages?rows(detail.pages):[],state.search);}

    });
    load();
    return {reload:()=>load({fresh:true}),dispose(){visits?.dispose();window.MTSGVisits?.clear();removed=true;revision++;controller?.abort();clearData();root.replaceChildren();}};
  }
  const api={mount};
  if(typeof window!=='undefined')window.MTSGOverview=api;
  if(typeof module!=='undefined')module.exports={...api,cityPagesTable,locationData,mergePages,pageName,paperLink,geography,filterRequest:request,esc,number,duration,ratio,delta,rows,request,requests,todayInZone,periodFor,focusRange,dailySeries,calendar,heatmap,render,renderContent,mapGraphic,csv,exportRows,normalizeReport,fetchReports};
})();
