# 云数据库集合说明

在微信开发者工具 → 云开发 → 数据库中创建以下集合。权限建议：仅云函数可读写（所有用户不可读写）。

## `rooms`

一局共享桌状态（实时监听此文档即可同步全桌）。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `code` | string | 6 位入房码 |
| `hostOpenId` | string | 房主 |
| `status` | string | `lobby` / `playing` / `showdown` / `ended` |
| `config` | object | `sb`, `bb`, `defaultBuyInBb`, `minBuyInBb`, `actionTimeoutSec`, `maxSeats` |
| `seats` | array | 长度 = maxSeats；见下方 seat |
| `buttonSeat` | number | 庄位 |
| `hand` | object \| null | 当前手牌状态；云函数 `saveRoom` 必须用 `_.set(hand)` 整段写入，禁止在 `hand: null` 上更新嵌套字段（否则 -502001） |
| `timeBankRemaining` | number | 整场共享延时牌，初始 3 |
| `pendingLeave` | array | 手结束后离桌的 openId 列表 |
| `actionLog` | array | 最近操作（供房主纠错撤销） |
| `createdAt` | Date | |
| `updatedAt` | Date | |

### seat 元素

```js
{
  seatIndex: 0,
  openId: null,
  nickname: '',
  persona: 'fox',       // 形象 id
  stack: 0,
  seated: false,
  // 手内瞬态（开新手会重置）
  bet: 0,               // 本街已投入
  contributed: 0,       // 本手总投入（算边池）
  folded: false,
  allIn: false,
  actedThisStreet: false
}
```

### hand 对象

```js
{
  handNumber: 1,
  street: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown',
  pot: 0,
  sidePots: [           // showdown 时生成
    { amount: 100, eligibleSeatIndexes: [0, 2], winnerSeatIndexes: [] }
  ],
  currentBet: 0,        // 本街需跟注额
  lastRaiseSize: 0,     // 本街最近一次加注增量（最低再加注参考）
  actionSeat: 3,
  actionStartedAt: 0,   // ms
  actionDeadline: 0,    // ms；断线不暂停
  minRaiseTo: 0         // 下一次加注至少加到的总额
}
```

## `users`（可选）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `_openid` | string | 自动 |
| `nickname` | string | |
| `persona` | string | 默认形象 |
| `updatedAt` | Date | |
