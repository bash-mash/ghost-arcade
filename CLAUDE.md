# Ghost Arcade — fork notes for Claude

This is **bash-mash/ghost-arcade**, a fork of `riskcapital/ghost-arcade`
(Electron + Svelte 5 + Three.js projection-mapping / VJ app, AGPL-3.0).
The owner uses it for live projection shows with **two 1920×1200 projectors on
a Windows PC**, and distributes it to other Windows PCs via the installer below.

## Working agreement
- Before any commit or push: code-review your own diff, fix what you find,
  report the findings, then **wait for the owner's explicit go-ahead**.
- Every push to `main` builds a Windows installer, so don't push half-done work.
- Explain things in plain language; the owner isn't a developer.

## Remotes, builds, running
- `origin` = the fork, `upstream` = riskcapital/ghost-arcade.
- `.github/workflows/windows-installer.yml` builds an **unsigned NSIS
  installer** on every push to `main` (or manually from the Actions tab) using
  `electron-builder.local.yml` (no Azure signing, no publishing). Download it
  from the run's **Artifacts** → `Ghost-Arcade-Windows-Installer`.
  Installing over an older version upgrades in place; settings stay in
  `%APPDATA%\ghost-arcade`.
- Run from source: `npm ci`, then `npm run desktop` (Vite on :1420 + Electron).
  If the window is black, press Ctrl/Cmd+R (Electron raced Vite).
- Checks: `npx svelte-check --tsconfig ./tsconfig.desktop.json` (expect 0
  errors; ~966 pre-existing warnings) and `npx vitest run`.
- Windows log file (renderer errors included): `%LOCALAPPDATA%\ghost-arcade-debug.log`,
  rewritten on each launch. Packaged Windows builds have no DevTools menu.
- Driving the real app for tests: `npx electron . --remote-debugging-port=9223`
  and evaluate JS in the editor page over CDP. Stores can be imported in the
  page via the exact module URL from `performance.getEntriesByType('resource')`
  (Vite adds `?t=` after HMR, so a bare import gets a different instance).

## What this fork changes (vs upstream 5f402f7)
- **Per-layer video sound**: `MediaSource.audioEnabled` (default on) + `volume`;
  speaker button + slider in the layer panel (`LayerPanel.svelte`),
  `map:media:audio|volume` MIDI/OSC paths. Canvas unmutes only in the editor
  (`playVideoAudio` prop set by `App.svelte`), only for mapping layers (not VJ
  deck clips), never for hidden layers / hidden groups / 0 opacity.
- **Independent layers**: each mapping video layer has its own `<video>` and a
  per-layer texture key (`${layer.id}:${src}`), so play/pause/mute/volume don't
  leak between layers showing the same clip (`Canvas.svelte`
  `ensureOwnVideoElement`, `MediaTray.svelte` apply).
- **Projector windows in step**: `isPlaying` + `restartToken` are exported and
  synced (`layers.ts` export, `stateBroadcast.ts`); `importProject` keeps a
  layer's live `<video>` across re-imports; Canvas pauses mapping layers whose
  source is paused and seeks on restart-token change.
- **Screen outlines** on the canvas while editing layers, with a "Screens"
  toggle in the bottom bar (`ScreenOutlinesOverlay.svelte`,
  `settings.ui.showScreenOutlines`). Editor-only, never in the output.
- **Smart Fullscreen**: with Screens set up, the toolbar Fullscreen opens every
  screen on its projector (auto-assigning displays left→right, sizing master +
  project canvas to the rig) and closes them on the next click
  (`src/lib/output/screenWindows.ts`, pure helpers in `screenLayout.ts`).
  Output Window stays a single whole-canvas preview.
- **Reopen last project on startup** (`src/lib/project/sessionRestore.ts`):
  last opened/saved `.gha` reopens automatically; the crash autosave is only
  kept when there are real unsaved edits (fingerprint ignores play state), so
  the Recover prompt only appears when needed.
- Project setup for two 1920×1200 projectors: Settings → Canvas → Resolution
  **3840×1200**, Screens tab → **2-Wide**, then Fullscreen.

## Open issue (as of 2026-10-07)
On the owner's **Windows PC**, after pressing Fullscreen with two screens,
**imported videos freeze in the editor and on both projectors** (FX/shaders
keep animating; play/pause doesn't help; MP4 files). Not reproducible on macOS
in either output mode (zero-copy mirror or own-copy fallback) or after the
canvas resize. Same freeze was seen with the old Output Window/Fullscreen, so
it predates this fork's changes. Suspected: video-frame upload failing on that
GPU setup (zero-copy output and/or hardware video decode across GPUs).
Next steps given to the owner:
1. Settings → GPU Acceleration → turn off **Zero-copy GPU output**, reopen
   Fullscreen, test.
2. If not fixed: launch with `--projection-safe-mode` (adds `disable-zero-copy`
   in `electron/main.js`).
3. Send the last ~50 lines of `%LOCALAPPDATA%\ghost-arcade-debug.log`.
Whichever fixes it should become the automatic behaviour for that setup.

## Ideas parked for later
- AI "ride" feature: phone photo (mobile companion) → video-to-video model puts
  the guest on a horse/dinosaur in the owner's reference clips → auto-swap onto
  a layer → optional "Happy Birthday" song with the guest's name (ffmpeg mux).
  Start by testing 2–3 current video-to-video APIs on the owner's clips.
- Double-clicking a `.gha` to launch the app isn't wired (file association
  exists, `main.js` doesn't forward the file).
