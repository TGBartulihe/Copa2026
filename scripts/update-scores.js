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
  "Canada":"Canadá 🇨🇦","Bosnia and Herzegovina":"Bósnia 🇧🇦","Bosnia":"Bósnia 🇧🇦","Bosnia-Herzegovina":"Bósnia 🇧🇦",
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
// Extrai só a bandeira do nome canónico (ex: "Alemanha 🇩🇪" → "🇩🇪") —
// mais compacto que mostrar o nome completo da seleção no evento
function teamFlag(name){
  const m=(name||"").match(/\p{Regional_Indicator}{2}/u);
  return m?m[0]:"🏳️";
}

// ── FILTRO DE EVENTOS RELEVANTES ──────────────────────────────────────────────
// Filtra só ruído puramente administrativo — tudo o resto fica, conforme
// pedido: cobertura completa de eventos até ao fim da partida.
// Confirmado por teste real — a ESPN não regista cantos/faltas/remates nos
// "key events" para este tipo de jogo. O que tem: kickoff, intervalo,
// paralisações (lesão, pausa para bebida), gols, substituições. Mostra tudo.
const SKIP_WORDS = ["weather","attendance","var check concluded"];
function isRelevantEvent(p){
  const txt = (p.text || p.shortText || "").toLowerCase();
  if (SKIP_WORDS.some(w => txt.includes(w))) return false;
  return true; // deixa passar tudo, incluindo marcadores sem texto (kickoff/intervalo)
}
function getIcon(p){
  const typ = (p.type?.text || p.type?.id || "").toLowerCase();
  const txt = (p.text || "").toLowerCase();
  if (typ.includes("goal")) return (typ.includes("own") || txt.includes("(og)")) ? "⚽ OG" : "⚽";
  if (typ.includes("yellow red") || typ.includes("second yellow")) return "🟥";
  if (typ.includes("yellow")) return "🟨";
  if (typ.includes("red")) return "🟥";
  if (typ.includes("sub")) return "🔄";
  if (typ.includes("penalty")) return "⚽🎯";
  if (typ.includes("start delay")) return txt.includes("injury") ? "🩹" : "⏸️";
  if (typ.includes("end delay")) return "▶️";
  if (typ.includes("halftime")) return "⏱️";
  if (typ.includes("start 2nd half")) return "▶️";
  if (typ.includes("kickoff")) return "🏁";
  if (typ.includes("corner")) return "🚩";
  if (typ.includes("offside")) return "🚫";
  if (typ.includes("foul")) return "⚠️";
  if (typ.includes("var")) return "📺";
  if (typ.includes("injury")) return "🩹";
  if (typ.includes("free kick")) return "🥅";
  if (typ.includes("save")||txt.includes("saved")) return "🧤";
  if (typ.includes("block")||txt.includes("blocked")) return "🛡️";
  if (typ.includes("shot")||txt.includes("shot")||txt.includes("attempt")) return "🎯";
  return "•"; // qualquer evento não categorizado ainda aparece, com marcador genérico
}

