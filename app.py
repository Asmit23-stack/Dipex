import os
import pandas as pd
import numpy as np
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from sklearn.naive_bayes import MultinomialNB

# Initialize Flask app with proper paths
app = Flask(__name__,
            static_folder=os.path.join('frontend', 'static'),
            template_folder=os.path.join('frontend', 'templates'))
CORS(app)

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
        """Predict disease from symptoms"""
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
            
            return {
                'disease': self.model.classes_[max_idx],
                'confidence': float(probas[max_idx]),
                'symptoms_used': valid_symptoms
            }
            
        except Exception as e:
            return {'error': str(e)}

# Initialize predictor with Railway-compatible paths
def get_data_path():
    """Handle path resolution for both local and Railway environments"""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base_dir, 'data', 'Training.csv')

predictor = SymptomPredictor(get_data_path())

# API Endpoints
@app.route('/api/symptoms', methods=['GET'])
def list_symptoms():
    """Get list of all recognized symptoms"""
    return jsonify({
        'symptoms': predictor.all_symptoms,
        'count': len(predictor.all_symptoms)
    })

@app.route('/api/predict', methods=['POST'])
def predict_disease():
    """Make prediction from symptoms"""
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

# Frontend Routes
@app.route('/')
def serve_index():
    """Serve main frontend page"""
    return send_from_directory(app.template_folder, 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    """Serve static files"""
    return send_from_directory(app.static_folder, filename)

# Compatibility endpoints
@app.route('/symptoms', methods=['GET'])
def legacy_symptoms():
    return list_symptoms()

@app.route('/predict', methods=['POST'])
def legacy_predict():
    return predict_disease()

# Railway-optimized startup
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
