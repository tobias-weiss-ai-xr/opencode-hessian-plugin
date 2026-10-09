// Memory layer utilities for Hessian.AI plugin
// Provides caching, usage tracking, metrics, and preferences for OpenCode

import path from "node:path";
import os from "node:os";

const CACHE_DIR = path.join(os.homedir(), ".cache", "hessian");
const CACHE_FILE = path.join(CACHE_DIR, "models.json");
const USAGE_FILE = path.join(CACHE_DIR, "usage.jsonl");
const METRICS_FILE = path.join(CACHE_DIR, "metrics.json");
const PREFERENCES_FILE = path.join(os.homedir(), ".config", "opencode", "hessian-preferences.json");
const PROJECT_CONTEXT_FILE = path.join(process.cwd(), ".opencode", "hessian", "context.json");

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const L0_TTL_MS = 5 * 60 * 1000; // 5 minutes

// L0: In-memory cache for fast repeated access to same data
const l0Cache = new Map<string, { data: unknown; timestamp: number }>();

/** Check if L0 caching is enabled. Disable with HESSIAN_CACHE_L0=false */
function l0Enabled(): boolean {
  return process.env.HESSIAN_CACHE_L0 !== "false";
}

/** Check if L1 caching is enabled. Disable with HESSIAN_CACHE_L1=false */
function l1Enabled(): boolean {
  return process.env.HESSIAN_CACHE_L1 !== "false";
}

/** Ensure cache directory exists */
export async function ensureCacheDir(cacheDir = CACHE_DIR): Promise<void> {
  try {
    const fs = await import("node:fs/promises");
    await fs.mkdir(cacheDir, { recursive: true });
  } catch (err) {
    console.error(`[Hessian Memory] Failed to create cache directory: ${err}`);
  }
}

export interface FetchWithCacheOptions {
  forceRefresh?: boolean;
  cacheFile?: string;
  cacheTtlMs?: number;
  isValid?: (value: unknown) => boolean;
  onInvalidCache?: (message: string) => void;
}

/**
 * Fetch with optional L0 (in-memory) + L1 (disk) caching.
 * Priority: L0 -> L1 -> Fetch fresh
 * 
 * Environment variables:
 * - HESSIAN_CACHE_L0=false: Disable L0 (in-memory) caching
 * - HESSIAN_CACHE_L1=false: Disable L1 (disk) caching
 */
export async function fetchWithCache<T>(
  fetcher: () => Promise<T>,
  options: boolean | FetchWithCacheOptions = false,
): Promise<{ data: T; cached: boolean }> {
  const {
    forceRefresh = false,
    cacheFile = CACHE_FILE,
    cacheTtlMs = CACHE_TTL_MS,
    isValid = () => true,
    onInvalidCache = console.warn,
  } = typeof options === "boolean" ? { forceRefresh: options } : options;

  // L0: In-memory cache check (fastest, shortest TTL)
  const L0_KEY = `fetch:${cacheFile}`;
  if (!forceRefresh && l0Enabled()) {
    const l0Data = l0Cache.get(L0_KEY);
    if (l0Data && Date.now() - l0Data.timestamp < L0_TTL_MS) {
      return { data: l0Data.data as T, cached: true };
    }
  }

  // L1: Disk cache check
  if (!forceRefresh && l1Enabled()) {
    await ensureCacheDir(path.dirname(cacheFile));
    try {
      const fs = await import("node:fs/promises");
      const cachedRaw = await fs.readFile(cacheFile, "utf8");
      const cached = JSON.parse(cachedRaw);
      const age = Date.now() - cached.timestamp;
      if (age < cacheTtlMs && isValid(cached.data)) {
        // Prime L0 with L1 data for faster subsequent access
        if (l0Enabled()) {
          l0Cache.set(L0_KEY, { data: cached.data, timestamp: Date.now() });
        }
        return { data: cached.data as T, cached: true };
      }
      if (age < cacheTtlMs) {
        onInvalidCache("[Hessian] Ignoring a structurally invalid cached model list");
      }
    } catch {
      // Cache miss or invalid
    }
  }

  // Fetch fresh data
  const data = await fetcher();

  // Store in caches
  if (l0Enabled()) {
    l0Cache.set(L0_KEY, { data, timestamp: Date.now() });
  }
  if (l1Enabled()) {
    try {
      await ensureCacheDir(path.dirname(cacheFile));
      const fs = await import("node:fs/promises");
      const cacheEntry = { data, timestamp: Date.now() };
      const tmp = cacheFile + ".tmp";
      await fs.writeFile(tmp, JSON.stringify(cacheEntry, null, 2));
      await fs.rename(tmp, cacheFile);
    } catch (err) {
      console.error(`[Hessian Memory] Failed to write L1 cache: ${err}`);
    }
  }

  return { data, cached: false };
}

/** Clear all cache (both L0 and L1) */
export async function clearCache(): Promise<void> {
  l0Cache.clear();

  try {
    const fs = await import("node:fs/promises");
    await fs.unlink(CACHE_FILE).catch(() => {});
    console.log("[Hessian Memory] Cache cleared");
  } catch (err) {
    console.error(`[Hessian Memory] Failed to clear L1 cache: ${err}`);
  }
}

