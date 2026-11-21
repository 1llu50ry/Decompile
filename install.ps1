# decompile — one-line installer for Windows (PowerShell 5.1+ / pwsh 7+).
#
#   irm https://raw.githubusercontent.com/1llu50ry/Decompile/main/install.ps1 | iex
#
# Downloads the prebuilt release bundle for the host arch, verifies its
# SHA-256, unpacks it into $PREFIX (default: %USERPROFILE%\.decompile) so
# that $PREFIX\bin\decompile.exe sits next to the MCP server, skills DB and
# docs, adds $PREFIX\bin to the user PATH, and runs `decompile setup -i`.
#
# Environment overrides:
#   $env:PREFIX          install prefix                     (default: ~\.decompile)
#   $env:VERSION         release tag, e.g. v6.0.0           (default: latest)
#   $env:CHANNEL         'prerelease' = newest incl. pre-releases
#   $env:METHOD          auto | binary | npm | npx          (default: auto)
#   $env:SKIP_SETUP      '1' = install only
#   $env:SETUP_ARGS      args for `decompile setup`         (default: -i)
#   $env:NO_MODIFY_PATH  '1' = don't touch the user PATH
#   $env:INSTALL_NODE    '1' = install Node.js LTS with winget if missing / too old
#   $env:DRY_RUN         '1' = print the install plan and exit
#   $env:DECOMPILE_UNINSTALL '1' = remove everything this script installed
#   $env:DECOMPILE_DOWNLOAD_BASE  mirror for release assets
#   $env:DECOMPILE_NPX_SPEC  package for -Method npm|npx (default: the release's decompile.tgz)
#
# Or download it and pass parameters:
#   .\install.ps1 -Version v6.0.0 -SkipSetup
#   .\install.ps1 -Method npx
#   .\install.ps1 -DryRun
#   .\install.ps1 -InstallNode
#   .\install.ps1 -Uninstall
#
# If PowerShell says "running scripts is disabled on this system":
#   powershell -ExecutionPolicy ByPass -c "irm https://raw.githubusercontent.com/1llu50ry/Decompile/main/install.ps1 | iex"

[CmdletBinding()]
param(
  [string]$Prefix,
  [string]$Version,
  [switch]$Prerelease,
  [ValidateSet('auto', 'binary', 'npm', 'npx', '')][string]$Method,
  [Alias('NoSetup', 'NoPrompt')][switch]$SkipSetup,
  [string]$SetupArgs,
  [switch]$NoModifyPath,
  [switch]$InstallNode,
  [switch]$DryRun,
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # Invoke-WebRequest is 10x slower with the progress bar
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}

$Owner        = '1llu50ry'
$Repo         = 'Decompile'
$NpmPkg       = 'decompile'
$MinNodeMajor = 24
$DefaultVersion = 'latest' # @release-pin

function Pick($a, $b, $c) { if ($a) { $a } elseif ($b) { $b } else { $c } }
$Prefix    = Pick $Prefix    $env:PREFIX     (Join-Path $env:USERPROFILE '.decompile')
$Version   = Pick $Version   $env:VERSION    $DefaultVersion
$Channel   = if ($Prerelease) { 'prerelease' } else { Pick $env:CHANNEL $null 'latest' }
$Method    = Pick $Method    $env:METHOD     'auto'
$SetupArgs = Pick $SetupArgs $env:SETUP_ARGS '-i'
$DoSetup   = -not ($SkipSetup -or $env:SKIP_SETUP -eq '1')
$ModPath   = -not ($NoModifyPath -or $env:NO_MODIFY_PATH -eq '1')
$DoUninstall = $Uninstall -or $env:DECOMPILE_UNINSTALL -eq '1'
$DoInstallNode = $InstallNode -or $env:INSTALL_NODE -eq '1'
$DoDryRun = $DryRun -or $env:DRY_RUN -eq '1'
$DownloadBase = Pick $env:DECOMPILE_DOWNLOAD_BASE $null "https://github.com/$Owner/$Repo/releases"

