// ── German Word Pool ────────────────────────────────────────────────
// Wird benutzt, wenn der Wortgeber nicht rechtzeitig (45 s) ein Wort eingibt.
const WORDS = [
  // Kurze Woerter
  "ei","os","ab","an","da","du","er","es","ja","ob",
  "um","am","im","so","wo","au","oh","tu","zu","in",
  // 3‑4 Buchstaben
  "aal","bar","ehe","fee","gel","hut","ire","jet","kot","lob",
  "mut","not","ort","pik","rat","see","tag","uhr","wal","zoo",
  "auto","bahn","chip","dach","echo","fest","glas","haus","idee","jazz",
  "kalt","laut","mond","netz","obst","park","quiz","rund","sand","tier",
  "ufer","voll","wand","yoga","zeit","baum","bild","brot","dorf","esel",
  // 5‑6 Buchstaben
  "adler","birne","dampf","engel","farbe","geist","harfe","igeln","jubel","kerze",
  "lampe","mauer","nacht","offen","perle","regen","sonne","traum","umbau","vogel",
  "wolke","yacht","zebra","apfel","blitz","draht","ebene","fahrt","gabel","haben",
  "insel","jetzt","kampf","leben","markt","nudel","olive","pfeil","reise","stern",
  "tisch","unten","viele","woche","zucht","blume","braut","decke","feuer","gruen",
  "herde","irren","kiste","lehne","milch","nabel","opfer","platz","ratte","stoff",
  "turbo","vinyl","weich","ziege","antik","buero","chaos","diamant","donner",
  // 7‑9 Buchstaben
  "anfang","balkon","chemie","einzig","flugel","garten","herbst","kaffee","laufen",
  "mangel","orange","palast","rechts","silber","urlaub","winter","zufall","absatz",
  "brezel","dunkel","eltern","frosch","gurken","himmel","kirche","lachen","messer",
  "neblig","pflege","sauber","treppe","wetter","zahlen","bruecke","drachen","erdball",
  "flammen","goldene","hundert","kartell","laterne","monster","pfeffer","richter",
  "schrank","teppich","umstand","vorsatz","wachsen","zeitung","abgrund","blatter",
  "dreimal","eisberg","fenster","gitarre","kreativ","sammeln","tausend","vorhang",
  // 10+ Buchstaben
  "abenteuer","bernstein","dachboden","edelstein","feuerwehr","geburtstag","handschuh",
  "kartoffel","lavendel","marmelade","nachricht","orangerie","pantoffel","rucksack",
  "schmetterling","tagebuch","unterhose","verwandter","wasserfall","zauberstab",
  "achterbahn","bibliothek","drehteller","eisenbahn","flusspferd","gleitschirm",
  "halbinsel","konfiteure","leuchtturm","maulwurf","nachthemd","polizistin",
  "rolltreppe","sonnenuhr","taschenlampe","weihnachten","zahnbuerste","regenschirm",
  "staubsauger","briefkasten","kaffeemaschine","schokolade","wolkenkratzer",
  "fingerhut","blumenvase","einbahnstrasse","kirschbaum","butterblume",
  "zitroneneis","himbeermarmelade","fahrradkette","kuckucksuhr",
  // Richtig lange Woerter
  "donaudampfschifffahrt","kraftfahrzeughaftpflichtversicherung",
  "rindfleischetikettierungsueberwachungsaufgabenuebertragungsgesetz",
  "grundstuecksverkehrsgenehmigungszustaendigkeitsuebertragungsverordnung"
];

module.exports = WORDS;
