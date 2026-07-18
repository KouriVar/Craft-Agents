# Build script for Windows NSIS installer
# Usage: powershell -ExecutionPolicy Bypass -File scripts/build-win.ps1

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ElectronDir = Split-Path -Parent $ScriptDir
$RootDir = Split-Path -Parent (Split-Path -Parent $ElectronDir)
$OutputDir = if ($env:CRAFT_PACK_OUTPUT_DIR) { $env:CRAFT_PACK_OUTPUT_DIR } else { Join-Path $HOME "Downloads\Craft Pack" }
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

# Configuration
$BunVersion = "bun-v1.3.9"  # Pinned version for reproducible builds

function Invoke-DownloadWithRetry {
    param([string]$Uri, [string]$OutFile, [int]$MaxAttempts = 8)
    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        try {
            Write-Host "Downloading $(Split-Path -Leaf $OutFile) (attempt $attempt/$MaxAttempts)..."
            Invoke-WebRequest -Uri $Uri -OutFile $OutFile
            return
        } catch {
            if ($attempt -eq $MaxAttempts) { throw }
            Write-Host "Download interrupted; retrying in 3 seconds..." -ForegroundColor Yellow
            Start-Sleep -Seconds 3
        }
    }
}

Write-Host "=== Building Craft Agents Windows Installer using electron-builder ===" -ForegroundColor Cyan

