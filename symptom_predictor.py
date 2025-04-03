import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import accuracy_score

class SymptomPredictor:
    def __init__(self, dataset_path):
        self.model = None
        self.all_symptoms = []
        self.diseases = []
        self.load_and_train(dataset_path)
    
    def load_and_train(self, dataset_path):
        """Load dataset and train the model"""
        try:
            train_df = pd.read_csv(dataset_path).iloc[:, :-1]
            self.all_symptoms = train_df.columns[:-1].tolist()
            self.diseases = train_df['prognosis'].unique().tolist()
            
            X = train_df.iloc[:, :-1]
            y = train_df["prognosis"]
            
            # Train with calibration for probability estimates
            base_model = RandomForestClassifier(n_estimators=150, 
                                             random_state=42,
                                             class_weight='balanced')
            self.model = CalibratedClassifierCV(base_model, cv=5)
            self.model.fit(X, y)
            
            # Verify model quality
            y_pred = self.model.predict(X)
            accuracy = accuracy_score(y, y_pred)
            print(f"Model trained successfully. Training accuracy: {accuracy:.2f}")
            
        except Exception as e:
            raise RuntimeError(f"Error during model training: {str(e)}")
    
    def validate_symptoms(self, user_symptoms):
        """Validate and normalize symptoms"""
        valid_symptoms = []
        invalid_symptoms = []
        
        for symptom in user_symptoms:
            # Case-insensitive matching and strip whitespace
            cleaned = symptom.strip().lower()
            matched = False
            
            # Check for exact match first
            for official_symptom in self.all_symptoms:
                if cleaned == official_symptom.lower():
                    valid_symptoms.append(official_symptom)
                    matched = True
                    break
            
            # If no exact match, check for partial matches
            if not matched:
                for official_symptom in self.all_symptoms:
                    if cleaned in official_symptom.lower():
                        valid_symptoms.append(official_symptom)
                        matched = True
                        break
            
            if not matched:
                invalid_symptoms.append(symptom)
        
        return valid_symptoms, invalid_symptoms
    
    def predict_disease(self, user_symptoms):
        """
        Predict disease with confidence scores and alternatives
        
        Returns:
        dict: {
            'primary_diagnosis': str,
            'confidence': float,
            'matched_symptoms': list,
            'invalid_symptoms': list,
            'alternative_diagnoses': list,
            'analysis': str
        }
        """
        if not isinstance(user_symptoms, list):
            user_symptoms = [str(user_symptoms)]
        
        # Validate and normalize symptoms
        valid_symptoms, invalid_symptoms = self.validate_symptoms(user_symptoms)
        
        if len(valid_symptoms) < 3:
            return {
                'error': f"Need at least 3 valid symptoms (found {len(valid_symptoms)})",
                'valid_symptoms': valid_symptoms,
                'invalid_symptoms': invalid_symptoms,
                'available_symptoms': self.all_symptoms[:50]  # First 50 for reference
            }
        
        # Prepare input data
        input_data = np.zeros(len(self.all_symptoms))
        symptom_indices = [self.all_symptoms.index(s) for s in valid_symptoms]
        input_data[symptom_indices] = 1
        input_data = input_data.reshape(1, -1)
        
        # Get predictions with probabilities
        disease_prob = self.model.predict_proba(input_data)[0]
        top_indices = np.argsort(-disease_prob)[:3]  # Top 3 predictions
        
        # Prepare results
        primary_disease = self.model.classes_[top_indices[0]]
        confidence = disease_prob[top_indices[0]]
        
        alternative_diagnoses = []
        for idx in top_indices[1:]:
            alternative_diagnoses.append({
                'disease': self.model.classes_[idx],
                'probability': float(disease_prob[idx])
            })
        
        return {
            'primary_diagnosis': primary_disease,
            'confidence': float(confidence),
            'matched_symptoms': valid_symptoms,
            'invalid_symptoms': invalid_symptoms,
            'alternative_diagnoses': alternative_diagnoses,
            'analysis': f"Matched {len(valid_symptoms)} symptoms",
            'available_symptoms': self.all_symptoms
        }

# Example usage
if __name__ == "__main__":
    try:
        predictor = SymptomPredictor(r"C:\Users\Asmit\OneDrive\Documents\DipexN\data\Training.csv")
        
        print("\nEnter symptoms separated by commas (at least 3):")
        user_input = input().split(",")
        user_symptoms = [s.strip() for s in user_input if s.strip()]
        
        result = predictor.predict_disease(user_symptoms)
        
        if 'error' in result:
            print(f"\nError: {result['error']}")
            if result['invalid_symptoms']:
                print(f"Invalid symptoms: {', '.join(result['invalid_symptoms'])}")
            print(f"\nExample valid symptoms: {', '.join(result['available_symptoms'][:10])}...")
        else:
            print(f"\nPrimary Diagnosis: {result['primary_diagnosis']} (confidence: {result['confidence']*100:.1f}%)")
            print(f"Matched Symptoms: {', '.join(result['matched_symptoms'])}")
            
            if result['alternative_diagnoses']:
                print("\nAlternative Diagnoses:")
                for alt in result['alternative_diagnoses']:
                    print(f"- {alt['disease']} ({alt['probability']*100:.1f}%)")
            
            print(f"\nAnalysis: {result['analysis']}")
            
    except Exception as e:
        print(f"Error: {str(e)}")