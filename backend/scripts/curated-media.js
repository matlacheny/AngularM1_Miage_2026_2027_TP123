/*
 * Médias de démonstration vérifiés à la main (fichiers Wikimedia Commons).
 *
 * La recherche texte de Commons par nom de véhicule renvoie aussi des
 * homonymes : « Westland Lynx » donne des lynx, « Fairchild A-10 Thunderbolt II »
 * un phacochère (warthog, surnom de l'A-10)… Ces listes servent à seed.js et à
 * repair-media.js. `vehicle` est le nom exact de la fiche, ou une recherche
 * Wikipédia pour une fiche à créer (NEW_VEHICLES).
 */

/** Fiches absentes de la base de démonstration : recherche Wikipédia → nom attendu de la fiche. */
export const NEW_VEHICLES = [
  { query: "EBRC Jaguar", name: "Engin blindé de reconnaissance et de combat" },
  { query: "Centurion (char)", name: "Centurion (char)" },
];

/** Médias importés par erreur (nom d'origine) : supprimés avec leurs posts. */
export const WRONG_MEDIA = [
  "Caracal Caracal-001.jpg", // un caracal (félin)
  "Lynx kitten.jpg", // un lynx (félin)
  "Lynx lynx-4.JPG",
  "Amur Leopard Pittsburgh Zoo.jpg", // un léopard
  "Southern warthog (Phacochoerus africanus sundevallii) male.jpg", // un phacochère
  "Skull of crocodile (Crocodylidae).jpg", // « Krokodil », surnom du Mi-24
  "Beijing Castle Boxer Rebellion 1900 FINAL.jpg", // révolte des Boxers
  "Stryker Depot.jpg", // une gare
  "Defense.gov News Photo 120723-F-HA794-089 - A U.S. Air Force firefighter sprays water at the fire of a simulated C-130 Hercules plane crash during operational readiness exercise Beverly.jpg", // un pompier, pas d'avion
  "Dassault Mirage F2.jpg", // un autre avion que le Mirage III
  "Atlantic Hurricane Wind Speed Plots (SVS5072 - atlantic jan to dec years 001).webm", // météo
  "Atlantic Hurricane Wind Speed Plots (SVS5072 - atlantic may to dec years 001).webm",
  "Tasnim News Agency - Meraj 532 loitering munition.webm", // un drone, pas un Cougar
  "F-35 Lightning II fighter jet hit over Iran 2026.webm", // revendication invérifiable
  "Axalp 08.webm", // meeting aérien, Alouette III non identifiable
];

/**
 * Vidéos proposées par more-media et écartées à la relecture (jamais importées) :
 * autre appareil, maquette, clip musical, images de combat ou titre racoleur.
 */
export const REJECTED_VIDEOS = [
  "youtube-qlw3FNOU4iU.mp4", // Mirage III : un autre prototype franco-allemand
  "youtube--xiwgBdWPL4.mp4", // Mirage III : un Mirage 2000
  "youtube-0yNWzVUDVQ0.mp4", // Mirage III : un Mirage 2000
  "youtube-pVgSlaNXHeg.mp4", // Mirage III : un Mirage 2000
  "youtube-69HBWTQ1ay8.mp4", // Mirage III : un Mirage F1
  "youtube-1mk3In59980.mp4", // Mystère IV : maquette en papier
  "youtube-Tb6zedWfHeg.mp4", // Mystère IV : combat aérien non sourcé
  "youtube-_xvzI6AcYHs.mp4", // F-14 : clip musical
  "youtube-q-afVWj9pC8.mp4", // F-14 : clip musical
  "youtube-W16JVh40npM.mp4", // Challenger 2 : titre racoleur, combat invérifiable
  "youtube-8w413NsaxvQ.mp4", // Challenger 2 : titre racoleur, combat invérifiable
  "youtube-Q7FUjVHx46c.mp4", // Leopard 2 : images de combat
  "youtube-SY-w6Dbil04.mp4", // T-90 : un M2 Bradley, images de combat
  "youtube-La4D4e7-fK8.mp4", // Challenger 2 : sujet sur le Challenger 3
  "Navio brasileiro ajuda nas buscas por avião chileno.webm", // C-130 : un navire
  "Improved Ribbon Bridge built by 341st Engineer General Service Regiment (11-06-2018).webm", // M2 Bradley : un pont flottant
  "POTUS announces 21 brand new F-15EX Eagle II Fighter Jets..webm", // F-15 : annonce politique
  "Mig29 west downing drone.webm", // MiG-29 : images de combat
  "На Київщині прикордонники, спільно із побратимами зі ЗС України, дістали на сушу вертоліт рашистів.webm", // Mi-24 : une épave
  "Berita Film di Djawa nr. 18.webm", // A6M : actualités sans Zero identifiable
];

