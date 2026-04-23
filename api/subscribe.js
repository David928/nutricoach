// api/subscribe.js — Redirige vers la page de paiement Stripe
// Configure STRIPE_PAYMENT_LINK dans les variables d'environnement Vercel

export default function handler(req, res) {
  const paymentLink = process.env.STRIPE_PAYMENT_LINK || 'https://buy.stripe.com/VOTRE_LIEN';

  // Optionnel : pré-remplir l'email si fourni en query param
  const { email } = req.query;
  const url = email
    ? `${paymentLink}?prefilled_email=${encodeURIComponent(email)}`
    : paymentLink;

  res.redirect(302, url);
}