if ($Method -notin 'auto', 'binary', 'npm', 'npx') { throw "METHOD must be auto|binary|npm|npx (got '$Method')" }
if ($Version -match '^\d') { $Version = "v$Version" }
if ($Version -ne 'latest' -and $Version -notmatch '^v\d+\.\d+\.\d+') { throw "VERSION must be 'latest' or a release tag like v6.0.0 (got '$Version')" }

$BinDir = Join-Path $Prefix 'bin'
$Exe    = Join-Path $BinDir 'decompile.exe'

function Say([string]$m)  { Write-Host "==> $m" }
function Ok([string]$m)   { Write-Host " ok  $m" -ForegroundColor Green }
function Warn([string]$m) { Write-Host "warn $m" -ForegroundColor Yellow }
class InstallError : Exception { InstallError([string]$m) : base($m) {} }
function Die([string]$m)  { throw [InstallError]::new($m) }

function Get-NodeMajor {
  $n = Get-Command node -ErrorAction SilentlyContinue
  if (-not $n) { return 0 }
  # Parse `node --version` here: PowerShell 5.1 mangles embedded quotes in
  # arguments to native commands, so `node -p '...split(".")...'` breaks.
  try {
    $v = ((& node --version) | Select-Object -First 1) -replace '^v', ''
    return [int]($v -split '\.')[0]
  } catch { return 0 }
}

function Show-NodeHelp {
  Write-Host ''
  Write-Host "  Install Node.js $MinNodeMajor LTS, then rerun this installer (or pass -InstallNode):"
  Write-Host '    winget install --exact --id OpenJS.NodeJS.LTS'
  Write-Host '      Type Y if asked to accept the terms. Close PowerShell, open it again, then run: node -v'
  Write-Host '    No winget? Download the installer: https://nodejs.org/en/download'
  Write-Host "    Check: node -v   (must print v$MinNodeMajor or newer)"
  Write-Host ''
  Write-Host '  If PowerShell says "running scripts is disabled on this system" for npx/npm,'
  Write-Host '  use npx.cmd / npm.cmd instead, e.g.:  npx.cmd -y decompile@latest setup'
  Write-Host ''
}

function Update-SessionPath {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = (@($machine, $user, $env:Path) | Where-Object { $_ }) -join ';'
}

# Opt-in (-InstallNode / INSTALL_NODE=1).
function Install-NodeLts {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { Warn 'winget not available'; return $false }
  Say 'installing Node.js LTS with winget'
  $p = Start-Process -FilePath (Get-Command winget).Source -NoNewWindow -Wait -PassThru -ArgumentList @(
    'install', '--exact', '--id', 'OpenJS.NodeJS.LTS', '--accept-source-agreements', '--accept-package-agreements')
  if ($p.ExitCode -ne 0) { Warn "winget exited with $($p.ExitCode)" }
  Update-SessionPath
  foreach ($d in @("$env:ProgramFiles\nodejs", "${env:ProgramFiles(x86)}\nodejs")) {
    if ((Test-Path (Join-Path $d 'node.exe')) -and ($env:Path -split ';') -notcontains $d) { $env:Path = "$d;$env:Path" }
  }
  return ((Get-NodeMajor) -ge $MinNodeMajor)
}

function Test-Node([bool]$Hard) {
  $major = Get-NodeMajor
  if ($major -ge $MinNodeMajor) { Ok "node $(& node --version)"; return $true }
  if ($DoInstallNode -and (Install-NodeLts)) { Ok "node $(& node --version)"; return $true }
  $msg = if ($major -eq 0) { 'Node.js not found' } else { "Node.js $(& node --version) is unsupported" }
  $msg += " - decompile's MCP server needs Node.js >= $MinNodeMajor"
  Show-NodeHelp
  if ($Hard) { Die $msg }
  Warn $msg
  Warn 'the native CLI (analyze / inspect / doctor) works without it; `decompile serve` will not.'
  return $false
}

