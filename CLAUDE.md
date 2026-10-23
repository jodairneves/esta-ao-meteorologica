# CLAUDE.md — Estação Meteorológica

Sistema de monitoramento de estações meteorológicas DIY (Wemos D1 mini/ESP8266 + BME280, anemômetro e pluviômetro): coleta via MQTT, armazenamento em PostgreSQL e dashboard web com visualização 3D.

## Documentos-chave

- **Design (fonte da verdade):** `docs/superpowers/specs/2026-10-22-estacao-meteorologica-design.md`
- **Plano por fases:** `docs/superpowers/plans/2026-10-22-plano-de-implementacao.md`
- **Referências de hardware:** o que foi aproveitado dos PDFs de terceiros está resumido na §1.4 do design. Os PDFs nunca foram versionados e o usuário os removeu do projeto em 2026-10-23.
- **Manual de ligação dos sensores:** `docs/manual-de-ligacao.pdf` (gerado por `pnpm docs:manual`).
- **Deploy:** `docs/deploy.md` (Coolify na VPS e em casa, backup e restauração, ensaio local).

## Visão geral

- **App 1 — Coletor** (`apps/collector`): único consumidor da telemetria MQTT. Valida, calibra, calcula derivados, grava no PostgreSQL, monitora estações e sensores e abre alertas.
- **App 2 — Dashboard** (`apps/dashboard`): API Fastify (`src/server`) + SPA React (`src/web`). Lê só do banco; o tempo real vem por `LISTEN/NOTIFY` → SSE. Provisiona as credenciais MQTT (Dynamic Security) e envia comandos às estações.
- **Pacotes:** `packages/shared` (contrato MQTT em zod, domínio, fórmulas meteorológicas; roda no Node e no navegador), `packages/db` (esquema Drizzle, migrações, NOTIFY), `packages/mqtt-admin` (Dynamic Security do Mosquitto).
- **Firmware** (`firmware/`): PlatformIO para D1 mini, com perfis de energia Normal/Economia/Sobrevivência. Guias em `docs/hardware.md` e `docs/calibracao.md`.
- **Contrato MQTT v1:** `weather/v1/{code}/{telemetry|status|health|event|config|cmd}` (§3 do design).
- **Produção:** `docker-compose.yaml` na raiz (Coolify), `Dockerfile` com os alvos `collector` e `dashboard`, `infra/mosquitto` e `infra/backup`; variáveis em `.env.production.example`.

## Decisões que não devem ser revertidas sem conversar com o usuário

