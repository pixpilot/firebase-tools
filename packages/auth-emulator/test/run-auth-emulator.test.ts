import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAuthEmulator } from '../src';
import { createFixture } from './fixture';

const fixtures: ReturnType<typeof createFixture>[] = [];
function fixture(options: Parameters<typeof createFixture>[0] = {}) {
  const value = createFixture(options);
  fixtures.push(value);
  return value;
}

afterEach(() => {
  for (const value of fixtures.splice(0)) {
    try {
      for (const call of value.calls()) expect(existsSync(call.configFile)).toBe(false);
    } finally {
      rmSync(value.directory, { recursive: true, force: true });
    }
  }
});

describe('runAuthEmulator', () => {
  it('should skip an occupied default port without rewriting the project config', async () => {
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE' || error.code === 'EACCES') resolve();
        else reject(error);
      });
      server.listen(9099, '127.0.0.1', resolve);
    });
    try {
      const value = fixture();
      await expect(runAuthEmulator(value.options)).resolves.toBe(0);
      const [call] = value.calls();
      expect(call!.config.emulators.auth.port).toBeGreaterThan(9099);
      expect(call!.config.emulators.ui).not.toHaveProperty('port');
      expect(call!.args).toEqual([
        'emulators:start',
        '--only',
        'auth',
        '--project',
        'demo-custom-project',
        '--config',
        call!.configFile,
        '--import',
        path.join(value.directory, 'seed'),
      ]);
      expect(call!.cwd).toBe(value.directory);
      expect(readFileSync(value.configFile, 'utf8')).toBe(value.original);
    } finally {
      if (server.listening)
        await new Promise<void>((resolve) => {
          server.close(() => resolve());
        });
    }
  });

  it('should preserve fixed ports and forward the exact exec command', async () => {
    const value = fixture({ authPort: 9199, uiPort: 4100 });
    const command = 'pnpm exec custom-proxy -- pnpm --filter my-app dev';
    await expect(runAuthEmulator({ ...value.options, command, ui: true })).resolves.toBe(
      0,
    );
    const [call] = value.calls();
    expect(call!.config.emulators.auth.port).toBe(9199);
    expect(call!.config.emulators.ui?.port).toBe(4100);
    expect(call!.args[0]).toBe('emulators:exec');
    expect(call!.args.slice(-2)).toEqual(['--ui', command]);
  });

  it('should reserve a fixed UI port during automatic Auth selection', async () => {
    const value = fixture({ uiPort: 9099 });
    await expect(runAuthEmulator(value.options)).resolves.toBe(0);
    expect(value.calls()[0]!.config.emulators.auth.port).toBeGreaterThan(9099);
    expect(value.calls()[0]!.config.emulators.ui?.port).toBe(9099);
  });

  it('should retry startup conflicts only for automatic Auth ports', async () => {
    const value = fixture({ conflicts: 1 });
    await expect(runAuthEmulator(value.options)).resolves.toBe(0);
    const calls = value.calls();
    expect(calls).toHaveLength(2);
    expect(calls[0]!.config.emulators.auth.port).not.toBe(
      calls[1]!.config.emulators.auth.port,
    );
  });

  it('should fail a fixed-port conflict without changing the port or retrying', async () => {
    const value = fixture({ authPort: 9199, conflicts: 1 });
    await expect(runAuthEmulator(value.options)).resolves.toBe(1);
    expect(value.calls()).toHaveLength(1);
    expect(value.calls()[0]!.config.emulators.auth.port).toBe(9199);
  });

  it('should limit automatic startup retries', async () => {
    const value = fixture({ conflicts: 10 });
    await expect(runAuthEmulator(value.options)).resolves.toBe(1);
    expect(value.calls()).toHaveLength(5);
  });

  it('should return unrelated child failures without retrying', async () => {
    const value = fixture({ exitCode: 7 });
    await expect(runAuthEmulator(value.options)).resolves.toBe(7);
    expect(value.calls()).toHaveLength(1);
  });

  it('should reject identical fixed Auth and UI ports', async () => {
    const value = fixture({ authPort: 9199, uiPort: 9199 });
    await expect(runAuthEmulator(value.options)).rejects.toThrow(
      'must use different ports',
    );
    expect(value.calls()).toHaveLength(0);
  });

  it.each(['', '   '])('should reject an empty project ID: %j', async (projectId) => {
    const value = fixture();
    await expect(runAuthEmulator({ ...value.options, projectId })).rejects.toThrow(
      'project ID',
    );
  });

  it('should reject an empty exec command', async () => {
    const value = fixture();
    await expect(runAuthEmulator({ ...value.options, command: '  ' })).rejects.toThrow(
      'exec command',
    );
  });

  it.each([
    {},
    { emulators: {} },
    { emulators: { auth: { port: 'auto' } } },
    { emulators: { auth: { port: 65536 } } },
  ])('should reject invalid configuration %j', async (config) => {
    const value = fixture();
    writeFileSync(value.configFile, JSON.stringify(config));
    await expect(runAuthEmulator(value.options)).rejects.toThrow();
    expect(value.calls()).toHaveLength(0);
  });

  it('should stop the child and clean up when aborted', async () => {
    const value = fixture({ hang: true });
    const controller = new AbortController();
    const result = runAuthEmulator({ ...value.options, signal: controller.signal });
    await vi.waitFor(() => expect(value.calls()).toHaveLength(1));
    controller.abort();
    await expect(result).resolves.toBe(1);
  });

  it('should reject an already aborted launch without starting a child', async () => {
    const value = fixture();
    await expect(
      runAuthEmulator({ ...value.options, signal: AbortSignal.abort() }),
    ).rejects.toThrow();
    expect(value.calls()).toHaveLength(0);
  });
});
