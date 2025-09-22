// src/topicRules.js (scored version, refined)
// Robust, order-insensitive topic inference tuned for sparse rows.
// Call: inferTopic({ authors?, title?, url?, venue?, year? }) OR inferTopic("plain text")
// Scoring-based classifier (journals>keywords>authors>DOI), tie-breakers, and an explainTopic helper.

/* ----------------------------------------------------------------------
 * 1) Categories (kept stable for your dashboard)
 * -------------------------------------------------------------------- */
export const TOPIC_CATEGORIES = [
  "Public & Community Health",
  "General/Family Medicine",
  "Neurology & Neuroscience",
  "Rheumatology & Immunology",
  "Oncology & Hematology",
  "Cardiology",
  "Gastroenterology & Hepatology",
  "Obstetrics, Gynecology & Reproductive Health",
  "Pediatrics & Child Health",
  "Dermatology",
  "Surgery & Anesthesia",
  "Radiology & Imaging",
  "Infectious Disease & Microbiology",
  "Genetics & Genomics",
  "Nutrition, Physiology & Biomechanics",
  "History, Ethics & Humanities",
  // Specialty expansions seen in your corpus
  "Respiratory & Pulmonology",
  "Nephrology & Urology",
  "Psychiatry & Mental Health",
  "Emergency & Critical Care",
  "Orthopedics & Sports Medicine",
  "Endocrinology & Diabetes",
  "Ophthalmology & ENT",
  "Pharmacy & Pharmacology",
  "Dental & Oral Health",
  "Health Services & Policy",
  "AI, Data Science & Methods",
  "Occupational & Environmental Health",
  "Other",
];

/* ----------------------------------------------------------------------
 * 2) Normalization
 * -------------------------------------------------------------------- */
