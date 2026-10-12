# release-helpers.psm1 - checks local-release.ps1 runs so a broken release stops before it ships.
#
# Kept apart from the release script so each check can be tested on its own:
# the script itself publishes to GitHub and R2 and cannot be run in a test.

Set-StrictMode -Version Latest

# The product name written into fterm.exe's Windows version resource. A binary
# without it is what v7.25.6 shipped, and Defender quarantined that build.
$script:ExpectedProductName = 'Forge Terminal'

# Conventional Commits, including the optional scope and breaking-change marker
# (fix(mcp): ..., feat!: ...). The old pattern rejected scopes, which forced
# -Force on releases whose commits were perfectly conventional.
$script:ConventionalCommitPattern = '^(feat|fix|chore|docs|test|refactor|perf)(\([^)]+\))?!?: .+'

<#
.SYNOPSIS
    Reports whether a commit subject follows Conventional Commits.
#>
function Test-ConventionalCommitSubject {
    param([Parameter(Mandatory, Position = 0)][string]$Subject)
    return $Subject -match $script:ConventionalCommitPattern
}

<#
.SYNOPSIS
    Generates cmd/forge's Windows version resource (.syso), stamped with the release version.

.DESCRIPTION
    `go build` links any *.syso in the package automatically, so this file is what
    gives fterm.exe its name, description and version in Windows. It is generated
    rather than committed, which means a fresh checkout or worktree does not have
    it until this runs - and the release must stop if it cannot run, not warn.
#>
function New-WindowsResourceFile {
    param(
        [Parameter(Mandatory)][string]$ForgeDirectory,
        [Parameter(Mandatory)][string]$Version
    )

    $generator = Get-Command goversioninfo -ErrorAction SilentlyContinue
    if (-not $generator) {
        throw "goversioninfo not found - install it with: go install github.com/josephspurrier/goversioninfo/cmd/goversioninfo@latest"
    }

    $resourcePath = Join-Path $ForgeDirectory 'resource_windows_amd64.syso'
    $windowsVersion = "$Version.0"
    Push-Location $ForgeDirectory
    try {
        $generatorOutput = & $generator.Source -64 `
            -file-version $windowsVersion -product-version $windowsVersion `
            -o $resourcePath versioninfo.json 2>&1
        if ($LASTEXITCODE -ne 0) { throw "goversioninfo failed: $generatorOutput" }
    } finally {
        Pop-Location
    }

    if (-not (Test-Path $resourcePath)) { throw "goversioninfo reported success but $resourcePath was not written" }
    return $resourcePath
}

<#
.SYNOPSIS
    Throws unless a built Windows binary carries Forge's version resource for this release.
#>
function Assert-WindowsVersionInfo {
    param(
        [Parameter(Mandatory)][string]$BinaryPath,
        [Parameter(Mandatory)][string]$ExpectedVersion
    )

    $versionInfo = (Get-Item $BinaryPath).VersionInfo
    if ($versionInfo.ProductName -ne $script:ExpectedProductName) {
        throw "$BinaryPath has no Forge version resource (ProductName='$($versionInfo.ProductName)') - refusing to ship it"
    }
    # Trailing dot so 7.25.1 does not match a binary stamped 7.25.10.
    if (-not "$($versionInfo.ProductVersion).".StartsWith("$ExpectedVersion.")) {
        throw "$BinaryPath carries version '$($versionInfo.ProductVersion)', expected $ExpectedVersion"
    }
}

Export-ModuleMember -Function Test-ConventionalCommitSubject, New-WindowsResourceFile, Assert-WindowsVersionInfo
