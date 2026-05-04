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
  if (!data) return res.status(400).json({ ok: false, error: "Payload inválido" });

  const entry = { ...data, recebidoEm: new Date().toISOString(), downloads: 0, baixadoEm: null };
  followups.splice(0, followups.length, entry);
  salvarFollowups(followups);
  res.json({ ok: true });
});

// GET /api/followups — lista todos
app.get("/api/followups", (req, res) => res.json(followups));

function gerarTxtFollowup(item) {
  const d     = new Date(item.recebidoEm).toLocaleString("pt-BR");
  const linha = "═".repeat(56);
  const div   = "─".repeat(56);
  const itens = item.itens || [];

  let txt = `${linha}\n`;
  txt += `  FOLLOW-UP DE OS — SKNGESTÃO\n`;
  txt += `${linha}\n\n`;
  txt += `Recebido em : ${d}\n`;
  txt += `Data        : ${item.data || "—"}\n\n`;

  if (itens.length) {
    itens.forEach((it) => {
      const perc = parseFloat(it.perc) || 0;
      const semaforo = perc > 90 ? "🔴" : perc > 70 ? "🟡" : "🟢";
      txt += `${div}\n`;
      txt += `${semaforo}  ${it.os}\n`;
      txt += `   Usado: ${Number(it.usado).toFixed(1)}h / Previsto: ${Number(it.previsto).toFixed(1)}h  (${perc.toFixed(1)}%)\n`;

      const ids = it.ids || [];
      if (ids.length) {
        ids.forEach(id => {
          const ip = parseFloat(id.perc) || 0;
          const sm = ip > 90 ? "🔴" : ip > 70 ? "🟡" : "🟢";
          txt += `      ${sm}  ${id.nome}  —  ${Number(id.usado).toFixed(1)}h / ${Number(id.previsto).toFixed(1)}h  (${ip.toFixed(1)}%)\n`;
        });
      }

      if (it.observacoes) {
        txt += `   Obs: ${it.observacoes}\n`;
      }
    });
    txt += `${div}\n`;
  }

  txt += `\n${linha}\n`;
  return txt;
}

// GET /api/followups/:idx/download — download TXT
app.get("/api/followups/:idx/download", (req, res) => {
  const idx  = Number(req.params.idx);
  const item = followups[idx];
  if (!item) return res.status(404).send("Não encontrado");

  item.downloads++;
  item.baixadoEm = new Date().toISOString();
  salvarFollowups(followups);

  const nome = `followup_${item.data || "semdata"}_${Date.now()}.txt`;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${nome}"`);
  res.send(gerarTxtFollowup(item));
});

