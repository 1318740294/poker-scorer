const api = require('../../utils/api');
const { PERSONA_LABEL, PERSONA_COLOR } = require('../../utils/format');
const debug = require('../../utils/debug');

const PERSONAS = Object.keys(PERSONA_LABEL);

Page({
  data: {
    nickname: '',
    persona: 'fox',
    personas: PERSONAS,
    labels: PERSONA_LABEL,
    colors: PERSONA_COLOR,
    code: '',
    busy: false,
    showDebug: false,
    debugOn: false,
    debugIds: debug.IDS,
    debugOpenId: '',
  },

  onShow() {
    const app = getApp();
    const showDebug = debug.isDevelop();
    const debugOpenId = debug.getDebugOpenId();
    this.setData({
      nickname: app.globalData.nickname || '',
      persona: app.globalData.persona || 'fox',
      showDebug,
      debugOn: showDebug && !!debugOpenId,
      debugOpenId: showDebug ? debugOpenId : '',
    });
  },

  onNick(e) {
    this.setData({ nickname: e.detail.value });
  },

  onPersona(e) {
    this.setData({ persona: e.currentTarget.dataset.id });
  },

  onCode(e) {
    this.setData({ code: (e.detail.value || '').toUpperCase() });
  },

  toggleDebug() {
    if (!this.data.showDebug) return;
    const app = getApp();
    const next = !this.data.debugOn;
    if (!next) {
      app.applyDebugIdentity('');
      this.setData({ debugOn: false, debugOpenId: '' });
      wx.showToast({ title: '已关闭调试身份', icon: 'none' });
    } else {
      const id = this.data.debugOpenId || 'dbg_host';
      app.applyDebugIdentity(id);
      const nick = debug.NICK_MAP[id];
      this.setData({
        debugOn: true,
        debugOpenId: id,
        nickname: nick || this.data.nickname,
      });
      wx.showToast({ title: `身份 ${id}`, icon: 'none' });
    }
  },

  onPickDebugId(e) {
    if (!this.data.showDebug || !this.data.debugOn) return;
    const id = e.currentTarget.dataset.id || '';
    const app = getApp();
    app.applyDebugIdentity(id);
    const patch = { debugOpenId: id };
    if (id && debug.NICK_MAP[id]) patch.nickname = debug.NICK_MAP[id];
    this.setData(patch);
    wx.showToast({
      title: id ? `身份 ${id}` : '真实 openId',
      icon: 'none',
    });
  },

  persistProfile() {
    const app = getApp();
    const nickname = (this.data.nickname || '').trim() || '玩家';
    const persona = this.data.persona || 'fox';
    app.saveProfile({ nickname, persona });
    return { nickname, persona };
  },

  async onCreate() {
    if (this.data.busy) return;
    const profile = this.persistProfile();
    this.setData({ busy: true });
    try {
      // 确保调试身份已写入后再建房，避免房主座位落到真实 openId
      if (this.data.debugOn) {
        await getApp().applyDebugIdentity(this.data.debugOpenId || 'dbg_host');
      }
      const { room } = await api.createRoom({
        nickname: profile.nickname,
        persona: profile.persona,
        config: {
          sb: 1,
          bb: 2,
          maxSeats: 9,
          defaultBuyInBb: 100,
        },
      });
      // createRoom 会自动把当前身份坐到 0 号位
      wx.navigateTo({
        url: `/pages/lobby/lobby?roomId=${room._id}`,
      });
    } catch (e) {
      wx.showToast({ title: e.message || '创建失败', icon: 'none' });
    } finally {
      this.setData({ busy: false });
    }
  },

  async onJoin() {
    if (this.data.busy) return;
    const code = (this.data.code || '').trim();
    if (code.length < 4) {
      wx.showToast({ title: '请输入房号', icon: 'none' });
      return;
    }
    this.persistProfile();
    this.setData({ busy: true });
    try {
      if (this.data.debugOn) {
        await getApp().applyDebugIdentity(this.data.debugOpenId || '');
      }
      const data = await api.joinRoom({ code });
      if (data.me) getApp().globalData.openId = data.me;
      wx.navigateTo({
        url: `/pages/lobby/lobby?roomId=${data.room._id}`,
      });
    } catch (e) {
      wx.showToast({ title: e.message || '加入失败', icon: 'none' });
    } finally {
      this.setData({ busy: false });
    }
  },
});
