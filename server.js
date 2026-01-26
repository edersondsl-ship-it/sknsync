const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// memória temporária (fase 1)
const recebidos = [];

// middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

// endpoint de recebimento
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

  console.log("📥 Relatórios recebidos:", payload.relatorios.length);

  res.json({ ok: true });
});

// endpoint para o front listar
app.get("/api/recebidos", (req, res) => {
  res.json(recebidos);
});

// start
app.listen(PORT, () => {
  console.log(`🚀 SKNSYNC rodando na porta ${PORT}`);
});
