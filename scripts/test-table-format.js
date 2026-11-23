/**
 * 牌桌页依赖的 format 导出回归：node scripts/test-table-format.js
 * 根因复现：PERSONA_COLOR 未 export → table.applyRoom 给入座位上色即抛错 → 空白屏
 */
const path = require('path');
const fmt = require(path.join(__dirname, '../miniprogram/utils/format'));

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

function testExports() {
  assert(fmt.PERSONA_LABEL && fmt.PERSONA_LABEL.fox === '狐', 'PERSONA_LABEL.fox');
  assert(fmt.PERSONA_COLOR && typeof fmt.PERSONA_COLOR === 'object', 'PERSONA_COLOR exported');
  assert(fmt.PERSONA_COLOR.fox === '#d2691e', 'PERSONA_COLOR.fox');
  assert(typeof fmt.personaColor === 'function', 'personaColor fn');
  assert(fmt.personaColor('fox') === '#d2691e', 'personaColor(fox)');
  assert(fmt.personaColor('nope') === '#6a8f6a', 'personaColor fallback');
  console.log('✓ format exports');
}

/** 模拟 table.js 入座位着色（修复前会 throw） */
function seatColor(persona) {
  const { PERSONA_COLOR, personaColor } = fmt;
  if (PERSONA_COLOR && PERSONA_COLOR[persona]) return PERSONA_COLOR[persona];
  return personaColor(persona);
}

function testSeatColorDoesNotThrow() {
  const seats = [
    { seated: true, persona: 'fox' },
    { seated: true, persona: 'bear' },
    { seated: false, persona: 'fox' },
  ];
  const colors = seats.map((s) =>
    s.seated ? seatColor(s.persona) : 'rgba(255,255,255,0.08)'
  );
  assert(colors[0] === '#d2691e', 'fox color');
  assert(colors[1] === '#8b6914', 'bear color');
  assert(colors[2].startsWith('rgba'), 'empty seat');
  console.log('✓ seat color (table applyRoom path)');
}

function testMissingExportWouldBreak() {
  // 文档化旧 bug：未 export 时直接索引会抛错
  const PERSONA_COLOR = undefined;
  let threw = false;
  try {
    // eslint-disable-next-line no-unused-expressions
    PERSONA_COLOR['fox'];
  } catch (e) {
    threw = true;
  }
  assert(threw, 'undefined PERSONA_COLOR[persona] must throw');
  console.log('✓ documents prior crash path');
}

testExports();
testSeatColorDoesNotThrow();
testMissingExportWouldBreak();
console.log('all table-format tests passed');
