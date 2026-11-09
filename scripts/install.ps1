# Install or update mdSilo on Windows from the GitHub release.
#
#   irm https://raw.githubusercontent.com/mdSilo/mdSilo-app/main/scripts/install.ps1 | iex
#
# With options:
#   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/mdSilo/mdSilo-app/main/scripts/install.ps1))) -Version 0.8.0
#   .\install.ps1 [-Version 0.8.0] [-Format exe|msi] [-Force] [-Uninstall]
#
# exe (default): the setup installs for the current user, no admin needed.
# msi: installs for all users, asks for admin rights.
# Running it again updates the app when a newer release is out.

param(
  [string]$Version = "",
  [ValidateSet("exe", "msi")]
  [string]$Format = "exe",
  [switch]$Force,
  [switch]$Uninstall
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"  # the progress bar makes downloads very slow in PowerShell 5
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$Repo = "mdSilo/mdSilo-app"
$App = "mdsilo"
$Api = "https://api.github.com/repos/$Repo/releases"

function Fail($msg) { Write-Host "error: $msg" -ForegroundColor Red; exit 1 }

# installs of the setup (per user) and the msi (per machine) both register here
function Get-Installed {
  $keys = @(
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
  )
  Get-ItemProperty $keys -ErrorAction SilentlyContinue |
    Where-Object { $_.PSObject.Properties["DisplayName"] -and $_.DisplayName -eq $App } |
    Select-Object -First 1
}

function Test-Running {
  if (Get-Process -Name $App -ErrorAction SilentlyContinue) {
    Fail "mdSilo is running; close it and run this again"
  }
}

function Invoke-Quiet($exe, $argList, [switch]$Admin) {
  $p = @{ FilePath = $exe; ArgumentList = $argList; Wait = $true; PassThru = $true }
  if ($Admin) { $p.Verb = "RunAs" }
  $proc = Start-Process @p
  if ($proc.ExitCode -ne 0) { Fail "$exe exited with code $($proc.ExitCode)" }
}

# --- uninstall ---------------------------------------------------------------

if ($Uninstall) {
  $entry = Get-Installed
  if (-not $entry) { Write-Host "mdSilo is not installed."; exit 0 }
  Test-Running
  if ($entry.UninstallString -match "msiexec") {
    Invoke-Quiet "msiexec.exe" "/x `"$($entry.PSChildName)`" /qn" -Admin
  } else {
    Invoke-Quiet ($entry.UninstallString -replace '"', '') "/S"
  }
  Write-Host "mdSilo is uninstalled. Your notes and workspace folders are kept."
  exit 0
}

# --- pick release and asset --------------------------------------------------

$headers = @{ "User-Agent" = "mdsilo-install" }
try {
  if ($Version) {
    $Version = $Version.TrimStart("v")
    $release = Invoke-RestMethod -Headers $headers "$Api/tags/$App-v$Version"
  } else {
    $release = Invoke-RestMethod -Headers $headers "$Api/latest"
  }
} catch {
  if ($Version) { Fail "release $Version is not found" }
  Fail "cannot get the latest release from GitHub (offline or rate limited?)"
}

$latest = $release.tag_name -replace "^$App-v", ""

# arm64 gets its own setup; the msi, and releases without an arm64 build, use x64 (Windows on ARM emulates it)
# PROCESSOR_ARCHITEW6432 is set when this PowerShell itself runs emulated
$cpu = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
$patterns = @()
if ($Format -eq "msi") {
  $patterns += "_x64_en-US\.msi$"
} else {
  if ($cpu -eq "ARM64") { $patterns += "_arm64-setup\.exe$" }
  $patterns += "_x64-setup\.exe$"
}
$asset = $null
foreach ($pat in $patterns) {
  $asset = $release.assets | Where-Object { $_.name -match $pat } | Select-Object -First 1
  if ($asset) { break }
}
if (-not $asset) { Fail "release $latest has no $Format installer" }

$entry = Get-Installed
$current = if ($entry) { $entry.DisplayVersion } else { "" }
if ($current -and $current -eq $latest -and -not $Force) {
  Write-Host "mdSilo $current is installed and up to date."
  exit 0
}
if ($current) { Write-Host "Updating mdSilo $current -> $latest ($Format)" }
else { Write-Host "Installing mdSilo $latest ($Format)" }

Test-Running

$tmp = Join-Path ([IO.Path]::GetTempPath()) ("mdsilo-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  $file = Join-Path $tmp $asset.name
  Write-Host "Downloading $($asset.name) ..."
  Invoke-WebRequest -UseBasicParsing -Headers $headers -Uri $asset.browser_download_url -OutFile $file

  # --- install ---------------------------------------------------------------
  if ($Format -eq "msi") {
    Invoke-Quiet "msiexec.exe" "/i `"$file`" /qn /norestart" -Admin
  } else {
    Invoke-Quiet $file "/S"
  }
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}

Write-Host "mdSilo $latest is installed. Run this script again to update."
