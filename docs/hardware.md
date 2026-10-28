# Guia de hardware

Como montar, ligar, gravar e configurar a estação com o Wemos D1 mini (ESP8266). O firmware fica em [`firmware/`](../firmware) e segue a §4 do [design](superpowers/specs/2026-10-22-estacao-meteorologica-design.md).

## Versões da estação

| | Completa | HTU21D |
|---|---|---|
| Sensor de clima | BME280 | HTU21D (módulo GY-21) |
| Temperatura e umidade | ✓ | ✓ |
| Pressão, tendência e altitude barométrica | ✓ | — |
| Vento (anemômetro), chuva (pluviômetro) e bateria | ✓ | ✓ |

O firmware é o mesmo nas duas: no boot ele procura o BME280 e, se não achar, o HTU21D. No painel, a versão é escolhida no cadastro da estação. Se o sensor ligado não bater com o cadastro, o log mostra o aviso `CLIMATE_SENSOR_MISMATCH`.

> Cuidado ao comprar o BME280: o **BMP280**, muito parecido e mais barato, não mede umidade.

## Lista de materiais

| Item | Observação |
|---|---|
| Wemos D1 mini (4 MB) | ESP8266 |
| BME280 **ou** HTU21D | I²C, 3,3 V |
| Anemômetro de conchas | Modelo de referência: MakerWorld (SoftWareCrash), 3 ímãs, raio de 80 mm |
| Pluviômetro de báscula | Modelo de referência: MakerWorld (laisch), 0,64 mm por basculada |
| 2 sensores de pulso | Reed switch (consumo zero), Hall **digital** de baixo consumo (ex.: DRV5032) ou o módulo **KY-024** (49E com comparador), o dos modelos de referência. O 49E solto não é recomendado (veja "Sensores de pulso") |
| Célula 18650 (Li-ion) e suporte | |
| Carregador TP4056 **com proteção** (DW01) | Também protege contra descarga profunda |
| Painel solar 5–6 V, 1–3 W | Opcional |
| Resistor de 100 kΩ | Divisor da bateria no A0 |
| Fio curto | Entre D0 e RST (acordar do deep sleep) |
| Abrigo ventilado (pratos empilhados) | Para o sensor de clima |
| Caixa estanque | Para o D1 mini e a bateria |

## Ligações

Para imprimir e levar para a bancada: [`manual-de-ligacao.pdf`](manual-de-ligacao.pdf), com desenhos de cada ligação, a medição da bateria, o teste depois de ligar e os problemas comuns. Ele é gerado por `pnpm docs:manual` a partir de `docs/manual-de-ligacao/gerar.mjs`; ao mudar uma ligação, atualize os dois.

| Componente | Pino | GPIO | Observação |
|---|---|---|---|
| Sensor de clima VCC / GND | 3V3 / G | — | BME280 ou HTU21D (só um) |
| Sensor de clima SDA | D2 | 4 | |
| Sensor de clima SCL | D1 | 5 | |
| Pluviômetro | D5 | 14 | Reed switch, Hall digital ou KY-024 (veja "Sensores de pulso"); entrada com pull-up |
| Anemômetro | D6 | 12 | Idem |
| Bateria (+), passando pelo resistor de 100 kΩ | A0 | — | Com o divisor interno da placa, o fundo de escala fica em ~4,2 V |
| D0 ligado ao RST | D0 | 16 | **Obrigatório** para o perfil Sobrevivência: sem ele a placa não acorda |
| LED da placa | D4 | 2 | Pisca com o comando "Piscar o LED" |

```
            ┌──────────────┐
  BME280 ───┤ 3V3      5V  ├─── OUT+ do TP4056
 ou HTU21D ─┤ G        G   ├─── OUT− do TP4056
            │ D1 SCL   A0  ├──[100 kΩ]── + da bateria
            │ D2 SDA   D0  ├──┐
            │ D5 ◄ pluviômetro│
            │ D6 ◄ anemômetro │
            │          RST ├──┘ (fio D0–RST)
            └──────────────┘
```

