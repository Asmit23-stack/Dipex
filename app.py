import os
import pandas as pd
import numpy as np
import json
import hashlib
import re
import time
import pickle
import traceback
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from sklearn.naive_bayes import MultinomialNB
from collections import defaultdict
import requests

app = Flask(__name__,
            static_folder=os.path.join('frontend', 'static'),
            template_folder=os.path.join('frontend', 'templates'))
CORS(app)

# Rate limiting configuration
RATE_LIMIT = 100  # requests per minute
rate_limit_store = defaultdict(list)

# Audit logging
audit_log = []
symptom_alias_map = {}
output_translation_cache = {}
SUPPORTED_OUTPUT_LANGS = {
    'hi': 'Hindi',
    'mr': 'Marathi'
}


def normalize_symptom(value):
    """Normalize symptom text to the dataset format."""
    if value is None:
        return ""
    return str(value).strip().lower().replace(" ", "_")


def load_symptom_alias_map():
    """Load alias->canonical symptom mappings from symptoms_list.csv."""
    alias_map = {}
    data_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'symptoms_list.csv')
    if not os.path.exists(data_path):
        return alias_map

    try:
        df = pd.read_csv(data_path)
        if 'Symptom' not in df.columns:
            return alias_map

        for _, row in df.iterrows():
            canonical = normalize_symptom(row.get('Symptom', ''))
            if not canonical:
                continue
            alias_map[canonical] = canonical

            aliases = str(row.get('Aliases', '')).strip()
            if aliases:
                for alias in aliases.split(','):
                    key = normalize_symptom(alias)
                    if key:
                        alias_map[key] = canonical
    except Exception as e:
        print(f"Alias map load warning: {e}")

    return alias_map


def canonicalize_symptom(symptom):
    key = normalize_symptom(symptom)
    if key in symptom_alias_map:
        return symptom_alias_map[key]
    return key

def check_rate_limit(ip):
    """Check if request exceeds rate limit"""
    current_time = time.time()
    # Clean old requests
    rate_limit_store[ip] = [t for t in rate_limit_store[ip] if current_time - t < 60]
    
    if len(rate_limit_store[ip]) >= RATE_LIMIT:
        return False
    
    rate_limit_store[ip].append(current_time)
    return True

def log_audit(event_type, details):
    """Log API events for security"""
    audit_log.append({
        'timestamp': time.time(),
        'event_type': event_type,
        'details': details
    })
    # Keep memory growth bounded in long-running deployments.
    if len(audit_log) > 5000:
        del audit_log[:1000]


def resolve_output_language(language_code):
    """Resolve supported output translation language from locale code."""
    base = str(language_code or 'en-US').split('-')[0].strip().lower()
    return base if base in SUPPORTED_OUTPUT_LANGS else 'en'


def translate_texts_with_groq(texts, target_lang):
    """Translate a list of strings using Groq, returning None on failure."""
    api_key = os.environ.get('GROQ_API_KEY', '').strip()
    if not api_key:
        return None

    try:
        lang_name = SUPPORTED_OUTPUT_LANGS.get(target_lang, target_lang)
        response = requests.post(
            'https://api.groq.com/openai/v1/chat/completions',
            headers={
                'Authorization': f'Bearer {api_key}',
                'Content-Type': 'application/json'
            },
            json={
                'model': 'llama3-8b-8192',
                'messages': [
                    {
                        'role': 'system',
                        'content': (
                            'You are a precise medical UI translator. Translate each input string to '
                            f'{lang_name}. Keep clinical meaning, numbers, and punctuation intact. '
                            'Return valid JSON only in this exact format: '
                            '{"translations":["t1","t2"]}.'
                        )
                    },
                    {
                        'role': 'user',
                        'content': json.dumps({'texts': texts}, ensure_ascii=False)
                    }
                ],
                'temperature': 0.1
            },
            timeout=20
        )
        if response.status_code != 200:
            return None

        body = response.json()
        content = body.get('choices', [{}])[0].get('message', {}).get('content', '')
        match = re.search(r'\{.*\}', content, re.S)
        if not match:
            return None

        parsed = json.loads(match.group())
        translations = parsed.get('translations')
        if not isinstance(translations, list) or len(translations) != len(texts):
            return None

        return [str(item) for item in translations]
    except Exception:
        return None


def translate_text_with_google(text, target_lang):
    """Fallback text translation using Google Translate's public endpoint."""
    try:
        response = requests.get(
            'https://translate.googleapis.com/translate_a/single',
            params={
                'client': 'gtx',
                'sl': 'en',
                'tl': target_lang,
                'dt': 't',
                'q': text
            },
            timeout=10
        )
        if response.status_code != 200:
            return text
        payload = response.json()
        parts = payload[0] if isinstance(payload, list) and payload else []
        translated = ''.join(part[0] for part in parts if isinstance(part, list) and part and part[0])
        return translated or text
    except Exception:
        return text


def translate_text_list(texts, target_lang):
    """Translate strings with cache + Groq batch + Google fallback."""
    if target_lang == 'en':
        return list(texts)

    results = [None] * len(texts)
    unresolved_positions = []
    unresolved_values = []

    for idx, text in enumerate(texts):
        raw = str(text or '').strip()
        if not raw:
            results[idx] = text
            continue

        cache_key = (target_lang, raw)
        if cache_key in output_translation_cache:
            results[idx] = output_translation_cache[cache_key]
        else:
            unresolved_positions.append(idx)
            unresolved_values.append(raw)

    if unresolved_values:
        translated_batch = translate_texts_with_groq(unresolved_values, target_lang)
        if translated_batch is None:
            translated_batch = [translate_text_with_google(value, target_lang) for value in unresolved_values]

        for pos, original, translated in zip(unresolved_positions, unresolved_values, translated_batch):
            final_text = translated or original
            output_translation_cache[(target_lang, original)] = final_text
            results[pos] = final_text

    if len(output_translation_cache) > 10000:
        for key in list(output_translation_cache.keys())[:2000]:
            output_translation_cache.pop(key, None)

    return [value if value is not None else texts[idx] for idx, value in enumerate(results)]


