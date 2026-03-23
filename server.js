const express = require("express");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");


const app = express();
const PORT = process.env.PORT || 3000;

// ================= MIDDLEWARES =================
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  next();
});

// ================= MEMÓRIA =================
const recebidos = [];

// ================= HOME =================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ================= RECEBER =================
app.post("/api/relatorios", (req, res) => {
  const payload = req.body;

  if (!payload || !payload.relatorios) {
    return res.status(400).json({ ok: false, error: "Payload inválido" });
  }

  recebidos.push({
    recebidoEm: new Date().toISOString(),
    origem: payload.origem || "desconhecida",
    quantidade: payload.relatorios.length,
    dados: payload.relatorios,
    downloads: 0,
    baixadoEm: null
  });

  res.json({ ok: true });
});

// ================= LISTAR =================
app.get("/api/recebidos", (req, res) => {
  res.json(recebidos);
});

// ================= GERAR TXT =================
function gerarTXT(item) {
  let txt = "RELATÓRIO SKNSYNC\n\n";
  txt += `Recebido em: ${item.recebidoEm}\n`;

  if (typeof item.origem === "object") {
    txt += `Tablet: ${item.origem.deviceId}\n`;
    txt += `Responsável: ${item.origem.responsavel}\n`;
  } else {
    txt += `Origem: ${item.origem}\n`;
  }

  txt += `Quantidade: ${item.quantidade}\n\n`;

  item.dados.forEach((r, i) => {
    txt += `--- RELATÓRIO ${i + 1} ---\n`;
    txt += r.texto ? r.texto : JSON.stringify(r, null, 2);
    txt += "\n\n";
  });

  return txt;
}

// ================= DOWNLOAD ALL =================
app.get("/api/recebidos/download/all", (req, res) => {
  if (!recebidos.length) {
    return res.status(404).send("Nenhum relatório disponível");
  }

  let txt = "RELATÓRIOS SKNSYNC - TODOS OS ENVIOS\n";
  txt += `Gerado em: ${new Date().toISOString()}\n`;
  txt += `Total: ${recebidos.length} envio(s)\n`;
  txt += "=".repeat(50) + "\n\n";

  recebidos.forEach((item, i) => {
    txt += `===== ENVIO ${i + 1} =====\n`;
    txt += gerarTXT(item);
    txt += "\n";

    item.downloads = (item.downloads || 0) + 1;
    item.baixadoEm = new Date().toISOString();
  });

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="sknsync_todos_${Date.now()}.txt"`);
  res.send(txt);
});

// ================= DOWNLOAD =================
app.get("/api/recebidos/:idx/download", (req, res) => {
  const idx = Number(req.params.idx);
  const item = recebidos[idx];

  if (!item) {
    return res.status(404).send("Arquivo não encontrado");
  }

  item.downloads = (item.downloads || 0) + 1;
  item.baixadoEm = new Date().toISOString();

  const nome = `sknsync_${item.recebidoEm}.txt`;

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${nome}"`);
  res.send(gerarTXT(item));
});

// ================= EXCLUIR =================
app.delete("/api/recebidos/:idx", (req, res) => {
  const idx = Number(req.params.idx);

  if (!recebidos[idx]) {
    return res.status(404).json({ ok: false });
  }

  recebidos.splice(idx, 1);
  res.json({ ok: true });
});

// ================= FOLLOW-UPS =================
const FOLLOWUP_FILE = path.join(__dirname, "public", "followups.json");

function carregarFollowups() {
  try {
    if (fs.existsSync(FOLLOWUP_FILE)) return JSON.parse(fs.readFileSync(FOLLOWUP_FILE, "utf8"));
  } catch {}
  return [];
}

function salvarFollowups(arr) {
  fs.writeFileSync(FOLLOWUP_FILE, JSON.stringify(arr, null, 2), "utf8");
}

const followups = carregarFollowups();

// POST /api/followup — recebe follow-up do SKNGE
app.post("/api/followup", (req, res) => {
  const data = req.body;
  if (!data || !data.os) return res.status(400).json({ ok: false, error: "Payload inválido" });

  const entry = { ...data, recebidoEm: new Date().toISOString(), downloads: 0, baixadoEm: null };
  followups.unshift(entry);
  salvarFollowups(followups);
  res.json({ ok: true });
});

// GET /api/followups — lista todos
app.get("/api/followups", (req, res) => res.json(followups));