- O banco é o ponto de integração entre os apps: o Dashboard não assina telemetria no MQTT.
- O coletor só envia PUBACK depois do commit; erro de banco = nova tentativa, nunca descarte.
- Vento e chuva chegam brutos (pulsos e contador); a calibração é aplicada no servidor, por estação.
- A chuva é um contador acumulado por `run` (memória RTC da estação), com a diferença calculada no servidor (§6.1 do design).
- `null` significa "não medido"; nunca converter para 0.
- A tabela `readings` é larga (uma coluna por grandeza); sensor novo exige migração.
- Perfis: `admin` (tudo) e `operator` (somente leitura, mais reconhecer alertas e exportar CSV).
- Duas versões de estação: **completa** (BME280) e **HTU21D** (sem pressão nem altitude). A versão é definida no cadastro (`stations.climate_sensor`); um único firmware detecta o sensor ligado. O contrato MQTT continua na v1 (`pres: null` e `health.sensors.htu21d`).
- O mapa usa o OpenFreeMap (gratuito, sem chave e sem garantia de funcionamento) e a altitude do cadastro usa o Open-Meteo (plano grátis só para uso não comercial). O usuário confirmou que o uso **não é comercial** (2026-10-23).
- O MQTT exposto na internet fica na **1883 sem TLS** (decisão do usuário em 2026-10-23; risco registrado no design §3.10), com credencial própria por estação. O MQTT via WebSocket também foi recusado. O firmware continua pronto para TLS na 8883, mas só ligar se o usuário pedir.
- Produção: o compose traz o Mosquitto do projeto (o broker que o usuário já tem não é usado).
- A estação serve uma página de configuração na rede local (servidor MQTT e Wi-Fi), pedido do usuário em 2026-10-23. A senha dela é gerada pelo painel, fica legível em `stations.local_password` (só admins, com auditoria) e vai para a estação na configuração retida.

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
| `pnpm db:seed` | Estações de demonstração (`sede`, `pivo-norte`, `talhao-sul` e `horta`, esta da versão HTU21D) + credenciais em `tools/simulator/.stations.json` (git-ignored); gera senhas novas a cada execução |
| `pnpm dev` | Coletor + API do dashboard (3300) + Vite (5173), em paralelo |
| `pnpm dev:collector` / `pnpm dev:dashboard` | Só o App 1, ou só a API + Vite do App 2 |
| `pnpm --filter @wx/dashboard build` | SPA em `apps/dashboard/dist/web`; a API a serve quando `WEB_DIST` aponta para lá |
| `pnpm --filter @wx/dashboard e2e` | Playwright contra o sistema rodando (`E2E_BASE_URL`, padrão `http://localhost:5173`) |
| `pnpm simulate [--backfill 7d] [--interval 10] [--chaos [--chaos-rate N]] [--only a,b]` | Estações virtuais (contrato v1 completo) |
| `pnpm check` | Biome + typecheck (todos os pacotes, inclusive web e e2e) + testes unitários |
| `pnpm test:int` | Testes de integração (exigem `pnpm infra:up`; usam o banco `weather_test`) |
| `pnpm format` | Formata e organiza imports |
| `cd firmware && pio run` / `pio run -t upload` / `pio device monitor` | Compila o firmware, grava pelo USB e mostra o log serial (115200) |
| `firmware/scripts/test-native.sh [-f test_x]` | Testes nativos do firmware (`pio test -e native`); sem `g++` na máquina, roda num contêiner Docker |
| `pnpm docs:manual` | Gera `docs/manual-de-ligacao.pdf` (manual de ligação dos sensores) a partir de `docs/manual-de-ligacao/gerar.mjs`, com o Chromium do Playwright |
| `firmware/scripts/serial-log.py [--seconds N] [--portal]` | Log serial do D1 mini sem terminal interativo (bom para rodar em segundo plano); `--portal` abre o portal com reset duplo pelo USB |
| `DEV_MQTT_BIND=0.0.0.0` no `.env` + `pnpm infra:up` | Expõe o Mosquitto de dev na rede local, só durante o teste em bancada |
| `node scripts/bundle-server.mjs <collector\|dashboard>` | Bundle ESM do servidor, com um `package.json` das dependências que ficam fora (o `Dockerfile` usa) |
| `docker compose -p wx-rehearsal --env-file .env.rehearsal -f docker-compose.yaml -f infra/compose.rehearsal.yml up -d --build --wait` | Ensaio local da produção: painel em `localhost:3400` e, com `MQTT_HOST_PORT=127.0.0.1:1884`, broker em `127.0.0.1:1884`; `down -v` apaga tudo (`docs/deploy.md`, seção 7) |

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
- **`pnpm db:migrate`** sempre termina com "Database is up to date.", mesmo quando acabou de aplicar migrações (a frase quer dizer "agora está atualizado").
- **Coletor e API aplicam migrações sozinhos ao subir** (`prepareDatabase`), e o `pnpm dev` (tsx watch) reinicia quando o esquema muda. Antes de gerar uma migração, pare o `pnpm dev` se ela não deve ser aplicada ainda; o usuário pede confirmação explícita antes de migrar o banco de dev.
- **Cores das estações na comparação:** as posições seguem a ordem de cadastro (ids UUIDv7), para que uma estação nova não mude as cores das antigas.
- **Simulador:** `--interval` só acelera as leituras; o monitor usa o intervalo configurado no banco (60 s). Intervalo maior que o configurado gera alerta de estação sem contato. O `--backfill` consulta a última leitura de cada estação no banco para não duplicar histórico.
- **Firmware — testes nativos:** a máquina de dev não tem `g++` (`sudo dnf install gcc-c++` resolveria). O `scripts/test-native.sh` cai para um contêiner (`scripts/native-test.Dockerfile`: Python 3.12, g++ e PlatformIO 6.1.19), roda com o usuário da máquina e guarda os pacotes em `~/.cache/wx-pio-native`.
- **Firmware — biblioteca MQTT:** é a 256dpi/arduino-mqtt (o design original citava a espMqttClient). O `publish` com QoS 1 bloqueia até o PUBACK (timeout de 10 s), o que garante que a leitura só sai do buffer depois da confirmação. O callback de mensagem não pode usar o cliente (risco de deadlock): `config` e `cmd` vão para uma caixa de entrada (4 × 512 bytes) tratada no loop.
- **Firmware — RAM:** 58% de RAM estática (47,5 KB) e 53% da flash. O risco é o heap com TLS: com Max Fragment Length os buffers do BearSSL ficam em 1024 bytes; sem ele, o de entrada passa de 16 KB. Conferir a "Memória livre" em bancada (meta: acima de ~8 KB). `PIO_FRAMEWORK_ARDUINO_LWIP2_LOW_MEMORY` está ligado.
- **Firmware — avisos:** `-Wall -Wextra` valem só para o código do projeto (`build_src_flags`); as bibliotecas compilam com os avisos padrão.
- **Firmware — deep sleep:** o relógio do sistema não sobrevive; cada despertar refaz o NTP. O que precisa sobreviver fica na memória RTC (`RtcState`, até 512 bytes, com CRC32). Dois resets em até 3 s abrem o portal (flag `resetArmed` na RTC).
- **Firmware — contrato:** `test/test_payload` compara o JSON exato. Ao mudar o contrato, confira esses JSON com os esquemas zod do `shared`: na Fase 5 isso foi feito com um teste temporário que imprime os payloads, validados por um script `tsx`.
- **Firmware — gravação e log serial:**
  - A placa do usuário aparece como `/dev/ttyUSB0` (CH340, MAC `cc:50:e3:08:08:e6`); o usuário está no grupo `dialout`.
  - O `pio device monitor` precisa de terminal interativo; daqui, use `firmware/scripts/serial-log.py` (pyserial do `python3` do sistema).
  - Abrir a porta reinicia a placa, mesmo com DTR e RTS desligados no pyserial (o kernel os liga ao abrir). Um pulso no RTS é outro reset, como faz o esptool.
  - Depois de gravar, a placa às vezes abre o portal: o reset do fim da gravação e o da abertura da serial (ou dois do próprio esptool) contam como reset duplo. Um reset simples sai do portal, porque o boot que abre o portal desarma o reset duplo; ou, em 5 min sem uso, ele expira e a placa segue com a configuração salva. Para conferir sem reiniciar, não abra a serial: teste a página local por `curl` ou procure a rede `Estacao-XXXXXX`.
  - O ROM do ESP8266 imprime a 74880 baud, então as primeiras linhas saem ilegíveis a 115200.
