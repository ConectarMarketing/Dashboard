/* Leitura de .xlsx no navegador, sem dependências (zip + XML),
 * e interpretação do layout da planilha "Controle de mídia clientes". */

/* ---------- ZIP ---------- */
async function lerZip(buffer) {
  const dv = new DataView(buffer);
  let eocd = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Arquivo não é um .xlsx válido");
  const total = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const arquivos = {};
  const dec = new TextDecoder();
  for (let n = 0; n < total; n++) {
    const metodo = dv.getUint16(p + 10, true);
    const tamanho = dv.getUint32(p + 20, true);
    const lenNome = dv.getUint16(p + 28, true), lenExtra = dv.getUint16(p + 30, true), lenCom = dv.getUint16(p + 32, true);
    const offLocal = dv.getUint32(p + 42, true);
    const nome = dec.decode(new Uint8Array(buffer, p + 46, lenNome));
    arquivos[nome] = { metodo, tamanho, offLocal };
    p += 46 + lenNome + lenExtra + lenCom;
  }
  return async (nome) => {
    const a = arquivos[nome];
    if (!a) return null;
    const inicio = a.offLocal + 30 + dv.getUint16(a.offLocal + 26, true) + dv.getUint16(a.offLocal + 28, true);
    const bytes = new Uint8Array(buffer, inicio, a.tamanho);
    if (a.metodo === 0) return dec.decode(bytes);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return await new Response(stream).text();
  };
}

/* ---------- XLSX → grade de células ---------- */
const xml = (t) => new DOMParser().parseFromString(t, "application/xml");
const filhos = (el, tag) => Array.from(el.getElementsByTagName(tag));

function colunaParaIndice(ref) {
  let n = 0;
  for (const ch of ref.match(/^[A-Z]+/)[0]) n = n * 26 + ch.charCodeAt(0) - 64;
  return n;
}

