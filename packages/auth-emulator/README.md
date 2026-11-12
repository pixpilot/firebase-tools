# @pixpilot/firebase-auth-emulator

Start the Firebase Auth Emulator with automatic ports and optional child-command lifecycle management. Node.js only.

```sh
pnpm add -D @pixpilot/firebase-auth-emulator
firebase-auth-emulator --project demo-my-app --import emulator-seed
firebase-auth-emulator --project demo-my-app --import emulator-seed --ui --exec "pnpm dev"
```

The Firebase CLI (`firebase-tools`, pinned version) runs through the npx bundled with Node.js and is downloaded on first use. It is deliberately not a dependency: its large dependency tree would otherwise join your install and can split shared packages, such as a second copy of Next.js with incompatible types. To use your own install instead, pass `--firebase-cli <path to firebase-tools/lib/bin/firebase.js>` (or `firebaseCliPath`). Paths are relative to the working directory; the config defaults to `firebase.emulator.json`.

```json
{
  "emulators": {
    "auth": { "host": "127.0.0.1" },
    "ui": { "enabled": true, "host": "127.0.0.1" }
  }
}
```

Omit `auth.port` for automatic selection from 9099 through 65535, using `@pixpilot/net`. Omit `ui.port` for Firebase's automatic UI port selection. Set a numeric port to keep it fixed: conflicts fail rather than changing your choice. Automatic Auth startup conflicts retry up to five times. The original config and environment files are never rewritten.

```ts
import { runAuthEmulator } from '@pixpilot/firebase-auth-emulator';

const exitCode = await runAuthEmulator({
  projectId: 'demo-my-app',
  cwd: '/path/to/project',
  configFile: 'firebase.emulator.json',
  importDirectory: 'emulator-seed',
  command: 'pnpm dev',
  ui: true,
});
```

`runAuthEmulator()` returns the child exit code and throws for configuration or process startup errors. Pass an `AbortSignal` to stop Firebase from a host process; it does not install global signal handlers. The CLI handles terminal shutdown.

When standard output is a color-capable terminal, the runner preserves its color depth for Firebase and child commands despite capturing their output. Explicit color settings and redirected output are respected.

Firebase's `emulators:exec` supplies `FIREBASE_AUTH_EMULATOR_HOST` to the child command. For server-side provider sign-in, compose the separate `@pixpilot-private/auth-firebase-emulator` proxy in the exec command. This runner does not provide provider sign-in, reuse another project's emulator, or choose your project's seed accounts.

Use a distinct demo project ID to keep local projects separate. When running the web app in another terminal, use the Auth address printed by Firebase. Temporary config files are removed on normal shutdown and failures.
