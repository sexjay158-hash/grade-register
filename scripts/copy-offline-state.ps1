param([Parameter(Mandatory=$true)][string]$Source, [Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
# Windows sharing locks are held for ALL source files until copying finishes.
# An open SQLite/WAL file makes this fail before any snapshot is published.
$handles = [Collections.Generic.List[IO.FileStream]]::new()
try {
    if ((Get-Item -LiteralPath $Source -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'State links are not supported.' }
    $files = @(Get-ChildItem -LiteralPath $Source -Recurse -Force -File | Sort-Object FullName)
    if (!$files.Count) { throw 'State directory is empty.' }
    if (@(Get-ChildItem -LiteralPath $Source -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count) { throw 'State links are not supported.' }
    foreach ($file in $files) {
        $handles.Add([IO.File]::Open($file.FullName, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::None))
    }
    for ($i=0; $i -lt $files.Count; $i++) {
        $relative = $files[$i].FullName.Substring($Source.TrimEnd('\').Length + 1)
        $target = Join-Path $Destination $relative
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
        $output = [IO.File]::Open($target, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        try { $handles[$i].CopyTo($output); $output.Flush($true) } finally { $output.Dispose() }
    }
    $after = @(Get-ChildItem -LiteralPath $Source -Recurse -Force -File | Sort-Object FullName)
    if (($files.FullName -join "`n") -cne ($after.FullName -join "`n")) { throw 'State changed during backup.' }
} finally {
    foreach ($handle in $handles) { $handle.Dispose() }
}
