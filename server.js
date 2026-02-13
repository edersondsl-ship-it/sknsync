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
// ================= SYNC MASTER =================

const MASTER_PATH = path.join(__dirname, "public", "dados.json");
const DEVICES_DIR = path.join(__dirname, "public", "devices");

// Garantir pasta
if (!fs.existsSync(DEVICES_DIR)) {
  fs.mkdirSync(DEVICES_DIR, { recursive: true });
}

// ================= LER MASTER =================
app.get("/api/sync/master", async (req, res) => {
  try {
    const raw = await fsp.readFile(MASTER_PATH, "utf8");
    res.json(JSON.parse(raw));
  } catch (e) {
    res.status(500).json({ error: "Erro ao ler dados.json" });
  }
});

// ================= GERAR JSON DO TABLET =================
app.post("/api/sync/device/:deviceId", async (req, res) => {
  try {
    const deviceId = req.params.deviceId.toLowerCase();

    const selection = req.body;
    if (!selection.osIds || !selection.osIds.length) {
      return res.status(400).json({ error: "Envie pelo menos uma OS." });
    }

    const raw = await fsp.readFile(MASTER_PATH, "utf8");
    const master = JSON.parse(raw);

    const osSelecionadas = master.os.filter(o =>
      selection.osIds.includes(o.id_os)
    );

    const osIdSet = new Set(osSelecionadas.map(o => o.id_os));

    const os_ids = master.os_ids.filter(x =>
      osIdSet.has(x.id_os)
    );

    const os_ids_idSet = new Set(os_ids.map(x => x.id_os_id));

    const alocacoes = master.alocacoes.filter(a =>
      osIdSet.has(a.id_os) && os_ids_idSet.has(a.id_os_id)
    );

    const subIdSet = new Set(alocacoes.map(a => a.id_sub));

    const sub_ids = master.sub_ids.filter(s =>
      subIdSet.has(s.id_sub)
    );

    const funcionarios = master.funcionarios.filter(f =>
      selection.funcionarioIds?.includes(f.id)
    );

    const resultado = {
      meta: {
        geradoEm: new Date().toISOString(),
        device: deviceId
      },
      funcionarios,
      os: osSelecionadas,
      os_ids,
      sub_ids,
      alocacoes
    };

    const filePath = path.join(DEVICES_DIR, `${deviceId}.json`);
    await fsp.writeFile(filePath, JSON.stringify(resultado, null, 2));

    res.json({ ok: true });

  } catch (e) {
    res.status(500).json({ error: "Erro ao gerar JSON do device." });
  }
});

// ================= LER JSON DO TABLET =================
app.get("/api/sync/device/:deviceId", async (req, res) => {
  try {
    const deviceId = req.params.deviceId.toLowerCase();
    const filePath = path.join(DEVICES_DIR, `${deviceId}.json`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Device não encontrado" });
    }

    const raw = await fsp.readFile(filePath, "utf8");
    res.json(JSON.parse(raw));
  } catch (e) {
    res.status(500).json({ error: "Erro ao ler device" });
  }
});

// ================= START =================
app.listen(PORT, () => {
  console.log(`🚀 SKNSYNC rodando na porta ${PORT}`);
});
