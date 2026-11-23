const api = require('../../utils/api');
const { PERSONA_LABEL, PERSONA_COLOR, stackBb } = require('../../utils/format');
const {
  identityLabel,
  effectiveOpenId,
  isDbgId,
} = require('../../utils/debug');

Page({
  data: {
    roomId: '',
    room: null,
    openId: '',
    identityText: '',
    mismatchText: '',
    isHost: false,
    canStart: false,
    mySeat: null,
    seatedCount: 0,
    sb: '1',
    bb: '2',
    buyInBb: '100',
    rebuyBb: '100',
    busy: false,
    labels: PERSONA_LABEL,
    colors: PERSONA_COLOR,
  },

  watcher: null,

  onLoad(query) {
    this.setData({ roomId: query.roomId || '' });
  },

  onShow() {
    const app = getApp();
    // 本地 dbg_* 优先，绝不被云端真实 OPENID 盖掉
    const openId = effectiveOpenId(null, app.globalData.openId);
    this.setData({
      openId,
      identityText: identityLabel(openId),
      mismatchText: this._mismatchLine(app),
    });
    this.watchRoom();
    const banner = this.selectComponent('#dbgBanner');
    if (banner && banner.refresh) banner.refresh();
  },

  _mismatchLine(app) {
    const m = app && app.globalData && app.globalData.debugMismatch;
    if (!m) return '';
    return `⚠ 云端 me=${identityLabel(m.server)} ≠ 本地 ${m.local}（请重传 login+api）`;
  },

  onUnload() {
    this.unwatch();
  },

  onHide() {
    // keep watcher while navigating to table in same session; table page has own watcher
  },

  unwatch() {
    if (this.watcher && this.watcher.close) {
      this.watcher.close();
      this.watcher = null;
    }
  },

  watchRoom() {
    this.unwatch();
    const { roomId } = this.data;
    if (!roomId || !wx.cloud) return;

    const db = wx.cloud.database();
    this.watcher = db
      .collection('rooms')
      .doc(roomId)
      .watch({
        onChange: (snap) => {
          const doc = (snap.docs && snap.docs[0]) || null;
          if (doc) this.applyRoom(doc);
        },
        onError: async () => {
          try {
            const data = await api.getRoom({ roomId });
            if (data.room) this.applyRoom(data.room, data.me);
          } catch (e) {
            console.warn(e);
          }
        },
      });

    api
      .getRoom({ roomId })
      .then((data) => {
        if (data.room) this.applyRoom(data.room, data.me);
      })
      .catch((e) => {
        wx.showToast({ title: e.message || '加载失败', icon: 'none' });
      });
  },

  /**
   * @param {object} room
   * @param {string} [serverMe] getRoom 返回的 me；若本地有 dbg_* 则忽略非 dbg 的 serverMe
   */
  applyRoom(room, serverMe) {
    const app = getApp();
    const openId = effectiveOpenId(serverMe, this.data.openId || app.globalData.openId);
    if (openId) app.globalData.openId = openId;

    const bb = room.config.bb;
    room.seats = (room.seats || []).map((s) => ({
      ...s,
      stackBb: stackBb(s.stack, bb),
    }));
    const mySeat = room.seats.find((s) => s.openId === openId && s.seated) || null;
    const seatedCount = room.seats.filter((s) => s.seated).length;

    // 展示名：调试开着时强制显示 dbg_* 字面，不用「Host」混淆
    let identityText = identityLabel(openId);
    if (isDbgId(openId)) identityText = openId;

    // 房主工具：me === hostOpenId；候场 status 为 lobby（方案里说的 waiting）
    const isHost = !!openId && room.hostOpenId === openId;
    const canStart =
      isHost &&
      (room.status === 'lobby' || room.status === 'waiting' || !room.hand) &&
      seatedCount >= 2;

    this.setData({
      room,
      openId,
      identityText,
      mismatchText: this._mismatchLine(app),
      isHost,
      canStart,
      mySeat,
      seatedCount,
      sb: String(room.config.sb),
      bb: String(room.config.bb),
      buyInBb: String(room.config.defaultBuyInBb),
      rebuyBb: mySeat ? String(Math.round(mySeat.stack / bb)) : String(room.config.defaultBuyInBb),
    });

    const banner = this.selectComponent('#dbgBanner');
    if (banner && banner.refresh) banner.refresh();
  },

  copyCode() {
    wx.setClipboardData({ data: this.data.room.code });
  },

  onSb(e) {
    this.setData({ sb: e.detail.value });
  },
  onBb(e) {
    this.setData({ bb: e.detail.value });
  },
  onBuyIn(e) {
    this.setData({ buyInBb: e.detail.value });
  },
  onRebuy(e) {
    this.setData({ rebuyBb: e.detail.value });
  },

  async saveConfig() {
    try {
      await api.updateConfig({
        roomId: this.data.roomId,
        config: { sb: Number(this.data.sb), bb: Number(this.data.bb) },
      });
      wx.showToast({ title: '已保存', icon: 'success' });
    } catch (e) {
      wx.showToast({ title: e.message || '失败', icon: 'none' });
    }
  },

  async onSeatTap(e) {
    const index = e.currentTarget.dataset.index;
    const seat = this.data.room.seats[index];
    if (seat.seated) return;
    if (this.data.mySeat) {
      wx.showToast({ title: '你已入座', icon: 'none' });
      return;
    }
    const app = getApp();
    const expectedId = effectiveOpenId(null, app.globalData.openId || this.data.openId);
    try {
      const data = await api.sitDown({
        roomId: this.data.roomId,
        seatIndex: index,
        nickname: app.globalData.nickname || '玩家',
        persona: app.globalData.persona || 'fox',
        buyInBb: Number(this.data.buyInBb) || 100,
      });
      const me = effectiveOpenId(data.me, expectedId);
      if (data.room) this.applyRoom(data.room, data.me);
      const label = isDbgId(me) ? me : identityLabel(me);
      wx.showToast({
        title: `已入座 · ${label}`,
        icon: 'none',
      });
    } catch (err) {
      wx.showToast({ title: err.message || '入座失败', icon: 'none' });
    }
  },

  async doRebuy() {
    try {
      await api.rebuy({
        roomId: this.data.roomId,
        stackBb: Number(this.data.rebuyBb),
      });
      wx.showToast({ title: '已更新', icon: 'success' });
    } catch (e) {
      wx.showToast({ title: e.message || '失败', icon: 'none' });
    }
  },

  goTable() {
    wx.navigateTo({
      url: `/pages/table/table?roomId=${this.data.roomId}`,
    });
  },

  async startHand() {
    if (this.data.busy) return;
    this.setData({ busy: true });
    try {
      await api.startHand({ roomId: this.data.roomId });
      wx.navigateTo({
        url: `/pages/table/table?roomId=${this.data.roomId}`,
      });
    } catch (e) {
      wx.showToast({ title: e.message || '无法开局', icon: 'none' });
    } finally {
      this.setData({ busy: false });
    }
  },

  async leave() {
    try {
      await api.leave({ roomId: this.data.roomId });
      wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/index/index' }) });
    } catch (e) {
      wx.showToast({ title: e.message || '失败', icon: 'none' });
    }
  },
});
