// Transport configuration for Hessian API.
// Supports direct API and proxy configurations.

import { homedir } from "node:os";
import path from "node:path";

const SETTINGS_PATH = path.join(homedir(), ".config", "opencode", "hessian.json");

/**
 * Resolves the transport configuration for Hessian API.
 * Supports: direct, proxy, or custom URL.
 */
export async function resolveHessianTransport({ onWarning = console.warn } = {}) {
  // Check environment variable first
  if (process.env.HESSIAN_TRANSPORT) {
    const transports = {
      direct: { id: "direct", baseURL: "https://api.hessian.ai/v1" },
      proxy: { id: "proxy", baseURL: process.env.HESSIAN_PROXY_URL || "https://api.hessian.ai/v1" },
    };
    const transport = transports[process.env.HESSIAN_TRANSPORT];
    if (transport) {
      return transport;
    }
    onWarning(`[Hessian] Unknown transport: ${process.env.HESSIAN_TRANSPORT}`);
  }

  // Check settings file
  try {
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile(SETTINGS_PATH, "utf8");
    const settings = JSON.parse(raw);
    if (settings.transport) {
      const transports = {
        direct: { id: "direct", baseURL: "https://api.hessian.ai/v1" },
        proxy: { 
          id: "proxy", 
          baseURL: settings.proxyUrl || process.env.HESSIAN_PROXY_URL || "https://api.hessian.ai/v1" 
        },
        custom: { id: "custom", baseURL: settings.baseURL || "https://api.hessian.ai/v1" },
      };
      const transport = transports[settings.transport];
      if (transport) {
        return transport;
      }
    }
  } catch {
    // Settings file doesn't exist or is invalid
  }

  // Default to direct
  return { id: "direct", baseURL: "https://api.hessian.ai/v1" };
}
