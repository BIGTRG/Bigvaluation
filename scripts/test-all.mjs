/**
 * Run every package's test suite in sequence and report a combined tally.
 * Usage: `npm test` (from the repo root). No dependencies; uses node --test.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = join(root, 'packages');

const pkgs = readdirSync(packagesDir).filter((p) => existsSync(join(packagesDir, p, 'test')));

let totalPass = 0;
let totalFail = 0;
const rows = [];

for (const pkg of pkgs) {
  const cwd = join(packagesDir, pkg);
  let out = '';
  let failed = false;
  try {
    out = execFileSync('node', ['--test', 'test/**/*.test.ts'], { cwd, encoding: 'utf8' });
  } catch (err) {
    out = String(err.stdout ?? '') + String(err.stderr ?? '');
    failed = true;
  }
  const pass = Number(/# pass (\d+)/.exec(out)?.[1] ?? /pass (\d+)/.exec(out)?.[1] ?? 0);
  const fail = Number(/# fail (\d+)/.exec(out)?.[1] ?? /fail (\d+)/.exec(out)?.[1] ?? 0);
  totalPass += pass;
  totalFail += fail + (failed && fail === 0 ? 1 : 0);
  rows.push(`  ${pkg.padEnd(18)} pass=${pass} fail=${fail}`);
}

console.log('Test results by package:');
console.log(rows.join('\n'));
console.log(`\nTOTAL: ${totalPass} passed, ${totalFail} failed across ${pkgs.length} packages`);
process.exit(totalFail > 0 ? 1 : 0);
