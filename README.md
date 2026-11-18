# Carnet de voyage — v1

Application web installable (PWA) pour centraliser ses lieux, les voir sur une carte
et les organiser librement dans ses journées. Fonctionne sur ordinateur et sur Android, sans compte,
sans serveur et sans frais.

## Ce que contient la v1

- **Mes voyages** : créer un voyage avec ses dates, ajouter des destinations, puis associer chaque date
  à une ou deux destinations (jour de transfert) dans le calendrier.
- **Espace d'une destination** : trois panneaux **PLACE | MAP | ORGANISATION**, affichables ou masquables
  indépendamment (boutons en haut). Sur ordinateur, les séparateurs se glissent pour redimensionner, et
  les largeurs sont mémorisées. Sur téléphone, les panneaux s'empilent avec la carte en haut.
- **PLACE** : les lieux sont rangés en volets par catégorie. Le volet se déplie pour lire la liste, et
  le **petit point** affiche ou masque la catégorie sur la carte. Chaque fiche montre la pastille
  « Lundi 30 » de sa journée, l'adresse (**un clic la copie**), un bouton **Ouvrir dans Maps**, les
  notes et le choix de la journée.
- **MAP** : la carte OpenStreetMap. L'icône du marqueur montre la catégorie et sa couleur montre la journée
  (blanc si le lieu n'est pas planifié). Un clic sur un marqueur ouvre la fiche. Pour ajouter un lieu à
  un endroit précis : **clic droit** sur ordinateur, **appui long** sur téléphone.
- **ORGANISATION** : chaque journée a sa couleur (modifiable) et son point d'affichage sur la carte,
  plus un point « Non planifiés ». On y range des lieux et des **notes libres** (ex. « Train 10h → 12h »)
  dans l'ordre voulu, avec une **heure facultative**.
- **Glisser-déposer** : de PLACE vers une journée, d'une journée à l'autre, ou d'une journée vers PLACE
  pour la retirer. Sur téléphone, il faut un appui long, et le menu « Non planifié / Lundi 30… » de la
  fiche reste une alternative.
- **Hors connexion** : toutes les données restent sur l'appareil. Le bouton **⤓** télécharge la carte de
  la destination.
- **Sauvegarde** : export et import d'un fichier depuis l'accueil.

Règles appliquées : un lieu n'existe qu'une seule fois et ne peut être que dans une journée à la fois.
Un hébergement non planifié reste toujours visible sur la carte, sauf si sa catégorie est masquée.

## Mettre l'application en ligne sur GitHub Pages (gratuit, sans rien installer)

1. Crée un compte sur github.com si tu n'en as pas.
2. Crée un **nouveau dépôt public** (bouton « New repository »), par exemple `carnet-voyage`.
3. Dans le dépôt, clique sur **« uploading an existing file »**, puis glisse **tout le contenu** du
   dossier (`index.html`, `styles.css`, `sw.js`, `manifest.webmanifest`, `.nojekyll`, et les dossiers
   `js` et `icons`), puis valide avec **Commit changes**.
   Le fichier `serve.ps1` et le dossier `.claude` ne servent qu'aux tests sur le PC, inutile de les envoyer.
4. Va dans **Settings → Pages**. Dans « Build and deployment », choisis **Deploy from a branch**, la
   branche **main** et le dossier **/ (root)**, puis enregistre.
5. Après une à deux minutes, l'application est disponible à l'adresse
   `https://<ton-pseudo>.github.io/carnet-voyage/`.

Le code est public, mais **tes données ne le sont jamais** : elles restent dans le navigateur de chaque appareil.

### Pour une mise à jour

Renvoie les fichiers modifiés de la même façon (« Add file → Upload files »). Quand tu modifies des
fichiers, change aussi `VERSION` en haut de `sw.js` (`'v1'` → `'v2'`) pour que les téléphones récupèrent
la nouvelle version.

## Préparer sur l'ordinateur, partir avec le téléphone

1. Sur l'ordinateur, ouvre l'adresse GitHub Pages, puis crée ton voyage et tes lieux.
2. À l'accueil, clique sur **Exporter mes données** pour obtenir un fichier `carnet-voyage-AAAA-MM-JJ.json`.
3. Envoie ce fichier sur le téléphone (par mail, Google Drive, câble…).
4. Sur le téléphone, ouvre la même adresse dans Chrome, puis menu **⋮ → Ajouter à l'écran d'accueil** pour
   installer l'application.
5. Dans l'application, à l'accueil, utilise **Importer un fichier** et choisis le fichier. Attention :
   l'import **remplace** les données du téléphone.
6. **Avec le Wi-Fi, avant de partir** : ouvre la destination, affiche la carte, appuie sur **⤓**, puis sur
   **Télécharger cette zone**.
7. Pour vérifier : passe le téléphone en mode avion et rouvre l'application.

Si tu modifies ensuite sur l'ordinateur, refais l'export et l'import (l'import remplace tout). Sur place,
le plus simple est de ne modifier que sur le téléphone.

## Tester sur le PC

```
powershell -ExecutionPolicy Bypass -File serve.ps1
```
Puis ouvre http://localhost:5173. Les données de cette adresse sont distinctes de celles de la version
GitHub Pages.

## Choix techniques

| Besoin | Choix | Coût |
|---|---|---|
| Interface | HTML + JavaScript, Preact/htm chargé depuis un CDN, aucune étape de compilation | 0 € |
| Carte | MapLibre GL + tuiles vectorielles **OpenFreeMap** (données OpenStreetMap), sans clé ni limite annoncée | 0 € |
| Carte hors connexion | Tuiles de la zone (zoom 0–14) mises en cache par le service worker (`sw.js`) | 0 € |
| Données | IndexedDB du navigateur, avec un export/import JSON | 0 € |
| Recherche d'adresse | Nominatim (OpenStreetMap), en ligne uniquement, déclenchée à la demande | 0 € |
| Glisser-déposer | SortableJS (souris et tactile) | 0 € |

Organisation du code (`js/`) : `store.js` (données et actions), `app.js` (accueil, voyage, calendrier),
`workspace.js` (les trois panneaux), `place-panel.js`, `map-panel.js`, `orga-panel.js`, `place-form.js`,
`offline.js`, `geo.js`, `dnd.js`, `ui.js`, `util.js`.

## Limites connues de la v1

- Pas de synchronisation automatique entre appareils : on passe par l'export et l'import.
- Les préférences d'affichage et la carte téléchargée sont propres à chaque appareil, elles ne sont pas exportées.
- La recherche d'adresse ne trouve pas tous les restaurants. On peut toujours placer le lieu à la main
  sur la carte.
- La vue satellite (imagerie Esri World Imagery) ne fonctionne qu'avec une connexion et n'est pas téléchargée
  pour le hors connexion. Elle est utilisée sans clé, pour un usage personnel ; un usage public ou commercial
  demanderait un compte ArcGIS (gratuit jusqu'à un certain volume).
- Les noms des rues de la carte s'affichent selon les données OpenStreetMap (souvent en grec et en anglais).
