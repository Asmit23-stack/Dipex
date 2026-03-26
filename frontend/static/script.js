const userInput = document.getElementById('user-input');
const sendBtn = document.querySelector('.send-button');
const micBtn = document.getElementById('mic-button');
const messagesDiv = document.querySelector('.messages');
const typingIndicator = document.getElementById('typing-indicator');

let availableSymptoms = [];
let lastPrediction = null;
let patientId = '';
let sidebarEl = null;
let sidebarOverlayEl = null;
let sidebarToggleBtn = null;
let suggestionsEl = null;
let isRequestInFlight = false;
let recognition = null;
let isListening = false;
let lastSpecialist = 'doctor';
let selectedLanguage = 'en-US';

const LANGUAGE_STORAGE_KEY = 'symptrack_language';
const FONT_CLASS_STORAGE_KEY = 'symptrack_font_class';
const DEFAULT_LANGUAGE = 'en-US';
const DEFAULT_FONT_CLASS = 'lang-en';
const SUPPORTED_LANGUAGE_OPTIONS = Object.freeze([
    { value: 'en-US', label: 'English (Default)' },
    { value: 'hi-IN', label: 'हिंदी (Hindi)' },
    { value: 'mr-IN', label: 'मराठी (Marathi)' }
]);
const LANGUAGE_FONT_CLASS_MAP = Object.freeze({
    'en-US': 'lang-en',
    'hi-IN': 'lang-hi',
    'mr-IN': 'lang-hi',
    'bn-IN': 'lang-bn',
    'te-IN': 'lang-te',
    'ta-IN': 'lang-ta',
    'gu-IN': 'lang-gu',
    'kn-IN': 'lang-kn',
    'pa-IN': 'lang-pa',
    'ml-IN': 'lang-ml',
    'or-IN': 'lang-or'
});
const LANGUAGE_LABEL_MAP = Object.freeze({
    'en-US': 'English',
    'hi-IN': 'Hindi',
    'bn-IN': 'Bengali',
    'te-IN': 'Telugu',
    'mr-IN': 'Marathi',
    'ta-IN': 'Tamil',
    'gu-IN': 'Gujarati',
    'kn-IN': 'Kannada',
    'pa-IN': 'Punjabi',
    'ml-IN': 'Malayalam',
    'or-IN': 'Odia'
});
const LANGUAGE_FONT_DISPLAY_MAP = Object.freeze({
    'en-US': 'Roboto/Segoe UI',
    'hi-IN': 'Noto Sans Devanagari',
    'mr-IN': 'Noto Sans Devanagari',
    'bn-IN': 'Noto Sans Bengali',
    'te-IN': 'Noto Sans Telugu',
    'ta-IN': 'Noto Sans Tamil',
    'gu-IN': 'Noto Sans Gujarati',
    'kn-IN': 'Noto Sans Kannada',
    'pa-IN': 'Noto Sans Gurmukhi',
    'ml-IN': 'Noto Sans Malayalam',
    'or-IN': 'Noto Sans Odia'
});
const LANGUAGE_PREVIEW_TEXT_MAP = Object.freeze({
    'en-US': 'The quick brown fox jumps over the lazy dog.',
    'hi-IN': 'नमस्ते! यह एक फ़ॉन्ट पूर्वावलोकन है।',
    'bn-IN': 'নমস্কার! এটি একটি ফন্ট প্রিভিউ।',
    'te-IN': 'నమస్కారం! ఇది ఫాంట్ ప్రివ్యూ.',
    'mr-IN': 'नमस्कार! हे फॉन्ट पूर्वावलोकन आहे.',
    'ta-IN': 'வணக்கம்! இது எழுத்துரு முன்னோட்டம்.',
    'gu-IN': 'નમસ્તે! આ ફૉન્ટ પ્રિવ્યૂ છે.',
    'kn-IN': 'ನಮಸ್ಕಾರ! ಇದು ಫಾಂಟ್ ಮುನ್ನೋಟ.',
    'pa-IN': 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਇਹ ਫੋਂਟ ਪ੍ਰੀਵਿਊ ਹੈ।',
    'ml-IN': 'നമസ്കാരം! ഇത് ഫോണ്ട് പ്രിവ്യൂ ആണ്.',
    'or-IN': 'ନମସ୍କାର! ଏହା ଫଣ୍ଟ ପ୍ରିଭ୍ୟୁ ଅଟେ।'
});

const LANGUAGE_FONT_URL_MAP = Object.freeze({
    'en-US': 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap',
    'hi-IN': 'https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;700&display=swap',
    'mr-IN': 'https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;700&display=swap',
    'bn-IN': 'https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;500;700&display=swap',
    'te-IN': 'https://fonts.googleapis.com/css2?family=Noto+Sans+Telugu:wght@400;500;700&display=swap',
    'ta-IN': 'https://fonts.googleapis.com/css2?family=Noto+Sans+Tamil:wght@400;500;700&display=swap',
    'gu-IN': 'https://fonts.googleapis.com/css2?family=Noto+Sans+Gujarati:wght@400;500;700&display=swap',
    'kn-IN': 'https://fonts.googleapis.com/css2?family=Noto+Sans+Kannada:wght@400;500;700&display=swap',
    'pa-IN': 'https://fonts.googleapis.com/css2?family=Noto+Sans+Gurmukhi:wght@400;500;700&display=swap',
    'ml-IN': 'https://fonts.googleapis.com/css2?family=Noto+Sans+Malayalam:wght@400;500;700&display=swap',
    'or-IN': 'https://fonts.googleapis.com/css2?family=Noto+Sans+Odia:wght@400;500;700&display=swap'
});
const LANGUAGE_FONT_STACK_MAP = Object.freeze({
    'en-US': "'Roboto', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
    'hi-IN': "'Noto Sans Devanagari', 'Roboto', 'Segoe UI', sans-serif",
    'mr-IN': "'Noto Sans Devanagari', 'Roboto', 'Segoe UI', sans-serif",
    'bn-IN': "'Noto Sans Bengali', 'Roboto', 'Segoe UI', sans-serif",
    'te-IN': "'Noto Sans Telugu', 'Roboto', 'Segoe UI', sans-serif",
    'ta-IN': "'Noto Sans Tamil', 'Roboto', 'Segoe UI', sans-serif",
    'gu-IN': "'Noto Sans Gujarati', 'Roboto', 'Segoe UI', sans-serif",
    'kn-IN': "'Noto Sans Kannada', 'Roboto', 'Segoe UI', sans-serif",
    'pa-IN': "'Noto Sans Gurmukhi', 'Roboto', 'Segoe UI', sans-serif",
    'ml-IN': "'Noto Sans Malayalam', 'Roboto', 'Segoe UI', sans-serif",
    'or-IN': "'Noto Sans Odia', 'Noto Sans Oriya', 'Roboto', 'Segoe UI', sans-serif"
});

