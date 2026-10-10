import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, isAbsolute } from "node:path";
import { runInNewContext } from "node:vm";

// Execute the actual production bootstrap, never the launcher/heal/server tail.
const source = readFileSync(new URL("../../start.mjs", import.meta.url), "utf8");
const begin = source.indexOf("const isPluginInstallPath =");
const end = source.indexOf("// Routing instructions file");
if (begin < 0 || end <= begin) throw new Error("Production bootstrap boundaries missing");
const bootstrap = source.slice(begin, end);
const old = { CLAUDE_PROJECT_DIR: "/old/claude", CONTEXT_MODE_PROJECT_DIR: "/old/universal" };
function run(cwd: string, env: Record<string, string> = {}, failRealpath = false) {
  const process = { env: { ...env } };
  runInNewContext(bootstrap, {
    process, originalCwd: cwd, isAbsolute, statSync,
    realpathSync: failRealpath ? () => { throw new Error("injected realpath failure"); } : realpathSync,
  });
  return process.env;
}
const on = { CONTEXT_MODE_FOLLOW_CWD: "1", CLAUDECODE: "1" };
const roots: string[] = [];
function root() { const p = mkdtempSync(join(tmpdir(), "ctx-follow-")); roots.push(p); return realpathSync(p); }
afterEach(() => { for (const p of roots.splice(0)) rmSync(p, { recursive: true, force: true }); });
describe("actual start.mjs FOLLOW_CWD bootstrap", () => {
  it("overrides both stale roots with canonical startup cwd", () => {
    const cwd = root(); expect(run(cwd, { ...old, ...on })).toEqual({ ...on, CLAUDE_PROJECT_DIR: cwd, CONTEXT_MODE_PROJECT_DIR: cwd });
  });
  it("canonicalizes an ordinary directory symlink", () => {
    const cwd = root(); const link = join(root(), "project"); symlinkSync(cwd, link);
    expect(run(link, { ...old, ...on }).CONTEXT_MODE_PROJECT_DIR).toBe(cwd);
  });
  it.each([{}, { CONTEXT_MODE_FOLLOW_CWD: "0", CLAUDECODE: "1" }, { CONTEXT_MODE_FOLLOW_CWD: "1" }, { CONTEXT_MODE_FOLLOW_CWD: "true", CLAUDECODE: "1" }, { CONTEXT_MODE_FOLLOW_CWD: "1", CLAUDECODE: "true" }])("requires both exact flags: %j", flags => {
    expect(run(root(), { ...old, ...flags })).toEqual({ ...old, ...flags });
  });
  it("retains opt-off fallback for unset roots", () => {
    const cwd = root(); expect(run(cwd)).toEqual({ CLAUDE_PROJECT_DIR: cwd, CONTEXT_MODE_PROJECT_DIR: cwd });
  });
  it.each(["relative/path", "/missing/context-mode-follow-cwd-test"]) ("invalid cwd preserves stale roots: %s", cwd => {
    expect(run(cwd, { ...old, ...on })).toEqual({ ...old, ...on });
  });
  it("non-directory preserves legacy roots", () => {
    const file = join(root(), "file"); writeFileSync(file, "x"); expect(run(file, { ...old, ...on })).toEqual({ ...old, ...on });
  });
  it("realpath failure preserves legacy fallback", () => {
    const cwd = root(); expect(run(cwd, { ...old, ...on }, true)).toEqual({ ...old, ...on });
    expect(run(cwd, on, true).CONTEXT_MODE_PROJECT_DIR).toBe(cwd);
  });
  for (const platform of [".claude", ".codex"]) for (const kind of ["cache", "marketplaces"]) {
    it(`rejects original and canonical ${platform}/${kind} installation paths only for follow`, () => {
      const base = root(); const plugin = join(base, platform, "plugins", kind, "context-mode"); mkdirSync(plugin, { recursive: true });
      expect(run(plugin, { ...old, ...on })).toEqual({ ...old, ...on });
      expect(run(plugin, on)).toEqual(on);
      const alias = join(base, "alias"); symlinkSync(plugin, alias);
      expect(run(alias, { ...old, ...on })).toEqual({ ...old, ...on });
      // Follow rejection must not tighten the legacy fallback.
      expect(run(alias, on).CONTEXT_MODE_PROJECT_DIR).toBe(alias);
      const project = root(); const installedAlias = join(plugin, "project"); symlinkSync(project, installedAlias);
      expect(run(installedAlias, { ...old, ...on })).toEqual({ ...old, ...on });
    });
  }
  it("ships the opt-in in the Claude manifest", () => {
    const manifest = JSON.parse(readFileSync(new URL("../../.claude-plugin/plugin.json", import.meta.url), "utf8"));
    expect(manifest.mcpServers["context-mode"].env.CONTEXT_MODE_FOLLOW_CWD).toBe("1");
  });
});