- **Firmware — portal e memória:** o WiFiManager monta a página inteira num `String`, e o `String` do ESP8266 cresce sob medida com `realloc`. Sem um bloco contíguo, o `concat` devolve `false` e o trecho some sem erro. Com 16 redes por perto, os campos do servidor sumiram. Hoje a página tem ~7 KB com 16 redes, e o cliente MQTT só reserva os buffers no `Link::begin()`. Na bancada, o log mostrou ~19 KB livres (maior bloco ~13–19 KB) ao abrir o portal; se crescer a página, meça de novo.
- **Firmware — página local** (`src/net/local_page.cpp`, lógica pura em `core/local_form`, `core/config_trial` e `core/html`):
  - Só no perfil Normal, com o Wi-Fi conectado (mesmo com o MQTT falhando). HTTP Basic com usuário `admin`; a senha é a `local_password` da configuração ou, antes da primeira, a do portal. Um token por boot protege os formulários contra envio por outro site.
  - Daqui dá para testar com `curl -u admin:SENHA http://IP-DA-ESTACAO/`, porque o computador está na mesma rede que a placa. A senha está em `stations.local_password` no banco de dev.
  - O `WiFi.disconnect()` do core **apaga** as credenciais, e na flash se `persistent(true)`, que é o padrão. O `Link::begin()` liga `persistent(false)` logo no início, e a rede nova só vai para a flash no `Link::saveWifi()`, quando o teste dá certo.
  - Alterações valem primeiro só na RAM, por até 2 min (`ConfigTrial`). Com servidor ou credenciais novos, a configuração retida que chega durante o teste é ignorada; quando a alteração é mantida, a `rev` volta a 0 e o MQTT reconecta para buscá-la de novo.
  - No ESP8266, string comum fica na RAM. A página vai em pedaços a partir da flash (`PSTR`, `sendContent_P`), e as mensagens do `core` usam `WX_TEXT` (`core/flash_text.h`), que vira `PSTR` no ESP8266 e texto comum nos testes nativos. O estado do teste só é alocado durante uma alteração. Resultado: 59,4% de RAM estática.
  - Nome na rede (DHCP): `estacao-{código}`, cortado em 32 caracteres (o `WiFi.hostname()` do core recusa nomes maiores).
