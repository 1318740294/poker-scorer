const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 获取当前用户 openId，并可选写入 users 集合昵称/形象
 */
exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openId = wxContext.OPENID;
  const db = cloud.database();

  const nickname = event.nickname;
  const persona = event.persona;

  if (nickname || persona) {
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
    },
  };
};
