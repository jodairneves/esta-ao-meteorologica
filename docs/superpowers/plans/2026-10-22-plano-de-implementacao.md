# Plano de Implementação — Estação Meteorológica

- **Data:** 2026-10-22
- **Design de referência:** [`docs/superpowers/specs/2026-10-22-estacao-meteorologica-design.md`](../specs/2026-10-22-estacao-meteorologica-design.md)
- **Como seguir este plano:**
  - Cada fase termina com `pnpm check` passando, `CLAUDE.md` atualizado e commit (Conventional Commits, em inglês).
  - No início de cada fase, a lista de arquivos é apresentada antes de executar.
  - Ao final de cada fase há um checkpoint com o usuário antes da próxima.
  - Qualquer divergência do design é discutida antes de ser implementada.

---

## Fase 1 — Fundação

**Objetivo:** monorepo funcionando, infraestrutura de desenvolvimento, contrato MQTT, banco e administração do Mosquitto prontos.

### 1.1 Monorepo e ferramentas
- `package.json` raiz com os scripts `dev`, `build`, `check`, `lint`, `format`, `typecheck`, `test`, `infra:up`, `infra:down`, `infra:logs`, `db:generate`, `db:migrate`, `db:seed`, `mqtt:bootstrap` e `simulate`.
- `pnpm-workspace.yaml` (`apps/*`, `packages/*`, `tools/*`).
- `tsconfig.base.json` (strict, ESM, `NodeNext`).
- `biome.json` (lint + format).
- `.editorconfig`, `.nvmrc` (24), `.env.example`.
- `README.md` (como rodar).

### 1.2 Infraestrutura de desenvolvimento
- `infra/compose.dev.yml`: `postgres:18.6-alpine` (porta `127.0.0.1:5432`) e `eclipse-mosquitto:2.1.2-alpine` (porta `127.0.0.1:1883`), com volumes nomeados.
- `infra/postgres/init/01-test-db.sql`: cria o banco `weather_test`.
- `infra/mosquitto/mosquitto.dev.conf`: listener 1883, plugin Dynamic Security, `persistence true`, fila por cliente ampliada.

### 1.3 `packages/shared` (roda no Node e no navegador)
- `src/contract/topics.ts`: montagem e parsing de `weather/v1/{code}/{kind}` e regex do código.
- `src/contract/schemas.ts`: zod de `telemetry`, `status`, `health`, `event`, `config` e `cmd` (§3 do design).
- `src/contract/codes.ts`: códigos de evento da estação e do servidor.
- `src/domain/*.ts`: perfis, estados de conexão, sensores, tipos de alerta, níveis, categorias e origens de log.
- `src/meteo/*.ts`: ponto de orvalho, pressão ao nível do mar, altitude barométrica, índice de calor, wind chill, sensação térmica, tendência de pressão, Beaufort e % de bateria.
- `src/calibration.ts`: vento, rajada, chuva, offsets e calculadora do fator do anemômetro.
- `src/rain.ts`: cálculo da chuva por diferença (§6.1).
- `src/series.ts`: escolha automática do bucket (§8.5).
- Testes Vitest de tudo acima, com valores de referência conhecidos.

### 1.4 `packages/db`
- `src/schema/*.ts`: todas as tabelas da §5.2.
- `drizzle.config.ts` e `migrations/` com a migração inicial gerada (o índice parcial `NULLS NOT DISTINCT` vai em SQL manual, se o drizzle-kit não gerar).
- `src/client.ts` (pool e instância Drizzle), `src/migrate.ts` (migrações sob `pg_advisory_lock`), `src/notify.ts` (canais e payloads tipados, helpers de `NOTIFY`/`LISTEN`) e `src/settings.ts` (padrões da §5.2).
- `src/cli/migrate.ts`.
- Teste de integração: migra o `weather_test` do zero e confere as tabelas.

### 1.5 `packages/mqtt-admin` (somente Node)
- `src/dynsec.ts`: cliente da API `$CONTROL/dynamic-security/v1`, com envio de comandos e espera das respostas.
- `src/bootstrap.ts`: papéis `station`, `collector` e `dashboard-ops`; cliente `collector`; papel extra do `admin` (idempotente).
- `src/stations.ts`: provisionar, rotacionar, desativar, reativar e excluir o cliente de uma estação; limpar tópicos retidos.
- `src/cli.ts`: comando `pnpm mqtt:bootstrap`.
- Teste de integração no Mosquitto de desenvolvimento: bootstrap e provisionamento; uma estação provisionada publica no próprio tópico e é bloqueada no de outra.

### 1.6 Documentação
- `README.md` e `CLAUDE.md` com os comandos reais.

**Aceite:**
- `pnpm install && pnpm check` passa.
- `pnpm infra:up` sobe os dois serviços.
- `pnpm db:migrate` cria o esquema.
- `pnpm mqtt:bootstrap` configura o broker.
- Os testes de integração passam.

---

## Fase 2 — App 1: Coletor e simulador

