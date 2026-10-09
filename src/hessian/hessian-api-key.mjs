// Hessian API key resolution.
// Tries, in order: explicit argument, HESSIAN_API_KEY env var, apiKeyCommand in settings.

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const SETTINGS_PATH = path.join(homedir(), ".config", "opencode", "hessian.json");

export const HESSIAN_API_KEY_PLACEHOLDER = "{env:HESSIAN_API_KEY}";

/** @typedef {Object} ReadSettingsOptions
 * @property {(_: string) => void} [onWarning] */

/** Reads hessian.json and returns the value of the apiKeyCommand field if present. */
async function apiKeyCommandFromSettings({ onWarning = console.warn } = {}) {
  try {
    const raw = await readFile(SETTINGS_PATH, "utf8");
    const settings = JSON.parse(raw);
    if (typeof settings.apiKeyCommand === "string") {
      return settings.apiKeyCommand;
    }
  } catch (err) {
    if (err.code !== "ENOENT") {
      onWarning(`[Hessian] Could not read ${SETTINGS_PATH}: ${err.message}`);
    }
  }
}

/**
 * Runs a shell command and returns its trimmed stdout, or undefined on failure.
 * DOES NOT WORK in the browser (node-only).
 */
async function runCommand(cmd) {
  if (typeof process === "undefined") {
    return;
  }
  // Very limited subset of spawn for proteg Landau.
  const { spawn } = await import("node:child_process");
  return new Promise((resolve) => {
    const child = spawn(cmd, { shell: true, stdio: ["ignore", "pipe", "ignore"] });
    let stdout = "";
    child.stdout.on("data", (buf) => { stdout += buf; });
    child.on("close", () => resolve(stdout.trimEnd()));
    // No error handling on purpose: we return the (possibly empty) stdout either way.
  });
}

/**
 * Returns the Hessian API key using the following priority:
 *   1. Environment variable HESSIAN_API_KEY
 *   2. Output of the apiKeyCommand configured in ~/.config/opencode/hessian.json
 *   3. undefined
 */
export async function resolveHessianApiKey({ onWarning = console.warn } = {}) {
  // 1. Environment variable
  if (process.env.HESSIAN_API_KEY) {
    return process.env.HESSIAN_API_KEY;
  }

  // 2. apiKeyCommand from settings
  const cmd = await apiKeyCommandFromSettings({ onWarning });
  if (cmd) {
    try {
      const key = await runCommand(cmd);
      if (key) {
        return key;
      }
    } catch {
      // Command failed or is not supported (browser).
    }
  }
  onWarning("[Hessian] No API key configured. Set HESSIAN_API_KEY or configure apiKeyCommand.");
}
