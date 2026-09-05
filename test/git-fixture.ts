import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Real, disposable Git history; never changes the developer checkout or identity. */
export function gitFixture() {
  const root = mkdtempSync(join(tmpdir(), "hunk-history-"));
  const git = (...args: string[]) => execFileSync("git", ["-c", `core.hooksPath=${join(root, "no-hooks")}`, "-c", "commit.gpgsign=false", ...args], {
    cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  git("init", "-b", "main");
  git("config", "user.name", "History Fixture");
  git("config", "user.email", "fixture@example.invalid");
  return {
    root, git,
    write: (path: string, text: string) => writeFileSync(join(root, path), text),
    commit: (message: string) => { git("add", "."); git("commit", "--allow-empty", "-m", message); return git("rev-parse", "HEAD"); },
    close: () => rmSync(root, { recursive: true, force: true }),
  };
}
