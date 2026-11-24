# 玖记（anki-forge-app）

[English](README.md)

**玖记**（Android 安装后桌面应用名：**玖记**）是面向 [anki-exam-forge](https://github.com/nonuiucode/anki-exam-forge) 的**离线优先安卓原生 APK 与 Web/PWA 伴侣刷卡 App**：原生支持手机系统直接点开 `.apkg` 与 `deck.json`，提供 FSRS-5 自动记忆曲线归档、每日与到期复习通知提醒、题目与选项乱序、移动端左右滑切题、真题考频冲刺、单/多选题交互判分、附图全屏缩放、卡壳本（Leech）自动收纳分享回写，以及浅色 / 暗夜护眼双主题与界面美化。

## 核心特性

- **100% 本地离线解析与打包 `.apkg`**：内置打包的 `sql.js`（SQLite WASM）+ `JSZip` + IndexedDB，无网络也能直接读写标准 `.apkg`（自动优先读取 `collection.anki21`，并还原内嵌解剖/心电图/课件图片）与 `anki-exam-forge` 生成的 `deck.json`。
- **安卓系统级文件关联与原生分享**：
  - 在微信、QQ 或手机文件管理里点击 `.apkg` / `deck.json` 时，可直接选择用 **玖记** 打开并按 `guid` 原地合并更新（不丢失既有复习进度）。
  - 在「卡壳本」里一键导出 `leech-*.json` 或带复习记录的 `.apkg`，直接调起系统分享发回电脑交给 Agent 写记忆法助记。
- **FSRS-5 自动归档 + 题目与选项乱序**：
  - **选择题自动按记忆曲线归档**：单选点选或 X 型多选提交后，App 根据正误、漏选情况与作答耗时自动计算 FSRS-5 评分并写入下次复习间隔（免去每题手动点四档评价），同时保留「重来 / 困难 / 良好 / 简单」供问答与挖空卡使用。
  - **题目与选项双乱序**：默认开启题目随机洗牌与 MCQ 选项顺序乱序（遇到“以上均正确”等位置关联句时自动保持原序）。
  - **考前冲刺模式**：按 `01-高频必背 → 中频 → 常规 → 课件补充` 优先出题（组内亦支持乱序），支持设定考试倒计时测算每日目标题量。
  - **系统复习通知提醒**：支持在「统计 → 复习提醒」设定每日定时推送（默认 `20:30`）及 FSRS 到期智能唤醒，并自动避开夜间 `23:00–07:30` 免打扰时段，重启手机后自动恢复排程。
- **移动端滑动手势与三卡型交互**：
  - **左右滑切题**：复习页支持跟手左滑下一题、右滑上一题（内置纵向滚动保护，长解析上下滑动不误触），并保留当前轮次已作答状态（回滑不重复记日志）。
  - **MCQ 选择题（单选 + X 型多选）**：单选与多选题统一支持「先选选项 → 提交判分」，防止单选误触，提交后自动高亮选对 / 漏选 / 错选并写入记忆曲线；附图置于题干与选项之间。
  - **Cloze 挖空题**：支持点击单个空位偷看提示或整张揭晓。
  - **附图双指缩放查看器**：点击心电图 / 解剖图 / 课件图进入全屏沉浸灯箱，支持原生手感双指捏合缩放（`1×–5×`，以双指中心为锚点）、边界限制拖拽平移、双击 `1× ↔ 2.5×` 缩放还原、下滑手势关闭，以及桌面端滚轮缩放与拖拽。
  - **应用内免翻墙检查更新**：在「统计」页底部提供检查更新入口，原生层按国内可用 CDN 与加速镜像顺序容灾探测 `version.json` 与安装包、核验 SHA-256 摘要，并直接调起系统覆盖安装。
  - **UI 全面美化改版与护眼双主题**：晴海（浅色）/ 深海（暗夜）双主题与统一线性图标、自定义开关与分段选择器、90 天复习热力图及各考频层级掌握度条。

## 云端自动构建 APK（GitHub Actions）

无需在本地安装 Android Studio 或 SDK。每次推送到 `main` 分支、PR 或发布 `v*` 标签时，工作流 [`.github/workflows/build-apk.yml`](.github/workflows/build-apk.yml) 会自动完成测试、前端构建、Capacitor 同步与 Android APK 编译：

- 当仓库配置了固定正式签名密钥 Secrets（`ANDROID_KEYSTORE_BASE64`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`）时，云端会编译并校验**固定正式签名 Release APK**（产物名 `Jiuji-AnkiForge-release-apk`，Release 附件 `Jiuji-AnkiForge-release.apk`），后续所有版本更新都能直接覆盖安装、保留做题进度。
- 在没有签名 Secrets 的 Fork 或 PR 上，工作流会自动回退为构建 `Jiuji-AnkiForge-debug.apk`。

## 本地开发与构建

```bash
# 安装依赖（postinstall 会自动把 sql-wasm.wasm 复制到 public/）
npm install

# 启动浏览器本地预览（可直接在桌面浏览器拖拽导入 .apkg / deck.json 体验）
npm run dev

# 运行 Vitest 单元测试（含与 anki-exam-forge 产物的端到端互通测试）
npm test

# 构建前端并同步到 Capacitor 安卓工程
npm run cap:sync
```

> 若希望在本机自行编译 APK，需准备 JDK 21 与 Android SDK（`compileSdk 35`），随后进入 `android/` 执行 `./gradlew assembleDebug`。

## 与 `anki-exam-forge` 配合闭环

1. 电脑上用 `anki-exam-forge` 统计历年真题考频并生成自带 AI 记忆法助记的初始 `.apkg` → 发到手机直接点击打开开刷。
2. 考前把老师 PPT 增量补卡生成新版 `.apkg` → 手机直接打开原地合并，已背进度照常保留。
3. 手机「卡壳本」自动攒出反复遗忘题 → 一键分享回电脑升级记忆法助记 → 生成补丁包再导回手机。

## 开源协议

基于 [MIT License](LICENSE) 开源。
