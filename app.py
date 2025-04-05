import os
import pandas as pd
import numpy as np
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from sklearn.naive_bayes import MultinomialNB

app = Flask(__name__,
            static_folder=os.path.join('frontend', 'static'),
            template_folder=os.path.join('frontend', 'templates'))
CORS(app)


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
    def __init__(self, data_path):
        """Initialize the ML model with training data"""
        try:
            if not os.path.exists(data_path):
                raise FileNotFoundError(f"Training data not found at: {data_path}")
            
            self.df = pd.read_csv(data_path)
            self.df = self.df.loc[:, ~self.df.columns.str.contains('^Unnamed')]
            self.all_symptoms = [col for col in self.df.columns if col != 'prognosis']
            self.X = self.df[self.all_symptoms]
            self.y = self.df['prognosis']
            self.model = MultinomialNB()
            self.model.fit(self.X, self.y)
            
            print(f"✅ Model trained with {len(self.all_symptoms)} symptoms")
            
        except Exception as e:
            print(f"❌ Initialization failed: {str(e)}")
            raise

    def predict(self, symptoms):
        """Predict disease from symptoms with additional info"""
        try:
            symptom_vector = np.zeros(len(self.all_symptoms))
            valid_symptoms = []
            
            for symptom in symptoms:
                if symptom in self.all_symptoms:
                    idx = self.all_symptoms.index(symptom)
                    symptom_vector[idx] = 1
                    valid_symptoms.append(symptom)
            
            if not valid_symptoms:
                return {'error': 'No valid symptoms provided'}
            
            probas = self.model.predict_proba([symptom_vector])[0]
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

predictor = SymptomPredictor(get_data_path())

@app.route('/api/symptoms', methods=['GET'])
def list_symptoms():
    return jsonify({
        'symptoms': predictor.all_symptoms,
        'count': len(predictor.all_symptoms)
    })

@app.route('/api/predict', methods=['POST'])
def predict_disease():
    try:
        data = request.get_json()
        if not data or 'symptoms' not in data:
            return jsonify({'error': 'Missing symptoms data'}), 400
        
        # Process symptoms input
        symptoms = data['symptoms']
        if isinstance(symptoms, str):
            symptoms = [s.strip().lower().replace(' ', '_') for s in symptoms.split(',')]
        
        # Create proper feature vector with valid feature names
        symptom_df = pd.DataFrame(columns=predictor.all_symptoms)
        symptom_df.loc[0] = 0
        
        valid_symptoms = []
        for symptom in symptoms:
            if symptom in predictor.all_symptoms:
                symptom_df.loc[0, symptom] = 1
                valid_symptoms.append(symptom)
        
        if not valid_symptoms:
            return jsonify({'error': 'No valid symptoms provided'}), 400
        
        
        probas = predictor.model.predict_proba(symptom_df)[0]
        max_idx = np.argmax(probas)
        disease = predictor.model.classes_[max_idx]
        
        
        disease_key = disease.lower().strip()
        disease_key = disease_key.split('(')[0].strip() 
        info = disease_info.get(disease_key, {})
        
        print(f"Predicted disease: {disease} | Lookup key: {disease_key}") 
        
        return jsonify({
            'disease': disease,
            'confidence': float(probas[max_idx]),
            'symptoms_used': valid_symptoms,
            'description': info.get('description', 'No description available'),
            'treatment': info.get('treatment', 'Consult a healthcare professional'),
            'self_care': info.get('self_care', 'Rest and monitor symptoms')
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/')
def serve_index():
    return send_from_directory(app.template_folder, 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory(app.static_folder, filename)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
