$path = "scripts/update-scores.js"

if (!(Test-Path $path)) {
  Write-Error "Arquivo não encontrado: $path"
  exit 1
}

$content = Get-Content $path -Raw -Encoding UTF8

$content = $content.Replace(
'const FAVORITE_TEAMS = ["Brasil 🇧🇷", "Croácia 🇭🇷"];',
'const FAVORITE_TEAMS = ["Brasil 🇧🇷", "Croácia 🇭🇷", "Portugal 🇵🇹"];'
)

$content = $content.Replace(
'await webpush.sendNotification(sub, body);',
'await webpush.sendNotification(sub.subscription || sub, body);'
)

$content = $content.Replace(
'body: `${m.home} x ${m.away} começa em breve`,',
'body: `${m.home} x ${m.away} começa em cerca de 15 minutos! 🍿`,'
)

$content = $content.Replace(
'title: "🏁 Jogo terminado",
        body: `${m.home} ${m.sh}–${m.sa} ${m.away}`,',
'title: "🏁 Jogo encerrado",
        body: `${m.home} x ${m.away} terminou: ${m.sh}–${m.sa}`,'
)

$content = $content.Replace(
'body: `${ev.txt} (${ev.min}'') — ${m.home} ${m.sh}–${m.sa} ${m.away}`,',
'body: `${ev.txt} — ${m.home} ${m.sh}–${m.sa} ${m.away}`,'
)

Set-Content $path $content -Encoding UTF8

$workflow = ".github/workflows/update-scores.yml"

if (Test-Path $workflow) {
  $yaml = Get-Content $workflow -Raw -Encoding UTF8
  $yaml = $yaml.Replace("*/15 * * * *", "*/5 * * * *")
  Set-Content $workflow $yaml -Encoding UTF8
}

node --check $path

Write-Host "Patch aplicado com sucesso." -ForegroundColor Green
Write-Host "Agora rode:"
Write-Host "git diff"
Write-Host "git add ."
Write-Host "git commit -m `"Melhora notificacoes push da Copa`""
Write-Host "git push"