// REAL deployed routes/bundles. All Auth/game API traffic is intercepted in a
// fresh context with entirely synthetic identity/data; no existing identity read.
const{chromium,webkit}=require('../../frontend/node_modules/playwright')
const fs=require('node:fs')
const assert=require('node:assert/strict')
const origin=process.env.DEPLOYED_QA_ORIGIN||'http://127.0.0.1:20204'
const out=process.env.QA_OUTPUT||'/tmp/hexaverse-first-desktop-before';fs.mkdirSync(out,{recursive:true})
const uid='isolated-production-qa',corp='isolated-production-corp',system='sys_0_1',fleetId='isolated-production-fleet'
const now=Math.floor(Date.now()/1000),token=[{alg:'none',typ:'JWT'},{sub:uid,user_id:uid,aud:'hexaverse-emulator',iss:'https://securetoken.google.com/hexaverse-emulator',iat:now,exp:now+3600,auth_time:now,email:'isolated@example.invalid',firebase:{identities:{},sign_in_provider:'password'}},''].map((v,i)=>i<2?Buffer.from(JSON.stringify(v)).toString('base64url'):v).join('.')
const fleet={id:fleetId,corporationId:corp,own:true,systemId:system,worldTime:1000,position:{X:10,Y:0,Z:0},attachedTo:'qa-station',roster:{ships:[{class:'hauler'}],cargo:{fuel:60},cargoCapacity:100,freeHold:40,miningRate:1},state:{Mode:1,Burn:null,Drift:null,Park:{Kind:2,BodyId:'qa-station',Radius:0,PeriodMs:0,Phase:0,EpochMs:1000,Offset:{X:0,Y:0,Z:0},Point:{X:0,Y:0,Z:0}}}}
const interior={systemId:system,extent:100,character:'normal',starClass:'G',worldTime:1000,scale:1,features:[{id:'qa-star',type:'star',space:{X:0,Y:0,Z:0},size:5},{id:'qa-planet',type:'planet',space:{X:20,Y:0,Z:8},size:2,resources:[]},{id:'qa-station',type:'station',space:{X:10,Y:0,Z:0},size:1}],laneGates:[],contacts:[]}
if(process.env.QA_HUD_CASE==='mine'){
 fleet.attachedTo='qa-planet';fleet.position={X:20,Y:0,Z:8};fleet.state.Park={...fleet.state.Park,Kind:0,BodyId:'qa-planet',PeriodMs:60000};fleet.roster.stationKeepRateTonsPerSecond=.01
 interior.features[1].type='rocky';interior.features[1].resources=[{kind:'metals',richness:1}]
}
fleet.roster.fuelPricePerTon=2
if(process.env.QA_INPUT_FORMS==='1')fleet.roster.cargo.metals=5
if(process.env.QA_OBJECTS_SEARCH==='1')for(let i=1;i<=20;i++)interior.features.push({id:'qa-extra-'+String(i).padStart(2,'0'),name:'QA Survey Site '+String(i).padStart(2,'0'),type:'rocky',space:{X:-60+i*2,Y:0,Z:-30},size:.6,resources:[]})
async function auditInputs(p,name,phase){
 if(process.env.QA_INPUT_FOCUS!=='1')return
 const data=await p.evaluate(()=>({route:location.pathname,meta:document.querySelector('meta[name="viewport"]')?.content,viewport:{innerWidth,innerHeight,scale:visualViewport?.scale,width:visualViewport?.width,height:visualViewport?.height,offsetTop:visualViewport?.offsetTop,offsetLeft:visualViewport?.offsetLeft},fields:[...document.querySelectorAll('input,textarea,select')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden').map(e=>{const style=getComputedStyle(e),rect=e.getBoundingClientRect(),ancestors=[];for(let n=e;n;n=n.parentElement){const s=getComputedStyle(n);if(s.transform!=='none'||s.scale!=='none'||s.zoom!=='1')ancestors.push({tag:n.tagName,id:n.getAttribute('data-testid'),transform:s.transform,scale:s.scale,zoom:s.zoom})}return {id:e.getAttribute('data-testid')||e.getAttribute('aria-label')||e.name,type:e.type,font:parseFloat(style.fontSize),lineHeight:style.lineHeight,textSizeAdjust:style.webkitTextSizeAdjust,effectiveScale:e.offsetWidth?rect.width/e.offsetWidth:1,focused:e===document.activeElement,disabled:e.disabled,invalid:e.getAttribute('aria-invalid'),ancestors}})}))
 console.log(name,'INPUT AUDIT',phase,JSON.stringify(data))
 if(process.env.QA_EXPECT_MIN_INPUT==='1')for(const field of data.fields){assert.ok(field.font>=16,'Readable input '+phase+' '+field.id+': '+field.font);assert.ok(field.effectiveScale>=.99,'No reduced input transform '+JSON.stringify(field))}
 assert.ok(!/user-scalable=no|maximum-scale=1/.test(data.meta),'Accessible browser zoom stays enabled')
}
async function run(type,options,name){
 const b=await type.launch({headless:true,...options});const errors=[],bad=[],requests=[],writes=[],fixtureWrites=[];let spawned=process.env.QA_FIRST_LOGIN!=='1',closing=false
 try{
 const c=await b.newContext({viewport:{width:Number(process.env.QA_WIDTH||1280),height:Number(process.env.QA_HEIGHT||900)},isMobile:Number(process.env.QA_WIDTH||1280)<=1024,hasTouch:Number(process.env.QA_WIDTH||1280)<=1024});const p=await c.newPage();p.setDefaultTimeout(15000)
 p.on('pageerror',e=>errors.push(e.message.slice(0,1200)));p.on('console',m=>{if(m.type()==='error')errors.push(m.text().replace(/\?.*/g,'?<redacted>').slice(0,500))});p.on('response',r=>{const u=new URL(r.url());if(u.pathname.startsWith('/_next/')&&r.status()>=400)bad.push({path:u.pathname,status:r.status()})});p.on('requestfailed',r=>{const u=new URL(r.url());if(u.pathname.startsWith('/_next/'))bad.push({path:u.pathname,error:r.failure()?.errorText})})
 if(origin.startsWith('https://'))await p.route(origin+'/**',async route=>{
 try{
 const req=route.request(),u=new URL(req.url());const headers={...req.headers()};delete headers.host;delete headers.cookie;delete headers.authorization
 // Retry one reset GET connection in the QA resource forwarder; app writes stay intercepted.
 const response=await c.request.fetch((process.env.QA_UPSTREAM||'http://127.0.0.1:20204')+u.pathname+u.search,{method:req.method(),headers,data:req.postDataBuffer()||undefined,failOnStatusCode:false,maxRetries:req.method()==='GET'?1:0})
 const hs={...response.headers()};for(const key of['content-encoding','content-length','transfer-encoding','connection','set-cookie'])delete hs[key]
 return await route.fulfill({status:response.status(),headers:hs,body:await response.body()})
 }catch(error){if(!closing)throw error} // Only ignore a resource forwarder's race after all assertions, during teardown.
 })
 await p.route('**/emulator/auth/iframe**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Synthetic Auth frame</title>'}))
 await p.route('**/identitytoolkit.googleapis.com/**',async route=>{const path=new URL(route.request().url()).pathname;if(path.includes('signInWithPassword'))return route.fulfill({json:{localId:uid,email:'isolated@example.invalid',idToken:token,refreshToken:'synthetic-refresh',expiresIn:'3600',registered:true}});if(path.includes('lookup'))return route.fulfill({json:{users:[{localId:uid,email:'isolated@example.invalid',emailVerified:true,displayName:'Isolated QA',providerUserInfo:[],createdAt:'1000',lastLoginAt:'1000'}]}});return route.fulfill({status:400,json:{error:{message:'QA_AUTH_ROUTE_BLOCKED'}}})})
 await p.route('**/securetoken.googleapis.com/**',route=>route.fulfill({json:{access_token:token,id_token:token,refresh_token:'synthetic-refresh',expires_in:'3600',user_id:uid,token_type:'Bearer'}}))
 await p.route('**/api/**',async route=>{const u=new URL(route.request().url()),path=u.pathname.slice(4);requests.push(path);if((process.env.QA_ORBIT==='1'||process.env.QA_HUD_BASELINE==='1'||process.env.QA_MOBILE_NAV==='1'||process.env.QA_OBJECTS_SEARCH==='1')&&path.endsWith('/orders/preview')&&route.request().method()==='POST'){fixtureWrites.push(path);return route.fulfill({json:{controlPoints:[],departMs:1000,arriveMs:2000,deltaV:1,fuelCostTons:1,affordable:true,strandingWarning:false}})}if(process.env.QA_FIRST_LOGIN==='1'&&path==='/v1/corporations'&&route.request().method()==='POST'){spawned=true;fixtureWrites.push(path);return route.fulfill({json:{corporation:{id:corp,accountId:uid,name:'Isolated QA',createdAt:0,credits:1000},fleet,homeSystem:{id:system,name:'QA System',region:'normal',coords:{x:0,y:0,z:0},skeleton:{starClass:'G',bodies:[]}},worldTime:1000}})}if(route.request().method()!=='GET'){writes.push(path);return route.fulfill({status:403,json:{error:'Synthetic QA forbids mutations'}})}
 let data,status=200
 if(path==='/v1/accounts/firestore')data={id:uid,email:'isolated@example.invalid',name:'Isolated QA'}
 else if(path==='/v1/corporations/me'&&!spawned)return route.fulfill({status:200,contentType:'application/json',body:'null'})
 else if(path==='/v1/corporations/me')data={id:corp,accountId:uid,name:'Isolated QA',createdAt:0,credits:1000}
 else if(path==='/v1/galaxy')data={id:'qa',seed:1,bounds:{x:[-100,100],y:[-100,100],z:[-30,30]},worldTime:1000,systems:[{id:system,name:'QA System',region:'normal',coords:{x:0,y:0,z:0},tier:'explored',skeleton:{starClass:'G',bodies:[]}}],lanes:[]}
 else if(path==='/v1/systems/'+system)data=interior
 else if(path==='/v1/systems/'+system+'/station')data={systemId:system,featureId:'qa-station',createdAt:0}
 else if(path==='/v1/fleets')data={fleets:[fleet],worldTime:1000,scale:1}
 else if(path.endsWith('/survey'))data={range:100,durationMs:1000,worldTime:1000,scale:1,sensorBusy:false,inTransit:false,survey:null,targets:[]}
 else if(path.endsWith('/scan-targets'))data={fleetId,systemId:system,worldTime:1000,targets:[]}
 else if(path==='/v1/market/board')data={worldTime:1000,refreshCadenceMs:30000,venues:process.env.QA_INPUT_FORMS==='1'?[{venue:'qa-only',systemId:system,quotes:[{kind:'metals',entries:[{source:'floor',unitPrice:2,unlimited:true}]}]}]:[]}
 else if(path==='/v1/actions')data={actions:[]}
 else if(path==='/v1/sightings')data={sightings:[],nextCursor:null}
 else if(path.includes('/channels/'))return route.fulfill({status:200,contentType:'text/event-stream',body:': fixture\n\n'})
 else{status=404;data={error:'QA fixture missing'}}
 return route.fulfill({status,json:data})})
 await p.goto(origin+'/login');await p.getByTestId('login-email').waitFor();await auditInputs(p,name,'login-rest');await p.getByTestId('login-email').focus();await auditInputs(p,name,'login-focus');if(process.env.QA_INPUT_FOCUS==='1'){await p.getByRole('button',{name:'Sign up',exact:true}).click();await p.getByTestId('login-confirm-password').focus();await auditInputs(p,name,'signup-confirm-focus');await p.getByRole('button',{name:'Sign in',exact:true}).click()}await p.getByTestId('login-email').fill('isolated@example.invalid');await p.getByTestId('login-password').fill('synthetic-not-a-credential');await p.getByTestId('login-submit').click()
 await p.waitForFunction(()=>!document.querySelector('[data-testid="login-submit"]'),{timeout:15000}).catch(()=>{})

 const phone=Number(process.env.QA_WIDTH||1280)<=1024
 await p.getByTestId('wake-name-input').waitFor();await p.getByTestId('wake-name-input').fill('First desktop QA');await p.getByTestId('wake-name-input').press('Enter');await p.getByTestId('begin-guide').waitFor()
 const facts=()=>p.evaluate(()=>{const box=e=>e?.getBoundingClientRect().toJSON();const objective=document.querySelector('[aria-label="Current objective"]'),arrange=document.querySelector('[aria-label="Arrange HUD"]'),close=document.querySelector('[data-testid="dismiss-guide"]');return {objective:box(objective),objectivePosition:getComputedStyle(objective).position,arrange:box(arrange),arrangeText:arrange?.textContent,arrangeInert:!!arrange?.closest('[inert]'),focused:document.activeElement?.getAttribute('aria-label'),closeFocused:close===document.activeElement,closeFocusVisible:close.matches(':focus-visible'),objectsHidden:document.querySelector('[data-panel="objects"]').hidden}})
 let initial=await facts();console.log(name,'FIRST CORPORATION VIEW',JSON.stringify(initial));await p.screenshot({path:out+'/'+name+'-first-wake.png'})
 // Replay a legitimate load-order change: shared card CSS arriving after view CSS.
 await p.evaluate(()=>{const card=document.querySelector('[aria-label="Current objective"]'),shell=[...card.classList].find(c=>c.includes('shell__'));const found=[];function walk(rules){for(const r of rules){if(r.selectorText==='.'+shell)found.push(r.cssText);if(r.cssRules)walk(r.cssRules)}}for(const sheet of document.styleSheets){try{walk(sheet.cssRules)}catch{}}const style=document.createElement('style');style.textContent=found.join('\n');document.head.append(style)})
 const reordered=await facts();console.log(name,'SHARED CARD CSS LAST',JSON.stringify(reordered));await p.screenshot({path:out+'/'+name+'-card-css-last.png'})
 if(process.env.QA_EXPECT_FIXED==='1'){
  for(const state of [initial,reordered]){
   const a=state.arrange,o=state.objective
   assert.equal(state.arrangeText.trim(),'');assert.ok(a.width>=44&&a.height>=44)
   assert.equal(state.closeFocused,false);assert.equal(state.focused,'Recovery transmission')
   assert.equal(state.objectsHidden,true,'Wake phase suspends its whole empty panel without persisting a hide')
   assert.ok(o.x>=0&&o.right<=Number(process.env.QA_WIDTH||1280),'Objective stays inside viewport')
   if(!phone)assert.ok(o.right<=a.x||o.x>=a.right||o.bottom<=a.y||o.y>=a.bottom,'Objective and gear cannot overlap')
   else assert.ok(state.arrangeInert,'Full-page tutorial owns the phone viewport and disables covered navigation')
  }
  const close=p.getByTestId('dismiss-guide');await p.getByTestId('recovery-transmission').press('Tab');assert.ok(await close.evaluate(e=>e===document.activeElement));await close.press('Shift+Tab');assert.ok(await p.getByTestId('begin-guide').evaluate(e=>e===document.activeElement));await p.getByTestId('begin-guide').press('Tab');assert.ok(await close.evaluate(e=>e===document.activeElement));await close.press('ArrowLeft');assert.ok(await close.evaluate(e=>e.matches(':focus-visible')),'Keyboard focus indicator retained')
  await p.getByTestId('begin-guide').click();await p.getByTestId('guide-objects').click();assert.equal(await p.getByTestId('recovery-transmission').count(),0)
  assert.ok(await p.getByRole('searchbox',{name:'Find a system object'}).isVisible())
  if(phone)await p.getByRole('button',{name:'Close Objects panel',exact:true}).click()
  await p.getByRole('button',{name:'Resume guide',exact:true}).click();assert.equal(await close.evaluate(e=>e===document.activeElement),false)
  await p.getByTestId('guide-introduce-scan').click();await p.getByTestId('guide-open-scan').click();assert.equal(await p.getByTestId('recovery-transmission').count(),0)
  assert.ok(await p.getByTestId('command-sensors').isVisible());if(phone)await p.getByRole('button',{name:'Close Command panel',exact:true}).click()
  await p.getByRole('button',{name:'Resume guide',exact:true}).click();await p.getByRole('dialog',{name:'Recovery transmission',exact:true}).press('Escape');assert.equal(await close.count(),0)
  assert.equal(await p.getByTestId('space-canvas-region').evaluate(e=>!!e.closest('[inert]')),false)
  const gear=p.getByRole('button',{name:'Arrange HUD',exact:true});assert.equal(await gear.innerText(),'');assert.ok(await gear.locator('svg').isVisible())
  await gear.click();await p.getByRole('button',{name:'Close HUD settings',exact:true}).click()
  await p.waitForLoadState('networkidle');await p.reload();await p.getByTestId('hud-workspace').waitFor();await p.waitForLoadState('networkidle')
  assert.equal(await p.getByTestId('wake-name-input').count(),0);assert.equal(await p.getByTestId('recovery-transmission').count(),0)
  assert.ok(await gear.isVisible());assert.equal(await gear.innerText(),'');assert.equal(await p.getByTestId('space-canvas-region').evaluate(e=>!!e.closest('[inert]')),false)
  await p.screenshot({path:out+'/'+name+'-returning.png'})
  await p.goto(origin+'/');await p.getByRole('heading',{name:'Live Galaxy',exact:true}).first().waitFor();const galaxyGear=p.getByRole('button',{name:'Arrange HUD',exact:true});await galaxyGear.waitFor({state:'visible'});const g=await galaxyGear.boundingBox();assert.ok(g&&g.width>=44&&g.height>=44);assert.equal(await galaxyGear.innerText(),'');assert.ok(await galaxyGear.locator('svg').isVisible());await galaxyGear.click();await p.getByRole('button',{name:'Close HUD settings',exact:true}).click();await p.screenshot({path:out+'/'+name+'-galaxy-gear.png'})
  console.log(name,'FIRST LOGIN/GEAR/OBJECTIVE ORDER/INITIAL FOCUS/TAB WRAP/HANDOFF/ESCAPE/RETURNING/BOTH VIEWS PASS')
 }
 assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal page overflow');assert.equal(writes.length,0);assert.equal(fixtureWrites.length,1);assert.deepEqual(errors,[]);assert.deepEqual(bad,[])
 closing=true;await c.close()
 }finally{closing=true;await b.close()}
}
;(async()=>{if((process.env.QA_ENGINE||'').toLowerCase()!=='webkit')await run(chromium,{},'Chromium');if((process.env.QA_ENGINE||'').toLowerCase()!=='chromium')await run(webkit,{executablePath:'/Users/travis/Library/Caches/ms-playwright/webkit-2182/pw_run.sh'},'WebKit')})().catch(e=>{console.error(e);process.exitCode=1})
