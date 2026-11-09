import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIREBASE_TOOLS_VERSION, firebaseCommand } from '../src/run-firebase';

describe('firebaseCommand', () => {
  it('should launch the pinned Firebase CLI through the npx bundled with Node.js', () => {
    const [npxCli, ...args] = firebaseCommand();
    expect(path.basename(npxCli!)).toBe('npx-cli.js');
    expect(existsSync(npxCli!)).toBe(true);
    expect(args).toEqual([
      '--yes',
      `--package=firebase-tools@${FIREBASE_TOOLS_VERSION}`,
      '--',
      'firebase',
    ]);
  });

  it('should use a local Firebase CLI when one is given', () => {
    expect(firebaseCommand('/tools/firebase.js')).toEqual(['/tools/firebase.js']);
  });

  it('should not depend on firebase-tools, so its tree stays out of consumer installs', () => {
    const manifest = JSON.parse(
      readFileSync(path.join(import.meta.dirname, '../package.json'), 'utf8'),
    ) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    expect(manifest.dependencies).not.toHaveProperty('firebase-tools');
    expect(manifest.peerDependencies ?? {}).not.toHaveProperty('firebase-tools');
  });
});
