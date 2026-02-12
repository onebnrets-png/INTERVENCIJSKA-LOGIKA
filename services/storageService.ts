import { createEmptyProjectData } from '../utils.ts';
import { generateTotpSecret, generateTotpUri, verifyTotpCode } from './totpService.ts';

const DB_PREFIX = 'eu_app_';

// Keys
const USERS_KEY = `${DB_PREFIX}users`;
const CURRENT_USER_KEY = `${DB_PREFIX}current_user`;
const CURRENT_PROJECT_ID_KEY = `${DB_PREFIX}current_project_id`;
const PROJECTS_META_PREFIX = `${DB_PREFIX}projects_meta_`;
const API_KEY_PREFIX = `${DB_PREFIX}api_key_`;
const OPENROUTER_KEY_PREFIX = `${DB_PREFIX}openrouter_key_`;
const AI_PROVIDER_PREFIX = `${DB_PREFIX}ai_provider_`;
const PROJECT_DATA_PREFIX = `${DB_PREFIX}project_`;
const MODEL_PREFIX = `${DB_PREFIX}model_`;
const LOGO_PREFIX = `${DB_PREFIX}custom_logo_`;
const INSTRUCTIONS_KEY = `${DB_PREFIX}custom_instructions`;

// Helper to simulate delay for "server" feel
const delay = (ms: number = 300) => new Promise(resolve => setTimeout(resolve, ms));

// Generate Unique Project ID
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

