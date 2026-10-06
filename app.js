/* Dashboard de controle de mídia por cliente.
 * Lê a planilha de controle (.xlsx, uma aba por cliente) e mostra uma aba por cliente
 * + uma visão geral. Sem dependências. */

const COR = { "Google Ads": "var(--google)", "LinkedIn Ads": "var(--linkedin)", "Meta Ads": "var(--meta)" };
const CHAVE_LOCAL = "controle-midia:ultima-planilha";
const ARQUIVO_PADRAO = "data/exemplo.xlsx";

let dados = null;

/* ---------- Formatação ---------- */
const fmt = {
  moeda: (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  moeda0: (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }),
  inteiro: (v) => v.toLocaleString("pt-BR", { maximumFractionDigits: 0 }),
  pct: (v) => (v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%",
};
const f = (v, tipo) => (v == null || !isFinite(v) ? "—" : fmt[tipo](v));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const dataBR = (iso) => (iso ? iso.split("-").reverse().join("/") : "—");
const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const soma = (xs) => xs.reduce((a, b) => a + (b ?? 0), 0);

/* ---------- Cálculos (independentes das fórmulas da planilha) ---------- */
function calcularCliente(c) {
  const hoje = c.dataAtual ? new Date(c.dataAtual + "T12:00") : new Date();
  const fim = c.ultimoDia ? new Date(c.ultimoDia + "T12:00") : new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 12);
  const diasMes = fim.getDate();
  const diaAtual = Math.min(hoje.getDate(), diasMes);
  const decorrido = diaAtual / diasMes; // fração do mês já passada
  const diasRestantes = Math.max(0, Math.round((fim - hoje) / 86400000));
  const verbaMensal = c.verbaMensal ?? null;

  const plataformas = c.plataformas.map((p) => {
    const temVerba = p.pct != null && verbaMensal != null;
    const verba = temVerba ? verbaMensal * p.pct : null;
    const gasto = soma(p.metricas.map((m) => m.gasto));
    return {
      ...p, verba, gasto, temVerba,
      restante: temVerba ? verba - gasto : null,
      porDia: temVerba && diasRestantes > 0 ? (verba - gasto) / diasRestantes : null,
      ritmo: temVerba ? statusVerba(gasto, verba, decorrido) : null,
      metricas: p.metricas.map((m) => ({ ...m, ...avaliarMetrica(m, decorrido) })),
    };
  });
  const comVerba = plataformas.filter((p) => p.temVerba);
  const gasto = soma(comVerba.map((p) => p.gasto));
  const metricas = plataformas.flatMap((p) => p.metricas).filter((m) => m.status.classe !== "neutro");
  return {
    ...c, plataformas, diasMes, diaAtual, decorrido, diasRestantes, gasto,
    restante: verbaMensal != null ? verbaMensal - gasto : null,
    porDia: verbaMensal != null && diasRestantes > 0 ? (verbaMensal - gasto) / diasRestantes : null,
    ritmo: statusVerba(gasto, verbaMensal, decorrido),
    metasBatidas: metricas.filter((m) => m.atingido >= 1).length,
    metasNoRitmo: metricas.filter((m) => m.status.classe === "bom").length,
    metasTotal: metricas.length,
  };
}

const S = {
  bom: (texto) => ({ classe: "bom", icone: "✓", texto }),
  atencao: (texto) => ({ classe: "atencao", icone: "!", texto }),
  serio: (texto) => ({ classe: "serio", icone: "!", texto }),
  critico: (texto) => ({ classe: "critico", icone: "✕", texto }),
  neutro: (texto) => ({ classe: "neutro", icone: "–", texto }),
};

function statusVerba(gasto, verba, decorrido) {
  if (!verba) return S.neutro("Sem verba");
  const fimDoMes = decorrido >= 1;
  const r = gasto / (verba * decorrido); // gasto vs. o ideal até hoje
  if (r > 1.05) return fimDoMes ? S.serio("Verba estourada") : S.serio("Gastando acima do ritmo");
  if (r < 0.9) return fimDoMes ? S.atencao("Verba não utilizada") : S.atencao("Gastando abaixo do ritmo");
  return fimDoMes ? S.bom("Verba utilizada") : S.bom("Gasto no ritmo");
}

