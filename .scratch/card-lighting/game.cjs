// REAL deployed routes/bundles. All Auth/game API traffic is intercepted in a
// fresh context with entirely synthetic identity/data; no existing identity read.
const{chromium,webkit}=require('../../frontend/node_modules/playwright')
const fs=require('node:fs')
const assert=require('node:assert/strict')
const origin=process.env.DEPLOYED_QA_ORIGIN||'http://127.0.0.1:20204'
const out='/tmp/hexaverse-card-lighting-game';fs.mkdirSync(out,{recursive:true})
const uid='isolated-production-qa',corp='isolated-production-corp',system='sys_0_1',fleetId='isolated-production-fleet'
const now=Math.floor(Date.now()/1000),token=[{alg:'none',typ:'JWT'},{sub:uid,user_id:uid,aud:'hexaverse-emulator',iss:'https://securetoken.google.com/hexaverse-emulator',iat:now,exp:now+3600,auth_time:now,email:'isolated@example.invalid',firebase:{identities:{},sign_in_provider:'password'}},''].map((v,i)=>i<2?Buffer.from(JSON.stringify(v)).toString('base64url'):v).join('.')
const fleet={id:fleetId,name:'Peregrine',corporationId:corp,own:true,systemId:system,worldTime:1000,position:{X:10,Y:0,Z:0},attachedTo:'qa-station',roster:{ships:[{class:'hauler'}],cargo:{fuel:60},cargoCapacity:100,freeHold:40,miningRate:1},state:{Mode:1,Burn:null,Drift:null,Park:{Kind:2,BodyId:'qa-station',Radius:0,PeriodMs:0,Phase:0,EpochMs:1000,Offset:{X:0,Y:0,Z:0},Point:{X:0,Y:0,Z:0}}}}
const interior={systemId:system,extent:100,character:'normal',starClass:'G',worldTime:1000,scale:1,features:[{id:'qa-star',type:'star',space:{X:0,Y:0,Z:0},size:5},{id:'qa-planet',type:'planet',space:{X:20,Y:0,Z:8},size:2,resources:[]},{id:'qa-station',type:'station',space:{X:10,Y:0,Z:0},size:1}],laneGates:[],contacts:[]}
const originalChrome=JSON.parse(fs.readFileSync(__dirname+'/../../frontend/components/hud/__fixtures__/original-card-chrome.json','utf8'))
async function chromeGeometry(card){
 return card.evaluate((e,reference)=>{
  const title=e.querySelector(':scope > [data-slot="hud-title"]'),close=e.querySelector(':scope > [data-slot="hud-close"]'),icon=close.querySelector('svg'),target=close.querySelector('span[aria-hidden="true"]')
  const c=e.getBoundingClientRect(),t=title.getBoundingClientRect(),x=close.getBoundingClientRect(),hit=target.getBoundingClientRect()
  const properties=(node,expected)=>Object.fromEntries(Object.keys(expected).map(k=>[k,getComputedStyle(node)[k]]))
  return {title:properties(title,reference.title),close:properties(close,reference.close),icon:properties(icon,reference.icon),center:t.x+t.width/2-c.x-c.width/2,titleY:t.y+t.height/2-c.y,closeTop:x.y-c.y,closeRight:c.right-x.right,overlap:t.right>x.left&&t.bottom>x.top&&t.top<x.bottom,hit:{x:hit.x,y:hit.y,width:hit.width,height:hit.height,right:hit.right,bottom:hit.bottom}}
 },originalChrome)
}
async function assertOriginalChrome(card){
 const g=await chromeGeometry(card)
 for(const key of ['title','close','icon'])assert.deepEqual(g[key],originalChrome[key],'Original 624c4ff '+key+' styling')
 assert.ok(Math.abs(g.center)<1&&Math.abs(g.titleY)<1,'Original floating centered plaque: '+JSON.stringify(g))
 assert.ok(Math.abs(g.closeTop+10)<1&&Math.abs(g.closeRight+10)<1,'Original corner close offsets')
 assert.equal(g.overlap,false);assert.ok(g.hit.width>=44&&g.hit.height>=44)
 return g
}

