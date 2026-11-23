/**
 * 解析请求身份：开发者工具可使用 dbg_* 伪 openId。
 *
 * MVP 策略（私人小程序）：只要 WXContext 有真实 OPENID（说明已鉴权），
 * 且 event.debugOpenId 匹配 /^dbg_/，一律采用伪身份。
 * 风险可接受：未登录无法调云函数；dbg_* 不写 users；发版前关前端 debug。
 *
 * 可选环境变量 ALLOW_DEBUG_OPENID=true|1：显式标记「允许调试身份」
 * （当前默认已放行，设了只影响 debugMeta.allowed / 日志；保留便于运维对照）。
 */

const DBG_RE = /^dbg_[a-z0-9_]{1,24}$/i;

/** @deprecated 保留导出供单测/旧注释对照；MVP 不再按 SOURCE 拒绝 */
const BLOCKED_SOURCES = new Set(['wx_client', 'wx_web', 'wx_api']);

function isValidDebugOpenId(debug) {
  return typeof debug === 'string' && DBG_RE.test(debug);
}

/**
 * 是否允许采用 dbg_*。
 * MVP：有 OPENID 即可。SOURCE 仅作 meta 记录，不再门禁。
 */
function canUseDebugIdentity(wxContext, opts = {}) {
  if (!wxContext || !wxContext.OPENID) return false;
  // OPENID 存在 = 小程序云调用已鉴权；接受 dbg_* 以便本机双人自测
  if (opts.allowDebugEnv === false) {
    // 仅当显式关掉时才走旧 SOURCE 逻辑（测试用）
    const raw = wxContext.SOURCE;
    const source = raw == null ? '' : String(raw).trim();
    if (source === 'wx_devtools' || /devtools/i.test(source)) return true;
    if (BLOCKED_SOURCES.has(source)) return false;
    return true;
  }
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
  const allowed = canUseDebugIdentity(wxContext, opts);
  return {
    requested: requested || null,
    resolved: resolved || null,
    resolvedOpenId: resolved || null,
    realOpenId,
    source,
    allowed,
    debugApplied: !!(
      requested &&
      resolved &&
      isValidDebugOpenId(requested) &&
      requested === resolved
    ),
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
