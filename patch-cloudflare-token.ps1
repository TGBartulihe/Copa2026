$path = ".github/workflows/update-scores.yml"

$content = Get-Content $path -Raw -Encoding UTF8

$content = $content.Replace(
'run: node scripts/update-scores.js',
@'
env:
  CLOUDFLARE_ADMIN_TOKEN: ${{ secrets.CLOUDFLARE_ADMIN_TOKEN }}
run: node scripts/update-scores.js
'@
)

Set-Content $path $content -Encoding UTF8

Write-Host "Patch aplicado." -ForegroundColor Green