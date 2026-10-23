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
| `pnpm dev` | Coletor + API do dashboard (3300) + Vite (5173), em paralelo |
| `pnpm dev:collector` / `pnpm dev:dashboard` | Só o App 1, ou só a API + Vite do App 2 |
| `pnpm --filter @wx/dashboard build` | SPA em `apps/dashboard/dist/web`; a API a serve quando `WEB_DIST` aponta para lá |
| `pnpm --filter @wx/dashboard e2e` | Playwright contra o sistema rodando (`E2E_BASE_URL`, padrão `http://localhost:5173`) |
| `pnpm simulate [--backfill 7d] [--interval 10] [--chaos [--chaos-rate N]] [--only a,b]` | Estações virtuais (contrato v1 completo) |
| `pnpm check` | Biome + typecheck (todos os pacotes, inclusive web e e2e) + testes unitários |
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
- **Drizzle — consultas cruas (`db.execute(sql…)`):** `timestamptz` volta como **texto** (o driver do drizzle desliga o parser do `pg`). Use `toDate`/`toIso` (`apps/dashboard/src/server/services/sql-values.ts`) ou devolva epoch ms no SQL: `(extract(epoch from x) * 1000)::float8`. Consultas tipadas (`db.select()`) já devolvem `Date`.
- **Drizzle — arrays no template `sql`:** `${[a, b]}` vira `($1, $2)`. Use `col in ${ids}`; `= any(${ids})` gera SQL inválido.
- **Fastify 5.12:** `disableRequestLogging` está obsoleto; use `logController: new LogController({ disableRequestLogging: true })`.
- **Escrita de arquivos por ferramenta:** escapes `\uXXXX` dentro do conteúdo viram o caractere literal (invisível no caso de BOM e acentos combinantes). Use `String.fromCharCode(0xfeff)` ou classes como `\p{M}`.
- **Dashboard em dev:** servidor em `127.0.0.1:3300` (`HOST`/`PORT`; o padrão `0.0.0.0` é para containers); `APP_URL=http://localhost:5173` (Vite) é a origem aceita pelo CSRF; o proxy do Vite aponta para `127.0.0.1`.
- **Web — MapLibre 6:** o worker é um arquivo separado; `components/map/base-map.ts` chama `setWorkerUrl()` com o `?url` do Vite. O CSS do MapLibre não está em `@layer` e por isso vence os utilitários do Tailwind 4 (que estão): o contêiner entregue ao mapa ganha `position: relative` e perde o `absolute inset-0` (o mapa fica com altura 0). A caixa posicionada fica num wrapper; os controles são tematizados em `map-theme.css`, importado depois do CSS do MapLibre.
- **Web — WebGL2 é opcional:** o mapa (MapLibre 6) e as cenas 3D (three) exigem WebGL2. Sem ele (aceleração gráfica desligada ou GPU bloqueada pelo navegador), o construtor do MapLibre lança `GPUInitializationError`, que derrubava a tela inteira. Agora `supportsWebGL2()` (`lib/webgl.ts`) decide antes, a criação do mapa fica em `try/catch`, há `ErrorBoundary` em volta e o aviso `NoWebGL` ocupa o lugar. O projeto `no-webgl` do Playwright (`--disable-3d-apis`) cobre esse caminho.
- **Web — rótulos 3D:** o `<Html>` do drei cria uma raiz React por rótulo, e o StrictMode do React 19 desmonta raízes durante o render ("synchronously unmount a root"), perdendo rótulos. Use `ScreenAnchors` (`components/station/scene/screen-anchors.tsx`): elementos DOM comuns posicionados por projeção a cada quadro.
- **Web — three 0.186 / R3F 9:** `shadows` sem valor pede PCFSoft, que foi removido; use `shadows="percentage"`. Em `frameloop="demand"` (reduzir movimento) é preciso `invalidate()` quando só o DOM muda.
- **Web — ECharts:** as cores vêm de variáveis CSS lidas em tempo de execução (`chartTokens()`), então o `theme` precisa estar nas dependências do `useMemo` da opção (com `biome-ignore` justificado). Séries de estações em economia são esparsas: na comparação cada linha tem o próprio eixo de tempo (`LineSeries.t`) e as quebras usam o passo típico da própria série (`withGaps`).
- **Web — cores das séries de estações:** posições fixas `--series-1…6` (`lib/series-colors.ts`); a cor segue a estação, nunca a posição na seleção.
- **Web — 401 no console:** com a sessão expirada, `/auth/me` responde 401 e o navegador registra o erro de rede; é esperado (o guard manda para o login).
- **Playwright:** no headless, WebGL (mapa e cenas 3D) precisa de `--use-angle=swiftshader` (já no `playwright.config.ts`). O login aceita 5 tentativas por minuto por IP+e-mail: a suíte faz 2 logins do admin, então rodá-la 3 vezes no mesmo minuto dá 429.
- **Biome:** `css.parser.tailwindDirectives` ligado (para `@theme`); `noLabelWithoutControl` conhece `Input`, `Select` e `PasswordInput` como controles.
- **Simulador:** `--interval` só acelera as leituras; o monitor usa o intervalo configurado no banco (60 s). Intervalo maior que o configurado gera alerta de estação sem contato. O `--backfill` consulta a última leitura de cada estação no banco para não duplicar histórico.

