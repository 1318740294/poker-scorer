/**
 * getOpenId / resolveOpenId 行为单测：node scripts/test-openid.js
 */
const path = require('path');
const {
  resolveOpenId,
  canUseDebugIdentity,
  isValidDebugOpenId,
  buildDebugMeta,
  BLOCKED_SOURCES,
} = require(path.join(__dirname, '../cloudfunctions/api/lib/openid'));

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

function testValidDebugId() {
  assert(isValidDebugOpenId('dbg_host'), 'dbg_host ok');
  assert(isValidDebugOpenId('dbg_p2'), 'dbg_p2 ok');
  assert(!isValidDebugOpenId('host'), 'no prefix');
  assert(!isValidDebugOpenId('dbg_'), 'too short');
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
  const ctxCloud = { OPENID: real, SOURCE: 'cloud' };
  const ctxWeird = { OPENID: real, SOURCE: 'something_new' };

  // MVP：有 OPENID 一律允许（不再按 SOURCE 拒绝）
  assert(canUseDebugIdentity(ctxDev), 'devtools');
  assert(canUseDebugIdentity(ctxClient), 'MVP: wx_client also allowed');
  assert(canUseDebugIdentity(ctxEmpty), 'empty SOURCE + OPENID');
  assert(canUseDebugIdentity(ctxMissing), 'missing SOURCE + OPENID');
  assert(!canUseDebugIdentity(ctxNoOpen), 'no OPENID');
  assert(canUseDebugIdentity(ctxCloud), 'cloud SOURCE');
  assert(canUseDebugIdentity(ctxWeird), 'unknown SOURCE');
  // 显式收紧时才拒生产客户端
  assert(!canUseDebugIdentity(ctxClient, { allowDebugEnv: false }), 'tight mode blocks wx_client');
  assert(canUseDebugIdentity(ctxDev, { allowDebugEnv: false }), 'tight mode still allows devtools');
  assert(BLOCKED_SOURCES.has('wx_client'), 'wx_client still in set for tight mode');
  console.log('✓ source gates (MVP accept-all)');
}

function testResolve() {
  const real = 'oREAL123';
  const event = { debugOpenId: 'dbg_p2' };

  assert(
    resolveOpenId({ OPENID: real, SOURCE: 'wx_devtools' }, event) === 'dbg_p2',
    'devtools accepts dbg'
  );
  assert(
    resolveOpenId({ OPENID: real, SOURCE: 'wx_client' }, event) === 'dbg_p2',
    'MVP: wx_client accepts dbg'
  );
  assert(
    resolveOpenId({ OPENID: real }, event) === 'dbg_p2',
    'missing SOURCE accepts dbg'
  );
  assert(
    resolveOpenId({ OPENID: real, SOURCE: 'wx_devtools' }, { debugOpenId: 'evil' }) === real,
    'invalid prefix ignored'
  );
  assert(
    resolveOpenId({ OPENID: real, SOURCE: 'wx_client' }, event, { allowDebugEnv: false }) ===
      real,
    'tight mode rejects on wx_client'
  );
  assert(resolveOpenId({ OPENID: real, SOURCE: 'wx_devtools' }, {}) === real, 'no debug field');
  assert(
    resolveOpenId({ OPENID: real, SOURCE: 'cloud' }, event) === 'dbg_p2',
    'cloud SOURCE accepts dbg'
  );
  console.log('✓ resolveOpenId');
}

function testDebugMeta() {
  const real = 'oREAL123';
  const ctx = { OPENID: real, SOURCE: 'wx_devtools' };
  const event = { debugOpenId: 'dbg_host' };
  const resolved = resolveOpenId(ctx, event);
  const meta = buildDebugMeta(ctx, event, resolved);
  assert(meta.debugApplied === true, 'meta applied');
  assert(meta.requested === 'dbg_host', 'meta requested');
  assert(meta.resolved === 'dbg_host', 'meta resolved');
  assert(meta.resolvedOpenId === 'dbg_host', 'meta resolvedOpenId');
  assert(meta.realOpenId === real, 'meta real');
  assert(meta.source === 'wx_devtools', 'meta source');

  const clientOk = buildDebugMeta(
    { OPENID: real, SOURCE: 'wx_client' },
    event,
    'dbg_host'
  );
  assert(clientOk.debugApplied === true, 'MVP client applied');
  assert(clientOk.allowed === true, 'MVP client allowed');
  console.log('✓ buildDebugMeta');
}

function main() {
  testValidDebugId();
  testSourceGates();
  testResolve();
  testDebugMeta();
  console.log('\nAll openId tests passed.');
}

main();
