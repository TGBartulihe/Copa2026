const fs = require("fs");
const webpush = require("web-push");

const subs = JSON.parse(fs.readFileSync("subscriptions.json", "utf8"));

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || "mailto:copa2026tracker@example.com",
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

async function main() {
  for (const sub of subs) {
    await webpush.sendNotification(
      sub.subscription || sub,
      JSON.stringify({
        title: "🍿 Teste Copa 2026",
        body: "Se chegou no bolso, está funcionando.",
        url: "./"
      })
    );
  }

  console.log("Teste de push enviado.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});