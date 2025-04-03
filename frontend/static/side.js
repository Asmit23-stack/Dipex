// Symptom database (sorted alphabetically)
const ALL_SYMPTOMS = [
    'abdominal_pain', 'acidity', 'anxiety', 'back_pain', 'blurred_and_distorted_vision',
    'breathlessness', 'burning_micturition', 'chest_pain', 'chills', 'cold_hands_and_feets',
    'congestion', 'constipation', 'cough', 'dark_urine', 'dehydration', 'diarrhoea',
    'fatigue', 'fast_heart_rate', 'fluid_overload', 'headache', 'high_fever', 'indigestion',
    'irregular_sugar_level', 'itching', 'joint_pain', 'lethargy', 'loss_of_appetite',
    'malaise', 'mild_fever', 'mood_swings', 'muscle_wasting', 'nausea', 'nodal_skin_eruptions',
    'pain_behind_the_eyes', 'pain_during_bowel_movements', 'pain_in_anal_region', 'patches_in_throat',
    'phlegm', 'redness_of_eyes', 'restlessness', 'runny_nose', 'shivering', 'sinus_pressure',
    'skin_rash', 'spotting_urination', 'stomach_pain', 'sunken_eyes', 'sweating', 'swelled_lymph_nodes',
    'swelling_of_stomach', 'throat_irritation', 'ulcers_on_tongue', 'vomiting', 'weakness_in_limbs',
    'weight_gain', 'weight_loss', 'yellow_urine', 'yellowing_of_eyes', 'yellowish_skin'
];

// Initialize symptom sidebar
function initSymptomSidebar() {
    const sidebar = document.createElement('div');
    sidebar.className = 'symptom-sidebar';
    sidebar.innerHTML = `
        <div class="sidebar-header">
            <h3>Symptom Suggestions</h3>
            <input type="text" id="symptom-search" placeholder="Search symptoms...">
        </div>
        <div class="symptom-list"></div>
    `;
    document.body.appendChild(sidebar);
    
    // Add toggle button
    const toggleBtn = document.createElement('div');
    toggleBtn.className = 'toggle-sidebar';
    toggleBtn.innerHTML = '<i class="fas fa-clipboard-list"></i>';
    document.body.appendChild(toggleBtn);
    
    // Toggle sidebar
    toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('active');
    });
    
    // Populate symptoms
    const symptomList = document.querySelector('.symptom-list');
    ALL_SYMPTOMS.forEach(symptom => {
        const item = document.createElement('div');
        item.className = 'symptom-item';
        item.textContent = symptom.replace(/_/g, ' ');
        item.addEventListener('click', () => {
            const currentInput = userInput.value.trim();
            userInput.value = currentInput ? 
                `${currentInput}, ${symptom.replace(/_/g, ' ')}` : 
                `I have ${symptom.replace(/_/g, ' ')}`;
                // ` ${symptom.replace(/_/g, ' ')}`;
            userInput.focus();
            userInput.dispatchEvent(new Event('input'));
        });
        symptomList.appendChild(item);
    });
    
    // Add search functionality
    const searchInput = document.getElementById('symptom-search');
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const items = document.querySelectorAll('.symptom-item');
        
        items.forEach(item => {
            const text = item.textContent.toLowerCase();
            item.style.display = text.includes(searchTerm) ? 'block' : 'none';
        });
    });
}

// Call this at the end of your DOMContentLoaded event
window.addEventListener('DOMContentLoaded', () => {
    // ... your existing welcome message code ...
    
    // Initialize sidebar
    initSymptomSidebar();
});