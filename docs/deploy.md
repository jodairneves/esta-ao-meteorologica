# Deploy

São dois composes na raiz do repositório, os dois feitos para o recurso **Docker Compose** do Coolify:

| Compose | Onde | Broker | Login das estações |
|---|---|---|---|
| `docker-compose.yaml` | **VPS da Hostinger** (produção definitiva) | Mosquitto próprio, publicado na porta 1883 | Um login por estação, criado pelo painel |
| `docker-compose.home.yaml` | **Coolify de casa** (teste e apresentação) | O broker de produção que já roda no Coolify | O login único desse broker, igual para todas |

| Serviço | O que faz | VPS | Casa |
|---|---|---|---|
| Banco | PostgreSQL 18 | `postgres` | `wx-postgres` |
| Broker | Mosquitto com Dynamic Security | `mosquitto` | — (usa o de produção) |
| Coletor | App 1: grava no banco tudo o que as estações publicam | `collector` | `wx-collector` |
| Painel | App 2: API e painel web, atrás do proxy do Coolify | `dashboard` | `wx-dashboard` |
| Backup | Backup diário do banco (e, na VPS, dos logins do broker) | `backup` | `wx-backup` |

Em casa, os serviços levam o prefixo `wx-` porque o coletor e o painel entram na rede `coolify`, compartilhada por outras stacks.

> **MQTT sem TLS.** Nos dois composes, as estações usam a porta 1883 sem criptografia (decisão de 2026-10-23, design §3.10). O usuário, a senha e as leituras passam abertos pela internet.
> - **Na VPS**, cada estação tem login próprio, preso aos tópicos dela. Se uma senha vazar, gere outra no painel, na aba **Credenciais** da estação.
> - **Em casa**, todas as estações usam o login único do broker de produção, o mesmo dos outros dispositivos da casa. Quem capturar essa senha tem acesso total ao broker. Uma estação pode publicar como outra, e o painel não consegue bloquear uma estação no broker. Se a senha vazar, troque-a no broker e configure de novo as estações e os demais dispositivos.

## 1. Variáveis

Os modelos comentados são o [`.env.production.example`](../.env.production.example) (VPS) e o [`.env.home.example`](../.env.home.example) (casa). Gere as senhas com `openssl rand -hex 24`.

| Variável | VPS | Casa | Para quê |
|---|---|---|---|
| `POSTGRES_PASSWORD` | sim | sim | Senha do banco. Os apps a recebem à parte da URL de conexão (`PGPASSWORD`), então qualquer caractere serve |
| `MOSQUITTO_DYNSEC_PASSWORD` | sim | — | Login `admin` do broker próprio, usado pelo painel (mínimo de 12 caracteres) |
| `MQTT_COLLECTOR_PASSWORD` | sim | — | Login `collector` do broker próprio, criado pelo painel ao subir |
| `MQTT_USERNAME`, `MQTT_PASSWORD` | — | sim | Login único do broker de produção (`SERVICE_USER_MOSQUITTO` e `SERVICE_PASSWORD_MOSQUITTO` do serviço dele no Coolify) |
| `MQTT_URL` | — | não (`mqtt://mosquitto:1883`) | Como o coletor e o painel chegam ao broker de produção |
| `APP_URL` | sim | sim | Endereço do painel como o navegador o abre, com `https://` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | sim | sim | Primeiro administrador, criado só com o banco vazio (senha de 10 caracteres ou mais) |
| `PUBLIC_MQTT_HOST` | sim | sim | Endereço do broker para as estações; aparece no painel ao cadastrar uma estação |
| `PUBLIC_MQTT_PORT` | não (1883) | não (1883) | Porta que as estações usam |
| `MQTT_HOST_PORT` | não (1883) | — | Porta publicada no servidor |
| `ADMIN_NAME`, `LOG_LEVEL` | não | não | Nome do primeiro administrador e nível dos logs |
| `BACKUP_TZ`, `BACKUP_HOUR` | não | não | Fuso (`America/Sao_Paulo`) e hora (3) do backup diário |

Guarde as senhas num gerenciador de senhas:

- `POSTGRES_PASSWORD` e `MOSQUITTO_DYNSEC_PASSWORD` só valem na primeira subida, quando o banco e o broker são criados. Mudar a variável depois não muda a senha lá dentro e deixa os apps sem acesso.
- `MQTT_COLLECTOR_PASSWORD` pode mudar: o painel reaplica a senha toda vez que sobe.
- Em casa, `MQTT_USERNAME` e `MQTT_PASSWORD` acompanham o broker de produção: se a senha dele mudar, atualize as duas aqui e configure de novo as estações.

