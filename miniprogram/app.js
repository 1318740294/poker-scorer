const { getDebugOpenId, setDebugOpenId, isDevelop } = require('./utils/debug');

App({
  globalData: {
    openId: '',
    nickname: '',
    persona: 'fox',
    cloudReady: false,
    isDevelop: false,
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
    this.globalData.isDevelop = isDevelop();

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
   */
  applyDebugIdentity(id) {
    if (!isDevelop()) return Promise.resolve();
    const next = id || '';
    setDebugOpenId(next);
    if (next) this.globalData.openId = next;
    else this.globalData.openId = '';
    return this.ensureLogin();
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
      const openId = res.result && res.result.data && res.result.data.openId;
      if (openId) this.globalData.openId = openId;
    } catch (e) {
      console.warn('login cloud function failed', e);
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
