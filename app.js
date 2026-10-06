/* Dashboard de mídia paga — Google Ads, LinkedIn Ads e Meta Ads.
 * Lê data/campanhas.csv (dados diários por campanha) e data/metas.json (metas mensais).
 * Sem dependências: gráficos em SVG puro. */

const PLATAFORMAS = ["Google Ads", "LinkedIn Ads", "Meta Ads"];
const COR = { "Google Ads": "var(--google)", "LinkedIn Ads": "var(--linkedin)", "Meta Ads": "var(--meta)" };

// tipo: "minimo" = quanto maior melhor; "maximo" = não pode passar; "orcamento" = gastar perto de 100%.
// acumula: soma ao longo do mês (permite projeção de fechamento).
const KPIS = [
  { id: "investimento", nome: "Investimento", formato: "moeda", tipo: "orcamento", acumula: true },
  { id: "conversoes", nome: "Conversões (leads)", formato: "inteiro", tipo: "minimo", acumula: true },
  { id: "receita", nome: "Receita atribuída", formato: "moeda", tipo: "minimo", acumula: true },
  { id: "cpl", nome: "Custo por lead (CPL)", formato: "moeda2", tipo: "maximo", acumula: false },
  { id: "roas", nome: "ROAS", formato: "multiplo", tipo: "minimo", acumula: false },
];

const estado = { linhas: [], metas: { meses: {} }, mes: null, plataforma: "Todas" };

