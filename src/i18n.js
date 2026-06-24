// src/i18n.js — Multi-language support for TaxTalk
// Languages: English (en), Hindi (hi), Gujarati (gu)
// Usage: import { useTranslation, t } from '../i18n.js';

import { useState, useEffect, createContext, useContext } from 'react';

// ── Language context ──────────────────────────────────────────────────────────
const LangContext = createContext({ lang: 'en', setLang: () => {} });
export const LangProvider = LangContext.Provider;
export function useLang() { return useContext(LangContext); }

// ── Translation hook ──────────────────────────────────────────────────────────
export function useTranslation() {
  const { lang, setLang } = useLang();
  return { lang, setLang, t: (key, vars) => translate(key, lang, vars) };
}

// ── Translate function ────────────────────────────────────────────────────────
export function translate(key, lang = 'en', vars = {}) {
  const entry = STRINGS[key];
  if (!entry) return key; // fallback to key
  let str = entry[lang] || entry.en || key;
  // Replace {{var}} placeholders
  Object.keys(vars).forEach(k => { str = str.replace(new RegExp(`{{${k}}}`, 'g'), vars[k]); });
  return str;
}

// Short alias
export const t = translate;

// ── Translation strings ───────────────────────────────────────────────────────
export const STRINGS = {

  // ── App nav ────────────────────────────────────────────────────────────────
  'nav.file_return':  { en: 'File return', hi: 'रिटर्न दाखिल करें', gu: 'રિટર્ન ભરો' },
  'nav.my_returns':   { en: 'My returns',  hi: 'मेरे रिटर्न', gu: 'મારા રિટર્ન' },
  'nav.ca_review':    { en: 'CA review',   hi: 'CA समीक्षा', gu: 'CA સમીક્ષા' },
  'nav.account':      { en: 'Account',     hi: 'खाता', gu: 'એકાઉન્ટ' },
  'nav.sign_out':     { en: 'Sign out',    hi: 'साइन आउट', gu: 'સાઇન આઉટ' },

  // ── Chat welcome ───────────────────────────────────────────────────────────
  'chat.welcome_1':   {
    en: '👋 Hi! I am TaxTalk — your CA assistant from RB Shah & Associates.',
    hi: '👋 नमस्ते! मैं TaxTalk हूँ — RB Shah & Associates का आपका CA सहायक।',
    gu: '👋 નમસ્તે! હું TaxTalk છું — RB Shah & Associates નો તમારો CA સહાયક।',
  },
  'chat.welcome_2':   {
    en: 'Before we begin — do you have your previous year ITR or Computation sheet? Uploading it saves time by pre-filling your details.',
    hi: 'शुरू करने से पहले — क्या आपके पास पिछले साल का ITR या Computation sheet है? इसे अपलोड करने से आपका समय बचेगा।',
    gu: 'શરૂ કરતા પહેલાં — શું તમારી પાસે ગત વર્ષનો ITR અથવા Computation sheet છે? અપલોડ કરવાથી સમય બચશે।',
  },
  'chat.welcome_3':   {
    en: 'You can also skip this and enter details manually.',
    hi: 'आप इसे छोड़ कर विवरण मैन्युअल रूप से भी दर्ज कर सकते हैं।',
    gu: 'તમે આ છોડીને વિગતો જાતે પણ દાખલ કરી શકો છો।',
  },

  // ── AIS upload ─────────────────────────────────────────────────────────────
  'ais.upload_label':  { en: 'Upload AIS / Form 26AS', hi: 'AIS / Form 26AS अपलोड करें', gu: 'AIS / Form 26AS અપલોડ કરો' },
  'ais.upload_sub':    { en: 'PDF from incometax.gov.in', hi: 'incometax.gov.in से PDF', gu: 'incometax.gov.in થી PDF' },
  'ais.skip':          { en: "Skip — I'll upload later or enter manually", hi: "छोड़ें — बाद में अपलोड करूँगा / मैन्युअल दर्ज करूँगा", gu: "છોડો — પછી અપલોડ કરીશ / જાતે દાખલ કરીશ" },
  'ais.found':         { en: 'Here is what I found in your AIS:', hi: 'आपके AIS में यह जानकारी मिली:', gu: 'તમારા AIS માં આ માહિતી મળી:' },
  'ais.looks_correct': { en: 'Looks correct ✓', hi: 'सही लगता है ✓', gu: 'સાચું છે ✓' },
  'ais.some_differ':   { en: 'Some details differ', hi: 'कुछ विवरण अलग हैं', gu: 'કેટલીક વિગતો અલગ છે' },

  // ── Income types ───────────────────────────────────────────────────────────
  'income.salary':     { en: 'Salary income', hi: 'वेतन आय', gu: 'પગાર આવક' },
  'income.business':   { en: 'Business receipts', hi: 'व्यापार प्राप्तियां', gu: 'વ્યવસાય આવક' },
  'income.interest':   { en: 'Interest income', hi: 'ब्याज आय', gu: 'વ્યાજ આવક' },
  'income.dividend':   { en: 'Dividends', hi: 'लाभांश', gu: 'ડિવિડન્ડ' },
  'income.tds':        { en: 'Total TDS', hi: 'कुल TDS', gu: 'કુલ TDS' },
  'income.adv_tax':    { en: 'Advance tax', hi: 'अग्रिम कर', gu: 'અગ્રિમ કર' },

  // ── Extra income types (chips) ────────────────────────────────────────────
  'extra.salary_other':  { en: 'Salary from another employer', hi: 'दूसरे नियोक्ता से वेतन', gu: 'અન્ય નોકરીદાતા પાસેથી પગાર' },
  'extra.business':      { en: 'Business / professional income', hi: 'व्यापार / पेशेवर आय', gu: 'વ્યવસાય / વ્યાવસાયિક આવક' },
  'extra.hp':            { en: 'House property (rental)', hi: 'मकान संपत्ति (किराया)', gu: 'ઘર સ્વત્વ (ભાડું)' },
  'extra.cg':            { en: 'Capital gains (shares / property)', hi: 'पूंजी लाभ (शेयर / संपत्ति)', gu: 'મૂડી નફો (શેર / મિલ્કત)' },
  'extra.interest_add':  { en: 'More interest / dividend income', hi: 'अधिक ब्याज / लाभांश आय', gu: 'વધારાની વ્યાજ / ડિવિડન્ડ આવક' },
  'extra.none':          { en: 'Nothing else', hi: 'कुछ और नहीं', gu: 'બીજું કઈ નહીં' },
  'extra.question':      {
    en: 'Do you have any other income not reflected in the AIS above?',
    hi: 'क्या आपके पास ऊपर दिए गए AIS में न दिखाई गई कोई अन्य आय है?',
    gu: 'ઉપરના AIS માં ન દેખાતી કોઈ વધારાની આવક છે?',
  },
  'extra.select_all':  { en: 'Select all that apply:', hi: 'जो लागू हो उसे चुनें:', gu: 'જે લાગુ પડે તે પસંદ કરો:' },

  // ── Form 16 ────────────────────────────────────────────────────────────────
  'form16.upload':     { en: 'Upload Form 16', hi: 'Form 16 अपलोड करें', gu: 'Form 16 અપલોડ કરો' },
  'form16.sub':        { en: 'PDF or clear photo', hi: 'PDF या स्पष्ट फोटो', gu: 'PDF અથવા સ્પષ્ટ ફોટો' },
  'form16.skip':       { en: 'Skip — use AIS salary figures instead', hi: 'छोड़ें — AIS के वेतन आंकड़े उपयोग करें', gu: 'છોડો — AIS ના પગારના આંકડા વાપરો' },

  // ── Business ───────────────────────────────────────────────────────────────
  'biz.44ad_label':   { en: 'Presumptive — Business (Sec 44AD)', hi: 'अनुमानित — व्यापार (धारा 44AD)', gu: 'અનુમાનિત — વ્યવસાય (કલમ 44AD)' },
  'biz.44ada_label':  { en: 'Presumptive — Professional (Sec 44ADA)', hi: 'अनुमानित — पेशेवर (धारा 44ADA)', gu: 'અનુમાનિત — વ્યાવસાયિક (કલમ 44ADA)' },
  'biz.actual_label': { en: 'Actual profit — books of accounts', hi: 'वास्तविक लाभ — खाता बही', gu: 'વાસ્તવિક નફો — ચોપડા' },

  // ── Deductions ─────────────────────────────────────────────────────────────
  'ded.ppf':           { en: 'PPF / EPF contributions', hi: 'PPF / EPF योगदान', gu: 'PPF / EPF ફાળો' },
  'ded.lic':           { en: 'LIC premium', hi: 'LIC प्रीमियम', gu: 'LIC પ્રીમિયમ' },
  'ded.elss':          { en: 'ELSS mutual fund', hi: 'ELSS म्यूचुअल फंड', gu: 'ELSS મ્યુચ્યુઅલ ફંડ' },
  'ded.tuition':       { en: "Children's tuition fees", hi: 'बच्चों की ट्यूशन फीस', gu: 'બાળકોની ટ્યુશન ફી' },
  'ded.homeloan_p':    { en: 'Home loan principal', hi: 'गृह ऋण मूलधन', gu: 'ઘર લોનનું મૂળ' },
  'ded.nps':           { en: 'NPS (80CCD)', hi: 'NPS (80CCD)', gu: 'NPS (80CCD)' },
  'ded.none':          { en: 'None of these', hi: 'इनमें से कोई नहीं', gu: 'આમાંથી કોઈ નહીં' },
  'ded.mediclaim_s':   { en: 'Mediclaim — self & family', hi: 'मेडिक्लेम — स्वयं व परिवार', gu: 'મેડિક્લેઈમ — પોતે અને પરિવાર' },
  'ded.mediclaim_p':   { en: 'Mediclaim — parents (senior)', hi: 'मेडिक्लेम — माता-पिता (वरिष्ठ)', gu: 'મેડિક્લેઈમ — માતા-પિતા (વૃદ્ધ)' },
  'ded.home_int':      { en: 'Home loan interest', hi: 'गृह ऋण ब्याज', gu: 'ઘર લોનનું વ્યાજ' },
  'ded.edu_loan':      { en: 'Education loan interest', hi: 'शिक्षा ऋण ब्याज', gu: 'શિક્ષણ લોનનું વ્યાજ' },
  'ded.80tta':         { en: 'Savings bank interest (80TTA)', hi: 'बचत बैंक ब्याज (80TTA)', gu: 'બચત બેંક વ્યાજ (80TTA)' },
  'ded.donation':      { en: 'Donation to charity / PM fund', hi: 'दान / PM फंड', gu: 'દાન / PM ફંડ' },

  // ── HP ─────────────────────────────────────────────────────────────────────
  'hp.self_occupied':  { en: 'Self-occupied', hi: 'स्वयं-अधिभोगित', gu: 'સ્વ-ઉપભોગ' },
  'hp.rented':         { en: 'Rented out', hi: 'किराये पर', gu: 'ભાડે આપ્યું' },

  // ── Taxes ──────────────────────────────────────────────────────────────────
  'tax.correct_continue': { en: 'Correct — continue ✓', hi: 'सही — जारी रखें ✓', gu: 'સાચું — આગળ વધો ✓' },
  'tax.update_figures':   { en: 'Update figures', hi: 'आंकड़े अपडेट करें', gu: 'આંકડા અપડેટ કરો' },

  // ── Computation card ───────────────────────────────────────────────────────
  'comp.review':       { en: 'Review your return', hi: 'अपना रिटर्न जांचें', gu: 'તમારો રિટર્ન તપાસો' },
  'comp.confirm':      { en: 'Confirm & send to CA for review', hi: 'पुष्टि करें और CA को भेजें', gu: 'ખાતરી કરો અને CA ને મોકલો' },
  'comp.regime_new':   { en: 'New regime', hi: 'नई व्यवस्था', gu: 'નવી વ્યવસ્થા' },
  'comp.regime_old':   { en: 'Old regime', hi: 'पुरानी व्यवस्था', gu: 'જૂની વ્યવસ્થા' },
  'comp.refund':       { en: '🎉 Refund due', hi: '🎉 वापसी देय', gu: '🎉 રિફંડ મળશે' },
  'comp.balance':      { en: '⚠️ Balance payable', hi: '⚠️ बकाया देय', gu: '⚠️ બાકી ચૂકવવાનું' },
  'comp.no_balance':   { en: '✅ No balance due', hi: '✅ कोई बकाया नहीं', gu: '✅ કોઈ બાકી નથી' },

  // ── Free chat ──────────────────────────────────────────────────────────────
  'chat.type_message': { en: 'Type a message or ask a question...', hi: 'संदेश लिखें या प्रश्न पूछें...', gu: 'સંદેશ લખો અથવા પ્રશ્ન પૂછો...' },
  'chat.send':         { en: 'Send', hi: 'भेजें', gu: 'મોકલો' },

  // ── Common ─────────────────────────────────────────────────────────────────
  'common.continue':   { en: 'Continue', hi: 'जारी रखें', gu: 'આગળ વધો' },
  'common.skip':       { en: 'Skip', hi: 'छोड़ें', gu: 'છોડો' },
  'common.yes':        { en: 'Yes', hi: 'हाँ', gu: 'હા' },
  'common.no':         { en: 'No', hi: 'नहीं', gu: 'ના' },
  'common.edit':       { en: 'Edit', hi: 'संपादित करें', gu: 'સંપાદિત કરો' },
  'common.done':       { en: 'Done ✓', hi: 'हो गया ✓', gu: 'પૂર્ણ ✓' },
  'common.cancel':     { en: 'Cancel', hi: 'रद्द करें', gu: 'રદ કરો' },
  'common.save':       { en: 'Save', hi: 'सहेजें', gu: 'સાચવો' },
  'common.upload':     { en: 'Upload', hi: 'अपलोड', gu: 'અપલોડ' },
  'common.loading':    { en: 'Loading...', hi: 'लोड हो रहा है...', gu: 'લોડ થઈ રહ્યું છે...' },
  'common.name':       { en: 'Name', hi: 'नाम', gu: 'નામ' },
  'common.pan':        { en: 'PAN', hi: 'PAN', gu: 'PAN' },
  'common.dob':        { en: 'Date of birth', hi: 'जन्म तिथि', gu: 'જન્મ તારીખ' },
  'common.mobile':     { en: 'Mobile', hi: 'मोबाइल', gu: 'મોબાઇલ' },

  // ── My returns ─────────────────────────────────────────────────────────────
  'returns.title':     { en: 'My Returns', hi: 'मेरे रिटर्न', gu: 'મારા રિટર્ન' },
  'returns.subtitle':  { en: 'Track status and message your CA', hi: 'स्थिति ट्रैक करें और CA से संवाद करें', gu: 'સ્ટેટસ ટ્રૅક કરો અને CA ને સંદેશ મોકલો' },
  'returns.filed_ack': { en: 'Filed · Ack:', hi: 'दाखिल · पावती:', gu: 'ફાઇલ · પહોંચ:' },

  // ── CA dashboard ───────────────────────────────────────────────────────────
  'ca.queue':          { en: 'Review Queue', hi: 'समीक्षा कतार', gu: 'સમીક્ષા લાઇન' },
  'ca.messages':       { en: 'Messages', hi: 'संदेश', gu: 'સંદેશ' },
  'ca.all_clients':    { en: 'All Clients', hi: 'सभी क्लाइंट', gu: 'બધા ક્લાઇન્ટ' },

  // ── Filing stages ──────────────────────────────────────────────────────────
  'stage.in_progress': { en: 'Data collection', hi: 'डेटा संग्रह', gu: 'ડેટા સંગ્રહ' },
  'stage.submitted':   { en: 'CA review', hi: 'CA समीक्षा', gu: 'CA સમીક્ષા' },
  'stage.approved':    { en: 'Approved', hi: 'स्वीकृत', gu: 'મંજૂર' },
  'stage.filed':       { en: 'Filed', hi: 'दाखिल', gu: 'ફાઇલ' },
};

// ── Language names ────────────────────────────────────────────────────────────
export const LANGUAGES = [
  { id: 'en', label: 'EN', native: 'English',  flag: '🇮🇳' },
  { id: 'hi', label: 'हि', native: 'हिंदी',     flag: '🇮🇳' },
  { id: 'gu', label: 'ગુ', native: 'ગુજરાતી',   flag: '🇮🇳' },
];

// ── Language display for AI prompts ──────────────────────────────────────────
export const LANG_PROMPT = {
  en: 'Respond in English.',
  hi: 'हिंदी में जवाब दें। Tax terms like ITR, AIS, TDS, PAN, etc. can remain in English.',
  gu: 'ગુજરાતીમાં જવાબ આપો। ITR, AIS, TDS, PAN જેવા Tax terms English માં રાખો.',
};