Retire os LEDs das plaquinhas dos sensores de pulso: além de gastar bateria, alguns invertem o sinal.

### Sensores de pulso

O anemômetro (D6) e o pluviômetro (D5) aceitam qualquer um destes. As ligações valem para os dois pinos.

| Sensor | Ligação | Observação |
|---|---|---|
| Reed switch | Um fio no D5 ou D6, o outro no **G** | Não gasta nada: o melhor para bateria |
| Hall digital de 3,3 V (DRV5032) | VCC no **3V3**, GND no **G**, OUT no D5 ou D6 | Baixo consumo |
| Módulo KY-024 (49E com comparador LM393) | **+** no **3V3**, **G** no **G**, **DO** no D5 ou D6; o AO fica solto | O dos modelos de referência. Em 3,3 V, a saída DO não passa de 3,3 V. Ajuste o potenciômetro até o LED da saída acender só com o ímã bem na frente. Gasta alguns mA o tempo todo |
| 49E solto | VCC no **5V**, GND no **G**, OUT no D5 ou D6 passando por **1 kΩ**, com **10 kΩ** do pino para o **G** (divisor), e 100 nF entre VCC e GND, colado no sensor | Último recurso: só com 5 V estáveis e com o divisor ajustado à alimentação. Detalhes abaixo |

**Por que o 49E solto dá trabalho:** ele é analógico, e a saída varia aos poucos com o campo do ímã. No KY-024, o comparador transforma essa tensão num sinal liga/desliga limpo. Sem o comparador, quem decide é o próprio pino do D1 mini:
- **Em 3,3 V,** a saída em repouso (~1,65 V) cai bem no ponto de virada do pino. A enxurrada de interrupções reinicia a placa (`Soft WDT reset`) e atrapalha o I²C.
- **Em 5 V, sem divisor,** os ímãs mal passam do ponto de virada (~1,65 V). Na bancada, pelo USB (~4,4 V no pino 5V), a saída ficava em 2,19 V parada e ia a 1,30, 1,64 e 1,51 V com os três ímãs do rotor. Um só ímã contava certo; com o ímã devagar, o ruído na virada (inclusive os 60 Hz da rede, pelo USB do computador) contava a mais.
- **Com o divisor** (1 kΩ em série, 10 kΩ do pino para o G), tudo cai ~9%: 2,01 V parada e de 1,24 a 1,50 V com os ímãs. O ponto de virada fica no meio do caminho, e a bancada deu 30 pulsos em 10 voltas e zero com o rotor parado.
- **Ajuste à alimentação:** a saída do 49E acompanha a tensão do 5V. Na alimentação definitiva, meça o pino contra o G: sem ímã, precisa ficar acima de ~1,95 V; com o ímã mais fraco, abaixo de ~1,5 V. Numa fonte de 5,0 V, troque o 1 kΩ por uns 3,3 kΩ. Ímã fraco demais: aumente o resistor de série; tensão sem ímã baixa demais: diminua.
- **Um diodo em série no lugar do 1 kΩ** baixa a tensão de uma vez. O de silício (1N4148, 1N4007, ~0,55 V) baixou demais: a tensão parada caiu para 1,62 V, no ponto de virada.
- **Proteção opcional:** o polo sul leva a saída a ~4 V. Um diodo Schottky do pino para o 3V3, com a faixa no 3V3, segura o pino. Com a faixa no pino, ele prende o pino em nível alto (~2,7 V) e nada conta.

**Filtros do firmware** (iguais aos dos modelos de referência):
- **Anemômetro:** cada borda reinicia o filtro, e um pulso só conta depois de 10 ms sem bordas. É a regra do `pulse_counter` do ESPHome. Conta até ~30 m/s no modelo de referência.
- **Pluviômetro:** uma mudança só vale depois de durar 10 ms. São os `delayed_on`/`delayed_off` do pluviômetro de referência.

Na bancada, o log serial mostra os pulsos de cada leitura:

