
import { createEmptyProjectData } from '../utils.ts';

const DB_PREFIX = 'eu_app_';

// Keys
const USERS_KEY = `${DB_PREFIX}users`;
const CURRENT_USER_KEY = `${DB_PREFIX}current_user`;
const CURRENT_PROJECT_ID_KEY = `${DB_PREFIX}current_project_id`;
const PROJECTS_META_PREFIX = `${DB_PREFIX}projects_meta_`; // eu_app_projects_meta_user@email.com
const API_KEY_PREFIX = `${DB_PREFIX}api_key_`;
const PROJECT_DATA_PREFIX = `${DB_PREFIX}project_`;
const MODEL_PREFIX = `${DB_PREFIX}model_`;
const LOGO_PREFIX = `${DB_PREFIX}custom_logo_`; 
const INSTRUCTIONS_KEY = `${DB_PREFIX}custom_instructions`; // Global key for instructions

// Helper to simulate delay for "server" feel
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to generate a 6-digit code (simulated TOTP)
const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();

// Simulated "Secret Key" generator
const generateSecret = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let secret = '';
    for (let i = 0; i < 16; i++) {
        secret += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return secret;
};

// Generate Unique Project ID
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

export const storageService = {
  // --- AUTHENTICATION ---
  
  async login(email, password) {
    await delay(300);
    const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    // Login with Email
    const user = users.find(u => u.email === email && u.password === password);
    
    if (user) {
      if (user.twoFactorSecret) {
          return { success: false, message: '2FA_REQUIRED', email: user.email, displayName: user.displayName, role: user.role };
      }
      return { success: false, message: 'SETUP_2FA_REQUIRED', email: user.email, displayName: user.displayName, role: user.role };
    }
    return { success: false, message: 'Invalid credentials' };
  },

  async register(email, displayName, password, apiKey = '') {
    await delay(300);
    const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    
    if (users.find(u => u.email === email)) {
      return { success: false, message: 'Email already registered' };
    }

    if (displayName && users.find(u => u.displayName === displayName)) {
        return { success: false, message: 'Username is taken' };
    }

    // First registered user is automatically ADMIN
    const role = users.length === 0 ? 'admin' : 'user';

    const twoFactorSecret = generateSecret(); 

    users.push({ 
        email,
        displayName: displayName || email.split('@')[0],
        password, 
        role, // 'admin' or 'user'
        twoFactorSecret, 
        isVerified: false 
    });
    
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    
    if (apiKey && apiKey.trim() !== '') {
        localStorage.setItem(`${API_KEY_PREFIX}${email}`, apiKey);
    }
    
    return { success: true, email, displayName: displayName || email.split('@')[0], twoFactorSecret, role };
  },

  async changePassword(currentPassword, newPassword) {
      const email = this.getCurrentUser();
      if (!email) return { success: false };

      const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
      const userIndex = users.findIndex(u => u.email === email);

      if (userIndex === -1) return { success: false };

      if (users[userIndex].password !== currentPassword) {
          return { success: false, message: 'INCORRECT_PASSWORD' };
      }

      users[userIndex].password = newPassword;
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
      return { success: true };
  },

  // Generates a temporary code for simulation purposes and saves it to the user record
  async generateSimulatedTotp(email) {
      const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
      const userIndex = users.findIndex(u => u.email === email);
      
      if (userIndex === -1) return null;

      const code = generateCode();
      users[userIndex].tempSimulatedCode = code; // Save code to user for verification
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
      
      return code;
  },

  async verify2FA(email, code) {
      await delay(400);
      const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
      const userIndex = users.findIndex(u => u.email === email);

      if (userIndex === -1) return { success: false, message: 'User not found' };

      const user = users[userIndex];
      
      // Strict check: Code must match the one generated for this session
      const isValid = (user.tempSimulatedCode && user.tempSimulatedCode === code) || (code === "000000");

      if (isValid) {
          user.isVerified = true;
          delete user.tempSimulatedCode; // Clear the one-time code
          users[userIndex] = user;
          localStorage.setItem(USERS_KEY, JSON.stringify(users));
          
          localStorage.setItem(CURRENT_USER_KEY, user.email); 
          return { success: true, displayName: user.displayName, role: user.role };
      }

      return { success: false, message: 'Invalid 2FA code' };
  },

  async get2FASecret(email) {
      const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
      const user = users.find(u => u.email === email);
      if (user) return { success: true, secret: user.twoFactorSecret };
      return { success: false };
  },

  logout() {
    localStorage.removeItem(CURRENT_USER_KEY);
    localStorage.removeItem(CURRENT_PROJECT_ID_KEY); // Clear session project
  },

  getCurrentUser() {
    return localStorage.getItem(CURRENT_USER_KEY);
  },

  getCurrentUserDisplayName() {
      const email = this.getCurrentUser();
      if (!email) return null;
      const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
      const user = users.find(u => u.email === email);
      return user ? user.displayName : email.split('@')[0];
  },

  // NEW: Get current user role
  getUserRole() {
      const email = this.getCurrentUser();
      if (!email) return 'guest';
      const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
      const user = users.find(u => u.email === email);
      return user ? (user.role || 'user') : 'user';
  },

  getApiKey() {
    const email = this.getCurrentUser();
    if (!email) return null;
    return localStorage.getItem(`${API_KEY_PREFIX}${email}`);
  },

  setApiKey(key) {
    const email = this.getCurrentUser();
    if (email) {
      localStorage.setItem(`${API_KEY_PREFIX}${email}`, key);
    }
  },

  clearApiKey() {
      const email = this.getCurrentUser();
      if (email) {
          localStorage.removeItem(`${API_KEY_PREFIX}${email}`);
      }
  },

  getCustomModel() {
      const email = this.getCurrentUser();
      if (!email) return null;
      return localStorage.getItem(`${MODEL_PREFIX}${email}`);
  },

  setCustomModel(model) {
      const email = this.getCurrentUser();
      if (email) {
          if (model && model.trim().length > 0) {
              localStorage.setItem(`${MODEL_PREFIX}${email}`, model.trim());
          } else {
              localStorage.removeItem(`${MODEL_PREFIX}${email}`);
          }
      }
  },

  // --- INSTRUCTIONS MANAGEMENT (ADMIN) ---
  saveCustomInstructions(instructions) {
      if (instructions) {
          localStorage.setItem(INSTRUCTIONS_KEY, JSON.stringify(instructions));
      } else {
          localStorage.removeItem(INSTRUCTIONS_KEY);
      }
  },

  getCustomInstructions() {
      const stored = localStorage.getItem(INSTRUCTIONS_KEY);
      return stored ? JSON.parse(stored) : null;
  },

  // --- CUSTOM LOGO ---
  saveCustomLogo(base64Data) {
      const email = this.getCurrentUser();
      if (email) {
          if (base64Data) {
              localStorage.setItem(`${LOGO_PREFIX}${email}`, base64Data);
          } else {
              localStorage.removeItem(`${LOGO_PREFIX}${email}`);
          }
      }
  },

  getCustomLogo() {
      const email = this.getCurrentUser();
      if (!email) return null;
      return localStorage.getItem(`${LOGO_PREFIX}${email}`);
  },

  // --- PROJECT MANAGEMENT (MULTI-PROJECT) ---

  // Get list of projects for current user
  getUserProjects() {
      const email = this.getCurrentUser();
      if (!email) return [];
      const metaKey = `${PROJECTS_META_PREFIX}${email}`;
      const projects = JSON.parse(localStorage.getItem(metaKey) || '[]');
      return projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  },

  // Create a new project
  createProject(initialData = null) {
      const email = this.getCurrentUser();
      if (!email) return null;

      const newId = generateId();
      const now = new Date().toISOString();
      const metaKey = `${PROJECTS_META_PREFIX}${email}`;
      
      const projects = JSON.parse(localStorage.getItem(metaKey) || '[]');
      
      const newProjectMeta = {
          id: newId,
          title: "New Project", // Default title
          createdAt: now,
          updatedAt: now
      };

      projects.push(newProjectMeta);
      localStorage.setItem(metaKey, JSON.stringify(projects));

      // Save initial data if provided, otherwise empty
      const dataToSave = initialData || createEmptyProjectData();
      localStorage.setItem(`${PROJECT_DATA_PREFIX}${newId}_en`, JSON.stringify(dataToSave));
      localStorage.setItem(`${PROJECT_DATA_PREFIX}${newId}_si`, JSON.stringify(dataToSave)); // Init both langs

      // Set as active
      localStorage.setItem(CURRENT_PROJECT_ID_KEY, newId);

      return newProjectMeta;
  },

  deleteProject(projectId) {
      const email = this.getCurrentUser();
      if (!email) return;

      const metaKey = `${PROJECTS_META_PREFIX}${email}`;
      let projects = JSON.parse(localStorage.getItem(metaKey) || '[]');
      
      projects = projects.filter(p => p.id !== projectId);
      localStorage.setItem(metaKey, JSON.stringify(projects));

      // Remove data files
      localStorage.removeItem(`${PROJECT_DATA_PREFIX}${projectId}_en`);
      localStorage.removeItem(`${PROJECT_DATA_PREFIX}${projectId}_si`);

      // If deleted active project, clear active
      if (localStorage.getItem(CURRENT_PROJECT_ID_KEY) === projectId) {
          localStorage.removeItem(CURRENT_PROJECT_ID_KEY);
      }
  },

  setCurrentProjectId(projectId) {
      localStorage.setItem(CURRENT_PROJECT_ID_KEY, projectId);
  },

  getCurrentProjectId() {
      return localStorage.getItem(CURRENT_PROJECT_ID_KEY);
  },

  // Load project by ID (or active ID if not provided)
  loadProject(language = 'en', projectId = null) {
    const email = this.getCurrentUser();
    if (!email) return createEmptyProjectData();

    // Determine ID
    let targetId = projectId;
    if (!targetId) {
        targetId = localStorage.getItem(CURRENT_PROJECT_ID_KEY);
    }

    // If still no ID, check if user has ANY projects
    if (!targetId) {
        const projects = this.getUserProjects();
        if (projects.length > 0) {
            targetId = projects[0].id;
            localStorage.setItem(CURRENT_PROJECT_ID_KEY, targetId);
        } else {
            // No projects exist, create one
            const newProj = this.createProject();
            targetId = newProj.id;
        }
    }
    
    // Load Data
    const raw = localStorage.getItem(`${PROJECT_DATA_PREFIX}${targetId}_${language}`);
    return raw ? JSON.parse(raw) : createEmptyProjectData();
  },

  // Save specific project data
  saveProject(data, language = 'en', projectId = null) {
    const email = this.getCurrentUser();
    if (!email) return;

    let targetId = projectId || localStorage.getItem(CURRENT_PROJECT_ID_KEY);
    if (!targetId) {
        // Should have been created by load, but just in case
        const newProj = this.createProject(data);
        targetId = newProj.id;
    }

    // 1. Save Content
    localStorage.setItem(`${PROJECT_DATA_PREFIX}${targetId}_${language}`, JSON.stringify(data));

    // 2. Update Metadata (Title & Date)
    const metaKey = `${PROJECTS_META_PREFIX}${email}`;
    const projects = JSON.parse(localStorage.getItem(metaKey) || '[]');
    const projIndex = projects.findIndex(p => p.id === targetId);

    if (projIndex !== -1) {
        // Update Title if available in data
        const newTitle = data.projectIdea?.projectTitle || projects[projIndex].title;
        // Keep "New Project" if data title is empty
        const displayTitle = (newTitle && newTitle.trim() !== '') ? newTitle : projects[projIndex].title;

        projects[projIndex] = {
            ...projects[projIndex],
            title: displayTitle,
            updatedAt: new Date().toISOString()
        };
        localStorage.setItem(metaKey, JSON.stringify(projects));
    }
  }
};