/** Log model usage per project */
export async function logUsage(modelId: string, taskType?: string, latencyMs?: number): Promise<void> {
  await ensureCacheDir();

  try {
    const fs = await import("node:fs/promises");
    const entry = {
      timestamp: new Date().toISOString(),
      projectRoot: process.cwd(),
      modelId,
      taskType: inferTaskType(taskType),
      latencyMs,
    };
    await fs.appendFile(USAGE_FILE, JSON.stringify(entry) + "\n");
  } catch (err) {
    console.error(`[Hessian Memory] Failed to log usage: ${err}`);
  }
}

/** Update metrics for a model */
export async function updateMetrics(modelId: string, success: boolean, latencyMs?: number): Promise<void> {
  await ensureCacheDir();

  try {
    const fs = await import("node:fs/promises");
    const metricsRaw = await fs.readFile(METRICS_FILE, "utf8").catch(() => "{}");
    const metrics = JSON.parse(metricsRaw);

    if (!metrics[modelId]) {
      metrics[modelId] = { count: 0, success: 0, errors: 0, totalLatency: 0, lastUsed: null };
    }

    const modelMetrics = metrics[modelId];
    modelMetrics.count++;
    modelMetrics[success ? "success" : "errors"]++;
    if (latencyMs !== undefined) {
      modelMetrics.totalLatency += latencyMs;
    }
    modelMetrics.lastUsed = new Date().toISOString();

    const tmp = METRICS_FILE + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(metrics, null, 2));
    await fs.rename(tmp, METRICS_FILE);
  } catch (err) {
    console.error(`[Hessian Memory] Failed to update metrics: ${err}`);
  }
}

/** Get user preferences */
export async function getPreferences(): Promise<Record<string, any>> {
  try {
    const fs = await import("node:fs/promises");
    const raw = await fs.readFile(PREFERENCES_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** Set user preferences */
export async function setPreferences(prefs: Record<string, unknown>): Promise<void> {
  try {
    const fs = await import("node:fs/promises");
    const existing = await getPreferences();
    const merged = { ...existing, ...prefs };
    const dir = path.dirname(PREFERENCES_FILE);
    await fs.mkdir(dir, { recursive: true });
    const tmp = PREFERENCES_FILE + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(merged, null, 2));
    await fs.rename(tmp, PREFERENCES_FILE);
    console.log("[Hessian Memory] Preferences saved");
  } catch (err) {
    console.error(`[Hessian Memory] Failed to save preferences: ${err}`);
  }
}

/** Get project context */
export async function getContext(): Promise<Record<string, unknown>> {
  try {
    const fs = await import("node:fs/promises");
    const raw = await fs.readFile(PROJECT_CONTEXT_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** Update project context */
export async function updateContext(updates: Record<string, unknown>): Promise<void> {
  try {
    const fs = await import("node:fs/promises");
    const existing = await getContext();
    const merged = { ...existing, ...updates };
    const dir = path.dirname(PROJECT_CONTEXT_FILE);
    await fs.mkdir(dir, { recursive: true });
    const tmp = PROJECT_CONTEXT_FILE + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(merged, null, 2));
    await fs.rename(tmp, PROJECT_CONTEXT_FILE);
  } catch (err) {
    console.error(`[Hessian Memory] Failed to update project context: ${err}`);
  }
}

/** Infer task type from file structure */
function inferTaskType(explicit?: string): string {
  if (explicit) return explicit;

  const cwd = process.cwd();

  if (cwd.includes("test") || cwd.includes("spec") || cwd.includes(".test") || cwd.includes(".spec")) {
    return "testing";
  }
  if (cwd.includes("README") || cwd.includes("CHANGELOG") || cwd.includes("docs")) {
    return "documentation";
  }
  if (cwd.match(/\.(ts|js|py|java|cpp|go|rs|php|rb)$/)) {
    return "coding";
  }
  if (cwd.match(/\.(png|jpg|jpeg|gif|svg|webp)$/)) {
    return "vision";
  }
  return "general";
}

/** Get recommended model based on usage and context */
export async function getRecommendedModel(availableModels: string[]): Promise<string> {
  const prefs = await getPreferences();
  const context = await getContext();

  if (prefs.favoriteModel) {
    return prefs.favoriteModel;
  }

  if (context.preferredModel) {
    return context.preferredModel as string;
  }

  // Fallback: pick the documented default model when it is available
  if (availableModels.includes("tud/mistral-medium-3.5-128b")) {
    return "tud/mistral-medium-3.5-128b";
  }

  return availableModels[0] || "unknown";
}

/** Get cache statistics */
export function getCacheStats() {
  // Clean up expired L0 entries
  const now = Date.now();
  for (const [key, entry] of l0Cache) {
    if (now - entry.timestamp >= L0_TTL_MS) {
      l0Cache.delete(key);
    }
  }

  return {
    l0: {
      enabled: l0Enabled(),
      size: l0Cache.size,
      ttlMs: L0_TTL_MS,
    },
    l1: {
      enabled: l1Enabled(),
      cacheFile: CACHE_FILE,
      ttlMs: CACHE_TTL_MS,
    },
  };
}

// Export cache configuration constants
export { L0_TTL_MS, CACHE_TTL_MS as L1_TTL_MS };
