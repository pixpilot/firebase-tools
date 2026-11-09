import { rmSync } from 'node:fs';
import process from 'node:process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runCli } from '../src/run-cli';
import { createFixture } from './fixture';

const directories: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('firebase-auth-emulator CLI', () => {
  it('should show help without requiring a project or starting Firebase', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    await expect(runCli(['--help'])).resolves.toBe(0);
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining('Usage: firebase-auth-emulator'),
    );
  });

  it.each([{ args: [] }, { args: ['--unknown'] }, { args: ['--project', ''] }])(
    'should report invalid arguments $args',
    async ({ args }) => {
      const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
      await expect(runCli(args)).resolves.toBe(1);
      expect(stderr).toHaveBeenCalled();
    },
  );

  it('should pass host options through and restore signal listeners', async () => {
    const value = createFixture({ authPort: 9199, uiPort: 4100 });
    directories.push(value.directory);
    const before = process.listenerCount('SIGINT');
    await expect(
      runCli([
        '--project',
        'demo-cli-project',
        '--config',
        value.configFile,
        '--firebase-cli',
        value.options.firebaseCliPath!,
        '--exec',
        'node app.js',
        '--ui',
      ]),
    ).resolves.toBe(0);
    expect(value.calls()[0]!.args).toContain('demo-cli-project');
    expect(value.calls()[0]!.args.slice(-2)).toEqual(['--ui', 'node app.js']);
    expect(process.listenerCount('SIGINT')).toBe(before);
  });
});
