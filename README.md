# PlayGround

<!-- omgithub:readme:start -->
## 🚀 Build, play, and remix with OMGithub

**Created using [OMGithub.com](https://go.ondev.store/).**

[![OMGithub](https://img.shields.io/badge/OMGithub-Open%20project-orange?style=for-the-badge)](https://go.ondev.store/mustafacangezici13-cell/PlayGround)
[![GitHub](https://img.shields.io/badge/GitHub-Source-181717?logo=github&style=for-the-badge)](https://github.com/mustafacangezici13-cell/PlayGround)

- 🎮 [Open the project](https://go.ondev.store/mustafacangezici13-cell/PlayGround).
- ✨ [Remix this project](https://go.ondev.store/mustafacangezici13-cell/PlayGround?remix=1).
- 💻 [Explore the source](https://github.com/mustafacangezici13-cell/PlayGround).
- 🛠️ [Check build runs](https://github.com/mustafacangezici13-cell/PlayGround/actions).
- 🐛 [Report an issue](https://github.com/mustafacangezici13-cell/PlayGround/issues).
- 👤 [Explore the creator's projects](https://go.ondev.store/mustafacangezici13-cell).
- 🌍 [Create with OMGithub](https://go.ondev.store/).
<!-- omgithub:readme:end -->

## The Chess Club

A browser chess game against ten fictional opponents. Open `index.html` through a local web server (for example, `python3 -m http.server`) and visit the server address. Select a bot to start a fresh game; select a piece and a highlighted square to move. The displayed Elo values are difficulty labels, not measured tournament ratings.

## Android APK

A playable Android WebView wrapper is in `android/`. The web game is copied into the APK automatically during the build, so the wrapper stays in sync with the browser version.

- **Install/download:** [The Chess Club APK](dist/ChessClub.apk)
- **Build:** `gradle -p android assembleDebug` (Android SDK required). The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`.

The provided APK is a debug-signed build for testing or direct installation. Publishing through Google Play requires a release build signed with your own key.

