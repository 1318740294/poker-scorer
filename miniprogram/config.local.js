/**
 * 本地开发开关（可提交）。正式发版前改为 debug: false，或删掉本文件改用默认。
 * debug:true → 首页始终显示调试面板，并允许 dbg_* 伪身份（仍受云函数 SOURCE 门禁约束）。
 */
module.exports = {
  debug: true,
};
