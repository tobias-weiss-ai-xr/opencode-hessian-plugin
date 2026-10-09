---
name: hessian-health
description: Check the health status of the Hessian.AI plugin
---

Check the health and connectivity of the Hessian.AI plugin.

This command will:
- Verify the plugin is loaded correctly
- Check API connectivity
- Show cache statistics
- Display the current configuration

Usage:
```
/hessian-health
```

The health check will report:
- Plugin status (loaded/error)
- API endpoint connectivity
- Cache hit/miss statistics
- Number of models configured
- Current default model

If any issues are detected, the command will provide suggestions for resolution.
