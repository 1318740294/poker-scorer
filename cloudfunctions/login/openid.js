/**
 * 与 api/lib/openid.js 保持一致（云函数各自独立部署，需各带一份）。
 */
const DBG_RE = /^dbg_[a-z0-9_]{1,24}$/i;
const BLOCKED_SOURCES = new Set(['wx_client', 'wx_web', 'wx_api', 'cloud', 'scf']);

function isValidDebugOpenId(debug) {
  return typeof debug === 'string' && DBG_RE.test(debug);
}

function canUseDebugIdentity(wxContext, opts = {}) {
  if (!wxContext || !wxContext.OPENID) return false;
  if (opts.allowDebugEnv) return true;

  const raw = wxContext.SOURCE;
  const source = raw == null ? '' : String(raw);

  if (source === 'wx_devtools' || /devtools/i.test(source)) return true;
  if (BLOCKED_SOURCES.has(source)) return false;
  if (!source) return true;
  return false;
}

function resolveOpenId(wxContext, event, opts = {}) {
  const real = wxContext && wxContext.OPENID;
  const debug = event && event.debugOpenId;
  if (isValidDebugOpenId(debug) && canUseDebugIdentity(wxContext, opts)) {
    return debug;
  }
  return real;
}

module.exports = {
  isValidDebugOpenId,
  canUseDebugIdentity,
  resolveOpenId,
};
