import express from 'express';
const app = express();

app.get('/mock-promos', (req, res) => {
  res.json([
    {
      nome: "Fone Bluetooth JBL",
      categoria: "Áudio",
      preco: 199.90,
      url: "https://www.amazon.com.br/dp/fake_jbl/?tag=tag_exemplo",
    },
    {
      nome: "teste",
      categoria: "teste",
      preco: 369.00,
      url: "https://www.amazon.com.br/dp/fake_teste/?tag=tag_exemplo"
    },
    {
      nome: "Câmera Logitech C920",
      categoria: "Webcam",
      preco: 369.00,
      url: "https://www.amazon.com.br/dp/fake_logitech/?tag=tag_exemplo"
    }
  ]);
});

app.listen(4000, () => {
  console.log('📦 Mock backend rodando em http://localhost:4000/mock-promos');
});
