const fs = require("fs");
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

  const data = await response.json();

  console.log(`Subscriptions encontradas: ${data.subscriptions.length}`);

  for (const sub of data.subscriptions) {
    try {
      await webpush.sendNotification(
        sub.subscription || sub,
        JSON.stringify({
          title: "🧪 Teste Copa 2026",
          body: "Se recebeste isto, o sistema está operacional.",
          tag: "manual-test"
        })
      );

      console.log("✅ Enviado");
    } catch (e) {
      console.error("❌ Erro:", e.message);
    }
  }
}

main();