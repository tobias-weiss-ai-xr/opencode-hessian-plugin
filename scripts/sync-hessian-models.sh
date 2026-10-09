#!/usr/bin/env bash
# Sync Hessian.AI models from the API and update configuration files.
# This script fetches the current model list and regenerates the opencode.json config.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

step() {
  echo -e "${BLUE}[STEP]${NC} $1"
}

error() {
  echo -e "${RED}[ERROR]${NC} $1" >&2
  exit 1
}

# Check for required tools
if ! command -v curl &> /dev/null; then
  error "curl is required"
fi

if ! command -v jq &> /dev/null; then
  error "jq is required (brew install jq or apt-get install jq)"
fi

# Check for API key
API_KEY="${HESSIAN_API_KEY:-}"
if [ -z "$API_KEY" ]; then
  error "HESSIAN_API_KEY environment variable is required"
fi

ENDPOINT="${HESSIAN_API_URL:-https://api.hessian.ai/v1}"

tmp_dir=$(mktemp -d)
trap "rm -rf $tmp_dir" EXIT

# Step 1: Fetch models from API
step "Fetching models from Hessian.AI API..."
models_json="$tmp_dir/models.json"
curl -s -H "Authorization: Bearer $API_KEY" \
  "${ENDPOINT}/models" > "$models_json" || error "Failed to fetch models"

# Step 2: Parse and filter models
step "Processing models..."

# Extract model IDs
jq -r '.data[].id' "$models_json" > "$tmp_dir/model_ids.txt" || error "Failed to parse models"

# Include TUD models
cat >> "$tmp_dir/model_ids.txt" << 'EOF'
tud/gpt-oss-120b
tud/glm-5.2-awq
tud/mistral-medium-3.5-128b
tud/qwen3.6-35b-a3b
tud/ministral-3-14b-instruct
tud/gemma-4-31b-it
tud/qwen3-vl-30b-a3b-instruct-awq
EOF

# Sort and deduplicate
sort -u "$tmp_dir/model_ids.txt" > "$tmp_dir/model_ids_sorted.txt"

# Step 3: Generate opencode.json
step "Generating opencode.json..."

# Read aliases from the aliases file
# For now, use hardcoded aliases
cat > "$tmp_dir/aliases.txt" << 'EOF'
tud|tud/mistral-medium-3.5-128b
hessian|tud/mistral-medium-3.5-128b
best-for-coding|tud/qwen3.6-35b-a3b
best-for-reasoning|tud/mistral-medium-3.5-128b
best-quality|tud/mistral-medium-3.5-128b
best-for-vision|tud/qwen3-vl-30b-a3b-instruct-awq
fastest|tud/ministral-3-14b-instruct
budget|tud/ministral-3-14b-instruct
EOF

