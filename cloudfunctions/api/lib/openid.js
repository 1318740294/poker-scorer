/**
 * 解析请求身份：开发者工具可使用 dbg_* 伪 openId；正式客户端不可伪造。
 *
 * 策略：仅对明确的生产客户端来源（wx_client / wx_web / wx_api）拒绝 dbg_*。
 * DevTools（wx_devtools）、空 SOURCE、未知 SOURCE 一律放行 —— 避免工具版本差异导致伪身份失效。
 * 云函数环境变量 ALLOW_DEBUG_OPENID=1 可强制放行（含真机，仅开发环境使用）。
 */

const DBG_RE = /^dbg_[a-z0-9_]{1,24}$/i;
/** 明确的终端生产来源；勿把 cloud/scf 算进去（部分链路会带这些） */
const BLOCKED_SOURCES = new Set(['wx_client', 'wx_web', 'wx_api']);

function isValidDebugOpenId(debug) {
  return typeof debug === 'string' && DBG_RE.test(debug);
}

function canUseDebugIdentity(wxContext, opts = {}) {
  if (!wxContext || !wxContext.OPENID) return false;
  if (opts.allowDebugEnv) return true;

  const raw = wxContext.SOURCE;
  const source = raw == null ? '' : String(raw).trim();

  if (source === 'wx_devtools' || /devtools/i.test(source)) return true;
  if (BLOCKED_SOURCES.has(source)) return false;
  // 空 / 未知 SOURCE：放行（DevTools 与部分基础库会省略或填非标值）
  return true;
}

/**
 * @param {{ OPENID?: string, SOURCE?: string }} wxContext
 * @param {{ debugOpenId?: string }} [event]
 * @param {{ allowDebugEnv?: boolean }} [opts]
 * @returns {string|undefined}
 */
function resolveOpenId(wxContext, event, opts = {}) {
  const real = wxContext && wxContext.OPENID;
  const debug = event && event.debugOpenId;
  if (isValidDebugOpenId(debug) && canUseDebugIdentity(wxContext, opts)) {
    return debug;
  }
  return real;
}

/**
 * 供 API/login 回传，方便前端发现「请求了 dbg_* 但未生效」。
 */
function buildDebugMeta(wxContext, event, resolved, opts = {}) {
  const requested = (event && event.debugOpenId) || null;
  const realOpenId = (wxContext && wxContext.OPENID) || null;
  const source = wxContext && wxContext.SOURCE != null ? String(wxContext.SOURCE) : '';
  return {
    requested: requested || null,
    resolved: resolved || null,
    realOpenId,
    source,
    allowed: canUseDebugIdentity(wxContext, opts),
    debugApplied: !!(requested && resolved && requested === resolved),
  };
}

module.exports = {
  DBG_RE,
  BLOCKED_SOURCES,
  isValidDebugOpenId,
  canUseDebugIdentity,
  resolveOpenId,
  buildDebugMeta,
};
