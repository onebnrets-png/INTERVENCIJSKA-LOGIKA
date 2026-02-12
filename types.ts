// =============================================================================
// types.ts - Centralized TypeScript Type Definitions
// =============================================================================

// --- Core Data Primitives ---

export interface ProblemNode {
  title: string;
  description: string;
}

export interface PolicyItem {
  name: string;
  description: string;
}

export interface ObjectiveItem {
  title: string;
  description: string;
  indicator: string;
}

export interface ReadinessLevelValue {
  level: number | null;
  justification: string;
}

export interface ReadinessLevels {
  TRL: ReadinessLevelValue;
  SRL: ReadinessLevelValue;
  ORL: ReadinessLevelValue;
  LRL: ReadinessLevelValue;
}

// --- Task & Activity Types ---

export type DependencyType = 'FS' | 'SS' | 'FF' | 'SF';

export interface TaskDependency {
  predecessorId: string;
  type: DependencyType;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  dependencies: TaskDependency[];
}

export interface Milestone {
  id: string;
  description: string;
  date: string;
}

export interface Deliverable {
  id: string;
  description: string;
  indicator: string;
}

export interface WorkPackage {
  id: string;
  title: string;
  tasks: Task[];
  milestones: Milestone[];
  deliverables: Deliverable[];
}

// --- Risk & KER Types ---

export type RiskCategory = 'Technical' | 'Social' | 'Economic';
export type RiskLevel = 'Low' | 'Medium' | 'High';

export interface Risk {
  id: string;
  category: RiskCategory;
  title: string;
  description: string;
  likelihood: RiskLevel;
  impact: RiskLevel;
  mitigation: string;
}

export interface KER {
  id: string;
  title: string;
  description: string;
  exploitationStrategy: string;
}

// --- Result Types (Outputs, Outcomes, Impacts) ---

export interface ResultItem {
  title: string;
  description: string;
  indicator: string;
}

// --- Project Management ---

export interface ProjectManagementStructure {
  coordinator: string;
  steeringCommittee: string;
  advisoryBoard: string;
  wpLeaders: string;
}

export interface ProjectManagement {
  description: string;
  structure: ProjectManagementStructure;
}

// --- Section Types ---

export interface ProblemAnalysis {
  coreProblem: ProblemNode;
  causes: ProblemNode[];
  consequences: ProblemNode[];
}

export interface ProjectIdea {
  projectTitle: string;
  projectAcronym: string;
  startDate: string;
  mainAim: string;
  proposedSolution: string;
  stateOfTheArt: string;
  readinessLevels: ReadinessLevels;
  policies: PolicyItem[];
}

// --- Master Project Data ---

export interface ProjectData {
  problemAnalysis: ProblemAnalysis;
  projectIdea: ProjectIdea;
  generalObjectives: ObjectiveItem[];
  specificObjectives: ObjectiveItem[];
  projectManagement: ProjectManagement;
  activities: WorkPackage[];
  outputs: ResultItem[];
  outcomes: ResultItem[];
  impacts: ResultItem[];
  risks: Risk[];
  kers: KER[];
}

// --- App State Types ---

export type Language = 'en' | 'si';

export type ViewMode = 'week' | 'month' | 'quarter' | 'semester' | 'year' | 'project';

export interface ProjectVersions {
  en: ProjectData | null;
  si: ProjectData | null;
}

export interface ProjectMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModalConfig {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onSecondary: (() => void) | null;
  onCancel: () => void;
  confirmText: string;
  secondaryText: string;
  cancelText: string;
}

// --- Export Data Types ---

export interface ExportMeta {
  version: string;
  createdAt: string;
  activeLanguage: Language;
  author: string;
  projectId: string;
}

export interface ExportData {
  meta: ExportMeta;
  data: ProjectVersions;
}

// --- Chart Image Data (for DOCX export) ---

export interface ChartImageData {
  dataUrl: string;
  width: number;
  height: number;
}

// --- Auth Types ---

export type UserRole = 'admin' | 'user' | 'guest';

export interface UserRecord {
  email: string;
  displayName: string;
  password: string;
  role: UserRole;
  twoFactorSecret: string;
  isVerified: boolean;
  tempSimulatedCode?: string;
}

export interface AuthResult {
  success: boolean;
  message?: string;
  email?: string;
  displayName?: string;
  role?: UserRole;
  twoFactorSecret?: string;
}

// --- Instructions Types ---

export interface InstructionChapter {
  title: string;
  subChapters: string[];
  RULES: string[];
}

export interface AppInstructions {
  _METADATA: {
    version: number;
    lastUpdated: string;
  };
  GLOBAL_RULES: string[];
  CHAPTERS: Record<string, InstructionChapter>;
}

// --- Gantt Chart Internal Types ---

export interface GanttTaskInternal {
  id: string;
  title: string;
  wpId: string;
  wpTitle: string;
  type: 'task' | 'milestone';
  start: Date;
  end: Date;
  date?: Date;
  duration: number;
  dependencies: TaskDependency[];
  wpIndex?: number;
  taskIndex?: number;
}

// --- PERT Chart Internal Types ---

export interface PERTNode {
  id: string;
  title: string;
  wpTitle: string;
  dependencies: TaskDependency[];
  startDate: Date | null;
  endDate: Date | null;
  duration: number;
  level: number;
  x: number;
  y: number;
  wpIndex: number;
}

export interface PERTEdge {
  from: PERTNode;
  to: PERTNode;
  type: DependencyType;
}

// --- Readiness Level Definition Types ---

export interface ReadinessLevelDefinition {
  level: number;
  title: string;
}

export interface ReadinessLevelCategory {
  name: string;
  description: string;
  levels: ReadinessLevelDefinition[];
}

export type ReadinessLevelDefinitions = Record<string, ReadinessLevelCategory>;

// --- Step Types ---

export interface Step {
  id: number;
  key: string;
  title: string;
  color: string;
}

export interface SubStep {
  id: string;
  title: string;
}

export type SubStepsMap = Record<string, SubStep[]>;
