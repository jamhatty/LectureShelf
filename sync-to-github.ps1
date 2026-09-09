$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host 'Staging changes...' -ForegroundColor Cyan
git add -A

$changes = git status --short
if (-not $changes) {
    Write-Host 'No changes to sync.' -ForegroundColor Yellow
    exit 0
}

Write-Host ''
Write-Host 'Changes to commit:' -ForegroundColor Cyan
Write-Host $changes
Write-Host ''

$confirmation = Read-Host 'Commit and push these changes? (y/n)'
if ($confirmation -notmatch '^(y|yes)$') {
    git reset
    Write-Host 'Sync cancelled.' -ForegroundColor Yellow
    exit 0
}

$message = "Update Lecture Shelf $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
git commit -m $message
git push origin main
Write-Host ''
Write-Host 'Sync complete. GitHub Pages will deploy the update shortly.' -ForegroundColor Green
Read-Host 'Press Enter to close'