const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const api=require('../assets/js/owner/overview.js');
const report=(dims,metrics,data,metadata={timeZone:'America/Denver'})=>({dimensionHeaders:dims.map(name=>({name})),metricHeaders:metrics.map(name=>({name})),rows:data.map(values=>({dimensionValues:values.slice(0,dims.length).map(value=>({value:String(value)})),metricValues:values.slice(dims.length).map(value=>({value:String(value)}))})),metadata,rowCount:data.length});
test('calendar uses property timezone, even across a browser date boundary',()=>{
 assert.equal(api.todayInZone('America/Denver',new Date('2026-10-21T02:00:00Z')),'2026-10-20');
 assert.equal(api.todayInZone('Asia/Seoul',new Date('2026-10-21T02:00:00Z')),'2026-10-21');
});
test('current week is Monday through today; compare same weekdays last week',()=>{
 const p=api.periodFor('week','2026-10-21');
 assert.equal(p.start,'2026-10-19');assert.equal(p.end,'2026-10-21');assert.equal(p.displayEnd,'2026-10-25');assert.equal(p.comparisonStart,'2026-10-12');assert.equal(p.comparisonEnd,'2026-10-14');
 assert.equal(api.focusRange(p,'2026-10-20').comparisonStart,'2026-10-13');
 assert.throws(()=>api.focusRange(p,'2026-10-22'));
});
test('week boundaries work across Sunday, year, and DST changes',()=>{
 assert.equal(api.periodFor('week','2026-11-01').start,'2026-10-26');
 assert.equal(api.periodFor('week','2027-01-01').start,'2026-12-28');
 assert.equal(api.periodFor('week','2026-10-21',{weekOffset:-1}).end,'2026-10-18');
 assert.equal(api.periodFor('week','2026-10-19').end,'2026-10-19');
});
test('rolling ranges contain the exact count of completed days',()=>{
 const p=api.periodFor('7','2026-10-21');assert.equal(p.start,'2026-10-14');assert.equal(p.end,'2026-10-20');assert.equal(p.comparisonEnd,'2026-10-13');assert.equal(p.comparisonStart,'2026-10-07');
});
test('invalid and excessive custom dates cannot become API queries',()=>{
 for(const [start,end] of [['2026-02-30','2026-03-01'],['2026-01-01','2026-10-20'],['2026-10-22','2026-10-23'],['2026-10-21','2026-10-20']]) assert.throws(()=>api.periodFor('custom','2026-10-21',{start,end}));
 assert.equal(api.periodFor('custom','2026-10-21',{start:'2026-10-01',end:'2026-10-21'}).comparisonEnd,'2026-09-30');
});
test('all report requests are site-scoped, and country/device affect every report',()=>{
 const p=api.periodFor('week','2026-10-21'), queries=api.requests(p,{country:'South Korea',device:'mobile'});
 for(const q of Object.values(queries)){
  const f=JSON.stringify(q.dimensionFilter);for(const expected of ['yechan-noh.github.io','/MPSG','/MPSG/dashboard','/MPSG/owner','/dashboard','/owner','South Korea','mobile'])assert.ok(f.includes(expected));
  assert.ok(!JSON.stringify(q).includes('userId'));assert.ok(!JSON.stringify(q).includes('ipAddress'));
 }
 assert.equal(queries.states,undefined);
 assert.ok(JSON.stringify(api.requests(p,{country:'United States'}).states).includes('countryId'));
 assert.deepEqual(queries.previous.dateRanges,[{startDate:'2026-10-12',endDate:'2026-10-14'}]);
});
test('days with no reported rows are zero; future days are not zero-valued visits',()=>{
 const p=api.periodFor('week','2026-10-21'), r=report(['date'],['activeUsers','sessions','userEngagementDuration'],[['20261020',2,3,90]]);
 const days=api.dailySeries(r,p);assert.equal(days.length,7);assert.equal(days[0].sessions,0);assert.equal(days[1].sessions,3);assert.equal(days[2].today,true);assert.equal(days[3].future,true);
 const markup=api.calendar(days,p,null,'sessions');assert.equal((markup.match(/ disabled/g)||[]).length,4);assert.ok(markup.includes('Partial data'));
});
test('duration rounding cannot produce 1m 60s, and empty ratios stay unavailable',()=>{
 assert.equal(api.duration(119.9),'2m 0s');assert.equal(api.duration(null),'—');assert.equal(api.ratio(30,0),null);assert.equal(api.duration(3600),'1h 0m');assert.equal(api.delta(5,0),'Prior period: 0');
});
test('API text is escaped in HTML and CSV formula strings are neutralized',()=>{
 assert.equal(api.esc('<img onerror="bad">'),'&lt;img onerror=&quot;bad&quot;&gt;');
 const csv=api.csv([{city:'=HYPERLINK("bad")',sessions:3,source:'@SUM(1,2)'}]);assert.ok(csv.includes("'=HYPERLINK"));assert.ok(csv.includes("'@SUM"));assert.ok(csv.includes('"3"'));
});
test('hourly chart is date-specific and does not turn sparse data into an identity trail',()=>{
 const html=api.heatmap([{dateHour:'2026102013',screenPageViews:7}],{start:'2026-10-20',end:'2026-10-20'});
 assert.equal((html.match(/class="ov-heat-cell"/g)||[]).length,24);assert.ok(html.includes('13:00–13:59 · 7 views reported'));assert.ok(!html.includes('visitor ID'));
});
test('API batches are bounded at five and keep response/report association',async()=>{
 const seen=[];const r=report([],['sessions'],[[3]]);const specs=Object.fromEntries(Array.from({length:12},(_,i)=>['r'+i,{id:i}]));
 const got=await api.fetchReports(specs,{propertyId:'499333574',session:{token:'test-only'},signal:new AbortController().signal,fetcher:async(url,opts)=>{const q=JSON.parse(opts.body);seen.push(q.requests.length);assert.equal(opts.credentials,'omit');assert.equal(opts.cache,'no-store');return{ok:true,json:async()=>({reports:q.requests.map(()=>r)})};}});
 assert.deepEqual(seen,[5,5,2]);assert.equal(Object.keys(got).length,12);assert.equal(api.rows(got.r11)[0].sessions,3);
});
test('expired authorization, quota, malformed reports and cancellation fail closed',async()=>{
 const opts={propertyId:'123',session:{token:'test-only'},signal:new AbortController().signal};
 for(const status of [401,403,429,500])await assert.rejects(api.fetchReports({one:{}},{...opts,fetcher:async()=>({ok:false,status,json:async()=>({})})}),e=>status===401||status===403?e.connect===true:!e.connect);
 await assert.rejects(api.fetchReports({one:{}},{...opts,fetcher:async()=>({ok:true,json:async()=>({reports:[]})})}),/incomplete/);
 await assert.rejects(api.fetchReports({one:{}},{...opts,fetcher:async()=>{throw new DOMException('aborted','AbortError');}}),{name:'AbortError'});
});
test('authorization is still checked by the private Drive document before mounting',()=>{
 const access=fs.readFileSync('assets/js/owner/access.js','utf8');assert.ok(access.indexOf('await protectedContent(session)')<access.indexOf("if (mode === 'dashboard') mountReport()"));
 const source=fs.readFileSync('assets/js/owner/overview.js','utf8');assert.ok(!/localStorage|sessionStorage/.test(source));assert.ok(source.includes('credentials:\'omit\''));
});

