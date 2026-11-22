# anki-forge-app

[English](README.md)

面向 [anki-exam-forge](https://github.com/nonuiucode/anki-exam-forge) 的**离线优先安卓原生 APK 与 Web/PWA 伴侣刷卡 App**：原生支持手机系统直接点开 `.apkg` 与 `deck.json`，提供 FSRS-5 间隔重复、真题考频冲刺、选择题交互判分、挖空逐空点击、附图全屏缩放、卡壳本（Leech）自动收纳分享回写，以及暖纸浅色 / 深蓝暗夜护眼双主题。

## 核心特性

- **100% 本地离线解析与打包 `.apkg`**：内置打包的 `sql.js`（SQLite WASM）+ `JSZip` + IndexedDB，无网络也能直接读写标准 `.apkg`（自动优先读取 `collection.anki21`，并还原内嵌解剖/课件图片）与 `anki-exam-forge` 生成的 `deck.json`。
- **安卓系统级文件关联与原生分享**：
  - 在微信、QQ 或手机文件管理里点击 `.apkg` / `deck.json` 时，可直接选择用 **Anki Forge** 打开并按 `guid` 原地合并更新（不丢失既有复习进度）。
  - 在「卡壳本」里一键导出 `leech-*.json` 或带复习记录的 `.apkg`，直接调起系统分享发回电脑交给 Agent 写记忆法助记。
- **FSRS-5 + 考前考频冲刺**：
  - 日常模式采用标准 FSRS-5 算法，底部四按钮实时预测下次复习间隔。
  - **考前冲刺模式**按 `01-高频必背 → 中频 → 常规 → 课件补充` 优先出题，支持设定考试倒计时自动测算每日目标题量。
- **三卡型原生交互与护眼界面**：
  - **MCQ 选择题**：点选即判对错并展开解析。
  - **Cloze 挖空题**：支持点击单个空位偷看提示或整张揭晓。
  - **附图看图缩放**：点击医学解剖图 / 心电图 / 课件图开启 `1× / 1.75× / 2.5×` 全屏缩放预览。
  - **极简双主题**：暖纸浅色与深蓝暗夜自由切换，配 90 天复习热力图与各考频层级掌握度条。

## 云端自动构建 APK（GitHub Actions）

无需在本地安装 Android Studio 或 SDK。每次推送到 `main` 分支或发布 `v*` 标签时，工作流 [`.github/workflows/build-apk.yml`](.github/workflows/build-apk.yml) 会自动完成测试、前端构建、Capacitor 同步与 Android APK 编译：

- 在仓库页面的 **Actions → Build Android APK** 下载最新构建产物 `AnkiForge-debug-apk`。
- 打上 `v*` 标签发布时，APK 会自动附带在对应 **GitHub Releases** 页面供手机直接下载安装。

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

1. 电脑上用 `anki-exam-forge` 统计历年真题考频、生成初始 `.apkg` → 发到手机直接点击打开开刷。
2. 考前把老师 PPT 增量补卡生成新版 `.apkg` → 手机直接打开原地合并，已背进度照常保留。
3. 手机「卡壳本」自动攒出反复遗忘题 → 一键分享回电脑配记忆法助记 → 生成补丁包再导回手机。

## 开源协议

基于 [MIT License](LICENSE) 开源。
