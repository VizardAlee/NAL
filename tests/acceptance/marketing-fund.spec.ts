import { test, expect } from '@playwright/test';

test.skip(process.env.NAL_MARKETING_ACCEPTANCE !== 'true', 'Fictional marketing fixtures are owned by test:marketing:acceptance.');

async function login(page: import('@playwright/test').Page,key:string) {
  await page.goto('/login');await expect(page.getByRole('button',{name:'Login',exact:true})).toBeEnabled({timeout:60000});
  await page.getByLabel('Email',{exact:true}).fill(`marketing-${key}@nal.test`);await page.getByLabel('Password',{exact:true}).fill('Emulator-only-123!');await page.getByRole('button',{name:'Login',exact:true}).click();
  await expect(page).toHaveURL(key==='admin'?/\/admin\/dashboard/:/\/marketer\/dashboard/,{timeout:60000});
  const later=page.getByRole('button',{name:'Continue later',exact:true});await expect(later).toBeVisible({timeout:20000});await later.click();
}
for(const width of [1440,390]) {
 test(`marketer individual login, scoped commission and promise flow at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});await login(page,'one');
  await expect(page.getByText('Commission earned',{exact:true})).toBeVisible();
  await expect(page.getByText('Fictional Assigned Client · Fictional Murabaha',{exact:true}).first()).toBeVisible({timeout:30000});
  await expect(page.getByText('Fictional Private Other Contract',{exact:false})).toHaveCount(0);
  await page.getByLabel('Assigned recovery task').selectOption('m-task');await page.getByLabel('Outcome',{exact:true}).selectOption('PROMISE_TO_PAY');
  await page.getByLabel('Contact notes').fill(`Fictional browser follow-up at ${width}px`);await page.getByLabel('Next follow-up').fill('2027-01-02T11:00');
  await page.getByLabel('Promise amount (only for a promise)').fill('1234.56');await page.getByLabel('Promise due date').fill('2027-01-03T11:00');await page.getByRole('button',{name:'Save follow-up',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Follow-up saved',{timeout:30000});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:`/tmp/nal-marketer-${width}.png`,fullPage:true});
  await page.goto('/admin/marketing');await expect(page).not.toHaveURL(/\/admin\/marketing/,{timeout:30000});
 });
 test(`admin pool, assignment and internal allocation flow at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});await login(page,'admin');await page.goto('/admin/marketing');
  await expect(page.getByRole('heading',{name:'Marketing fund and commissions',exact:true})).toBeVisible({timeout:60000});
  await expect(page.getByText('Commission unpaid',{exact:true})).toBeVisible();
  await page.getByLabel('Available company fund batch').selectOption('m-source');await page.getByLabel('Allocation amount',{exact:true}).fill('100');
  await page.getByLabel('Source evidence and reason').fill(`Fictional acceptance source at ${width}px`);await page.getByRole('button',{name:'Allocate to marketing pool',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('No shareholder loan was created',{timeout:30000});
  await page.getByLabel('Signed commission',{exact:true}).selectOption('m-fixed');await page.getByLabel('Amount paid',{exact:true}).fill('50');await page.getByLabel('External payment reference',{exact:true}).fill(`FICTIONAL-BROWSER-PAYOUT-${width}`);await page.getByRole('button',{name:'Record verified commission payment',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('No money transfer was performed',{timeout:30000});
  const assignment=page.getByLabel('Marketer for Fictional Private Other Contract',{exact:true});
  await assignment.selectOption('marketing-one');
  await expect(page.getByRole('status')).toContainText('Assignment updated',{timeout:30000});
  await assignment.selectOption('marketing-two');
  await expect(page.getByRole('status')).toContainText('Assignment updated',{timeout:30000});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:`/tmp/nal-marketing-admin-${width}.png`,fullPage:true});
  await page.goto('/admin/funds');
  await page.getByRole('button',{name:'Withdraw to Admin',exact:true}).click();
  await page.getByLabel('Amount to Transfer',{exact:true}).fill('1');
  await page.getByRole('button',{name:'Transfer Funds',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0,{timeout:30000});
  await page.getByRole('button',{name:'Fund Investible',exact:true}).click();
  await page.getByLabel('Amount to Transfer',{exact:true}).fill('1');
  await page.getByRole('button',{name:'Transfer Funds',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0,{timeout:30000});
 });
}
