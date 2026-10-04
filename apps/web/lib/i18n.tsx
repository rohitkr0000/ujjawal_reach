'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type Lang = 'en' | 'hi';

const en = {
  topBarBadge: 'Ujjwal Reach Initiative',
  topBarText: 'Multi-State Welfare Consulting & Scheme Eligibility Portal (Delhi & Madhya Pradesh active)',
  tagline: 'Digital Scheme Eligibility & Card System',
  helpline: 'Helpline',
  language: 'हिंदी',
  heroBy: 'Brought to you by Ujjwal Reach Firm',
  heroTitleA: 'Select your',
  heroTitleB: 'State & Registration',
  heroSubtitle: 'Select Delhi or Madhya Pradesh to load state-specific welfare schemes and district data.',
  heroSubtitleState: 'Selected state: {state}. Now choose how you want to register.',
  selectState: 'Select State',
  step1Title: 'Step 1: Choose Your State',
  step1Text: 'Currently active states: Delhi and Madhya Pradesh. Other states are coming soon.',
  activeReady: 'Active',
  locked: 'Locked',
  comingSoon: 'Coming soon',
  lockedAlert: '{state} is not open yet. Only Delhi and Madhya Pradesh are active.',
  stateSub: '{state} welfare schemes',
  otherState: 'Other State',
  loadingSchemes: 'Loading schemes...',
  schemesLoadError: 'Could not load the scheme list. Please check your internet and try again.',
  schemesCount: '{n} schemes available',
  individual: 'Individual',
  mostPopular: 'Most popular',
  personalTitle: 'Personal Registration',
  personalDesc: 'Instant eligibility check for individual welfare schemes, scholarships and pensions in {state}, with direct official portal links.',
  personalB1: 'Instant eligibility check',
  personalB2: 'Personalised scheme list',
  personalB3: 'Direct official portal links',
  proceedPersonal: 'Proceed with Personal Card',
  familyTitle: 'Family Welfare Card',
  familyDesc: 'See family-level schemes (ration, housing, health cover) and each member’s own schemes together for {state}.',
  familyB1: 'Enter family income & address once',
  familyB2: 'Add, edit and remove members',
  familyB3: 'Shared family schemes & per-member tabs',
  proceedFamily: 'Proceed with Family Card',
  changeMode: 'Change mode / state',
  personalFormTitle: 'Personal Registration ({state})',
  personalFormSub: 'Eligibility check, address details and direct portal links',
  familyFormTitle: 'Family Welfare Card ({state})',
  familyFormSub: 'Set the family details once and add the members',
  fullName: 'Full name',
  mobile: 'Mobile number',
  mobilePh: '10 digit mobile number',
  age: 'Age (years)',
  income: 'Annual family income',
  category: 'Caste category',
  education: 'Education level',
  occupation: 'Occupation / beneficiary type',
  gender: 'Gender',
  male: 'Male',
  female: 'Female',
  select: 'Select',
  minority: 'I belong to a minority community',
  specialTitle: 'Tick if it applies (optional)',
  addressTitle: 'Residential address',
  house: 'House no. / block',
  locality: 'Lane / locality / colony',
  district: 'District',
  state: 'State',
  pincode: 'Pincode',
  pincodePh: '6 digit pincode',
  consentDetails: 'I agree that my details will be used to show schemes and will be saved by Ujjwal Reach, which may contact me about my application.',
  saving: 'Saving your details...',
  savedOk: 'Your details are saved. Your reference number is {id}.',
  savedFail: 'Your schemes are shown below, but we could not save your details right now.',
  retrySave: 'Try saving again',
  consentTracking: 'I agree that the schemes I see and click may be recorded to improve this service (optional).',
  privacyLink: 'Privacy policy',
  checkSchemes: 'Check all eligible & potential schemes',
  errRequired: 'This field is required',
  errMobile: 'Enter a 10 digit mobile number',
  errPincode: 'Enter a 6 digit pincode',
  errAge: 'Enter an age between 0 and 120',
  errConsent: 'Please accept to continue',
  errAadhaar: 'Please do not enter an Aadhaar number here',
  errMembers: 'Please add at least one family member.',
  familyRootTitle: 'Family details',
  sameForAll: 'Same for all members',
  membersTitle: 'Add family member',
  editMemberTitle: 'Edit family member',
  relation: 'Relation',
  addMember: 'Add member to the list',
  updateMember: 'Update member',
  cancel: 'Cancel',
  addedMembers: 'Added members',
  edit: 'Edit',
  remove: 'Remove',
  memberNeeds: 'Please fill the member name, mobile number and age.',
  lockCheck: 'Lock family details & check all schemes',
  resultsTitle: 'Schemes for {state}',
  addressLabel: 'Registered address',
  householdTitle: 'Family schemes',
  householdNote: 'Schemes for the whole household (ration, housing, health cover and similar).',
  individualTitle: 'Schemes by person',
  individualNote: 'Click a name to see that person’s own schemes.',
  personalSchemesTitle: 'Your schemes',
  noHousehold: 'No family-level scheme matched.',
  noIndividual: 'No individual scheme matched for this person.',
  officialPage: 'Go to official page',
  verifiedOn: 'Verified {date}',
  notVerified: 'Not verified yet - check the official site',
  disclaimer: 'This list is a guide based on the details you entered. Final eligibility is decided by the department. Income is matched by bracket, so a scheme may show even if you are close to the limit.',
  startOver: 'Start over',
  schemesFound: '{n} schemes found',
  footerAbout: 'Private multi-state welfare consulting and scheme eligibility initiative by Ujjwal Reach firm.',
  footerStates: 'Supported states',
  footerNav: 'Quick navigation',
  footerHelpline: 'Ujjwal Reach helpline',
  footerAssist: 'For assistance and queries:',
  footerHours: 'Monday to Saturday (9:00 AM - 6:00 PM)',
  footerRights: 'All rights reserved. (Private welfare consulting firm)',
  privacy: 'Privacy policy',
  terms: 'Terms of service',
  consentBannerText: 'May we record which schemes are viewed and clicked on this site, to improve it? No personal details are recorded without your form consent.',
  accept: 'Allow',
  decline: 'No thanks',
  backHome: 'Back to home',
  'edu.None': 'None / illiterate',
  'edu.Primary': 'Primary (1st - 5th)',
  'edu.Secondary': 'Secondary (6th - 10th)',
  'edu.Higher Secondary': 'Higher secondary (11th - 12th)',
  'edu.Graduate': 'Graduate',
  'edu.Post Graduate': 'Post graduate',
  'occ.Student': 'Student',
  'occ.Worker': 'Construction / labour worker',
  'occ.Daily Wages': 'Daily wages worker',
  'occ.Farmer': 'Farmer',
  'occ.Business': 'Small business / vendor',
  'occ.Salaried': 'Salaried employee',
  'occ.Unemployed': 'Unemployed / homemaker',
  'cat.SC': 'SC',
  'cat.ST': 'ST',
  'cat.OBC': 'OBC (non-creamy)',
  'cat.EWS': 'EWS',
  'cat.General': 'General',
  'sp.Person with Disability': 'Person with disability',
  'sp.Patient': 'Patient / needs medical help',
  'sp.Artisan': 'Artisan / craftsperson',
  'sp.Homeless / Urban Poor': 'Homeless / urban poor',
  'rel.Self': 'Self',
  'rel.Spouse': 'Spouse',
  'rel.Son': 'Son',
  'rel.Daughter': 'Daughter',
  'rel.Father': 'Father',
  'rel.Mother': 'Mother',
  'rel.Other': 'Other',
} as const;