# Start building the JSON
cat > opencode.json << 'HEAD'
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "bash": "allow",
    "edit": "allow",
    "read": "allow",
    "grep": "allow",
    "glob": "allow",
    "list": "allow",
    "lsp": "allow",
    "skill": "allow",
    "task": "allow",
    "todowrite": "allow",
    "todoread": "allow",
    "webfetch": "allow",
    "websearch": "allow",
    "codesearch": "allow",
    "question": "allow",
    "mymcp_*": "ask"
  },
  "formatter": {},
  "model": "hessian/tud/mistral-medium-3.5-128b",
  "provider": {
    "hessian": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Hessian.AI",
      "options": {
        "baseURL": "https://api.hessian.ai/v1",
        "apiKey": "{env:HESSIAN_API_KEY}"
      },
      "models": {
HEAD

# Function to generate model entry
generate_model_entry() {
  local model_id="$1"
  local name description category reasoning attachment context output latency
  
  # Extract info from model ID
  name=$(echo "$model_id" | sed 's/\// /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2); print}')
  
  # Set based on model ID patterns
  if [[ "$model_id" == tud/* ]]; then
    category="tud"
    if [[ "$model_id" == *"vl"* || "$model_id" == *"vision"* ]]; then
      category="tud-vision"
      attachment="true"
    else
      attachment="false"
    fi
    reasoning="true"
    context=131072
    output=32768
    if [[ "$model_id" == *"gemma-4"* ]]; then
      context=262144
    fi
  elif [[ "$model_id" == *"mistral"* || "$model_id" == *"mixtral"* ]]; then
    category="mistral"
    if [[ "$model_id" == *"80b"* || "$model_id" == *"120b"* || "$model_id" == *"128b"* ]]; then
      reasoning="true"
    else
      reasoning="false"
    fi
    attachment="false"
    context=32768
    output=2048
  elif [[ "$model_id" == *"llama"* ]]; then
    category="meta"
    if [[ "$model_id" == *"70b"* ]]; then
      reasoning="true"
    else
      reasoning="false"
    fi
    attachment="false"
    context=131072
    output=4096
  elif [[ "$model_id" == *"qwen"* ]]; then
    category="qwen"
    reasoning="false"
    if [[ "$model_id" == *"vl"* ]]; then
      attachment="true"
    else
      attachment="false"
    fi
    context=32768
    output=2048
  elif [[ "$model_id" == *"gemma"* ]]; then
    category="google"
    reasoning="false"
    attachment="false"
    context=8192
    output=2048
  else
    category="general"
    reasoning="false"
    attachment="false"
    context=4096
    output=2048
  fi
  
  # Set latency
  if [[ "$model_id" == *"7b"* ]]; then
    latency="fast"
  elif [[ "$model_id" == *"14b"* || "$model_id" == *"31b"* || "$model_id" == *"35b"* ]]; then
    latency="moderate"
  elif [[ "$model_id" == *"70b"* || "$model_id" == *"80b"* || "$model_id" == *"120b"* || "$model_id" == *"128b"* ]]; then
    latency="slow"
  else
    latency="moderate"
  fi
  
  # Check if it's an alias
  if grep -q "^${model_id}|" "$tmp_dir/aliases.txt" 2>/dev/null; then
    target=$(grep "^${model_id}|" "$tmp_dir/aliases.txt" | cut -d'|' -f2)
    cat <<ALIAS
        "$model_id": {
          "name": "${model_id} -> ${target}",
          "reasoning": $(get_reasoning_for "$target"),
          "id": "$target",
          "attachment": $(get_attachment_for "$target"),
          "limit": {"context": $(get_context_for "$target"), "output": $(get_output_for "$target")},
          "metadata": {"cost_per_1k_tokens": 0, "estimated_latency": "$(get_latency_for "$target")", "category": "alias", "alias_of": "$target"}
        },
ALIAS
  else
    cat <<MODEL
        "$model_id": {
          "name": "$name",
          "reasoning": $reasoning,
          "attachment": $attachment,
          "limit": {"context": $context, "output": $output},
          "metadata": {"cost_per_1k_tokens": 0, "estimated_latency": "$latency", "category": "$category"}
        },
MODEL
  fi
}

# Helper functions
get_reasoning_for() {
  if [[ "$1" == tud/* || "$1" == *"80b"* || "$1" == *"70b"* || "$1" == *"mixtral"* ]]; then
    echo "true"
  else
    echo "false"
  fi
}

get_attachment_for() {
  if [[ "$1" == *"vl"* || "$1" == *"vision"* || "$1" == *"gemma-4"* ]]; then
    echo "true"
  else
    echo "false"
  fi
}

get_context_for() {
  if [[ "$1" == *"128b"* || "$1" == *"120b"* || "$1" == *"35b"* || "$1" == *"31b"* ]]; then
    echo "131072"
  elif [[ "$1" == *"gemma-4"* ]]; then
    echo "262144"
  elif [[ "$1" == *"70b"* || "$1" == *"80b"* ]]; then
    echo "32768"
  else
    echo "32768"
  fi
}

get_output_for() {
  if [[ "$1" == *"128b"* || "$1" == *"120b"* ]]; then
    echo "32768"
  elif [[ "$1" == *"35b"* || "$1" == *"31b"* ]]; then
    echo "32768"
  elif [[ "$1" == *"70b"* || "$1" == *"80b"* ]]; then
    echo "8192"
  else
    echo "2048"
  fi
}

get_latency_for() {
  if [[ "$1" == *"7b"* ]]; then
    echo "fast"
  elif [[ "$1" == *"14b"* ]]; then
    echo "moderate"
  elif [[ "$1" == *"70b"* || "$1" == *"80b"* || "$1" == *"120b"* || "$1" == *"128b"* ]]; then
    echo "slow"
  else
    echo "moderate"
  fi
}

# Generate entries for all models
first=true
while IFS= read -r model_id; do
  if [ -z "$model_id" ]; then
    continue
  fi
  if [ "$first" = true ]; then
    first=false
  else
    echo "," >> opencode.json
  fi
  generate_model_entry "$model_id" >> opencode.json
done < "$tmp_dir/model_ids_sorted.txt"

# Close the JSON
cat >> opencode.json << 'FOOT'
        "tud": {
          "name": "Best TUD model -> mistral-medium-3.5-128b",
          "reasoning": true,
          "id": "tud/mistral-medium-3.5-128b",
          "attachment": false,
          "limit": {"context": 131072, "output": 32768},
          "metadata": {"cost_per_1k_tokens": 0, "estimated_latency": "slow", "category": "tud", "alias_of": "tud/mistral-medium-3.5-128b"}
        }
      }
    }
  },
  "last_updated": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
}
FOOT

info "opencode.json updated with $(wc -l < "$tmp_dir/model_ids_sorted.txt") models"
info "Release preparation complete!"