function avaliarMetrica(m, decorrido) {
  const custo = m.gasto && m.resultado ? m.gasto / m.resultado : null;
  if (!m.meta || m.resultado == null) return { atingido: null, projetado: null, custo, status: S.neutro("Sem meta") };
  const atingido = m.resultado / m.meta;
  const projetado = atingido / decorrido;
  let status;
  if (atingido >= 1) status = S.bom("Meta batida");
  else if (decorrido >= 1) status = atingido >= 0.9 ? S.atencao("Quase lá") : S.critico("Meta não batida");
  else status = projetado >= 1 ? S.bom("No ritmo") : projetado >= 0.9 ? S.atencao("Atenção") : S.critico("Abaixo do ritmo");
  return { atingido, projetado: decorrido < 1 ? m.resultado / decorrido : null, custo, status };
}

/* ---------- Componentes ---------- */
const status = (s) => `<span class="status ${s.classe}"><i aria-hidden="true">${s.icone}</i>${s.texto}</span>`;
const marcador = (p) => `<span class="marcador" style="background:${COR[p] ?? "var(--texto-3)"}"></span>`;

// barra de progresso + marca de "onde deveria estar hoje"
function barra(valor, total, ideal, rotulo) {
  if (!total) return "";
  const p = Math.min(valor / total, 1) * 100;
  const i = ideal != null ? Math.min(ideal, 1) * 100 : null;
  const dica = `${rotulo}: ${fmt.pct(valor / total)}${i != null && i < 100 ? ` · ideal hoje ${fmt.pct(ideal)}` : ""}`;
  return `<div class="barra" title="${esc(dica)}" role="img" aria-label="${esc(dica)}">
    <span style="width:${p}%"></span>${i != null && i < 100 ? `<b class="ideal" style="left:${i}%"></b>` : ""}</div>`;
}

function tile(rotulo, valor, extra = "") {
  return `<article class="cartao kpi"><div class="rotulo">${rotulo}</div><div class="valor">${valor}</div>${extra}</article>`;
}

/* ---------- Visão de um cliente ---------- */
function telaCliente(c) {
  const fechado = c.decorrido >= 1;
  const cab = `<div class="titulo-cliente">
      <h2>${esc(c.nome)}</h2>
      <p class="sub">Atualizado em ${dataBR(c.dataAtual)} · dia ${c.diaAtual} de ${c.diasMes}${fechado ? " · mês encerrado" : ` · ${c.diasRestantes} ${c.diasRestantes === 1 ? "dia restante" : "dias restantes"}`}</p>
    </div>`;

  const tiles = `<section class="kpis">
    ${tile("Verba mensal", f(c.verbaMensal, "moeda"))}
    ${tile("Gasto", f(c.gasto, "moeda"), `${barra(c.gasto, c.verbaMensal, fechado ? null : c.decorrido, "Verba gasta")}
       <div class="meta">${c.verbaMensal ? fmt.pct(c.gasto / c.verbaMensal) + " da verba" : ""}</div>${status(c.ritmo)}`)}
    ${tile("Restante", f(c.restante, "moeda"))}
    ${tile("Gastar por dia restante", fechado ? "—" : f(c.porDia, "moeda"), `<div class="meta">${fechado ? "Mês encerrado" : `${c.diasRestantes} dias restantes`}</div>`)}
    ${tile("Metas", c.metasTotal ? `${c.metasBatidas}/${c.metasTotal}` : "—", `<div class="meta">${fechado ? "metas batidas" : `batidas · ${c.metasNoRitmo} no ritmo`}</div>`)}
  </section>`;

  const plataformas = c.plataformas.map((p) => `<section class="cartao plataforma">
      <header class="plat-cab">
        <h3>${marcador(p.nome)}${esc(p.nome)}</h3>
        ${p.temVerba ? `<dl class="plat-resumo">
          <div><dt>Verba (${fmt.pct(p.pct)})</dt><dd>${f(p.verba, "moeda")}</dd></div>
          <div><dt>Gasto</dt><dd>${f(p.gasto, "moeda")}</dd></div>
          <div><dt>Restante</dt><dd>${f(p.restante, "moeda")}</dd></div>
          <div><dt>Por dia restante</dt><dd>${fechado ? "—" : f(p.porDia, "moeda")}</dd></div>
        </dl>` : ""}
      </header>
      ${p.temVerba && p.verba ? `<div class="plat-barra">${barra(p.gasto, p.verba, fechado ? null : c.decorrido, "Verba gasta")}${status(p.ritmo)}</div>` : ""}
      <div class="tabela-wrap"><table class="tabela-metricas">
        <thead><tr>
          <th class="txt">Métrica</th><th>Verba</th><th>Gasto</th><th>Meta</th><th>Resultado</th>
          <th>Custo/resultado</th><th class="txt col-meta">Meta conquistada</th>
        </tr></thead>
        <tbody>${p.metricas.map((m) => `<tr>
          <td class="txt nome">${esc(m.nome)}</td>
          <td data-rotulo="Verba">${f(m.verba, "moeda")}</td>
          <td data-rotulo="Gasto">${f(m.gasto, "moeda")}</td>
          <td data-rotulo="Meta">${f(m.meta || null, "inteiro")}</td>
          <td data-rotulo="Resultado">${f(m.resultado, "inteiro")}</td>
          <td data-rotulo="Custo/resultado">${f(m.custo, "moeda")}</td>
          <td class="txt col-meta inteira">${m.atingido != null ? `<div class="meta-cel">
            ${barra(m.resultado, m.meta, fechado ? null : c.decorrido, "Meta conquistada")}
            <strong>${fmt.pct(m.atingido)}</strong></div>
            ${status(m.status)}${m.projetado != null && m.atingido < 1 ? `<div class="meta">projeção: ${f(m.projetado, "inteiro")}</div>` : ""}` : status(m.status)}</td>
        </tr>`).join("")}</tbody>
      </table></div>
    </section>`).join("");

  const notas = c.anotacoes.length ? `<section class="cartao">
      <h3>Anotações da planilha</h3>
      <ul class="notas">${c.anotacoes.map((linha) => `<li>${linha.map(nota).join(" · ")}</li>`).join("")}</ul>
    </section>` : "";

  return cab + tiles + plataformas + notas;
}