// GET /api/followups/:idx/download — download TXT
app.get("/api/followups/:idx/download", (req, res) => {
  const idx  = Number(req.params.idx);
  const item = followups[idx];
  if (!item) return res.status(404).send("Não encontrado");

  item.downloads++;
  item.baixadoEm = new Date().toISOString();
  salvarFollowups(followups);

  const d = new Date(item.recebidoEm).toLocaleString("pt-BR");
  const linha = "═".repeat(54);
  const div   = "─".repeat(54);

  const checkTxt = (item.checklist || []).length
    ? item.checklist.map(c => `  [${c.feito ? "X" : " "}] ${c.texto}`).join("\n")
    : "  (nenhum item)";

  let txt = `${linha}\n`;
  txt += `  FOLLOW-UP DE OS — SKNGESTÃO\n`;
  txt += `${linha}\n\n`;
  txt += `Recebido em : ${d}\n`;
  txt += `OS          : ${item.os}\n`;
  txt += `ID/Subitem  : ${item.id_subitem || "—"}\n`;
  txt += `Responsável : ${item.responsavel}\n`;
  txt += `Data        : ${item.data || "—"}\n`;
  txt += `Prox. Reunião: ${item.proxReuniao || "—"}\n`;
  txt += `Conclusão   : ${item.dataConclusao || "—"}\n`;
  txt += `Horas/Semana: ${item.horasSemana || "—"}\n\n`;
  txt += `${div}\n`;
  txt += `STATUS : ${item.status || "—"}   |   PROGRESSO : ${item.progresso ?? "—"}%\n`;
  txt += `${div}\n\n`;
  txt += `ATIVIDADES REALIZADAS\n${item.atividadesFeitas || "(não informado)"}\n\n`;
  txt += `PRÓXIMAS ATIVIDADES\n${item.atividadesPrev || "(não informado)"}\n\n`;
  txt += `CHECKLIST\n${checkTxt}\n\n`;
  txt += `PENDÊNCIAS / BLOQUEIOS\n${item.pendencias || "(nenhuma)"}\n\n`;
  txt += `MATERIAIS / RECURSOS\n${item.materiais || "(nenhum)"}\n\n`;
  txt += `OBSERVAÇÕES GERAIS\n${item.observacoes || "(nenhuma)"}\n\n`;
  txt += `${linha}\n`;

  const nome = `followup_${(item.os || "os").replace(/[^a-zA-Z0-9]/g, "_")}_${item.data || "semdata"}.txt`;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${nome}"`);
  res.send(txt);
});

// GET /api/followups/export/all — TXT com todos
app.get("/api/followups/export/all", (req, res) => {
  if (!followups.length) return res.status(404).send("Nenhum follow-up disponível");

  const linha = "═".repeat(54);
  let txt = `FOLLOW-UPS SKNSYNC — EXPORTAÇÃO COMPLETA\n`;
  txt += `Gerado em: ${new Date().toLocaleString("pt-BR")}\n`;
  txt += `Total: ${followups.length} registro(s)\n`;
  txt += `${linha}\n\n`;

  followups.forEach((item, i) => {
    const d    = new Date(item.recebidoEm).toLocaleString("pt-BR");
    const div  = "─".repeat(54);
    const checkTxt = (item.checklist || []).length
      ? item.checklist.map(c => `  [${c.feito ? "X" : " "}] ${c.texto}`).join("\n")
      : "  (nenhum item)";

    txt += `===== FOLLOW-UP ${i + 1} =====\n`;
    txt += `Recebido em : ${d}\n`;
    txt += `OS          : ${item.os}\n`;
    txt += `ID/Subitem  : ${item.id_subitem || "—"}\n`;
    txt += `Responsável : ${item.responsavel}\n`;
    txt += `Data        : ${item.data || "—"}\n`;
    txt += `${div}\n`;
    txt += `STATUS : ${item.status || "—"}   |   PROGRESSO : ${item.progresso ?? "—"}%\n`;
    txt += `${div}\n\n`;
    txt += `ATIVIDADES REALIZADAS\n${item.atividadesFeitas || "(não informado)"}\n\n`;
    txt += `PRÓXIMAS ATIVIDADES\n${item.atividadesPrev || "(não informado)"}\n\n`;
    txt += `CHECKLIST\n${checkTxt}\n\n`;
    txt += `PENDÊNCIAS\n${item.pendencias || "(nenhuma)"}\n\n`;
    txt += `MATERIAIS\n${item.materiais || "(nenhum)"}\n\n`;
    txt += `OBSERVAÇÕES\n${item.observacoes || "(nenhuma)"}\n\n`;
    txt += `${linha}\n\n`;
  });

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="followups_${Date.now()}.txt"`);
  res.send(txt);
});

// DELETE /api/followups/:idx
app.delete("/api/followups/:idx", (req, res) => {
  const idx = Number(req.params.idx);
  if (!followups[idx]) return res.status(404).json({ ok: false });
  followups.splice(idx, 1);
  salvarFollowups(followups);
  res.json({ ok: true });
});

// ================= START =================
app.listen(PORT, () => {
  console.log(`🚀 SKNSYNC rodando na porta ${PORT}`);
});
