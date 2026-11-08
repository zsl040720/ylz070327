#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$EnginePath = 'D:\Steam\steamapps\common\wallpaper_engine',
    [switch]$InstallOnly,
    [switch]$Restore
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

function Get-FmFullPath {
    param([Parameter(Mandatory=$true)][string]$Path)
    return [IO.Path]::GetFullPath($Path)
}

function Test-FmSamePath {
    param([string]$First, [string]$Second)
    if ([string]::IsNullOrWhiteSpace($First) -or [string]::IsNullOrWhiteSpace($Second)) { return $false }
    try { return [string]::Equals((Get-FmFullPath $First).TrimEnd('\'), (Get-FmFullPath $Second).TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase) }
    catch { return $false }
}

function Get-FmEngine {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) { throw 'EnginePath must be the Wallpaper Engine installation folder or executable.' }
    $full = Get-FmFullPath $Path
    if (Test-Path -LiteralPath $full -PathType Leaf) {
        if ([IO.Path]::GetFileName($full) -notin @('wallpaper64.exe','wallpaper32.exe')) { throw 'EnginePath must point to wallpaper64.exe or wallpaper32.exe.' }
        return [pscustomobject]@{ Root=[IO.Path]::GetDirectoryName($full); Exe=$full }
    }
    foreach ($name in @('wallpaper64.exe','wallpaper32.exe')) {
        $candidate = Join-Path $full $name
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { return [pscustomobject]@{ Root=$full; Exe=$candidate } }
    }
    throw "Wallpaper Engine was not found at: $full. Use -EnginePath to select its installation folder."
}

function Get-FmManifest {
    param([Parameter(Mandatory=$true)][string]$Folder)
    $root = (Get-FmFullPath $Folder).TrimEnd('\')
    if (-not (Test-Path -LiteralPath $root -PathType Container)) { throw "Folder not found: $root" }
    $items = @(Get-ChildItem -LiteralPath $root -Recurse -Force)
    if ((Get-Item -LiteralPath $root).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Reparse-point folders are not supported: $root" }
    $manifest = @{}
    foreach ($item in $items) {
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Reparse points are not supported: $($item.FullName)" }
        if (-not $item.PSIsContainer) {
            $relative = $item.FullName.Substring($root.Length).TrimStart('\')
            $manifest[$relative] = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash
        }
    }
    return $manifest
}

function Test-FmManifest {
    param([hashtable]$Expected, [string]$Folder)
    try { $actual = Get-FmManifest $Folder } catch { return $false }
    if ($actual.Count -ne $Expected.Count) { return $false }
    foreach ($key in $Expected.Keys) {
        if (-not $actual.ContainsKey($key) -or $actual[$key] -ne $Expected[$key]) { return $false }
    }
    return $true
}

function Resolve-FmLocalEntry {
    param([string]$ProjectJson)
    $project = Get-Content -LiteralPath $ProjectJson -Raw -Encoding UTF8 | ConvertFrom-Json
    $fileProperty = $project.PSObject.Properties['file']
    if ($null -eq $fileProperty -or [string]::IsNullOrWhiteSpace([string]$fileProperty.Value)) { throw "Missing file property: $ProjectJson" }
    $folder = [IO.Path]::GetDirectoryName((Get-FmFullPath $ProjectJson))
    $relative = [string]$fileProperty.Value
    if ([IO.Path]::IsPathRooted($relative)) { throw 'The project entry must be relative to its own folder.' }
    $entry = Get-FmFullPath (Join-Path $folder $relative)
    if (-not $entry.StartsWith($folder.TrimEnd('\')+'\', [StringComparison]::OrdinalIgnoreCase)) { throw 'The project entry escapes its project folder.' }
    if (-not (Test-Path -LiteralPath $entry -PathType Leaf)) { throw "Wallpaper entry is missing: $entry" }
    return $entry
}

function Install-FmProject {
    param([string]$Source, [string]$EngineRoot)
    $sourceRoot = Get-FmFullPath $Source
    $projectFile = Join-Path $sourceRoot 'project.json'
    if (-not (Test-Path -LiteralPath $projectFile -PathType Leaf)) { throw "Source project not found: $projectFile" }
    $null = Resolve-FmLocalEntry $projectFile
    $expected = Get-FmManifest $sourceRoot
    if ($expected.Count -eq 0) { throw 'The source project is empty.' }
    $projects = Get-FmFullPath (Join-Path $EngineRoot 'projects\myprojects')
    $null = [IO.Directory]::CreateDirectory($projects)
    $name = 'flower-memories-album'
    $existing = @(Get-ChildItem -LiteralPath $projects -Directory | Where-Object { $_.Name -eq $name -or $_.Name.StartsWith($name+'-', [StringComparison]::OrdinalIgnoreCase) } | Sort-Object Name)
    foreach ($directory in $existing) {
        if (Test-FmManifest -Expected $expected -Folder $directory.FullName) {
            Write-Host ('Reuse verified identical project: '+$directory.FullName)
            return $directory.FullName
        }
    }
    $target = Join-Path $projects $name
    if (Test-Path -LiteralPath $target) {
        do { $target = Join-Path $projects ($name+'-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[Guid]::NewGuid().ToString('N').Substring(0,6)) } while (Test-Path -LiteralPath $target)
    }
    $target = Get-FmFullPath $target
    if (-not $target.StartsWith($projects.TrimEnd('\')+'\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Refusing to install outside the local projects folder.' }
    $null = [IO.Directory]::CreateDirectory($target)
    foreach ($relative in $expected.Keys) {
        $from = Join-Path $sourceRoot $relative
        $to = Join-Path $target $relative
        $null = [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($to))
        [IO.File]::Copy($from, $to, $false)
    }
    if (-not (Test-FmManifest -Expected $expected -Folder $target)) { throw "Installed file verification failed. Original projects are unchanged. Partial output: $target" }
    Write-Host ('Installed and verified: '+$target)
    return $target
}

function ConvertTo-FmNativeArgument {
    param([AllowEmptyString()][string]$Argument)
    $escaped = [regex]::Replace($Argument, '(\\*)"', '$1$1\"')
    $escaped = [regex]::Replace($escaped, '(\\+)$', '$1$1')
    return '"'+$escaped+'"'
}

function Invoke-FmEngineControl {
    param([string]$Executable, [string[]]$Arguments)
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = $Executable
    $start.Arguments = (($Arguments | ForEach-Object { ConvertTo-FmNativeArgument $_ }) -join ' ')
    $start.WorkingDirectory = [IO.Path]::GetDirectoryName($Executable)
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $start
    try {
        if (-not $process.Start()) { throw 'Wallpaper Engine control process did not start.' }
        $output = $process.StandardOutput.ReadToEndAsync()
        $errorOutput = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit(15000)) {
            try { $process.Kill() } catch { }
            throw 'Wallpaper Engine control command timed out after 15 seconds.'
        }
        $process.WaitForExit()
        $stdout = $output.GetAwaiter().GetResult()
        $stderr = $errorOutput.GetAwaiter().GetResult()
        if ($process.ExitCode -ne 0) { throw ('Wallpaper Engine control failed ('+$process.ExitCode+'): '+$stderr+' '+$stdout) }
        return [string]$stdout
    } finally { $process.Dispose() }
}

function Ensure-FmEngineRunning {
    param([string]$Executable)
    $engineRoot = [IO.Path]::GetDirectoryName($Executable)
    foreach ($name in @('wallpaper64','wallpaper32')) {
        foreach ($process in @(Get-Process -Name $name -ErrorAction SilentlyContinue)) {
            try { if (Test-FmSamePath ([IO.Path]::GetDirectoryName($process.Path)) $engineRoot) { return } } catch { }
        }
    }
    Write-Host 'Starting Wallpaper Engine in the background...'
    $null = Start-Process -FilePath $Executable -WorkingDirectory $engineRoot -WindowStyle Hidden -PassThru
    $deadline = [DateTime]::UtcNow.AddSeconds(15)
    do {
        Start-Sleep -Milliseconds 500
        foreach ($name in @('wallpaper64','wallpaper32')) {
            foreach ($process in @(Get-Process -Name $name -ErrorAction SilentlyContinue)) {
                try {
                    if (Test-FmSamePath ([IO.Path]::GetDirectoryName($process.Path)) $engineRoot) {
                        Start-Sleep -Milliseconds 1500
                        return
                    }
                } catch { }
            }
        }
    } while ([DateTime]::UtcNow -lt $deadline)
    throw 'Wallpaper Engine did not become ready. Open it normally once, then run this installer again.'
}

function Get-FmConfigWallpaper {
    param([string]$ConfigFile)
    if (-not (Test-Path -LiteralPath $ConfigFile -PathType Leaf)) { return $null }
    try {
        $config = Get-Content -LiteralPath $ConfigFile -Raw -Encoding UTF8 | ConvertFrom-Json
        $records = @()
        $currentUser = $config.PSObject.Properties[[Environment]::UserName]
        if ($null -ne $currentUser) { $records += $currentUser }
        $records += @($config.PSObject.Properties | Where-Object { $_.Name -ne [Environment]::UserName })
        foreach ($record in $records) {
            try {
                $file = [string]$record.Value.general.wallpaperconfig.selectedwallpapers.Monitor0.file
                if (-not [string]::IsNullOrWhiteSpace($file) -and [IO.Path]::IsPathRooted($file) -and (Test-Path -LiteralPath $file -PathType Leaf)) { return (Get-FmFullPath $file) }
            } catch { }
        }
    } catch { }
    return $null
}

function Get-FmWallpaper {
    param([string]$Executable, [string]$ConfigFile, [switch]$AllowConfigFallback)
    try {
        $output = Invoke-FmEngineControl -Executable $Executable -Arguments @('-control','getWallpaper','-monitor','0')
        $lines = @(([string]$output) -split '[\r\n]+' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
        for ($i=$lines.Count-1; $i -ge 0; $i--) {
            $candidate = $lines[$i].Trim().Trim('"')
            if ([IO.Path]::IsPathRooted($candidate) -and (Test-Path -LiteralPath $candidate -PathType Leaf)) { return [pscustomobject]@{ File=(Get-FmFullPath $candidate); Source='getWallpaper'; Monitor=0 } }
        }
    } catch { }
    if ($AllowConfigFallback) {
        $fromConfig = Get-FmConfigWallpaper $ConfigFile
        if ($null -ne $fromConfig) { return [pscustomobject]@{ File=$fromConfig; Source='config'; Monitor=0 } }
    }
    throw 'Could not read the current primary-monitor wallpaper. No wallpaper change has been verified.'
}

function Write-FmNewUtf8File {
    param([string]$Path, [string]$Content)
    $stream = New-Object IO.FileStream($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
    $writer = New-Object IO.StreamWriter($stream,(New-Object Text.UTF8Encoding($true)))
    try { $writer.Write($Content) } finally { $writer.Dispose(); $stream.Dispose() }
}

function Save-FmConfigSnapshot {
    param([string]$PackageRoot, [string]$EngineRoot)
    $config = Join-Path $EngineRoot 'config.json'
    if (-not (Test-Path -LiteralPath $config -PathType Leaf)) { return }
    $rollback = Join-Path $PackageRoot 'rollback'
    $null = [IO.Directory]::CreateDirectory($rollback)
    $backup = Join-Path $rollback 'config.original.json'
    if (-not (Test-Path -LiteralPath $backup)) { [IO.File]::Copy($config, $backup, $false) }
}
function Save-FmRollback {
    param([string]$PackageRoot, [string]$EngineRoot, [string]$Executable)
    $rollback = Join-Path $PackageRoot 'rollback'
    $null = [IO.Directory]::CreateDirectory($rollback)
    $config = Join-Path $EngineRoot 'config.json'
    $configBackup = Join-Path $rollback 'config.original.json'
    $pathBackup = Join-Path $rollback 'wallpaper.original.json'
    if ((Test-Path -LiteralPath $config -PathType Leaf) -and -not (Test-Path -LiteralPath $configBackup)) { [IO.File]::Copy($config,$configBackup,$false) }
    if (Test-Path -LiteralPath $pathBackup -PathType Leaf) {
        $original = Get-Content -LiteralPath $pathBackup -Raw -Encoding UTF8 | ConvertFrom-Json
        if ([string]::IsNullOrWhiteSpace([string]$original.File)) { throw "Invalid rollback record: $pathBackup" }
        return
    }
    $snapshotConfig = $config
    if (Test-Path -LiteralPath $configBackup -PathType Leaf) { $snapshotConfig = $configBackup }
    $current = Get-FmWallpaper -Executable $Executable -ConfigFile $snapshotConfig -AllowConfigFallback
    $record = [ordered]@{ File=$current.File; Monitor=0; Source=$current.Source; CapturedAt=(Get-Date).ToString('o') }
    Write-FmNewUtf8File -Path $pathBackup -Content ($record | ConvertTo-Json)
    Write-Host ('Saved original wallpaper: '+$current.File)
}

function Set-FmWallpaper {
    param([string]$Executable, [string]$File, [string]$EngineRoot)
    if (-not (Test-Path -LiteralPath $File -PathType Leaf)) { throw "Wallpaper file not found: $File" }
    if ([string]::IsNullOrWhiteSpace($EngineRoot)) { $EngineRoot = [IO.Path]::GetDirectoryName((Get-FmFullPath $Executable)) }
    $liveConfig = Join-Path (Get-FmFullPath $EngineRoot) 'config.json'
    $requested = Get-FmFullPath $File
    $expected = @($requested)
    if ([IO.Path]::GetFileName($requested) -eq 'project.json') {
        $expected += Resolve-FmLocalEntry $requested
    } else {
        # Hosts may report either the entry file or its owning project descriptor.
        $descriptor = Join-Path ([IO.Path]::GetDirectoryName($requested)) 'project.json'
        if (Test-Path -LiteralPath $descriptor -PathType Leaf) {
            try { if (Test-FmSamePath (Resolve-FmLocalEntry $descriptor) $requested) { $expected += $descriptor } } catch { }
        }
    }
    $null = Invoke-FmEngineControl -Executable $Executable -Arguments @('-control','openWallpaper','-file',$requested,'-monitor','0')
    $lastObserved = $null
    for ($attempt=0; $attempt -lt 8; $attempt++) {
        Start-Sleep -Milliseconds 750
        try {
            # Some Wallpaper Engine builds return empty stdout even with exit code 0.
            $selected = Get-FmWallpaper -Executable $Executable -ConfigFile $liveConfig -AllowConfigFallback
            $lastObserved = $selected.File
            foreach ($candidate in $expected) {
                if (Test-FmSamePath $selected.File $candidate) {
                    Write-Host ('Wallpaper selection confirmed via '+$selected.Source+' on monitor 0.')
                    return
                }
            }
        } catch { }
        # Also tolerate stale CLI output while the live configuration has advanced.
        $configured = Get-FmConfigWallpaper $liveConfig
        if ($null -ne $configured) {
            $lastObserved = $configured
            foreach ($candidate in $expected) {
                if (Test-FmSamePath $configured $candidate) {
                    Write-Host 'Wallpaper selection confirmed via live config on monitor 0.'
                    return
                }
            }
        }
    }
    $message = 'Wallpaper command sent (exit 0), but neither CLI output nor the live configuration confirms the requested wallpaper. Verify the desktop or Wallpaper Engine manually before assuming it is active. The original rollback backup is retained.'
    if (-not [string]::IsNullOrWhiteSpace($lastObserved)) { $message += ' Last recorded wallpaper: '+$lastObserved }
    Write-Warning $message
    $exception = New-Object InvalidOperationException($message)
    $exception.Data['FmExitCode'] = 2
    throw $exception
}
function Invoke-FmMain {
    param([string]$PackageRoot, [string]$EnginePath, [switch]$InstallOnly, [switch]$Restore)
    if ($InstallOnly -and $Restore) { throw 'Choose either -InstallOnly or -Restore, not both.' }
    $engine = Get-FmEngine $EnginePath
    if ($Restore) {
        $recordPath = Join-Path $PackageRoot 'rollback\wallpaper.original.json'
        if (-not (Test-Path -LiteralPath $recordPath -PathType Leaf)) { throw "No original-wallpaper backup was found: $recordPath" }
        $record = Get-Content -LiteralPath $recordPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $original = [string]$record.File
        if ([string]::IsNullOrWhiteSpace($original) -or -not (Test-Path -LiteralPath $original -PathType Leaf)) { throw 'The original wallpaper file is missing. Its backup record has not been changed.' }
        Ensure-FmEngineRunning $engine.Exe
        Set-FmWallpaper -Executable $engine.Exe -File $original
        Write-Host 'Original wallpaper restored on monitor 0.'
        return
    }
    $installed = Install-FmProject -Source (Join-Path $PackageRoot 'project') -EngineRoot $engine.Root
    if ($InstallOnly) {
        Write-Host 'Install-only completed. The current wallpaper was not changed and Wallpaper Engine was not started.'
        return
    }
    Save-FmConfigSnapshot -PackageRoot $PackageRoot -EngineRoot $engine.Root
    Ensure-FmEngineRunning $engine.Exe
    Save-FmRollback -PackageRoot $PackageRoot -EngineRoot $engine.Root -Executable $engine.Exe
    Set-FmWallpaper -Executable $engine.Exe -File (Join-Path $installed 'project.json')
    Write-Host '叶力展070327 已应用到主屏幕。'
    Write-Host 'The original wallpaper can be restored with the restore launcher.'
}

# Dot-sourcing exposes testable functions without performing any installation.
if ($MyInvocation.InvocationName -ne '.') {
    $mutex = New-Object Threading.Mutex($false, 'Local\FlowerMemoriesWallpaperInstaller')
    $locked = $false
    try {
        try { $locked = $mutex.WaitOne(30000) } catch [Threading.AbandonedMutexException] { $locked = $true }
        if (-not $locked) { throw 'Another installer is running. Wait for it to finish.' }
        Invoke-FmMain -PackageRoot $PSScriptRoot -EnginePath $EnginePath -InstallOnly:$InstallOnly -Restore:$Restore
        exit 0
    } catch {
        Write-Error -Message $_.Exception.Message -ErrorAction Continue
        if ($_.Exception.Data.Contains('FmExitCode')) { exit [int]$_.Exception.Data['FmExitCode'] }
        exit 1
    } finally {
        if ($locked) { $mutex.ReleaseMutex() }
        $mutex.Dispose()
    }
}