// Constrói a frase em português a partir das peças estruturadas (tipo de
// evento + jogador + equipa) — não traduz a prosa em inglês da ESPN, que
// não é fiável traduzir automaticamente; em vez disso, monta a frase do
// zero, sempre correta em português.
function describeEventPT(icon, playerName, assistName){
  const p = playerName || "jogador";
  const a = assistName ? ` (assistência de ${assistName})` : "";
  if (icon === "⚽")     return `Gol de ${p}${a}`;
  if (icon === "⚽ OG")  return `Gol contra de ${p}`;
  if (icon === "⚽🎯")   return `Pênalti convertido por ${p}`;
  if (icon === "🟨")     return `Cartão amarelo para ${p}`;
  if (icon === "🟥")     return `Cartão vermelho para ${p}`;
  if (icon === "🔄")     return `Substituição — entra ${p}`;
  if (icon === "🚩")     return `Escanteio`;
  if (icon === "🚫")     return `Fora de jogo — ${p}`;
  if (icon === "⚠️")     return `Falta de ${p}`;
  if (icon === "📺")     return `Revisão do VAR`;
  if (icon === "🩹")     return playerName ? `Paralisação por lesão — ${p}` : "Paralisação por lesão";
  if (icon === "⏸️")     return "Jogo paralisado";
  if (icon === "▶️")     return "Jogo reiniciado";
  if (icon === "⏱️")     return "Intervalo";
  if (icon === "🏁")     return "Início de jogo";
  if (icon === "🥅")     return `Pontapé livre — ${p}`;
  if (icon === "🧤")     return `Defesa do goleiro`;
  if (icon === "🛡️")     return `Finalização bloqueada`;
  if (icon === "🎯")     return `Finalização de ${p}`;
  return p;
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

// ── TRADUÇÃO — preserva o contexto real da ESPN em vez de simplificar ───────
// Usa o endpoint não-oficial do Google Translate (o mesmo que muitas
// ferramentas open-source usam) — sem registo, sem chave, sem cartão.
// Risco aceite: não é uma API suportada oficialmente, pode mudar sem aviso.
// Cada frase só é traduzida UMA VEZ (fica em cache).
const TRANSLATE_CACHE_FILE = "translate-cache.json";
let translateCache = {};
function loadTranslateCache(){ translateCache = loadJSON(TRANSLATE_CACHE_FILE, {}); }
function saveTranslateCache(){ saveJSON(TRANSLATE_CACHE_FILE, translateCache); }

// A resposta vem como array aninhado: [[["traduzido","original",...], ...], ...]
// Pode vir em vários segmentos se o texto for longo — junta todos.
function parseGoogleTranslateResponse(data){
  if (!Array.isArray(data) || !Array.isArray(data[0])) return null;
  const joined = data[0].map(seg => seg?.[0] || "").join("");
  return joined || null;
}

async function translateToPT(text){
  if (!text) return null;
  if (translateCache[text]) return translateCache[text];
  try{
    const params = new URLSearchParams({
      client: "gtx", sl: "en", tl: "pt-BR", dt: "t", q: text,
    });
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    const translated = parseGoogleTranslateResponse(data);
    if (translated) translateCache[text] = translated;
    return translated;
  }catch(e){ return null; }
}

// Agrupa por linha no campo, usando a posição real da ESPN — mais fiável do
// que tentar adivinhar a formação a partir de um número de jogadores
function positionRow(abbr){
  const a = (abbr||"").toUpperCase();
  if (a === "G" || a === "GK") return 0; // goleiro
  if (a === "D" || a.startsWith("CD") || a==="LB" || a==="RB" || a.startsWith("WB") || a.includes("CB")) return 1; // defesa
  if (a === "M" || a.startsWith("DM") || a.startsWith("CM") || a.startsWith("LM") || a.startsWith("RM")) return 2; // meio-campo
  if (a.startsWith("AM")) return 2.5; // meio-ofensivo
  return 3; // ataque (F, FW, etc) — também o padrão se não reconhecer
}

// Se a cor principal da seleção for muito clara (ex: branco), o bonequinho
// fica invisível no campo — usa a cor alternativa nesse caso
function colorLuminance(hex){
  if (!hex || hex.length < 6) return 999;
  const r = parseInt(hex.slice(0,2),16), g = parseInt(hex.slice(2,4),16), b = parseInt(hex.slice(4,6),16);
  if (isNaN(r)||isNaN(g)||isNaN(b)) return 999;
  return 0.299*r + 0.587*g + 0.114*b;
}
function pickVisibleColor(color, alternateColor){
  if (color && colorLuminance(color) < 200) return "#"+color;
  if (alternateColor) return "#"+alternateColor;
  return color ? "#"+color : null;
}

function parseESPNRosterSide(side){
  if (!side?.roster?.length) return null;
  const toPlayer = p => ({
    name: p.athlete?.displayName || p.athlete?.shortName || "?",
    pos: p.position?.abbreviation || "",
    row: positionRow(p.position?.abbreviation),
  });
  const starters = side.roster.filter(p => p.starter).map(toPlayer).sort((a,b)=>a.row-b.row);
  const subs = side.roster.filter(p => !p.starter).map(toPlayer);
  if (!starters.length) return null;
  const dotColor = pickVisibleColor(side.team?.color, side.team?.alternateColor);
  return { starters, subs, formation: side.formation || null, dotColor };
}

function extractESPNLineups(data){
  const rosters = data.rosters;
  if (!Array.isArray(rosters) || rosters.length < 2) return null;
  const home = parseESPNRosterSide(rosters.find(r => r.homeAway === "home"));
  const away = parseESPNRosterSide(rosters.find(r => r.homeAway === "away"));
  if (!home && !away) return null;
  return { home, away };
}

// Estatísticas de equipa — confirmado em data.boxscore.teams[].statistics,
// mesmo pedido que já fazemos, sem custo extra. Reduz cada lado a um
// dicionário simples {nomeDaEstatística: valorParaMostrar}.
function extractBoxscoreStats(data){
  const teams = data.boxscore?.teams;
  if (!Array.isArray(teams) || teams.length < 2) return null;
  function parseSide(t){
    if (!Array.isArray(t?.statistics)) return null;
    const stats = {};
    t.statistics.forEach(s => { stats[s.name] = s.displayValue; });
    return stats;
  }
  const home = parseSide(teams.find(t => t.homeAway === "home"));
  const away = parseSide(teams.find(t => t.homeAway === "away"));
  if (!home && !away) return null;
  return { home, away };
}

// O tradutor não conhece jargão de futebol — traduz à letra termos que têm
// nome próprio no desporto ("corner"→"canto" em vez de "escanteio", etc).
// Corrige isto depois da tradução, sem precisar de saber à frente quais
// frases vão ter este problema.
function fixFootballTermsPT(text){
  if (!text) return text;
  return text
    .replace(/\bmeta\b/gi, "Gol")
    .replace(/\bcantos?\b/gi, m => m.toLowerCase()==="canto" ? "Escanteio" : "Escanteios")
    .replace(/\bfora de lugar\b/gi, "Impedimento")
    .replace(/\bsalv(ar|a|ou)\b/gi, "Defesa")
    .replace(/\b(pontapé|chute) livre\b/gi, "Falta");
}

async function fetchMatchDetails(eventId){
  try{
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=${eventId}`);
    if (!res.ok) return { events: [], lineups: null, stats: null };
    const data = await res.json();
    const plays = [...(data.keyEvents||[]), ...(data.plays||[])];
    const relevant = plays.filter(isRelevantEvent);
    const lineups = extractESPNLineups(data); // mesmo pedido, sem custo extra
    const stats = extractBoxscoreStats(data); // idem

    const results = [];
    for (const p of relevant){
      const icon = getIcon(p);
      if (!icon) continue;
      const playerName = p.participants?.[0]?.athlete?.displayName;
      const assistName = p.participants?.[1]?.athlete?.displayName; // se a ESPN tiver isto separado
      const teamName = teamFlag(mapTeam(p.team?.displayName || ""));
      let original = p.text || p.shortText || "";

      // A ESPN começa o texto de gol com "Goal! Time A N, Time B M. " — isto é
      // redundante (já mostramos o placar à parte) E ambíguo para traduzir
      // ("goal" pode sair como "meta" em vez de "gol"). Tira essa parte antes.
      const isGoalIcon = icon === "⚽" || icon === "⚽ OG" || icon === "⚽🎯";
      if (isGoalIcon){
        original = original.replace(/^goal!?\s*[^.]*\.\s*/i, "");
      }

      // Substituição: "Substitution, Germany. Player A replaces Player B." —
      // tira o nome da seleção (arriscado prever como sai traduzido) e
      // reconstrói a frase nós mesmos com a bandeira no lugar certo.
      const isSubIcon = icon === "🔄";
      if (isSubIcon){
        original = original.replace(/^substitution,?\s*[^.]*\.\s*/i, "");
      }

      // Tenta a tradução real (preserva contexto: tipo de remate, assistência...).
      // Se falhar (sem chave, API em baixo, sem internet), cai no template
      // simples — nunca mostra a frase em inglês.
      let txt = await translateToPT(original);
      if (txt){
        txt = fixFootballTermsPT(txt);
        if (isSubIcon) txt = `Substituição, ${teamName}. ${txt}`;
      } else {
        txt = describeEventPT(icon, playerName, assistName); // já tem a frase própria, sem bandeira
      }

      results.push({ min: p.clock?.displayValue || "", icon, txt, sub: teamName });
    }
    return { events: results.reverse(), lineups, stats };
  }catch(e){ return { events: [], lineups: null, stats: null }; }
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

// Composição fixa dos grupos — confirmada, não depende de adivinhar texto
// nenhum da ESPN. Usada como regra definitiva: duas seleções do mesmo
// grupo NUNCA se enfrentam no mata-mata antes dos quartos de final, por
// regra do torneio. Se baterem aqui, é garantidamente fase de grupos,
// seja o que for que o texto ou a data da ESPN sugiram.
const GROUP_TEAMS = {
  A:["México 🇲🇽","África do Sul 🇿🇦","Coreia do Sul 🇰🇷","Rep. Tcheca 🇨🇿"],
  B:["Canadá 🇨🇦","Bósnia 🇧🇦","Suíça 🇨🇭","Qatar 🇶🇦"],
  C:["Brasil 🇧🇷","Marrocos 🇲🇦","Escócia 🏴","Haiti 🇭🇹"],
  D:["EUA 🇺🇸","Paraguai 🇵🇾","Austrália 🇦🇺","Turquia 🇹🇷"],
  E:["Alemanha 🇩🇪","C. do Marfim 🇨🇮","Equador 🇪🇨","Curaçao 🇨🇼"],
  F:["Holanda 🇳🇱","Japão 🇯🇵","Suécia 🇸🇪","Tunísia 🇹🇳"],
  G:["Bélgica 🇧🇪","Egito 🇪🇬","Irã 🇮🇷","Nova Zelândia 🇳🇿"],
  H:["Espanha 🇪🇸","Cabo Verde 🇨🇻","Arábia Saudita 🇸🇦","Uruguai 🇺🇾"],
  I:["França 🇫🇷","Senegal 🇸🇳","Iraque 🇮🇶","Noruega 🇳🇴"],
  J:["Argentina 🇦🇷","Argélia 🇩🇿","Áustria 🇦🇹","Jordânia 🇯🇴"],
  K:["Portugal 🇵🇹","RD Congo 🇨🇩","Uzbequistão 🇺🇿","Colômbia 🇨🇴"],
  L:["Inglaterra 🏴","Croácia 🇭🇷","Gana 🇬🇭","Panamá 🇵🇦"],
};
function tkeySimple(s){ return (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9]/g,"").toLowerCase(); }
function sameGroup(home, away){
  const h=tkeySimple(home), a=tkeySimple(away);
  return Object.values(GROUP_TEAMS).some(teams=>{
    const inGroup = t => teams.some(g => tkeySimple(g)===t);
    return inGroup(h) && inGroup(a);
  });
}
function roundFromText(ev){
  const txt = [
    ev.competitions?.[0]?.notes?.map(n=>n.headline).join(" ") || "",
    ev.season?.slug || "", ev.competitions?.[0]?.type?.text || "",
  ].join(" ").toLowerCase();
  // Sinal explícito de fase de grupos — tem de vir ANTES do palpite por
  // data, porque a 3ª rodada de grupos e os avos podem cair na mesma
  // janela de datas (UTC vs horário de Brasília), e sem isto o palpite
  // por data classifica jogos de grupo como mata-mata por engano.
  if (txt.includes("group stage")) return "grupos";
  for (const r of ROUND_KEYWORDS) if (r.words.some(w => txt.includes(w))) return r.key;
  return null;
}
// Janelas de data como rede de segurança (UTC, com margem de folga)
function roundFromDate(isoDate){
  const d = new Date(isoDate).getTime();
  const w = (a,b) => d >= new Date(a).getTime() && d <= new Date(b).getTime();
  // Janela alargada com margem de segurança — confirmado com dados reais
  // que os avos vão até 04/07 (UTC), não 01/07 como estava antes. Isso
  // fazia 7 dos 16 confrontos reais caírem por engano em "oitavas".
  if (w("2026-06-27T00:00:00Z","2026-07-04T23:59:59Z")) return "avos";
  if (w("2026-07-05T00:00:00Z","2026-07-09T23:59:59Z")) return "oitavas";
  if (w("2026-07-10T00:00:00Z","2026-07-14T23:59:59Z")) return "quartas";
  if (w("2026-07-15T00:00:00Z","2026-07-16T23:59:59Z")) return "semis";
  if (w("2026-07-17T00:00:00Z","2026-07-19T23:59:59Z")) return "final";
  return null; // dentro da janela = fase de grupos
}
function classify(ev){
  const fromText = roundFromText(ev);
  if (fromText === "grupos") return null; // confirmado pela ESPN — nunca cai no palpite por data
  return fromText || roundFromDate(ev.date);
}

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
const CLOUDFLARE_API_URL = "https://copa2026-api.tbartulihe.workers.dev";
const CLOUDFLARE_ADMIN_TOKEN = process.env.CLOUDFLARE_ADMIN_TOKEN || "";

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

async function loadSubscriptions(){
  if (!CLOUDFLARE_ADMIN_TOKEN) {
    console.log("CLOUDFLARE_ADMIN_TOKEN não configurado — usando subscriptions.json como fallback.");
    return loadJSON(SUBS_FILE, []);
  }

  try {
    const res = await fetch(`${CLOUDFLARE_API_URL}/subscriptions`, {
      headers: { "X-Admin-Token": CLOUDFLARE_ADMIN_TOKEN }
    });

    if (!res.ok) {
      console.warn(`Falha ao buscar subscriptions no Cloudflare: ${res.status}`);
      return loadJSON(SUBS_FILE, []);
    }

    const data = await res.json();

    if (!data.ok || !Array.isArray(data.subscriptions)) {
      console.warn("Resposta inválida do Cloudflare — usando subscriptions.json como fallback.");
      return loadJSON(SUBS_FILE, []);
    }

    console.log(`Subscriptions carregadas do Cloudflare: ${data.subscriptions.length}`);
    return data.subscriptions;
  } catch (e) {
    console.warn("Erro ao buscar subscriptions no Cloudflare:", e.message);
    return loadJSON(SUBS_FILE, []);
  }
}

async function sendPushToSubs(subs, payload){
  if (!webpush) return [];
  const body = JSON.stringify(payload);
  const deadEndpoints = [];
  for (const sub of subs){
    const target = sub.subscription || sub;
    try{
      await webpush.sendNotification(target, body);
      console.log(`📨 Notificação enviada: ${payload.title}`);
    }catch(e){
      // 404/410 = subscrição morta (utilizador desinstalou)
      if (e.statusCode === 404 || e.statusCode === 410){
        if (target.endpoint) deadEndpoints.push(target.endpoint);
        console.log("Subscrição expirada, marcada para remoção.");
      } else {
        console.warn("Falha a enviar push:", e.message);
      }
    }
  }
  return deadEndpoints;
}

// Códigos de 3 letras — mesmo dicionário do index.html, usado para comparar
// com favoriteTeams (que chega do telemóvel já como códigos, ex: "BRA")
const TEAM_CODE={
  "México 🇲🇽":"MEX","Coreia do Sul 🇰🇷":"KOR","Rep. Tcheca 🇨🇿":"CZE","África do Sul 🇿🇦":"RSA",
  "Canadá 🇨🇦":"CAN","Bósnia 🇧🇦":"BIH","Qatar 🇶🇦":"QAT","Suíça 🇨🇭":"SUI",
  "Brasil 🇧🇷":"BRA","Marrocos 🇲🇦":"MAR","Escócia 🏴󠁧󠁢󠁳󠁣󠁴󠁿":"SCO","Haiti 🇭🇹":"HAI",
  "EUA 🇺🇸":"USA","Austrália 🇦🇺":"AUS","Turquia 🇹🇷":"TUR","Paraguai 🇵🇾":"PAR",
  "Alemanha 🇩🇪":"GER","C. do Marfim 🇨🇮":"CIV","Equador 🇪🇨":"ECU","Curaçao 🇨🇼":"CUW",
  "Suécia 🇸🇪":"SWE","Holanda 🇳🇱":"NED","Japão 🇯🇵":"JPN","Tunísia 🇹🇳":"TUN",
  "Bélgica 🇧🇪":"BEL","Irã 🇮🇷":"IRN","Egito 🇪🇬":"EGY","Nova Zelândia 🇳🇿":"NZL",
  "Espanha 🇪🇸":"ESP","Cabo Verde 🇨🇻":"CPV","Arábia Saudita 🇸🇦":"KSA","Uruguai 🇺🇾":"URU",
  "França 🇫🇷":"FRA","Noruega 🇳🇴":"NOR","Senegal 🇸🇳":"SEN","Iraque 🇮🇶":"IRQ",
  "Argentina 🇦🇷":"ARG","Áustria 🇦🇹":"AUT","Argélia 🇩🇿":"ALG","Jordânia 🇯🇴":"JOR",
  "Portugal 🇵🇹":"POR","Colômbia 🇨🇴":"COL","RD Congo 🇨🇩":"COD","Uzbequistão 🇺🇿":"UZB",
  "Inglaterra 🏴󠁧󠁢󠁥󠁮󠁧󠁿":"ENG","Croácia 🇭🇷":"CRO","Gana 🇬🇭":"GHA","Panamá 🇵🇦":"PAN",
};
function teamCode(name){ return TEAM_CODE[name]||(name||"").replace(/[^A-Za-zÀ-ú]/g,"").slice(0,3).toUpperCase(); }

function isFavoriteMatch(m){
  return FAVORITE_TEAMS.includes(m.home) || FAVORITE_TEAMS.includes(m.away);
}

// Decide se ESTA subscrição em particular quer ser avisada deste jogo —
// usa as favoriteTeams próprias dela; só recorre à lista global antiga
// se, por algum motivo, a subscrição não tiver favoriteTeams guardadas.
function matchesSubscription(m, sub){
  const favs = sub.favoriteTeams;
  if (!Array.isArray(favs) || !favs.length) return isFavoriteMatch(m);
  const homeCode = teamCode(m.home), awayCode = teamCode(m.away);
  return favs.includes(homeCode) || favs.includes(awayCode);
}

// Cache local — o Cloudflare KV tem limite de só 1.000 chamadas "list" por
// dia, e o robô agora corre ~1440x/dia. Sem isto, só esta chamada já
// passava do limite. Só busca de verdade nas execuções "completas"
// (~100x/dia), e usa o que já tinha guardado nas execuções rápidas.
const SUBS_CACHE_FILE = "subscriptions-cache.json";
async function loadSubscriptionsCached(forceFresh){
  const cached = loadJSON(SUBS_CACHE_FILE, null);
  if (!forceFresh && cached && Array.isArray(cached.subs)) return cached.subs;

  const subs = await loadSubscriptions();
  // Se a busca fresca falhar ou vier vazia (ex: Cloudflare em baixo, limite
  // esgotado), e já tínhamos uma cache válida com gente lá, é melhor
  // reaproveitar essa do que assumir que ninguém está inscrito
  if ((!subs || !subs.length) && cached?.subs?.length){
    console.log("Busca fresca de subscrições falhou ou veio vazia — reaproveitando cache anterior.");
    return cached.subs;
  }
  saveJSON(SUBS_CACHE_FILE, { subs, fetchedAt: new Date().toISOString() });
  return subs;
}

async function checkAndNotify(allMatches, doFull){
  if (!webpush || !VAPID_PUBLIC || !VAPID_PRIVATE){
    console.log("Notificações desligadas (sem chaves VAPID configuradas).");
    return;
  }
  const subs = await loadSubscriptionsCached(doFull);
  if (!Array.isArray(subs) || !subs.length){
    console.log("Nenhuma subscrição registada ainda — sem notificações a enviar.");
    return;
  }

  const cache = loadJSON(NOTIFIED_CACHE_FILE, {});
  const now = Date.now();
  let sentAny = false;
  const deadEndpointsAll = new Set();

  // Só processa jogos que interessem a pelo menos uma subscrição
  const relevant = allMatches.filter(m => subs.some(s => matchesSubscription(m, s)));

  for (const m of relevant){
    const matchKey = `${m.home}|${m.away}|${m.date}`;
    if (!cache[matchKey]) cache[matchKey] = { goals: [] };
    const entry = cache[matchKey];
    if (!Array.isArray(entry.goals)) entry.goals = [];

    // Só estas subscrições é que pediram para seguir este jogo em concreto
    const targetSubs = subs.filter(s => matchesSubscription(m, s));
    if (!targetSubs.length) continue;

    // 1) Avisos de jogo perto de começar — agora que o robô corre a cada
    // minuto, conseguimos dois avisos com precisão real (10 e 5 min antes),
    // em vez da janela larga única de antes.
    // Janelas alargadas (em vez de uma faixa estreita) — se uma execução
    // atrasar por qualquer motivo (fila de execuções sobrepostas, falha de
    // rede pontual), continua a apanhar a notificação na próxima vez que
    // correr, em vez de perder a janela e nunca mais avisar.
    if (!m.done && !m.live && m.iso){
      const minsUntil = (new Date(m.iso).getTime() - now) / 60000;

      if (!entry.notified10 && minsUntil > 0 && minsUntil <= 10){
        const dead = await sendPushToSubs(targetSubs, {
          title: "🍿 Prepara a pipoca!",
          body: `${m.home} x ${m.away} começa em ${Math.round(minsUntil)} minutos`,
          tag: matchKey + "-10min",
        });
        dead.forEach(e => deadEndpointsAll.add(e));
        entry.notified10 = true; sentAny = true;
      }

      if (!entry.notified5 && minsUntil > 0 && minsUntil <= 5){
        const dead = await sendPushToSubs(targetSubs, {
          title: "⏰ Já vai começar!",
          body: `${m.home} x ${m.away} começa em ${Math.round(minsUntil)} minutos`,
          tag: matchKey + "-5min",
        });
        dead.forEach(e => deadEndpointsAll.add(e));
        entry.notified5 = true; sentAny = true;
      }
    }

    // Rede de segurança — se mesmo assim o jogo passou a "ao vivo" sem
    // nenhuma das duas notificações ter disparado (atraso grande demais,
    // passou a janela toda de uma vez), avisa que já começou, em vez de
    // ficar caladinho até ao primeiro gol
    if (m.live && !entry.notified10 && !entry.notified5 && !entry.notifiedStarted){
      const dead = await sendPushToSubs(targetSubs, {
        title: "⚽ Já começou!",
        body: `${m.home} x ${m.away} já está em andamento`,
        tag: matchKey + "-started",
      });
      dead.forEach(e => deadEndpointsAll.add(e));
      entry.notified10 = true; entry.notified5 = true; entry.notifiedStarted = true; sentAny = true;
    }

    // 2) Gols novos do jogo ao vivo
    if (m.live && Array.isArray(m.events)){
      for (const ev of m.events){
        if (!ev.icon || !ev.icon.startsWith("⚽")) continue;
        const goalKey = `${ev.min}|${ev.sub}`; // minuto+equipa — estável, não muda se a tradução melhorar
        if (entry.goals.includes(goalKey)) continue;
        const dead = await sendPushToSubs(targetSubs, {
          title: "⚽ GOOOL!",
          body: `${ev.txt} (${ev.min}') — ${m.home} ${m.sh}–${m.sa} ${m.away}`,
          tag: matchKey + "-goal",
        });
        dead.forEach(e => deadEndpointsAll.add(e));
        entry.goals.push(goalKey); sentAny = true;
      }
    }

    // 3) Resultado final
    if (m.done && !entry.finalNotified){
      const dead = await sendPushToSubs(targetSubs, {
        title: "🏁 Jogo terminado",
        body: `${m.home} ${m.sh}–${m.sa} ${m.away}`,
        tag: matchKey + "-final",
      });
      dead.forEach(e => deadEndpointsAll.add(e));
      entry.finalNotified = true; sentAny = true;
    }
  }

  saveJSON(NOTIFIED_CACHE_FILE, cache);
  if (deadEndpointsAll.size){
    console.log(`${deadEndpointsAll.size} subscrição(ões) expirada(s) detectada(s) — limpeza no Cloudflare KV fica para uma próxima melhoria.`);
  }
  // Cloudflare KV é a fonte principal de subscriptions. Não sobrescrevemos subscriptions.json aqui.
  if (sentAny) console.log("✅ Ciclo de notificações concluído.");
}

