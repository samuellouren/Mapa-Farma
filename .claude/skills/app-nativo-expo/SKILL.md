---
name: app-nativo-expo
description: Use esta skill sempre que mexer em app.json, eas.json, build do .apk, navegação, ou qualquer configuração do app nativo do Mapa Farma. Este projeto é um app React Native (Expo), gera .apk via EAS Build — NÃO é mais PWA. Não sugerir vite-plugin-pwa, manifest.json de PWA, ou instalação via navegador.
---

# App nativo — Expo / React Native

## Decisão de arquitetura (fixa, mudou de PWA para nativo em 2026-07-07)
O Mapa Farma é um **app React Native via Expo**, com build de `.apk` real
via **EAS Build**. A decisão anterior de PWA foi revertida a pedido
explícito do usuário — ele quer um app instalável de verdade, não
"adicionar à tela inicial" pelo navegador.

O design em `Mapa_Farma.html` (Claude Design) agora é usado como
**referência visual** (cores, espaçamento, tipografia, hierarquia) para
recriar as telas em componentes nativos — não é mais portado quase 1:1
como HTML/CSS.

## Stack fixa
- **Expo** (não React Native "puro" sem Expo) — facilita o build via EAS
  sem precisar configurar Android Studio/SDK na máquina do usuário.
- Navegação: `@react-navigation/native` + `native-stack` + `bottom-tabs`.
- Estado de sessão: `@react-native-async-storage/async-storage` (guarda o
  token JWT).
- Fontes: `expo-font` (IBM Plex Mono, do design).
- Bottom sheets: `@gorhom/bottom-sheet` + `react-native-gesture-handler`.

## Build do .apk
- Via **EAS Build** (nuvem), não build local — o usuário só tem JDK 8
  instalado, não tem Android SDK/JDK 17 configurado.
- Requer conta Expo gratuita (`eas login`), free tier cobre builds Android
  (com fila).
- Configuração fica em `eas.json` (perfil de build) e `app.json` (nome,
  ícone, splash, package Android).

## Tema visual
- Cor principal do design: **#7a2833** (vinho) — usar em `theme/` do
  projeto, splash screen e ícone do app.
- Manter fidelidade ao design nas 9 telas (Login, Mapa, Ficha, Registrar,
  Historico, Painel, Pedidos, Conta), mesmo recriando em componente
  nativo.

## O que NÃO fazer
- Não sugerir `vite-plugin-pwa`, `manifest.json`, service worker, ou
  qualquer configuração de "instalar via navegador".
- Não sugerir migrar de volta pra PWA sem o usuário pedir explicitamente.
- Não reaproveitar o HTML/CSS do design diretamente — ele é referência
  visual, as telas são componentes nativos.
