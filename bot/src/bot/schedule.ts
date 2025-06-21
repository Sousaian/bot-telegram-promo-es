import { sendPromoToGroup } from './sendDetails';
import { PromoData } from './types';
import axios from 'axios'; 

const BACKEND_URL = process.env.BACKEND_URL;

export async function checkAndSendPromos() {
  if (!BACKEND_URL) {
    console.error('❌ BACKEND_URL não definida no .env');
    return;
  }

  try {
    const response = await axios.get<PromoData[]>(BACKEND_URL);

    if (response.status !== 200) {
      console.error(`⚠️ Backend respondeu com status ${response.status}`);
      return;
    }

    const promos = response.data;

    console.log(`Encontradas ${promos.length} promoções.`);

    for (const promo of promos) {
      await sendPromoToGroup(promo);
    }
  } catch (error) {
    console.error('Erro ao buscar promoções do backend:', error);
  }
}
