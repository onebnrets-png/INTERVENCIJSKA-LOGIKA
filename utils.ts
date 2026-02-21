// utils.ts
// ═══════════════════════════════════════════════════════════════
// Utility functions: deep-setter, validation, project factory,
// completion checks, scheduling logic, language detection.
// v4.5 — 2026-02-21 — CHANGES:
//   - NEW: detectTextLanguage() — consolidated single-string language detection
//   - CHANGED: detectProjectLanguage() now delegates to detectTextLanguage()
// v4.4 — 2026-02-14 — CHANGES:
//   - FIXED: Added 'implementation' and 'organigram' sub-step completion checks
//   - FIXED: Removed obsolete 'quality-efficiency' case
// ═══════════════════════════════════════════════════════════════

import { SUB_STEPS } from './constants.tsx';

// ─── SCHEDULING RESULT TYPE ──────────────────────────────────────

export interface ScheduleResult {
  projectData: any;
  converged: boolean;
  iterations: number;
  warnings: string[];
}

// ─── DEEP SETTER (Optimized with structural sharing) ─────────────

export const set = (obj: any, path: (string | number)[], value: any): any => {
  if (path.length === 0) {
    return value;
  }

  const [head, ...rest] = path;
  const clone = Array.isArray(obj) ? [...obj] : { ...obj };

  if (rest.length === 0) {
    clone[head] = value;
  } else {
    const child = clone[head] !== undefined && clone[head] !== null
      ? clone[head]
      : (typeof rest[0] === 'number' ? [] : {});
    clone[head] = set(child, rest, value);
  }

  return clone;
};

// ─── VALIDATION UTILS ────────────────────────────────────────────

export const isValidEmail = (email: string): boolean => {
  const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return re.test(String(email).toLowerCase());
};

