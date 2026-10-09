// Rate limit tracking for Hessian API.
// Tracks request counts and enforces rate limits.

const RATE_LIMITS = {
  // Default rate limits (to be updated with actual Hessian.AI limits)
  requestsPerMinute: 60,
  requestsPerHour: 500,
  requestsPerDay: 1000,
};

// Track request timestamps
const requestTimestamps = [];

/**
 * Creates V1 hooks for rate limiting.
 */
export function createHessianLimitsHooks(client) {
  return {
    config: async (config) => {
      // Initialize rate limiting
    },
    "chat.headers": async (input, next) => {
      // Add rate limit headers to requests
      const headers = await next(input);
      return headers;
    },
  };
}

/**
 * Creates V2 hooks for rate limiting.
 */
export function createHessianV2LimitsHooks(session) {
  return {
    "http.response": async (event) => {
      // Track response and extract rate limit headers
      const { response } = event;
      
      // Extract rate limit info from response headers
      const remaining = parseInt(response.headers.get("x-ratelimit-remaining") || "60");
      const reset = parseInt(response.headers.get("x-ratelimit-reset") || "60");
      
      if (remaining < 10) {
        console.warn(`[Hessian] Rate limit approaching: ${remaining} requests remaining`);
      }
    },
  };
}

/**
 * Check if we're within rate limits.
 */
export function isWithinRateLimits() {
  const now = Date.now();
  
  // Remove old timestamps (> 1 minute)
  const recent = requestTimestamps.filter((ts) => now - ts < 60000);
  requestTimestamps.length = 0;
  requestTimestamps.push(...recent);
  
  return recent.length < RATE_LIMITS.requestsPerMinute;
}

/**
 * Record a request for rate limiting.
 */
export function recordRequest() {
  requestTimestamps.push(Date.now());
}
