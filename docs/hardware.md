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
| 2 sensores de pulso | Reed switch (consumo zero) ou Hall **digital** de baixo consumo (ex.: DRV5032). O Hall 49E não é recomendado |
| Célula 18650 (Li-ion) e suporte | |
| Carregador TP4056 **com proteção** (DW01) | Também protege contra descarga profunda |
| Painel solar 5–6 V, 1–3 W | Opcional |
| Resistor de 100 kΩ | Divisor da bateria no A0 |
| Fio curto | Entre D0 e RST (acordar do deep sleep) |
| Abrigo ventilado (pratos empilhados) | Para o sensor de clima |
| Caixa estanque | Para o D1 mini e a bateria |

## Ligações

| Componente | Pino | GPIO | Observação |
|---|---|---|---|
| Sensor de clima VCC / GND | 3V3 / G | — | BME280 ou HTU21D (só um) |
| Sensor de clima SDA | D2 | 4 | |
| Sensor de clima SCL | D1 | 5 | |
| Pluviômetro | D5 | 14 | O outro fio do sensor vai ao GND (entrada com pull-up) |
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

A senha da rede de configuração fica em `PORTAL_PASSWORD`, no `platformio.ini` (padrão `estacao-config`). Troque antes de gravar estações de produção.

## Configurar no portal

1. No painel, cadastre a estação (**Cadastro de estações → Nova estação**), escolhendo a versão. Anote as credenciais MQTT: a senha aparece uma única vez.
2. Ligue a estação. Sem configuração, ela cria a rede Wi-Fi **Estacao-XXXXXX**.
3. Conecte o celular a essa rede (senha do `PORTAL_PASSWORD`). A página de configuração abre sozinha.
4. Escolha o Wi-Fi do local e preencha: servidor MQTT, porta, conexão segura (TLS), código da estação e senha MQTT.
5. Salve. A estação se conecta e aparece online no painel em alguns segundos.

Para abrir o portal de novo (trocar o Wi-Fi ou a senha): **dois toques no botão RESET em até 3 segundos**. Deixar o campo de senha MQTT vazio mantém a senha salva. Se ninguém configurar em 5 minutos, a estação dorme 15 minutos e tenta de novo, para poupar a bateria.

Ao trocar de servidor (da bancada para a produção, por exemplo), de código ou de senha, a estação esquece a configuração remota antiga e recebe a do novo cadastro assim que se conecta.

## Teste em bancada

Roteiro para validar o firmware com a placa de verdade, publicando no ambiente de desenvolvimento.

1. **Broker na rede local:** o Mosquitto de desenvolvimento só aceita conexões da própria máquina. Durante o teste, coloque `DEV_MQTT_BIND=0.0.0.0` no `.env` e rode `pnpm infra:up`. Depois do teste, remova a linha e rode `pnpm infra:up` de novo.
2. Rode `pnpm dev` e cadastre uma estação de teste no painel, na versão do sensor que estiver ligado.
3. Grave o firmware e configure pelo portal: servidor = IP do computador na rede, porta **1883**, TLS **desligado**.
4. Confira, no monitor serial e no painel:
   - [ ] A estação aparece **Online** e o log mostra o sensor detectado (`sensor de clima: bme280` ou `htu21d`).
   - [ ] Chega uma leitura por minuto, com temperatura e umidade coerentes (e pressão na versão completa).
   - [ ] Girar o anemômetro com a mão aumenta o vento; virar a báscula soma chuva.
   - [ ] **Dispositivos** mostra bateria, sinal e memória livre (anote o valor de "Memória livre": é a folga de RAM).
   - [ ] O comando **Piscar o LED** pisca o LED da placa por 30 s; **Reiniciar** reinicia uma vez só.
   - [ ] Mudar o intervalo na **Configuração remota** gera "Configuração aplicada" nos logs.
   - [ ] Desligar o Wi-Fi do roteador por alguns minutos: ao voltar, as leituras do período chegam do buffer.
   - [ ] Com o perfil **Sempre Economia**, a estação aparece **Dormindo** e envia em lote a cada 10 minutos.
5. **TLS (produção):** com o servidor da Fase 6, configure a porta **8883** com TLS ligado e confira se a memória livre segue acima de ~8 KB com a conexão segura.