const UI_TRANSLATIONS = Object.freeze({
    en: Object.freeze({
        appTitle: 'SympTrack AI - Symptom Tracker',
        welcomeGreeting: "Hello! I'm",
        welcomeSubtitle: 'Your AI-powered assistant for smarter health tracking.',
        actionReport: 'Report a new symptom',
        actionTrends: 'View my health trends',
        actionMedication: 'Log medication',
        actionSleep: 'Monitor sleep patterns',
        actionNearby: 'Nearby doctors',
        healthGood: 'Good Health',
        healthMild: 'Mild Symptoms',
        healthSerious: 'Serious Condition',
        healthAnalyzing: 'Analyzing...',
        inputPlaceholder: 'Describe your symptoms or ask a health question...',
        inputDisclaimer: "I'm not a doctor. Always verify with a professional for serious concerns. Press Enter to send, Shift+Enter for a new line.",
        typingAnalyzing: 'SympTrack AI is analyzing...',
        languageTitle: 'Select Your Preferred Language',
        languageDescription: 'Choose your preferred language to personalize your experience.',
        languageDefaultNote: 'English is set as the default language.',
        languageLabel: 'Language',
        languageContinue: 'Continue',
        languageUseEnglish: 'Use English for Now',
        languageSupportNote: 'Available in this build: English, Hindi, and Marathi.',
        changeLanguage: 'Change language',
        toggleTheme: 'Toggle theme',
        startVoiceInput: 'Start voice input',
        stopVoiceInput: 'Stop voice input',
        voiceUnsupported: 'Voice input is not supported in this browser. Use Chrome/Edge for speech-to-text.',
        voiceFailed: 'Voice capture failed. Please try again or type your symptoms.',
        reportPrompt: 'Please describe your symptoms in detail and include at least 3 symptoms.',
        symptomLoadFailed: 'Could not load symptom suggestions, but you can still chat.',
        errorSomethingWrong: 'Something went wrong. Please try again.',
        trySymptomsLike: 'Try symptoms like',
        otherPossibleConditions: 'Other Possible Conditions',
        symptomAnalysis: 'Symptom Analysis',
        recommendedSpecialist: 'Recommended Specialist',
        recommendedTests: 'Recommended Tests',
        preparation: 'Preparation',
        findNearby: 'Find Nearby {specialist}',
        clinicalTriage: 'Clinical Triage',
        level: 'Level',
        score: 'Score',
        personalizedCarePlan: 'Personalized Care Plan',
        followupQuestions: 'Follow-up Questions',
        unknownLabel: 'Unknown',
        severityHigh: 'High',
        severityMedium: 'Medium',
        severityLow: 'Low',
        severityWithConfidence: '{severity} severity ({confidence}% confidence)',
        descriptionLabel: 'Description',
        treatmentLabel: 'Treatment',
        selfCareLabel: 'Self Care',
        recognizedSymptoms: 'Recognized symptoms:',
        downloadReport: 'Download Report',
        aiAssessmentDisclaimer: 'This is an AI-generated assessment. Please consult a healthcare professional for proper diagnosis.',
        noDescriptionAvailable: 'No description available',
        consultHealthcare: 'Consult a healthcare professional',
        restAndMonitor: 'Rest and monitor symptoms',
        doctorsLabel: 'Doctors',
        nearbyTitle: 'Nearby {specialist}',
        noNearbyResults: 'No nearby {specialist} results found in your area.',
        noRating: 'No rating',
        openMap: 'Open Map',
        couldNotFetchNearby: 'Could not fetch nearby places from server: {error}. Opened Google Maps search.',
        failedLoadNearby: 'Failed to load nearby doctors from server. Opened Google Maps search.',
        locationNotGranted: 'Location access was not granted. Opened Google Maps with a nearby search.'
    }),
    hi: Object.freeze({
        appTitle: 'SympTrack AI - लक्षण ट्रैकर',
        welcomeGreeting: 'नमस्ते! मैं',
        welcomeSubtitle: 'स्मार्ट हेल्थ ट्रैकिंग के लिए आपका एआई सहायक।',
        actionReport: 'नया लक्षण दर्ज करें',
        actionTrends: 'मेरे हेल्थ ट्रेंड देखें',
        actionMedication: 'दवा दर्ज करें',
        actionSleep: 'नींद के पैटर्न देखें',
        actionNearby: 'पास के डॉक्टर',
        healthGood: 'स्वास्थ्य अच्छा',
        healthMild: 'हल्के लक्षण',
        healthSerious: 'गंभीर स्थिति',
        healthAnalyzing: 'विश्लेषण जारी है...',
        inputPlaceholder: 'अपने लक्षण लिखें या स्वास्थ्य से जुड़ा प्रश्न पूछें...',
        inputDisclaimer: 'मैं डॉक्टर नहीं हूँ। गंभीर समस्या के लिए डॉक्टर से सलाह लें। भेजने के लिए Enter और नई पंक्ति के लिए Shift+Enter दबाएं।',
        typingAnalyzing: 'SympTrack AI विश्लेषण कर रहा है...',
        languageTitle: 'अपनी पसंदीदा भाषा चुनें',
        languageDescription: 'अपने अनुभव को व्यक्तिगत बनाने के लिए भाषा चुनें।',
        languageDefaultNote: 'डिफ़ॉल्ट भाषा अंग्रेज़ी है।',
        languageLabel: 'भाषा',
        languageContinue: 'आगे बढ़ें',
        languageUseEnglish: 'फिलहाल अंग्रेज़ी इस्तेमाल करें',
        languageSupportNote: 'इस संस्करण में अभी English, Hindi और Marathi उपलब्ध हैं।',
        changeLanguage: 'भाषा बदलें',
        toggleTheme: 'थीम बदलें',
        startVoiceInput: 'आवाज इनपुट शुरू करें',
        stopVoiceInput: 'आवाज इनपुट रोकें',
        voiceUnsupported: 'इस ब्राउज़र में आवाज इनपुट समर्थित नहीं है। स्पीच-टू-टेक्स्ट के लिए Chrome/Edge इस्तेमाल करें।',
        voiceFailed: 'आवाज कैप्चर असफल रहा। फिर से प्रयास करें या लक्षण टाइप करें।',
        reportPrompt: 'कृपया अपने लक्षण विस्तार से लिखें और कम से कम 3 लक्षण बताएं।',
        symptomLoadFailed: 'लक्षण सुझाव लोड नहीं हो सके, लेकिन आप चैट जारी रख सकते हैं।',
        errorSomethingWrong: 'कुछ गलत हो गया। कृपया फिर से कोशिश करें।',
        trySymptomsLike: 'ऐसे लक्षण आज़माएं',
        otherPossibleConditions: 'अन्य संभावित स्थितियां',
        symptomAnalysis: 'लक्षण विश्लेषण',
        recommendedSpecialist: 'सुझाए गए विशेषज्ञ',
        recommendedTests: 'सुझाए गए टेस्ट',
        preparation: 'तैयारी',
        findNearby: 'पास में खोजें: {specialist}',
        clinicalTriage: 'क्लिनिकल ट्रायेज',
        level: 'स्तर',
        score: 'स्कोर',
        personalizedCarePlan: 'व्यक्तिगत देखभाल योजना',
        followupQuestions: 'फॉलो-अप प्रश्न',
        unknownLabel: 'अज्ञात',
        severityHigh: 'उच्च',
        severityMedium: 'मध्यम',
        severityLow: 'कम',
        severityWithConfidence: '{severity} गंभीरता ({confidence}% कॉन्फिडेंस)',
        descriptionLabel: 'विवरण',
        treatmentLabel: 'उपचार',
        selfCareLabel: 'स्व-देखभाल',
        recognizedSymptoms: 'पहचाने गए लक्षण:',
        downloadReport: 'रिपोर्ट डाउनलोड करें',
        aiAssessmentDisclaimer: 'यह एआई द्वारा तैयार किया गया आकलन है। सही निदान के लिए डॉक्टर से सलाह लें।',
        noDescriptionAvailable: 'कोई विवरण उपलब्ध नहीं है',
        consultHealthcare: 'कृपया स्वास्थ्य विशेषज्ञ से सलाह लें',
        restAndMonitor: 'आराम करें और लक्षणों पर नजर रखें',
        doctorsLabel: 'डॉक्टर',
        nearbyTitle: 'पास में {specialist}',
        noNearbyResults: 'आपके क्षेत्र में पास के {specialist} नहीं मिले।',
        noRating: 'कोई रेटिंग नहीं',
        openMap: 'मैप खोलें',
        couldNotFetchNearby: 'सर्वर से पास के स्थान नहीं मिल सके: {error}. Google Maps खोज खोली गई।',
        failedLoadNearby: 'सर्वर से पास के डॉक्टर लोड नहीं हो सके। Google Maps खोज खोली गई।',
        locationNotGranted: 'लोकेशन की अनुमति नहीं मिली। पास की खोज के साथ Google Maps खोला गया।'
    }),
    mr: Object.freeze({
        appTitle: 'SympTrack AI - लक्षण ट्रॅकर',
        welcomeGreeting: 'नमस्कार! मी',
        welcomeSubtitle: 'स्मार्ट आरोग्य ट्रॅकिंगसाठी तुमचा एआय सहाय्यक.',
        actionReport: 'नवीन लक्षण नोंदवा',
        actionTrends: 'माझे आरोग्य ट्रेंड पहा',
        actionMedication: 'औषध नोंदवा',
        actionSleep: 'झोपेचे नमुने पहा',
        actionNearby: 'जवळचे डॉक्टर',
        healthGood: 'आरोग्य चांगले',
        healthMild: 'हलकी लक्षणे',
        healthSerious: 'गंभीर स्थिती',
        healthAnalyzing: 'विश्लेषण सुरू आहे...',
        inputPlaceholder: 'तुमची लक्षणे लिहा किंवा आरोग्य प्रश्न विचारा...',
        inputDisclaimer: 'मी डॉक्टर नाही. गंभीर तक्रारींसाठी डॉक्टरांचा सल्ला घ्या. पाठवण्यासाठी Enter आणि नवीन ओळीसाठी Shift+Enter दाबा.',
        typingAnalyzing: 'SympTrack AI विश्लेषण करत आहे...',
        languageTitle: 'तुमची पसंतीची भाषा निवडा',
        languageDescription: 'तुमचा अनुभव वैयक्तिक करण्यासाठी भाषा निवडा.',
        languageDefaultNote: 'इंग्रजी ही डीफॉल्ट भाषा आहे.',
        languageLabel: 'भाषा',
        languageContinue: 'पुढे जा',
        languageUseEnglish: 'आत्तासाठी इंग्रजी वापरा',
        languageSupportNote: 'या आवृत्तीत सध्या English, Hindi आणि Marathi उपलब्ध आहेत.',
        changeLanguage: 'भाषा बदला',
        toggleTheme: 'थीम बदला',
        startVoiceInput: 'आवाज इनपुट सुरू करा',
        stopVoiceInput: 'आवाज इनपुट थांबवा',
        voiceUnsupported: 'या ब्राउझरमध्ये आवाज इनपुट समर्थित नाही. स्पीच-टू-टेक्स्टसाठी Chrome/Edge वापरा.',
        voiceFailed: 'आवाज कॅप्चर अयशस्वी झाले. पुन्हा प्रयत्न करा किंवा लक्षणे टाइप करा.',
        reportPrompt: 'कृपया तुमची लक्षणे तपशीलात लिहा आणि किमान 3 लक्षणे द्या.',
        symptomLoadFailed: 'लक्षण सुचवण्या लोड झाल्या नाहीत, पण तुम्ही चॅट सुरू ठेवू शकता.',
        errorSomethingWrong: 'काहीतरी चुकले. कृपया पुन्हा प्रयत्न करा.',
        trySymptomsLike: 'अशी लक्षणे वापरून पहा',
        otherPossibleConditions: 'इतर संभाव्य स्थिती',
        symptomAnalysis: 'लक्षण विश्लेषण',
        recommendedSpecialist: 'शिफारस केलेले तज्ञ',
        recommendedTests: 'शिफारस केलेल्या चाचण्या',
        preparation: 'तयारी',
        findNearby: 'जवळ शोधा: {specialist}',
        clinicalTriage: 'क्लिनिकल ट्रायेज',
        level: 'स्तर',
        score: 'स्कोर',
        personalizedCarePlan: 'वैयक्तिक काळजी योजना',
        followupQuestions: 'फॉलो-अप प्रश्न',
        unknownLabel: 'अज्ञात',
        severityHigh: 'उच्च',
        severityMedium: 'मध्यम',
        severityLow: 'कमी',
        severityWithConfidence: '{severity} तीव्रता ({confidence}% कॉन्फिडन्स)',
        descriptionLabel: 'वर्णन',
        treatmentLabel: 'उपचार',
        selfCareLabel: 'स्वत:ची काळजी',
        recognizedSymptoms: 'ओळखलेली लक्षणे:',
        downloadReport: 'रिपोर्ट डाउनलोड करा',
        aiAssessmentDisclaimer: 'हे एआय-निर्मित मूल्यांकन आहे. योग्य निदानासाठी डॉक्टरांचा सल्ला घ्या.',
        noDescriptionAvailable: 'कोणतेही वर्णन उपलब्ध नाही',
        consultHealthcare: 'कृपया आरोग्य तज्ञांचा सल्ला घ्या',
        restAndMonitor: 'विश्रांती घ्या आणि लक्षणांवर लक्ष ठेवा',
        doctorsLabel: 'डॉक्टर',
        nearbyTitle: 'जवळचे {specialist}',
        noNearbyResults: 'तुमच्या परिसरात जवळचे {specialist} आढळले नाहीत.',
        noRating: 'रेटिंग नाही',
        openMap: 'नकाशा उघडा',
        couldNotFetchNearby: 'सर्व्हरवरून जवळची ठिकाणे मिळाली नाहीत: {error}. Google Maps शोध उघडला.',
        failedLoadNearby: 'सर्व्हरवरून जवळचे डॉक्टर लोड करता आले नाहीत. Google Maps शोध उघडला.',
        locationNotGranted: 'लोकेशन परवानगी मिळाली नाही. जवळच्या शोधासह Google Maps उघडले.'
    })
});

