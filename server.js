const express = require("express");
const path = require("path");

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
    dados: payload.relatorios
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

// ================= DOWNLOAD =================
app.get("/api/recebidos/:idx/download", (req, res) => {
  const idx = Number(req.params.idx);
  const item = recebidos[idx];

  if (!item) {
    return res.status(404).send("Arquivo não encontrado");
  }

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

// ================= START =================
app.listen(PORT, () => {
  console.log(`🚀 SKNSYNC rodando na porta ${PORT}`);
});
