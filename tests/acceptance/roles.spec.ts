import { expect, test } from '@playwright/test';

const roles = ['admin','owner','staff','client','investor','legal','recovery','marketer'];
for (const role of roles) test(`${role} signs in to its permitted dashboard`, async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button',{name:'Login',exact:true})).toBeEnabled({timeout:60_000});
  await page.getByLabel('Email', { exact:true }).fill(`${role}@nal.test`);
  await page.getByLabel('Password', { exact:true }).fill('Emulator-only-123!');
  await page.getByRole('button',{name:'Login',exact:true}).click();
  const portal=role==='staff'?'admin':role;
  await expect(page).toHaveURL(new RegExp(`/${portal}/dashboard`),{timeout:60_000});
  await expect(page.getByText('Application error:',{exact:false})).toHaveCount(0);
  if (!['admin','owner','staff'].includes(role)) {
    await page.goto('/admin/users');
    await expect(page).not.toHaveURL(/\/admin\/users/,{timeout:60_000});
  }
});

test('real emulator tokens enforce admin-only API writes', async ({ request }) => {
  let adminToken = '';
  for (const role of roles) {
    const response=await request.post('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-acceptance-key',{data:{email:`${role}@nal.test`,password:'Emulator-only-123!',returnSecureToken:true}});
    expect(response.ok()).toBeTruthy();
    const {idToken}=await response.json();
    if (role === 'admin') adminToken = idToken;
    const upload=await request.post('/api/admin-user-records',{headers:{Authorization:`Bearer ${idToken}`},multipart:{userId:'client',kind:'GOVERNMENT_ID',reason:'Acceptance only',file:{name:'id.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-acceptance')}}});
    expect(upload.status(),role).toBe(role==='admin'?200:403);
    expect((await upload.json()).success,role).toBe(role==='admin');
  }
  // Demote only the synthetic emulator profile; the old token still claims ADMIN.
  const demotion = await request.patch('http://127.0.0.1:8088/v1/projects/demo-nal-acceptance/databases/(default)/documents/users/admin?updateMask.fieldPaths=accessRole', {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: { fields: { accessRole: { stringValue: 'STAFF' } } },
  });
  expect(demotion.ok()).toBeTruthy();
  const staleTokenWrite = await request.post('/api/admin-user-records', {
    headers: { Authorization: `Bearer ${adminToken}` },
    multipart: { userId:'client',kind:'GOVERNMENT_ID',reason:'Stale token denial test',file:{name:'id.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-acceptance')} },
  });
  expect(staleTokenWrite.status()).toBe(403);
});