function getUiLanguageCode() {
    const baseCode = (selectedLanguage || DEFAULT_LANGUAGE).split('-')[0];
    return UI_TRANSLATIONS[baseCode] ? baseCode : 'en';
}

function t(key) {
    const lang = getUiLanguageCode();
    return UI_TRANSLATIONS[lang]?.[key] || UI_TRANSLATIONS.en[key] || key;
}

function tf(key, variables = {}) {
    let template = t(key);
    Object.entries(variables).forEach(([name, value]) => {
        template = template.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value));
    });
    return template;
}

function isSupportedLanguage(languageCode) {
    return SUPPORTED_LANGUAGE_OPTIONS.some((option) => option.value === languageCode);
}

function resolveSupportedLanguage(languageCode) {
    return isSupportedLanguage(languageCode) ? languageCode : DEFAULT_LANGUAGE;
}

function populateLanguageOptions(selectEl) {
    if (!selectEl) {
        return;
    }

    selectEl.replaceChildren(
        ...SUPPORTED_LANGUAGE_OPTIONS.map((option) => {
            const optionEl = document.createElement('option');
            optionEl.value = option.value;
            optionEl.textContent = option.label;
            return optionEl;
        })
    );
}

function translateWelcomeMessage() {
    const welcomeContent = messagesDiv?.querySelector('.ai-msg .content');
    if (!welcomeContent) {
        return;
    }

    const paragraphs = welcomeContent.querySelectorAll('p');
    if (paragraphs[0]) {
        paragraphs[0].innerHTML = `${t('welcomeGreeting')} <b class=\"custom-gradient-heading\">SympTrack AI</b>`;
    }
    if (paragraphs[1]) {
        paragraphs[1].textContent = t('welcomeSubtitle');
    }

    const quickActionConfig = {
        report: { icon: 'fa-head-side-cough', label: 'actionReport' },
        trends: { icon: 'fa-chart-line', label: 'actionTrends' },
        medication: { icon: 'fa-pills', label: 'actionMedication' },
        sleep: { icon: 'fa-moon', label: 'actionSleep' },
        nearby: { icon: 'fa-map-marker-alt', label: 'actionNearby' }
    };

    welcomeContent.querySelectorAll('.quick-action').forEach((actionEl) => {
        const actionName = actionEl.dataset.action;
        const config = quickActionConfig[actionName];
        if (!config) {
            return;
        }
        actionEl.innerHTML = `<i class=\"fas ${config.icon}\"></i> ${t(config.label)}`;
    });
}

function translateStaticUi() {
    document.title = t('appTitle');

    if (userInput) {
        userInput.placeholder = t('inputPlaceholder');
    }

    const disclaimerEl = document.querySelector('.statdes');
    if (disclaimerEl) {
        disclaimerEl.textContent = t('inputDisclaimer');
    }

    const typingTextEl = typingIndicator?.querySelector('span');
    if (typingTextEl) {
        typingTextEl.textContent = t('typingAnalyzing');
    }

    const languageBtn = document.getElementById('language-open-btn');
    if (languageBtn) {
        languageBtn.setAttribute('aria-label', t('changeLanguage'));
        languageBtn.setAttribute('title', t('changeLanguage'));
    }

    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
        themeBtn.setAttribute('aria-label', t('toggleTheme'));
        themeBtn.setAttribute('title', t('toggleTheme'));
    }

    const languageTitleEl = document.getElementById('language-modal-title');
    if (languageTitleEl) {
        languageTitleEl.textContent = t('languageTitle');
    }

    const languageLabelEl = document.querySelector('.language-modal-label');
    if (languageLabelEl) {
        languageLabelEl.textContent = t('languageLabel');
    }

    const languageModalParagraphs = document.querySelectorAll('#language-modal-overlay .language-modal p:not(#language-font-preview)');
    if (languageModalParagraphs[0]) {
        languageModalParagraphs[0].textContent = t('languageDescription');
    }
    if (languageModalParagraphs[1]) {
        languageModalParagraphs[1].textContent = t('languageDefaultNote');
    }

    const languageSupportNoteEl = document.getElementById('language-support-note');
    if (languageSupportNoteEl) {
        languageSupportNoteEl.textContent = t('languageSupportNote');
    }

    const continueBtn = document.getElementById('language-continue-btn');
    if (continueBtn) {
        continueBtn.textContent = t('languageContinue');
    }

    const englishBtn = document.getElementById('language-english-btn');
    if (englishBtn) {
        englishBtn.textContent = t('languageUseEnglish');
    }

    if (micBtn) {
        updateMicButtonUI(isListening);
    }

    const healthStatus = document.querySelector('.health-status');
    if (healthStatus) {
        let currentState = 'good';
        if (healthStatus.classList.contains('health-yellow')) {
            currentState = 'mild';
        } else if (healthStatus.classList.contains('health-red')) {
            currentState = 'serious';
        } else if (healthStatus.classList.contains('health-blue')) {
            currentState = 'analyzing';
        }
        updateHealthStatus(currentState);
    }
}

function getFontClassForLanguage(languageCode) {
    return LANGUAGE_FONT_CLASS_MAP[languageCode] || DEFAULT_FONT_CLASS;
}

function loadDynamicFont(languageCode) {
    const fontUrl = LANGUAGE_FONT_URL_MAP[languageCode] || LANGUAGE_FONT_URL_MAP['en-US'];
    let fontLink = document.getElementById('dynamic-font-loader');
    
    if (!fontLink) {
        fontLink = document.createElement('link');
        fontLink.id = 'dynamic-font-loader';
        fontLink.rel = 'stylesheet';
        document.head.appendChild(fontLink);
    }
    
    fontLink.href = fontUrl;
}

