# NeuroDrive

Um playground local de neuroevolução: carros com cérebros aleatórios aprendem a completar uma pista. TypeScript, Vite, HTML Canvas e um Web Worker. Toda a simulação, o treino e os dados ficam no navegador.

## Rodar

Verificado com Node.js 22.22.2.

```sh
npm ci
npm run dev
```

Abra a URL local mostrada pelo Vite. Para testar a versão de produção:

```sh
npm run build
npm run preview
```

Use um servidor HTTP local; abrir `index.html` diretamente não carrega os módulos e o worker.

## Experimentar

- **Evolution lab:** começa com 100 controladores aleatórios e, por padrão, uma bateria de quatro cenários diferentes por geração. Pause, reinicie ou acelere para 4×, 8× ou 32×. A aceleração executa mais ticks de 1/60 s.
- **Take the wheel:** WASD ou setas; W/↑ acelera, S/↓ freia e permite ré, A/D ou ←/→ esterçam. Espaço pausa; R reinicia a corrida. Clique na pista para focar o teclado. O treino fica pausado durante a direção manual.
- **A very small brain:** adicione/remova camadas ocultas e edite o número de neurônios. Limites: **1–4 camadas ocultas, 1–24 neurônios por camada**. Enter ou uma breve pausa aplica a edição. Alterar a arquitetura reinicia a população usando a seed atual. Entradas (8) e saídas (2) permanecem fixas; o padrão é **8 → 12 → 2**, com 134 pesos e biases.
- **Evolution settings:** **Laps per attempt** define **1–10 voltas**, com **3 por padrão**. População e mutação também entram na próxima geração. Ao trocar a meta de voltas, os cérebros continuam evoluindo; pontuações e histórico recomeçam para a nova meta. Aplicar uma seed reinicia o treino de forma reproduzível.
- **Champion:** salve o melhor cérebro no armazenamento do navegador, carregue-o, exporte/importe JSON ou dispute contra seu fantasma roxo. O líder atual é verde-limão. Cada campeão preserva sua arquitetura e meta de voltas originais. A corrida manual contra um campeão usa essa mesma meta; sem campeão, usa a meta ativa do treino. Importações validam versão, arquitetura, física, quantidade e limites dos pesos e metadados. Arquivos antigos de versão 1 são compatíveis; arquivos de versões 1 e 2 são migrados para corridas de uma volta. Novas exportações usam versão 6 e guardam arquitetura, meta, pesos, tempos, condições exatas de cada cenário e avaliação agregada; podem incluir o teste reservado concluído para os mesmos pesos. O limite é 250 KB. Arquivos das versões 4 e 5 mantêm seus obstáculos e comportamento originais. Arquivos de versões 1–3 continuam compatíveis com suas pistas originais sem obstáculos. **Replay original** restaura o cenário original escolhido no seletor e reproduz os pesos congelados. **Test current environment** mantém a pista/layout aberto e testa os mesmos pesos sem treino adicional. Importar um cérebro preserva o ambiente aberto; o replay original é uma ação explícita. Campeões antigos continuam utilizáveis para teste e replay, mas não ganham avaliações agregadas inventadas.
- **Edit obstacles:** adiciona, arrasta, gira e remove obstáculos de cinco formatos: barreira listrada, círculo, triângulo, bloco quadrado e barreira longa em um layout editável com limite de **24 obstáculos**. Começa com três barreiras por pista. Escolha **New shape**, clique em **+ Add obstacle** e depois no asfalto para adicionar; arraste para mover mantendo a orientação; selecione um obstáculo e use **↶ / ↷** para girar em passos de 15°, o slider **Angle** ou o campo numérico para definir 0–359°. Na pista, R gira 15° e Shift+R gira −15°; **Remove selected** ou Delete remove a seleção. **Clear all** limpa o rascunho e **Cancel** ou Esc descarta a edição. **Apply & resume** aplica o layout ao ambiente de transferência. No treino diverso, a bateria, pontuações e população permanecem inalteradas; no modo fixo, as tentativas e pontuações recomeçam com os mesmos cérebros. Edições das pistas base são salvas no navegador. Um replay original com geometria/largada particular é um ambiente temporário da sessão. O treino pausa durante a edição; se já estava pausado, continua pausado após aplicar. A largada fica protegida e as barreiras precisam caber no asfalto. Os sensores e a colisão orientada detectam as barreiras.
- **Every connection has a weight:** o painel abaixo mostra matrizes dos pesos e vieses de cada camada. Escolha o melhor resultado do treino, um dos três primeiros da geração ou o campeão salvo. Azul significa positivo; laranja, negativo; a intensidade representa o módulo relativo ao maior parâmetro daquela rede. O sinal não significa bom/ruim. Linhas recebem sinais das colunas. Clique no nome de um neurônio para inspecionar a soma e a saída `tanh`; nos líderes atuais, são usados os inputs da última decisão real. Resultados armazenados mostram apenas os pesos, sem inventar ativações. **Freeze view** congela o cérebro e os inputs para leitura, sem pausar a simulação; uma nova inicialização libera a inspeção congelada. No modo diverso, editar o ambiente aberto não muda a comparação da bateria de treino.
- **More drivers making it home:** acompanha a qualidade de toda a população, com taxa de conclusão, tempo total mediano entre quem concluiu, progresso médio e colisões. Por padrão, usa a última geração encerrada. **Current generation** mostra resultados provisórios, com o número de carros ainda ativos. O funil detalha 5% da primeira volta e cada volta concluída. O gráfico e a tabela mantêm até 240 gerações no histórico e exibem as últimas 10 na tabela.
- **Test other track:** abre a outra pista e executa o cérebro salvo congelado. No treino diverso, trocar o ambiente de teste não muda a bateria. O treino pausa durante os testes congelados ou a direção manual.

