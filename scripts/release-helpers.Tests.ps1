# release-helpers.Tests.ps1 - Pester tests for the checks local-release.ps1 relies on.
#
# Unit block: pure string rules, no I/O.
# Integration block: real goversioninfo + real go build, because the defect these
# guard against (v7.25.6 shipped an fterm.exe with no Windows version resource and
# Defender quarantined it) only shows up in a real binary.

$modulePath = Join-Path $PSScriptRoot 'release-helpers.psm1'
Import-Module $modulePath -Force

Describe 'Test-ConventionalCommitSubject (unit)' {
    It 'accepts a plain type prefix' {
        Test-ConventionalCommitSubject 'fix: stop the crash' | Should Be $true
    }
    It 'accepts a scoped type prefix' {
        Test-ConventionalCommitSubject 'fix(mcp): accept renamed argument keys' | Should Be $true
    }
    It 'accepts a breaking-change marker' {
        Test-ConventionalCommitSubject 'feat(api)!: drop the v1 route' | Should Be $true
    }
    It 'rejects a subject with no type' {
        Test-ConventionalCommitSubject 'Update stuff' | Should Be $false
    }
    It 'rejects a scope with no colon' {
        Test-ConventionalCommitSubject 'fix(mcp) accept keys' | Should Be $false
    }
}

Describe 'Windows version resource (integration)' {
    $workDirectory = Join-Path ([IO.Path]::GetTempPath()) ("release-helpers-" + [guid]::NewGuid())
    New-Item -ItemType Directory -Path $workDirectory | Out-Null
    Copy-Item (Join-Path $PSScriptRoot '..\cmd\forge\versioninfo.json') $workDirectory
    Set-Content -Path (Join-Path $workDirectory 'go.mod') -Value 'module versionprobe'
    Set-Content -Path (Join-Path $workDirectory 'main.go') -Value "package main`nfunc main() {}"

    $previousGoos = $env:GOOS
    $previousGoarch = $env:GOARCH
    $env:GOOS = 'windows'
    $env:GOARCH = 'amd64'

    It 'refuses a binary built without the resource' {
        $bareBinary = Join-Path $workDirectory 'bare.exe'
        Push-Location $workDirectory
        try { go build -o $bareBinary . } finally { Pop-Location }

        { Assert-WindowsVersionInfo -BinaryPath $bareBinary -ExpectedVersion '7.25.7' } | Should Throw 'no Forge version resource'
    }

    It 'accepts a binary built with a freshly generated resource stamped with the release version' {
        New-WindowsResourceFile -ForgeDirectory $workDirectory -Version '7.25.7' | Out-Null
        $stampedBinary = Join-Path $workDirectory 'stamped.exe'
        Push-Location $workDirectory
        try { go build -o $stampedBinary . } finally { Pop-Location }

        { Assert-WindowsVersionInfo -BinaryPath $stampedBinary -ExpectedVersion '7.25.7' } | Should Not Throw
    }

    It 'refuses a binary whose resource carries a different version' {
        $stampedBinary = Join-Path $workDirectory 'stamped.exe'

        { Assert-WindowsVersionInfo -BinaryPath $stampedBinary -ExpectedVersion '9.9.9' } | Should Throw 'expected 9.9.9'
    }

    $env:GOOS = $previousGoos
    $env:GOARCH = $previousGoarch
    Remove-Item -Recurse -Force $workDirectory
}
