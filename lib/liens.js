/**
 * La vérification des liens principaux : visiter une adresse web pour savoir si elle répond,
 * sans jamais lire son contenu, et tenir la colonne « Lien en panne depuis » des fiches.
 *
 * Les adresses viennent des fiches, donc de l'extérieur : rien n'est visité sans contrôle.
 *  - seulement http et https, sans identifiants dans l'adresse ;
 *  - jamais une adresse locale, privée, de liaison locale ou de métadonnées : le nom est résolu
 *    d'abord, chacune de ses adresses est contrôlée, et la connexion se fait vers l'adresse
 *    contrôlée (le nom n'est pas résolu une seconde fois) ;
 *  - les redirections sont suivies à la main, cinq au plus, chacune recontrôlée de la même façon ;
 *  - un agent générique, aucun en-tête qui désigne le projet.
 * « En panne » : erreur de réseau, délai dépassé, ou réponse 404, 410 ou 5xx. Une réponse 401, 403
 * ou 429 n'est pas une panne : le site bloque les robots. Une adresse qu'on refuse de visiter
 * n'est ni l'un ni l'autre : elle est laissée telle quelle.
 */
const net = require('node:net');
const dns = require('node:dns');
const http = require('node:http');
const https = require('node:https');
const { PROP } = require('./notion');
const { jourAuQuebec } = require('./approbation');

const STATUT_ECARTEE = 'Écartée';
const AGENT = 'Mozilla/5.0 (compatible; verification-de-liens/1.0)';
const REDIRECTIONS_MAX = 5;
const DELAI_MS = 5000;
const SIMULTANES = 8;
const BUDGET_MS = 45000;
// Au-delà de ce nombre de liens tombés d'un coup (et de trois sur dix), la panne est sans doute de notre côté.
const SEUIL_SUSPECT = 5;
const PART_SUSPECTE = 0.3;

const interdites = new net.BlockList();
for (const [adresse, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
]) interdites.addSubnet(adresse, bits, 'ipv4');
for (const [adresse, bits] of [
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['100::', 64], ['2001:db8::', 32], ['2002::', 16],
  ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
]) interdites.addSubnet(adresse, bits, 'ipv6');

// Vrai pour toute adresse qu'on ne visite pas, et pour tout ce qui n'est pas une adresse.
// Une adresse IPv4 écrite en IPv6 (::ffff:a.b.c.d) est jugée comme l'adresse IPv4 qu'elle porte.
function adresseInterdite(adresse) {
  const sorte = net.isIP(String(adresse || ''));
  if (!sorte) return true;
  return interdites.check(adresse, sorte === 6 ? 'ipv6' : 'ipv4');
}

const resoudreReel = (hote) => dns.promises.lookup(hote, { all: true, verbatim: true });

// Une requête vers l'adresse déjà contrôlée : le nom ne sert plus qu'au certificat et à l'en-tête Host.
// La réponse est coupée dès ses en-têtes : le contenu n'est jamais lu.
function requeteReelle({ url, methode, adresse, famille, delaiMs, entetes }) {
  return new Promise((reussir, echouer) => {
    const cible = new URL(url);
    const lookup = (hote, options, suite) => (options && options.all ? suite(null, [{ address: adresse, family: famille }]) : suite(null, adresse, famille));
    let finie = false;
    const finir = (erreur, valeur) => { if (finie) return; finie = true; clearTimeout(minuterie); if (erreur) echouer(erreur); else reussir(valeur); };
    const req = (cible.protocol === 'https:' ? https : http).request(cible, { method: methode, headers: entetes, lookup, agent: false }, (res) => {
      const location = typeof res.headers.location === 'string' ? res.headers.location : null;
      const statut = res.statusCode;
      res.destroy();
      finir(null, { statut, location });
    });
    const minuterie = setTimeout(() => { req.destroy(); finir(new Error('délai dépassé')); }, delaiMs);
    req.on('error', (err) => finir(err));
    req.end();
  });
}

const refus = (raison) => ({ ok: false, raison });
const LOCAUX = /(^|\.)(localhost|local|internal|localdomain|home\.arpa|lan|intranet|corp)$/;