async function lerXlsx(buffer) {
  const ler = await lerZip(buffer);
  const wb = xml(await ler("xl/workbook.xml"));
  const rels = xml(await ler("xl/_rels/workbook.xml.rels"));
  const alvo = {};
  for (const r of filhos(rels, "Relationship")) alvo[r.getAttribute("Id")] = r.getAttribute("Target");

  const textos = [];
  const ss = await ler("xl/sharedStrings.xml");
  if (ss) for (const si of filhos(xml(ss), "si")) textos.push(filhos(si, "t").map((t) => t.textContent).join(""));

  // estilos que são data (para converter o número serial do Excel)
  const estiloData = [];
  const st = await ler("xl/styles.xml");
  if (st) {
    const doc = xml(st);
    const fmtData = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
    for (const f of filhos(doc, "numFmt")) {
      const codigo = f.getAttribute("formatCode").replace(/"[^"]*"|\[[^\]]*\]/g, "");
      if (/[dy]/i.test(codigo)) fmtData.add(+f.getAttribute("numFmtId"));
    }
    const xfs = doc.getElementsByTagName("cellXfs")[0];
    if (xfs) for (const xf of filhos(xfs, "xf")) estiloData.push(fmtData.has(+xf.getAttribute("numFmtId")));
  }

  const abas = [];
  for (const s of filhos(wb, "sheet")) {
    if (s.getAttribute("state") === "hidden") continue;
    const rid = s.getAttribute("r:id") ?? s.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    let caminho = alvo[rid].replace(/^\//, "");
    if (!caminho.startsWith("xl/")) caminho = "xl/" + caminho;
    const doc = xml(await ler(caminho));
    const linhas = [];
    for (const c of filhos(doc, "c")) {
      const ref = c.getAttribute("r");
      const lin = +ref.match(/\d+$/)[0], col = colunaParaIndice(ref);
      const tipo = c.getAttribute("t");
      const v = c.getElementsByTagName("v")[0]?.textContent;
      let valor = null;
      if (tipo === "s") valor = textos[+v];
      else if (tipo === "inlineStr") valor = filhos(c, "t").map((t) => t.textContent).join("");
      else if (tipo === "str") valor = v ?? null;
      else if (tipo === "e") valor = null;
      else if (tipo === "b") valor = v === "1";
      else if (v != null && v !== "") {
        valor = +v;
        if (estiloData[+(c.getAttribute("s") ?? 0)]) valor = serialParaData(valor);
      }
      if (valor === null || valor === "" || /^#(DIV\/0!|N\/A|VALUE!|REF!|NAME\?|NUM!|NULL!)$/.test(valor)) continue;
      (linhas[lin] ??= [])[col] = valor;
    }
    abas.push({ nome: s.getAttribute("name"), linhas });
  }
  return abas;
}

function serialParaData(n) {
  const d = new Date(Math.round((n - 25569) * 86400000));
  return { data: d.toISOString().slice(0, 10) };
}

/* ---------- Layout da planilha de controle → modelo ---------- */
const norm = (v) => (typeof v === "string" ? v.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") : "");
const num = (v) => (typeof v === "number" ? v : null);
const ehLegenda = (v) => /^legenda:?$/.test(norm(v)) || /^(azul|roxo|preto|vermelho|verde|amarelo|laranja|cinza)\s*:/.test(norm(v));

function nomePlataforma(nome) {
  const n = norm(nome);
  if (n.startsWith("google")) return "Google Ads";
  if (n.startsWith("linkedin")) return "LinkedIn Ads";
  if (n === "meta" || n.startsWith("meta ads") || n.startsWith("facebook") || n.startsWith("instagram")) return "Meta Ads";
  return String(nome).trim();
}

function interpretarAba({ nome: aba, linhas }) {
  const L = (r) => linhas[r] ?? [];
  const usadas = new Set();
  const cliente = { aba, nome: typeof L(1)[1] === "string" ? L(1)[1].trim() : aba, plataformas: [], anotacoes: [] };
  usadas.add(1);

  // Bloco "Geral": Dia atual | Último dia do mês | ... | Valor de mídia mensal
  for (let r = 1; r < linhas.length; r++) {
    if (!norm(L(r)[1]).startsWith("dia atual")) continue;
    const cab = L(r), val = L(r + 1);
    cab.forEach((h, c) => {
      const n = norm(h);
      if (n.startsWith("dia atual")) cliente.dataAtual = val[c]?.data ?? null;
      else if (n.startsWith("ultim")) cliente.ultimoDia = val[c]?.data ?? null;
      else if (n === "valor de midia mensal") cliente.verbaMensal = num(val[c]);
    });
    usadas.add(r).add(r + 1);
    if (norm(L(r - 1)[1]) === "geral") usadas.add(r - 1);
    break;
  }

  // Blocos de plataforma: [Nome] / % de mídia mensal ... / valores / Métrica ... / linhas de métrica
  for (let m = 1; m < linhas.length; m++) {
    if (norm(L(m)[1]) !== "metrica") continue;
    const plat = { nome: "Outros indicadores", pct: null, metricas: [] };
    if (norm(L(m - 2)[1]).startsWith("% de midia")) {
      plat.nome = nomePlataforma(L(m - 3)[1] ?? "Plataforma");
      plat.pct = num(L(m - 1)[1]);
      [m - 3, m - 2, m - 1].forEach((r) => usadas.add(r));
    } else if (typeof L(m - 1)[1] === "string" && L(m - 1).filter((v) => v != null).length === 1) {
      plat.nome = nomePlataforma(L(m - 1)[1]);
      usadas.add(m - 1);
    }
    usadas.add(m);
    const col = { verba: 2, gasto: 3, meta: 4, resultado: 5 };
    L(m).forEach((h, c) => {
      const n = norm(h);
      if (n === "valor de midia") col.verba = c;
      else if (n.includes("gasto")) col.gasto = c;
      else if (n === "meta") col.meta = c;
      else if (n === "resultado") col.resultado = c;
    });
    for (let r = m + 1; r < linhas.length; r++) {
      const l = L(r);
      const nomeMetrica = l[1];
      const vazia = [col.verba, col.gasto, col.meta, col.resultado].every((c) => l[c] == null);
      if (typeof nomeMetrica !== "string" || ehLegenda(nomeMetrica) || vazia) break;
      plat.metricas.push({
        nome: nomeMetrica.trim(),
        verba: num(l[col.verba]),
        gasto: num(l[col.gasto]),
        meta: num(l[col.meta]),
        resultado: num(l[col.resultado]),
      });
      usadas.add(r);
    }
    cliente.plataformas.push(plat);
  }

  // Todo o resto (exceto a legenda de cores) vira anotação
  for (let r = 1; r < linhas.length; r++) {
    if (usadas.has(r) || !linhas[r]) continue;
    const partes = [];
    const l = L(r);
    for (let c = 1; c < l.length; c++) {
      const v = l[c];
      if (typeof v !== "string" || (c === 1 && ehLegenda(v))) continue;
      const prox = l[c + 1];
      if (typeof prox === "number" || prox?.data) {
        partes.push({ rotulo: v.trim(), valor: prox });
        c++;
      } else {
        partes.push({ rotulo: v.trim() });
      }
    }
    if (partes.length) cliente.anotacoes.push(partes);
  }
  return cliente;
}

async function lerPlanilhaControle(buffer, nomeArquivo) {
  const abas = await lerXlsx(buffer);
  const clientes = abas.map(interpretarAba).filter((c) => c.plataformas.length || c.verbaMensal != null);
  if (!clientes.length) throw new Error("Nenhuma aba no formato esperado (blocos com 'Dia atual' e 'Métrica').");
  return { arquivo: nomeArquivo, carregadoEm: new Date().toISOString(), clientes };
}
