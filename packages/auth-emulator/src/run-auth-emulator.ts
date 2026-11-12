import type { AuthEmulatorOptions } from './types';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { findAvailablePort } from '@pixpilot/net';
import { readEmulatorConfig } from './read-emulator-config';
import { runFirebase } from './run-firebase';

const DEFAULT_AUTH_PORT = 9099;
const MAX_PORT = 65535;
const MAX_START_ATTEMPTS = 5;

/** Start an isolated Auth emulator, selecting omitted ports at runtime and preserving fixed ports. */
export async function runAuthEmulator(options: AuthEmulatorOptions): Promise<number> {
  if (options.projectId.trim() === '')
    throw new Error('A Firebase project ID is required.');
  if (options.command !== undefined && options.command.trim() === '') {
    throw new Error('The exec command must not be empty.');
  }
  options.signal?.throwIfAborted();
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const source = readEmulatorConfig(
    path.resolve(cwd, options.configFile ?? 'firebase.emulator.json'),
  );
  const automatic = source.emulators.auth.port === undefined;
  const excluded = new Set<number>();
  for (const [name, endpoint] of Object.entries(source.emulators)) {
    if (
      name !== 'auth' &&
      typeof endpoint === 'object' &&
      endpoint !== null &&
      'port' in endpoint &&
      typeof endpoint.port === 'number'
    ) {
      excluded.add(endpoint.port);
    }
  }
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'firebase-auth-emulator-'));
  let exitCode = 1;
  try {
    for (let attempt = 0; attempt < MAX_START_ATTEMPTS; attempt++) {
      options.signal?.throwIfAborted();
      const config = structuredClone(source);
      if (automatic) {
        // eslint-disable-next-line no-await-in-loop
        config.emulators.auth.port = await findAvailablePort(DEFAULT_AUTH_PORT, {
          host: config.emulators.auth.host ?? '127.0.0.1',
          exclude: excluded,
          maxAttempts: MAX_PORT - DEFAULT_AUTH_PORT + 1,
        });
      }
      const configFile = path.join(temporaryDirectory, 'firebase.json');
      writeFileSync(configFile, JSON.stringify(config));
      // Firebase assigns an omitted UI port and exports the Auth host to the child command.
      // eslint-disable-next-line no-await-in-loop
      const result = await runFirebase(options, configFile, cwd);
      exitCode = result.exitCode;
      if (!automatic || !result.portConflict || exitCode === 0 || options.signal?.aborted)
        break;
      excluded.add(config.emulators.auth.port!);
    }
    return exitCode;
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}