## Como funciona

Sete raycasts em um campo frontal de 180° e a velocidade normalizada alimentam a mesma rede feedforward com `tanh` e duas saídas de direção e aceleração/frenagem. A arquitetura e as oito entradas existentes foram mantidas.

No modo **Diverse scenarios**, cada genoma enfrenta a bateria completa de **4–6 cenários**, sequencialmente. Todos recebem as mesmas condições em todas as gerações da execução. Posição, orientação, velocidade, relógios, sensores e checkpoints recomeçam entre tentativas; os pesos permanecem iguais. A seleção só acontece quando todos terminam toda a bateria.

A classificação compara, nesta ordem: fração de cenários concluídos, progresso médio normalizado, progresso no pior cenário e tempo médio por distância entre as conclusões. Progresso parcial continua útil antes das primeiras conclusões. Pais por torneio, elites e campeão usam essa classificação. **Não existe bônus de uma volta isolada no modo diverso.** No modo **Fixed current environment**, o algoritmo original e o bônus da volta mais rápida continuam disponíveis para comparação.

As baterias ficam fixas para que um recorde não seja comparado a uma bateria diferente. Uma chave canônica inclui todas as condições físicas e a meta de voltas; o comparador rejeita chaves diferentes. Mudar protocolo, quantidade ou amplitude da diversidade inicia uma nova população e comparação. Mudar a meta de voltas aguarda o fim da bateria, preserva os descendentes e limpa os recordes para a nova meta. O gerador dos cenários usa seed separada do gerador da evolução.

O conjunto de treino inclui as duas pistas, ambos os sentidos, obstáculos com posições/orientações variadas e perturbações pequenas da largada. Os primeiros dois cenários moderados são sem obstáculos, para manter sinal inicial. **Wider** acrescenta obstáculos, variações de geometria e perturbações maiores. Cada candidato de layout passa por verificações de posicionamento e por uma busca de corredor fechado com o carro orientado e varreduras de colisão. Isso considera bloqueios conjuntos. É um teste conservador de folga geométrica, não uma prova de controlabilidade dinâmica; layouts desenhados livremente para testar transferência podem bloquear a pista.

Os **seis cenários reservados** usam outro fluxo de aleatoriedade, novos layouts, largadas e pequenas alterações na geometria. O campeão é avaliado com cópia congelada dos pesos, sem tocar em pais, mutações ou RNG da evolução. O worker executa esse teste separadamente. A interface identifica a geração, a origem (campeão do treino ou salvo) e a meta de voltas do modelo avaliado. Se um campeão mais novo surgir durante o teste, o resultado anterior continua identificado e o novo aguarda sua vez. Um teste manual do salvo permanece identificado como tal até reiniciar o protocolo.

O painel **Drive beyond one layout** mostra tentativa atual, quantos cenários faltam, avaliação agregada e resultados reservados por cenário. O quadro de gerações usa **episódios carro × cenário** como denominador no modo diverso e não mistura tempos brutos de pistas diferentes. Ele também informa quantos carros concluíram toda a bateria. Tempos normalizados são expressos em segundos por 1.000 unidades da pista, apenas para conclusões.

