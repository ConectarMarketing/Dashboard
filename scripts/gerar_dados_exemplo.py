"""Gera data/campanhas.csv com dados fictícios para testar o dashboard.

Uso: python3 scripts/gerar_dados_exemplo.py
"""
import csv
import random
from datetime import date, timedelta
from pathlib import Path

random.seed(42)

# plataforma, campanha, investimento diário médio, CTR, taxa de conversão, ticket médio
CAMPANHAS = [
    ("Google Ads", "Search - Marca", 120, 0.085, 0.05, 600),
    ("Google Ads", "Search - Genérico", 260, 0.042, 0.025, 600),
    ("Google Ads", "Performance Max", 180, 0.018, 0.02, 600),
    ("LinkedIn Ads", "Lead Gen - Decisores", 220, 0.011, 0.15, 2400),
    ("LinkedIn Ads", "Conteúdo - Awareness", 90, 0.005, 0.03, 2400),
    ("Meta Ads", "Remarketing - Site", 80, 0.014, 0.05, 700),
    ("Meta Ads", "Lead Ads - Lookalike", 150, 0.011, 0.06, 700),
]
CPM = {"Google Ads": 35, "LinkedIn Ads": 160, "Meta Ads": 22}

inicio = date(2026, 8, 1)
fim = date(2026, 10, 5)

saida = Path(__file__).resolve().parent.parent / "data" / "campanhas.csv"
with saida.open("w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["data", "plataforma", "campanha", "investimento", "impressoes",
                "cliques", "conversoes", "receita"])
    d = inicio
    while d <= fim:
        fator_semana = 0.7 if d.weekday() >= 5 else 1.0
        for plat, camp, invest, ctr, cvr, ticket in CAMPANHAS:
            gasto = invest * fator_semana * random.uniform(0.8, 1.2)
            impressoes = int(gasto / CPM[plat] * 1000 * random.uniform(0.9, 1.1))
            cliques = int(impressoes * ctr * random.uniform(0.85, 1.15))
            conversoes = sum(1 for _ in range(cliques) if random.random() < cvr)
            receita = round(conversoes * ticket * random.uniform(0.15, 0.35), 2)
            w.writerow([d.isoformat(), plat, camp, round(gasto, 2), impressoes,
                        cliques, conversoes, receita])
        d += timedelta(days=1)

print(f"Gerado: {saida}")
