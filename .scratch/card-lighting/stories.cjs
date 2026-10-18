const {chromium,webkit}=require('../../frontend/node_modules/playwright')
const fs=require('node:fs'),assert=require('node:assert/strict')
const out=process.env.QA_OUTPUT||'/tmp/hexaverse-card-lighting-before';fs.mkdirSync(out,{recursive:true})
;(async()=>{
for(const [name,type,options] of [['Chromium',chromium,{}],['WebKit',webkit,{executablePath:'/Users/travis/Library/Caches/ms-playwright/webkit-2182/pw_run.sh'}]]){
 const browser=await type.launch({headless:true,...options})
 try{for(const width of [390,1280]){
 const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:1,reducedMotion:'reduce'})
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message))
 const origin=process.env.QA_STORY_ORIGIN||'http://127.0.0.1:20203'
 if(origin.startsWith('https://'))await page.route(new URL(origin).origin+'/**',async route=>{
  const request=route.request(),url=new URL(request.url()),headers={...request.headers()};delete headers.host;delete headers.cookie;delete headers.authorization
  const response=await context.request.fetch('http://127.0.0.1:20204'+url.pathname+url.search,{headers})
  const hs={...response.headers()};for(const key of ['content-encoding','content-length','transfer-encoding','connection','set-cookie'])delete hs[key]
  await route.fulfill({status:response.status(),headers:hs,body:await response.body()})
 })

 for(const story of process.env.QA_EXPECT_SIGNAL==='1'?['plain','wide','static-frame']:['plain','wide']){
  await page.goto((process.env.QA_STORY_ORIGIN||'http://127.0.0.1:20203')+'/?path=/story/hud-card-shell--'+story)
  const frame=page.frameLocator('#storybook-preview-iframe');const card=frame.locator('[data-slot="hud-card"]').first();await card.waitFor()
  if(story==='wide'||process.env.QA_EXPECT_SIGNAL==='1'&&story!=='static-frame')await card.locator('canvas[data-renderer-ready="true"]').waitFor({timeout:30000})
  await page.waitForTimeout(400)
  const state=await card.evaluate(e=>({rect:{width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height},canvases:[...e.querySelectorAll('canvas')].map(c=>({backend:c.dataset.rendererBackend,ready:c.dataset.rendererReady})),clip:getComputedStyle(e).clipPath,overflow:getComputedStyle(e).overflow,opacity:getComputedStyle(e).opacity,title:getComputedStyle(e.querySelector('[data-slot="hud-title"]')).cssText,close:getComputedStyle(e.querySelector('[data-slot="hud-close"]')).width}))
  await card.screenshot({path:out+'/'+name+'-'+story+'-'+width+'.png'})
  if(process.env.QA_EXPECT_SIGNAL==='1'&&story!=='static-frame'){
   assert.equal(state.canvases.length,1)
   await card.locator('[data-slot="hud-frame-lighting"]').evaluate(layer=>layer.style.display='none')
   await card.screenshot({path:out+'/'+name+'-'+story+'-'+width+'-static.png'})
  }
  console.log(name,story,width,JSON.stringify(state))
 }
 assert.deepEqual(errors,[]);await context.close()
 }}finally{await browser.close()}
}
})().catch(e=>{console.error(e);process.exitCode=1})