```
[wx] leitura 35: vento 30 pulsos em 60 s (rajada de 3 s: 9), contador da chuva 4
```

Com 3 ímãs no rotor, 10 voltas dentro de um minuto devem dar 30 pulsos. O contador da chuva é o total desde que a placa ligou.

## Alimentação

- A 18650 liga no TP4056 (B+ e B−); a saída OUT+/OUT− vai ao pino **5V** e ao GND do D1 mini, que regula para 3,3 V.
- O painel solar, se houver, vai na entrada IN+/IN− do TP4056.
- ⚠️ **Nunca ligue o USB com a bateria conectada ao pino 5V**: o USB alimentaria a bateria diretamente. Desconecte a bateria para gravar ou use um diodo Schottky na saída do TP4056.
- Sem o resistor no A0, o painel não sabe a tensão da bateria: use o perfil de energia **Sempre Normal** ou **Sempre Economia** na configuração remota (o automático depende da medição).

| Perfil | Quando | O que a estação faz | Consumo aprox. |
|---|---|---|---|
| Normal | Bateria acima de 3,80 V (padrão) | Wi-Fi ligado, envia cada leitura | 20–30 mA |
| Economia | Abaixo de 3,65 V | Conta pulsos com o Wi-Fi desligado; envia em lote a cada 10 min | ~15 mA |
| Sobrevivência | Abaixo de 3,45 V | Deep sleep de 30 min; ao acordar mede clima e bateria (vento e chuva ficam sem medição) | < 1 mA |

A troca exige 3 medições seguidas (uma por minuto) e só volta ao Normal a partir de 3,80 V. Abaixo de 3,3 V a estação nem liga o Wi-Fi. Os limiares mudam no painel, em **Cadastro de estações → Configuração remota**.

## Montagem

- **Sensor de clima:** dentro do abrigo ventilado, à sombra, a cerca de 1,5 m do chão e longe da caixa do D1 mini (o ESP8266 esquenta e falsearia a temperatura).
- **Anemômetro:** no alto do mastro, sem obstáculos por perto.
- **Pluviômetro:** nivelado, longe de árvores, paredes e do respingo do telhado.

## Gravar o firmware

