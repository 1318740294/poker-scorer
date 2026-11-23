/**
 * 组装 rooms 文档的 update data。
 *
 * 微信云库 update 会对 object 递归合并（写 dotted path）。
 * 库里 hand 为 null 时，直接传 { hand: { actionDeadline } } 会报：
 *   document.update:fail -502001
 *   Cannot create field 'actionDeadline' in element {hand: null}
 *
 * 对可能为 null / 需整段替换的字段用 cmd.set（即 db.command.set）整对象写入。
 *
 * @param {object} room 完整房间（可含 _id）
 * @param {{ set: (v: any) => any }} cmd 云库 command，至少提供 set
 */
function buildRoomUpdateData(room, cmd) {
  if (!cmd || typeof cmd.set !== 'function') {
    throw new Error('buildRoomUpdateData requires db.command with set()');
  }
  const copy = { ...room };
  delete copy._id;
  copy.updatedAt = Date.now();
  return {
    ...copy,
    config: cmd.set(copy.config),
    seats: cmd.set(copy.seats),
    hand: cmd.set(copy.hand),
    pendingLeave: cmd.set(copy.pendingLeave || []),
    actionLog: cmd.set(copy.actionLog || []),
  };
}

module.exports = { buildRoomUpdateData };