function updateLanguageIndicator(languageCode) {
    const indicator = document.getElementById('language-current');
    if (!indicator) {
        return;
    }

    const label = LANGUAGE_LABEL_MAP[languageCode] || LANGUAGE_LABEL_MAP[DEFAULT_LANGUAGE];
    const fontName = LANGUAGE_FONT_DISPLAY_MAP[languageCode] || LANGUAGE_FONT_DISPLAY_MAP[DEFAULT_LANGUAGE];
    indicator.textContent = `${label} - ${fontName}`;
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function normalizeDisplay(symptom) {
    return symptom.replace(/_/g, ' ');
}

function getOrCreatePatientId() {
    const key = 'symptrack_patient_id';
    const existing = localStorage.getItem(key);
    if (existing) {
        return existing;
    }

    const generated = `user_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    localStorage.setItem(key, generated);
    return generated;
}

function applyLanguageSetting(languageCode) {
    selectedLanguage = resolveSupportedLanguage(languageCode);
    document.documentElement.setAttribute('lang', selectedLanguage.split('-')[0]);
    const fontClass = getFontClassForLanguage(selectedLanguage);
    const fontStack = LANGUAGE_FONT_STACK_MAP[selectedLanguage] || LANGUAGE_FONT_STACK_MAP[DEFAULT_LANGUAGE];

    if (document.body) {
        const allLanguageFontClasses = [...new Set(Object.values(LANGUAGE_FONT_CLASS_MAP))];
        document.body.classList.remove(...allLanguageFontClasses);
        document.body.classList.add(fontClass);
        document.body.style.fontFamily = fontStack;
    }
    document.documentElement.style.fontFamily = fontStack;

    // Load the appropriate Google Font dynamically
    loadDynamicFont(selectedLanguage);
    updateLanguageIndicator(selectedLanguage);

    if (recognition) {
        recognition.lang = selectedLanguage;
    }

    translateStaticUi();
    translateWelcomeMessage();
}

function getPreferredLanguage() {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved) {
        return resolveSupportedLanguage(saved);
    }
    return DEFAULT_LANGUAGE;
}

function getSavedFontClass() {
    const savedFontClass = localStorage.getItem(FONT_CLASS_STORAGE_KEY);
    const validFontClasses = new Set(Object.values(LANGUAGE_FONT_CLASS_MAP));
    if (savedFontClass && validFontClasses.has(savedFontClass)) {
        return savedFontClass;
    }
    return null;
}

function savePreferredLanguage(languageCode) {
    const resolvedLanguage = resolveSupportedLanguage(languageCode);
    const resolvedFontClass = getFontClassForLanguage(resolvedLanguage);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, resolvedLanguage);
    localStorage.setItem(FONT_CLASS_STORAGE_KEY, resolvedFontClass);
    applyLanguageSetting(resolvedLanguage);
}

function getLanguageMetadata() {
    const languageCode = selectedLanguage || DEFAULT_LANGUAGE;
    return {
        language: languageCode,
        language_label: LANGUAGE_LABEL_MAP[languageCode] || 'English'
    };
}

function initLanguageSelector() {
    const modalOverlay = document.getElementById('language-modal-overlay');
    const languageSelect = document.getElementById('language-select');
    const continueBtn = document.getElementById('language-continue-btn');
    const englishBtn = document.getElementById('language-english-btn');
    const openBtn = document.getElementById('language-open-btn');
    const previewEl = document.getElementById('language-font-preview');

    if (!modalOverlay || !languageSelect || !continueBtn || !englishBtn) {
        const language = getPreferredLanguage();
        applyLanguageSetting(language);
        if (!getSavedFontClass()) {
            localStorage.setItem(FONT_CLASS_STORAGE_KEY, getFontClassForLanguage(language));
        }
        return;
    }

    populateLanguageOptions(languageSelect);

    const preferredLanguage = getPreferredLanguage();
    const savedFontClass = getSavedFontClass();
    applyLanguageSetting(preferredLanguage);
    if (savedFontClass && savedFontClass === getFontClassForLanguage(preferredLanguage) && document.body) {
        const allLanguageFontClasses = [...new Set(Object.values(LANGUAGE_FONT_CLASS_MAP))];
        document.body.classList.remove(...allLanguageFontClasses);
        document.body.classList.add(savedFontClass);
    } else {
        localStorage.setItem(FONT_CLASS_STORAGE_KEY, getFontClassForLanguage(preferredLanguage));
    }
    languageSelect.value = preferredLanguage;

    const closeModal = () => {
        modalOverlay.hidden = true;
    };
    const openModal = () => {
        modalOverlay.hidden = false;
    };
    const updatePreviewText = (languageCode) => {
        if (!previewEl) {
            return;
        }
        previewEl.textContent = LANGUAGE_PREVIEW_TEXT_MAP[languageCode] || LANGUAGE_PREVIEW_TEXT_MAP[DEFAULT_LANGUAGE];
    };
    updatePreviewText(preferredLanguage);

    continueBtn.addEventListener('click', () => {
        savePreferredLanguage(languageSelect.value);
        updatePreviewText(languageSelect.value);
        closeModal();
    });

    englishBtn.addEventListener('click', () => {
        languageSelect.value = DEFAULT_LANGUAGE;
        savePreferredLanguage(DEFAULT_LANGUAGE);
        updatePreviewText(DEFAULT_LANGUAGE);
        closeModal();
    });

    // Real-time language switching when user changes dropdown
    languageSelect.addEventListener('change', (e) => {
        savePreferredLanguage(e.target.value);
        updatePreviewText(e.target.value);
    });

    if (!localStorage.getItem(LANGUAGE_STORAGE_KEY)) {
        openModal();
    }

    if (openBtn) {
        openBtn.addEventListener('click', openModal);
    }
}

function initThemeToggle() {
    const themeToggle = document.getElementById('theme-toggle-btn') || document.querySelector('.theme-toggle');
    const html = document.documentElement;

    const savedTheme = localStorage.getItem('theme') || 'dark';
    html.setAttribute('data-theme', savedTheme);

    const icon = themeToggle.querySelector('i');
    icon.className = savedTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';

    themeToggle.addEventListener('click', () => {
        const currentTheme = html.getAttribute('data-theme');
        const nextTheme = currentTheme === 'light' ? 'dark' : 'light';

        html.setAttribute('data-theme', nextTheme);
        localStorage.setItem('theme', nextTheme);
        icon.className = nextTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    });
}

function autoResizeTextarea() {
    userInput.style.height = 'auto';
    userInput.style.height = `${Math.min(userInput.scrollHeight, 180)}px`;
}

function setLoadingState(loading) {
    isRequestInFlight = loading;
    sendBtn.disabled = loading;
    if (micBtn) {
        micBtn.disabled = loading || isListening;
    }
    sendBtn.classList.toggle('is-loading', loading);
}

function updateMicButtonUI(listening) {
    if (!micBtn) {
        return;
    }
    micBtn.classList.toggle('listening', listening);
    micBtn.setAttribute('aria-label', listening ? t('stopVoiceInput') : t('startVoiceInput'));
    micBtn.setAttribute('title', listening ? t('stopVoiceInput') : t('startVoiceInput'));
    micBtn.innerHTML = listening
        ? '<i class="fas fa-microphone mic-icon"></i><span class="mic-live-dot" aria-hidden="true"></span>'
        : '<i class="fas fa-microphone mic-icon"></i>';
}

function stopSpeechRecognition() {
    if (recognition && isListening) {
        recognition.stop();
    }
}

function initSpeechToText() {
    if (!micBtn) {
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        micBtn.style.display = 'none';
        addMessage(t('voiceUnsupported'), 'ai-message', false);
        return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = selectedLanguage || DEFAULT_LANGUAGE;
    recognition.interimResults = true;
    recognition.continuous = false;
    micBtn.classList.add('mic-ready');
    micBtn.setAttribute('title', t('startVoiceInput'));

    recognition.onstart = () => {
        isListening = true;
        updateMicButtonUI(true);
        updateHealthStatus('analyzing');
    };

    recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
            transcript += event.results[i][0].transcript;
        }

        const text = transcript.trim();
        if (text) {
            userInput.value = text;
            autoResizeTextarea();
            updateSuggestions(text);
        }
    };

    recognition.onerror = () => {
        isListening = false;
        updateMicButtonUI(false);
        updateHealthStatus('good');
        addMessage(t('voiceFailed'), 'ai-message', false);
    };

    recognition.onend = () => {
        const wasListening = isListening;
        isListening = false;
        updateMicButtonUI(false);
        if (!isRequestInFlight) {
            updateHealthStatus('good');
        }

        // Auto-focus input after speech capture for quick submit.
        if (wasListening) {
            userInput.focus();
        }
    };

    micBtn.addEventListener('click', () => {
        if (isRequestInFlight) {
            return;
        }

        if (isListening) {
            stopSpeechRecognition();
            return;
        }

        recognition.start();
    });
}

function updateHealthStatus(status) {
    const statusMap = {
        good: { text: t('healthGood'), icon: 'smile', color: 'health-green' },
        mild: { text: t('healthMild'), icon: 'meh', color: 'health-yellow' },
        serious: { text: t('healthSerious'), icon: 'frown', color: 'health-red' },
        analyzing: { text: t('healthAnalyzing'), icon: 'spinner fa-spin', color: 'health-blue' }
    };

    const statusInfo = statusMap[status] || statusMap.good;
    const healthStatus = document.querySelector('.health-status');

    healthStatus.className = `health-status ${statusInfo.color}`;
    healthStatus.innerHTML = `<i class=\"fas fa-${statusInfo.icon}\"></i><span>${statusInfo.text}</span>`;
}

function showWelcomeMessage() {
    const welcomeHtml = `
        <div class=\"message ai-message ai-msg\">
            <div class=\"content\">
                <p>${t('welcomeGreeting')} <b class=\"custom-gradient-heading\">SympTrack AI</b></p>
                <p>${t('welcomeSubtitle')}</p>
                <div class=\"quick-actions\">
                    <div class=\"quick-action\" data-action=\"report\"><i class=\"fas fa-head-side-cough\"></i> ${t('actionReport')}</div>
                    <div class=\"quick-action\" data-action=\"trends\"><i class=\"fas fa-chart-line\"></i> ${t('actionTrends')}</div>
                    <div class=\"quick-action\" data-action=\"medication\"><i class=\"fas fa-pills\"></i> ${t('actionMedication')}</div>
                    <div class=\"quick-action\" data-action=\"sleep\"><i class=\"fas fa-moon\"></i> ${t('actionSleep')}</div>
                    <div class=\"quick-action\" data-action=\"nearby\"><i class=\"fas fa-map-marker-alt\"></i> ${t('actionNearby')}</div>
                </div>
            </div>
        </div>
    `;

    messagesDiv.innerHTML = welcomeHtml;

    document.querySelectorAll('.quick-action').forEach((action) => {
        action.addEventListener('click', () => handleQuickAction(action.dataset.action));
    });
}

async function handleQuickAction(action) {
    if (action === 'report') {
        addMessage(t('reportPrompt'), 'ai-message', true);
        userInput.focus();
        return;
    }

    if (action === 'trends') {
        await renderTrendDashboard();
        return;
    }

    if (action === 'medication') {
        renderMedicationForm();
        return;
    }

    if (action === 'sleep') {
        renderSleepForm();
        return;
    }

    if (action === 'nearby') {
        openNearbyDoctors(lastSpecialist);
    }
}

function addMessage(content, className, isHtml = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${className}`;

    const safeContent = isHtml ? content : escapeHtml(content);
    messageDiv.innerHTML = `<div class=\"content\">${safeContent}</div>`;

    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function showTypingIndicator() {
    typingIndicator.style.display = 'flex';
}

function hideTypingIndicator() {
    typingIndicator.style.display = 'none';
}

function renderApiError(result) {
    const err = result?.error || t('errorSomethingWrong');
    addMessage(`
        <div class=\"prediction-result\">
            <div class=\"urgent-warning\" style=\"animation:none;\">
                <i class=\"fas fa-circle-exclamation\"></i>
                <span>${escapeHtml(err)}</span>
            </div>
            ${result?.available_symptoms ? `<p class=\"confidence-explanation\">${t('trySymptomsLike')}: ${result.available_symptoms.slice(0, 8).map((s) => escapeHtml(normalizeDisplay(s))).join(', ')}</p>` : ''}
        </div>
    `, 'ai-message', true);
}

function renderPrediction(result) {
    lastPrediction = result;
    lastSpecialist = result?.specialist?.specialist || 'doctor';
    const localizedSpecialist = result?.specialist?.localized_specialist || result?.specialist?.specialist || t('doctorsLabel');

    const confidencePercent = Math.round((result.confidence || 0) * 100);
    const severity = confidencePercent > 70 ? 'high' : confidencePercent > 40 ? 'medium' : 'low';
    const severityIcon = severity === 'high' ? 'exclamation-triangle' : severity === 'medium' ? 'exclamation-circle' : 'info-circle';
    const severityLabelMap = {
        high: t('severityHigh'),
        medium: t('severityMedium'),
        low: t('severityLow')
    };
    const severityLabel = severityLabelMap[severity] || severity;

    const urgentHtml = result.is_urgent && result.urgent_warning
        ? `<div class=\"urgent-warning\"><i class=\"fas fa-triangle-exclamation\"></i><span>${escapeHtml(result.urgent_warning)}</span></div>`
        : '';

    const alternativesHtml = (result.alternative_diagnoses || []).length
        ? `
        <div class=\"alternative-diagnoses\">
            <h4><i class=\"fas fa-stethoscope\"></i> ${t('otherPossibleConditions')}</h4>
            <div class=\"alternative-list\">
                ${(result.alternative_diagnoses || []).map((alt) => `
                    <div class=\"alternative-item\">
                        <span class=\"alt-disease\">${escapeHtml(alt.disease)}</span>
                        <span class=\"alt-confidence\">${Math.round((alt.confidence || 0) * 100)}%</span>
                    </div>
                `).join('')}
            </div>
        </div>
        `
        : '';

    const featureHtml = result.feature_importance
        ? `
        <div class=\"feature-importance-section\">
            <h4><i class=\"fas fa-chart-bar\"></i> ${t('symptomAnalysis')}</h4>
            <div class=\"importance-bars\">
                ${Object.entries(result.feature_importance)
                    .sort((a, b) => b[1] - a[1])
                    .map(([symptom, importance]) => `
                        <div class=\"importance-item\">
                            <span class=\"importance-symptom\">${escapeHtml(normalizeDisplay(symptom))}</span>
                            <div class=\"importance-bar-container\"><div class=\"importance-bar\" style=\"width:${Math.round(importance * 100)}%\"></div></div>
                            <span class=\"importance-value\">${Math.round(importance * 100)}%</span>
                        </div>
                    `)
                    .join('')}
            </div>
        </div>
        `
        : '';

    const specialistHtml = result.specialist
        ? `
        <div class=\"specialist-section\">
            <h4><i class=\"fas fa-user-md\"></i> ${t('recommendedSpecialist')}</h4>
            <div class=\"specialist-card\">
                <div class=\"specialist-type\">${escapeHtml(localizedSpecialist)}</div>
                <div class=\"specialist-tests\">
                    <strong><i class=\"fas fa-flask\"></i> ${t('recommendedTests')}:</strong>
                    <ul>${(result.specialist.tests || []).map((test) => `<li>${escapeHtml(test)}</li>`).join('')}</ul>
                </div>
                <div class=\"specialist-prep\">
                    <strong><i class=\"fas fa-clipboard-check\"></i> ${t('preparation')}:</strong>
                    <p>${escapeHtml(result.specialist.preparation || '')}</p>
                </div>
                <div class=\"map-actions\">
                    <button class=\"btn-map\" type=\"button\" data-specialist=\"${escapeHtml(result.specialist.specialist || 'doctor')}\">
                        <i class=\"fas fa-map-marker-alt\"></i> ${escapeHtml(tf('findNearby', { specialist: localizedSpecialist }))}
                    </button>
                </div>
            </div>
        </div>
        `
        : '';

    const triageHtml = result.triage
        ? `
        <div class="triage-section">
            <h4><i class="fas fa-shield-heart"></i> ${t('clinicalTriage')}</h4>
            <div class="triage-badges">
                <span class="triage-chip">${t('level')}: ${escapeHtml(result.triage.level || 'routine')}</span>
                <span class="triage-chip">${t('score')}: ${Number(result.triage.score || 0)}/100</span>
            </div>
            <ul class="followup-questions">
                ${(result.triage.reasons || []).map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')}
            </ul>
        </div>
        `
        : '';

    const carePlanHtml = Array.isArray(result.care_plan) && result.care_plan.length
        ? `
        <div class="careplan-section">
            <h4><i class="fas fa-list-check"></i> ${t('personalizedCarePlan')}</h4>
            <ul class="followup-questions">
                ${result.care_plan.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
            </ul>
        </div>
        `
        : '';

    const followupHtml = (result.followup_questions || []).length
        ? `
        <div class=\"followup-section\">
            <h4><i class=\"fas fa-question-circle\"></i> ${t('followupQuestions')}</h4>
            <ul class=\"followup-questions\">
                ${(result.followup_questions || []).map((q) => `<li class=\"followup-item\" data-question=\"${escapeHtml(q)}\">${escapeHtml(q)}</li>`).join('')}
            </ul>
        </div>
        `
        : '';

    const html = `
        <div class=\"prediction-result\">
            <h3>${escapeHtml(result.disease || t('unknownLabel'))}</h3>
            ${urgentHtml}
            <div class=\"severity-indicator severity-${severity}\">
                <i class=\"fas fa-${severityIcon}\"></i>
                ${escapeHtml(tf('severityWithConfidence', { severity: severityLabel, confidence: confidencePercent }))}
            </div>
            <p class=\"confidence-explanation\">${escapeHtml(result.confidence_explanation || '')}</p>
            <div class=\"disease-info-section\">
                <div class=\"info-card\"><h4><i class=\"fas fa-info-circle\"></i> ${t('descriptionLabel')}</h4><p>${escapeHtml(result.description || t('noDescriptionAvailable'))}</p></div>
                <div class=\"info-card\"><h4><i class=\"fas fa-prescription-bottle-alt\"></i> ${t('treatmentLabel')}</h4><p>${escapeHtml(result.treatment || t('consultHealthcare'))}</p></div>
                <div class=\"info-card\"><h4><i class=\"fas fa-hands-helping\"></i> ${t('selfCareLabel')}</h4><p>${escapeHtml(result.self_care || t('restAndMonitor'))}</p></div>
            </div>
            ${featureHtml}
            ${alternativesHtml}
            ${triageHtml}
            ${carePlanHtml}
            ${specialistHtml}
            ${followupHtml}
            <div class=\"symptoms-used\">
                <p>${t('recognizedSymptoms')}</p>
                <div class=\"symptom-tags\">${(result.symptoms_used || []).map((s) => `<span class=\"symptom-tag\">${escapeHtml(normalizeDisplay(s))}</span>`).join('')}</div>
            </div>
            <div class=\"action-buttons\">
                <button class=\"btn-download\" onclick=\"generatePDF()\"><i class=\"fas fa-file-pdf\"></i> ${t('downloadReport')}</button>
            </div>
            <p class=\"disclaimer\"><i class=\"fas fa-info-circle\"></i> ${t('aiAssessmentDisclaimer')}</p>
        </div>
    `;

    addMessage(html, 'ai-message', true);

    document.querySelectorAll('.followup-item').forEach((item) => {
        item.addEventListener('click', () => {
            const question = item.getAttribute('data-question');
            userInput.value = question;
            autoResizeTextarea();
            userInput.focus();
        });
    });

    document.querySelectorAll('.btn-map').forEach((btn) => {
        btn.addEventListener('click', () => {
            const specialist = btn.getAttribute('data-specialist') || 'doctor';
            openNearbyDoctors(specialist);
        });
    });
}

function openNearbyDoctors(specialistType = 'doctor') {
    const queryNearMe = encodeURIComponent(`${specialistType} near me`);
    const fallbackUrl = `https://www.google.com/maps/search/?api=1&query=${queryNearMe}`;

    if (!navigator.geolocation) {
        window.open(fallbackUrl, '_blank');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const { latitude, longitude } = position.coords;
            try {
                const response = await fetch('/api/nearby-doctors', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        latitude,
                        longitude,
                        specialist: specialistType,
                        radius: 6000,
                        ...getLanguageMetadata()
                    })
                });
                const result = await response.json();
                if (!response.ok || result.error) {
                    window.open(fallbackUrl, '_blank');
                    addMessage(tf('couldNotFetchNearby', { error: result.error || t('unknownLabel') }), 'ai-message', false);
                    return;
                }
                renderNearbyDoctorResults(result);
            } catch (error) {
                console.error('Nearby doctor error:', error);
                window.open(fallbackUrl, '_blank');
                addMessage(t('failedLoadNearby'), 'ai-message', false);
            }
        },
        () => {
            window.open(fallbackUrl, '_blank');
            addMessage(t('locationNotGranted'), 'ai-message', false);
        },
        {
            enableHighAccuracy: true,
            timeout: 10000
        }
    );
}

