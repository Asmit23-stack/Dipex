import os
import pandas as pd
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from sklearn.naive_bayes import MultinomialNB
import numpy as np

app = Flask(__name__, 
            static_folder=os.path.join('frontend', 'static'),
            template_folder=os.path.join('frontend', 'templates'))
CORS(app, resources={r"/api/*": {"origins": "*"}, r"/*": {"origins": "*"}})

class SymptomPredictor:
    def __init__(self, data_path):
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
            
            print(f"✅ Predictor initialized with {len(self.all_symptoms)} symptoms")
            
        except Exception as e:
            print(f"❌ Predictor initialization failed: {str(e)}")
            raise

    def predict(self, symptoms):
        try:
            symptom_vector = np.zeros(len(self.all_symptoms))
            valid_symptoms = []
            
            for symptom in symptoms:
                if symptom in self.all_symptoms:
                    idx = self.all_symptoms.index(symptom)
                    symptom_vector[idx] = 1
                    valid_symptoms.append(symptom)
            
            if not valid_symptoms:
                return {'error': 'No valid symptoms recognized'}
            
            probas = self.model.predict_proba([symptom_vector])[0]
            max_idx = np.argmax(probas)
            disease = self.model.classes_[max_idx]
            confidence = float(probas[max_idx])
            
            return {
                'disease': disease,
                'confidence': confidence,
                'symptoms_used': valid_symptoms
            }
            
        except Exception as e:
            return {'error': str(e)}

# Initialize predictor
data_path = os.path.join('data', 'Training.csv')
predictor = SymptomPredictor(data_path)

# API Endpoints
@app.route('/api/symptoms', methods=['GET'])
def list_symptoms():
    return jsonify({
        'symptoms': predictor.all_symptoms,
        'count': len(predictor.all_symptoms)
    })

@app.route('/api/predict', methods=['POST'])
def predict():
    try:
        data = request.get_json()
        if not data or 'symptoms' not in data:
            return jsonify({'error': 'Missing symptoms data'}), 400
        
        symptoms = data['symptoms']
        if isinstance(symptoms, str):
            symptoms = [s.strip().lower().replace(' ', '_') for s in symptoms.split(',')]
        
        result = predictor.predict(symptoms)
        return jsonify(result)
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Legacy endpoints for frontend compatibility
@app.route('/symptoms', methods=['GET'])
def legacy_symptoms():
    return jsonify(predictor.all_symptoms)

@app.route('/predict', methods=['POST'])
def legacy_predict():
    return predict()

# Frontend serving
@app.route('/')
def serve_frontend():
    return send_from_directory(app.template_folder, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(app.static_folder, path)

if __name__ == '__main__':
    app.run(debug=True, port=5000)