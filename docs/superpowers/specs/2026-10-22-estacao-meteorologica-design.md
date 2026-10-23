# Estação Meteorológica — Documento de Design

- **Data:** 2026-10-22
- **Status:** aprovado (seções validadas com o usuário em 2026-10-22)
- **Escopo:** sistema completo — firmware da estação, coletor MQTT → PostgreSQL (App 1), dashboard web (App 2) e deploy.
- **Plano de implementação:** [`docs/superpowers/plans/2026-10-22-plano-de-implementacao.md`](../plans/2026-10-22-plano-de-implementacao.md)

---

## 1. Contexto

### 1.1 Objetivo

Sistema para acompanhar estações meteorológicas DIY:

- **App 1 — Coletor:** recebe tudo o que as estações publicam no MQTT e grava no PostgreSQL, a cada mensagem que chega.
- **App 2 — Dashboard:** apresenta os dados salvos de forma visual, dinâmica, 3D e moderna. Permite cadastrar estações (com gráficos separados por estação) e usuários, e mostra os registros do próprio sistema: logs, erros, status dos dispositivos e sensores sem atualização.

### 1.2 Requisitos do usuário

- Stack: Node.js, Vite, PostgreSQL e Mosquitto (MQTT).
- Controlador: Wemos D1 mini (ESP8266), com todos os sensores ligados nele.
- Grandezas: temperatura, umidade, pressão e altitude (BME280), vento (anemômetro) e chuva (pluviômetro).
- A frequência de envio é configurada na estação; toda mensagem nova no MQTT é gravada no banco.
- Acesso com e-mail e senha. Perfis: **admin** (acesso total, cadastra usuários e estações) e **operador** (acesso básico, não cadastra nada).
- Produção em VPS ou servidor local, com Coolify para facilitar o deploy.
- Registrar a evolução do projeto no `CLAUDE.md`.

### 1.3 Decisões tomadas com o usuário

| Tema | Decisão |
|---|---|
| Firmware | Próprio, em C++ (PlatformIO/Arduino) |
| Energia | Apenas D1 mini e sensores, bateria de lítio e talvez um painel solar pequeno. Sem contador externo: o firmware fica acordado e economiza energia com perfis automáticos |
| Produção | VPS na internet **ou** servidor local com Cloudflare Tunnel (painel) e port forward (MQTT) |
| Visual | Tema próprio meteorológico (escuro/futurista) |
| Arquitetura | Abordagem A: o banco de dados é o ponto de integração entre os apps |

### 1.4 Referências

PDFs na raiz do projeto (fora do git):

| Documento | O que aproveitamos |
|---|---|
| Pluviômetro (MakerWorld, laisch) | Mesmo hardware: D1 mini, Hall 49E em D5/GPIO14, BME280 em D1/D2 (0x76). 0,64 mm por basculada (balde de 7 ml, ~10.929 mm²). Conta cada mudança de estado do sensor |
| DIY Arduino Rain Gauge (Instructables) | Outro modelo: 0,173 mm por pulso; também conta mudanças de estado |
| Anemômetro (MakerWorld, SoftWareCrash) | 3 ímãs (3 pulsos por volta), raio de 80 mm. A fórmula v ≈ 0,167 × pulsos/s dá a velocidade das conchas; falta o fator do anemômetro (~2,5–3) |
| Estação DIY com ESP32 (Instructables) | Cata-vento com 4 sensores Hall (4 GPIOs, 8 direções); sensor de temperatura dentro de abrigo Stevenson |

Lições incorporadas ao design:

- A calibração de vento e chuva varia por modelo → fatores configuráveis por estação, aplicados no servidor.
- O contador de chuva zera quando o ESP reinicia → contador na memória RTC e cálculo por diferença no servidor, robusto a reinícios.
- O 49E é analógico; numa entrada digital o repouso (~1,65 V) cai na zona indefinida do ESP → recomendar reed switch ou Hall digital de baixo consumo.
- O BME280 perto do ESP8266 mede o calor do próprio ESP → sensor afastado, em abrigo ventilado.

---

## 2. Arquitetura

```
Estação D1 mini ──MQTT/TLS :8883──▶ Mosquitto ──QoS 1──▶ App 1: Coletor ──INSERT──▶ PostgreSQL
                                        ▲                                               │ NOTIFY
                                        │ credenciais + comandos                        ▼
                                        └──────────────── App 2: API (Fastify) ◀─── LISTEN
                                                                │ REST + SSE (cookie httpOnly)
                                                                ▼
                                                     Navegador: SPA React + 3D
```

### 2.1 Componentes

| Componente | Responsabilidade | Fala com |
|---|---|---|
| Estação (firmware) | Mede, agrega por intervalo e publica no MQTT; aplica configuração e comandos | Mosquitto (TLS 8883) |
| Mosquitto 2.1 | Broker; autenticação por estação (Dynamic Security), ACL, LWT, persistência de sessões | Estações, Coletor, Dashboard |
| App 1 — Coletor | Único consumidor da telemetria: valida, calibra, calcula derivados, grava e monitora | Mosquitto (1883 interno), PostgreSQL |
| PostgreSQL 18 | Fonte única da verdade; avisa novidades com `NOTIFY` | Coletor, Dashboard |
| App 2 — Dashboard | API REST + SSE e SPA; autenticação e perfis; cadastros; provisionamento MQTT; comandos | PostgreSQL, Mosquitto (admin), navegador |

### 2.2 Princípios

- O painel mostra exatamente o que foi gravado (tempo real via `LISTEN/NOTIFY`); o Dashboard não assina telemetria no MQTT.
- Coleta e painel são independentes: qualquer um pode reiniciar sem afetar o outro.
- Nenhuma leitura se perde por falha transitória: QoS 1 de ponta a ponta, sessões persistentes, PUBACK só depois do commit e buffer na estação.
- Os dados brutos ficam guardados; a calibração é aplicada no servidor.
- `null` significa "não medido" e nunca é convertido em 0.

### 2.3 Estrutura do repositório

```
.
├── apps/
│   ├── collector/          # App 1 (Node + TypeScript)
│   └── dashboard/          # App 2: src/server (Fastify) + src/web (React/Vite)
├── packages/
│   ├── shared/             # contrato MQTT (zod), tipos de domínio, fórmulas meteorológicas (roda no Node e no navegador)
│   ├── db/                 # esquema Drizzle, migrações, cliente, canais NOTIFY
│   └── mqtt-admin/         # cliente do Dynamic Security: papéis, credenciais, bootstrap
├── firmware/               # PlatformIO (D1 mini)
├── tools/simulator/        # estações virtuais para desenvolvimento e testes
├── infra/                  # configs do Mosquitto, compose de desenvolvimento, scripts (certificados, backup)
├── docs/                   # design, planos e guias (hardware, calibração, deploy)
├── docker-compose.yml      # produção (Coolify ou servidor local)
└── CLAUDE.md
```

