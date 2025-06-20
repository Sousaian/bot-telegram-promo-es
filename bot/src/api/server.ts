import express from 'express';
import bodyParser from 'body-parser';
import { sendPromoToGroup } from '../bot/sendDetails';

const app = express();
app.use(bodyParser.json());

app.post('/promo', async (req, res) => {
  const data = req.body;

  try {
    await sendPromoToGroup(data);
    res.status(200).send({ message: 'Promoção enviada com sucesso!' });
  } catch (err) {
    console.error('Erro ao enviar promoção:', err);
    res.status(500).send({ error: 'Erro ao enviar promoção.' });
  }
});

export function startServer() {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🌐 API escutando na porta ${PORT}`);
  });
}
