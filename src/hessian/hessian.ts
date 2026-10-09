// Installed at ~/.config/opencode/plugins/hessian/hessian.ts.
// The immediate plugins/hessian-plugin.ts wrapper is what OpenCode discovers; see that file.
//
// The default export is the official dual V1+V2 shape:
//   - OpenCode 2.x reads `id` + `setup(ctx)` (promise plugin API, @opencode/plugin@2.x)
//   - OpenCode 1.18.29+ calls `server()` and uses the returned V1 hooks
// See https://opencode.ai/v2/docs/build/plugins ("Support V1").

import type { Config, Hooks, Plugin, PluginInput } from "@opencode-ai/plugin";
import type { Plugin as V2Plugin } from "@opencode/plugin";

import * as memory from "./hessian-memory.js";
import {
  HESSIAN_API_KEY_PLACEHOLDER,
  decorateHessianConfig,
  isHessianModelsResponse,
  parseHessianModelsResponse,
} from "./hessian-config.mjs";
import { resolveHessianApiKey } from "./hessian-api-key.mjs";
import { createHessianLimitsHooks, createHessianV2LimitsHooks } from "./hessian-limits-server.js";
import { managedModelsFromSettings, readHessianSettings, updateHessianSettings } from "./hessian-settings.mjs";
import { resolveHessianTransport } from "./hessian-transport.mjs";
import { normalizeHessianSystemMessages, normalizeHessianSystemParts } from "./hessian-system-messages.js";
import {
  HESSIAN_PROVIDER_ID,
  decorateHessianV2Provider,
  hessianProviderInfo,
  shouldReplaceDefaultModel,
  v2ProviderPackage,
} from "./hessian-v2.mjs";

const ENDPOINT = "https://api.hessian.ai/v1/models";
const TUD_ENDPOINT = "https://llm-service.ai.tu-darmstadt.de/v1/models";

type HessianModelsResponse = {
  data: Array<Record<string, unknown> & { id: string }>;
};

type CachedModels = {
  data: HessianModelsResponse;
  cached: boolean;
};

type HessianLimitsHooks = {
  config: (config: Config) => void | Promise<void>;
  "chat.headers": NonNullable<Hooks["chat.headers"]>;
};

export interface HessianPluginDependencies {
  fetch?: typeof globalThis.fetch;
  resolveApiKey?: typeof resolveHessianApiKey;
  resolveTransport?: typeof resolveHessianTransport;
  readSettings?: typeof readHessianSettings;
  updateSettings?: typeof updateHessianSettings;
  fetchWithCache?: typeof memory.fetchWithCache;
  getContext?: typeof memory.getContext;
  getPreferences?: typeof memory.getPreferences;
  updateMetrics?: typeof memory.updateMetrics;
  onWarning?: (message: string) => void;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function preferredModelFrom(context: Record<string, unknown>, preferences: Record<string, unknown>) {
  if (typeof context.preferredModel === "string") return context.preferredModel;
  if (typeof preferences.favoriteModel === "string") return preferences.favoriteModel;
}

function createModelLoader(dependencies: HessianPluginDependencies) {
  const fetchImpl = dependencies.fetch ?? globalThis.fetch;
  const resolveApiKey = dependencies.resolveApiKey ?? resolveHessianApiKey;
  const fetchWithCache = dependencies.fetchWithCache ?? memory.fetchWithCache;
  const updateMetrics = dependencies.updateMetrics ?? memory.updateMetrics;
  const onWarning = dependencies.onWarning ?? console.warn;

  let modelsPromise: Promise<CachedModels> | undefined;
  let reportedFailure = false;

  const reportFailure = (error: unknown) => {
    if (reportedFailure) return;
    reportedFailure = true;
    const msg = errorMessage(error);
    console.error(`[Hessian] ${msg}`);
    onWarning(`[Hessian] ${msg}`);
  };

  const fetchModels = async (): Promise<HessianModelsResponse> => {
    const apiKey = await resolveApiKey();
    if (!apiKey) {
      const helpMsg = `
[Hessian] NO API KEY SET.
Please configure one of:
  1. Environment variable: HESSIAN_API_KEY="your-key"
  2. apiKeyCommand in ~/.config/opencode/hessian.json
  3. Run: /set-hessian-api-key

Get your key: https://api.hessian.ai
`;
      throw new Error(helpMsg.trim());
    }

    const startedAt = Date.now();
    try {
      const response = await fetchImpl(ENDPOINT, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(3_000),
      });
      if (!response.ok) {
        throw new Error(`Hessian API returned ${response.status}: ${response.statusText}`);
      }

      const data = parseHessianModelsResponse(await response.json(), { onWarning });
      if (data.data.length === 0) {
        throw new Error("Hessian API returned no ready models");
      }

      await updateMetrics("api", true, Date.now() - startedAt);
      return data;
    } catch (error) {
      await updateMetrics("api", false, Date.now() - startedAt);
      throw error;
    }
  };

