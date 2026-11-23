const PERSONA_LABEL = {
  fox: '狐',
  bear: '熊',
  owl: '鸮',
  wolf: '狼',
  cat: '猫',
  deer: '鹿',
  eagle: '鹰',
  panda: '熊猫',
  tiger: '虎',
  rabbit: '兔',
  lion: '狮',
  koala: '考拉',
};

const PERSONA_COLOR = {
  fox: '#d2691e',
  bear: '#8b6914',
  owl: '#6b7c8a',
  wolf: '#7a7a8c',
  cat: '#c4a35a',
  deer: '#a67c52',
  eagle: '#4a6fa5',
  panda: '#5a5a5a',
  tiger: '#c75b12',
  rabbit: '#b89b7a',
  lion: '#c9a227',
  koala: '#7d8b74',
};

function personaLabel(id) {
  return PERSONA_LABEL[id] || id || '?';
}

function personaColor(id) {
  return PERSONA_COLOR[id] || '#6a8f6a';
}

function stackBb(stack, bb) {
  if (!bb) return String(stack || 0);
  const v = (Number(stack) || 0) / bb;
  return Number.isInteger(v) ? `${v}bb` : `${v.toFixed(1)}bb`;
}

function streetLabel(street) {
  return (
    {
      preflop: '翻前',
      flop: '翻牌',
      turn: '转牌',
      river: '河牌',
      showdown: '摊牌',
    }[street] || street || '-'
  );
}

function countdownText(deadline) {
  if (!deadline) return '';
  const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  return `${left}s`;
}

module.exports = {
  PERSONA_LABEL,
  PERSONA_COLOR,
  personaLabel,
  personaColor,
  stackBb,
  streetLabel,
  countdownText,
};