/* ---------- Formatação ---------- */
const fmt = {
  moeda: (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }),
  moeda2: (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  inteiro: (v) => Math.round(v).toLocaleString("pt-BR"),
  multiplo: (v) => v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "x",
  pct: (v) => (v * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%",
  compacto: (v) => v.toLocaleString("pt-BR", { notation: "compact", maximumFractionDigits: 1 }),
};
const formatar = (v, f) => (v == null || !isFinite(v) ? "—" : fmt[f](v));
const NOMES_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const nomeMes = (aaaamm) => { const [a, m] = aaaamm.split("-"); return `${NOMES_MES[+m - 1]} de ${a}`; };
const diasNoMes = (aaaamm) => { const [a, m] = aaaamm.split("-").map(Number); return new Date(a, m, 0).getDate(); };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------- Leitura de dados ---------- */
function lerCSV(texto) {
  const linhas = texto.replace(/^﻿/, "").trim().split(/\r?\n/);
  const sep = linhas[0].includes(";") ? ";" : ",";
  const cab = dividirLinha(linhas[0], sep).map((c) => c.trim().toLowerCase());
  const obrigatorias = ["data", "plataforma", "campanha", "investimento", "impressoes", "cliques", "conversoes", "receita"];
  const faltando = obrigatorias.filter((c) => !cab.includes(c));
  if (faltando.length) throw new Error(`CSV sem as colunas: ${faltando.join(", ")}`);
  const num = (v) => {
    if (v == null || v === "") return 0;
    // aceita "1.234,56" (pt-BR) e "1234.56"
    const s = v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v;
    return parseFloat(s) || 0;
  };
  return linhas.slice(1).filter(Boolean).map((l) => {
    const c = dividirLinha(l, sep);
    const r = Object.fromEntries(cab.map((k, i) => [k, (c[i] ?? "").trim()]));
    return {
      data: r.data, mes: r.data.slice(0, 7), plataforma: r.plataforma, campanha: r.campanha,
      investimento: num(r.investimento), impressoes: num(r.impressoes), cliques: num(r.cliques),
      conversoes: num(r.conversoes), receita: num(r.receita),
    };
  });
}
function dividirLinha(linha, sep) {
  const out = []; let atual = ""; let aspas = false;
  for (const ch of linha) {
    if (ch === '"') aspas = !aspas;
    else if (ch === sep && !aspas) { out.push(atual); atual = ""; }
    else atual += ch;
  }
  out.push(atual);
  return out;
}

/* ---------- Agregação ---------- */
function somar(linhas) {
  const t = { investimento: 0, impressoes: 0, cliques: 0, conversoes: 0, receita: 0 };
  for (const r of linhas) for (const k in t) t[k] += r[k];
  t.cpl = t.conversoes ? t.investimento / t.conversoes : null;
  t.roas = t.investimento ? t.receita / t.investimento : null;
  t.ctr = t.impressoes ? t.cliques / t.impressoes : null;
  t.cpc = t.cliques ? t.investimento / t.cliques : null;
  t.taxaConv = t.cliques ? t.conversoes / t.cliques : null;
  return t;
}
function agruparPor(linhas, chave) {
  const m = new Map();
  for (const r of linhas) { const k = chave(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
  return m;
}
function linhasFiltradas() {
  return estado.linhas.filter((r) => r.mes === estado.mes && (estado.plataforma === "Todas" || r.plataforma === estado.plataforma));
}
function metasAtuais() {
  const m = estado.metas.meses?.[estado.mes];
  if (!m) return null;
  return estado.plataforma === "Todas" ? m.geral ?? null : m.plataformas?.[estado.plataforma] ?? null;
}

/* ---------- Status de meta ---------- */
function avaliar(kpi, valor, projecao, meta) {
  if (meta == null || valor == null) return { classe: "neutro", icone: "–", texto: "Sem meta definida" };
  const ref = kpi.acumula ? projecao : valor;
  const r = ref / meta;
  if (kpi.tipo === "minimo") {
    if (r >= 1) return { classe: "bom", icone: "✓", texto: kpi.acumula ? "No ritmo da meta" : "Meta atingida" };
    if (r >= 0.9) return { classe: "atencao", icone: "!", texto: "Atenção: perto da meta" };
    return { classe: "critico", icone: "✕", texto: "Abaixo da meta" };
  }
  if (kpi.tipo === "maximo") {
    if (r <= 1) return { classe: "bom", icone: "✓", texto: "Dentro do limite" };
    if (r <= 1.1) return { classe: "atencao", icone: "!", texto: "Atenção: acima do limite" };
    return { classe: "critico", icone: "✕", texto: "Muito acima do limite" };
  }
  // orçamento
  if (r > 1.05) return { classe: "serio", icone: "!", texto: "Vai estourar o orçamento" };
  if (r < 0.9) return { classe: "atencao", icone: "!", texto: "Subinvestindo" };
  return { classe: "bom", icone: "✓", texto: "Orçamento no ritmo" };
}

/* ---------- Render: KPIs ---------- */
function renderKPIs(total, diasDecorridos, diasMes) {
  const metas = metasAtuais();
  const fechado = diasDecorridos >= diasMes;
  const html = KPIS.map((k) => {
    const valor = total[k.id];
    const meta = metas?.[k.id];
    const projecao = k.acumula ? (valor / diasDecorridos) * diasMes : null;
    const st = avaliar(k, valor, projecao, meta);
    let barra = "", detalhe = "";
    if (meta != null && valor != null) {
      if (k.acumula) {
        const pReal = Math.min(valor / meta, 1) * 100;
        const pProj = Math.min(projecao / meta, 1) * 100;
        barra = `<div class="barra" aria-hidden="true"><span class="projecao" style="width:${pProj}%"></span><span style="width:${pReal}%"></span></div>`;
        detalhe = fechado
          ? `${fmt.pct(valor / meta)} da meta de ${formatar(meta, k.formato)}`
          : `${fmt.pct(valor / meta)} de ${formatar(meta, k.formato)} · projeção ${formatar(projecao, k.formato)}`;
      } else {
        detalhe = `${k.tipo === "maximo" ? "Limite" : "Meta"}: ${formatar(meta, k.formato)}`;
      }
    } else {
      detalhe = "Defina a meta em data/metas.json";
    }
    return `<article class="cartao kpi">
      <div class="rotulo">${k.nome}</div>
      <div class="valor">${formatar(valor, k.formato)}</div>
      ${barra}
      <div class="meta">${detalhe}</div>
      <div class="status ${st.classe}"><i aria-hidden="true">${st.icone}</i>${st.texto}</div>
    </article>`;
  }).join("");
  document.getElementById("kpis").innerHTML = html;
}

/* ---------- Render: gráfico de linhas em SVG ---------- */
const tooltip = document.getElementById("tooltip");

function graficoLinhas(el, { dias, series, formato, tituloDia }) {
  const L = el.clientWidth || 600, A = el.clientHeight || 260;
  const m = { t: 8, r: 12, b: 24, l: 56 };
  const w = L - m.l - m.r, h = A - m.t - m.b;
  const maxY = Math.max(1, ...series.flatMap((s) => s.valores.filter((v) => v != null)));
  const passo = escalaBonita(maxY);
  const topo = Math.ceil(maxY / passo) * passo;
  const x = (i) => m.l + (dias.length === 1 ? w / 2 : (i / (dias.length - 1)) * w);
  const y = (v) => m.t + h - (v / topo) * h;

  let svg = `<svg viewBox="0 0 ${L} ${A}" role="img" aria-label="${esc(el.dataset.titulo || "")}">`;
  for (let v = 0; v <= topo + 1e-9; v += passo) {
    svg += `<line class="${v === 0 ? "linha-base" : "linha-grade"}" x1="${m.l}" x2="${m.l + w}" y1="${y(v)}" y2="${y(v)}"/>`;
    svg += `<text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${fmt.compacto(v)}</text>`;
  }
  const cadaN = Math.ceil(dias.length / Math.max(2, Math.floor(w / 48)));
  dias.forEach((d, i) => {
    const ultimo = dias.length - 1;
    if ((i % cadaN === 0 && ultimo - i >= cadaN * 0.6) || i === ultimo) svg += `<text x="${x(i)}" y="${A - 6}" text-anchor="middle">${+d.slice(8)}</text>`;
  });
  for (const s of series) {
    let d = "", desenhando = false;
    s.valores.forEach((v, i) => {
      if (v == null) { desenhando = false; return; }
      d += `${desenhando ? "L" : "M"}${x(i)},${y(v)} `;
      desenhando = true;
    });
    svg +=`<path class="serie" d="${d}" stroke="${s.cor}" ${s.tracejada ? 'stroke-dasharray="5 4"' : ""}/>`;
  }
  svg += `<line class="mira" id="mira" x1="0" x2="0" y1="${m.t}" y2="${m.t + h}" visibility="hidden"/>`;
  svg += series.map((s, j) => `<circle class="ponto" data-s="${j}" r="4" fill="${s.cor}" visibility="hidden"/>`).join("");
  svg += `<rect x="${m.l}" y="${m.t}" width="${w}" height="${h}" fill="transparent"/></svg>`;
  el.innerHTML = svg;

  const raiz = el.querySelector("svg"), mira = raiz.querySelector("#mira"), pontos = raiz.querySelectorAll(".ponto");
  const mover = (ev) => {
    const r = raiz.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * L;
    const i = Math.max(0, Math.min(dias.length - 1, Math.round(((px - m.l) / w) * (dias.length - 1))));
    mira.setAttribute("x1", x(i)); mira.setAttribute("x2", x(i)); mira.setAttribute("visibility", "visible");
    pontos.forEach((p) => {
      const v = series[+p.dataset.s].valores[i];
      if (v == null) { p.setAttribute("visibility", "hidden"); return; }
      p.setAttribute("cx", x(i)); p.setAttribute("cy", y(v)); p.setAttribute("visibility", "visible");
    });
    tooltip.innerHTML = `<div class="t-titulo">${tituloDia(dias[i])}</div>` + series
      .filter((s) => s.valores[i] != null)
      .map((s) => `<div class="t-linha"><span><b style="background:${s.cor}"></b>${esc(s.nome)}</span><strong>${formatar(s.valores[i], formato)}</strong></div>`)
      .join("");
    tooltip.hidden = false;
    const tx = Math.min(ev.clientX + 14, window.innerWidth - tooltip.offsetWidth - 8);
    tooltip.style.left = `${tx}px`;
    tooltip.style.top = `${ev.clientY + 14}px`;
  };
  raiz.addEventListener("pointermove", mover);
  raiz.addEventListener("pointerleave", () => {
    tooltip.hidden = true; mira.setAttribute("visibility", "hidden");
    pontos.forEach((p) => p.setAttribute("visibility", "hidden"));
  });
}
function escalaBonita(max) {
  const bruto = max / 4, mag = 10 ** Math.floor(Math.log10(bruto)), n = bruto / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}
function legenda(el, itens) {
  el.innerHTML = itens.map((i) => `<span><b class="${i.tracejada ? "tracejada" : ""}" style="background:${i.cor}"></b>${esc(i.nome)}</span>`).join("");
}

function renderGraficos(linhas, diasDecorridos, diasMes) {
  const dias = Array.from({ length: diasMes }, (_, i) => `${estado.mes}-${String(i + 1).padStart(2, "0")}`);
  const porDia = agruparPor(linhas, (r) => r.data);
  const tituloDia = (d) => `${+d.slice(8)} de ${NOMES_MES[+d.slice(5, 7) - 1]}`;

  // Conversões acumuladas vs. ritmo linear da meta
  const metas = metasAtuais();
  let acc = 0;
  const realizado = dias.map((d, i) => {
    if (i >= diasDecorridos) return null;
    acc += somar(porDia.get(d) ?? []).conversoes;
    return acc;
  });
  const seriesRitmo = [{ nome: "Realizado", cor: "var(--texto)", valores: realizado }];
  if (metas?.conversoes) seriesRitmo.push({ nome: "Ritmo da meta", cor: "var(--meta-ritmo)", tracejada: true, valores: dias.map((_, i) => (metas.conversoes * (i + 1)) / diasMes) });
  legenda(document.getElementById("legenda-ritmo"), seriesRitmo);
  graficoLinhas(document.getElementById("grafico-ritmo"), { dias, series: seriesRitmo, formato: "inteiro", tituloDia });

  // Investimento diário por plataforma
  const plats = estado.plataforma === "Todas" ? PLATAFORMAS : [estado.plataforma];
  const seriesInv = plats.map((p) => ({
    nome: p, cor: COR[p] ?? "var(--texto-2)",
    valores: dias.map((d, i) => (i >= diasDecorridos ? null : somar((porDia.get(d) ?? []).filter((r) => r.plataforma === p)).investimento)),
  }));
  legenda(document.getElementById("legenda-invest"), seriesInv);
  graficoLinhas(document.getElementById("grafico-invest"), { dias, series: seriesInv, formato: "moeda", tituloDia });
}

/* ---------- Render: tabelas ---------- */
const COLUNAS = [
  { id: "investimento", nome: "Investimento", f: "moeda" },
  { id: "impressoes", nome: "Impressões", f: "inteiro" },
  { id: "cliques", nome: "Cliques", f: "inteiro" },
  { id: "ctr", nome: "CTR", f: "pct" },
  { id: "cpc", nome: "CPC", f: "moeda2" },
  { id: "conversoes", nome: "Conversões", f: "inteiro" },
  { id: "taxaConv", nome: "Tx. conv.", f: "pct" },
  { id: "cpl", nome: "CPL", f: "moeda2" },
  { id: "receita", nome: "Receita", f: "moeda" },
  { id: "roas", nome: "ROAS", f: "multiplo" },
];
const ordenacao = {};

function tabela(id, primeiras, linhas, total) {
  const el = document.getElementById(id);
  const ord = ordenacao[id] ?? { col: "investimento", dir: -1 };
  linhas.sort((a, b) => {
    const va = a.t[ord.col] ?? a[ord.col], vb = b.t[ord.col] ?? b[ord.col];
    return (typeof va === "string" ? va.localeCompare(vb) : (va ?? -Infinity) - (vb ?? -Infinity)) * ord.dir;
  });
  const cab = [...primeiras.map((p) => ({ id: p.id, nome: p.nome, txt: true })), ...COLUNAS];
  el.innerHTML = `<thead><tr>${cab.map((c) => `<th class="${c.txt ? "txt" : ""}" data-col="${c.id}" ${ord.col === c.id ? `aria-sort="${ord.dir > 0 ? "ascending" : "descending"}"` : ""}>${c.nome}</th>`).join("")}</tr></thead>
    <tbody>${linhas.map((l) => `<tr>${primeiras.map((p) => `<td class="txt">${p.render(l)}</td>`).join("")}${COLUNAS.map((c) => `<td>${formatar(l.t[c.id], c.f)}</td>`).join("")}</tr>`).join("")}</tbody>
    <tfoot><tr><td class="txt">Total</td>${primeiras.slice(1).map(() => "<td></td>").join("")}${COLUNAS.map((c) => `<td>${formatar(total[c.id], c.f)}</td>`).join("")}</tr></tfoot>`;
  el.querySelectorAll("th").forEach((th) => th.addEventListener("click", () => {
    const col = th.dataset.col;
    ordenacao[id] = { col, dir: ord.col === col ? -ord.dir : (cab.find((c) => c.id === col).txt ? 1 : -1) };
    render();
  }));
}
const marcador = (p) => `<span class="marcador" style="background:${COR[p] ?? "var(--texto-3)"}"></span>${esc(p)}`;

/* ---------- Render geral ---------- */
function render() {
  const linhas = linhasFiltradas();
  const diasMes = diasNoMes(estado.mes);
  const datas = linhas.map((r) => r.data).sort();
  const diasDecorridos = datas.length ? +datas[datas.length - 1].slice(8) : 0;
  document.getElementById("periodo").textContent = diasDecorridos
    ? `${nomeMes(estado.mes)} · dados até o dia ${diasDecorridos} de ${diasMes}${diasDecorridos < diasMes ? " (mês em andamento)" : ""}`
    : `${nomeMes(estado.mes)} · sem dados`;
  const total = somar(linhas);
  renderKPIs(total, Math.max(diasDecorridos, 1), diasMes);
  renderGraficos(linhas, diasDecorridos, diasMes);

  const porPlat = [...agruparPor(linhas, (r) => r.plataforma)].map(([p, ls]) => ({ plataforma: p, t: somar(ls) }));
  tabela("tabela-plataformas", [{ id: "plataforma", nome: "Plataforma", render: (l) => marcador(l.plataforma) }], porPlat, total);
  const porCamp = [...agruparPor(linhas, (r) => r.plataforma + "|" + r.campanha)].map(([k, ls]) => {
    const [plataforma, campanha] = k.split("|");
    return { plataforma, campanha, t: somar(ls) };
  });
  tabela("tabela-campanhas", [
    { id: "campanha", nome: "Campanha", render: (l) => esc(l.campanha) },
    { id: "plataforma", nome: "Plataforma", render: (l) => marcador(l.plataforma) },
  ], porCamp, total);
}

function montarFiltros() {
  const meses = [...new Set(estado.linhas.map((r) => r.mes))].sort().reverse();
  if (!meses.includes(estado.mes)) estado.mes = meses[0];
  const sel = document.getElementById("filtro-mes");
  sel.innerHTML = meses.map((m) => `<option value="${m}" ${m === estado.mes ? "selected" : ""}>${nomeMes(m)}</option>`).join("");
  sel.onchange = () => { estado.mes = sel.value; render(); };

  const plats = ["Todas", ...PLATAFORMAS, ...new Set(estado.linhas.map((r) => r.plataforma).filter((p) => !PLATAFORMAS.includes(p)))];
  const seg = document.getElementById("filtro-plataforma");
  seg.innerHTML = plats.map((p) => `<button type="button" data-p="${esc(p)}" aria-pressed="${p === estado.plataforma}">${esc(p.replace(" Ads", ""))}</button>`).join("");
  seg.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    estado.plataforma = b.dataset.p;
    seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
    render();
  }));
}