function Show-Plan {
  $arch = Get-Arch
  $node = if (Get-Command node -ErrorAction SilentlyContinue) { "Node.js $(& node --version)" } else { 'Node.js not found' }
  if ($DoInstallNode) { $node += ' (-InstallNode)' }
  $onPath = ([Environment]::GetEnvironmentVariable('Path', 'User') -split ';') -contains $BinDir
  Write-Host 'decompile install plan' -ForegroundColor Cyan
  Write-Host "  Method:   $Method"
  Write-Host ("  Version:  $Version" + $(if ($Channel -eq 'prerelease') { ' (pre-release channel)' } else { '' }))
  Write-Host "  Runtime:  $node"
  switch ($Method) {
    'npx' { Write-Host "  Files:    none (agents launch ``npx -y $(Get-NpmSpec) serve``)" }
    'npm' { Write-Host "  Command:  npm.cmd install -g $(Get-NpmSpec)" }
    default {
      Write-Host ("  Target:   " + $(if ($arch) { "$arch-pc-windows-msvc" } else { 'none for this host (npm fallback)' }))
      Write-Host "  Prefix:   $Prefix"
      Write-Host "  Binary:   $Exe"
      Write-Host ("  PATH:     " + $(if ($onPath) { 'already on user PATH' } elseif ($ModPath) { 'add to user PATH' } else { 'unchanged (-NoModifyPath)' }))
    }
  }
  Write-Host ("  Setup:    " + $(if ($DoSetup) { "decompile setup $SetupArgs" } else { 'skipped' }))
}

function Assert-Version([string]$Cmd, [string]$Tag) {
  if ($Tag -eq 'latest') { return }
  $got = ((& $Cmd --version) -join ' ').Trim()
  if ($got -notlike "*$($Tag.TrimStart('v'))*") { Die "installed version '$got' does not match $Tag - reinstall, or report a broken release asset." }
  Ok "version check: $got"
}

$script:SetupCmd = $null
$script:SetupPre = @()

# Start-Process -NoNewWindow hands the console straight to the child, so the
# interactive picker (setup -i) can prompt and read input.
function Invoke-Setup {
  if (-not $script:SetupCmd) { return }
  $a = @($script:SetupPre) + @('setup') + @($script:SetupArgs -split '\s+' | Where-Object { $_ })
  if (-not $DoSetup) { Say "skipping setup. Later: decompile $($a -join ' ')"; return }
  $exe = (Get-Command $script:SetupCmd -ErrorAction Stop).Source
  Say "running: $($script:SetupCmd) $($a -join ' ')"
  $p = Start-Process -FilePath $exe -ArgumentList $a -NoNewWindow -Wait -PassThru
  if ($p.ExitCode -ne 0) { Warn "setup exited with $($p.ExitCode) - rerun: $($script:SetupCmd) $($a -join ' ')" }
}

function Get-Arch {
  # PROCESSOR_ARCHITEW6432 is set when a 32-bit / emulated shell runs on a 64-bit OS.
  $a = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
  try {
    $ri = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture
    if ($ri) { $a = "$ri" }
  } catch {}
  switch -Regex ($a) {
    'ARM64'          { 'aarch64' }
    'AMD64|X64|x64'  { 'x86_64' }
    default          { $null }
  }
}

function Resolve-Tag {
  if ($Channel -eq 'prerelease' -and $Version -eq 'latest') {
    $rels = Invoke-RestMethod -Uri "https://api.github.com/repos/$Owner/$Repo/releases?per_page=10" -Headers @{ 'User-Agent' = 'decompile-installer' }
    $rel = $rels | Where-Object { -not $_.draft } | Select-Object -First 1
    if (-not $rel) { Die 'could not resolve the newest pre-release tag. Pass -Version.' }
    return $rel.tag_name
  }
  return $Version
}

function Get-AssetUrl([string]$Tag, [string]$Asset) {
  if ($Tag -eq 'latest') { "$DownloadBase/latest/download/$Asset" } else { "$DownloadBase/download/$Tag/$Asset" }
}