def translate_prediction_payload(payload, language_code):
    """Translate human-readable prediction payload fields for UI output."""
    target_lang = resolve_output_language(language_code)
    payload['output_language'] = target_lang
    if target_lang == 'en':
        return payload

    text_nodes = []
    setters = []

    def add_node(value, setter):
        if isinstance(value, str) and value.strip():
            text_nodes.append(value)
            setters.append(setter)

    for key in ['disease', 'confidence_explanation', 'description', 'treatment', 'self_care', 'urgent_warning']:
        add_node(payload.get(key), lambda translated, k=key: payload.__setitem__(k, translated))

    for item in payload.get('alternative_diagnoses', []):
        if isinstance(item, dict):
            add_node(item.get('disease'), lambda translated, row=item: row.__setitem__('disease', translated))

    specialist = payload.get('specialist')
    if isinstance(specialist, dict):
        add_node(
            specialist.get('specialist'),
            lambda translated, row=specialist: row.__setitem__('localized_specialist', translated)
        )
        add_node(
            specialist.get('preparation'),
            lambda translated, row=specialist: row.__setitem__('preparation', translated)
        )
        tests = specialist.get('tests')
        if isinstance(tests, list):
            for idx, test in enumerate(tests):
                add_node(test, lambda translated, arr=tests, i=idx: arr.__setitem__(i, translated))

    for key in ['followup_questions', 'care_plan']:
        values = payload.get(key)
        if isinstance(values, list):
            for idx, value in enumerate(values):
                add_node(value, lambda translated, arr=values, i=idx: arr.__setitem__(i, translated))

    triage = payload.get('triage')
    if isinstance(triage, dict):
        add_node(triage.get('level'), lambda translated, row=triage: row.__setitem__('level', translated))
        reasons = triage.get('reasons')
        if isinstance(reasons, list):
            for idx, value in enumerate(reasons):
                add_node(value, lambda translated, arr=reasons, i=idx: arr.__setitem__(i, translated))

        actions = triage.get('recommended_actions')
        if isinstance(actions, list):
            for idx, value in enumerate(actions):
                add_node(value, lambda translated, arr=actions, i=idx: arr.__setitem__(i, translated))

    if text_nodes:
        translated = translate_text_list(text_nodes, target_lang)
        for setter, translated_text in zip(setters, translated):
            setter(translated_text)

    return payload

# NLP - Groq API integration with fallback
def extract_symptoms_from_text(text):
    """
    LLM-Powered Symptom Extraction using Groq API
    Falls back to rule-based extraction if API fails
    """
    # Try Groq API first
    try:
        groq_api_key = os.environ.get('GROQ_API_KEY', '')
        if groq_api_key:
            response = requests.post(
                'https://api.groq.com/openai/v1/chat/completions',
                headers={
                    'Authorization': f'Bearer {groq_api_key}',
                    'Content-Type': 'application/json'
                },
                json={
                    'model': 'llama3-8b-8192',
                    'messages': [
                        {
                            'role': 'system',
                            'content': 'You are a medical symptom extractor. Extract symptoms from the user text and return them as a JSON array of symptom strings. Only include valid medical symptoms. Return in format: {"symptoms": ["symptom1", "symptom2"]}'
                        },
                        {
                            'role': 'user',
                            'content': text
                        }
                    ],
                    'temperature': 0.1
                },
                timeout=10
            )
            
            if response.status_code == 200:
                result = response.json()
                content = result['choices'][0]['message']['content']
                # Parse JSON from response
                match = re.search(r'\{.*\}', content)
                if match:
                    data = json.loads(match.group())
                    return [canonicalize_symptom(s) for s in data.get('symptoms', []) if str(s).strip()]
    except Exception as e:
        print(f"Groq API error: {e}")
    
    # Fallback: Rule-based symptom extraction
    return fallback_symptom_extraction(text)

def fallback_symptom_extraction(text):
    """Fallback method when Groq API is unavailable"""
    text = text.lower()
    
    # Common symptom patterns
    symptom_patterns = {
        'fever': ['fever', 'high temperature', 'febrile'],
        'headache': ['headache', 'head pain', 'head ache'],
        'cough': ['cough', 'coughing'],
        'fatigue': ['fatigue', 'tired', 'tiredness', 'exhausted', 'weakness'],
        'nausea': ['nausea', 'nauseous', 'feel sick'],
        'vomiting': ['vomiting', 'vomit', 'throwing up'],
        'diarrhea': ['diarrhea', 'loose stool', 'watery stool'],
        'abdominal_pain': ['stomach pain', 'abdominal pain', 'belly pain', 'stomach ache'],
        'chest_pain': ['chest pain', 'chest tightness'],
        'shortness_of_breath': ['shortness of breath', 'breathlessness', 'difficulty breathing', 'breathing difficulty'],
        'dizziness': ['dizziness', 'dizzy', 'lightheaded', 'light headed'],
        'rash': ['rash', 'skin rash', 'skin eruption'],
        'itching': ['itching', 'itchy', 'pruritus'],
        'joint_pain': ['joint pain', 'arthralgia', 'joint ache'],
        'muscle_pain': ['muscle pain', 'myalgia', 'muscle ache'],
        'sore_throat': ['sore throat', 'throat pain', 'pharyngitis'],
        'runny_nose': ['runny nose', 'rhinorrhea', 'nasal discharge'],
        'congestion': ['congestion', 'stuffy nose', 'blocked nose'],
        'loss_of_appetite': ['loss of appetite', 'no appetite', 'decreased appetite'],
        'weight_loss': ['weight loss', 'losing weight'],
        'insomnia': ['insomnia', 'cannot sleep', 'trouble sleeping', 'sleepless'],
        'anxiety': ['anxiety', 'anxious', 'nervousness', 'nervous'],
        'depression': ['depression', 'depressed', 'sad', 'low mood'],
        'back_pain': ['back pain', 'backache'],
        'constipation': ['constipation', 'constipated'],
        'blurred_vision': ['blurred vision', 'blurry vision', 'vision blur'],
        'increased_thirst': ['increased thirst', 'thirsty', 'excessive thirst'],
        'frequent_urination': ['frequent urination', 'urinating often', 'polyuria'],
        'painful_urination': ['painful urination', 'dysuria', 'burning urination'],
    }
    
    extracted = []
    for symptom, patterns in symptom_patterns.items():
        for pattern in patterns:
            if pattern in text:
                extracted.append(symptom)
                break
    
    return extracted

def generate_followup_questions(symptoms, disease=None):
    """
    Smart Follow-up Questions based on symptoms
    Uses rule-based generation for reliability
    """
    questions = []
    
    symptom_questions = {
        'fever': ['How high is your fever?', 'How long have you had the fever?', 'Does the fever come and go?'],
        'cough': ['Is your cough dry or productive?', 'Are you coughing up any mucus or blood?', 'How long have you been coughing?'],
        'headache': ['Where exactly is the pain located?', 'How severe is the headache on a scale of 1-10?', 'Do you have any sensitivity to light or sound?'],
        'fatigue': ['How long have you been feeling fatigued?', 'Do you have enough sleep?', 'Any difficulty performing daily activities?'],
        'chest_pain': ['How would you describe the pain? (sharp, dull, pressure)', 'Does the pain spread to other areas?', 'Does the pain worsen with movement or breathing?'],
        'shortness_of_breath': ['Do you feel breathless at rest or during activity?', 'Do you have any wheezing?', 'Any history of asthma or heart conditions?'],
        'abdominal_pain': ['Where is the pain located?', 'Does the pain radiate anywhere?', 'Any associated nausea or vomiting?'],
        'diarrhea': ['How many times per day?', 'Any blood in the stool?', 'Any recent food changes?'],
        'rash': ['Where did the rash start?', 'Is it spreading?', 'Any itching or pain?'],
        'joint_pain': ['Which joints are affected?', 'Is the joint swollen or red?', 'Any morning stiffness?'],
        'dizziness': ['Do you feel dizzy when standing up?', 'Any associated nausea?', 'Any hearing changes?'],
        'nausea': ['Any vomiting?', 'Any specific triggers?', 'Any abdominal pain?'],
    }
    
    for symptom in symptoms[:3]:  # Limit to 3 symptoms
        symptom_key = symptom.lower().replace(' ', '_')
        if symptom_key in symptom_questions:
            questions.extend(symptom_questions[symptom_key][:1])  # One question per symptom
    
    # Add general questions if not enough
    if len(questions) < 3:
        general_questions = [
            'How long have you been experiencing these symptoms?',
            'Have you taken any medication for these symptoms?',
            'Do you have any known allergies?'
        ]
        questions.extend(general_questions[:3-len(questions)])
    
    return questions[:3]

