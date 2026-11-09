import process from 'node:process';
import { parseArgs } from 'node:util';
import { runAuthEmulator } from './run-auth-emulator';

const HELP = `Usage: firebase-auth-emulator --project <id> [options]

Options:
  --config <file>       Firebase configuration (default: firebase.emulator.json).
  --import <directory> Seed import directory.
  --exec <command>     Run a shell command inside emulators:exec.
  --ui                 Show the Emulator UI in exec mode.
  --firebase-cli <file> Override the installed Firebase CLI entry point.
  --help               Show this help.

Omit auth.port or ui.port in the config for automatic selection.
Explicit numeric ports stay fixed; occupied fixed ports fail.
`;

/** Parse CLI options and return the Firebase exit code without exiting the host process. */
export async function runCli(args: string[]): Promise<number> {
  const controller = new AbortController();
  // Ctrl+C reaches Firebase through the terminal's process group too.
  const onInterrupt = (): void => {};
  const onTerminate = (): void => controller.abort();
  try {
    const { values } = parseArgs({
      args,
      options: {
        project: { type: 'string' },
        config: { type: 'string' },
        import: { type: 'string' },
        exec: { type: 'string' },
        ui: { type: 'boolean' },
        'firebase-cli': { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    });
    if (values.help === true) {
      process.stdout.write(HELP);
      return 0;
    }
    if (values.project === undefined || values.project === '')
      throw new Error('Pass --project <id>.');
    process.on('SIGINT', onInterrupt);
    process.on('SIGTERM', onTerminate);
    return await runAuthEmulator({
      projectId: values.project,
      ...(values.config !== undefined && { configFile: values.config }),
      ...(values.import !== undefined && { importDirectory: values.import }),
      ...(values.exec !== undefined && { command: values.exec }),
      ...(values.ui !== undefined && { ui: values.ui }),
      ...(values['firebase-cli'] !== undefined && {
        firebaseCliPath: values['firebase-cli'],
      }),
      signal: controller.signal,
    });
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  } finally {
    process.off('SIGINT', onInterrupt);
    process.off('SIGTERM', onTerminate);
  }
}
