# Hessian.AI OpenCode plugin installer for PowerShell
# Installs the plugin to ~\.config\opencode\plugins\hessian

$ErrorActionPreference = "Stop"

$PLUGIN_DIR = "$HOME\.config\opencode\plugins"
$INSTALL_DIR = "$PLUGIN_DIR\hessian"

function Write-Info { param($msg) Write-Host "[INFO] $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Error { param($msg) Write-Host "[ERROR] $msg" -ForegroundColor Red }

# Check if we're in the plugin directory
$SCRIPT_DIR = $PSScriptRoot
if (-not (Test-Path "$SCRIPT_DIR\package.json")) {
  Write-Error "Please run this script from the opencode-hessian-plugin directory"
  exit 1
}

# Create plugin directory
Write-Info "Creating plugin directory at $INSTALL_DIR"
New-Item -ItemType Directory -Force -Path "$INSTALL_DIR" | Out-Null

# Copy src directory
Write-Info "Copying plugin files..."
Copy-Item "$SCRIPT_DIR\src\*" -Destination "$INSTALL_DIR" -Recurse -Force

# Create .gitignore
@'
node_modules
*.tmp
*.tmp.*
'@ | Out-File "$INSTALL_DIR\.gitignore"

Write-Info "Hessian.AI plugin installed successfully!`n"
Write-Host "To use the plugin:"
Write-Host "  1. Restart OpenCode"
Write-Host "  2. Set your API key: `$env:HESSIAN_API_KEY='your-key'"
Write-Host "  3. Or configure in ~\.config\opencode\hessian.json"
Write-Host "`nPlugin directory: $INSTALL_DIR"