function nota({ rotulo, valor }) {
  const texto = /^https?:\/\//.test(rotulo) ? `<a href="${esc(rotulo)}" target="_blank" rel="noopener">link</a>` : esc(rotulo).replace(/\n/g, ", ");
  if (valor == null) return texto;
  return `${texto} <strong>${valor.data ? dataBR(valor.data) : f(valor, "inteiro")}</strong>`;
}

/* ---------- Visão geral ---------- */
function telaGeral(clientes) {
  const verba = soma(clientes.map((c) => c.verbaMensal));
  const gasto = soma(clientes.map((c) => c.gasto));
  const noRitmo = clientes.filter((c) => c.ritmo.classe === "bom").length;
  const batidas = soma(clientes.map((c) => c.metasBatidas)), total = soma(clientes.map((c) => c.metasTotal));
  const datas = [...new Set(clientes.map((c) => c.dataAtual).filter(Boolean))].sort();

  return `<div class="titulo-cliente">
      <h2>Visão geral</h2>
      <p class="sub">${clientes.length} clientes · dados até ${datas.map(dataBR).join(", ") || "—"}</p>
    </div>
    <section class="kpis">
      ${tile("Verba total", f(verba, "moeda"))}
      ${tile("Gasto total", f(gasto, "moeda"), `<div class="meta">${verba ? fmt.pct(gasto / verba) + " da verba" : ""}</div>`)}
      ${tile("Restante", f(verba - gasto, "moeda"))}
      ${tile("Verba no ritmo", `${noRitmo}/${clientes.length}`, `<div class="meta">clientes</div>`)}
      ${tile("Metas batidas", total ? `${batidas}/${total}` : "—", `<div class="meta">${total ? fmt.pct(batidas / total) : ""}</div>`)}
    </section>
    <section class="cartao">
      <div class="tabela-wrap"><table class="tabela-geral">
        <thead><tr>
          <th class="txt">Cliente</th><th class="txt">Plataformas</th><th>Verba</th><th>Gasto</th>
          <th class="txt col-meta">Uso da verba</th><th>Restante</th><th>Por dia restante</th><th class="txt">Metas</th>
        </tr></thead>
        <tbody>${clientes.map((c) => `<tr>
          <td class="txt nome"><a href="#${slug(c.aba)}">${esc(c.nome)}</a></td>
          <td class="txt inteira">${c.plataformas.filter((p) => p.temVerba && p.pct > 0).map((p) => `<span class="chip">${marcador(p.nome)}${esc(p.nome.replace(" Ads", ""))} ${fmt.pct(p.pct)}</span>`).join(" ")}</td>
          <td data-rotulo="Verba">${f(c.verbaMensal, "moeda")}</td>
          <td data-rotulo="Gasto">${f(c.gasto, "moeda")}</td>
          <td class="txt col-meta inteira"><div class="meta-cel">${barra(c.gasto, c.verbaMensal, c.decorrido < 1 ? c.decorrido : null, "Verba gasta")}<strong>${c.verbaMensal ? fmt.pct(c.gasto / c.verbaMensal) : "—"}</strong></div>${status(c.ritmo)}</td>
          <td data-rotulo="Restante">${f(c.restante, "moeda")}</td>
          <td data-rotulo="Por dia restante">${c.decorrido >= 1 ? "—" : f(c.porDia, "moeda")}</td>
          <td class="txt metas inteira">${c.metasTotal ? `${c.metasBatidas}/${c.metasTotal} batidas${resumoMetas(c)}` : "Sem metas"}</td>
        </tr>`).join("")}</tbody>
      </table></div>
    </section>`;
}