- **Firmware — rede do usuário:** Wi-Fi UniFi (Ubiquiti) com a mesma rede `X` em 2,4, 5 e 6 GHz; o computador fica nos 6 GHz e o D1 mini nos 2,4 GHz, e eles se enxergam. Na primeira conexão houve conflito de IP: a placa recebeu 10.25.50.110, que um aparelho Samsung também usava (o ARP do computador apontava para o MAC dele). Na reconexão ela pegou 10.25.50.111.
- **Firmware — portal (WiFiManager 2.0.17):**
  - Os textos em pt-BR ficam em `firmware/include/wm_strings_pt_br.h`, escolhido por `-DWM_STRINGS_FILE`. A biblioteca é compilada à parte do projeto e só encontra o arquivo por causa do `-I include` nas `build_flags`.
  - Ao atualizar a biblioteca, compare o `wm_strings_en.h` novo com o nosso: os símbolos precisam ser os mesmos.
  - O SCons não enxerga o `#include WM_STRINGS_FILE` (include por macro): depois de editar o arquivo de textos, apague `.pio/build/d1_mini/lib*/WiFiManager/WiFiManager.cpp.o` ou rode `pio run -t clean`; senão o binário sai com os textos antigos.
  - O menu padrão inclui "Update" (envio de firmware pelo navegador), e o `setShowInfoUpdate(false)` não o esconde. Por isso o menu é só `wifi`, e o `setPreOtaUpdateCallback` reinicia a placa se alguém tentar enviar firmware pela rota `/update`, que continua registrada.
  - Os templates não têm lugar para um título acima da lista de redes; o título entra por JS no `HTTP_SCRIPT`.
  - O portal cativo já vem da biblioteca: o DHCP do AP entrega a placa como DNS, o DNS responde 192.168.4.1 para tudo e as rotas desconhecidas recebem 302. A raiz `/` redireciona direto para `/wifi`, por uma rota registrada no `setWebServerCallback` (ele roda antes das rotas da biblioteca, e no `ESP8266WebServer` vence a primeira rota registrada).
- **mqtt.js 5 e login recusado:** depois de um CONNACK com erro (ex.: "Not authorized"), o mqtt.js para de reconectar. O coletor e o painel usam `reconnectOnConnackError: true`, porque num deploy novo o coletor sobe antes de o painel criar o login dele.
- **Dynamic Security derruba conexões:**
  - quando os papéis de um cliente mudam: no primeiro start o `admin` ganha `dashboard-ops`, e o painel cai uma vez (aviso `broker closed the connection during the bootstrap`) e reconecta;
  - quando a senha é regravada: o painel regrava a do `collector` a cada start, e o coletor reconecta.
