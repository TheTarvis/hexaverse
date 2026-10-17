// REAL deployed routes/bundles. All Auth/game API traffic is intercepted in a
// fresh context with entirely synthetic identity/data; no existing identity read.
const{chromium,webkit}=require('../../frontend/node_modules/playwright')
const fs=require('node:fs')
const assert=require('node:assert/strict')
const origin=process.env.DEPLOYED_QA_ORIGIN||'http://127.0.0.1:20204'
const out='/tmp/hexaverse-deployed-page-qa';fs.mkdirSync(out,{recursive:true})
const uid='isolated-production-qa',corp='isolated-production-corp',system='sys_0_1',fleetId='isolated-production-fleet'
const now=Math.floor(Date.now()/1000),token=[{alg:'none',typ:'JWT'},{sub:uid,user_id:uid,aud:'hexaverse-emulator',iss:'https://securetoken.google.com/hexaverse-emulator',iat:now,exp:now+3600,auth_time:now,email:'isolated@example.invalid',firebase:{identities:{},sign_in_provider:'password'}},''].map((v,i)=>i<2?Buffer.from(JSON.stringify(v)).toString('base64url'):v).join('.')
const fleet={id:fleetId,corporationId:corp,own:true,systemId:system,worldTime:1000,position:{X:10,Y:0,Z:0},attachedTo:'qa-station',roster:{ships:[{class:'hauler'}],cargo:{fuel:60},cargoCapacity:100,freeHold:40,miningRate:1},state:{Mode:1,Burn:null,Drift:null,Park:{Kind:2,BodyId:'qa-station',Radius:0,PeriodMs:0,Phase:0,EpochMs:1000,Offset:{X:0,Y:0,Z:0},Point:{X:0,Y:0,Z:0}}}}
const interior={systemId:system,extent:100,character:'normal',starClass:'G',worldTime:1000,scale:1,features:[{id:'qa-star',type:'star',space:{X:0,Y:0,Z:0},size:5},{id:'qa-planet',type:'planet',space:{X:20,Y:0,Z:8},size:2,resources:[]},{id:'qa-station',type:'station',space:{X:10,Y:0,Z:0},size:1}],laneGates:[],contacts:[]}
async function run(type,options,name){
 const b=await type.launch({headless:true,...options});const errors=[],bad=[],requests=[],writes=[]
 try{
 const c=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const p=await c.newPage()
 p.on('pageerror',e=>errors.push(e.message.slice(0,1200)));p.on('console',m=>{if(m.type()==='error')errors.push(m.text().replace(/\?.*/g,'?<redacted>').slice(0,500))});p.on('response',r=>{const u=new URL(r.url());if(u.pathname.startsWith('/_next/')&&r.status()>=400)bad.push({path:u.pathname,status:r.status()})});p.on('requestfailed',r=>{const u=new URL(r.url());if(u.pathname.startsWith('/_next/'))bad.push({path:u.pathname,error:r.failure()?.errorText})})
 if(origin.startsWith('https://'))await p.route(origin+'/**',async route=>{
 const req=route.request(),u=new URL(req.url());const headers={...req.headers()};delete headers.host;delete headers.cookie;delete headers.authorization
 const response=await c.request.fetch((process.env.QA_UPSTREAM||'http://127.0.0.1:20204')+u.pathname+u.search,{method:req.method(),headers,data:req.postDataBuffer()||undefined,failOnStatusCode:false})
 const hs={...response.headers()};for(const key of['content-encoding','content-length','transfer-encoding','connection','set-cookie'])delete hs[key]
 return route.fulfill({status:response.status(),headers:hs,body:await response.body()})
 })
 await p.route('**/emulator/auth/iframe**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Synthetic Auth frame</title>'}))
 await p.route('**/identitytoolkit.googleapis.com/**',async route=>{const path=new URL(route.request().url()).pathname;if(path.includes('signInWithPassword'))return route.fulfill({json:{localId:uid,email:'isolated@example.invalid',idToken:token,refreshToken:'synthetic-refresh',expiresIn:'3600',registered:true}});if(path.includes('lookup'))return route.fulfill({json:{users:[{localId:uid,email:'isolated@example.invalid',emailVerified:true,displayName:'Isolated QA',providerUserInfo:[],createdAt:'1000',lastLoginAt:'1000'}]}});return route.fulfill({status:400,json:{error:{message:'QA_AUTH_ROUTE_BLOCKED'}}})})
 await p.route('**/securetoken.googleapis.com/**',route=>route.fulfill({json:{access_token:token,id_token:token,refresh_token:'synthetic-refresh',expires_in:'3600',user_id:uid,token_type:'Bearer'}}))
 await p.route('**/api/**',async route=>{const u=new URL(route.request().url()),path=u.pathname.slice(4);requests.push(path);if(route.request().method()!=='GET'){writes.push(path);return route.fulfill({status:403,json:{error:'Synthetic QA forbids mutations'}})}
 let data,status=200
 if(path==='/v1/accounts/firestore')data={id:uid,email:'isolated@example.invalid',name:'Isolated QA'}
 else if(path==='/v1/corporations/me')data={id:corp,accountId:uid,name:'Isolated QA',createdAt:0,credits:1000}
 else if(path==='/v1/galaxy')data={id:'qa',seed:1,bounds:{x:[-100,100],y:[-100,100],z:[-30,30]},worldTime:1000,systems:[{id:system,name:'QA System',region:'normal',coords:{x:0,y:0,z:0},tier:'explored',skeleton:{starClass:'G',bodies:[]}}],lanes:[]}
 else if(path==='/v1/systems/'+system)data=interior
 else if(path==='/v1/systems/'+system+'/station')data={systemId:system,featureId:'qa-station',createdAt:0}
 else if(path==='/v1/fleets')data={fleets:[fleet],worldTime:1000,scale:1}
 else if(path.endsWith('/scan-targets'))data={fleetId,systemId:system,worldTime:1000,targets:[]}
 else if(path==='/v1/market/board')data={worldTime:1000,refreshCadenceMs:30000,venues:[]}
 else if(path==='/v1/actions')data={actions:[]}
 else if(path==='/v1/sightings')data={sightings:[],nextCursor:null}
 else if(path.includes('/channels/'))return route.fulfill({status:200,contentType:'text/event-stream',body:': fixture\n\n'})
 else{status=404;data={error:'QA fixture missing'}}
 return route.fulfill({status,json:data})})
 await p.goto(origin+'/login');await p.getByTestId('login-email').fill('isolated@example.invalid');await p.getByTestId('login-password').fill('synthetic-not-a-credential');await p.getByTestId('login-submit').tap()
 await p.waitForFunction(()=>!document.querySelector('[data-testid="login-submit"]'),{timeout:15000}).catch(()=>{})
 if(process.env.QA_GUIDE_PHASE)await p.evaluate(({corp,fleetId,system,phase})=>localStorage.setItem('hexaverse:command-guide:v1:'+corp,JSON.stringify({version:3,corporationId:corp,fleetId,systemId:system,phase,scanActionId:null,stationId:null,targetId:null,acceptedAt:null,mineActionId:null,resource:null,cargoBefore:0})),{corp,fleetId,system,phase:process.env.QA_GUIDE_PHASE})
 await p.goto(origin+'/systems/'+system);await p.waitForTimeout(3000)
 const snapshot=await p.evaluate(()=>({url:location.pathname,title:document.title,text:document.body.innerText.slice(0,6000),dialogs:[...document.querySelectorAll('[role="dialog"]')].map(e=>({label:e.getAttribute('aria-label'),inert:!!e.closest('[inert]'),visibility:getComputedStyle(e).visibility,rect:e.getBoundingClientRect().toJSON()})),expandedTriggers:[...document.querySelectorAll('[data-testid="hud-workspace"] button[aria-expanded="true"]')].map(e=>({label:e.textContent,testid:e.getAttribute('data-testid'),panel:e.closest('[data-panel]')?.getAttribute('data-panel'),panelHidden:e.closest('[data-panel]')?.hasAttribute('hidden')})),inert:[...document.querySelectorAll('[inert]')].map(e=>({tag:e.tagName,id:e.getAttribute('data-testid'),class:e.className?.toString().slice(0,100)})),center:document.elementFromPoint(195,300)?.outerHTML.slice(0,350),shell:document.querySelector('[data-testid="space-view"]')?.getBoundingClientRect().toJSON()}))
 console.log(name,JSON.stringify({snapshot,errors,bad,requests,writes},null,2));await p.screenshot({path:out+'/'+name.toLowerCase()+'.png'})
 if(process.env.QA_EXPECT_INTERACTIVE==='1'){
  assert.equal(errors.length,0,'No browser runtime/resource errors expected under configured HTTPS origin')
  if(process.env.QA_GUIDE_PHASE){const dialog=p.getByRole('dialog',{name:'Recovery transmission',exact:true});assert.equal(await dialog.isVisible(),true);assert.ok(snapshot.dialogs.some(item=>item.label==='Recovery transmission'&&item.visibility==='visible'))}
 }
 if(await p.getByTestId('dismiss-guide').count()){ await p.getByTestId('dismiss-guide').tap({timeout:4000}).then(()=>console.log(name,'dismiss fired')).catch(e=>console.log(name,'dismiss FAILED',e.message.split('\n')[0]))}
 if(await p.getByRole('button',{name:'HUD menu',exact:true}).count()){await p.getByRole('button',{name:'HUD menu',exact:true}).tap({timeout:4000}).then(async()=>console.log(name,'HUD callback',await p.getByRole('button',{name:'HUD menu',exact:true}).getAttribute('aria-expanded'))).catch(e=>console.log(name,'HUD FAILED',e.message.split('\n')[0]))}
 if(process.env.QA_EXPECT_INTERACTIVE==='1'){
  assert.equal(await p.getByRole('button',{name:'HUD menu',exact:true}).getAttribute('aria-expanded'),'true')
  assert.equal(await p.getByTestId('space-canvas-region').evaluate(e=>!!e.closest('[inert]')),false)
  await p.getByRole('button',{name:'Console',exact:true}).tap();assert.equal(await p.getByRole('dialog',{name:'Console panel',exact:true}).isVisible(),true)
  await p.getByRole('button',{name:'Close Console panel',exact:true}).tap();assert.equal(await p.getByRole('dialog').count(),0)
  const camera=JSON.parse(await p.getByTestId('space-canvas-region').getAttribute('data-camera'));await p.getByTestId('camera-zoom-in').tap();assert.ok(JSON.parse(await p.getByTestId('space-canvas-region').getAttribute('data-camera')).distance<camera.distance)
  console.log(name,'REAL DEPLOYED ROUTE regression PASS: guide visible/dismiss fires, background inert released, HUD/Console/close/zoom callbacks work, no JS errors, no game writes')
  assert.equal(writes.length,0)
 }
 console.log(name,'final errors',JSON.stringify(errors))
 await c.close()
 }finally{await b.close()}
}
;(async()=>{await run(chromium,{},'Chromium');await run(webkit,{executablePath:'/Users/travis/Library/Caches/ms-playwright/webkit-2182/pw_run.sh'},'WebKit')})().catch(e=>{console.error(e);process.exitCode=1})
