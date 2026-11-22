/**
 * 德州扑克现金局记分引擎（无牌面，仅记分）
 * 规则对齐 docs/poker-scorer-plan.md
 */
const { DEFAULTS, STREETS } = require('./constants');

function now() {
  return Date.now();
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function emptySeat(seatIndex) {
  return {
    seatIndex,
    openId: null,
    nickname: '',
    persona: 'fox',
    stack: 0,
    seated: false,
    bet: 0,
    contributed: 0,
    folded: false,
    allIn: false,
    actedThisStreet: false,
  };
}

function createRoom({ hostOpenId, nickname, persona, config = {} }) {
  const maxSeats = clamp(
    config.maxSeats || DEFAULTS.defaultMaxSeats,
    DEFAULTS.minSeats,
    DEFAULTS.maxSeats
  );
  const bb = Number(config.bb) > 0 ? Number(config.bb) : DEFAULTS.bb;
  const sb = Number(config.sb) > 0 ? Number(config.sb) : Math.max(1, Math.floor(bb / 2));
  const defaultBuyInBb = Number(config.defaultBuyInBb) || DEFAULTS.defaultBuyInBb;
  const buyIn = bb * defaultBuyInBb;

  const seats = Array.from({ length: maxSeats }, (_, i) => emptySeat(i));
  seats[0] = {
    ...emptySeat(0),
    openId: hostOpenId,
    nickname: nickname || '房主',
    persona: persona || 'fox',
    stack: buyIn,
    seated: true,
  };

  return {
    code: '',
    hostOpenId,
    status: 'lobby',
    config: {
      sb,
      bb,
      defaultBuyInBb,
      minBuyInBb: Number(config.minBuyInBb) || DEFAULTS.minBuyInBb,
      actionTimeoutSec: Number(config.actionTimeoutSec) || DEFAULTS.actionTimeoutSec,
      maxSeats,
    },
    seats,
    buttonSeat: 0,
    hand: null,
    timeBankRemaining: DEFAULTS.timeBankCards,
    pendingLeave: [],
    actionLog: [],
    createdAt: now(),
    updatedAt: now(),
  };
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function seatedPlayers(room) {
  return room.seats.filter((s) => s.seated && s.openId);
}

function livePlayers(room) {
  return room.seats.filter((s) => s.seated && s.openId && !s.folded);
}

function canActPlayers(room) {
  return livePlayers(room).filter((s) => !s.allIn && s.stack > 0);
}

function nextOccupiedSeat(room, fromSeat, predicate) {
  const n = room.seats.length;
  for (let i = 1; i <= n; i++) {
    const idx = (fromSeat + i) % n;
    const seat = room.seats[idx];
    if (seat.seated && seat.openId && (!predicate || predicate(seat))) {
      return idx;
    }
  }
  return null;
}

function seatOf(room, openId) {
  return room.seats.find((s) => s.openId === openId && s.seated) || null;
}

function pushLog(room, entry) {
  room.actionLog = (room.actionLog || []).concat([{ ...entry, at: now() }]).slice(-40);
}

function snapshotForUndo(room) {
  return {
    seats: clone(room.seats),
    hand: clone(room.hand),
    status: room.status,
    buttonSeat: room.buttonSeat,
    timeBankRemaining: room.timeBankRemaining,
    pendingLeave: clone(room.pendingLeave || []),
  };
}

/** 入座 */
function sitDown(room, { openId, nickname, persona, seatIndex, buyInBb }) {
  if (seatOf(room, openId)) {
    throw new Error('你已入座');
  }
  const seatedCount = seatedPlayers(room).length;
  if (seatedCount >= room.config.maxSeats) {
    throw new Error('座位已满');
  }
  let target = room.seats[seatIndex];
  if (!target || target.seated) {
    target = room.seats.find((s) => !s.seated);
  }
  if (!target) throw new Error('没有空位');

  const bb = room.config.bb;
  const buyBb = Number(buyInBb) || room.config.defaultBuyInBb;
  if (buyBb < room.config.minBuyInBb) {
    throw new Error(`最小买入 ${room.config.minBuyInBb} bb`);
  }

  Object.assign(target, {
    openId,
    nickname: nickname || '玩家',
    persona: persona || 'fox',
    stack: buyBb * bb,
    seated: true,
    bet: 0,
    contributed: 0,
    folded: false,
    allIn: false,
    actedThisStreet: false,
  });
  room.updatedAt = now();
  return room;
}

/** 申请离桌：本手结束后带走 */
function requestLeave(room, openId) {
  const seat = seatOf(room, openId);
  if (!seat) throw new Error('未入座');
  if (room.status === 'lobby' || !room.hand) {
    clearSeat(seat);
    if (openId === room.hostOpenId) {
      // 房主离桌：转让给下一位入座者
      const next = seatedPlayers(room)[0];
      room.hostOpenId = next ? next.openId : room.hostOpenId;
    }
  } else {
    if (!(room.pendingLeave || []).includes(openId)) {
      room.pendingLeave = (room.pendingLeave || []).concat([openId]);
    }
  }
  room.updatedAt = now();
  return room;
}

function clearSeat(seat) {
  const idx = seat.seatIndex;
  Object.assign(seat, emptySeat(idx));
}

function applyPendingLeaves(room) {
  const leaves = room.pendingLeave || [];
  if (!leaves.length) return;
  leaves.forEach((openId) => {
    const seat = room.seats.find((s) => s.openId === openId);
    if (seat) clearSeat(seat);
  });
  room.pendingLeave = [];
  if (!room.seats.some((s) => s.openId === room.hostOpenId && s.seated)) {
    const next = seatedPlayers(room)[0];
    if (next) room.hostOpenId = next.openId;
  }
}

/** 自由 rebuy：随时改筹码（记分） */
function rebuy(room, { openId, stackBb, isHost, targetOpenId }) {
  const targetId = isHost && targetOpenId ? targetOpenId : openId;
  const seat = seatOf(room, targetId);
  if (!seat) throw new Error('目标未入座');
  if (!isHost && targetId !== openId) throw new Error('只能改自己的筹码');
  const stack = Math.max(0, Math.round(Number(stackBb) * room.config.bb));
  seat.stack = stack;
  if (seat.allIn && seat.stack > 0) seat.allIn = false;
  room.updatedAt = now();
  pushLog(room, { type: 'rebuy', openId, targetOpenId: targetId, stack });
  return room;
}

function resetHandTransient(seat) {
  seat.bet = 0;
  seat.contributed = 0;
  seat.folded = false;
  seat.allIn = false;
  seat.actedThisStreet = false;
}

function postBlind(room, seatIndex, amount) {
  const seat = room.seats[seatIndex];
  const pay = Math.min(seat.stack, amount);
  seat.stack -= pay;
  seat.bet += pay;
  seat.contributed += pay;
  room.hand.pot += pay;
  if (seat.stack === 0) seat.allIn = true;
  return pay;
}

/** 开一手：自动扣 SB/BB */
function startHand(room, actorOpenId) {
  if (actorOpenId && actorOpenId !== room.hostOpenId) {
    throw new Error('仅房主可开新手');
  }
  applyPendingLeaves(room);
  const players = seatedPlayers(room);
  if (players.length < DEFAULTS.minSeats) {
    throw new Error(`至少 ${DEFAULTS.minSeats} 人入座才能开局`);
  }

  room.seats.forEach(resetHandTransient);

  if (room.status === 'lobby') {
    room.buttonSeat = players[0].seatIndex;
  } else {
    const nextBtn = nextOccupiedSeat(room, room.buttonSeat);
    if (nextBtn != null) room.buttonSeat = nextBtn;
  }

  const { sb, bb, actionTimeoutSec } = room.config;
  const handNumber = (room.hand && room.hand.handNumber ? room.hand.handNumber : 0) + 1;

  room.hand = {
    handNumber,
    street: 'preflop',
    pot: 0,
    sidePots: [],
    currentBet: 0,
    lastRaiseSize: bb,
    actionSeat: null,
    actionStartedAt: 0,
    actionDeadline: 0,
    minRaiseTo: bb * 2,
  };
  room.status = 'playing';

  const sbSeat = nextOccupiedSeat(room, room.buttonSeat);
  const bbSeat = nextOccupiedSeat(room, sbSeat);
  postBlind(room, sbSeat, sb);
  postBlind(room, bbSeat, bb);
  room.hand.currentBet = Math.max(
    room.seats[sbSeat].bet,
    room.seats[bbSeat].bet
  );
  room.hand.lastRaiseSize = bb;
  room.hand.minRaiseTo = room.hand.currentBet + bb;

  // 翻前：大盲下一位行动（UTG）
  const utg = nextOccupiedSeat(
    room,
    bbSeat,
    (s) => !s.folded && !s.allIn
  );
  setActionSeat(room, utg);

  pushLog(room, {
    type: 'startHand',
    handNumber,
    buttonSeat: room.buttonSeat,
    snapshot: snapshotForUndo(room),
  });
  room.updatedAt = now();
  return room;
}

function setActionSeat(room, seatIndex) {
  if (seatIndex == null) {
    room.hand.actionSeat = null;
    room.hand.actionStartedAt = 0;
    room.hand.actionDeadline = 0;
    return;
  }
  const timeout = room.config.actionTimeoutSec * 1000;
  room.hand.actionSeat = seatIndex;
  room.hand.actionStartedAt = now();
  room.hand.actionDeadline = now() + timeout;
}

function useTimeBank(room, openId) {
  const seat = seatOf(room, openId);
  if (!seat || !room.hand || room.hand.actionSeat !== seat.seatIndex) {
    throw new Error('非你的行动回合');
  }
  if (room.timeBankRemaining <= 0) {
    throw new Error('延时牌已用完');
  }
  room.timeBankRemaining -= 1;
  room.hand.actionDeadline += DEFAULTS.timeBankSec * 1000;
  pushLog(room, { type: 'timeBank', openId, remaining: room.timeBankRemaining });
  room.updatedAt = now();
  return room;
}

/**
 * 加注规则：
 * - 首次最低加注额 = BB（即 raise-to 至少 currentBet + BB，翻前已有 BB 时再加至少 BB）
 * - 之后 raise 至少 ×2（增量至少 = 上一次加注增量）
 */
function validateRaiseTo(room, seat, raiseTo) {
  const { currentBet, lastRaiseSize, minRaiseTo } = room.hand;
  const toCall = currentBet - seat.bet;
  const maxTo = seat.bet + seat.stack;
  if (raiseTo > maxTo) raiseTo = maxTo;
  const isAllIn = raiseTo === maxTo && raiseTo < minRaiseTo;
  if (raiseTo < minRaiseTo && !isAllIn) {
    throw new Error(`加注至少到 ${minRaiseTo}（或 all-in）`);
  }
  if (raiseTo <= currentBet && raiseTo < maxTo) {
    throw new Error('加注额必须高于当前注');
  }
  return { raiseTo, toCall, isAllIn };
}

function potShortcuts(room) {
  const pot = room.hand ? room.hand.pot : 0;
  const bb = room.config.bb;
  return {
    pot,
    bb,
    quarter: Math.max(bb, Math.round(pot / 4)),
    third: Math.max(bb, Math.round(pot / 3)),
    half: Math.max(bb, Math.round(pot / 2)),
  };
}

/** 计算相对底池的加注目标（raise-to = 本街已投入 + 跟注后仍要再投入的尺寸） */
function raiseToFromPotFraction(room, seat, fraction) {
  const toCall = Math.max(0, room.hand.currentBet - seat.bet);
  const potAfterCall = room.hand.pot + toCall;
  const size = Math.round(potAfterCall * fraction);
  return seat.bet + toCall + size;
}

function raiseToFromBb(room, seat, bbMult) {
  const amount = Math.round(Number(bbMult) * room.config.bb);
  const toCall = Math.max(0, room.hand.currentBet - seat.bet);
  return seat.bet + toCall + amount;
}

function applyBet(room, seat, totalBetThisStreet) {
  const need = totalBetThisStreet - seat.bet;
  if (need < 0) throw new Error('非法下注');
  const pay = Math.min(seat.stack, need);
  seat.stack -= pay;
  seat.bet += pay;
  seat.contributed += pay;
  room.hand.pot += pay;
  if (seat.stack === 0) seat.allIn = true;
  return pay;
}

function playerAction(room, { openId, action, raiseTo, bbMult, potFraction }) {
  if (!room.hand || room.status !== 'playing') throw new Error('当前不可行动');
  const seat = seatOf(room, openId);
  if (!seat) throw new Error('未入座');
  if (room.hand.actionSeat !== seat.seatIndex) throw new Error('未轮到你');
  if (seat.folded || seat.allIn) throw new Error('无法行动');

  const before = snapshotForUndo(room);
  const currentBet = room.hand.currentBet;
  const toCall = currentBet - seat.bet;

  switch (action) {
    case 'fold':
      seat.folded = true;
      seat.actedThisStreet = true;
      break;
    case 'check':
      if (toCall > 0) throw new Error('需跟注，不能 check');
      seat.actedThisStreet = true;
      break;
    case 'call': {
      if (toCall <= 0) {
        seat.actedThisStreet = true;
        break;
      }
      applyBet(room, seat, seat.bet + toCall);
      seat.actedThisStreet = true;
      break;
    }
    case 'raise':
    case 'bet': {
      let target;
      if (potFraction != null) {
        target = raiseToFromPotFraction(room, seat, Number(potFraction));
      } else if (bbMult != null) {
        target = raiseToFromBb(room, seat, bbMult);
      } else if (raiseTo != null) {
        target = Number(raiseTo);
      } else {
        throw new Error('缺少加注额');
      }
      const { raiseTo: finalTo } = validateRaiseTo(room, seat, target);
      const prevBet = currentBet;
      applyBet(room, seat, finalTo);
      if (seat.bet > prevBet) {
        const raiseSize = seat.bet - prevBet;
        room.hand.lastRaiseSize = Math.max(raiseSize, room.config.bb);
        room.hand.currentBet = seat.bet;
        room.hand.minRaiseTo = seat.bet + room.hand.lastRaiseSize;
        // 加注后其他人需重新行动
        room.seats.forEach((s) => {
          if (s.seated && s.openId && s.seatIndex !== seat.seatIndex && !s.folded && !s.allIn) {
            s.actedThisStreet = false;
          }
        });
      }
      seat.actedThisStreet = true;
      break;
    }
    case 'allin': {
      const allInTo = seat.bet + seat.stack;
      const prevBet = currentBet;
      applyBet(room, seat, allInTo);
      if (seat.bet > prevBet) {
        const raiseSize = seat.bet - prevBet;
        if (seat.bet >= room.hand.minRaiseTo) {
          room.hand.lastRaiseSize = Math.max(raiseSize, room.config.bb);
          room.hand.minRaiseTo = seat.bet + room.hand.lastRaiseSize;
          room.seats.forEach((s) => {
            if (s.seated && s.openId && s.seatIndex !== seat.seatIndex && !s.folded && !s.allIn) {
              s.actedThisStreet = false;
            }
          });
        } else if (seat.bet > prevBet) {
          // 不足最低加注的 all-in：提高跟注额，但不重开完整加注轮的「最低再加注增量」
          room.seats.forEach((s) => {
            if (s.seated && s.openId && s.seatIndex !== seat.seatIndex && !s.folded && !s.allIn && s.bet < seat.bet) {
              s.actedThisStreet = false;
            }
          });
        }
        room.hand.currentBet = Math.max(room.hand.currentBet, seat.bet);
      }
      seat.actedThisStreet = true;
      break;
    }
    default:
      throw new Error('未知行动');
  }

  pushLog(room, {
    type: 'action',
    openId,
    action,
    seatIndex: seat.seatIndex,
    snapshot: before,
  });

  afterAction(room);
  room.updatedAt = now();
  return room;
}

/** 超时：房主强制 fold，或无人下注时 check */
function forceAction(room, { hostOpenId, action }) {
  if (hostOpenId !== room.hostOpenId) throw new Error('仅房主可强制行动');
  if (!room.hand || room.hand.actionSeat == null) throw new Error('无待行动座位');
  const seat = room.seats[room.hand.actionSeat];
  if (!seat || !seat.openId) throw new Error('座位无效');
  const toCall = room.hand.currentBet - seat.bet;
  let resolved = action;
  if (!resolved) {
    resolved = toCall > 0 ? 'fold' : 'check';
  }
  if (resolved === 'check' && toCall > 0) resolved = 'fold';
  if (resolved !== 'fold' && resolved !== 'check') {
    throw new Error('超时仅支持 fold / check');
  }
  return playerAction(room, { openId: seat.openId, action: resolved });
}

function streetComplete(room) {
  const live = livePlayers(room);
  if (live.length <= 1) return true;
  const contenders = live.filter((s) => !s.allIn);
  if (contenders.length === 0) return true;
  // 所有未弃牌未全下者都已行动，且 bet 对齐到 currentBet（或已 all-in）
  return live.every((s) => {
    if (s.allIn) return true;
    return s.actedThisStreet && s.bet === room.hand.currentBet;
  });
}

function afterAction(room) {
  const live = livePlayers(room);
  if (live.length === 1) {
    // 弃至一人：直接赢主池
    awardUncontested(room, live[0]);
    return;
  }

  if (!streetComplete(room)) {
    const next = nextActor(room);
    setActionSeat(room, next);
    return;
  }

  // 街次推进
  advanceStreet(room);
}

function nextActor(room) {
  const from = room.hand.actionSeat;
  return nextOccupiedSeat(room, from, (s) => {
    if (s.folded || s.allIn) return false;
    if (!s.actedThisStreet) return true;
    if (s.bet < room.hand.currentBet) return true;
    return false;
  });
}

function resetStreetBets(room) {
  room.seats.forEach((s) => {
    s.bet = 0;
    s.actedThisStreet = false;
  });
  room.hand.currentBet = 0;
  room.hand.lastRaiseSize = room.config.bb;
  room.hand.minRaiseTo = room.config.bb;
}

/**
 * 翻后行动：枪口（按钮下一位）起 → 再到小盲
 * 即从 button 下一位开始
 */
function firstToActPostflop(room) {
  return nextOccupiedSeat(room, room.buttonSeat, (s) => !s.folded && !s.allIn);
}

function advanceStreet(room) {
  const idx = STREETS.indexOf(room.hand.street);
  const stillCanAct = canActPlayers(room).length;

  // 若最多一人还能行动（其余 all-in），直接跳到 showdown 算边池
  if (stillCanAct <= 1) {
    goShowdown(room);
    return;
  }

  const nextStreet = STREETS[idx + 1];
  if (!nextStreet || nextStreet === 'showdown') {
    goShowdown(room);
    return;
  }

  room.hand.street = nextStreet;
  resetStreetBets(room);
  const first = firstToActPostflop(room);
  if (first == null) {
    goShowdown(room);
    return;
  }
  setActionSeat(room, first);
  pushLog(room, { type: 'street', street: nextStreet });
}

function computeSidePots(room) {
  const contribs = room.seats
    .filter((s) => s.seated && s.contributed > 0)
    .map((s) => ({ seatIndex: s.seatIndex, folded: s.folded, amount: s.contributed }));

  if (!contribs.length) return [];

  const levels = [...new Set(contribs.map((c) => c.amount))].sort((a, b) => a - b);
  const pots = [];
  let prev = 0;
  levels.forEach((level) => {
    const layer = level - prev;
    if (layer <= 0) return;
    let amount = 0;
    const eligible = [];
    contribs.forEach((c) => {
      if (c.amount >= level) {
        amount += layer;
        if (!c.folded) eligible.push(c.seatIndex);
      } else if (c.amount > prev) {
        amount += c.amount - prev;
      }
    });
    if (amount > 0) {
      pots.push({
        amount,
        eligibleSeatIndexes: eligible,
        winnerSeatIndexes: [],
      });
    }
    prev = level;
  });
  return pots;
}

function goShowdown(room) {
  room.hand.street = 'showdown';
  room.hand.sidePots = computeSidePots(room);
  room.hand.actionSeat = null;
  room.hand.actionDeadline = 0;
  room.status = 'showdown';
  // 若只剩一人有资格，自动给他
  const live = livePlayers(room);
  if (live.length === 1) {
    room.hand.sidePots.forEach((p) => {
      if (p.eligibleSeatIndexes.includes(live[0].seatIndex)) {
        p.winnerSeatIndexes = [live[0].seatIndex];
      }
    });
    settlePots(room);
  }
  pushLog(room, { type: 'showdown', sidePots: clone(room.hand.sidePots) });
}

function awardUncontested(room, winnerSeat) {
  room.hand.sidePots = [
    {
      amount: room.hand.pot,
      eligibleSeatIndexes: [winnerSeat.seatIndex],
      winnerSeatIndexes: [winnerSeat.seatIndex],
    },
  ];
  room.hand.street = 'showdown';
  room.status = 'showdown';
  room.hand.actionSeat = null;
  settlePots(room);
}

/** 房主点各池赢家 */
function pickWinners(room, { hostOpenId, potWinners }) {
  if (hostOpenId !== room.hostOpenId) throw new Error('仅房主可点赢家');
  if (room.status !== 'showdown' || !room.hand) throw new Error('非摊牌阶段');
  const before = snapshotForUndo(room);

  // potWinners: [{ potIndex, winnerSeatIndexes: number[] }]
  (potWinners || []).forEach(({ potIndex, winnerSeatIndexes }) => {
    const pot = room.hand.sidePots[potIndex];
    if (!pot) throw new Error(`边池 ${potIndex} 不存在`);
    const winners = (winnerSeatIndexes || []).filter((i) =>
      pot.eligibleSeatIndexes.includes(i)
    );
    if (!winners.length) throw new Error(`边池 ${potIndex} 需选择合格赢家`);
    pot.winnerSeatIndexes = winners;
  });

  const unfinished = room.hand.sidePots.some((p) => !p.winnerSeatIndexes.length);
  if (unfinished) {
    room.updatedAt = now();
    return room;
  }

  pushLog(room, { type: 'pickWinners', snapshot: before, potWinners });
  settlePots(room);
  return room;
}

function settlePots(room) {
  room.hand.sidePots.forEach((pot) => {
    const winners = pot.winnerSeatIndexes || [];
    if (!winners.length) return;
    const share = Math.floor(pot.amount / winners.length);
    let remain = pot.amount - share * winners.length;
    winners.forEach((idx, i) => {
      const seat = room.seats[idx];
      if (!seat) return;
      seat.stack += share + (i === 0 ? remain : 0);
    });
  });
  room.hand.pot = 0;
  finishHand(room);
}

function finishHand(room) {
  room.status = 'lobby';
  room.hand.actionSeat = null;
  room.hand.actionDeadline = 0;
  // 保留 hand 摘要供 UI 短暂展示；下一手 startHand 会覆盖
  applyPendingLeaves(room);
  room.seats.forEach((s) => {
    s.bet = 0;
    s.actedThisStreet = false;
    // contributed / folded 留给 UI 看一眼结果，开新手时 reset
  });
  room.updatedAt = now();
  pushLog(room, { type: 'handEnd', handNumber: room.hand.handNumber });
}

/** 房主纠错：撤销上一步可回滚操作 */
function correctUndo(room, hostOpenId) {
  if (hostOpenId !== room.hostOpenId) throw new Error('仅房主可纠错');
  const log = room.actionLog || [];
  for (let i = log.length - 1; i >= 0; i--) {
    const entry = log[i];
    if (entry.snapshot) {
      room.seats = entry.snapshot.seats;
      room.hand = entry.snapshot.hand;
      room.status = entry.snapshot.status;
      room.buttonSeat = entry.snapshot.buttonSeat;
      room.timeBankRemaining = entry.snapshot.timeBankRemaining;
      room.pendingLeave = entry.snapshot.pendingLeave || [];
      room.actionLog = log.slice(0, i);
      room.updatedAt = now();
      pushLog(room, { type: 'correctUndo', undone: entry.type });
      return room;
    }
  }
  throw new Error('没有可撤销的操作');
}

/** 房主直接改某座位筹码（纠错） */
function correctStack(room, { hostOpenId, seatIndex, stack }) {
  if (hostOpenId !== room.hostOpenId) throw new Error('仅房主可纠错');
  const seat = room.seats[seatIndex];
  if (!seat || !seat.seated) throw new Error('座位无效');
  const before = snapshotForUndo(room);
  seat.stack = Math.max(0, Math.round(Number(stack)));
  pushLog(room, { type: 'correctStack', seatIndex, stack: seat.stack, snapshot: before });
  room.updatedAt = now();
  return room;
}

function publicRoomView(room) {
  return room;
}

function getLegalActions(room, openId) {
  const seat = seatOf(room, openId);
  if (!seat || !room.hand || room.status !== 'playing') return null;
  if (room.hand.actionSeat !== seat.seatIndex) return null;
  const toCall = Math.max(0, room.hand.currentBet - seat.bet);
  const canCheck = toCall === 0;
  const shortcuts = potShortcuts(room);
  return {
    canFold: true,
    canCheck,
    canCall: toCall > 0 && seat.stack > 0,
    callAmount: Math.min(toCall, seat.stack),
    canRaise: seat.stack > toCall,
    minRaiseTo: room.hand.minRaiseTo,
    maxRaiseTo: seat.bet + seat.stack,
    canAllIn: seat.stack > 0,
    shortcuts,
    timeBankRemaining: room.timeBankRemaining,
    deadline: room.hand.actionDeadline,
  };
}

module.exports = {
  DEFAULTS,
  createRoom,
  sitDown,
  requestLeave,
  rebuy,
  startHand,
  playerAction,
  forceAction,
  useTimeBank,
  pickWinners,
  correctUndo,
  correctStack,
  potShortcuts,
  raiseToFromPotFraction,
  raiseToFromBb,
  getLegalActions,
  seatedPlayers,
  computeSidePots,
  snapshotForUndo,
  emptySeat,
};