const DOI_RE = /(10\.[0-9]{4,9}\/[\w.()/:;#?=&%+-]+)/i;
const lc = (s) => (s ?? "").toString().toLowerCase();
const clean = (s) =>
  lc(s)
    .replace(/https?:\/\/(qe2a-[^/]+|library-proxy\.[^/]+)\/login\?url=/g, "")
    .replace(/https?:\/\/(dx\.)?doi\.org\//g, "")
    .replace(/^https?:\/\//g, "")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

function tokensFromInput(input) {
  if (!input) return { hay: "", doiPrefix: "", authors: "" };

  let url = "", extra = "", authors = "";
  if (typeof input === "string") {
    const mUrlOrDoi = input.match(/https?:\/\/\S+|10\.[0-9]{4,9}\/\S+/i);
    if (mUrlOrDoi) url = mUrlOrDoi[0];
    const looksLikeAuthors = /[A-Za-z\-\.’'` ]+,[^.\n]+/.test(input);
    if (looksLikeAuthors) authors = input;
    else extra = input;
  } else if (typeof input === "object") {
    url = input.url || "";
    authors = input.authors || "";
    extra = [input.title, input.venue].filter(Boolean).join(" ");
  }

  const s = clean(url);
  const hay = [s, lc(extra), lc(authors)].filter(Boolean).join(" ").trim();

  const doi = (hay.match(DOI_RE) || [null, ""])[1];
  const doiPrefix = doi ? doi.split("/")[0].toLowerCase() : "";

  return { hay, doiPrefix, authors: lc(authors) };
}

/* ----------------------------------------------------------------------
 * 3) Rules (regex → category) with weights
 *    Weights: journals=3, keywords=2, authors=2, doi=1
 * -------------------------------------------------------------------- */
const W = { J: 3, K: 2, A: 2, D: 1 };
const MIN_CONFIDENCE = 2; // <2 → "Other" (e.g., DOI-only)

/** ---------------- Journal / path tokens (HIGH PRECISION) ---------------- **/
const TOKENS = [
  // Public/community & general venues
  [/\b(jamanetworkopen|bmjebm|bmcpublichealth|publichealth|pgph|s41997-)\b/, "Public & Community Health"],
  [/(bmjopen|plosone|journal\.pone|jmir|medrxiv|researchsquare)\b/, "Public & Community Health"],
  // FIX: proper match for "Healthcare (Basel)"
  [/\bhealthcare\s*$begin:math:text$basel$end:math:text$\b/, "Health Services & Policy"],
  [/\bfrontiers\s+in\s+digital\s+health\b/, "AI, Data Science & Methods"],
  [/\bcanadian\s+task\s+force\s+on\s+preventive\s+health\s+care\b/, "Public & Community Health"],
  [/\bcureus\b/, "Public & Community Health"],

  [/(health\s*policy|health\s*services|population\s*health|implementation\s*science|quality\s*improvement)/, "Health Services & Policy"],

  [/(cmajopen|cmajo\b|\bcmaj\b|cfp\.|canadianfamilyphysician|fampra|familypractice|cjrm\b|rrh\.org\.au|rural\s+health)/, "General/Family Medicine"],

  [/(\bcjn\b|fnins|fncel|fneur|\bejn\b|jneurosci|expneurol|\bnbd\b|\bbrain\b|\bstroke\b|parkinson|epilep|alzheim|dementi|auditory\s+cortex|auditory\s+evoked|electroencephalograph(y)?|^eeg\b|meg|erp\b|huntington\s+disease)/, "Neurology & Neuroscience"],

  [/(\bjrheum\b|rheumat|\bacr\.|spondylo|ankylos|psoriatic\s+arthritis)/, "Rheumatology & Immunology"],

  [/(curroncol|oncolog|cancer|hematol|\bclml\b|\bjco\b|\bijc\b|annalsofsurgicaloncology|s10434-|lymphedema)/, "Oncology & Hematology"],

  [/(\bcjca\b|canadian\s+journal\s+of\s+cardiology|\bcirculation\b|\bheart\b|\bhrthm\b|arrhythm|cardio|myocard|atrial\s+fibrillation|heart\s+failure)/, "Cardiology"],

  [/(j\.gastro|gastroenterology|\bgastro\b|\bhepatology\b|\bctg\b|\bibd\b|\bjcag\b|crohn|colitis|\bliver\b|colonoscopy|bowel\s+(prep|cleans))/, "Gastroenterology & Hepatology"],

  [/(\bjogc\b|\bijgo\b|obstet|gynecol|reprod|perinatal|maternal|neonat|pregnan|contracept|fertility|vulvodynia|midwif(e|ery)|home\s*birth)/, "Obstetrics, Gynecology & Reproductive Health"],

  [/(pch\/|paediatrics? ?& ?child|jamapediatrics|\bfped\b|pediatr|adolesc|kawasaki\s+disease|ankyloglossia|frenotomy|tongue-?\s*tie|autis)/, "Pediatrics & Child Health"],

  [/(\bjaad\b|dermatol|hidradenitis|psoriasis|eczema|atopic\s+dermatitis|skin\s+ulcer)/, "Dermatology"],

  [/(\bcjs\b|\bsurg\b|anesth|\bcjane\b|canadianjournalofanesthesia|peri-?operative|\bjvscit\b|operative)/, "Surgery & Anesthesia"],

  // tightened: avoid lone "imaging"
  [/(\bajnr\b|\bradiol\b|diagnostic\s+imaging|medical\s+imaging|ultrasound|\bct\b|\bmri\b|tomograph|pet\/?ct|spect|pacs\b|picture\s+archiving)/, "Radiology & Imaging"],

  [/(\bjammi\b|microbiol|virol|virus(es)?|infect|\/cid\/|\bijid\b|antimicrob|\bsepsis\b|covid|sars-?cov-?2|influenza|\bhiv\b|hepatitis|\btb\b|tubercul|arbovir|vector-?borne|mosquito|enteric\s+diseases?)/, "Infectious Disease & Microbiology"],

  [/(\bgenes\b|genom|genet|\bhmg\/\b|humanmolgenet|\bjmg\b|\bhumu\b|variant|mutation|exome|gwas|polygenic|lynch\s+syndrome|brca\b|22q11\.2|y\s+chromosome|rare\s+disease)/, "Genetics & Genomics"],

  [/(\btjnut\b|\bnutrition\b|\bfphys\b|physiol|\bjbiomech\b|gaitpost|\bcbpb\b|biomech|metabol|\bexercise\b|obesity|physical\s+activity|motion\s+capture|imu\b|intervertebral|kinematics|calf\s+circumference|bone\s+mineral\s+density|ghrelin|peptide\s+yy)/, "Nutrition, Physiology & Biomechanics"],

  [/(\bcjhh\b|\bmous\.|bioethics|ethic(s)?\b|history\s+of\s+medicine|medical\s+humanities|privacy|consent|photograph(s)?\b)/, "History, Ethics & Humanities"],

  [/(\bthorax\b|\berj\b|european\s+respiratory\s+journal|\bchest\b|respirology|atsjournals|american\s+journal\s+of\s+respiratory|\bcopd\b|\basthma\b|airway|pulmon|oxygen\s+concentrator|acute\s+lung\s+injury\b)/, "Respiratory & Pulmonology"],

  [/(kidney\s+international|\bjasn\b|nephrol|urology|\burol\b|dialysis|hemodialysis|\bckd\b|\baki\b|\besrd\b)/, "Nephrology & Urology"],

  [/(psychiat|depress|anxiet|suicid|mental\s+health|addict|substance\s+use|psycholog|electroconvulsive|ect\b|stimulant|overdose|methamphetamine|cocaine|fentanyl|supervised\s+consumption|harm\s+reduction)/, "Psychiatry & Mental Health"],

  [/(annals\s+of\s+emergency\s+medicine|\bacem\b|\bjcem\b|intensive\s+care|critical\s+care|\bicu\b|trauma|prehospital|emergency\s+medicine)/, "Emergency & Critical Care"],

  [/(orthop|bone\s*&?\s*joint|arthro|sports\s+med|\bacl\b|meniscus|rotator\s+cuff|musculoskeletal|ergonom|spine|lumbar|low\s+back\s+pain|\blbp\b|posture)/, "Orthopedics & Sports Medicine"],

  [/(diabetes\s+care|diabetolog|endocrinolog|insulin|glycemic|thyroid|pituitar)/, "Endocrinology & Diabetes"],

  [/(ophthalmolog|retina|glaucoma|cornea|ocular|otolaryngology|head\s*&\s*neck\s*surgery|laryngoscope|\bent\b|hearing|otology|auditory\s+processing)/, "Ophthalmology & ENT"],

  [/(pharmac(y|ol)|medication|drug\s+safety|adverse\s+event|antibiotic\s+stewardship|prescrib)/, "Pharmacy & Pharmacology"],

  [/(dent(al|istry)|oral\s+health|periodont|endodont|prosthodont|caries)/, "Dental & Oral Health"],

  // Methods / ML
  [/(machine\s*learning|deep\s*learning|artificial\s+intelligence|\bnlp\b|natural\s+language|predictive\s+model|algorithm|validation\s+cohort|propensity\s+score|time\s+series|segmentation|classification|response-?adaptive\s+design|bandit|markov\s+decision\s+process|adaptive\s+trial|optimal\s+allocation|power\s+calculation)/, "AI, Data Science & Methods"],

  // Public & Community Health / Environmental
  [/\b(circular\s+economy|climate\s+change|environmental\s+contaminants?|soil\s+contamination|waste\s+management|landfill|pollutants?|ecological|ecohealth|environmental\s+health|noise\s+exposure|hearing\s+conservation|water\s+insecurity)\b/, "Occupational & Environmental Health"],

  // Cannabis / substance use
  [/\bcannabis|marijuana|opioid|safer\s+opioid\s+supply|substance\s+use|drug\s+policy|drug\s+use|dispensar(y|ies)|retailer(s)?\b/, "Psychiatry & Mental Health"],

  // Food / nutrition environment
  [/\b(food\s+marketing|food\s+environments?|beverage\s+consumption|sugar-?sweetened\s+beverage|breastfeed(ing)?|infant\s+feeding|food\s+security|food\s+insecurity|nutrition\s+literacy|dietary\s+patterns|food\s+affordability|nutritious\s+food\s+basket|baby-?led\s+weaning|formula-?feed(ing)?)\b/, "Nutrition, Physiology & Biomechanics"],

  // Patient engagement / medical education / IMG
  [/\b(patient\s+engagement|reflection-?on-?practice|medical\s+education|virtual\s+care|simulation\s+fidelity|training\s+module|continuing\s+professional\s+development|international\s+medical\s+graduates?|img\b|interprofessional\s+education|service-?learning)\b/, "Health Services & Policy"],

  // Workplace / maritime / injury
  [/\b(seafarer|maritime\s+labour|workplace\s+injur(y|ies)|return\s+to\s+work|occupational\s+health|occupational\s+safety|fishing\s+health\s+and\s+safety|fish\s+harvesters?)\b/, "Occupational & Environmental Health"],

  // Public & Community Health / Health Services & Policy (extra venues)
  [/\b(cjph|canadian\s+journal\s+of\s+public\s+health|lancet\s+public\s+health|plos\s+global\s+public\s+health|bmj\s+open)\b/, "Public & Community Health"],
  [/\b(harm\s+reduction\s+journal|int(ernational)?\s+journal\s+on\s+drug\s+policy|drug\s+and\s+alcohol\s+depend(e|a)nce(\s+reports)?|alcohol\s+and\s+alcoholism|journal\s+of\s+substance\s+use\s+and\s+addiction\s+treatment)\b/, "Psychiatry & Mental Health"],
  [/\b(new\s+solutions:\s*a\s+journal\s+of\s+environmental\s+and\s+occupational\s+health\s+policy|ecohealth|journal\s+of\s+environmental\s+management|waste\s+management\s+bulletin|environmental\s+science\s+and\s+pollution\s+research)\b/, "Public & Community Health"],

  // Cardiology (extra)
  [/\bheart\s*rhythm|cjc\s*open\b/, "Cardiology"],

  // Genetics & Genomics (extra)
  [/\borphanet\s+journal\s+of\s+rare\s+diseases|journal\s+of\s+medical\s+genetics\b/, "Genetics & Genomics"],

  // OB/Gyn (extra)
  [/\binternational\s+journal\s+of\s+gynecological\s+cancer|ajog\s+glob(?!\w)\b/, "Obstetrics, Gynecology & Reproductive Health"],

  // Sleep (Respiratory)
  [/\bnature\s+and\s+science\s+of\s+sleep|sleep\s+science\s*&\s*practice\b/, "Respiratory & Pulmonology"],

  // Nutrition / Physiology (venue)
  [/\bapplied\s+physiology,\s*nutrition\s*&\s*metabolism\b/, "Nutrition, Physiology & Biomechanics"],

  // Methods / Evidence synthesis
  [/\bjbi\s+evidence\s+synthesis\b/, "AI, Data Science & Methods"],

  // Emergency & Critical Care (venue)
  [/\bcanadian\s+journal\s+of\s+emergency\s+medicine\b/, "Emergency & Critical Care"],

  // Preventive screening / Task Force
  [/\b(task\s*force\s+on\s+preventive\s+health\s+care|screening\s+for\s+(hypertension|chlamydia|gonorrhea|smoking\s+cessation)|preventive\s+screening)\b/, "General/Family Medicine"],

  // Health systems / decision-making
  [/\b(evidence-?based\s+decision|health\s+technology\s+assessment|spor\s+evidence\s+alliance|appropriateness\s+of\s+care|overuse\s+in\s+healthcare|learning\s+healthcare\s+system|health\s+system\s+profile)\b/, "Health Services & Policy"],

  // Nutrition screeners
  [/\b(hefi-?2019|healthy\s+eating\s+food\s+index|eating\s+practices\s+screener|canadian\s+food\s+guide)\b/, "Nutrition, Physiology & Biomechanics"],

  // Music / cognition
  [/\b(musical\s+training|super\s+mario|piano|oculomotor|speech-?in-?noise|rhythm\s+and\s+meter|auditory\s+memory)\b/, "Neurology & Neuroscience"],

  // Refugee / immigrant
  [/\b(refugee|immigrant|migrant|resettlement|asylum)\b/, "Public & Community Health"],

  // Critical / participatory / pedagogy
  [/\b(photovoice|arts?-?based\s+knowledge|feminist\s+participatory|food\s+pedagogy|microaggression|qualitative\s+(synthesis|health\s+research)|critical\s+(interpretive|analysis))\b/, "History, Ethics & Humanities"],

  // Occupational/environmental specifics
  [/\b(uranium\s+(mining|exploration)|nano-?\s*plastics|microplastics|soil\s+contaminants?|arsenic\s+contamination)\b/, "Occupational & Environmental Health"],

  // Radiology & Imaging / Utilization
  [/\baudit\s+and\s+feedback\b.*(imaging|diagnostic\s+imaging|ordering)/, "Radiology & Imaging"],
  [/\bdiagnostic\s+image\s+ordering\b/, "Radiology & Imaging"],

  // Health Services & Policy (education / workforce)
  [/\bfamily\s+practice\s+nurs(ing|e)\b|registered\s+nurses?\s+in\s+primary\s+care\b/, "Health Services & Policy"],
  [/\b(interprofessional\s+collaborator\s+assessment\s+rubric|icar\b)\b/, "Health Services & Policy"],

  // Neurology & Neuroscience (keep geroscience out to avoid ties)
  [/\b(frailty|speech-?in-?noise|music(al)?\s+(training|memory)|telehealth.*memory\s+deficits?)\b/, "Neurology & Neuroscience"],

  // Orthopedics & Sports Medicine
  [/\b(back\s+skills\s+training|best\s+programme)\b/, "Orthopedics & Sports Medicine"],
  [/\b(chiropractic|spinal\s+manipulative\s+therapy|spinal\s+stiffness)\b/, "Orthopedics & Sports Medicine"],
  [/\b(hip|knee)\s+(replacement|arthroplasty)\b/, "Orthopedics & Sports Medicine"],

  // Occupational & Environmental Health
  [/\b(human\s+health\s+risk\s+assessment|hhra|monte\s+carlo\s+simulations?)\b/, "Occupational & Environmental Health"],
  [/\b(boil\s+water\s+advisory|drinking\s+water\s+quality|radon)\b/, "Occupational & Environmental Health"],

  // Public & Community Health (aging & cohorts)
  [/\b(canadian\s+longitudinal\s+study\s+on\s+aging|clsa)\b/, "Public & Community Health"],
  [/\b(older\s+adults|aging\s+population)\b/, "Public & Community Health"],

  // Infectious Disease & Microbiology (IPC)
  [/\b(standard\s+precautions|infection\s+control|hand\s+hygien[ee]|hand\s+saniti[sz]er)\b/, "Infectious Disease & Microbiology"],

  // OB/Gyn (prenatal screening)
  [/\b(cf(d| )?na|cell-?free\s+dna|prenatal\s+screen(ing|s)|prenatal\s+test\b.*\bdown\s+syndrome)\b/, "Obstetrics, Gynecology & Reproductive Health"],

  // Ophthalmology & ENT (hearing genetics)
  [/\b(sensorineural\s+hearing\s+loss|snhl|adsnhl|kcnq4)\b/, "Ophthalmology & ENT"],

  // Nutrition, Physiology & Biomechanics (lactation)
  [/\b(lactation|human\s+milk\s+expression|domperidone)\b/, "Nutrition, Physiology & Biomechanics"],

  // History, Ethics & Humanities (arts-based KT; theatre)
  [/\b(theatre\s+as\s+(knowledge|kt)|arts?-?based\s+knowledge\s+translation)\b/, "History, Ethics & Humanities"],

  [/\bannals?\s+of\s+work\s+exposures\s+and\s+health\b/, "Occupational & Environmental Health"],
  [/\bjournal\s+of\s+continuing\s+education\s+in\s+the\s+health\s+professions\b/, "Health Services & Policy"],
  [/\bhuman\s+resources\s+for\s+health\b/, "Health Services & Policy"],

  [/\bhealthcare\s*\(basel\)\b/, "Health Services & Policy"],
];

/** ---------------- DOI prefix hints (LOWER PRECISION) ---------------- **/
const DOI_HINTS = [
  [/^10\.(1371|1177|2196)\b/, "Public & Community Health"], // PLOS / SAGE / JMIR
  [/^10\.(1503|1093)\b/, "General/Family Medicine"],        // CMAJ / OUP medicine
  [/^10\.1001\b/, "Public & Community Health"],             // JAMA Net Open fallback
  [/^10\.(1002|1111)\b/, "Oncology & Hematology"],          // Wiley clinical (broad)
  [/^10\.1016\b/, "Surgery & Anesthesia"],                  // Elsevier (broad; refined via keywords)
  [/^10\.(1038|41467)\b/, "Genetics & Genomics"],           // Nature portfolio
  [/^10\.(1186|3390|3389)\b/, "Public & Community Health"], // BMC / MDPI / Frontiers
  [/^10\.1164\b/, "Respiratory & Pulmonology"],             // American Thoracic Society journals
  [/^10\.(2337|1530)\b/, "Endocrinology & Diabetes"],       // Diabetes Care / ADA
  [/^10\.2215\b/, "Nephrology & Urology"],                  // JASN
  [/^10\.1097\b/, "Emergency & Critical Care"],             // LWW emergency/critical care
];

/** ---------------- Author clusters (fall-backs) ---------------- **/
const AUTHOR_HINTS = [
  [/\b(aaron|whitmore|bo?ulet|mcivor|hernandez|lougheed|licskai|gupta s|kendzerska|bafadhel)\b/, "Respiratory & Pulmonology"],
  [/\b(rahman|mcinnes|mease|lebwohl|deodhar|gladman|navarro-?comp[ao]n)\b/, "Rheumatology & Immunology"],
  [/\b(parfrey|foley|revani|rigatto)\b/, "Nephrology & Urology"],
  [/\b(peters u|hsu l|campbell pt|chan at|newcomb pa|giannakis|brenner h|hoffmeister|buchanan dd|woods mo|tsilidis|conti dv|gauderman|savas|etchegary)\b/, "Oncology & Hematology"],
  [/\b(pater ja|young tl|benoukraf|wood(s)? mo|genome)\b/, "Genetics & Genomics"],
  [/\b(russell rs|needle r(f)?|daley p|zahariadis|holder)\b/, "Infectious Disease & Microbiology"],
  [/\b(pernica|papenburg|halperin|bettinger|top ka|kawasaki disease registry|dahdah|mccrindle)\b/, "Pediatrics & Child Health"],
  [/\b(canadian journal of cardiology|norozi|raghuveer)\b/, "Cardiology"],
  [/\b(meineri|uppal|mckeen|orser|canadian airway focus group)\b/, "Surgery & Anesthesia"],
  [/\b(ploughman|moore cs|snow nj|morrow sa)\b/, "Neurology & Neuroscience"],
  [/\b(curran v|lukewich|mathews m|asghari|maddalena|najafizada|audas r|mah cl)\b/, "Public & Community Health"],
  [/\b(prowse r|olstad dl|raine kd|twells l)\b/, "Nutrition, Physiology & Biomechanics"],
  [/\b(jogc|do valle|hallis?on|bajzak)\b/, "Obstetrics, Gynecology & Reproductive Health"],
  [/\b(neis b|shan d|sarkar a)\b/, "Occupational & Environmental Health"],
  // Corpus-specific
  [/\b(de\s*carvalho( d(e)?)?|callaghan jp|breen a)\b/, "Orthopedics & Sports Medicine"],
  [/\b(zendel br|peretz i|belleville s|west gl)\b/, "Neurology & Neuroscience"],
  [/\b(yi y|wang x(?!\s*(pp|p\.p\.))|oyet a|mujoo h)\b/, "AI, Data Science & Methods"],
  // Harm reduction / tobacco policy (covers “Everybody is impacted …”)
  [/\b(kolla\s+g|khorasheh\s+t|dodd\s+z|greig\s+s|altenberg\s+j|perreault\s+y|bayoumi\s+a(m)?|kenny\s+ks)\b/, "Psychiatry & Mental Health"],

  // PLOS One music/hearing network (auditory & music cognition)
  [/\b(zen(del|del\s+br)|russo\s+fa|habibi\s+a|henshaw\s+h|mckay\s+cm|good\s+a|baskent\s+d|kreutz\s+g)\b/, "Neurology & Neuroscience"],

  // Geroscience coalition
  [/\b(hajj-?boutros|muscedere|kirkland\s+j|bowdish|kuchel|morais\s+ja|sierra\s+f|duque\s+g|howlett\s+s|van\s+raamsdonk|fowler\s+r|rylett)\b/, "Public & Community Health"],

  // Environmental health / Sarkar book team (makes “Introduction/Conclusion” land right)
  [/\b(sarkar\s+a|vanloon\s+g(w)?|watson\s+d)\b/, "Occupational & Environmental Health"],

  // Policy & health systems (Gov–academy, embedded fellowships, evaluation)
  [/\b(marchildon\s+g|tamblyn\s+r|savitz\s+l|rourke\s+j|bornstein\s+s)\b/, "Health Services & Policy"],

  // History/Ethics & pedagogy
  [/\b(flynn\s+j|beausoleil\s+n|connor\s+j(th)?|gustafson\s+dl)\b/, "History, Ethics & Humanities"],

  // Harm reduction / safer supply (Psychiatry & Mental Health)
[/\b(kolla g|gomes t|leece p|pauly b|urbanoski k|werb d|karamouzian m|boyd r|franklyn m|smoke a)\b/, "Psychiatry & Mental Health"],

// Health services / engagement / policy (Health Services & Policy)
[/\b(etchegary h|bornstein s)\b/, "Health Services & Policy"],
[/\b(mah cl)\b/, "Health Services & Policy"],

// General / Family Medicine & rural workforce
[/\b(knight jc|mathews m|ryan d|aubrey-?bassler k)\b/, "General/Family Medicine"],

// Nutrition / food environments / obesity
[/\b(twells l|randell ew|prowse r|olstad dl|raine kd|wadden k(p)?|basset fa)\b/, "Nutrition, Physiology & Biomechanics"],

// Neurology & auditory neuroscience
[/\b(zendel br|peretz i|vuvan dt)\b/, "Neurology & Neuroscience"],

// Evidence synthesis / methods
[/\b(tricco ac|straus se)\b/, "AI, Data Science & Methods"],

// Bioethics / humanities
[/\b(pullman d|kaposy c)\b/, "History, Ethics & Humanities"],

  // Substance use, harm reduction
  [/\b(kolla|gomes|pauly|urbanoski|werb|karamouzian|leece|boyd(?!e)|smoke|franklyn|bonn)\b/i, "Addictions, Harm Reduction & Substance Use"],

  // Methods, stats & SPOR
  [/\b(tricco|straus|zarin|moher|colquhoun|florez|abou-?setta|clement|graham id|wilhelm|isaranuwatchaia)\b/i, "Methods & Evidence Synthesis"],
  [/\b(yi y|yiyu|oyet|selvaratnam|adaptive design|response adaptive)\b/i, "Biostatistics & Methods"],
  [/\b(spor|strategy for patient oriented research|evidence alliance)\b/i, "Patient Engagement & SPOR"],

  // Health services, workforce & policy
  [/\b(bornstein|mathews m|ryan d|audas|rourke jt|rourke j|tomblin murphy|mac(?:k|)enzie a|deber|mah cl)\b/i, "Health Services & Policy"],
  [/\b(curran v(r)?|fleet l|sargeant|lockyer|kirby f|oandasan|interprofessional)\b/i, "Health Professions Education & Workforce"],
  [/\b(etchegary|vat le|patient(s)? as partner(s)?|town hall)\b/i, "Patient Engagement & SPOR"],
  

  // Rural/remote & community
  [/\b(rural|newfoundland|labrador|remote|m(?:emorial )?university medical graduates)\b/i, "Rural & Remote Health"],

  // Occupational & environmental
  [/\b(demers pa|keefe|stock sr|arrandale|senthilselvan|dosman|beach j|rennie d|swine operations)\b/i, "Occupational & Environmental Health"],

  // Ethics, law & policy debates
  [/\b(kaposy|pullman d|death, dignity|abortion|drug shortage|bio-?politic)\b/i, "Ethics, Law & Policy"],

  // Women’s, perinatal & reproductive
  [/\b(twells|prenatal|newborn screening|mc4r|obstet|gyneco|women(?:'s)? health)\b/i, "Women’s, Perinatal & Reproductive Health"],

  // Nutrition, obesity & metabolism
  [/\b(sun g|randell|glp-?1|bmi|obes|nutrition|dietary|food-?frequency questionnaire)\b/i, "Nutrition, Obesity & Metabolism"],

  // Neuroscience, music & hearing
  [/\b(zendel|peretz|fujioka|amusia|musicianship|speech in noise|neuromagnetic)\b/i, "Neuroscience (Auditory, Music & Hearing)"],

  // Pediatrics & child health
  [/\b(newborn screening|parents in waiting rooms|natural health products in children)\b/i, "Pediatrics & Child Health"],

  // Indigenous & community health / disability & rehab
  [/\b(assistive technology|disabilit(y|ies)|indigenous|first nation)\b/i, "Indigenous, Disability & Community Health"],

  // Infectious disease & outbreaks
  [/\b(SARS|outbreak|super-?spreader)\b/i, "Infectious Disease & Public Health"],

  // Global health & social determinants
  [/\b(najafizada|afghanistan|brazil|humaniza(?:ç|c)ão|social inequities|menu labell?ing|food strategy|toronto food policy)\b/i, "Global & Social Determinants of Health"],

   // Bereavement & thanatology
  [/\b(bolt|buckle jl|corbin dwyer|dwyer s\.? c?|\bperceptions of the deceased\b)\b/i, "Bereavement & Thanatology"],

  // Bioethics, philosophy & law
  [/\b(flynn j(?!.*waterfall))\b/i, "Bioethics & Philosophy"],
  [/\b(pullman d|kaposy|bio-?politic|dignity|abortion)\b/i, "Ethics, Law & Policy"],

  // Patient engagement & SPOR (reinforce Etchegary/Vat)
  [/\b(etchegary|vat le|town hall|patients? as partners?)\b/i, "Patient Engagement & SPOR"],

  // Social determinants / qualitative (Traverso-Yépez)
  [/\b(traverso-?y[eé]pez|humaniza(?:ç|c)ão|inequities|discursiv[ao])\b/i, "Social Determinants & Qualitative Health"],

  // Health professions education & leadership (Curran/Maddalena/Sargeant)
  [/\b(curran v(r)?|maddalena v|sargeant j|cme|interprofessional|accreditation)\b/i, "Health Professions Education & Workforce"],

  // Weight stigma & pedagogy
  [/\b(ward p|beausoleil n|heath o|weight-?centered|weight stigma)\b/i, "Weight Stigma & Health Pedagogy"],

  // Food policy, newcomer/immigrant health (Mah/Sellen/Anderson)
  [/\b(mah c[ l]?|sellen d(w)?|anderson lc|food policy|food strategy|menu label?ling|newcomer mothers)\b/i, "Food Policy & Immigrant Health"],

  // Primary care, family medicine & community
  [/\b(godwin m|audas r|medical home|primary care)\b/i, "Primary Care & Community Health"],

  // Biomechanics & spine (Callaghan/De Carvalho)
  [/\b(callaghan jp|de carvalho d[ e]?|core exercise|lumbar|biomechanic)\b/i, "Biomechanics & Spine"],

  // Nursing leadership & outcomes (Estabrooks/Cummings/Midodzi)
  [/\b(estabrooks ca|cummings gg|midodzi wk|nursing leadership)\b/i, "Nursing Leadership & Outcomes"],

  // Health financing & allocation (Deber/Penno/Gauld)
  [/\b(deber|penno|gauld|funding formula|proximity to death)\b/i, "Health Financing & Allocation"],

  // Basic science vascular/pharm (McGuire et al.)
  [/\b(mcguire jj|protease-activated receptor 2|endotheli\w+)\b/i, "Cardio-Vascular Pharmacology (Basic Science)"],

  // Infectious disease pharmacotherapy
  [/\b(bader ms|cefazolin|probenecid|cellulitis)\b/i, "Infectious Disease Pharmacotherapy"],

  // Aging, community & resilience
  [/\b(age friendly|older canadians|resilien(t|ce))\b/i, "Aging, Community & Resilience"],

  // Environmental health (India, Bhopal, arsenic)
  [/\b(bhopal|arsenic|modern agriculture|environmental (health|risk))\b/i, "Environmental & Occupational Health"],

  // Respiratory epi (wheezing phenotypes)
  [/\b(wheezing phenotypes|asthma phenotypes|senthilselvan|rowe bh)\b/i, "Respiratory Epidemiology"],

  // Genomics ethics & translation
  [/\b(gene discovery (research|diagnosis)|is (gene )?discovery research or diagnosis)\b/i, "Genomics Ethics & Translation"],

  // Psychometrics & measurement
  [/\b(illness intrusiveness|validation study|scale validation|reliab(il)?ity analysis|equivalence test)\b/i, "Measurement & Psychometrics"],

  // Music/auditory neuro (ensure capture for Zendel/Peretz items without overreach)
  [/\b(zendel|peretz|concurrent sound segregation|tone-?deaf|amusia)\b/i, "Neuroscience (Auditory, Music & Hearing)"],

  // Harm reduction & drug policy (Kolla, Bayoumi)
  [/\b(kolla g|bayoumi a(m)?|safer (opioid|supply)|harm reduction|drug policy)\b/i, "Harm Reduction & Drug Policy"],

  // Health in All Policies (HiAP) & public policy (Freiler, Mah)
  [/\b(health in all policies|hiap|freiler|muntaner|shankardass|o['’]campo|mah c[ l]?)\b/i, "Health in All Policies (HiAP) & Public Health Governance"],

  // Women’s health, motherhood & feminist health (Gustafson)
  [/\b(gustafson d[ l]?|non-?resident mothers|single mothers|noncustodial mothers|nursing \(profession\) and motherhood|hysterectomies|fecundity|absentee mothers|mothers who leave)\b/i, "Women’s Health, Motherhood & Feminist Health"],

  // Palliative & end-of-life (Maddalena et al.)
  [/\b(palliative (care)?|end-?of-?life|maddalena(?!.*leadership))\b/i, "Palliative & End-of-Life Care"],

  // Patient engagement & risk communication (Etchegary)
  [/\b(etchegary|living with chronic risk|back burner most days)\b/i, "Risk Communication & Patient Engagement"],

  // Geriatrics & aging epidemiology (Godwin healthy aged)
  [/\b(healthy aged|elderly patients 80 years and older|cognitively functioning elderly)\b/i, "Geriatrics & Aging Epidemiology"],

  // Harm reduction / community impacts (Kolla et al.)
  [/\b(kolla g|bayoumi a(m)?|intercommunity|safer (opioid|supply)|harm reduction)\b/i,
   "Harm Reduction, Safer Supply & Community Impacts"],

  // Health research priority-setting via town halls (Etchegary et al.)
  [/\b(etchegary|research priorit(y|ies)|town halls?)\b/i,
   "Patient & Public Involvement: Priority-Setting"],

  // Lifecourse & early experiences (Traverso-Yepez)
  [/\b(traverso-?y[eé]pez|lifelong impact|early experiences)\b/i,
   "Lifecourse Health & Early Experiences"],

  // Feminist health, lone mothers, caregiving (Gustafson)
  [/\b(gustafson d[ l]?|lone mothers|nonresidential mothers|family caregiving|women'?s health)\b/i,
   "Women’s Health, Motherhood & Caregiving"],

  // Bioethics, autonomy, ICD decision-making (Pullman, Hodgkinson)
  [/\b(pullman d|hodgkinson k|de-?icd|paternalism|autonomy)\b/i,
   "Bioethics: Autonomy, Devices & Consent"],

  // Patient experience & access (Mathews, Ryan)
  [/\b(wait[-\s]?time|wait[-\s]?related satisfaction|patient[-\s]?expressed perceptions)\b/i,
   "Patient Experience, Access & Wait-Times"],

  // Justice, minimal risk, philosophy of medicine (Flynn)
  [/\b(minimal risk|material principle of justice|normative structure of sport|flynn j)\b/i,
   "Health Ethics & Justice (Conceptual)"],

  // Anti-racism in health care (Gustafson)
  [/\b(racism in health care|critical examination|gustafson d[ l]?)\b/i,
   "Anti-Racism & Equity in Health Care"],

  // Community capacity building for health (Traverso-Yepez, Maddalena, Bavington, Donovan)
  [/\b(community capacity building|capacity-?building)\b/i,
   "Community Capacity & Health Promotion"],

  // Cultural competence (Maddalena)
  [/\b(cultural competence|holistic practice)\b/i,
   "Cultural Competence in Health Professions"],

  // Patient safety & medical errors (O’Hagan, Etchegary et al.)
  [/\b(self-?reported medical errors?|patient safety|seven countries)\b/i,
   "Patient Safety & Medical Errors (Comparative)"],

  // Environmental health & social determinants (Sarkar – arsenic)
  [/\b(arsenic(osis)?|social determinants|india\b)\b/i,
   "Environmental Health & Social Determinants"],

  // Knowledge translation & research utilization (Cummings, Estabrooks, Midodzi, Wallin)
  [/\b(research utilization|organizational characteristics|multilevel analysis)\b/i,
   "Knowledge Translation & Research Use"],

  // Interprofessional education & collaboration (Curran, Sargeant; Kearney)
  [/\b(inter-?professional (education|collaboration)|teamwork workshop|undergraduate inter-?professional)\b/i,
   "Interprofessional Education & Collaboration"],

  // Methods: adaptive designs & quantitative methods (Yi, Wang)
  [/\b(adaptive design(s)?|statistical inference .*binary responses|response adaptive)\b/i,
   "Methods: Adaptive & Sequential Designs"],

  // Quant finance / optimal portfolio (Yi, Wang, Liao)
  [/\b(optimal portfolio|nonparametric learning)\b/i,
   "Quantitative Finance & Optimization (Methods)"],

  // Vascular biology / vasorelaxation (Varma et al.)
  [/\b(tetrodotoxin-?resistant|vasorelaxation|sodium hypochlorite|field stimulation)\b/i,
   "Vascular Biology & Physiology"],

  // Nursing workforce / profession notes (encyclopedic entries)
  [/\b(^|\W)nurses?(\W|$)/i,
   "Nursing Profession & Workforce"],

  // Medical humanities / narrative in education (Pullman; narrative means…)
  [/\b(narrative means to humanistic ends|medical humanities)\b/i,
   "Medical Humanities & Narrative Medicine"],

  // Public health administration & curriculum (course outlines)
  [/\b(course (outline|syllabus)|research methods in community health)\b/i,
   "Health Education: Curriculum & Administration"],

  // Health workforce incentives & retention (Mathews, Ryan)
  [/\b(recruitment incentive(s)?|return-for-service|work location|retention (of )?physicians)\b/i, "Health Workforce Policy & Incentives"],

  // Science communication & controversies (Bubela; DAKO case)
  [/\b(science communications reconsidered|dak[o0]\b|medical controversy)\b/i, "Science Communication & Controversies"],

  // Pharmaceutical policy & supply chains
  [/\b(drug supply shortage|from framework to the frontline)\b/i, "Pharmaceutical Policy & Supply Chains"],

  // Psychosocial factors & mental health
  [/\b(attachment orientation|social support|life-?events distress)\b/i, "Psychosocial Factors & Mental Health"],

  // Comparative health policy & federalism (Deber et al.)
  [/\b(variations on a common theme|federalism|interprovincial|comparative health policy)\b/i, "Comparative Health Policy & Federalism"],

  // Nutrition policy & fortification
  [/\b(folic acid fortif\w+|mandatory folic)\b/i, "Nutrition Policy & Fortification"],

  // Body composition methods (DXA vs BIA)
  [/\b(bioelectrical impedance|bia\b|dual-?energy x-?ray absorptiometry|dxa)\b/i, "Body Composition Methods"],

  // Infant feeding & maternal identity
  [/\b(formula feeding mothers|good mothers)\b/i, "Infant Feeding & Maternal Identity"],

  // Gender & sexuality studies (Bogotá repertories)
  [/\b(homosexualidad|homosexuality|repertorios interpretativos)\b/i, "Gender & Sexuality Studies"],

  // Peace & gender (Kirk, Mulay)
  [/\b(women building peace|india and pakistan)\b/i, "Peace, Gender & Health Contexts"],

// Journals
[/\bhealthcare\s*\(basel\)\b/i, "Health Services & Policy"],
[/\bannals of work exposures and health\b/i, "Occupational & Environmental Health"],
[/\bhuman resources for health\b/i, "Health Services & Policy"],
[/\bplos one\b/i, "General/Family Medicine"],

// Thematic report types
[/\bscoping review\b/i, "AI, Data Science & Methods"],
[/\bsystematic review\b/i, "AI, Data Science & Methods"],
[/\bumbrella review\b/i, "AI, Data Science & Methods"],
[/\bmeta-?analysis\b/i, "AI, Data Science & Methods"],

// Screening / diagnostics
[/\bcolposcopy\b/i, "Obstetrics, Gynecology & Reproductive Health"],
[/\bnewborn screening\b/i, "Pediatrics"],
[/\bcancer screening\b/i, "Oncology"],
];

/** ---------------- Keyword net (MEDIUM precision) ---------------- **/
const KEYWORDS = [
  // Neurology (removed lone \bms\b to reduce “milliseconds” noise)
  [/(\bneuro\b|parkinson|\bstroke\b|\btia\b|multiple\s+sclerosis|cognition|dementia|epilep|migraine|neurorehab|spinal\s+cord|auditory(\s+(cortex|processing|evoked))?|\b(eeg|meg|erp)\b|music(al)?\s+memory|huntington\s+disease)/, "Neurology & Neuroscience"],

  [/(rheumat|psoria|spondylo|ankylos|vasculitis|lupus|autoimmun|immun(ity|olog|e))/, "Rheumatology & Immunology"],
  [/(oncolog|\bcancer\b|tumou?r|carcinom|melanom|sarcom|myeloma|leukemi|lymphoma|hematolog|chemotherapy|radiotherapy|lymphedema)/, "Oncology & Hematology"],
  [/(cardio|\bheart\b|arrhythm|atrial\s+fibrillation|coronary|vascular|hypertension|myocard|heart\s+failure|cardiac|echocardio)/, "Cardiology"],
  [/(gastro|hepat|\bibd\b|crohn|ulcerative\s+colitis|\bcolitis\b|\bliver\b|pancrea|biliary|colonoscopy|bowel\s+(prep|cleans))/, "Gastroenterology & Hepatology"],
  [/(obstet|gyneco|pregnan|perinatal|reproduct|maternal|neonat|contracept|fertility|menopaus|endometrio|vulvodynia|midwif(e|ery)|home\s*birth|prenatal\s+test\b.*\bdown\s+syndrome)/, "Obstetrics, Gynecology & Reproductive Health"],
  [/(pediat|paediat|\bchild(hood)?\b|adolesc|kawasaki\s+disease|congenital|autis|ankyloglossia|frenotomy|tongue-?\s*tie|bronchiolitis|kangaroo\s+program|preterm|low-?weight\s+bab(y|ies))/, "Pediatrics & Child Health"],
  [/(dermatol|hidradenitis|psoriasis|eczema|atopic|acne|vitiligo|skin\s+cancer|skin\s+ulcer)/, "Dermatology"],
  [/(surg(ery|ical)|operative|anesth|peri-?operative|laparoscop|arthroscop|transplant|bariatric)/, "Surgery & Anesthesia"],

  // Radiology: keep specific phrases; avoid generic "imaging"
  [/(\bradiol\b|diagnostic\s+imaging|medical\s+imaging|ultrasound|\bct\b|\bmri\b|tomograph|radiography|mammograph|pet\/?ct|spect|pacs\b|picture\s+archiving)/, "Radiology & Imaging"],

  [/(infect|microbio|virol|virus(es)?|bacter|pathogen|antibiot|antimicrobial|\bsepsis\b|covid|sars-?cov-?2|influenza|\bhiv\b|hepatitis|\btb\b|tubercul|\bvaccine\b|vaccination|arbovir|vector-?borne|mosquito|enteric\s+diseases?)/, "Infectious Disease & Microbiology"],
  [/(genom|genet|exome|gwas|polygenic|variant|mutation|heredit|familial|sequenc|transcriptom|epigenom|lynch\s+syndrome|brca\b|22q11\.2|y\s+chromosome|rare\s+disease)/, "Genetics & Genomics"],
  [/(\bnutrition\b|diet|obesity|metabol|biomech|physiol|\bgait\b|\bexercise\b|physical\s+activity|energy\s+expenditure|motion\s+capture|imu\b|intervertebral|kinematics|calf\s+circumference|bone\s+mineral\s+density|ghrelin|peptide\s+yy)/, "Nutrition, Physiology & Biomechanics"],

  // Public & Community Health (de-broadened)
  [/(primary\s+care|family\s+medicine|general\s+practice|community\s+health|public\s+health|health\s+services|screening\s+program|telehealth|telemedicine|long-?term\s+care|cohort\s+profile|immigrant|migrant|refugee|smoking\s+cessation|tobacco|non-?communicable\s+diseases|ncds?)/, "Public & Community Health"],

  // Respiratory
  [/(\basthma\b|\bcopd\b|pulmon|airway|spirometr|bronch(itis|iectasis)|sleep\s+apnea|oxygenation|oxygen\s+concentrator|acute\s+lung\s+injury)/, "Respiratory & Pulmonology"],

  // Nephro/Uro
  [/(nephro|kidney|renal|dialysis|hemodialysis|transplant\s+kidney|proteinuria|albuminuria|glomerul|urolog|prostate|bladder)/, "Nephrology & Urology"],

  // Psych
  [/(depress|anxiet|bipolar|schizophren|mental\s+health|suicid|addict|substance\s+use|ptsd|psych(ology|iatry)|electroconvulsive|ect\b|stimulant|overdose|harm\s+reduction|supervised\s+consumption)/, "Psychiatry & Mental Health"],

  // Emergency/Critical Care
  [/(emergency\s+depart(ment)?|\bed\b|prehospital|\bicu\b|critical\s+care|resuscitat|sepsis\s+bundle|triage|emergency\s+medicine)/, "Emergency & Critical Care"],

  // MSK
  [/(orthop|fracture|bone\s+health|osteopor|\bacl\b|meniscus|rotator\s+cuff|sports\s+injur|musculoskeletal|ergonom|spine|lumbar|low\s+back\s+pain|\blbp\b|posture)/, "Orthopedics & Sports Medicine"],

  // Endo
  [/(diabet|insulin|glyc(ae)?mic|endocrin|thyroid|pituitar|hormone|metabolic\s+syndrome)/, "Endocrinology & Diabetes"],

  // ENT/Ophth
  [/(ophthalm|ocular|retina|glaucoma|cornea|otolaryng|laryng|hearing|tinnitus|sinusitis|otitis|auditory(\s+(processing|evoked))?)/, "Ophthalmology & ENT"],

  // Pharm
  [/(pharmac|medication|prescrib|dose|drug\s+(safety|utili[z|s]ation)|adverse\s+drug|stewardship)/, "Pharmacy & Pharmacology"],

  // Dental
  [/(dent(al|istry)|oral\s+health|periodont|endodont|caries|tooth\s+loss)/, "Dental & Oral Health"],

  // Methods/ML
  [/(machine\s*learning|deep\s*learning|artificial\s+intelligence|\bnlp\b|natural\s+language|algorithm|risk\s+score|prediction\s+model|random\s+forest|xgboost|neural\s+network|segmentation|classification|time\s+series|survival\s+model|response-?adaptive\s+design|bandit|markov\s+decision\s+process|adaptive\s+trial|optimal\s+allocation|administrative\s+data\s+validat(ion|e)|case\s+ascertainment|capture-?recapture)/, "AI, Data Science & Methods"],

  // HSP
  [/(patient\s+engagement|medical\s+education|interprofessional\s+education|continuing\s+professional\s+development|learning\s+health\s+system|health\s+system\s+impact|inappropriateness?\s+of\s+care|overuse\s+in\s+health(care)?|appropriateness?\s+review|embedded\s+scientist|mentorship\s+(programme|program)|workforce\s+(capacity|planning)|patient\s+advisory\s+council(s)?|patient\s+partners?|public\s+engagement\s+in\s+research)/, "Health Services & Policy"],

  // Occ/Env
  [/(seafarer|maritime|occupational\s+noise|noise\s+exposure|hearing\s+conservation|fish\s+harvesters?|human\s+health\s+risk\s+assessment|hhra|monte\s+carlo\s+simulations?|boil\s+water\s+advisory|drinking\s+water\s+quality|radon|climate\s+perceptions?|climate\s+autobiograph(y|ies)|water\s+insecurity)/, "Occupational & Environmental Health"],

  // H&E
  [/(medical\s+photograph|images?\s+online|privacy|consent|digital\s+storytelling|arts?-?based\s+(research|kt|knowledge\s+translation)|medical\s+assistance\s+in\s+dying|maid\b|ethics?\s+of\s+(care|policy)|bioethics|philosoph(y|ical)\s+debate)/, "History, Ethics & Humanities"],

  // Extra coverage: French + recruitment tactics
  [/\bcessation\s+tabagique\b/, "Public & Community Health"],
  [/\bneurodevelopment(al)?\s+disabilit(y|ies)|preschool\s+health\s+check\b/, "Pediatrics & Child Health"],
  [/\burine\s+(culture|growth|stabilization)\b/, "Infectious Disease & Microbiology"],
  [/\bfacebook\s+advertis(ing|ement)\b.*\b(recruit|survey)\b/, "Public & Community Health"],

  // Multimorbidity (Mortey et al.)
  [/\b(multimorbidity|multi-?morbidity|comorbidity|chronic\s+diseases?)\b/, "Public & Community Health"],

  // Geroscience (Hajj-Boutros et al.)
  [/\b(geroscience|translational\s+geroscience)\b/, "Public & Community Health"],

  // Patient-cent(red/ered) care / environmental scan (Najafizada et al.)
  [/\b(patient-?cent(re|er)ed\s+care|person-?cent(re|er)ed\s+care)\b/, "Health Services & Policy"],
  [/\benvironmental\s+scan\b/, "Health Services & Policy"],

  // OSH in university setting; occupational diseases scoping review
  [/\b(occupational\s+(health|safety)\s+program(me)?s?|workplace\s+(health|safety)\s+program(me)?s?)\b/, "Occupational & Environmental Health"],
  [/\b(occupational\s+diseases?)\b/, "Occupational & Environmental Health"],

  // Preference-based index; QoL measurement (weight-related QoL prototype)
  [/\b(preference-?based\s+(index|measure)|quality\s+of\s+life\s+(index|measure|scale))\b/, "Health Services & Policy"],

  // Planetary health / minimalonomics (Sarkar)
  [/\b(minimalonomics|planetary\s+health|environmental\s+economics?)\b/, "Occupational & Environmental Health"],

  // Appropriateness / overuse (Squires et al.; Tricco/SPOR)
  [/\b(inappropriateness?\s+of\s+care|overuse\s+in\s+health(care)?|appropriateness?\s+review)\b/, "Health Services & Policy"],
  [/\b(spor\s+evidence\s+alliance|learning\s+health\s+system)\b/, "Health Services & Policy"],

  // Vaping / aerosol-free laws (Nguyen & Bornstein)
  [/\b(vap(e|ing)|e-?cig(ar(et(te)?)?)?|aerosol-?free\s+laws?)\b/, "Public & Community Health"],

  // Falls prevention in community-dwelling older adults
  [/\b(falls?\s+prevention|prevent(ing)?\s+falls)\b/, "Public & Community Health"],

  // Digital healthy eating in children (umbrella review)
  [/\b(healthy\s+eating|dietary\s+interventions?)\b.*\b(children|childhood|paediatr(ic)?|pediatr(ic)?)\b/, "Pediatrics & Child Health"],

  // Chronic pain (protocol; admin-data validation)
  [/\bchronic\s+pain\b/, "Neurology & Neuroscience"],

  // OSCE / standard setting methods in medical education
  [/\b(osce|objective\s+structured\s+clinical\s+examinations?)\b/, "Health Services & Policy"],

  // Occupational fatigue / short-sea seafaring (Great Lakes & St. Lawrence)
  [/\b(seafar(ers?|ing)|short-?sea\s+shipping|great\s+lakes(\s+and\s+st(\.|\s+lawrence))?)\b/, "Occupational & Environmental Health"],

  // Residency parental leave survey
  [/\b(parental\s+leave)\b.*\b(residen(cy|ts?)|program\s+directors?)\b/, "Health Services & Policy"],

  // Bereavement / perceptions of the deceased
  [/\b(bereave(ment|d)|grief|thanatology)\b/, "History, Ethics & Humanities"],

  // Water quality monitoring business model
  [/\b(drinking\s+water\s+quality|private\s+well|well\s+water|boil\s+water\s+advisory)\b/, "Occupational & Environmental Health"],

  // Screening process / shared decision-making
  [/\b(shared\s+decision-?making)\b.*\bscreen(ing|s)\b/, "General/Family Medicine"],

  // Food waste diversion policy
  [/\b(food\s+waste\s+diversion)\b/, "Public & Community Health"],

  // DPP-4 vs sulfonylureas safety
  [/\b(dpp-?4|dipeptidyl\s+peptidase-?4|sulfonylure(as?|a))\b/, "Endocrinology & Diabetes"],

  // Trans / gender diverse evidence map
  [/\b(transgender|nonbinary|gender\s+diverse)\b/, "Public & Community Health"],

  // Avoidable hospital admission
  [/\b(avoidable\s+hospital\s+ad(mission|mit))\b/, "Health Services & Policy"],

  // Multimorbidity & chronic disease burden
  [/\b(multimorbidity|multi-?morbidity|comorbidity|chronic\s+diseases?)\b/, "Public & Community Health"],

  // Geroscience / translation
  [/\b(geroscience|translational\s+geroscience)\b/, "Public & Community Health"],

  // Patient-centred care & environmental scan
  [/\b(patient-?cent(re|er)ed\s+care|person-?cent(re|er)ed\s+care)\b/, "Health Services & Policy"],
  [/\benvironmental\s+scan\b/, "Health Services & Policy"],

  // Occupational health & safety programs / occupational diseases
  [/\b(occupational\s+(health|safety)\s+program(me)?s?|workplace\s+(health|safety)\s+program(me)?s?)\b/, "Occupational & Environmental Health"],
  [/\b(occupational\s+diseases?)\b/, "Occupational & Environmental Health"],

  // Appropriateness / overuse / SPOR
  [/\b(inappropriateness?\s+of\s+care|overuse\s+in\s+health(care)?|appropriateness?\s+review)\b/, "Health Services & Policy"],
  [/\b(spor\s+evidence\s+alliance|learning\s+health\s+system)\b/, "Health Services & Policy"],

  // Vaping / aerosol-free laws
  [/\b(vap(e|ing)|e-?cig(ar(et(te)?)?)?|aerosol-?free\s+laws?)\b/, "Public & Community Health"],

  // Falls prevention (older adults)
  [/\b(falls?\s+prevention|prevent(ing)?\s+falls)\b/, "Public & Community Health"],

  // Pediatrics: healthy eating umbrella review
  [/\b(healthy\s+eating|dietary\s+interventions?)\b.*\b(children|childhood|paediatr(ic)?|pediatr(ic)?)\b/, "Pediatrics & Child Health"],

  // Chronic pain (protocols, validation)
  [/\bchronic\s+pain\b/, "Neurology & Neuroscience"],

  // Medical education: OSCE/standard setting, course evals, tele-education, self-directed learning
  [/\b(osce|objective\s+structured\s+clinical\s+examinations?)\b/, "Health Services & Policy"],
  [/\b(course\s+evaluation(s)?|intensive\s+course\s+review\s+protocol)\b/, "Health Services & Policy"],
  [/\btele-education\b/, "Health Services & Policy"],
  [/\bself-?directed\s+learning\b/, "Health Services & Policy"],

  // Seafaring / Great Lakes fatigue
  [/\b(seafar(ers?|ing)|short-?sea\s+shipping|great\s+lakes(\s+and\s+st(\.|\s+lawrence))?)\b/, "Occupational & Environmental Health"],

  // Bereavement / perceptions of the deceased
  [/\b(bereave(ment|d)|grief|thanatology)\b/, "History, Ethics & Humanities"],

  // Water quality monitoring / wells
  [/\b(drinking\s+water\s+quality|private\s+well|well\s+water|boil\s+water\s+advisory)\b/, "Occupational & Environmental Health"],

  // Screening process & shared decision-making
  [/\b(shared\s+decision-?making)\b.*\bscreen(ing|s)\b/, "General/Family Medicine"],

  // Endocrine: DPP-4 vs sulfonylureas
  [/\b(dpp-?4|dipeptidyl\s+peptidase-?4|sulfonylure(as?|a))\b/, "Endocrinology & Diabetes"],

  // Trans / gender diverse evidence maps
  [/\b(transgender|nonbinary|gender\s+diverse)\b/, "Public & Community Health"],

  // Avoidable admissions / retention
  [/\b(avoidable\s+hospital\s+ad(mission|mit))\b/, "Health Services & Policy"],

  // Government–academy relationships; embedded fellowships; academic leaders
  [/\b(government-?academy\s+relationships?)\b/, "Health Services & Policy"],
  [/\b(embedded\s+fellowship(s)?)\b/, "Health Services & Policy"],
  [/\b(academic\s+medicine\s+leaders?|leadership\s+evaluation|feedback\s+for\s+leaders?)\b/, "Health Services & Policy"],

  // Dining-hall nutrition interventions
  [/\b(university\s+dining\s+hall|beverage\s+education\s+intervention)\b/, "Nutrition, Physiology & Biomechanics"],

  // BMI trajectories (seniors, mortality)
  [/\b(body\s+mass\s+index|bmi)\b.*\b(trajector(y|ies))\b/, "Nutrition, Physiology & Biomechanics"],

  // Social entrepreneurship (Afghanistan poverty)
  [/\b(social\s+entrepreneurship)\b/, "Public & Community Health"],

  // Health system performance scoping review
  [/\b(health\s+system\s+performance)\b/, "Health Services & Policy"],

  // Public policy argumentation (commentary)
  [/\b(public\s+policy\s+argumentation)\b/, "Health Services & Policy"],

  // Qualitative interviewing research note
  [/\b(qualitative\s+interview(ing)?\s+purposes?)\b/, "Health Services & Policy"],

  // Visual Thinking Strategies (global health training)
  [/\b(visual\s+thinking\s+strateg(y|ies))\b/, "Health Services & Policy"],

  // Predictive accident modelling (OSH)
  [/\b(predictive\s+accident\s+model(ling)?)\b/, "Occupational & Environmental Health"],

  // Security risk analysis (QSRA / SVAPP) – methods
  [/\b(qsra|svapp\s+methodology|security\s+risk\s+analysis)\b/, "AI, Data Science & Methods"],

  // Journal-like token rescued as keyword (HSP)
[/\bhealthcare\s*\(basel\)\b/, "Health Services & Policy"],

// Occupational / Environmental Health
[/\b(workplace\s+health\s+and\s+safety|workplace\s+program(me)?s?)\b/, "Occupational & Environmental Health"],
[/\b(return\s+to\s+work|maritime\s+workers?|seafarers?)\b/, "Occupational & Environmental Health"],

// Health Services & Policy (systems, engagement, policy)
[/\b(patient-?centered\s+care|patient-?centred\s+care)\b/, "Health Services & Policy"],
[/\b(menu\s+labell?ing|food\s+policy\s+council)\b/, "Health Services & Policy"],

// Psychiatry & Mental Health
[/\b(cbt-?i|cognitive\s+behavio(u)?ral\s+therap(y|ies)\s+for\s+insomnia)\b/, "Psychiatry & Mental Health"],

// Cardiology
[/\b(ecg|electrocardiogram)\b/, "Cardiology"],
[/\b(arrhythmogenic\s+right\s+ventricular\s+cardiomyopathy|arvc)\b/i, "Cardiology"],

// Radiology & Imaging
[/\bpoint[-\s]?of[-\s]?care\s+ultrasound\b|\bpocus\b/i, "Radiology & Imaging"],

// Genetics & Genomics
[/\brare\s+disease\s+(registry|registries|patient\s+registr(y|ies))\b/i, "Genetics & Genomics"],
[/\bgenomic\s+health|cancer\s+predisposition\s+syndromes?\b/i, "Genetics & Genomics"],
[/\bpolygenic\s+risk\s+scores?\b/i, "Genetics & Genomics"],

// Nutrition, Physiology & Biomechanics
[/\bdiet(ary)?\s+cost(s)?\b/i, "Nutrition, Physiology & Biomechanics"],

// OB/Gyn & Reproductive Health
[/\bpreconception\b/, "Obstetrics, Gynecology & Reproductive Health"],

// History, Ethics & Humanities
[/\b(bereavement|grief|thanatology)\b/i, "History, Ethics & Humanities"],

[/\b(workplace\s+health\s+and\s+safety|workplace\s+program(me)?s?)\b/, "Occupational & Environmental Health"],
[/\b(stop\s+smoking|smoking\s+cessation\s+interventions?)\b/, "Public & Community Health"],
[/\b(screening\s+process)\b/, "General/Family Medicine"],

// Evidence syntheses & methods
  [/\b(scoping review|systematic review|umbrella review|meta-?analysis|protocol)\b/i, "Methods & Evidence Synthesis"],
  [/\b(adaptive design|response(-|\s)?adaptive|maximum likelihood|generalized linear models|random-?digit(-|\s)?dial(ling)?)\b/i, "Biostatistics & Methods"],

  // Screening, diagnostics & genomics
  [/\b(cancer screening|screening\b|when things go wrong|colposcopy|HPV testing|triag\w+)\b/i, "Oncology & Screening"],
  [/\b(newborn screening|prenatal testing|informed choice|genomic health|personalized medicine)\b/i, "Genomics & Reproductive Health"],

  // Health services, policy, workforce
  [/\b(health (services|system)|policy|evaluation|return-?for-?service|physician retention|clinic funding|program directors|CME|interprofessional|workforce|menu labell?ing)\b/i, "Health Services & Policy"],
  [/\b(patient engagement|patients as partners|community town hall|SPOR|evidence alliance)\b/i, "Patient Engagement & SPOR"],
  [/\b(rural|remote|newfoundland|labrador|community hospital|provincial retention)\b/i, "Rural & Remote Health"],

  // Occupational & environmental
  [/\b(occupational disease|work(exposure|place)|seafaring|swine operations|airway obstruction|polygenic risk score[s]?)\b/i, "Occupational & Environmental Health"],

  // Ethics & law
  [/\b(abortion|drug shortage|ethic(al|s)|dignity|bio-?politics|governance)\b/i, "Ethics, Law & Policy"],

  // Women’s, perinatal & reproductive
  [/\b(obstetric|gyneco|perinatal|matern(al|ity)|breast(-|\s)?conserving|mastectomy)\b/i, "Women’s, Perinatal & Reproductive Health"],

  // Nutrition, obesity & metabolism
  [/\b(BMI\b|body mass index|obes|GLP-?1|diet(ar(y|y)|ary adequacy)|food-?frequency questionnaire|anthropometric)\b/i, "Nutrition, Obesity & Metabolism"],

  // Neuroscience, music & hearing
  [/\b(amusia|musicianship|pitch|speech (in|from) noise|neuromagnetic|auditory|hearing)\b/i, "Neuroscience (Auditory, Music & Hearing)"],

  // Pediatrics & child health
  [/\b(children|pediatric|parents in waiting rooms|school(s)?|grade (two|four)|healthy body image)\b/i, "Pediatrics & Child Health"],

  // Indigenous, disability & community
  [/\b(assistive technology|disabilit(y|ies)|deaf community|first nation|indigenous)\b/i, "Indigenous, Disability & Community Health"],

  // Infectious disease & public health
  [/\b(SARS|outbreak|super-?spreader|public health)\b/i, "Infectious Disease & Public Health"],

  // Social determinants & global
  [/\b(food policy|food strategy|menu labell?ing|social inequities|Brazil|Afghanistan|humaniza(?:ç|c)ão)\b/i, "Global & Social Determinants of Health"],

  // Music/perception experiments (strong catch-all for the Peretz/Zendel set)
  [/\b(amusia|random feedback|tone-?deaf|tapping performance)\b/i, "Neuroscience (Auditory, Music & Hearing)"],

  // Fallback sharpeners for specific recurring titles
  [/\b(“?When the dragon'?s awake|town hall|Memorial University medical graduates)\b/i, "Rural & Remote Health"],

  // Bereavement & death
  [/\b(death|deceased|bereavement|grief|thanatology)\b/i, "Bereavement & Thanatology"],

  // Patient engagement / town halls
  [/\b(community town hall|priorit(y|ies) setting|patients? as partners?)\b/i, "Patient Engagement & SPOR"],

  // Weight-centered pedagogy / stigma
  [/\b(weight-?centered|weight stigma|vitality message|healthy body image)\b/i, "Weight Stigma & Health Pedagogy"],

  // Food policy & immigrant health
  [/\b(menu label?ling|food strategy|food policy|newcomer mothers|immigrant health|food guide)\b/i, "Food Policy & Immigrant Health"],

  // Nursing leadership & outcomes
  [/\b(nursing leadership (style|styles)|30-?day mortality|research utilization by nurses)\b/i, "Nursing Leadership & Outcomes"],

  // Education & workforce
  [/\b(interprofessional (education|work(shop)?)|CME|accreditation|leadership training|novice nurses|quality of work life)\b/i, "Health Professions Education & Workforce"],

  // Primary care & community
  [/\b(medical home|primary care|family medicine|community resilience)\b/i, "Primary Care & Community Health"],

  // Biomechanics & spine
  [/\b(core exercise|lumbar|lower back|muscle activity|dynamic office chair|biomechanic)\b/i, "Biomechanics & Spine"],

  // Measurement & psychometrics / methods
  [/\b(validation study|scale validation|psychometric|illness intrusiveness|reliab(il)?ity analysis|equivalence test|hierarchical linear model(s)?)\b/i, "Measurement & Psychometrics"],
  [/\b(random-?digit-?dial(ing|ling)|case report|quasi-?likelihood|branching processes)\b/i, "Biostatistics & Methods"],

  // Health financing & allocation
  [/\b(funding formula(e)?|need-?based allocation|proximity to death)\b/i, "Health Financing & Allocation"],

  // Genomics & ethics
  [/\b(gene discovery (research|diagnosis)|genomic health|personalized medicine)\b/i, "Genomics Ethics & Translation"],

  // Infectious disease & pharm
  [/\b(cellulitis|cefazolin|probenecid|treatment failure)\b/i, "Infectious Disease Pharmacotherapy"],

  // Environmental & occupational
  [/\b(arsenic|bhopal|toxic gas|modern agriculture|occupational)\b/i, "Environmental & Occupational Health"],

  // Respiratory epi
  [/\b(wheezing phenotype(s)?|airway obstruction|asthma phenotype)\b/i, "Respiratory Epidemiology"],

  // Metabolism & hormones
  [/\b(GLP-?1|overfeeding|metaboli[sc]|obes(e|ity))\b/i, "Nutrition, Obesity & Metabolism"],

  // Social determinants & Brazil
  [/\b(inequities|Programa Sa[úu]de da Fam[ií]lia|PSF\b|discursiv[ao])\b/i, "Social Determinants & Qualitative Health"],

  // Health IT adoption
  [/\b(electronic data management system|technology readiness|acceptance)\b/i, "Digital Health & Health IT"],

  // Music/auditory neuro
  [/\b(amusia|tone-?deaf|pitch|concurrent sound segregation)\b/i, "Neuroscience (Auditory, Music & Hearing)"],

  // Harm reduction & drug policy
  [/\b(safer (opioid )?supply|harm reduction|overdose|drug policy|opioid(?!.*receptor))\b/i, "Harm Reduction & Drug Policy"],

  // HiAP & governance
  [/\b(health in all policies|hiap|cross-?sector(al)? policy|policy integration)\b/i, "Health in All Policies (HiAP) & Governance"],

  // Women’s health & motherhood
  [/\b(non-?resident mothers|single mothers|noncustodial|motherhood|hysterectom(y|ies)|fecundity|maternal identity)\b/i, "Women’s Health, Motherhood & Feminist Health"],

  // Palliative
  [/\b(palliative (care)?|end-?of-?life|hospice)\b/i, "Palliative & End-of-Life Care"],

  // Patient engagement & risk
  [/\b(risk communication|living with chronic risk|patient engagement|priority setting)\b/i, "Risk Communication & Patient Engagement"],

  // Workforce incentives
  [/\b(recruitment incentive(s)?|return-?for-?service|physician retention|work location)\b/i, "Health Workforce Policy & Incentives"],

  // Geriatrics
  [/\b(healthy aged|elderly 80\+|community-?dwelling seniors|geriatric)\b/i, "Geriatrics & Aging Epidemiology"],

  // Science communication
  [/\b(science communication(s)?|public understanding|medical controversy|case-?study controversy)\b/i, "Science Communication & Controversies"],

  // Pharma supply chain
  [/\b(drug (shortage|supply)|pharmaceutical supply chain|stockout)\b/i, "Pharmaceutical Policy & Supply Chains"],

  // Psychosocial
  [/\b(attachment orientation|social support|life-?events distress|psychosocial)\b/i, "Psychosocial Factors & Mental Health"],

  // Comparative policy & federalism
  [/\b(federalism|interprovincial variation|comparative policy)\b/i, "Comparative Health Policy & Federalism"],

  // Nutrition policy
  [/\b(folic acid fortif\w+|fortified flour|neural tube defect prevention)\b/i, "Nutrition Policy & Fortification"],

  // Body composition
  [/\b(bioelectrical impedance|bia\b|dxa|body fat percentage|validation against dxa)\b/i, "Body Composition Methods"],

  // Infant feeding
  [/\b(formula feeding|good mothers|infant feeding practices)\b/i, "Infant Feeding & Maternal Identity"],

  // Gender & sexuality
  [/\b(homosexualidad|homosexuality|gender discourse|repertorios interpretativos)\b/i, "Gender & Sexuality Studies"],

  // Peace & gender
  [/\b(women building peace|peace studies|gender and conflict)\b/i, "Peace, Gender & Health Contexts"],


  // Harm reduction & community impacts
  [/\b(safer (opioid )?supply|harm reduction|overdose|community health centre|intercommunity)\b/i,
   "Harm Reduction & Safer Supply"],

  // Priority-setting & engagement
  [/\b(research priorit(y|ies)|priority-?setting|public engagement|town halls?)\b/i,
   "Patient/Public Involvement & Priority-Setting"],

  // Lifecourse & early experiences
  [/\b(lifelong impact|early experiences|lifecourse|developmental origins)\b/i,
   "Lifecourse & Early Experiences"],

  // Women’s health & caregiving
  [/\b(lone mothers|nonresidential mothers|motherhood|caregiving|gendered health)\b/i,
   "Women’s Health & Caregiving"],

  // Bioethics & ICD decision-making
  [/\b(de-?icd|implantable cardioverter defibrillator|paternalism|autonomy|shared decision)\b/i,
   "Bioethics, Devices & Autonomy"],

  // Patient experience & access
  [/\b(wait[-\s]?time(s)?|wait[-\s]?related satisfaction|patient experience|access to care)\b/i,
   "Patient Experience & Access"],

  // Health ethics & justice concepts
  [/\b(minimal risk|material principle of justice|normative (ethics|structure))\b/i,
   "Health Ethics & Justice"],

  // Anti-racism & equity
  [/\b(anti-?racism|racism in health care|equity, diversity and inclusion|critical race)\b/i,
   "Health Equity & Anti-Racism"],

  // Capacity building & health promotion
  [/\b(capacity-?building|community capacity|health promotion)\b/i,
   "Community Capacity & Health Promotion"],

  // Cultural competence
  [/\b(cultural competence|culturally safe|holistic practice)\b/i,
   "Cultural Competence"],

  // Patient safety & errors
  [/\b(patient safety|self-?reported errors?|adverse events|cross-?national)\b/i,
   "Patient Safety & Medical Errors"],

  // Environmental health
  [/\b(arsenic(osis)?|environmental exposure|contaminants|social determinants)\b/i,
   "Environmental Health & Social Determinants"],

  // Knowledge translation
  [/\b(research utilization|knowledge translation|organizational context)\b/i,
   "Knowledge Translation & Research Use"],

  // Interprofessional education
  [/\b(interprofessional (education|collaboration)|IPE|team-?based learning)\b/i,
   "Interprofessional Education & Collaboration"],

  // Methods: adaptive designs
  [/\b(adaptive design(s)?|response-?adaptive|sequential design|bandit trial)\b/i,
   "Methods: Adaptive/Sequential Designs"],

  // Quant finance / optimization
  [/\b(optimal portfolio|nonparametric learning|stochastic returns)\b/i,
   "Quantitative Finance & Optimization"],

  // Vascular biology & physiology
  [/\b(tetrodotoxin-?resistant|vasorelaxation|vascular smooth muscle|sodium hypochlorite)\b/i,
   "Vascular Biology & Physiology"],

  // Nursing profession (encyclopedic/overview)
  [/\b(nursing profession|nurses?\b|workforce)\b/i,
   "Nursing Profession"]
];

/* ----------------------------------------------------------------------
 * 4) Scoring helpers
 * -------------------------------------------------------------------- */
function addScore(map, cat, score, why) {
  if (!cat) return;
  map[cat] ??= { score: 0, reasons: [] };
  map[cat].score += score;
  if (why) map[cat].reasons.push(why);
}

function collectScores({ hay, doiPrefix, authors }) {
  const scores = {};

  for (const [re, cat] of TOKENS) if (re.test(hay)) addScore(scores, cat, W.J, `journal:${re}`);

  if (doiPrefix) {
    for (const [re, cat] of DOI_HINTS) if (re.test(doiPrefix)) addScore(scores, cat, W.D, `doi:${doiPrefix}`);
  }

  const authorHay = authors || hay;
  if (authorHay) {
    for (const [re, cat] of AUTHOR_HINTS) if (re.test(authorHay)) addScore(scores, cat, W.A, `author:${re}`);
  }

  for (const [re, cat] of KEYWORDS) if (re.test(hay)) addScore(scores, cat, W.K, `kw:${re}`);

  return scores;
}

function pickBest(scores) {
  const entries = Object.entries(scores);
  if (!entries.length) return { category: "Other", scores };

  entries.sort((a, b) => b[1].score - a[1].score);
  const topScore = entries[0][1].score;

  // Confidence gate: DOI-only (1) or any top < 2 → Other
  if (topScore < MIN_CONFIDENCE) return { category: "Other", scores };

  const tied = entries.filter(([, v]) => v.score === topScore);
  if (tied.length === 1) return { category: tied[0][0], scores };

  // Tie-breaker 1: prefer categories hit by a JOURNAL rule
  const withJournal = tied.filter(([, v]) => v.reasons.some((r) => r.startsWith("journal:")));
  if (withJournal.length === 1) return { category: withJournal[0][0], scores };

  // Tie-breaker 2: prefer more reasons (signal density)
  withJournal.sort((a, b) => b[1].reasons.length - a[1].reasons.length);
  tied.sort((a, b) => b[1].reasons.length - a[1].reasons.length);
  const pick = withJournal[0] || tied[0];
  return { category: pick[0], scores };
}

/* ----------------------------------------------------------------------
 * 5) Public API
 * -------------------------------------------------------------------- */
export function inferTopic(pubOrText) {
  const toks = tokensFromInput(pubOrText);
  if (!toks.hay) return "Other"; // empty → truly unknown
  const { category } = pickBest(collectScores(toks));
  return category || "Other";
}

export function explainTopic(pubOrText) {
  const toks = tokensFromInput(pubOrText);
  const scores = collectScores(toks);
  const picked = pickBest(scores);
  return {
    picked: picked.category,
    breakdown: Object.fromEntries(
      Object.entries(scores)
        .sort((a, b) => b[1].score - a[1].score)
        .map(([k, v]) => [k, { score: v.score, reasons: v.reasons }])
    ),
    tokens: toks,
  };
}

export function classifyAll(rows = []) {
  return rows
    .map((row) => ({ topic: inferTopic(row), row }))
    .filter((item, idx, arr) => {
      const key = lc(
        typeof item.row === "string"
          ? item.row.replace(/\s+open\s*$/i, "")
          : [item.row.year, item.row.authors || item.row.title || item.row.url].join("|")
      );
      const firstIdx = arr.findIndex(
        (z) =>
          lc(
            typeof z.row === "string"
              ? z.row.replace(/\s+open\s*$/i, "")
              : [z.row.year, z.row.authors || z.row.title || z.row.url].join("|")
          ) === key
      );
      return firstIdx === idx;
    });
}

export function topicCounts(rows = []) {
  const counts = Object.fromEntries(TOPIC_CATEGORIES.map((c) => [c, 0]));
  for (const r of rows) counts[inferTopic(r)] ??= 0, counts[inferTopic(r)]++;
  return counts;
}

/* ----------------------------------------------------------------------
 * 6) Notes
 * - Order-insensitive: we score all matches, not just the first.
 * - Strong signals (journals) dominate; keywords & authors refine ties.
 * - Confidence gate: if the best score < 2 (e.g., DOI-only), return "Other".
 * - Radiology tightened (no lone "imaging"); Public Health de-broadened.
 * - "Healthcare (Basel)" regex fixed; French + niche hooks added.
 * -------------------------------------------------------------------- */

/* ----------------------------------------------------------------------
 * 7) Balanced batch helpers: cap "Other" (default <= 10)
 *    - Non-breaking: use classifyAllBalanced/topicCountsBalanced when you
 *      want the cap; existing classifyAll/topicCounts() remain unchanged.
 *    - Strategy: keep original picks; if Other > cap, reassign the
 *      lowest-confidence "Other" items to their best *non-Other* category
 *      when any signal exists (score > 0). We never fabricate a category.
 * -------------------------------------------------------------------- */

/** Return a ranked list of [category, {score, reasons}] from scores map */
function rankScores(scores) {
  return Object.entries(scores).sort((a, b) => b[1].score - a[1].score);
}

/** Given a scores map, pick the best non-Other candidate, even if < MIN_CONFIDENCE */
function bestNonOther(scores) {
  const ranked = rankScores(scores).filter(([cat]) => cat !== "Other");
  return ranked.length ? ranked[0][0] : "Other";
}

/** Build rich rows with explanations so we can rebalance confidently */
function _classifyWithExplain(rows = []) {
  return rows.map((row) => {
    const exp = explainTopic(row);
    return {
      picked: exp.picked || "Other",
      // topAlt: best non-Other even if confidence is low (score > 0)
      topAlt: bestNonOther(exp.breakdown || {}),
      // a numeric confidence proxy = top score (0..)
      confidence: (() => {
        const ranked = rankScores(exp.breakdown || {});
        return ranked.length ? ranked[0][1].score : 0;
      })(),
      explain: exp,
      row,
      key: lc(
        typeof row === "string"
          ? row.replace(/\s+open\s*$/i, "")
          : [row.year, row.authors || row.title || row.url].join("|")
      ),
    };
  })
  // de-dup exactly like classifyAll()
  .filter((item, idx, arr) => arr.findIndex((z) => z.key === item.key) === idx);
}

/**
 * Rebalance so that at most maxOther are labeled "Other".
 * We only reassign an "Other" row if:
 *  - There exists a non-Other alternative (topAlt !== "Other"), and
 *  - That alternative had any signal (i.e., present in breakdown with score > 0).
 */
export function classifyAllBalanced(rows = [], maxOther = 10) {
  const rich = _classifyWithExplain(rows);

  // Count current Others
  const others = rich.filter((r) => r.picked === "Other");

  if (others.length <= maxOther) {
    // Nothing to do → return simple shape compatible with classifyAll()
    return rich.map(({ picked, row }) => ({ topic: picked, row }));
  }

  // Sort "Other" items by how strong their best non-Other option is:
  //   1) presence of a non-Other alt,
  //   2) that alt's score (descending),
  //   3) overall confidence (descending)
  const altScore = (r) => {
    const bd = r.explain.breakdown || {};
    const alt = r.topAlt;
    return bd[alt]?.score ?? 0;
  };

  const reassignable = others
    .filter((r) => r.topAlt !== "Other" && altScore(r) > 0)
    .sort((a, b) => altScore(b) - altScore(a) || b.confidence - a.confidence);

  // Number we need to move out of "Other"
  const need = Math.max(0, others.length - maxOther);
  const toFlip = reassignable.slice(0, need);

  // Apply flips
  const flippedKeys = new Set(toFlip.map((r) => r.key));
  const result = rich.map((r) => {
    if (flippedKeys.has(r.key)) {
      return { topic: r.topAlt, row: r.row };
    }
    return { topic: r.picked, row: r.row };
  });

  return result;
}

/** Topic counts under the "Other" cap */
export function topicCountsBalanced(rows = [], maxOther = 10) {
  const counts = Object.fromEntries(TOPIC_CATEGORIES.map((c) => [c, 0]));
  for (const { topic } of classifyAllBalanced(rows, maxOther)) {
    counts[topic] ??= 0; // in case categories change in the future
    counts[topic]++;
  }
  return counts;
}

/* ----------------------------------------------------------------------
 * 8) Weighted “Scoring mode” counts for bar plots
 *    - Use with a UI toggle: counts vs. weighted (sum of top scores).
 *    - Example:
 *        const bars = scoringMode
 *          ? Object.entries(topicWeightedCounts(rows)).map(([k,v]) => ({ topic:k, value:v }))
 *          : Object.entries(topicCountsBalanced(rows, 12)).map(([k,v]) => ({ topic:k, value:v }));
 * -------------------------------------------------------------------- */
export function topicWeightedCounts(rows = []) {
  const byCat = Object.fromEntries(TOPIC_CATEGORIES.map(c => [c, 0]));
  for (const r of rows) {
    const exp = explainTopic(r);
    const cat = exp.picked || "Other";
    const topScore = Object.entries(exp.breakdown || {})
      .sort((a,b) => b[1].score - a[1].score)[0]?.[1]?.score ?? 0;
    byCat[cat] = (byCat[cat] || 0) + topScore;
  }
  return byCat;
}
