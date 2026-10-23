# Estação Meteorológica

Sistema de monitoramento de estações meteorológicas DIY baseadas no **Wemos D1 mini (ESP8266)**, com anemômetro, pluviômetro e um sensor de clima, em duas versões:

- **Completa:** BME280 (temperatura, umidade, pressão e altitude).
- **HTU21D:** temperatura e umidade, sem pressão nem altitude.

- **App 1 — Coletor:** recebe tudo o que as estações publicam no MQTT (Mosquitto) e grava no PostgreSQL.
- **App 2 — Dashboard:** painel web com gráficos, visualização 3D, cadastro de estações e usuários (admin/operador) e registros do sistema (logs, alertas, saúde dos dispositivos).
- **Firmware** próprio para o D1 mini, com perfis de energia para operação a bateria.

O design completo está em [`docs/superpowers/specs/2026-10-22-estacao-meteorologica-design.md`](docs/superpowers/specs/2026-10-22-estacao-meteorologica-design.md) e o plano por fases em [`docs/superpowers/plans/2026-10-22-plano-de-implementacao.md`](docs/superpowers/plans/2026-10-22-plano-de-implementacao.md).

> **Status:** Fases 1 a 6 concluídas:
>
> - contrato MQTT, banco de dados e administração do broker;
> - **coletor (App 1)** e **simulador de estações**;
> - **dashboard (App 2)**, com API e interface web;
> - **firmware** do D1 mini, validado em bancada ainda sem os sensores;
> - **deploy**: compose de produção para o Coolify, com backup diário.

## Pré-requisitos

- Node.js 24 e pnpm 11 (`corepack enable` ou `npm i -g pnpm@11`)
- Docker com Compose

## Primeiros passos

```bash
cp .env.example .env     # valores de desenvolvimento
pnpm install
pnpm infra:up            # Postgres (127.0.0.1:5442) e Mosquitto (127.0.0.1:1883)
pnpm db:migrate          # cria o esquema do banco
pnpm mqtt:bootstrap      # cria papéis e o cliente do coletor no Mosquitto
```

### Ver o sistema funcionando sem hardware

```bash
pnpm db:seed                         # 4 estações de demonstração (banco + credenciais MQTT)
pnpm dev                             # coletor + API do dashboard + interface (deixe rodando)
pnpm simulate --backfill 7d          # em outro terminal: 7 dias de histórico + tempo real
```

Abra <http://localhost:5173> e entre com `ADMIN_EMAIL` / `ADMIN_PASSWORD` do `.env`. O primeiro administrador é criado automaticamente quando a API sobe.

Opções do simulador: `--interval 10` (leituras mais frequentes), `--chaos` (falhas de sensor, quedas de Wi-Fi, falta de energia, duplicatas e payloads inválidos), `--chaos-rate 5` e `--only sede,pivo-norte`. As estações de demonstração cobrem os três perfis de energia: `sede` (solar folgado), `pivo-norte` (solar justo) e `talhao-sul` (bateria fraca, entra em economia e sobrevivência). A `horta` é da versão HTU21D, sem pressão.

## Produção

Dois composes na raiz, feitos para o recurso Docker Compose do Coolify:

| Compose | Para | O que sobe | Variáveis |
|---|---|---|---|
| `docker-compose.yaml` | VPS (produção) | Postgres, Mosquitto com um login por estação, coletor, painel e backup diário | [`.env.production.example`](.env.production.example) |
| `docker-compose.home.yaml` | Coolify de casa (teste e apresentação) | Postgres, coletor, painel e backup; usa um broker que já existe, com o login único dele | [`.env.home.example`](.env.home.example) |

As estações falam MQTT na porta 1883, sem TLS (decisões registradas no design, §3.10).

Passo a passo, backup e restauração: [`docs/deploy.md`](docs/deploy.md).

## Comandos