/** Médias corrects mais rattachés à la mauvaise fiche. */
export const RETAGGED_MEDIA = [
  // EBRC Jaguar (2010-), pas le Panhard EBR (1950).
  { file: "EBRC Jaguar (5).jpg", vehicle: "Engin blindé de reconnaissance et de combat" },
];

/** Photos vérifiées (propriété Wikidata « dépeint », puis contrôle visuel). */
export const IMAGES = [
  { file: "File:Mirage III A 01 au Bourget.jpg", vehicle: "Dassault Mirage III" },
  { file: "File:Breguet Br.1150 Atlantic '61+14'.jpg", vehicle: "Breguet Atlantic" },
  { file: "File:French Navy Atlantique 31 Departure Fairford 87.jpg", vehicle: "Breguet Atlantic" },
  { file: "File:ET-670 AS-532 UL Cougar UME SCQ.jpg", vehicle: "Aérospatiale AS532 Cougar" },
  { file: "File:U15 Super Cougar - Operação Aderex-Anfíbia 2022 (52214792345).jpg", vehicle: "Airbus Helicopters H225M Caracal" },
  { file: "File:USAF F-35A Lightning II Landing.jpg", vehicle: "Lockheed Martin F-35 Lightning II" },
  { file: "File:A-10A SN 75-0270 GAU-8.jpg", vehicle: "Fairchild A-10 Thunderbolt II" },
  { file: "File:C-130 Hercules - HAF 747 - Elefsina.jpg", vehicle: "Lockheed C-130 Hercules" },
  { file: "File:UA M1126 Stryker infantry carrier vehicle.jpg", vehicle: "Stryker" },
  { file: "File:British Lynx landing on Kearsarge.jpg", vehicle: "Westland Lynx" },
  { file: "File:British Army Westland WG-13 Lynx AH7 ZX616 Royal International Air Tattoo 2024 01.jpg", vehicle: "Westland Lynx" },
  { file: "File:Leopard 2 A7.JPG", vehicle: "Leopard 2" },
  { file: "File:GTK Boxer side.jpg", vehicle: "Boxer (véhicule)" },
  { file: "File:Czech Mi-24 CIAF.JPG", vehicle: "Mil Mi-24" },
];

/** Enregistrements vérifiés (description Commons) : Work With Sounds, Beeld en Geluid… */
export const SOUNDS = [
  { file: "File:WWS SaabJ35DDraken8211passingtwotimes.ogg", vehicle: "Saab 35 Draken", title: "Saab 35 Draken : deux passages" },
  { file: "File:WWS SaabJ35DDrakenstartengineandtaxiing.ogg", vehicle: "Saab 35 Draken", title: "Saab 35 Draken : démarrage et roulage" },
  { file: "File:Spitfire fly past at RAF Halton.ogg", vehicle: "Supermarine Spitfire", title: "Spitfire : passage à RAF Halton" },
  { file: "File:Chinook helicopter flying over Greenwich in London.ogg", vehicle: "Boeing CH-47 Chinook", title: "Chinook au-dessus de Greenwich" },
  { file: "File:Bell 212 OE-XAA.ogg", vehicle: "Bell UH-1 Iroquois", title: "Bell 212 (famille UH-1) : le claquement des pales" },
  { file: "File:Wendbaarheid demonstratie van een F16 - SoundCloud - Beeld en Geluid.ogg", vehicle: "General Dynamics F-16 Fighting Falcon", title: "F-16 : démonstration de maniabilité" },
  { file: "File:Sherman tank, starten en rijden - SoundCloud - Beeld en Geluid.ogg", vehicle: "M4 Sherman", title: "Sherman : démarrage et départ" },
  { file: "File:Sherman tank, met grote snelheid rijden - SoundCloud - Beeld en Geluid.ogg", vehicle: "M4 Sherman", title: "Sherman à pleine vitesse" },
  { file: "File:Het rijden van een colonne Sherman tanks - SoundCloud - Beeld en Geluid.ogg", vehicle: "M4 Sherman", title: "Colonne de Sherman" },
  { file: "File:Centurion tank, aankomen, stationair en stoppen - SoundCloud - Beeld en Geluid.ogg", vehicle: "Centurion (char)", title: "Centurion : arrivée, ralenti et arrêt" },
  { file: "File:Centurion tank, stationair, pompen en afschakelen - SoundCloud - Beeld en Geluid.ogg", vehicle: "Centurion (char)", title: "Centurion : ralenti et coupure moteur" },
  { file: "File:Centurion tank, rijden, klimmen en stoppen - SoundCloud - Beeld en Geluid.ogg", vehicle: "Centurion (char)", title: "Centurion : roulage et montée" },
];

