const api = require('../../utils/api');
const { PERSONA_LABEL, PERSONA_COLOR, stackBb } = require('../../utils/format');

Page({
  data: {
    roomId: '',
    room: null,
    openId: '',
    isHost: false,
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
    this.setData({ openId: app.globalData.openId || '' });
    this.watchRoom();
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
          // fallback poll once
          try {
            const data = await api.getRoom({ roomId });
            if (data.room) this.applyRoom(data.room);
            if (data.me) this.setData({ openId: data.me });
          } catch (e) {
            console.warn(e);
          }
        },
      });

    api.getRoom({ roomId }).then((data) => {
      if (data.me) this.setData({ openId: data.me });
      if (data.room) this.applyRoom(data.room);
    }).catch((e) => {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    });
  },

  applyRoom(room) {
    const app = getApp();
    const openId = this.data.openId || app.globalData.openId;
    const bb = room.config.bb;
    room.seats = (room.seats || []).map((s) => ({
      ...s,
      stackBb: stackBb(s.stack, bb),
    }));
    const mySeat = room.seats.find((s) => s.openId === openId && s.seated) || null;
    const seatedCount = room.seats.filter((s) => s.seated).length;
    this.setData({
      room,
      openId,
      isHost: room.hostOpenId === openId,
      mySeat,
      seatedCount,
      sb: String(room.config.sb),
      bb: String(room.config.bb),
      buyInBb: String(room.config.defaultBuyInBb),
      rebuyBb: mySeat ? String(Math.round(mySeat.stack / bb)) : String(room.config.defaultBuyInBb),
    });

    if (room.status === 'playing' || room.status === 'showdown') {
      // auto enter table view
    }
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
    try {
      await api.sitDown({
        roomId: this.data.roomId,
        seatIndex: index,
        nickname: app.globalData.nickname || '玩家',
        persona: app.globalData.persona || 'fox',
        buyInBb: Number(this.data.buyInBb) || 100,
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