# Package for -Method npm|npx: the decompile.tgz attached to each GitHub
# release (no npm-registry account needed). $env:DECOMPILE_NPX_SPEC overrides it.
function Get-NpmSpec {
  if ($env:DECOMPILE_NPX_SPEC) { return $env:DECOMPILE_NPX_SPEC }
  return (Get-AssetUrl (Resolve-Tag) 'decompile.tgz')
}

function Add-UserPath {
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  if (-not $userPath) { $userPath = '' }
  if (($userPath -split ';') -contains $BinDir) { return }
  if (-not $ModPath) { Warn "$BinDir is not on PATH; add it manually."; return }
  [Environment]::SetEnvironmentVariable('Path', (($userPath.TrimEnd(';') + ';' + $BinDir).TrimStart(';')), 'User')
  Ok "added $BinDir to the user PATH (new terminals will pick it up)"
}

function Install-Binary {
  $arch = Get-Arch
  if (-not $arch) { Warn "no prebuilt bundle for arch '$env:PROCESSOR_ARCHITECTURE'"; return $false }
  $target = "$arch-pc-windows-msvc"
  $asset  = "decompile-$target.zip"
  $tag    = Resolve-Tag
  $url    = Get-AssetUrl $tag $asset

  $tmp = Join-Path ([IO.Path]::GetTempPath()) ('decompile-' + [guid]::NewGuid())
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  try {
    Say "target $target, release $tag"
    Say "downloading $url"
    $zip = Join-Path $tmp $asset
    try { Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing }
    catch { Warn "download failed: $url ($($_.Exception.Message))"; return $false }

    try {
      Invoke-WebRequest -Uri "$url.sha256" -OutFile "$zip.sha256" -UseBasicParsing
      $want = ((Get-Content "$zip.sha256" -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
      $got  = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant()
      if ($want -ne $got) { Die "checksum mismatch for $asset (expected $want, got $got)" }
      Ok 'sha256 verified'
    } catch [InstallError] { throw }
    catch { Warn "no checksum published for $asset - skipping verification" }

    $x = Join-Path $tmp 'x'
    Expand-Archive -Path $zip -DestinationPath $x -Force
    # Bundle layout: decompile\{bin\decompile.exe,package.json,dist\,db\,docs\,...}
    # Older releases shipped files at the archive root - accept both.
    $src = $null
    foreach ($c in @((Join-Path $x 'decompile'), $x)) {
      if (Test-Path (Join-Path $c 'bin\decompile.exe')) { $src = $c; break }
    }
    if (-not $src) {
      $legacy = Get-ChildItem -Path $x -Recurse -Filter 'decompile.exe' | Select-Object -First 1
      if (-not $legacy) { Die "no decompile.exe in $asset" }
      $src = Join-Path $tmp 'legacy'
      New-Item -ItemType Directory -Force -Path (Join-Path $src 'bin') | Out-Null
      Get-ChildItem -Path $legacy.Directory.FullName -Force | Copy-Item -Destination $src -Recurse -Force
      Move-Item -Force (Join-Path $src 'decompile.exe') (Join-Path $src 'bin\decompile.exe')
    }
    Get-ChildItem -Path $src -Recurse -File | Unblock-File -ErrorAction SilentlyContinue

    & (Join-Path $src 'bin\decompile.exe') --version | Out-Null
    if ($LASTEXITCODE -ne 0) { Die "the downloaded binary does not run on this host ($target). Try -Method npm." }
    Assert-Version (Join-Path $src 'bin\decompile.exe') $tag   # before touching the existing install

    # Replace the managed parts of the prefix; leave anything else the user put there.
    New-Item -ItemType Directory -Force -Path $Prefix | Out-Null
    $running = Get-Process -Name decompile -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $Exe }
    if ($running) { Die "decompile.exe is running from $Exe - stop it (and your agents) and rerun." }
    foreach ($item in Get-ChildItem -Path $src -Force) {
      $dest = Join-Path $Prefix $item.Name
      if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
      Move-Item -Path $item.FullName -Destination $dest
    }
    Ok "installed: $Exe"
  } finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  }

  [void](Test-Node $false)
  Add-UserPath
  $env:Path = "$BinDir;$env:Path"
  $script:SetupCmd = $Exe
  return $true
}