A física arcade não inclui perda de aderência nem derrapagem. Usa passo fixo de 60 Hz, arrasto, frenagem, velocidade limitada e esterçamento proporcional ao movimento. A colisão usa um retângulo orientado e subdivisões de até 3 unidades/0,04 radianos por passo. Carros colidem com bordas e barreiras, e não colidem entre si. O treino e o modo manual chamam a mesma função `stepCar`.

Dezesseis checkpoints direcionais devem ser cruzados em ordem. Só o intervalo atual pode render progresso, com um limite superior; o maior progresso válido é preservado. Ré, oscilação e rotação não acumulam pontos repetidos. Cada volta precisa repetir os 16 checkpoints na ordem. O carro cruza a chegada mantendo posição, velocidade e direção. O progresso acumula em distância absoluta até completar todas as voltas da meta. Colisão, 4,5 s sem avanço ou um limite total de 34 s simulados por volta da meta encerram a tentativa. Completar a meta encerra com sucesso; tempos totais menores desempatam as corridas completas. A interface mostra a volta atual, melhor volta individual e melhor tempo total separadamente. O melhor cérebro permanece separado da geração atual.

## Qual métrica mostra melhora?

No modo fixo, a principal é **carros que concluíram todas as voltas ÷ população avaliada**. No modo diverso, acompanhe a fração de cenários concluídos pelo campeão, a quantidade de carros que conclui toda a bateria e o sucesso nos cenários reservados. O quadro de população mostra a taxa de conclusão dos episódios carro × cenário. Uma taxa maior mostra que o comportamento útil aparece em mais redes. Depois compare o **tempo total mediano de quem concluiu**, junto da taxa de conclusão: uma mediana menor com quase ninguém terminando pode ser enganosa. Enquanto ninguém conclui, acompanhe o progresso médio de todos os carros e a queda nas colisões. Um único campeão é uma evidência mais limitada que a população inteira.

As taxas sempre usam a população realmente avaliada naquela geração, mesmo se o controle de população mudar na geração seguinte. Progresso é a distância válida dividida pela distância total da meta. A dispersão do progresso é o desvio padrão populacional, mostrado em pontos percentuais. Diversidade dos pesos é a raiz da média das variâncias populacionais de cada parâmetro, incluindo vieses. Diversidade menor indica pesos mais parecidos, sem garantir comportamento melhor. A tendência compara a média das taxas de conclusão das últimas cinco gerações encerradas com as cinco anteriores, após haver dez gerações.

No modo fixo, compare a mesma pista, layout e meta. No modo diverso, compare a mesma bateria e meta; mudar apenas o ambiente aberto para transferência preserva esse histórico. Alterações na arquitetura/seed ou protocolo reiniciam a população. Esses números mostram o aprendizado nesse cenário de treino e não substituem testar o campeão em outro cenário.

## Comparação reproduzível: cenário fixo × diversidade

```sh
node --import tsx scripts/compare-diversity.ts 24 neurodrive,42,2026 40
```

Mesmas seeds iniciais, rede 8 → 12 → 2, população 40, mutação 14% / força 0,30, **uma volta por episódio**. Cada método recebe **3.840 episódios de treino por seed**: cenário fixo por 96 gerações; quatro cenários diversos por 24 gerações. O fixo treina apenas no Oval original livre. O diverso treina a bateria moderada. Após o treino, ambos são avaliados nos mesmos quatro cenários de treino diversos e nos mesmos seis cenários reservados daquela seed. Nenhum desses testes escolhe o campeão do método fixo; o diverso também nunca usa o reservado para seleção. São três comparações pareadas, não 18 circuitos base independentes.

| Seed | Treino próprio fixo / diverso | Bateria comum: fixo / diverso | Reservados: fixo / diverso | Progresso médio reservado: fixo / diverso | Tempo de treino local: fixo / diverso |
| --- | --- | --- | --- | --- | --- |
| neurodrive | 1/1 · 3/4 | 0/4 · 3/4 | 0/6 · 5/6 | 7,0% · 93,2% | 8,75 s · 12,55 s |
| 42 | 1/1 · 4/4 | 1/4 · 4/4 | 0/6 · 4/6 | 10,5% · 88,5% | 9,12 s · 13,16 s |
| 2026 | 1/1 · 4/4 | 1/4 · 4/4 | 0/6 · 5/6 | 8,4% · 92,4% | 8,93 s · 16,14 s |

