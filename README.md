# Estação Meteorológica

Sistema de monitoramento de estações meteorológicas DIY baseadas no **Wemos D1 mini (ESP8266)**, com BME280 (temperatura, umidade, pressão e altitude), anemômetro e pluviômetro.

- **App 1 — Coletor:** recebe tudo o que as estações publicam no MQTT (Mosquitto) e grava no PostgreSQL.
- **App 2 — Dashboard:** painel web com gráficos, visualização 3D, cadastro de estações e usuários (admin/operador) e registros do sistema (logs, alertas, saúde dos dispositivos).
- **Firmware** próprio para o D1 mini, com perfis de energia para operação a bateria.

O design completo está em [`docs/superpowers/specs/2026-10-22-estacao-meteorologica-design.md`](docs/superpowers/specs/2026-10-22-estacao-meteorologica-design.md) e o plano por fases em [`docs/superpowers/plans/2026-10-22-plano-de-implementacao.md`](docs/superpowers/plans/2026-10-22-plano-de-implementacao.md).

> **Status:** Fases 1 e 2 concluídas — contrato MQTT, banco de dados, administração do broker, **coletor (App 1)** e **simulador de estações**. Dashboard, firmware e deploy vêm nas próximas fases.

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

### Ver dados fluindo sem hardware

```bash
pnpm db:seed                         # 3 estações de demonstração (banco + credenciais MQTT)
pnpm dev:collector                   # App 1: MQTT → PostgreSQL (deixe rodando)
pnpm simulate --backfill 7d          # em outro terminal: 7 dias de histórico + tempo real
```

Opções do simulador: `--interval 10` (leituras mais frequentes), `--chaos` (falhas de sensor, quedas de Wi-Fi, falta de energia, duplicatas e payloads inválidos), `--chaos-rate 5` e `--only sede,pivo-norte`. As estações de demonstração cobrem os três perfis de energia: `sede` (solar folgado), `pivo-norte` (solar justo) e `talhao-sul` (bateria fraca, entra em economia e sobrevivência).

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
| `pnpm dev:collector` | Coletor (App 1) com recarga automática |
| `pnpm simulate` | Estações virtuais (ver opções acima; `--help`) |

## Estrutura

```
apps/
  collector/     # App 1: MQTT → PostgreSQL, status, saúde, alertas e logs
packages/
  shared/        # contrato MQTT (zod), domínio e fórmulas meteorológicas (Node e navegador)
  db/            # esquema Drizzle, migrações, LISTEN/NOTIFY
  mqtt-admin/    # Dynamic Security do Mosquitto: papéis e credenciais das estações
tools/
  simulator/     # estações virtuais (clima, bateria/solar, perfis de energia, falhas)
infra/           # compose de desenvolvimento e configuração do Mosquitto
docs/            # design, plano e guias
```

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
