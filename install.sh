#!/usr/bin/env bash
# Hessian.AI OpenCode plugin installer
# Installs the plugin to ~/.config/opencode/plugins/

set -euo pipefail

PLUGIN_DIR="${HOME}/.config/opencode/plugins"
INSTALL_DIR="${PLUGIN_DIR}/hessian"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
  echo -e "${RED}[ERROR]${NC} $1" >&2
}

# Check if we're in the plugin directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ ! -f "${SCRIPT_DIR}/package.json" ]; then
  error "Please run this script from the opencode-hessian-plugin directory"
  exit 1
fi

# Create plugin directory
info "Creating plugin directory at ${INSTALL_DIR}"
mkdir -p "${INSTALL_DIR}"

# Copy src directory
info "Copying plugin files..."
cp -r "${SCRIPT_DIR}/src"/* "${INSTALL_DIR}/"

# Set permissions
chmod 644 "${INSTALL_DIR}"/*.ts "${INSTALL_DIR}"/*.mjs "${INSTALL_DIR}"/*.js 2>/dev/null || true

# Create .gitignore
cat > "${INSTALL_DIR}/.gitignore" << 'EOF'
node_modules
*.tmp
*.tmp.*
EOF

info "Hessian.AI plugin installed successfully!"
echo ""
echo "To use the plugin:"
echo "  1. Restart OpenCode"
echo "  2. Set your API key: export HESSIAN_API_KEY='your-key'"
echo "  3. Or configure in ~/.config/opencode/hessian.json"
echo ""
echo "Plugin directory: ${INSTALL_DIR}"