O sucesso reservado total passou de **0/18 para 14/18 (77,8%)**; o progresso médio passou de **8,6% para 91,4%**. O pior cenário de cada campeão diverso chegou a **54,6%–58,9%**, ainda com falhas. O método diverso usou aproximadamente **56% mais tempo local** e **61% mais passos físicos de carros** com o mesmo orçamento de episódios, principalmente porque os carros sobrevivem mais tempo. Medidas de tempo dependem da máquina/carga; não são um benchmark isolado. No aplicativo, os testes reservados automáticos ainda têm seu próprio custo, não incluído nesses tempos de treino headless.

A execução foi repetida após a correção da chave canônica de serialização: os resultados por cenário foram idênticos. Os seis campeões reais exportados passaram pelo validador. Resultados completos, condições dos cenários, tempos, número de passos e histórico estão em `results/compare-diversity.json`; os campeões são `results/transfer-{fixed,diverse}-{seed}.json`.

A evidência cobre apenas três seeds, seis cenários reservados por seed e variações de duas famílias de pistas, com folga geométrica e diversidade moderada. No navegador, o campeão `2026` que concluiu 5/6 reservados também foi testado no layout livre de oito obstáculos existente: colidiu aos 12,7% da volta. Seus 134 pesos/vieses exportados permaneceram idênticos após esse teste. Isso evidencia uma falha fora da densidade de obstáculos usada na bateria. Não prova funcionamento em qualquer circuito, em pistas estreitas, grandes perturbações ou layouts que bloqueiem a passagem. O experimento usa uma volta; as metas de 1–10 voltas continuam disponíveis no aplicativo, mas não devem receber os números deste experimento como se tivessem sido medidas.

## Verificações e experimentos anteriores em cenário fixo

```sh
npm test
npm run build
npm run experiment -- 40 neurodrive,42,2026 oval 12 1
npm run experiment -- 60 2026 technical 12 1
npm run experiment -- 40 2026 oval 12,8 1
npm run experiment -- 25 neurodrive,42,2026 oval 12 3
node --import tsx scripts/generalization.ts
node --import tsx scripts/replay-multilap.ts
npm run experiment -- 40 neurodrive,42,2026 oval 12 3 barriers
node --import tsx scripts/replay-multilap.ts barriers
```

Os argumentos de `experiment` são: gerações, seeds separadas por vírgula, pista, tamanhos das camadas ocultas meta de voltas e layout (`clear` ou `barriers`). A meta padrão é 3; os novos resultados usam o sufixo `-fastlap`, registram a política de seleção e distinguem metas e layouts (`-barriers`) para preservar os experimentos anteriores de uma volta. Os arquivos JSON em `results/` registram seeds, configurações, arquiteturas, histórico por geração, resultados e campeões exportáveis. Esses comandos legados avaliam um ambiente fixo. O treino inicia com pesos aleatórios; os campeões desses experimentos só entram no app por importação explícita.

Configuração dos experimentos: população 100, mutação 14%, intensidade 0,30. A tabela abaixo registra os experimentos originais, **com meta de uma volta**, em tempo simulado:

| Pista / rede | Seed | Gerações | Voltas completas na geração 1 → final | Progresso médio na geração 1 → final | Melhor volta |
| --- | --- | ---: | ---: | ---: | ---: |
| Oval / 8–12–2 | neurodrive | 40 | 2 → 55 | 7,2% → 59,3% | 7,98 s |
| Oval / 8–12–2 | 42 | 40 | 1 → 60 | 5,9% → 64,1% | 7,98 s |
| Oval / 8–12–2 | 2026 | 40 | 0 → 49 | 3,4% → 53,3% | 8,00 s |
| Switchback / 8–12–2 | 2026 | 60 | 0 → 64 | 3,3% → 68,2% | 10,10 s |
| Oval / 8–12–8–2 | 2026 | 40 | 2 → 66 | 6,5% → 69,4% | 7,97 s |

Nos experimentos originais de uma volta, a seed `2026` completa sua primeira volta no Oval na geração 3 e em Switchback na geração 12. A pista Oval é ampla: algumas populações aleatórias já produzem voltas na primeira geração. A melhoria também aparece no tempo e na proporção de carros que concluem.