function Install-Npm {
  [void](Test-Node $true)
  if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { Die 'npm not found (it ships with Node.js)' }
  $spec = Get-NpmSpec
  Say "npm.cmd install -g $spec"
  & npm.cmd install -g $spec
  if ($LASTEXITCODE -ne 0) { Die 'npm install -g failed' }
  $cmd = Join-Path ((& npm.cmd prefix -g) | Select-Object -First 1) 'decompile.cmd'
  if (-not (Test-Path $cmd)) { $cmd = 'decompile.cmd' }
  Ok "installed via npm: $cmd"
  Assert-Version $cmd $Version
  $script:SetupCmd = $cmd
}

function Install-Npx {
  [void](Test-Node $true)
  if (-not (Get-Command npx.cmd -ErrorAction SilentlyContinue)) { Die 'npx not found (it ships with npm / Node.js)' }
  $spec = Get-NpmSpec
  $env:DECOMPILE_NPX_SPEC = $spec   # `decompile setup --npx` writes `npx -y <spec> serve`
  if ($SetupArgs -notmatch '(^|\s)--npx(\s|$)') { $script:SetupArgs = "$SetupArgs --npx" }
  Say "npx mode: nothing is installed; agents will launch ``npx -y $spec serve``"
  $script:SetupCmd = 'npx.cmd'
  $script:SetupPre = @('-y', $spec)
}

function Uninstall-All {
  if (Test-Path $Exe) {
    Say 'removing agent registrations'
    & $Exe uninstall --all-detected
  } elseif (Get-Command decompile -ErrorAction SilentlyContinue) {
    & decompile uninstall --all-detected
  }
  if (Test-Path $Prefix) { Remove-Item -Recurse -Force $Prefix; Ok "removed $Prefix" }
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  if ($userPath -and (($userPath -split ';') -contains $BinDir)) {
    [Environment]::SetEnvironmentVariable('Path', (($userPath -split ';' | Where-Object { $_ -and $_ -ne $BinDir }) -join ';'), 'User')
    Ok "removed $BinDir from the user PATH"
  }
  $skill = Join-Path $env:USERPROFILE '.claude\skills\decompile'
  if (Test-Path $skill) { Remove-Item -Recurse -Force $skill }
  if (Get-Command npm.cmd -ErrorAction SilentlyContinue) {
    & npm.cmd ls -g $NpmPkg *> $null
    if ($LASTEXITCODE -eq 0) { Warn "an npm-global copy is also installed - remove with: npm uninstall -g $NpmPkg" }
  }
  Ok 'decompile uninstalled'
}

# Run inside a function so `irm | iex` never kills the caller's session on failure.
function Invoke-DecompileInstaller {
  try {
    if ($DoUninstall) { Uninstall-All; return }
    Show-Plan
    if ($DoDryRun) { Say 'dry run complete; no changes made.'; return }
    switch ($Method) {
      'binary' { if (-not (Install-Binary)) { Die 'binary install failed (try -Method npm)' } }
      'npm'    { Install-Npm }
      'npx'    { Install-Npx }
      'auto'   {
        if (-not (Install-Binary)) {
          if ((Get-NodeMajor) -ge $MinNodeMajor -and (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
            Warn 'falling back to npm install -g'
            Install-Npm
          } else {
            Die "no prebuilt bundle and no Node.js >= $MinNodeMajor for the npm fallback. Install Node.js, then rerun."
          }
        }
      }
    }
    Invoke-Setup
    Say 'done. Verify (in a new terminal) with: decompile --version; decompile doctor'
  } catch {
    Write-Host "error $($_.Exception.Message)" -ForegroundColor Red
    if ($PSCommandPath) { exit 1 }
  }
}

Invoke-DecompileInstaller
