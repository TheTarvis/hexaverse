// Isolated native touch arbitration checks; never visits an authenticated app.
const assert = require('node:assert/strict')
const { chromium, webkit } = require('../../frontend/node_modules/playwright')
const fs = require('node:fs')
const url='http://127.0.0.1:20203/iframe.html?id=hud-mobile-system--touch-map&viewMode=story'
async function checks(type,options,name) {
 const browser=await type.launch({headless:true,...options})
 try {
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})
 const p=await context.newPage();await p.goto(url);await p.getByTestId('space-camera-controls').waitFor()
 await p.evaluate(()=>{
  document.addEventListener('touchstart',event=>{document.documentElement.dataset.lastTouch=JSON.stringify({prevented:event.defaultPrevented,trusted:event.isTrusted,cancelable:event.cancelable,target:event.target.getAttribute?.('data-testid')})})
 })
 const region=p.getByTestId('space-canvas-region')
 const before=await p.getByTestId('space-view').getAttribute('data-map-selections')
 await p.touchscreen.tap(190,310)
 assert.equal(Number(await p.getByTestId('space-view').getAttribute('data-map-selections')),Number(before)+1)
 const native=await p.evaluate(()=>JSON.parse(document.documentElement.dataset.lastTouch))
 assert.equal(native.trusted,true);assert.equal(native.prevented,true);assert.equal(native.cancelable,true)
 console.log(name,'PASS trusted map touchstart is synchronously cancelled and tap still selects',native)
 const chain=await region.evaluate(host=>{
  const targets=[host.querySelector('canvas'),host.querySelector('[data-body-id]'),host.querySelector('[data-testid^="space-annotation-"]')].filter(Boolean)
  return targets.map(target=>{const chain=[];for(let e=target;e;e=e.parentElement){const s=getComputedStyle(e);chain.push({tag:e.tagName,id:e.getAttribute('data-testid'),touch:s.touchAction,overflow:s.overflow,overscroll:s.overscrollBehavior})}return chain})
 });console.log(name,'map target/ancestor CSS',JSON.stringify(chain))
 const cancelled=await p.evaluate(()=>{
  const host=document.querySelector('[data-testid="space-canvas-region"]'), label=host.querySelector('[data-testid^="space-annotation-"]')||host
  const make=(type,points)=>{const touches=points.map(([x,y],identifier)=>({identifier,target:label,clientX:x,clientY:y,pageX:x,pageY:y,screenX:x,screenY:y}));let event;try{event=new TouchEvent(type,{bubbles:true,cancelable:true})}catch{event=document.createEvent('TouchEvent');event.initEvent(type,true,true)}for(const key of ['touches','targetTouches','changedTouches'])Object.defineProperty(event,key,{value:touches});label.dispatchEvent(event);return event.defaultPrevented}
  const result=[make('touchstart',[[170,310]]),make('touchmove',[[170,360]]),make('touchstart',[[130,310],[230,310]])]
  for(const type of ['gesturestart','gesturechange']){const event=new Event(type,{bubbles:true,cancelable:true});document.dispatchEvent(event);result.push(event.defaultPrevented)}
  result.push(make('touchmove',[[100,310],[260,310]]));make('touchend',[])
  const after=new Event('gesturestart',{cancelable:true});document.dispatchEvent(after);result.push(after.defaultPrevented)
  return result
 })
 assert.deepEqual(cancelled,[true,true,true,true,true,true,false]);console.log(name,'PASS TouchEvent/gesture default cancellation from map label, released after touchend (constructed events with fixture TouchLists)')
 const viewBefore=await p.evaluate(()=>({x:scrollX,y:scrollY,scale:visualViewport?.scale,offset:visualViewport?.offsetTop}))
 if(type===chromium){
   const session=await context.newCDPSession(p),point=(id,x,y)=>({id,x,y,radiusX:4,radiusY:4,force:1}),touch=(type,points)=>session.send('Input.dispatchTouchEvent',{type,touchPoints:points})
   const camera=async()=>JSON.parse(await region.getAttribute('data-camera'))
   const before=await camera();await touch('touchStart',[point(1,190,310)]);await touch('touchMove',[point(1,190,390)]);await touch('touchEnd',[]);assert.notDeepEqual((await camera()).target,before.target)
   const pinch=await camera();await touch('touchStart',[point(1,120,310),point(2,240,310)]);await touch('touchMove',[point(1,90,310),point(2,270,310)]);await touch('touchEnd',[]);assert.ok((await camera()).distance<pinch.distance)
   assert.deepEqual(await p.evaluate(()=>({x:scrollX,y:scrollY,scale:visualViewport?.scale,offset:visualViewport?.offsetTop})),viewBefore)
   console.log(name,'PASS browser-generated central downward pan and pinch change camera without page scroll/viewport zoom')
 }
 await p.getByRole('button',{name:'Pan controls',exact:true}).tap();const beforePan=JSON.parse(await region.getAttribute('data-camera'));await p.getByRole('button',{name:'Pan right',exact:true}).tap();assert.notDeepEqual(JSON.parse(await region.getAttribute('data-camera')).target,beforePan.target);await p.getByRole('button',{name:'Pan controls',exact:true}).tap()
 await p.getByRole('button',{name:'HUD menu',exact:true}).tap();await p.getByRole('button',{name:'Console',exact:true}).tap()
 const panel=p.locator('section[data-panel="console"] > div').nth(1)
 await panel.evaluate(e=>{const spacer=document.createElement('div');spacer.style.height='1800px';spacer.style.flex='0 0 1800px';spacer.textContent='Local scroll fixture';e.append(spacer)})
 if(type===chromium){const session=await context.newCDPSession(p);for(const [type,points]of [['touchStart',[{x:190,y:500,id:1}]],['touchMove',[{x:190,y:420,id:1}]],['touchMove',[{x:190,y:300,id:1}]],['touchEnd',[]]])await session.send('Input.dispatchTouchEvent',{type,touchPoints:points});await p.waitForFunction(()=>document.querySelector('section[data-panel="console"] > div:nth-child(2)').scrollTop>0);assert.ok(await panel.evaluate(e=>e.scrollTop)>0)}
 await p.touchscreen.tap(190,400);const cardTouch=await p.evaluate(()=>JSON.parse(document.documentElement.dataset.lastTouch));assert.equal(cardTouch.prevented,false)
 assert.equal(await panel.evaluate(e=>getComputedStyle(e).overflowY),'auto')
 assert.ok(await panel.evaluate(e=>{e.scrollTop=50;return e.scrollTop})>0)
 await p.getByRole('button',{name:'Close Console panel',exact:true}).tap()
 await p.touchscreen.tap(190,310);assert.equal(await p.evaluate(()=>JSON.parse(document.documentElement.dataset.lastTouch).prevented),true)
 assert.equal(await p.evaluate(()=>document.querySelector('meta[name="viewport"]').content.includes('user-scalable=no')),false)
 console.log(name,'PASS pan fallback, card touch unblocked/scrollable container, and map cancellation restored after close; page zoom meta unrestricted')
 await context.close()
 }finally{await browser.close()}
}
;(async()=>{await checks(chromium,{},'Chromium');const executablePath='/Users/travis/Library/Caches/ms-playwright/webkit-2182/pw_run.sh';assert.ok(fs.existsSync(executablePath));await checks(webkit,{executablePath},'WebKit')})().catch(e=>{console.error(e);process.exitCode=1})
