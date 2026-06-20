$path = ".github/workflows/update-scores.yml"

$content = Get-Content $path -Raw -Encoding UTF8

# Remove env duplicado quebrado
$content = $content -replace '(?ms)env:\s*`?\r?`?\n\s*CLOUDFLARE_ADMIN_TOKEN:\s*\$\{\{\s*secrets\.CLOUDFLARE_ADMIN_TOKEN\s*\}\}\s*`?\r?`?\nrun:\s*node scripts/update-scores\.js','run: node scripts/update-scores.js'

# Adiciona token dentro do env já existente
$content = $content -replace '(VAPID_PRIVATE_KEY:\s*\$\{\{\s*secrets\.VAPID_PRIVATE_KEY\s*\}\})','$1`r`n          CLOUDFLARE_ADMIN_TOKEN: ${{ secrets.CLOUDFLARE_ADMIN_TOKEN }}'

Set-Content $path $content -Encoding UTF8

Write-Host "Workflow corrigido." -ForegroundColor Green