# Firmware da estação (Wemos D1 mini)

Firmware em C++ (PlatformIO/Arduino) para as duas versões da estação, com BME280 ou HTU21D (detectado no boot). Montagem, ligações e configuração estão em [`docs/hardware.md`](../docs/hardware.md); a calibração, em [`docs/calibracao.md`](../docs/calibracao.md).

## Comandos

```bash
pio run                     # compila para o D1 mini
pio run -t upload           # grava pelo USB
pio device monitor          # log serial (115200)
./scripts/test-native.sh    # testes da lógica no computador (pio test -e native)
./scripts/serial-log.py     # log serial sem terminal interativo; --portal abre o portal
```

Abrir a porta serial reinicia a placa. Logo depois de gravar, espere 3 s antes de abrir o log: o reset da gravação e o da abertura contam como reset duplo e abrem o portal.

O script de testes usa o compilador C++ da máquina quando existe (`g++`) e, se não houver, roda os testes num contêiner Docker com `g++`. No Fedora, para rodar direto: `sudo dnf install gcc-c++`.

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `src/core/` | Lógica sem hardware, testada no computador: rajada de 3 s, buffer de leituras, perfis de energia com histerese, configuração remota, comandos, mensagens JSON do contrato v1, memória RTC com CRC, conversões do HTU21D e da bateria |
| `src/hw/` | Pinos, contadores de pulso (interrupções com debounce), sensor de clima, bateria, LED e memória RTC |
| `src/net/` | Configurações na flash (LittleFS), portal Wi-Fi (WiFiManager), Wi-Fi, NTP e MQTT com TLS (raízes ISRG embarcadas) |
| `src/app/` | A aplicação: intervalos alinhados ao relógio, perfis Normal, Economia e Sobrevivência, sessão MQTT, configuração e comandos |
| `test/` | Testes Unity da pasta `core` |

## Comportamento

- **Medição:** um intervalo por `interval_s` (padrão 60 s), fechando em múltiplos do relógio. Vento em pulsos com a rajada de 3 s, chuva como contador acumulado do `run` (memória RTC), temperatura, umidade e pressão sem calibração. Valores não medidos vão como `null`.
- **Entrega:** buffer de 120 leituras em RAM. Lotes de até 30 leituras com QoS 1, e uma leitura só sai do buffer depois do PUBACK. Buffer cheio descarta a mais antiga e gera `BUFFER_OVERFLOW`.
- **Sessão MQTT:** client id `st-{código}`, sessão persistente, LWT `offline` retido; a cada conexão publica `online`, assina `config` e `cmd` e envia o diagnóstico.
- **Página local:** no perfil Normal, `http://{ip}` (usuário `admin`, senha do painel; antes da primeira, a do portal) troca o servidor e a rede Wi-Fi. A alteração só é mantida se conectar em 2 minutos; senão a estação volta à anterior.
- **Configuração remota:** aplicada quando a `rev` é maior que a guardada na flash. Trocar o servidor, o código ou a senha no portal apaga a guardada, porque um cadastro novo recomeça a numeração.
- **Sem relógio:** leituras sem NTP esperam no buffer e recebem o horário quando ele responder; eventos e status vão com `ts` `null`.
- **Robustez:** reconexão com espera de 5 s a 5 min; sem publicar por 30 min, reinicia o Wi-Fi; por 2 h, reinicia a placa (também na Economia). Um comando reentregue (por exemplo, depois de um `reboot`) não é executado duas vezes.
