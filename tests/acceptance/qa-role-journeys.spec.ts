import {test,expect} from '@playwright/test';
const paths:Record<string,string[]>={admin:['dashboard','users','deals','funds','reports','approvals/deposits','approvals/repayments','settings','activity'],owner:['dashboard','notifications'],staff:['dashboard','users','deals','funds','reports'],client:['dashboard','deals','deals/request','agreements','receipts','settings','notifications'],investor:['dashboard','transactions','agreements','receipts','settings','notifications'],legal:['dashboard','notifications'],recovery:['dashboard','notifications'],marketer:['dashboard','notifications']};
for(const role of Object.keys(paths))test(`QA ${role} navigation, mobile and cross-portal boundaries`,async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/login');await expect(page.getByRole('button',{name:'Login',exact:true})).toBeEnabled({timeout:60000});
 await page.getByLabel('Email',{exact:true}).fill(`${role}@nal.test`);await page.getByLabel('Password',{exact:true}).fill('Emulator-only-123!');await page.getByRole('button',{name:'Login',exact:true}).click();
 const portal=role==='staff'?'admin':role;await expect(page).toHaveURL(new RegExp(`/${portal}/dashboard`),{timeout:60000});
 const later=page.getByRole('button',{name:'Continue later',exact:true});if(await later.isVisible({timeout:3000}).catch(()=>false))await later.click();
 for(const width of [390,1280]){
  await page.setViewportSize({width,height:844});
  for(const path of paths[role]){await page.goto(`/${portal}/${path}`);await expect(page.locator('#main-content h1').first()).toBeVisible({timeout:30000});console.log('QA_PAGE',JSON.stringify({role,path,width,alerts:await page.locator('[role=alert]').allTextContents()}));await expect(page.getByText('Application error:',{exact:false})).toHaveCount(0);const dimensions=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,offenders:Array.from(document.querySelectorAll('body *')).map(el=>({tag:el.tagName,classes:el.className,rect:el.getBoundingClientRect()})).filter(x=>x.rect.right>document.documentElement.clientWidth+.5).slice(0,8).map(x=>({tag:x.tag,classes:x.classes,right:x.rect.right,width:x.rect.width}))}));expect(dimensions.scrollWidth,`${role}/${path}/${width}: ${JSON.stringify(dimensions)}`).toBeLessThanOrEqual(dimensions.clientWidth);}
  await page.screenshot({path:`/tmp/nal-qa-${role}-${width}.png`,fullPage:true});
 }
 for(const target of ['owner','admin','client','investor','legal','recovery','marketer']){
  const allowed=['admin','owner','staff'].includes(role)?target!=='owner'||role==='owner':target===role;
  await page.goto(`/${target}/dashboard`);if(allowed)await expect(page).toHaveURL(new RegExp(`/${target}/dashboard`),{timeout:30000});else await expect(page).not.toHaveURL(new RegExp(`/${target}/dashboard`),{timeout:30000});
 }
 expect(errors).toEqual([]);
});
test('QA account without persona cannot view client dashboard',async({page})=>{
 await page.goto('/login');await expect(page.getByRole('button',{name:'Login',exact:true})).toBeEnabled({timeout:60000});
 await page.getByLabel('Email',{exact:true}).fill('qa-none@nal.test');await page.getByLabel('Password',{exact:true}).fill('Emulator-only-123!');await page.getByRole('button',{name:'Login',exact:true}).click();
 await expect(page).toHaveURL(/\/access-pending/,{timeout:30000});await expect(page.getByRole('heading',{name:'Client Dashboard',exact:true})).toHaveCount(0);
});
