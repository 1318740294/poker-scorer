const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 获取当前用户 openId，并可选写入 users 集合昵称/形象
 */
exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  let openId = wxContext.OPENID;
  const debug = event && event.debugOpenId;
  if (
    debug &&
    typeof debug === 'string' &&
    /^dbg_[a-z0-9_]{1,24}$/i.test(debug) &&
    wxContext.SOURCE === 'wx_devtools'
  ) {
    openId = debug;
  }
  const db = cloud.database();

  const nickname = event.nickname;
  const persona = event.persona;

  // 伪身份不写 users 集合，避免污染正式用户数据
  if ((nickname || persona) && !String(openId).startsWith('dbg_')) {
    try {
      const users = db.collection('users');
      const existing = await users.where({ _openid: openId }).limit(1).get();
      const data = {
        nickname: nickname || '玩家',
        persona: persona || 'fox',
        updatedAt: Date.now(),
      };
      if (existing.data.length) {
        await users.doc(existing.data[0]._id).update({ data });
      } else {
        await users.add({ data });
      }
    } catch (e) {
      // users 集合未创建时忽略
      console.warn('users upsert skipped', e.message);
    }
  }

  return {
    ok: true,
    data: {
      openId,
      appId: wxContext.APPID,
      unionId: wxContext.UNIONID || null,
      debug: String(openId).startsWith('dbg_'),
    },
  };
};
