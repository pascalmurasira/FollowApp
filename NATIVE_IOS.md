# FollowApp iOS release notes

FollowApp now has a Capacitor iOS shell in `ios/` for App Store preparation.

## What is configured

- App name: `FollowApp`
- Bundle ID: `com.pascalmurasira.followapp`
- Native runtime: Capacitor 8
- Package manager: Swift Package Manager
- iOS target: iOS 15+
- Default production web URL: `https://followapp.chat`
- Optional local native dev URL: set with `FOLLOWAPP_NATIVE_SERVER_URL`

The app has server API routes, so native builds load a hosted FollowApp instance.
For local simulator testing:

```sh
pnpm dev
FOLLOWAPP_NATIVE_SERVER_URL=http://localhost:3000 pnpm native:sync
```

For TestFlight/App Store builds, set your real production URL before syncing:

```sh
FOLLOWAPP_NATIVE_SERVER_URL=https://followapp.chat pnpm native:sync
```

## Local commands

```sh
pnpm build
pnpm native:sync
pnpm native:open:ios
```

Optional TestFlight automation after Xcode is installed:

```sh
bundle install
cd ios
FOLLOWAPP_APPLE_ID=you@example.com FOLLOWAPP_APPLE_TEAM_ID=YOURTEAMID bundle exec fastlane testflight
```

## Required before App Store submission

1. Install full Xcode from Apple and open it once so it finishes installing components.
2. In Xcode, set your Apple Developer Team for the `App` target.
3. Confirm the bundle ID is available in your Apple Developer account.
4. Replace generated placeholder app icons/splash assets with final FollowApp assets.
5. Confirm the production backend is live during review.
6. Complete App Store Connect metadata, screenshots, age rating, support URL, and privacy questionnaire.
7. Submit first through TestFlight before App Store review.

## App Review watch-outs

FollowApp should not be positioned as a thin web wrapper. The iOS build already uses native share, clipboard, haptics, external browser, status bar, and camera permission plumbing. Before public submission, keep strengthening the native feel around reminders, notifications, calendar handoff, and contact import.
