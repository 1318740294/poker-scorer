/** 开发态身份切换：仅 envVersion === 'develop' 时可用 */

const STORAGE_KEY = 'debugOpenId';
const IDS = [
  { id: '', label: '真实 openId' },
  { id: 'dbg_host', label: 'Host' },
  { id: 'dbg_p2', label: '玩家2' },
  { id: 'dbg_p3', label: '玩家3' },
  { id: 'dbg_p4', label: '玩家4' },
];

function isDevelop() {
  try {
    const info = wx.getAccountInfoSync();
    return info && info.miniProgram && info.miniProgram.envVersion === 'develop';
  } catch (e) {
    return false;
  }
}

function getDebugOpenId() {
  if (!isDevelop()) return '';
  return wx.getStorageSync(STORAGE_KEY) || '';
}

function setDebugOpenId(id) {
  if (!isDevelop()) return;
  const next = id || '';
  if (next) wx.setStorageSync(STORAGE_KEY, next);
  else wx.removeStorageSync(STORAGE_KEY);
}

module.exports = {
  IDS,
  isDevelop,
  getDebugOpenId,
  setDebugOpenId,
};
