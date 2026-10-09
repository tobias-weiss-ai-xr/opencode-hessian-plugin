// Config decoration utilities for the Hessian plugin.

import { HESSIAN_ALIASES, buildHessianAliasConfig } from "./hessian-aliases.mjs";

export const HESSIAN_API_KEY_PLACEHOLDER = "{env:HESSIAN_API_KEY}";

// Known retired model IDs that should be filtered out
const RETIRED_MODELS = new Set([]);

// Known hidden model IDs (internal, test, etc.)
const HIDDEN_MODELS = new Set([]);

/** @typedef {Object} DecorateOptions
 * @property {Array<{id: string}>} models
 * @property {Object} transport
 * @property {string} [preferredModel]
 * @property {Object} [managedModels]
 */

/** @typedef {Object} DecorateResult
 * @property {string[]} modelIDs
 * @property {Object} managedModels
 */

/**
 * Creates a model entry with capabilities for a given model ID based on known
 * characteristics (reasoning, attachment support, etc.)
 */
function createModelMetadata(modelId) {
  const id = modelId.toLowerCase();
  
  // Reasoning capability
  const reasoningModels = [
    "gpt-oss", "glm-5.2", "mistral-medium", "qwen3.6", "ministral", 
    "qwen3-vl", "mistral-80b", "mixtral", "llama-3-70b"
  ];
  const canReason = reasoningModels.some((m) => id.includes(m)) || id.includes("80b") || id.includes("70b");
  
  // Attachment/vision capability
  const visionModels = ["vl", "vision", "gemma-4"];
  const hasAttachment = visionModels.some((m) => id.includes(m));
  
  // Context window
  let contextWindow = 32_768;
  if (id.includes("128b") || id.includes("120b") || id.includes("35b") || id.includes("31b")) {
    contextWindow = 131_072;
  } else if (id.includes("70b") || id.includes("80b")) {
    contextWindow = 32_768;
  } else if (id.includes("14b")) {
    contextWindow = 131_072;
  } else if (id.includes("gemma-4")) {
    contextWindow = 262_144;
  }
  
  // Max tokens
  let maxTokens = 8_192;
  if (id.includes("128b") || id.includes("120b")) {
    maxTokens = 32_768;
  } else if (id.includes("35b") || id.includes("31b") || id.includes("30b")) {
    maxTokens = 32_768;
  } else if (id.includes("70b") || id.includes("80b")) {
    maxTokens = 8_192;
  }
  
  const metadata = {
    name: getModelName(modelId),
    reasoning: canReason,
    attachment: hasAttachment,
    limit: {
      context: contextWindow,
      output: maxTokens,
    },
    metadata: {
      category: categorizeModel(modelId),
      estimated_latency: getEstimatedLatency(modelId),
      description: getModelDescription(modelId),
    },
  };
  
  // Add recommended settings for Qwen models
  if (id.includes("qwen")) {
    metadata.metadata.recommended = { temperature: 0.8, top_p: 0.95 };
  }
  
  return metadata;
}

function getModelName(modelId) {
  const names = {
    "gpt-oss-120b": "GPT-OSS 120B",
    "glm-5.2-awq": "GLM 5.2 AWQ INT4",
    "mistral-medium-3.5-128b": "Mistral Medium 3.5 128B",
    "qwen3.6-35b-a3b": "Qwen 3.6 35B A3B",
    "ministral-3-14b-instruct": "Ministral 3 14B",
    "gemma-4-31b-it": "Gemma 4 31B IT",
    "qwen3-vl-30b-a3b-instruct-awq": "Qwen 3 VL 30B",
    "mistral-7b": "Mistral 7B",
    "mixtral-8x7b": "Mixtral 8x7B",
    "mistral-80b": "Mistral 80B",
    "llama-3-8b": "Llama 3 8B Instruct",
    "llama-3-70b": "Llama 3 70B Instruct",
    "qwen-7b": "Qwen 7B Chat",
    "qwen-14b": "Qwen 14B Chat",
    "gemma-7b": "Gemma 7B IT",
  };
  return names[modelId] || modelId;
}

function categorizeModel(modelId) {
  if (modelId.startsWith("tud/")) {
    return modelId.includes("vl") || modelId.includes("vision") ? "tud-vision" : "tud";
  }
  if (modelId.includes("mistral") || modelId.includes("mixtral") || modelId.includes("ministral")) {
    return "mistral";
  }
  if (modelId.includes("llama")) {
    return "meta";
  }
  if (modelId.includes("qwen")) {
    return "qwen";
  }
  if (modelId.includes("gemma")) {
    return "google";
  }
  return "general";
}