  const loadModels = () => {
    if (!modelsPromise) {
      modelsPromise = (async () => {
        const startedAt = Date.now();
        try {
          const result = await fetchWithCache(fetchModels, {
            isValid: isHessianModelsResponse,
            onInvalidCache: onWarning,
          });
          await updateMetrics("refresh", true, Date.now() - startedAt);
          return result;
        } catch (error) {
          await updateMetrics("refresh", false, Date.now() - startedAt);
          throw error;
        }
      })();
      void modelsPromise.catch(() => {
        modelsPromise = undefined;
      });
    }
    return modelsPromise;
  };

  return { loadModels, reportFailure };
}

export function createHessianPlugin(dependencies: HessianPluginDependencies = {}): Plugin {
  const { loadModels, reportFailure } = createModelLoader(dependencies);
  const resolveApiKey = dependencies.resolveApiKey ?? resolveHessianApiKey;
  const resolveTransport = dependencies.resolveTransport ?? resolveHessianTransport;
  const readSettings = dependencies.readSettings ?? readHessianSettings;
  const updateSettings = dependencies.updateSettings ?? updateHessianSettings;
  const getContext = dependencies.getContext ?? memory.getContext;
  const getPreferences = dependencies.getPreferences ?? memory.getPreferences;
  const onWarning = dependencies.onWarning ?? console.warn;

  const configureHessian = async (config: Config) => {
    let result: CachedModels;
    try {
      result = await loadModels();
    } catch (error) {
      reportFailure(error);
      return;
    }

    const settings = await readSettings({ onWarning });
    const [context, preferences, transport] = await Promise.all([
      getContext(),
      getPreferences(),
      resolveTransport({ onWarning }),
    ]);

    const { modelIDs, managedModels } = decorateHessianConfig(config, {
      models: result.data.data,
      transport,
      preferredModel: preferredModelFrom(context, preferences),
      managedModels: managedModelsFromSettings(settings),
    });

    const options = config.provider?.hessian?.options;
    if (options && (!options.apiKey || options.apiKey === HESSIAN_API_KEY_PLACEHOLDER)) {
      const apiKey = await resolveApiKey();
      if (apiKey) options.apiKey = apiKey;
    }

    try {
      await updateSettings((current) => ({ ...current, managedModels }));
    } catch (error) {
      onWarning(`[Hessian] Could not record managed model metadata: ${errorMessage(error)}`);
    }

    const source = result.cached ? "cached" : "fresh";
    return { count: modelIDs.length, source };
  };

  return async ({ client }: PluginInput): Promise<Hooks> => {
    const limits = createHessianLimitsHooks(client) as HessianLimitsHooks;

    return {
      async config(config) {
        const result = await configureHessian(config);
        if (result) {
          console.log(`[Hessian] Configured ${result.count} models (${result.source})`);
          try {
            await client.app.log({
              body: {
                service: "hessian",
                level: "info",
                message: `configured ${result.count} models (${result.source})`,
              },
            });
          } catch {
            // Logging must not affect configuration or provider availability.
          }
        }
        await limits.config(config);
      },

      async "chat.headers"(input, output) {
        await limits["chat.headers"](input, output);
      },

      async "experimental.chat.system.transform"(input, output) {
        normalizeHessianSystemMessages(input.model, output.system);
      },
    };
  };
}

