// src/topicRules.js (scored version)
// Robust, order-insensitive topic inference tuned for sparse rows.
// Call: inferTopic({ authors?, title?, url?, venue?, year? }) OR inferTopic("plain text")
// New: scoring-based classifier (journals>keywords>authors>DOI), tie-breakers, and an `explainTopic` helper.

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

// --- Journal / path tokens (HIGH PRECISION) --- //
const TOKENS = [
  [/\b(jamanetworkopen|bmjebm|bmcpublichealth|publichealth|pgph|s41997-)\b/, "Public & Community Health"],
  [/(bmjopen|plosone|journal\.pone|jmir|medrxiv|researchsquare)\b/, "Public & Community Health"],
  [/(health\s*policy|health\s*services|population\s*health|implementation\s*science|quality\s*improvement)/, "Health Services & Policy"],

  [/(cmajopen|cmajo\b|\bcmaj\b|cfp\.|canadianfamilyphysician|fampra|familypractice|cjrm\b|rrh\.org\.au|rural\s+health)/, "General/Family Medicine"],

  [/(\bcjn\b|fnins|fncel|fneur|\bejn\b|jneurosci|expneurol|\bnbd\b|\bbrain\b|\bstroke\b|parkinson|epilep|alzheim|dementi)/, "Neurology & Neuroscience"],

  [/(\bjrheum\b|rheumat|\bacr\.|spondylo|ankylos|psoriatic\s+arthritis)/, "Rheumatology & Immunology"],

  [/(curroncol|oncolog|cancer|hematol|\bclml\b|\bjco\b|\bijc\b|annalsofsurgicaloncology|s10434-)/, "Oncology & Hematology"],

  [/(\bcjca\b|canadian\s+journal\s+of\s+cardiology|\bcirculation\b|\bheart\b|\bhrthm\b|arrhythm|cardio|myocard|atrial\s+fibrillation|heart\s+failure)/, "Cardiology"],

  [/(j\.gastro|gastroenterology|\bgastro\b|\bhepatology\b|\bctg\b|\bibd\b|\bjcag\b|crohn|colitis|\bliver\b)/, "Gastroenterology & Hepatology"],

  [/(\bjogc\b|\bijgo\b|obstet|gynecol|reprod|perinatal|maternal|neonat|pregnan|contracept|fertility)/, "Obstetrics, Gynecology & Reproductive Health"],

  [/(pch\/|paediatrics? ?& ?child|jamapediatrics|\bfped\b|pediatr|adolesc|kawasaki\s+disease)/, "Pediatrics & Child Health"],

  [/(\bjaad\b|dermatol|hidradenitis|psoriasis|eczema|atopic\s+dermatitis)/, "Dermatology"],

  [/(\bcjs\b|\bsurg\b|anesth|\bcjane\b|canadianjournalofanesthesia|peri-?operative|\bjvscit\b|operative)/, "Surgery & Anesthesia"],

  [/(\bajnr\b|\bradiol\b|imaging|ultrasound|\bct\b|\bmri\b|tomograph|pet\/?ct|spect)/, "Radiology & Imaging"],

  [/(\bjammi\b|microbiol|virol|infect|\/cid\/|\bijid\b|antimicrob|\bsepsis\b|covid|sars-?cov-?2|influenza|\bhiv\b|hepatitis|\btb\b|tubercul)/, "Infectious Disease & Microbiology"],

  [/(\bgenes\b|genom|genet|\bhmg\/\b|humanmolgenet|\bjmg\b|\bhumu\b|variant|mutation|exome|gwas|polygenic)/, "Genetics & Genomics"],

  [/(\btjnut\b|\bnutrition\b|\bfphys\b|physiol|\bjbiomech\b|gaitpost|\bcbpb\b|biomech|metabol|\bexercise\b|obesity|physical\s+activity)/, "Nutrition, Physiology & Biomechanics"],

  [/(\bcjhh\b|\bmous\.|bioethics|ethic(s)?\b|history\s+of\s+medicine|medical\s+humanities)/, "History, Ethics & Humanities"],

  [/(\bthorax\b|\berj\b|european\s+respiratory\s+journal|\bchest\b|respirology|atsjournals|american\s+journal\s+of\s+respiratory|\bcopd\b|\basthma\b|airway|pulmon)/, "Respiratory & Pulmonology"],

  [/(kidney\s+international|\bjasn\b|nephrol|urology|\burol\b|dialysis|hemodialysis|\bckd\b|\baki\b|\besrd\b)/, "Nephrology & Urology"],

  [/(psychiat|depress|anxiet|suicid|mental\s+health|addict|substance\s+use|psycholog)/, "Psychiatry & Mental Health"],

  [/(annals\s+of\s+emergency\s+medicine|\bacem\b|\bjcem\b|intensive\s+care|critical\s+care|\bicu\b|trauma|prehospital)/, "Emergency & Critical Care"],

  [/(orthop|bone\s*&?\s*joint|arthro|sports\s+med|\bacl\b|meniscus|rotator\s+cuff)/, "Orthopedics & Sports Medicine"],

  [/(diabetes\s+care|diabetolog|endocrinolog|insulin|glycemic|thyroid|pituitar)/, "Endocrinology & Diabetes"],

  [/(ophthalmolog|retina|glaucoma|cornea|ocular|otolaryngology|head\s*&\s*neck\s*surgery|laryngoscope|\bent\b|hearing|otology)/, "Ophthalmology & ENT"],

  [/(pharmac(y|ol)|medication|drug\s+safety|adverse\s+event|antibiotic\s+stewardship|prescrib)/, "Pharmacy & Pharmacology"],

  [/(dent(al|istry)|oral\s+health|periodont|endodont|prosthodont)/, "Dental & Oral Health"],

  [/(machine\s*learning|deep\s*learning|artificial\s+intelligence|\bnlp\b|natural\s+language|predictive\s+model|algorithm|validation\s+cohort|propensity\s+score|time\s+series|segmentation|classification)/, "AI, Data Science & Methods"],
];

