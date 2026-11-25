#!/usr/bin/env node
// Runs every numerical test suite (no browser): scripts/test-core.mjs, then tests/*.test.mjs.
// Exit code 1 if any suite fails.   npm test   ·   node scripts/test-all.mjs [ids…]
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const only = process.argv.slice(2);
const suites = [
  ['core', path.join(ROOT, 'scripts/test-core.mjs')],
  ...fs
    .readdirSync(path.join(ROOT, 'tests'))
    .filter((f) => f.endsWith('.test.mjs'))
    .sort()
    .map((f) => [f.replace('.test.mjs', ''), path.join(ROOT, 'tests', f)]),
].filter(([id]) => !only.length || only.includes(id));

let bad = 0;
for (const [id, file] of suites) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [file], { encoding: 'utf8' });
  const out = `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n');
  const ok = r.status === 0;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${id.padEnd(11)} ${out[out.length - 1]}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  if (!ok) for (const line of out.slice(0, -1).slice(-30)) console.log('     ' + line);
}
console.log(bad ? `\n${bad} suite(s) failed.` : `\nAll ${suites.length} suites passed.`);
process.exit(bad ? 1 : 0);