export const checkPasswordStrength = (password: string) => {
  return {
    length: password.length >= 8,
    hasUpper: /[A-Z]/.test(password),
    hasLower: /[a-z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSpecial: /[!@#$%^&*(),.?":{}|<>]/.test(password),
  };
};

export const isPasswordSecure = (password: string): boolean => {
  const checks = checkPasswordStrength(password);
  return checks.length && checks.hasNumber && checks.hasSpecial;
};

export const generateDisplayNameFromEmail = (email: string): string => {
  if (!email || !email.includes('@')) return 'User';
  return email.split('@')[0];
};

// ─── PROJECT DATA FACTORY ────────────────────────────────────────

export const createEmptyProjectData = () => {
  const today = new Date().toISOString().split('T')[0];

  return {
    problemAnalysis: {
      coreProblem: { title: '', description: '' },
      causes: [{ title: '', description: '' }],
      consequences: [{ title: '', description: '' }],
    },
    projectIdea: {
      projectTitle: '',
      projectAcronym: '',
      startDate: today,
      durationMonths: 24,
      mainAim: '',
      proposedSolution: '',
      stateOfTheArt: '',
      readinessLevels: {
        TRL: { level: null, justification: '' },
        SRL: { level: null, justification: '' },
        ORL: { level: null, justification: '' },
        LRL: { level: null, justification: '' },
      },
      policies: [{ name: '', description: '' }],
    },
    generalObjectives: [{ title: '', description: '', indicator: '' }],
    specificObjectives: [{ title: '', description: '', indicator: '' }],
    projectManagement: {
      description: '',
      structure: {
        coordinator: '',
        steeringCommittee: '',
        advisoryBoard: '',
        wpLeaders: ''
      }
    },
    activities: [{
      id: 'WP1',
      title: '',
      tasks: [{
        id: 'T1.1',
        title: '',
        description: '',
        startDate: '',
        endDate: '',
        dependencies: []
      }],
      milestones: [{ id: 'M1.1', description: '', date: '' }],
      deliverables: [{ id: 'D1.1', title: '', description: '', indicator: '' }]
    }],
    outputs: [{ title: '', description: '', indicator: '' }],
    outcomes: [{ title: '', description: '', indicator: '' }],
    impacts: [{ title: '', description: '', indicator: '' }],
    risks: [{ id: 'RISK1', category: 'technical', title: '', description: '', likelihood: 'low', impact: 'low', mitigation: '' }],
    kers: [{ id: 'KER1', title: '', description: '', exploitationStrategy: '' }],
  };
};

// ─── SAFE MERGE ──────────────────────────────────────────────────

export const safeMerge = (importedData: any): any => {
  const defaultData = createEmptyProjectData();

  if (!importedData) return defaultData;

  const merged = { ...defaultData, ...importedData };

  if (!merged.problemAnalysis) merged.problemAnalysis = defaultData.problemAnalysis;
  if (!merged.problemAnalysis.coreProblem) merged.problemAnalysis.coreProblem = defaultData.problemAnalysis.coreProblem;
  if (!Array.isArray(merged.problemAnalysis.causes)) merged.problemAnalysis.causes = defaultData.problemAnalysis.causes;
  if (!Array.isArray(merged.problemAnalysis.consequences)) merged.problemAnalysis.consequences = defaultData.problemAnalysis.consequences;

  if (!merged.projectIdea) merged.projectIdea = defaultData.projectIdea;
  if (!merged.projectIdea.readinessLevels) merged.projectIdea.readinessLevels = defaultData.projectIdea.readinessLevels;
  if (!Array.isArray(merged.projectIdea.policies)) merged.projectIdea.policies = defaultData.projectIdea.policies;

  if (!merged.projectManagement) merged.projectManagement = defaultData.projectManagement;

  ['activities', 'generalObjectives', 'specificObjectives', 'outputs', 'outcomes', 'impacts', 'risks', 'kers'].forEach(key => {
    if (!Array.isArray(merged[key])) merged[key] = defaultData[key];
  });

  if (Array.isArray(merged.activities)) {
    merged.activities = merged.activities.map((wp: any) => ({
      ...wp,
      tasks: Array.isArray(wp.tasks) ? wp.tasks : [],
      milestones: Array.isArray(wp.milestones) ? wp.milestones : [],
      deliverables: Array.isArray(wp.deliverables) ? wp.deliverables : []
    }));
  }

  return merged;
};

// ─── COMPLETION CHECKS ───────────────────────────────────────────

const hasText = (str: any): boolean => typeof str === 'string' && str.trim().length > 0;

export const isSubStepCompleted = (
  projectData: any,
  stepKey: string,
  subStepId: string
): boolean => {
  if (!projectData) return false;
  try {
    const checkArrayContent = (arr: any[]) => Array.isArray(arr) && arr.length > 0 && arr.some(item => hasText(item.title) || hasText(item.description));

    switch (subStepId) {
      // ── Problem Analysis ──────────────────────────────────
      case 'core-problem':
        return hasText(projectData.problemAnalysis?.coreProblem?.title);
      case 'causes':
        return checkArrayContent(projectData.problemAnalysis?.causes);
      case 'consequences':
        return checkArrayContent(projectData.problemAnalysis?.consequences);

      // ── Project Idea ──────────────────────────────────────
      case 'main-aim':
        return hasText(projectData.projectIdea?.mainAim);
      case 'state-of-the-art':
        return hasText(projectData.projectIdea?.stateOfTheArt);
      case 'proposed-solution':
        return hasText(projectData.projectIdea?.proposedSolution);
      case 'readiness-levels': {
        const rl = projectData.projectIdea?.readinessLevels;
        if (!rl) return false;
        return rl.TRL?.level !== null || rl.SRL?.level !== null || rl.ORL?.level !== null || rl.LRL?.level !== null;
      }
      case 'eu-policies':
        return Array.isArray(projectData.projectIdea?.policies) && projectData.projectIdea.policies.some((p: any) => hasText(p.name));

      // ── Activities: Implementation ────────────────────────
      case 'implementation':
        return hasText(projectData.projectManagement?.description);

      // ── Activities: Organigram ────────────────────────────
      case 'organigram': {
        const struct = projectData.projectManagement?.structure;
        if (!struct) return false;
        return hasText(struct.coordinator) || hasText(struct.steeringCommittee) || hasText(struct.advisoryBoard);
      }

      // ── Activities: Work Plan ─────────────────────────────
      case 'workplan':
        return Array.isArray(projectData.activities) && projectData.activities.some((wp: any) => hasText(wp.title) || (wp.tasks && wp.tasks.length > 0 && hasText(wp.tasks[0].title)));

      // ── Activities: Gantt Chart ───────────────────────────
      case 'gantt-chart':
        return Array.isArray(projectData.activities) && projectData.activities.some((wp: any) => wp.tasks && wp.tasks.length > 0 && wp.tasks.some((t: any) => t.startDate && t.endDate));

      // ── Activities: PERT Chart ────────────────────────────
      case 'pert-chart':
        return Array.isArray(projectData.activities) && projectData.activities.some((wp: any) => wp.tasks && wp.tasks.length > 0 && wp.tasks.some((t: any) => hasText(t.title)));

      // ── Activities: Risk Mitigation ───────────────────────
      case 'risk-mitigation':
        return Array.isArray(projectData.risks) && projectData.risks.some((r: any) => hasText(r.title));

      // ── Expected Results ──────────────────────────────────
      case 'outputs':
        return checkArrayContent(projectData.outputs);
      case 'outcomes':
        return checkArrayContent(projectData.outcomes);
      case 'impacts':
        return checkArrayContent(projectData.impacts);
      case 'kers':
        return checkArrayContent(projectData.kers);

      default:
        return false;
    }
  } catch (e) {
    return false;
  }
};

export const isStepCompleted = (
  projectData: any,
  stepKey: string,
): boolean => {
  const subSteps = SUB_STEPS[stepKey];

  if (subSteps && subSteps.length > 0) {
    return subSteps.every((subStep: any) => isSubStepCompleted(projectData, stepKey, subStep.id));
  }

  const data = projectData[stepKey];

  if (Array.isArray(data)) {
    if (data.length === 0) return false;
    const meaningfulData = data.filter((item: any) => {
      if (typeof item !== 'object' || item === null) return false;
      const hasTitle = 'title' in item && typeof item.title === 'string' && item.title.trim() !== '';
      const hasDescription = 'description' in item && typeof item.description === 'string' && item.description.trim() !== '';
      return hasTitle || hasDescription;
    });
    return meaningfulData.length > 0;
  }

  return false;
};

// ─── DOWNLOAD HELPER ─────────────────────────────────────────────

export const downloadBlob = (blob: Blob, fileName: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// ─── CONSOLIDATED LANGUAGE DETECTION (v4.5, 2026-02-21) ─────────
// ★ Single-string language detection — used across the entire project
// ═══════════════════════════════════════════════════════════════════

const SI_KEYWORDS = [
  'projekt', 'cilj', 'aktivnost', 'rezultat', 'tveganje', 'kazalnik',
  'upravljanje', 'kakovost', 'analiza', 'opis', 'delovni', 'paket',
  'trajanje', 'začetek', 'konec', 'partnerji', 'vodja', 'proračun',
  'financiranje', 'izvedba', 'spremljanje', 'poročanje', 'diseminacija',
  'trajnost', 'inovacija', 'vpliv', 'učinek', 'izhod', 'dosežek',
  'metodologija', 'pristop', 'strategija', 'komunikacija', 'vrednotenje',
  'je', 'in', 'na', 'za', 'ki', 'da', 'se', 'bo', 'so', 'ter', 'ali',
  'lahko', 'tudi', 'pri', 'med', 'po', 'iz', 'nad', 'pod'
];

const EN_KEYWORDS = [
  'project', 'objective', 'activity', 'result', 'risk', 'indicator',
  'management', 'quality', 'analysis', 'description', 'work', 'package',
  'duration', 'start', 'end', 'partners', 'leader', 'budget',
  'funding', 'implementation', 'monitoring', 'reporting', 'dissemination',
  'sustainability', 'innovation', 'impact', 'outcome', 'output', 'achievement',
  'methodology', 'approach', 'strategy', 'communication', 'evaluation',
  'the', 'and', 'for', 'that', 'with', 'will', 'are', 'this', 'from',
  'has', 'have', 'been', 'not', 'but', 'which', 'their', 'can', 'into'
];

export const detectTextLanguage = (text: string): 'en' | 'si' | 'unknown' => {
  if (!text || text.trim().length < 10) return 'unknown';

  const lower = text.toLowerCase();
  const words = lower.split(/\s+/);

  // Slovenian-specific characters
  const siChars = (lower.match(/[čšžćđ]/g) || []).length;

  let siScore = siChars * 3; // strong signal
  let enScore = 0;

  for (const word of words) {
    if (SI_KEYWORDS.includes(word)) siScore++;
    if (EN_KEYWORDS.includes(word)) enScore++;
  }

  if (siScore === 0 && enScore === 0) return 'unknown';
  if (siScore > enScore * 1.2) return 'si';
  if (enScore > siScore * 1.2) return 'en';
  return siScore >= enScore ? 'si' : 'en';
};

// ★ v4.5: Now delegates to detectTextLanguage for consistency
export const detectProjectLanguage = (data: any): 'en' | 'si' => {
  if (!data) return 'en';

  const sampleTexts: string[] = [];

  const sections = [
    data?.problemAnalysis,
    data?.projectIdea,
    data?.objectives,
    data?.projectManagement,
  ];

  for (const section of sections) {
    if (section && typeof section === 'object') {
      for (const value of Object.values(section)) {
        if (typeof value === 'string' && (value as string).length > 20) {
          sampleTexts.push(value as string);
          if (sampleTexts.length >= 5) break;
        }
      }
    }
    if (sampleTexts.length >= 5) break;
  }

  if (sampleTexts.length === 0) return 'en';

  const combined = sampleTexts.join(' ');
  const result = detectTextLanguage(combined);
  return result === 'unknown' ? 'en' : result;
};

// ─── SCHEDULING LOGIC ────────────────────────────────────────────

const formatDate = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const getDuration = (startStr: string, endStr: string): number => {
  const start = new Date(startStr);
  const end = new Date(endStr);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

export const recalculateProjectSchedule = (projectData: any): ScheduleResult => {
  const warnings: string[] = [];

  if (!projectData.activities || !Array.isArray(projectData.activities)) {
    return { projectData, converged: true, iterations: 0, warnings: [] };
  }

  const taskMap = new Map();
  const tasksArray: any[] = [];

  const newActivities = JSON.parse(JSON.stringify(projectData.activities));

  newActivities.forEach((wp: any, wpIndex: number) => {
    if (wp.tasks && Array.isArray(wp.tasks)) {
      wp.tasks.forEach((task: any, taskIndex: number) => {
        if (task.startDate && task.endDate) {
          const tObj = {
            ...task,
            wpIndex,
            taskIndex,
            start: new Date(task.startDate),
            end: new Date(task.endDate),
            duration: getDuration(task.startDate, task.endDate)
          };
          taskMap.set(task.id, tObj);
          tasksArray.push(tObj);
        }
      });
    }
  });

  for (const task of tasksArray) {
    if (task.dependencies && task.dependencies.length > 0) {
      for (const dep of task.dependencies) {
        if (!taskMap.has(dep.predecessorId)) {
          warnings.push(`Task "${task.id}" references unknown predecessor "${dep.predecessorId}" – dependency ignored.`);
        }
      }
    }
  }

  let changed = true;
  let iterations = 0;
  const MAX_ITERATIONS = 50;

  while (changed && iterations < MAX_ITERATIONS) {
    changed = false;
    iterations++;

    for (const task of tasksArray) {
      if (!task.dependencies || task.dependencies.length === 0) continue;

      let earliestStart = new Date(task.start);
      let earliestEnd = new Date(task.end);
      let shiftRequired = false;

      for (const dep of task.dependencies) {
        const predecessor = taskMap.get(dep.predecessorId);
        if (!predecessor) continue;

        if (dep.type === 'FS') {
          const constraintDate = addDays(predecessor.end, 1);
          if (task.start < constraintDate) {
            earliestStart = constraintDate;
            shiftRequired = true;
          }
        } else if (dep.type === 'SS') {
          const constraintDate = new Date(predecessor.start);
          if (task.start < constraintDate) {
            earliestStart = constraintDate;
            shiftRequired = true;
          }
        } else if (dep.type === 'FF') {
          const constraintDate = new Date(predecessor.end);
          if (task.end < constraintDate) {
            earliestEnd = constraintDate;
            earliestStart = addDays(constraintDate, -task.duration);
            shiftRequired = true;
          }
        } else if (dep.type === 'SF') {
          const constraintDate = addDays(predecessor.start, -1);
          if (task.end < constraintDate) {
            earliestEnd = constraintDate;
            earliestStart = addDays(constraintDate, -task.duration);
            shiftRequired = true;
          }
        }
      }

      if (shiftRequired) {
        const newStart = earliestStart;
        const newEnd = addDays(newStart, task.duration);

        if (newStart.getTime() !== task.start.getTime()) {
          task.start = newStart;
          task.end = newEnd;
          newActivities[task.wpIndex].tasks[task.taskIndex].startDate = formatDate(newStart);
          newActivities[task.wpIndex].tasks[task.taskIndex].endDate = formatDate(newEnd);
          changed = true;
        }
      }
    }
  }

  const converged = !changed;

  if (!converged) {
    warnings.push(
      `Schedule did not converge after ${MAX_ITERATIONS} iterations. ` +
      `This usually indicates circular dependencies between tasks. ` +
      `Please check task dependencies for loops.`
    );
  }

  return {
    projectData: {
      ...projectData,
      activities: newActivities
    },
    converged,
    iterations,
    warnings
  };
};
