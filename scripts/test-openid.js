/**
 * getOpenId / resolveOpenId 行为单测：node scripts/test-openid.js
 */
const path = require('path');
const {
  resolveOpenId,
  canUseDebugIdentity,
  isValidDebugOpenId,
} = require(path.join(__dirname, '../cloudfunctions/api/lib/openid'));

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

function testValidDebugId() {
  assert(isValidDebugOpenId('dbg_host'), 'dbg_host ok');
  assert(isValidDebugOpenId('dbg_p2'), 'dbg_p2 ok');
  assert(!isValidDebugOpenId('host'), 'no prefix');
  assert(!isValidDebugOpenId('dbg_'), 'too short');
  // regex is case-insensitive; uppercase OK
  assert(isValidDebugOpenId('DBG_HOST'), 'case insensitive');
  assert(!isValidDebugOpenId('dbg_this_id_is_way_too_long_for_us'), 'too long');
  assert(!isValidDebugOpenId(''), 'empty');
  assert(!isValidDebugOpenId(null), 'null');
  console.log('✓ valid debug id');
}

function testSourceGates() {
  const real = 'oREAL123';
  const ctxDev = { OPENID: real, SOURCE: 'wx_devtools' };
  const ctxClient = { OPENID: real, SOURCE: 'wx_client' };
  const ctxEmpty = { OPENID: real, SOURCE: '' };
  const ctxMissing = { OPENID: real };
  const ctxNoOpen = { SOURCE: 'wx_devtools' };

  assert(canUseDebugIdentity(ctxDev), 'devtools');
  assert(!canUseDebugIdentity(ctxClient), 'block wx_client');
  assert(canUseDebugIdentity(ctxEmpty), 'empty SOURCE + OPENID');
  assert(canUseDebugIdentity(ctxMissing), 'missing SOURCE + OPENID');
  assert(!canUseDebugIdentity(ctxNoOpen), 'no OPENID');
  assert(canUseDebugIdentity(ctxClient, { allowDebugEnv: true }), 'env override');
  console.log('✓ source gates');
}

function testResolve() {
  const real = 'oREAL123';
  const event = { debugOpenId: 'dbg_p2' };

  assert(
    resolveOpenId({ OPENID: real, SOURCE: 'wx_devtools' }, event) === 'dbg_p2',
    'devtools accepts dbg'
  );
  assert(
    resolveOpenId({ OPENID: real, SOURCE: 'wx_client' }, event) === real,
    'client rejects dbg'
  );
  assert(
    resolveOpenId({ OPENID: real }, event) === 'dbg_p2',
    'missing SOURCE accepts dbg (DevTools quirk)'
  );
  assert(
    resolveOpenId({ OPENID: real, SOURCE: 'wx_devtools' }, { debugOpenId: 'evil' }) === real,
    'invalid prefix ignored'
  );
  assert(
    resolveOpenId({ OPENID: real, SOURCE: 'wx_client' }, event, { allowDebugEnv: true }) ===
      'dbg_p2',
    'ALLOW_DEBUG_OPENID override'
  );
  assert(resolveOpenId({ OPENID: real, SOURCE: 'wx_devtools' }, {}) === real, 'no debug field');
  console.log('✓ resolveOpenId');
}

function main() {
  testValidDebugId();
  testSourceGates();
  testResolve();
  console.log('\nAll openId tests passed.');
}

main();