function getModelDescription(modelId) {
  const descriptions = {
    "gpt-oss-120b": "Open-source GPT model",
    "glm-5.2-awq": "GLM 5.2 in AWQ INT4 quantization",
    "mistral-medium-3.5-128b": "Mistral's medium-sized model with 128B parameters",
    "qwen3.6-35b-a3b": "Qwen 3.6 35B model with A3B configuration",
    "ministral-3-14b-instruct": "Ministral 3 14B instruct model",
    "gemma-4-31b-it": "Google's Gemma 4 31B instruct model",
    "qwen3-vl-30b-a3b-instruct-awq": "Qwen 3 VL 30B multimodal model",
  };
  return descriptions[modelId] || "";
}

function getEstimatedLatency(modelId) {
  if (modelId.includes("7b")) return "fast";
  if (modelId.includes("14b")) return "moderate";
  if (modelId.includes("70b") || modelId.includes("80b") || modelId.includes("128b")) return "slow";
  return "moderate";
}

/**
 * Type guard for Hessian models response
 */
export function isHessianModelsResponse(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof value.data === "object" &&
    value.data !== null &&
    Array.isArray(value.data) &&
    value.data.every(
      (item) => typeof item === "object" && item !== null && typeof item.id === "string",
    )
  );
}

/**
 * Parses and validates the Hessian models API response
 */
export function parseHessianModelsResponse(raw, { onWarning = console.warn } = {}) {
  if (!isHessianModelsResponse(raw)) {
    throw new Error("Invalid Hessian models response");
  }
  
  const data = raw.data
    .filter((m) => typeof m.id === "string")
    .filter((m) => !RETIRED_MODELS.has(m.id))
    .filter((m) => !HIDDEN_MODELS.has(m.id))
    .map((m) => ({ id: m.id }));

  // Warn about filtered models
  const filteredCount = raw.data.length - data.length;
  if (filteredCount > 0) {
    onWarning(`[Hessian] Filtered ${filteredCount} retired or hidden models`);
  }

  return { data };
}

/**
 * Decorates the OpenCode config with Hessian models and provider settings.
 * Returns the list of model IDs and the managed models metadata.
 */
export function decorateHessianConfig(
  config,
  { models, transport, preferredModel, managedModels = {} },
) {
  const modelIDs = [];
  const newManagedModels = { ...managedModels };

  // Ensure provider exists
  if (!config.provider) {
    config.provider = {};
  }
  if (!config.provider.hessian) {
    config.provider.hessian = {
      npm: "@ai-sdk/openai-compatible",
      name: "Hessian.AI",
      options: {
        baseURL: "https://api.hessian.ai/v1",
        apiKey: HESSIAN_API_KEY_PLACEHOLDER,
      },
      models: {},
    };
  }

  const provider = config.provider.hessian;
  const providerModels = provider.models || {};

  // Add models from API
  for (const model of models) {
    const modelId = model.id;
    modelIDs.push(modelId);

    // Skip if already configured by user
    if (providerModels[modelId]) {
      continue;
    }

    const metadata = createModelMetadata(modelId);
    providerModels[modelId] = {
      ...metadata,
    };

    // Track managed model metadata
    newManagedModels[modelId] = {
      source: "api",
      timestamp: Date.now(),
    };
  }

  // Add aliases
  for (const [alias, target] of Object.entries(HESSIAN_ALIASES)) {
    // Only add alias if target exists
    if (modelIDs.includes(target)) {
      modelIDs.push(alias);
      const targetEntry = providerModels[target];
      if (targetEntry) {
        providerModels[alias] = buildHessianAliasConfig(alias, targetEntry);
        newManagedModels[alias] = {
          source: "alias",
          target,
          timestamp: Date.now(),
        };
      }
    }
  }

  // Set default model if not already set
  if (!config.model) {
    const defaultModel = preferredModel || modelIDs[0];
    if (defaultModel && modelIDs.includes(defaultModel)) {
      config.model = `hessian/${defaultModel}`;
    }
  }

  // Update provider models
  provider.models = providerModels;

  return { modelIDs, managedModels: newManagedModels };
}