## Estado atual

- **Fase 1 — Fundação:** concluída (2026-10-22).
- **Fase 2 — Coletor + simulador:** concluída (2026-10-23).
- **Fase 3 — API do Dashboard:** concluída (2026-10-23).
- **Fase 4 — Web:** concluída (2026-10-23), com o teste de ponta a ponta usando os dados fictícios do simulador.
- **Próximo passo:** checkpoint com o usuário antes das Fases 5 (firmware) e 6 (deploy).
- O primeiro admin (`ADMIN_EMAIL`/`ADMIN_PASSWORD`) é criado pela API ao subir (hash argon2id).
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

### 2026-10-23 — Fase 3: API do Dashboard (App 2)
- **`apps/dashboard/src/server`** (Fastify 5):
  - Autenticação com argon2id (parâmetros OWASP) e sessão com token só no cookie (`HttpOnly`, `SameSite=Strict`) e SHA-256 no banco. Expiração deslizante (12 h; 30 dias com "manter conectado").
  - Proteções do login: limite de 5 tentativas por minuto por IP+e-mail, bloqueio de 15 min após 10 falhas, tempo constante para e-mail inexistente.
  - Senha provisória com troca obrigatória no primeiro acesso.
  - CSRF com cabeçalho `x-wx-request: 1` e conferência do `Origin`.
  - Perfis por rota (`config.auth`: public, user, admin). Regras: o admin não remove o próprio acesso e o sistema nunca fica sem admin ativo.
  - Estações: cadastro atômico (banco + credencial MQTT + config retida), edição, desativação (derruba a conexão no broker), exclusão confirmada pelo código, rotação de senha, configuração remota com revisão e comandos com validade.
  - Dados: últimos valores com derivados (sensação térmica, Beaufort, tendência de 3 h, taxa de chuva) e totais de chuva no fuso da estação; séries com bucket automático; resumo diário; mapa de calor; comparação; CSV no padrão do Excel pt-BR.
  - Operação: dispositivos, histórico de saúde e de conexão, alertas com reconhecimento, logs com filtros e busca, status do sistema (coletor, broker via `$SYS`, banco) e configurações validadas.
  - SSE em `/api/v1/stream`, alimentado por `LISTEN/NOTIFY`. Leituras agregadas por estação a cada 1 s (aguenta o backfill); a sessão é revalidada a cada ~100 s.
  - Monitor: alerta `collector_down` pelo heartbeat do coletor, expiração de comandos e limpeza de sessões.
- **`@wx/db`:** `openAlert`/`resolveAlerts` e `writeEventLog` agora são compartilhados pelos dois apps; migração `0002` (`sessions.remember`).
- **Validação:** 23 testes de integração da API, contra Postgres e Mosquitto reais. No total: 135 unitários e 54 de integração.