function resumoMetas(c) {
  const ruins = c.plataformas.flatMap((p) => p.metricas).filter((m) => m.status.classe === "critico");
  return ruins.length ? `<div class="meta">abaixo: ${ruins.map((m) => esc(m.nome)).join(", ")}</div>` : "";
}

/* ---------- Abas e navegação ---------- */
function render() {
  const clientes = dados.clientes.map(calcularCliente);
  const abas = [{ id: "geral", nome: "Visão geral" }, ...clientes.map((c) => ({ id: slug(c.aba), nome: c.aba, c }))];
  const atual = abas.find((a) => a.id === location.hash.slice(1)) ?? abas[0];

  document.getElementById("abas").innerHTML = abas.map((a) => `<a role="tab" href="#${a.id}" aria-selected="${a === atual}"
      ${a.c ? `title="${esc(a.c.nome)}"` : ""}>${a.c ? `<i class="ponto-status ${a.c.ritmo.classe}" aria-hidden="true"></i>` : ""}${esc(a.nome)}</a>`).join("");
  document.querySelector('#abas [aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });

  document.getElementById("conteudo").innerHTML = `<p class="aviso" id="aviso" hidden></p>` +
    (atual.c ? telaCliente(atual.c) : telaGeral(clientes));
  document.getElementById("origem").textContent =
    `${dados.arquivo} · carregada em ${new Date(dados.carregadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`;
}

function aviso(msg) {
  const el = document.getElementById("aviso");
  if (!el) return;
  el.hidden = !msg; el.textContent = msg ?? "";
}

async function carregarBuffer(buffer, nome, salvar) {
  dados = await lerPlanilhaControle(buffer, nome);
  if (salvar) {
    try { localStorage.setItem(CHAVE_LOCAL, JSON.stringify(dados)); } catch { /* sem armazenamento: segue sem lembrar */ }
  }
  render();
}

async function iniciar() {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_LOCAL));
    if (salvo?.clientes?.length) { dados = salvo; render(); return; }
  } catch { /* ignora */ }
  try {
    const r = await fetch(ARQUIVO_PADRAO);
    if (!r.ok) throw new Error();
    await carregarBuffer(await r.arrayBuffer(), "exemplo.xlsx (dados fictícios)", false);
  } catch {
    document.getElementById("origem").textContent = "Nenhuma planilha carregada";
    aviso('Clique em "Abrir planilha" e selecione o seu controle de mídia (.xlsx).');
  }
}

document.getElementById("arquivo").addEventListener("change", async (ev) => {
  const arq = ev.target.files[0];
  if (!arq) return;
  try {
    await carregarBuffer(await arq.arrayBuffer(), arq.name, true);
  } catch (e) {
    aviso(`Não consegui ler a planilha: ${e.message}`);
  }
  ev.target.value = "";
});
window.addEventListener("hashchange", () => dados && render());

iniciar();
