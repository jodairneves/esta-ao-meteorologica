# CLAUDE.md — Estação Meteorológica

Sistema de monitoramento de estações meteorológicas DIY (Wemos D1 mini/ESP8266 + BME280, anemômetro e pluviômetro): coleta via MQTT, armazenamento em PostgreSQL e dashboard web com visualização 3D.

## Documentos-chave

- **Design (fonte da verdade):** `docs/superpowers/specs/2026-10-22-estacao-meteorologica-design.md`
- **Plano por fases:** `docs/superpowers/plans/2026-10-22-plano-de-implementacao.md`
- **Referências de hardware:** os PDFs na raiz do projeto (fora do git). O resumo do que foi aproveitado está na §1.4 do design.

## Visão geral

- **App 1 — Coletor** (`apps/collector`): único consumidor da telemetria MQTT. Valida, calibra, calcula derivados, grava no PostgreSQL, monitora estações e sensores e abre alertas.
- **App 2 — Dashboard** (`apps/dashboard`): API Fastify (`src/server`) + SPA React (`src/web`). Lê só do banco; o tempo real vem por `LISTEN/NOTIFY` → SSE. Provisiona as credenciais MQTT (Dynamic Security) e envia comandos às estações.
- **Pacotes:** `packages/shared` (contrato MQTT em zod, domínio, fórmulas meteorológicas; roda no Node e no navegador), `packages/db` (esquema Drizzle, migrações, NOTIFY), `packages/mqtt-admin` (Dynamic Security do Mosquitto).
- **Firmware** (`firmware/`): PlatformIO para D1 mini, com perfis de energia Normal/Economia/Sobrevivência.
- **Contrato MQTT v1:** `weather/v1/{code}/{telemetry|status|health|event|config|cmd}` (§3 do design).

## Decisões que não devem ser revertidas sem conversar com o usuário

- O banco é o ponto de integração entre os apps: o Dashboard não assina telemetria no MQTT.
- O coletor só envia PUBACK depois do commit; erro de banco = nova tentativa, nunca descarte.
- Vento e chuva chegam brutos (pulsos e contador); a calibração é aplicada no servidor, por estação.
- A chuva é um contador acumulado por `run` (memória RTC da estação), com a diferença calculada no servidor (§6.1 do design).
- `null` significa "não medido"; nunca converter para 0.
- A tabela `readings` é larga (uma coluna por grandeza); sensor novo exige migração.
- Perfis: `admin` (tudo) e `operator` (somente leitura, mais reconhecer alertas e exportar CSV).
- O MQTT exposto na internet usa sempre TLS (8883), com credencial própria por estação.

## Convenções