- **Bundle dos servidores (esbuild, ESM, `scripts/bundle-server.mjs`):**
  - O banner cria `require` com `createRequire`, porque o código CommonJS chama `require` para os módulos do Node.
  - `__dirname` só aparece nos transportes do pino, que a produção não usa.
  - O argon2 (nativo) fica fora do bundle; o `package.json` gerado ao lado o instala na versão do lockfile.
  - `--disable-warning=DEP0169` cala o aviso do `url.parse()` que o mqtt.js usa.
- **Coolify:**
  - O domínio do serviço leva a porta (`https://estacao…:3000`).
  - `${VAR:?}` bloqueia o deploy até a variável ser preenchida.
  - `ports:` publica direto no host; só o MQTT usa.
  - As configurações vão dentro das imagens (sem bind mount).
- **Produção — senhas:** `POSTGRES_PASSWORD` e `MOSQUITTO_DYNSEC_PASSWORD` só valem quando o volume é criado (mudar a variável depois tira o acesso dos apps). A do `collector` o painel reaplica a cada start.
- **Backup (`infra/backup`):**
  - O `dynamic-security.json` é 0600 do usuário `mosquitto`, por isso o container de backup roda como root.
  - A restauração troca os bancos com `ALTER DATABASE … RENAME`, que falha com conexões abertas: é a trava contra restaurar com o coletor ou o painel ligados.
- **Firmware — deep sleep na bancada:** sem o fio D0–RST a placa não acorda sozinha. O portal sem configuração dorme depois de 5 min; o botão RESET a traz de volta ao portal (o reset chega como "Deep-Sleep Wake").

## Estado atual

- **Fase 1 — Fundação:** concluída (2026-10-22).
- **Fase 2 — Coletor + simulador:** concluída (2026-10-23).
- **Fase 3 — API do Dashboard:** concluída (2026-10-23).
- **Fase 4 — Web:** concluída (2026-10-23), com o teste de ponta a ponta usando os dados fictícios do simulador.
- **Fase 4.5 — Duas versões de estação (BME280 e HTU21D):** concluída (2026-10-23).
- **Fase 5 — Firmware:** implementada (2026-10-23). Compila e passa nos testes nativos. Na bancada (2026-10-23), um D1 mini real ainda sem sensores, a estação `bancada`, configurado pelo portal, publica no ambiente de dev: online, leituras, diagnóstico e configuração remota aplicada. A página local também foi validada: troca de servidor mantida, senha gerada pelo painel aplicada, IP 10.25.50.111 no painel. Falta ligar os sensores (BME280 ou HTU21D, anemômetro, pluviômetro e o divisor da bateria). A memória com TLS só precisa ser medida se o TLS for ligado.
- **Fase 6 — Deploy:** implementada e ensaiada localmente (2026-10-23). Falta o deploy de verdade, que o usuário faz: primeiro no Coolify de casa (teste e apresentação), depois na VPS da Hostinger. Painel em `estacao.jodairneves.dev.br`; o endereço do MQTT é configurado em cada estação.
- O primeiro admin (`ADMIN_EMAIL`/`ADMIN_PASSWORD`) é criado pela API ao subir (hash argon2id).
- **Hardware do usuário:** D1 mini, BME280, anemômetro e pluviômetro impressos em 3D (modelos MakerWorld), bateria de lítio e talvez um painel solar pequeno.
- **Produção:**
  - Definitiva: VPS da Hostinger com Coolify e IP fixo.
  - Teste e apresentação: o Coolify de casa, com o painel pelo Cloudflare Tunnel e o MQTT por port forward. Se a 1883 de casa continuar com o broker que o usuário já tem, o projeto usa outra porta lá (`MQTT_HOST_PORT`).

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

