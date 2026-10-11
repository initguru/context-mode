import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(process.env.LAUNCHER_TEST_SOURCE || path.join(root, 'start.mjs'), 'utf8');
const seam = source.slice(source.indexOf('// ── Self-heal Layer 1:'), source.indexOf('// ── Self-heal Layer 3 + 4:'));
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version;
const digest = (s) => createHash('sha256').update(s).digest('hex');
function fixture(current = version) {
  const owned = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'launcher-preservation-')));
  const home = path.join(owned, 'home');
  const parent = path.join(home, '.claude/plugins/cache/context-mode/context-mode');
  const currentRoot = path.join(parent, current);
  const registry = path.join(home, '.claude/plugins/installed_plugins.json');
  const put = (p, value) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, value); };
  function payload(dir, v) {
    put(path.join(dir, 'package.json'), JSON.stringify({ name: 'context-mode', version: v }));
    put(path.join(dir, '.claude-plugin/plugin.json'), JSON.stringify({ name: 'context-mode', version: v }));
    put(path.join(dir, 'hooks/hooks.json'), '{"unchanged":true}');
    put(path.join(dir, 'start.mjs'), source);
    put(path.join(dir, 'hooks/normalize-hooks.mjs'), `export function normalizeHooksJsonOnly({pluginRoot}) { if (!pluginRoot.startsWith(${JSON.stringify(owned + path.sep)})) throw Error('outside owned root'); const fs = process.getBuiltinModule('fs'); fs.writeFileSync(pluginRoot + '/hooks/hooks.json', 'foreign mutation'); }`);
  }
  payload(currentRoot, current);
  if (current.endsWith('-arbitrary') || current.endsWith('-backup')) put(path.join(currentRoot, 'package.json'), JSON.stringify({ name: 'context-mode', version }));
  const siblings = ['1.0.168', '1.0.170', '9.0.0-backup', '8.0.0-foreign'];
  for (const v of siblings) payload(path.join(parent, v), v);
  fs.symlinkSync(path.join(parent, '1.0.170'), path.join(parent, '7.0.0'));
  const entries = [{ scope: 'user', installPath: currentRoot, version: current, lastUpdated: 'original', extra: { pinned: true } }, ...Array.from({ length: 16 }, (_, i) => ({ scope: 'local', projectPath: `/synthetic/project-${i}`, installPath: path.join(parent, '1.0.168'), version: '1.0.168', lastUpdated: 'original', extra: [i] }))];
  const ip = { plugins: { 'context-mode@context-mode': entries, 'other@other': [{ installPath: '/synthetic/other', extra: true }] }, enabledPlugins: { 'context-mode@context-mode': true }, extra: 123 };
  const save = () => put(registry, JSON.stringify(ip));
  save();
  const fingerprint = () => {
    const rows = [];
    function walk(p) { for (const e of fs.readdirSync(p, { withFileTypes: true })) { const q = path.join(p, e.name); if (e.isSymbolicLink()) rows.push([q, fs.readlinkSync(q)]); else if (e.isDirectory()) walk(q); else rows.push([q, digest(fs.readFileSync(q))]); } }
    for (const v of [...siblings, '7.0.0']) { const p = path.join(parent, v); if (fs.lstatSync(p).isSymbolicLink()) rows.push([p, fs.readlinkSync(p)]); else walk(p); }
    return digest(JSON.stringify(rows));
  };
  async function run(statError) {
    // Execute verbatim production seam in an owned module so its dynamic
    // imports actually execute too (no VM callback masking foreign writes).
    const imports = source.split('\n').slice(1, 7).join('\n').replace('statSync }', 'statSync as originalStatSync }');
    const runner = path.join(currentRoot, 'recovery-seam.mjs');
    put(runner, imports + `\nconst __dirname=${JSON.stringify(currentRoot)};\nconst resolveClaudeConfigDir=()=>${JSON.stringify(path.join(home, '.claude'))};\nconst statSync=(p)=>{if(${JSON.stringify(statError || null)} && p===${JSON.stringify(entries[0]?.installPath || null)}){const e=new Error('synthetic uncertainty');e.code=${JSON.stringify(statError || null)};throw e;}return originalStatSync(p);};\n` + seam);
    const result = spawnSync(process.execPath, [runner], { cwd: owned, env: { HOME: home, PATH: path.dirname(process.execPath) }, encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 0, result.stderr);
  }
  return { owned, home, parent, currentRoot, registry, put, payload, entries, ip, save, run, fingerprint, cleanup: () => fs.rmSync(owned, { recursive: true, force: true }) };
}
async function using(fn, current) { const f = fixture(current); try { await fn(f); } finally { f.cleanup(); } }

 test('healthy 17 records, unrelated data, registry bytes/inode and all sibling payloads preserved', () => using(async f => {
  const bytes = fs.readFileSync(f.registry), inode = fs.statSync(f.registry).ino, siblings = f.fingerprint();
  await f.run();
  assert.deepEqual(fs.readFileSync(f.registry), bytes);
  assert.equal(fs.statSync(f.registry).ino, inode);
  assert.equal(f.fingerprint(), siblings);
 }));
