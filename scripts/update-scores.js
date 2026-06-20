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
  "Portugal":"Portugal 🇵🇹","DR Congo":"RD Congo 🇨🇩","Congo DR":"RD Congo 🇨🇩","DRC":"RD Congo 🇨🇩","Democratic Republic of the Congo":"RD Congo 🇨🇩","Congo":"RD Congo 🇨🇩","Uzbekistan":"Uzbequistão 🇺🇿","Colombia":"Colômbia 🇨🇴",
  "England":"Inglaterra 🏴󠁧󠁢󠁥󠁮󠁧󠁿","Croatia":"Croácia 🇭🇷","Ghana":"Gana 🇬🇭","Panama":"Panamá 🇵🇦",
};
function mapTeam(n){ return ESPN_MAP[n] || n; }

// ── API-FOOTBALL — só para escalações, com orçamento muito apertado ──────────
// Plano grátis = 100 chamadas/dia no TOTAL. O robô corre ~96x/dia (a cada 15min),
// por isso isto só pode gastar chamadas quando há jogo mesmo a decorrer, e cada
// escalação só é buscada UMA VEZ por jogo (fica em cache, nunca repete).
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY || "";
const AF_BASE = "https://v3.football.api-sports.io";
const MAX_AF_CALLS_PER_RUN = 4; // limite de segurança por execução
const LINEUPS_CACHE_FILE = "lineups-cache.json";
let afCallsUsed = 0;
let lineupsCache = {};

function loadLineupsCache(){
  try{ lineupsCache = JSON.parse(fs.readFileSync(LINEUPS_CACHE_FILE, "utf8")); }
  catch(e){ lineupsCache = {}; }
}
function saveLineupsCache(){
  try{ fs.writeFileSync(LINEUPS_CACHE_FILE, JSON.stringify(lineupsCache, null, 2)); }catch(e){}
}
async function afFetch(path){
  if (!API_FOOTBALL_KEY || afCallsUsed >= MAX_AF_CALLS_PER_RUN) return null;
  afCallsUsed++;
  try{
    const res = await fetch(`${AF_BASE}${path}`, { headers: { "x-apisports-key": API_FOOTBALL_KEY } });
    if (!res.ok) return null;
    return await res.json();
  }catch(e){ return null; }
}

let WC_LEAGUE_ID = null;
async function resolveWorldCupLeagueId(){
  if (WC_LEAGUE_ID) return WC_LEAGUE_ID;
  if (lineupsCache._leagueId){ WC_LEAGUE_ID = lineupsCache._leagueId; return WC_LEAGUE_ID; }
  const data = await afFetch(`/leagues?name=World%20Cup&season=2026`);
  if (!data?.response?.length) return null;
  const wc = data.response.find(l => /world cup/i.test(l.league?.name||"") && !/u-?20|u-?17|women|qualif/i.test(l.league?.name||""));
  if (!wc) return null;
  WC_LEAGUE_ID = wc.league.id;
  lineupsCache._leagueId = WC_LEAGUE_ID;
  return WC_LEAGUE_ID;
}
function parseAFLineup(side){
  if (!side) return null;
  const starters = (side.startXI||[]).map(p => ({ name: p.player?.name||"?", pos: p.player?.pos||"" }));
  if (!starters.length) return null;
  return {
    formation: side.formation || null,
    starters,
    subs: (side.substitutes||[]).map(p => ({ name: p.player?.name||"?", pos: p.player?.pos||"" })),
  };
}
// Aliases extra — nomes que a API-Football pode usar diferente da ESPN
const AF_EXTRA_ALIASES = { "IR Iran":"Irã 🇮🇷", "Korea Republic":"Coreia do Sul 🇰🇷", "Korea South":"Coreia do Sul 🇰🇷" };
function mapAF(n){ return AF_EXTRA_ALIASES[n] || mapTeam(n); }

