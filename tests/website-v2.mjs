import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile,stat,writeFile } from 'node:fs/promises';
import { resolve,extname } from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(new URL('..',import.meta.url).pathname),dist=resolve(root,'dist');
const errors=[],failed=[],sizes=[];
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.woff2':'font/woff2','.ico':'image/x-icon','.txt':'text/plain'};
const server=createServer(async(req,res)=>{try{let path=resolve(dist,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!path.startsWith(dist+'/')&&path!==dist)throw Error('Invalid path');if((await stat(path)).isDirectory())path=resolve(path,'index.html');const data=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]??'application/octet-stream'});res.end(data);}catch{res.writeHead(404);res.end('Not found');}});
await new Promise(r=>server.listen(4174,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.STOCKFLOW_CHROMIUM_PATH||undefined,args:['--no-sandbox','--single-process','--no-zygote','--disable-dev-shm-usage']});
const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push(r.url());});
try{
 await page.goto('http://127.0.0.1:4174/');assert.match(await page.title(),/StockFlow/);assert.equal(await page.locator('h1').count(),1);assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'),'https://stockflow.com.ng/');
 for(const width of [375,768,1440,1920]){await page.setViewportSize({width,height:width<500?900:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Overflow at ${width}`);sizes.push(width);}
 await page.setViewportSize({width:1440,height:1000});
 for(const image of await page.locator('img').all()){await image.scrollIntoViewIfNeeded();await image.evaluate(img=>img.decode());assert.ok(await image.evaluate(img=>img.naturalWidth>0));}
 const imageCount=await page.locator('img').count();assert.equal(imageCount,5);await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:resolve(root,'docs/v2/website-desktop.png')});
 await page.getByRole('link',{name:/Get Started/}).first().click();await page.waitForURL('**/workspace/register/');await page.getByRole('heading',{name:'Start with you.'}).waitFor();
 await page.goto('http://127.0.0.1:4174/');await page.setViewportSize({width:375,height:900});await page.getByRole('button',{name:'Open navigation'}).click();assert.equal(await page.getByRole('button',{name:'Close navigation'}).getAttribute('aria-expanded'),'true');await page.keyboard.press('Escape');assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'),'false');await page.screenshot({path:resolve(root,'docs/v2/website-mobile.png')});
 for(const role of ['owner','manager','rep']){const alias=await readFile(resolve(dist,role+'-dashboard.html'),'utf8');assert.ok(alias.includes('/workspace/home/')&&alias.includes("get('legacy')"));const legacy=await readFile(resolve(dist,role+'-dashboard-legacy.html'),'utf8');assert.ok(legacy.length>10000);}
 await page.goto('http://127.0.0.1:4174/login.html');await page.waitForURL('**/workspace/login/');await page.getByRole('heading',{name:'Welcome back'}).waitFor();assert.match(await page.locator('a').filter({hasText:'Start a free trial'}).getAttribute('href'),/\/workspace\/register\//);
 await page.getByRole('link',{name:'Start a free trial'}).click();await page.waitForURL('**/workspace/register/');await page.getByRole('heading',{name:'Start with you.'}).waitFor();await page.getByLabel('Your name').fill('Routing Fixture');await page.getByLabel('Email address').fill('route@fixture.example');await page.getByLabel('Password',{exact:true}).fill('fixture-only-password');await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('heading',{name:'Meet your business.'}).waitFor();await page.getByLabel('Business name').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Registration overflow at 375px');
 // Auth aliases forward email-link results to the workspace login, which reports them and strips tokens from the URL.
 await page.goto('http://127.0.0.1:4174/login.html#access_token=fixture&refresh_token=fixture&type=signup');await page.waitForURL('**/workspace/login/');await page.getByText('Your email is confirmed. Sign in to continue.').waitFor();assert.ok(!page.url().includes('access_token'),'tokens must not remain in the address bar');
 await page.goto('http://127.0.0.1:4174/login.html?expired=1');await page.waitForURL('**/workspace/login/');await page.getByText(/Your session expired/).waitFor();assert.ok(!page.url().includes('expired'));
 // Retained dashboards keep their own session, so signed-out visits stay among the retained pages instead of looping through the workspace.
 for(const entry of ['/owner-dashboard.html?legacy=1','/manager-dashboard-legacy.html','/rep-dashboard-legacy.html','/admin-dashboard.html']){await page.goto('http://127.0.0.1:4174'+entry);await page.waitForURL('**/login-legacy.html');await page.getByRole('heading',{name:'Sign in to your account'}).waitFor();}
 const legacyClient=await readFile(resolve(dist,'supabase-client.js'),'utf8');assert.ok(legacyClient.includes("'login-legacy.html'")&&!/['"]\/?login\.html/.test(legacyClient)&&legacyClient.includes("'owner-dashboard-legacy.html'"));
 for(const file of ['owner-dashboard-legacy.html','manager-dashboard-legacy.html','rep-dashboard-legacy.html','admin-dashboard.html']){const html=await readFile(resolve(dist,file),'utf8');assert.ok(!/\b(owner|manager|rep)-dashboard\.html/.test(html),file+' still targets a workspace alias');assert.ok(!/href=["']\/login\.html/.test(html),file+' still signs out to the workspace alias');}
 assert.match(await readFile(resolve(dist,'login-legacy.html'),'utf8'),/<meta name="robots" content="noindex">/);
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
 const timing=await page.evaluate(()=>{const n=performance.getEntriesByType('navigation')[0];return {domContentLoaded_ms:n.domContentLoadedEventEnd,responseEnd_ms:n.responseEnd};});
 await writeFile(resolve(root,'docs/v2/website-results.json'),JSON.stringify({date:new Date().toISOString(),widths:sizes,images:imageCount,checks:['marketing semantic structure and canonical','responsive overflow at four sizes','all five actual product screenshots load','signup CTA','keyboard mobile menu','prefixed shared workspace and two-step registration navigation (no signup request)'],pageErrors:errors,failedLocalRequests:failed,localStaticNavigationTiming:timing,scope:'Local static deploy bundle; does not certify live authentication, CDN latency, Core Web Vitals or native release'},null,2)+'\n');
 console.log('PASS website: four viewports, five real screenshots, CTA, keyboard menu, SEO metadata and /workspace asset routing.');
}finally{await browser.close();server.close();}
