import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const vars=Object.fromEntries(readFileSync('.dev.vars','utf8').trim().split('\n').map(l=>l.split('=')));
const base='http://127.0.0.1:8788/api';
async function call(path,data,token){const r=await fetch(base+path,{method:data?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:data?JSON.stringify(data):undefined});return {status:r.status,body:await r.json()}}
const owner=await call('/auth/owner',{code:vars.OWNER_PASSPHRASE});assert.equal(owner.status,200);
const friend=await call('/auth/friend',{code:vars.FRIEND_ACCESS_CODE});assert.equal(friend.status,200);
assert.equal((await call('/owner/export',null,friend.body.token)).status,401);
assert.equal((await call('/owner/export')).status,401);
const pack=JSON.parse(readFileSync('public/examples/friday-session.json','utf8'));
const valid=await call('/owner/imports/validate',pack,owner.body.token);assert.equal(valid.body.ok,true,JSON.stringify(valid.body));
const publish=await call('/owner/imports/publish',pack,owner.body.token);assert.equal(publish.status,200,JSON.stringify(publish.body));
const duplicate=await call('/owner/imports/publish',pack,owner.body.token);assert.equal(duplicate.body.duplicate,true);
const stats=await call('/snapshot?from=2026-09-04&to=2026-09-04&mode=totals');assert.equal(stats.status,200,JSON.stringify(stats.body));assert.equal(stats.body.stats.length,8);assert.equal(stats.body.totalGames,4);
const backup=await call('/owner/export',null,owner.body.token);assert.equal(backup.body.current.length,4);
const events=await call(`/games/${pack.games[0].id}/events?after=-1`);assert.ok(events.body.events.length>0);
assert.equal((await call('/ai',{question:'Who scored most?',model:'flash',filters:{from:'2026-09-04',to:'2026-09-04',players:[],mode:'totals'}},friend.body.token)).status,503);
console.log('Worker smoke passed: owner/friend auth, write denial, validate, publish, duplicate no-op, snapshot, private backup, event pagination, unconfigured AI.');
