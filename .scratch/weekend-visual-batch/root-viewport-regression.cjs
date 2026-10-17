// Run against a temporary Next production QA route; remove that route before deploy.
const assert=require('node:assert/strict')
const {chromium,webkit}=require('../../frontend/node_modules/playwright')
const fs=require('node:fs')
const url=process.env.ROOT_QA_URL||'http://127.0.0.1:20215/login/touch-qa'
const output='/tmp/hexaverse-root-viewport-qa';fs.mkdirSync(output,{recursive:true})
async function check(type,options,name){
 const browser=await type.launch({headless:true,...options})
 try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const p=await context.newPage();await p.goto(url);await p.getByTestId('space-camera-controls').waitFor()
 const state=()=>p.evaluate(()=>({marker:document.documentElement.getAttribute('data-system-scroll-lock'),htmlOverflow:getComputedStyle(document.documentElement).overflow,bodyPosition:getComputedStyle(document.body).position,bodyOverflow:getComputedStyle(document.body).overflow,shell:document.querySelector('[data-system-viewport]').getBoundingClientRect().toJSON(),scroll:[scrollX,scrollY],viewport:{height:visualViewport.height,top:visualViewport.offsetTop,scale:visualViewport.scale}}))
 assert.equal((await state()).marker,'system-viewport-lock-v1')
 await p.getByTestId('toggle-document-baseline').tap()
 await p.waitForFunction(()=>!document.documentElement.hasAttribute('data-system-scroll-lock'))
 const hudDrag=()=>p.evaluate(()=>{
  const target=document.querySelector('[aria-label="HUD menu"]')
  const emit=(type,y)=>{let event;try{event=new TouchEvent(type,{bubbles:true,cancelable:true})}catch{event=document.createEvent('TouchEvent');event.initEvent(type,true,true)}Object.defineProperty(event,'touches',{value:type==='touchend'?[]:[{identifier:1,target,clientX:350,clientY:y}]});target.dispatchEvent(event);return event.defaultPrevented}
  return [emit('touchstart',30),emit('touchmove',110),emit('touchend',110)]
 })
 assert.deepEqual((await hudDrag()).slice(0,2),[false,false]);console.log(name,'BASELINE reproduced missing HUD-start cancellation in Next production layout; native Safari refresh UI not reproduced')
 await p.getByTestId('toggle-document-baseline').tap();await p.waitForFunction(()=>document.documentElement.hasAttribute('data-system-scroll-lock'))
 assert.deepEqual((await hudDrag()).slice(0,2),[false,true]);console.log(name,'PASS root/body locked; HUD tap preserved and first downward move cancelled')
 const starts=await p.evaluate(()=>{
  const selectors=['[data-testid="space-canvas"]','[data-testid^="space-annotation-"]','[data-testid="command-system-identity"]','[data-testid="vitals-fleet-id"]']
  return selectors.map(selector=>{const target=document.querySelector(selector);if(!target)throw new Error(selector);const event=new Event('touchstart',{bubbles:true,cancelable:true});Object.defineProperty(event,'touches',{value:[{identifier:1,target,clientX:180,clientY:310}]});target.dispatchEvent(event);const end=new Event('touchend',{bubbles:true,cancelable:true});Object.defineProperty(end,'touches',{value:[]});target.dispatchEvent(end);return {selector,cancelled:event.defaultPrevented}})
 });assert.ok(starts.every(item=>item.cancelled));console.log(name,'PASS document capture covers canvas/label/heading/fleet starts in production layout')
 const beforeTap=Number(await p.getByTestId('space-view').getAttribute('data-map-selections'));const label=await p.locator('[data-testid^="space-annotation-"]').first().boundingBox();assert.ok(label);await p.touchscreen.tap(label.x+label.width/2,label.y+label.height/2);assert.equal(Number(await p.getByTestId('space-view').getAttribute('data-map-selections')),beforeTap+1)

 if(type===chromium){const session=await context.newCDPSession(p);const start=await state();for(const [type,points]of [['touchStart',[{id:1,x:350,y:30}]],['touchMove',[{id:1,x:350,y:80}]],['touchMove',[{id:1,x:350,y:140}]],['touchEnd',[]]])await session.send('Input.dispatchTouchEvent',{type,touchPoints:points});assert.deepEqual((await state()).scroll,start.scroll);assert.equal((await state()).shell.top,0);assert.equal(await p.getByRole('button',{name:'HUD menu',exact:true}).getAttribute('aria-expanded'),'false');console.log(name,'PASS native HUD downward drag leaves document/shell fixed and does not click menu')}
 for(const size of [{width:375,height:667},{width:390,height:600},{width:844,height:390},{width:390,height:844}]){
  await p.setViewportSize(size);await p.waitForFunction(height=>Math.abs(document.querySelector('[data-system-viewport]').getBoundingClientRect().height-height)<1,size.height)
  let s=await state();assert.equal(s.bodyPosition,'fixed');assert.equal(s.htmlOverflow,'hidden');assert.equal(s.shell.top,0);assert.ok(s.shell.height<=s.viewport.height+1)
  for(const testid of ['camera-zoom-in','camera-zoom-out','camera-recenter']){const r=await p.getByTestId(testid).boundingBox();assert.ok(r.y>=0&&r.y+r.height<=s.viewport.height+1,JSON.stringify(r))}
  await p.getByRole('button',{name:'Pan controls',exact:true}).tap();await p.getByRole('button',{name:'Pan right',exact:true}).tap();await p.getByRole('button',{name:'Pan controls',exact:true}).tap()
  await p.getByRole('button',{name:'HUD menu',exact:true}).tap();await p.getByRole('button',{name:'Console',exact:true}).tap()
  const panel=p.locator('section[data-panel="console"] > div').nth(1);await panel.evaluate(e=>{const spacer=document.createElement('div');spacer.style.flex='0 0 1800px';spacer.style.height='1800px';spacer.textContent='Local production scroll fixture';e.append(spacer)})
  if(type===chromium&&size.height===844){const session=await context.newCDPSession(p);for(const[type,points]of [['touchStart',[{id:1,x:180,y:500}]],['touchMove',[{id:1,x:180,y:420}]],['touchMove',[{id:1,x:180,y:300}]],['touchEnd',[]]])await session.send('Input.dispatchTouchEvent',{type,touchPoints:points});await p.waitForFunction(()=>document.querySelector('section[data-panel="console"] > div:nth-child(2)').scrollTop>0)}
  await panel.evaluate(e=>{e.scrollTop=70});assert.ok(await panel.evaluate(e=>e.scrollTop)>0)
  await p.getByRole('button',{name:'Close Console panel',exact:true}).tap()
  await p.evaluate(()=>document.body.style.removeProperty('position'));await p.waitForFunction(()=>document.body.style.position==='fixed')
  assert.deepEqual((await hudDrag()).slice(0,2),[false,true]);assert.equal((await state()).marker,'system-viewport-lock-v1')
  assert.deepEqual((await state()).scroll,[0,0]);console.log(name,'PASS Next production cards/close/root ownership and visible fallback after resize',size)
 }
 await p.screenshot({path:`${output}/${name.toLowerCase()}-production-map.png`})
 await p.getByTestId('exit-viewport-fixture').tap();await p.waitForURL('**/login');await p.waitForFunction(()=>!document.documentElement.hasAttribute('data-system-scroll-lock'))
 assert.equal(await p.evaluate(()=>document.body.style.position),'');assert.equal(await p.evaluate(()=>document.documentElement.style.overflow),'');assert.equal(await p.evaluate(()=>document.documentElement.style.getPropertyValue('--system-viewport-height')),'')
 console.log(name,'PASS actual Next route exit removes document styles/listeners and restores normal login layout')
 await context.close()
 }finally{await browser.close()}
}
;(async()=>{await check(chromium,{},'Chromium');await check(webkit,{executablePath:'/Users/travis/Library/Caches/ms-playwright/webkit-2182/pw_run.sh'},'WebKit')})().catch(e=>{console.error(e);process.exitCode=1})
