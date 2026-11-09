import type { Buffer } from 'node:buffer';
import type { AuthEmulatorOptions } from './types';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';

const PORT_CONFLICT = /Could not start Authentication Emulator, port taken/u;
const OUTPUT_TAIL_LENGTH = 8192;
const ANSI_256_COLOR_DEPTH = 8;
const TRUE_COLOR_DEPTH = 24;

/** Preserve terminal color support across Firebase's captured output pipes. */
function firebaseEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  const forced = environment['FORCE_COLOR'];
  if (forced !== undefined) {
    if (
      forced === '' &&
      environment['NO_COLOR'] == null &&
      environment['NODE_DISABLE_COLORS'] == null
    ) {
      environment['FORCE_COLOR'] = '1';
    }
    return environment;
  }
  if (environment['NO_COLOR'] != null || environment['NODE_DISABLE_COLORS'] != null) {
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

/** Run the installed Firebase CLI and preserve its output, environment, and exit status. */
export async function runFirebase(
  options: AuthEmulatorOptions,
  configFile: string,
  cwd: string,
): Promise<{ exitCode: number; portConflict: boolean }> {
  const firebaseCli =
    options.firebaseCliPath ??
    createRequire(import.meta.url).resolve('firebase-tools/lib/bin/firebase.js');
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
  const child = spawn(process.execPath, [firebaseCli, ...args], {
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
