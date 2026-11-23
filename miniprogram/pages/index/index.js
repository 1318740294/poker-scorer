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
    const next = !this.data.debugOn;
    if (!next) {
      debug.setDebugOpenId('');
      this.setData({ debugOn: false, debugOpenId: '' });
    } else {
      const id = this.data.debugOpenId || 'dbg_host';
      debug.setDebugOpenId(id);
      this.setData({ debugOn: true, debugOpenId: id });
    }
    getApp().ensureLogin();
  },

  onPickDebugId(e) {
    if (!this.data.showDebug || !this.data.debugOn) return;
    const id = e.currentTarget.dataset.id || '';
    debug.setDebugOpenId(id);
    this.setData({ debugOpenId: id });
    const nickMap = {
      dbg_host: 'Host',
      dbg_p2: '玩家2',
      dbg_p3: '玩家3',
      dbg_p4: '玩家4',
    };
    if (id && nickMap[id]) {
      this.setData({ nickname: nickMap[id] });
    }
    getApp().ensureLogin();
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