### 2.4 Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js 24 LTS, TypeScript (strict), pnpm workspaces |
| Banco | PostgreSQL 18, Drizzle ORM + drizzle-kit (migrações SQL), driver `pg` |
| MQTT | Eclipse Mosquitto 2.1 com Dynamic Security; mqtt.js 5 |
| API | Fastify 5, zod 4, argon2id (`@node-rs/argon2`), pino |
| Web | React 19, Vite 8, React Router, TanStack Query, Tailwind CSS 4, shadcn/ui |
| Visualização | ECharts 6 (+ echarts-gl), Three.js com React Three Fiber/drei, MapLibre GL |
| Qualidade | Biome (lint + format), Vitest, Playwright, testes nativos do PlatformIO (Unity) |
| Firmware | PlatformIO, Arduino ESP8266, espMqttClient, WiFiManager, ArduinoJson 7, Adafruit BME280, LittleFS |
| Deploy | Docker Compose (Coolify ou servidor local), lego (Let's Encrypt via DNS da Cloudflare), cloudflared |

---

## 3. Contrato MQTT v1

### 3.1 Convenções

- Raiz dos tópicos: `weather/v1/{code}/…`.
- `code` é o identificador da estação: `^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$` (3 a 32 caracteres). É imutável, serve como usuário MQTT da estação, e o client id da estação é `st-{code}`.
- Payloads em JSON UTF-8, sempre com `"v": 1`. Campos desconhecidos são ignorados, para permitir evolução compatível.
- Horários em Unix epoch, segundos, UTC.
- Protocolo MQTT 3.1.1.

### 3.2 Tópicos

| Tópico | Sentido | QoS / retido | Conteúdo |
|---|---|---|---|
| `weather/v1/{code}/telemetry` | estação → servidor | 1 / não | Lote de 1 a 30 leituras |
| `weather/v1/{code}/status` | estação → servidor | 1 / sim | `online`, `sleeping` (com o próximo contato) ou `offline` (LWT) |
| `weather/v1/{code}/health` | estação → servidor | 1 / não | Diagnóstico: bateria, perfil, RSSI, memória, uptime, reset, firmware, sensores |
| `weather/v1/{code}/event` | estação → servidor | 1 / não | Eventos e erros pontuais, inclusive respostas a comandos |
| `weather/v1/{code}/config` | servidor → estação | 1 / sim | Configuração desejada da estação |
| `weather/v1/{code}/cmd` | servidor → estação | 1 / não | Comandos com prazo de validade |

### 3.3 `telemetry`

```json
{
  "v": 1,
  "run": 2864434397,
  "readings": [
    { "seq": 1042, "ts": 1761181260, "dur": 60,
      "temp": 24.61, "hum": 63.2, "pres": 1008.42,
      "wind_p": 87, "gust_p": 7, "rain_c": 152 }
  ]
}
```

| Campo | Tipo | Unidade | Faixa aceita | Significado |
|---|---|---|---|---|
| `run` | uint32 | — | — | Sessão dos contadores. Ganha um valor aleatório novo quando a memória RTC se perde (queda de energia) |
| `readings` | array | — | 1 a 30 itens | Leituras em ordem crescente de `seq` |
| `seq` | uint32 | — | — | Sequência da leitura dentro do `run` |
| `ts` | int | s | de agora − 30 dias até agora + 5 min | Fim do intervalo medido |
| `dur` | int | s | 1 a 3600 | Duração do intervalo |
| `temp` | number \| null | °C | −40 a 85 | BME280, sem offset |
| `hum` | number \| null | % | 0 a 100 | BME280, sem offset |
| `pres` | number \| null | hPa | 300 a 1100 | Pressão absoluta da estação, sem offset |
| `wind_p` | int \| null | pulsos | 0 a 300 × `dur` | Pulsos do anemômetro no intervalo |
| `gust_p` | int \| null | pulsos | 0 a 900 e ≤ `wind_p` | Maior soma de pulsos em qualquer janela de 3 s do intervalo |
| `rain_c` | uint32 \| null | basculadas | — | Contador acumulado dentro do `run` |

Regras de validação:

- Mensagem fora do esquema → descartada inteira; log `PAYLOAD_INVALID` com o motivo e o payload truncado em 4 KB.
- Leitura com `ts` fora da janela → descartada; log `READING_TS_OUT_OF_RANGE`.
- Valor fora da faixa → vira `null`; log `VALUE_OUT_OF_RANGE`; o resto da leitura é aproveitado.

### 3.4 `status` (retido)

```json
{ "v": 1, "state": "sleeping", "ts": 1761181260, "mode": "economy", "next": 1761181860, "fw": "1.0.0" }
```

- `online`: publicado logo após conectar.
- `sleeping`: publicado antes de uma desconexão intencional (perfis Economia e Sobrevivência); `next` é o próximo contato previsto.
- `offline`: LWT `{"v":1,"state":"offline"}`, publicado pelo broker quando a conexão cai sem aviso.

### 3.5 `health`

```json
{
  "v": 1, "ts": 1761181260, "fw": "1.0.0", "mode": "normal",
  "bat_mv": 3912, "rssi": -67, "heap": 23456, "heap_frag": 12, "uptime": 86400,
  "reset": "Power On", "wifi_reconn": 2, "mqtt_reconn": 3, "buf": 0, "dropped": 0,
  "sensors": { "bme280": "ok", "wind": "ok", "rain": "ok" },
  "cfg_rev": 3
}
```

- Perfil Normal: enviado a cada `health_s` (padrão 300 s) e após cada (re)conexão. Economia e Sobrevivência: a cada conexão.
- `bat_mv` é `null` quando não há divisor no A0.
- Valores de `sensors.*`: `ok`, `error`, `absent` ou `disabled`.

### 3.6 `event`

```json
{ "v": 1, "ts": 1761181260, "level": "warn", "code": "SENSOR_FAILED",
  "msg": "BME280 não respondeu", "data": { "sensor": "bme280" } }
```

- `level`: `debug`, `info`, `warn` ou `error`.
- Códigos da estação (lista mantida em `packages/shared`): `BOOT`, `MODE_CHANGED`, `SENSOR_FAILED`, `SENSOR_RECOVERED`, `BUFFER_OVERFLOW`, `NTP_FAILED`, `CONFIG_APPLIED`, `CONFIG_REJECTED`, `CMD_ACK`.
- `CMD_ACK.data`: `{ "id": "…", "ok": true, "detail": "…" }`.
- `CONFIG_APPLIED.data`: `{ "rev": 3 }`. `CONFIG_REJECTED.data`: `{ "rev": 3, "reason": "…" }`.

### 3.7 `config` (retido, servidor → estação)

```json
{
  "v": 1, "rev": 3,
  "interval_s": 60, "health_s": 300, "economy_batch_s": 600, "survival_sleep_s": 1800,
  "rain_edge": "change",
  "power": { "mode": "auto", "economy_below_mv": 3650, "survival_below_mv": 3450,
             "recover_above_mv": 3800, "bat_full_scale_mv": 4200 }
}
```

| Campo | Padrão | Faixa | Significado |
|---|---|---|---|
| `interval_s` | 60 | 10–3600 | Intervalo de cada leitura |
| `health_s` | 300 | 60–86400 | Intervalo do diagnóstico no perfil Normal |
| `economy_batch_s` | 600 | 60–3600 | Intervalo entre conexões no perfil Economia |
| `survival_sleep_s` | 1800 | 300–10800 | Duração do deep sleep no perfil Sobrevivência |
| `rain_edge` | `change` | `change` \| `falling` | Conta cada mudança de estado (padrão dos dois pluviômetros de referência) ou só a borda de descida |
| `power.mode` | `auto` | `auto` \| `normal` \| `economy` | `auto` exige o divisor no A0; os outros fixam o perfil |
| `power.economy_below_mv` | 3650 | 3000–4200 | Abaixo disso entra em Economia |
| `power.survival_below_mv` | 3450 | 3000–4200 | Abaixo disso entra em Sobrevivência |
| `power.recover_above_mv` | 3800 | 3000–4300 | A partir disso volta ao Normal |
| `power.bat_full_scale_mv` | 4200 | 3000–6000 | Calibração do divisor do A0 |

A estação aplica a configuração quando `rev` é maior que a aplicada, grava na flash e responde `CONFIG_APPLIED` (ou `CONFIG_REJECTED` com o motivo). A calibração das grandezas não passa por aqui: fica no servidor.

### 3.8 `cmd` (servidor → estação)

```json
{ "v": 1, "id": "0192f1c4-7a3e-7c1d-9a52-2c1f0b6e4d10", "cmd": "identify", "exp": 1761184860, "args": {} }
```

| Comando | Efeito |
|---|---|
| `reboot` | Reinicia a estação |
| `identify` | Pisca o LED por 30 s (para achar a estação fisicamente) |
| `flush` | Envia o buffer e o status agora |
| `health` | Envia o diagnóstico agora |

Comando vencido (`exp` < agora) é recusado com `CMD_ACK` `ok=false`, `detail="expired"`.

### 3.9 Sessões e QoS

| Cliente | Client id | Sessão | Observações |
|---|---|---|---|
| Estação | `st-{code}` | persistente (clean = false) | Keepalive 60 s; publica com QoS 1; assina `config` e `cmd` (QoS 1) a cada conexão, o que reentrega a configuração retida |
| Coletor | `collector` | persistente | Assina `telemetry`, `status`, `health` e `event` com QoS 1; envia PUBACK só depois do commit |
| Dashboard | `wx-dashboard-<host>-<sufixo>` | limpa | Publica `config` (retido) e `cmd`; administra o Dynamic Security. Client id único por instância, para duas instâncias (ex.: dev e testes) não se derrubarem |

Broker com `persistence true` e fila por cliente ampliada (`max_queued_messages` alto) para segurar as mensagens enquanto o coletor estiver parado.

### 3.10 Segurança

- **Listener 8883**, TLS 1.2 ou superior, certificado Let's Encrypt para `mqtt.<domínio>`: é o único exposto na internet.
- **Listener 1883** sem TLS: só na rede interna do Docker (e em `127.0.0.1` no desenvolvimento).
- **Dynamic Security**, com ACL padrão negando publicação e assinatura:

| Papel | Permissões |
|---|---|
| `station` | Publica `weather/v1/%u/telemetry`, `…/status`, `…/health` e `…/event`; assina `weather/v1/%u/config` e `weather/v1/%u/cmd` |
| `collector` | Assina `weather/v1/+/telemetry`, `…/status`, `…/health`, `…/event` e `$SYS/#` |
| `dashboard-ops` | Publica `weather/v1/+/config` e `weather/v1/+/cmd`; assina `$SYS/#` |

- O cliente `admin` é criado pelo próprio Mosquitto no primeiro start, com a senha de `MOSQUITTO_DYNSEC_PASSWORD`. O Dashboard usa esse cliente e, ao iniciar, garante de forma idempotente os papéis, o papel `dashboard-ops` do `admin` e o cliente `collector` (o pacote `mqtt-admin` também expõe isso como comando de linha para o desenvolvimento).
- **Credencial da estação:** senha aleatória de 24 caracteres gerada pelo Dashboard, aplicada no Mosquitto e exibida **uma única vez**; pode ser rotacionada a qualquer momento. Estação desativada tem o cliente MQTT desabilitado; estação excluída tem o cliente removido e os tópicos retidos limpos.
- **A estação valida o certificado** do servidor pelas raízes ISRG Root X1 e X2 embarcadas e sincroniza o relógio por NTP antes do TLS.

---

## 4. Firmware (D1 mini)

### 4.1 Hardware e ligações

| Componente | Pino | GPIO | Observação |
|---|---|---|---|
| BME280 SDA / SCL | D2 / D1 | 4 / 5 | I²C, endereço 0x76 ou 0x77 (detecção automática) |
| Pluviômetro (reed ou Hall digital) | D5 | 14 | `INPUT_PULLUP`, interrupção |
| Anemômetro (reed ou Hall digital) | D6 | 12 | `INPUT_PULLUP`, interrupção |
| Bateria (+) passando por resistor de 100 kΩ | A0 | — | Soma-se ao divisor interno (220k/100k): fundo de escala ≈ 4,2 V |
| Fio de D0 ao RST | D0 | 16 | Necessário para acordar do deep sleep (Sobrevivência) |
| LED da placa | D4 | 2 | Ativo em nível baixo; desligado por padrão |

- **Sensores de pulso:** reed switch (0 mA) ou Hall digital de 3,3 V e baixo consumo (ex.: DRV5032). O 49E não é recomendado (~6 mA contínuos e repouso em zona indefinida). Retirar os LEDs das plaquinhas dos sensores.
- **Alimentação:** célula 18650 (Li-ion) no pino 5V, passando pelo regulador do D1 mini. ⚠️ Nunca ligar o USB com a bateria conectada ao pino 5V — o USB alimentaria a bateria diretamente. Usar um diodo ou desconectar a bateria antes. Alternativa mais eficiente: LiFePO4 direto no 3V3, com os limiares de energia ajustados.
- **Solar (opcional):** painel de 5–6 V e 1–3 W com carregador TP4056 com proteção.
- **BME280:** fora da caixa do ESP, em abrigo ventilado.

### 4.2 Medição

- **Anemômetro:** interrupção na borda de descida, debounce de 2 ms (até 500 Hz).
- **Pluviômetro:** interrupção em mudança de estado (`rain_edge=change`) ou na borda de descida (`falling`); debounce de 50 ms.
- **Rajada:** a cada 1 s soma os pulsos daquele segundo; mantém a soma móvel dos últimos 3 s; `gust_p` é a maior soma do intervalo (rajada de 3 s, padrão OMM).
- **BME280:** modo forçado, oversampling ×1 e filtro desligado (modo "weather monitoring" da Bosch), uma leitura no fim de cada intervalo.
- **Alinhamento:** com NTP, os intervalos fecham em múltiplos de `interval_s` no relógio (ex.: segundo 0 de cada minuto).
- **Contadores** (`run`, `seq`, `rain_c`) na memória RTC com CRC: sobrevivem a reset e deep sleep. Se a RTC estiver inválida, um `run` aleatório novo é gerado e os contadores recomeçam do zero.

### 4.3 Perfis de energia

| Perfil | Entra quando | Comportamento | Consumo aprox. |
|---|---|---|---|
| **Normal** | Bateria ≥ `recover_above_mv`, ou `power.mode=normal` | Wi-Fi conectado (modem sleep); publica cada leitura ao fim do intervalo; status `online` | 20–30 mA |
| **Economia** | Bateria < `economy_below_mv` | Continua contando pulsos; Wi-Fi desligado entre envios. A cada `economy_batch_s` conecta, envia o buffer em lotes, recebe configuração e comandos, publica `sleeping` com `next` e desconecta | ~15 mA |
| **Sobrevivência** | Bateria < `survival_below_mv` | Deep sleep por `survival_sleep_s`; ao acordar lê BME280 e bateria, envia com vento e chuva `null` e volta a dormir. Sai quando a bateria ≥ `recover_above_mv` | < 1 mA |

- No boot, o perfil é escolhido direto pelos limiares: abaixo de `survival_below_mv` → Sobrevivência; abaixo de `economy_below_mv` → Economia; senão → Normal.
- Depois do boot, a bateria é medida a cada 60 s (mediana de 5 amostras, com o rádio ocioso). A troca de perfil exige 3 medições consecutivas (histerese) e gera o evento `MODE_CHANGED`. Economia e Sobrevivência só voltam ao Normal a partir de `recover_above_mv`.
- `power.mode=normal` ou `economy` fixa o perfil — necessário quando não há divisor no A0.
- Abaixo de 3300 mV a estação nem liga o Wi-Fi (evita brownout) e volta a dormir.

### 4.4 Comunicação

- Buffer em RAM de 120 leituras (~2 h a 1 leitura/min). Uma leitura só sai do buffer depois do PUBACK. Buffer cheio descarta a mais antiga, soma em `dropped` e gera `BUFFER_OVERFLOW`.
- Lotes de até 30 leituras por mensagem.
- Reconexão com espera progressiva (5 s até 5 min). Sem publicar por 30 min, reinicia o Wi-Fi; por 2 h, reinicia o ESP.
- Nos perfis Economia e Sobrevivência guarda canal e BSSID na RTC para reconectar mais rápido.
- NTP (`pool.ntp.org`) antes do TLS. TLS via BearSSL, usando Max Fragment Length quando o broker aceitar (menos RAM).

### 4.5 Configuração em campo

- Portal Wi-Fi (WiFiManager), aberto no primeiro boot ou com **dois toques no RESET** em até 3 s (o D1 mini não tem botão FLASH).
- O portal pede: rede Wi-Fi, host e porta MQTT, TLS ligado/desligado, código da estação e senha MQTT. Os dados ficam no LittleFS.
- O ponto de acesso do portal é protegido por senha (documentada no guia de hardware).
- Sem configuração em 5 min, a estação dorme 15 min e tenta de novo (protege a bateria).

### 4.6 Fora do v1

OTA remoto e cata-vento (ver §13).

---

## 5. Modelo de dados (PostgreSQL 18)

### 5.1 Convenções

- Nomes em `snake_case`. Chave `uuid` (`uuidv7()`) para entidades; `bigint generated always as identity` para tabelas de alto volume.
- Todas as datas em `timestamptz` (UTC). Agregações diárias usam o fuso da estação.
- Leituras numa tabela **larga** (uma coluna por grandeza): o conjunto de sensores é conhecido, as consultas ficam simples e ocupa ~3× menos espaço que uma linha por grandeza. Sensor novo = migração.
- Migrações SQL geradas pelo drizzle-kit em `packages/db/migrations`, aplicadas no start de cada serviço sob `pg_advisory_lock`. Migração aplicada nunca é editada.

### 5.2 Tabelas

**`users`**

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid PK | `uuidv7()` |
| `email` | text, único | Sempre em minúsculas |
| `name` | text | |
| `password_hash` | text | argon2id |
| `role` | text | `admin` \| `operator` |
| `is_active` | boolean | Padrão `true` |
| `must_change_password` | boolean | `true` para senhas provisórias |
| `failed_logins` | int | Zera no login bem-sucedido |
| `locked_until` | timestamptz null | Bloqueio temporário após tentativas |
| `last_login_at` | timestamptz null | |
| `created_by` | uuid null → `users` | |
| `created_at`, `updated_at` | timestamptz | |

**`sessions`**

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | text PK | SHA-256 do token; o token em si só existe no cookie |
| `user_id` | uuid → `users` (cascade) | |
| `created_at`, `last_seen_at`, `expires_at` | timestamptz | Expiração deslizante |
| `ip` | inet null | |
| `user_agent` | text null | |

**`stations`** — cadastro, editado pelo admin

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid PK | |
| `code` | text, único | Regex da §3.1; imutável |
| `name`, `description` | text | |
| `latitude`, `longitude` | double null | |
| `elevation_m` | real null | Altitude do local, usada na pressão ao nível do mar |
| `timezone` | text | Padrão `America/Sao_Paulo` |
| `is_active` | boolean | Inativa: cliente MQTT desabilitado e mensagens ignoradas |
| `rain_mm_per_tip` | real | Padrão 0,64 |
| `wind_ms_per_hz` | real | Padrão 0,42 |
| `temp_offset_c`, `hum_offset_pct`, `pres_offset_hpa` | real | Padrão 0 |
| `device_config` | jsonb | Configuração desejada (§3.7, sem `v` e `rev`) |
| `device_config_rev` | int | Incrementa a cada alteração |
| `mqtt_credentials_set_at` | timestamptz null | |
| `created_by` | uuid null → `users` | |
| `created_at`, `updated_at` | timestamptz | |

**`station_state`** — estado ao vivo, escrito pelo coletor (1:1 com `stations`)

| Coluna | Tipo | Observação |
|---|---|---|
| `station_id` | uuid PK → `stations` (cascade) | |
| `connection` | text | `unknown` \| `online` \| `sleeping` \| `offline` |
| `connection_changed_at` | timestamptz null | |
| `next_contact_at` | timestamptz null | Vem de `status.next` |
| `last_seen_at` | timestamptz null | Qualquer mensagem recebida |
| `last_reading_at` | timestamptz null | `ts` da leitura mais recente |
| `last_health_at` | timestamptz null | |
| `power_mode` | text null | `normal` \| `economy` \| `survival` |
| `battery_mv`, `rssi` | int null | |
| `firmware_version` | text null | |
| `config_applied_rev` | int null | Vem de `CONFIG_APPLIED` ou `health.cfg_rev` |
| `rain_run`, `rain_last_count`, `rain_last_seq` | bigint null | Estado do cálculo de chuva (§6.1) |
| `updated_at` | timestamptz | |

**`readings`**

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | bigint identity PK | |
| `station_id` | uuid → `stations` (cascade) | |
| `ts` | timestamptz | Fim do intervalo (horário da estação) |
| `received_at` | timestamptz | |
| `run`, `seq` | bigint | Chave de deduplicação |
| `interval_s` | int | |
| `temperature_c`, `humidity_pct`, `pressure_hpa` | real null | Já com offsets |
| `pressure_msl_hpa` | real null | Pressão ao nível do mar (exige `elevation_m`) |
| `altitude_m` | real null | Altitude barométrica (atmosfera padrão) |
| `dew_point_c` | real null | |
| `wind_speed_ms`, `wind_gust_ms` | real null | |
| `rain_mm` | real null | Chuva no intervalo |
| `wind_pulses`, `gust_pulses` | int null | Brutos |
| `rain_count` | bigint null | Bruto (acumulado no `run`) |

Índices: único `(station_id, run, seq)`; `(station_id, ts)`.

**`station_sensors`** — situação de cada sensor

| Coluna | Tipo | Observação |
|---|---|---|
| `station_id` | uuid → `stations` (cascade) | PK composta com `sensor` |
| `sensor` | text | `bme280` \| `anemometer` \| `rain_gauge` \| `battery` |
| `status` | text | `unknown` \| `ok` \| `stale` \| `error` \| `not_measured` \| `disabled` |
| `last_value_at` | timestamptz null | Última leitura com valor não nulo |
| `status_changed_at` | timestamptz null | |
| `detail` | text null | Último erro informado |

**`device_health`**

| Coluna | Tipo |
|---|---|
| `id` | bigint identity PK |
| `station_id` | uuid → `stations` (cascade) |
| `ts`, `received_at` | timestamptz |
| `firmware_version`, `power_mode`, `reset_reason` | text null |
| `battery_mv`, `rssi`, `heap_free`, `heap_frag`, `wifi_reconnects`, `mqtt_reconnects`, `buffered`, `dropped` | int null |
| `uptime_s` | bigint null |
| `sensors` | jsonb null |

Índice: `(station_id, ts)`.

**`alerts`**

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | bigint identity PK | |
| `station_id` | uuid null → `stations` (cascade) | `null` para alertas do sistema |
| `type` | text | `station_offline` \| `sensor_stale` \| `sensor_error` \| `battery_low` \| `battery_critical` \| `data_dropped` \| `collector_down` |
| `subject` | text | Ex.: nome do sensor; vazio para alertas da estação |
| `severity` | text | `info` \| `warning` \| `critical` |
| `status` | text | `active` \| `resolved` |
| `message` | text | Em pt-BR |
| `details` | jsonb null | |
| `started_at`, `updated_at` | timestamptz | |
| `resolved_at`, `acknowledged_at` | timestamptz null | |
| `acknowledged_by` | uuid null → `users` | |

Índice único parcial `(station_id, type, subject) NULLS NOT DISTINCT WHERE status = 'active'`: no máximo um alerta ativo por condição.

**`event_logs`** — log do próprio sistema

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | bigint identity PK | |
| `ts` | timestamptz | |
| `level` | text | `debug` \| `info` \| `warn` \| `error` \| `critical` |
| `source` | text | `collector` \| `dashboard` \| `device` |
| `category` | text | `ingest` \| `mqtt` \| `station` \| `sensor` \| `power` \| `command` \| `config` \| `auth` \| `audit` \| `system` |
| `code` | text | Código do evento em `UPPER_SNAKE_CASE` |
| `message` | text | Em pt-BR |
| `station_id` | uuid null → `stations` (set null) | |
| `user_id` | uuid null → `users` (set null) | |
| `details` | jsonb null | Inclui o payload rejeitado quando houver |

Índices: `(ts)`, `(station_id, ts)`, `(level, ts)`.

**`commands`**

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid PK | Vai no campo `id` do `cmd` |
| `station_id` | uuid → `stations` (cascade) | |
| `command` | text | `reboot` \| `identify` \| `flush` \| `health` |
| `args` | jsonb null | |
| `status` | text | `sent` \| `acked` \| `failed` \| `expired` |
| `created_by` | uuid null → `users` | |
| `created_at`, `expires_at` | timestamptz | |
| `acked_at` | timestamptz null | |
| `result` | jsonb null | |

**`service_heartbeats`**

| Coluna | Tipo | Observação |
|---|---|---|
| `service` | text PK | `collector` \| `dashboard` |
| `instance_id`, `version` | text | |
| `started_at`, `last_beat_at` | timestamptz | |
| `stats` | jsonb | Ex.: MQTT conectado, recebidas, gravadas, duplicadas, rejeitadas, última mensagem |

**`settings`**

| Coluna | Tipo |
|---|---|
| `key` | text PK |
| `value` | jsonb |
| `updated_at` | timestamptz |
| `updated_by` | uuid null → `users` |

Chaves e padrões:

- `monitoring`: `{ "offlineAfterIntervals": 3, "offlineMinSeconds": 180, "offlineCriticalAfterSeconds": 3600, "sensorStaleAfterIntervals": 3, "sensorStaleMinSeconds": 300, "batteryLowMv": 3650, "batteryCriticalMv": 3450 }`
- `retention`: `{ "logsDays": 90, "auditDays": 365, "healthDays": 180, "readingsDays": null }` (`null` = para sempre)

### 5.3 Canais `NOTIFY`

| Canal | Emitido por | Payload (JSON < 8 KB) |
|---|---|---|
| `wx_reading` | Coletor, após gravar | `{ stationId, readingId, ts, values }` |
| `wx_station` | Coletor | `{ stationId, state }` quando o estado muda |
| `wx_alert` | Coletor e Dashboard | `{ alertId, stationId, type, status, severity }` |
| `wx_log` | Coletor e Dashboard | `{ id, level, ts, stationId }` (só `warn` ou acima) |
| `wx_station_changed` | Dashboard | `{ stationId }` — o coletor recarrega o cache da estação |

### 5.4 Volume

~100–120 MB por ano por estação a 1 leitura/min (incluindo índices). PostgreSQL puro atende; TimescaleDB fica como evolução se o número de estações crescer muito.

---

## 6. Cálculos (`packages/shared`)

| Grandeza | Cálculo |
|---|---|
| Vento médio (m/s) | `wind_p / dur × wind_ms_per_hz` |
| Rajada (m/s) | `gust_p / 3 × wind_ms_per_hz` |
| Chuva no intervalo (mm) | `Δrain_c × rain_mm_per_tip` (regras da §6.1) |
| Taxa de chuva (mm/h) | `rain_mm / interval_s × 3600` |
| Ponto de orvalho (°C) | Magnus: γ = ln(UR/100) + 17,62·T/(243,12 + T); Td = 243,12·γ/(17,62 − γ) |
| Pressão ao nível do mar (hPa) | P₀ = P · (1 − 0,0065·h / (T + 0,0065·h + 273,15))^(−5,257), com h = `elevation_m` |
| Altitude barométrica (m) | h = 44330 · (1 − (P / 1013,25)^(1/5,255)) |
| Sensação térmica (°C) | Índice de calor (NOAA/Rothfusz) se T ≥ 27 °C e UR ≥ 40%; wind chill (fórmula de 2001) se T ≤ 10 °C e vento > 4,8 km/h; senão T |
| Tendência da pressão (3 h) | Estável < 0,1; lenta 0,1–1,5; subindo/caindo 1,6–3,5; rápida 3,6–6,0; muito rápida > 6,0 hPa |
| Escala Beaufort | Limites da OMM em m/s |
| Bateria (%) | Tabela da curva de descarga de Li-ion (aproximada) |

Calibração padrão: pluviômetro 0,64 mm por basculada (modelo MakerWorld); anemômetro 0,42 m/s por Hz (2π · 0,08 m / 3 pulsos ≈ 0,167 m/s por Hz, vezes fator 2,5 do anemômetro de conchas). Os dois valores devem ser conferidos com o guia de calibração.

### 6.1 Chuva por diferença

| Situação | Chuva do intervalo |
|---|---|
| Primeira leitura da estação (sem estado anterior) | 0 — linha de base |
| Mesmo `run`, `seq` maior que o último | `rain_c − rain_last_count`; se negativo, 0 e log `RAIN_COUNTER_ANOMALY` |
| `run` diferente do último | `rain_c` (contagem desde o religamento) |
| `seq` ≤ último no mesmo `run` | `null` (reentrega ou fora de ordem); o estado não muda |
| `rain_c` nulo | `null`; o estado não muda |

---

## 7. App 1 — Coletor

### 7.1 Inicialização

1. Valida variáveis de ambiente (zod).
2. Aplica migrações (com trava).
3. Carrega o cache de estações (recarregado por `wx_station_changed`).
4. Conecta ao MQTT (client id `collector`, sessão persistente) e assina os tópicos com QoS 1. Se a autenticação falhar (cliente ainda não provisionado), tenta de novo com espera progressiva.
5. Inicia o monitor e o sinal de vida.

### 7.2 Garantia de gravação

- `handleMessage` do mqtt.js é sobrescrito: as mensagens são processadas uma a uma e o PUBACK só sai depois do commit.
- Erro de banco → nova tentativa com espera progressiva (1 s até 30 s), sem confirmar a mensagem. O broker segura a fila; se o coletor reiniciar nesse meio-tempo, a mensagem é reentregue.
- Mensagem inválida, de estação desconhecida ou inativa → log e confirmação (não trava a fila).

### 7.3 Processamento por tipo

- **Qualquer mensagem válida** (inclusive duplicada) atualiza `station_state.last_seen_at`.
- **`telemetry`**, para cada leitura em ordem de `seq`:
  1. Valida `ts`.
  2. Aplica offsets e faixas.
  3. Calcula ponto de orvalho, pressão ao nível do mar e altitude barométrica.
  4. Converte vento e rajada.
  5. Calcula a chuva (§6.1).
  6. Numa transação: `INSERT … ON CONFLICT DO NOTHING` em `readings`; se inseriu, atualiza `station_state` (último contato, última leitura, estado da chuva) e `station_sensors`.
  7. Depois do commit: `NOTIFY wx_reading`.
  8. Contato de uma estação marcada como offline resolve o alerta `station_offline` e volta o estado para `online`.
- **`status`:** atualiza `connection`, `next_contact_at`, perfil e firmware; registra `STATION_ONLINE`, `STATION_SLEEPING` ou `STATION_OFFLINE`; `NOTIFY wx_station`.
- **`health`:** insere em `device_health`; atualiza bateria, perfil, RSSI, firmware e `config_applied_rev`; atualiza `station_sensors` a partir de `sensors` (`error` abre `sensor_error`); abre ou resolve `battery_low`/`battery_critical` (perfil Economia ou bateria < `batteryLowMv` → `battery_low`; Sobrevivência ou bateria < `batteryCriticalMv` → `battery_critical`); `dropped` crescente abre `data_dropped`.
- **`event`:** grava em `event_logs` (`source=device`). `CMD_ACK` atualiza `commands`; `CONFIG_APPLIED` atualiza `config_applied_rev`; `SENSOR_FAILED`/`SENSOR_RECOVERED` atualizam `station_sensors`.

### 7.4 Monitor (a cada 60 s)

- **Estação sem contato:** o prazo é `next_contact_at` + tolerância (o maior entre 120 s e metade de `economy_batch_s`) quando a estação está dormindo; senão, `last_seen_at` + o maior entre `offlineAfterIntervals × interval_s` e `offlineMinSeconds`. Passou do prazo → alerta `station_offline` (`warning`, sobe para `critical` após `offlineCriticalAfterSeconds`) e log `STATION_OVERDUE`.
- **Sensor parado:** com a estação em contato, um sensor sem valor há mais que o maior entre `sensorStaleAfterIntervals × interval_s` e `sensorStaleMinSeconds` → `stale` e alerta `sensor_stale`. No perfil Sobrevivência, vento e chuva ficam `not_measured`, sem alerta.
- **Sinal de vida** a cada 30 s em `service_heartbeats`.
- **Retenção:** uma vez por dia, apaga logs, diagnósticos e (se configurado) leituras mais antigos que o prazo, em lotes.

### 7.5 Logs

pino em JSON no stdout (visível no Coolify) e eventos relevantes em `event_logs`. Códigos do coletor: `PAYLOAD_INVALID`, `UNKNOWN_STATION`, `STATION_INACTIVE`, `READING_TS_OUT_OF_RANGE`, `VALUE_OUT_OF_RANGE`, `RAIN_COUNTER_ANOMALY`, `STATION_ONLINE`, `STATION_SLEEPING`, `STATION_OFFLINE`, `STATION_OVERDUE`, `SENSOR_STALE`, `MQTT_CONNECTED`, `MQTT_DISCONNECTED`, `DB_ERROR`, `COLLECTOR_STARTED`, `COLLECTOR_STOPPED`.

### 7.6 Encerramento

Ao receber SIGTERM: para de consumir, termina a mensagem em andamento, fecha o MQTT sem cancelar as assinaturas (a sessão persiste) e fecha o pool do banco.

---

## 8. App 2 — Dashboard

Um único pacote (`apps/dashboard`) com `src/server` (Fastify) e `src/web` (React). Em produção o Fastify serve o build da SPA: mesma origem, sem CORS.

### 8.1 Inicialização do servidor

1. Valida variáveis de ambiente.
2. Aplica migrações.
3. Cria o primeiro admin a partir de `ADMIN_EMAIL`/`ADMIN_PASSWORD` se não houver usuários.
4. Conecta ao MQTT como `admin` e executa o bootstrap do Dynamic Security (papéis e cliente `collector`).
5. Abre o `LISTEN` dos canais.
6. Inicia o monitor do sistema: sinal de vida do coletor com mais de 2 min → alerta `collector_down` (`critical`); limpeza de sessões expiradas a cada hora.
7. Sobe o HTTP.

### 8.2 Autenticação e sessões

- Login por e-mail e senha (argon2id). Mensagem de erro genérica. Limite de 5 tentativas por minuto por IP e por e-mail; 10 falhas seguidas bloqueiam o usuário por 15 min.
- Token de sessão aleatório (32 bytes) no cookie `wx_session` (`HttpOnly`, `Secure`, `SameSite=Strict`); o banco guarda só o SHA-256.
- Expiração deslizante de 12 h; "manter conectado" estende para 30 dias.
- Troca de senha encerra as outras sessões; desativar um usuário encerra todas as sessões dele.
- Senha com no mínimo 10 caracteres e diferente do e-mail. Usuários criados (ou com senha redefinida) pelo admin recebem senha provisória de 16 caracteres e trocam no primeiro acesso.
- Proteção contra CSRF: `SameSite=Strict` e, em requisições que alteram dados, conferência do cabeçalho `Origin` e de um cabeçalho próprio enviado pela SPA.
- Toda ação de admin é registrada em `event_logs` com `category=audit` e `user_id`.

### 8.3 Permissões

| Ação | Admin | Operador |
|---|:---:|:---:|
| Ver visão geral, estações, gráficos, dispositivos, alertas e logs | ✓ | ✓ |
| Exportar CSV | ✓ | ✓ |
| Reconhecer alertas | ✓ | ✓ |
| Trocar a própria senha | ✓ | ✓ |
| Cadastrar, editar, desativar e excluir estações; calibração; configuração remota | ✓ | — |
| Gerar e rotacionar credenciais MQTT | ✓ | — |
| Enviar comandos às estações | ✓ | — |
| Gerenciar usuários | ✓ | — |
| Alterar configurações do sistema | ✓ | — |

Regras de proteção: não é possível excluir ou desativar a si mesmo nem o último admin ativo.

### 8.4 Endpoints (`/api/v1`)

Nas rotas de estação, `:id` aceita o uuid ou o código da estação (a SPA usa o código nas URLs).

| Método e rota | Perfil | Descrição |
|---|---|---|
| `POST /auth/login` · `POST /auth/logout` · `GET /auth/me` | — | Sessão |
| `POST /auth/password` | todos | Troca da própria senha |
| `GET /users` · `POST /users` · `PATCH /users/:id` · `DELETE /users/:id` | admin | Usuários (criação devolve a senha provisória uma vez) |
| `POST /users/:id/reset-password` | admin | Nova senha provisória |
| `GET /stations` | todos | Lista com estado, últimos valores e chuva de hoje |
| `GET /stations/:id` | todos | Detalhe com estado, sensores e configuração |
| `POST /stations` | admin | Cria, provisiona o MQTT, publica a config retida e devolve as credenciais uma vez |
| `PATCH /stations/:id` | admin | Dados, local, calibração, ativação |
| `DELETE /stations/:id` | admin | Exige digitar o código; remove dados, cliente MQTT e tópicos retidos |
| `POST /stations/:id/credentials` | admin | Rotaciona a senha MQTT |
| `PUT /stations/:id/device-config` | admin | Nova configuração (incrementa `rev` e publica retida) |
| `GET /stations/:id/commands` · `POST /stations/:id/commands` | todos · admin | Histórico e envio de comandos |
| `GET /stations/:id/latest` | todos | Última leitura e derivados (sensação térmica, tendência, Beaufort) e chuva em 1 h, hoje, 24 h, 7 dias, mês e ano |
| `GET /stations/:id/series?from&to&bucket` | todos | Séries agregadas (§8.5) |
| `GET /stations/:id/daily?from&to` | todos | Resumo diário no fuso da estação |
| `GET /stations/:id/heatmap?metric&from&to` | todos | Média por hora local × dia |
| `GET /stations/:id/export.csv?from&to&bucket` | todos | CSV no padrão do Excel pt-BR (`;`, vírgula decimal, UTF-8 com BOM) |
| `GET /stations/:id/health?from&to` | todos | Série de diagnóstico |
| `GET /stations/:id/connection?from&to` | todos | Linha do tempo online/dormindo/offline |
| `GET /compare?stations&metric&from&to&bucket` | todos | Mesma grandeza de várias estações |
| `GET /alerts?status&stationId&cursor` · `POST /alerts/:id/ack` | todos | Alertas |
| `GET /logs?level&source&category&stationId&from&to&q&cursor` | todos | Logs com paginação por cursor |
| `GET /system/status` | todos | Coletor, Dashboard, MQTT, banco (tamanho, contagens) |
| `GET /settings` · `PUT /settings` | todos · admin | Configurações do sistema |
| `GET /stream` | todos | SSE (§8.6) |
| `GET /healthz` (fora de `/api/v1`) | — | Verificação de saúde para o Coolify |

### 8.5 Séries e agregações

| Período pedido | Agregação automática |
|---|---|
| até 48 h | bruto |
| até 10 dias | 10 min |
| até 62 dias | 1 h |
| acima de 62 dias | 1 dia (fuso da estação) |

Por bucket: média, mínimo e máximo de temperatura, umidade, pressão, pressão ao nível do mar e ponto de orvalho; média do vento; máximo da rajada; soma da chuva. Implementado com `date_bin` (e `date_trunc` no fuso da estação para dias).

### 8.6 Tempo real (SSE)

- Uma conexão dedicada faz `LISTEN` nos canais e distribui os eventos aos navegadores conectados.
- Eventos: `reading`, `station`, `alert` e `log`. Comentário de keepalive a cada 20 s para atravessar o proxy do Coolify e o Cloudflare Tunnel.
- O cliente usa `EventSource`. Os eventos atualizam o cache do TanStack Query e, ao reconectar, as consultas são revalidadas.

### 8.7 Telas

| Rota | Tela | Conteúdo |
|---|---|---|
| `/login` | Login | E-mail, senha, "manter conectado" |
| `/` | Visão geral | Um cartão por estação (status em cor, valores atuais, chuva de hoje, mini-gráfico de 24 h, bateria); mapa (MapLibre GL, tiles OpenFreeMap sem chave) inclinado em 3D com as estações como colunas proporcionais ao valor escolhido; alertas ativos; saúde do sistema |
| `/estacoes/:code` | Estação | **Cena 3D** (React Three Fiber, geometria procedural): mastro, anemômetro girando na velocidade medida, pluviômetro, abrigo, painel solar e bateria, LED com a cor do status, céu conforme a hora local e a posição do sol (calculada no próprio app), partículas de chuva quando chove; arrastar para girar. Indicadores ao vivo: temperatura (sensação térmica, mín./máx. do dia), umidade e ponto de orvalho, pressão da estação e ao nível do mar com tendência de 3 h, altitude barométrica, vento médio, rajada e Beaufort, chuva (1 h, hoje, mês) e taxa, bateria e sinal. Gráficos ECharts com períodos (24 h, 7 d, 30 d, 1 ano, personalizado) e zoom: temperatura (faixa mín.–máx. e média), umidade e ponto de orvalho, pressão, vento e rajada, chuva (barras e acumulado). Mapa de calor hora × dia (com versão 3D em React Three Fiber), calendário de chuva diária e tabela diária com exportação CSV |
| `/comparar` | Comparar | Mesma grandeza de várias estações num gráfico |
| `/dispositivos` | Dispositivos | Por estação: perfil de energia, bateria (V e %) e sinal ao longo do tempo, resets, firmware, buffer e descartes, linha do tempo de conexão e situação de cada sensor ("último dado há X min") |
| `/alertas` | Alertas | Ativos e histórico; reconhecimento |
| `/logs` | Logs | Filtros por nível, origem, categoria, estação, período e texto; ao vivo; detalhe em JSON (inclusive payload rejeitado) |
| `/admin/estacoes` | Estações (admin) | Lista e formulário: dados, local no mapa (altitude sugerida pela API de elevação do Open-Meteo), fuso, calibração (com calculadora do anemômetro: raio, pulsos por volta e fator → m/s por Hz), configuração remota, credenciais MQTT (exibidas uma vez, com instruções do portal), comandos, desativar e excluir |
| `/admin/usuarios` | Usuários (admin) | Criar, editar perfil, ativar/desativar, redefinir senha, excluir |
| `/admin/configuracoes` | Configurações (admin) | Retenção e limiares de monitoramento |
| `/perfil` | Meu perfil | Trocar a senha |

Status da estação na interface: **Online** (verde), **Dormindo** (neutro, com ícone de lua; sem contato esperado até `next`), **Sem contato** (âmbar/vermelho, alerta `station_offline` ativo), **Nunca conectou** (neutro) e **Desativada** (neutro). O azul fica reservado à chuva. A cor nunca aparece sozinha: sempre com ícone e texto.

### 8.8 Identidade visual

- "Painel de instrumentos ao anoitecer": tema escuro por padrão (ardósia), com modo claro opcional. A cor fica reservada aos dados e ao status; a moldura é monocromática.
- Uma cor fixa por grandeza, igual em todas as telas: chuva azul, temperatura laranja (rampa sequencial laranja no mapa de calor), ponto de orvalho verde-água, umidade violeta, pressão magenta, vento verde (a rajada é uma faixa do mesmo verde). Paleta validada para daltonismo e contraste nos dois temas (`validate_palette.js`); a bateria usa as cores de status.
- Status nunca só por cor: sempre ícone + texto (bom, atenção, sério, crítico).
- Tipografia: Archivo (variável) em três larguras: expandida nos títulos, intermediária nos valores e condensada nas tabelas.
- Painéis sólidos com bordas finas (sem efeito de vidro). O movimento fica onde é dado: o anemômetro e a chuva da cena 3D. Com `prefers-reduced-motion`, a cena fica estática.
- Responsivo para celular; textos em pt-BR; números no formato brasileiro; unidades °C, %, hPa, km/h e mm.
- Cena 3D, mapa de calor 3D, mapa e gráficos carregados sob demanda (code splitting).

---

## 9. Deploy

### 9.1 Serviços (`docker-compose.yml`)

| Serviço | Imagem | Portas | Volumes |
|---|---|---|---|
| `postgres` | `postgres:18.6-alpine` | interna | `pgdata` |
| `mosquitto` | `eclipse-mosquitto:2.1.2-alpine` | 8883 publicada; 1883 interna | `mosquitto-data`, `certs` (leitura) |
| `collector` | build de `apps/collector` | — | — |
| `dashboard` | build de `apps/dashboard` | 3000 (proxy do Coolify ou cloudflared) | — |
| `certs` | `goacme/lego` | — | `certs` |
| `backup` | `postgres:18.6-alpine` com agendamento | — | `backups` |
| `cloudflared` (perfil `tunnel`) | `cloudflare/cloudflared` | — | — |
| `ddns` (perfil `ddns`) | `favonia/cloudflare-ddns` | — | — |

Imagens dos apps: build em múltiplos estágios, usuário não-root e healthcheck.

### 9.2 VPS com Coolify

- Recurso **Docker Compose** apontando para o repositório; variáveis definidas no Coolify.
- O painel recebe domínio com HTTPS pelo proxy do Coolify.
- A porta 8883 é publicada direto no host para o MQTT.
- Registro DNS `mqtt.<domínio>` "DNS only" (nuvem cinza) apontando para o IP da VPS.

### 9.3 Servidor local com Cloudflare Tunnel

- O mesmo compose, com os perfis `tunnel` (painel publicado pelo túnel) e `ddns` (mantém `mqtt.<domínio>` apontando para o IP residencial).
- Port forward da porta 8883 no roteador para o servidor.
- ⚠️ CGNAT: se o IP WAN do roteador for diferente do IP público visto na internet, o port forward não funciona. Alternativas: usar a VPS, ou MQTT via WebSocket pelo túnel (exige suporte no firmware; fora do v1).

### 9.4 Certificados

- `lego` emite e renova (quando faltam menos de 30 dias) o certificado de `mqtt.<domínio>` pelo desafio DNS-01 da Cloudflare (token com permissão apenas de editar DNS da zona). Funciona na VPS e atrás de NAT, sem abrir a porta 80.
- O Mosquitto recarrega o certificado quando ele muda. O mecanismo exato (sinal ou reinício do container) é definido e testado na Fase 6.

### 9.5 Backup

`pg_dump` diário compactado, guardando 14 cópias diárias e 8 semanais; procedimento de restauração documentado e testado.

### 9.6 Variáveis de ambiente

| Variável | Uso |
|---|---|
| `POSTGRES_PASSWORD`, `DATABASE_URL` | Banco |
| `MOSQUITTO_DYNSEC_PASSWORD` | Senha do cliente `admin` do Mosquitto (usada pelo Dashboard); mínimo de 12 caracteres, exigência do Mosquitto 2.1 |
| `MQTT_COLLECTOR_PASSWORD` | Senha do cliente `collector` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Primeiro admin (só usado se não houver usuários) |
| `APP_URL` | URL pública do painel (cookies e conferência de `Origin`) |
| `PUBLIC_MQTT_HOST`, `PUBLIC_MQTT_PORT` | Exibidos nas instruções de configuração da estação |
| `MQTT_DOMAIN`, `ACME_EMAIL`, `CLOUDFLARE_DNS_API_TOKEN` | Certificado do MQTT |
| `TUNNEL_TOKEN` | Cloudflare Tunnel (perfil `tunnel`) |
| `LOG_LEVEL` | Nível de log dos apps |

`.env.example` documenta todas.

### 9.7 Desenvolvimento

| Comando | O que faz |
|---|---|
| `pnpm infra:up` | Sobe Postgres e Mosquitto (`infra/compose.dev.yml`, MQTT sem TLS em `127.0.0.1:1883`) |
| `pnpm db:migrate` | Aplica as migrações |
| `pnpm db:seed` | Cria admin, 3 estações de demonstração e as credenciais MQTT delas |
| `pnpm dev` | Coletor + servidor do Dashboard + Vite com hot reload |
| `pnpm simulate` | Estações virtuais publicando dados realistas |
| `pnpm check` | Lint, typecheck e testes |

---

## 10. Testes

| Nível | O que cobre |
|---|---|
| Unitário (Vitest) | Fórmulas meteorológicas, chuva por diferença com reinícios, calibração, validação do contrato, escolha de buckets, matriz de permissões |
| Integração (Postgres e Mosquitto reais) | Coletor: lote, duplicatas, inválidos, estação desconhecida, novo `run`, banco indisponível sem perda de dados, monitor (offline e sensor parado) |
| API (Fastify `inject`) | Login, sessões, bloqueio, CSRF, permissões por perfil, estações, séries, SSE |
| E2E (Playwright) | Login, navegação, admin cria estação, operador não acessa administração |
| Firmware | `pio test -e native` (rajada, buffer, máquina de perfis, payload, CRC da RTC) e `pio run -e d1_mini` |

Testes de integração usam o banco `weather_test` no Postgres do compose de desenvolvimento.

---

## 11. Fases e critérios de aceite

| Fase | Entrega | Aceite |
|---|---|---|
| 1 — Fundação | Monorepo, compose de dev, `shared`, `db`, `mqtt-admin`, `CLAUDE.md` | `pnpm check` passa; `pnpm infra:up` sobe Postgres e Mosquitto; migrações criam o esquema; bootstrap do Dynamic Security funciona |
| 2 — Coletor e simulador | App 1 completo, simulador, seed | Simulador → MQTT → banco com derivados corretos; testes de integração passam (inclusive banco fora do ar) |
| 3 — API | Endpoints da §8.4, autenticação, permissões, SSE | Testes da API passam; estação criada pela API é usada pelo simulador |
| 4 — Web | Telas da §8.7 | Fluxo completo com o simulador; Playwright passa; revisão visual |
| 5 — Firmware | Firmware + guias de hardware e calibração | Testes nativos e build passam; em bancada, a estação real aparece no painel |
| 6 — Deploy | Dockerfiles, compose de produção, TLS, Coolify/túnel, backup | Stack sobe do zero com `.env`; simulador publica via TLS 8883; restauração do backup testada |
| 7 — Melhorias | Itens da §13, priorizados com o usuário | Definido por item |

Cada fase termina com testes passando, `CLAUDE.md` atualizado e commit.

---

## 12. Riscos

| Risco | Mitigação |
|---|---|
| RAM do ESP8266 com TLS | BearSSL com Max Fragment Length e buffers reduzidos; teste em bancada no início da Fase 5 |
| CGNAT no servidor local | Verificação no guia; VPS ou WebSocket pelo túnel como alternativa |
| Basculadas falsas com o 49E | Reed switch ou DRV5032, mais debounce |
| Calibração imprecisa | Fatores no servidor e guia (chuva: seringa com volume conhecido; vento: carro em dia calmo ou comparação com estação oficial) |
| Autonomia da bateria | Perfis automáticos e alertas de bateria |
| Aquecimento do BME280 | Abrigo ventilado, longe do ESP |
| Bateria e USB juntos no pino 5V | Aviso no guia de hardware; diodo |

---

## 13. Fora do escopo do v1 (melhorias sugeridas)

- Notificações por Telegram ou e-mail (geada, ventania, chuva forte, estação offline, bateria).
- Cata-vento AS5600 no I²C (sem pinos extras, alimentado por GPIO só na leitura) e rosa dos ventos.
- Índices agrícolas: graus-dia, evapotranspiração ET0 (Hargreaves) e risco de geada.
- Previsão local pela tendência da pressão (Zambretti).
- Atualização de firmware (OTA) pelo painel.
- PWA e página pública somente leitura.
- Comparação com uma estação do INMET próxima.
- LoRa para estações fora do alcance do Wi-Fi.
- MQTT via WebSocket pelo Cloudflare Tunnel (para servidores atrás de CGNAT).
- TimescaleDB, se o volume crescer.
