const {
  getDebugOpenId,
  setDebugOpenId,
  setDebugModeOn,
  isDebugUiEnabled,
  isDbgId,
  effectiveOpenId,
} = require('./utils/debug');

App({
  globalData: {
    openId: '',
    realOpenId: '',
    nickname: '',
    persona: 'fox',
    cloudReady: false,
    isDevelop: false,
    debugMismatch: null,
    lastDebugMeta: null,
  },

  _loginSeq: 0,

  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上基础库以使用云能力');
      return;
    }
    // 开通云开发并在开发者工具关联环境后，DYNAMIC_CURRENT_ENV 即可。
    // 若报错，改为你的环境 ID 字符串，例如 'poker-xxxxx'。
    wx.cloud.init({
      env: wx.cloud.DYNAMIC_CURRENT_ENV,
      traceUser: true,
    });
    this.globalData.cloudReady = true;
    this.globalData.isDevelop = isDebugUiEnabled();

    const cached = wx.getStorageSync('profile') || {};
    this.globalData.nickname = cached.nickname || '';
    this.globalData.persona = cached.persona || 'fox';

    // 开发态：先同步本地调试身份，避免 lobby 仍用上一身份判断「已入座」
    const debugOpenId = getDebugOpenId();
    if (debugOpenId) this.globalData.openId = debugOpenId;

    this.ensureLogin();
  },

  /**
   * 切换调试身份：立刻写入 storage + globalData，再异步 login 校验。
   * @param {string} id dbg_* 或空字符串（真实 openId）
   * @param {{ turnOn?: boolean }} [opts] turnOn 时强制打开调试模式
   */
  applyDebugIdentity(id, opts = {}) {
    if (!isDebugUiEnabled()) return Promise.resolve();
    const next = id || '';
    if (opts.turnOn || next) setDebugModeOn(true);
    if (opts.turnOn === false && !next) setDebugModeOn(false);
    setDebugOpenId(next);
    if (next) {
      this.globalData.openId = next;
      this.globalData.debugMismatch = null;
    } else {
      // 关闭伪身份：回到真实 openId（若已有）
      this.globalData.openId = this.globalData.realOpenId || '';
    }
    return this.ensureLogin();
  },

  /** 关闭调试模式 */
  clearDebugIdentity() {
    if (!isDebugUiEnabled()) return Promise.resolve();
    setDebugModeOn(false);
    setDebugOpenId('');
    this.globalData.debugMismatch = null;
    this.globalData.openId = this.globalData.realOpenId || '';
    return this.ensureLogin();
  },

  /**
   * 用云函数返回的 me / debugMeta 更新全局身份。
   * 调试开着且本地是 dbg_* 时，永不被真实 OPENID 覆盖。
   */
  syncIdentityFromServer(serverMe, debugMeta) {
    if (debugMeta) this.globalData.lastDebugMeta = debugMeta;
    const local = getDebugOpenId();
    if (isDbgId(local)) {
      this.globalData.openId = local;
      if (serverMe && serverMe !== local) {
        this.globalData.debugMismatch = { local, server: serverMe };
        if (debugMeta && debugMeta.realOpenId) {
          this.globalData.realOpenId = debugMeta.realOpenId;
        } else if (serverMe && !isDbgId(serverMe)) {
          this.globalData.realOpenId = serverMe;
        }
        console.warn(
          '[debug-identity] 云端未采用 dbg_*',
          { local, serverMe, debugMeta }
        );
      } else {
        this.globalData.debugMismatch = null;
      }
      return local;
    }
    if (serverMe) {
      this.globalData.openId = serverMe;
      if (!isDbgId(serverMe)) this.globalData.realOpenId = serverMe;
    }
    this.globalData.debugMismatch = null;
    return this.globalData.openId;
  },

  async ensureLogin() {
    const seq = ++this._loginSeq;
    try {
      const debugOpenId = getDebugOpenId();
      // 乐观更新，防止异步 login 返回前页面仍认为是旧 openId
      if (debugOpenId) this.globalData.openId = debugOpenId;

      const data = {
        nickname: this.globalData.nickname,
        persona: this.globalData.persona,
      };
      if (debugOpenId) data.debugOpenId = debugOpenId;
      const res = await wx.cloud.callFunction({
        name: 'login',
        data,
      });
      if (seq !== this._loginSeq) return; // 过期响应，勿覆盖新身份
      const payload = (res.result && res.result.data) || {};
      const openId = payload.openId;
      if (payload.realOpenId) this.globalData.realOpenId = payload.realOpenId;
      this.syncIdentityFromServer(openId, payload.debugMeta || {
        requested: debugOpenId || null,
        resolved: openId,
        realOpenId: payload.realOpenId || (isDbgId(openId) ? null : openId),
        source: payload.source || null,
        debugApplied: !!(debugOpenId && openId === debugOpenId),
      });
      // 兜底：调试开着时 effectiveOpenId 必须赢
      this.globalData.openId = effectiveOpenId(openId, this.globalData.openId);
    } catch (e) {
      console.warn('login cloud function failed', e);
      // login 失败也不丢掉本地 dbg_*
      const local = getDebugOpenId();
      if (local) this.globalData.openId = local;
    }
  },

  saveProfile({ nickname, persona }) {
    if (nickname != null) this.globalData.nickname = nickname;
    if (persona != null) this.globalData.persona = persona;
    wx.setStorageSync('profile', {
      nickname: this.globalData.nickname,
      persona: this.globalData.persona,
    });
  },
});
