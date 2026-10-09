// V2 provider utilities for Hessian plugin.

import { HESSIAN_API_KEY_PLACEHOLDER } from "./hessian-api-key.mjs";
import { HESSIAN_ALIASES, buildHessianAliasConfig } from "./hessian-aliases.mjs";

export const HESSIAN_PROVIDER_ID = "hessian";

/**
 * Creates a model entry with capabilities for V2 provider
 */
function createV2ModelMetadata(modelId) {
  const id = modelId.toLowerCase();
  
  const reasoningModels = [
    "gpt-oss", "glm-5.2", "mistral-medium", "qwen3.6", "ministral", 
    "qwen3-vl", "mistral-80b", "mixtral", "llama-3-70b"
  ];
  const canReason = reasoningModels.some((m) => id.includes(m)) || id.includes("80b") || id.includes("70b");
  
  const visionModels = ["vl", "vision", "gemma-4"];
  const hasAttachment = visionModels.some((m) => id.includes(m));
  
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
  
  let maxTokens = 8_192;
  if (id.includes("128b") || id.includes("120b")) {
    maxTokens = 32_768;
  } else if (id.includes("35b") || id.includes("31b") || id.includes("30b")) {
    maxTokens = 32_768;
  } else if (id.includes("70b") || id.includes("80b")) {
    maxTokens = 8_192;
  }
  
  return {
    id: modelId,
    name: getModelName(modelId),
    description: getModelDescription(modelId),
    input: getInputModalities(modelId),
    reasoning: canReason,
    contextWindow,
    maxTokens,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    metadata: {
      category: categorizeModel(modelId),
      estimated_latency: getEstimatedLatency(modelId),
    },
  };
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
  };
  return names[modelId] || modelId;
}

function getModelDescription(modelId) {
  const descriptions = {
    "gpt-oss-120b": "Open-source GPT model from Hessian.AI",
    "glm-5.2-awq": "GLM 5.2 model in AWQ INT4 quantization",
    "mistral-medium-3.5-128b": "Mistral's medium-sized model with 128B parameters",
    "qwen3.6-35b-a3b": "Qwen 3.6 35B model with A3B configuration",
    "ministral-3-14b-instruct": "Ministral 3 14B instruct model",
    "gemma-4-31b-it": "Google's Gemma 4 31B instruct model",
    "qwen3-vl-30b-a3b-instruct-awq": "Qwen 3 VL 30B multimodal vision model",
  };
  return descriptions[modelId] || "Hessian.AI model";
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

function getInputModalities(modelId) {
  const id = modelId.toLowerCase();
  if (id.includes("vl") || id.includes("vision") || id.includes("gemma-4")) {
    return ["text", "image"];
  }
  return ["text"];
}

function getEstimatedLatency(modelId) {
  if (modelId.includes("7b")) return "fast";
  if (modelId.includes("14b")) return "moderate";
  if (modelId.includes("70b") || modelId.includes("80b") || modelId.includes("128b")) return "slow";
  return "moderate";
}

/**
 * Determines if the default model should be replaced.
 * Returns true if current model is not a Hessian model or is a retired model.
 */
export function shouldReplaceDefaultModel(current, availableModelIds) {
  if (!current) return true;
  if (typeof current !== "string") return false;
  
  // Extract model ID from "provider/model-id" format
  const match = current.match(/^hessian\/(.+)$/);
  if (!match) return true;
  
  const currentModelId = match[1];
  return !availableModelIds.includes(currentModelId);
}

/**
 * Creates V2 provider package configuration
 */
export function v2ProviderPackage(transport) {
  return {
    name: "@ai-sdk/openai-compatible",
    options: {
      baseURL: transport.baseURL,
      apiKey: HESSIAN_API_KEY_PLACEHOLDER,
    },
  };
}

/**
 * Creates V2 provider info
 */
export function hessianProviderInfo({ package: pkg, apiKey }) {
  return {
    id: HESSIAN_PROVIDER_ID,
    name: "Hessian.AI",
    address: pkg.options.baseURL,
    package: pkg,
    authScheme: "bearer",
    apiKey: apiKey || pkg.options.apiKey,
    models: new Map(),
  };
}

/**
 * Decorates the V2 provider with Hessian models.
 * Returns the list of model IDs and the managed models metadata.
 */
export function decorateHessianV2Provider({
  models,
  existingModels = [],
  managedModels = {},
  preferredModel,
}) {
  const modelIDs = [];
  const newManagedModels = { ...managedModels };
  const modelMap = new Map();

  // Add existing models first (user-configured)
  for (const model of existingModels) {
    modelMap.set(model.id, model);
    modelIDs.push(model.id);
  }

  // Add models from API
  for (const model of models) {
    const modelId = model.id;
    
    // Skip if already exists
    if (modelMap.has(modelId)) {
      continue;
    }

    const metadata = createV2ModelMetadata(modelId);
    modelMap.set(modelId, metadata);
    modelIDs.push(modelId);

    newManagedModels[modelId] = {
      source: "api",
      timestamp: Date.now(),
    };
  }

  // Add aliases
  for (const [alias, target] of Object.entries(HESSIAN_ALIASES)) {
    if (modelMap.has(target)) {
      const targetEntry = modelMap.get(target);
      const aliasEntry = buildHessianAliasConfig(alias, targetEntry);
      modelMap.set(alias, aliasEntry);
      modelIDs.push(alias);
      newManagedModels[alias] = {
        source: "alias",
        target,
        timestamp: Date.now(),
      };
    }
  }

  // Determine selected model
  let selected = preferredModel;
  if (!selected || !modelMap.has(selected)) {
    // Try to find a good default
    const preferredOrder = [
      "tud/mistral-medium-3.5-128b",
      "tud/qwen3.6-35b-a3b",
      "tud/gpt-oss-120b",
    ];
    for (const candidate of preferredOrder) {
      if (modelMap.has(candidate)) {
        selected = candidate;
        break;
      }
    }
    // Fall back to first available
    if (!selected && modelIDs.length > 0) {
      selected = modelIDs[0];
    }
  }

  return {
    models: modelMap,
    modelIDs,
    selected,
    managedModels: newManagedModels,
  };
}
