# ⚽ Copa 2026 Tracker — PWA

App de acompanhamento da Copa do Mundo FIFA 2026, feita à mão por Thiago Bartulihe (TicoBartu) — dados em tempo real, escalações, simulação interativa de mata-mata, e notificações push para a família toda.

## Funcionalidades

- **🔴 Ao Vivo** — minuto a minuto dos jogos a decorrer: gols, cartões, substituições, e escalação com mapa de formação (quando disponível)
- **📆 Hoje / 📅 Próximos / ✅ Resultados** — com filtros por dia, por grupo, e por seleções favoritas
- **🏟 Grupos** — classificação real, atualizada a cada resultado
- **🏆 Mata-Mata** — chave real dos avos às final; enquanto a fase de grupos não termina, os avos são recalculados ao vivo a partir da classificação atual (nunca confia num palpite estático)
- **🔮 Simulação** — a tua própria chave: escolhes o vencedor de cada confronto, jogo a jogo, até chegares ao campeão
- **⭐ Favoritos** — estrela qualquer seleção; aparecem destacadas em toda a app
- **🔔 Notificações push** — avisa quando um jogo favorito está a começar, sai um gol, ou termina — mesmo com a app fechada. Cada pessoa da família pode seguir seleções diferentes.

## Arquitetura

```
Telemóvel (PWA)
    ├── index.html — toda a interface e lógica do cliente
    ├── sw.js — Service Worker (cache + recebe notificações push)
    └── manifest.json — configuração da instalação como app

GitHub Actions (a cada ~15 min)
    └── scripts/update-scores.js
          ├── busca resultados/eventos na ESPN
          ├── busca escalações na API-Football (orçamento de 100 chamadas/dia)
          ├── lê subscrições no Cloudflare Worker
          └── envia notificações push e escreve results.json

Cloudflare Worker (copa2026-api.tbartulihe.workers.dev)
    └── guarda as subscrições de notificação de cada pessoa,
        com as seleções favoritas de cada uma
```

## Como instalar no Android

1. Abra o Chrome no Android
2. Acesse a URL do GitHub Pages deste repositório
3. Toque nos 3 pontinhos (⋮) → "Adicionar à tela inicial"
4. Confirme — o ícone aparece como um app normal

## Como atualizar

Peça ao Claude para fazer a alteração desejada, receba os ficheiros atualizados, e faça commit no repositório. O GitHub Pages publica automaticamente em 1-2 minutos.

## Secrets necessários (GitHub → Settings → Secrets and variables → Actions)

| Secret | Para quê |
|---|---|
| `API_FOOTBALL_KEY` | Escalações reais dos jogos ao vivo |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Assinatura das notificações push |
| `CLOUDFLARE_ADMIN_TOKEN` | Robô ler a lista de subscrições no Cloudflare |