def get_feature_importance(symptoms, prediction):
    """
    XAI - Feature Importance
    Provides explanation of which symptoms influenced the prediction
    """
    # Simplified feature importance based on medical knowledge
    importance_scores = {}
    
    # Common symptom-disease associations
    disease_symptom_association = {
        'common cold': ['runny_nose', 'sore_throat', 'cough', 'congestion', 'sneezing'],
        'flu': ['fever', 'fatigue', 'body_ache', 'headache', 'cough'],
        'migraine': ['headache', 'nausea', 'sensitivity_to_light', 'dizziness'],
        'gastroenteritis': ['diarrhea', 'vomiting', 'nausea', 'abdominal_pain', 'fever'],
        'pneumonia': ['fever', 'cough', 'shortness_of_breath', 'chest_pain', 'fatigue'],
        'bronchial asthma': ['shortness_of_breath', 'wheezing', 'cough', 'chest_tightness'],
        'diabetes': ['increased_thirst', 'frequent_urination', 'fatigue', 'blurred_vision'],
        'hypertension': ['headache', 'dizziness', 'chest_pain', 'shortness_of_breath'],
        'allergy': ['sneezing', 'runny_nose', 'itching', 'rash', 'watery_eyes'],
        'arthritis': ['joint_pain', 'stiffness', 'swelling', 'reduced_mobility'],
    }
    
    disease_key = prediction.lower().strip() if prediction else ''
    associated_symptoms = disease_symptom_association.get(disease_key, [])
    
    for symptom in symptoms:
        symptom_key = symptom.lower().replace(' ', '_')
        if symptom_key in associated_symptoms:
            importance_scores[symptom] = 0.8  # High importance
        else:
            importance_scores[symptom] = 0.5  # Medium importance
    
    return importance_scores

def get_confidence_explanation(confidence):
    """XAI - Confidence Scoring explanation"""
    if confidence >= 0.8:
        return "High confidence - The symptoms strongly match this condition based on our training data."
    elif confidence >= 0.5:
        return "Medium confidence - The symptoms partially match this condition. Consider consulting a doctor."
    else:
        return "Low confidence - The symptoms are not strongly indicative of this condition. Please consult a healthcare professional for proper diagnosis."

def detect_urgent_case(disease, symptoms):
    """Doctor & Specialist - Urgent case detection"""
    urgent_conditions = [
        'heart attack', 'stroke', 'severe bleeding', 'Difficulty Breathing',
        'chest pain', 'severe abdominal pain', 'high fever', 'seizures',
        'loss of consciousness', 'severe burns', 'poisoning'
    ]
    
    urgent_symptoms = [
        'chest pain', 'difficulty breathing', 'severe bleeding', 
        'seizures', 'unconscious', 'stroke symptoms'
    ]
    
    disease_lower = disease.lower() if disease else ''
    normalized_symptoms = [normalize_symptom(s).replace('_', ' ') for s in (symptoms or [])]
    symptoms_lower = ' '.join(normalized_symptoms).lower()
    
    is_urgent = any(cond in disease_lower for cond in urgent_conditions)
    is_urgent = is_urgent or any(symptom in symptoms_lower for symptom in urgent_symptoms)
    
    urgent_warning = ""
    if is_urgent:
        urgent_warning = "URGENT: This may be a medical emergency. Please seek immediate medical attention or call emergency services."
    
    return is_urgent, urgent_warning


def assess_triage(symptoms, disease, confidence, is_urgent):
    """Compute triage score, level, and reasons for decision support."""
    score = 0
    reasons = []

    normalized = [normalize_symptom(s).replace('_', ' ') for s in (symptoms or [])]
    symptom_text = ' '.join(normalized).lower()
    disease_text = (disease or '').lower()

    red_flag_terms = [
        'chest pain', 'shortness of breath', 'difficulty breathing', 'seizure',
        'unconscious', 'bleeding', 'high fever', 'paralysis'
    ]
    if any(flag in symptom_text for flag in red_flag_terms):
        score += 35
        reasons.append("Red-flag symptoms detected.")

    if is_urgent:
        score += 30
        reasons.append("Urgent pattern detected by emergency rules.")

    if confidence >= 0.8:
        score += 10
        reasons.append("High-confidence pattern match.")
    elif confidence < 0.45:
        score += 12
        reasons.append("Low-confidence diagnosis needs clinician review.")

    if len(symptoms or []) >= 5:
        score += 10
        reasons.append("Multiple concurrent symptoms reported.")

    severe_disease_terms = ['heart attack', 'stroke', 'pneumonia', 'dengue', 'tuberculosis']
    if any(term in disease_text for term in severe_disease_terms):
        score += 18
        reasons.append("Potentially severe disease category identified.")

    score = int(max(0, min(100, score)))
    if score >= 70:
        level = 'critical'
    elif score >= 45:
        level = 'priority'
    else:
        level = 'routine'

    actions = {
        'critical': [
            "Seek immediate emergency care or call local emergency services.",
            "Do not self-medicate without professional guidance.",
            "Share this report with the attending clinician."
        ],
        'priority': [
            "Book a doctor visit within 24 hours.",
            "Track symptom progression every 4-6 hours.",
            "Complete recommended specialist tests soon."
        ],
        'routine': [
            "Continue monitoring symptoms daily.",
            "Follow hydration, rest, and self-care guidance.",
            "Consult a doctor if symptoms worsen or persist."
        ]
    }

    return {
        'score': score,
        'level': level,
        'reasons': reasons[:4],
        'recommended_actions': actions[level]
    }


def build_care_plan(patient_id, disease, symptoms, confidence, triage):
    """Generate personalized next-step care plan using patient context."""
    plan = []
    followup_window = "within 48 hours"
    if triage['level'] == 'critical':
        followup_window = "immediately"
    elif triage['level'] == 'priority':
        followup_window = "within 24 hours"

    plan.append(f"Clinical follow-up: Consult a healthcare professional {followup_window}.")

    if confidence < 0.5:
        plan.append("Diagnosis confidence is moderate/low; request confirmatory clinical evaluation.")

    sleep_logs = sorted(get_sleep_logs(patient_id), key=lambda x: x.get('timestamp', 0), reverse=True)[:7]
    if sleep_logs:
        avg_sleep = float(np.mean([entry.get('hours', 0) for entry in sleep_logs]))
        if avg_sleep < 6:
            plan.append("Sleep optimization: target 7-8 hours nightly for recovery support.")

    meds = sorted(get_medication_logs(patient_id), key=lambda x: x.get('timestamp', 0), reverse=True)[:10]
    if meds:
        plan.append("Medication adherence: continue logged medications as prescribed and update changes daily.")
    else:
        plan.append("Medication tracker is empty. Log prescribed medicines to improve care continuity.")

    symptom_count = len(symptoms or [])
    if symptom_count >= 4:
        plan.append("Symptom burden is high. Keep a timed symptom diary (morning/evening).")

    plan.append("Escalation rule: seek urgent care if breathing worsens, chest pain starts, or consciousness changes.")

    return plan[:5]

