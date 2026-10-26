# Squishy Friends

A squishy-animal stim toy + tamagotchi for Android. Pick a fox, raccoon or cat, squish and stretch it
(multi-touch), shake and tilt the phone, switch its material (plush, play-dough, jelly, gummy),
and keep it fed, entertained, loved and rested.

* `tools/` – build-time scripts: sculpts the animals from signed-distance fields and bakes them to meshes.
* `src/` – the game (three.js + a custom soft-body simulation).
* `android/` – the tiny native shell (WebView + sensors + vibration) that becomes the APK.
* GitHub Actions builds `SquishyFriends.apk` on every push and attaches it to a Release.

## Developing

```bash
npm install
node tools/bake.js      # re-sculpt meshes after editing tools/models.js
node tools/build.js     # bundle the game to dist/index.html (open it in a browser to try it)
```

## Installing on the phone

1. Open the repo's **Releases** page on the phone and download `SquishyFriends.apk` from the newest release.
2. Tap the downloaded file. Android will ask to allow "Install unknown apps" for your browser / Files app — allow it once.
3. If Play Protect warns about an unrecognised app, choose **Install anyway** (the app is built right here from this code).
4. Updates install over the old version and keep your saved pets.
