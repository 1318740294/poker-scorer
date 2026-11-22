/** 产品决策默认值（方案未钉死的项在此落地） */
const DEFAULTS = {
  sb: 1,
  bb: 2,
  defaultBuyInBb: 100,
  minBuyInBb: 40,
  actionTimeoutSec: 30,
  timeBankSec: 30,
  timeBankCards: 3,
  minSeats: 5,
  maxSeats: 12,
  defaultMaxSeats: 9,
};

const PERSONAS = [
  'fox',
  'bear',
  'owl',
  'wolf',
  'cat',
  'deer',
  'eagle',
  'panda',
  'tiger',
  'rabbit',
  'lion',
  'koala',
];

const STREETS = ['preflop', 'flop', 'turn', 'river', 'showdown'];

module.exports = {
  DEFAULTS,
  PERSONAS,
  STREETS,
};
