OURO VERDE ERP v14 - CAFÉ E CACAU

ACESSOS DE TESTE
- guilhermeadmin / 8113 (Administrador)
- camila / 1234 (Operador)
- usuario3 / 1234 (Operador)

ATUALIZAÇÕES
- Mantido o visual e a estrutura da versão v13.
- Regras de café: saca de 60,2 kg, café em coco com base 41 kg e renda, FUNRURAL por data: 1,50% até 02/07/2026 e 1,63% a partir de 03/07/2026, truncamento em duas casas e saldo de depósito.
- Regras de cacau: unidade de 50,2 kg, desconto fixo de 0,2 kg/unidade, umidade acima de 9%, pó, cibirra, 10% sobre mofado e 25% sobre brocado, FUNRURAL por data: 1,50% até 02/07/2026 e 1,63% a partir de 03/07/2026.
- Cadastro de produtores ampliado com tipo, classificação, UF, CAF, CAR e IDARON.
- Validação de CPF/CNPJ e bloqueio de duplicidade.
- Registro do usuário responsável por cada lançamento.

COMO ABRIR
Execute ABRIR SISTEMA.bat ou rode: node server.js
Acesse http://127.0.0.1:3213

ATUALIZACAO V15
- Pesquisa de produtores separada por Nome e por CPF/CNPJ.
- No lançamento, o produtor também pode ser localizado por Nome ou CPF/CNPJ.
- Cacau abre por padrão no modo Lançamento diário, sem campos de peneira/classificação.
- O modo Recebimento especial com classificação mantém os campos de peso após peneira, sobra, pó, cibirra, mofado e brocado para casos específicos.


ATUALIZAÇÃO V16:
- Lançamento de cacau simplificado.
- Cacau mofado: informa-se o peso identificado e desconta-se 5% desse peso.
- Cacau brocado: informa-se o peso identificado e desconta-se 20% desse peso.
- Removidos do lançamento diário: peso após peneira, sobra, pó e cibirra.


VERSAO 17 - BASE DEMONSTRATIVA COM DADOS REAIS DE CACAU
- 1068 lancamentos importados da planilha TABELA CACAU 04.xlsx.
- Operacao Venda do dia foi convertida para Compra do Produtor.
- Calculos foram refeitos pelas regras atuais do ERP (FUNRURAL por data: 1,50% até 02/07/2026 e 1,63% a partir de 03/07/2026).
- Campos mofado e brocado foram mantidos zerados nos registros antigos.


VERSAO 18 - CONTROLE DE DEPOSITOS
- Compra do Produtor: calcula descontos e pagamento imediato.
- Deposito: calcula peso liquido, aumenta saldo e nao gera pagamento.
- Compra do Produto Depositado: mostra saldo, baixa a quantidade comprada e gera pagamento sem reaplicar descontos.
- Retirada do Deposito: mostra saldo, baixa a quantidade retirada e nao gera pagamento.
- Bloqueio automatico para movimentacao acima do saldo do produtor no ciclo/lote.


VERSÃO 19
- Pesquisa instantânea pelo número do ticket.
- Filtro de produto mantido na tela de tickets.
- Dashboard com visão geral de todos os ciclos/lotes.
- Dashboard com seleção individual de ciclo/lote.
- Indicadores, gráfico e registros recentes respeitam o ciclo/lote selecionado.

VERSAO 20 - ENTRADAS DIARIAS
- Painel visual consolidado das entradas diarias de Cafe, Cacau e Castanhas.
- Seletor de data, navegacao por dia anterior/proximo e botao Hoje.
- Exibe peso diario, compras, depositos, tickets e produtores por segmento.
- Castanhas aparece preparado mesmo antes da implantacao completa do modulo.


VERSÃO 21 — REGRA HISTÓRICA DO FUNRURAL
- Lançamentos anteriores a 03/07/2026: 1,50%.
- Lançamentos em 03/07/2026 ou posteriores: 1,63%.
- A regra vale para cálculos novos, compras de produto depositado, tickets, dashboards e lançamentos históricos já importados.


VERSÃO 22: integração dos lotes 01/26, 02/26, 03/26 e 05/26; FUNRURAL por data; relatório completo por ciclo/lote com 8 indicadores e impressão.


VERSAO 23 - CORRECAO DE DUPLICIDADES
- Removidos 20 lançamentos repetidos do ciclo 05/26 em 13/07/2026.
- Mantidos os registros provenientes da planilha específica TABELA CACAU LOTE 05_26.xlsx.
- Tickets normalizados para a numeração original.