// ── EXECUÇÃO RÁPIDA vs COMPLETA ──────────────────────────────────────────────
// Agora que o Cloudflare dispara o robô a cada minuto, buscar a janela
// completa (-5 a +12 dias = 18 chamadas) em TODAS as execuções seria ~25 mil
// pedidos/dia à ESPN — arriscado para uma API não documentada. Por isso:
// a cada minuto só verifica ontem/hoje/amanhã (o que importa para deteção
// rápida de golo); a janela completa só corre a cada ~14 minutos.
const FULL_REFRESH_STATE_FILE = "full-refresh-state.json";
const FULL_REFRESH_INTERVAL_MIN = 14;

function shouldDoFullRefresh(){
  const state = loadJSON(FULL_REFRESH_STATE_FILE, null);
  if (!state || !state.lastFullRefresh) return true;
  const elapsedMin = (Date.now() - new Date(state.lastFullRefresh).getTime()) / 60000;
  return elapsedMin >= FULL_REFRESH_INTERVAL_MIN;
}
function markFullRefreshDone(){
  saveJSON(FULL_REFRESH_STATE_FILE, { lastFullRefresh: new Date().toISOString() });
}

async function main(){
  loadTranslateCache();
  const doFull = shouldDoFullRefresh();
  let offsets;
  if (doFull){
    console.log("Execução COMPLETA: buscando janela de jogos (-5 a +12 dias)...");
    offsets = [];
    for (let o = -5; o <= 12; o++) offsets.push(o);
  } else {
    console.log("Execução RÁPIDA: só ontem/hoje/amanhã (deteção em tempo real).");
    offsets = [-1, 0, 1];
  }

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
      // Pênaltis — a ESPN guarda isto separado do placar normal. Sem isto,
      // um empate decidido nos pênaltis (ex: Alemanha 1-1 Holanda, 4-3 nos
      // pênaltis) aparecia só como "1-1", sem mostrar quem avançou de verdade.
      const shPK = parseInt(h.shootoutScore);
      const saPK = parseInt(a.shootoutScore);
      const hadShootout = !isNaN(shPK) && !isNaN(saPK) && (shPK > 0 || saPK > 0);
      const clock = ev.status?.displayClock || "";
      const venue = comp?.venue?.fullName || comp?.venue?.address?.city || "";
      const { date, brTime } = toBR(ev.date);

      let events = [];
      let espnLineups = null;
      let espnStats = null;
      if (state === "in" || state === "post"){
        const details = await fetchMatchDetails(ev.id);
        events = details.events;
        espnLineups = details.lineups;
        espnStats = details.stats;
      }

      const entry = {
        espnId: ev.id, // identificador fixo da ESPN — não muda mesmo quando o nome da equipa muda (placeholder → resolvido)
        home: hName, away: aName,
        date, brTime, venue, iso: ev.date,
        sh: (state === "in" || state === "post") ? sh : null,
        sa: (state === "in" || state === "post") ? sa : null,
        done: state === "post",
        live: state === "in",
        clock: state === "in" ? clock : "",
        events
      };
      if (espnLineups) entry.lineups = espnLineups;
      if (espnStats) entry.stats = espnStats;
      if (hadShootout){
        entry.shPK = shPK;
        entry.saPK = saPK;
      }

      // Regra estrutural primeiro, sem excepção — duas seleções do mesmo
      // grupo nunca jogam mata-mata antes dos quartos. Isto sobrepõe-se a
      // qualquer palpite por texto ou por data.
      const round = sameGroup(hName, aName) ? null : classify(ev);
      if (round){
        entry.round = round;
        knockout.push(entry);
      } else {
        matches[hName + "|" + aName] = entry;
      }
    }
  }

  let out;
  if (doFull){
    // Execução completa cobre a janela atual (-5 a +12 dias), mas precisa
    // de FUNDIR com o histórico existente — sem isto, qualquer jogo com
    // mais de 5 dias desaparecia do results.json a cada ciclo completo,
    // mesmo já tendo resultado real confirmado antes. Resultados antigos
    // têm de persistir indefinidamente, não só dentro da janela de busca.
    const existing = loadJSON("results.json", { matches: [], knockout: [] });
    const mergedMatches = {};
    (existing.matches || []).forEach(m => { mergedMatches[`${m.home}|${m.away}`] = m; });
    Object.entries(matches).forEach(([key, m]) => { mergedMatches[key] = m; });

    let mergedKnockout = existing.knockout || [];
    knockout.forEach(k => {
      // Prioriza o id fixo da ESPN — o nome das equipas pode mudar entre
      // execuções (placeholder "2º Grupo A" -> "África do Sul" resolvido),
      // e comparar só por nome cria uma entrada duplicada a cada mudança
      const idx = mergedKnockout.findIndex(e =>
        (k.espnId && e.espnId === k.espnId) ||
        (!e.espnId && e.round === k.round && e.home === k.home && e.away === k.away)
      );
      if (idx >= 0) mergedKnockout[idx] = k; else mergedKnockout.push(k);
    });

    out = {
      generatedAt: new Date().toISOString(),
      matches: Object.values(mergedMatches),
      knockout: mergedKnockout
    };
  } else {
    // Execução rápida — só ontem/hoje/amanhã foram buscados agora. Funde com
    // o que já existia em results.json, para não perder jogos de outras
    // datas que só a execução completa cobre.
    const existing = loadJSON("results.json", { matches: [], knockout: [] });
    const mergedMatches = {};
    (existing.matches || []).forEach(m => { mergedMatches[`${m.home}|${m.away}`] = m; });
    Object.entries(matches).forEach(([key, m]) => { mergedMatches[key] = m; });

    let mergedKnockout = existing.knockout || [];
    knockout.forEach(k => {
      // Prioriza o id fixo da ESPN — o nome das equipas pode mudar entre
      // execuções (placeholder "2º Grupo A" -> "África do Sul" resolvido),
      // e comparar só por nome cria uma entrada duplicada a cada mudança
      const idx = mergedKnockout.findIndex(e =>
        (k.espnId && e.espnId === k.espnId) ||
        (!e.espnId && e.round === k.round && e.home === k.home && e.away === k.away)
      );
      if (idx >= 0) mergedKnockout[idx] = k; else mergedKnockout.push(k);
    });

    out = {
      generatedAt: new Date().toISOString(),
      matches: Object.values(mergedMatches),
      knockout: mergedKnockout
    };
  }

  // Escalações e estatísticas — tudo da ESPN, de graça, no mesmo pedido
  // que já fazemos para os eventos. Sem orçamento a gerir, sem reserva.
  const espnCount = out.matches.filter(m => m.live && m.lineups).length;
  if (espnCount) console.log(`✅ Escalações/estatísticas obtidas pela ESPN: ${espnCount} jogo(s)`);

  fs.writeFileSync("results.json", JSON.stringify(out, null, 2));
  console.log(`✅ results.json escrito com ${out.matches.length} jogos de grupo e ${knockout.length} de mata-mata. (${doFull ? "completa" : "rápida"})`);

  saveTranslateCache();
  await checkAndNotify(out.matches, doFull);
  if (doFull) markFullRefreshDone();
}

main().catch(e => { console.error("Erro fatal:", e); process.exit(1); });