## 2. Produção: VPS da Hostinger com Coolify

1. **Firewall.** Libere as portas 80 e 443 (o painel, pelo proxy do Coolify) e a **1883/TCP** (as estações). Se o firewall da VPS estiver ativo no painel da Hostinger, crie as regras lá também.
2. **DNS na Cloudflare.**
   - Painel (ex.: `estacao`): registro A com o IP da VPS. Com a nuvem laranja, use o modo SSL **Full (strict)**. Com a cinza, o Coolify emite o certificado sozinho.
   - Broker (ex.: `mqtt-estacao`): registro A com o IP da VPS e **nuvem cinza** ("DNS only"). O proxy da Cloudflare não leva MQTT na 1883, e com a nuvem laranja as estações não conectam.
3. **Recurso no Coolify.**
   - New Resource, com o repositório do GitHub (se o repositório for privado, pelo app do GitHub ou por uma deploy key).
   - Build Pack **Docker Compose**, branch `main`.
   - Base Directory `/` e Docker Compose Location `/docker-compose.yaml`.
4. **Variáveis.** Preencha as obrigatórias em Environment Variables; o Coolify não faz o deploy com elas vazias.
   - `APP_URL`: `https://estacao.seudominio.com.br`.
   - `PUBLIC_MQTT_HOST`: o nome do broker do passo 2.
5. **Domínio.** No serviço `dashboard`, use `https://estacao.seudominio.com.br:3000`. O `:3000` diz ao proxy do Coolify em que porta do container o painel escuta; o navegador continua usando a 443.
6. **Deploy.** O primeiro build leva de 1 a 3 minutos. No fim, os cinco serviços ficam rodando, e quatro deles saudáveis (o `backup` não tem verificação de saúde). Na primeira subida, estes avisos são esperados:
   - no `collector`, `Connection refused: Not authorized`, até o painel criar o login dele (ele conecta sozinho logo depois);
   - no `dashboard`, `broker closed the connection during the bootstrap`. O broker derruba o `admin` quando ele ganha o papel que o painel usa, e o painel reconecta em seguida.
7. **Primeiro acesso.** Abra o painel, entre com `ADMIN_EMAIL` e `ADMIN_PASSWORD` e troque a senha em **Meu perfil**.
8. **Estações.** Cadastre cada estação no painel.
   - As credenciais aparecem uma única vez: servidor, porta 1883, TLS desligado, código e senha.
   - No D1 mini, o **Usuário MQTT** fica em branco: o usuário é o código da estação.
   - Leve os dados ao D1 mini pelo portal Wi-Fi ou pela página da estação na rede local (veja o [guia de hardware](hardware.md)).

## 3. Teste e apresentação: Coolify de casa

Aqui não sobe broker: o coletor e o painel usam o broker de produção que já roda no mesmo Coolify. Ele atende como `mosquitto` na rede `coolify`, com um único login para todo mundo.

1. **Recurso no Coolify.** Como na VPS, mas com Docker Compose Location `/docker-compose.home.yaml`. Deixe desligada a opção "Connect to Predefined Network": o compose já põe o coletor e o painel na rede `coolify`.
2. **Variáveis** (modelo em `.env.home.example`).
   - `MQTT_USERNAME` e `MQTT_PASSWORD`: os valores de `SERVICE_USER_MOSQUITTO` e `SERVICE_PASSWORD_MOSQUITTO` do serviço do broker.
   - `PUBLIC_MQTT_HOST`: o nome do DDNS de casa. `PUBLIC_MQTT_PORT`: a porta que o roteador encaminha (normalmente 1883).
3. **Painel pelo Cloudflare Tunnel.** Como nos outros apps de casa, o túnel leva o endereço do painel até o proxy do Coolify (`http://localhost:80`). No serviço `wx-dashboard`, o domínio é `https://estacao.seudominio.com.br:3000`, e o redirecionamento de HTTP para HTTPS fica desligado, porque o túnel chega por HTTP.
4. **MQTT pela internet.**
   - No pfSense, crie o port forward na WAN que aceita conexões de entrada (a da TIM; a outra está atrás de CGNAT) levando a porta até o IP do servidor, porta 1883.
   - O DDNS precisa seguir o IP dessa WAN.
   - Estações **dentro de casa** que usam o nome do DDNS precisam de NAT reflection no pfSense, ou de um Host Override no DNS Resolver apontando o nome para o IP do servidor na LAN. Sem isso, elas não conectam de dentro.
