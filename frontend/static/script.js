// DOM Elements
const userInput = document.getElementById('user-input');
const sendBtn = document.querySelector('.send-button');
const messagesDiv = document.querySelector('.messages');
const healthStatus = document.querySelector('.health-status span');

// Available symptoms and initial health state
let availableSymptoms = [];
let currentHealthStatus = 'good';

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    // Show welcome message
    showWelcomeMessage();
    
    try {
        // Load symptoms list
        const response = await fetch('/api/symptoms');
        const data = await response.json();
        availableSymptoms = data.symptoms.sort(); // Sort alphabetically
        console.log("Loaded symptoms:", availableSymptoms.slice(0, 5), "...");
        
        // Initialize symptom sidebar (sorted)
        initSymptomSidebar();
        
        // Setup event listeners
        sendBtn.addEventListener('click', handleUserInput);
        userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleUserInput();
        });
        
    } catch (error) {
        console.error("Initialization error:", error);
    }
});


// Add this to your script.js
function initThemeToggle() {
    const themeToggle = document.querySelector('.theme-toggle');
    const html = document.documentElement;
    
    // Check for saved theme preference
    const savedTheme = localStorage.getItem('theme') || 'dark';
    html.setAttribute('data-theme', savedTheme);
    
    themeToggle.addEventListener('click', () => {
      const currentTheme = html.getAttribute('data-theme');
      const newTheme = currentTheme === 'light' ? 'dark' : 'light';
      html.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
      
      // Update icon
      const icon = themeToggle.querySelector('i');
      icon.className = newTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    });
    
    // Set initial icon
    const icon = themeToggle.querySelector('i');
    icon.className = savedTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
  }
  
  // Call this in your DOMContentLoaded event
  document.addEventListener('DOMContentLoaded', () => {
    initThemeToggle();
    // ... your other initialization code
  });


// Show welcome message with quick actions
function showWelcomeMessage() {
    const welcomeMsg = `
        <div class="message ai-message ai-msg">
            <div class="content">
                <p>Hello! I'm <b class="custom-gradient-heading">SympTrack AI</b></p>
                <p>Your AI-powered assistant for smarter health tracking.</p>
                <div class="quick-actions">
                    <div class="quick-action" data-symptom="headache">
                        <i class="fas fa-head-side-cough"></i> Report a new symptom
                    </div>
                    <div class="quick-action" data-symptom="chart">
                        <i class="fas fa-chart-line"></i> View my health trends
                    </div>
                    <div class="quick-action" data-symptom="medication">
                        <i class="fas fa-pills"></i> Log medication
                    </div>
                    <div class="quick-action" data-symptom="sleep">
                        <i class="fas fa-moon"></i> Monitor sleep patterns
                    </div>
                </div>
            </div>
        </div>
    `;
    messagesDiv.innerHTML = welcomeMsg;
    
    // Add click handlers for quick actions
    document.querySelectorAll('.quick-action').forEach(action => {
        action.addEventListener('click', function() {
            const symptom = this.getAttribute('data-symptom');
            handleQuickAction(symptom);
        });
    });
}

// Handle quick actions
function handleQuickAction(action) {
    switch(action) {
        case 'headache':
            addMessage("Please describe your symptoms in detail.", 'ai-message');
            break;
        case 'chart':
            addMessage("Here are your health trends...", 'ai-message');
            // Add chart visualization logic here
            break;
        case 'medication':
            addMessage("What medication would you like to log?", 'ai-message');
            break;
        case 'sleep':
            addMessage("Let's analyze your sleep patterns...", 'ai-message');
            break;
    }
}

// Handle user input
async function handleUserInput() {
    const text = userInput.value.trim();
    if (!text) return;
    
    addMessage(text, 'user-message');
    userInput.value = '';
    
    showTypingIndicator();
    updateHealthStatus('analyzing'); // Show analyzing status
    
    try {
        const response = await fetch('/api/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symptoms: text })
        });
        
        const result = await response.json();
        displayPrediction(result);
        
        // Update health status based on prediction
        if (result.disease) {
            const severity = result.confidence > 0.7 ? 'serious' : 
                           result.confidence > 0.4 ? 'mild' : 'good';
            updateHealthStatus(severity);
        }
        
    } catch (error) {
        console.error("Prediction error:", error);
        addMessage("Sorry, something went wrong. Please try again.", 'ai-message');
        updateHealthStatus('good');
    } finally {
        hideTypingIndicator();
    }
}