function renderNearbyDoctorResults(result) {
    const places = Array.isArray(result.results) ? result.results : [];
    const specialistLabel = result.specialist || t('doctorsLabel');
    if (!places.length) {
        addMessage(tf('noNearbyResults', { specialist: specialistLabel }), 'ai-message', false);
        return;
    }

    const cards = places.map((item) => `
        <div class="alternative-item doctor-item">
            <div>
                <div class="alt-disease">${escapeHtml(item.name || t('unknownLabel'))}</div>
                <div class="history-time">${escapeHtml(item.address || '')}</div>
            </div>
            <div class="doctor-meta">
                <span class="alt-confidence">${item.rating ? `${item.rating}★` : t('noRating')}</span>
                ${item.maps_url ? `<a class="doctor-map-link" href="${item.maps_url}" target="_blank" rel="noopener noreferrer">${t('openMap')}</a>` : ''}
            </div>
        </div>
    `).join('');

    addMessage(`
        <div class="alternative-diagnoses">
            <h4><i class="fas fa-map-marker-alt"></i> ${escapeHtml(tf('nearbyTitle', { specialist: specialistLabel }))}</h4>
            <div class="alternative-list">${cards}</div>
        </div>
    `, 'ai-message', true);
}

async function handleUserInput() {
    const text = userInput.value.trim();
    if (!text || isRequestInFlight) {
        return;
    }

    stopSpeechRecognition();

    addMessage(text, 'user-message');
    userInput.value = '';
    autoResizeTextarea();

    updateSuggestions('');
    updateHealthStatus('analyzing');
    showTypingIndicator();
    setLoadingState(true);

    try {
        const response = await fetch('/api/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                symptoms: text,
                patient_id: patientId,
                ...getLanguageMetadata()
            })
        });

        const result = await response.json();

        if (!response.ok || result.error) {
            renderApiError(result);
            updateHealthStatus('good');
            return;
        }

        renderPrediction(result);
        const severity = result.confidence > 0.7 ? 'serious' : result.confidence > 0.4 ? 'mild' : 'good';
        updateHealthStatus(severity);
    } catch (error) {
        console.error('Prediction error:', error);
        renderApiError({ error: 'Unable to contact the server. Please try again.' });
        updateHealthStatus('good');
    } finally {
        hideTypingIndicator();
        setLoadingState(false);
    }
}

