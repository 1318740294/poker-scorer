/**
 * 验证 saveRoom 更新载荷：hand 从 null 变对象时必须走 command.set，
 * 不能把嵌套字段当 dotted path 合并。
 * 运行：node scripts/test-room-update.js
 */
const path = require('path');
const engine = require(path.join(__dirname, '../cloudfunctions/api/lib/engine'));
const { buildRoomUpdateData } = require(path.join(
  __dirname,
  '../cloudfunctions/api/lib/roomUpdate'
));

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

/** 模拟 db.command：set(v) 返回可识别的包装，便于断言 */
function mockCommand() {
  return {
    set(value) {
      return { __cmd: 'set', value };
    },
  };
}

function isSetCmd(v) {
  return v && v.__cmd === 'set';
}

function testHandNullToObjectUsesSet() {
  const room = engine.createRoom({
    hostOpenId: 'dbg_host',
    nickname: 'Host',
    persona: 'fox',
    config: { sb: 1, bb: 2, maxSeats: 6, defaultBuyInBb: 50 },
  });
  room._id = 'room_test_1';
  assert(room.hand === null, 'createRoom hand starts null');

  // 引擎要求至少 minSeats（默认 5）人入座才能开局；host 已占 0
  ['dbg_p2', 'dbg_p3', 'dbg_p4', 'dbg_p5'].forEach((id, i) => {
    engine.sitDown(room, {
      openId: id,
      nickname: id,
      persona: 'bear',
      seatIndex: i + 1,
      buyInBb: 50,
    });
  });
  engine.startHand(room, 'dbg_host');
  assert(room.hand && typeof room.hand === 'object', 'startHand inits whole hand');
  assert(typeof room.hand.actionDeadline === 'number', 'actionDeadline set');

  const cmd = mockCommand();
  const data = buildRoomUpdateData(room, cmd);

  assert(isSetCmd(data.hand), 'hand must be cmd.set(...)');
  assert(data.hand.value && data.hand.value.actionDeadline != null, 'set payload has actionDeadline');
  assert(data.hand.value.street === 'preflop', 'set payload is full hand object');
  // 关键：裸嵌套对象（微信会当成 hand.actionDeadline 路径）
  assert(!('actionDeadline' in (data.hand || {}) && !isSetCmd(data.hand)), 'no bare nested hand');

  assert(isSetCmd(data.seats), 'seats uses set');
  assert(isSetCmd(data.config), 'config uses set');
  assert(isSetCmd(data.pendingLeave), 'pendingLeave uses set');
  assert(isSetCmd(data.actionLog), 'actionLog uses set');
  assert(data.status === 'playing', 'scalar status ok');
  assert(!('_id' in data), '_id stripped');
  console.log('✓ hand null→object uses _.set');
}

function testHandCanSetBackToNull() {
  const room = {
    _id: 'x',
    code: 'ABC',
    hostOpenId: 'h',
    status: 'lobby',
    config: { sb: 1, bb: 2 },
    seats: [],
    buttonSeat: 0,
    hand: { handNumber: 1, actionDeadline: 1 },
    pendingLeave: [],
    actionLog: [],
    timeBankRemaining: 3,
    createdAt: 1,
  };
  // 模拟纠错后手牌清空之类：整段写成 null
  room.hand = null;
  const data = buildRoomUpdateData(room, mockCommand());
  assert(isSetCmd(data.hand), 'null hand still wrapped in set');
  assert(data.hand.value === null, 'set value is null');
  console.log('✓ hand object→null uses _.set');
}

function main() {
  testHandNullToObjectUsesSet();
  testHandCanSetBackToNull();
  console.log('\nAll roomUpdate tests passed.');
}

main();
