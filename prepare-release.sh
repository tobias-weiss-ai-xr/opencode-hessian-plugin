#!/usr/bin/env bash
# Prepare a release of the Hessian.AI OpenCode plugin

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Check for bun
if ! command -v bun &> /dev/null; then
  error "bun is required. Please install: curl -fsSL https://bun.sh/install | bash"
fi

# Get version from package.json
VERSION=$(grep '"version"' package.json | sed -E 's/.*"([^"]+)".*/\1/')
info "Preparing release v$VERSION"

# Step 1: Type check
step "Running type check..."
npm run tsc

# Step 2: Sync models
step "Syncing model configuration..."
npm run sync-models

# Step 3: Update last_updated in opencode.json
step "Updating timestamps..."
sed -i '' -E "s/\"last_updated\": \"[^\"]+\"/\"last_updated\": \"$(date -u +'%Y-%m-%dT%H:%M:%SZ')\"/g" opencode.json

# Step 4: Generate checksums
step "Generating checksums..."
cd dist 2>/dev/null || mkdir -p dist
SHA256=$(find src .opencode opencode.json package.json -type f | sort | xargs shasum -a 256 | shasum -a 256 | awk '{print $1}')
echo "SHA256: $SHA256" > dist/checksums.sha256

# Step 5: Create release archive
step "Creating release archive..."
ARCHIVE="opencode-hessian-plugin-v${VERSION}.tar.gz"
tar -czf "dist/${ARCHIVE}" src .opencode opencode.json opencode.json.example package.json README.md LICENSE install.sh install.ps1

info "Release v$VERSION prepared successfully!"
info "Archive: dist/${ARCHIVE}"
info "Checksums: dist/checksums.sha256"

echo ""
info "Next steps:"
info "1. Create a Git tag: git tag v$VERSION"
info "2. Push the tag: git push origin v$VERSION"
info "3. Create a GitHub/Codeberg release with the archive"
