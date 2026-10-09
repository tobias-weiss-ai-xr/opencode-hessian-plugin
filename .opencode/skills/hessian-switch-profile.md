---
name: hessian-switch-profile
description: Switch between Hessian.AI profiles (production, development, budget)
---

Switch the Hessian.AI profile to change which models are available.

Available profiles:
- **production**: All available models
- **development** / **dev**: Mid-sized and smaller models for faster iteration
- **budget**: Smallest models for cost-effective usage

Usage:
```
/set-skill-var hessian-profile production
/reload
```

This will switch to the production profile with all models. After switching,
use `/reload` to refresh the plugin configuration.