// Busca escalações só dos jogos AO VIVO de hoje — nunca dos já encerrados/futuros,
// e nunca repete um jogo já guardado em cache.
async function fetchLineupsForLive(liveMatches){
  if (!API_FOOTBALL_KEY || !liveMatches.length) return {};
  loadLineupsCache();
  const todayAF = new Date().toISOString().slice(0,10);
  const results = {};

  // o que já está em cache não gasta chamada nenhuma
  const pending = liveMatches.filter(m => {
    const ck = `${m.home}|${m.away}|${todayAF}`;
    if (lineupsCache[ck]){ results[`${m.home}|${m.away}`] = lineupsCache[ck]; return false; }
    return true;
  });
  if (!pending.length) return results;

  const leagueId = await resolveWorldCupLeagueId();
  if (!leagueId) return results;

  const fxData = await afFetch(`/fixtures?league=${leagueId}&season=2026&date=${todayAF}`);
  if (!fxData?.response?.length){ saveLineupsCache(); return results; }

  for (const m of pending){
    if (afCallsUsed >= MAX_AF_CALLS_PER_RUN) break;
    const fx = fxData.response.find(f =>
      (mapAF(f.teams?.home?.name||"")===m.home && mapAF(f.teams?.away?.name||"")===m.away) ||
      (mapAF(f.teams?.away?.name||"")===m.home && mapAF(f.teams?.home?.name||"")===m.away)
    );
    if (!fx) continue;
    const luData = await afFetch(`/fixtures/lineups?fixture=${fx.fixture.id}`);
    if (!luData?.response?.length) continue;
    const parsed = { home: parseAFLineup(luData.response[0]), away: parseAFLineup(luData.response[1]) };
    if (!parsed.home && !parsed.away) continue;
    const ck = `${m.home}|${m.away}|${todayAF}`;
    results[`${m.home}|${m.away}`] = parsed;
    lineupsCache[ck] = parsed;
  }
  saveLineupsCache();
  return results;
}

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

// ── NOTIFICAÇÕES PUSH — avisa sobre jogos das seleções favoritas ────────────
// Funciona mesmo com a app fechada no telemóvel, via Web Push padrão.
// Sem custo, sem servidor próprio — só precisa das chaves VAPID nos secrets.
let webpush = null;
try { webpush = require("web-push"); }
catch(e) { console.warn("web-push não instalado — notificações desativadas nesta execução."); }

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";
const SUBS_FILE = "subscriptions.json";
const NOTIFIED_CACHE_FILE = "notified-cache.json";

// Edita esta lista manualmente se mudares as seleções favoritas no app
const FAVORITE_TEAMS = ["Brasil 🇧🇷", "Croácia 🇭🇷"];

if (webpush && VAPID_PUBLIC && VAPID_PRIVATE){
  webpush.setVapidDetails("mailto:copa2026tracker@example.com", VAPID_PUBLIC, VAPID_PRIVATE);
}

function loadJSON(file, fallback){
  try{ return JSON.parse(fs.readFileSync(file, "utf8")); }catch(e){ return fallback; }
}
function saveJSON(file, data){
  try{ fs.writeFileSync(file, JSON.stringify(data, null, 2)); }catch(e){}
}

async function sendPushToAll(subs, payload){
  if (!webpush) return subs;
  const body = JSON.stringify(payload);
  const stillValid = [];
  for (const sub of subs){
    try{
      await webpush.sendNotification(sub.subscription || sub, body);
      stillValid.push(sub);
      console.log(`📨 Notificação enviada: ${payload.title}`);
    }catch(e){
      // 404/410 = subscrição morta (utilizador desinstalou) — remove da lista
      if (e.statusCode === 404 || e.statusCode === 410){
        console.log("Subscrição expirada, a remover.");
      } else {
        stillValid.push(sub); // erro temporário — mantém para tentar depois
        console.warn("Falha a enviar push:", e.message);
      }
    }
  }
  return stillValid;
}

function isFavoriteMatch(m){
  return FAVORITE_TEAMS.includes(m.home) || FAVORITE_TEAMS.includes(m.away);
}

