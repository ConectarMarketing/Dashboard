# Controle de Mídia · Dashboard por cliente

Dashboard que lê a planilha **Controle de mídia clientes (.xlsx)** e mostra:

- **Visão geral**: todos os clientes numa tabela, com verba, gasto, % usado, restante, quanto gastar por dia e metas batidas.
- **Uma aba por cliente** (uma aba para cada aba da planilha), com:
  - verba mensal, gasto, restante, **quanto gastar por dia restante** e status do ritmo de gasto
  - um bloco por plataforma (**Meta Ads, Google Ads, LinkedIn Ads**) com a verba (% da mensal), o gasto e a barra de uso da verba
  - para cada métrica: verba, gasto, meta, resultado, **custo por resultado**, % da meta, status e projeção de fechamento do mês
  - as anotações soltas da aba (textos, links)

A marca vertical nas barras mostra **onde você deveria estar hoje** (dia atual ÷ dias do mês). O ponto colorido em cada aba mostra o status de gasto do cliente.

Não tem dependências: é HTML + CSS + JavaScript puro, e a planilha é lida no próprio navegador. **Os dados não são enviados para nenhum servidor.**

## Como usar

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

1. Clique em **Abrir planilha (.xlsx)** e escolha o seu controle do mês.
2. O navegador lembra a última planilha aberta. Para atualizar, é só abrir a nova versão.

Se você usa Google Sheets, baixe com *Arquivo → Fazer download → Microsoft Excel (.xlsx)*.
Sem planilha aberta, o dashboard mostra `data/exemplo.xlsx` (clientes fictícios).

Para publicar e acessar de qualquer lugar: GitHub Pages, Netlify ou Vercel (site estático). Como cada pessoa abre a própria planilha, os dados dos clientes não ficam no site.

## Formato da planilha

É o mesmo layout que você já usa. Cada aba é um cliente:

```
A1  Nome do cliente
    Geral
    Dia atual | Último dia do mês | Dias restantes | Valor de mídia mensal | ...
    06/10/2026 | 31/10/2026      | ...            | 3000
    Meta                                   ← nome da plataforma: Meta, Google ou LinkedIn
    % de mídia mensal | Valor de mídia mensal | ...
    0,6               | ...
    Métrica | Valor de mídia | Valor de mídia gasto | Meta | Resultado | Meta conquistada %
    Seguidores | 600 | 140,50 | 400 | 120 | ...
    Mensagens  | ...
    Google
    ...
```

Regras de leitura:
- Os cabeçalhos **"Dia atual"** e **"Métrica"** marcam os blocos. Você pode adicionar quantos clientes, plataformas e métricas quiser.
- Uma plataforma é a linha com o nome dela, seguida de "% de mídia mensal". Um bloco "Métrica" sem o "% de mídia" acima aparece como **Outros indicadores**. Use isso para KPIs que não têm verba (ex.: engajamento do Sprinklr, membros do WhatsApp, acessos totais do site).
- Uma métrica com meta vazia ou 0 aparece como "Sem meta".
- As linhas da legenda de cores são ignoradas. Qualquer outro texto solto vira "Anotações".
- Só os valores digitados são usados. **Os totais são recalculados pelo dashboard** (não usam as fórmulas da planilha), e o valor diário usa os dias reais do mês, em vez de 30,4.

## Como os status são calculados

| Item | Regra |
|---|---|
| Gasto (cliente e plataforma) | compara o gasto com o ideal até hoje (verba × dia/dias do mês): entre 90% e 105% = no ritmo; acima = gastando acima; abaixo = gastando abaixo. No fim do mês: verba utilizada / estourada / não utilizada |
| Métrica | ≥ 100% da meta = batida. Durante o mês: projeção (resultado ÷ % do mês decorrido) ≥ 100% = no ritmo, ≥ 90% = atenção, abaixo disso = abaixo do ritmo |
| Gastar por dia restante | (verba − gasto) ÷ (último dia − dia atual) |

## Arquivos

- `index.html`, `styles.css`, `app.js`: a interface e os cálculos
- `xlsx.js`: o leitor de .xlsx (sem bibliotecas) e a interpretação do layout
- `data/exemplo.xlsx`: a planilha fictícia, gerada por `scripts/gerar_planilha_exemplo.py`