const galaxy={id:'qa',seed:1,bounds:{x:[-100,100],y:[-100,100],z:[-30,30]},worldTime:1000,systems:Array.from({length:45},(_,i)=>({id:i===0?system:'qa-system-'+i,name:i===0?'QA System':'QA Survey '+String(i).padStart(2,'0'),region:'normal',coords:{x:i*3,y:i%5*5,z:0},tier:'explored',skeleton:{starClass:'G',bodies:[{type:'rocky',ring:3}]}})),lanes:[]}
async function run(type,options,name){
 const browser=await type.launch({headless:true,...options})
 try{
 for(const size of [{width:390,height:844},{width:844,height:390},{width:1280,height:900}].filter(size=>!process.env.QA_WIDTH||String(size.width)===process.env.QA_WIDTH)){
 const context=await browser.newContext({viewport:size,isMobile:size.width!==1280,hasTouch:size.width!==1280,reducedMotion:'reduce'})
 const p=await context.newPage(),errors=[],writes=[],reads=[];let corporation=corp,closing=false
 p.on('pageerror',e=>{errors.push(e.message);if(process.env.QA_DEBUG_ERRORS==='1')console.log('PAGE ERROR',name,JSON.stringify({message:e.message,stack:e.stack,url:p.url()}))})
 p.on('response',async r=>{if(process.env.QA_DEBUG_ERRORS==='1'&&new URL(r.url()).pathname.endsWith('.js')&&!(r.headers()['content-type']||'').includes('javascript'))console.log('BAD SCRIPT RESPONSE',JSON.stringify({url:r.url(),status:r.status(),type:r.headers()['content-type'],body:(await r.text()).slice(0,100)}))})
 if(origin.startsWith('https://'))await p.route(origin+'/**',async route=>{
  try{
  const req=route.request(),u=new URL(req.url()),headers={...req.headers()};delete headers.host;delete headers.cookie;delete headers.authorization
  const r=await context.request.fetch((process.env.QA_UPSTREAM||'http://127.0.0.1:20204')+u.pathname+u.search,{method:req.method(),headers,data:req.postDataBuffer()||undefined,failOnStatusCode:false,maxRetries:req.method()==='GET'?1:0})
  const hs={...r.headers()};for(const key of ['content-encoding','content-length','transfer-encoding','connection','set-cookie'])delete hs[key]
  const body=await r.body()
  if(process.env.QA_DEBUG_ERRORS==='1'&&u.pathname.endsWith('.js')&&!(hs['content-type']||'').includes('javascript'))console.log('BAD UPSTREAM SCRIPT',JSON.stringify({requested:u.pathname,upstream:r.url(),status:r.status(),type:hs['content-type'],body:body.toString().slice(0,100)}))
  await route.fulfill({status:r.status(),headers:hs,body})
  }catch(error){if(!closing)throw error} // Only tolerate teardown races after all assertions pass.
 })
 await p.route('**/galaxy/start-area.json',r=>r.fulfill({json:galaxy}))
 await p.route('**/emulator/auth/iframe**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Synthetic Auth frame</title>'}))
 await p.route('**/identitytoolkit.googleapis.com/**',async route=>{const path=new URL(route.request().url()).pathname;if(path.includes('signInWithPassword'))return route.fulfill({json:{localId:uid,email:'isolated@example.invalid',idToken:token,refreshToken:'synthetic-refresh',expiresIn:'3600',registered:true}});if(path.includes('lookup'))return route.fulfill({json:{users:[{localId:uid,email:'isolated@example.invalid',emailVerified:true,displayName:'Isolated QA',providerUserInfo:[],createdAt:'1000',lastLoginAt:'1000'}]}});return route.fulfill({status:400,json:{error:{message:'QA_AUTH_ROUTE_BLOCKED'}}})})
 await p.route('**/securetoken.googleapis.com/**',route=>route.fulfill({json:{access_token:token,id_token:token,refresh_token:'synthetic-refresh',expires_in:'3600',user_id:uid,token_type:'Bearer'}}))

 await p.route('**/api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname.slice(4);reads.push(path)
  if(req.method()!=='GET'){writes.push(path);return route.fulfill({status:403,json:{error:'Synthetic QA forbids mutations'}})}
  let data,status=200
  if(path==='/v1/accounts/firestore')data={id:uid,email:'isolated@example.invalid',name:'Isolated QA'}
  else if(path==='/v1/corporations/me')data={id:corporation,accountId:uid,name:'Isolated QA',createdAt:0,credits:1000}
  else if(path==='/v1/galaxy')data=galaxy
  else if(path==='/v1/fleets')data={fleets:[{...fleet,corporationId:corporation},{...fleet,name:undefined,id:'qa-fleet-0002',corporationId:corporation}],worldTime:1000,scale:1}
  else if(path==='/v1/systems/'+system)data=interior
  else if(path==='/v1/systems/'+system+'/station')data={systemId:system,featureId:'qa-station',createdAt:0}
  else if(path==='/v1/market/board')data={worldTime:1000,refreshCadenceMs:30000,venues:[]}
  else if(path.endsWith('/survey'))data={range:100,durationMs:1000,worldTime:1000,scale:1,sensorBusy:false,inTransit:false,survey:null,targets:[]}
  else if(path.endsWith('/scan-targets'))data={fleetId,systemId:system,worldTime:1000,targets:[]}
  else if(path==='/v1/actions')data={actions:[]}
  else if(path==='/v1/sightings')data={sightings:[],nextCursor:null}
  else if(path.includes('/channels/'))return route.fulfill({contentType:'text/event-stream',body:': fixture\n\n'})
  else{status=404;data={error:'QA fixture missing'}}
  return route.fulfill({status,json:data})
 })

 async function signalPixels(card,scene){
  const layer=card.locator(':scope > [data-slot="hud-frame-lighting"]');assert.equal(await layer.count(),1)
  await layer.locator('canvas[data-renderer-ready="true"]').waitFor({timeout:30000})
  const path='/tmp/hexaverse-card-lighting-after/game-'+name+'-'+scene+'-'+size.width
  await card.screenshot({path:path+'.png'});await layer.evaluate(element=>element.style.display='none')
  await card.screenshot({path:path+'-static.png'});await layer.evaluate(element=>element.style.display='')
  console.log(name,scene,size.width,'one visible signal owner, original chrome, reduced-motion static paired highlights')
 }

 const phone=size.width!==1280
 const nav=()=>p.getByRole('navigation',{name:'HUD panels',exact:true})
 async function openPanel(label){
   if(phone)await nav().getByRole('button',{name:label,exact:true}).click()
   else await p.getByRole('button',{name:label,exact:true}).click()
   await p.locator('[data-panel="'+label.toLowerCase()+'"]').waitFor({state:'visible'})
 }
 async function checkPhone(){
  if(!phone)return
  const sheet=await p.getByTestId('hud-workspace').boundingBox()
  assert.ok(Math.abs(sheet.height-size.height)<2&&Math.abs(sheet.y)<2,JSON.stringify(sheet))
  assert.equal(await nav().count(),1)
  const canvas=p.getByTestId('galaxy-graph')
  assert.ok(await canvas.evaluate(e=>!!e.closest('[inert]')))
 }
 await p.goto(origin+'/');await p.getByRole('heading',{name:'Start Area',exact:true}).first().waitFor()
 await p.locator('[data-testid="galaxy-graph"] canvas[data-renderer-ready="true"], [data-testid="space-canvas"][data-renderer-ready="true"]').waitFor({timeout:35000})
 assert.equal(reads.length,0,'Guest makes no authenticated reads')
 assert.ok(await p.getByRole('link',{name:'Sign in',exact:true}).first().isVisible())
 await openPanel('Objects');await checkPhone()
 let search=p.getByRole('searchbox',{name:'Find a galaxy system'})
 assert.equal(await search.evaluate(e=>e===document.activeElement),false)
 await search.fill('Survey 44');assert.equal(await p.locator('[data-testid^="galaxy-object-"]:visible').count(),1)
 await search.fill('');assert.equal(await p.locator('[data-testid^="galaxy-object-"]:visible').count(),45)
 const card=p.locator('[data-panel="objects"] > [data-slot="hud-card"]');await assertOriginalChrome(card)
 if(!phone){
  const title=await p.getByRole('heading',{name:'Start Area',exact:true}).first().boundingBox(),launcher=await p.getByRole('button',{name:'Objects',exact:true}).boundingBox()
  assert.ok(launcher.y>=title.y+title.height,'Desktop heading and launchers have separate bands')
 }
 const scroller=card.locator('[data-slot="hud-content"]').first(),before=await p.getByTestId('galaxy-search-header').boundingBox()
 await scroller.evaluate(e=>e.scrollTop=300)
 const after=await p.getByTestId('galaxy-search-header').boundingBox();assert.ok(Math.abs(after.y-before.y)<2,'Pinned galaxy search')
 await signalPixels(card,'galaxy')
 await p.screenshot({path:out+'/'+name+'-guest-'+size.width+'.png'})
 await p.goto(origin+'/login');await p.getByTestId('login-email').waitFor()
 assert.ok(await p.getByTestId('login-email').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=16)||!phone)
 await p.getByTestId('login-email').fill('isolated@example.invalid');await p.getByTestId('login-password').fill('synthetic-not-a-credential');await p.getByTestId('login-submit').click()
 await p.waitForURL(origin+'/');await p.getByRole('heading',{name:'Live Galaxy',exact:true}).first().waitFor()
 await p.locator('[data-testid="galaxy-graph"] canvas[data-renderer-ready="true"], [data-testid="space-canvas"][data-renderer-ready="true"]').waitFor({timeout:35000})
 await p.evaluate(({corp,fleetId,system})=>localStorage.setItem('hexaverse:command-guide:v1:'+corp,JSON.stringify({version:3,corporationId:corp,fleetId,systemId:system,phase:'dismissed',scanActionId:null,stationId:null,targetId:null,acceptedAt:null,mineActionId:null,resource:null,cargoBefore:0})),{corp,fleetId,system})
 assert.equal(await p.getByTestId('floating-nav').count(),0)
 assert.equal(await p.getByRole('link',{name:'Leave system for galaxy'}).count(),0)
 assert.equal(await p.getByRole('button',{name:/^Enter selected system/}).count(),0)
 assert.equal(await p.getByTestId('vitals-fleet-chevron').count(),0)
 assert.equal(await p.getByTestId('vitals-details-toggle').count(),0)
 assert.equal(await p.getByTestId('sign-out-button').count(),0)
 if(phone){
  const identity=await p.getByRole('heading',{name:'Live Galaxy',exact:true}).first().boundingBox(),navigation=await nav().boundingBox()
  assert.ok(identity.y+identity.height<=navigation.y,'Title and five-target navigation have separate rows')
 }
 await p.screenshot({path:out+'/'+name+'-map-'+size.width+'.png'})
 await openPanel('Command')
 const selected=p.getByTestId('fleet-row-'+fleetId),other=p.getByTestId('fleet-row-qa-fleet-0002')
 assert.equal(await selected.getAttribute('aria-pressed'),'true')
 assert.ok((await selected.textContent()).includes('Peregrine'))
 assert.ok((await other.textContent()).includes('Fleet eet-0002'))
 assert.ok(await selected.getByText('Selected command fleet',{exact:true}).isVisible())
 assert.ok((await other.boundingBox()).height>=44)
 await other.click();assert.equal(await other.getAttribute('aria-pressed'),'true');assert.equal(await selected.getAttribute('aria-pressed'),'false')
 assert.equal(await p.getByTestId('vitals-fleet-chevron').count(),0)
 assert.ok(await p.locator('[data-panel="command"] [data-testid="vitals-strip"]').isVisible())
 await p.screenshot({path:out+'/'+name+'-command-'+size.width+'.png'})
 if(phone)await nav().getByRole('button',{name:'Arrange HUD'}).click()
 else await p.getByRole('button',{name:'Arrange HUD',exact:true}).click()
 const account=p.getByRole('region',{name:'Account settings'}),signout=account.getByRole('button',{name:'Sign out',exact:true})
 await signout.scrollIntoViewIfNeeded();assert.ok(await signout.isVisible());assert.ok((await signout.boundingBox()).height>=(phone?44:28))
 assert.ok(await account.getByText('isolated@example.invalid',{exact:true}).isVisible())
 // Wiring is exercised with a spy in unit tests; browser QA never activates sign out.
 await p.screenshot({path:out+'/'+name+'-settings-'+size.width+'.png'})
 if(phone)await nav().getByRole('button',{name:'Objects',exact:true}).click()
 else await p.getByRole('button',{name:'Close HUD settings',exact:true}).click()
 await openPanel('Objects');await checkPhone()
 search=p.getByRole('searchbox',{name:'Find a galaxy system'})
 if(await p.getByRole('button',{name:'Back to galaxy systems'}).isVisible())await p.getByRole('button',{name:'Back to galaxy systems'}).click()
 await search.fill('QA System');await p.getByTestId('galaxy-object-'+system).click()
 assert.equal(await p.getByTestId('inspector-name').textContent(),'QA System')
 const enter=nav().getByRole('button',{name:'Enter selected system: QA System',exact:true});assert.ok(await enter.isVisible());assert.ok((await enter.boundingBox()).height>=44)
 assert.equal(await p.getByTestId('enter-system-button').count(),0)
 await p.screenshot({path:out+'/'+name+'-selected-enter-'+size.width+'.png'})
 assert.equal(await p.getByRole('button',{name:'Back to galaxy systems'}).evaluate(e=>e===document.activeElement),true)
 await p.getByRole('button',{name:'Back to galaxy systems'}).click();assert.equal(await search.inputValue(),'QA System')
 if(phone){
  await nav().getByRole('button',{name:'Command',exact:true}).click()
  assert.equal(await p.getByRole('dialog',{name:'Command panel',exact:true}).count(),1)
  await nav().getByRole('button',{name:'Console',exact:true}).click();await nav().getByRole('button',{name:'Objects',exact:true}).click()
 }else{
  await p.getByRole('button',{name:'Hide Objects'}).click();await p.getByRole('button',{name:'Objects (hidden)',exact:true}).click()
 }
 assert.equal(await search.inputValue(),'QA System')
 assert.equal(await p.evaluate(()=>document.activeElement?.tagName==='INPUT'),false,'Handoffs do not focus an input')
 await p.getByTestId('galaxy-object-'+system).click();await nav().getByRole('button',{name:'Enter selected system: QA System',exact:true}).click()
 await p.getByTestId('space-view').waitFor();await p.getByTestId('hud-workspace').waitFor()
 const leave=nav().getByRole('link',{name:'Leave system for galaxy',exact:true});await leave.waitFor();assert.equal(await leave.getAttribute('href'),'/');assert.ok((await leave.boundingBox()).height>=44)
 assert.equal(await leave.evaluate(e=>getComputedStyle(e).color),'rgb(177, 237, 255)','Leave icon shares the readable HUD control tint')
 assert.equal(await p.getByTestId('floating-nav').count(),0)
 assert.ok((await p.getByTestId('vitals-command-status').textContent()).includes('qa-station'),'Resolved host status is preserved in Command telemetry')
 await openPanel('Objects')
 await assertOriginalChrome(p.locator('[data-panel="objects"] > [data-slot="hud-card"]'))
 await signalPixels(p.locator('[data-panel="objects"] > [data-slot="hud-card"]'),'system')
 await p.screenshot({path:out+'/'+name+'-system-'+size.width+'.png'})
 if(phone)await p.getByRole('button',{name:'Close Objects panel'}).click()
 await nav().getByRole('link',{name:'Leave system for galaxy',exact:true}).click();await p.getByRole('heading',{name:'Live Galaxy',exact:true}).first().waitFor()
 assert.equal(await p.getByRole('button',{name:/^Enter selected system/}).count(),0)
 await openPanel('Objects');await search.fill('QA System')
 if(phone)await nav().getByRole('button',{name:'Arrange HUD'}).click()
 else await p.getByRole('button',{name:'Arrange HUD',exact:true}).click()
 await p.getByRole('button',{name:'Move Objects to right',exact:true}).click()
 const preferences=await p.evaluate(corp=>localStorage.getItem('hexaverse:hud-layout:v1:'+corp),corp)
 assert.ok(JSON.parse(preferences).some(e=>e.id==='objects'&&e.lane==='right'))
 assert.equal(await p.evaluate(()=>localStorage.getItem('hexaverse:hud-layout:v1:guest')),null)
 await p.reload();await p.getByTestId('hud-workspace').waitFor()
 await p.waitForFunction(()=>document.querySelector('[data-panel="objects"]')?.getAttribute('data-lane')==='right')
 await p.goto(origin+'/systems/'+system);await p.getByTestId('space-view').waitFor();await p.getByTestId('hud-workspace').waitFor()
 await p.waitForFunction(()=>document.querySelector('[data-panel="objects"]')?.getAttribute('data-lane')==='right')
 corporation=corp+'-two';await p.reload();await p.getByTestId('hud-workspace').waitFor()
 // The second corporation may own a fresh guide; its layout still starts at defaults.
 assert.equal(await p.locator('[data-panel="objects"]').getAttribute('data-lane'),'left','Corporations remain isolated')
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[])
 assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow')
 console.log(name,size.width,'grouped-enter-leave-icons/no-footer/served-names/legacy-fallback/Command-selection/guest-auth/retained-state/Storybook-chrome PASS; no game writes or sign-out activation')
 // Keep synthetic interception installed until the context closes: removing it
 // first can let late Next prefetches reach the outer OAuth gate as script HTML.
 closing=true;await context.close()
 }
 }finally{await browser.close()}
}
;(async()=>{if(process.env.QA_ENGINE!=='webkit')await run(chromium,{},'Chromium');if(process.env.QA_ENGINE!=='chromium')await run(webkit,{executablePath:'/Users/travis/Library/Caches/ms-playwright/webkit-2182/pw_run.sh'},'WebKit')})().catch(e=>{console.error(e);process.exitCode=1})
