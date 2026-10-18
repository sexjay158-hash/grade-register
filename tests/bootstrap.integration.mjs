import assert from 'node:assert/strict';

// Run only against a disposable local D1 database with ADMIN_SETUP_TOKEN set.
const base='http://127.0.0.1:8787';
const setupToken=process.env.TEST_BOOTSTRAP_TOKEN;
assert.ok(setupToken?.length>=32,'set TEST_BOOTSTRAP_TOKEN for the isolated Worker');

async function setup(token,headers={}){
 const response=await fetch(base+'/api/auth/bootstrap',{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Connection:'close',...headers},body:JSON.stringify({setupToken:token,username:'bootstrap-test-admin',password:'TestOnly-Strong-Password-2026'}),signal:AbortSignal.timeout(10000)});
 return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]??''};
}

const page=await fetch(base+'/setup',{headers:{Connection:'close'},signal:AbortSignal.timeout(10000)});
assert.equal(page.status,200);
const html=await page.text();
assert.match(html,/初始化口令/);
assert.doesNotMatch(html,/管理员一次性验证/);

assert.equal((await setup('wrong-setup-token')).status,400,'wrong setup token cannot claim administrator');
assert.equal((await setup('wrong-setup-token',{'oai-authenticated-user-id':'mv8ZMW175sSptJ0AXZgmLeGabJHg4hRfhFqVUc1zESzqojA8X7PJ4B'})).status,400,'old platform identity cannot bypass setup token');
const created=await setup(setupToken);
assert.equal(created.status,200,'correct setup token creates administrator without platform identity');
assert.ok(created.cookie.startsWith('gr_session='));
assert.equal((await setup(setupToken)).status,409,'setup token cannot create another administrator');
console.log('Bootstrap without platform identity: passed');