- Comunicação com o usuário, interface e documentação (`docs/`, README): **pt-BR**.
- Código (identificadores e comentários), schemas, migrations e mensagens de commit: **inglês**.
- Commits no padrão Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`…).
- TypeScript estrito; validação com zod em todas as bordas (MQTT, HTTP, variáveis de ambiente).
- Datas sempre em UTC no banco (`timestamptz`); agregações diárias no fuso da estação (padrão `America/Sao_Paulo`).
- Nunca editar uma migração já aplicada: gerar uma nova com o drizzle-kit.
- Antes de tarefas não triviais: apresentar o plano e aguardar aprovação. Antes de alterar vários arquivos: listar o que vai mudar.

## Comandos

| Comando | O que faz |
|---|---|
| `cp .env.example .env` | Primeiro passo; valores de desenvolvimento |
| `pnpm infra:up` / `infra:down` / `infra:logs` | Postgres (`127.0.0.1:5442`) e Mosquitto (`127.0.0.1:1883`) de dev |
| `pnpm db:migrate` | Aplica migrações + configurações padrão (`DATABASE_URL`) |
| `pnpm --filter @wx/db exec drizzle-kit generate --name <nome>` | Gera migração nova a partir de `packages/db/src/schema` |
| `pnpm mqtt:bootstrap` | Configura papéis/ACLs e o cliente `collector` no broker (idempotente) |
| `pnpm db:seed` | Estações de demonstração (`sede`, `pivo-norte`, `talhao-sul`) + credenciais em `tools/simulator/.stations.json` (git-ignored) |
| `pnpm dev:collector` | App 1 com recarga automática (tsx watch) |
| `pnpm simulate [--backfill 7d] [--interval 10] [--chaos [--chaos-rate N]] [--only a,b]` | Estações virtuais (contrato v1 completo) |
| `pnpm check` | Biome + typecheck (todos os pacotes) + testes unitários |
| `pnpm test:int` | Testes de integração (exigem `pnpm infra:up`; usam o banco `weather_test`) |
| `pnpm format` | Formata e organiza imports |

## Notas técnicas (armadilhas já encontradas)

- **Portas ocupadas na máquina de dev:** 5432 (Postgres local) e 3000. Por isso o Postgres de dev usa 5442; o servidor do dashboard precisará de outra porta em dev.
- **Mosquitto 2.1:** `per_listener_settings` está obsoleto (não usar); `MOSQUITTO_DYNSEC_PASSWORD` precisa de **≥ 12 caracteres**, senão a config inicial do Dynamic Security não é gerada. O `admin` gerado já vem com os papéis `super-admin`, `sys-observe` e `topic-observe`.
- **Dynamic Security:** `addClientRole` repetido responde só "Internal error" — por isso `mqtt-admin` sempre consulta (`getClient`/`getRole`) antes de alterar. Desativar ou excluir um cliente derruba a conexão dele na hora.
- **mqtt.js 5:** `subscribeAsync` rejeita a chamada inteira se qualquer filtro for negado (SUBACK 0x80).
- **pnpm 11:** dependências com script de build precisam de `allowBuilds` em `pnpm-workspace.yaml`; `pnpm <script> -- --flag` repassa o `--` literalmente (use `pnpm --filter <pkg> exec ...`).
- **Postgres 18 (imagem Docker):** o volume vai em `/var/lib/postgresql` (não em `/data`). `uuidv7()` é nativo.
- **`packages/shared`** roda no Node e no navegador: `lib` = `es2024` + `webworker` (sem DOM e sem tipos do Node).
- **Pacotes internos** são consumidos como código-fonte TS (`exports` → `src/index.ts`); apps usam tsx em dev e bundle em produção. Bundles precisam passar `migrationsFolder` explicitamente para `prepareDatabase()`.
- **Testes de integração do MQTT** usam um cliente próprio com o papel `collector`, nunca o client id `collector` (para não apagar a sessão persistente do coletor real). Efeito colateral esperado: o broker guarda para a sessão do coletor de dev as mensagens das estações de teste (`itest-*`, `itc-*`), que viram logs `UNKNOWN_STATION` no banco de dev quando ele volta.
- **Coletor — ack após commit:** `client.handleMessage` do mqtt.js é sobrescrito; o PUBACK só sai quando o callback é chamado. Se o banco cair, o consumidor desconecta sem confirmar (`pause`) e reconecta quando `select 1` volta a funcionar; o broker reentrega. Por isso **todo handler precisa ser idempotente** (leituras: `(station_id, run, seq)`; diagnósticos: `(station_id, ts)`).
- **Classificação de falhas no coletor:** não há lista de códigos de erro do Postgres. Se o handler falha e `select 1` também, é queda do banco (pausa); se o banco responde, tenta de novo uma vez e depois descarta com log `PROCESSING_FAILED`.
- **Status retido:** ao (re)assinar, o broker reenvia os `status` retidos; o coletor só os aplica para estação com estado desconhecido e nunca os conta como contato.
- **`tsx`, `typescript` e `vitest` ficam na raiz** do monorepo (`node_modules/.bin` da raiz).
- **Simulador:** `--interval` só acelera as leituras; o monitor usa o intervalo configurado no banco (60 s). Intervalo maior que o configurado gera alerta de estação sem contato. O `--backfill` consulta a última leitura de cada estação no banco para não duplicar histórico.

## Estado atual

- **Fase 1 — Fundação:** concluída (2026-10-22).
- **Fase 2 — Coletor + simulador:** concluída (2026-10-23).
- **Próxima:** Fase 3 — App 2 (API do Dashboard). O primeiro admin (`ADMIN_EMAIL`/`ADMIN_PASSWORD`) ainda não existe: o hash de senha (argon2id) entra com a API.
- **Hardware do usuário:** D1 mini, BME280, anemômetro e pluviômetro impressos em 3D (modelos MakerWorld), bateria de lítio e talvez um painel solar pequeno.
- **Produção:** VPS com Coolify **ou** servidor local com Cloudflare Tunnel (painel) e port forward (MQTT 8883).

## Registro de atualizações

### 2026-10-22 — Concepção e design
- Análise dos 4 PDFs de referência (pluviômetros MakerWorld e Instructables, anemômetro MakerWorld, estação ESP32 Instructables).
- Brainstorming com o usuário:
  - Firmware próprio em C++.
  - Bateria de lítio, com solar opcional e perfis automáticos de energia.
  - Produção em VPS ou servidor local (Cloudflare Tunnel + port forward do MQTT).
  - Tema visual meteorológico próprio.
  - Arquitetura com o banco como ponto de integração.
- Design aprovado e documentado; plano de implementação em 7 fases.
- Repositório git inicializado (os PDFs de referência ficam fora do versionamento).

### 2026-10-22 — Fase 1: Fundação
- **Monorepo:** pnpm 11, TypeScript 7 (estrito), Biome 2.6, Vitest 5 com os projetos `unit` e `integration`.
- **Infra de dev** (`infra/compose.dev.yml`):
  - Postgres 18.6 (porta 5442), com o banco `weather_test` criado automaticamente.
  - Mosquitto 2.1.2 com Dynamic Security, porta 1883 só em localhost.
- **`@wx/shared`:**
  - Contrato MQTT v1 em zod (telemetry, status, health, event, config, cmd).
  - Faixas físicas de validação e códigos de evento.
  - Domínio, padrões (configuração do dispositivo, calibração, settings) e cálculo da chuva por diferença.
  - Fórmulas: ponto de orvalho, pressão ao nível do mar, altitude, índice de calor, wind chill, sensação térmica, tendência da pressão, Beaufort e % de bateria.
  - 106 testes unitários.
- **`@wx/db`:**
  - Esquema Drizzle com as 12 tabelas da §5.2 (CHECKs gerados dos enums do `shared`; alertas com índices únicos parciais).
  - Migração `0000_initial_schema`.
  - `prepareDatabase()` com advisory lock.
  - `LISTEN/NOTIFY` tipado (`notifyStatement` dentro de transações, `startListener` com reconexão) e `getSettings()`.
- **`@wx/mqtt-admin`:**
  - Cliente da API do Dynamic Security.
  - Papéis `station`, `collector` e `dashboard-ops` sincronizados por diferença de ACLs.
  - Provisionamento, rotação, desativação e remoção de estações (com limpeza dos retidos).
  - CLI `pnpm mqtt:bootstrap`.
- **Testes de integração** (17, contra serviços reais):
  - Banco: migração do zero, concorrência, constraints, UUIDv7, NOTIFY só após commit.
  - Broker: isolamento entre estações, client id obrigatório, troca de senha, desativação derrubando a conexão, remoção limpando os retidos.

### 2026-10-23 — Fase 2: Coletor (App 1) e simulador
- **`apps/collector`:**
  - Consumidor MQTT com sessão persistente e ack depois do commit. Se o banco cai, a coleta pausa e é retomada sem perda.
  - Roteador com validação do contrato e handlers de telemetria, status, saúde e evento, cada um numa transação com `NOTIFY` entregue no commit.
  - Processamento puro da telemetria: calibração, derivados, chuva por diferença, faixas físicas e janela de horário.
  - Estado da estação, situação dos sensores e alertas (`station_offline`, `sensor_stale`, `sensor_error`, `battery_low`/`critical`, `data_dropped`) com abertura e resolução automáticas.
  - Monitor a cada 60 s, heartbeat a cada 30 s, retenção a cada 6 h.
  - Logs em pt-BR no `event_logs`, com limitação de repetição (1 a cada 10 min por estação e problema).
- **`tools/simulator`:**
  - Modelos de clima (ciclo diário, frentes, maré barométrica, chuva por cadeia de Markov) e de energia (Li-ion, solar, perfis com histerese, brownout).
  - Estação virtual que segue o contrato v1 como o firmware deverá seguir: perfis normal/economia/sobrevivência, buffer com envio posterior, configuração retida, comandos e caos.
  - `pnpm db:seed` cria as 3 estações de demonstração; `pnpm simulate --backfill 7d` publica o histórico sem duplicar.
- **Ajustes:**
  - Migração `0001`: `device_health (station_id, ts)` passou a ser único, para deduplicar reentregas.
  - `statement_timeout` no pool.
  - `stationLabel()` evita "Estação Estação Sede".
  - Retidos de estações desconhecidas ou inativas são ignorados.
- **Validação:**
  - 135 testes unitários e 31 de integração.
  - 14 cenários do coletor contra serviços reais, inclusive queda do banco no meio da coleta, sem perda.
  - Ponta a ponta: 26,4 mil leituras de 7 dias gravadas, com derivados coerentes (pressão ao nível do mar ≈ 1013 hPa). O caos exercitou LWT, falta de energia (novo `run`), envio do buffer depois da reconexão, duplicatas descartadas e payload inválido registrado.
- **Pendente para a Fase 3:** criar o primeiro admin (precisa do argon2id da API).