Os três campeões do Oval reproduziram exatamente os tempos exportados ao serem carregados no mesmo simulador. Transferidos sem treino para Switchback, atingiram apenas **4,1%–8,1%**, todos encerrando por colisão. Aprender uma pista não garantiu generalização.

Com a nova meta de **3 voltas**, após 25 gerações no Oval, as seeds `neurodrive`, `42` e `2026` concluíram corridas em **21,95 s**, **21,90 s** e **22,00 s**, respectivamente. Na geração 25, **60/100**, **58/100** e **56/100** carros completaram as três voltas. Os resultados completos estão em `results/experiments-laps3.json`; os campeões de versão 3 guardam a meta e podem ser reproduzidos com `scripts/replay-multilap.ts`. Os três reproduziram exatamente o tempo exportado e também completaram 10 voltas contínuas, entre 70,63 s e 70,92 s, sem reposicionar o carro entre voltas.

Com as **três barreiras padrão** e bônus da volta rápida, após 40 gerações, as seeds `neurodrive`, `42` e `2026` completaram três voltas em **22,13 s**, **22,08 s** e **22,12 s**. Na geração final, **48/100**, **56/100** e **37/100** carros completaram toda a meta. O histórico, layout exato e campeões ficam em `results/experiments-laps3-fastlap-barriers.json` e arquivos associados.

**43 testes automatizados** cobrem raios, colisões orientadas, movimento, checkpoints e direção, proteção contra pontuação repetida, saídas da rede, mutação, elites, determinismo, arquiteturas configuráveis, limites, continuidade entre voltas, proteção contra repetir a linha de chegada, ranking de várias voltas, tempo limite proporcional, mudanças na meta por geração, serialização/migração de campeões, bônus da melhor volta, sensores/colisões com obstáculos, posições inválidas, reconstrução da geometria após edição e preservação de cérebros ao aplicar layouts, cinco formatos girados com sensores/colisões, serialização de formatos, migração da versão 4, ordem exata dos pesos/vieses, cálculo das taxas/medianas/diversidade, denominadores antes de alterações na população, igualdade de cenários entre genomas, reinício físico, espera da bateria, seleção agregada, rejeição de comparações entre baterias, isolamento dos testes reservados/RNG, pesos congelados, preservação do layout de transferência e serialização agregada. O build passa com verificação TypeScript. No navegador foram verificados treino acelerado, pausa/retomada, mudanças pendentes, direção manual, teclado, troca de pistas, sensores, visualização do líder, armazenamento, exportação/importação, rejeição de JSON inválido, controles de camadas, meta de voltas aplicada na próxima geração e corridas contínuas com várias voltas e edição por clique/arraste, remoção, clear-all, cancelamento e retorno de posições inválidas, criação dos cinco formatos, rotação, fontes dos pesos, cálculo do neurônio e congelamento da inspeção. Também foram conferidos importação de um campeão agregado real, preservação dos oito obstáculos ao testar no ambiente aberto, replay explícito dos quatro obstáculos de um campeão antigo e avaliação reservada do campeão salvo. O layout também foi conferido a 390 px, sem rolagem horizontal da página.

## Estrutura e limites

- `src/core/`: geometria, pistas, física, rede, evolução e serialização, sem dependências de DOM.
- `src/training.worker.ts`: agenda ticks fixos e envia snapshots para a interface.
- `src/ui/render.ts`: desenho da pista, carros e sensores; `src/main.ts`: interação, persistência e modo manual.
- `scripts/`, `tests/`, `results/`: experimentos reproduzíveis e evidências.

A velocidade de treino é uma meta: pode ficar abaixo de 32× com populações e redes grandes, sem alterar a física. Redes maiores não garantem aprendizado melhor. O histórico visual mantém as últimas 240 gerações; a sessão de treino não é retomada após recarregar a página. Campeões são armazenados por pista e por origem do navegador (host/porta); exporte JSON para transportá-los. Pequenas diferenças numéricas entre motores JavaScript podem afetar gerações muito longas. Mais voltas selecionam controladores consistentes ao longo do circuito; isso não garante a trajetória matematicamente ótima. A física é arcade, com bordas e obstáculos de cinco formatos, fixos durante cada tentativa. O editor permite montar um bloqueio sem passagem; layouts personalizados não têm garantia automática de serem solucionáveis. A direção manual exige teclado.
