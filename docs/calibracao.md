# Guia de calibração

A estação envia valores brutos (pulsos, basculadas e as leituras do sensor de clima); a calibração é aplicada no servidor, por estação. Os campos ficam no painel em **Cadastro de estações → (estação) → Calibração**. Mudanças valem para as leituras recebidas a partir de então; o histórico não é recalculado.

## Pluviômetro (mm por basculada)

1. Com a estação ligada e o pluviômetro nivelado, despeje devagar um volume conhecido de água no funil, por exemplo 100 ml com uma seringa, em uns 5 minutos.
2. Veja quantas basculadas foram contadas: a chuva do período no painel dividida pelo valor atual de mm por basculada.
3. Calcule:

   ```
   chuva equivalente (mm) = volume (ml) × 1000 / área de captação (mm²)
   mm por basculada       = chuva equivalente / basculadas contadas
   ```

   Exemplo do modelo de referência: área de ~10.929 mm²; 100 ml equivalem a 9,15 mm. Se contou 14 basculadas, são 0,65 mm por basculada (o padrão é 0,64).
4. Repita duas ou três vezes e use a média.

Se a contagem der o dobro ou a metade do esperado, troque a **Contagem da báscula** em **Configuração remota**: "cada mudança de estado" (padrão dos modelos de referência) ou "só na borda de descida".

## Anemômetro (m/s por Hz)

As conchas giram mais devagar que o vento. A conversão depende do raio, de quantos pulsos o sensor dá por volta e do fator do anemômetro:

```
m/s por Hz = 2π × raio (m) × fator ÷ pulsos por volta
```

A **calculadora do anemômetro**, na mesma tela, faz a conta. Para o modelo de referência (raio de 80 mm, 3 ímãs, fator 2,5), o resultado é 0,42 m/s por Hz, que já é o padrão.

Para refinar o fator, compare com um anemômetro de mão (ou com a janela de um carro a velocidade constante, num dia sem vento): ajuste o fator até a média bater com a referência.

## Temperatura, umidade e pressão (correções)

Compare com uma referência confiável no mesmo lugar e no mesmo horário: um termo-higrômetro calibrado ou a estação do INMET mais próxima, no caso da pressão.

- **Temperatura e umidade:** registre a diferença média de algumas horas, de preferência à sombra e com vento, e informe-a como correção. Exemplo: o sensor marca 0,8 °C a mais, então a correção é −0,8.
- **Pressão** (versão completa): primeiro confira a **altitude** no cadastro. A pressão ao nível do mar depende dela, e cada 8 m de erro desloca cerca de 1 hPa. Só depois ajuste a correção da pressão da estação.

A versão HTU21D não tem pressão: a correção de pressão não é usada.

## Bateria (fundo de escala)

1. Meça a tensão da bateria com um multímetro.
2. Compare com o valor mostrado em **Dispositivos**.
3. Ajuste em **Configuração remota → Fundo de escala do divisor**:

   ```
   novo fundo de escala = fundo atual × tensão do multímetro ÷ tensão mostrada
   ```

   Exemplo: padrão 4200 mV, multímetro 3,95 V, painel 3,86 V; o novo fundo de escala é 4298 mV.

Os perfis de energia automáticos dependem dessa medida: vale calibrar antes de deixar a estação só na bateria.
