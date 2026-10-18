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
if(process.env.QA_HUD_CASE==='mine'){
 fleet.attachedTo='qa-planet';fleet.position={X:20,Y:0,Z:8};fleet.state.Park={...fleet.state.Park,Kind:0,BodyId:'qa-planet',PeriodMs:60000};fleet.roster.stationKeepRateTonsPerSecond=.01
 interior.features[1].type='rocky';interior.features[1].resources=[{kind:'metals',richness:1}]
}
fleet.roster.fuelPricePerTon=2
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
async function compareOriginalStory(p,name,card,label){
 if(!process.env.QA_STORY_ORIGIN)return
 const reference=await p.context().newPage()
 try{
  await reference.goto(process.env.QA_STORY_ORIGIN+'/iframe.html?id=hud-card-shell--plain&viewMode=story&args=title:Objects')
  const shell=reference.locator('[data-hud-framing="frame"]');await shell.waitFor()
  const bounds=await card.boundingBox();await shell.evaluate((e,width)=>{e.style.width=width+'px';e.style.maxWidth='none';e.parentElement.style.padding='18px 12px'},bounds.width)
  await assertOriginalChrome(shell);await assertOriginalChrome(card)
  const clip=async locator=>{const box=await locator.boundingBox();return {x:Math.max(0,box.x-12),y:Math.max(0,box.y-18),width:Math.min(box.width+24,p.viewportSize().width),height:125}}
  const original=await reference.screenshot({clip:await clip(shell)}),actual=await p.screenshot({clip:await clip(card)})
  const width=Math.ceil(bounds.width+24),svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+(width*2+32)+'" height="170" viewBox="0 0 '+(width*2+32)+' 170"><rect width="100%" height="100%" fill="#08121d"/><g fill="#d5e7f1" font-family="system-ui,sans-serif" font-size="12"><text x="8" y="18">Original Storybook · 624c4ff chrome</text><text x="'+(width+24)+'" y="18">Actual app · '+label+'</text></g><image x="8" y="26" width="'+width+'" height="125" href="data:image/png;base64,'+original.toString('base64')+'"/><image x="'+(width+24)+'" y="26" width="'+width+'" height="125" href="data:image/png;base64,'+actual.toString('base64')+'"/></svg>'
  fs.writeFileSync(out+'/'+name.toLowerCase()+'-original-vs-app-'+label+'.svg',svg)
  fs.writeFileSync(__dirname+'/../../frontend/.storybook/storybook-static/qa-'+name.toLowerCase()+'-original-vs-app-'+label+'.svg',svg)
  console.log(name,'ORIGINAL STORY PARITY PASS',label,'frozen 624c4ff visual properties and side-by-side capture')
 }finally{await reference.close()}
}
async function checkMobileNavigation(p,name){
 const workspace=p.getByTestId('hud-workspace')
 const go=async label=>{await p.getByRole('navigation',{name:'HUD panels',exact:true}).getByRole('button',{name:label,exact:true}).tap()}
 const open=async()=>{await p.getByRole('button',{name:'Objects',exact:true}).tap()}
 for(const size of [{width:320,height:667},{width:375,height:667},{width:390,height:844},{width:844,height:390}]){
  await p.setViewportSize(size);await p.waitForTimeout(120)
  const nav=p.getByRole('navigation',{name:'HUD panels',exact:true});assert.equal(await nav.count(),1)
  const buttons=nav.getByRole('button');assert.equal(await buttons.count(),4)
  for(const button of await buttons.all()){const b=await button.boundingBox();assert.ok(b.width>=44&&b.height>=44);assert.equal(await button.getAttribute('aria-pressed'),'false');assert.ok(await button.getAttribute('aria-label'));assert.equal(await button.locator('svg[aria-hidden="true"]').count(),1);assert.equal(await button.getAttribute('aria-expanded'),null)}
  const b=await nav.boundingBox(),identity=await p.getByTestId('command-system-identity').boundingBox();assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=size.width&&b.y+b.height<=size.height)
  assert.ok(identity.x+identity.width<=b.x,'Identity reserves direct icon strip: '+JSON.stringify({identity,b}))
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  assert.equal(await p.evaluate(()=>!!document.elementFromPoint(innerWidth/2,innerHeight/2)?.closest('[data-testid="space-canvas-region"]')),true,'Map center stays unobstructed')
  await p.screenshot({path:out+'/'+name.toLowerCase()+'-direct-icons-map-'+size.width+'.png'})
 }
 const objectTrigger=p.getByRole('button',{name:'Objects',exact:true});await objectTrigger.focus();await objectTrigger.press('Enter');assert.equal(await p.getByRole('dialog',{name:'Objects panel',exact:true}).isVisible(),true)
 await p.getByRole('button',{name:'Close Objects panel',exact:true}).press('Escape');assert.equal(await p.getByRole('dialog').count(),0);assert.equal(await objectTrigger.evaluate(e=>e===document.activeElement),true)
 const consoleTrigger=p.getByRole('button',{name:'Console',exact:true});await consoleTrigger.focus();await consoleTrigger.press('Space');assert.equal(await p.getByRole('dialog',{name:'Console panel',exact:true}).isVisible(),true)
 await p.getByRole('button',{name:'Close Console panel',exact:true}).tap();assert.equal(await consoleTrigger.evaluate(e=>e===document.activeElement),true)
 await p.setViewportSize({width:390,height:844});await p.waitForTimeout(120)
 await open()
 const toggle=p.getByTestId('system-index-toggle');if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.tap()
 const search=p.getByTestId('system-index-search')
 console.log(name,'SEARCH COMPUTED FONT',await search.evaluate(e=>getComputedStyle(e).fontSize))
 if(process.env.QA_NAV_BASELINE==='1'){console.log(name,'TITLE BASELINE',await p.locator('[data-panel="objects"] > [data-slot="hud-card"]').evaluate(e=>{const c=e.getBoundingClientRect(),t=e.querySelector('[data-slot="hud-title"]').getBoundingClientRect();return {cardCenter:c.x+c.width/2,titleCenter:t.x+t.width/2,delta:t.x+t.width/2-c.x-c.width/2}}));await p.getByRole('button',{name:'Close Objects panel',exact:true}).tap();return}
 const fit=async()=>{
  const close=p.getByRole('dialog').locator('[data-slot="hud-card"] > [data-slot="hud-close"]:visible'),size=p.viewportSize(),card=close.locator('..')
  const g=await assertOriginalChrome(card)
  assert.ok(g.hit.x>=0&&g.hit.y>=0&&g.hit.right<=size.width&&g.hit.bottom<=size.height,'Invisible close target fits phone viewport: '+JSON.stringify(g.hit))
  const asymmetric=await card.evaluate(e=>{const title=e.querySelector(':scope > [data-slot="hud-title"]'),original=title.firstElementChild.textContent,back=document.createElement('button');back.textContent='Back';e.querySelector('[data-slot="hud-toolbar"]').append(back);title.firstElementChild.textContent='An exceptionally long object name';const c=e.getBoundingClientRect(),t=title.getBoundingClientRect(),x=e.querySelector(':scope > [data-slot="hud-close"]').getBoundingClientRect();const result={delta:t.x+t.width/2-c.x-c.width/2,overlap:t.right>x.left&&t.bottom>x.top};back.remove();title.firstElementChild.textContent=original;return result});assert.ok(Math.abs(asymmetric.delta)<1&&!asymmetric.overlap,'Original long title with independent Back/close: '+JSON.stringify(asymmetric))

  const nav=p.getByRole('navigation',{name:'HUD panels',exact:true});assert.equal(await nav.getByRole('button').count(),4)
  const n=await nav.boundingBox();assert.ok(n&&n.y>=0&&n.y+n.height<=size.height,'Navigation remains above content')
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
 }
 for(const size of [{width:375,height:667},{width:390,height:844},{width:844,height:390}]){
  await p.setViewportSize(size);await p.waitForTimeout(150)
  await search.fill('qa-planet');await search.focus()
  assert.ok(await search.evaluate(e=>parseFloat(getComputedStyle(e).fontSize))>=16)
  const scale=await p.evaluate(()=>visualViewport.scale)
  await p.screenshot({path:out+'/'+name.toLowerCase()+'-mobile-search-'+size.width+'.png'});if(size.width===375)await compareOriginalStory(p,name,p.locator('[data-panel="objects"] > [data-slot="hud-card"]'),'phone')
  // A reduced layout viewport models keyboard space; this does not reproduce
  // native iOS keyboard or Safari automatic focus magnification.
  await p.setViewportSize({...size,height:size.height>500?size.height-280:300});await p.waitForTimeout(120);await fit()
  for(const label of ['Arrange HUD','Command','Arrange HUD','Console','Arrange HUD','Objects']){
   await go(label);await fit()
   assert.equal(await p.getByRole('dialog').count(),1)
   assert.equal(await p.getByRole('navigation',{name:'HUD panels',exact:true}).getByRole('button',{name:label,exact:true}).getAttribute('aria-pressed'),'true')
   assert.equal(await p.evaluate(()=>document.activeElement?.tagName==='INPUT'),false,'No hidden search focus on tab handoff')
  }
  assert.equal(await search.inputValue(),'qa-planet')
  await p.setViewportSize(size);await p.waitForTimeout(120)
  await p.getByTestId('index-qa-planet').tap();assert.equal(await p.getByTestId('details-back').isVisible(),true);await fit()
  await go('Arrange HUD');await p.screenshot({path:out+'/'+name.toLowerCase()+'-mobile-arrange-'+size.width+'.png'})
  await go('Objects');assert.equal(await p.getByTestId('details-back').isVisible(),true)
  await p.getByTestId('details-back').tap();assert.equal(await search.inputValue(),'qa-planet')
  await search.focus();await search.evaluate(e=>e.blur());await fit();assert.equal(await p.evaluate(()=>visualViewport.scale),scale)
 }
 const expanded=p.getByRole('button',{name:'Close Objects panel',exact:true}).locator('span[aria-hidden="true"]'),hit=await expanded.boundingBox();await p.touchscreen.tap(hit.x+2,hit.y+hit.height/2)
 assert.equal(await p.getByRole('dialog').count(),0);assert.equal(await p.getByTestId('space-canvas-region').evaluate(e=>!!e.closest('[inert]')),false)
 await p.setViewportSize({width:390,height:844})
 console.log(name,'DIRECT ICON NAV PASS: 320/375/390 portrait and landscape, one labeled 44px icon strip, reserved identity space/unobstructed map, Enter/Space open and Escape/close restore launch focus, active states and no dropdown')
 console.log(name,'ORIGINAL CHROME PASS: frozen 624c4ff plaque/close/icon properties and corner geometry, independent Back, invisible 44px target edge tap dismisses')
 console.log(name,'MOBILE NAV PASS: four persistent tabs including Arrange; original 28px transparent close with invisible 44px target outside scrolling, >=16px computed form text, focus/blur/reduced keyboard space, details/back/search retained, callbacks and one sheet owner release; native iPhone focus zoom pending')
}
async function checkHudInspector(p,name){
 await p.getByTestId('vitals-fleet-chevron').tap();await p.getByTestId('vitals-fleet-inspect').tap()
 const dialog=p.getByRole('dialog',{name:'Fleet '+fleetId+' details',exact:true});assert.equal(await dialog.isVisible(),true)
 assert.equal(await p.getByTestId('fleet-inspector').getAttribute('data-hud-framing'),'frame')
 await p.waitForTimeout(1200);await p.screenshot({path:out+'/'+name.toLowerCase()+'-hud-fleet-inspector.png'})
 await p.getByTestId('fleet-inspector-close').tap();assert.equal(await p.getByRole('dialog').count(),0)
 assert.equal(await p.getByTestId('space-canvas-region').evaluate(e=>!!e.closest('[inert]')),false)
 console.log(name,'HUD INSPECTOR PASS: explicit shared frame, real preview, reachable dismissal and background interaction restored')
}
async function checkHudBaseline(p,name){
 const open=async label=>{await p.getByRole('button',{name:label,exact:true}).tap()}
 const panel=id=>p.locator('section[data-panel="'+id+'"]')
 const assertFrame=async id=>{const owner=panel(id);assert.equal(await owner.locator('[data-hud-framing="frame"]').count(),1);assert.ok(await owner.locator(':scope > [data-slot="hud-card"]').isVisible());return owner}
 await open('Command');const command=await assertFrame('command')
 if(process.env.QA_HUD_CASE==='mine'){
  assert.equal(await command.getByTestId('mine-section').isVisible(),true);assert.equal(await command.getByTestId('stationkeep-control').isVisible(),true)
  await command.getByTestId('mine-tons-input').fill('3')
  for(const id of ['mine-kind-select','mine-tons-input','mine-button','stationkeep-control']){const box=await command.getByTestId(id).boundingBox();assert.ok(box&&box.height>=44,'Phone action target: '+id);if(id.endsWith('input')||id.endsWith('select'))assert.ok(await command.getByTestId(id).evaluate(e=>parseFloat(getComputedStyle(e).fontSize))>=16,'Readable phone field: '+id)}
 }else assert.equal(await command.getByTestId('refuel-section').count(),0,'Station services belong to the station details')
 await p.screenshot({path:out+'/'+name.toLowerCase()+'-hud-command-'+(process.env.QA_HUD_CASE||'station')+'.png'})
 await p.getByRole('button',{name:'Objects',exact:true}).tap();await assertFrame('objects')
 const toggle=p.getByTestId('system-index-toggle');if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.tap()
 const search=p.getByTestId('system-index-search');await search.fill('qa-planet');await p.getByTestId('index-qa-planet').tap()
 assert.equal(await p.getByRole('heading',{name:'qa-planet',exact:true}).isVisible(),true)
 await p.screenshot({path:out+'/'+name.toLowerCase()+'-hud-details.png'})
 await p.getByTestId('details-back').tap();assert.equal(await search.inputValue(),'qa-planet')
 if(process.env.QA_HUD_CASE!=='mine'){
  await search.fill('qa-station');await p.getByTestId('index-qa-station').tap();await assertFrame('objects')
  assert.equal(await p.getByTestId('refuel-section').isVisible(),true);await p.getByTestId('refuel-tons-input').fill('2')
  await p.getByTestId('refuel-button').scrollIntoViewIfNeeded()
  await p.screenshot({path:out+'/'+name.toLowerCase()+'-hud-station-services.png'})
  await p.getByTestId('details-back').tap();await p.getByTestId('index-qa-station').tap();assert.equal(await p.getByTestId('refuel-tons-input').inputValue(),'2')
  await p.getByTestId('details-back').tap()
 }
 await p.getByRole('button',{name:'Command',exact:true}).tap();await assertFrame('command')
 if(process.env.QA_HUD_CASE==='mine')assert.equal(await command.getByTestId('mine-tons-input').inputValue(),'3')
 await p.getByTestId('travel-status-entry').tap();await assertFrame('command');assert.equal(await command.locator('[data-hud-framing="section"]').count()>0,true)
 await p.getByRole('button',{name:'Close travel card',exact:true}).tap()
 await p.getByRole('button',{name:'Console',exact:true}).tap();await assertFrame('console')
 await p.getByTestId('console-tab-log').tap();assert.equal(await p.getByTestId('sighting-log-empty').isVisible(),true)
 await p.screenshot({path:out+'/'+name.toLowerCase()+'-hud-console.png'})
 await p.getByRole('button',{name:'Arrange HUD',exact:true}).tap();assert.equal(await p.getByRole('dialog',{name:'Arrange HUD',exact:true}).isVisible(),true)
 await p.screenshot({path:out+'/'+name.toLowerCase()+'-hud-settings.png'})
 await p.getByRole('button',{name:'Close HUD settings',exact:true}).tap();assert.equal(await p.getByRole('dialog').count(),0)
 for(const size of [{width:375,height:667},{width:844,height:390}]){
  await p.setViewportSize(size);await open('Command');await assertFrame('command')
  const close=p.getByRole('button',{name:'Close Command panel',exact:true}),box=await close.boundingBox();assert.ok(box&&box.x>=0&&box.y>=0&&box.x+box.width<=size.width&&box.y+box.height<=size.height)
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  const scroll=command.locator(':scope > [data-slot="hud-card"] > [data-slot="hud-body"] > [data-slot="hud-content"]');await scroll.evaluate(e=>{e.scrollTop=e.scrollHeight});assert.equal(await close.isVisible(),true)
  await close.tap();assert.equal(await p.getByTestId('space-canvas-region').evaluate(e=>!!e.closest('[inert]')),false)
 }
 await p.setViewportSize({width:1280,height:900});await p.waitForTimeout(150)
 for(const id of ['objects','command','console']){const owner=await assertFrame(id);await assertOriginalChrome(owner.locator(':scope > [data-slot="hud-card"]'))}
 await compareOriginalStory(p,name,p.locator('[data-panel="objects"] > [data-slot="hud-card"]'),'desktop')
 const nav=await p.getByTestId('floating-nav').boundingBox(),consoleBox=await panel('console').boundingBox();assert.ok(nav&&consoleBox&&consoleBox.y+consoleBox.height<=nav.y,'Console frame must leave navigation reachable')
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
 await p.screenshot({path:out+'/'+name.toLowerCase()+'-hud-desktop.png'})
 const savedSearch=await search.inputValue();await p.getByRole('button',{name:'Hide Objects',exact:true}).click();assert.equal(await panel('objects').isVisible(),false);assert.equal(await panel('command').isVisible(),true)
 await p.getByRole('button',{name:'Objects (hidden)',exact:true}).click();await assertFrame('objects');assert.equal(await search.inputValue(),savedSearch)
 console.log(name,'DESKTOP CLOSE PASS: original transparent control hides only its panel; launcher restores mounted search')

 await p.setViewportSize({width:390,height:844});await p.waitForTimeout(150)
 console.log(name,'HUD BASELINE PASS: one shared frame per panel, Command/mining/travel sections, object facts/back/search, Console empty log, settings, retained input, narrow/landscape/desktop layout and reachable close, no stale inert')
}
async function checkOrbit(p,c,name){
 const region=p.getByTestId('space-canvas-region'),read=async()=>JSON.parse(await region.getAttribute('data-camera'))
 const session=name==='Chromium'?await c.newCDPSession(p):null
 let last=[]
 const emit=async(type,points)=>{
  if(session)await session.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y],id)=>({id,x,y}))})
  else await p.evaluate(({type,points,last})=>{
   const host=document.querySelector('[data-testid="space-canvas-region"]'),target=host.querySelector('canvas')
   const list=points.map(([clientX,clientY],identifier)=>({identifier,target,clientX,clientY}))
   const changed=(points.length?points:last).map(([clientX,clientY],identifier)=>({identifier,target,clientX,clientY}))
   const event=document.createEvent('Event');event.initEvent(type.toLowerCase(),true,true)
   Object.defineProperties(event,{touches:{value:list},changedTouches:{value:changed}});target.dispatchEvent(event)
  },{type,points,last})
  if(points.length)last=points
  await p.waitForTimeout(80)
 }
 const closeFingers=()=>emit('touchEnd',[])
 await p.getByTestId('body-hit-qa-planet').press('Enter')
 assert.equal(await region.getAttribute('data-selection'),'qa-planet')
 const before=await read()
 await emit('touchStart',[[130,350]])
 await emit('touchStart',[[130,350],[230,350]])
 assert.deepEqual(await read(),before,'Adding a finger must not reset the camera')
 await emit('touchMove',[[165,370],[265,370]])
 const rotated=await read();assert.notEqual(rotated.yaw,before.yaw);assert.notEqual(rotated.pitch,before.pitch);assert.equal(rotated.distance,before.distance)
 const eyeDistance=cam=>{const eye={x:cam.target.x+Math.cos(cam.pitch)*Math.sin(cam.yaw)*cam.distance,y:cam.target.y+Math.sin(cam.pitch)*cam.distance,z:cam.target.z+Math.cos(cam.pitch)*Math.cos(cam.yaw)*cam.distance};return Math.hypot(eye.x-20,eye.y,eye.z-8)}
 assert.ok(Math.abs(eyeDistance(before)-eyeDistance(rotated))<1e-6,'Eye must rotate around the selected planet')
 assert.equal(await region.getAttribute('data-selection'),'qa-planet')
 await emit('touchMove',[[165,370],[305,370]])
 const pinched=await read();assert.ok(pinched.distance<rotated.distance);assert.equal(pinched.yaw,rotated.yaw);assert.equal(pinched.pitch,rotated.pitch)
 // Chromium delivers the remaining contact on touchEnd; WebKit fixture does too.
 await emit('touchEnd',[[165,370]])
 await emit('touchMove',[[180,385]])
 assert.deepEqual(await read(),pinched,'Remaining finger cannot reset or select')
 await closeFingers()
 await emit('touchStart',[[160,350],[260,350]])
 await emit('touchCancel',[])
 const canceled=await read()
 await emit('touchStart',[[160,350]]);await emit('touchMove',[[190,370]]);await closeFingers()
 assert.equal((await read()).yaw,canceled.yaw);assert.notDeepEqual((await read()).target,canceled.target)
 for(const id of ['space-camera-controls','space-pan-controls','camera-touch-rotate','camera-zoom-in','camera-zoom-out','camera-recenter','select-pan-target-point'])assert.equal(await p.getByTestId(id).count(),0)
 await p.getByRole('button',{name:'Console',exact:true}).tap()
 const scroll=p.locator('section[data-panel="console"] > [data-slot="hud-card"] > [data-slot="hud-body"] > [data-slot="hud-content"]')
 await scroll.evaluate(e=>{const spacer=document.createElement('div');spacer.style.flex='0 0 1600px';spacer.style.height='1600px';e.append(spacer)})
 if(session){await emit('touchStart',[[190,500]]);await emit('touchMove',[[190,400]]);await emit('touchMove',[[190,300]]);await closeFingers();assert.ok(await scroll.evaluate(e=>e.scrollTop)>0)}
 else{await scroll.evaluate(e=>{e.scrollTop=80});assert.ok(await scroll.evaluate(e=>e.scrollTop)>0)}
 await p.getByRole('button',{name:'Close Console panel',exact:true}).tap()
 assert.equal(await region.evaluate(e=>!!e.closest('[inert]')),false)
 const postClose=await read();await emit('touchStart',[[160,350]]);await emit('touchMove',[[190,360]]);await closeFingers();assert.equal((await read()).yaw,postClose.yaw);assert.notDeepEqual((await read()).target,postClose.target)
 const postPan=await read();await emit('touchStart',[[130,350],[230,350]]);await emit('touchMove',[[160,365],[260,365]]);await closeFingers();assert.notEqual((await read()).yaw,postPan.yaw)
 // Toggle the selected planet off, then exercise the current camera target fallback.
 await p.getByTestId('body-hit-qa-planet').press('Enter');assert.equal(await region.getAttribute('data-selection'),'')
 const fallback=await read();await emit('touchStart',[[130,350],[230,350]]);await emit('touchMove',[[160,365],[260,365]]);await closeFingers()
 assert.notEqual((await read()).yaw,fallback.yaw);assert.deepEqual((await read()).target,fallback.target)
 console.log(name,'ORBIT PASS: selected pivot, pan/pinch/orbit transitions, cancel, no buttons, card scroll/close, no-selection fallback;',session?'browser-generated trusted one/two-finger touches':'constructed TouchLists for drags; native HUD taps; programmatic card scrolling')
 for(const viewport of [{width:390,height:844},{width:844,height:390},{width:390,height:600},{width:1280,height:900}]){
  await p.setViewportSize(viewport);await p.waitForTimeout(100)
  assert.equal(await p.locator('[data-testid="space-camera-controls"], [data-testid="space-pan-controls"], [data-testid="camera-touch-rotate"]').count(),0)
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
 }
 const desktop=await read();await p.mouse.move(600,350);await p.mouse.down();await p.mouse.move(650,375,{steps:5});await p.mouse.up();assert.notEqual((await read()).yaw,desktop.yaw)
 const orbitDesktop=await read();await p.mouse.down({button:'right'});await p.mouse.move(690,395,{steps:5});await p.mouse.up({button:'right'});assert.notDeepEqual((await read()).target,orbitDesktop.target)
 await region.focus();const keys=await read();await region.press('Shift+ArrowRight');assert.notDeepEqual((await read()).target,keys.target);await region.press('ArrowLeft');assert.notEqual((await read()).yaw,keys.yaw);await region.press('+');assert.ok((await read()).distance<keys.distance);await region.press('Home');assert.deepEqual((await read()).target,{x:0,y:0,z:0})
 console.log(name,'DESKTOP PASS: no buttons, mouse orbit/right-drag pan and keyboard orbit/pan/zoom/recenter; portrait/landscape/short/desktop layout has no camera cluster or horizontal overflow')
 await p.screenshot({path:out+'/'+name.toLowerCase()+'-gesture-desktop.png'});await p.setViewportSize({width:390,height:844})
 await p.screenshot({path:out+'/'+name.toLowerCase()+'-gesture-phone.png'})
}
async function run(type,options,name){
 const b=await type.launch({headless:true,...options});const errors=[],bad=[],requests=[],writes=[],fixtureWrites=[];let spawned=process.env.QA_FIRST_LOGIN!=='1'
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
 await p.route('**/api/**',async route=>{const u=new URL(route.request().url()),path=u.pathname.slice(4);requests.push(path);if((process.env.QA_ORBIT==='1'||process.env.QA_HUD_BASELINE==='1'||process.env.QA_MOBILE_NAV==='1')&&path.endsWith('/orders/preview')&&route.request().method()==='POST'){fixtureWrites.push(path);return route.fulfill({json:{controlPoints:[],departMs:1000,arriveMs:2000,deltaV:1,fuelCostTons:1,affordable:true,strandingWarning:false}})}if(process.env.QA_FIRST_LOGIN==='1'&&path==='/v1/corporations'&&route.request().method()==='POST'){spawned=true;fixtureWrites.push(path);return route.fulfill({json:{corporation:{id:corp,accountId:uid,name:'Isolated QA',createdAt:0,credits:1000},fleet,homeSystem:{id:system,name:'QA System',region:'normal',coords:{x:0,y:0,z:0},skeleton:{starClass:'G',bodies:[]}},worldTime:1000}})}if(route.request().method()!=='GET'){writes.push(path);return route.fulfill({status:403,json:{error:'Synthetic QA forbids mutations'}})}
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
 else if(path==='/v1/market/board')data={worldTime:1000,refreshCadenceMs:30000,venues:[]}
 else if(path==='/v1/actions')data={actions:[]}
 else if(path==='/v1/sightings')data={sightings:[],nextCursor:null}
 else if(path.includes('/channels/'))return route.fulfill({status:200,contentType:'text/event-stream',body:': fixture\n\n'})
 else{status=404;data={error:'QA fixture missing'}}
 return route.fulfill({status,json:data})})
 await p.goto(origin+'/login');await p.getByTestId('login-email').fill('isolated@example.invalid');await p.getByTestId('login-password').fill('synthetic-not-a-credential');await p.getByTestId('login-submit').tap()
 await p.waitForFunction(()=>!document.querySelector('[data-testid="login-submit"]'),{timeout:15000}).catch(()=>{})
 if(process.env.QA_FIRST_LOGIN==='1'){await p.goto(origin+'/systems/'+system);await p.getByTestId('wake-name-input').fill('Isolated QA');await p.getByTestId('wake-submit').tap();await p.waitForURL('**/systems/'+system);await p.getByTestId('begin-guide').waitFor();assert.equal(await p.getByTestId('recovery-transmission').getAttribute('data-phase'),'wake');await p.getByTestId('begin-guide').tap();assert.equal(await p.getByTestId('recovery-transmission').getAttribute('data-phase'),'objects');assert.equal(fixtureWrites.length,1)}
 if(process.env.QA_GUIDE_PHASE)await p.evaluate(({corp,fleetId,system,phase})=>localStorage.setItem('hexaverse:command-guide:v1:'+corp,JSON.stringify({version:3,corporationId:corp,fleetId,systemId:system,phase,scanActionId:null,stationId:null,targetId:null,acceptedAt:null,mineActionId:null,resource:null,cargoBefore:0})),{corp,fleetId,system,phase:process.env.QA_GUIDE_PHASE})
 if(process.env.QA_FIRST_LOGIN!=='1')await p.goto(origin+'/systems/'+system);await p.waitForTimeout(3000)
 const snapshot=await p.evaluate(()=>({url:location.pathname,title:document.title,text:document.body.innerText.slice(0,6000),dialogs:[...document.querySelectorAll('[role="dialog"]')].map(e=>({label:e.getAttribute('aria-label'),inert:!!e.closest('[inert]'),visibility:getComputedStyle(e).visibility,rect:e.getBoundingClientRect().toJSON()})),expandedTriggers:[...document.querySelectorAll('[data-testid="hud-workspace"] button[aria-expanded="true"]')].map(e=>({label:e.textContent,testid:e.getAttribute('data-testid'),panel:e.closest('[data-panel]')?.getAttribute('data-panel'),panelHidden:e.closest('[data-panel]')?.hasAttribute('hidden')})),inert:[...document.querySelectorAll('[inert]')].map(e=>({tag:e.tagName,id:e.getAttribute('data-testid'),class:e.className?.toString().slice(0,100)})),center:document.elementFromPoint(195,300)?.outerHTML.slice(0,350),shell:document.querySelector('[data-testid="space-view"]')?.getBoundingClientRect().toJSON()}))
 console.log(name,JSON.stringify({snapshot,errors,bad,requests,writes,fixtureWrites},null,2));
 if(process.env.QA_EXPECT_INTERACTIVE==='1'&&snapshot.dialogs.some(d=>d.label==='Recovery transmission')){
  const frame=await p.locator('[aria-label="Current objective"]').evaluate(e=>({height:e.getBoundingClientRect().height,decoration:parseFloat(getComputedStyle(e,'::before').height)}));assert.ok(frame.decoration<=frame.height+1,'Objective frame must not paint over recovery: '+JSON.stringify(frame))
 }
 await p.screenshot({path:out+'/'+name.toLowerCase()+'.png'})
 if(process.env.QA_EXPECT_INTERACTIVE==='1'){
  assert.equal(errors.length,0,'No browser runtime/resource errors expected under configured HTTPS origin')
  if(process.env.QA_GUIDE_PHASE||process.env.QA_FIRST_LOGIN==='1'){const dialog=p.getByRole('dialog',{name:'Recovery transmission',exact:true});assert.equal(await dialog.isVisible(),true);assert.ok(snapshot.dialogs.some(item=>item.label==='Recovery transmission'&&item.visibility==='visible'))}
 }
 if(process.env.QA_GUIDE_HANDOFF==='1'){
  await p.getByTestId('guide-objects').tap();assert.equal(await p.getByRole('dialog',{name:'Objects panel',exact:true}).isVisible(),true)
  await p.getByRole('button',{name:'Close Objects panel',exact:true}).tap()
  const resume=p.getByRole('button',{name:'Resume guide',exact:true}),r=await resume.boundingBox(),n=await p.getByRole('navigation',{name:'HUD panels',exact:true}).boundingBox(),o=await p.locator('[aria-label="Current objective"]').boundingBox()
  assert.ok(r&&n&&o&&r.y>=n.y+n.height&&o.y>=r.y+r.height,'Paused guide and icon strip own separate rows: '+JSON.stringify({r,n,o}))
  await p.getByRole('button',{name:'Console',exact:true}).tap();assert.equal(await p.getByRole('dialog',{name:'Console panel',exact:true}).isVisible(),true)
  await p.getByRole('button',{name:'Close Console panel',exact:true}).tap();await resume.tap()
  assert.equal(await p.getByRole('dialog',{name:'Recovery transmission',exact:true}).isVisible(),true)
  console.log(name,'GUIDE HANDOFF PASS: real guide opens Objects, icon Console roundtrip, resume row does not overlap icons/objective, modal isolation restores')
 }
 if(await p.getByTestId('dismiss-guide').count()){ await p.getByTestId('dismiss-guide').tap({timeout:4000}).then(()=>console.log(name,'dismiss fired')).catch(e=>console.log(name,'dismiss FAILED',e.message.split('\n')[0]))}
 if(process.env.QA_EXPECT_INTERACTIVE==='1'){
  assert.equal(await p.getByRole('button',{name:'HUD menu',exact:true}).count(),0)
  assert.equal(await p.getByRole('navigation',{name:'HUD panels',exact:true}).getByRole('button').count(),4)
  assert.equal(await p.getByTestId('space-canvas-region').evaluate(e=>!!e.closest('[inert]')),false)
  await p.getByRole('button',{name:'Console',exact:true}).tap();assert.equal(await p.getByRole('dialog',{name:'Console panel',exact:true}).isVisible(),true)
  await p.getByRole('button',{name:'Close Console panel',exact:true}).tap();assert.equal(await p.getByRole('dialog').count(),0)
  const region=p.getByTestId('space-canvas-region'),camera=JSON.parse(await region.getAttribute('data-camera'));await region.focus();await region.press('+');assert.ok(JSON.parse(await region.getAttribute('data-camera')).distance<camera.distance)
  if(process.env.QA_MOBILE_NAV==='1')await checkMobileNavigation(p,name)
  if(process.env.QA_HUD_BASELINE==='1')await checkHudBaseline(p,name)
  if(process.env.QA_HUD_INSPECTOR==='1')await checkHudInspector(p,name)
  if(process.env.QA_ORBIT==='1')await checkOrbit(p,c,name)
  assert.equal(errors.length,0,'No errors after interactions: '+JSON.stringify({errors,writes,requests}))
  console.log(name,'REAL DEPLOYED ROUTE regression PASS: guide visible/dismiss fires, background inert released, HUD/Console/close/zoom callbacks work, no JS errors, no game writes')
  assert.equal(writes.length,0)
 }
 console.log(name,'final errors',JSON.stringify(errors))
 await c.close()
 }finally{await b.close()}
}
;(async()=>{await run(chromium,{},'Chromium');await run(webkit,{executablePath:'/Users/travis/Library/Caches/ms-playwright/webkit-2182/pw_run.sh'},'WebKit')})().catch(e=>{console.error(e);process.exitCode=1})
