import type { AuthEmulatorConfig } from './types';
import { readFileSync } from 'node:fs';

const MAX_PORT = 65535;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Read and validate the Auth and UI endpoints while preserving the rest of the config. */
export function readEmulatorConfig(file: string): AuthEmulatorConfig {
  const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (
    !isRecord(value) ||
    !isRecord(value['emulators']) ||
    !isRecord(value['emulators']['auth'])
  ) {
    throw new Error('Firebase configuration must contain emulators.auth.');
  }
  for (const name of ['auth', 'ui']) {
    const endpoint: unknown = value['emulators'][name];
    if (endpoint === undefined) continue;
    if (!isRecord(endpoint)) throw new Error(`emulators.${name} must be an object.`);
    if (endpoint['host'] !== undefined && typeof endpoint['host'] !== 'string') {
      throw new Error(`emulators.${name}.host must be a string.`);
    }
    if (
      endpoint['port'] !== undefined &&
      (typeof endpoint['port'] !== 'number' ||
        !Number.isInteger(endpoint['port']) ||
        endpoint['port'] < 1 ||
        endpoint['port'] > MAX_PORT)
    ) {
      throw new Error(
        `emulators.${name}.port must be a whole number from 1 to ${MAX_PORT}, or omitted for auto.`,
      );
    }
  }
  const config = value as unknown as AuthEmulatorConfig;
  if (
    config.emulators.auth.port !== undefined &&
    config.emulators.auth.port === config.emulators.ui?.port
  ) {
    throw new Error('Firebase Auth and Emulator UI must use different ports.');
  }
  return config;
}
