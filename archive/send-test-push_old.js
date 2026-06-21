const webpush = require("web-push");

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;

webpush.setVapidDetails(
  "mailto:tbartulihe@gmail.com",
  VAPID_PUBLIC,
  VAPID_PRIVATE
);

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
  console.log("---");

  let ok = 0, fail = 0;

  for (const [i, sub] of subs.entries()) {
    const target = sub.subscription || sub;
    const endpointShort = (target.endpoint || "?").slice(-24);
    const favs = (sub.favoriteTeams || []).join(",") || "(sem favoriteTeams)";
    const created = sub.createdAt || "(sem data)";

    console.log(`#${i + 1} — criada: ${created} — favoritas: ${favs} — endpoint: ...${endpointShort}`);

    try {
      await webpush.sendNotification(
        target,
        JSON.stringify({
          title: "🧪 Teste Copa 2026",
          body: "Se recebeste isto, o sistema está operacional.",
          tag: "manual-test"
        })
      );
      console.log(`   ✅ Enviado com sucesso`);
      ok++;
    } catch (e) {
      console.error(`   ❌ Falhou — status ${e.statusCode || "?"} — ${e.message}`);
      if (e.statusCode === 404 || e.statusCode === 410) {
        console.error(`   ⚠️ Esta subscrição está MORTA (endpoint inválido) — a pessoa precisa de reativar notificações na app.`);
      }
      fail++;
    }
  }

  console.log("---");
  console.log(`Resumo: ${ok} enviado(s) com sucesso, ${fail} falhou(aram).`);
}

main().catch(e => {
  console.error("❌ ERRO FATAL:", e.message);
  process.exit(1);
});
