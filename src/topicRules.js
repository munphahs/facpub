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
  [/\bhealthcare\s*$begin:math:text$basel$end:math:text$\b/, "Health Services & Policy"],
  [/\bfrontiers\s+in\s+digital\s+health\b/, "AI, Data Science & Methods"],
  [/\bcanadian\s+task\s+force\s+on\s+preventive\s+health\s+care\b/, "Public & Community Health"],
  [/\bcureus\b/, "Public & Community Health"],

  [/(health\s*policy|health\s*services|population\s*health|implementation\s*science|quality\s*improvement)/, "Health Services & Policy"],

  [/(cmajopen|cmajo\b|\bcmaj\b|cfp\.|canadianfamilyphysician|fampra|familypractice|cjrm\b|rrh\.org\.au|rural\s+health)/, "General/Family Medicine"],

  [/(\bcjn\b|fnins|fncel|fneur|\bejn\b|jneurosci|expneurol|\bnbd\b|\bbrain\b|\bstroke\b|parkinson|epilep|alzheim|dementi|auditory\s+cortex|auditory\s+evoked|electroencephalograph(y)?|^eeg\b|meg|erp\b)/, "Neurology & Neuroscience"],

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

  [/(\bjammi\b|microbiol|virol|virus(es)?|infect|\/cid\/|\bijid\b|antimicrob|\bsepsis\b|covid|sars-?cov-?2|influenza|\bhiv\b|hepatitis|\btb\b|tubercul|arbovir|vector-?borne|mosquito)/, "Infectious Disease & Microbiology"],

  [/(\bgenes\b|genom|genet|\bhmg\/\b|humanmolgenet|\bjmg\b|\bhumu\b|variant|mutation|exome|gwas|polygenic|lynch\s+syndrome|brca\b|22q11\.2|y\s+chromosome|rare\s+disease)/, "Genetics & Genomics"],

  [/(\btjnut\b|\bnutrition\b|\bfphys\b|physiol|\bjbiomech\b|gaitpost|\bcbpb\b|biomech|metabol|\bexercise\b|obesity|physical\s+activity|motion\s+capture|imu\b|intervertebral|kinematics)/, "Nutrition, Physiology & Biomechanics"],

  [/(\bcjhh\b|\bmous\.|bioethics|ethic(s)?\b|history\s+of\s+medicine|medical\s+humanities|privacy|consent|photograph(s)?\b)/, "History, Ethics & Humanities"],

  [/(\bthorax\b|\berj\b|european\s+respiratory\s+journal|\bchest\b|respirology|atsjournals|american\s+journal\s+of\s+respiratory|\bcopd\b|\basthma\b|airway|pulmon|oxygen\s+concentrator)/, "Respiratory & Pulmonology"],

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
  [/\b(circular\s+economy|climate\s+change|environmental\s+contaminants?|soil\s+contamination|waste\s+management|landfill|pollutants?|ecological|ecohealth|environmental\s+health|noise\s+exposure|hearing\s+conservation)\b/, "Occupational & Environmental Health"],

  // Cannabis / substance use
  [/\bcannabis|marijuana|opioid|safer\s+opioid\s+supply|substance\s+use|drug\s+policy|drug\s+use|dispensar(y|ies)|retailer(s)?\b/, "Psychiatry & Mental Health"],

  // Food / nutrition environment
  [/\b(food\s+marketing|food\s+environments?|beverage\s+consumption|sugar-?sweetened\s+beverage|breastfeed(ing)?|infant\s+feeding|food\s+security|food\s+insecurity|nutrition\s+literacy|dietary\s+patterns|food\s+affordability|nutritious\s+food\s+basket)\b/, "Nutrition, Physiology & Biomechanics"],

  // Patient engagement / medical education / IMG
  [/\b(patient\s+engagement|reflection-?on-?practice|medical\s+education|virtual\s+care|simulation\s+fidelity|training\s+module|continuing\s+professional\s+development|international\s+medical\s+graduates?|img\b|interprofessional\s+education)\b/, "Health Services & Policy"],

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

  // Neurology & Neuroscience (remove "geroscience" here to avoid ties)
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
  [/\b(older\s+adults|aging\s+population|geroscience)\b/, "Public & Community Health"],

  // Infectious Disease & Microbiology (IPC)
  [/\b(standard\s+precautions|infection\s+control|hand\s+hygien[ee]|hand\s+saniti[sz]er)\b/, "Infectious Disease & Microbiology"],

  // OB/Gyn (prenatal screening)
  [/\b(cf(d| )?na|cell-?free\s+dna|prenatal\s+screen(ing|s))\b/, "Obstetrics, Gynecology & Reproductive Health"],

  // Ophthalmology & ENT (hearing genetics)
  [/\b(sensorineural\s+hearing\s+loss|snhl|adsnhl|kcnq4)\b/, "Ophthalmology & ENT"],

  // Nutrition, Physiology & Biomechanics (lactation)
  [/\b(lactation|human\s+milk\s+expression|domperidone)\b/, "Nutrition, Physiology & Biomechanics"],

  // History, Ethics & Humanities (arts-based KT; theatre)
  [/\b(theatre\s+as\s+(knowledge|kt)|arts?-?based\s+knowledge\s+translation)\b/, "History, Ethics & Humanities"],
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
];

