# ⚽ Copa 2026 Tracker — PWA

## Como instalar no Android

1. Abra o Chrome no Android
2. Acesse a URL do GitHub Pages deste repositório
3. Toque nos 3 pontinhos (⋮) no canto superior direito
4. Toque em **"Adicionar à tela inicial"**
5. Confirme — o ícone aparece como um app normal

## Como atualizar os dados

A app tenta buscar dados ao vivo da ESPN automaticamente (refresh a cada 60s).

Quando a Copa tiver jogos ao vivo, ela se atualiza sozinha.

Para atualizar os dados base (resultados do dia), peça ao Claude:
> "Atualiza a Copa"

Receba o novo `index.html` e faça commit no repositório.

## Estrutura

```
copa2026-pwa/
├── index.html      ← App completa (atualizar aqui)
├── manifest.json   ← Config PWA (não precisa mudar)
├── sw.js           ← Service Worker (não precisa mudar)
├── icon-192.png    ← Ícone Android
└── icon-512.png    ← Ícone splash screen
```

## Hospedar no GitHub Pages

1. Crie um repositório no GitHub (ex: `copa2026`)
2. Faça upload de todos os ficheiros
3. Vá em Settings → Pages → Source: `main` / `root`
4. URL será: `https://SEU_USER.github.io/copa2026`
