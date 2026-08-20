# dsh-memory one-shot installer (Windows / PowerShell).
# Usage: .\scripts\install.ps1 [-Profile headless]
# Requires: `dsh` on PATH, `pnpm` on PATH (or corepack shim).
param(
    [string]$Profile = "headless"
)

# dsh plugin exits non-zero when it prints "declares no dsh.bundle" warnings
# for plain plugin packages; that is expected and harmless here.
$ErrorActionPreference = "Continue"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")

Write-Host "==> [1/2] install dsh-memory-bundle (profile layer)"
dsh plugin --profile $Profile add (Join-Path $root "packages\dsh-memory-bundle")

Write-Host "==> [2/2] install the 7 plugin packages (loader resolves them from the profile root)"
$packages = @(
    "dsh-session-query-sqlite-cjk",
    "dsh-tool-result-dedup",
    "dsh-memory-index",
    "dsh-memory-tool",
    "dsh-compaction-locator",
    "dsh-memory-core",
    "dsh-memory-skills"
) | ForEach-Object { Join-Path $root "packages\$_" }
dsh plugin --profile $Profile add @packages

Write-Host "==> install transitive deps of the linked packages"
Push-Location (Join-Path $env:DSH_HOME "profiles\$Profile")
try {
    corepack pnpm install
} finally {
    Pop-Location
}

Write-Host "Done. Verify with: dsh --profile $Profile --dump-config | Select-String memory"
