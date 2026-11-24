# 玖记 · Jiuji (anki-forge-app)

[中文文档](README.zh.md)

**玖记 (Jiuji)** is an **offline-first Android native APK & Web/PWA flashcard companion** for [anki-exam-forge](https://github.com/nonuiucode/anki-exam-forge). Opens `.apkg` and `deck.json` files directly from Android system intents/share sheets, automatically schedules MCQs with **FSRS-5**, shuffles both question order and MCQ options, supports touch swipe navigation, prioritizes past-exam frequency tiers, renders zoomable medical diagrams, and exports stuck (`leech`) cards back for mnemonic repair.

## Key Features

- **100% Offline `.apkg` & `deck.json` Codec**: Bundles `sql.js` (SQLite WASM) + `JSZip` + IndexedDB locally so importing/exporting `.apkg` archives (preferring `collection.anki21` over `collection.anki2`, preserving `guid`s and embedded images) works completely offline.
- **Native Android File Association & Share Sheet**:
  - Registers `ACTION_VIEW` and `ACTION_SEND` intent filters so tapping `.apkg` or `deck.json` inside WeChat, QQ, Telegram, or Android Files opens directly in **玖记** (Android launcher name: `玖记`), updating existing notes in place by `guid` without losing review progress.
  - One-tap export of `leech-*.json` or scheduling-aware `.apkg` via Android `FileProvider` share sheet.
- **Automatic FSRS-5 Scheduling & Dual Shuffling**:
  - **Auto-scheduled MCQs**: After picking a single-choice answer or submitting an X-type multi-select card, FSRS-5 interval grading is computed automatically from verdict (`correct` / `partial` / `wrong`) and response time — no repetitive 4-button rating step required after every MCQ (while Basic & Cloze cards keep the 4-button FSRS bar).
  - **Question & Option Shuffling**: Both deck question queues (with within-tier shuffling in Exam Sprint mode) and MCQ answer choices shuffle cleanly per session (automatically skipping positional-reference options like `"All of the above"` / `"以上均正确"`), displaying original option tags (`原X`) after reveal.
  - **Native Review Reminders**: Daily scheduled Android notifications summarizing due/leech/new cards plus quiet-hour-aware FSRS due reminders that survive device reboots.
- **Touch Swipe Navigation & UI Polish**:
  - Horizontal touch swipe left/right between previous and next cards with vertical-scroll protection and per-session answer preservation (swiping back never double-logs reviews).
  - Single-choice tap-to-grade and X-type multi-select MCQs (checkbox toggle + submit-to-grade with per-option correct/missed/wrong breakdown, stem-first diagram placement), per-blank peekable Cloze deletions, full-screen `1× / 1.75× / 2.5×` diagram lightbox, 90-day SVG heatmap, and eye-care light/dark UI polish.

## Cloud APK Compilation (GitHub Actions)

No local Android Studio or SDK is required. On every push to `main`, PR, or `v*` tag, [`.github/workflows/build-apk.yml`](.github/workflows/build-apk.yml) runs Vitest, builds Vite, syncs Capacitor Android, compiles the APK with Temurin JDK 21 + Android API 35, and uploads `Jiuji-AnkiForge-debug-apk` (plus attaches `Jiuji-AnkiForge-debug.apk` to GitHub Releases on `v*` tags).

## Local Development

```bash
npm install
npm run dev      # Local browser preview (supports drag-and-drop .apkg / deck.json)
npm test         # Run Vitest suite (FSRS-5 + MCQ shuffling/auto-rating + offline .apkg interop)
npm run cap:sync # Typecheck, bundle Vite, and sync assets into android/
```

To compile the APK locally on your own machine, ensure JDK 21 and Android SDK (API 35) are configured and run `./gradlew assembleDebug` inside `android/`.

## License

Released under the [MIT License](LICENSE).