5. **Deploy.** Os quatro serviços sobem, e três ficam saudáveis (o `wx-backup` não tem verificação de saúde). O coletor conecta de primeira, porque o login já existe no broker.
6. **Estações.** Cadastre cada estação no painel. Nesse modo:
   - não há senha por estação. No D1 mini, use o servidor e a porta do cadastro, TLS desligado, o código da estação, o **Usuário MQTT** do broker e a senha do broker;
   - **Desativar** não bloqueia a estação no broker: ela continua conectada, e o coletor ignora o que ela enviar;
   - **Excluir** apaga a estação do banco e limpa as mensagens retidas dela no broker;
   - a aba **Credenciais** não gera senha nova: a senha só muda no broker.

O broker de produção usa os limites padrão do Mosquitto. Se o coletor ficar fora do ar, o broker guarda até 1.000 mensagens para ele. Com 4 estações enviando uma leitura por minuto, isso dá umas 4 horas; acima disso, as mais antigas se perdem.

### Passar de casa para a VPS

Na VPS tudo é novo: o compose `docker-compose.yaml`, com broker próprio e um login por estação.

1. Suba a stack na VPS (seção 2) e cadastre as estações lá.
2. Em cada D1 mini, troque o servidor pelo da VPS, deixe o **Usuário MQTT** em branco e use a senha que o cadastro mostrou.
3. Para levar o histórico de casa, restaure o backup do banco de casa na VPS (seção 5), em vez de cadastrar de novo.
   - As estações chegam sem login no broker da VPS.
   - Gere uma senha nova para cada uma na aba **Credenciais** e leve-a ao D1 mini.
   - Os usuários do painel também vêm de casa: entre com a senha que você usava lá.

## 4. Atualizações

- Envie as mudanças para a `main` e clique em **Redeploy** no Coolify, ou ligue o deploy automático pelo webhook do GitHub.
- As migrações do banco rodam sozinhas quando os apps sobem.
- Durante a troca nada se perde. O broker guarda as mensagens para a sessão do coletor, e se o próprio broker reiniciar, as estações seguram as leituras no buffer e reenviam depois.

## 5. Backup e restauração

Todo dia, na hora `BACKUP_HOUR` do fuso `BACKUP_TZ`, o serviço de backup grava no volume `backups`:

- `daily/weather-AAAA-MM-DD.dump`: o banco inteiro (`pg_dump` no formato custom);
- `daily/mosquitto-AAAA-MM-DD.json`: só na VPS, os logins do broker (arquivo do Dynamic Security). Em casa, o broker é de outra stack e tem os próprios backups.

Ficam 14 cópias diárias e 8 semanais (em `weekly/`, as de domingo). Se o serviço sobe depois da hora marcada e ainda não houve backup no dia, ele faz um na hora.

No terminal do container de backup (pelo Coolify, ou com `docker exec -it <container> sh` no servidor):

| Comando | O que faz |
|---|---|
| `backup.sh now` | Backup imediato |
| `ls -lh /backups/daily /backups/weekly` | Lista os backups |
| `restore.sh <arquivo .dump>` | Restaura o banco (veja abaixo) |

Os nomes dos containers no Coolify levam um sufixo; para descobri-los no servidor, use `docker ps --format '{{.Names}}'`.

### Cópia fora do servidor

O volume `backups` fica no mesmo disco do banco, e um defeito no servidor leva os dois. De tempos em tempos, copie os backups para outro lugar. Por exemplo, no servidor:

```bash
docker cp <container-backup>:/backups ./backups-estacao
```

Depois, baixe a pasta com `scp`. Os snapshots da VPS da Hostinger são uma camada extra.

### Restaurar o banco

1. Pare o coletor e o painel: `docker stop <container-coletor> <container-painel>`.
2. Se o backup veio de outro servidor, copie-o para o container de backup: `docker cp weather-AAAA-MM-DD.dump <container-backup>:/backups/`.
3. No container de backup, rode `restore.sh /backups/daily/weather-AAAA-MM-DD.dump` (ou o caminho do passo 2) e digite o nome do banco (`weather`) para confirmar.
   - O script restaura num banco novo e só então troca os nomes. O banco atual fica guardado como `weather_before_restore_<data>`.
   - Se o coletor ou o painel ainda estiverem conectados, a troca é recusada e nada muda.
