const api = require('../../utils/api');
const { PERSONA_LABEL, PERSONA_COLOR } = require('../../utils/format');

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
  },

  onShow() {
    const app = getApp();
    this.setData({
      nickname: app.globalData.nickname || '',
      persona: app.globalData.persona || 'fox',
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
      const { room } = await api.joinRoom({ code });
      wx.navigateTo({
        url: `/pages/lobby/lobby?roomId=${room._id}`,
      });
    } catch (e) {
      wx.showToast({ title: e.message || '加入失败', icon: 'none' });
    } finally {
      this.setData({ busy: false });
    }
  },
});
