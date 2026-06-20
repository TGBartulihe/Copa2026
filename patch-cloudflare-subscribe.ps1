$path = "index.html"

if (!(Test-Path $path)) {
  Write-Error "Arquivo não encontrado: $path"
  exit 1
}

$content = Get-Content $path -Raw -Encoding UTF8

# 1) Adiciona URL da API logo após a chave VAPID, se ainda não existir
if ($content -notmatch "COPA2026_API_URL") {
  $content = $content -replace '(const VAPID_PUBLIC_KEY\s*=\s*"[^"]+";\s*)', "`$1`r`nconst COPA2026_API_URL = `"https://copa2026-api.tbartulihe.workers.dev`";`r`n"
}

# 2) Injeta função para registrar subscription no Cloudflare
if ($content -notmatch "async function registerPushSubscription") {
  $helper = @'

async function registerPushSubscription(sub){
  const favoriteTeams = ["Brasil 🇧🇷", "Croácia 🇭🇷", "Portugal 🇵🇹"];

  const res = await fetch(`${COPA2026_API_URL}/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      favoriteTeams,
      subscription: sub.toJSON()
    })
  });

  if(!res.ok){
    const txt = await res.text().catch(() => "");
    throw new Error(`Falha ao registrar subscription: ${res.status} ${txt}`);
  }

  return await res.json();
}
'@

  $content = $content -replace '(async function checkPushStatus\(\)\{)', "$helper`r`n`$1"
}

# 3) Troca enablePush por versão automática
$old = @'
async function enablePush(){
  if(!("serviceWorker" in navigator)||!("PushManager" in window)){
    PUSH_STATUS="unsupported"; render(); return;
  }
  try{
    const perm=await Notification.requestPermission();
    if(perm!=="granted"){ PUSH_STATUS="denied"; render(); return; }
    const reg=await navigator.serviceWorker.ready;
    const sub=await reg.pushManager.subscribe({
      userVisibleOnly:true,
      applicationServerKey:urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    PUSH_SUB_JSON=JSON.stringify(sub.toJSON(),null,2);
    PUSH_STATUS="subscribed";
  }catch(e){
    alert("Erro ao ativar notificaÃ§Ãµes: "+e.message);
  }
  render();
}
'@

$new = @'
async function enablePush(){
  if(!("serviceWorker" in navigator)||!("PushManager" in window)){
    PUSH_STATUS="unsupported"; render(); return;
  }
  try{
    const perm=await Notification.requestPermission();
    if(perm!=="granted"){ PUSH_STATUS="denied"; render(); return; }

    const reg=await navigator.serviceWorker.ready;

    let sub=await reg.pushManager.getSubscription();

    if(!sub){
      sub=await reg.pushManager.subscribe({
        userVisibleOnly:true,
        applicationServerKey:urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    await registerPushSubscription(sub);

    PUSH_SUB_JSON=JSON.stringify(sub.toJSON(),null,2);
    PUSH_STATUS="subscribed";
    alert("Notificações ativadas com sucesso!");
  }catch(e){
    alert("Erro ao ativar notificações: "+e.message);
  }
  render();
}
'@

if ($content.Contains($old)) {
  $content = $content.Replace($old, $new)
} else {
  Write-Warning "Bloco enablePush exato não encontrado. Nenhuma troca feita nessa parte."
}

# 4) Atualiza mensagem do botão copiar para não orientar mais subscription manual
$content = $content.Replace(
  'alert("Copiado! Cola dentro do array em subscriptions.json no teu repositÃ³rio.");',
  'alert("Copiado. Agora o registro automático via Cloudflare já deve estar ativo.");'
)

Set-Content $path $content -Encoding UTF8

Write-Host "Patch aplicado em index.html" -ForegroundColor Green
Write-Host "Agora rode: git diff -- index.html"