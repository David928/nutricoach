// api/analyse.js — Backend sécurisé NutriCoach AI
// Ta clé Claude est ici, côté serveur, jamais visible par les utilisateurs

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const DAILY_LIMIT = 10; // analyses max par jour par abonné

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  // Parse body si pas auto-parsé
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch(e) {
      return res.status(400).json({ error: 'JSON invalide' });
    }
  }
  if (!body) return res.status(400).json({ error: 'Body vide' });

  const { licenseEmail, data } = body;

  if (!licenseEmail || !data) {
    return res.status(400).json({ error: 'Email et données requis' });
  }

  // ── 1. VÉRIFICATION ABONNEMENT STRIPE (désactivée — mode test) ─────────
  // TODO: réactiver avant la mise en production

  // ── 2. LIMITE JOURNALIÈRE (simple, basé sur KV ou header) ─────────────
  // Note : Pour une vraie limite, utiliser Vercel KV ou upstash.
  // Version simplifiée : confiance côté client + logs Vercel.
  // Pour passer en mode strict : ajouter Vercel KV (gratuit jusqu'à 3000 req/jour).

  // ── 3. CONSTRUCTION DU PROMPT ─────────────────────────────────────────
  const { mode } = body; // 'analyse' (défaut) ou 'conseil_soir'

  const {
    name, goals, coachStyle, calTarget,
    calories, caloriesBurned, score, prot, carb, fat, fiber,
    activity, feeling, hunger, hydration,
    meals, notes, history
  } = data;

  const goalsText = {
    perte_poids: 'perte de poids',
    prise_muscle: 'prise de muscle',
    equilibre: 'rééquilibrage alimentaire',
    energie: 'amélioration de l\'énergie'
  };

  const stylePrompts = {
    motivant: 'Sois très motivant, encourageant et optimiste. Célèbre les réussites. Donne de l\'énergie positive.',
    direct: 'Sois direct et concis. Va droit au but sans fioritures.',
    pedagogique: 'Sois pédagogique, explique le pourquoi de chaque conseil pour que l\'utilisateur comprenne et apprenne.',
    factuel: 'Sois factuel et précis. Base-toi sur les chiffres. Neutre et informatif.'
  };

  const userGoals = (goals || []).map(g => goalsText[g] || g).join(', ') || 'objectif général';
  const styleInstruction = stylePrompts[coachStyle] || stylePrompts.motivant;

  const calNet = (calories || 0) - (caloriesBurned || 0);
  const calRestant = Math.max(0, (calTarget || 1800) - calNet);

  const repasConsumed = `Calories consommées : ${calories || 0} kcal | Dépensées : ${caloriesBurned || 0} kcal | Net : ${calNet} kcal\nProtéines : ${prot || 0}g | Glucides : ${carb || 0}g | Lipides : ${fat || 0}g | Fibres : ${fiber || 0}g\nRepas : ${meals || 'non renseignés'}`;

  let prompt;

  if (mode === 'conseil_soir') {
    prompt = `Tu es NutriCoach, un coach nutritionnel expert et bienveillant. Sois concret, pratique et encourageant.

L'utilisateur s'appelle ${name}. Ses objectifs : ${userGoals}. Objectif calorique quotidien : ${calTarget} kcal.

Ce qu'il a déjà mangé aujourd'hui :
${repasConsumed}

Il lui reste environ **${calRestant} kcal** à consommer ce soir pour atteindre son objectif journalier.

Propose-lui 2 options concrètes et réalistes pour le dîner qui complètent bien ses macros de la journée. Pour chaque option, précise les aliments avec les quantités et les macros approximatives.

Structure ta réponse EXACTEMENT ainsi :

**🌙 Ce qu'il te reste à couvrir**
[Résumé des calories et macros restantes à atteindre ce soir]

**🍽️ Option 1 — [nom du repas]**
[Liste des aliments avec quantités] — ~[X] kcal | P: Xg G: Xg L: Xg

**🍽️ Option 2 — [nom du repas]**
[Liste des aliments avec quantités] — ~[X] kcal | P: Xg G: Xg L: Xg

**💡 Astuce du soir**
[1 conseil pratique pour bien finir la journée]

Sois précis sur les quantités. Maximum 220 mots.`;

  } else {
    const historyContext = history && history.length > 0
      ? `\nHistorique récent (${history.length} jours) :\n` +
        history.slice(0, 3).map((h, i) => {
          const d = new Date(h.date);
          return `- J-${i+1} (${d.toLocaleDateString('fr')}) : ${h.calories} kcal, score ${h.score}/100, prot ${h.prot}g/carb ${h.carb}g/fat ${h.fat}g`;
        }).join('\n')
      : '';

    prompt = `Tu es NutriCoach, un coach nutritionnel expert et bienveillant. ${styleInstruction}

L'utilisateur s'appelle ${name}. Ses objectifs : ${userGoals}. Objectif calorique quotidien : ${calTarget} kcal.
${historyContext}

Données de sa journée d'aujourd'hui :
- ${repasConsumed}
- Bilan net : ${calNet} kcal (objectif : ${calTarget} kcal, écart : ${(calNet - calTarget > 0 ? '+' : '') + (calNet - calTarget)} kcal)
- Note Foodvisor : ${score >= 80 ? '🟢 Journée verte (excellente qualité)' : score >= 55 ? '🔵 Journée bleue (bonne qualité)' : score >= 30 ? '🟠 Journée orange (qualité moyenne)' : '🔴 Journée rouge (à améliorer)'}
- Ratio calorique macros : ${prot && carb && fat ? `P ${Math.round(prot*4/(prot*4+carb*4+fat*9)*100)}% / G ${Math.round(carb*4/(prot*4+carb*4+fat*9)*100)}% / L ${Math.round(fat*9/(prot*4+carb*4+fat*9)*100)}%` : '?'}
- Activité physique : ${activity || '?'}
- Ressenti général : ${feeling || '?'}
- Faim ressentie : ${hunger || '?'}
- Hydratation : ${hydration || '?'}
${notes ? `- Notes : ${notes}` : ''}

Analyse la journée en français. Structure ta réponse EXACTEMENT ainsi (utilise ces émojis et sections) :

**📊 Bilan de la journée**
[2-3 phrases de bilan global, personnalisé avec le prénom]

**✅ Points forts**
[2-3 bullet points sur ce qui a bien été aujourd'hui]

**🎯 À améliorer**
[1-2 bullet points concrets et actionnables]

**💡 Conseil pour demain**
[1 conseil spécifique et pratique pour le lendemain]

Sois chaleureux, précis et personnalisé. Maximum 280 mots.`;
  }

  // ── 4. APPEL CLAUDE ────────────────────────────────────────────────────
  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', // Haiku = moins cher, suffisant pour ce cas
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.json();
      throw new Error(err.error?.message || 'Erreur Claude API');
    }

    const claudeData = await claudeRes.json();
    const analysis = claudeData.content[0].text;

    return res.status(200).json({
      success: true,
      analysis,
      tokensUsed: claudeData.usage?.input_tokens + claudeData.usage?.output_tokens,
    });

  } catch (err) {
    console.error('Claude error:', err);
    return res.status(500).json({ error: 'Erreur analyse IA : ' + err.message });
  }
}
