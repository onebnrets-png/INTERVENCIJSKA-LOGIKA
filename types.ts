// types.ts
// ═══════════════════════════════════════════════════════════════
// Central type definitions for EU Project Idea Draft
// v5.0 — 2026-02-16 — CHANGES:
//   - FULL REWRITE: All interfaces now match the ACTUAL runtime
//     data structures used by ProjectDisplay.tsx and geminiService.ts.
//   - ProjectIdea: projectTitle, projectAcronym, mainAim, stateOfTheArt,
//     proposedSolution, startDate, durationMonths, policies, readinessLevels
//   - ProblemAnalysis.coreProblem: { title, description } object (not string)
//   - ObjectiveItem: { title, description, indicator } (matches UI)
//   - ResultItem: { title, description, indicator } (matches UI)
//   - RiskItem: added 'title' field (matches UI + AI schema)
//   - KERItem: simplified to match UI (id, title, description, exploitationStrategy)
//   - TaskDependency: predecessorId (not taskId) to match AI schema
//   - ReadinessLevels: { TRL, SRL, ORL, LRL } with { level, justification }
//   - Previous v4.3 'environmental' RiskCategory preserved
// ═══════════════════════════════════════════════════════════════

// ─── Problem Analysis ────────────────────────────────────────
export interface ProblemNode {
  id?: string;
  title: string;
  description: string;
}

export interface CoreProblem {
  title: string;
  description: string;
}

export interface PolicyItem {
  id?: string;
  name: string;
  description: string;
}

export interface ObjectiveItem {
  id?: string;
  title: string;
  description: string;
  indicator: string;
}

// ─── Readiness Levels ────────────────────────────────────────
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

// ─── Tasks & Work Packages ───────────────────────────────────
export interface TaskDependency {
  predecessorId: string;
  type: 'FS' | 'SS' | 'FF' | 'SF';
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
  title: string;
  description: string;
  indicator: string;
}

export interface WorkPackage {
  id: string;
  title: string;
  startDate?: string;
  endDate?: string;
  tasks: Task[];
  milestones: Milestone[];
  deliverables: Deliverable[];
}

// ─── Risk Management ─────────────────────────────────────────
export type RiskCategory = 'technical' | 'social' | 'economic' | 'environmental';
export type RiskLikelihood = 'low' | 'medium' | 'high';
export type RiskImpact = 'low' | 'medium' | 'high';

export interface RiskItem {
  id: string;
  category: RiskCategory;
  title: string;
  description: string;
  likelihood: RiskLikelihood;
  impact: RiskImpact;
  mitigation: string;
}

// ─── KER (Key Exploitable Results) ──────────────────────────
export interface KERItem {
  id: string;
  title: string;
  description: string;
  exploitationStrategy: string;
}

// ─── Result Items (outputs, outcomes, impacts) ───────────────
export interface ResultItem {
  id?: string;
  title: string;
  description: string;
  indicator: string;
}

// ─── Project Management ──────────────────────────────────────
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

// ─── Project Sections ────────────────────────────────────────
export interface ProblemAnalysis {
  coreProblem: CoreProblem;
  causes: ProblemNode[];
  consequences: ProblemNode[];
}

export interface ProjectIdea {
  projectTitle: string;
  projectAcronym: string;
  mainAim: string;
  stateOfTheArt: string;
  proposedSolution: string;
  startDate?: string;
  durationMonths?: number;
  policies: PolicyItem[];
  readinessLevels: ReadinessLevels;
}

export interface ProjectData {
  problemAnalysis: ProblemAnalysis;
  projectIdea: ProjectIdea;
  generalObjectives: ObjectiveItem[];
  specificObjectives: ObjectiveItem[];
  activities: WorkPackage[];
  projectManagement: ProjectManagement;
  risks: RiskItem[];
  outputs: ResultItem[];
  outcomes: ResultItem[];
  impacts: ResultItem[];
  kers: KERItem[];
}