1. `apps/collector`: configuração (env validado), logger (pino), repositórios (cache de estações, leituras, estado, sensores, diagnóstico, eventos, comandos, alertas, heartbeat).
2. Pipeline de ingestão: parse → validação → calibração → derivados → chuva → transação → `NOTIFY`.
3. Cliente MQTT com `handleMessage` (PUBACK após commit, novas tentativas com espera progressiva quando o banco falha) e handlers de `telemetry`, `status`, `health` e `event`.
4. Monitor: estação sem contato, sensor parado, alertas de bateria e descarte, heartbeat, retenção.
5. Encerramento gracioso.
6. `tools/simulator`: estações virtuais com clima realista (ciclo diário, frentes de pressão, rajadas, eventos de chuva), bateria com ciclo solar e os três perfis, falhas injetáveis (sensor, reinício com `run` novo, queda de conexão, payload inválido, duplicatas) e opções de linha de comando (`--stations`, `--interval`, `--speed`).
7. `pnpm db:seed`: admin, 3 estações de demonstração, credenciais MQTT (guardadas em `tools/simulator/.stations.json`, fora do git) e configuração retida.
8. Testes: unitários do pipeline; integração com Postgres e Mosquitto reais (lote, duplicata, inválido, estação desconhecida, novo `run`, banco indisponível sem perda, monitor).

**Aceite:** `pnpm infra:up` + `pnpm db:seed` + coletor + `pnpm simulate` → leituras no banco com derivados corretos; testes passam.

---

## Fase 3 — App 2: API

1. Estrutura `apps/dashboard` (`src/server` + `src/web` vazio), configuração, logger e plugins (cookie, helmet, rate limit, static).
2. Autenticação: bootstrap do primeiro admin, login, logout, `me`, troca de senha, sessões, limite de tentativas, bloqueio e CSRF.
3. Permissões e auditoria.
4. Usuários.
5. Estações: CRUD, calibração, credenciais (via `mqtt-admin`), configuração remota retida, comandos e exclusão completa.
6. Dados: `latest`, séries com buckets, resumo diário, mapa de calor, comparação e CSV.
7. Saúde, alertas, logs e status do sistema; monitor do coletor (`collector_down`); limpeza de sessões.
8. SSE (`LISTEN` → navegadores).
9. Testes com `inject`: autenticação, matriz de permissões, estações, séries e SSE.

**Aceite:** endpoints da §8.4 cobertos por testes; uma estação criada pela API é usada pelo simulador.

---

## Fase 4 — App 2: Web

1. Base: Vite, React, Router, TanStack Query, Tailwind e shadcn/ui; tokens do tema (escuro/claro, cores por grandeza); layout (menu lateral, barra superior, versão celular); login; guarda de rotas por perfil; cliente da API e SSE.
2. Visão geral: cartões, mapa 3D, alertas, saúde do sistema.
3. Estação: cena 3D, indicadores ao vivo, gráficos com períodos e zoom, mapa de calor (2D e 3D), calendário de chuva, tabela diária e CSV.
4. Comparar.
5. Dispositivos, Alertas e Logs.
6. Administração: estações (formulário, mapa, calculadora do anemômetro, credenciais, configuração, comandos), usuários e configurações; Meu perfil.
7. Polimento: responsividade, acessibilidade, "reduzir movimento", estados de vazio, erro e carregamento.
8. Playwright: login, navegação, admin cria estação, operador sem acesso à administração.

**Aceite:** fluxo completo com o simulador, Playwright passando e revisão visual por screenshots.

---

## Fase 5 — Firmware do D1 mini

1. Projeto PlatformIO com os ambientes `d1_mini` e `native`; estrutura de módulos.
2. Lógica pura com testes nativos: rajada, buffer, máquina de perfis, montagem do payload, CRC da RTC.
3. Drivers: pulsos (ISR com debounce), BME280, bateria (ADC), LED.
4. Rede: Wi-Fi, NTP, MQTT com TLS (raízes ISRG), LWT, assinaturas, remoção do buffer só após PUBACK, reconexão com espera progressiva. Medir cedo a RAM livre com TLS em bancada.
5. Portal (WiFiManager + dois toques no RESET) e persistência (LittleFS).
6. Perfis de energia (Normal, Economia, Sobrevivência com deep sleep).
7. Configuração remota e comandos.
8. Guias: `docs/hardware.md` (ligações, lista de materiais, alimentação e segurança da bateria) e `docs/calibracao.md`.
9. Teste em bancada com o D1 mini real, publicando no ambiente de desenvolvimento.

**Aceite:** `pio test -e native` e `pio run -e d1_mini` passam; em bancada a estação aparece online no painel e os pulsos viram vento e chuva.

---

## Fase 6 — Deploy

1. Dockerfiles do coletor e do dashboard (múltiplos estágios, usuário não-root, healthcheck).
2. `docker-compose.yml` de produção com os perfis `tunnel` e `ddns`; `infra/mosquitto/mosquitto.conf` com TLS; renovação de certificados (lego) e recarga no Mosquitto.
3. Backup diário e procedimento de restauração.
4. Guias: `docs/deploy-coolify.md` e `docs/deploy-local.md` (Cloudflare Tunnel, port forward, DDNS, verificação de CGNAT).
5. Ensaio: subir o compose de produção localmente com certificado de staging e conectar o simulador via TLS.

**Aceite:** a stack sobe do zero só com o `.env`; o simulador publica via TLS 8883; restauração do backup testada.

---

## Fase 7 — Melhorias

Itens da §13 do design, priorizados com o usuário ao final da Fase 6.