// Update the updateHealthStatus function to properly change the smile icon
function updateHealthStatus(status) {
    const statusMap = {
        'good': { text: 'Good Health', icon: 'smile', color: 'health-green' },
        'mild': { text: 'Mild Symptoms', icon: 'meh', color: 'health-yellow' },
        'serious': { text: 'Serious Condition', icon: 'frown', color: 'health-red' },
        'analyzing': { text: 'Analyzing...', icon: 'spinner fa-spin', color: 'health-blue' }
    };
    
    const statusInfo = statusMap[status] || statusMap['good'];
    const healthStatus = document.querySelector('.health-status');
    
    // Clear existing classes
    healthStatus.className = 'health-status';
    
    // Update with new status
    healthStatus.innerHTML = `
        <i class="fas fa-${statusInfo.icon}"></i>
        <span>${statusInfo.text}</span>
    `;
    healthStatus.classList.add(statusInfo.color);
}

// Display prediction results with severity indicator
function displayPrediction(result) {
    if (result.error) {
        addMessage(`Error: ${result.error}`, 'ai-message error');
        return;
    }
    
    const confidencePercent = Math.round(result.confidence * 100);
    const severity = confidencePercent > 70 ? 'high' : 
                   confidencePercent > 40 ? 'medium' : 'low';
    
    const severityClass = `severity-${severity}`;
    const severityIcon = severity === 'high' ? 'exclamation-triangle' : 
                       severity === 'medium' ? 'exclamation-circle' : 'info-circle';
    
    let html = `
        <div class="prediction-result">
            <h3>${result.disease || 'Unknown condition'}</h3>
            <div class="severity-indicator ${severityClass}">
                <i class="fas fa-${severityIcon}"></i>
                ${severity} severity - ${confidencePercent}% confidence
            </div>
    `;
    
    if (result.symptoms_used) {
        html += `<div class="symptoms-used">
                <p>Based on:</p>
                <div class="symptom-tags">
                    ${result.symptoms_used.map(s => `<span class="symptom-tag">${s.replace(/_/g, ' ')}</span>`).join('')}
                </div>
            </div>`;
    }
    
    html += `</div>`;
    addMessage(html, 'ai-message');
}

// Initialize symptom sidebar (alphabetically sorted)
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
    
    const toggleBtn = document.createElement('div');
    toggleBtn.className = 'toggle-sidebar';
    toggleBtn.innerHTML = '<i class="fas fa-clipboard-list"></i>';
    document.body.appendChild(toggleBtn);
    
    toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('active');
    });
    
    const symptomList = document.querySelector('.symptom-list');
    availableSymptoms.forEach(symptom => {
        const item = document.createElement('div');
        item.className = 'symptom-item';
        item.textContent = symptom.replace(/_/g, ' ');
        item.addEventListener('click', () => {
            const currentInput = userInput.value.trim();
            userInput.value = currentInput ? 
                `${currentInput}, ${symptom.replace(/_/g, ' ')}` : 
                `I have ${symptom.replace(/_/g, ' ')}`;
            userInput.focus();
        });
        symptomList.appendChild(item);
    });
    
    const searchInput = document.getElementById('symptom-search');
    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        document.querySelectorAll('.symptom-item').forEach(item => {
            item.style.display = item.textContent.toLowerCase().includes(term) ? 'block' : 'none';
        });
    });
}

// Helper functions
function addMessage(content, className) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${className}`;
    messageDiv.innerHTML = `<div class="content">${content}</div>`;
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function showTypingIndicator() {
    document.getElementById('typing-indicator').style.display = 'flex';
}

function hideTypingIndicator() {
    document.getElementById('typing-indicator').style.display = 'none';
}