def get_specialist_recommendation(disease):
    """Doctor & Specialist - Recommend specialists based on predicted disease"""
    specialist_map = {
        'cardiovascular': {
            'diseases': ['heart attack', 'hypertension', 'irregular heartbeat', 'heart failure'],
            'specialist': 'Cardiologist',
            'tests': ['ECG', 'Echocardiogram', 'Blood Pressure Monitoring', 'Cholesterol Test'],
            'preparation': 'Avoid caffeine 24 hours before, bring list of medications'
        },
        'respiratory': {
            'diseases': ['pneumonia', 'bronchial asthma', 'bronchitis', 'tuberculosis', 'cough'],
            'specialist': 'Pulmonologist',
            'tests': ['Chest X-Ray', 'Spirometry', 'CT Scan', 'Blood Tests'],
            'preparation': 'Avoid smoking 24 hours before, bring previous X-rays if available'
        },
        'gastrointestinal': {
            'diseases': ['gastroenteritis', 'peptic ulcer', 'gerd', 'jaundice', 'hepatitis'],
            'specialist': 'Gastroenterologist',
            'tests': ['Endoscopy', 'Colonoscopy', 'Liver Function Tests', 'Stool Analysis'],
            'preparation': 'Fast 8-12 hours before, follow specific diet instructions'
        },
        'neurological': {
            'diseases': ['migraine', 'headache', 'seizures', 'paralysis', 'brain hemorrhage'],
            'specialist': 'Neurologist',
            'tests': ['MRI', 'CT Scan', 'EEG', 'Neurological Examination'],
            'preparation': 'Avoid caffeine, remove metal objects, inform about medications'
        },
        'dermatological': {
            'diseases': ['acne', 'rash', 'psoriasis', 'eczema', 'fungal infection'],
            'specialist': 'Dermatologist',
            'tests': ['Skin Biopsy', 'Patch Test', 'Wood Lamp Examination', 'Blood Tests'],
            'preparation': "Don't apply creams before appointment, bring photos of progression"
        },
        'orthopedic': {
            'diseases': ['arthritis', 'osteoarthritis', 'back pain', 'joint pain', 'fractures'],
            'specialist': 'Orthopedic Surgeon',
            'tests': ['X-Ray', 'MRI', 'Joint Fluid Analysis', 'Bone Density Test'],
            'preparation': 'Wear comfortable clothing, bring previous X-rays'
        },
        'endocrinological': {
            'diseases': ['diabetes', 'hypothyroidism', 'hyperthyroidism', 'thyroid'],
            'specialist': 'Endocrinologist',
            'tests': ['Blood Sugar Test', 'Thyroid Function Tests', 'HbA1c', 'Hormone Tests'],
            'preparation': 'Fast 8-12 hours for blood sugar, bring glucose monitor records'
        },
        'infectious': {
            'diseases': ['dengue', 'malaria', 'typhoid', 'chickenpox', 'aids', 'hepatitis'],
            'specialist': 'Infectious Disease Specialist',
            'tests': ['Blood Culture', 'Widal Test', 'HIV Test', 'Malaria Rapid Test'],
            'preparation': 'Bring travel history, list of vaccinations'
        },
        'general': {
            'diseases': ['common cold', 'flu', 'fever', 'allergy'],
            'specialist': 'General Physician',
            'tests': ['General Blood Test', 'Physical Examination'],
            'preparation': 'List all symptoms and their duration'
        }
    }
    
    disease_lower = disease.lower() if disease else ''
    
    for category, info in specialist_map.items():
        if any(d in disease_lower for d in info['diseases']):
            return info
    
    # Default to general physician
    return specialist_map['general']

# Anonymized patient tracking (file-based)
def hash_patient_id(patient_id):
    """Security - Hash patient ID for anonymity"""
    return hashlib.sha256(patient_id.encode()).hexdigest()[:16]

def save_patient_history(patient_id, prediction_data):
    """Patient Profiles - Save prediction history"""
    history_file = 'patient_history.json'
    hashed_id = hash_patient_id(patient_id)
    
    try:
        if os.path.exists(history_file):
            with open(history_file, 'r', encoding='utf-8') as f:
                history = json.load(f)
        else:
            history = {}
        
        if hashed_id not in history:
            history[hashed_id] = []
        
        history[hashed_id].append(prediction_data)
        
        with open(history_file, 'w', encoding='utf-8') as f:
            json.dump(history, f, indent=2)
    except Exception as e:
        print(f"Error saving history: {e}")

def get_patient_history(patient_id):
    """Patient Profiles - Get prediction history"""
    history_file = 'patient_history.json'
    hashed_id = hash_patient_id(patient_id)
    
    try:
        if os.path.exists(history_file):
            with open(history_file, 'r', encoding='utf-8') as f:
                history = json.load(f)
            return history.get(hashed_id, [])
    except Exception as e:
        print(f"Error reading history: {e}")
    
    return []


def _load_json(path):
    try:
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        print(f"Error loading {path}: {e}")
    return {}


def _save_json(path, data):
    try:
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
        return True
    except Exception as e:
        print(f"Error saving {path}: {e}")
        return False


def save_medication_log(patient_id, record):
    """Store patient medication logs."""
    file_path = 'medication_history.json'
    hashed_id = hash_patient_id(patient_id)
    data = _load_json(file_path)
    data.setdefault(hashed_id, []).append(record)
    _save_json(file_path, data)


def get_medication_logs(patient_id):
    file_path = 'medication_history.json'
    hashed_id = hash_patient_id(patient_id)
    data = _load_json(file_path)
    return data.get(hashed_id, [])


def save_sleep_log(patient_id, record):
    """Store patient sleep tracking logs."""
    file_path = 'sleep_history.json'
    hashed_id = hash_patient_id(patient_id)
    data = _load_json(file_path)
    data.setdefault(hashed_id, []).append(record)
    _save_json(file_path, data)


def get_sleep_logs(patient_id):
    file_path = 'sleep_history.json'
    hashed_id = hash_patient_id(patient_id)
    data = _load_json(file_path)
    return data.get(hashed_id, [])


