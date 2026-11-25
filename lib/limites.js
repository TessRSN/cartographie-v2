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

  // Les limites par adresse et par IP sont comptées d'abord : une demande qu'elles refusent
  // n'entame pas le plafond de la journée, qui ne peut donc pas être épuisé par un seul abuseur.
  // plafondDuJour: false pour les liens du panneau, envoyés seulement aux approbateurs.
  async function autoriserLien({ courriel, ip, plafondDuJour = true }) {
    const t = new Date(maintenant());
    const jour = t.toISOString().slice(0, 10);
    const heure = t.toISOString().slice(0, 13);
    const compteurs = [{ cle: `carto:lien:c:${courriel}:${heure}`, dureeS: HEURE_S, plafond: PLAFONDS.parCourriel }];
    if (ip) compteurs.push({ cle: `carto:lien:ip:${ip}:${heure}`, dureeS: HEURE_S, plafond: PLAFONDS.parIp });
    const valeurs = await compter(compteurs);
    if (!compteurs.every((c, i) => valeurs[i] <= c.plafond)) return false;
    if (!plafondDuJour) return true;
    const [total] = await compter([{ cle: `carto:lien:jour:${jour}`, dureeS: JOUR_S }]);
    return total <= PLAFONDS.parJour;
  }

  // Verrou partagé entre les instances du serveur, pour qu'un geste ne soit pas fait deux fois.
  // Il expire seul au bout d'une minute si l'instance qui le tenait a disparu.
  async function prendreVerrou(nom, dureeS = 60) {
    const cle = `carto:verrou:${nom}`;
    if (base && jeton) {
      try {
        const [resultat] = await stockage([['SET', cle, '1', 'NX', 'EX', dureeS]]);
        return resultat === 'OK';
      } catch (err) {
        journal('[limites] repli en mémoire :', err.message);
      }
    }
    return enMemoire(cle, dureeS) === 1;
  }

  async function rendreVerrou(nom) {
    const cle = `carto:verrou:${nom}`;
    memoire.delete(cle);
    if (base && jeton) {
      try { await stockage([['DEL', cle]]); } catch (err) { journal('[limites] verrou non rendu :', err.message); }
    }
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

  // Rend un jeton consommé, quand la proposition n'a finalement pas pu être enregistrée.
  async function libererJeton(jti) {
    const cle = `carto:jeton:${jti}`;
    memoire.delete(cle);
    if (base && jeton) {
      try { await stockage([['DEL', cle]]); } catch (err) { journal('[limites] jeton non rendu :', err.message); }
    }
  }

  return { autoriserLien, consommerJeton, libererJeton, prendreVerrou, rendreVerrou };
}

module.exports = { creerLimites, PLAFONDS };
