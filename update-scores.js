// Copa 2026 Tracker — atualização automática de resultados
// Roda via GitHub Actions a cada ~15 minutos. Autor: Thiago Bartulihe
//
// Busca a scoreboard da ESPN para uma janela de dias (passado + futuro próximo),
// mapeia os nomes das seleções para o formato da app, busca eventos (gols/cartões)
// para jogos ao vivo ou encerrados, e escreve tudo em results.json na raiz do repo.

const fs = require("fs");

// ── MAPEAMENTO ESPN → nomes da app ───────────────────────────────────────────
const ESPN_MAP = {
  "Mexico":"México 🇲🇽","South Africa":"África do Sul 🇿🇦",
  "South Korea":"Coreia do Sul 🇰🇷","Czech Republic":"Rep. Tcheca 🇨🇿","Czechia":"Rep. Tcheca 🇨🇿",
  "Canada":"Canadá 🇨🇦","Bosnia and Herzegovina":"Bósnia 🇧🇦","Bosnia":"Bósnia 🇧🇦",
  "Qatar":"Qatar 🇶🇦","Switzerland":"Suíça 🇨🇭",
  "Brazil":"Brasil 🇧🇷","Morocco":"Marrocos 🇲🇦","Scotland":"Escócia 🏴󠁧󠁢󠁳󠁣󠁴󠁿","Haiti":"Haiti 🇭🇹",
  "United States":"EUA 🇺🇸","USA":"EUA 🇺🇸","Paraguay":"Paraguai 🇵🇾",
  "Australia":"Austrália 🇦🇺","Türkiye":"Turquia 🇹🇷","Turkey":"Turquia 🇹🇷",
  "Germany":"Alemanha 🇩🇪","Curacao":"Curaçao 🇨🇼","Curaçao":"Curaçao 🇨🇼",
  "Ivory Coast":"C. do Marfim 🇨🇮","Côte d'Ivoire":"C. do Marfim 🇨🇮","Cote d'Ivoire":"C. do Marfim 🇨🇮",
  "Ecuador":"Equador 🇪🇨","Netherlands":"Holanda 🇳🇱","Japan":"Japão 🇯🇵",
  "Sweden":"Suécia 🇸🇪","Tunisia":"Tunísia 🇹🇳",
  "Belgium":"Bélgica 🇧🇪","Egypt":"Egito 🇪🇬","Iran":"Irã 🇮🇷","New Zealand":"Nova Zelândia 🇳🇿",
  "Spain":"Espanha 🇪🇸","Cape Verde":"Cabo Verde 🇨🇻","Saudi Arabia":"Arábia Saudita 🇸🇦","Uruguay":"Uruguai 🇺🇾",
  "France":"França 🇫🇷","Senegal":"Senegal 🇸🇳","Iraq":"Iraque 🇮🇶","Norway":"Noruega 🇳🇴",
  "Argentina":"Argentina 🇦🇷","Algeria":"Argélia 🇩🇿","Austria":"Áustria 🇦🇹","Jordan":"Jordânia 🇯🇴",
  "Portugal":"Portugal 🇵🇹","DR Congo":"RD Congo 🇨🇩","Uzbekistan":"Uzbequistão 🇺🇿","Colombia":"Colômbia 🇨🇴",
  "England":"Inglaterra 🏴󠁧󠁢󠁥󠁮󠁧󠁿","Croatia":"Croácia 🇭🇷","Ghana":"Gana 🇬🇭","Panama":"Panamá 🇵🇦",
};
function mapTeam(n){ return ESPN_MAP[n] || n; }

// ── FILTRO DE EVENTOS RELEVANTES ──────────────────────────────────────────────
const SKIP_WORDS = ["delay","drink","half begins","kick off","kick-off","end of","period begins","weather","var check concluded","attendance","whistle"];
function isRelevantEvent(p){
  const txt = (p.text || p.shortText || "").toLowerCase();
  if (SKIP_WORDS.some(w => txt.includes(w))) return false;
  const typ = (p.type?.text || p.type?.id || "").toLowerCase();
  const hasIcon = typ.includes("goal") || typ.includes("card") || typ.includes("sub") || typ.includes("yellow") || typ.includes("red");
  const hasClock = p.clock?.displayValue && parseInt(p.clock.displayValue) > 0;
  return hasIcon || (hasClock && txt.length > 3);
}
function getIcon(p){
  const typ = (p.type?.text || p.type?.id || "").toLowerCase();
  const txt = (p.text || "").toLowerCase();
  if (typ.includes("goal") || txt.includes("goal")) return (typ.includes("own") || txt.includes("(og)")) ? "⚽ OG" : "⚽";
  if (typ.includes("yellow red") || typ.includes("second yellow")) return "🟥";
  if (typ.includes("yellow")) return "🟨";
  if (typ.includes("red")) return "🟥";
  if (typ.includes("sub")) return "🔄";
  if (typ.includes("penalty") || txt.includes("penalty")) return "⚽🎯";
  return null;
}

