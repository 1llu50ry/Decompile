# decompile — one-line installer for Windows (PowerShell 5+).
#
# Usage:
#   irm https://raw.githubusercontent.com/1llu50ry/mcp-reverse/main/install.ps1 | iex
#   $env:PREFIX = "C:\tools\decompile"; irm ... | iex   # custom prefix
#   $env:SKIP_SETUP = "1"; irm ... | iex                # install only
#   $env:CHANNEL = "prerelease"; irm ... | iex          # pick pre-release

$ErrorActionPreference = 'Stop'

$Owner    = '1llu50ry'
$Repo     = 'mcp-reverse'
$Prefix   = if ($env:PREFIX)      { $env:PREFIX }      else { Join-Path $env:USERPROFILE '.decompile' }
$BinDir   = Join-Path $Prefix 'bin'
$Channel  = if ($env:CHANNEL)     { $env:CHANNEL }     else { 'latest' }
$SkipSetup= if ($env:SKIP_SETUP)  { $env:SKIP_SETUP }  else { '0' }

function Say([string]$m) { Write-Host "  $m" }
function Die([string]$m) { Write-Error $m; exit 1 }

# Detect arch.
$arch = switch -Regex ($env:PROCESSOR_ARCHITECTURE) {
  'ARM64' { 'aarch64' }
  default { 'x86_64' }
}
$target = "$arch-pc-windows-msvc"
$asset = "decompile-$target.zip"

Say "fetching $Channel release metadata…"
$api = if ($Channel -eq 'latest') {
  "https://api.github.com/repos/$Owner/$Repo/releases/latest"
} else {
  "https://api.github.com/repos/$Owner/$Repo/releases?per_page=5"
}
$releases = Invoke-RestMethod -Uri $api -Headers @{ 'User-Agent' = 'decompile-installer' }
$rel = if ($releases -is [array]) {
  $releases | Where-Object { -not $_.draft -and ($Channel -ne 'latest' -or -not $_.prerelease) } | Select-Object -First 1
} else { $releases }
if (-not $rel) { Die "no release found in channel '$Channel'." }
$assetObj = $rel.assets | Where-Object { $_.name -eq $asset }
if (-not $assetObj) { Die "release $($rel.tag_name) has no asset '$asset'." }

$tmp = Join-Path $env:TEMP ("decompile-" + [guid]::NewGuid())
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$zip = Join-Path $tmp 'pkg.zip'
Say "downloading $($assetObj.browser_download_url)"
Invoke-WebRequest -Uri $assetObj.browser_download_url -OutFile $zip -UseBasicParsing
Expand-Archive -Path $zip -DestinationPath $tmp -Force
$src = Get-ChildItem -Path $tmp -Recurse -Filter 'decompile.exe' | Select-Object -First 1
if (-not $src) { Die "no decompile.exe in archive $asset." }

New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
Copy-Item -Force $src.FullName (Join-Path $BinDir 'decompile.exe')
Say "installed: $(Join-Path $BinDir 'decompile.exe')"

# Add $BinDir to user PATH if missing.
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (($userPath -split ';') -notcontains $BinDir) {
  [Environment]::SetEnvironmentVariable('Path', ($userPath + ';' + $BinDir).TrimStart(';'), 'User')
  Say "added $BinDir to user PATH (restart your shell to pick it up)"
}
$env:Path = ($env:Path + ';' + $BinDir)

if ($SkipSetup -ne '1') {
  Say "running: decompile setup -i"
  & (Join-Path $BinDir 'decompile.exe') setup -i
}

Say "done. Verify with: decompile --version"
Remove-Item -Recurse -Force $tmp
