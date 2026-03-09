import { z } from "zod";

import type { JobError, RecoveryInfo } from "./jobs";
import type { BrandKit } from "./brand-kits";

export const WORKFLOW_RUN_STATUSES = [
  "queued",
  "planning",
  "running",
  "waiting-approval",
  "completed",
  "failed",
  "cancelled"
] as const;
export const WORKFLOW_STEP_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
  "skipped",
  "waiting-approval",
  "cancelled"
] as const;
export const WORKFLOW_STEP_KINDS = [
  "transcribeClip",
  "generateCaptionTrack",
  "applyBrandKit",
  "exportSubtitles",
  "startExport",
  "analyzeSilence",
  "findFillerWords",
  "generateHighlights",
  "compileSmartPlan",
  "applySuggestionSet",
  "createRegionsFromSuggestions",
  "compileCandidatePackages",
  "compileTranscriptRangeSelection",
  "exportCandidatePackage",
  "captureExportSnapshot",
  "approvalCheckpoint"
] as const;
export const WORKFLOW_ARTIFACT_KINDS = [
  "transcript",
  "caption-track",
  "subtitle",
  "export",
  "suggestion-set",
  "edit-plan",
  "snapshot",
  "regions",
  "diagnostic",
  "candidate-package",
  "candidate-export",
  "brand-asset",
  "schedule-report",
  "transcript-range-selection"
] as const;
export const WORKFLOW_APPROVAL_STATUSES = ["pending", "approved", "rejected"] as const;
export const WORKFLOW_BATCH_MODES = ["single", "clip-batch"] as const;
export const WORKFLOW_SAFETY_CLASSES = ["read-only", "mutating", "high-impact"] as const;
export const WORKFLOW_MUTABILITY_CLASSES = ["read", "write"] as const;
export const WORKFLOW_EXECUTION_MODES = ["sync", "job"] as const;
export const WORKFLOW_INPUT_FIELD_TYPES = [
  "string",
  "integer",
  "boolean",
  "string-array",
  "clip-id",
  "transcript-id",
  "caption-template-id",
  "brand-kit-id",
  "export-preset-id",
  "timeline-id",
  "file-path"
] as const;
export const WORKFLOW_PROFILE_APPROVAL_POLICIES = [
  "respect-template",
  "force-approval"
] as const;
export const WORKFLOW_SCHEDULE_APPROVAL_POLICIES = [
  "respect-profile",
  "force-approval"
] as const;
export const WORKFLOW_SCHEDULE_CONCURRENCY_POLICIES = [
  "skip-if-running",
  "queue"
] as const;
export const WORKFLOW_SCHEDULE_TRIGGER_KINDS = ["interval"] as const;
export const WORKFLOW_TARGET_RESOLVER_KINDS = [
  "use-profile-defaults",
  "static-clip-ids",
  "all-video-clips"
] as const;
export const WORKFLOW_CANDIDATE_REVIEW_STATUSES = [
  "new",
  "shortlisted",
  "approved",
  "rejected",
  "exported"
] as const;
export const WORKFLOW_AUDIT_EVENT_KINDS = [
  "run-created",
  "run-status",
  "step-status",
  "approval",
  "artifact",
  "candidate-review",
  "schedule"
] as const;
export const WORKFLOW_AUDIT_EVENT_SEVERITIES = ["info", "warning", "error"] as const;

export type WorkflowRunStatus = (typeof WORKFLOW_RUN_STATUSES)[number];
export type WorkflowStepStatus = (typeof WORKFLOW_STEP_STATUSES)[number];
export type WorkflowStepKind = (typeof WORKFLOW_STEP_KINDS)[number];
export type WorkflowArtifactKind = (typeof WORKFLOW_ARTIFACT_KINDS)[number];
export type WorkflowApprovalStatus = (typeof WORKFLOW_APPROVAL_STATUSES)[number];
export type WorkflowBatchMode = (typeof WORKFLOW_BATCH_MODES)[number];
export type WorkflowSafetyClass = (typeof WORKFLOW_SAFETY_CLASSES)[number];
export type WorkflowMutabilityClass = (typeof WORKFLOW_MUTABILITY_CLASSES)[number];
export type WorkflowExecutionMode = (typeof WORKFLOW_EXECUTION_MODES)[number];
export type WorkflowInputFieldType = (typeof WORKFLOW_INPUT_FIELD_TYPES)[number];
export type WorkflowProfileApprovalPolicy =
  (typeof WORKFLOW_PROFILE_APPROVAL_POLICIES)[number];
export type WorkflowScheduleApprovalPolicy =
  (typeof WORKFLOW_SCHEDULE_APPROVAL_POLICIES)[number];
export type WorkflowScheduleConcurrencyPolicy =
  (typeof WORKFLOW_SCHEDULE_CONCURRENCY_POLICIES)[number];
export type WorkflowScheduleTriggerKind =
  (typeof WORKFLOW_SCHEDULE_TRIGGER_KINDS)[number];
export type WorkflowTargetResolverKind =
  (typeof WORKFLOW_TARGET_RESOLVER_KINDS)[number];
export type WorkflowCandidateReviewStatus =
  (typeof WORKFLOW_CANDIDATE_REVIEW_STATUSES)[number];
export type WorkflowAuditEventKind =
  (typeof WORKFLOW_AUDIT_EVENT_KINDS)[number];
export type WorkflowAuditEventSeverity =
  (typeof WORKFLOW_AUDIT_EVENT_SEVERITIES)[number];

export type WorkflowTemplateId =
  | "captioned-export-v1"
  | "smart-cleanup-v1"
  | "short-clip-candidates-v1"
  | "batch-caption-export-v1"
  | "social-candidate-package-v1"
  | "transcript-range-package-v1";

