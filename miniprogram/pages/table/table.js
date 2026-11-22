const api = require('../../utils/api');
const {
  PERSONA_LABEL,
  PERSONA_COLOR,
  stackBb,
  streetLabel,
  countdownText,
} = require('../../utils/format');

/** 椭圆座位布局：百分比坐标（相对 felt-wrap） */
function seatPositions(count) {
  const positions = [];
  for (let i = 0; i < count; i++) {
    // 从底部自己视角开始，顺时针
    const angle = (Math.PI / 2) + (i / count) * Math.PI * 2;
    const x = 50 + Math.cos(angle) * 42;
    const y = 50 + Math.sin(angle) * 38;
    positions.push({
      left: `${x}%`,
      top: `${y}%`,
    });
  }
  return positions;
}

Page({
  data: {
    roomId: '',
    room: null,
    openId: '',
    isHost: false,
    layoutSeats: [],
    legal: null,
    countdown: '',
    timedOut: false,
    canForceCheck: false,
    potText: '0',
    streetText: '-',
    customBb: '2',
    potPicks: {},
  },

  watcher: null,
  timer: null,

  onLoad(query) {
    this.setData({ roomId: query.roomId || '' });
  },

  onShow() {
    const app = getApp();
    this.setData({ openId: app.globalData.openId || '' });
    this.watchRoom();
    this.startTicker();
  },

  onUnload() {
    this.cleanup();
  },

  onHide() {
    // keep ticker lightly; cleanup on unload
  },

  cleanup() {
    if (this.watcher && this.watcher.close) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  },

  startTicker() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), 250);
  },

  tick() {
    const room = this.data.room;
    if (!room || !room.hand || room.hand.actionDeadline <= 0) {
      if (this.data.countdown || this.data.timedOut) {
        this.setData({ countdown: '', timedOut: false });
      }
      return;
    }
    const text = countdownText(room.hand.actionDeadline);
    const timedOut = Date.now() > room.hand.actionDeadline;
    const actionSeat = room.seats[room.hand.actionSeat];
    const toCall = actionSeat
      ? room.hand.currentBet - actionSeat.bet
      : 0;
    this.setData({
      countdown: text,
      timedOut,
      canForceCheck: timedOut && toCall <= 0,
    });
  },

  watchRoom() {
    if (this.watcher && this.watcher.close) this.watcher.close();
    const { roomId } = this.data;
    if (!roomId) return;

    const db = wx.cloud.database();
    this.watcher = db
      .collection('rooms')
      .doc(roomId)
      .watch({
        onChange: (snap) => {
          const doc = (snap.docs && snap.docs[0]) || null;
          if (doc) this.applyRoom(doc);
        },
        onError: () => {
          api.getRoom({ roomId }).then((d) => {
            if (d.me) this.setData({ openId: d.me });
            if (d.room) this.applyRoom(d.room, d.legal);
          });
        },
      });

    api.getRoom({ roomId }).then((d) => {
      if (d.me) this.setData({ openId: d.me });
      if (d.room) this.applyRoom(d.room, d.legal);
    });
  },

  applyRoom(room, legalFromServer) {
    const app = getApp();
    const openId = this.data.openId || app.globalData.openId;
    const bb = room.config.bb;
    const n = room.seats.length;
    const pos = seatPositions(n);

    // SB/BB relative to button
    let sbIdx = null;
    let bbIdx = null;
    if (room.hand) {
      const occupied = (from) => {
        for (let i = 1; i <= n; i++) {
          const idx = (from + i) % n;
          if (room.seats[idx].seated && room.seats[idx].openId) return idx;
        }
        return null;
      };
      sbIdx = occupied(room.buttonSeat);
      bbIdx = occupied(sbIdx);
    }

    const layoutSeats = room.seats.map((s, i) => ({
      ...s,
      left: pos[i].left,
      top: pos[i].top,
      label: s.seated ? PERSONA_LABEL[s.persona] || '?' : String(i + 1),
      color: s.seated ? PERSONA_COLOR[s.persona] || '#555' : 'rgba(255,255,255,0.08)',
      stackBb: s.seated ? stackBb(s.stack, bb) : '',
      nickname: s.seated ? s.nickname : '',
      isMe: s.openId === openId,
      isAction: room.hand && room.hand.actionSeat === i,
      isDealer: room.buttonSeat === i && s.seated,
      isSB: sbIdx === i,
      isBB: bbIdx === i,
    }));

    if (room.hand && room.hand.sidePots) {
      room.hand.sidePots = room.hand.sidePots.map((p, index) => {
        const picked = (this.data.potPicks[index] || p.winnerSeatIndexes || []);
        const pickedMap = {};
        picked.forEach((x) => {
          pickedMap[x] = true;
        });
        return {
          ...p,
          eligibleText: (p.eligibleSeatIndexes || []).map((x) => x + 1).join(','),
          pickedMap,
        };
      });
    }

    let legal = legalFromServer || null;
    if (!legal && room.hand && room.status === 'playing') {
      const my = room.seats.find((s) => s.openId === openId && s.seated);
      if (my && room.hand.actionSeat === my.seatIndex) {
        // client-side mirror of legal actions (server authoritative on submit)
        const toCall = Math.max(0, room.hand.currentBet - my.bet);
        legal = {
          canFold: true,
          canCheck: toCall === 0,
          canCall: toCall > 0 && my.stack > 0,
          callAmount: Math.min(toCall, my.stack),
          canRaise: my.stack > toCall,
          minRaiseTo: room.hand.minRaiseTo,
          maxRaiseTo: my.bet + my.stack,
          canAllIn: my.stack > 0,
          timeBankRemaining: room.timeBankRemaining,
          deadline: room.hand.actionDeadline,
        };
      }
    }

    this.setData({
      room,
      openId,
      isHost: room.hostOpenId === openId,
      layoutSeats,
      legal,
      potText: room.hand ? String(room.hand.pot) : '0',
      streetText: room.hand ? streetLabel(room.hand.street) : '候场',
      customBb: String(bb),
    });
  },

  onCustomBb(e) {
    this.setData({ customBb: e.detail.value });
  },

  async doFold() {
    await this.move('fold');
  },
  async doCheck() {
    await this.move('check');
  },
  async doCall() {
    await this.move('call');
  },
  async doAllIn() {
    await this.move('allin');
  },

  async raisePot(e) {
    const f = Number(e.currentTarget.dataset.f);
    await this.move('raise', { potFraction: f });
  },

  async raiseBb() {
    const bbMult = Number(this.data.customBb);
    if (!(bbMult > 0)) {
      wx.showToast({ title: '输入 bb 倍数', icon: 'none' });
      return;
    }
    await this.move('raise', { bbMult });
  },

  async move(playerAction, extra = {}) {
    try {
      const data = await api.action({
        roomId: this.data.roomId,
        playerAction,
        ...extra,
      });
      if (data.room) this.applyRoom(data.room, data.legal);
    } catch (e) {
      wx.showToast({ title: e.message || '行动失败', icon: 'none' });
    }
  },

  async useTimeBank() {
    try {
      const data = await api.timeBank({ roomId: this.data.roomId });
      if (data.room) this.applyRoom(data.room);
    } catch (e) {
      wx.showToast({ title: e.message || '无法延时', icon: 'none' });
    }
  },

  async forceFold() {
    try {
      await api.forceAction({ roomId: this.data.roomId, force: 'fold' });
    } catch (e) {
      wx.showToast({ title: e.message || '失败', icon: 'none' });
    }
  },

  async forceCheck() {
    try {
      await api.forceAction({ roomId: this.data.roomId, force: 'check' });
    } catch (e) {
      wx.showToast({ title: e.message || '失败', icon: 'none' });
    }
  },

  async undo() {
    try {
      await api.correctUndo({ roomId: this.data.roomId });
      wx.showToast({ title: '已撤销', icon: 'success' });
    } catch (e) {
      wx.showToast({ title: e.message || '无法撤销', icon: 'none' });
    }
  },

  async startHand() {
    try {
      await api.startHand({ roomId: this.data.roomId });
      this.setData({ potPicks: {} });
    } catch (e) {
      wx.showToast({ title: e.message || '无法开局', icon: 'none' });
    }
  },

  toggleWinner(e) {
    const pot = Number(e.currentTarget.dataset.pot);
    const seat = Number(e.currentTarget.dataset.seat);
    const potPicks = { ...this.data.potPicks };
    const list = potPicks[pot] ? [...potPicks[pot]] : [];
    const idx = list.indexOf(seat);
    if (idx >= 0) list.splice(idx, 1);
    else list.push(seat);
    potPicks[pot] = list;
    this.setData({ potPicks }, () => {
      if (this.data.room) this.applyRoom(this.data.room, this.data.legal);
    });
  },

  async confirmWinners() {
    const pots = this.data.room.hand.sidePots || [];
    const potWinners = pots.map((p, potIndex) => ({
      potIndex,
      winnerSeatIndexes: this.data.potPicks[potIndex] || p.winnerSeatIndexes || [],
    }));
    try {
      await api.pickWinners({ roomId: this.data.roomId, potWinners });
      this.setData({ potPicks: {} });
    } catch (e) {
      wx.showToast({ title: e.message || '结算失败', icon: 'none' });
    }
  },

  openRebuy() {
    const bb = this.data.room.config.bb;
    wx.showModal({
      title: '改自己的筹码 (bb)',
      editable: true,
      placeholderText: '例如 100',
      success: async (res) => {
        if (!res.confirm) return;
        const stackBb = Number(res.content);
        if (!(stackBb >= 0)) return;
        try {
          await api.rebuy({ roomId: this.data.roomId, stackBb });
        } catch (e) {
          wx.showToast({ title: e.message || '失败', icon: 'none' });
        }
      },
    });
  },

  goLobby() {
    wx.navigateTo({
      url: `/pages/lobby/lobby?roomId=${this.data.roomId}`,
    });
  },

  async leave() {
    try {
      await api.leave({ roomId: this.data.roomId });
      wx.showToast({ title: '将于本手结束后离桌', icon: 'none' });
    } catch (e) {
      wx.showToast({ title: e.message || '失败', icon: 'none' });
    }
  },
});