// ─── App State Types ─────────────────────────────────────────
export type Language = 'en' | 'si';
export type ViewMode = 'standard' | 'academic';

export interface ProjectVersions {
  [versionId: string]: {
    data: ProjectData;
    timestamp: number;
    label: string;
  };
}

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  language: Language;
  mode: ViewMode;
  currentVersionId: string;
  versions: ProjectVersions;
}

export interface ModalConfig {
  isOpen: boolean;
  title: string;
  message: string;
  options?: { label: string; value: string; description?: string }[];
  onConfirm: (value?: string) => void;
  onCancel: () => void;
}

// ─── Export Data ─────────────────────────────────────────────
export interface ExportData {
  projectMeta: ProjectMeta;
  projectData: ProjectData;
  exportDate: string;
  appVersion: string;
}

// ─── Chart Image Data ────────────────────────────────────────
export interface ChartImageData {
  gantt?: string;
  pert?: string;
  organigram?: string;
}

// ─── Auth ────────────────────────────────────────────────────
export interface UserRecord {
  id: string;
  email: string;
  name: string;
  createdAt: number;
}

export interface AuthResult {
  success: boolean;
  user?: UserRecord;
  error?: string;
}

// ─── Instruction Types ───────────────────────────────────────
export interface InstructionSet {
  global: string;
  language: string;
  academic: string;
  humanization: string;
  projectTitle: string;
  mode: string;
  qualityGates: string;
  sectionTask: string;
  fieldRules: string;
  translation: string;
  summary: string;
  chapter: string;
}

// ─── Gantt / PERT Internal ───────────────────────────────────
export interface GanttTask {
  id: string;
  wpId: string;
  title: string;
  startDate: Date;
  endDate: Date;
  duration: number;
  dependencies: TaskDependency[];
  progress: number;
  isWpSummary?: boolean;
  isMilestone?: boolean;
  milestoneDate?: Date;
}

export interface PertNode {
  id: string;
  title: string;
  es: number;
  ef: number;
  ls: number;
  lf: number;
  slack: number;
  isCritical: boolean;
  dependencies: string[];
  x?: number;
  y?: number;
}

// ─── Readiness Level Definitions ─────────────────────────────
export interface ReadinessLevelDefinition {
  key: string;
  name: string;
  description: string;
  levels: { value: number; title: { en: string; si: string } }[];
}

// ─── Step Navigation ─────────────────────────────────────────
export interface StepDefinition {
  id: number;
  key: string;
  title: { en: string; si: string };
  color: string;
}

export interface SubStepDefinition {
  id: string;
  key: string;
  title: { en: string; si: string };
}

// ─── Admin Types ─────────────────────────────────────────────
export type UserRole = 'admin' | 'user';

export interface AdminUserProfile {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
  lastSignIn: string | null;
}

export interface AdminLogEntry {
  id: string;
  adminId: string;
  adminEmail?: string;
  action: 'role_change' | 'instructions_update' | 'instructions_reset' | 'user_block';
  targetUserId: string | null;
  targetEmail?: string;
  details: Record<string, any>;
  createdAt: string;
}

// ─── Empirical Data Visualization Types ──────────────────────
export type ChartType =
  | 'comparison_bar'
  | 'donut'
  | 'line'
  | 'radar'
  | 'heatmap'
  | 'gauge'
  | 'stacked_bar'
  | 'progress'
  | 'sankey';

export interface ExtractedDataPoint {
  label: string;
  value: number;
  unit: string;
  category?: string;
  date?: string;
}

export interface ExtractedChartData {
  id: string;
  chartType: ChartType;
  title: string;
  source?: string;
  dataPoints: ExtractedDataPoint[];
  insight?: string;
  sectionKey: string;
  fieldPath: string;
}

export interface ProjectVisualizationData {
  charts: ExtractedChartData[];
  lastExtracted: string;
}
