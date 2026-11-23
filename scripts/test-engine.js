/**
 * 本地无微信依赖的引擎冒烟测试：node scripts/test-engine.js
 */
const path = require('path');
const engine = require(path.join(__dirname, '../cloudfunctions/api/lib/engine'));

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

function makeTable() {
  let room = engine.createRoom({
    hostOpenId: 'h',
    nickname: 'Host',
    persona: 'fox',
    config: { sb: 1, bb: 2, maxSeats: 6, defaultBuyInBb: 50 },
  });
  // host already on seat 0
  const ids = ['p1', 'p2', 'p3', 'p4'];
  ids.forEach((id, i) => {
    engine.sitDown(room, {
      openId: id,
      nickname: id,
      persona: 'bear',
      seatIndex: i + 1,
      buyInBb: 50,
    });
  });
  return room;
}

function testStartAndBlinds() {
  const room = makeTable();
  engine.startHand(room, 'h');
  assert(room.status === 'playing', 'playing');
  assert(room.hand.street === 'preflop', 'preflop');
  assert(room.hand.pot === 3, 'pot sb+bb = 3');
  assert(room.hand.currentBet === 2, 'currentBet bb');
  console.log('✓ blinds');
}

function testFoldToWinner() {
  const room = makeTable();
  engine.startHand(room, 'h');
  // act until one remains: fold everyone except BB
  let guard = 0;
  while (room.status === 'playing' && guard++ < 40) {
    const seatIdx = room.hand.actionSeat;
    const seat = room.seats[seatIdx];
    engine.playerAction(room, { openId: seat.openId, action: 'fold' });
  }
  assert(room.status === 'lobby' || room.status === 'showdown', 'hand ended');
  const stacks = room.seats.filter((s) => s.seated).map((s) => s.stack);
  const sum = stacks.reduce((a, b) => a + b, 0);
  assert(sum === 5 * 100, `chips conserved got ${sum}`);
  console.log('✓ fold to winner + chip conserve');
}

function testMinRaise() {
  const room = makeTable();
  engine.startHand(room, 'h');
  const actor = room.seats[room.hand.actionSeat];
  let threw = false;
  try {
    engine.playerAction(room, {
      openId: actor.openId,
      action: 'raise',
      raiseTo: room.hand.currentBet + 1, // below min
    });
  } catch (e) {
    threw = true;
  }
  assert(threw, 'min raise enforced');
  engine.playerAction(room, {
    openId: actor.openId,
    action: 'raise',
    raiseTo: room.hand.minRaiseTo,
  });
  assert(room.hand.currentBet === room.hand.minRaiseTo - room.config.bb || room.hand.currentBet >= 4, 'raised');
  console.log('✓ min raise');
}

function testSidePots() {
  const room = makeTable();
  // shrink one stack for all-in side pot
  room.seats[1].stack = 10;
  engine.startHand(room, 'h');
  // Force a simple all-in path via direct contributions mock
  room.seats.forEach((s) => {
    if (!s.seated) return;
    s.folded = false;
    s.contributed = 0;
    s.bet = 0;
  });
  room.seats[0].contributed = 50;
  room.seats[1].contributed = 10;
  room.seats[2].contributed = 50;
  room.seats[1].folded = false;
  room.seats[0].folded = false;
  room.seats[2].folded = false;
  const pots = engine.computeSidePots(room);
  assert(pots.length >= 2, 'side pots split');
  assert(pots[0].amount === 30, `main layer ${pots[0].amount}`);
  console.log('✓ side pots', pots.map((p) => p.amount));
}

function testTimeBank() {
  const room = makeTable();
  engine.startHand(room, 'h');
  const actor = room.seats[room.hand.actionSeat];
  const before = room.hand.actionDeadline;
  engine.useTimeBank(room, actor.openId);
  assert(room.timeBankRemaining === 2, 'tb -1');
  assert(room.hand.actionDeadline === before + 30000, '+30s');
  console.log('✓ time bank');
}

function testUndo() {
  const room = makeTable();
  engine.startHand(room, 'h');
  const actor = room.seats[room.hand.actionSeat];
  engine.playerAction(room, { openId: actor.openId, action: 'fold' });
  engine.correctUndo(room, 'h');
  assert(!room.seats.find((s) => s.openId === actor.openId).folded, 'undo fold');
  console.log('✓ correct undo');
}

/** 模拟单人调试：dbg_host 建房后 dbg_p2 入座，应有两个不同座位 */
function testMultiIdentitySeats() {
  const room = engine.createRoom({
    hostOpenId: 'dbg_host',
    nickname: 'Host',
    persona: 'fox',
    config: { sb: 1, bb: 2, maxSeats: 9, defaultBuyInBb: 100 },
  });
  assert(room.seats[0].openId === 'dbg_host' && room.seats[0].seated, 'host auto-seated');
  assert(room.hostOpenId === 'dbg_host', 'hostOpenId dbg');

  engine.sitDown(room, {
    openId: 'dbg_p2',
    nickname: '玩家2',
    persona: 'bear',
    seatIndex: 1,
    buyInBb: 100,
  });

  const seated = room.seats.filter((s) => s.seated);
  assert(seated.length === 2, `two seated got ${seated.length}`);
  assert(seated[0].openId === 'dbg_host', 'seat0 host');
  assert(seated[1].openId === 'dbg_p2', 'seat1 p2');
  assert(seated[0].openId !== seated[1].openId, 'distinct openIds');

  let threw = false;
  try {
    engine.sitDown(room, {
      openId: 'dbg_host',
      nickname: 'Host',
      persona: 'fox',
      seatIndex: 2,
      buyInBb: 100,
    });
  } catch (e) {
    threw = /已入座/.test(e.message);
  }
  assert(threw, 'same dbg id cannot double-sit');

  // 同一真实 openId 占第二席应失败（模拟未切换身份）
  const room2 = engine.createRoom({
    hostOpenId: 'oREAL',
    nickname: 'Me',
    persona: 'fox',
    config: { maxSeats: 6, defaultBuyInBb: 50 },
  });
  threw = false;
  try {
    engine.sitDown(room2, {
      openId: 'oREAL',
      nickname: 'Me2',
      persona: 'bear',
      seatIndex: 1,
      buyInBb: 50,
    });
  } catch (e) {
    threw = /已入座/.test(e.message);
  }
  assert(threw, 'same real openId cannot take two seats');
  assert(room2.seats.filter((s) => s.seated).length === 1, 'still one seat');
  console.log('✓ multi-identity seats');
}

function main() {
  testStartAndBlinds();
  testFoldToWinner();
  testMinRaise();
  testSidePots();
  testTimeBank();
  testUndo();
  testMultiIdentitySeats();
  console.log('\nAll engine tests passed.');
}

main();
