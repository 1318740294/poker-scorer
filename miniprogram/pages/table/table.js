const api = require('../../utils/api');
const {
  PERSONA_LABEL,
  PERSONA_COLOR,
  personaColor,
  stackBb,
  streetLabel,
  countdownText,
} = require('../../utils/format');
const { effectiveOpenId } = require('../../utils/debug');

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

function seatColor(persona) {
  if (PERSONA_COLOR && PERSONA_COLOR[persona]) return PERSONA_COLOR[persona];
  return personaColor(persona);
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
    loadError: '',
    loading: true,
  },

  watcher: null,
  timer: null,

  onLoad(query) {
    // 同步写入 this.data，避免 onShow 早于 setData 刷盘时 roomId 仍为空
    const roomId = (query && query.roomId) || '';
    this.roomId = roomId;
    this.setData({ roomId, loading: !!roomId, loadError: roomId ? '' : '缺少房间参数' });
  },

  onShow() {
    const app = getApp();
    const openId = effectiveOpenId(null, app.globalData.openId);
    this.setData({ openId });
    this.watchRoom();
    this.startTicker();
    const banner = this.selectComponent('#dbgBanner');
    if (banner && banner.refresh) banner.refresh();
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

  resolveRoomId() {
    return this.roomId || this.data.roomId || '';
  },

  watchRoom() {
    if (this.watcher && this.watcher.close) this.watcher.close();
    const roomId = this.resolveRoomId();
    if (!roomId) {
      this.setData({ loading: false, loadError: '缺少房间参数', room: null });
      return;
    }
    if (!this.data.roomId) this.setData({ roomId });
    this.setData({ loading: !this.data.room, loadError: '' });

    const fetchOnce = () =>
      api
        .getRoom({ roomId })
        .then((d) => {
          if (d.room) this.applyRoom(d.room, d.legal, d.me);
          else {
            this.setData({
              loading: false,
              loadError: '房间不存在或已解散',
              room: null,
            });
          }
        })
        .catch((e) => {
          console.warn('[table] getRoom failed', e);
          this.setData({
            loading: false,
            loadError: (e && e.message) || '加载牌桌失败',
            room: null,
          });
        });

    if (wx.cloud) {
      try {
        const db = wx.cloud.database();
        this.watcher = db
          .collection('rooms')
          .doc(roomId)
          .watch({
            onChange: (snap) => {
              const doc = (snap.docs && snap.docs[0]) || null;
              if (doc) {
                try {
                  this.applyRoom(doc);
                } catch (e) {
                  console.warn('[table] applyRoom from watch failed', e);
                  fetchOnce();
                }
              }
            },
            onError: () => {
              fetchOnce();
            },
          });
      } catch (e) {
        console.warn('[table] watch setup failed', e);
      }
    }

    fetchOnce();
  },

  applyRoom(room, legalFromServer, serverMe) {
    if (!room || !room.config || !Array.isArray(room.seats)) {
      this.setData({
        loading: false,
        loadError: '房间数据异常',
        room: null,
      });
      return;
    }

    const app = getApp();
    const openId = effectiveOpenId(
      serverMe,
      this.data.openId || app.globalData.openId
    );
    if (openId) app.globalData.openId = openId;
    const bb = room.config.bb;
    const n = room.seats.length;
    const pos = seatPositions(n);

    // SB/BB relative to button
    let sbIdx = null;
    let bbIdx = null;
    if (room.hand) {
      const occupied = (from) => {
        if (from == null) return null;
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
      color: s.seated ? seatColor(s.persona) : 'rgba(255,255,255,0.08)',
      stackBb: s.seated ? stackBb(s.stack, bb) : '',
      nickname: s.seated ? s.nickname : '',
      isMe: s.openId === openId,
      isAction: !!(room.hand && room.hand.actionSeat === i),
      isDealer: room.buttonSeat === i && s.seated,
      isSB: sbIdx === i,
      isBB: bbIdx === i,
    }));

    // 拷贝 hand，避免原地改 watch 文档引用
    let hand = room.hand;
    if (hand && Array.isArray(hand.sidePots)) {
      hand = {
        ...hand,
        sidePots: hand.sidePots.map((p, index) => {
          const picked = this.data.potPicks[index] || p.winnerSeatIndexes || [];
          const pickedMap = {};
          picked.forEach((x) => {
            pickedMap[x] = true;
          });
          return {
            ...p,
            eligibleText: (p.eligibleSeatIndexes || []).map((x) => x + 1).join(','),
            pickedMap,
          };
        }),
      };
    }
    const viewRoom = hand === room.hand ? room : { ...room, hand };

    let legal = legalFromServer || null;
    if (!legal && viewRoom.hand && viewRoom.status === 'playing') {
      const my = viewRoom.seats.find((s) => s.openId === openId && s.seated);
      if (my && viewRoom.hand.actionSeat === my.seatIndex) {
        // client-side mirror of legal actions (server authoritative on submit)
        const toCall = Math.max(0, viewRoom.hand.currentBet - my.bet);
        legal = {
          canFold: true,
          canCheck: toCall === 0,
          canCall: toCall > 0 && my.stack > 0,
          callAmount: Math.min(toCall, my.stack),
          canRaise: my.stack > toCall,
          minRaiseTo: viewRoom.hand.minRaiseTo,
          maxRaiseTo: my.bet + my.stack,
          canAllIn: my.stack > 0,
          timeBankRemaining: viewRoom.timeBankRemaining,
          deadline: viewRoom.hand.actionDeadline,
        };
      }
    }

    this.setData({
      room: viewRoom,
      openId,
      isHost: viewRoom.hostOpenId === openId,
      layoutSeats,
      legal,
      potText: viewRoom.hand ? String(viewRoom.hand.pot) : '0',
      streetText: viewRoom.hand ? streetLabel(viewRoom.hand.street) : '候场',
      customBb: String(bb),
      loading: false,
      loadError: '',
    });
  },

  retryLoad() {
    this.setData({ loading: true, loadError: '' });
    this.watchRoom();
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
        roomId: this.resolveRoomId(),
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
      const data = await api.timeBank({ roomId: this.resolveRoomId() });
      if (data.room) this.applyRoom(data.room);
    } catch (e) {
      wx.showToast({ title: e.message || '无法延时', icon: 'none' });
    }
  },

  async forceFold() {
    try {
      await api.forceAction({ roomId: this.resolveRoomId(), force: 'fold' });
    } catch (e) {
      wx.showToast({ title: e.message || '失败', icon: 'none' });
    }
  },

  async forceCheck() {
    try {
      await api.forceAction({ roomId: this.resolveRoomId(), force: 'check' });
    } catch (e) {
      wx.showToast({ title: e.message || '失败', icon: 'none' });
    }
  },

  async undo() {
    try {
      await api.correctUndo({ roomId: this.resolveRoomId() });
      wx.showToast({ title: '已撤销', icon: 'success' });
    } catch (e) {
      wx.showToast({ title: e.message || '无法撤销', icon: 'none' });
    }
  },

  async startHand() {
    try {
      await api.startHand({ roomId: this.resolveRoomId() });
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
      await api.pickWinners({ roomId: this.resolveRoomId(), potWinners });
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
        const stackBbVal = Number(res.content);
        if (!(stackBbVal >= 0)) return;
        try {
          await api.rebuy({ roomId: this.resolveRoomId(), stackBb: stackBbVal });
        } catch (e) {
          wx.showToast({ title: e.message || '失败', icon: 'none' });
        }
      },
    });
  },

  goLobby() {
    wx.navigateTo({
      url: `/pages/lobby/lobby?roomId=${this.resolveRoomId()}`,
    });
  },

  async leave() {
    try {
      await api.leave({ roomId: this.resolveRoomId() });
      wx.showToast({ title: '将于本手结束后离桌', icon: 'none' });
    } catch (e) {
      wx.showToast({ title: e.message || '失败', icon: 'none' });
    }
  },
});