def build_trends_summary(patient_id):
    """Build patient analytics summary for hackathon dashboard."""
    history = get_patient_history(patient_id)
    medications = get_medication_logs(patient_id)
    sleep_logs = get_sleep_logs(patient_id)

    recent_history = sorted(history, key=lambda x: x.get('timestamp', 0), reverse=True)[:10]
    recent_sleep = sorted(sleep_logs, key=lambda x: x.get('timestamp', 0), reverse=True)[:14]

    avg_confidence = 0.0
    if recent_history:
        avg_confidence = float(np.mean([item.get('confidence', 0.0) for item in recent_history]))

    urgent_count = sum(1 for item in recent_history if item.get('is_urgent', False))

    avg_sleep_hours = 0.0
    avg_sleep_quality = 0.0
    if recent_sleep:
        avg_sleep_hours = float(np.mean([item.get('hours', 0.0) for item in recent_sleep]))
        avg_sleep_quality = float(np.mean([item.get('quality', 0.0) for item in recent_sleep]))

    latest_medications = sorted(medications, key=lambda x: x.get('timestamp', 0), reverse=True)[:8]

    # A simple wellness score for demo impact (0-100)
    score = 70.0
    score += max(-15.0, min(15.0, (avg_sleep_hours - 7.0) * 5.0))
    score += max(-10.0, min(10.0, (avg_sleep_quality - 3.0) * 5.0))
    score -= min(20.0, urgent_count * 6.0)
    score -= min(12.0, (1.0 - avg_confidence) * 12.0 if recent_history else 0.0)
    wellness_score = int(max(0, min(100, round(score))))

    key_insights = []
    if avg_sleep_hours and avg_sleep_hours < 6:
        key_insights.append("Sleep debt detected: average sleep is below 6 hours.")
    if urgent_count >= 2:
        key_insights.append("Multiple urgent flags in recent history. Prioritize doctor follow-up.")
    if latest_medications:
        key_insights.append(f"Medication adherence log active with {len(latest_medications)} recent entries.")
    if not key_insights:
        key_insights.append("Health trends are stable. Continue consistent monitoring.")

    risk_bucket = 'low'
    if wellness_score < 40:
        risk_bucket = 'high'
    elif wellness_score < 65:
        risk_bucket = 'moderate'

    recommendations = []
    if risk_bucket == 'high':
        recommendations.extend([
            "Schedule clinician review this week and share your timeline report.",
            "Prioritize sleep recovery and strict symptom monitoring twice daily."
        ])
    elif risk_bucket == 'moderate':
        recommendations.extend([
            "Maintain daily logs and schedule preventive check-up if symptoms persist.",
            "Focus on hydration, nutrition, and consistent sleep."
        ])
    else:
        recommendations.extend([
            "Continue healthy routine and periodic symptom tracking.",
            "Review wellness dashboard weekly to detect trend shifts early."
        ])

    return {
        'wellness_score': wellness_score,
        'risk_bucket': risk_bucket,
        'prediction_count': len(history),
        'medication_count': len(medications),
        'sleep_log_count': len(sleep_logs),
        'avg_confidence': round(avg_confidence, 3),
        'avg_sleep_hours': round(avg_sleep_hours, 2),
        'avg_sleep_quality': round(avg_sleep_quality, 2),
        'urgent_count': urgent_count,
        'recent_predictions': recent_history[:7],
        'recent_sleep': recent_sleep[:7],
        'recent_medications': latest_medications[:7],
        'key_insights': key_insights,
        'recommendations': recommendations
    }