# 0. Stop only processes launched from this repository. The old implementation
# killed every Node/Electron process on the machine, including unrelated apps.
Write-Host "Checking for repository-local processes that may lock build files..."
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -and $_.CommandLine.Contains($RootDir) -and
    $_.Name -match '^(node|npm|electron|electron-builder)(\.exe)?$'
} | ForEach-Object {
    Write-Host "  Stopping $($_.Name) (PID: $($_.ProcessId))..." -ForegroundColor Yellow
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

# 1. Clean previous build artifacts (with retry for locked files)
Write-Host "Cleaning previous builds..."
$foldersToClean = @(
    "$ElectronDir\vendor",
    "$ElectronDir\node_modules\@anthropic-ai",
    "$ElectronDir\packages",
    "$ElectronDir\release"
)
foreach ($folder in $foldersToClean) {
    if (Test-Path $folder) {
        $retries = 3
        for ($i = 1; $i -le $retries; $i++) {
            try {
                Remove-Item -Recurse -Force $folder -ErrorAction Stop
                break
            } catch {
                if ($i -eq $retries) { throw }
                Write-Host "  Retrying cleanup of $folder (attempt $i)..." -ForegroundColor Yellow
                Start-Sleep -Seconds 2
            }
        }
    }
}

# 2. Install dependencies
Write-Host "Installing dependencies..."
Push-Location $RootDir
try {
    bun install
} finally {
    Pop-Location
}

# 3. Download Bun binary for Windows
# Use baseline build - works on all x64 CPUs (no AVX2 requirement)
Write-Host "Downloading Bun $BunVersion for Windows x64 (baseline)..."
New-Item -ItemType Directory -Force -Path "$ElectronDir\vendor\bun" | Out-Null

$BunDownload = "bun-windows-x64-baseline"
$TempDir = Join-Path $env:TEMP "bun-download-$(Get-Random)"
New-Item -ItemType Directory -Force -Path $TempDir | Out-Null
$BuildCacheRoot = if ($env:CRAFT_BUILD_CACHE_DIR) { $env:CRAFT_BUILD_CACHE_DIR } else { Join-Path $env:LOCALAPPDATA "CraftAgent\build-downloads" }
$BunCacheDir = Join-Path $BuildCacheRoot $BunVersion
$CachedZip = Join-Path $BunCacheDir "$BunDownload.zip"
New-Item -ItemType Directory -Force -Path $BunCacheDir | Out-Null

try {
    # Download binary and checksums
    $ZipUrl = "https://github.com/oven-sh/bun/releases/download/$BunVersion/$BunDownload.zip"
    $ChecksumUrl = "https://github.com/oven-sh/bun/releases/download/$BunVersion/SHASUMS256.txt"

    Invoke-DownloadWithRetry -Uri $ChecksumUrl -OutFile "$TempDir\SHASUMS256.txt"

    # Verify checksum
    $ExpectedHash = (Get-Content "$TempDir\SHASUMS256.txt" | Select-String "$BunDownload.zip").ToString().Split(" ")[0]
    if (Test-Path $CachedZip) {
        $CachedHash = (Get-FileHash $CachedZip -Algorithm SHA256).Hash.ToLower()
        if ($CachedHash -ne $ExpectedHash) {
            Write-Host "Cached Bun archive failed checksum; downloading a clean copy..." -ForegroundColor Yellow
            Remove-Item -Force $CachedZip
        } else {
            Write-Host "Using cached Bun archive: $CachedZip"
        }
    }
    if (-not (Test-Path $CachedZip)) {
        Invoke-DownloadWithRetry -Uri $ZipUrl -OutFile $CachedZip
    }

    Write-Host "Verifying checksum..."
    $ActualHash = (Get-FileHash $CachedZip -Algorithm SHA256).Hash.ToLower()

    if ($ActualHash -ne $ExpectedHash) {
        throw "Checksum verification failed! Expected: $ExpectedHash, Got: $ActualHash"
    }
    Write-Host "Checksum verified successfully" -ForegroundColor Green

    # Extract and install using robocopy for better file handle management
    Write-Host "Extracting Bun..."
    Expand-Archive -Path $CachedZip -DestinationPath $TempDir -Force

    # Unblock in temp first (before copy)
    Unblock-File -Path "$TempDir\$BunDownload\bun.exe" -ErrorAction SilentlyContinue

    # Use robocopy with retries - handles transient file locks better than Copy-Item
    # /R:5 = 5 retries, /W:3 = 3 second wait between retries, /NP = no progress, /NFL /NDL = quiet
    Write-Host "Copying bun.exe with robocopy..."
    $robocopyResult = robocopy "$TempDir\$BunDownload" "$ElectronDir\vendor\bun" "bun.exe" /R:5 /W:3 /NP /NFL /NDL
    # Robocopy exit codes: 0-7 are success, 8+ are errors
    if ($LASTEXITCODE -ge 8) {
        throw "robocopy failed with exit code $LASTEXITCODE"
    }

    $BunExePath = "$ElectronDir\vendor\bun\bun.exe"
    Write-Host "Bun extracted to: $BunExePath" -ForegroundColor Green

    # Give Windows time to release any file handles from the copy
    Write-Host "Waiting for file handles to release..."
    Start-Sleep -Seconds 3
} finally {
    Remove-Item -Recurse -Force $TempDir -ErrorAction SilentlyContinue
}

# 4. Copy SDK from root node_modules (monorepo hoisting).
# Since SDK 0.2.113: thin core + per-platform binary package.
# See apps/electron/scripts/build-dmg.sh for the full rationale.
$SdkSource = "$RootDir\node_modules\@anthropic-ai\claude-agent-sdk"
if (-not (Test-Path $SdkSource)) {
    Write-Host "ERROR: SDK core not found at $SdkSource" -ForegroundColor Red
    Write-Host "Run 'bun install' from the repository root first."
    exit 1
}
Write-Host "Copying SDK core..."
New-Item -ItemType Directory -Force -Path "$ElectronDir\node_modules\@anthropic-ai" | Out-Null
Remove-Item -Recurse -Force "$ElectronDir\node_modules\@anthropic-ai\claude-agent-sdk" -ErrorAction SilentlyContinue
Copy-Item -Recurse -Force $SdkSource "$ElectronDir\node_modules\@anthropic-ai\"

# 4a. Resolve the target arch's binary package (cross-fetch from npm if absent).
# Target arch is hard-coded x64 — Windows arm64 is not currently shipped.
$SdkBinPkg = "claude-agent-sdk-win32-x64"
$SdkBinSource = "$RootDir\node_modules\@anthropic-ai\$SdkBinPkg"
if (-not (Test-Path $SdkBinSource)) {
    Write-Host "Cross-arch build: $SdkBinPkg not in node_modules — fetching from npm..."
    $SdkVersion = (node -p "require('$RootDir/package.json'.replace(/\\/g, '/')).dependencies['@anthropic-ai/claude-agent-sdk']").Trim('"')
    $PkgTmp = New-Item -ItemType Directory -Path ([System.IO.Path]::Combine($env:TEMP, [System.Guid]::NewGuid().ToString()))
    try {
        Push-Location $PkgTmp
        npm pack "@anthropic-ai/$SdkBinPkg@$SdkVersion" | Out-Null
        $Tarball = Get-ChildItem -Filter "anthropic-ai-*.tgz" | Select-Object -First 1
        tar -xzf $Tarball.Name
        Pop-Location
        New-Item -ItemType Directory -Force -Path $SdkBinSource | Out-Null
        Copy-Item -Recurse -Force "$PkgTmp\package\*" $SdkBinSource
    } finally {
        Remove-Item -Recurse -Force $PkgTmp -ErrorAction SilentlyContinue
    }
}

if (-not (Test-Path $SdkBinSource)) {
    Write-Host "ERROR: SDK native binary package ($SdkBinPkg) not found at $SdkBinSource" -ForegroundColor Red
    exit 1
}

Write-Host "Staging SDK native binary as claude-agent-sdk-binary alias..."
$AliasDest = "$ElectronDir\node_modules\@anthropic-ai\claude-agent-sdk-binary"
Remove-Item -Recurse -Force $AliasDest -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $AliasDest | Out-Null
Copy-Item -Recurse -Force "$SdkBinSource\*" $AliasDest

$BinPath = "$AliasDest\claude.exe"
if (-not (Test-Path $BinPath)) {
    Write-Host "ERROR: Native binary not found at $BinPath" -ForegroundColor Red
    exit 1
}
$BinSize = (Get-Item $BinPath).Length
if ($BinSize -lt 50000000) {
    Write-Host "ERROR: claude.exe is only $BinSize bytes (expected ~210 MB)" -ForegroundColor Red
    exit 1
}
Write-Host "  Native binary: $([math]::Round($BinSize / 1MB)) MB"

# 5. Copy ripgrep (sourced from @vscode/ripgrep since 0.2.113).
$RgSource = "$RootDir\node_modules\@vscode\ripgrep"
if (-not (Test-Path $RgSource) -or -not (Test-Path "$RgSource\bin\rg.exe")) {
    Write-Host "ERROR: @vscode/ripgrep not installed or postinstall did not run" -ForegroundColor Red
    Write-Host "Run 'bun install' and 'bun pm trust @vscode/ripgrep'."
    exit 1
}
Write-Host "Copying @vscode/ripgrep..."
New-Item -ItemType Directory -Force -Path "$ElectronDir\node_modules\@vscode" | Out-Null
Remove-Item -Recurse -Force "$ElectronDir\node_modules\@vscode\ripgrep" -ErrorAction SilentlyContinue
Copy-Item -Recurse -Force $RgSource "$ElectronDir\node_modules\@vscode\"

# 6. Copy network interceptor sources (for Pi subprocess; Claude no longer
#    uses --preload — Phase 2 will move that to SDK hooks or a local proxy).
$InterceptorSource = "$RootDir\packages\shared\src\unified-network-interceptor.ts"
if (-not (Test-Path $InterceptorSource)) {
    Write-Host "ERROR: Interceptor not found at $InterceptorSource" -ForegroundColor Red
    exit 1
}
Write-Host "Copying interceptor (for Pi subprocess)..."
New-Item -ItemType Directory -Force -Path "$ElectronDir\packages\shared\src" | Out-Null
Copy-Item $InterceptorSource "$ElectronDir\packages\shared\src\"
foreach ($dep in @("interceptor-common.ts", "feature-flags.ts", "interceptor-request-utils.ts")) {
    $depPath = "$RootDir\packages\shared\src\$dep"
    if (Test-Path $depPath) {
        Copy-Item $depPath "$ElectronDir\packages\shared\src\"
    }
}

# 6. Build Electron app
Write-Host "Building Electron app..."

# Build main process with OAuth credentials
Write-Host "  Building main process..."
$MainArgs = @(
    "apps/electron/src/main/index.ts",
    "--bundle",
    "--platform=node",
    "--format=cjs",
    "--outfile=apps/electron/dist/main.cjs",
    "--external:electron",
    # SDK 0.3.x is pure ESM and calls createRequire(import.meta.url) at module init.
    # esbuild's CJS bundling leaves import.meta.url undefined for inlined ESM, crashing
    # the app on load (ERR_INVALID_ARG_VALUE). Externalize it so Node loads it natively
    # as ESM — the SDK core is staged into the app's node_modules above (step 4).
    # Must stay in sync with package.json build:main and scripts/electron-dev.ts.
    "--external:@anthropic-ai/claude-agent-sdk"
)
# Add OAuth defines if env vars are set
if ($env:GOOGLE_OAUTH_CLIENT_ID) {
    $MainArgs += "--define:process.env.GOOGLE_OAUTH_CLIENT_ID=`"'$env:GOOGLE_OAUTH_CLIENT_ID'`""
}
if ($env:GOOGLE_OAUTH_CLIENT_SECRET) {
    $MainArgs += "--define:process.env.GOOGLE_OAUTH_CLIENT_SECRET=`"'$env:GOOGLE_OAUTH_CLIENT_SECRET'`""
}
if ($env:SLACK_OAUTH_CLIENT_ID) {
    $MainArgs += "--define:process.env.SLACK_OAUTH_CLIENT_ID=`"'$env:SLACK_OAUTH_CLIENT_ID'`""
}
if ($env:SLACK_OAUTH_CLIENT_SECRET) {
    $MainArgs += "--define:process.env.SLACK_OAUTH_CLIENT_SECRET=`"'$env:SLACK_OAUTH_CLIENT_SECRET'`""
}
if ($env:MICROSOFT_OAUTH_CLIENT_ID) {
    $MainArgs += "--define:process.env.MICROSOFT_OAUTH_CLIENT_ID=`"'$env:MICROSOFT_OAUTH_CLIENT_ID'`""
}
Push-Location $RootDir
try {
    & npx esbuild @MainArgs
    if ($LASTEXITCODE -ne 0) { throw "Main process build failed" }
} finally {
    Pop-Location
}

# Build preload
Write-Host "  Building preload..."
Push-Location $RootDir
try {
    bun run electron:build:preload
    if ($LASTEXITCODE -ne 0) { throw "Preload build failed" }
} finally {
    Pop-Location
}

# Build renderer (frontend)
Write-Host "  Building renderer (frontend)..."
Push-Location $RootDir
try {
    # Clean previous renderer build
    $RendererDir = "$ElectronDir\dist\renderer"
    if (Test-Path $RendererDir) { Remove-Item -Recurse -Force $RendererDir }

    # Run vite build
    npx vite build --config apps/electron/vite.config.ts
    if ($LASTEXITCODE -ne 0) { throw "Renderer build failed" }

    # Verify renderer was built
    if (-not (Test-Path "$RendererDir\index.html")) {
        throw "Renderer build verification failed: index.html not found"
    }
    Write-Host "  Renderer build verified: $RendererDir" -ForegroundColor Green
} finally {
    Pop-Location
}

# Copy all resources and bundled assets using the shared script.
# Single source of truth — matches Mac/Linux build (bun run build:copy).
# Copies: resources (icons, DMG bg), docs, tool-icons, themes, permissions, config-defaults.
Write-Host "  Copying resources and bundled assets..."
Push-Location $ElectronDir
try {
    bun scripts/copy-assets.ts
    if ($LASTEXITCODE -ne 0) { throw "Asset copy failed" }
    Write-Host "  Assets copied" -ForegroundColor Green
} finally {
    Pop-Location
}

# Rebuild platform-specific uv, session server, Pi server, and koffi resources.
Write-Host "  Building bundled subprocess resources for win32-x64..."
Push-Location $RootDir
try {
    bun run scripts/electron-build-subprocess.ts --platform=win32 --arch=x64
    if ($LASTEXITCODE -ne 0) { throw "Subprocess resource build failed" }
} finally {
    Pop-Location
}

# 7. Package with electron-builder
Write-Host "Packaging app with electron-builder..."

$BunExe = "$ElectronDir\vendor\bun\bun.exe"
if (-not (Test-Path $BunExe)) {
    throw "bun.exe not found at $BunExe"
}

# Verify bun.exe is accessible (not locked by another process)
Write-Host "  Verifying $BunExe is accessible..."
$retryCount = 0
$maxRetries = 6
while ($retryCount -lt $maxRetries) {
    try {
        # Try to open the file exclusively to verify no other process has it locked
        $stream = [System.IO.File]::Open($BunExe, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::None)
        $stream.Close()
        $stream.Dispose()
        Write-Host "  File is accessible" -ForegroundColor Green
        break
    } catch {
        $retryCount++
        if ($retryCount -ge $maxRetries) {
            Write-Host "  WARNING: File may be locked after $maxRetries attempts, proceeding anyway..." -ForegroundColor Yellow
        } else {
            Write-Host "  File locked, waiting 5 seconds (attempt $retryCount/$maxRetries)..." -ForegroundColor Yellow
            Start-Sleep -Seconds 5
        }
    }
}

# Force garbage collection to release any managed file handles
[System.GC]::Collect()
[System.GC]::WaitForPendingFinalizers()

# Run electron-builder with retry logic for EBUSY errors
Push-Location $ElectronDir
$maxBuilderRetries = 3
$builderRetry = 0
$builderSuccess = $false

while (-not $builderSuccess -and $builderRetry -lt $maxBuilderRetries) {
    $builderRetry++
    Write-Host "  electron-builder attempt $builderRetry of $maxBuilderRetries..." -ForegroundColor Cyan

    # Clean release directory before each attempt to avoid stale files
    if (Test-Path "$ElectronDir\release") {
        Write-Host "  Cleaning release directory before attempt..."
        Remove-Item -Recurse -Force "$ElectronDir\release" -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
    }

    npx electron-builder --win --x64 2>&1 | Tee-Object -Variable builderOutput

    if ($LASTEXITCODE -eq 0) {
        $builderSuccess = $true
        Write-Host "  electron-builder succeeded on attempt $builderRetry" -ForegroundColor Green
    } else {
        Write-Host "  electron-builder failed with exit code $LASTEXITCODE" -ForegroundColor Yellow

        if ($builderRetry -lt $maxBuilderRetries) {
            Write-Host "  Waiting 10 seconds before retry..." -ForegroundColor Yellow

            # Stop only build processes belonging to this checkout.
            Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
                $_.CommandLine -and $_.CommandLine.Contains($RootDir) -and
                $_.Name -match '^(node|npm)(\.exe)?$'
            } | ForEach-Object {
                Write-Host "    Stopping $($_.Name) (PID: $($_.ProcessId))..." -ForegroundColor Yellow
                Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
            }

            Start-Sleep -Seconds 10
        }
    }
}

Pop-Location

if (-not $builderSuccess) {
    throw "electron-builder failed after $maxBuilderRetries attempts"
}

# 8. Verify the installer was built
$InstallerPath = Get-ChildItem -Path "$ElectronDir\release" -Filter "*.exe" | Select-Object -First 1

if (-not $InstallerPath) {
    Write-Host "ERROR: Installer not found in $ElectronDir\release" -ForegroundColor Red
    Write-Host "Contents of release directory:"
    Get-ChildItem "$ElectronDir\release"
    exit 1
}

Write-Host ""
Write-Host "=== Build Complete ===" -ForegroundColor Green
foreach ($artifact in @("Craft-Agents-x64.exe", "Craft-Agents-x64.exe.blockmap", "latest.yml")) {
    $source = Join-Path "$ElectronDir\release" $artifact
    if (Test-Path $source) {
        Copy-Item -Force $source (Join-Path $OutputDir $artifact)
    }
}
$PublishedInstaller = Join-Path $OutputDir "Craft-Agents-x64.exe"
Write-Host "Installer: $PublishedInstaller"
Write-Host "Size: $([math]::Round($InstallerPath.Length / 1MB, 2)) MB"
