// Single source of truth for the `hessian/*` convenience aliases.
//
// Why an alias needs `id`: OpenCode looks a model up by the key under
// `provider.<id>.models.<key>` and sends that key upstream unless the entry
// declares `id`. An alias entry therefore MUST carry `id: "<target>"`, otherwise
// OpenCode asks Hessian for `best-for-coding` and the request comes back
// `404 Model Not Found`.
//
// Both the runtime plugin (src/hessian-model-metadata.js) and the config generator
// (scripts/sync-hessian-models.sh) read this map, so the alias surface cannot drift
// between the two installation paths.

export const HESSIAN_ALIASES = Object.freeze({
  "best-for-coding": "tud/qwen3.6-35b-a3b",
  "best-for-reasoning": "tud/mistral-medium-3.5-128b",
  "best-quality": "tud/mistral-medium-3.5-128b",
  "best-for-vision": "tud/qwen3-vl-30b-a3b-instruct-awq",
  "best-for-agentic": "tud/qwen3.6-35b-a3b",
  "best-tud": "tud/mistral-medium-3.5-128b",
  fastest: "tud/ministral-3-14b-instruct",
  "fastest-reasoning": "tud/ministral-3-14b-instruct",
  budget: "tud/ministral-3-14b-instruct",
  tud: "tud/mistral-medium-3.5-128b",
  hessian: "tud/mistral-medium-3.5-128b",
});

export const HESSIAN_ALIAS_IDS = Object.freeze(Object.keys(HESSIAN_ALIASES));

export function isHessianAlias(id) {
  return typeof id === "string" && Object.hasOwn(HESSIAN_ALIASES, id);
}

/** `alias|target` rows, the shape scripts/sync-hessian-models.sh consumes. */
export function hessianAliasRows() {
  return Object.entries(HESSIAN_ALIASES).map(([alias, target]) => `${alias}|${target}`);
}

/**
 * Project an alias onto its target's OpenCode model entry.
 *
 * Capabilities are inherited rather than re-declared: an alias that advertised
 * different limits or modalities than the model it points at is exactly how the
 * two surfaces drifted before.
 */
export function buildHessianAliasConfig(alias, targetEntry) {
  return {
    ...targetEntry,
    id: HESSIAN_ALIASES[alias],
    name: `${alias} -> ${HESSIAN_ALIASES[alias]}`,
  };
}