// --- DOI prefix hints (LOWER PRECISION) --- //
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

// --- Author clusters (fall-backs) --- //
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
  [/\b(curran v|lukewich|mathews m|asghari|maddalena|najafizada)\b/, "Public & Community Health"],
  [/\b(prowse r|olstad dl|raine kd)\b/, "Nutrition, Physiology & Biomechanics"],
  [/\b(jogc|do valle|hallis?on|bajzak)\b/, "Obstetrics, Gynecology & Reproductive Health"],
];

// --- Keyword net (broad, MEDIUM precision) --- //
const KEYWORDS = [
  [/(\bneuro\b|parkinson|\bstroke\b|\btia\b|multiple\s+sclerosis|\bms\b(?!\s*\w)|cognition|dementia|epilep|migraine|neurorehab|spinal\s+cord)/, "Neurology & Neuroscience"],
  [/(rheumat|psoria|spondylo|ankylos|vasculitis|lupus|autoimmun|immun(ity|olog|e))/, "Rheumatology & Immunology"],
  [/(oncolog|\bcancer\b|tumou?r|carcinom|melanom|sarcom|myeloma|leukemi|lymphoma|hematolog|chemotherapy|radiotherapy)/, "Oncology & Hematology"],
  [/(cardio|\bheart\b|arrhythm|atrial\s+fibrillation|coronary|vascular|hypertension|myocard|heart\s+failure|cardiac|echocardio)/, "Cardiology"],
  [/(gastro|hepat|\bibd\b|crohn|ulcerative\s+colitis|\bcolitis\b|\bliver\b|pancrea|biliary)/, "Gastroenterology & Hepatology"],
  [/(obstet|gyneco|pregnan|perinatal|reproduct|maternal|neonat|contracept|fertility|menopaus|endometrio)/, "Obstetrics, Gynecology & Reproductive Health"],
  [/(pediat|paediat|\bchild(hood)?\b|adolesc|kawasaki\s+disease|congenital)/, "Pediatrics & Child Health"],
  [/(dermatol|hidradenitis|psoriasis|eczema|atopic|acne|vitiligo|skin\s+cancer)/, "Dermatology"],
  [/(surg(ery|ical)|operative|anesth|peri-?operative|laparoscop|arthroscop|transplant|bariatric)/, "Surgery & Anesthesia"],
  [/(\bradiol\b|imaging|ultrasound|\bct\b|\bmri\b|tomograph|radiography|mammograph|pet\/?ct|spect)/, "Radiology & Imaging"],
  [/(infect|microbio|virol|bacter|pathogen|antibiot|antimicrobial|\bsepsis\b|covid|sars-?cov-?2|influenza|\bhiv\b|hepatitis|\btb\b|tubercul|\bvaccine\b|vaccination)/, "Infectious Disease & Microbiology"],
  [/(genom|genet|exome|gwas|polygenic|variant|mutation|heredit|familial|sequenc|transcriptom|epigenom)/, "Genetics & Genomics"],
  [/(\bnutrition\b|diet|obesity|metabol|biomech|physiol|\bgait\b|\bexercise\b|physical\s+activity|energy\s+expenditure)/, "Nutrition, Physiology & Biomechanics"],
  [/(primary\s+care|family\s+medicine|general\s+practice|community\s+health|public\s+health|population|health\s+services|\bpolicy\b|screening\s+program|telehealth|telemedicine)/, "Public & Community Health"],
  [/(\basthma\b|\bcopd\b|pulmon|airway|spirometr|bronch(itis|iectasis)|sleep\s+apnea|oxygenation)/, "Respiratory & Pulmonology"],
  [/(nephro|kidney|renal|dialysis|hemodialysis|transplant\s+kidney|proteinuria|albuminuria|glomerul|urolog|prostate|bladder)/, "Nephrology & Urology"],
  [/(depress|anxiet|bipolar|schizophren|mental\s+health|suicid|addict|substance\s+use|ptsd|psych(ology|iatry))/, "Psychiatry & Mental Health"],
  [/(emergency\s+depart(ment)?|\bed\b|prehospital|\bicu\b|critical\s+care|resuscitat|sepsis\s+bundle|triage)/, "Emergency & Critical Care"],
  [/(orthop|fracture|bone\s+health|osteopor|\bacl\b|meniscus|rotator\s+cuff|sports\s+injur)/, "Orthopedics & Sports Medicine"],
  [/(diabet|insulin|glyc(ae)?mic|endocrin|thyroid|pituitar|hormone|metabolic\s+syndrome)/, "Endocrinology & Diabetes"],
  [/(ophthalm|ocular|retina|glaucoma|cornea|otolaryng|laryng|hearing|tinnitus|sinusitis|otitis)/, "Ophthalmology & ENT"],
  [/(pharmac|medication|prescrib|dose|drug\s+(safety|utili[z|s]ation)|adverse\s+drug|stewardship)/, "Pharmacy & Pharmacology"],
  [/(dent(al|istry)|oral\s+health|periodont|endodont|caries|tooth\s+loss)/, "Dental & Oral Health"],
  [/(machine\s*learning|deep\s*learning|artificial\s+intelligence|\bnlp\b|natural\s+language|algorithm|risk\s+score|prediction\s+model|random\s+forest|xgboost|neural\s+network|segmentation|classification|time\s+series|survival\s+model)/, "AI, Data Science & Methods"],
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
  const tied = entries.filter(([, v]) => v.score === topScore);

  if (tied.length === 1) return { category: tied[0][0], scores };

  // Tie-breaker 1: prefer categories hit by a JOURNAL rule
  const withJournal = tied.filter(([, v]) => v.reasons.some(r => r.startsWith("journal:")));
  if (withJournal.length === 1) return { category: withJournal[0][0], scores };

  // Tie-breaker 2: prefer non-Other with more reasons (signal density)
  withJournal.sort((a, b) => b[1].reasons.length - a[1].reasons.length);
  tied.sort((a, b) => b[1].reasons.length - a[1].reasons.length);
  const pick = (withJournal[0] || tied[0]);
  return { category: pick[0], scores };
}

/* ----------------------------------------------------------------------
 * 5) Public API
 * -------------------------------------------------------------------- */
export function inferTopic(pubOrText) {
  const toks = tokensFromInput(pubOrText);
  if (!toks.hay) return "Other";
  const { category } = pickBest(collectScores(toks));
  return category;
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
      const firstIdx = arr.findIndex((z) => lc(
        typeof z.row === "string"
          ? z.row.replace(/\s+open\s*$/i, "")
          : [z.row.year, z.row.authors || z.row.title || z.row.url].join("|")
      ) === key);
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
 * - Strong signals (journals) dominate, keywords & authors refine ties.
 * - Use `explainTopic(pub)` during QA to see why a title landed in a bucket.
 * - Regex tweaks: fixed \baki\b/\besrd\b case-insensitive, limited \bct\b false-positives, added otology.
 * -------------------------------------------------------------------- */