export interface WorkflowCompatibility {
  templateId: WorkflowTemplateId;
  templateVersion: number;
}

export interface WorkflowProfile {
  id: string;
  version: number;
  name: string;
  description: string;
  templateId: WorkflowTemplateId;
  defaultInputs: Record<string, unknown>;
  approvalPolicy: WorkflowProfileApprovalPolicy;
  defaultBrandKitId: string | null;
  defaultExportPresetId: string | null;
  enabledOptionalSteps: string[];
  compatibility: WorkflowCompatibility;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowTargetResolver {
  kind: WorkflowTargetResolverKind;
  clipIds?: string[];
}

export interface WorkflowScheduleTrigger {
  kind: WorkflowScheduleTriggerKind;
  intervalMinutes: number;
}

export interface WorkflowSchedule {
  id: string;
  version: number;
  name: string;
  enabled: boolean;
  workflowProfileId: string;
  projectPath: string;
  targetResolver: WorkflowTargetResolver;
  trigger: WorkflowScheduleTrigger;
  approvalPolicy: WorkflowScheduleApprovalPolicy;
  concurrencyPolicy: WorkflowScheduleConcurrencyPolicy;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastRunStatus: WorkflowRunStatus | "skipped" | "scheduled" | null;
  lastWorkflowRunId: string | null;
  lastError: JobError | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowCandidatePackage {
  id: string;
  workflowRunId: string;
  sourceKind: "highlight" | "transcript-range";
  title: string;
  timelineId: string;
  transcriptId: string | null;
  startUs: number;
  endUs: number;
  label: string;
  sourceSuggestionSetId: string | null;
  sourceSuggestionId: string | null;
  regionId: string | null;
  exportRunId: string | null;
  snapshotArtifactIds: string[];
  reviewStatus: WorkflowCandidateReviewStatus;
  reviewNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface WorkflowAuditEvent {
  id: string;
  workflowRunId: string | null;
  stepRunId: string | null;
  batchItemRunId: string | null;
  candidatePackageId: string | null;
  kind: WorkflowAuditEventKind;
  severity: WorkflowAuditEventSeverity;
  message: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface WorkflowInputField {
  id: string;
  label: string;
  description: string;
  type: WorkflowInputFieldType;
  required: boolean;
  defaultValue?: unknown;
  options?: Array<{
    value: string;
    label: string;
    description?: string;
  }>;
}

export interface WorkflowInputSchema {
  fields: WorkflowInputField[];
}

export interface WorkflowStepDefinition {
  id: string;
  kind: WorkflowStepKind;
  name: string;
  description: string;
  dependsOn: string[];
  safetyClass: WorkflowSafetyClass;
  mutability: WorkflowMutabilityClass;
  execution: WorkflowExecutionMode;
  requiresApproval: boolean;
  runIf?: {
    inputKey: string;
    truthy?: boolean;
    equals?: string | boolean;
  };
}

export interface WorkflowSafetyProfile {
  highestSafetyClass: WorkflowSafetyClass;
  hasMutatingSteps: boolean;
  hasHighImpactSteps: boolean;
  requiresApproval: boolean;
}

export interface WorkflowTemplate {
  id: WorkflowTemplateId;
  name: string;
  description: string;
  version: number;
  batchMode: WorkflowBatchMode;
  inputSchema: WorkflowInputSchema;
  steps: WorkflowStepDefinition[];
  expectedOutputs: WorkflowArtifactKind[];
  safetyProfile: WorkflowSafetyProfile;
}

export interface WorkflowStepRun {
  id: string;
  workflowRunId: string;
  batchItemRunId: string | null;
  definitionId: string;
  kind: WorkflowStepKind;
  name: string;
  status: WorkflowStepStatus;
  safetyClass: WorkflowSafetyClass;
  mutability: WorkflowMutabilityClass;
  execution: WorkflowExecutionMode;
  requiresApproval: boolean;
  childJobId: string | null;
  warnings: string[];
  outputSummary: Record<string, unknown>;
  error: JobError | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface WorkflowBatchItemRun {
  id: string;
  workflowRunId: string;
  targetClipId: string;
  label: string;
  status: WorkflowStepStatus;
  warnings: string[];
  outputSummary: Record<string, unknown>;
  error: JobError | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface WorkflowApproval {
  id: string;
  workflowRunId: string;
  stepRunId: string;
  batchItemRunId: string | null;
  status: WorkflowApprovalStatus;
  reason: string;
  summary: string;
  proposedEffects: string[];
  artifactIds: string[];
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface WorkflowArtifact {
  id: string;
  workflowRunId: string;
  stepRunId: string | null;
  batchItemRunId: string | null;
  kind: WorkflowArtifactKind;
  label: string;
  path: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface WorkflowRunSummary {
  completedStepCount: number;
  totalStepCount: number;
  completedBatchItemCount: number;
  totalBatchItemCount: number;
  failedBatchItemCount: number;
  waitingApprovalCount: number;
}

export interface WorkflowRun {
  id: string;
  templateId: WorkflowTemplateId;
  templateVersion: number;
  projectDirectory: string;
  profileId: string | null;
  scheduleId: string | null;
  status: WorkflowRunStatus;
  parentJobId: string;
  input: Record<string, unknown>;
  safetyProfile: WorkflowSafetyProfile;
  warnings: string[];
  error: JobError | null;
  recovery: RecoveryInfo;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  steps: WorkflowStepRun[];
  batchItems: WorkflowBatchItemRun[];
  approvals: WorkflowApproval[];
  artifacts: WorkflowArtifact[];
  summary: WorkflowRunSummary;
}

export interface WorkflowSessionSnapshot {
  directory: string;
  projectName: string;
  workflows: WorkflowTemplate[];
  brandKits: BrandKit[];
  workflowProfiles: WorkflowProfile[];
  schedules: WorkflowSchedule[];
  workflowRuns: WorkflowRun[];
  candidatePackages: WorkflowCandidatePackage[];
  auditEvents: WorkflowAuditEvent[];
  pendingApprovals: WorkflowApproval[];
  activeWorkflowJobId: string | null;
  lastError: JobError | null;
}

export type WorkflowCommandType =
  | "StartWorkflow"
  | "StartBatchWorkflow"
  | "RunWorkflowProfile"
  | "CancelWorkflowRun"
  | "ResumeWorkflowRun"
  | "RetryWorkflowStep"
  | "ApproveWorkflowStep"
  | "RejectWorkflowStep"
  | "CreateBrandKit"
  | "UpdateBrandKit"
  | "SetDefaultBrandKit"
  | "CreateWorkflowProfile"
  | "UpdateWorkflowProfile"
  | "DeleteWorkflowProfile"
  | "CreateWorkflowSchedule"
  | "UpdateWorkflowSchedule"
  | "PauseWorkflowSchedule"
  | "ResumeWorkflowSchedule"
  | "DeleteWorkflowSchedule"
  | "ReviewWorkflowCandidatePackage"
  | "ExportCandidatePackage";

export interface StartWorkflowCommand {
  type: "StartWorkflow";
  templateId: WorkflowTemplateId;
  input: Record<string, unknown>;
}

export interface StartBatchWorkflowCommand {
  type: "StartBatchWorkflow";
  templateId: Extract<WorkflowTemplateId, "batch-caption-export-v1">;
  input: Record<string, unknown>;
}

export interface RunWorkflowProfileCommand {
  type: "RunWorkflowProfile";
  profileId: string;
  inputOverrides?: Record<string, unknown>;
  invocation?: {
    kind: "manual" | "schedule";
    scheduleId?: string | null;
  };
}

export interface CancelWorkflowRunCommand {
  type: "CancelWorkflowRun";
  workflowRunId: string;
}

export interface ResumeWorkflowRunCommand {
  type: "ResumeWorkflowRun";
  workflowRunId: string;
}

export interface RetryWorkflowStepCommand {
  type: "RetryWorkflowStep";
  workflowRunId: string;
  stepRunId: string;
}

export interface ApproveWorkflowStepCommand {
  type: "ApproveWorkflowStep";
  workflowRunId: string;
  approvalId: string;
}

export interface RejectWorkflowStepCommand {
  type: "RejectWorkflowStep";
  workflowRunId: string;
  approvalId: string;
}

export interface CreateBrandKitCommand {
  type: "CreateBrandKit";
  brandKit: BrandKit;
}

export interface UpdateBrandKitCommand {
  type: "UpdateBrandKit";
  brandKitId: string;
  brandKit: BrandKit;
}

export interface SetDefaultBrandKitCommand {
  type: "SetDefaultBrandKit";
  brandKitId: string | null;
}

export interface CreateWorkflowProfileCommand {
  type: "CreateWorkflowProfile";
  profile: WorkflowProfile;
}

export interface UpdateWorkflowProfileCommand {
  type: "UpdateWorkflowProfile";
  profileId: string;
  profile: WorkflowProfile;
}

export interface DeleteWorkflowProfileCommand {
  type: "DeleteWorkflowProfile";
  profileId: string;
}

export interface CreateWorkflowScheduleCommand {
  type: "CreateWorkflowSchedule";
  schedule: WorkflowSchedule;
}

export interface UpdateWorkflowScheduleCommand {
  type: "UpdateWorkflowSchedule";
  scheduleId: string;
  schedule: WorkflowSchedule;
}

export interface PauseWorkflowScheduleCommand {
  type: "PauseWorkflowSchedule";
  scheduleId: string;
}

export interface ResumeWorkflowScheduleCommand {
  type: "ResumeWorkflowSchedule";
  scheduleId: string;
}

export interface DeleteWorkflowScheduleCommand {
  type: "DeleteWorkflowSchedule";
  scheduleId: string;
}

export interface ReviewWorkflowCandidatePackageCommand {
  type: "ReviewWorkflowCandidatePackage";
  candidatePackageId: string;
  reviewStatus: WorkflowCandidateReviewStatus;
  reviewNotes?: string | null;
}

export interface ExportCandidatePackageCommand {
  type: "ExportCandidatePackage";
  candidatePackageId: string;
  presetId?: string | null;
}

export type WorkflowCommand =
  | StartWorkflowCommand
  | StartBatchWorkflowCommand
  | RunWorkflowProfileCommand
  | CancelWorkflowRunCommand
  | ResumeWorkflowRunCommand
  | RetryWorkflowStepCommand
  | ApproveWorkflowStepCommand
  | RejectWorkflowStepCommand
  | CreateBrandKitCommand
  | UpdateBrandKitCommand
  | SetDefaultBrandKitCommand
  | CreateWorkflowProfileCommand
  | UpdateWorkflowProfileCommand
  | DeleteWorkflowProfileCommand
  | CreateWorkflowScheduleCommand
  | UpdateWorkflowScheduleCommand
  | PauseWorkflowScheduleCommand
  | ResumeWorkflowScheduleCommand
  | DeleteWorkflowScheduleCommand
  | ReviewWorkflowCandidatePackageCommand
  | ExportCandidatePackageCommand;

export interface WorkflowCommandError {
  code:
    | "WORKFLOW_NOT_FOUND"
    | "WORKFLOW_PROFILE_NOT_FOUND"
    | "WORKFLOW_SCHEDULE_NOT_FOUND"
    | "WORKFLOW_RUN_NOT_FOUND"
    | "WORKFLOW_STEP_NOT_FOUND"
    | "WORKFLOW_APPROVAL_NOT_FOUND"
    | "WORKFLOW_CANDIDATE_PACKAGE_NOT_FOUND"
    | "WORKFLOW_INVALID_INPUT"
    | "WORKFLOW_NOT_RESUMABLE"
    | "WORKFLOW_NOT_RETRYABLE"
    | "WORKFLOW_ALREADY_RUNNING"
    | "BRAND_KIT_NOT_FOUND"
    | "BRAND_KIT_INVALID"
    | "WORKFLOW_FAILED";
  message: string;
  details?: string;
}

export interface WorkflowCommandFailure {
  ok: false;
  commandType: WorkflowCommandType;
  error: WorkflowCommandError;
}

export interface StartWorkflowResult {
  ok: true;
  commandType: "StartWorkflow";
  workflowRun: WorkflowRun;
  queued: boolean;
}

export interface StartBatchWorkflowResult {
  ok: true;
  commandType: "StartBatchWorkflow";
  workflowRun: WorkflowRun;
  queued: boolean;
}

export interface RunWorkflowProfileResult {
  ok: true;
  commandType: "RunWorkflowProfile";
  profile: WorkflowProfile;
  workflowRun: WorkflowRun;
  queued: boolean;
}

export interface WorkflowRunMutationResult {
  ok: true;
  commandType:
    | "CancelWorkflowRun"
    | "ResumeWorkflowRun"
    | "RetryWorkflowStep"
    | "ApproveWorkflowStep"
    | "RejectWorkflowStep";
  workflowRun: WorkflowRun;
}

export interface BrandKitMutationResult {
  ok: true;
  commandType: "CreateBrandKit" | "UpdateBrandKit" | "SetDefaultBrandKit";
  brandKitId: string | null;
}

export interface WorkflowProfileMutationResult {
  ok: true;
  commandType:
    | "CreateWorkflowProfile"
    | "UpdateWorkflowProfile"
    | "DeleteWorkflowProfile";
  profileId: string | null;
}

export interface WorkflowScheduleMutationResult {
  ok: true;
  commandType:
    | "CreateWorkflowSchedule"
    | "UpdateWorkflowSchedule"
    | "PauseWorkflowSchedule"
    | "ResumeWorkflowSchedule"
    | "DeleteWorkflowSchedule";
  scheduleId: string | null;
}

export interface ReviewWorkflowCandidatePackageResult {
  ok: true;
  commandType: "ReviewWorkflowCandidatePackage";
  candidatePackage: WorkflowCandidatePackage;
}

export interface ExportCandidatePackageResult {
  ok: true;
  commandType: "ExportCandidatePackage";
  candidatePackage: WorkflowCandidatePackage;
  exportRunId: string;
}

export type WorkflowCommandResult =
  | WorkflowCommandFailure
  | StartWorkflowResult
  | StartBatchWorkflowResult
  | RunWorkflowProfileResult
  | WorkflowRunMutationResult
  | BrandKitMutationResult
  | WorkflowProfileMutationResult
  | WorkflowScheduleMutationResult
  | ReviewWorkflowCandidatePackageResult
  | ExportCandidatePackageResult;

export const workflowProfileSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  name: z.string().min(1),
  description: z.string(),
  templateId: z.enum([
    "captioned-export-v1",
    "smart-cleanup-v1",
    "short-clip-candidates-v1",
    "batch-caption-export-v1",
    "social-candidate-package-v1",
    "transcript-range-package-v1"
  ]),
  defaultInputs: z.record(z.unknown()),
  approvalPolicy: z.enum(WORKFLOW_PROFILE_APPROVAL_POLICIES),
  defaultBrandKitId: z.string().min(1).nullable(),
  defaultExportPresetId: z.string().min(1).nullable(),
  enabledOptionalSteps: z.array(z.string().min(1)),
  compatibility: z.object({
    templateId: z.enum([
      "captioned-export-v1",
      "smart-cleanup-v1",
      "short-clip-candidates-v1",
      "batch-caption-export-v1",
      "social-candidate-package-v1",
      "transcript-range-package-v1"
    ]),
    templateVersion: z.number().int().positive()
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const workflowScheduleSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  name: z.string().min(1),
  enabled: z.boolean(),
  workflowProfileId: z.string().min(1),
  projectPath: z.string().min(1),
  targetResolver: z.object({
    kind: z.enum(WORKFLOW_TARGET_RESOLVER_KINDS),
    clipIds: z.array(z.string().min(1)).optional()
  }),
  trigger: z.object({
    kind: z.enum(WORKFLOW_SCHEDULE_TRIGGER_KINDS),
    intervalMinutes: z.number().int().positive()
  }),
  approvalPolicy: z.enum(WORKFLOW_SCHEDULE_APPROVAL_POLICIES),
  concurrencyPolicy: z.enum(WORKFLOW_SCHEDULE_CONCURRENCY_POLICIES),
  lastRunAt: z.string().datetime().nullable(),
  nextRunAt: z.string().datetime().nullable(),
  lastRunStatus: z
    .union([
      z.enum(WORKFLOW_RUN_STATUSES),
      z.literal("skipped"),
      z.literal("scheduled")
    ])
    .nullable(),
  lastWorkflowRunId: z.string().min(1).nullable(),
  lastError: z
    .object({
      code: z.string().min(1),
      message: z.string().min(1),
      details: z.string().optional()
    })
    .nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const workflowCandidatePackageSchema = z.object({
  id: z.string().min(1),
  workflowRunId: z.string().min(1),
  sourceKind: z.enum(["highlight", "transcript-range"]),
  title: z.string().min(1),
  timelineId: z.string().min(1),
  transcriptId: z.string().min(1).nullable(),
  startUs: z.number().int().nonnegative(),
  endUs: z.number().int().positive(),
  label: z.string().min(1),
  sourceSuggestionSetId: z.string().min(1).nullable(),
  sourceSuggestionId: z.string().min(1).nullable(),
  regionId: z.string().min(1).nullable(),
  exportRunId: z.string().min(1).nullable(),
  snapshotArtifactIds: z.array(z.string().min(1)),
  reviewStatus: z.enum(WORKFLOW_CANDIDATE_REVIEW_STATUSES).default("new"),
  reviewNotes: z.string().nullable().default(null),
  reviewedAt: z.string().datetime().nullable().default(null),
  createdAt: z.string().datetime()
});

export const workflowAuditEventSchema = z.object({
  id: z.string().min(1),
  workflowRunId: z.string().min(1).nullable(),
  stepRunId: z.string().min(1).nullable(),
  batchItemRunId: z.string().min(1).nullable(),
  candidatePackageId: z.string().min(1).nullable(),
  kind: z.enum(WORKFLOW_AUDIT_EVENT_KINDS),
  severity: z.enum(WORKFLOW_AUDIT_EVENT_SEVERITIES),
  message: z.string().min(1),
  details: z.record(z.unknown()),
  createdAt: z.string().datetime()
});

const workflowInputFieldSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
  type: z.enum(WORKFLOW_INPUT_FIELD_TYPES),
  required: z.boolean(),
  defaultValue: z.unknown().optional(),
  options: z
    .array(
      z.object({
        value: z.string().min(1),
        label: z.string().min(1),
        description: z.string().optional()
      })
    )
    .optional()
});

export const workflowTemplateSchema = z.object({
  id: z.enum([
    "captioned-export-v1",
    "smart-cleanup-v1",
    "short-clip-candidates-v1",
    "batch-caption-export-v1",
    "social-candidate-package-v1",
    "transcript-range-package-v1"
  ]),
  name: z.string().min(1),
  description: z.string().min(1),
  version: z.number().int().positive(),
  batchMode: z.enum(WORKFLOW_BATCH_MODES),
  inputSchema: z.object({
    fields: z.array(workflowInputFieldSchema)
  }),
  steps: z.array(
    z.object({
      id: z.string().min(1),
      kind: z.enum(WORKFLOW_STEP_KINDS),
      name: z.string().min(1),
      description: z.string().min(1),
      dependsOn: z.array(z.string().min(1)),
      safetyClass: z.enum(WORKFLOW_SAFETY_CLASSES),
      mutability: z.enum(WORKFLOW_MUTABILITY_CLASSES),
      execution: z.enum(WORKFLOW_EXECUTION_MODES),
      requiresApproval: z.boolean(),
      runIf: z
        .object({
          inputKey: z.string().min(1),
          truthy: z.boolean().optional(),
          equals: z.union([z.string(), z.boolean()]).optional()
        })
        .optional()
    })
  ),
  expectedOutputs: z.array(z.enum(WORKFLOW_ARTIFACT_KINDS)),
  safetyProfile: z.object({
    highestSafetyClass: z.enum(WORKFLOW_SAFETY_CLASSES),
    hasMutatingSteps: z.boolean(),
    hasHighImpactSteps: z.boolean(),
    requiresApproval: z.boolean()
  })
});

function createSafetyProfile(steps: WorkflowStepDefinition[]): WorkflowSafetyProfile {
  const hasHighImpactSteps = steps.some((step) => step.safetyClass === "high-impact");
  const hasMutatingSteps =
    hasHighImpactSteps || steps.some((step) => step.safetyClass === "mutating");

  return {
    highestSafetyClass: hasHighImpactSteps
      ? "high-impact"
      : hasMutatingSteps
        ? "mutating"
        : "read-only",
    hasMutatingSteps,
    hasHighImpactSteps,
    requiresApproval: steps.some((step) => step.requiresApproval)
  };
}

function withSafetyProfile(
  template: Omit<WorkflowTemplate, "safetyProfile">
): WorkflowTemplate {
  return {
    ...template,
    safetyProfile: createSafetyProfile(template.steps)
  };
}

const BUILT_IN_WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  withSafetyProfile({
    id: "captioned-export-v1",
    name: "Captioned Export",
    description: "Transcribe a clip, generate captions, apply a brand kit, and export reviewable output.",
    version: 1,
    batchMode: "single",
    inputSchema: {
      fields: [
        { id: "clipId", label: "Clip", description: "Target clip to process.", type: "clip-id", required: true },
        {
          id: "brandKitId",
          label: "Brand Kit",
          description: "Optional brand kit to apply to generated captions.",
          type: "brand-kit-id",
          required: false
        },
        {
          id: "exportPresetId",
          label: "Export Preset",
          description: "Optional export preset override.",
          type: "export-preset-id",
          required: false
        },
        {
          id: "exportSubtitles",
          label: "Export Subtitles",
          description: "Also export a sidecar subtitle file.",
          type: "boolean",
          required: false,
          defaultValue: true
        },
        {
          id: "enableBurnIn",
          label: "Burn In Captions",
          description: "Enable caption burn-in for the exported video.",
          type: "boolean",
          required: false,
          defaultValue: true
        },
        {
          id: "requireApprovalForExport",
          label: "Require Approval Before Export",
          description: "Pause before the final export step.",
          type: "boolean",
          required: false,
          defaultValue: true
        }
      ]
    },
    steps: [
      {
        id: "transcribe",
        kind: "transcribeClip",
        name: "Transcribe clip",
        description: "Generate a transcript for the selected clip.",
        dependsOn: [],
        safetyClass: "high-impact",
        mutability: "write",
        execution: "job",
        requiresApproval: false
      },
      {
        id: "generate-captions",
        kind: "generateCaptionTrack",
        name: "Generate caption track",
        description: "Create a caption track from the transcript.",
        dependsOn: ["transcribe"],
        safetyClass: "mutating",
        mutability: "write",
        execution: "sync",
        requiresApproval: false
      },
      {
        id: "apply-brand-kit",
        kind: "applyBrandKit",
        name: "Apply brand kit",
        description: "Apply the selected brand kit to the generated caption track.",
        dependsOn: ["generate-captions"],
        safetyClass: "mutating",
        mutability: "write",
        execution: "sync",
        requiresApproval: false,
        runIf: {
          inputKey: "brandKitId",
          truthy: true
        }
      },
      {
        id: "export-subtitles",
        kind: "exportSubtitles",
        name: "Export sidecar subtitles",
        description: "Write sidecar subtitle output for review workflows.",
        dependsOn: ["generate-captions"],
        safetyClass: "high-impact",
        mutability: "write",
        execution: "sync",
        requiresApproval: false,
        runIf: {
          inputKey: "exportSubtitles",
          truthy: true
        }
      },
      {
        id: "approval-before-export",
        kind: "approvalCheckpoint",
        name: "Approval before export",
        description: "Require confirmation before starting the export job.",
        dependsOn: ["generate-captions"],
        safetyClass: "high-impact",
        mutability: "write",
        execution: "sync",
        requiresApproval: true,
        runIf: {
          inputKey: "requireApprovalForExport",
          truthy: true
        }
      },
      {
        id: "export",
        kind: "startExport",
        name: "Export media",
        description: "Start the final export using existing export infrastructure.",
        dependsOn: ["generate-captions"],
        safetyClass: "high-impact",
        mutability: "write",
        execution: "job",
        requiresApproval: false
      }
    ],
    expectedOutputs: ["transcript", "caption-track", "subtitle", "export"]
  }),
  withSafetyProfile({
    id: "smart-cleanup-v1",
    name: "Smart Cleanup",
    description: "Analyze silence and filler words, compile an edit plan, and apply it after approval.",
    version: 1,
    batchMode: "single",
    inputSchema: {
      fields: [
        { id: "clipId", label: "Clip", description: "Target clip to clean up.", type: "clip-id", required: true },
        {
          id: "primarySuggestionSource",
          label: "Primary Suggestion Source",
          description: "Choose which suggestion set should drive the edit plan.",
          type: "string",
          required: false,
          defaultValue: "silence",
          options: [
            { value: "silence", label: "Silence" },
            { value: "filler", label: "Filler words" }
          ]
        },
        {
          id: "requireApproval",
          label: "Require Approval",
          description: "Pause before applying the smart edit plan.",
          type: "boolean",
          required: false,
          defaultValue: true
        }
      ]
    },
    steps: [
      {
        id: "transcribe",
        kind: "transcribeClip",
        name: "Transcribe clip",
        description: "Generate transcript context for filler-word analysis if needed.",
        dependsOn: [],
        safetyClass: "high-impact",
        mutability: "write",
        execution: "job",
        requiresApproval: false
      },
      {
        id: "analyze-silence",
        kind: "analyzeSilence",
        name: "Analyze silence",
        description: "Detect removable silence and dead-air spans.",
        dependsOn: [],
        safetyClass: "read-only",
        mutability: "read",
        execution: "job",
        requiresApproval: false
      },
      {
        id: "find-filler-words",
        kind: "findFillerWords",
        name: "Find filler words",
        description: "Detect likely filler-word opportunities from the transcript.",
        dependsOn: ["transcribe"],
        safetyClass: "read-only",
        mutability: "read",
        execution: "job",
        requiresApproval: false
      },
      {
        id: "compile-plan",
        kind: "compileSmartPlan",
        name: "Compile edit plan",
        description: "Convert reviewed smart suggestions into an explicit edit plan.",
        dependsOn: ["analyze-silence", "find-filler-words"],
        safetyClass: "mutating",
        mutability: "write",
        execution: "sync",
        requiresApproval: false
      },
      {
        id: "approval-before-apply",
        kind: "approvalCheckpoint",
        name: "Approval before apply",
        description: "Require approval before applying the smart edit plan.",
        dependsOn: ["compile-plan"],
        safetyClass: "high-impact",
        mutability: "write",
        execution: "sync",
        requiresApproval: true,
        runIf: {
          inputKey: "requireApproval",
          truthy: true
        }
      },
      {
        id: "apply-suggestions",
        kind: "applySuggestionSet",
        name: "Apply suggestions",
        description: "Apply the selected smart-edit suggestion set.",
        dependsOn: ["compile-plan"],
        safetyClass: "high-impact",
        mutability: "write",
        execution: "sync",
        requiresApproval: false
      }
    ],
    expectedOutputs: ["suggestion-set", "edit-plan", "diagnostic"]
  }),
  withSafetyProfile({
    id: "short-clip-candidates-v1",
    name: "Short Clip Candidates",
    description: "Generate highlight suggestions and optionally turn them into timeline regions.",
    version: 1,
    batchMode: "single",
    inputSchema: {
      fields: [
        { id: "clipId", label: "Clip", description: "Target clip for highlight detection.", type: "clip-id", required: true },
        {
          id: "createRegions",
          label: "Create Regions",
          description: "Create timeline regions for suggested highlights.",
          type: "boolean",
          required: false,
          defaultValue: true
        },
        {
          id: "captureSnapshots",
          label: "Capture Snapshots",
          description: "Capture still frames for candidate review.",
          type: "boolean",
          required: false,
          defaultValue: false
        }
      ]
    },
    steps: [
      {
        id: "transcribe",
        kind: "transcribeClip",
        name: "Transcribe clip",
        description: "Generate transcript context for highlight analysis.",
        dependsOn: [],
        safetyClass: "high-impact",
        mutability: "write",
        execution: "job",
        requiresApproval: false
      },
      {
        id: "generate-highlights",
        kind: "generateHighlights",
        name: "Generate highlight suggestions",
        description: "Analyze transcript structure for short clip candidates.",
        dependsOn: ["transcribe"],
        safetyClass: "read-only",
        mutability: "read",
        execution: "job",
        requiresApproval: false
      },
      {
        id: "create-regions",
        kind: "createRegionsFromSuggestions",
        name: "Create timeline regions",
        description: "Create timeline regions from the highlight suggestions.",
        dependsOn: ["generate-highlights"],
        safetyClass: "mutating",
        mutability: "write",
        execution: "sync",
        requiresApproval: false,
        runIf: {
          inputKey: "createRegions",
          truthy: true
        }
      },
      {
        id: "capture-snapshots",
        kind: "captureExportSnapshot",
        name: "Capture review snapshots",
        description: "Capture still frames for candidate review.",
        dependsOn: ["generate-highlights"],
        safetyClass: "high-impact",
        mutability: "write",
        execution: "sync",
        requiresApproval: false,
        runIf: {
          inputKey: "captureSnapshots",
          truthy: true
        }
      }
    ],
    expectedOutputs: ["suggestion-set", "regions", "snapshot"]
  }),
  withSafetyProfile({
    id: "batch-caption-export-v1",
    name: "Batch Caption Export",
    description: "Run transcription, captions, brand application, and export across multiple clips in one project.",
    version: 1,
    batchMode: "clip-batch",
    inputSchema: {
      fields: [
        {
          id: "clipIds",
          label: "Clips",
          description: "Clip ids to process in the batch.",
          type: "string-array",
          required: true
        },
        {
          id: "brandKitId",
          label: "Brand Kit",
          description: "Optional brand kit for every generated caption track.",
          type: "brand-kit-id",
          required: false
        },
        {
          id: "exportPresetId",
          label: "Export Preset",
          description: "Optional export preset override for every clip export.",
          type: "export-preset-id",
          required: false
        },
        {
          id: "exportSubtitles",
          label: "Export Subtitles",
          description: "Write sidecar subtitles per item.",
          type: "boolean",
          required: false,
          defaultValue: true
        },
        {
          id: "exportVideo",
          label: "Export Video",
          description: "Render video per item.",
          type: "boolean",
          required: false,
          defaultValue: true
        }
      ]
    },
    steps: [
      {
        id: "transcribe",
        kind: "transcribeClip",
        name: "Transcribe clip",
        description: "Generate transcript per clip.",
        dependsOn: [],
        safetyClass: "high-impact",
        mutability: "write",
        execution: "job",
        requiresApproval: false
      },
      {
        id: "generate-captions",
        kind: "generateCaptionTrack",
        name: "Generate caption track",
        description: "Generate captions per clip transcript.",
        dependsOn: ["transcribe"],
        safetyClass: "mutating",
        mutability: "write",
        execution: "sync",
        requiresApproval: false
      },
      {
        id: "apply-brand-kit",
        kind: "applyBrandKit",
        name: "Apply brand kit",
        description: "Apply the selected brand kit to the clip caption track.",
        dependsOn: ["generate-captions"],
        safetyClass: "mutating",
        mutability: "write",
        execution: "sync",
        requiresApproval: false,
        runIf: {
          inputKey: "brandKitId",
          truthy: true
        }
      },
      {
        id: "export-subtitles",
        kind: "exportSubtitles",
        name: "Export sidecar subtitles",
        description: "Export subtitles per clip when enabled.",
        dependsOn: ["generate-captions"],
        safetyClass: "high-impact",
        mutability: "write",
        execution: "sync",
        requiresApproval: false,
        runIf: {
          inputKey: "exportSubtitles",
          truthy: true
        }
      },
      {
        id: "export-video",
        kind: "startExport",
        name: "Export clip video",
        description: "Export reviewable captioned outputs per clip.",
        dependsOn: ["generate-captions"],
        safetyClass: "high-impact",
        mutability: "write",
        execution: "job",
        requiresApproval: false,
        runIf: {
          inputKey: "exportVideo",
          truthy: true
        }
      }
    ],
    expectedOutputs: ["transcript", "caption-track", "subtitle", "export"]
  }),
  withSafetyProfile({
    id: "social-candidate-package-v1",
    name: "Social Candidate Package",
    description:
      "Generate highlight candidates, package them for review, and optionally capture snapshots and regions.",
    version: 1,
    batchMode: "single",
    inputSchema: {
      fields: [
        { id: "clipId", label: "Clip", description: "Target clip for candidate packaging.", type: "clip-id", required: true },
        {
          id: "createRegions",
          label: "Create Regions",
          description: "Create regions for candidate review.",
          type: "boolean",
          required: false,
          defaultValue: true
        },
        {
          id: "captureSnapshots",
          label: "Capture Snapshots",
          description: "Capture review frames for generated candidates.",
          type: "boolean",
          required: false,
          defaultValue: true
        }
      ]
    },
    steps: [
      {
        id: "transcribe",
        kind: "transcribeClip",
        name: "Transcribe clip",
        description: "Generate transcript context for candidate packaging.",
        dependsOn: [],
        safetyClass: "high-impact",
        mutability: "write",
        execution: "job",
        requiresApproval: false
      },
      {
        id: "generate-highlights",
        kind: "generateHighlights",
        name: "Generate highlight suggestions",
        description: "Generate highlight suggestions for review packaging.",
        dependsOn: ["transcribe"],
        safetyClass: "read-only",
        mutability: "read",
        execution: "job",
        requiresApproval: false
      },
      {
        id: "compile-candidate-packages",
        kind: "compileCandidatePackages",
        name: "Compile candidate packages",
        description: "Convert highlight suggestions into reusable review/export packages.",
        dependsOn: ["generate-highlights"],
        safetyClass: "read-only",
        mutability: "read",
        execution: "sync",
        requiresApproval: false
      },
      {
        id: "create-regions",
        kind: "createRegionsFromSuggestions",
        name: "Create timeline regions",
        description: "Create review regions for the candidate packages.",
        dependsOn: ["compile-candidate-packages"],
        safetyClass: "mutating",
        mutability: "write",
        execution: "sync",
        requiresApproval: false,
        runIf: {
          inputKey: "createRegions",
          truthy: true
        }
      },
      {
        id: "capture-snapshots",
        kind: "captureExportSnapshot",
        name: "Capture snapshots",
        description: "Capture visual review frames for candidate packages.",
        dependsOn: ["compile-candidate-packages"],
        safetyClass: "high-impact",
        mutability: "write",
        execution: "sync",
        requiresApproval: false,
        runIf: {
          inputKey: "captureSnapshots",
          truthy: true
        }
      }
    ],
    expectedOutputs: ["suggestion-set", "candidate-package", "regions", "snapshot"]
  }),
  withSafetyProfile({
    id: "transcript-range-package-v1",
    name: "Transcript Range Package",
    description:
      "Turn a transcript range into an explicit, reviewable package for region creation or bounded export.",
    version: 1,
    batchMode: "single",
    inputSchema: {
      fields: [
        {
          id: "transcriptId",
          label: "Transcript",
          description: "Transcript that defines the packaging range.",
          type: "transcript-id",
          required: true
        },
        {
          id: "startUs",
          label: "Start (us)",
          description: "Range start in microseconds.",
          type: "integer",
          required: true
        },
        {
          id: "endUs",
          label: "End (us)",
          description: "Range end in microseconds.",
          type: "integer",
          required: true
        },
        {
          id: "createRegion",
          label: "Create Region",
          description: "Create a timeline region from the selected transcript range.",
          type: "boolean",
          required: false,
          defaultValue: true
        },
        {
          id: "requireApproval",
          label: "Require Approval",
          description: "Pause before mutation or export.",
          type: "boolean",
          required: false,
          defaultValue: true
        }
      ]
    },
    steps: [
      {
        id: "compile-range-selection",
        kind: "compileTranscriptRangeSelection",
        name: "Compile transcript range selection",
        description: "Create a typed transcript-range selection record.",
        dependsOn: [],
        safetyClass: "read-only",
        mutability: "read",
        execution: "sync",
        requiresApproval: false
      },
      {
        id: "approval-before-range-mutation",
        kind: "approvalCheckpoint",
        name: "Approval before mutation",
        description: "Require approval before turning the range into timeline state.",
        dependsOn: ["compile-range-selection"],
        safetyClass: "high-impact",
        mutability: "write",
        execution: "sync",
        requiresApproval: true,
        runIf: {
          inputKey: "requireApproval",
          truthy: true
        }
      },
      {
        id: "export-range-candidate",
        kind: "compileCandidatePackages",
        name: "Create candidate package",
        description: "Create a reusable candidate package for the selected transcript range.",
        dependsOn: ["compile-range-selection"],
        safetyClass: "read-only",
        mutability: "read",
        execution: "sync",
        requiresApproval: false
      }
    ],
    expectedOutputs: ["transcript-range-selection", "candidate-package"]
  })
].map((template) => workflowTemplateSchema.parse(template));

export function getBuiltInWorkflowTemplates(): WorkflowTemplate[] {
  return BUILT_IN_WORKFLOW_TEMPLATES.map((template) => structuredClone(template));
}

export function resolveWorkflowTemplate(
  templateId: WorkflowTemplateId
): WorkflowTemplate | null {
  const template = BUILT_IN_WORKFLOW_TEMPLATES.find((entry) => entry.id === templateId);
  return template ? structuredClone(template) : null;
}

export function summarizeWorkflowRun(run: WorkflowRun): WorkflowRunSummary {
  return {
    completedStepCount: run.steps.filter((step) => step.status === "completed").length,
    totalStepCount: run.steps.length,
    completedBatchItemCount: run.batchItems.filter((item) => item.status === "completed").length,
    totalBatchItemCount: run.batchItems.length,
    failedBatchItemCount: run.batchItems.filter((item) => item.status === "failed").length,
    waitingApprovalCount: run.approvals.filter((approval) => approval.status === "pending").length
  };
}

export function createWorkflowSessionSnapshot(input: WorkflowSessionSnapshot): WorkflowSessionSnapshot {
  const candidatePackages = input.workflowRuns.flatMap((run) =>
    run.artifacts.flatMap((artifact) =>
      artifact.kind === "candidate-package"
        ? (() => {
            const parsed = workflowCandidatePackageSchema.safeParse({
              ...artifact.metadata,
              id: artifact.metadata.id ?? artifact.id,
              workflowRunId: run.id,
              createdAt: artifact.createdAt
            });

            return parsed.success ? [parsed.data] : [];
          })()
        : []
    )
  );

  return {
    ...input,
    candidatePackages,
    auditEvents: [...input.auditEvents].sort((left, right) =>
      left.createdAt < right.createdAt ? 1 : left.createdAt > right.createdAt ? -1 : 0
    ),
    workflowRuns: input.workflowRuns.map((run) => ({
      ...run,
      summary: summarizeWorkflowRun(run)
    }))
  };
}