### 2026-10-23 — Fase 4.5: duas versões de estação
- **Pedido do usuário:** além da estação completa (BME280), uma versão em que o HTU21D substitui o BME280; sem pressão, tendência nem altitude barométrica. Vento, chuva e bateria iguais.
- **`@wx/shared`:** `CLIMATE_SENSORS` (`bme280`, `htu21d`), sensor `htu21d`, `measuresPressure()`; `health.sensors.htu21d` no contrato v1.
- **Banco:** migração `0003` (`stations.climate_sensor`, padrão `bme280`; `station_sensors` aceita `htu21d`). Aplicada no banco de dev com confirmação do usuário.
- **Coletor:** só o sensor de clima da versão cadastrada é esperado e gera alertas. Se a estação reporta o da outra versão funcionando, grava `CLIMATE_SENSOR_MISMATCH` (no máximo 1 a cada 10 min).
- **API e painel:**
  - Versão no cadastro; trocar a versão apaga a linha e os alertas do sensor antigo.
  - Na estação HTU21D somem o painel e o gráfico de pressão e a coluna do resumo diário.
  - Na visão geral, a pressão aparece como "—" com "Versão sem barômetro".
  - Na comparação de pressão, essas estações ficam de fora, com aviso.
- **Simulador:** estação de demonstração `horta` (HTU21D), que envia `pres: null` e informa o sensor certo no `health`.
- **Testes:** 162 unitários, 57 de integração e 12 E2E (novos: contrato, regras do monitor, sensor instalado, leitura sem pressão, aviso de sensor trocado, troca de versão pela API e cadastro HTU21D no navegador).

### 2026-10-23 — Fase 5: firmware do D1 mini
- **`firmware/`** (PlatformIO, Arduino ESP8266): um só firmware para as duas versões; no boot procura o BME280 (0x76/0x77) e depois o HTU21D (0x40).
  - `src/core/`: lógica sem hardware, com 46 testes Unity nativos. Cobre rajada de 3 s, buffer de 120 leituras, perfis de energia com histerese, configuração remota (mesmas regras do zod), comandos com deduplicação, JSON do contrato v1, estado na memória RTC com CRC32, conversões do HTU21D (com CRC) e da bateria, e intervalos alinhados ao relógio.
  - `src/hw/`: pulsos por interrupção com debounce (vento 2 ms; chuva 50 ms, em mudança de estado ou na borda de descida), sensor de clima, bateria (mediana de 5), LED e memória RTC.
  - `src/net/`: LittleFS com gravação atômica, portal WiFiManager, Wi-Fi com reconexão rápida (canal e BSSID), NTP e MQTT com TLS (raízes ISRG X1/X2 e Max Fragment Length).
  - `src/app/`: perfis Normal, Economia (sessões curtas) e Sobrevivência (deep sleep, até 12 leituras guardadas na RTC); vigias de 30 min (Wi-Fi) e 2 h (placa); configuração remota e comandos.
- **Revisão antes do commit:**
  - Horário `null` quando o NTP não respondeu (eventos e `next` do status).
  - Mudança de perfil aplicada antes de atender a conexão.
  - Diagnóstico sem envio duplicado; `identify` recusado na Sobrevivência.
  - Id de comando validado; a configuração é esquecida ao trocar servidor ou credenciais no portal.
- **Contrato conferido:** os JSON gerados pelo firmware passam nos esquemas zod (telemetria, status, diagnóstico e eventos com `data`).
- **Guias:** `docs/hardware.md` (versões, materiais, ligações, alimentação, gravação, portal e roteiro de bancada) e `docs/calibracao.md`.
- **Dev:**
  - `DEV_MQTT_BIND` expõe o Mosquitto de dev na rede local para o teste em bancada.
  - A calculadora do anemômetro parte do modelo de referência (80 mm, 3 ímãs).
- **Pendente (usuário):** teste em bancada, inclusive a memória livre com TLS.

### 2026-10-23 — Bancada: primeira gravação e portal em português
- Firmware gravado num D1 mini real (CH340, ainda sem sensores): boot e portal OK.
- **Pedidos do usuário:**
  - Senha do portal trocada para `12345678`; o guia avisa que ela é fraca para o campo.
  - Escolha da rede mais clara: portal em português, lista das redes encontradas com título e instrução, campo "Nome da rede" para digitar a que não aparece, botão "Procurar redes de novo" e menu só com "Configurar Wi-Fi".
