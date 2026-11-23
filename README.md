# 德州记分桌（poker-scorer）

微信小程序 · 现金局共享记分桌 MVP。无牌面、无荷官发牌；街次仅为标记。筹码以视觉为主，线下自行结账。

产品决策见仓库外方案文档；本实现不发明冲突规则。

## 功能（MVP）

- 房主建房 / 玩家房号加入，5–12 座，点空位入座
- 自动扣 SB/BB；按座位行动；翻后枪口起→小盲
- 街次自动推进；首次最低加注 = BB，之后 raise 至少 ×2
- 快捷：底池 1/4、1/3、1/2、自定义 bb、All-in
- 边池自动拆；摊牌后房主点各池赢家
- 自由 Rebuy；本手结束后离桌
- 整场共享 3 张延时牌（每次 +30s）；超时由房主强制 fold /（无人下注时）check
- 断线不暂停倒计时；房主纠错撤销上一步
- 椭圆牌桌 HUD：形象、深度、倒计时

未做：推筹码物理、历史回放、语音、多桌、比赛涨盲。

## 目录

```
miniprogram/           # 小程序前端
  config.local.js      # debug:true 默认开调试面板（发版前关掉）
  components/debug-banner
  pages/index|lobby|table
  utils/debug.js       # dbg_* 本地身份
cloudfunctions/
  login/               # 获取 openId（含 debugMeta）
  api/                 # 局内写操作 + lib/openid 门禁
database/schema.md
scripts/test-engine.js
scripts/test-openid.js
```

## 在微信开发者工具中打开

1. 安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)。
2. **导入项目**：目录选择本仓库根目录；AppID 填你的小程序 AppID（或测试号）。  
   - 打开后把 `project.config.json` 里的 `"appid": "touristappid"` 改成真实 AppID。
3. 确认 `miniprogramRoot` = `miniprogram/`，`cloudfunctionRoot` = `cloudfunctions/`（已写在 `project.config.json`）。

## 开通并启用微信云开发

1. 开发者工具顶部 **云开发** → 开通环境（记下 **环境 ID**）。
2. 在开发者工具中把云环境关联到项目。`miniprogram/app.js` 默认使用 `wx.cloud.DYNAMIC_CURRENT_ENV`；若初始化失败，再改成你的环境 ID 字符串。
3. 云开发控制台 → **数据库** → 按 `database/schema.md` 创建集合：
   - `rooms`（必需）
   - `users`（可选）
4. 集合权限建议：**所有用户不可读写**（仅云函数可读写）。客户端用 `watch` 读 `rooms` 时，可改为「仅创建者可读写」不满足多人桌，因此 MVP 推荐：
   - 读权限：所有用户可读，仅管理端/云函数可写；或
   - 自定义安全规则：`read: true, write: false`（写全部走云函数）。
5. 在开发者工具 **cloud函数** 面板：
   - 右键 `cloudfunctions/login` → **上传并部署：云端安装依赖**
   - 右键 `cloudfunctions/api` → **上传并部署：云端安装依赖**
6. 编译运行。真机预览需同一云环境，并保证基础库 ≥ 2.2.3。

## 本地校验规则引擎（可选）

无需微信工具即可跑核心逻辑：

```bash
node scripts/test-engine.js
```

## 默认参数（方案未钉死项）

| 项 | MVP 默认 |
| --- | --- |
| 默认买入 | 100 bb |
| 最小买入 | 40 bb |
| 行动时限 | 30 秒 |
| 延时牌 | 整场 3 张，每次 +30 秒 |
| 房主纠错 | 撤销上一步（带快照的操作） |
| 默认人数上限 | 9（可配置 5–12） |

## 操作路径简述

1. 首页设昵称/形象 → **创建房间** 或输入房号 **加入**。
2. 候场页点空位入座；房主设盲注 → **开一手**。
3. 牌桌页按行动栏操作；超时后房主点强制弃牌/过牌。
4. 摊牌后房主为每个边池点赢家 → **确认派彩** → **下一手**。