type Key = keyof typeof en;

const hi: Record<Key, string> = {
  topBarBadge: 'उज्ज्वल रीच पहल',
  topBarText: 'बहु-राज्य कल्याण परामर्श एवं योजना पात्रता पोर्टल (दिल्ली और मध्य प्रदेश सक्रिय)',
  tagline: 'डिजिटल योजना पात्रता एवं कार्ड प्रणाली',
  helpline: 'हेल्पलाइन',
  language: 'English',
  heroBy: 'उज्ज्वल रीच फर्म द्वारा',
  heroTitleA: 'अपना चुनें',
  heroTitleB: 'राज्य और पंजीकरण',
  heroSubtitle: 'राज्य की कल्याण योजनाएँ और ज़िले देखने के लिए दिल्ली या मध्य प्रदेश चुनें।',
  heroSubtitleState: 'चुना गया राज्य: {state}। अब पंजीकरण का तरीका चुनें।',
  selectState: 'राज्य चुनें',
  step1Title: 'चरण 1: अपना राज्य चुनें',
  step1Text: 'अभी सक्रिय राज्य: दिल्ली और मध्य प्रदेश। अन्य राज्य जल्द आएँगे।',
  activeReady: 'सक्रिय',
  locked: 'बंद',
  comingSoon: 'जल्द आ रहा है',
  lockedAlert: '{state} अभी उपलब्ध नहीं है। केवल दिल्ली और मध्य प्रदेश सक्रिय हैं।',
  stateSub: '{state} की कल्याणकारी योजनाएँ',
  otherState: 'अन्य राज्य',
  loadingSchemes: 'योजनाएँ लोड हो रही हैं...',
  schemesLoadError: 'योजनाओं की सूची लोड नहीं हो सकी। कृपया इंटरनेट जाँचकर दोबारा कोशिश करें।',
  schemesCount: '{n} योजनाएँ उपलब्ध',
  individual: 'व्यक्तिगत',
  mostPopular: 'सबसे लोकप्रिय',
  personalTitle: 'व्यक्तिगत पंजीकरण',
  personalDesc: '{state} की व्यक्तिगत कल्याण योजनाओं, छात्रवृत्तियों और पेंशन की तुरंत पात्रता जाँच, सीधे सरकारी पोर्टल के लिंक के साथ।',
  personalB1: 'तुरंत पात्रता जाँच',
  personalB2: 'आपके लिए चुनी हुई योजनाओं की सूची',
  personalB3: 'सीधे सरकारी पोर्टल के लिंक',
  proceedPersonal: 'व्यक्तिगत कार्ड के साथ आगे बढ़ें',
  familyTitle: 'परिवार कल्याण कार्ड',
  familyDesc: '{state} में परिवार की योजनाएँ (राशन, आवास, स्वास्थ्य बीमा) और हर सदस्य की अपनी योजनाएँ एक साथ देखें।',
  familyB1: 'परिवार की आय और पता एक बार भरें',
  familyB2: 'सदस्य जोड़ें, बदलें और हटाएँ',
  familyB3: 'साझा पारिवारिक योजनाएँ और हर सदस्य का टैब',
  proceedFamily: 'परिवार कार्ड के साथ आगे बढ़ें',
  changeMode: 'तरीका / राज्य बदलें',
  personalFormTitle: 'व्यक्तिगत पंजीकरण ({state})',
  personalFormSub: 'पात्रता जाँच, पता और सीधे पोर्टल लिंक',
  familyFormTitle: 'परिवार कल्याण कार्ड ({state})',
  familyFormSub: 'परिवार का विवरण एक बार भरें और सदस्य जोड़ें',
  fullName: 'पूरा नाम',
  mobile: 'मोबाइल नंबर',
  mobilePh: '10 अंकों का मोबाइल नंबर',
  age: 'आयु (वर्ष)',
  income: 'परिवार की वार्षिक आय',
  category: 'जाति श्रेणी',
  education: 'शिक्षा स्तर',
  occupation: 'व्यवसाय / लाभार्थी प्रकार',
  gender: 'लिंग',
  male: 'पुरुष',
  female: 'महिला',
  select: 'चुनें',
  minority: 'मैं अल्पसंख्यक समुदाय से हूँ',
  specialTitle: 'लागू हो तो चुनें (वैकल्पिक)',
  addressTitle: 'निवास का पता',
  house: 'मकान नं. / ब्लॉक',
  locality: 'गली / मोहल्ला / कॉलोनी',
  district: 'ज़िला',
  state: 'राज्य',
  pincode: 'पिन कोड',
  pincodePh: '6 अंकों का पिन कोड',
  consentDetails: 'मैं सहमत हूँ कि मेरी जानकारी योजनाएँ दिखाने में उपयोग होगी और उज्ज्वल रीच द्वारा सहेजी जाएगी, जो मेरे आवेदन के बारे में मुझसे संपर्क कर सकता है।',
  saving: 'आपकी जानकारी सहेजी जा रही है...',
  savedOk: 'आपकी जानकारी सहेज ली गई है। आपका संदर्भ नंबर {id} है।',
  savedFail: 'आपकी योजनाएँ नीचे दिखाई गई हैं, पर अभी आपकी जानकारी सहेजी नहीं जा सकी।',
  retrySave: 'दोबारा सहेजने का प्रयास करें',
  consentTracking: 'मैं सहमत हूँ कि सेवा बेहतर बनाने के लिए मेरी देखी और क्लिक की गई योजनाएँ दर्ज की जा सकती हैं (वैकल्पिक)।',
  privacyLink: 'गोपनीयता नीति',
  checkSchemes: 'सभी पात्र और संभावित योजनाएँ देखें',
  errRequired: 'यह जानकारी ज़रूरी है',
  errMobile: '10 अंकों का मोबाइल नंबर डालें',
  errPincode: '6 अंकों का पिन कोड डालें',
  errAge: '0 से 120 के बीच आयु डालें',
  errConsent: 'आगे बढ़ने के लिए सहमति दें',
  errAadhaar: 'कृपया यहाँ आधार नंबर न डालें',
  errMembers: 'कृपया कम से कम एक पारिवारिक सदस्य जोड़ें।',
  familyRootTitle: 'परिवार का विवरण',
  sameForAll: 'सभी सदस्यों के लिए समान',
  membersTitle: 'परिवार का सदस्य जोड़ें',
  editMemberTitle: 'सदस्य की जानकारी बदलें',
  relation: 'रिश्ता',
  addMember: 'सदस्य को सूची में जोड़ें',
  updateMember: 'सदस्य अपडेट करें',
  cancel: 'रद्द करें',
  addedMembers: 'जोड़े गए सदस्य',
  edit: 'बदलें',
  remove: 'हटाएँ',
  memberNeeds: 'कृपया सदस्य का नाम, मोबाइल नंबर और आयु भरें।',
  lockCheck: 'परिवार विवरण लॉक करें और सभी योजनाएँ देखें',
  resultsTitle: '{state} की योजनाएँ',
  addressLabel: 'पंजीकृत पता',
  householdTitle: 'पारिवारिक योजनाएँ',
  householdNote: 'पूरे परिवार के लिए योजनाएँ (राशन, आवास, स्वास्थ्य बीमा आदि)।',
  individualTitle: 'सदस्य के अनुसार योजनाएँ',
  individualNote: 'किसी सदस्य की अपनी योजनाएँ देखने के लिए उसके नाम पर क्लिक करें।',
  personalSchemesTitle: 'आपकी योजनाएँ',
  noHousehold: 'कोई पारिवारिक योजना नहीं मिली।',
  noIndividual: 'इस सदस्य के लिए कोई व्यक्तिगत योजना नहीं मिली।',
  officialPage: 'सरकारी पेज पर जाएँ',
  verifiedOn: 'जाँचा गया {date}',
  notVerified: 'अभी जाँचा नहीं गया - सरकारी साइट देखें',
  disclaimer: 'यह सूची आपकी दी गई जानकारी पर आधारित एक मार्गदर्शन है। अंतिम पात्रता विभाग तय करता है। आय श्रेणी के आधार पर मिलाई जाती है, इसलिए सीमा के पास होने पर भी योजना दिख सकती है।',
  startOver: 'फिर से शुरू करें',
  schemesFound: '{n} योजनाएँ मिलीं',
  footerAbout: 'उज्ज्वल रीच फर्म की निजी बहु-राज्य कल्याण परामर्श एवं योजना पात्रता पहल।',
  footerStates: 'समर्थित राज्य',
  footerNav: 'त्वरित नेविगेशन',
  footerHelpline: 'उज्ज्वल रीच हेल्पलाइन',
  footerAssist: 'सहायता और प्रश्नों के लिए:',
  footerHours: 'सोमवार से शनिवार (सुबह 9:00 - शाम 6:00)',
  footerRights: 'सर्वाधिकार सुरक्षित। (निजी कल्याण परामर्श फर्म)',
  privacy: 'गोपनीयता नीति',
  terms: 'सेवा की शर्तें',
  consentBannerText: 'क्या हम इस साइट को बेहतर बनाने के लिए यह दर्ज कर सकते हैं कि कौन सी योजनाएँ देखी और क्लिक की गईं? आपकी फ़ॉर्म सहमति के बिना कोई व्यक्तिगत जानकारी दर्ज नहीं होती।',
  accept: 'अनुमति दें',
  decline: 'नहीं, धन्यवाद',
  backHome: 'मुख्य पृष्ठ पर वापस',
  'edu.None': 'कोई नहीं / निरक्षर',
  'edu.Primary': 'प्राथमिक (1 - 5वीं)',
  'edu.Secondary': 'माध्यमिक (6 - 10वीं)',
  'edu.Higher Secondary': 'उच्च माध्यमिक (11 - 12वीं)',
  'edu.Graduate': 'स्नातक',
  'edu.Post Graduate': 'स्नातकोत्तर',
  'occ.Student': 'छात्र',
  'occ.Worker': 'निर्माण / श्रमिक',
  'occ.Daily Wages': 'दिहाड़ी मज़दूर',
  'occ.Farmer': 'किसान',
  'occ.Business': 'छोटा व्यापारी / विक्रेता',
  'occ.Salaried': 'वेतनभोगी',
  'occ.Unemployed': 'बेरोज़गार / गृहिणी',
  'cat.SC': 'अनुसूचित जाति (SC)',
  'cat.ST': 'अनुसूचित जनजाति (ST)',
  'cat.OBC': 'ओबीसी (नॉन-क्रीमी)',
  'cat.EWS': 'ईडब्ल्यूएस',
  'cat.General': 'सामान्य',
  'sp.Person with Disability': 'दिव्यांग व्यक्ति',
  'sp.Patient': 'रोगी / चिकित्सा सहायता चाहिए',
  'sp.Artisan': 'कारीगर / शिल्पकार',
  'sp.Homeless / Urban Poor': 'बेघर / शहरी गरीब',
  'rel.Self': 'स्वयं',
  'rel.Spouse': 'पति / पत्नी',
  'rel.Son': 'बेटा',
  'rel.Daughter': 'बेटी',
  'rel.Father': 'पिता',
  'rel.Mother': 'माता',
  'rel.Other': 'अन्य',
};

export type TKey = Key;
type Vars = Record<string, string | number>;

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: Key, vars?: Vars) => string;
  /** Label for an option value, falls back to the value itself. */
  opt: (group: 'edu' | 'occ' | 'cat' | 'sp' | 'rel', value: string) => string;
}

const LangContext = createContext<Ctx | null>(null);

function format(s: string, vars?: Vars): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('ur_lang');
      if (saved === 'hi' || saved === 'en') setLangState(saved);
    } catch {
      /* storage can be blocked, the default language is fine */
    }
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem('ur_lang', l);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = l;
  }, []);

  const value = useMemo<Ctx>(() => {
    const dict = lang === 'hi' ? hi : en;
    const t = (key: Key, vars?: Vars) => format(dict[key], vars);
    const opt = (group: 'edu' | 'occ' | 'cat' | 'sp' | 'rel', v: string) => {
      const k = `${group}.${v}` as Key;
      return k in dict ? dict[k] : v;
    };
    return { lang, setLang, t, opt };
  }, [lang, setLang]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): Ctx {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang must be used inside LangProvider');
  return ctx;
}