- Envio de firmware pelo portal bloqueado: só pelo USB.
- **Ambiente de dev para a bancada:** `DEV_MQTT_BIND=0.0.0.0` no `.env` e estação de teste `bancada` (versão completa) cadastrada pela API.
- **Teste em bancada, problemas encontrados e corrigidos:**
  - Os campos do servidor sumiam do portal com muitas redes por perto, por falta de memória para montar a página. Agora a página é mais leve, o cliente MQTT é criado depois do portal, os campos são obrigatórios, e o portal reabre se a configuração for salva incompleta.
  - A porta ficou em 8883 com o TLS desligado. Agora a caixa do TLS troca a porta padrão sozinha (1883 ↔ 8883).
  - A raiz do portal leva direto à lista de redes. O celular do usuário não abre o portal cativo sozinho, e ele digita 192.168.4.1.
  - Log serial com o servidor usado, o erro do MQTT (`erro -3` = sem conexão TCP; `código 4/5` = credencial), o IP, o gateway, o sinal e o NTP.
  - Conflito de IP na rede do usuário, explicado em "Notas técnicas".
  - Defeito antigo: quando o portal expirava sem salvar, o firmware copiava os campos de volta, e a caixa do TLS (valor sempre `"1"`; só o `checked` muda) ligava o TLS na flash. Agora, se não houver salvamento, nada é copiado.
- **Resultado:** a estação `bancada` online pelo MQTT (1883, sem TLS) com leituras a cada minuto, alinhadas ao relógio, temperatura, umidade e pressão `null` (sem sensor), bateria `null` (sem divisor), 17 KB de heap livre conectada e alerta `sensor_error` do BME280, esperado.
- **Docs:** seção "Problemas comuns" no guia de hardware.

### 2026-10-23 — Página da estação na rede local e IP no painel
- **Pedido do usuário:** configurar a estação pelo IP dela, sem ir até o dispositivo, e ver o IP no painel. Decisões dele:
  - senha própria da página, com **Ver** e **Copiar** na tela da estação;
  - troca de Wi-Fi permitida, com retorno automático.
- **Contrato v1 (compatível):** `health.ip`; `local_password` opcional na mensagem `config`; eventos `LOCAL_CONFIG_APPLIED` e `LOCAL_CONFIG_REVERTED`.
- **Banco:** migração `0004` (`station_state.ip_address`, `stations.local_password`), aplicada no banco de dev com confirmação do usuário.
- **Coletor:** grava o IP recebido no diagnóstico; se ele não vier, o último conhecido continua.
- **API:**
  - Senha gerada no cadastro (`xxxx-xxxx-xxxx`, sem caracteres parecidos) e publicada em toda configuração.
  - `GET` e `POST /stations/:id/local-access`, só admin: ver (com auditoria `LOCAL_PASSWORD_VIEWED`) e gerar nova (`LOCAL_PASSWORD_ROTATED`, nova `rev`).
- **Painel:**
  - "IP na rede" em Energia e sinal; para admins, o link da página com usuário e senha (Ver e Copiar), e Gerar senha nas estações antigas.
  - IP na tela Dispositivos; troca da senha na aba Credenciais (que antes se chamava Credenciais MQTT).
- **Firmware:**
  - Página com senha e token.
  - Troca de servidor e Wi-Fi testada por 2 min e desfeita se não conectar (também se o perfil sair do Normal).
  - IP no diagnóstico e nome `estacao-{código}` na rede.
- **Simulador:** IPs fictícios da faixa de documentação (192.0.2.x).
- **Testes:**
  - 164 unitários, 58 de integração (senha no cadastro, só admin, auditoria, nova `rev`; IP no coletor) e o E2E da tela da estação.
  - 60 nativos do firmware (formulário, teste com retorno, escape de HTML, senha na configuração, IP).
