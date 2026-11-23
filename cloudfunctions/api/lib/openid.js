/**
 * 解析请求身份：开发者工具可使用 dbg_* 伪 openId；正式客户端不可伪造。
 *
 * 真实 DevTools 多数上报 SOURCE=wx_devtools，但部分基础库/模拟器路径会省略 SOURCE。
 * 对已知生产来源（wx_client 等）一律拒绝 dbg_；空 SOURCE + 已有 OPENID 时放行（仅调试）。
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
  // 部分开发者工具不填 SOURCE：仅在「无来源」时放行，避免生产端伪造
  if (!source) return true;
  return false;
}

/**
 * @param {{ OPENID?: string, SOURCE?: string }} wxContext
 * @param {{ debugOpenId?: string }} [event]
 * @param {{ allowDebugEnv?: boolean }} [opts]
 */
function resolveOpenId(wxContext, event, opts = {}) {
  const real = wxContext && wxContext.OPENID;
  const debug = event && event.debugOpenId;
  if (isValidDebugOpenId(debug) && canUseDebugIdentity(wxContext, opts)) {
    return debug;
  }
  return real;
}

module.exports = {
  DBG_RE,
  BLOCKED_SOURCES,
  isValidDebugOpenId,
  canUseDebugIdentity,
  resolveOpenId,
};
