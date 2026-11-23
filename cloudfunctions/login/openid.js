/**
 * 与 api/lib/openid.js 保持一致（云函数各自独立部署，需各带一份）。
 *
 * MVP：有 OPENID 即接受合法 dbg_*；不再按 SOURCE 拒绝。
 */

const DBG_RE = /^dbg_[a-z0-9_]{1,24}$/i;
const BLOCKED_SOURCES = new Set(['wx_client', 'wx_web', 'wx_api']);

function isValidDebugOpenId(debug) {
  return typeof debug === 'string' && DBG_RE.test(debug);
}

function canUseDebugIdentity(wxContext, opts = {}) {
  if (!wxContext || !wxContext.OPENID) return false;
  if (opts.allowDebugEnv === false) {
    const raw = wxContext.SOURCE;
    const source = raw == null ? '' : String(raw).trim();
    if (source === 'wx_devtools' || /devtools/i.test(source)) return true;
    if (BLOCKED_SOURCES.has(source)) return false;
    return true;
  }
  return true;
}

function resolveOpenId(wxContext, event, opts = {}) {
  const real = wxContext && wxContext.OPENID;
  const debug = event && event.debugOpenId;
  if (isValidDebugOpenId(debug) && canUseDebugIdentity(wxContext, opts)) {
    return debug;
  }
  return real;
}

function buildDebugMeta(wxContext, event, resolved, opts = {}) {
  const requested = (event && event.debugOpenId) || null;
  const realOpenId = (wxContext && wxContext.OPENID) || null;
  const source = wxContext && wxContext.SOURCE != null ? String(wxContext.SOURCE) : '';
  return {
    requested: requested || null,
    resolved: resolved || null,
    resolvedOpenId: resolved || null,
    realOpenId,
    source,
    allowed: canUseDebugIdentity(wxContext, opts),
    debugApplied: !!(
      requested &&
      resolved &&
      isValidDebugOpenId(requested) &&
      requested === resolved
    ),
  };
}

module.exports = {
  isValidDebugOpenId,
  canUseDebugIdentity,
  resolveOpenId,
  buildDebugMeta,
};
