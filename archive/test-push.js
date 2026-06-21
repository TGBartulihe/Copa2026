const fs = require("fs");
const webpush = require("web-push");

const subs = JSON.parse(fs.readFileSync("subscriptions.json", "utf8"));

console.log(`Subscriptions encontradas: ${subs.length}`);

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || "mailto:thiago.bartulihe@gmail.com",
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

async function main() {
  for (const [i, sub] of subs.entries()) {
    const target = sub.subscription || sub;

    console.log(`Enviando para subscription #${i + 1}`);
    console.log(`Endpoint: ${target.endpoint?.slice(0, 80)}...`);

    const result = await webpush.sendNotification(
      target,
      JSON.stringify({
        title: "🍿 Teste Copa 2026",
        body: "Perla, Esse Push enviado pelo TicoBartu em teste.",
        url: "/Copa2026/"
      })
    );

    console.log(`Status code: ${result.statusCode}`);
    console.log(`Headers: ${JSON.stringify(result.headers)}`);
  }

  console.log("Fim do teste.");
}

main().catch(err => {
  console.error("ERRO NO PUSH:");
  console.error(err.statusCode);
  console.error(err.body);
  console.error(err.message);
  process.exit(1);
});