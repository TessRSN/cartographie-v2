/**
 * Limites durables d'envoi de liens, et liens à usage unique.
 * Avec le stockage clé-valeur de Vercel (Upstash Redis, interface REST), les compteurs
 * sont partagés entre toutes les instances. Sans lui, ou s'il est en panne, repli sur la
 * mémoire de l'instance : moins strict, mais le site continue de fonctionner.
 */
const HEURE_S = 3600;
const JOUR_S = 86400;
const PLAFONDS = { parCourriel: 3, parIp: 10, parJour: 80 };

function creerLimites({ env = process.env, requete = fetch, maintenant = Date.now, journal = console.error } = {}) {
  const base = String(env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL || '').replace(/\/+$/, '');
  const jeton = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN || '';
  const memoire = new Map(); // clé → { valeur, fin } (fin en millisecondes)

  async function stockage(commandes) {
    const reponse = await requete(`${base}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commandes),
    });
    if (!reponse.ok) throw new Error(`stockage : réponse ${reponse.status}`);
    const resultats = await reponse.json();
    const erreur = Array.isArray(resultats) ? resultats.find((r) => r && r.error) : { error: 'réponse inattendue' };
    if (erreur) throw new Error(`stockage : ${erreur.error}`);
    return resultats.map((r) => r.result);
  }

  function enMemoire(cle, dureeS) {
    const t = maintenant();
    for (const [c, e] of memoire) if (e.fin <= t) memoire.delete(c);
    const entree = memoire.get(cle) || { valeur: 0, fin: t + dureeS * 1000 };
    entree.valeur += 1;
    memoire.set(cle, entree);
    return entree.valeur;
  }

  // Ajoute 1 à chaque compteur et renvoie les nouvelles valeurs.
  async function compter(compteurs) {
    if (base && jeton) {
      try {
        const commandes = compteurs.flatMap(({ cle, dureeS }) => [['INCR', cle], ['EXPIRE', cle, dureeS, 'NX']]);
        const resultats = await stockage(commandes);
        return compteurs.map((_, i) => Number(resultats[i * 2]));
      } catch (err) {
        journal('[limites] repli en mémoire :', err.message);
      }
    }
    return compteurs.map(({ cle, dureeS }) => enMemoire(cle, dureeS));
  }

  async function autoriserLien({ courriel, ip }) {
    const t = new Date(maintenant());
    const jour = t.toISOString().slice(0, 10);
    const heure = t.toISOString().slice(0, 13);
    const compteurs = [
      { cle: `carto:lien:jour:${jour}`, dureeS: JOUR_S, plafond: PLAFONDS.parJour },
      { cle: `carto:lien:c:${courriel}:${heure}`, dureeS: HEURE_S, plafond: PLAFONDS.parCourriel },
    ];
    if (ip) compteurs.push({ cle: `carto:lien:ip:${ip}:${heure}`, dureeS: HEURE_S, plafond: PLAFONDS.parIp });
    const valeurs = await compter(compteurs);
    return compteurs.every((c, i) => valeurs[i] <= c.plafond);
  }

  // Vrai la première fois qu'un identifiant de jeton est présenté, faux ensuite (pendant 24 heures).
  async function consommerJeton(jti) {
    const cle = `carto:jeton:${jti}`;
    if (base && jeton) {
      try {
        const [resultat] = await stockage([['SET', cle, '1', 'NX', 'EX', JOUR_S]]);
        return resultat === 'OK';
      } catch (err) {
        journal('[limites] repli en mémoire :', err.message);
      }
    }
    return enMemoire(cle, JOUR_S) === 1;
  }

  return { autoriserLien, consommerJeton };
}

module.exports = { creerLimites, PLAFONDS };
