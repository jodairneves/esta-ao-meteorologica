# Deploy

A produção é um único `docker-compose.yaml`, na raiz do repositório, feito para o recurso **Docker Compose** do Coolify:

| Serviço | O que faz | Acesso de fora |
|---|---|---|
| `postgres` | Banco (PostgreSQL 18) | nenhum |
| `mosquitto` | Broker MQTT, com um login por estação (Dynamic Security) | porta 1883 do servidor, para as estações |
| `collector` | App 1: grava no banco tudo o que as estações publicam | nenhum |
| `dashboard` | App 2: API e painel web | pelo proxy do Coolify, com HTTPS |
| `backup` | Backup diário do banco e dos logins do broker | nenhum |

O mesmo compose atende dois cenários:

- **Produção:** VPS da Hostinger com Coolify e IP fixo.
- **Teste e apresentação:** o Coolify de casa, com o painel pelo Cloudflare Tunnel e o MQTT por port forward.

> **O MQTT fica sem TLS.** As estações usam a porta 1883 sem criptografia, por decisão de 2026-10-23 (design §3.10). O usuário e a senha de cada estação e as leituras passam abertos pela internet. Quem capturar a senha de uma estação só consegue publicar como ela e ler a configuração dela. Os logins `admin` e `collector` nunca saem do servidor. Se a senha de uma estação vazar, gere outra no painel, na aba **Credenciais** da estação. O firmware já sabe usar TLS: para ligar depois, o broker precisa de um certificado (design §13).

## 1. Variáveis

O modelo comentado é o [`.env.production.example`](../.env.production.example). Gere cada senha com `openssl rand -hex 24`.

| Variável | Obrigatória | Para quê |
|---|---|---|
| `POSTGRES_PASSWORD` | sim | Senha do banco. Use só letras e números, porque ela entra na URL de conexão |
| `MOSQUITTO_DYNSEC_PASSWORD` | sim | Login `admin` do broker, usado pelo painel (mínimo de 12 caracteres) |
| `MQTT_COLLECTOR_PASSWORD` | sim | Login `collector` do broker, criado pelo painel ao subir |
| `APP_URL` | sim | Endereço do painel como o navegador o abre, com `https://` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | sim | Primeiro administrador, criado só com o banco vazio (senha de 10 caracteres ou mais) |
| `PUBLIC_MQTT_HOST` | sim | Endereço do broker para as estações; aparece no painel ao cadastrar uma estação |
| `PUBLIC_MQTT_PORT` | não (1883) | Porta que as estações usam |
| `MQTT_HOST_PORT` | não (1883) | Porta publicada no servidor |
| `ADMIN_NAME`, `LOG_LEVEL` | não | Nome do primeiro administrador e nível dos logs |
| `BACKUP_TZ`, `BACKUP_HOUR` | não | Fuso (`America/Sao_Paulo`) e hora (3) do backup diário |

Guarde as senhas num gerenciador de senhas:

- `POSTGRES_PASSWORD` e `MOSQUITTO_DYNSEC_PASSWORD` só valem na primeira subida, quando o banco e o broker são criados. Mudar a variável depois não muda a senha lá dentro e deixa os apps sem acesso.
- `MQTT_COLLECTOR_PASSWORD` pode mudar: o painel reaplica a senha toda vez que sobe.

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
   - Leve-as ao D1 mini pelo portal Wi-Fi ou pela página da estação na rede local (veja o [guia de hardware](hardware.md)).

## 3. Teste e apresentação: Coolify em casa

O procedimento é o mesmo da VPS, com três diferenças:

- **Painel pelo Cloudflare Tunnel.**
  - Como nos outros apps de casa, o túnel leva o endereço do painel até o proxy do Coolify (`http://localhost:80`).
  - No Coolify, o domínio continua `https://…:3000`.
  - O redirecionamento de HTTP para HTTPS fica desligado, porque o túnel chega por HTTP.
- **MQTT por port forward.**
  - O roteador encaminha a porta externa para a `MQTT_HOST_PORT` do servidor.
  - Se a 1883 já estiver em uso no servidor (por outro broker), escolha outra: por exemplo, `MQTT_HOST_PORT=1884` e `PUBLIC_MQTT_PORT=1884`, com o port forward de 1884 para 1884.
- **Endereço do broker.**
  - Use um registro "DNS only" apontando para o IP de casa (se o IP muda, um DDNS mantém o registro em dia) ou o próprio IP em `PUBLIC_MQTT_HOST`.
  - Se o IP WAN do roteador for diferente do IP que sites como `ifconfig.me` mostram, a internet de casa está atrás de CGNAT, e o port forward não funciona. Nesse caso, use a VPS.

