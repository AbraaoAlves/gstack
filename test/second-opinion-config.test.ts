import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";

const ROOT = path.resolve(import.meta.dir, "..");
const CONFIG = path.join(ROOT, "bin", "gstack-config");
const SECOND_OPINION = path.join(ROOT, "bin", "gstack-second-opinion");

let tmpHome: string;
let tmpBin: string;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "gstack-so-config-"));
  tmpBin = fs.mkdtempSync(path.join(os.tmpdir(), "gstack-so-bin-"));
});

afterEach(() => {
  fs.rmSync(tmpHome, { recursive: true, force: true });
  fs.rmSync(tmpBin, { recursive: true, force: true });
});

function writeExecutable(name: string): void {
  const file = path.join(tmpBin, name);
  fs.writeFileSync(file, "#!/usr/bin/env bash\necho fake\n");
  fs.chmodSync(file, 0o755);
}

function run(cmd: string, args: string[] = []): { stdout: string; stderr: string; status: number } {
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    env: {
      ...process.env,
      GSTACK_STATE_DIR: tmpHome,
      PATH: `${tmpBin}:${process.env.PATH || ""}`,
    },
    encoding: "utf-8",
  });
  return {
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
    status: result.status ?? -1,
  };
}

describe("second opinion backend config", () => {
  test("default auto prefers Gemini when both CLIs are available", () => {
    writeExecutable("gemini");
    writeExecutable("codex");
    const result = run(SECOND_OPINION, ["detect"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("BACKEND: gemini");
  });

  test("none disables second opinion detection", () => {
    writeExecutable("gemini");
    writeExecutable("codex");
    expect(run(CONFIG, ["set", "second_opinion_backend", "none"]).status).toBe(0);
    const result = run(SECOND_OPINION, ["detect"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("BACKEND: none");
  });

  test("invalid second_opinion_backend warns and falls back to auto", () => {
    writeExecutable("gemini");
    const set = run(CONFIG, ["set", "second_opinion_backend", "banana"]);
    expect(set.status).toBe(0);
    expect(set.stderr).toContain("not recognized");
    expect(run(CONFIG, ["get", "second_opinion_backend"]).stdout).toBe("auto");
    expect(run(SECOND_OPINION, ["detect"]).stdout).toBe("BACKEND: gemini");
  });

  test("design_provider validates closed values", () => {
    expect(run(CONFIG, ["set", "design_provider", "openai"]).status).toBe(0);
    expect(run(CONFIG, ["get", "design_provider"]).stdout).toBe("openai");

    const invalid = run(CONFIG, ["set", "design_provider", "claude"]);
    expect(invalid.status).toBe(0);
    expect(invalid.stderr).toContain("not recognized");
    expect(run(CONFIG, ["get", "design_provider"]).stdout).toBe("auto");
  });
});