function buildSidebar() {
    if (sidebarEl) {
        sidebarEl.remove();
    }
    if (sidebarOverlayEl) {
        sidebarOverlayEl.remove();
    }
    if (sidebarToggleBtn) {
        sidebarToggleBtn.remove();
    }

    const getCurrentInputSymptoms = () => userInput.value
        .split(',')
        .map((part) => part.trim().toLowerCase())
        .map((part) => part.replace(/^i have\s+/, '').replace(/^i am having\s+/, '').trim())
        .filter(Boolean);

    const closeSidebar = () => {
        sidebarEl.classList.remove('active');
        sidebarOverlayEl.classList.remove('active');
        sidebarToggleBtn.classList.remove('active');
    };

    const openSidebar = () => {
        sidebarEl.classList.add('active');
        sidebarOverlayEl.classList.add('active');
        sidebarToggleBtn.classList.add('active');
        const searchInput = sidebarEl.querySelector('#symptom-search');
        if (searchInput) {
            searchInput.focus();
        }
    };

    const syncSelectedPanel = () => {
        const selectedWrap = sidebarEl.querySelector('.selected-symptoms');
        if (!selectedWrap) {
            return;
        }

        const selectedInputSymptoms = getCurrentInputSymptoms();
        if (!selectedInputSymptoms.length) {
            selectedWrap.innerHTML = '<span class="empty-selected">No symptoms added yet.</span>';
            return;
        }

        selectedWrap.innerHTML = selectedInputSymptoms.slice(0, 8).map((name) =>
            `<span class="selected-chip">${escapeHtml(name)}</span>`
        ).join('');
    };

    sidebarEl = document.createElement('aside');
    sidebarEl.className = 'symptom-sidebar';
    sidebarEl.innerHTML = `
        <div class=\"sidebar-header\">
            <h3>Symptom Suggestions</h3>
            <button class=\"sidebar-close\" type=\"button\" aria-label=\"Close\"><i class=\"fas fa-times\"></i></button>
        </div>
        <div class=\"sidebar-subtitle\">Search and tap to add symptoms quickly</div>
        <input type=\"text\" id=\"symptom-search\" placeholder=\"Search symptoms...\">
        <div class="selected-block">
            <div class="selected-head">
                <span>Selected</span>
                <button type="button" class="clear-selected">Clear</button>
            </div>
            <div class="selected-symptoms"><span class="empty-selected">No symptoms added yet.</span></div>
        </div>
        <div class=\"symptom-list\"></div>
    `;
    document.body.appendChild(sidebarEl);

    sidebarOverlayEl = document.createElement('div');
    sidebarOverlayEl.className = 'sidebar-overlay';
    document.body.appendChild(sidebarOverlayEl);

    sidebarToggleBtn = document.createElement('button');
    sidebarToggleBtn.type = 'button';
    sidebarToggleBtn.className = 'toggle-sidebar';
    sidebarToggleBtn.setAttribute('aria-label', 'Open symptoms');
    sidebarToggleBtn.innerHTML = '<i class=\"fas fa-clipboard-list\"></i>';
    document.body.appendChild(sidebarToggleBtn);

    const renderSymptomItems = (term = '') => {
        const listEl = sidebarEl.querySelector('.symptom-list');
        const filtered = availableSymptoms.filter((symptom) => normalizeDisplay(symptom).toLowerCase().includes(term.toLowerCase()));
        const selectedInputSymptoms = getCurrentInputSymptoms();

        if (!filtered.length) {
            listEl.innerHTML = '<div class="symptom-empty">No matching symptoms found.</div>';
            return;
        }

        listEl.innerHTML = filtered
            .slice(0, 150)
            .map((symptom) => {
                const label = normalizeDisplay(symptom).toLowerCase();
                const isSelected = selectedInputSymptoms.includes(label);
                return `<button type="button" class="symptom-item${isSelected ? ' active' : ''}" data-symptom="${escapeHtml(symptom)}">${escapeHtml(normalizeDisplay(symptom))}</button>`;
            })
            .join('');

        listEl.querySelectorAll('.symptom-item').forEach((item) => {
            item.addEventListener('click', () => {
                appendSymptomToInput(item.dataset.symptom);
                syncSelectedPanel();
                renderSymptomItems(sidebarEl.querySelector('#symptom-search').value);
                if (window.innerWidth <= 768) {
                    closeSidebar();
                }
            });
        });
    };

    renderSymptomItems();
    syncSelectedPanel();

    sidebarEl.querySelector('#symptom-search').addEventListener('input', (e) => {
        renderSymptomItems(e.target.value);
    });

    sidebarToggleBtn.addEventListener('click', () => {
        if (sidebarEl.classList.contains('active')) {
            closeSidebar();
        } else {
            openSidebar();
        }
    });

    sidebarEl.querySelector('.sidebar-close').addEventListener('click', () => {
        closeSidebar();
    });

    sidebarOverlayEl.addEventListener('click', () => {
        closeSidebar();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sidebarEl.classList.contains('active')) {
            closeSidebar();
        }
    });

    sidebarEl.querySelector('.clear-selected').addEventListener('click', () => {
        userInput.value = '';
        autoResizeTextarea();
        updateSuggestions('');
        syncSelectedPanel();
        renderSymptomItems(sidebarEl.querySelector('#symptom-search').value);
        userInput.focus();
    });

    userInput.addEventListener('input', () => {
        if (sidebarEl.classList.contains('active')) {
            syncSelectedPanel();
            renderSymptomItems(sidebarEl.querySelector('#symptom-search').value);
        }
    });
}

