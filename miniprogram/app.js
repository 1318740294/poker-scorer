const { getDebugOpenId, isDevelop } = require('./utils/debug');

App({
  globalData: {
    openId: '',
    nickname: '',
    persona: 'fox',
    cloudReady: false,
    isDevelop: false,
  },

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

    this.ensureLogin();
  },

  async ensureLogin() {
    try {
      const debugOpenId = getDebugOpenId();
      const data = {
        nickname: this.globalData.nickname,
        persona: this.globalData.persona,
      };
      if (debugOpenId) data.debugOpenId = debugOpenId;
      const res = await wx.cloud.callFunction({
        name: 'login',
        data,
      });
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
