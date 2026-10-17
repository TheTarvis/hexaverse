// Production-layout callbacks, with the touch-pointer stream deliberately absent.
const assert=require('node:assert/strict')
const {chromium,webkit}=require('../../frontend/node_modules/playwright')
const fs=require('node:fs')
const url=process.env.INPUT_QA_URL||'http://127.0.0.1:20215/login/touch-qa'
const output='/tmp/hexaverse-native-input-qa';fs.mkdirSync(output,{recursive:true})
async function checks(type,options,name){
 const b=await type.launch({headless:true,...options})
 try{
 const c=await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const p=await c.newPage()
 await p.addInitScript(()=>{for(const type of['pointerdown','pointermove','pointerup','pointercancel'])document.addEventListener(type,event=>{if(event.pointerType==='touch')event.stopImmediatePropagation()},true)})
 await p.goto(url);await p.getByTestId('space-camera-controls').waitFor()
 const region=p.getByTestId('space-canvas-region'),view=p.getByTestId('space-view'),camera=async()=>JSON.parse(await region.getAttribute('data-camera'))
 assert.equal(await p.evaluate(()=>document.documentElement.getAttribute('data-system-scroll-lock')),'system-viewport-layout-only-v2')
 const count=Number(await view.getAttribute('data-map-selections'));await p.touchscreen.tap(190,310);assert.equal(Number(await view.getAttribute('data-map-selections')),count+1)
 const fleet=p.getByTestId('fleet-mark-touch-fleet');await fleet.tap();assert.equal(await view.getAttribute('data-map-fleet-activations'),'1')
 console.log(name,'PASS trusted native map/fleet touch callbacks exactly once with all touch-pointer events blocked')
 const before=await camera();await p.getByTestId('camera-zoom-in').tap();assert.ok((await camera()).distance<before.distance);await p.getByTestId('camera-zoom-out').tap();await p.getByTestId('camera-recenter').tap()
 await p.getByRole('button',{name:'Pan controls',exact:true}).tap();const pan=await camera();await p.getByRole('button',{name:'Pan right',exact:true}).tap();assert.notDeepEqual((await camera()).target,pan.target);await p.getByRole('button',{name:'Pan controls',exact:true}).tap();await p.getByTestId('camera-recenter').tap();assert.deepEqual((await camera()).target,{x:0,y:0,z:0})
 console.log(name,'PASS trusted zoom-in/out, pan, recenter callbacks change camera')
 for(const size of[{width:390,height:844},{width:844,height:390},{width:390,height:600}]){
  await p.setViewportSize(size)
  await p.getByRole('button',{name:'HUD menu',exact:true}).tap();assert.equal(await p.getByRole('button',{name:'HUD menu',exact:true}).getAttribute('aria-expanded'),'true')
  await p.getByRole('button',{name:'Objects',exact:true}).tap();assert.equal(await p.getByRole('dialog',{name:'Objects panel',exact:true}).count(),1);await p.getByRole('button',{name:'Close Objects panel',exact:true}).tap();assert.equal(await p.getByRole('dialog').count(),0)
  await p.getByRole('button',{name:'HUD menu',exact:true}).tap();await p.getByRole('button',{name:'Command',exact:true}).tap();await p.getByRole('button',{name:'Review course',exact:true}).tap();await p.getByTestId('travel-start').tap();assert.ok((await p.getByTestId('fixture-command-counts').innerText()).includes('starts 1'));await p.getByTestId('travel-stop').tap();assert.ok((await p.getByTestId('fixture-command-counts').innerText()).includes('stops 1'));await p.getByRole('button',{name:'Close Command panel',exact:true}).tap()
  await p.getByRole('button',{name:'HUD menu',exact:true}).tap();await p.getByRole('button',{name:'Console',exact:true}).tap();await p.getByLabel('Console draft').fill('retained callback draft')
  const panel=p.locator('section[data-panel="console"] > div').nth(1);await panel.evaluate(e=>{const spacer=document.createElement('div');spacer.style.flex='0 0 1600px';spacer.style.height='1600px';e.append(spacer)})
  if(type===chromium&&size.height===844){const session=await c.newCDPSession(p);for(const[type,points]of[['touchStart',[{id:1,x:190,y:500}]],['touchMove',[{id:1,x:190,y:400}]],['touchMove',[{id:1,x:190,y:300}]],['touchEnd',[]]])await session.send('Input.dispatchTouchEvent',{type,touchPoints:points});await p.waitForFunction(()=>document.querySelector('section[data-panel="console"] > div:nth-child(2)').scrollTop>0)}
  await panel.evaluate(e=>{e.scrollTop=60});assert.ok(await panel.evaluate(e=>e.scrollTop)>0)
  await p.getByRole('button',{name:'Close Console panel',exact:true}).tap();assert.equal(await p.getByRole('dialog').count(),0);assert.equal(await region.evaluate(e=>!!e.closest('[inert]')),false)
  await p.getByRole('button',{name:'HUD menu',exact:true}).tap();await p.getByRole('button',{name:'Arrange HUD',exact:true}).tap();await p.getByRole('button',{name:'Close HUD settings',exact:true}).tap();assert.equal(await p.getByRole('dialog').count(),0)
  console.log(name,'PASS trusted HUD/menu/open/close/travel fixture/settings callbacks, card scroll and no inert leak',size)
  // Reset fixture-only travel state for another orientation without live mutations.
  await p.reload();await p.getByTestId('space-camera-controls').waitFor()
 }
 const native=await p.evaluate(()=>{
  const host=document.querySelector('[data-testid="space-canvas-region"]'),target=host.querySelector('canvas');let last=[]
  const emit=(type,points)=>{const touches=points.map(([x,y],identifier)=>({identifier,target,clientX:x,clientY:y}));let e;try{e=new TouchEvent(type,{bubbles:true,cancelable:true})}catch{e=document.createEvent('TouchEvent');e.initEvent(type,true,true)}Object.defineProperty(e,'touches',{value:touches});Object.defineProperty(e,'changedTouches',{value:touches.length?touches:last});target.dispatchEvent(e);if(touches.length)last=touches;return e.defaultPrevented}
  const read=()=>JSON.parse(host.dataset.camera);const before=read();const startCancelled=emit('touchstart',[[190,300]]);emit('touchmove',[[240,340]]);emit('touchend',[]);const afterPan=read();emit('touchstart',[[120,300]]);emit('touchstart',[[120,300],[240,300]]);emit('touchmove',[[90,300],[270,300]]);emit('touchend',[]);return{before,afterPan,afterPinch:read(),startCancelled}
 })
 // React commits native listener state updates after dispatch returns.
 await p.waitForFunction(before=>JSON.parse(document.querySelector('[data-testid="space-canvas-region"]').dataset.camera).distance<before.distance,native.before)
 assert.equal(native.startCancelled,false)
 // Separate pan event/commit from pinch to assert camera callback state, not flags.
 await p.getByTestId('camera-recenter').tap();const panBefore=await camera()
 await p.evaluate(()=>{const host=document.querySelector('[data-testid="space-canvas-region"]'),target=host.querySelector('canvas');for(const[type,points]of[['touchstart',[[180,300]]],['touchmove',[[230,340]]],['touchend',[]]]){let e;try{e=new TouchEvent(type,{bubbles:true,cancelable:true})}catch{e=document.createEvent('TouchEvent');e.initEvent(type,true,true)}const ts=points.map(([x,y],identifier)=>({identifier,target,clientX:x,clientY:y}));Object.defineProperty(e,'touches',{value:ts});Object.defineProperty(e,'changedTouches',{value:ts.length?ts:[{identifier:0,target,clientX:230,clientY:340}]});target.dispatchEvent(e)}})
 await p.waitForFunction(before=>JSON.stringify(JSON.parse(document.querySelector('[data-testid="space-canvas-region"]').dataset.camera).target)!==JSON.stringify(before.target),panBefore)
 console.log(name,'PASS TouchEvent-only pan/pinch callbacks change camera without pointer events or touchstart cancellation; constructed multi-touch fixture')
 if(type===chromium){const session=await c.newCDPSession(p);await p.getByTestId('camera-recenter').tap();const before=await camera();for(const[type,points]of[['touchStart',[{id:1,x:180,y:300}]],['touchMove',[{id:1,x:240,y:350}]],['touchEnd',[]]])await session.send('Input.dispatchTouchEvent',{type,touchPoints:points});assert.notDeepEqual((await camera()).target,before.target);const pinch=await camera();for(const[type,points]of[['touchStart',[{id:1,x:120,y:300},{id:2,x:240,y:300}]],['touchMove',[{id:1,x:90,y:300},{id:2,x:270,y:300}]],['touchEnd',[]]])await session.send('Input.dispatchTouchEvent',{type,touchPoints:points});assert.ok((await camera()).distance<pinch.distance);console.log(name,'PASS trusted native pan/pinch callbacks with touch-pointer stream blocked')}
 await p.screenshot({path:`${output}/${name.toLowerCase()}-production-map.png`})
 await p.getByTestId('exit-viewport-fixture').tap();await p.waitForURL('**/login');await p.waitForFunction(()=>!document.documentElement.hasAttribute('data-system-scroll-lock'));assert.equal(await p.evaluate(()=>document.body.style.position),'');console.log(name,'PASS actual Next route exit restores document layout')
 await c.close()
 }finally{await b.close()}
}
;(async()=>{await checks(chromium,{},'Chromium');await checks(webkit,{executablePath:'/Users/travis/Library/Caches/ms-playwright/webkit-2182/pw_run.sh'},'WebKit')})().catch(e=>{console.error(e);process.exitCode=1})