- **Bancada:** pela página, o usuário desligou o TLS que tinha ficado ligado (alteração mantida em segundos), gerou a senha no painel e a estação passou a exigir só ela.

### 2026-10-23 — Manual de ligação em PDF
- **Pedido do usuário:** um manual em PDF de ligação dos sensores nos pinos.
- **`docs/manual-de-ligacao.pdf`** (8 páginas A4):
  - resumo das ligações;
  - mapa de pinos do D1 mini;
  - sensor de clima, anemômetro, pluviômetro, alimentação e medição da bateria (com o divisor interno);
  - teste depois de ligar e problemas comuns.
- **Gerador:** `docs/manual-de-ligacao/gerar.mjs`.
  - Os desenhos são SVG feitos por funções (placa, módulos e fios com cor e nome, para a impressão em cinza continuar legível).
  - A fonte Archivo, a mesma do painel, vai embutida.
  - O PDF sai do Chromium do Playwright do dashboard, resolvido por `createRequire`; o comando é `pnpm docs:manual`.
- Ao mudar uma ligação no firmware (`src/hw/pins.h`), atualize o gerador, o `docs/hardware.md` e gere o PDF de novo.

### 2026-10-23 — Fase 6: deploy no Coolify
- **Decisões do usuário:**
  - Produção definitiva numa VPS da Hostinger com Coolify e IP fixo; antes, teste e apresentação no Coolify de casa (painel pelo Cloudflare Tunnel, MQTT por port forward).
  - Painel em `estacao.jodairneves.dev.br`.
  - O compose traz o Mosquitto do projeto (o broker que o usuário já tem não serve).
  - MQTT na **1883 sem TLS**, revertendo o TLS 8883 do design. O risco ficou registrado no design §3.10, e o caminho para ligar o TLS depois, no §13.
- **Imagens:**
  - `Dockerfile` na raiz com os alvos `collector` e `dashboard`: o pnpm instala o workspace, o esbuild gera um bundle ESM por servidor (`scripts/bundle-server.mjs`) e o Vite gera a SPA.
  - Imagem final `node:24-slim`, usuário `node`, com healthcheck: `/healthz` no painel e o arquivo `HEALTH_FILE` no coletor, tocado depois de cada heartbeat gravado.
  - Mosquitto (`infra/mosquitto`) e backup (`infra/backup`) com a configuração dentro da imagem.
- **`docker-compose.yaml`:**
  - Postgres, Mosquitto (1883 publicada, `max_packet_size` de 64 KB), coletor, painel (só pelo proxy do Coolify) e backup.
  - Variáveis obrigatórias com `${VAR:?}`; logs com rotação.
  - Modelo das variáveis em `.env.production.example`.
- **Backup:**
  - `pg_dump` diário e cópia dos logins do broker; 14 cópias diárias e 8 semanais.
  - `restore.sh` restaura num banco novo e troca os nomes numa transação, guardando o anterior.
- **Correções encontradas no ensaio:**
  - Num deploy novo o coletor ficava parado para sempre: o mqtt.js desiste depois do primeiro login recusado. Agora coletor e painel insistem (`reconnectOnConnackError`), com teste de integração que falha sem a correção.
  - O erro esperado do primeiro bootstrap do painel (o broker derruba o `admin` quando ele ganha um papel) virou um aviso explicado.
- **Guia:** `docs/deploy.md` (VPS, casa, mudança de servidor, atualizações, backup e restauração, problemas comuns, ensaio local).
- **Ensaio na máquina de dev** (stack separada, portas 3400 e 1884 só em localhost):
  - Subida do zero em ~16 s, com tudo saudável.
  - Login, cadastro de estação, publicação MQTT pela porta publicada, valores e derivados pela API, SSE, SPA com CSP.
  - Restauração recusada com os apps ligados e feita com eles parados.
  - Retenção 14/8 e reinício sem perda.
  - Mudança de servidor (casa → VPS) com banco e logins do broker: a estação conectou com a senha antiga.
- **Testes:** 164 unitários e 60 de integração (novos: coletor insiste com login recusado; `/healthz` sem sessão).