/**
 * Sons Freesound vérifiés à la main (titre et description), licences CC0 ou CC BY
 * uniquement. Écartés : homonymes (vagues « Atlantic », Renault Duster…), sons
 * extraits de vidéos YouTube, enregistrements mêlant plusieurs appareils.
 * Nécessite FREESOUND_API_KEY dans backend/.env.
 */
export const FREESOUND_SOUNDS = [
  { id: 827548, vehicle: "Dassault Rafale", title: "Rafale : démonstration aux NATO Days 2025" },
  { id: 523295, vehicle: "Dassault Mirage 2000", title: "Mirage 2000 : passage de nuit à basse altitude" },
  { id: 747799, vehicle: "Dassault Breguet / Dornier Alpha Jet", title: "Alpha Jet : défilé du 14 Juillet" },
  { id: 702456, vehicle: "AMX-13", title: "AMX-13 : moteur" },
  { id: 343746, vehicle: "General Dynamics F-16 Fighting Falcon", title: "Deux F-16 néerlandais au décollage" },
  { id: 199272, vehicle: "McDonnell Douglas F-15 Eagle", title: "F-15 : décollage (binaural)" },
  { id: 221666, vehicle: "McDonnell Douglas F-15 Eagle", title: "F-15 : décollage avec postcombustion" },
  { id: 817465, vehicle: "McDonnell Douglas F-15 Eagle", title: "Passage rapide de F-15 Eagle" },
  { id: 733117, vehicle: "McDonnell Douglas F/A-18 Hornet", title: "F/A-18 : passage au Grand Prix de Long Beach" },
  { id: 515947, vehicle: "Lockheed Martin F-35 Lightning II", title: "Quatre F-35 au-dessus d'une ville" },
  { id: 81214, vehicle: "Lockheed C-130 Hercules", title: "Deux C-130 Hercules en vol" },
  { id: 239918, vehicle: "Lockheed C-130 Hercules", title: "C-130 : passage des turbopropulseurs" },
  { id: 434288, vehicle: "Boeing CH-47 Chinook", title: "Chinook CH-47 à haute altitude" },
  { id: 640504, vehicle: "Eurofighter Typhoon", title: "Eurofighter : passage à moyenne distance" },
  { id: 640502, vehicle: "Eurofighter Typhoon", title: "Eurofighter : manœuvre en meeting" },
  { id: 162242, vehicle: "Eurofighter Typhoon", title: "Eurofighter : allumage de la postcombustion" },
  { id: 142901, vehicle: "Supermarine Spitfire", title: "Deux Spitfire en passage" },
  { id: 700584, vehicle: "Supermarine Spitfire", title: "Spitfire au-dessus des falaises de Douvres" },
  { id: 143558, vehicle: "Messerschmitt Bf 109", title: "Bf 109 E-3 : passage" },
  { id: 142898, vehicle: "Messerschmitt Bf 109", title: "Bf 109 : point fixe du Daimler-Benz" },
  { id: 143562, vehicle: "Focke-Wulf Fw 190", title: "Fw 190 A-5 : passage à basse altitude" },
  { id: 143556, vehicle: "Focke-Wulf Fw 190", title: "Fw 190 A-5 : roulage" },
  { id: 143561, vehicle: "North American P-51 Mustang", title: "P-51 Mustang : décollage" },
  { id: 437907, vehicle: "North American F-86 Sabre", title: "F-86 Sabre : passage rapide" },
  { id: 437873, vehicle: "North American F-86 Sabre", title: "Deux F-86 Sabre au décollage" },
  // Ajouts du 16/10 : titre et description relus un par un (homonymes et enregistrements mêlant plusieurs appareils écartés).
  { id: 324751, vehicle: "Avro Vulcan", title: "Vulcan : passage lors de son dernier vol" },
  { id: 435676, vehicle: "Aérospatiale AS532 Cougar", title: "Quatre Cougar néerlandais au-dessus de Waalre" },
  { id: 162247, vehicle: "BAe Hawk", title: "Hawk des Red Arrows : passage bas à Farnborough" },
  { id: 105222, vehicle: "BAe Hawk", title: "Deux Hawk : roulage et décollage" },
  { id: 437931, vehicle: "Boeing B-52 Stratofortress", title: "B-52 : passage tout près" },
  { id: 437930, vehicle: "Boeing B-52 Stratofortress", title: "B-52 : passage" },
  { id: 104883, vehicle: "McDonnell Douglas F-4 Phantom II", title: "F-4 Phantom : roulage, point fixe et décollage en postcombustion" },
  { id: 64490, vehicle: "Panavia Tornado", title: "Tornado de la RAF : passage au loin" },
  { id: 349871, vehicle: "Panavia Tornado", title: "Tornado : vol à basse altitude au-dessus du Brandebourg" },
  { id: 274369, vehicle: "Saab JAS 39 Gripen", title: "Gripen sud-africain : passage" },
  { id: 274302, vehicle: "Saab JAS 39 Gripen", title: "Gripen : bombardement simulé à Swartkops" },
  { id: 161895, vehicle: "Leopard 2", title: "Leopard 2A4 : moteur au ralenti" },
  { id: 161878, vehicle: "Leopard 2", title: "Leopard 2 : passage tout près, changements de vitesse" },
];

