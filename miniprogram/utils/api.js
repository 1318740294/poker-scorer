const { getDebugOpenId, isDbgId, assertResolvedDebugId } = require('./debug');

/**
 * @param {string} action
 * @param {object} [data]
 * @param {{ debugOpenId?: string, expectDebugId?: string|boolean }} [opts]
 *   expectDebugId: 期望的 dbg_*；true=用本次 payload 的 debugOpenId；失败抛错
 */
function call(action, data = {}, opts = {}) {
  const debugOpenId =
    opts.debugOpenId !== undefined ? opts.debugOpenId : getDebugOpenId();
  const payload =
    debugOpenId
      ? { action, ...data, debugOpenId }
      : { action, ...data };
  return wx.cloud
    .callFunction({
      name: 'api',
      data: payload,
    })
    .then((res) => {
      const result = res.result || {};
      if (!result.ok) {
        const err = new Error(result.message || '请求失败');
        err.code = result.code;
        throw err;
      }
      const out = result.data || {};
      // 统一补齐 resolvedOpenId
      if (!out.resolvedOpenId && out.me) out.resolvedOpenId = out.me;
      if (out.debugMeta && !out.debugMeta.resolvedOpenId && out.resolvedOpenId) {
        out.debugMeta.resolvedOpenId = out.resolvedOpenId;
      }

      // 同步全局身份 / 错配提示
      try {
        const app = getApp();
        if (app && app.syncIdentityFromServer) {
          app.syncIdentityFromServer(out.me || out.resolvedOpenId, out.debugMeta);
        }
      } catch (e) {
        // getApp 在极端时机可能不可用
      }

      // 调试开着时：每次云调用都断言 resolvedOpenId === 期望 dbg_*
      let expect = opts.expectDebugId;
      if (expect === true) expect = debugOpenId;
      if (expect === undefined && isDbgId(debugOpenId)) expect = debugOpenId;
      if (isDbgId(expect)) {
        const bad = assertResolvedDebugId(out, expect);
        if (bad) {
          const src =
            (out.debugMeta && out.debugMeta.source) != null
              ? out.debugMeta.source
              : '';
          const err = new Error(
            `云函数未接受调试身份，请重传 api（期望 ${bad.expected}，得到 ${bad.got}，SOURCE=${src || '空'}）`
          );
          err.code = 'DEBUG_ID_REJECTED';
          err.debugMeta = out.debugMeta;
          throw err;
        }
      }

      return out;
    });
}

module.exports = {
  call,
  ping: (opts) => call('ping', {}, opts),
  createRoom: (payload, opts) => call('createRoom', payload, opts),
  joinRoom: (payload, opts) => call('joinRoom', payload, opts),
  getRoom: (payload, opts) => call('getRoom', payload, opts),
  sitDown: (payload, opts) => call('sitDown', payload, opts),
  leave: (payload, opts) => call('leave', payload, opts),
  rebuy: (payload, opts) => call('rebuy', payload, opts),
  startHand: (payload, opts) => call('startHand', payload, opts),
  action: (payload, opts) => call('action', payload, opts),
  timeBank: (payload, opts) => call('timeBank', payload, opts),
  forceAction: (payload, opts) => call('forceAction', payload, opts),
  pickWinners: (payload, opts) => call('pickWinners', payload, opts),
  correctUndo: (payload, opts) => call('correctUndo', payload, opts),
  correctStack: (payload, opts) => call('correctStack', payload, opts),
  updateConfig: (payload, opts) => call('updateConfig', payload, opts),
};