Precisa do [PlatformIO](https://platformio.org/) (extensão do VS Code ou linha de comando).

```bash
cd firmware
pio run -t upload        # compila e grava pelo USB
pio device monitor       # log serial (115200)
```

Se a gravação falhar, desconecte o fio D0–RST durante o upload e ligue de novo depois.

A senha da rede de configuração fica em `PORTAL_PASSWORD`, no `platformio.ini` (padrão `12345678`, prático para a bancada e fraco para o campo). Troque antes de gravar estações de produção: quem estiver perto durante o portal aberto pode reconfigurar a estação.

O firmware só é atualizado pelo USB: o portal não aceita envio de firmware.

## Configurar no portal

1. No painel, cadastre a estação (**Cadastro de estações → Nova estação**), escolhendo a versão. Anote os dados de conexão que aparecem em seguida. Com um login por estação (VPS e desenvolvimento), a senha aparece uma única vez. Com o broker compartilhado (compose de casa), a estação usa o usuário e a senha do próprio broker, que não ficam no painel.
2. Ligue a estação. Sem configuração, ela cria a rede Wi-Fi **Estacao-XXXXXX**.
3. Conecte o celular a essa rede (senha do `PORTAL_PASSWORD`, padrão `12345678`). A página de configuração abre sozinha, como no Wi-Fi de hotel (portal cativo):
   - No iPhone, a janela abre logo depois de conectar.
   - No Android, ela abre sozinha ou aparece a notificação **Fazer login na rede**; toque nela.
   - Se nada aparecer, desligue os dados móveis e confira se o **DNS privado** está em "Automático" ou "Desativado" (com um provedor fixo, o celular não percebe o portal). Em último caso, acesse <http://192.168.4.1> no navegador.
4. A página já abre na lista de redes encontradas, da mais forte para a mais fraca. Toque na rede do local e digite a senha dela.
   - Se a rede não aparecer, digite o nome em **Nome da rede** ou toque em **Procurar redes de novo**, no fim da página.
   - O D1 mini só enxerga redes de **2,4 GHz**.
5. Em **Conexão com o servidor**, preencha servidor MQTT, porta, conexão segura (TLS), código da estação, usuário MQTT e senha MQTT.
   - **Usuário MQTT:** deixe em branco quando cada estação tem login próprio, porque aí o usuário é o código da estação. Com o broker compartilhado, digite o usuário do broker.
6. Toque em **Salvar**. A estação se conecta e aparece online no painel em alguns segundos. Se não aparecer, a senha do Wi-Fi ou os dados do servidor podem estar errados: abra o portal de novo (abaixo) e confira.

Para abrir o portal de novo (trocar o Wi-Fi ou a senha): **dois toques no botão RESET em até 3 segundos**. Deixar o campo de senha MQTT vazio mantém a senha salva. Se ninguém configurar em 5 minutos, a estação dorme 15 minutos e tenta de novo, para poupar a bateria.

Ao trocar de servidor (da bancada para a produção, por exemplo), de código, de usuário ou de senha, a estação esquece a configuração remota antiga e recebe a do novo cadastro assim que se conecta.

## Configurar pela rede local

Depois que a estação entra no Wi-Fi, dá para trocar o servidor e a rede sem ir até ela, de um computador ou celular **na mesma rede**:

1. No painel, abra a estação. Em **Energia e sinal** ficam o **IP na rede** e o link **Abrir a página da estação**.
2. Entre com o usuário **admin** e a senha mostrada ali (botões **Ver** e **Copiar**, só para administradores). Se a estação ainda não tiver senha, toque em **Gerar senha**. Até a estação receber a primeira senha do painel, vale a senha do portal.
3. Troque o que precisar e toque em **Salvar**:
   - **Servidor MQTT:** servidor, porta, TLS, código, usuário (vazio usa o código) e senha (vazia mantém a salva).
   - **Wi-Fi:** preencha só para trocar de rede. Depois de salvar, a página deixa de responder no endereço antigo.

A estação testa a alteração por até 2 minutos. Se o que mudou conectar, ela mantém; se não, volta sozinha para a configuração anterior. O resultado aparece nos logs do painel ("Configuração alterada pela página local" ou "desfeita").

A página só existe no perfil Normal: em Economia e Sobrevivência o Wi-Fi fica desligado quase o tempo todo. Se a estação nunca conectou ao servidor, o painel ainda não sabe o IP: procure-o na lista de aparelhos do roteador, com o nome **estacao-{código}** (por exemplo, `estacao-bancada`), ou no log serial.

Para trocar a senha da página: **Cadastro de estações → (estação) → Credenciais → Gerar nova senha da página**. Ela chega à estação junto com a configuração remota.

## Teste em bancada

Roteiro para validar o firmware com a placa de verdade, publicando no ambiente de desenvolvimento.

1. **Broker na rede local:** o Mosquitto de desenvolvimento só aceita conexões da própria máquina. Durante o teste, coloque `DEV_MQTT_BIND=0.0.0.0` no `.env` e rode `pnpm infra:up`. Depois do teste, remova a linha e rode `pnpm infra:up` de novo.
2. Rode `pnpm dev` e cadastre uma estação de teste no painel, na versão do sensor que estiver ligado.
3. Grave o firmware e configure pelo portal: servidor = IP do computador na rede, porta **1883**, TLS **desligado** (ao desmarcar o TLS, a porta passa sozinha de 8883 para 1883).
4. Confira, no monitor serial e no painel:
   - [ ] A estação aparece **Online** e o log mostra o sensor detectado (`sensor de clima: bme280` ou `htu21d`).
   - [ ] Chega uma leitura por minuto, com temperatura e umidade coerentes (e pressão na versão completa).
   - [ ] Girar o anemômetro com a mão aumenta o vento; virar a báscula soma chuva. No log serial, 10 voltas dentro de um minuto dão 30 pulsos (3 ímãs), e com o rotor parado, em qualquer posição, 0.
   - [ ] **Dispositivos** mostra bateria, sinal e memória livre (anote o valor de "Memória livre": é a folga de RAM).
   - [ ] O comando **Piscar o LED** pisca o LED da placa por 30 s; **Reiniciar** reinicia uma vez só.
   - [ ] Mudar o intervalo na **Configuração remota** gera "Configuração aplicada" nos logs.
   - [ ] Desligar o Wi-Fi do roteador por alguns minutos: ao voltar, as leituras do período chegam do buffer.
   - [ ] Com o perfil **Sempre Economia**, a estação aparece **Dormindo** e envia em lote a cada 10 minutos.
5. **Produção:** use os dados que o painel mostra ao cadastrar a estação (porta **1883**, TLS **desligado**; veja o [guia de deploy](deploy.md)). Na VPS, o usuário MQTT fica em branco. No compose de casa, ele é o usuário do broker. O firmware também sabe usar TLS na 8883. Se o broker passar a oferecer TLS, confira se a memória livre segue acima de ~8 KB com a conexão segura.
6. **Memória do portal:** o campo "Usuário MQTT" aumentou um pouco a página do portal. Abra o portal com muitas redes por perto e confira no log serial se a memória livre ao abrir segue parecida com a anterior (~19 KB livres, maior bloco acima de ~13 KB) e se todos os campos aparecem.

## Problemas comuns

O log serial (`pio device monitor`, 115200 baud) mostra para onde a estação tenta se conectar e por que falhou:

```
[wx] servidor MQTT 10.25.50.106:1883 sem TLS, estação bancada
[wx] MQTT falhou com 10.25.50.106:8883 (erro -3, código 0); IP 10.25.50.110, gateway 10.25.50.1, sinal -72 dBm
```

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| `erro -3` (sem conexão com o servidor) | Porta errada (1883 sem TLS, 8883 com TLS), endereço do servidor errado ou outro aparelho com o mesmo IP da estação | Confira servidor e porta no portal. Se continuar, veja no roteador se outro aparelho usa o IP da estação e reserve um IP para ela |
| `código 4` ou `código 5` | Código da estação ou senha MQTT errados | Confira o código no painel. Se a senha se perdeu, use **Gerar nova senha** em **Cadastro de estações → (estação) → Credenciais** e informe a nova no portal |
| A rede do local não aparece na lista | O D1 mini só enxerga redes de 2,4 GHz | Use a rede de 2,4 GHz do roteador; muitos roteadores usam o mesmo nome nas duas faixas |
| A página do portal não abre sozinha | DNS privado fixo no celular ou dados móveis ligados | Veja o passo 3 de "Configurar no portal" |
| A placa some alguns minutos depois de abrir o portal | Deep sleep sem o fio D0–RST | Aperte RESET. Na estação definitiva, ligue o fio |
| Faltam os campos do servidor no portal | Memória insuficiente para montar a página (muitas redes por perto) | Toque em **Procurar redes de novo**. O log mostra a memória livre ao abrir o portal ("heap livre", "maior bloco") |
| `Soft WDT reset` em sequência, e o sensor de clima some, depois de ligar um 49E | 49E solto alimentado em 3,3 V: a saída em repouso fica no ponto de virada do pino | Use o KY-024 em 3,3 V, ou alimente o 49E solto pelo 5V (veja "Sensores de pulso") |
| Vento sempre em zero com o 49E solto | Polo errado (só o norte, voltado para a face com o texto, vira o pino), ímã longe, ou diodo de proteção com a faixa no pino | Meça o pino sem ímã e com o ímã parado na frente; vire o ímã ou o sensor; a faixa do diodo vai no 3V3 |
| Com o 49E solto, só um ou dois ímãs contam, ou eles contam a mais | O sinal mal passa do ponto de virada do pino (~1,65 V) | Use o divisor de 1 kΩ e 10 kΩ, ajustado à alimentação (veja "Sensores de pulso"), ou o KY-024 |

