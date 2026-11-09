import type { AuthEmulatorConfig, AuthEmulatorOptions } from '../src/types';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export interface Invocation {
  args: string[];
  cwd: string;
  config: AuthEmulatorConfig;
  configFile: string;
}

/** Build an isolated project and a local Firebase CLI stand-in for process tests. */
export function createFixture({
  authPort,
  uiPort,
  conflicts = 0,
  exitCode = 0,
  hang = false,
}: {
  authPort?: number;
  uiPort?: number;
  conflicts?: number;
  exitCode?: number;
  hang?: boolean;
} = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'firebase-auth-runner-test-'));
  mkdirSync(path.join(directory, 'settings'));
  const configFile = path.join(directory, 'settings/firebase.json');
  const original = JSON.stringify({
    emulators: {
      auth: { host: '127.0.0.1', port: authPort },
      ui: { enabled: true, host: '127.0.0.1', port: uiPort },
    },
  });
  writeFileSync(configFile, original);
  const logFile = path.join(directory, 'calls.jsonl');
  const firebaseCliPath = path.join(directory, 'firebase.cjs');
  writeFileSync(
    firebaseCliPath,
    `
    const fs = require('node:fs');
    const args = process.argv.slice(2);
    const configFile = args[args.indexOf('--config') + 1];
    const config = JSON.parse(fs.readFileSync(configFile,'utf8'));
    const logFile = ${JSON.stringify(logFile)};
    fs.appendFileSync(logFile, JSON.stringify({args,cwd:process.cwd(),config,configFile}) + '\\n');
    const attempts = fs.readFileSync(logFile,'utf8').trim().split('\\n').length;
    if(attempts <= ${conflicts}) {
      console.error('Could not start Authentication Emulator, port taken.');
      process.exit(1);
    }
    if(${hang}) setTimeout(()=>process.exit(0),30000);
    else process.exit(${exitCode});
  `,
  );
  const options: AuthEmulatorOptions = {
    projectId: 'demo-custom-project',
    cwd: directory,
    configFile: 'settings/firebase.json',
    importDirectory: 'seed',
    firebaseCliPath,
  };
  const calls = (): Invocation[] =>
    existsSync(logFile)
      ? readFileSync(logFile, 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line) as Invocation)
      : [];
  return { directory, configFile, original, options, calls };
}
