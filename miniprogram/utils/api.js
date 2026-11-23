const { getDebugOpenId } = require('./debug');

/**
 * @param {string} action
 * @param {object} [data]
 * @param {{ debugOpenId?: string }} [opts] 单次覆盖（一键双人自测用）
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
      // 同步全局身份 / 错配提示
      try {
        const app = getApp();
        if (app && app.syncIdentityFromServer) {
          app.syncIdentityFromServer(out.me, out.debugMeta);
        }
      } catch (e) {
        // getApp 在极端时机可能不可用
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
