// src/topicRules.js
// Compact 10-bucket taxonomy (9 topics + "Other") tuned to your corpus.
// Exports inferTopic(input:string) -> string label.

// ---------- helpers ----------
const strip = (s = "") => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const tok = (k) => {
  if (k instanceof RegExp) return k;
  const s = String(k);
  if (/[\\^$.*+?()[\]{}|]/.test(s)) return new RegExp(s, "i");        // given regex
  if (/\s/.test(s)) return new RegExp(esc(s), "i");                   // literal phrase
  return new RegExp(`\\b${esc(s)}[\\w-]*\\b`, "i");                   // word prefix
};

// ---------- taxonomy (order matters; earlier wins on ties) ----------
export const TOPIC_RULES = [
  /* 1) Neuroscience & Neurodegeneration (incl. Vision/Ophthalmology, Hearing, Psychology) */
  { label: "Neuroscience & Neurodegeneration", keys: [
    /\b(multiple sclerosis|MS)\b/i, /huntington/i, /parkinson/i, /alzheim/i, /dementia/i,
    /neuro(degenerat|inflamm|development|trauma|physiol|plasticity|cognit)/i,
    /synap/i, /axon|axonal/i, /myelin|oligodendro/i, /astrocyt|microglia/i,
    /hippocamp|amygdala|cortex|cortical|thalam|habenula|prox1/i, /orexin/i,
    /\b(TMS|EEG|MEG|fMRI)\b/i, /optogenet|neuromodulat/i,
    /\bAβ\b|amyloid|tau(opathy)?/i, /\bBDNF\b|\bGABA\b|glutamate|NMDA|TrkB/i,
    // vision/eye
    /\b(retina|retinal|optic|ophthalm|ocular|visual impairment|visi.?o.?-?pro|retinopath(y|ies)?)\b/i,
    // hearing & ENT in neuro context
    /hearing loss|speech-in-noise|otolaryngolog|auditory cortex|auditory processing/i,
    // ion channels & neuromodulators
    /\bPANX1\b|\bpannexin\b/i, /\bP2Y12\b/i, /\bGIRK\b|Kir(2|3)\.\d/i,
    /\bCav1(\.\d+)?\b|L[- ]?type calcium channel/i, /dopamine|atomoxetine/i,
    // clinical neuro
    /stroke\b/i, /seizure|epilep/i, /intracranial hypertension|pseudotumor cerebri/i,
    // learning/behavior (neuro-specific)
    /working memory|metaplasticity|odor associative|pheromone|maternal behavior/i,
    // additional neuro-targeted tokens for your corpus
    /\bKv1\b|voltage[- ]gated potassium/i,                  // Xenopus Kv1 channel papers
    /neural precursor|neurogenesis/i,                       // p107 neural precursor
    /\bMcl-?1\b|\bBcl-?xL\b/i,                               // neuronal survival papers
    /odor preference|olfactory learning/i,      // 2004 rat pup, 2011 odor papers
    /learning[- ]induced/i,                     // 2020 mRNA alterations
    /intermediate[- ]term memory|odor memory/i, // 2011 Harley papers
    /pre[- ]conception|agility/i,               // 2023/2025 agility & pre-conception
    /huntingtin\b/i,                              // 2025 Huntingtin reduction
    /patch[- ]?clamp|whole[- ]?cell/i,            // 2006 visually guided patch clamp
    /TrkA\b|NGF receptor/i,                       // 2005 TrkA/NGF paper
    /prolactin|infant cues|maternal (behaviou?r|care)/i, // 2011 social context & 2010 infant maternal
    /adrenerg(ic|ine).*?(beta|alpha) ?1/i,        // 2006 beta1/alpha1 adrenergic
    /cognitive function|spatial ability/i,
    /infant maternal/i,
    /memory|learning|preference/i,
    /protein synthesis.*memory/i,
    /cognitive function|spatial ability/i,           // Roach 2019; MacLellan 2009
    /infant maternal/i,                              // Raineki 2010
    /protein synthesis.*memory/i,                    // Adamec 2006
    /odor preference learning/i,                     // (already helped; keep strong)
    /neurite outgrowth/i,                            // Rankin 2008
    /\bp75NTR\b|neurotroph|NGF\b/i,                  // Rankin 2009; Clarke/Fudge duo
    /neuronal culture|dorsal root ganglion|DRG\b/i,  // Tucker 2005
  ]},

  /* 2) Genetics/Genomics & Rare Diseases */
  { label: "Genetics/Genomics & Rare Diseases", keys: [
    /genom|genetic|gwas|polygen/i, /variant|mutation|polymorph|copy number|CNV\b|micro(deletion|duplication)/i,
    /exome|whole[- ]?exome|RNA[- ]?seq|single[- ]cell|epigenom|methylom|transcriptom/i,
    /\bAPOBEC\b|\bAID\b|\bAICDA\b|ZNF\d+|Tip60\b|SF3B4\b|InSiGHT\b/i,
    /MethMotif|NanoVar|TFregulomeR|ColocZStats/i,
    /syndromic|rare disease|familial cohort|Lynch syndrome/i,
    /neurexin|SHANK1|autism spectrum|ASD|intellectual disabilit/i,
    /\bASTN2\b|\bTRIM32\b|\bFOXC1\b|\bCDH1\b/i,
    /sex reversal|disorders of sex development|DSD\b/i,      // Smyk et al.
    /SWI\/SNF|chromatin remodel/i,              // 2018 SWI/SNF genes
    /histone deacetylase|HDAC inhibition/i,     // 2017 HDAC inhibition
    /16q24|microdeletion|microduplication/i,   // 2013 deletions in 16q24
    /rare deletion|intellectual disabilit/i,   // catch remaining CNV/rare variants
    /inborn error|X[- ]linked/i,                  // 2012 common X-linked inborn error
    /phenotypic spectrum/i,                       // 2010 phenotypic spectrum paper
    /loci at chromosomes/i,                       // 2009 loci at chr 13/19/20
    /diagnostic cytogenomic|array ?CGH|microarray/i, // 2011 diagnostic cytogenomics
    /SNPs?\b|single[- ]nucleotide/i,
    /transcription(al)? (cofactor|factor)/i,
    /SWI\/SNF|chromatin remodel/i,
    /expression.*transcript/i,
    /activation induced deaminase|AID C-?terminal/i,
    /histone deacetylase|HDAC/i,
    /transcript\s*expression/i,                      // Eslamloo 2019
    /SNPs?\b|single[- ]nucleotide/i,                 // Jarjanazi 2008; Savas 2006/2005
    /transcription(al)? (cofactor|factor)/i,         // MIER1 & friends
    /SWI\/SNF|chromatin remodel/i,                   // SWI/SNF
    /activation induced deaminase|AID C-?terminal/i, // Zahn 2014; Larijani 2012
    /histone deacetylase|HDAC/i,                     // Bhattacharya 2017
  ]},

  /* 3) Cardiovascular & Vascular Biology (incl. Hemostasis/Thrombosis) */
  { label: "Cardiovascular & Vascular Biology", keys: [
    /cardio|myocard|ischemi|arrhythm/i, /\bECG\b|electrocardiogram/i,
    /vascular|endotheli|arter|venous|capillar|vasodilator|vasomotor|baroreflex/i,
    /hemodynamic|sympathetic neurovascular|metaboreflex/i,
    /blood pressure|hypertension/i, /angiotensin|renin/i,
    /thrombo|thrombophil|coagul|hemostas|platelet|venous thromboembolism|VTE|DVT|pulmonary embolism/i,
    /ryanodine|RyR ?2|K201|JTV[- ]?519/i, /myocyte|cardiomyocyte/i, /troponin/i,
    /sympathetic nerve activ|beta1[- ]adreno|alpha1[- ]adreno/i, // 2006 Harley adrenergic + 2020 sympathetic nerve activity
    /vasodilation|vasodilator/i,                               // 2014 Kagota vasodilation
    /pulmonary veins|haemodynamic comparison/i,                // 2009/2004 pulmonary & haemodynamic
    /sympathetic ner/i,                           // 2020 “sympathetic ner…” truncation
    /haemodynamic|hemodynamic/i,                  // 2004 haemodynamic comparison
    /His[- ]?Purkinje|Purkinje( fiber| system)?/i,// 2016 modeling His–Purkinje
    /cardiac troponin\b|troponin release/i,          // Kuster 2014
    /\bCa\(?:2\+\)?\s*release channel|ryanodine receptor/i, // Hirose 2008
    /determinants of (?:arrhythm|repolarization|alternans)/i, // Armoundas 2007
    /haemodynamic|hemodynamic (?:effect|response)/i, // Tabrizchi & Ford 2004
    /calcium channel (?:blocker|antagonist|inhibitor)|vasorelax/i, // Ford 2006

  ]},

  /* 4) Immunology & Inflammation (incl. Infectious Disease) */
  { label: "Immunology & Inflammation", keys: [
    /immun|innate|adaptive/i, /inflamm|inflammasome|cytokine|chemokin/i,
    /\bT[- ]?cell\b|\bB[- ]?cell\b|\bNK\b|\bnatural killer\b|macrophage|monocyte\b|microglia(?!.*(vision|retina))/i,
    /infection|pathogen|viral|virus|hepatitis|HIV|influenza|SARS[- ]?CoV[- ]?2|vaccine/i,
    /antibody|Ig[AMG]\b|antigen|HLA\b|HLA class/i,
    /psoriatic arthritis|ustekinumab|ixekizumab/i,
    /phagocytosis|homeostasis in the brain/i,   // 2019 phagocytosis paper
    /CD14[- ]?CD36|\bmonocyte(s)?\b/i,            // 2007 CD14-CD36+ monocytes
    /cyclooxygenase|COX[- ]?2/i,                  // 2006 COX expression
    /hepatocyte(s)?.*cytotoxic/i,                 // 2006 hepatocytes as cytotoxic effectors
    /Bupleurum|polysaccharide.*(immune|cytokine|macrophage|T[- ]?cell)/i, // Tong 2017
    /hepatitis|HCV\b|core protein/i,                                      // Gujar 2006

  ]},

  /* 5) Cancer & Oncology */
  { label: "Cancer & Oncology", keys: [
    /oncolog|neoplasm|tumou?r|metasta|carcinoma/i, /glioblast|leukem|lymphom|adenocarcinoma|colorectal/i,
    /\bHPV\b(?!.*(endotheli|receptor))/i, /biomarker.*cancer/i, /cancer stem cell/i,
    /lapatinib/i, /kallikrein/i, /\bCDH1\b|gastrectomy|hereditary diffuse gastric/i, /Lynch syndrome/i,
    /breast cancer|ovarian cancer|colon cancer|prostate cancer/i,
    /Barrett'?s esophagus/i,                                  // GI dysplasia/onc risk paper

  ]},

  /* 6) Molecular/Cell Signaling & Kinases */
  { label: "Molecular/Cell Signaling & Kinases", keys: [
    /signal(ing)? pathway|transduction/i, /protein kinase|\bPKC\b|\bMEK\b|\bERK\b|\bAKT\b|\bMAPK\b|\bPI3K\b/i,
    /Wnt|β[- ]?catenin|TCF\/?LEF|Pygo(pus)?/i, /IRF1\b|Ras\/?MEK|c[- ]?Abl/i,
    /connexin|Cx\d+\b|pannexin|PANX\d+\b/i,
    /microRNA|\bmiR[- ]?\d+\b|epigen|chromatin|HDAC|Tip60/i,
    /apoptos|nuclear localization|autophagy/i,
    /heat shock|Hsp-?27|Hsp70/i,
    // structural/biophysical — keep tight
    /\bNMR\b|nuclear magnetic resonance|cryo[- ]?EM|crystallograph(y|ic)|X[- ]?ray crystallograph/i,
    // adhesion/ILK/FAK set used in your list
    /focal adhesion|FAK\b|integrin[- ]linked kinase|(?:\b|_)ILK\b/i,
    /PKA|protein kinase A/i,                   // 2012 olfactory bulb PKA
    /calpain|CaMKII|Epac/i,                    // 2013 calpain, 2016 CaMKII, 2015 Epac
    /MMP-3|matrix metalloproteinase/i,         // 2013 psychosine-induced gliosis, 2005 MMP-12
    /Bcl-?xL|Mcl-?1/i,                         // 2012 adult neurons survival
    /TXNIP\b|AFq1\b/i,                            // 2017 TXNIP–AFq1 interaction
    /rapamycin|mTOR\b/i,                          // 2014 single rapamycin administration
    /Nodal (signaling|response)/i,                // 2007 Nodal regulation
    /Ca\(v\)1|Ca ?v ?1\b/i,                       // 2014 Ca(v)1 title variants
    /protein (expression|structure|solubili[sz]ation|pattern|domain)/i,
    /catalytic pocket|active site/i,
    /regulatory feature/i,
    /PU\b(?!.*virus)/i,
    /methodological consideration/i,
    /cloning and characterization/i,
    /SANT domain/i,
    /Nodal (signaling|response|regulation)/i,
    /protein (?:expression pattern|solubili[sz]ation|structure|domain)/i, // McCarthy 2013; Peach 2012
    /catalytic pocket|active site/i,                                      // King 2015
    /regulatory feature/i,                                                // Quinlan 2017
    /methodological consideration/i,                                      // Macphee 2010
    /cloning and characterization/i,                                      // Thorne 2005
    /Nodal (?:signaling|response|regulation)|\bNodal\b/i,                 // Kennedy 2007
    /cell proliferation on (?:a|an)|\b(biomaterial|scaffold|substrate)\b/i, // Gendron 2012

  ]},

  /* 7) Metabolic, Endocrine & Nutrition (incl. Renal) */
  { label: "Metabolic, Endocrine & Nutrition", keys: [
    /metabol|mitochondria(l)?|oxidative stress/i, /diabet|insulin|glyc/i,
    /lipid|obes|BMI\b/i, /thyroid|thyroglobulin|iodine/i, /vitamin\s?D/i, /ghrelin|leptin|bile acid/i,
    /glucose|GLP[- ]?1\b/i, /nutrition|diet|dietary|probiotic/i, /endocrin/i,
    /renal|kidney|nephro|urine concentrating/i, /osteopor|bone density/i,
    /\bKir2(?:\.\d+)?\b|inward[- ]rectifier|renal (?:epithel|tubule)/i,   // Millar 2006
  ]},

  /* 8) Musculoskeletal, Pain & Aging */
  { label: "Musculoskeletal, Pain & Aging", keys: [
    /osteoarthrit|cartilage|bone|skelet/i, /knee|hip|spine|glute(us)?/i,
    /gait|agility|rehabilitation|exercise|training/i,
    /\bpain\b|chronic pain|postoperative joint pain/i,
    /aging|older adult|geriatric|frailty|intergenerational continuity/i,
    /muscle problems|juvenile-onset/i,          // 2019 muscle paper
    /paw[- ]dragging/i,                         // 2015 Roome rodent gait paper
  ]},

  /* 9) Environmental & Marine Biology */
  { label: "Environmental & Marine Biology", keys: [
    /environment|pollut|toxicolog/i, /marine|ocean|arctic|aquaculture|salmon|lumpfish/i,
    /seabird|puffin|kittiwake|foraging/i, /microplastic|nanoplastic/i,
    /water temperature|aquatic|zebrafish/i
  ]},

  /* 10) Public Health, Policy & Medical Education */
  { label: "Public Health, Policy & Medical Education", keys: [
    /public (outreach|engagement|interest group)/i, /community[- ]based|knowledge translation/i,
    /screening(?!.*(molecular|western))/i, /newborn screening/i, /utilization|barriers|facilitators/i,
    /equity|diversity|inclusion|policy|health services/i,
    /decision[- ]making|guideline|best practice/i, /patient[- ]reported outcome|psychometric|qualitative/i,
    /medical student|career[- ]counseling|curriculum|exam performance|anatomy (education|testing)/i,
    /stigma/i,
    // public-health specific tokens from your list
    /folic acid fortification|neural[- ]tube defects|spina bifida/i,
    /health explored|journey in health/i,
    /neural[- ]tube defect|folic acid fortification|spina bifida/i, // De Wals folic acid series
    /public provider knowledge|semiparametric|likelihood ratio/i,   // Lawless/Yilmaz statistical papers
    /random[- ]digit[- ]dialing|telephone survey/i, // 2009 survey validity
    /editorial|commentary|Accepting the torch|It is all about the structure|Value of "00" One/i, // policy/essay pieces
    /editorial|commentary|Accepting the torch|It is all about the structure|Value of "00" One/i,
    /International Union of Physiological Sciences/i,
    /public and provider knowledge|provider knowledge/i, // Mathews 2007
    /editorial|commentary|Accepting the torch|Value of "00" One/i,        // (sweeps any remaining essays)

  ]},

  /* 11) Clinical Medicine & Case Reports (non-oncology) */
  { label: "Clinical Medicine & Case Reports", keys: [
    /case (report|series)/i,
    /chondroma|nasal septum|otolaryngolog|ENT/i,
    /idiopathic (?!.*(lung|pulmonary fibrosis))/i, /congenital (?!.*(tumor|cancer))/i,
    /surg(ery|ical)|gastrectomy/i,
    /uterine|myometrium|pregnan(cy|t)/i,                      // OB/myometrium papers
    /biocompatib|biodegradab/i,
    /procedure for selecting|culturing cells/i,
    /adverse drug (?:reaction|mechanism)/i,                               // Tabrizchi 2010
    /biocompatib|biodegradab/i                                            // Shaker 2012/2010
  ]},

  /* 12) Other (fallback) */
  { label: "Other", keys: [] }
];

