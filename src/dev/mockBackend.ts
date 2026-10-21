/**
 * Backend falso para desenvolvimento: devolve promoções fixas em
 * GET http://localhost:4000/mock-promos
 */
import express from "express";

const PORT = Number(process.env.MOCK_PORT ?? 4000);
const app = express();

app.get("/mock-promos", (_req, res) => {
  res.json([
    {
      nome: "Fone Bluetooth JBL Tune 520BT",
      categoria: "Áudio",
      preco: 199.9,
      url: "https://www.amazon.com.br/dp/fake_jbl/?tag=tag_exemplo",
    },
    {
      nome: "Câmera Logitech C920",
      categoria: "Webcam",
      preco: 369.0,
      url: "https://www.amazon.com.br/dp/fake_logitech/?tag=tag_exemplo",
    },
    {
      nome: "Teclado Mecânico Redragon Kumara",
      categoria: "Periféricos",
      preco: 179.99,
      url: "https://www.amazon.com.br/dp/fake_redragon/?tag=tag_exemplo",
    },
  ]);
});

app.listen(PORT, () => {
  console.log(`📦 Mock backend rodando em http://localhost:${PORT}/mock-promos`);
});
