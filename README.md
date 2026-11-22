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
  pages/index|lobby|table
  utils/
cloudfunctions/
  login/               # 获取 openId
  api/                 # 局内全部写操作 + lib/engine 规则引擎
database/schema.md     # 云数据库集合说明
scripts/test-engine.js # 本地引擎冒烟测试（无需微信）
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

## 许可

私人项目，按需使用。
