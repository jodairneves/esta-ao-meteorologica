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

Ainda não implementados — são criados na Fase 1 (ver §9.7 do design). Esta seção será atualizada com os comandos reais.

## Estado atual

- **Fase atual:** 1 — Fundação (não iniciada).
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
