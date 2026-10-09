// Hessian plugin settings management.
// Reads and writes the ~/.config/opencode/hessian.json file.

import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const SETTINGS_PATH = path.join(homedir(), ".config", "opencode", "hessian.json");

/** @typedef {Object} ReadSettingsOptions
 * @property {(_: string) => void} [onWarning]
 */

/** @typedef {Object} UpdateSettingsFn
 * @property {(current: Object) => Object} updater
 */

/**
 * Reads the Hessian settings file.
 * Returns an empty object if the file doesn't exist or is invalid.
 */
export async function readHessianSettings({ onWarning = console.warn } = {}) {
  try {
    const raw = await readFile(SETTINGS_PATH, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code !== "ENOENT") {
      onWarning(`[Hessian] Could not read ${SETTINGS_PATH}: ${err.message}`);
    }
    return {};
  }
}

/**
 * Updates the Hessian settings file atomically.
 * Takes an updater function that receives the current settings and returns the new settings.
 */
export async function updateHessianSettings(updater, { onWarning = console.warn } = {}) {
  try {
    const current = await readHessianSettings({ onWarning });
    const next = updater(current);
    
    // Ensure directory exists
    const dir = path.dirname(SETTINGS_PATH);
    const fs = await import("node:fs/promises");
    await fs.mkdir(dir, { recursive: true });
    
    // Write atomically
    const tmp = SETTINGS_PATH + ".tmp";
    await writeFile(tmp, JSON.stringify(next, null, 2));
    await fs.rename(tmp, SETTINGS_PATH);
  } catch (err) {
    onWarning(`[Hessian] Could not update ${SETTINGS_PATH}: ${err.message}`);
  }
}

/**
 * Extracts managed model metadata from settings.
 */
export function managedModelsFromSettings(settings) {
  if (settings && typeof settings.managedModels === "object" && settings.managedModels !== null) {
    return settings.managedModels;
  }
  return {};
}
