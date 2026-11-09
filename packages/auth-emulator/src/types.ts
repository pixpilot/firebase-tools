export interface AuthEmulatorOptions {
  /** Firebase project ID. Use a demo- prefix for local-only projects. */
  projectId: string;
  /** Working directory for Firebase and the child command. Defaults to process.cwd(). */
  cwd?: string;
  /** Configuration file, relative to cwd. Defaults to firebase.emulator.json. */
  configFile?: string;
  /** Optional seed import directory, relative to cwd. */
  importDirectory?: string;
  /** When provided, run this shell command inside emulators:exec. */
  command?: string;
  /** Show the Emulator UI in exec mode. Defaults to false. */
  ui?: boolean;
  /** Override the installed Firebase CLI's Node.js entry point. */
  firebaseCliPath?: string;
  /** Abort the Firebase process, for example when the host shuts down. */
  signal?: AbortSignal;
}

export interface EmulatorEndpoint {
  host?: string;
  port?: number;
}

export interface AuthEmulatorConfig {
  emulators: {
    auth: EmulatorEndpoint;
    ui?: EmulatorEndpoint & { enabled?: boolean };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}
