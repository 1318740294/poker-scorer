/**
 * 本地开发开关（可提交）。正式发版前改为 debug: false，或删掉本文件改用默认。
 * debug:true → 首页始终显示调试面板；开启后每次云调用带 dbg_*。
 * 云端 MVP 只要有 OPENID 即接受 dbg_*（见 cloudfunctions/*/openid.js）。
 */
module.exports = {
  debug: true,
};
