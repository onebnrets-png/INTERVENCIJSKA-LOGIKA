
import { SUB_STEPS } from './constants.tsx';

/**
 * A simple deep-setter utility to update nested state immutably.
 * It creates a deep copy of the object to avoid direct mutation.
 * @param obj The original object.
 * @param path An array of keys/indices representing the path to the value.
 * @param value The new value to set.
 * @returns A new object with the updated value.
 */
export const set = (obj, path, value) => {
    if (path.length === 0) {
        return value;
    }

    const newObj = JSON.parse(JSON.stringify(obj)); // Deep copy for immutability
    
    let current = newObj;
    for (let i = 0; i < path.length - 1; i++) {
        const key = path[i];
        if (current[key] === undefined || current[key] === null) {
            // If a key in the path doesn't exist, create it.
            // Check if next path segment is a number to decide between object or array.
            current[key] = typeof path[i + 1] === 'number' ? [] : {};
        }
        current = current[key];
    }
    
    current[path[path.length - 1]] = value;
    
    return newObj;
};

// --- VALIDATION UTILS ---

export const isValidEmail = (email) => {
  // Standard email regex
  const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return re.test(String(email).toLowerCase());
};

export const checkPasswordStrength = (password) => {
  return {
    length: password.length >= 8,
    hasUpper: /[A-Z]/.test(password),
    hasLower: /[a-z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSpecial: /[!@#$%^&*(),.?":{}|<>]/.test(password),
  };
};

export const isPasswordSecure = (password) => {
  const checks = checkPasswordStrength(password);
  return checks.length && checks.hasNumber && checks.hasSpecial; 
  // Requirement: 8 chars, number, special char. (Upper/Lower is good practice but sticking to user prompt "chars, numbers, signs")
};

export const generateDisplayNameFromEmail = (email) => {
    if (!email || !email.includes('@')) return 'User';
    return email.split('@')[0];
};

export const createEmptyProjectData = () => {
  // Default start date to today
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
      startDate: today, // Default to today
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
        dependencies: [] // Array of { predecessorId: string, type: 'FS'|'SS'|'FF'|'SF' }
      }],
      milestones: [{ id: 'M1.1', description: '', date: '' }],
      deliverables: [{ id: 'D1.1', description: '', indicator: '' }]
    }],
    outputs: [{ title: '', description: '', indicator: '' }],
    outcomes: [{ title: '', description: '', indicator: '' }],
    impacts: [{ title: '', description: '', indicator: '' }],
    risks: [{ id: 'RISK1', category: 'Technical', title: '', description: '', likelihood: 'Low', impact: 'Low', mitigation: '' }],
    kers: [{ id: 'KER1', title: '', description: '', exploitationStrategy: '' }],
  };
};

/**
 * Safely merges user data with the default structure to prevent "undefined" errors.
 * Ensures all arrays and critical objects exist.
 */
export const safeMerge = (importedData) => {
    const defaultData = createEmptyProjectData();
    
    // Fallback if importedData is null/undefined
    if (!importedData) return defaultData;

    // Shallow merge top-level
    const merged = { ...defaultData, ...importedData };

    // --- 1. Problem Analysis ---
    if (!merged.problemAnalysis) merged.problemAnalysis = defaultData.problemAnalysis;
    if (!merged.problemAnalysis.coreProblem) merged.problemAnalysis.coreProblem = defaultData.problemAnalysis.coreProblem;
    if (!Array.isArray(merged.problemAnalysis.causes)) merged.problemAnalysis.causes = defaultData.problemAnalysis.causes;
    if (!Array.isArray(merged.problemAnalysis.consequences)) merged.problemAnalysis.consequences = defaultData.problemAnalysis.consequences;
    
    // --- 2. Project Idea ---
    if (!merged.projectIdea) merged.projectIdea = defaultData.projectIdea;
    if (!merged.projectIdea.readinessLevels) merged.projectIdea.readinessLevels = defaultData.projectIdea.readinessLevels;
    if (!Array.isArray(merged.projectIdea.policies)) merged.projectIdea.policies = defaultData.projectIdea.policies;
    
    // --- 3. Project Management ---
    if (!merged.projectManagement) merged.projectManagement = defaultData.projectManagement;

    // --- 4. Top-Level Arrays ---
    ['activities', 'generalObjectives', 'specificObjectives', 'outputs', 'outcomes', 'impacts', 'risks', 'kers'].forEach(key => {
        if (!Array.isArray(merged[key])) merged[key] = defaultData[key];
    });

    // --- 5. Deep Check Activities (WPs) ---
    // Often tasks or milestones arrays are missing in partial saves/imports
    if (Array.isArray(merged.activities)) {
        merged.activities = merged.activities.map(wp => ({
            ...wp,
            tasks: Array.isArray(wp.tasks) ? wp.tasks : [],
            milestones: Array.isArray(wp.milestones) ? wp.milestones : [],
            deliverables: Array.isArray(wp.deliverables) ? wp.deliverables : []
        }));
    }

    return merged;
};

