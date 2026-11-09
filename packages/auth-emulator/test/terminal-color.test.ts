import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAuthEmulator } from '../src';
import { createFixture } from './fixture';

const fixtures: ReturnType<typeof createFixture>[] = [];
const originalStdoutTty = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
const originalStdoutDepth = Object.getOwnPropertyDescriptor(
  process.stdout,
  'getColorDepth',
);
const originalStderrTty = Object.getOwnPropertyDescriptor(process.stderr, 'isTTY');

function restoreProperty(
  target: object,
  name: string,
  original?: PropertyDescriptor,
): void {
  if (original === undefined) Reflect.deleteProperty(target, name);
  else Object.defineProperty(target, name, original);
}

function setTerminalDepth(depth: number | undefined): void {
  Object.defineProperty(process.stdout, 'isTTY', {
    configurable: true,
    value: depth !== undefined,
  });
  Object.defineProperty(process.stdout, 'getColorDepth', {
    configurable: true,
    value: () => depth ?? 1,
  });
  Object.defineProperty(process.stderr, 'isTTY', { configurable: true, value: false });
}

beforeEach(() => {
  vi.stubEnv('FORCE_COLOR', undefined);
  vi.stubEnv('NO_COLOR', undefined);
  vi.stubEnv('NODE_DISABLE_COLORS', undefined);
  vi.stubEnv('TERM', 'xterm-256color');
});

afterEach(() => {
  restoreProperty(process.stdout, 'isTTY', originalStdoutTty);
  restoreProperty(process.stdout, 'getColorDepth', originalStdoutDepth);
  restoreProperty(process.stderr, 'isTTY', originalStderrTty);
  vi.unstubAllEnvs();
  for (const value of fixtures.splice(0)) {
    if (path.dirname(path.resolve(value.directory)) !== path.resolve(tmpdir())) {
      throw new Error('Unexpected temporary directory');
    }
    rmSync(value.directory, { recursive: true, force: true });
  }
});

async function childColor(): Promise<string | null> {
  const value = createFixture({ authPort: 9199 });
  fixtures.push(value);
  const resultFile = path.join(value.directory, 'color.json');
  const grandchild =
    'process.stdout.write(JSON.stringify({color:process.env.FORCE_COLOR ?? null}))';
  writeFileSync(
    value.options.firebaseCliPath!,
    [
      "const fs = require('node:fs');",
      "const { spawnSync } = require('node:child_process');",
      `const result = spawnSync(process.execPath, ['-e', ${JSON.stringify(grandchild)}], { encoding: 'utf8' });`,
      `fs.writeFileSync(${JSON.stringify(resultFile)}, result.stdout);`,
      'process.exit(result.status ?? 1);',
    ].join('\n'),
  );
  expect(await runAuthEmulator({ ...value.options, command: 'web dev' })).toBe(0);
  return (JSON.parse(readFileSync(resultFile, 'utf8')) as { color: string | null }).color;
}

describe('terminal colors through the Firebase runner', () => {
  it.each([
    [4, '1'],
    [8, '2'],
    [24, '3'],
  ] as const)(
    'should pass terminal color depth %i through to the nested web process',
    async (depth, expected) => {
      setTerminalDepth(depth);
      await expect(childColor()).resolves.toBe(expected);
    },
  );

  it('should leave redirected output unforced', async () => {
    setTerminalDepth(undefined);
    await expect(childColor()).resolves.toBeNull();
  });

  it('should respect a terminal that does not support color', async () => {
    setTerminalDepth(1);
    await expect(childColor()).resolves.toBeNull();
  });

  it.each(['0', '3'])('should preserve an explicit FORCE_COLOR=%s', async (value) => {
    setTerminalDepth(4);
    vi.stubEnv('FORCE_COLOR', value);
    await expect(childColor()).resolves.toBe(value);
  });

  it('should normalize empty FORCE_COLOR as enabled even for redirected output', async () => {
    setTerminalDepth(undefined);
    vi.stubEnv('FORCE_COLOR', '');
    await expect(childColor()).resolves.toBe('1');
  });

  it.each(['NO_COLOR', 'NODE_DISABLE_COLORS'] as const)(
    'should normalize empty FORCE_COLOR when %s is also empty',
    async (name) => {
      setTerminalDepth(undefined);
      vi.stubEnv('FORCE_COLOR', '');
      vi.stubEnv(name, '');
      await expect(childColor()).resolves.toBe('1');
    },
  );

  it.each(['NO_COLOR', 'NODE_DISABLE_COLORS'] as const)(
    'should not disable color for an empty %s',
    async (name) => {
      setTerminalDepth(8);
      vi.stubEnv(name, '');
      await expect(childColor()).resolves.toBe('2');
    },
  );

  it.each(['NO_COLOR', 'NODE_DISABLE_COLORS'] as const)(
    'should not force color when %s is set',
    async (name) => {
      setTerminalDepth(8);
      vi.stubEnv(name, '1');
      await expect(childColor()).resolves.toBeNull();
    },
  );
});