export function createHessianV2Setup(dependencies: HessianPluginDependencies = {}) {
  const { loadModels, reportFailure } = createModelLoader(dependencies);
  const resolveApiKey = dependencies.resolveApiKey ?? resolveHessianApiKey;
  const resolveTransport = dependencies.resolveTransport ?? resolveHessianTransport;
  const readSettings = dependencies.readSettings ?? readHessianSettings;
  const updateSettings = dependencies.updateSettings ?? updateHessianSettings;
  const getContext = dependencies.getContext ?? memory.getContext;
  const getPreferences = dependencies.getPreferences ?? memory.getPreferences;
  const onWarning = dependencies.onWarning ?? console.warn;

  return async (ctx: V2Plugin.Context) => {
    const limits = createHessianV2LimitsHooks(ctx.session);

    await ctx.session.hook(
      "http.response",
      (event) => limits["http.response"](event),
      { providerID: HESSIAN_PROVIDER_ID },
    );
    await ctx.session.hook("context", (event) => {
      normalizeHessianSystemParts(event.model, event.system);
    });

    let result: CachedModels;
    try {
      result = await loadModels();
    } catch (error) {
      reportFailure(error);
      return;
    }

    const settings = await readSettings({ onWarning });
    const [context, preferences, transport] = await Promise.all([
      getContext(),
      getPreferences(),
      resolveTransport({ onWarning }),
    ]);
    const apiKey = (await resolveApiKey()) ?? undefined;

    let outcome: ReturnType<typeof decorateHessianV2Provider> | undefined;
    await ctx.provider.transform((editor) => {
      const record = editor.get(HESSIAN_PROVIDER_ID);
      const existingModels = record ? [...record.models.values()] : [];
      outcome = decorateHessianV2Provider({
        models: result.data.data,
        existingModels,
        managedModels:
          settings && typeof settings.v2ManagedModels === "object" && settings.v2ManagedModels !== null
            ? (settings.v2ManagedModels as Record<string, unknown>)
            : {},
        preferredModel: preferredModelFrom(context, preferences),
      });

      if (record) {
        editor.models.set(HESSIAN_PROVIDER_ID, outcome.models);
        editor.update(HESSIAN_PROVIDER_ID, (provider) => {
          const current = provider.settings?.["apiKey"];
          if (apiKey && (!current || current === HESSIAN_API_KEY_PLACEHOLDER)) {
            provider.settings = { ...provider.settings, apiKey };
          }
        });
      } else {
        editor.add({
          info: hessianProviderInfo({ package: v2ProviderPackage(transport), apiKey }),
          models: outcome.models,
        });
      }
    });
    if (!outcome) return;

    await ctx.model.transform((editor) => {
      const current = editor.default.get();
      if (shouldReplaceDefaultModel(current, outcome.modelIDs) && outcome.selected) {
        editor.default.set(HESSIAN_PROVIDER_ID, outcome.selected);
      }
    });

    try {
      const managed = outcome.managedModels;
      await updateSettings((current) => ({ ...current, v2ManagedModels: managed }));
    } catch (error) {
      onWarning(`[Hessian] Could not record managed model metadata: ${errorMessage(error)}`);
    }

    const source = result.cached ? "cached" : "fresh";
    console.log(`[Hessian] Configured ${outcome.modelIDs.length} models via ${transport.id} (${source})`);
  };
}

export function createHessianPluginDefinition(dependencies: HessianPluginDependencies = {}) {
  return {
    id: HESSIAN_PROVIDER_ID,
    setup: createHessianV2Setup(dependencies),
    server: createHessianPlugin(dependencies),
  };
}

export default createHessianPluginDefinition();
