const cloud = require('wx-server-sdk');
const engine = require('./lib/engine');
const { PERSONAS } = require('./lib/constants');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

function ok(data) {
  return { ok: true, data };
}

function fail(message, code = 'ERR') {
  return { ok: false, code, message };
}

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

async function getOpenId() {
  const wxContext = cloud.getWXContext();
  return wxContext.OPENID;
}

async function loadRoomById(roomId) {
  const res = await db.collection('rooms').doc(roomId).get();
  return res.data;
}

async function loadRoomByCode(code) {
  const res = await db.collection('rooms').where({ code: String(code).toUpperCase() }).limit(1).get();
  return res.data[0] || null;
}

async function saveRoom(room) {
  const id = room._id;
  const copy = { ...room };
  delete copy._id;
  copy.updatedAt = Date.now();
  await db.collection('rooms').doc(id).update({ data: copy });
  return { ...copy, _id: id };
}

async function createRoomDoc(room) {
  let code = genCode();
  for (let i = 0; i < 5; i++) {
    const exist = await loadRoomByCode(code);
    if (!exist) break;
    code = genCode();
  }
  room.code = code;
  const add = await db.collection('rooms').add({ data: room });
  room._id = add._id;
  return room;
}

exports.main = async (event) => {
  const action = event.action || event.type;
  try {
    const openId = await getOpenId();
    switch (action) {
      case 'ping':
        return ok({ pong: true, openId, personas: PERSONAS });

      case 'createRoom': {
        const room = engine.createRoom({
          hostOpenId: openId,
          nickname: event.nickname || '房主',
          persona: event.persona || 'fox',
          config: event.config || {},
        });
        const saved = await createRoomDoc(room);
        return ok({ room: saved });
      }

      case 'joinRoom': {
        const room = await loadRoomByCode(event.code);
        if (!room) return fail('房间不存在', 'NOT_FOUND');
        // 仅返回房间；入座走 sitDown
        return ok({ room });
      }

      case 'getRoom': {
        const room = await loadRoomById(event.roomId);
        if (!room) return fail('房间不存在', 'NOT_FOUND');
        return ok({
          room,
          legal: engine.getLegalActions(room, openId),
          me: openId,
        });
      }

      case 'sitDown': {
        const room = await loadRoomById(event.roomId);
        if (!room) return fail('房间不存在');
        if (room.status === 'playing') return fail('手牌进行中，请下一手再入座');
        engine.sitDown(room, {
          openId,
          nickname: event.nickname || '玩家',
          persona: event.persona || 'fox',
          seatIndex: event.seatIndex,
          buyInBb: event.buyInBb,
        });
        const saved = await saveRoom(room);
        return ok({ room: saved });
      }

      case 'leave': {
        const room = await loadRoomById(event.roomId);
        if (!room) return fail('房间不存在');
        engine.requestLeave(room, openId);
        const saved = await saveRoom(room);
        return ok({ room: saved });
      }

      case 'rebuy': {
        const room = await loadRoomById(event.roomId);
        if (!room) return fail('房间不存在');
        engine.rebuy(room, {
          openId,
          stackBb: event.stackBb,
          isHost: room.hostOpenId === openId,
          targetOpenId: event.targetOpenId,
        });
        const saved = await saveRoom(room);
        return ok({ room: saved });
      }

      case 'startHand': {
        const room = await loadRoomById(event.roomId);
        if (!room) return fail('房间不存在');
        engine.startHand(room, openId);
        const saved = await saveRoom(room);
        return ok({ room: saved });
      }

      case 'action': {
        const room = await loadRoomById(event.roomId);
        if (!room) return fail('房间不存在');
        engine.playerAction(room, {
          openId,
          action: event.playerAction || event.move,
          raiseTo: event.raiseTo,
          bbMult: event.bbMult,
          potFraction: event.potFraction,
        });
        const saved = await saveRoom(room);
        return ok({
          room: saved,
          legal: engine.getLegalActions(saved, openId),
        });
      }

      case 'timeBank': {
        const room = await loadRoomById(event.roomId);
        if (!room) return fail('房间不存在');
        engine.useTimeBank(room, openId);
        const saved = await saveRoom(room);
        return ok({ room: saved });
      }

      case 'forceAction': {
        const room = await loadRoomById(event.roomId);
        if (!room) return fail('房间不存在');
        engine.forceAction(room, {
          hostOpenId: openId,
          action: event.force || event.playerAction,
        });
        const saved = await saveRoom(room);
        return ok({ room: saved });
      }

      case 'pickWinners': {
        const room = await loadRoomById(event.roomId);
        if (!room) return fail('房间不存在');
        engine.pickWinners(room, {
          hostOpenId: openId,
          potWinners: event.potWinners,
        });
        const saved = await saveRoom(room);
        return ok({ room: saved });
      }

      case 'correctUndo': {
        const room = await loadRoomById(event.roomId);
        if (!room) return fail('房间不存在');
        engine.correctUndo(room, openId);
        const saved = await saveRoom(room);
        return ok({ room: saved });
      }

      case 'correctStack': {
        const room = await loadRoomById(event.roomId);
        if (!room) return fail('房间不存在');
        engine.correctStack(room, {
          hostOpenId: openId,
          seatIndex: event.seatIndex,
          stack: event.stack,
        });
        const saved = await saveRoom(room);
        return ok({ room: saved });
      }

      case 'updateConfig': {
        const room = await loadRoomById(event.roomId);
        if (!room) return fail('房间不存在');
        if (room.hostOpenId !== openId) return fail('仅房主可改配置');
        if (room.status === 'playing') return fail('手牌中不可改盲注');
        const cfg = event.config || {};
        if (cfg.sb != null) room.config.sb = Number(cfg.sb);
        if (cfg.bb != null) room.config.bb = Number(cfg.bb);
        if (cfg.actionTimeoutSec != null) room.config.actionTimeoutSec = Number(cfg.actionTimeoutSec);
        if (cfg.defaultBuyInBb != null) room.config.defaultBuyInBb = Number(cfg.defaultBuyInBb);
        if (cfg.minBuyInBb != null) room.config.minBuyInBb = Number(cfg.minBuyInBb);
        room.updatedAt = Date.now();
        const saved = await saveRoom(room);
        return ok({ room: saved });
      }

      default:
        return fail(`未知 action: ${action}`, 'UNKNOWN');
    }
  } catch (err) {
    console.error(action, err);
    return fail(err.message || '服务器错误');
  }
};