## 单人本地调试（没有朋友一起测）

一人也能把「建房 → 入座 → 开一手 → 行动 → 摊牌」跑通。

### ⚠ 合并后必须重传云函数

**合并本 PR / 拉最新 main 后，务必在微信开发者工具里重新「上传并部署：云端安装依赖」`login` 与 `api`。**  
只编译前端、不重传云函数 → 候场会继续显示真实 openId（如 `oj0T8x…`），`dbg_*` 永远不会生效。

成功标志（缺一不可）：

- 顶栏黄条：**`调试身份: dbg_host`**（或 `dbg_p2`）
- 候场：**`当前身份 · dbg_host`**
- **绝不能**再出现：`真实 openId（调试已开）` / `oj0…` 截断

旧房（多人同真实 openId 脏数据）请直接**新建房间**，不要继续用截图里的旧房号。

### 1. 先跑规则引擎（无需微信）

```bash
node scripts/test-engine.js
node scripts/test-openid.js
```

### 2. 最快路径：首页「本机双人自测」

仓库默认带 `miniprogram/config.local.js`（`debug: true`），开发者工具里首页底部应出现 **调试 · 单人多身份**。

1. **上传并部署** `login` + `api`（见上）。
2. （可选）云开发控制台 → 云函数 → `api` / `login` → 环境变量：可设 `ALLOW_DEBUG_OPENID=true`（**MVP 默认已放行 dbg_***，不设也能用；设上便于对照日志）。
3. 编译运行 → 首页调试面板 → 点 **开启**（立刻切到 `dbg_host`）或直接 **本机双人自测**。
4. 自测自动：`dbg_host` 建房占座 0 → `dbg_p2` 加入占座 1 → 切回 `dbg_host` 进候场。每步校验 `resolvedOpenId`/`me` 必须以 `dbg_` 开头，否则弹窗 **「云函数未接受调试身份，请重传 api」**，不会静默用真实 openId 占多席。
5. **验收**：
   - 顶栏：`调试身份: dbg_host`
   - 候场：`当前身份 · dbg_host`，**2/9**，两席 Host / 玩家2
   - 房主可见 **开一手**（`me === hostOpenId` 且入座 ≥ 2）

未开调试就点「创建房间」会 toast 提醒。调试开着时芯片只有 Host/玩家2/3/4，**没有「真实 openId」选项**（要回真实身份请点「关闭」）。

### 3. 手动切换身份（可选）

1. **开启** → 默认 `dbg_host` → **创建房间** → 确认 `当前身份 · dbg_host`。
2. 返回首页 → 点 **玩家2** → 同房号 **加入** → 点空位 → 确认 `当前身份 · dbg_p2`、**2/9**。
3. 回首页切回 **Host** → 加入该房 → **开一手**。

实现要点（MVP）：

- 客户端每次云调用带 `debugOpenId=dbg_*`；调试开着时本地永不回落真实 openId。
- 云端：只要 `WXContext.OPENID` 存在且 `debugOpenId` 匹配 `/^dbg_/`，**一律采用伪身份**（私人 MVP；发版前关 `config.local.js`）。
- 响应带 `me` + **`resolvedOpenId`** + `debugMeta`；前端断言二者等于期望 `dbg_*`。
- 可选 env：`ALLOW_DEBUG_OPENID=true`（默认已放行；设 `0`/`false` 才收紧，一般不要）。

发版前把 `config.local.js` 的 `debug` 改为 `false`（或删除该文件）。

### 4. 官方多账号 / 多编译模式（不改代码）

- **添加编译模式** / **多账号调试** / **两台真机预览**。
- 同一真实 openId 只能占一席。

### 5. 建议最小联调路径

1. `node scripts/test-engine.js` 与 `node scripts/test-openid.js` 变绿  
2. **重新上传** `login` + `api`  
3. 点 **本机双人自测** → 看到 `当前身份 · dbg_host` 且 **2/9** → **开一手**

## 许可

私人项目，按需使用。
