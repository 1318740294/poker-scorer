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
    mismatchText: '',
  },

  onShow() {
    this.refreshDebugUi();
  },

  refreshDebugUi() {
    const app = getApp();
    const showDebug = debug.isDebugUiEnabled();
    const debugOn = showDebug && debug.isDebugModeOn();
    const debugOpenId = debug.getDebugOpenId();
    let mismatchText = '';
    if (app.globalData.debugMismatch) {
      const m = app.globalData.debugMismatch;
      mismatchText = `云端仍返回 ${debug.identityLabel(m.server)}，本地要 ${m.local}。请重传 login+api 云函数。`;
    }
    this.setData({
      nickname: app.globalData.nickname || '',
      persona: app.globalData.persona || 'fox',
      showDebug,
      debugOn,
      debugOpenId: showDebug ? debugOpenId : '',
      mismatchText,
    });
    const banner = this.selectComponent('#dbgBanner');
    if (banner && banner.refresh) banner.refresh();
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

  async toggleDebug() {
    if (!this.data.showDebug) return;
    const app = getApp();
    const next = !this.data.debugOn;
    if (!next) {
      await app.clearDebugIdentity();
      this.setData({ debugOn: false, debugOpenId: '', mismatchText: '' });
      wx.showToast({ title: '已关闭调试身份', icon: 'none' });
    } else {
      // 开启即默认 dbg_host 并持久化
      const id = 'dbg_host';
      await app.applyDebugIdentity(id, { turnOn: true });
      const nick = debug.NICK_MAP[id];
      if (nick) {
        app.saveProfile({ nickname: nick, persona: this.data.persona });
      }
      this.setData({
        debugOn: true,
        debugOpenId: id,
        nickname: nick || this.data.nickname,
      });
      this.refreshDebugUi();
      wx.showToast({ title: `调试身份: ${id}`, icon: 'none' });
    }
    const banner = this.selectComponent('#dbgBanner');
    if (banner && banner.refresh) banner.refresh();
  },

  async onPickDebugId(e) {
    if (!this.data.showDebug || !this.data.debugOn) return;
    const id = e.currentTarget.dataset.id || '';
    const app = getApp();
    await app.applyDebugIdentity(id, { turnOn: true });
    const patch = { debugOpenId: id };
    if (id && debug.NICK_MAP[id]) {
      patch.nickname = debug.NICK_MAP[id];
      app.saveProfile({ nickname: patch.nickname, persona: this.data.persona });
    }
    this.setData(patch);
    this.refreshDebugUi();
    wx.showToast({
      title: id ? `调试身份: ${id}` : '真实 openId',
      icon: 'none',
    });
    const banner = this.selectComponent('#dbgBanner');
    if (banner && banner.refresh) banner.refresh();
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
    if (this.data.showDebug && !this.data.debugOn) {
      wx.showToast({
        title: '单人自测请先开启调试身份，或用「本机双人自测」',
        icon: 'none',
        duration: 2800,
      });
    }
    const profile = this.persistProfile();
    this.setData({ busy: true });
    try {
      if (this.data.debugOn) {
        await getApp().applyDebugIdentity(this.data.debugOpenId || 'dbg_host', {
          turnOn: true,
        });
      }
      const { room, me, debugMeta } = await api.createRoom({
        nickname: profile.nickname,
        persona: profile.persona,
        config: {
          sb: 1,
          bb: 2,
          maxSeats: 9,
          defaultBuyInBb: 100,
        },
      });
      if (this.data.debugOn && debugMeta && !debugMeta.debugApplied) {
        wx.showModal({
          title: '调试身份未生效',
          content: `请求 ${debugMeta.requested}，云端解析为 ${me}（SOURCE=${debugMeta.source || '空'}）。请重新上传并部署 login + api 云函数。`,
          showCancel: false,
        });
      }
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
        await getApp().applyDebugIdentity(this.data.debugOpenId || '', {
          turnOn: true,
        });
      }
      const data = await api.joinRoom({ code });
      wx.navigateTo({
        url: `/pages/lobby/lobby?roomId=${data.room._id}`,
      });
    } catch (e) {
      wx.showToast({ title: e.message || '加入失败', icon: 'none' });
    } finally {
      this.setData({ busy: false });
    }
  },

  /**
   * 一键：dbg_host 建房占座0 → dbg_p2 加入占座1 → 切回 dbg_host 进候场。
   * 每步用 opts.debugOpenId 直传，避免 storage 竞态。
   */
  async onDualSelfTest() {
    if (this.data.busy || !this.data.showDebug) return;
    const app = getApp();
    this.setData({ busy: true });
    try {
      await app.applyDebugIdentity('dbg_host', { turnOn: true });
      app.saveProfile({ nickname: 'Host', persona: this.data.persona || 'fox' });

      const created = await api.createRoom(
        {
          nickname: 'Host',
          persona: this.data.persona || 'fox',
          config: { sb: 1, bb: 2, maxSeats: 9, defaultBuyInBb: 100 },
        },
        { debugOpenId: 'dbg_host' }
      );
      if (!created.debugMeta || !created.debugMeta.debugApplied) {
        const meta = created.debugMeta || {};
        throw new Error(
          `云端未采用 dbg_host（me=${created.me}, SOURCE=${meta.source || '空'}）。请重传 login+api`
        );
      }
      const roomId = created.room._id;
      const code = created.room.code;

      await app.applyDebugIdentity('dbg_p2', { turnOn: true });
      app.saveProfile({ nickname: '玩家2', persona: this.data.persona || 'fox' });

      const joined = await api.joinRoom({ code }, { debugOpenId: 'dbg_p2' });
      if (!joined.debugMeta || !joined.debugMeta.debugApplied) {
        throw new Error('云端未采用 dbg_p2，请重传 api 云函数');
      }

      // 找第一个空位（通常是 1）
      const empty = (joined.room.seats || []).find((s) => !s.seated);
      if (!empty) throw new Error('没有空位可坐');

      const sat = await api.sitDown(
        {
          roomId,
          seatIndex: empty.seatIndex,
          nickname: '玩家2',
          persona: this.data.persona || 'fox',
          buyInBb: 100,
        },
        { debugOpenId: 'dbg_p2' }
      );
      if (!sat.debugMeta || !sat.debugMeta.debugApplied) {
        throw new Error('dbg_p2 入座未生效，请重传 api');
      }

      await app.applyDebugIdentity('dbg_host', { turnOn: true });
      app.saveProfile({ nickname: 'Host', persona: this.data.persona || 'fox' });
      this.setData({
        debugOn: true,
        debugOpenId: 'dbg_host',
        nickname: 'Host',
        code,
      });

      wx.showToast({ title: `已占 2 席 · ${code}`, icon: 'none' });
      wx.navigateTo({
        url: `/pages/lobby/lobby?roomId=${roomId}`,
      });
    } catch (e) {
      console.error('dual self test', e);
      wx.showModal({
        title: '双人自测失败',
        content: e.message || '未知错误',
        showCancel: false,
      });
      this.refreshDebugUi();
    } finally {
      this.setData({ busy: false });
    }
  },
});
