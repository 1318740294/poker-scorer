const { getDebugOpenId } = require('./debug');

function call(action, data = {}) {
  const debugOpenId = getDebugOpenId();
  const payload = debugOpenId ? { action, ...data, debugOpenId } : { action, ...data };
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
      return result.data;
    });
}

module.exports = {
  ping: () => call('ping'),
  createRoom: (payload) => call('createRoom', payload),
  joinRoom: (payload) => call('joinRoom', payload),
  getRoom: (payload) => call('getRoom', payload),
  sitDown: (payload) => call('sitDown', payload),
  leave: (payload) => call('leave', payload),
  rebuy: (payload) => call('rebuy', payload),
  startHand: (payload) => call('startHand', payload),
  action: (payload) => call('action', payload),
  timeBank: (payload) => call('timeBank', payload),
  forceAction: (payload) => call('forceAction', payload),
  pickWinners: (payload) => call('pickWinners', payload),
  correctUndo: (payload) => call('correctUndo', payload),
  correctStack: (payload) => call('correctStack', payload),
  updateConfig: (payload) => call('updateConfig', payload),
};
