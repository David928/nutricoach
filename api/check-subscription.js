// api/check-subscription.js — Vérification rapide d'abonnement Stripe

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email requis' });
  }

  try {
    const stripeRes = await fetch(
      `https://api.stripe.com/v1/customers/search?query=email:'${encodeURIComponent(email)}'&expand[]=data.subscriptions`,
      {
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        },
      }
    );

    const stripeData = await stripeRes.json();

    if (!stripeData.data || stripeData.data.length === 0) {
      return res.status(200).json({ active: false, reason: 'NO_CUSTOMER' });
    }

    const customer = stripeData.data[0];
    const subscriptions = customer.subscriptions?.data || [];
    const activeSub = subscriptions.find(
      s => s.status === 'active' || s.status === 'trialing'
    );

    if (!activeSub) {
      return res.status(200).json({ active: false, reason: 'INACTIVE' });
    }

    // Retourne les infos utiles sans données sensibles
    return res.status(200).json({
      active: true,
      plan: activeSub.items?.data[0]?.price?.nickname || 'NutriCoach Pro',
      renewsAt: new Date(activeSub.current_period_end * 1000).toLocaleDateString('fr'),
      status: activeSub.status,
    });

  } catch (err) {
    console.error('Stripe check error:', err);
    return res.status(500).json({ error: 'Erreur vérification : ' + err.message });
  }
}