function appendSymptomToInput(symptom) {
    const raw = userInput.value.trim();
    const display = normalizeDisplay(symptom);
    const parts = raw
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => part.replace(/^i have\s+/i, '').trim());
    const hasAlready = parts.some((part) => part.toLowerCase() === display.toLowerCase());

    if (hasAlready) {
        userInput.focus();
        return;
    }

    if (!raw) {
        userInput.value = `I have ${display}`;
    } else {
        userInput.value = `${raw}, ${display}`;
    }

    autoResizeTextarea();
    updateSuggestions('');
    userInput.focus();
}

function buildInlineSuggestions() {
    suggestionsEl = document.createElement('div');
    suggestionsEl.className = 'inline-suggestions';
    suggestionsEl.id = 'inline-suggestions';

    const inputContainer = document.querySelector('.input-container');
    inputContainer.insertBefore(suggestionsEl, inputContainer.querySelector('.statdes'));
}

function updateSuggestions(text) {
    if (!suggestionsEl) {
        return;
    }

    const query = text.trim().toLowerCase();
    if (!query || query.length < 2) {
        suggestionsEl.innerHTML = '';
        suggestionsEl.classList.remove('active');
        return;
    }

    const matches = availableSymptoms
        .filter((symptom) => normalizeDisplay(symptom).toLowerCase().includes(query))
        .slice(0, 5);

    if (!matches.length) {
        suggestionsEl.innerHTML = '';
        suggestionsEl.classList.remove('active');
        return;
    }

    suggestionsEl.innerHTML = matches
        .map((symptom) => `<button type=\"button\" class=\"suggestion-chip\" data-symptom=\"${escapeHtml(symptom)}\">${escapeHtml(normalizeDisplay(symptom))}</button>`)
        .join('');

    suggestionsEl.classList.add('active');

    suggestionsEl.querySelectorAll('.suggestion-chip').forEach((chip) => {
        chip.addEventListener('click', () => appendSymptomToInput(chip.dataset.symptom));
    });
}

async function renderHistory() {
    try {
        const response = await fetch(`/api/history/${encodeURIComponent(patientId)}`);
        const result = await response.json();

        if (!response.ok || !Array.isArray(result.history)) {
            addMessage('Unable to load history right now.', 'ai-message', false);
            return;
        }

        if (result.history.length === 0) {
            addMessage('No history found yet. Submit a symptom analysis first.', 'ai-message', false);
            return;
        }

        const listHtml = result.history.slice(0, 7).map((item) => {
            const date = new Date((item.timestamp || 0) * 1000).toLocaleString();
            return `
                <div class=\"alternative-item\">
                    <span class=\"alt-disease\">${escapeHtml(item.disease || 'Unknown')}</span>
                    <span class=\"alt-confidence\">${Math.round((item.confidence || 0) * 100)}%</span>
                    <span class=\"history-time\">${escapeHtml(date)}</span>
                </div>
            `;
        }).join('');

        addMessage(`
            <div class=\"alternative-diagnoses\">
                <h4><i class=\"fas fa-chart-line\"></i> Recent Health Trends</h4>
                <div class=\"alternative-list\">${listHtml}</div>
            </div>
        `, 'ai-message', true);
    } catch (error) {
        console.error('History error:', error);
        addMessage('Unable to load history right now.', 'ai-message', false);
    }
}

function renderMedicationForm() {
    const formHtml = `
        <div class="feature-form-card">
            <h4><i class="fas fa-pills"></i> Medication Log</h4>
            <p class="confidence-explanation">Track medicine schedule to improve treatment adherence and doctor consultations.</p>
            <div class="feature-form-grid">
                <input id="med-name" class="feature-input" placeholder="Medicine name (e.g., Paracetamol)">
                <input id="med-dosage" class="feature-input" placeholder="Dosage (e.g., 500mg)">
                <input id="med-schedule" class="feature-input" placeholder="Schedule (e.g., Twice daily)">
                <input id="med-notes" class="feature-input" placeholder="Notes (optional)">
            </div>
            <button id="save-med-btn" class="btn-download"><i class="fas fa-save"></i> Save Medication</button>
        </div>
    `;
    addMessage(formHtml, 'ai-message', true);

    const saveBtn = document.getElementById('save-med-btn');
    if (!saveBtn) {
        return;
    }
    saveBtn.addEventListener('click', saveMedicationEntry);
}

async function saveMedicationEntry() {
    const medicine_name = document.getElementById('med-name')?.value?.trim();
    const dosage = document.getElementById('med-dosage')?.value?.trim();
    const schedule = document.getElementById('med-schedule')?.value?.trim();
    const notes = document.getElementById('med-notes')?.value?.trim() || '';

    if (!medicine_name || !dosage || !schedule) {
        addMessage('Please fill medicine name, dosage, and schedule.', 'ai-message', false);
        return;
    }

    try {
        const response = await fetch('/api/medications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ patient_id: patientId, medicine_name, dosage, schedule, notes, ...getLanguageMetadata() })
        });
        const result = await response.json();
        if (!response.ok || result.error) {
            renderApiError(result);
            return;
        }
        addMessage(`Medication saved: ${medicine_name} (${dosage}) - ${schedule}`, 'ai-message', false);
    } catch (error) {
        console.error('Medication save error:', error);
        renderApiError({ error: 'Unable to save medication right now.' });
    }
}

function renderSleepForm() {
    const formHtml = `
        <div class="feature-form-card">
            <h4><i class="fas fa-moon"></i> Sleep Tracker</h4>
            <p class="confidence-explanation">Log sleep quality daily for better symptom correlation and wellness scoring.</p>
            <div class="feature-form-grid">
                <input id="sleep-hours" class="feature-input" type="number" step="0.5" min="1" max="24" placeholder="Hours slept (e.g., 7.5)">
                <input id="sleep-quality" class="feature-input" type="number" min="1" max="5" placeholder="Quality 1-5">
                <input id="sleep-notes" class="feature-input" placeholder="Notes (optional)">
            </div>
            <button id="save-sleep-btn" class="btn-download"><i class="fas fa-save"></i> Save Sleep Entry</button>
        </div>
    `;
    addMessage(formHtml, 'ai-message', true);

    const saveBtn = document.getElementById('save-sleep-btn');
    if (!saveBtn) {
        return;
    }
    saveBtn.addEventListener('click', saveSleepEntry);
}

async function saveSleepEntry() {
    const hours = Number(document.getElementById('sleep-hours')?.value);
    const quality = Number(document.getElementById('sleep-quality')?.value);
    const notes = document.getElementById('sleep-notes')?.value?.trim() || '';

    if (!hours || !quality) {
        addMessage('Please enter both sleep hours and quality score.', 'ai-message', false);
        return;
    }

    try {
        const response = await fetch('/api/sleep', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ patient_id: patientId, hours, quality, notes, ...getLanguageMetadata() })
        });
        const result = await response.json();
        if (!response.ok || result.error) {
            renderApiError(result);
            return;
        }
        addMessage(`Sleep entry saved: ${hours} hours, quality ${quality}/5.`, 'ai-message', false);
    } catch (error) {
        console.error('Sleep save error:', error);
        renderApiError({ error: 'Unable to save sleep entry right now.' });
    }
}