4. Suba os dois de novo (`docker start …` ou Redeploy) e confira o painel.
5. Quando estiver tudo certo, apague o banco anterior com o comando que o script mostrou no fim.

### Restaurar os logins do broker (VPS)

Só é preciso se o volume do broker se perdeu ou na mudança de uma VPS para outra. A `MOSQUITTO_DYNSEC_PASSWORD` tem que ser a mesma de quando o backup foi feito. No servidor:

```bash
docker cp <container-backup>:/backups/daily/mosquitto-AAAA-MM-DD.json .
docker stop <container-mosquitto>
docker cp mosquitto-AAAA-MM-DD.json <container-mosquitto>:/mosquitto/data/dynamic-security.json
docker start <container-mosquitto>
```

As estações voltam a conectar com as senhas que já tinham.

## 6. Problemas comuns

| Sintoma | O que conferir |
|---|---|
| A estação não conecta (`erro -3` no monitor serial) | A porta está liberada no firewall ou no roteador? O registro do broker está com a nuvem cinza? No D1 mini, a porta é a de `PUBLIC_MQTT_PORT`, com o TLS desligado? |
| Em casa, só as estações de dentro de casa não conectam | Falta NAT reflection no pfSense, ou um Host Override do nome do DDNS para o IP do servidor na LAN |
| A estação conecta, mas o log mostra `código 5` (login recusado) | Na VPS, o **Usuário MQTT** tem que ficar em branco. Em casa, ele é o usuário do broker, com a senha do broker |
| O login mostra "Requisição recusada por segurança" | A `APP_URL` tem que ser exatamente o endereço aberto no navegador, com `https://` |
| O painel não atualiza sozinho | O tempo real usa SSE (`/api/v1/stream`), que não pode ficar retido no proxy. Recarregue a página e veja os logs do painel |
| Coletor não saudável | O heartbeat dele não está chegando ao banco: veja os logs do coletor e do banco |
| `password authentication failed for user "weather"` no log do banco | O volume do banco foi criado com outra `POSTGRES_PASSWORD`, que só vale na primeira subida. No início do log do banco aparece `Skipping initialization`. Corrija sem apagar nada: no terminal do container do banco, rode `psql -U weather -d weather`, depois `\password weather`, e digite a senha atual da variável. Em seguida, reinicie o recurso |
| O deploy não começa | Falta alguma variável obrigatória (o Coolify destaca as vazias) |

Para conferir a API: `https://estacao.seudominio.com.br/healthz` responde `{"ok":true,"broker":true}` quando a API, o banco e o broker estão bem.

## 7. Ensaio local

Os dois composes podem ser testados numa máquina de desenvolvimento, sem o Coolify. O painel abre em <http://localhost:3400> e o broker atende em `127.0.0.1:1884`, sem conflito com o ambiente de desenvolvimento.

**VPS** (`docker-compose.yaml`):

1. Crie o `.env.rehearsal` a partir do `.env.production.example` (o git ignora o arquivo) com `APP_URL=http://localhost:3400`, `MQTT_HOST_PORT=127.0.0.1:1884`, `PUBLIC_MQTT_PORT=1884` e `PUBLIC_MQTT_HOST=localhost`.
2. Suba e, no fim, apague tudo:

   ```bash
   docker compose -p wx-rehearsal --env-file .env.rehearsal -f docker-compose.yaml \
     -f infra/compose.rehearsal.yml up -d --build --wait
   docker compose -p wx-rehearsal down -v
   ```

**Casa** (`docker-compose.home.yaml`): o ensaio sobe um broker configurado como o de produção (login único, sem ACL).

1. Crie o `.env.home-rehearsal` a partir do `.env.home.example`, com qualquer usuário e senha em `MQTT_USERNAME` e `MQTT_PASSWORD` e `APP_URL=http://localhost:3400`.
2. A rede `coolify` existe em todo servidor do Coolify. Na máquina de desenvolvimento, crie uma e apague no fim:

   ```bash
   docker network create coolify
   docker compose -p wx-home-rehearsal --env-file .env.home-rehearsal -f docker-compose.home.yaml \
     -f infra/compose.home-rehearsal.yml up -d --build --wait
   docker compose -p wx-home-rehearsal down -v && docker network rm coolify
   ```