### 2026-10-23 — Fase 4: Web do Dashboard (App 2)
- **Base** (`apps/dashboard/src/web`): React 19, Vite 8, React Router 8 (rotas com `lazy`, uma página por chunk), TanStack Query 5, Tailwind 4 e primitivas Radix (sem shadcn).
  - Guards de sessão, troca obrigatória da senha provisória e telas de admin protegidas (operador vê "acesso restrito"; a API também recusa).
  - 401 global limpa a sessão; SSE invalida as consultas por prefixo (leituras a cada 2 s no máximo).
- **Identidade "painel de instrumentos ao anoitecer":**
  - Moldura ardósia monocromática; cor só para dados e status.
  - Archivo em três larguras; tokens nos temas escuro (padrão) e claro.
  - Paleta por grandeza validada com o `validate_palette.js` (§8.8 do design).
- **Telas:**
  - Visão geral: mapa MapLibre inclinado com colunas extrudadas por estação e rótulos diretos; alertas, sistema e o "rack" de instrumentos.
  - Estação:
    - Cena 3D em React Three Fiber: anemômetro na velocidade medida (pela calibração), chuva quando o pluviômetro conta, céu e sombras pela posição do sol no local, LED na cor do status.
    - Valores ao vivo, sensores e gráficos ECharts com visão em tabela, filtro de período na URL e CSV.
    - Mapa de calor hora × dia (plano ou 3D), calendário de chuva de 12 meses e resumo diário com CSV.
  - Comparar, Dispositivos (bateria com limiares, sinal, linha do tempo de conexão), Alertas, Logs (filtros na URL, detalhe JSON) e Meu perfil.
  - Administração:
    - Estações: mapa para marcar o local, altitude pelo Open-Meteo, calculadora do anemômetro, configuração remota com revisão, credenciais exibidas uma vez, comandos, desativar/excluir com confirmação pelo código.
    - Usuários e configurações.
- **Testes:**
  - 22 testes unitários novos (cores das séries, quebras de série, período, posição do sol, céu, formatação).
  - 10 testes Playwright: login, redirecionamento, navegação, admin cadastra e exclui estação, operador troca a senha e não acessa a administração.
- **Validação de ponta a ponta com o simulador** (coletor, API, Vite e 3 estações a cada 10 s):
  - Screenshots de todas as telas no tema escuro; visão geral e estação também no tema claro e no celular (390 px).
  - Build de produção servido pela API com o CSP real: mapa, workers e 3D sem violações.
  - Tempo real conferido: cada leitura dispara um refetch via SSE.
- **Correções encontradas no teste:** altura zero do mapa (CSS do MapLibre), rótulos 3D perdidos (drei `<Html>`), estação esparsa invisível na comparação, rótulos repetidos no eixo da bateria e corrida no redirecionamento depois da troca de senha.
- **No total:** 157 testes unitários, 54 de integração (não reexecutados nesta fase, que não alterou servidor, coletor nem pacotes) e 10 E2E.

### 2026-10-23 — Correção: navegador sem WebGL2
- **Problema relatado pelo usuário:** logo após o login, a tela inteira caía ("Não foi possível abrir esta tela") com `GPUInitializationError: WebGL2 is required`. O navegador estava sem aceleração gráfica, e o erro do mapa derrubava a página.
- **Correção:**
  - Detecção de WebGL2 antes de criar o mapa ou as cenas.
  - Aviso com orientação no lugar do mapa da visão geral, do mapa do cadastro, da cena 3D da estação e da opção "3D" do mapa de calor.
  - `ErrorBoundary` em volta dos mapas.
  - O resto da tela (lista de estações, valores ao vivo, gráficos) continua funcionando.
- `hydrateFallbackElement` no roteador (fim do aviso `HydrateFallback` no console).
- **Testes:** novo E2E `no-webgl` (11 no total).