async function renderTrendDashboard() {
    try {
        const [trendsResponse, historyResponse] = await Promise.all([
            fetch(`/api/trends/${encodeURIComponent(patientId)}`),
            fetch(`/api/history/${encodeURIComponent(patientId)}`)
        ]);
        const trends = await trendsResponse.json();
        const historyData = await historyResponse.json();

        if (!trendsResponse.ok || trends.error) {
            renderApiError(trends);
            return;
        }

        const riskBucket = (trends.risk_bucket || '').toLowerCase();
        const riskLabel = riskBucket ? riskBucket : (trends.wellness_score >= 80 ? 'Excellent' : trends.wellness_score >= 60 ? 'Stable' : 'Needs Attention');
        const riskClass = riskBucket === 'high'
            ? 'severity-high'
            : riskBucket === 'moderate'
                ? 'severity-medium'
                : 'severity-low';

        const historyRows = (historyData.history || []).slice(0, 5).map((item) => {
            const date = new Date((item.timestamp || 0) * 1000).toLocaleDateString();
            return `<div class="alternative-item"><span class="alt-disease">${escapeHtml(item.disease || 'Unknown')} (${date})</span><span class="alt-confidence">${Math.round((item.confidence || 0) * 100)}%</span></div>`;
        }).join('');

        const sleepRows = (trends.recent_sleep || []).slice(0, 5).map((item) => {
            const date = new Date((item.timestamp || 0) * 1000).toLocaleDateString();
            return `<div class="alternative-item"><span class="alt-disease">${date} - ${item.hours} hrs</span><span class="alt-confidence">Q${item.quality}/5</span></div>`;
        }).join('');

        const medsRows = (trends.recent_medications || []).slice(0, 5).map((item) => {
            return `<div class="alternative-item"><span class="alt-disease">${escapeHtml(item.medicine_name)} (${escapeHtml(item.dosage)})</span><span class="alt-confidence">${escapeHtml(item.schedule)}</span></div>`;
        }).join('');

        const insightsHtml = (trends.key_insights || []).map((insight) => `<li>${escapeHtml(insight)}</li>`).join('');
        const recommendationHtml = (trends.recommendations || []).map((rec) => `<li>${escapeHtml(rec)}</li>`).join('');

        addMessage(`
            <div class="prediction-result">
                <h3><i class="fas fa-chart-line"></i> Health Intelligence Dashboard</h3>
                <div class="severity-indicator ${riskClass}">Wellness Score: ${trends.wellness_score}/100 (${riskLabel})</div>
                <div class="metrics-grid">
                    <div class="metric-card"><span class="metric-label">Predictions</span><strong>${trends.prediction_count}</strong></div>
                    <div class="metric-card"><span class="metric-label">Avg Confidence</span><strong>${Math.round((trends.avg_confidence || 0) * 100)}%</strong></div>
                    <div class="metric-card"><span class="metric-label">Avg Sleep</span><strong>${trends.avg_sleep_hours || 0} hrs</strong></div>
                    <div class="metric-card"><span class="metric-label">Urgent Flags</span><strong>${trends.urgent_count}</strong></div>
                </div>
                <div class="followup-section">
                    <h4><i class="fas fa-lightbulb"></i> Key Insights</h4>
                    <ul class="followup-questions">${insightsHtml}</ul>
                </div>
                <div class="careplan-section">
                    <h4><i class="fas fa-route"></i> Recommended Next Actions</h4>
                    <ul class="followup-questions">${recommendationHtml || '<li>No recommendations yet.</li>'}</ul>
                </div>
                <div class="alternative-diagnoses">
                    <h4><i class="fas fa-notes-medical"></i> Recent Diagnoses</h4>
                    <div class="alternative-list">${historyRows || '<p>No diagnosis logs yet.</p>'}</div>
                </div>
                <div class="specialist-section">
                    <h4><i class="fas fa-bed"></i> Recent Sleep Logs</h4>
                    <div class="alternative-list">${sleepRows || '<p>No sleep logs yet.</p>'}</div>
                </div>
                <div class="feature-importance-section">
                    <h4><i class="fas fa-capsules"></i> Recent Medications</h4>
                    <div class="alternative-list">${medsRows || '<p>No medication logs yet.</p>'}</div>
                </div>
            </div>
        `, 'ai-message', true);
    } catch (error) {
        console.error('Trends error:', error);
        renderApiError({ error: 'Unable to load trend dashboard right now.' });
    }
}

async function initApp() {
    patientId = getOrCreatePatientId();

    initLanguageSelector();
    showWelcomeMessage();
    initThemeToggle();
    initSpeechToText();
    buildInlineSuggestions();

    sendBtn.addEventListener('click', handleUserInput);
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleUserInput();
        }
    });

    userInput.addEventListener('input', () => {
        autoResizeTextarea();
        const tokens = userInput.value.split(',');
        updateSuggestions(tokens[tokens.length - 1] || userInput.value);
    });

    autoResizeTextarea();

    try {
        const response = await fetch('/api/symptoms');
        const data = await response.json();
        availableSymptoms = Array.isArray(data.symptoms) ? data.symptoms.sort() : [];
    } catch (error) {
        console.error('Symptoms load error:', error);
        addMessage(t('symptomLoadFailed'), 'ai-message', false);
    }

    buildSidebar();
}

function generatePDF() {
    if (!lastPrediction) {
        alert('No prediction data available');
        return;
    }

    const result = lastPrediction;
    const now = new Date();
    const date = now.toLocaleDateString();
    const time = now.toLocaleTimeString();

    const pdfContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Diagnosis Report - SympTrack AI</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
                .header { text-align: center; border-bottom: 2px solid #6366f1; padding-bottom: 10px; margin-bottom: 20px; }
                .logo { color: #6366f1; font-size: 24px; font-weight: bold; }
                .date { color: #666; font-size: 12px; }
                h1 { color: #333; font-size: 22px; }
                h2 { color: #6366f1; font-size: 18px; margin-top: 20px; }
                h3 { color: #444; font-size: 16px; }
                .diagnosis-box { background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 15px 0; }
                .confidence { font-size: 16px; font-weight: bold; }
                .high { color: #d97706; }
                .medium { color: #3b82f6; }
                .low { color: #10b981; }
                .urgent { background: #fee2e2; border: 2px solid #ef4444; padding: 10px; border-radius: 5px; color: #dc2626; }
                .section { margin: 15px 0; }
                .symptoms-list { display: flex; flex-wrap: wrap; gap: 5px; }
                .symptom-tag { background: #e5e7eb; padding: 5px 10px; border-radius: 15px; font-size: 12px; }
                .specialist-card { background: #f0f9ff; padding: 15px; border-radius: 8px; border-left: 4px solid #0ea5e9; }
                .tests-list { list-style: none; padding-left: 0; }
                .tests-list li { padding: 3px 0; }
                .disclaimer { background: #fef3c7; padding: 15px; border-radius: 8px; font-size: 12px; margin-top: 30px; border-left: 4px solid #f59e0b; }
            </style>
        </head>
        <body>
            <div class=\"header\">
                <div class=\"logo\">SympTrack AI - Diagnosis Report</div>
                <div class=\"date\">Generated on: ${date} at ${time}</div>
            </div>
            <div class=\"diagnosis-box\">
                <h1>Primary Diagnosis: ${escapeHtml(result.disease || 'Unknown')}</h1>
                <p class=\"confidence\">Confidence Level: <span class=\"${result.confidence > 0.7 ? 'high' : result.confidence > 0.4 ? 'medium' : 'low'}\">${Math.round((result.confidence || 0) * 100)}%</span></p>
                <p>${escapeHtml(result.confidence_explanation || '')}</p>
            </div>
            ${result.is_urgent ? `<div class=\"urgent\"><strong>URGENT:</strong> ${escapeHtml(result.urgent_warning || '')}</div>` : ''}
            <div class=\"section\"><h2>Description</h2><p>${escapeHtml(result.description || 'No description available')}</p></div>
            <div class=\"section\"><h2>Treatment</h2><p>${escapeHtml(result.treatment || 'Consult a healthcare professional')}</p></div>
            <div class=\"section\"><h2>Self Care</h2><p>${escapeHtml(result.self_care || 'Rest and monitor symptoms')}</p></div>
            ${result.specialist ? `
                <div class=\"section\">
                    <h2>Recommended Specialist</h2>
                    <div class=\"specialist-card\">
                        <h3>${escapeHtml(result.specialist.specialist || '')}</h3>
                        <p><strong>Recommended Tests:</strong></p>
                        <ul class=\"tests-list\">${(result.specialist.tests || []).map((test) => `<li>${escapeHtml(test)}</li>`).join('')}</ul>
                        <p><strong>Preparation:</strong> ${escapeHtml(result.specialist.preparation || '')}</p>
                    </div>
                </div>
            ` : ''}
            <div class=\"section\">
                <h2>Reported Symptoms</h2>
                <div class=\"symptoms-list\">${(result.symptoms_used || []).map((s) => `<span class=\"symptom-tag\">${escapeHtml(normalizeDisplay(s))}</span>`).join('')}</div>
            </div>
            <div class=\"disclaimer\">
                <strong>IMPORTANT DISCLAIMER</strong>
                <p>This report is AI-generated and not a medical diagnosis. Always consult a qualified healthcare professional.</p>
            </div>
        </body>
        </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(pdfContent);
    printWindow.document.close();
    printWindow.print();
}

window.generatePDF = generatePDF;
document.addEventListener('DOMContentLoaded', initApp);