disease_info = {
    "acne": {
        "description": "A skin condition that occurs when hair follicles become clogged with oil and dead skin cells.",
        "treatment": "Topical treatments like benzoyl peroxide, salicylic acid, or prescription medication.",
        "self_care": "Keep face clean, avoid picking pimples, and use non-comedogenic products."
    },
    "aids": {
        "description": "A chronic, potentially life-threatening condition caused by the human immunodeficiency virus (HIV).",
        "treatment": "Antiretroviral therapy (ART) to manage the infection.",
        "self_care": "Adhere to medication, maintain hygiene, eat a balanced diet."
    },
    "alcoholic hepatitis": {
        "description": "Liver inflammation caused by drinking too much alcohol.",
        "treatment": "Stop alcohol consumption, medications like corticosteroids.",
        "self_care": "Avoid alcohol, eat nutritious food, and follow medical advice."
    },
    "allergy": {
        "description": "A condition in which the immune system reacts abnormally to a foreign substance.",
        "treatment": "Antihistamines, decongestants, allergy shots.",
        "self_care": "Avoid known allergens and maintain clean environments."
    },
    "arthritis": {
        "description": "Inflammation of one or more joints, causing pain and stiffness.",
        "treatment": "Pain relievers, anti-inflammatory drugs, physical therapy.",
        "self_care": "Regular exercise, weight management, joint protection techniques."
    },
    "bronchial asthma": {
        "description": "A chronic inflammatory disease of the airways causing recurrent breathing problems.",
        "treatment": "Inhaled corticosteroids, bronchodilators, leukotriene modifiers.",
        "self_care": "Avoid triggers, monitor breathing, take medications as prescribed."
    },
    "cervical spondylosis": {
        "description": "Age-related wear and tear affecting the spinal disks in the neck.",
        "treatment": "Pain medication, physical therapy, surgery in severe cases.",
        "self_care": "Neck exercises, good posture, ergonomic adjustments."
    },
    "chickenpox": {
        "description": "A highly contagious viral infection causing an itchy, blister-like rash.",
        "treatment": "Antiviral drugs, antihistamines for itching, fever reducers.",
        "self_care": "Keep clean, avoid scratching, stay hydrated and rest."
    },
    "chronic cholestasis": {
        "description": "A condition where bile flow from the liver is reduced or blocked.",
        "treatment": "Medications to relieve itching, vitamin supplements, surgery if needed.",
        "self_care": "Avoid alcohol, eat a balanced diet, follow medical advice."
    },
    "common cold": {
        "description": "A viral infection of your nose and throat (upper respiratory tract).",
        "treatment": "Rest, fluids, and over-the-counter cold remedies.",
        "self_care": "Get plenty of rest and drink fluids."
    },
    "dengue": {
        "description": "A mosquito-borne viral infection causing high fever and severe pain.",
        "treatment": "Pain relievers, hydration, hospitalization in severe cases.",
        "self_care": "Rest, drink fluids, and prevent mosquito bites."
    },
    "diabetes": {
        "description": "A chronic condition that affects how your body processes blood sugar.",
        "treatment": "Insulin, oral medications, blood sugar monitoring.",
        "self_care": "Healthy diet, regular exercise, and weight management."
    },
    "dimorphic hemorrhoids": {
        "description": "Swollen veins in the lower rectum and anus, both internal and external.",
        "treatment": "Topical treatments, minimally invasive procedures, surgery.",
        "self_care": "High-fiber diet, stay hydrated, avoid straining."
    },
    "drug reaction": {
        "description": "An adverse response to medication, ranging from mild to severe.",
        "treatment": "Stop the drug, antihistamines, corticosteroids, or emergency care.",
        "self_care": "Avoid the drug, report reactions to your doctor."
    },
    "fungal infection": {
        "description": "An infection caused by fungi, often affecting skin, nails or lungs.",
        "treatment": "Antifungal creams, ointments, or oral medications.",
        "self_care": "Keep affected areas clean and dry, avoid sharing personal items."
    },
    "gerd": {
        "description": "Gastroesophageal reflux disease, where stomach acid flows back into the esophagus.",
        "treatment": "Antacids, H2 blockers, proton pump inhibitors.",
        "self_care": "Avoid trigger foods, eat smaller meals, don't lie down after eating."
    },
    "gastroenteritis": {
        "description": "Inflammation of the stomach and intestines, often called stomach flu.",
        "treatment": "Rehydration, electrolyte solutions, medications for symptoms.",
        "self_care": "Rest, clear fluids, and gradual return to normal diet."
    },
    "heart attack": {
        "description": "A blockage of blood flow to the heart muscle, a medical emergency.",
        "treatment": "Emergency care, medications, angioplasty, or bypass surgery.",
        "self_care": "Call emergency services immediately, chew aspirin if instructed."
    },
    "hepatitis b": {
        "description": "A serious liver infection caused by the hepatitis B virus.",
        "treatment": "Antiviral medications, liver transplant in severe cases.",
        "self_care": "Get vaccinated, avoid alcohol, practice safe sex."
    },
    "hepatitis c": {
        "description": "A viral infection that causes liver inflammation, sometimes serious.",
        "treatment": "Antiviral medications, liver transplant in severe cases.",
        "self_care": "Avoid alcohol, get vaccinated against hepatitis A and B."
    },
    "hepatitis d": {
        "description": "A liver infection that occurs only if you have hepatitis B.",
        "treatment": "Pegylated interferon alpha, liver transplant in severe cases.",
        "self_care": "Prevent hepatitis B infection, avoid alcohol, follow medical advice."
    },
    "hepatitis e": {
        "description": "A liver infection caused by the hepatitis E virus, usually acute.",
        "treatment": "Rest, adequate nutrition, fluids, and hospitalization if needed.",
        "self_care": "Practice good hygiene, drink clean water, and get plenty of rest."
    },
    "hypertension": {
        "description": "High blood pressure, a condition that can lead to serious complications.",
        "treatment": "Lifestyle changes, diuretics, ACE inhibitors, calcium channel blockers.",
        "self_care": "Reduce salt intake, exercise regularly, manage stress."
    },
    "hyperthyroidism": {
        "description": "Overactive thyroid gland producing too much thyroid hormone.",
        "treatment": "Anti-thyroid medications, radioactive iodine, or surgery.",
        "self_care": "Follow treatment plan, eat a balanced diet, monitor symptoms."
    },
    "hypoglycemia": {
        "description": "Low blood sugar, especially common in people with diabetes.",
        "treatment": "Fast-acting carbohydrates, glucagon injection in severe cases.",
        "self_care": "Eat regular meals, carry fast-acting sugar sources, monitor blood sugar."
    },
    "hypothyroidism": {
        "description": "Underactive thyroid gland not producing enough thyroid hormone.",
        "treatment": "Synthetic thyroid hormone (levothyroxine) replacement therapy.",
        "self_care": "Take medication as prescribed, follow up with doctor, eat balanced diet."
    },
    "impetigo": {
        "description": "Impetigo is a highly contagious skin infection that mainly affects infants and children.",
        "treatment": "Topical antibiotics like mupirocin or oral antibiotics for severe cases.",
        "self_care": "Keep the area clean, avoid scratching, and wash hands frequently."
    },
    "jaundice": {
        "description": "Yellowing of skin and eyes due to high bilirubin levels, often a liver problem.",
        "treatment": "Depends on underlying cause - may include medications or procedures.",
        "self_care": "Follow doctor's recommendations, rest, and stay hydrated."
    },
    "malaria": {
        "description": "A mosquito-borne disease caused by a parasite, with fever and chills.",
        "treatment": "Antimalarial medications, with type depending on parasite and severity.",
        "self_care": "Prevent mosquito bites, complete medication course, rest and hydrate."
    },
    "migraine": {
        "description": "A neurological condition causing severe, recurring headaches.",
        "treatment": "Pain relievers, triptans, preventive medications if frequent.",
        "self_care": "Identify and avoid triggers, manage stress, maintain regular sleep."
    },
    "osteoarthristis": {
        "description": "The most common form of arthritis, causing joint pain and stiffness.",
        "treatment": "Pain medications, physical therapy, joint replacement in severe cases.",
        "self_care": "Exercise, weight management, joint protection techniques."
    },
    "paralysis (brain hemorrhage)": {
        "description": "Loss of muscle function in part of the body due to bleeding in the brain.",
        "treatment": "Emergency treatment, surgery, rehabilitation therapy.",
        "self_care": "Follow rehabilitation program, adapt living space, seek support."
    },
    "peptic ulcer disease": {
        "description": "Sores that develop on the lining of the stomach, small intestine or esophagus.",
        "treatment": "Antibiotics (if H. pylori present), acid-reducing medications.",
        "self_care": "Avoid NSAIDs, manage stress, don't smoke, limit alcohol."
    },
    "pneumonia": {
        "description": "Infection that inflames air sacs in the lungs, which may fill with fluid.",
        "treatment": "Antibiotics, cough medicine, fever reducers, hospitalization if severe.",
        "self_care": "Get plenty of rest, drink fluids, take all prescribed medications."
    },
    "psoriasis": {
        "description": "A chronic skin condition that causes scaling and inflammation.",
        "treatment": "Topical treatments, light therapy, systemic medications.",
        "self_care": "Moisturize skin, avoid triggers, manage stress, don't scratch."
    },
    "tuberculosis": {
        "description": "A potentially serious infectious disease that mainly affects the lungs.",
        "treatment": "Long-term antibiotic treatment (6-9 months) with multiple drugs.",
        "self_care": "Complete full course of medication, maintain good nutrition, rest."
    },
    "typhoid": {
        "description": "A bacterial infection caused by Salmonella typhi, spread through contaminated food/water.",
        "treatment": "Antibiotics, hydration, hospitalization in severe cases.",
        "self_care": "Practice good hygiene, drink clean water, complete antibiotic course."
    },
    "urinary tract infection": {
        "description": "Infection in any part of the urinary system, most commonly the bladder.",
        "treatment": "Antibiotics, pain relievers, increased fluid intake.",
        "self_care": "Drink plenty of water, urinate frequently, wipe front to back."
    },
    "varicose veins": {
        "description": "Enlarged, twisted veins, usually occurring in the legs.",
        "treatment": "Compression stockings, laser treatments, or surgery in severe cases.",
        "self_care": "Exercise, elevate legs, avoid long periods of standing/sitting."
    },
    "hepatitis a": {
        "description": "A highly contagious liver infection caused by the hepatitis A virus.",
        "treatment": "No specific treatment - the body clears the virus on its own.",
        "self_care": "Rest, adequate nutrition, fluids, and avoid alcohol."
    }
}