for (const mode of ['absent', 'unrelated', 'malformed']) test(`no normalization or writes with ${mode} registry`, () => using(async f => {
  if (mode === 'absent') fs.unlinkSync(f.registry);
  else { f.ip.plugins['context-mode@context-mode'] = mode === 'unrelated' ? undefined : {}; f.save(); }
  const bytes = fs.existsSync(f.registry) ? fs.readFileSync(f.registry) : null, hash = f.fingerprint();
  await f.run();
  assert.equal(f.fingerprint(), hash);
  assert.deepEqual(fs.existsSync(f.registry) ? fs.readFileSync(f.registry) : null, bytes);
 }));
for (const current of [version, '1.0.169']) test(`dead-only recovery to admitted current ${current}`, () => using(async f => {
  f.entries[0].installPath = path.join(f.parent, '1.0.160'); f.entries[0].version = '1.0.160'; f.save();
  const old = structuredClone(f.ip), hash = f.fingerprint(); await f.run();
  const actual = JSON.parse(fs.readFileSync(f.registry));
  assert.equal(actual.plugins['context-mode@context-mode'][0].installPath, f.currentRoot);
  assert.equal(actual.plugins['context-mode@context-mode'][0].version, current);
  assert.notEqual(actual.plugins['context-mode@context-mode'][0].lastUpdated, 'original');
  old.plugins['context-mode@context-mode'][0] = actual.plugins['context-mode@context-mode'][0];
  assert.deepEqual(actual, old); assert.equal(f.fingerprint(), hash);
 }, current));
for (const invalid of ['foreign', 'backup', 'symlink', 'manifest', 'name', 'empty', 'file', 'missing']) test(`invalid current ${invalid} cannot heal forward or reverse`, () => using(async f => {
  const dead = path.join(f.parent, '1.0.160'); f.entries[0].installPath = dead; f.save();
  if (invalid === 'manifest') f.put(path.join(f.currentRoot, '.claude-plugin/plugin.json'), JSON.stringify({ name: 'context-mode', version: '1.0.0' }));
  if (invalid === 'name') f.put(path.join(f.currentRoot, 'package.json'), JSON.stringify({ name: 'foreign', version }));
  if (invalid === 'empty') f.put(path.join(f.currentRoot, 'start.mjs'), '');
  if (invalid === 'missing') fs.unlinkSync(path.join(f.currentRoot, 'start.mjs'));
  if (invalid === 'file') { fs.unlinkSync(path.join(f.currentRoot, 'start.mjs')); fs.mkdirSync(path.join(f.currentRoot, 'start.mjs')); }
  if (invalid === 'symlink') { const physical = path.join(f.owned, 'physical'); fs.renameSync(f.currentRoot, physical); fs.symlinkSync(physical, f.currentRoot); }
  const bytes = fs.readFileSync(f.registry); await f.run();
  assert.deepEqual(fs.readFileSync(f.registry), bytes); assert.equal(fs.existsSync(dead), false);
 }, invalid === 'foreign' ? '1.0.169-arbitrary' : invalid === 'backup' ? '1.0.169-backup' : version));