async function checkAndNotify(allMatches){
  if (!webpush || !VAPID_PUBLIC || !VAPID_PRIVATE){
    console.log("Notificações desligadas (sem chaves VAPID configuradas).");
    return;
  }
  let subs = loadJSON(SUBS_FILE, []);
  if (!Array.isArray(subs) || !subs.length){
    console.log("Nenhuma subscrição registada ainda — sem notificações a enviar.");
    return;
  }

  const cache = loadJSON(NOTIFIED_CACHE_FILE, {});
  const now = Date.now();
  let sentAny = false;

  for (const m of allMatches){
    if (!isFavoriteMatch(m)) continue;
    const matchKey = `${m.home}|${m.away}|${m.date}`;
    if (!cache[matchKey]) cache[matchKey] = { goals: [] };
    const entry = cache[matchKey];
    if (!Array.isArray(entry.goals)) entry.goals = [];

    // 1) Aviso de jogo perto de começar — janela larga porque o robô não
    // corre ao minuto exato (a cada ~15 min), por isso não há garantia de
    // ser exatamente "10 min antes", só "está mesmo a chegar a hora".
    if (!m.done && !m.live && m.iso && !entry.preNotified){
      const minsUntil = (new Date(m.iso).getTime() - now) / 60000;
      if (minsUntil > 0 && minsUntil <= 20){
        subs = await sendPushToAll(subs, {
          title: "🍿 Prepara a pipoca!",
          body: `${m.home} x ${m.away} começa em breve`,
          tag: matchKey,
        });
        entry.preNotified = true; sentAny = true;
      }
    }

    // 2) Gols novos do jogo ao vivo
    if (m.live && Array.isArray(m.events)){
      for (const ev of m.events){
        if (!ev.icon || !ev.icon.startsWith("⚽")) continue;
        const goalKey = `${ev.min}|${ev.txt}`;
        if (entry.goals.includes(goalKey)) continue;
        subs = await sendPushToAll(subs, {
          title: "⚽ GOOOL!",
          body: `${ev.txt} (${ev.min}') — ${m.home} ${m.sh}–${m.sa} ${m.away}`,
          tag: matchKey + "-goal",
        });
        entry.goals.push(goalKey); sentAny = true;
      }
    }

    // 3) Resultado final
    if (m.done && !entry.finalNotified){
      subs = await sendPushToAll(subs, {
        title: "🏁 Jogo terminado",
        body: `${m.home} ${m.sh}–${m.sa} ${m.away}`,
        tag: matchKey + "-final",
      });
      entry.finalNotified = true; sentAny = true;
    }
  }

  saveJSON(NOTIFIED_CACHE_FILE, cache);
  saveJSON(SUBS_FILE, subs); // grava sem as subscrições mortas, se alguma caiu
  if (sentAny) console.log("✅ Ciclo de notificações concluído.");
}

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

  // Escalações — só para jogos de grupo AO VIVO agora (mata-mata fica para depois)
  const liveNow = out.matches.filter(m => m.live).map(m => ({home:m.home, away:m.away}));
  if (liveNow.length){
    console.log(`Tentando escalações para ${liveNow.length} jogo(s) ao vivo...`);
    const lineupsByPair = await fetchLineupsForLive(liveNow);
    out.matches.forEach(m => {
      const l = lineupsByPair[`${m.home}|${m.away}`];
      if (l) m.lineups = l;
    });
    if (Object.keys(lineupsByPair).length) console.log(`✅ Escalações obtidas: ${Object.keys(lineupsByPair).length} (${afCallsUsed} chamada(s) à API-Football usada(s))`);
  }

  fs.writeFileSync("results.json", JSON.stringify(out, null, 2));
  console.log(`✅ results.json escrito com ${out.matches.length} jogos de grupo e ${knockout.length} de mata-mata.`);

  await checkAndNotify(out.matches);
}

main().catch(e => { console.error("Erro fatal:", e); process.exit(1); });