function aviso(msg) {
  const el = document.getElementById("aviso");
  el.hidden = !msg; el.textContent = msg ?? "";
}

async function iniciar() {
  try {
    const [csv, metas] = await Promise.all([
      fetch("data/campanhas.csv").then((r) => { if (!r.ok) throw new Error("data/campanhas.csv não encontrado"); return r.text(); }),
      fetch("data/metas.json").then((r) => (r.ok ? r.json() : { meses: {} })).catch(() => ({ meses: {} })),
    ]);
    estado.linhas = lerCSV(csv);
    estado.metas = metas;
  } catch (e) {
    aviso(`Não foi possível carregar os dados (${e.message}). Abra o dashboard por um servidor (ex.: "python3 -m http.server") ou use o botão "Carregar CSV".`);
    return;
  }
  montarFiltros();
  render();
}

document.getElementById("arquivo-csv").addEventListener("change", async (ev) => {
  const arq = ev.target.files[0];
  if (!arq) return;
  try {
    estado.linhas = lerCSV(await arq.text());
    aviso(null);
    estado.mes = null;
    montarFiltros();
    render();
  } catch (e) {
    aviso(e.message);
  }
});

let redimensionar;
window.addEventListener("resize", () => {
  clearTimeout(redimensionar);
  redimensionar = setTimeout(() => estado.mes && render(), 150);
});

iniciar();
