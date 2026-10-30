// Executes the generated inline bootstrap, without a browser or Google requests.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const python = spawnSync(process.env.PYTHON || 'python', ['-c', `
import engine
print(engine.analytics_tags(
    {'enabled': True, 'measurement_id': 'G-W3F2HYMSXD'},
    {'enabled': True, 'google_cmp_ready': True}))
`], {cwd: root, encoding: 'utf8'});
assert.equal(python.status, 0, python.stderr);
const html = python.stdout;
const inline = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const context = {dataLayer: []};
context.window = context;
vm.runInNewContext(inline, context);
const commands = context.dataLayer.map(args => Array.from(args));
assert.equal(commands.length, 3);
assert.deepEqual(commands[0].slice(0, 2), ['consent', 'default']);
for (const purpose of ['analytics_storage', 'ad_storage', 'ad_user_data', 'ad_personalization']) {
  assert.equal(commands[0][2][purpose], 'denied', purpose);
}
assert.equal(commands[0][2].wait_for_update, 500);
assert.equal(commands[1][0], 'js');
assert.equal(commands[2][0], 'config');
assert.equal(commands[2][1], 'G-W3F2HYMSXD');
assert.equal(typeof context.gtag, 'function');
assert.equal(html.match(/<script async src="https:\/\/www.googletagmanager.com/g).length, 1);

// The existing queue is retained so native CMP consent updates are not lost.
const existing = {dataLayer: [['consent', 'update', {analytics_storage: 'denied'}]]};
existing.window = existing;
vm.runInNewContext(inline, existing);
assert.equal(existing.dataLayer[0][1], 'update');
existing.gtag('consent', 'update', {analytics_storage: 'granted'});
assert.equal(existing.dataLayer.at(-1)[2].analytics_storage, 'granted');
existing.gtag('consent', 'update', {analytics_storage: 'denied'});
assert.equal(existing.dataLayer.at(-1)[2].analytics_storage, 'denied');
console.log('Analytics: defaults denied before config, single async tag, queue and consent updates checked.');
{
  const fs=await import('node:fs');
  const script=fs.readFileSync(path.join(root,'assets/consent.js'),'utf8');
  for(const hash of ['', '#opciones-de-privacidad']){
    let opened=0;const handlers={},link={hidden:true,addEventListener:(key,fn)=>handlers[key]=fn};
    const state={document:{getElementById:()=>link},location:{hash},googlefc:{callbackQueue:[],showRevocationMessage:()=>opened++}};state.window=state;
    vm.runInNewContext(script,state);
    state.googlefc.callbackQueue[0].CONSENT_API_READY();
    assert.equal(opened,hash?1:0,'The privacy link explicitly opens consent management on the guide');
  }
}