class SymptomPredictor:
    def __init__(self, data_path, artifact_path, force_retrain=False):
        """Initialize model from artifact (fast) or fallback to training."""
        self.data_path = data_path
        self.artifact_path = artifact_path
        self.model = None
        self.all_symptoms = []
        self.symptom_index = {}
        self.symptom_set = set()

        if not force_retrain and self._load_artifact():
            return

        self._train_from_csv()
        self._save_artifact()

    def _train_from_csv(self):
        if not os.path.exists(self.data_path):
            raise FileNotFoundError(f"Training data not found at: {self.data_path}")

        df = pd.read_csv(self.data_path)
        df = df.loc[:, ~df.columns.str.contains('^Unnamed')]
        self.all_symptoms = [col for col in df.columns if col != 'prognosis']
        X = df[self.all_symptoms]
        y = df['prognosis']

        self.model = MultinomialNB()
        self.model.fit(X, y)

        self.symptom_index = {symptom: idx for idx, symptom in enumerate(self.all_symptoms)}
        self.symptom_set = set(self.all_symptoms)
        print(f"Model trained from CSV with {len(self.all_symptoms)} symptoms")

    def _load_artifact(self):
        """Load serialized model artifact if valid and up to date."""
        if not os.path.exists(self.artifact_path):
            return False

        try:
            with open(self.artifact_path, 'rb') as f:
                payload = pickle.load(f)

            model = payload.get('model')
            symptoms = payload.get('all_symptoms')
            source_mtime = payload.get('source_mtime')

            if model is None or not symptoms:
                return False

            current_mtime = int(os.path.getmtime(self.data_path)) if os.path.exists(self.data_path) else None
            if current_mtime and source_mtime and current_mtime > source_mtime:
                print("Model artifact is stale. Re-training from CSV...")
                return False

            self.model = model
            self.all_symptoms = list(symptoms)
            self.symptom_index = {symptom: idx for idx, symptom in enumerate(self.all_symptoms)}
            self.symptom_set = set(self.all_symptoms)
            print(f"Model loaded from artifact with {len(self.all_symptoms)} symptoms")
            return True
        except Exception as e:
            print(f"Artifact load failed, falling back to training: {str(e)}")
            return False

    def _save_artifact(self):
        """Persist trained model to disk for fast startup."""
        try:
            artifact_dir = os.path.dirname(self.artifact_path)
            if artifact_dir:
                os.makedirs(artifact_dir, exist_ok=True)

            payload = {
                'model': self.model,
                'all_symptoms': self.all_symptoms,
                'source_path': os.path.abspath(self.data_path),
                'source_mtime': int(os.path.getmtime(self.data_path)) if os.path.exists(self.data_path) else None,
                'created_at': int(time.time())
            }

            with open(self.artifact_path, 'wb') as f:
                pickle.dump(payload, f, protocol=pickle.HIGHEST_PROTOCOL)
            print(f"Model artifact saved to {self.artifact_path}")
        except Exception as e:
            print(f"Warning: failed to save artifact: {str(e)}")

    def predict(self, symptoms):
        """Predict disease from symptoms with additional info"""
        try:
            symptom_vector = np.zeros(len(self.all_symptoms))
            valid_symptoms = []
            
            for symptom in symptoms:
                idx = self.symptom_index.get(symptom)
                if idx is not None:
                    symptom_vector[idx] = 1
                    valid_symptoms.append(symptom)
            
            if not valid_symptoms:
                return {'error': 'No valid symptoms provided'}
            
            input_df = pd.DataFrame([symptom_vector], columns=self.all_symptoms)
            probas = self.model.predict_proba(input_df)[0]
            max_idx = np.argmax(probas)
            disease = self.model.classes_[max_idx]
            
            
            disease_key = disease.lower().strip()
            disease_key = disease_key.split('(')[0].strip()  
            
            info = disease_info.get(disease_key, {})
            
            return {
                'disease': disease,
                'confidence': float(probas[max_idx]),
                'symptoms_used': valid_symptoms,
                'description': info.get('description', 'No description available'),
                'treatment': info.get('treatment', 'Consult a healthcare professional'),
                'self_care': info.get('self_care', 'Rest and monitor symptoms')
            }
            
        except Exception as e:
            return {'error': str(e)}

def get_data_path():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base_dir, 'data', 'Training.csv')

def get_model_artifact_path():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base_dir, 'model_artifacts', 'symptom_model.pkl')

predictor = SymptomPredictor(get_data_path(), get_model_artifact_path())
symptom_alias_map = load_symptom_alias_map()

@app.route('/api/symptoms', methods=['GET'])
def list_symptoms():
    return jsonify({
        'symptoms': predictor.all_symptoms,
        'count': len(predictor.all_symptoms)
    })

@app.route('/api/predict', methods=['POST'])
def predict_disease():
    try:
        # Rate limiting check
        client_ip = request.remote_addr or 'unknown'
        if not check_rate_limit(client_ip):
            log_audit('rate_limit_exceeded', {'ip': client_ip})
            return jsonify({'error': 'Rate limit exceeded. Please try again later.'}), 429
        
        log_audit('prediction_request', {'ip': client_ip})
        
        data = request.get_json(silent=True)
        if not data or 'symptoms' not in data:
            return jsonify({'error': 'Missing symptoms data'}), 400
        
        # Get patient_id for history (optional)
        patient_id = str(data.get('patient_id', 'anonymous'))[:128]
        language = str(data.get('language', 'en-US'))[:16]
        language_label = str(data.get('language_label', 'English'))[:32]
        
        # Process symptoms input - use NLP extraction if it's natural language
        symptoms_input = data['symptoms']
        
        if isinstance(symptoms_input, str) and len(symptoms_input.split()) > 3:
            # Natural language input - use NLP extraction
            extracted_symptoms = extract_symptoms_from_text(symptoms_input)
            if extracted_symptoms:
                symptoms = extracted_symptoms
            else:
                # Fallback to comma-separated parsing
                symptoms = [canonicalize_symptom(s) for s in symptoms_input.split(',')]
        else:
            # Already structured input
            if isinstance(symptoms_input, str):
                symptoms = [canonicalize_symptom(s) for s in symptoms_input.split(',')]
            else:
                symptoms = [canonicalize_symptom(s) for s in symptoms_input]
        
        # Build binary input vector in model feature order
        symptom_vector = np.zeros(len(predictor.all_symptoms))
        
        valid_symptoms = []
        for symptom in symptoms:
            idx = predictor.symptom_index.get(symptom)
            if idx is not None:
                symptom_vector[idx] = 1
                valid_symptoms.append(symptom)
        
        if not valid_symptoms:
            return jsonify({'error': 'No valid symptoms provided', 'available_symptoms': predictor.all_symptoms[:20]}), 400
        
        # Get prediction
        input_df = pd.DataFrame([symptom_vector], columns=predictor.all_symptoms)
        probas = predictor.model.predict_proba(input_df)[0]
        max_idx = np.argmax(probas)
        disease = predictor.model.classes_[max_idx]
        
        disease_key = disease.lower().strip()
        disease_key = disease_key.split('(')[0].strip() 
        info = disease_info.get(disease_key, {})
        
        # Get alternative diagnoses
        top_indices = np.argsort(-probas)[:3]
        alternative_diagnoses = []
        for idx in top_indices[1:]:
            alternative_diagnoses.append({
                'disease': predictor.model.classes_[idx],
                'confidence': float(probas[idx])
            })
        
        # XAI - Feature Importance
        feature_importance = get_feature_importance(valid_symptoms, disease)
        
        # XAI - Confidence Explanation
        confidence = float(probas[max_idx])
        confidence_explanation = get_confidence_explanation(confidence)
        
        # Doctor & Specialist - Urgent Case Detection
        is_urgent, urgent_warning = detect_urgent_case(disease, valid_symptoms)
        
        # Doctor & Specialist - Specialist Recommendation
        specialist_info = get_specialist_recommendation(disease)
        
        # Smart Follow-up Questions
        followup_questions = generate_followup_questions(valid_symptoms, disease)

        # Clinical triage + personalized care plan
        triage = assess_triage(valid_symptoms, disease, confidence, is_urgent)
        care_plan = build_care_plan(patient_id, disease, valid_symptoms, confidence, triage)
        
        # Save to patient history (if patient_id provided)
        prediction_record = {
            'timestamp': time.time(),
            'disease': disease,
            'confidence': confidence,
            'symptoms': valid_symptoms,
            'is_urgent': is_urgent,
            'language': language,
            'language_label': language_label
        }
        save_patient_history(patient_id, prediction_record)
        
        log_audit('prediction_made', {'disease': disease, 'confidence': confidence})
        
        print(f"Predicted disease: {disease} | Lookup key: {disease_key}") 
        
        response_payload = {
            'disease': disease,
            'confidence': confidence,
            'confidence_explanation': confidence_explanation,
            'symptoms_used': valid_symptoms,
            'alternative_diagnoses': alternative_diagnoses,
            'description': info.get('description', 'No description available'),
            'treatment': info.get('treatment', 'Consult a healthcare professional'),
            'self_care': info.get('self_care', 'Rest and monitor symptoms'),
            'feature_importance': feature_importance,
            'is_urgent': is_urgent,
            'urgent_warning': urgent_warning,
            'triage': triage,
            'care_plan': care_plan,
            'specialist': specialist_info,
            'followup_questions': followup_questions,
            'language': language,
            'language_label': language_label,
            'timestamp': int(time.time())
        }

        response_payload = translate_prediction_payload(response_payload, language)
        return jsonify(response_payload)
    
    except Exception as e:
        log_audit('prediction_error', {'error': str(e)})
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# API for patient history
@app.route('/api/history/<patient_id>', methods=['GET'])
def get_history(patient_id):
    """Get patient prediction history"""
    history = get_patient_history(patient_id)
    history = sorted(history, key=lambda x: x.get('timestamp', 0), reverse=True)
    return jsonify({'history': history, 'count': len(history)})

