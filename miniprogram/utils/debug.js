/** 开发态身份切换：仅 envVersion === 'develop' 时可用 */

const STORAGE_KEY = 'debugOpenId';
const IDS = [
  { id: '', label: '真实 openId' },
  { id: 'dbg_host', label: 'Host' },
  { id: 'dbg_p2', label: '玩家2' },
  { id: 'dbg_p3', label: '玩家3' },
  { id: 'dbg_p4', label: '玩家4' },
];

const NICK_MAP = {
  dbg_host: 'Host',
  dbg_p2: '玩家2',
  dbg_p3: '玩家3',
  dbg_p4: '玩家4',
};

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

/** 候场/首页展示用短标签 */
function identityLabel(openId) {
  if (!openId) return '未登录';
  if (NICK_MAP[openId]) return NICK_MAP[openId];
  if (String(openId).startsWith('dbg_')) return openId;
  if (openId.length <= 8) return openId;
  return `${openId.slice(0, 6)}…`;
}

module.exports = {
  IDS,
  NICK_MAP,
  isDevelop,
  getDebugOpenId,
  setDebugOpenId,
  identityLabel,
};