// Contrôle une adresse web avant toute connexion. Renvoie { ok: true, url, adresse, famille },
// ou { ok: false, raison } : 'forme', 'interdite', ou 'nom' si le nom n'existe pas.
async function controler(brut, { resoudre = resoudreReel } = {}) {
  let url;
  try { url = new URL(String(brut || '').trim()); } catch (err) { return refus('forme'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return refus('forme');
  if (url.username || url.password) return refus('forme');
  const hote = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (!hote) return refus('forme');
  if (net.isIP(hote)) return adresseInterdite(hote) ? refus('interdite') : { ok: true, url: url.href, adresse: hote, famille: net.isIP(hote) };
  // Un nom local, ou un nom d'un seul mot, ne désigne jamais un site public.
  if (LOCAUX.test(hote) || !hote.includes('.')) return refus('interdite');
  let adresses;
  try { adresses = await resoudre(hote); } catch (err) { return refus('nom'); }
  if (!Array.isArray(adresses) || !adresses.length) return refus('interdite');
  // Une seule adresse interdite suffit à refuser le nom.
  if (adresses.some((a) => !a || adresseInterdite(a.address))) return refus('interdite');
  return { ok: true, url: url.href, adresse: adresses[0].address, famille: net.isIP(adresses[0].address) };
}

const estPanne = (statut) => statut === 404 || statut === 410 || (statut >= 500 && statut <= 599);
// HEAD refusé, mal compris, ou qui annonce une panne : GET tranche.
const aReprendre = (statut) => statut === 400 || statut === 405 || statut === 501 || estPanne(statut);

// Visite une adresse. Renvoie { etat, raison } : etat vaut 'ok', 'panne', ou 'ignore' quand
// l'adresse n'a pas pu être visitée sans risque (elle n'est alors notée ni en panne ni rétablie).
async function visiter(depart, { resoudre = resoudreReel, requete = requeteReelle, delaiMs = DELAI_MS } = {}) {
  let url = depart;
  for (let saut = 0; saut <= REDIRECTIONS_MAX; saut++) {
    const controle = await controler(url, { resoudre });
    if (!controle.ok) return controle.raison === 'nom' ? { etat: 'panne', raison: 'nom' } : { etat: 'ignore', raison: controle.raison };
    const demande = { url: controle.url, adresse: controle.adresse, famille: controle.famille, delaiMs, entetes: { 'User-Agent': AGENT, Accept: '*/*' } };
    let reponse = null;
    try { reponse = await requete({ ...demande, methode: 'HEAD' }); } catch (err) { reponse = null; }
    if (!reponse || aReprendre(reponse.statut)) {
      try { reponse = await requete({ ...demande, methode: 'GET' }); } catch (err) { return { etat: 'panne', raison: 'reseau' }; }
    }
    const statut = Number(reponse && reponse.statut);
    if (statut >= 300 && statut < 400 && reponse.location) {
      try { url = new URL(reponse.location, controle.url).href; } catch (err) { return { etat: 'ignore', raison: 'forme' }; }
      continue;
    }
    return { etat: estPanne(statut) ? 'panne' : 'ok', raison: `http-${statut}` };
  }
  return { etat: 'ignore', raison: 'redirections' };
}

function creerLiens({
  notion, resoudre = resoudreReel, requete = requeteReelle, maintenant = Date.now, journal = console.error,
  simultanes = SIMULTANES, budgetMs = BUDGET_MS, delaiMs = DELAI_MS, seuilSuspect = SEUIL_SUSPECT,
}) {
  const visite = (url) => visiter(url, { resoudre, requete, delaiMs });

  // Note le résultat d'une visite, seulement si l'état change : le lien tombe (la date du jour au
  // Québec), ou il revient (vide). Jamais de version : ce n'est pas un champ du catalogue.
  // Renvoie { change: 'tombe' | 'revenu' | null, depuis : la date en vigueur après la visite }.
  async function noter(fiche, resultat) {
    const depuis = fiche.lienEnPanneDepuis || null;
    if (resultat.etat === 'panne' && !depuis) {
      const jour = jourAuQuebec(maintenant());
      await notion.mettreAJourFiche(fiche.id, { [PROP.lienEnPanneDepuis]: { date: { start: jour } } });
      return { change: 'tombe', depuis: jour };
    }
    if (resultat.etat === 'ok' && depuis) {
      await notion.mettreAJourFiche(fiche.id, { [PROP.lienEnPanneDepuis]: { date: null } });
      return { change: 'revenu', depuis: null };
    }
    return { change: null, depuis };
  }

  // La tournée : le lien principal de chaque fiche publiée, plusieurs à la fois, dans le temps compté.
  async function verifierTous() {
    const debut = maintenant();
    const fiches = (await notion.lireRessources()).filter((f) => f.statutFiche !== STATUT_ECARTEE && f.nom && f.lien);
    const resultats = new Map();
    let suivante = 0;
    const ouvrier = async () => {
      while (suivante < fiches.length && maintenant() - debut <= budgetMs) {
        const fiche = fiches[suivante++];
        try { resultats.set(fiche.id, await visite(fiche.lien)); } catch (err) { resultats.set(fiche.id, { etat: 'ignore', raison: 'erreur' }); }
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(simultanes, fiches.length)) }, ouvrier));

    const vues = fiches.filter((f) => resultats.has(f.id));
    const visitees = vues.filter((f) => resultats.get(f.id).etat !== 'ignore');
    const tombees = visitees.filter((f) => resultats.get(f.id).etat === 'panne' && !f.lienEnPanneDepuis);
    const suspect = tombees.length > Math.max(seuilSuspect, PART_SUSPECTE * visitees.length);
    if (suspect) journal(`[liens] ${tombees.length} liens tombés d'un coup sur ${visitees.length} : rien n'est noté en panne cette fois`);
    const compte = { visites: visitees.length, tombes: 0, revenus: 0, enPanne: 0, ignores: vues.length - visitees.length, nonVisites: fiches.length - vues.length, suspect, erreurs: 0 };
    // Les écritures une à une, pour ménager Notion.
    for (const fiche of visitees) {
      const resultat = resultats.get(fiche.id);
      let depuis = fiche.lienEnPanneDepuis || null;
      if (!(suspect && resultat.etat === 'panne' && !depuis)) {
        try {
          const note = await noter(fiche, resultat);
          depuis = note.depuis;
          if (note.change === 'tombe') compte.tombes += 1;
          if (note.change === 'revenu') compte.revenus += 1;
        } catch (err) {
          compte.erreurs += 1;
          journal('[liens] écriture impossible :', err.message);
        }
      }
      if (depuis) compte.enPanne += 1;
    }
    return compte;
  }

  return { visiter: visite, noter, verifierTous };
}

module.exports = { adresseInterdite, controler, visiter, creerLiens, AGENT };