// ── DATAS ─────────────────────────────────────────────────────────────────────
function dateStr(daysOffset){
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysOffset);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,"0")}${String(d.getUTCDate()).padStart(2,"0")}`;
}
// Converte data/hora ISO (UTC) da ESPN para horário de Brasília (UTC-3 fixo)
function toBR(isoDate){
  const d = new Date(isoDate);
  const br = new Date(d.getTime() - 3*3600*1000);
  const p = n => String(n).padStart(2,"0");
  return { date: `${p(br.getUTCDate())}/${p(br.getUTCMonth()+1)}`, brTime: `${p(br.getUTCHours())}h` };
}

// ── BUSCA ESPN ────────────────────────────────────────────────────────────────
async function fetchScoreboard(ds){
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${ds}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("scoreboard " + ds + " -> " + res.status);
  return res.json();
}

async function fetchEvents(eventId){
  try{
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=${eventId}`);
    if (!res.ok) return [];
    const data = await res.json();
    const plays = [...(data.keyEvents||[]), ...(data.plays||[])];
    return plays
      .filter(isRelevantEvent)
      .map(p => {
        const icon = getIcon(p);
        if (!icon) return null;
        return { min: p.clock?.displayValue || "", icon, txt: p.text || p.shortText || "", sub: p.team?.displayName || "" };
      })
      .filter(Boolean)
      .reverse();
  }catch(e){ return []; }
}

// ── PRINCIPAL ─────────────────────────────────────────────────────────────────
// ── CLASSIFICAÇÃO DE FASE ─────────────────────────────────────────────────────
// Tenta primeiro ler o texto da própria ESPN (mais confiável); se não houver,
// cai para janelas de data (com base nas datas oficiais divulgadas da FIFA).
const ROUND_KEYWORDS = [
  { key: "final",   words: ["final", "3rd place", "third place"] },
  { key: "semis",   words: ["semifinal", "semi-final"] },
  { key: "quartas", words: ["quarterfinal", "quarter-final"] },
  { key: "oitavas", words: ["round of 16"] },
  { key: "avos",    words: ["round of 32"] },
];
function roundFromText(ev){
  const txt = [
    ev.competitions?.[0]?.notes?.map(n=>n.headline).join(" ") || "",
    ev.season?.slug || "", ev.competitions?.[0]?.type?.text || "",
  ].join(" ").toLowerCase();
  for (const r of ROUND_KEYWORDS) if (r.words.some(w => txt.includes(w))) return r.key;
  return null;
}
// Janelas de data como rede de segurança (UTC, com margem de folga)
function roundFromDate(isoDate){
  const d = new Date(isoDate).getTime();
  const w = (a,b) => d >= new Date(a).getTime() && d <= new Date(b).getTime();
  if (w("2026-06-27T00:00:00Z","2026-07-01T23:59:59Z")) return "avos";
  if (w("2026-07-02T00:00:00Z","2026-07-07T23:59:59Z")) return "oitavas";
  if (w("2026-07-08T00:00:00Z","2026-07-13T23:59:59Z")) return "quartas";
  if (w("2026-07-13T00:00:01Z","2026-07-16T23:59:59Z")) return "semis";
  if (w("2026-07-17T00:00:00Z","2026-07-19T23:59:59Z")) return "final";
  return null; // dentro da janela = fase de grupos
}
function classify(ev){ return roundFromText(ev) || roundFromDate(ev.date); }

async function main(){
  console.log("Buscando janela de jogos (-5 a +12 dias)...");
  const offsets = [];
  for (let o = -5; o <= 12; o++) offsets.push(o);

  const boards = await Promise.all(
    offsets.map(o => fetchScoreboard(dateStr(o)).catch(e => { console.warn(String(e)); return { events: [] }; }))
  );

  const matches = {};
  const knockout = [];

  for (const board of boards){
    for (const ev of (board.events || [])){
      const comp = ev.competitions?.[0];
      const h = comp?.competitors?.find(c => c.homeAway === "home");
      const a = comp?.competitors?.find(c => c.homeAway === "away");
      if (!h || !a) continue;

      const hName = mapTeam(h.team?.displayName || "");
      const aName = mapTeam(a.team?.displayName || "");
      const state = ev.status?.type?.state; // "pre" | "in" | "post"
      const sh = parseInt(h.score) || 0, sa = parseInt(a.score) || 0;
      const clock = ev.status?.displayClock || "";
      const venue = comp?.venue?.fullName || comp?.venue?.address?.city || "";
      const { date, brTime } = toBR(ev.date);

      let events = [];
      if (state === "in" || state === "post"){
        events = await fetchEvents(ev.id);
      }

      const entry = {
        home: hName, away: aName,
        date, brTime, venue, iso: ev.date,
        sh: (state === "in" || state === "post") ? sh : null,
        sa: (state === "in" || state === "post") ? sa : null,
        done: state === "post",
        live: state === "in",
        clock: state === "in" ? clock : "",
        events
      };

      const round = classify(ev);
      if (round){
        entry.round = round;
        knockout.push(entry);
      } else {
        matches[hName + "|" + aName] = entry;
      }
    }
  }

  const out = {
    generatedAt: new Date().toISOString(),
    matches: Object.values(matches),
    knockout
  };

  fs.writeFileSync("results.json", JSON.stringify(out, null, 2));
  console.log(`✅ results.json escrito com ${out.matches.length} jogos de grupo e ${knockout.length} de mata-mata.`);
}

main().catch(e => { console.error("Erro fatal:", e); process.exit(1); });