| Comando | O que faz |
|---|---|
| `pnpm check` | Lint (Biome), typecheck e testes unitários |
| `pnpm test:int` | Testes de integração contra o Postgres e o Mosquitto de desenvolvimento |
| `pnpm format` | Formata e organiza imports |
| `pnpm infra:up` / `infra:down` / `infra:logs` | Sobe, derruba ou acompanha a infraestrutura de desenvolvimento |
| `pnpm db:migrate` | Aplica as migrações pendentes e as configurações padrão |
| `pnpm db:generate --name <nome>` | Gera uma nova migração a partir do esquema (`packages/db/src/schema`) |
| `pnpm mqtt:bootstrap` | Configura o broker (idempotente) |
| `pnpm db:seed` | Cria/atualiza as estações de demonstração e as credenciais do simulador |
| `pnpm dev` | Coletor, API do dashboard (porta 3300) e interface (Vite, porta 5173) |
| `pnpm dev:collector` / `pnpm dev:dashboard` | Só o coletor, ou só a API e a interface |
| `pnpm --filter @wx/dashboard build` | Gera a interface em `apps/dashboard/dist/web` (servida pela API com `WEB_DIST`) |
| `pnpm --filter @wx/dashboard e2e` | Testes de ponta a ponta (Playwright) contra o sistema rodando |
| `pnpm simulate` | Estações virtuais (ver opções acima; `--help`) |
| `cd firmware && pio run -t upload` | Compila e grava o firmware no D1 mini ([guia de hardware](docs/hardware.md)) |
| `firmware/scripts/test-native.sh` | Testes do firmware no computador |

## Estrutura

```
apps/
  collector/     # App 1: MQTT → PostgreSQL, status, saúde, alertas e logs
  dashboard/     # App 2: API Fastify (src/server) e interface React (src/web)
packages/
  shared/        # contrato MQTT (zod), domínio e fórmulas meteorológicas (Node e navegador)
  db/            # esquema Drizzle, migrações, LISTEN/NOTIFY
  mqtt-admin/    # Dynamic Security do Mosquitto: papéis e credenciais das estações
tools/
  simulator/     # estações virtuais (clima, bateria/solar, perfis de energia, falhas)
firmware/        # D1 mini (PlatformIO, C++): medição, perfis de energia, MQTT (TLS opcional)
infra/           # compose de desenvolvimento e de ensaio, Mosquitto e backup
scripts/         # bundle dos servidores para as imagens de produção
docs/            # design, plano e guias (hardware.md, calibracao.md, deploy.md)
Dockerfile                # imagens do coletor e do painel (alvos collector e dashboard)
docker-compose.yaml       # produção na VPS (Coolify)
docker-compose.home.yaml  # Coolify de casa, com o broker que já existe
```

## Dashboard

| Tela | O que mostra |
|---|---|
| Visão geral | Mapa inclinado em 3D com uma coluna por estação (temperatura, chuva de hoje, vento ou umidade), alertas ativos, saúde do sistema e uma linha de instrumentos por estação |
| Estação | Cena 3D da estação (anemômetro girando com o vento medido, chuva caindo quando o pluviômetro conta, céu da hora local), valores ao vivo, gráficos por período, mapa de calor hora × dia (plano ou 3D), calendário de chuva, resumo diário e CSV |
| Comparar | A mesma grandeza de até 6 estações no mesmo gráfico |
| Dispositivos | Bateria, sinal, firmware, memória e fila de cada D1 mini; histórico e linha do tempo de conexão |
| Alertas e Logs | Alertas ativos e resolvidos com reconhecimento; registros filtráveis, atualizados ao vivo |
| Administração | Estações (local no mapa, calibração, configuração remota, credenciais MQTT, comandos), usuários e configurações |

Os dados chegam ao vivo pelo SSE. Todo gráfico tem uma visão em tabela. A interface é responsiva, respeita "reduzir movimento" e tem tema escuro (padrão) e claro.

## Contrato MQTT (resumo)

Tópicos `weather/v1/{código-da-estação}/{tipo}`:

| Tipo | Sentido | Conteúdo |
|---|---|---|
| `telemetry` | estação → servidor | Lote de leituras (temperatura, umidade, pressão, pulsos de vento, contador de chuva) |
| `status` | estação → servidor | `online` / `sleeping` / `offline` (LWT), retido |
| `health` | estação → servidor | Diagnóstico: bateria, sinal, memória, sensores |
| `event` | estação → servidor | Eventos e erros |
| `config` | servidor → estação | Configuração (intervalos, limiares de bateria), retido |
| `cmd` | servidor → estação | Comandos: reiniciar, identificar, enviar agora |

Cada estação tem usuário e senha próprios no broker e só consegue publicar nos próprios tópicos.