for (const control of ['external', 'marketplace', 'plugin', 'relative', 'traversal', 'file', 'ENOTDIR', 'EACCES', 'EIO', 'alias', 'malformed', 'parent-symlink']) test(`skip ${control} without reverse bypass`, () => using(async f => {
  let p = path.join(f.parent, '1.0.160');
  if (control === 'external') p = path.join(f.owned, 'external/missing');
  if (control === 'marketplace') p = path.join(f.parent, '../../foreign/context-mode/1.0.160');
  if (control === 'plugin') p = path.join(f.parent, '../foreign/1.0.160');
  if (control === 'relative') p = 'relative/missing';
  if (control === 'traversal') p = f.parent + '/1.0.160/../1.0.159';
  if (control === 'file') f.put(p, 'not directory');
  if (control === 'alias') fs.symlinkSync(f.currentRoot, p);
  if (control === 'parent-symlink') { const escape = path.join(f.owned, 'escape'); fs.mkdirSync(escape); fs.symlinkSync(escape, path.join(f.parent, 'alias-parent')); p = path.join(f.parent, 'alias-parent/missing'); }
  f.entries[0].installPath = p; if (control === 'malformed') f.entries[0] = null; f.save();
  const bytes = fs.readFileSync(f.registry); await f.run(['ENOTDIR', 'EACCES', 'EIO'].includes(control) ? control : undefined);
  assert.deepEqual(fs.readFileSync(f.registry), bytes);
  if (!['file', 'alias', 'malformed'].includes(control)) assert.equal(fs.existsSync(p), false);
 }));
test('dangling same-lineage alias recovers only its dead record', () => using(async f => {
  const alias = path.join(f.parent, '1.0.160'); fs.symlinkSync(path.join(f.owned, 'missing'), alias);
  f.entries[0].installPath = alias; f.save(); await f.run();
  assert.equal(JSON.parse(fs.readFileSync(f.registry)).plugins['context-mode@context-mode'][0].installPath, f.currentRoot);
}));
test('copied actual startup prefix owns module URL, realpath, HOME, cacheParent and every payload', () => using(async f => {
  assert.equal(fs.realpathSync(f.currentRoot), f.currentRoot);
  assert.ok(f.currentRoot.startsWith(f.owned + path.sep));
  assert.equal(f.home.includes('/.claude/'), false);
  // Copy the production startup prefix verbatim through every registry/hook heal.
  // Stop before unrelated native/dependency/server boot: deps are not required here.
  // Helpers are independent source copies, never aliases to installed payloads.
  for (const helper of ['scripts/heal-installed-plugins.mjs', 'hooks/normalize-hooks.mjs', 'hooks/cache-heal-utils.mjs']) {
    f.put(path.join(f.currentRoot, helper), fs.readFileSync(path.join(root, helper)));
  }
  const prefix = source.slice(0, source.indexOf('// Ensure native dependencies + ABI compatibility'));
  f.put(path.join(f.currentRoot, 'start.mjs'), prefix + '\nconsole.log(JSON.stringify({moduleRoot:__dirname,realRoot:realpathSync(__dirname),cacheParent:cacheMatch[1]}));\n');
  const bytes = fs.readFileSync(f.registry), hash = f.fingerprint();
  const result = spawnSync(process.execPath, [path.join(f.currentRoot, 'start.mjs')], { cwd: f.owned, env: { HOME: f.home, PATH: path.dirname(process.execPath) }, encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
  const evidence = JSON.parse(result.stdout.trim());
  assert.equal(evidence.moduleRoot, f.currentRoot); assert.equal(evidence.realRoot, f.currentRoot);
  assert.equal(path.resolve(evidence.cacheParent), f.parent);
  assert.deepEqual(fs.readFileSync(f.registry), bytes); assert.equal(f.fingerprint(), hash);
}));