/**
 * Bandes son de vidéos Commons (meetings, défilés) : le son est extrait avec ffmpeg
 * (FFMPEG_PATH, ou ffmpeg dans le PATH). Écartées : maquettes, montages promotionnels
 * en musique, vols mêlant plusieurs appareils, revendications de guerre invérifiables.
 */
export const VIDEO_SOUNDS = [
  { file: "File:Défilé du 14 juillet-le Mirage F1 tire sa révérence.webmsd.webm", vehicle: "Dassault Mirage F1", title: "Mirage F1 : dernier défilé du 14 Juillet (2014)" },
  { file: "File:Patrouille de France Demonstration.webm", vehicle: "Dassault Breguet / Dornier Alpha Jet", title: "Alpha Jet : Patrouille de France en démonstration" },
  { file: "File:Eurofighter 9803.ogv", vehicle: "Eurofighter Typhoon", title: "Eurofighter Typhoon en vol" },
  { file: "File:Eurofighter EF2000, AMI No.161, Paris Air Show 2009.ogv", vehicle: "Eurofighter Typhoon", title: "Eurofighter italien au Bourget 2009" },
  { file: "File:EuroFighter Typhoon Take-Off, Paris Air Show 2009.ogv", vehicle: "Eurofighter Typhoon", title: "Eurofighter : décollage au Bourget 2009" },
  { file: "File:Eurofighter Typhoon display at ILA Berlin Air Show 2012.ogv", vehicle: "Eurofighter Typhoon", title: "Eurofighter : démonstration à l'ILA Berlin 2012" },
  { file: "File:English Riviera Airshow 2025 PXL 003.webm", vehicle: "Eurofighter Typhoon", title: "Eurofighter à l'English Riviera Airshow 2025" },
  { file: "File:Spitfire G-AWGB landing at Biggin Hill airfield.webm", vehicle: "Supermarine Spitfire", title: "Spitfire : atterrissage à Biggin Hill" },
];
