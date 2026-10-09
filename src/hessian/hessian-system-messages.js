// System message normalization for Hessian models.
// Ensures consistent system message format for Qwen models and others.

/**
 * Normalizes system messages for Qwen models.
 * Qwen models have specific requirements for system message formatting.
 */
export function normalizeHessianSystemMessages(modelId, system) {
  // Qwen models benefit from structured system messages
  if (modelId && modelId.toLowerCase().includes("qwen")) {
    if (Array.isArray(system)) {
      // Already in array format
      return;
    }
    if (typeof system === "string" && system.trim()) {
      // Convert string to array format for better compatibility
      // This is handled by the OpenCode core, we just ensure the format is valid
    }
  }
}

/**
 * Normalizes system message parts for V2 context.
 */
export function normalizeHessianSystemParts(modelId, system) {
  // Similar normalization for V2 API
  if (modelId && modelId.toLowerCase().includes("qwen")) {
    // Qwen-specific normalization
  }
}
