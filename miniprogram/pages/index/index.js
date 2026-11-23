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
    // 调试开着时 getDebugOpenId 保证 dbg_*
    const debugOpenId = debugOn ? debug.getDebugOpenId() : '';
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
      // 开启即默认 dbg_host 并持久化 —— 绝不能停在「真实 openId」
      const id = debug.DEFAULT_DBG;
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
    let id = e.currentTarget.dataset.id || '';
    // 只允许 dbg_*；脏值回落 dbg_host
    if (!debug.isDbgId(id)) id = debug.DEFAULT_DBG;
    const app = getApp();
    await app.applyDebugIdentity(id, { turnOn: true });
    const patch = { debugOpenId: id };
    if (debug.NICK_MAP[id]) {
      patch.nickname = debug.NICK_MAP[id];
      app.saveProfile({ nickname: patch.nickname, persona: this.data.persona });
    }
    this.setData(patch);
    this.refreshDebugUi();
    wx.showToast({
      title: `调试身份: ${id}`,
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

  _ensureDbgOrThrow(response, expected) {
    const bad = debug.assertResolvedDebugId(response, expected);
    if (bad) {
      const src =
        (response && response.debugMeta && response.debugMeta.source) || '';
      throw new Error(
        `云函数未接受调试身份，请重传 api（期望 ${bad.expected}，得到 ${bad.got}，SOURCE=${src || '空'}）`
      );
    }
    const me = (response && (response.resolvedOpenId || response.me)) || '';
    if (!String(me).startsWith('dbg_')) {
      throw new Error(
        `云函数未接受调试身份，请重传 api（me=${me || '空'} 不是 dbg_*）`
      );
    }
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
      const expectDbg = this.data.debugOn
        ? this.data.debugOpenId || debug.DEFAULT_DBG
        : '';
      if (expectDbg) {
        await getApp().applyDebugIdentity(expectDbg, { turnOn: true });
      }
      const out = await api.createRoom(
        {
          nickname: profile.nickname,
          persona: profile.persona,
          config: {
            sb: 1,
            bb: 2,
            maxSeats: 9,
            defaultBuyInBb: 100,
          },
        },
        expectDbg ? { debugOpenId: expectDbg, expectDebugId: expectDbg } : {}
      );
      if (expectDbg) this._ensureDbgOrThrow(out, expectDbg);
      wx.navigateTo({
        url: `/pages/lobby/lobby?roomId=${out.room._id}`,
      });
    } catch (e) {
      if (e.code === 'DEBUG_ID_REJECTED' || /未接受调试身份/.test(e.message || '')) {
        wx.showModal({
          title: '调试身份未生效',
          content: e.message || '请重传 login+api 云函数',
          showCancel: false,
        });
      } else {
        wx.showToast({ title: e.message || '创建失败', icon: 'none' });
      }
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
      const expectDbg = this.data.debugOn
        ? this.data.debugOpenId || debug.DEFAULT_DBG
        : '';
      if (expectDbg) {
        await getApp().applyDebugIdentity(expectDbg, { turnOn: true });
      }
      const data = await api.joinRoom(
        { code },
        expectDbg ? { debugOpenId: expectDbg, expectDebugId: expectDbg } : {}
      );
      if (expectDbg) this._ensureDbgOrThrow(data, expectDbg);
      wx.navigateTo({
        url: `/pages/lobby/lobby?roomId=${data.room._id}`,
      });
    } catch (e) {
      if (e.code === 'DEBUG_ID_REJECTED' || /未接受调试身份/.test(e.message || '')) {
        wx.showModal({
          title: '调试身份未生效',
          content: e.message || '请重传 login+api 云函数',
          showCancel: false,
        });
      } else {
        wx.showToast({ title: e.message || '加入失败', icon: 'none' });
      }
    } finally {
      this.setData({ busy: false });
    }
  },

  /**
   * 一键：dbg_host 建房占座0 → dbg_p2 加入占座1 → 切回 dbg_host 进候场。
   * 每步校验 response.me / resolvedOpenId 以 dbg_ 开头；失败大声报错，绝不静默用真实 openId 占多席。
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
        { debugOpenId: 'dbg_host', expectDebugId: 'dbg_host' }
      );
      this._ensureDbgOrThrow(created, 'dbg_host');
      if (!String(created.me || '').startsWith('dbg_')) {
        throw new Error('云函数未接受调试身份，请重传 api');
      }
      const roomId = created.room._id;
      const code = created.room.code;

      await app.applyDebugIdentity('dbg_p2', { turnOn: true });
      app.saveProfile({ nickname: '玩家2', persona: this.data.persona || 'fox' });

      const joined = await api.joinRoom(
        { code },
        { debugOpenId: 'dbg_p2', expectDebugId: 'dbg_p2' }
      );
      this._ensureDbgOrThrow(joined, 'dbg_p2');

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
        { debugOpenId: 'dbg_p2', expectDebugId: 'dbg_p2' }
      );
      this._ensureDbgOrThrow(sat, 'dbg_p2');

      // 确认两席 openId 不同
      const seated = (sat.room.seats || []).filter((s) => s.seated);
      const ids = seated.map((s) => s.openId);
      if (seated.length < 2 || ids[0] === ids[1]) {
        throw new Error(
          '云函数未接受调试身份，两席仍是同一 openId。请重传 api'
        );
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
        content: e.message || '云函数未接受调试身份，请重传 api',
        showCancel: false,
      });
      this.refreshDebugUi();
    } finally {
      this.setData({ busy: false });
    }
  },
});