// GET /api/followups/export/all — TXT com todos
app.get("/api/followups/export/all", (req, res) => {
  if (!followups.length) return res.status(404).send("Nenhum follow-up disponível");

  const agora = new Date().toISOString();
  followups.forEach(item => {
    item.downloads = (item.downloads || 0) + 1;
    item.baixadoEm = agora;
  });
  salvarFollowups(followups);

  const linha = "═".repeat(56);
  let txt = `FOLLOW-UPS SKNSYNC — EXPORTAÇÃO COMPLETA\n`;
  txt += `Gerado em: ${new Date().toLocaleString("pt-BR")}\n`;
  txt += `Total: ${followups.length} registro(s)\n`;
  txt += `${linha}\n\n`;

  followups.forEach((item, i) => {
    txt += `===== FOLLOW-UP ${i + 1} =====\n`;
    txt += gerarTxtFollowup(item);
    txt += "\n";
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

// ================= ASSISTENCIA =================
const ASSIST_FILE = path.join(__dirname, "public", "assistencia.json");

function carregarAssistencias() {
  try {
    if (fs.existsSync(ASSIST_FILE)) return JSON.parse(fs.readFileSync(ASSIST_FILE, "utf8"));
  } catch {}
  return [];
}

function salvarAssistencias(arr) {
  fs.writeFileSync(ASSIST_FILE, JSON.stringify(arr, null, 2), "utf8");
}

const assistencias = carregarAssistencias();

app.post("/api/assistencia", (req, res) => {
  const payload = req.body;
  if (!payload || !payload.relatorios) return res.status(400).json({ ok: false, error: "Payload inválido" });

  assistencias.unshift({
    recebidoEm: new Date().toISOString(),
    origem: payload.origem || "desconhecida",
    quantidade: payload.relatorios.length,
    dados: payload.relatorios,
    observacao: "",
    downloads: 0,
    baixadoEm: null
  });
  salvarAssistencias(assistencias);
  res.json({ ok: true });
});

app.get("/api/assistencias", (req, res) => res.json(assistencias));

// ================= ASSISTENCIA TXT =================
const DIAS_SEMANA = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

function gerarTXTAssistencia(item) {
  const linha = "═".repeat(52);
  const div   = "─".repeat(52);
  const origem = typeof item.origem === "object"
    ? `${item.origem.responsavel || "—"} · ${item.origem.deviceId || "—"}`
    : (item.origem || "—");

  let txt = `${linha}\n`;
  txt += `  APONTAMENTO DE ASSISTÊNCIA TÉCNICA — SKNSYNC\n`;
  txt += `${linha}\n\n`;
  txt += `Recebido em : ${new Date(item.recebidoEm).toLocaleString("pt-BR")}\n`;
  txt += `Origem      : ${origem}\n`;
  txt += `Relatórios  : ${item.quantidade}\n`;
  if (item.observacao) txt += `Observação  : ${item.observacao}\n`;
  txt += "\n";

  (item.dados || []).forEach((r, i) => {
    txt += `${div}\n`;
    txt += `RELATÓRIO ${i + 1}\n`;
    if (r.os_codigo || r.os_descricao) {
      txt += `OS: ${[r.os_codigo, r.os_descricao].filter(Boolean).join(" — ")}\n`;
    }
    if (r.equipe && r.equipe.length) {
      r.equipe.forEach(f => {
        txt += `  Funcionário: ${f.nome}${f.matricula ? " — MAT: " + f.matricula : ""}\n`;
      });
    }
    if (r.dias && r.dias.length) {
      txt += `\n  Data             Manhã            Tarde\n`;
      r.dias.forEach(d => {
        const [y,m,dd] = d.data.split("-").map(Number);
        const diaSem = DIAS_SEMANA[new Date(y, m-1, dd).getDay()];
        const dataFmt = `${String(dd).padStart(2,"0")}/${String(m).padStart(2,"0")} (${diaSem})`;
        const manha = `${d.entrada1||"--"} → ${d.saida1||"--"}`;
        const tarde = `${d.entrada2||"--"} → ${d.saida2||"--"}`;
        txt += `  ${dataFmt.padEnd(16)} ${manha.padEnd(16)} ${tarde}\n`;
      });
    }
    txt += "\n";
  });

  txt += `${linha}\n`;
  return txt;
}

// GET /api/assistencias/download/all
app.get("/api/assistencias/download/all", (req, res) => {
  if (!assistencias.length) return res.status(404).send("Nenhum apontamento disponível");

  let txt = "APONTAMENTOS DE ASSISTÊNCIA TÉCNICA — TODOS OS ENVIOS\n";
  txt += `Gerado em: ${new Date().toLocaleString("pt-BR")}\n`;
  txt += `Total: ${assistencias.length} envio(s)\n`;
  txt += "=".repeat(52) + "\n\n";

  assistencias.forEach((item, i) => {
    txt += `===== ENVIO ${i + 1} =====\n`;
    txt += gerarTXTAssistencia(item);
    txt += "\n";
    item.downloads = (item.downloads || 0) + 1;
    item.baixadoEm = new Date().toISOString();
  });

  salvarAssistencias(assistencias);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="assistencia_todos_${Date.now()}.txt"`);
  res.send(txt);
});

// GET /api/assistencias/:idx/download
app.get("/api/assistencias/:idx/download", (req, res) => {
  const idx = Number(req.params.idx);
  const item = assistencias[idx];
  if (!item) return res.status(404).send("Arquivo não encontrado");

  item.downloads = (item.downloads || 0) + 1;
  item.baixadoEm = new Date().toISOString();
  salvarAssistencias(assistencias);

  const nome = `assistencia_${item.recebidoEm.replace(/[:.]/g, "-")}.txt`;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${nome}"`);
  res.send(gerarTXTAssistencia(item));
});

app.put("/api/assistencias/:idx", (req, res) => {
  const idx = Number(req.params.idx);
  if (!assistencias[idx]) return res.status(404).json({ ok: false });
  if (req.body.observacao !== undefined) assistencias[idx].observacao = req.body.observacao;
  salvarAssistencias(assistencias);
  res.json({ ok: true });
});

app.delete("/api/assistencias/:idx", (req, res) => {
  const idx = Number(req.params.idx);
  if (!assistencias[idx]) return res.status(404).json({ ok: false });
  assistencias.splice(idx, 1);
  salvarAssistencias(assistencias);
  res.json({ ok: true });
});

// ================= START =================
app.listen(PORT, () => {
  console.log(`🚀 SKNSYNC rodando na porta ${PORT}`);
});
