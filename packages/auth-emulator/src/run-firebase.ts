import type { Buffer } from 'node:buffer';
import type { AuthEmulatorOptions } from './types';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const PORT_CONFLICT = /Could not start Authentication Emulator, port taken/u;
const OUTPUT_TAIL_LENGTH = 8192;
const ANSI_256_COLOR_DEPTH = 8;
const TRUE_COLOR_DEPTH = 24;

/**
 * Firebase CLI release launched through npx. It is not a dependency, so its
 * dependency tree never joins the consumer's install and cannot change how
 * their packages resolve (for example a second copy of Next.js).
 */
export const FIREBASE_TOOLS_VERSION = '15.35.0';

/** Locate npx bundled with the running Node.js (Windows and POSIX layouts). */
function findNpxCli(): string {
  const nodeDirectory = path.dirname(process.execPath);
  const candidates = [
    path.join(nodeDirectory, 'node_modules/npm/bin/npx-cli.js'),
    path.join(nodeDirectory, '../lib/node_modules/npm/bin/npx-cli.js'),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (found === undefined) {
    throw new Error(
      'npx was not found next to Node.js. Install firebase-tools and pass its lib/bin/firebase.js as firebaseCliPath (--firebase-cli).',
    );
  }
  return found;
}

/** Node.js arguments that start the Firebase CLI, before Firebase's own arguments. */
export function firebaseCommand(firebaseCliPath?: string): string[] {
  if (firebaseCliPath !== undefined) return [firebaseCliPath];
  return [
    findNpxCli(),
    '--yes',
    `--package=firebase-tools@${FIREBASE_TOOLS_VERSION}`,
    '--',
    'firebase',
  ];
}

/** Preserve terminal color support across Firebase's captured output pipes. */
function firebaseEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  const forced = environment['FORCE_COLOR'];
  const colorDisabled =
    (environment['NO_COLOR'] ?? '') !== '' ||
    (environment['NODE_DISABLE_COLORS'] ?? '') !== '';
  if (forced !== undefined) {
    if (forced === '' && !colorDisabled) {
      environment['FORCE_COLOR'] = '1';
    }
    return environment;
  }
  if (colorDisabled) {
    return environment;
  }
  const depth = process.stdout.isTTY ? process.stdout.getColorDepth() : 1;
  if (depth >= 4) {
    let forceColor = '1';
    if (depth >= ANSI_256_COLOR_DEPTH) {
      forceColor = '2';
    }
    if (depth >= TRUE_COLOR_DEPTH) {
      forceColor = '3';
    }
    environment['FORCE_COLOR'] = forceColor;
  }
  return environment;
}

/** Run the Firebase CLI and preserve its output, environment, and exit status. */
export async function runFirebase(
  options: AuthEmulatorOptions,
  configFile: string,
  cwd: string,
): Promise<{ exitCode: number; portConflict: boolean }> {
  const firebase = firebaseCommand(options.firebaseCliPath);
  const args = [
    options.command === undefined ? 'emulators:start' : 'emulators:exec',
    '--only',
    'auth',
    '--project',
    options.projectId,
    '--config',
    configFile,
  ];
  if (options.importDirectory !== undefined) {
    args.push('--import', path.resolve(cwd, options.importDirectory));
  }
  if (options.command !== undefined) {
    if (options.ui === true) args.push('--ui');
    args.push(options.command);
  }
  const child = spawn(process.execPath, [...firebase, ...args], {
    cwd,
    env: firebaseEnvironment(),
    stdio: ['inherit', 'pipe', 'pipe'],
    windowsHide: true,
    signal: options.signal,
  });
  let output = '';
  const onOutput = (stream: NodeJS.WriteStream, data: Buffer): void => {
    output = (output + data.toString()).slice(-OUTPUT_TAIL_LENGTH);
    stream.write(data);
  };
  child.stdout.on('data', (data: Buffer) => onOutput(process.stdout, data));
  child.stderr.on('data', (data: Buffer) => onOutput(process.stderr, data));
  let failure: Error | undefined;
  const exitCode = await new Promise<number>((resolve, reject) => {
    // Wait for close even on abort so cleanup happens after the process stops.
    child.once('error', (error) => {
      failure = error;
    });
    child.once('close', (code) => {
      if (failure !== undefined && !options.signal?.aborted) reject(failure);
      else resolve(code ?? 1);
    });
  });
  return { exitCode, portConflict: PORT_CONFLICT.test(output) };
}
