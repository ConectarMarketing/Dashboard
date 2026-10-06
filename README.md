# Dashboard de Mídia Paga + Metas

Dashboard com campanhas de **Google Ads**, **LinkedIn Ads** e **Meta Ads** e acompanhamento das **metas mensais** (KPIs).

É um site estático (HTML + CSS + JavaScript puro, sem dependências): basta ter os dados em um CSV e as metas em um JSON.

## O que ele mostra

- **KPIs do mês vs. meta**: Investimento, Conversões (leads), Receita, CPL e ROAS. Cada um tem
  - % atingido e **projeção de fechamento do mês** (ritmo atual × dias do mês)
  - status: ✓ no ritmo / ! atenção / ✕ abaixo da meta
- **Conversões acumuladas vs. ritmo da meta** (linha tracejada = onde você deveria estar a cada dia)
- **Investimento diário por plataforma**
- **Tabelas** por plataforma e por campanha (CTR, CPC, taxa de conversão, CPL, ROAS) — clique no cabeçalho para ordenar
- Filtro por **mês** e por **plataforma** (com metas por plataforma, se você definir)

## Como rodar

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

> Abrir o `index.html` direto (duplo clique) bloqueia a leitura dos arquivos pelo navegador. Nesse caso use o botão **Carregar CSV**.

Para publicar: GitHub Pages (Settings → Pages → branch), Netlify ou Vercel — qualquer hospedagem estática serve.

## 1. Seus dados: `data/campanhas.csv`

Um registro **por dia × campanha**, no formato:

| coluna | exemplo |
|---|---|
| `data` | `2026-10-01` (AAAA-MM-DD) |
| `plataforma` | `Google Ads`, `LinkedIn Ads` ou `Meta Ads` |
| `campanha` | `Search - Marca` |
| `investimento` | `120.50` |
| `impressoes` | `3400` |
| `cliques` | `210` |
| `conversoes` | `12` |
| `receita` | `5400.00` (valor de conversão; use 0 se não tiver) |

Aceita separador `,` ou `;` e números no padrão brasileiro (`1.234,56`).
O arquivo atual tem **dados fictícios** gerados por `scripts/gerar_dados_exemplo.py` — substitua pelos seus.

### De onde tirar os dados de cada plataforma

| Plataforma | Exportação manual | Automático (API) |
|---|---|---|
| Google Ads | Relatórios → Campanhas → segmentar por **Dia** → Download CSV | [Google Ads API](https://developers.google.com/google-ads/api/docs/start) (GAQL: `segments.date`, `metrics.cost_micros`, `metrics.conversions`, `metrics.conversions_value`) |
| LinkedIn Ads | Campaign Manager → Analisar → Exportar (por dia) | [LinkedIn Marketing API – adAnalytics](https://learn.microsoft.com/linkedin/marketing/integrations/ads-reporting/ads-reporting) (`timeGranularity=DAILY`, `pivot=CAMPAIGN`) |
| Meta Ads | Gerenciador de Anúncios → Relatórios → detalhamento por **Dia** → Exportar | [Marketing API – Insights](https://developers.facebook.com/docs/marketing-api/insights) (`level=campaign`, `time_increment=1`) |

Caminhos para alimentar o CSV, do mais simples ao mais robusto:

1. **Manual**: exporte das 3 plataformas, cole numa planilha com as colunas acima e salve como CSV (bom para começar).
2. **Conector pronto** (Supermetrics, Windsor.ai, Funnel, Dataslayer etc.) jogando tudo numa Google Sheet; publique a aba como CSV e aponte o `fetch` em `app.js` para essa URL.
3. **Script próprio** usando as APIs acima, rodando diariamente (ex.: GitHub Actions agendado) e gravando `data/campanhas.csv`.

> Atenção à definição de "conversão": cada plataforma conta de um jeito (janela de atribuição, lead de formulário nativo vs. pixel). Padronize o que entra na coluna `conversoes`.

## 2. Suas metas: `data/metas.json`

```json
{
  "meses": {
    "2026-10": {
      "geral": { "investimento": 33000, "conversoes": 1000, "receita": 200000, "cpl": 33, "roas": 6 },
      "plataformas": {
        "Google Ads": { "investimento": 16500, "conversoes": 680, "cpl": 24 }
      }
    }
  }
}
```

- `geral`: meta da soma das plataformas. `plataformas`: opcional, usado quando você filtra uma plataforma.
- Pode omitir qualquer KPI — ele aparece como "Sem meta definida".
- Como cada KPI é avaliado:
  - **Investimento** → orçamento: verde se a projeção fica entre 90% e 105%
  - **Conversões, Receita, ROAS** → mínimo: quanto mais, melhor
  - **CPL** → máximo: não pode passar do limite

## 3. Adicionar outros KPIs

Em `app.js`, inclua o KPI na lista `KPIS` (por exemplo `{ id: "cpc", nome: "CPC", formato: "moeda2", tipo: "maximo", acumula: false }`) e a meta correspondente em `metas.json`. Métricas derivadas (CTR, CPC, CPL, ROAS) são calculadas na função `somar()`; se precisar de uma coluna nova (ex.: `mqls`, `vendas`), adicione-a no CSV, em `lerCSV()` e em `somar()`.
