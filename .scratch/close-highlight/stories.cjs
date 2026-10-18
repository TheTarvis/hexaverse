const {chromium,webkit}=require('../../frontend/node_modules/playwright')
const fs=require('node:fs'),assert=require('node:assert/strict')
const out=process.env.QA_OUTPUT||'/tmp/hexaverse-close-after';fs.mkdirSync(out,{recursive:true})
const origin=process.env.QA_STORY_ORIGIN||'http://127.0.0.1:20203'
;(async()=>{
for(const [name,type,options] of [['Chromium',chromium,{}],['WebKit',webkit,{executablePath:'/Users/travis/Library/Caches/ms-playwright/webkit-2182/pw_run.sh'}]].filter(([name])=>!process.env.QA_ENGINE||name===process.env.QA_ENGINE)){
 const browser=await type.launch({headless:true,...options})
 try{for(const width of [390,1280].filter(width=>!process.env.QA_WIDTH||String(width)===process.env.QA_WIDTH)){
 const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'no-preference'})
 const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(20000)
 if(origin.startsWith('https://'))await p.route(new URL(origin).origin+'/**',async route=>{
  const req=route.request(),url=new URL(req.url()),headers={...req.headers()};delete headers.host;delete headers.cookie;delete headers.authorization
  const response=await context.request.fetch('http://127.0.0.1:20204'+url.pathname+url.search,{headers})
  const hs={...response.headers()};for(const k of ['content-encoding','content-length','transfer-encoding','connection','set-cookie'])delete hs[k]
  await route.fulfill({status:response.status(),headers:hs,body:await response.body()})
 })
 for(const story of ['plain','wide'].filter(story=>!process.env.QA_STORY||story===process.env.QA_STORY)){
  await p.goto(origin+'/?path=/story/hud-card-shell--'+story)
  const f=p.frameLocator('#storybook-preview-iframe'),card=f.locator('[data-slot="hud-card"]').first(),close=card.locator('[data-slot="hud-close"]'),layer=card.locator('[data-slot="hud-frame-lighting"]')
  await layer.locator('canvas[data-renderer-ready="true"]').waitFor({timeout:35000})
  for(const state of ['rest','hover','focus','active']){
   await close.evaluate(e=>e.blur());await p.mouse.move(0,0)
   if(state==='hover'||state==='active')await close.hover()
   if(state==='focus'){await close.focus();await p.keyboard.press('Shift')}
   if(state==='active')await p.mouse.down()
   const css=await close.evaluate(e=>{
    const pick=s=>({background:s.backgroundColor,image:s.backgroundImage,shadow:s.boxShadow,outline:s.outlineStyle,outlineWidth:s.outlineWidth,color:s.color,content:s.content})
    const target=e.querySelector('span[aria-hidden="true"]').getBoundingClientRect(),b=e.getBoundingClientRect()
    return {button:pick(getComputedStyle(e)),before:pick(getComputedStyle(e,'::before')),after:pick(getComputedStyle(e,'::after')),target:{width:target.width,height:target.height},buttonSize:{width:b.width,height:b.height},focused:e===document.activeElement,focusVisible:e.matches(':focus-visible')}
   })
   assert.equal(css.button.background,'rgba(0, 0, 0, 0)');assert.equal(css.button.image,'none');assert.equal(css.button.shadow,'none');assert.ok(css.target.width>=44&&css.target.height>=44);assert.deepEqual(css.buttonSize,{width:28,height:28})
   if(state==='focus'){assert.ok(css.focused&&css.focusVisible);assert.notEqual(css.button.outline,'none');assert.equal(css.button.outlineWidth,'2px')}
   for(const pseudo of [css.before,css.after])assert.ok(['none','normal'].includes(pseudo.content)||pseudo.background==='rgba(0, 0, 0, 0)')
   const box=await card.boundingBox(),viewport=p.viewportSize(),x=Math.max(0,box.x-16),y=Math.max(0,box.y-16)
   await p.screenshot({path:out+'/'+name+'-'+story+'-'+width+'-'+state+'.png',clip:{x,y,width:Math.min(viewport.width-x,box.width+32),height:Math.min(viewport.height-y,box.height+32)}})
   console.log(name,width,story,state,JSON.stringify(css))
   // Release outside the close control so this state audit never dismisses it.
   if(state==='active'){await p.mouse.move(0,0);await p.mouse.up()}
  }
  await close.evaluate(e=>e.blur());await p.mouse.move(0,0)
  for(let i=0;i<(process.env.QA_SAMPLE_CORNER==='1'?10:0);i++){
   await p.waitForTimeout(500)
   const stem=out+'/'+name+'-'+story+'-'+width+'-rim-'+i
   await card.screenshot({path:stem+'.png'})
   await layer.evaluate(e=>e.style.display='none');await card.screenshot({path:stem+'-static.png'});await layer.evaluate(e=>e.style.display='')
  }
 }
 assert.deepEqual(errors,[]);await context.close()
 }}finally{await browser.close()}
}
})().catch(e=>{console.error(e);process.exitCode=1})
