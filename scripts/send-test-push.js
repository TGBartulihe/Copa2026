const webpush = require("web-push");

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;

webpush.setVapidDetails(
  "mailto:tbartulihe@gmail.com",
  VAPID_PUBLIC,
  VAPID_PRIVATE
);

// As 4 mensagens reais que o robô envia em produção — exatamente com o
// mesmo título/texto, só com dados de exemplo (Brasil x Croácia fictício)
const TEST_MESSAGES = [
  {
    label: "10 minutos antes",
    title: "🍿 Prepara a pipoca!",
    body: "Brasil 🇧🇷 x Croácia 🇭🇷 começa em 10 minutos",
  },
  {
    label: "5 minutos antes",
    title: "⏰ Já vai começar!",
    body: "Brasil 🇧🇷 x Croácia 🇭🇷 começa em 5 minutos",
  },
  {
    label: "Gol",
    title: "⚽ GOOOL!",
    body: "Vinícius Júnior (23') — Brasil 🇧🇷 1–0 Croácia 🇭🇷",
  },
  {
    label: "Fim de jogo",
    title: "🏁 Jogo terminado",
    body: "Brasil 🇧🇷 2–1 Croácia 🇭🇷",
  },
];

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const response = await fetch(
    "https://copa2026-api.tbartulihe.workers.dev/subscriptions",
    {
      headers: {
        "X-Admin-Token": process.env.CLOUDFLARE_ADMIN_TOKEN
      }
    }
  );

  if (!response.ok) {
    console.error(`❌ Falha ao buscar subscriptions: ${response.status} ${await response.text().catch(() => "")}`);
    process.exit(1);
  }

  const data = await response.json();
  const subs = data.subscriptions || [];

  console.log(`Subscriptions encontradas: ${subs.length}`);
  console.log("===");

  for (const msg of TEST_MESSAGES) {
    console.log(`\n--- Enviando: ${msg.label} ---`);
    let ok = 0, fail = 0;

    for (const [i, sub] of subs.entries()) {
      const target = sub.subscription || sub;
      try {
        await webpush.sendNotification(
          target,
          JSON.stringify({ title: msg.title, body: msg.body, tag: "test-" + msg.label })
        );
        console.log(`   #${i + 1} ✅ Enviado`);
        ok++;
      } catch (e) {
        console.error(`   #${i + 1} ❌ Falhou — status ${e.statusCode || "?"} — ${e.message}`);
        fail++;
      }
    }
    console.log(`   Resumo "${msg.label}": ${ok} ok, ${fail} falhou(aram)`);
    await sleep(3000); // 3s entre cada tipo, para distinguires no telemóvel
  }

  console.log("\n=== Teste completo — 4 mensagens enviadas a todas as subscrições ===");
}

main().catch(e => {
  console.error("❌ ERRO FATAL:", e.message);
  process.exit(1);
});