// ---------- compiled ----------
const COMPILED = TOPIC_RULES.map(({ label, keys }) => ({
  label,
  regs: (keys || []).map(tok),
  wts:  (keys || []).map(k => (k instanceof RegExp || /\s/.test(String(k)) ? 2 : 1))
}));

// ---------- API ----------
export function inferTopic(input = "") {
  const t = strip(String(input));
  let best = { label: "Other", score: 0 };
  for (const { label, regs, wts } of COMPILED) {
    let s = 0;
    for (let i = 0; i < regs.length; i++) if (regs[i].test(t)) s += wts[i];
    if (s > best.score) best = { label, score: s };
  }
  return best.label;
}

// Optional multi-label (not used by the dashboard, but handy while tuning)
export function inferTopics(input = "", { topN = 3, threshold = 2 } = {}) {
  const t = strip(String(input));
  const scored = COMPILED.map(({ label, regs, wts }) => {
    let s = 0; for (let i = 0; i < regs.length; i++) if (regs[i].test(t)) s += wts[i];
    return { label, score: s };
  }).sort((a,b) => b.score - a.score);
  const max = scored[0]?.score || 0;
  const picks = scored.filter(x => x.score >= Math.max(threshold,1)).slice(0, topN);
  return (!picks.length || max === 0) ? ["Other"] : picks;
}

export default TOPIC_RULES;