# API for NLP extraction only
@app.route('/api/extract-symptoms', methods=['POST'])
def extract_symptoms():
    """Extract symptoms from natural language text"""
    data = request.get_json(silent=True)
    if not data or 'text' not in data:
        return jsonify({'error': 'Missing text data'}), 400
    
    symptoms = extract_symptoms_from_text(data['text'])
    return jsonify({'extracted_symptoms': symptoms})


@app.route('/api/medications', methods=['POST'])
def log_medication():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Missing medication payload'}), 400

    patient_id = str(data.get('patient_id', 'anonymous'))[:128]
    medicine_name = str(data.get('medicine_name', '')).strip()
    dosage = str(data.get('dosage', '')).strip()
    schedule = str(data.get('schedule', '')).strip()
    notes = str(data.get('notes', '')).strip()
    language = str(data.get('language', 'en-US'))[:16]
    language_label = str(data.get('language_label', 'English'))[:32]

    if not medicine_name or not dosage or not schedule:
        return jsonify({'error': 'medicine_name, dosage, and schedule are required'}), 400

    record = {
        'timestamp': time.time(),
        'medicine_name': medicine_name,
        'dosage': dosage,
        'schedule': schedule,
        'notes': notes,
        'language': language,
        'language_label': language_label
    }
    save_medication_log(patient_id, record)
    return jsonify({'message': 'Medication logged successfully', 'record': record})


@app.route('/api/medications/<patient_id>', methods=['GET'])
def medication_history(patient_id):
    logs = sorted(get_medication_logs(patient_id), key=lambda x: x.get('timestamp', 0), reverse=True)
    return jsonify({'medications': logs, 'count': len(logs)})


@app.route('/api/sleep', methods=['POST'])
def log_sleep():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Missing sleep payload'}), 400

    patient_id = str(data.get('patient_id', 'anonymous'))[:128]
    try:
        hours = float(data.get('hours', 0))
        quality = int(data.get('quality', 0))
    except (TypeError, ValueError):
        return jsonify({'error': 'hours must be number and quality must be integer'}), 400

    if hours <= 0 or hours > 24:
        return jsonify({'error': 'hours should be between 0 and 24'}), 400
    if quality < 1 or quality > 5:
        return jsonify({'error': 'quality should be between 1 and 5'}), 400

    record = {
        'timestamp': time.time(),
        'hours': round(hours, 2),
        'quality': quality,
        'notes': str(data.get('notes', '')).strip(),
        'language': str(data.get('language', 'en-US'))[:16],
        'language_label': str(data.get('language_label', 'English'))[:32]
    }
    save_sleep_log(patient_id, record)
    return jsonify({'message': 'Sleep entry saved successfully', 'record': record})


@app.route('/api/sleep/<patient_id>', methods=['GET'])
def sleep_history(patient_id):
    logs = sorted(get_sleep_logs(patient_id), key=lambda x: x.get('timestamp', 0), reverse=True)
    return jsonify({'sleep_logs': logs, 'count': len(logs)})


@app.route('/api/trends/<patient_id>', methods=['GET'])
def trends(patient_id):
    return jsonify(build_trends_summary(patient_id))


@app.route('/api/nearby-doctors', methods=['POST'])
def nearby_doctors():
    """Find nearby doctors/specialists using Google Places API."""
    data = request.get_json(silent=True) or {}

    try:
        latitude = float(data.get('latitude'))
        longitude = float(data.get('longitude'))
    except (TypeError, ValueError):
        return jsonify({'error': 'latitude and longitude are required numeric values'}), 400

    specialist = str(data.get('specialist', 'doctor')).strip() or 'doctor'
    radius = int(data.get('radius', 5000))
    radius = max(1000, min(radius, 50000))
    language = str(data.get('language', 'en-US'))[:16]
    language_code = language.split('-')[0].lower()
    if not re.fullmatch(r'[a-z]{2,3}', language_code):
        language_code = 'en'

    api_key = os.environ.get('GOOGLE_MAPS_API_KEY', '').strip()
    if not api_key:
        return jsonify({'error': 'GOOGLE_MAPS_API_KEY is not configured on server'}), 500

    place_url = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json'
    params = {
        'location': f'{latitude},{longitude}',
        'radius': radius,
        'keyword': specialist,
        'type': 'doctor',
        'language': language_code,
        'key': api_key
    }

    try:
        resp = requests.get(place_url, params=params, timeout=12)
        payload = resp.json()
    except Exception as e:
        return jsonify({'error': f'Failed to contact Google Places API: {str(e)}'}), 502

    status = payload.get('status', '')
    if status not in {'OK', 'ZERO_RESULTS'}:
        message = payload.get('error_message') or f'Google Places error: {status}'
        return jsonify({'error': message}), 502

    results = []
    for item in payload.get('results', [])[:10]:
        loc = item.get('geometry', {}).get('location', {})
        place_id = item.get('place_id', '')
        results.append({
            'name': item.get('name', 'Unknown'),
            'address': item.get('vicinity') or item.get('formatted_address', ''),
            'rating': item.get('rating'),
            'user_ratings_total': item.get('user_ratings_total', 0),
            'open_now': item.get('opening_hours', {}).get('open_now'),
            'latitude': loc.get('lat'),
            'longitude': loc.get('lng'),
            'place_id': place_id,
            'maps_url': f'https://www.google.com/maps/place/?q=place_id:{place_id}' if place_id else ''
        })

    return jsonify({
        'count': len(results),
        'specialist': specialist,
        'language': language,
        'results': results
    })


@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok',
        'symptom_count': len(predictor.all_symptoms),
        'timestamp': int(time.time())
    })

@app.route('/')
def serve_index():
    return send_from_directory(app.template_folder, 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory(app.static_folder, filename)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
