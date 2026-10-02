import {test,expect} from '@playwright/test';
import {guideLabels,userGuideTopics} from '../../src/lib/user-guide';

test('daily automation rejects an invalid credential before starting tasks',async({request})=>{
  const response=await request.post('/api/cron',{headers:{Authorization:'Bearer invalid-regression-token'}});
  expect([401,503]).toContain(response.status());
  const body=await response.json();
  expect(body.success).toBe(false);
  expect(body.message).toMatch(/authentication was rejected|credentials are not configured/);
  expect(body).not.toHaveProperty('zakat');
  expect(body).not.toHaveProperty('ownerProfit');
});

for(const width of [320,768,1440]) test(`visual guide is usable at ${width}px and resumes reading progress`,async({page})=>{
  await page.setViewportSize({width,height:800});
  await page.goto('/help');
  await page.getByRole('button',{name:'User guide',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Back',exact:true})).toBeDisabled();
  await dialog.getByRole('button',{name:'Next',exact:true}).click();
  await expect(dialog.getByRole('heading',{name:'Complete your profile',exact:true})).toBeVisible();
  await dialog.getByRole('checkbox',{name:'I have read this topic'}).check();
  await dialog.getByRole('button',{name:'Continue later'}).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button',{name:'User guide',exact:true}).click();
  await expect(dialog.getByRole('heading',{name:'Complete your profile',exact:true})).toBeVisible();
  await expect(dialog.getByRole('checkbox')).toBeChecked();
  const box=await dialog.boundingBox();expect(box).not.toBeNull();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(width+1);
  await expect(dialog.getByRole('button',{name:'Next',exact:true})).toBeVisible();
  await dialog.screenshot({path:`test-results/user-guide-${width}.png`});
  await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
});

test('role guides are distinct and the public examples cannot operate live sections',async({page})=>{
  await page.goto('/help');
  await page.getByLabel('Role',{exact:true}).selectOption('investor');
  await page.getByRole('button',{name:'User guide',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByRole('link',{name:'Open this section'})).toHaveCount(0);
  await dialog.getByRole('button',{name:/Know when funds are withdrawable$/}).click();
  await expect(dialog.getByText(/end of each 30-day period/)).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByLabel('Role',{exact:true}).selectOption('admin');
  await page.getByRole('button',{name:'User guide',exact:true}).click();
  await dialog.getByRole('button',{name:/Bring historical records into NAL$/}).click();
  await expect(dialog.getByText(/not the deal start/)).toBeVisible();
});

test('signature illustration respects reduced motion and never calls financial APIs',async({page})=>{
  const requests:string[]=[];page.on('request',request=>{if(/\/api\/(financial-documents|admin-user-records|cron|whatsapp-reminders)/.test(request.url()))requests.push(request.url());});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/help');
  await page.getByRole('button',{name:/^6\. Read, sign and keep agreements$/}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByRole('img',{name:'Read, sign and keep agreements'})).toBeVisible();
  await expect(dialog.getByText('Illustration only — not your live account')).toBeVisible();
  const animation=await dialog.locator('.nal-guide-signature').evaluate(element=>getComputedStyle(element).animationName);
  expect(animation).toBe('none');
  await dialog.screenshot({path:'test-results/user-guide-signing.png'});
  await dialog.getByRole('button',{name:'Start again',exact:true}).first().click();
  expect(requests).toEqual([]);
});

for(const language of ['ha','ig','yo'] as const) test(`guide explanations follow the ${language} Settings language`,async({page})=>{
  await page.addInitScript(language=>localStorage.setItem('nal-preferred-language',language),language);
  await page.goto('/help');
  await page.getByRole('button',{name:guideLabels.guide[language],exact:true}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByRole('heading',{name:guideLabels.title[language]})).toBeVisible();
  await expect(dialog.getByRole('heading',{name:userGuideTopics('client')[0].title[language]})).toBeVisible();
  await expect(dialog.getByText(userGuideTopics('client')[0].steps[0][language],{exact:true})).toBeVisible();
});