const hasText = (str) => typeof str === 'string' && str.trim().length > 0;

export const isSubStepCompleted = (
  projectData,
  stepKey,
  subStepId
) => {
  if (!projectData) return false;
  try {
    const checkArrayContent = (arr) => Array.isArray(arr) && arr.length > 0 && arr.some(item => hasText(item.title) || hasText(item.description));

    switch (subStepId) {
      // Problem Analysis
      case 'core-problem':
        return hasText(projectData.problemAnalysis?.coreProblem?.title);
      case 'causes':
        return checkArrayContent(projectData.problemAnalysis?.causes);
      case 'consequences':
        return checkArrayContent(projectData.problemAnalysis?.consequences);
      
      // Project Idea
      case 'main-aim':
        return hasText(projectData.projectIdea?.mainAim);
      case 'state-of-the-art':
        return hasText(projectData.projectIdea?.stateOfTheArt);
      case 'proposed-solution':
        return hasText(projectData.projectIdea?.proposedSolution);
      case 'readiness-levels':
        const rl = projectData.projectIdea?.readinessLevels;
        if (!rl) return false;
        return rl.TRL?.level !== null || rl.SRL?.level !== null || rl.ORL?.level !== null || rl.LRL?.level !== null;
      case 'eu-policies':
        return Array.isArray(projectData.projectIdea?.policies) && projectData.projectIdea.policies.some(p => hasText(p.name));

      // Activities
      case 'quality-efficiency':
        return hasText(projectData.projectManagement?.description);
      case 'workplan':
        return Array.isArray(projectData.activities) && projectData.activities.some(wp => hasText(wp.title) || (wp.tasks && wp.tasks.length > 0 && hasText(wp.tasks[0].title)));
      case 'gantt-chart':
        return Array.isArray(projectData.activities) && projectData.activities.some(wp => wp.tasks && wp.tasks.length > 0 && wp.tasks.some(t => t.startDate && t.endDate));
      case 'pert-chart':
        // PERT Chart is effectively "done" if there are tasks to display.
        return Array.isArray(projectData.activities) && projectData.activities.some(wp => wp.tasks && wp.tasks.length > 0 && wp.tasks.some(t => hasText(t.title)));
      case 'risk-mitigation':
        return Array.isArray(projectData.risks) && projectData.risks.some(r => hasText(r.title));

      // Expected Results
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
  projectData,
  stepKey,
) => {
  const stepKeyForSubSteps = stepKey;
  const subSteps = SUB_STEPS[stepKeyForSubSteps];
  
  // If a step has defined sub-steps, its completion depends on all sub-steps being completed.
  if (subSteps && subSteps.length > 0) {
    return subSteps.every(subStep => isSubStepCompleted(projectData, stepKeyForSubSteps, subStep.id));
  }

  // Fallback for steps without sub-steps (Objectives)
  const data = projectData[stepKey];
  
  if (Array.isArray(data)) {
    if (data.length === 0) return false;
    const meaningfulData = data.filter(item => {
        if (typeof item !== 'object' || item === null) return false;
        const hasTitle = 'title' in item && typeof item.title === 'string' && item.title.trim() !== '';
        const hasDescription = 'description' in item && typeof item.description === 'string' && item.description.trim() !== '';
        return hasTitle || hasDescription;
    });
    return meaningfulData.length > 0;
  }

  return false;
};

/**
 * Creates a downloadable link from a Blob and triggers the download.
 * @param blob The data blob to download.
 * @param fileName The name of the file to be saved.
 */
export const downloadBlob = (blob, fileName) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};


// --- STRICT SCHEDULING LOGIC ---

// Helper to format Date to YYYY-MM-DD
const formatDate = (date) => {
    return date.toISOString().split('T')[0];
};

// Helper to add days
const addDays = (date, days) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
};

const getDuration = (startStr, endStr) => {
    const start = new Date(startStr);
    const end = new Date(endStr);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    return diffDays; 
};

/**
 * Recalculates the entire project schedule based on strict dependencies.
 * This performs a "Forward Pass" to push tasks to their earliest valid dates.
 */
export const recalculateProjectSchedule = (projectData) => {
    // 1. Flatten all tasks into a map for easy access
    const taskMap = new Map();
    const tasksArray = [];

    // Deep copy activities to avoid mutating the input while calculating
    // SAFETY CHECK: Ensure activities exist
    if (!projectData.activities || !Array.isArray(projectData.activities)) {
        return projectData;
    }

    const newActivities = JSON.parse(JSON.stringify(projectData.activities));

    newActivities.forEach((wp, wpIndex) => {
        if(wp.tasks && Array.isArray(wp.tasks)) {
            wp.tasks.forEach((task, taskIndex) => {
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

    // 2. Iterative Forward Pass
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

    return {
        ...projectData,
        activities: newActivities
    };
};
