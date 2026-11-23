/** 开发态身份切换：dbg_host / dbg_p2 … */

const STORAGE_KEY = 'debugOpenId';
const STORAGE_ON_KEY = 'debugModeOn';

const IDS = [
  { id: 'dbg_host', label: 'Host' },
  { id: 'dbg_p2', label: '玩家2' },
  { id: 'dbg_p3', label: '玩家3' },
  { id: 'dbg_p4', label: '玩家4' },
  { id: '', label: '真实 openId' },
];

const NICK_MAP = {
  dbg_host: 'Host',
  dbg_p2: '玩家2',
  dbg_p3: '玩家3',
  dbg_p4: '玩家4',
};

function readLocalConfig() {
  try {
    // eslint-disable-next-line global-require, import/no-unresolved
    return require('../config.local.js') || {};
  } catch (e) {
    return {};
  }
}

/**
 * 是否展示调试 UI / 允许本地伪身份。
 * 优先 config.local.js；否则非 release/trial；再否则 DevTools 平台。
 */
function isDebugUiEnabled() {
  const cfg = readLocalConfig();
  if (cfg && cfg.debug === true) return true;
  if (cfg && cfg.debug === false) return false;

  try {
    const info = wx.getAccountInfoSync();
    const ver = info && info.miniProgram && info.miniProgram.envVersion;
    if (ver && ver !== 'release' && ver !== 'trial') return true;
  } catch (e) {
    // ignore
  }

  try {
    const sys = wx.getSystemInfoSync();
    if (sys && (sys.platform === 'devtools' || /devtools/i.test(String(sys.brand || '')))) {
      return true;
    }
  } catch (e) {
    // ignore
  }

  return false;
}

/** @deprecated 用 isDebugUiEnabled；保留别名以免旧引用炸掉 */
function isDevelop() {
  return isDebugUiEnabled();
}

function isDebugModeOn() {
  if (!isDebugUiEnabled()) return false;
  return !!wx.getStorageSync(STORAGE_ON_KEY);
}

function setDebugModeOn(on) {
  if (!isDebugUiEnabled()) return;
  if (on) wx.setStorageSync(STORAGE_ON_KEY, 1);
  else wx.removeStorageSync(STORAGE_ON_KEY);
}

function getDebugOpenId() {
  if (!isDebugUiEnabled()) return '';
  if (!isDebugModeOn()) return '';
  return wx.getStorageSync(STORAGE_KEY) || '';
}

function setDebugOpenId(id) {
  if (!isDebugUiEnabled()) return;
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

function isDbgId(id) {
  return typeof id === 'string' && /^dbg_[a-z0-9_]{1,24}$/i.test(id);
}

/**
 * 客户端有效身份：调试开着时本地 dbg_* 优先，绝不被云端真实 OPENID 覆盖。
 * @param {string} [serverMe] 云函数返回的 me
 * @param {string} [fallback] globalData / 页面上的备选
 */
function effectiveOpenId(serverMe, fallback) {
  const local = getDebugOpenId();
  if (isDbgId(local)) return local;
  if (serverMe) return serverMe;
  return fallback || '';
}

/** 云端 me 与本地调试身份不一致时用于 UI 提示 */
function identityMismatch(serverMe) {
  const local = getDebugOpenId();
  if (!isDbgId(local)) return null;
  if (!serverMe || serverMe === local) return null;
  return { local, server: serverMe };
}

module.exports = {
  IDS,
  NICK_MAP,
  STORAGE_KEY,
  isDevelop,
  isDebugUiEnabled,
  isDebugModeOn,
  setDebugModeOn,
  getDebugOpenId,
  setDebugOpenId,
  identityLabel,
  isDbgId,
  effectiveOpenId,
  identityMismatch,
};