/** ---------------- Keyword net (MEDIUM precision) ---------------- **/
const KEYWORDS = [
  // Neurology (removed lone \bms\b to reduce “milliseconds” noise)
  [/(\bneuro\b|parkinson|\bstroke\b|\btia\b|multiple\s+sclerosis|cognition|dementia|epilep|migraine|neurorehab|spinal\s+cord|auditory(\s+(cortex|processing|evoked))?|\b(eeg|meg|erp)\b|music(al)?\s+memory)/, "Neurology & Neuroscience"],

  [/(rheumat|psoria|spondylo|ankylos|vasculitis|lupus|autoimmun|immun(ity|olog|e))/, "Rheumatology & Immunology"],
  [/(oncolog|\bcancer\b|tumou?r|carcinom|melanom|sarcom|myeloma|leukemi|lymphoma|hematolog|chemotherapy|radiotherapy|lymphedema)/, "Oncology & Hematology"],
  [/(cardio|\bheart\b|arrhythm|atrial\s+fibrillation|coronary|vascular|hypertension|myocard|heart\s+failure|cardiac|echocardio)/, "Cardiology"],
  [/(gastro|hepat|\bibd\b|crohn|ulcerative\s+colitis|\bcolitis\b|\bliver\b|pancrea|biliary|colonoscopy|bowel\s+(prep|cleans))/, "Gastroenterology & Hepatology"],
  [/(obstet|gyneco|pregnan|perinatal|reproduct|maternal|neonat|contracept|fertility|menopaus|endometrio|vulvodynia|midwif(e|ery)|home\s*birth)/, "Obstetrics, Gynecology & Reproductive Health"],
  [/(pediat|paediat|\bchild(hood)?\b|adolesc|kawasaki\s+disease|congenital|autis|ankyloglossia|frenotomy|tongue-?\s*tie|bronchiolitis)/, "Pediatrics & Child Health"],
  [/(dermatol|hidradenitis|psoriasis|eczema|atopic|acne|vitiligo|skin\s+cancer|skin\s+ulcer)/, "Dermatology"],
  [/(surg(ery|ical)|operative|anesth|peri-?operative|laparoscop|arthroscop|transplant|bariatric)/, "Surgery & Anesthesia"],

  // Radiology: keep specific phrases; avoid generic "imaging"
  [/(\bradiol\b|diagnostic\s+imaging|medical\s+imaging|ultrasound|\bct\b|\bmri\b|tomograph|radiography|mammograph|pet\/?ct|spect|pacs\b|picture\s+archiving)/, "Radiology & Imaging"],

  [/(infect|microbio|virol|virus(es)?|bacter|pathogen|antibiot|antimicrobial|\bsepsis\b|covid|sars-?cov-?2|influenza|\bhiv\b|hepatitis|\btb\b|tubercul|\bvaccine\b|vaccination|arbovir|vector-?borne|mosquito)/, "Infectious Disease & Microbiology"],
  [/(genom|genet|exome|gwas|polygenic|variant|mutation|heredit|familial|sequenc|transcriptom|epigenom|lynch\s+syndrome|brca\b|22q11\.2|y\s+chromosome|rare\s+disease)/, "Genetics & Genomics"],
  [/(\bnutrition\b|diet|obesity|metabol|biomech|physiol|\bgait\b|\bexercise\b|physical\s+activity|energy\s+expenditure|motion\s+capture|imu\b|intervertebral|kinematics)/, "Nutrition, Physiology & Biomechanics"],

  // Public & Community Health (de-broadened: removed lone 'population' and 'policy')
  [/(primary\s+care|family\s+medicine|general\s+practice|community\s+health|public\s+health|health\s+services|screening\s+program|telehealth|telemedicine|long-?term\s+care|cohort\s+profile|immigrant|migrant|refugee|smoking\s+cessation|tobacco)/, "Public & Community Health"],

  [/(\basthma\b|\bcopd\b|pulmon|airway|spirometr|bronch(itis|iectasis)|sleep\s+apnea|oxygenation|oxygen\s+concentrator)/, "Respiratory & Pulmonology"],
  [/(nephro|kidney|renal|dialysis|hemodialysis|transplant\s+kidney|proteinuria|albuminuria|glomerul|urolog|prostate|bladder)/, "Nephrology & Urology"],
  [/(depress|anxiet|bipolar|schizophren|mental\s+health|suicid|addict|substance\s+use|ptsd|psych(ology|iatry)|electroconvulsive|ect\b|stimulant|overdose|harm\s+reduction|supervised\s+consumption)/, "Psychiatry & Mental Health"],
  [/(emergency\s+depart(ment)?|\bed\b|prehospital|\bicu\b|critical\s+care|resuscitat|sepsis\s+bundle|triage|emergency\s+medicine)/, "Emergency & Critical Care"],
  [/(orthop|fracture|bone\s+health|osteopor|\bacl\b|meniscus|rotator\s+cuff|sports\s+injur|musculoskeletal|ergonom|spine|lumbar|low\s+back\s+pain|\blbp\b|posture)/, "Orthopedics & Sports Medicine"],
  [/(diabet|insulin|glyc(ae)?mic|endocrin|thyroid|pituitar|hormone|metabolic\s+syndrome)/, "Endocrinology & Diabetes"],
  [/(ophthalm|ocular|retina|glaucoma|cornea|otolaryng|laryng|hearing|tinnitus|sinusitis|otitis|auditory(\s+(processing|evoked))?)/, "Ophthalmology & ENT"],
  [/(pharmac|medication|prescrib|dose|drug\s+(safety|utili[z|s]ation)|adverse\s+drug|stewardship)/, "Pharmacy & Pharmacology"],
  [/(dent(al|istry)|oral\s+health|periodont|endodont|caries|tooth\s+loss)/, "Dental & Oral Health"],
  [/(machine\s*learning|deep\s*learning|artificial\s+intelligence|\bnlp\b|natural\s+language|algorithm|risk\s+score|prediction\s+model|random\s+forest|xgboost|neural\s+network|segmentation|classification|time\s+series|survival\s+model|response-?adaptive\s+design|bandit|markov\s+decision\s+process|adaptive\s+trial|optimal\s+allocation)/, "AI, Data Science & Methods"],
  [/(patient\s+engagement|medical\s+education|interprofessional\s+education|continuing\s+professional\s+development|learning\s+health\s+system|health\s+system\s+impact)/, "Health Services & Policy"],
  [/(seafarer|maritime|occupational\s+noise|noise\s+exposure|hearing\s+conservation|fish\s+harvesters?)/, "Occupational & Environmental Health"],
  [/(food\s+affordability|nutritious\s+food\s+basket)/, "Nutrition, Physiology & Biomechanics"],
  [/(medical\s+photograph|images?\s+online|privacy|consent)/, "History, Ethics & Humanities"],
  [/\bannals?\s+of\s+work\s+exposures\s+and\s+health\b/, "Occupational & Environmental Health"],
  [/\bhuman\s+resources\s+for\s+health\b/, "Health Services & Policy"],
  [/\bcanadian\s+journal\s+of\s+rural\s+medicine\b|\bcjrm\b/, "General/Family Medicine"],
  [/\bplos\s+one\b|\bjournal\.pone\b/, "Public & Community Health"],
  [/\bharm\s*reduction\s+journal\b/, "Psychiatry & Mental Health"],
  [/\bjournal\s+of\s+medical\s+ethics\b|\bbioethics\b/, "History, Ethics & Humanities"],
  [/\bpatient\s+experience\s+journal\b|\bhealth\s+expectations\b/, "Health Services & Policy"],

  // Extra coverage you asked for
  [/\b(vap(e|ing)|e-?cig(ar(et(te)?)?)?)\b/, "Public & Community Health"],
  [/\b(smoking\s+cessation|tobacco\s+cessation|quit\s+smok(ing)?)\b/, "Public & Community Health"],

  [/\b(newborn\s+screen(ing|s)|heel\s+prick\s+test|guthrie\s+test)\b/, "Pediatrics & Child Health"],

  [/\b(hpv\s+testing|colposcopy|cervical\s+(screen|lesion|dysplasia))\b/, "Obstetrics, Gynecology & Reproductive Health"],
  [/\babortion(\s+access|\s+policy)?\b/, "Obstetrics, Gynecology & Reproductive Health"],

  [/\b(residen(cy|ts?)|graduate\s+medical\s+education|gme|parental\s+leave\s+.*residen(cy|ts?)|academic\s+medicine\s+leaders?\b)/, "Health Services & Policy"],
  [/\b(embedded\s+scientist|health\s+system\s+impact|mentorship\s+(programme|program)|workforce\s+(capacity|planning))\b/, "Health Services & Policy"],

  [/\b(patient\s+advisory\s+council(s)?|patient\s+partners?|public\s+engagement\s+in\s+research)\b/, "Health Services & Policy"],

  [/\b(occupational\s+(health|safety)|work(place)?\s+(health|safety)\s+program(me)?s?\b)/, "Occupational & Environmental Health"],
  [/\b(fish(ing|ers?| harvesters?)|maritime\s+labou?r|seafar(ers?|ing))\b/, "Occupational & Environmental Health"],
  [/\b(climate\s+perceptions?|climate\s+autobiograph(y|ies))\b/, "Occupational & Environmental Health"],

  [/\b(baby-?led\s+weaning)\b/, "Nutrition, Physiology & Biomechanics"],
  [/\b(formula-?feed(ing)?|breastfeed(ing)?)\b/, "Nutrition, Physiology & Biomechanics"],

  [/\b(medical\s+assistance\s+in\s+dying|maid\b)\b/, "History, Ethics & Humanities"],
  [/\b(ethics?\s+of\s+(care|policy)|bioethics|philosoph(y|ical)\s+debate)\b/, "History, Ethics & Humanities"],

  [/\b(digital\s+storytelling|arts?-?based\s+(research|kt|knowledge\s+translation))\b/, "History, Ethics & Humanities"],

  [/\b(inappropriateness?\s+of\s+care|overuse\s+in\s+health(care)?|appropriateness?\s+review)\b/, "Health Services & Policy"],
  [/\b(spor\s+evidence\s+alliance|learning\s+health\s+system|evidence-?informed\s+decision)\b/, "Health Services & Policy"],

  [/\b(administrative\s+data\s+validat(ion|e)|case\s+ascertainment|capture-?recapture)\b/, "AI, Data Science & Methods"],

  [/\b(speech-?in-?noise|musicianship|auditory\s+(processing|cortex|memory))\b/, "Neurology & Neuroscience"],
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
 * - "Healthcare (Basel)" regex fixed; "geroscience" kept out of Neuro.
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