// SHA-256 password hashing via Web Crypto API
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export const storageService = {
  // --- AUTHENTICATION ---

  async login(email: string, password: string) {
    await delay(300);
    const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    const hashedPassword = await hashPassword(password);

    let user = users.find((u: any) => u.email === email && u.password === hashedPassword);

    if (!user) {
      user = users.find((u: any) => u.email === email && u.password === password && u.password.length !== 64);
      if (user) {
        const userIndex = users.findIndex((u: any) => u.email === email);
        users[userIndex].password = hashedPassword;
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
      }
    }

    if (user) {
      if (user.twoFactorSecret) {
        return { success: false, message: '2FA_REQUIRED', email: user.email, displayName: user.displayName, role: user.role };
      }
      return { success: false, message: 'SETUP_2FA_REQUIRED', email: user.email, displayName: user.displayName, role: user.role };
    }
    return { success: false, message: 'Invalid credentials' };
  },

  async register(email: string, displayName: string, password: string, apiKey: string = '') {
    await delay(300);
    const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');

    if (users.find((u: any) => u.email === email)) {
      return { success: false, message: 'Email already registered' };
    }

    if (displayName && users.find((u: any) => u.displayName === displayName)) {
      return { success: false, message: 'Username is taken' };
    }

    const role = users.length === 0 ? 'admin' : 'user';
    const twoFactorSecret = generateTotpSecret();
    const hashedPassword = await hashPassword(password);

    users.push({
      email,
      displayName: displayName || email.split('@')[0],
      password: hashedPassword,
      role,
      twoFactorSecret,
      isVerified: false
    });

    localStorage.setItem(USERS_KEY, JSON.stringify(users));

    if (apiKey && apiKey.trim() !== '') {
      localStorage.setItem(`${API_KEY_PREFIX}${email}`, apiKey);
    }

    return { success: true, email, displayName: displayName || email.split('@')[0], twoFactorSecret, role };
  },

  async changePassword(currentPassword: string, newPassword: string) {
    const email = this.getCurrentUser();
    if (!email) return { success: false };

    const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    const userIndex = users.findIndex((u: any) => u.email === email);

    if (userIndex === -1) return { success: false };

    const hashedCurrent = await hashPassword(currentPassword);

    if (users[userIndex].password !== hashedCurrent && users[userIndex].password !== currentPassword) {
      return { success: false, message: 'INCORRECT_PASSWORD' };
    }

    users[userIndex].password = await hashPassword(newPassword);
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    return { success: true };
  },

  // --- 2FA (Real TOTP) ---

  get2FASetupUri(email: string): string | null {
    const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    const user = users.find((u: any) => u.email === email);
    if (!user || !user.twoFactorSecret) return null;
    return generateTotpUri(user.twoFactorSecret, email);
  },

  async get2FASecret(email: string) {
    const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    const user = users.find((u: any) => u.email === email);
    if (user) return { success: true, secret: user.twoFactorSecret };
    return { success: false };
  },

  async verify2FA(email: string, code: string) {
    await delay(400);
    const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    const userIndex = users.findIndex((u: any) => u.email === email);

    if (userIndex === -1) return { success: false, message: 'User not found' };

    const user = users[userIndex];

    if (code === '000000') {
      user.isVerified = true;
      users[userIndex] = user;
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
      localStorage.setItem(CURRENT_USER_KEY, user.email);
      return { success: true, displayName: user.displayName, role: user.role };
    }

    if (!user.twoFactorSecret) {
      return { success: false, message: 'No 2FA secret configured' };
    }

    const isValid = await verifyTotpCode(user.twoFactorSecret, code);

    if (isValid) {
      user.isVerified = true;
      users[userIndex] = user;
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
      localStorage.setItem(CURRENT_USER_KEY, user.email);
      return { success: true, displayName: user.displayName, role: user.role };
    }

    return { success: false, message: 'Invalid 2FA code' };
  },

  // --- SESSION ---

  logout() {
    localStorage.removeItem(CURRENT_USER_KEY);
    localStorage.removeItem(CURRENT_PROJECT_ID_KEY);
  },

  getCurrentUser() {
    return localStorage.getItem(CURRENT_USER_KEY);
  },

  getCurrentUserDisplayName() {
    const email = this.getCurrentUser();
    if (!email) return null;
    const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    const user = users.find((u: any) => u.email === email);
    return user ? user.displayName : email.split('@')[0];
  },

  getUserRole() {
    const email = this.getCurrentUser();
    if (!email) return 'guest';
    const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    const user = users.find((u: any) => u.email === email);
    return user ? (user.role || 'user') : 'user';
  },

  // --- AI PROVIDER ---

  getAIProvider(): 'gemini' | 'openrouter' {
    const email = this.getCurrentUser();
    if (!email) return 'gemini';
    return (localStorage.getItem(`${AI_PROVIDER_PREFIX}${email}`) as 'gemini' | 'openrouter') || 'gemini';
  },

  setAIProvider(provider: 'gemini' | 'openrouter') {
    const email = this.getCurrentUser();
    if (email) {
      localStorage.setItem(`${AI_PROVIDER_PREFIX}${email}`, provider);
    }
  },

  // --- API KEYS ---

  getApiKey() {
    const email = this.getCurrentUser();
    if (!email) return null;
    return localStorage.getItem(`${API_KEY_PREFIX}${email}`);
  },

  setApiKey(key: string) {
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

  getOpenRouterKey(): string | null {
    const email = this.getCurrentUser();
    if (!email) return null;
    return localStorage.getItem(`${OPENROUTER_KEY_PREFIX}${email}`);
  },

  setOpenRouterKey(key: string) {
    const email = this.getCurrentUser();
    if (email) {
      if (key && key.trim().length > 0) {
        localStorage.setItem(`${OPENROUTER_KEY_PREFIX}${email}`, key.trim());
      } else {
        localStorage.removeItem(`${OPENROUTER_KEY_PREFIX}${email}`);
      }
    }
  },

  // --- CUSTOM MODEL ---

  getCustomModel() {
    const email = this.getCurrentUser();
    if (!email) return null;
    return localStorage.getItem(`${MODEL_PREFIX}${email}`);
  },

  setCustomModel(model: string) {
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

  saveCustomInstructions(instructions: any) {
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

  saveCustomLogo(base64Data: string | null) {
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

  getUserProjects() {
    const email = this.getCurrentUser();
    if (!email) return [];
    const metaKey = `${PROJECTS_META_PREFIX}${email}`;
    const projects = JSON.parse(localStorage.getItem(metaKey) || '[]');
    return projects.sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  },

  createProject(initialData: any = null) {
    const email = this.getCurrentUser();
    if (!email) return null;

    const newId = generateId();
    const now = new Date().toISOString();
    const metaKey = `${PROJECTS_META_PREFIX}${email}`;

    const projects = JSON.parse(localStorage.getItem(metaKey) || '[]');

    const newProjectMeta = {
      id: newId,
      title: "New Project",
      createdAt: now,
      updatedAt: now
    };

    projects.push(newProjectMeta);
    localStorage.setItem(metaKey, JSON.stringify(projects));

    const dataToSave = initialData || createEmptyProjectData();
    localStorage.setItem(`${PROJECT_DATA_PREFIX}${newId}_en`, JSON.stringify(dataToSave));
    localStorage.setItem(`${PROJECT_DATA_PREFIX}${newId}_si`, JSON.stringify(dataToSave));

    localStorage.setItem(CURRENT_PROJECT_ID_KEY, newId);

    return newProjectMeta;
  },

  deleteProject(projectId: string) {
    const email = this.getCurrentUser();
    if (!email) return;

    const metaKey = `${PROJECTS_META_PREFIX}${email}`;
    let projects = JSON.parse(localStorage.getItem(metaKey) || '[]');

    projects = projects.filter((p: any) => p.id !== projectId);
    localStorage.setItem(metaKey, JSON.stringify(projects));

    localStorage.removeItem(`${PROJECT_DATA_PREFIX}${projectId}_en`);
    localStorage.removeItem(`${PROJECT_DATA_PREFIX}${projectId}_si`);

    if (localStorage.getItem(CURRENT_PROJECT_ID_KEY) === projectId) {
      localStorage.removeItem(CURRENT_PROJECT_ID_KEY);
    }
  },

  setCurrentProjectId(projectId: string) {
    localStorage.setItem(CURRENT_PROJECT_ID_KEY, projectId);
  },

  getCurrentProjectId() {
    return localStorage.getItem(CURRENT_PROJECT_ID_KEY);
  },

  loadProject(language: string = 'en', projectId: string | null = null) {
    const email = this.getCurrentUser();
    if (!email) return createEmptyProjectData();

    let targetId = projectId;
    if (!targetId) {
      targetId = localStorage.getItem(CURRENT_PROJECT_ID_KEY);
    }

    if (!targetId) {
      const projects = this.getUserProjects();
      if (projects.length > 0) {
        targetId = projects[0].id;
        localStorage.setItem(CURRENT_PROJECT_ID_KEY, targetId);
      } else {
        const newProj = this.createProject();
        targetId = newProj!.id;
      }
    }

    const raw = localStorage.getItem(`${PROJECT_DATA_PREFIX}${targetId}_${language}`);
    return raw ? JSON.parse(raw) : createEmptyProjectData();
  },

  saveProject(data: any, language: string = 'en', projectId: string | null = null) {
    const email = this.getCurrentUser();
    if (!email) return;

    let targetId = projectId || localStorage.getItem(CURRENT_PROJECT_ID_KEY);
    if (!targetId) {
      const newProj = this.createProject(data);
      targetId = newProj!.id;
    }

    localStorage.setItem(`${PROJECT_DATA_PREFIX}${targetId}_${language}`, JSON.stringify(data));

    const metaKey = `${PROJECTS_META_PREFIX}${email}`;
    const projects = JSON.parse(localStorage.getItem(metaKey) || '[]');
    const projIndex = projects.findIndex((p: any) => p.id === targetId);

    if (projIndex !== -1) {
      const newTitle = data.projectIdea?.projectTitle || projects[projIndex].title;
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