test('recognized empty GA reports are empty, while malformed/nonempty reports still fail',async()=>{
 const query={dimensions:[{name:'country'}],metrics:[{name:'sessions'}]};
 const empty=api.normalizeReport({kind:'analyticsData#runReport',rowCount:0},query);assert.deepEqual(api.rows(empty),[]);assert.equal(empty.metricHeaders[0].name,'sessions');
 assert.throws(()=>api.rows(api.normalizeReport({},query)));
 assert.throws(()=>api.rows(api.normalizeReport({kind:'analyticsData#runReport',rowCount:1,rows:[{metricValues:[{value:'2'}]}]},query)));
 const got=await api.fetchReports({previous:query},{propertyId:'123',session:{token:'test-only'},fetcher:async()=>({ok:true,json:async()=>({reports:[{kind:'analyticsData#runReport',metadata:{emptyReason:'No matching data'}}]})})});assert.deepEqual(api.rows(got.previous),[]);
});

test('migration includes old and new site URLs while excluding owner and unrelated project routes',()=>{
 const q=api.requests(api.periodFor('week','2026-11-06')).current;
 function matches(x,path){
  if(x.andGroup)return x.andGroup.expressions.every(y=>matches(y,path));
  if(x.orGroup)return x.orGroup.expressions.some(y=>matches(y,path));
  if(x.notExpression)return !matches(x.notExpression,path);
  const f=x.filter;if(f.fieldName==='hostName')return true;
  const s=f.stringFilter;
  return s.matchType==='FULL_REGEXP'?new RegExp(s.value,'i').test(path):s.matchType==='BEGINS_WITH'?path.startsWith(s.value):path===s.value;
 }
 for(const p of ['/','/index.html','/research/','/people/','/news/2026-10-25-muacc-poster-award/','/publication/paper.html','/MPSG','/MPSG/','/MPSG/publications/'])assert.ok(matches(q.dimensionFilter,p),p);
 for(const p of ['/dashboard/','/owner/','/MPSG/dashboard/','/MPSG/owner/','/unrelated-project/'])assert.ok(!matches(q.dimensionFilter,p),p);
});
test('overview can render before the optional hourly request finishes',async()=>{
 const period=api.periodFor('week','2026-11-12');
 let calls=0, shown=false;
 await assert.rejects(api.fetchReports(api.requests(period),{
  session:{backendUrl:'https://example.test'},
  fetcher:async(url,options)=>{
   calls++;
   if(calls===14)throw new Error('Hourly request stalled');
   const q=JSON.parse(options.body).requests[0];
   return {ok:true,json:async()=>({reports:[report((q.dimensions||[]).map(d=>d.name),q.metrics.map(m=>m.name),[])]})};
  },
  onProgress:(done,total,partial)=>{
   if(done!==13)return;
   const html=api.render(partial,partial,period,{tab:'overview',weekOffset:0},null,'America/Denver');
   assert.match(html,/Hourly report is unavailable/);
   assert.match(html,/Where visits begin/);
   shown=true;
  }
 }),/Hourly request stalled/);
 assert.equal(shown,true);
});
test('deferred content has identical markup when opened, without creating hidden hourly cells',()=>{
 const period=api.periodFor('90','2026-11-12');
 const reports=Object.fromEntries(Object.entries(api.requests(period)).map(([key,q])=>[key,report(q.dimensions.map(d=>d.name),q.metrics.map(m=>m.name),[])]));
 const state={tab:'overview',weekOffset:0};
 const full=api.render(reports,reports,period,state,null,'America/Denver');
 const light=api.render(reports,reports,period,state,null,'America/Denver',true);
 assert.equal((full.match(/class="ov-heat-cell"/g)||[]).length,2160);
 assert.equal((light.match(/class="ov-heat-cell"/g)||[]).length,0);
 assert.equal(light.replace('<div data-panel="content" hidden></div>',`<div data-panel="content" hidden>${api.renderContent(reports,period)}</div>`),full);
});
test('parsed response reuse preserves numeric results and does not cache invalid reports',()=>{
 const r=report(['city'],['sessions'],[['Example City',3]]);
 assert.deepEqual(api.rows(r),[{city:'Example City',sessions:3}]);
 assert.strictEqual(api.rows(r),api.rows(r));
 const bad=report([],['sessions'],[['invalid']]);
 assert.throws(()=>api.rows(bad));assert.throws(()=>api.rows(bad));
});
test('proxy requests use at most three workers and preserve successful reports after a failure',async()=>{
 const specs=Object.fromEntries(Array.from({length:8},(_,i)=>['r'+i,{dimensions:[],metrics:[{name:'sessions'}],limit:String(i)}]));
 let active=0,peak=0,done=0;
 const out=await api.fetchReports(specs,{session:{backendUrl:'https://proxy.test'},partial:true,onProgress:()=>done++,fetcher:async(url,init)=>{
   active++;peak=Math.max(peak,active);const i=Number(JSON.parse(init.body).requests[0].limit);
   await new Promise(r=>setTimeout(r,2));active--;
   if(i===1)return {ok:false,status:504,json:async()=>({error:{message:'Timed out'}})};
   return {ok:true,json:async()=>({reports:[report([],['sessions'],[[i]])]})};
 }});
 assert.equal(peak,3);assert.equal(done,8);assert.equal(Object.keys(out).length,7);assert.equal(out.failures.r1,'Timed out');assert.equal(api.rows(out.r7)[0].sessions,7);
});
test('a stalled individual report times out without blocking later reports',async()=>{
 const specs={slow:{dimensions:[],metrics:[{name:'sessions'}]},ready:{dimensions:[],metrics:[{name:'sessions'}]}};
 let calls=0;
 const result=await api.fetchReports(specs,{session:{backendUrl:'https://proxy.test'},partial:true,timeoutMs:10,fetcher:async(url,{signal})=>{
   if(calls++===0)return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
   return {ok:true,json:async()=>({reports:[report([],['sessions'],[[2]])]})};
 }});
 assert.equal(api.rows(result.ready)[0].sessions,2);assert.match(result.failures.slow,/timed out/);
});
test('partial rendering marks missing data unavailable instead of inventing zero visits',()=>{
 const p=api.periodFor('week','2026-11-13');const detail={current:report([],['sessions'],[[7]]),daily:report(['date'],['sessions'],[['20261113',7]])};
 const html=api.render(detail,detail,p,{},null,'America/Denver');
 assert.match(html,/Report unavailable/);assert.match(html,/— in the comparison period/);
 assert.doesNotMatch(html,/No city-level page activity reported/);
});
