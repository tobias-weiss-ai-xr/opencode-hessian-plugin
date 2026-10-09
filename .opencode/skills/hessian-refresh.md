---
name: hessian-refresh
description: Manually refresh the Hessian.AI model list from API
---

Refresh the list of available Hessian.AI models from the API.

This is useful when:
- New models have been added to Hessian.AI
- You've changed your API key and need to fetch models with new permissions
- The cached model list is stale

Usage:
```
/hessian-refresh
```

After refreshing, the plugin will automatically update your configuration
with the latest available models.

Note: Models are cached for 24 hours by default. You can also force a refresh
by setting the environment variable `HESSIAN_CACHE_L1=false` before starting
OpenCode.