### Passar de casa para a VPS

Há dois caminhos:

- **Do zero.** Suba a stack na VPS, cadastre as estações de novo e reconfigure cada D1 mini com o servidor e a senha novos.
- **Levando os dados.**
  1. Em casa, faça um backup (`backup.sh now`, seção 5) e copie para fora do servidor os dois arquivos do dia: o `.dump` e o `.json`.
  2. Suba a stack na VPS com a mesma `MOSQUITTO_DYNSEC_PASSWORD` de casa.
  3. Copie o `.dump` para o container `backup` da VPS (`docker cp weather-AAAA-MM-DD.dump <container-backup>:/backups/`) e restaure o banco e os logins do broker (seção 5).
  4. Nas estações, troque só o servidor (e a porta, se mudou) pela página local. As senhas continuam as mesmas.

## 4. Atualizações

- Envie as mudanças para a `main` e clique em **Redeploy** no Coolify, ou ligue o deploy automático pelo webhook do GitHub.
- As migrações do banco rodam sozinhas quando os apps sobem.
- Durante a troca nada se perde. O broker guarda as mensagens para a sessão do coletor, e se o próprio broker reiniciar, as estações seguram as leituras no buffer e reenviam depois.

## 5. Backup e restauração

Todo dia, na hora `BACKUP_HOUR` do fuso `BACKUP_TZ`, o serviço `backup` grava no volume `backups`:

- `daily/weather-AAAA-MM-DD.dump`: o banco inteiro (`pg_dump` no formato custom);
- `daily/mosquitto-AAAA-MM-DD.json`: os logins do broker (arquivo do Dynamic Security).

Ficam 14 cópias diárias e 8 semanais (em `weekly/`, as de domingo). Se o serviço sobe depois da hora marcada e ainda não houve backup no dia, ele faz um na hora.

No terminal do container `backup` (pelo Coolify, ou com `docker exec -it <container> sh` no servidor):

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

1. Pare o coletor e o painel: `docker stop <container-collector> <container-dashboard>`.
2. No container `backup`, rode `restore.sh /backups/daily/weather-AAAA-MM-DD.dump` e digite o nome do banco (`weather`) para confirmar.
   - O script restaura num banco novo e só então troca os nomes. O banco atual fica guardado como `weather_before_restore_<data>`.
   - Se o coletor ou o painel ainda estiverem conectados, a troca é recusada e nada muda.
3. Suba os dois de novo (`docker start …` ou Redeploy) e confira o painel.
4. Quando estiver tudo certo, apague o banco anterior com o comando que o script mostrou no fim.

### Restaurar os logins do broker

Só é preciso se o volume do broker se perdeu ou na mudança de servidor. A `MOSQUITTO_DYNSEC_PASSWORD` tem que ser a mesma de quando o backup foi feito. No servidor:

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
| O login mostra "Requisição recusada por segurança" | A `APP_URL` tem que ser exatamente o endereço aberto no navegador, com `https://` |
| O painel não atualiza sozinho | O tempo real usa SSE (`/api/v1/stream`), que não pode ficar retido no proxy. Recarregue a página e veja os logs do `dashboard` |
| `collector` não saudável | O heartbeat dele não está chegando ao banco: veja os logs do `collector` e do `postgres` |
| O deploy não começa | Falta alguma variável obrigatória (o Coolify destaca as vazias) |

Para conferir a API: `https://estacao.seudominio.com.br/healthz` responde `{"ok":true,"broker":true}` quando a API, o banco e o broker estão bem.

## 7. Ensaio local

Para testar a produção numa máquina de desenvolvimento, sem o Coolify:

1. Crie o `.env.rehearsal` a partir do `.env.production.example` (o git ignora o arquivo) com:
   - `APP_URL=http://localhost:3400`;
   - `MQTT_HOST_PORT=127.0.0.1:1884` e `PUBLIC_MQTT_PORT=1884`;
   - `PUBLIC_MQTT_HOST=localhost`.
2. Suba a stack:

   ```bash
   docker compose -p wx-rehearsal --env-file .env.rehearsal -f docker-compose.yaml \
     -f infra/compose.rehearsal.yml up -d --build --wait
   ```

O painel abre em <http://localhost:3400> e o broker atende em `127.0.0.1:1884`, sem conflito com o ambiente de desenvolvimento. `docker compose -p wx-rehearsal down -v` apaga tudo o que o ensaio criou.
