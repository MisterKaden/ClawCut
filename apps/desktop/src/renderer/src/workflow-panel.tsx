import { useEffect, useMemo, useState } from "react";

import type {
  BrandKit,
  CaptionTemplateId,
  ExportPresetId,
  WorkflowAuditEvent,
  WorkflowArtifact,
  WorkflowBatchItemRun,
  WorkflowCandidatePackage,
  WorkflowCandidateReviewStatus,
  WorkflowProfile,
  WorkflowRun,
  WorkflowSchedule,
  WorkflowTemplate
} from "@clawcut/domain";
import type {
  CaptionSessionSnapshot,
  EditorSessionSnapshot,
  ExportSessionSnapshot,
  WorkflowSessionSnapshot
} from "@clawcut/ipc";

interface WorkflowPanelProps {
  snapshot: EditorSessionSnapshot | null;
  captionSnapshot: CaptionSessionSnapshot | null;
  exportSnapshot: ExportSessionSnapshot | null;
  workflowSnapshot: WorkflowSessionSnapshot | null;
  selectedClipId: string | null;
  onStartWorkflow: (
    templateId: WorkflowTemplate["id"],
    input: Record<string, unknown>,
    batch: boolean
  ) => void;
  onCancelWorkflowRun: (workflowRunId: string) => void;
  onResumeWorkflowRun: (workflowRunId: string) => void;
  onRetryWorkflowStep: (workflowRunId: string, stepRunId: string) => void;
  onApproveWorkflowStep: (workflowRunId: string, approvalId: string) => void;
  onRejectWorkflowStep: (workflowRunId: string, approvalId: string) => void;
  onCreateBrandKit: (brandKit: BrandKit) => void;
  onUpdateBrandKit: (brandKitId: string, brandKit: BrandKit) => void;
  onSetDefaultBrandKit: (brandKitId: string | null) => void;
  onCreateWorkflowProfile: (profile: WorkflowProfile) => void;
  onUpdateWorkflowProfile: (profileId: string, profile: WorkflowProfile) => void;
  onDeleteWorkflowProfile: (profileId: string) => void;
  onRunWorkflowProfile: (profileId: string, inputOverrides: Record<string, unknown>) => void;
  onCreateWorkflowSchedule: (schedule: WorkflowSchedule) => void;
  onUpdateWorkflowSchedule: (scheduleId: string, schedule: WorkflowSchedule) => void;
  onPauseWorkflowSchedule: (scheduleId: string) => void;
  onResumeWorkflowSchedule: (scheduleId: string) => void;
  onDeleteWorkflowSchedule: (scheduleId: string) => void;
  onPreviewCandidatePackage: (candidatePackageId: string) => void;
  onReviewCandidatePackage: (
    candidatePackageId: string,
    reviewStatus: WorkflowCandidateReviewStatus,
    reviewNotes: string | null
  ) => void;
  onExportCandidatePackage: (candidatePackageId: string) => void;
}

interface BrandKitDraft {
  id: string;
  name: string;
  description: string;
  captionTemplateId: CaptionTemplateId;
  exportPresetId: ExportPresetId;
  placement: "bottom-center" | "lower-third" | "top-headline" | "center-card";
  alignment: "left" | "center" | "right";
  fontFamilyIntent: "sans" | "display" | "serif";
  fontScale: "small" | "medium" | "large" | "hero";
  fontWeight: 500 | 600 | 700 | 800;
  textColor: string;
  accentColor: string;
  backgroundStyle: "none" | "boxed" | "card" | "highlight";
  activeWordStyle: "none" | "highlight";
  watermarkPath: string;
  introPath: string;
  outroPath: string;
}

interface WorkflowProfileDraft {
  id: string;
  name: string;
  description: string;
}

interface WorkflowScheduleDraft {
  id: string;
  name: string;
  workflowProfileId: string;
  intervalMinutes: number;
  targetResolverKind: "use-profile-defaults" | "static-clip-ids" | "all-video-clips";
  staticClipIds: string[];
}

function humanizeWorkflowStatus(status: WorkflowRun["status"]): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "planning":
      return "Planning";
    case "running":
      return "Running";
    case "waiting-approval":
      return "Waiting approval";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
  }
}

function humanizeStepStatus(status: WorkflowBatchItemRun["status"]): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "running":
      return "Running";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "skipped":
      return "Skipped";
    case "waiting-approval":
      return "Waiting approval";
    case "cancelled":
      return "Cancelled";
  }
}

function workflowToneClass(status: WorkflowRun["status"]): string {
  switch (status) {
    case "completed":
      return "tone-chip tone-chip--ok";
    case "failed":
      return "tone-chip tone-chip--danger";
    case "waiting-approval":
      return "tone-chip tone-chip--warning";
    case "cancelled":
      return "tone-chip tone-chip--warning";
    case "queued":
    case "planning":
    case "running":
      return "tone-chip tone-chip--progress";
  }
}

function humanizeCandidateReviewStatus(status: WorkflowCandidateReviewStatus): string {
  switch (status) {
    case "new":
      return "New";
    case "shortlisted":
      return "Shortlisted";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "exported":
      return "Exported";
  }
}

function candidateReviewToneClass(status: WorkflowCandidateReviewStatus): string {
  switch (status) {
    case "approved":
    case "exported":
      return "tone-chip tone-chip--ok";
    case "rejected":
      return "tone-chip tone-chip--danger";
    case "shortlisted":
      return "tone-chip tone-chip--warning";
    case "new":
      return "tone-chip tone-chip--progress";
  }
}

function formatTimestamp(timestamp: string | null): string {
  if (!timestamp) {
    return "Unknown";
  }

  return new Date(timestamp).toLocaleString();
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/(^-|-$)/gu, "");
}

function createBrandKitDraft(
  source: BrandKit | null,
  fallbackTemplateId: CaptionTemplateId,
  fallbackExportPresetId: ExportPresetId
): BrandKitDraft {
  if (!source) {
    return {
      id: "",
      name: "",
      description: "",
      captionTemplateId: fallbackTemplateId,
      exportPresetId: fallbackExportPresetId,
      placement: "bottom-center",
      alignment: "center",
      fontFamilyIntent: "sans",
      fontScale: "medium",
      fontWeight: 700,
      textColor: "#F9F7F1",
      accentColor: "#F4A300",
      backgroundStyle: "none",
      activeWordStyle: "none",
      watermarkPath: "",
      introPath: "",
      outroPath: ""
    };
  }

  return {
    id: source.id,
    name: source.name,
    description: source.description,
    captionTemplateId: source.captionTemplateId,
    exportPresetId: source.exportPresetId,
    placement: source.captionStyleOverrides.placement ?? source.safeZoneDefaults.placement,
    alignment: source.captionStyleOverrides.alignment ?? source.safeZoneDefaults.alignment,
    fontFamilyIntent: source.captionStyleOverrides.fontFamilyIntent ?? "sans",
    fontScale: source.captionStyleOverrides.fontScale ?? "medium",
    fontWeight: source.captionStyleOverrides.fontWeight ?? 700,
    textColor: source.captionStyleOverrides.textColor ?? "#F9F7F1",
    accentColor: source.captionStyleOverrides.accentColor ?? "#F4A300",
    backgroundStyle: source.captionStyleOverrides.backgroundStyle ?? "none",
    activeWordStyle: source.captionStyleOverrides.activeWordStyle ?? "none",
    watermarkPath: source.watermarkAsset.absolutePath ?? "",
    introPath: source.introAsset.absolutePath ?? "",
    outroPath: source.outroAsset.absolutePath ?? ""
  };
}

function toBrandKitPayload(draft: BrandKitDraft): BrandKit {
  return {
    id: draft.id,
    version: 1,
    name: draft.name,
    description: draft.description,
    captionTemplateId: draft.captionTemplateId,
    captionStyleOverrides: {
      placement: draft.placement,
      alignment: draft.alignment,
      fontFamilyIntent: draft.fontFamilyIntent,
      fontScale: draft.fontScale,
      fontWeight: draft.fontWeight,
      textColor: draft.textColor,
      accentColor: draft.accentColor,
      backgroundStyle: draft.backgroundStyle,
      activeWordStyle: draft.activeWordStyle
    },
    safeZoneDefaults: {
      anchor: "title-safe",
      placement: draft.placement,
      alignment: draft.alignment
    },
    exportPresetId: draft.exportPresetId,
    watermarkAsset: {
      kind: draft.watermarkPath ? "file" : "none",
      absolutePath: draft.watermarkPath || null,
      label: draft.watermarkPath ? "Watermark asset" : null,
      position: "top-right",
      marginPx: 40,
      opacity: 0.85
    },
    introAsset: {
      kind: draft.introPath ? "file" : "none",
      absolutePath: draft.introPath || null,
      label: draft.introPath ? "Intro asset" : null
    },
    outroAsset: {
      kind: draft.outroPath ? "file" : "none",
      absolutePath: draft.outroPath || null,
      label: draft.outroPath ? "Outro asset" : null
    },
    audioBed: {
      kind: "none",
      absolutePath: null,
      label: null
    },
    layoutDefaults: {
      safeZoneAnchor: "title-safe",
      placement: draft.placement,
      alignment: draft.alignment
    },
    exportPresetBundle: {
      primaryPresetId: draft.exportPresetId,
      socialPresetId: "video-share-720p"
    },
    source: "user"
  };
}

function buildDefaultWorkflowInput(
  template: WorkflowTemplate | null,
  snapshot: EditorSessionSnapshot | null,
  workflowSnapshot: WorkflowSessionSnapshot | null,
  exportSnapshot: ExportSessionSnapshot | null,
  selectedClipId: string | null
): Record<string, unknown> {
  if (!template) {
    return {};
  }

  const clipIds = Object.keys(snapshot?.timeline.clipsById ?? {});
  const primaryClipId = selectedClipId ?? clipIds[0] ?? "";

  return Object.fromEntries(
    template.inputSchema.fields.map((field) => {
      if (field.defaultValue !== undefined) {
        return [field.id, field.defaultValue];
      }

      switch (field.type) {
        case "clip-id":
          return [field.id, primaryClipId];
        case "string-array":
          return [field.id, primaryClipId ? [primaryClipId] : []];
        case "brand-kit-id":
          return [field.id, snapshot?.document.settings.branding.defaultBrandKitId ?? workflowSnapshot?.brandKits[0]?.id ?? ""];
        case "export-preset-id":
          return [field.id, exportSnapshot?.defaultPresetId ?? ""];
        case "timeline-id":
          return [field.id, snapshot?.timeline.id ?? ""];
        case "caption-template-id":
          return [field.id, snapshot?.document.settings.captions.defaultTemplate ?? "bottom-center-clean"];
        case "boolean":
          return [field.id, false];
        default:
          return [field.id, ""];
      }
    })
  );
}

function formatArtifact(artifact: WorkflowArtifact): string {
  return artifact.path ?? JSON.stringify(artifact.metadata);
}

function createWorkflowProfileDraft(profile: WorkflowProfile | null): WorkflowProfileDraft {
  return {
    id: profile?.id ?? "",
    name: profile?.name ?? "",
    description: profile?.description ?? ""
  };
}

function createWorkflowScheduleDraft(
  schedule: WorkflowSchedule | null,
  workflowProfileId: string,
  selectedClipId: string | null
): WorkflowScheduleDraft {
  return {
    id: schedule?.id ?? "",
    name: schedule?.name ?? "",
    workflowProfileId: schedule?.workflowProfileId ?? workflowProfileId,
    intervalMinutes: schedule?.trigger.intervalMinutes ?? 60,
    targetResolverKind: schedule?.targetResolver.kind ?? (selectedClipId ? "static-clip-ids" : "use-profile-defaults"),
    staticClipIds: schedule?.targetResolver.clipIds ?? (selectedClipId ? [selectedClipId] : [])
  };
}

function createWorkflowProfilePayload(
  draft: WorkflowProfileDraft,
  templateId: WorkflowTemplate["id"],
  defaultInputs: Record<string, unknown>,
  brandKitId: string | null,
  exportPresetId: string | null
): WorkflowProfile {
  const timestamp = new Date().toISOString();

  return {
    id: draft.id,
    version: 1,
    name: draft.name,
    description: draft.description,
    templateId,
    defaultInputs,
    approvalPolicy: "respect-template",
    defaultBrandKitId: brandKitId,
    defaultExportPresetId: exportPresetId,
    enabledOptionalSteps: [],
    compatibility: {
      templateId,
      templateVersion: 1
    },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function createWorkflowSchedulePayload(
  draft: WorkflowScheduleDraft,
  projectPath: string
): WorkflowSchedule {
  const timestamp = new Date().toISOString();

  return {
    id: draft.id,
    version: 1,
    name: draft.name,
    enabled: true,
    workflowProfileId: draft.workflowProfileId,
    projectPath,
    targetResolver: {
      kind: draft.targetResolverKind,
      clipIds: draft.targetResolverKind === "static-clip-ids" ? draft.staticClipIds : undefined
    },
    trigger: {
      kind: "interval",
      intervalMinutes: draft.intervalMinutes
    },
    approvalPolicy: "respect-profile",
    concurrencyPolicy: "skip-if-running",
    lastRunAt: null,
    nextRunAt: null,
    lastRunStatus: null,
    lastWorkflowRunId: null,
    lastError: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function WorkflowPanel({
  snapshot,
  captionSnapshot,
  exportSnapshot,
  workflowSnapshot,
  selectedClipId,
  onStartWorkflow,
  onCancelWorkflowRun,
  onResumeWorkflowRun,
  onRetryWorkflowStep,
  onApproveWorkflowStep,
  onRejectWorkflowStep,
  onCreateBrandKit,
  onUpdateBrandKit,
  onSetDefaultBrandKit,
  onCreateWorkflowProfile,
  onUpdateWorkflowProfile,
  onDeleteWorkflowProfile,
  onRunWorkflowProfile,
  onCreateWorkflowSchedule,
  onUpdateWorkflowSchedule,
  onPauseWorkflowSchedule,
  onResumeWorkflowSchedule,
  onDeleteWorkflowSchedule,
  onPreviewCandidatePackage,
  onReviewCandidatePackage,
  onExportCandidatePackage
}: WorkflowPanelProps) {
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<WorkflowTemplate["id"] | null>(null);
  const [draftInput, setDraftInput] = useState<Record<string, unknown>>({});
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedBrandKitId, setSelectedBrandKitId] = useState<string | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);

  const workflows = useMemo(() => workflowSnapshot?.workflows ?? [], [workflowSnapshot]);
  const selectedWorkflow =
    workflows.find((workflow) => workflow.id === selectedWorkflowId) ?? workflows[0] ?? null;
  const selectedRun =
    workflowSnapshot?.workflowRuns.find((run) => run.id === selectedRunId) ??
    workflowSnapshot?.workflowRuns[0] ??
    null;
  const selectedBrandKit =
    workflowSnapshot?.brandKits.find((brandKit) => brandKit.id === selectedBrandKitId) ??
    workflowSnapshot?.brandKits[0] ??
    null;
  const selectedProfile =
    workflowSnapshot?.workflowProfiles.find((profile) => profile.id === selectedProfileId) ??
    workflowSnapshot?.workflowProfiles[0] ??
    null;
  const selectedSchedule =
    workflowSnapshot?.schedules.find((schedule) => schedule.id === selectedScheduleId) ??
    workflowSnapshot?.schedules[0] ??
    null;
  const candidatePackages = useMemo(
    () => workflowSnapshot?.candidatePackages ?? [],
    [workflowSnapshot]
  );
  const recentAuditEvents = useMemo(
    () => workflowSnapshot?.auditEvents.slice(0, 8) ?? [],
    [workflowSnapshot]
  );
  const [brandKitDraft, setBrandKitDraft] = useState<BrandKitDraft>(() =>
    createBrandKitDraft(null, "bottom-center-clean", "video-master-1080p")
  );
  const [profileDraft, setProfileDraft] = useState<WorkflowProfileDraft>(() =>
    createWorkflowProfileDraft(null)
  );
  const [scheduleDraft, setScheduleDraft] = useState<WorkflowScheduleDraft>(() =>
    createWorkflowScheduleDraft(null, "", null)
  );
  const [candidateReviewDrafts, setCandidateReviewDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!selectedWorkflowId && workflows[0]) {
      setSelectedWorkflowId(workflows[0].id);
    }
  }, [selectedWorkflowId, workflows]);

  useEffect(() => {
    if (!selectedRunId && workflowSnapshot?.workflowRuns[0]) {
      setSelectedRunId(workflowSnapshot.workflowRuns[0].id);
    }
  }, [selectedRunId, workflowSnapshot]);

  useEffect(() => {
    if (!selectedBrandKitId && workflowSnapshot?.brandKits[0]) {
      setSelectedBrandKitId(workflowSnapshot.brandKits[0].id);
    }
  }, [selectedBrandKitId, workflowSnapshot]);

  useEffect(() => {
    if (!selectedProfileId && workflowSnapshot?.workflowProfiles[0]) {
      setSelectedProfileId(workflowSnapshot.workflowProfiles[0].id);
    }
  }, [selectedProfileId, workflowSnapshot]);

  useEffect(() => {
    if (!selectedScheduleId && workflowSnapshot?.schedules[0]) {
      setSelectedScheduleId(workflowSnapshot.schedules[0].id);
    }
  }, [selectedScheduleId, workflowSnapshot]);

  useEffect(() => {
    setDraftInput(
      buildDefaultWorkflowInput(
        selectedWorkflow,
        snapshot,
        workflowSnapshot,
        exportSnapshot,
        selectedClipId
      )
    );
  }, [exportSnapshot, selectedClipId, selectedWorkflow, snapshot, workflowSnapshot]);

  useEffect(() => {
    setBrandKitDraft(
      createBrandKitDraft(
        selectedBrandKit,
        captionSnapshot?.templates[0]?.id ?? "bottom-center-clean",
        exportSnapshot?.defaultPresetId ?? "video-master-1080p"
      )
    );
  }, [captionSnapshot, exportSnapshot, selectedBrandKit]);

  useEffect(() => {
    setProfileDraft(createWorkflowProfileDraft(selectedProfile));
  }, [selectedProfile]);

  useEffect(() => {
    setScheduleDraft(
      createWorkflowScheduleDraft(selectedSchedule, selectedProfile?.id ?? "", selectedClipId)
    );
  }, [selectedClipId, selectedProfile, selectedSchedule]);

  useEffect(() => {
    setCandidateReviewDrafts((current) => {
      let changed = false;
      const next = { ...current };

      for (const candidatePackage of candidatePackages) {
        if (next[candidatePackage.id] === undefined) {
          next[candidatePackage.id] = candidatePackage.reviewNotes ?? "";
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [candidatePackages]);

  const clipOptions = useMemo(
    () =>
      Object.values(snapshot?.timeline.clipsById ?? {}).map((clip) => ({
        value: clip.id,
        label: `${clip.streamType.toUpperCase()} · ${clip.id}`
      })),
    [snapshot]
  );

  const userBrandKitSelected = selectedBrandKit?.source === "user";

  return (
    <section className="workflow-panel" data-testid="workflow-panel">
      <header className="panel-header">
        <div>
          <p className="eyebrow eyebrow--muted">Workflow packaging</p>
          <h2>Reusable runs, approvals, brand kits, batch-safe orchestration</h2>
        </div>
        <span
          className={
            workflowSnapshot?.pendingApprovals.length
              ? "tone-chip tone-chip--warning"
              : workflowSnapshot?.activeWorkflowJobId
                ? "tone-chip tone-chip--progress"
                : "tone-chip"
          }
        >
          {workflowSnapshot?.pendingApprovals.length
            ? `${workflowSnapshot.pendingApprovals.length} waiting approval`
            : workflowSnapshot?.activeWorkflowJobId
              ? "Workflow active"
              : "Ready"}
        </span>
      </header>

      <div className="workflow-panel__grid">
        <article className="workflow-surface">
          <div className="workflow-toolbar">
            <label className="field field--compact">
              <span>Workflow</span>
              <select
                data-testid="workflow-template-select"
                onChange={(event) => setSelectedWorkflowId(event.target.value as WorkflowTemplate["id"])}
                value={selectedWorkflow?.id ?? ""}
              >
                {workflows.map((workflow) => (
                  <option key={workflow.id} value={workflow.id}>
                    {workflow.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="primary-button"
              data-testid="workflow-start-button"
              disabled={!selectedWorkflow || !snapshot}
              onClick={() =>
                selectedWorkflow &&
                onStartWorkflow(
                  selectedWorkflow.id,
                  draftInput,
                  selectedWorkflow.batchMode === "clip-batch"
                )
              }
              type="button"
            >
              {selectedWorkflow?.batchMode === "clip-batch" ? "Start batch workflow" : "Start workflow"}
            </button>
          </div>

          {selectedWorkflow ? (
            <>
              <div className="workflow-summary-card">
                <strong>{selectedWorkflow.description}</strong>
                <p>
                  Safety: {selectedWorkflow.safetyProfile.highestSafetyClass}. Expected outputs:{" "}
                  {selectedWorkflow.expectedOutputs.join(", ")}.
                </p>
              </div>

              <div className="workflow-input-grid">
                {selectedWorkflow.inputSchema.fields.map((field) => {
                  const value = draftInput[field.id];

                  if (field.type === "boolean") {
                    return (
                      <label className="field field--checkbox workflow-field" key={field.id}>
                        <input
                          checked={Boolean(value)}
                          onChange={(event) =>
                            setDraftInput((current) => ({
                              ...current,
                              [field.id]: event.target.checked
                            }))
                          }
                          type="checkbox"
                        />
                        <span>{field.label}</span>
                      </label>
                    );
                  }

                  if (field.type === "clip-id") {
                    return (
                      <label className="field workflow-field" key={field.id}>
                        <span>{field.label}</span>
                        <select
                          onChange={(event) =>
                            setDraftInput((current) => ({
                              ...current,
                              [field.id]: event.target.value
                            }))
                          }
                          value={String(value ?? "")}
                        >
                          <option value="">Select a clip</option>
                          {clipOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    );
                  }

                  if (field.type === "string-array") {
                    const selectedValues = Array.isArray(value) ? (value as string[]) : [];
                    return (
                      <label className="field workflow-field workflow-field--wide" key={field.id}>
                        <span>{field.label}</span>
                        <select
                          multiple
                          onChange={(event) =>
                            setDraftInput((current) => ({
                              ...current,
                              [field.id]: Array.from(event.target.selectedOptions).map(
                                (option) => option.value
                              )
                            }))
                          }
                          size={Math.min(clipOptions.length || 1, 4)}
                          value={selectedValues}
                        >
                          {clipOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    );
                  }

                  if (field.type === "brand-kit-id") {
                    return (
                      <label className="field workflow-field" key={field.id}>
                        <span>{field.label}</span>
                        <select
                          onChange={(event) =>
                            setDraftInput((current) => ({
                              ...current,
                              [field.id]: event.target.value
                            }))
                          }
                          value={String(value ?? "")}
                        >
                          <option value="">Use project default</option>
                          {(workflowSnapshot?.brandKits ?? []).map((brandKit) => (
                            <option key={brandKit.id} value={brandKit.id}>
                              {brandKit.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    );
                  }

                  if (field.type === "export-preset-id") {
                    return (
                      <label className="field workflow-field" key={field.id}>
                        <span>{field.label}</span>
                        <select
                          onChange={(event) =>
                            setDraftInput((current) => ({
                              ...current,
                              [field.id]: event.target.value
                            }))
                          }
                          value={String(value ?? "")}
                        >
                          <option value="">Use project default</option>
                          {(exportSnapshot?.presets ?? []).map((preset) => (
                            <option key={preset.id} value={preset.id}>
                              {preset.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    );
                  }

                  if (field.type === "caption-template-id") {
                    return (
                      <label className="field workflow-field" key={field.id}>
                        <span>{field.label}</span>
                        <select
                          onChange={(event) =>
                            setDraftInput((current) => ({
                              ...current,
                              [field.id]: event.target.value
                            }))
                          }
                          value={String(value ?? "")}
                        >
                          {(captionSnapshot?.templates ?? []).map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.displayName}
                            </option>
                          ))}
                        </select>
                      </label>
                    );
                  }

                  if (field.options?.length) {
                    return (
                      <label className="field workflow-field" key={field.id}>
                        <span>{field.label}</span>
                        <select
                          onChange={(event) =>
                            setDraftInput((current) => ({
                              ...current,
                              [field.id]: event.target.value
                            }))
                          }
                          value={String(value ?? "")}
                        >
                          {field.options.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    );
                  }

                  return (
                    <label className="field workflow-field" key={field.id}>
                      <span>{field.label}</span>
                      <input
                        onChange={(event) =>
                          setDraftInput((current) => ({
                            ...current,
                            [field.id]: event.target.value
                          }))
                        }
                        readOnly={field.type === "timeline-id"}
                        type="text"
                        value={String(value ?? "")}
                      />
                    </label>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="empty-inline">Open a project to inspect built-in workflows.</div>
          )}
        </article>

        <aside className="workflow-sidebar">
          <section className="workflow-surface">
            <div className="workflow-surface__header">
              <div>
                <span className="meta-label">Runs</span>
                <strong>{workflowSnapshot?.workflowRuns.length ?? 0} workflow runs</strong>
              </div>
              {selectedRun ? (
                <span className={workflowToneClass(selectedRun.status)}>
                  {humanizeWorkflowStatus(selectedRun.status)}
                </span>
              ) : null}
            </div>

            <div className="workflow-run-list">
              {(workflowSnapshot?.workflowRuns ?? []).map((run) => (
                <button
                  className={`workflow-run-card ${selectedRun?.id === run.id ? "workflow-run-card--selected" : ""}`}
                  key={run.id}
                  onClick={() => setSelectedRunId(run.id)}
                  type="button"
                >
                  <div className="workflow-run-card__header">
                    <strong>{run.templateId}</strong>
                    <span className={workflowToneClass(run.status)}>{humanizeWorkflowStatus(run.status)}</span>
                  </div>
                  <span>
                    {run.summary.completedStepCount}/{run.summary.totalStepCount} steps
                  </span>
                </button>
              ))}
            </div>

            {selectedRun ? (
              <div className="workflow-run-detail" data-testid="workflow-run-detail">
                <div className="button-row button-row--tight">
                  {selectedRun.status === "waiting-approval" || selectedRun.status === "failed" ? (
                    <button
                      className="secondary-button"
                      onClick={() => onResumeWorkflowRun(selectedRun.id)}
                      type="button"
                    >
                      Resume run
                    </button>
                  ) : null}
                  {selectedRun.status === "queued" || selectedRun.status === "running" ? (
                    <button
                      className="secondary-button"
                      onClick={() => onCancelWorkflowRun(selectedRun.id)}
                      type="button"
                    >
                      Cancel run
                    </button>
                  ) : null}
                </div>

                <div className="workflow-step-list">
                  {selectedRun.steps.map((step) => (
                    <div className="workflow-step-row" key={step.id}>
                      <div>
                        <strong>{step.name}</strong>
                        <p>{step.kind}</p>
                      </div>
                      <div className="workflow-step-row__actions">
                        <span className={workflowToneClass(step.status === "waiting-approval" ? "waiting-approval" : step.status === "completed" ? "completed" : step.status === "failed" ? "failed" : step.status === "cancelled" ? "cancelled" : "running")}>
                          {humanizeStepStatus(step.status)}
                        </span>
                        {step.status === "failed" ? (
                          <button
                            className="secondary-button secondary-button--small"
                            onClick={() => onRetryWorkflowStep(selectedRun.id, step.id)}
                            type="button"
                          >
                            Retry step
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>

                {selectedRun.batchItems.length ? (
                  <table className="workflow-batch-table">
                    <thead>
                      <tr>
                        <th>Target</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRun.batchItems.map((item) => (
                        <tr key={item.id}>
                          <td>{item.label}</td>
                          <td>{humanizeStepStatus(item.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}

                <div className="workflow-artifact-list">
                  {selectedRun.artifacts.map((artifact) => (
                    <div className="workflow-artifact-row" key={artifact.id}>
                      <strong>{artifact.label}</strong>
                      <span>{formatArtifact(artifact)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="empty-inline">No workflow runs yet.</div>
            )}
          </section>

          <section className="workflow-surface">
            <div className="workflow-surface__header">
              <div>
                <span className="meta-label">Approvals</span>
                <strong>{workflowSnapshot?.pendingApprovals.length ?? 0} pending</strong>
              </div>
            </div>
            {(workflowSnapshot?.pendingApprovals ?? []).length ? (
              <div className="workflow-approval-list">
                {workflowSnapshot?.pendingApprovals.map((approval) => (
                  <div className="workflow-approval-row" key={approval.id}>
                    <div>
                      <strong>{approval.summary}</strong>
                      <p>{approval.reason}</p>
                    </div>
                    <div className="button-row button-row--tight">
                      <button
                        className="primary-button primary-button--small"
                        onClick={() => onApproveWorkflowStep(approval.workflowRunId, approval.id)}
                        type="button"
                      >
                        Approve
                      </button>
                      <button
                        className="secondary-button secondary-button--small"
                        onClick={() => onRejectWorkflowStep(approval.workflowRunId, approval.id)}
                        type="button"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-inline">No approvals are waiting. High-impact workflows will pause here when configured.</div>
            )}
          </section>

          <section className="workflow-surface">
            <div className="workflow-surface__header">
              <div>
                <span className="meta-label">Brand kits</span>
                <strong>{workflowSnapshot?.brandKits.length ?? 0} available</strong>
              </div>
              <select
                onChange={(event) => onSetDefaultBrandKit(event.target.value || null)}
                value={snapshot?.document.settings.branding.defaultBrandKitId ?? ""}
              >
                <option value="">No project default</option>
                {(workflowSnapshot?.brandKits ?? []).map((brandKit) => (
                  <option key={brandKit.id} value={brandKit.id}>
                    {brandKit.name}
                  </option>
                ))}
              </select>
            </div>

            <label className="field field--compact">
              <span>Edit brand kit</span>
              <select
                onChange={(event) => setSelectedBrandKitId(event.target.value)}
                value={selectedBrandKit?.id ?? ""}
              >
                {(workflowSnapshot?.brandKits ?? []).map((brandKit) => (
                  <option key={brandKit.id} value={brandKit.id}>
                    {brandKit.name} {brandKit.source === "built-in" ? "· built-in" : "· user"}
                  </option>
                ))}
              </select>
            </label>

            <div className="workflow-input-grid">
              <label className="field workflow-field">
                <span>Id</span>
                <input
                  onChange={(event) =>
                    setBrandKitDraft((current) => ({
                      ...current,
                      id: slugify(event.target.value)
                    }))
                  }
                  readOnly={userBrandKitSelected}
                  type="text"
                  value={brandKitDraft.id}
                />
              </label>
              <label className="field workflow-field">
                <span>Name</span>
                <input
                  onChange={(event) =>
                    setBrandKitDraft((current) => ({
                      ...current,
                      name: event.target.value,
                      id: current.id || slugify(event.target.value)
                    }))
                  }
                  type="text"
                  value={brandKitDraft.name}
                />
              </label>
              <label className="field workflow-field workflow-field--wide">
                <span>Description</span>
                <input
                  onChange={(event) =>
                    setBrandKitDraft((current) => ({
                      ...current,
                      description: event.target.value
                    }))
                  }
                  type="text"
                  value={brandKitDraft.description}
                />
              </label>
              <label className="field workflow-field">
                <span>Template</span>
                <select
                  onChange={(event) =>
                    setBrandKitDraft((current) => ({
                      ...current,
                      captionTemplateId: event.target.value as CaptionTemplateId
                    }))
                  }
                  value={brandKitDraft.captionTemplateId}
                >
                  {(captionSnapshot?.templates ?? []).map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field workflow-field">
                <span>Export preset</span>
                <select
                  onChange={(event) =>
                    setBrandKitDraft((current) => ({
                      ...current,
                      exportPresetId: event.target.value as ExportPresetId
                    }))
                  }
                  value={brandKitDraft.exportPresetId}
                >
                  {(exportSnapshot?.presets ?? []).map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field workflow-field">
                <span>Text color</span>
                <input
                  onChange={(event) =>
                    setBrandKitDraft((current) => ({
                      ...current,
                      textColor: event.target.value
                    }))
                  }
                  type="text"
                  value={brandKitDraft.textColor}
                />
              </label>
              <label className="field workflow-field">
                <span>Accent color</span>
                <input
                  onChange={(event) =>
                    setBrandKitDraft((current) => ({
                      ...current,
                      accentColor: event.target.value
                    }))
                  }
                  type="text"
                  value={brandKitDraft.accentColor}
                />
              </label>
              <label className="field workflow-field workflow-field--wide">
                <span>Watermark asset path</span>
                <input
                  onChange={(event) =>
                    setBrandKitDraft((current) => ({
                      ...current,
                      watermarkPath: event.target.value
                    }))
                  }
                  type="text"
                  value={brandKitDraft.watermarkPath}
                />
              </label>
              <label className="field workflow-field workflow-field--wide">
                <span>Intro asset path</span>
                <input
                  onChange={(event) =>
                    setBrandKitDraft((current) => ({
                      ...current,
                      introPath: event.target.value
                    }))
                  }
                  type="text"
                  value={brandKitDraft.introPath}
                />
              </label>
              <label className="field workflow-field workflow-field--wide">
                <span>Outro asset path</span>
                <input
                  onChange={(event) =>
                    setBrandKitDraft((current) => ({
                      ...current,
                      outroPath: event.target.value
                    }))
                  }
                  type="text"
                  value={brandKitDraft.outroPath}
                />
              </label>
            </div>

            <div className="button-row">
              <button
                className="secondary-button"
                onClick={() => onCreateBrandKit(toBrandKitPayload(brandKitDraft))}
                type="button"
              >
                Create user brand kit
              </button>
              <button
                className="primary-button"
                disabled={!userBrandKitSelected}
                onClick={() =>
                  selectedBrandKit &&
                  selectedBrandKit.source === "user" &&
                  onUpdateBrandKit(selectedBrandKit.id, toBrandKitPayload(brandKitDraft))
                }
                type="button"
              >
                Update selected brand kit
              </button>
            </div>
          </section>

          <section className="workflow-surface">
            <div className="workflow-surface__header">
              <div>
                <span className="meta-label">Workflow profiles</span>
                <strong>{workflowSnapshot?.workflowProfiles.length ?? 0} reusable profiles</strong>
              </div>
            </div>

            <label className="field field--compact">
              <span>Selected profile</span>
              <select
                onChange={(event) => setSelectedProfileId(event.target.value)}
                value={selectedProfile?.id ?? ""}
              >
                {(workflowSnapshot?.workflowProfiles ?? []).map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="workflow-input-grid">
              <label className="field workflow-field">
                <span>Profile id</span>
                <input
                  onChange={(event) =>
                    setProfileDraft((current) => ({
                      ...current,
                      id: slugify(event.target.value)
                    }))
                  }
                  type="text"
                  value={profileDraft.id}
                />
              </label>
              <label className="field workflow-field">
                <span>Name</span>
                <input
                  onChange={(event) =>
                    setProfileDraft((current) => ({
                      ...current,
                      name: event.target.value,
                      id: current.id || slugify(event.target.value)
                    }))
                  }
                  type="text"
                  value={profileDraft.name}
                />
              </label>
              <label className="field workflow-field workflow-field--wide">
                <span>Description</span>
                <input
                  onChange={(event) =>
                    setProfileDraft((current) => ({
                      ...current,
                      description: event.target.value
                    }))
                  }
                  type="text"
                  value={profileDraft.description}
                />
              </label>
            </div>

            <div className="button-row">
              <button
                className="secondary-button"
                disabled={!selectedWorkflow || !profileDraft.id || !profileDraft.name}
                onClick={() =>
                  selectedWorkflow &&
                  onCreateWorkflowProfile(
                    createWorkflowProfilePayload(
                      profileDraft,
                      selectedWorkflow.id,
                      draftInput,
                      typeof draftInput.brandKitId === "string" && draftInput.brandKitId
                        ? (draftInput.brandKitId as string)
                        : null,
                      typeof draftInput.exportPresetId === "string" && draftInput.exportPresetId
                        ? (draftInput.exportPresetId as ExportPresetId)
                        : null
                    )
                  )
                }
                type="button"
              >
                Save current workflow as profile
              </button>
              <button
                className="primary-button"
                disabled={!selectedWorkflow || !selectedProfile}
                onClick={() =>
                  selectedWorkflow &&
                  selectedProfile &&
                  onUpdateWorkflowProfile(
                    selectedProfile.id,
                    createWorkflowProfilePayload(
                      profileDraft,
                      selectedWorkflow.id,
                      draftInput,
                      typeof draftInput.brandKitId === "string" && draftInput.brandKitId
                        ? (draftInput.brandKitId as string)
                        : null,
                      typeof draftInput.exportPresetId === "string" && draftInput.exportPresetId
                        ? (draftInput.exportPresetId as ExportPresetId)
                        : null
                    )
                  )
                }
                type="button"
              >
                Update selected profile
              </button>
              <button
                className="secondary-button"
                disabled={!selectedProfile}
                onClick={() => selectedProfile && onRunWorkflowProfile(selectedProfile.id, {})}
                type="button"
              >
                Run selected profile
              </button>
              <button
                className="secondary-button"
                disabled={!selectedProfile}
                onClick={() => selectedProfile && onDeleteWorkflowProfile(selectedProfile.id)}
                type="button"
              >
                Delete profile
              </button>
            </div>
          </section>

          <section className="workflow-surface">
            <div className="workflow-surface__header">
              <div>
                <span className="meta-label">Schedules</span>
                <strong>{workflowSnapshot?.schedules.length ?? 0} local schedules</strong>
              </div>
            </div>

            <label className="field field--compact">
              <span>Selected schedule</span>
              <select
                onChange={(event) => setSelectedScheduleId(event.target.value)}
                value={selectedSchedule?.id ?? ""}
              >
                {(workflowSnapshot?.schedules ?? []).map((schedule) => (
                  <option key={schedule.id} value={schedule.id}>
                    {schedule.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="workflow-input-grid">
              <label className="field workflow-field">
                <span>Schedule id</span>
                <input
                  onChange={(event) =>
                    setScheduleDraft((current) => ({
                      ...current,
                      id: slugify(event.target.value)
                    }))
                  }
                  type="text"
                  value={scheduleDraft.id}
                />
              </label>
              <label className="field workflow-field">
                <span>Name</span>
                <input
                  onChange={(event) =>
                    setScheduleDraft((current) => ({
                      ...current,
                      name: event.target.value,
                      id: current.id || slugify(event.target.value)
                    }))
                  }
                  type="text"
                  value={scheduleDraft.name}
                />
              </label>
              <label className="field workflow-field">
                <span>Profile</span>
                <select
                  onChange={(event) =>
                    setScheduleDraft((current) => ({
                      ...current,
                      workflowProfileId: event.target.value
                    }))
                  }
                  value={scheduleDraft.workflowProfileId}
                >
                  <option value="">Select a profile</option>
                  {(workflowSnapshot?.workflowProfiles ?? []).map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field workflow-field">
                <span>Interval minutes</span>
                <input
                  min={5}
                  onChange={(event) =>
                    setScheduleDraft((current) => ({
                      ...current,
                      intervalMinutes: Number(event.target.value) || 60
                    }))
                  }
                  type="number"
                  value={scheduleDraft.intervalMinutes}
                />
              </label>
              <label className="field workflow-field">
                <span>Target resolver</span>
                <select
                  onChange={(event) =>
                    setScheduleDraft((current) => ({
                      ...current,
                      targetResolverKind: event.target.value as WorkflowScheduleDraft["targetResolverKind"]
                    }))
                  }
                  value={scheduleDraft.targetResolverKind}
                >
                  <option value="use-profile-defaults">Use profile defaults</option>
                  <option value="static-clip-ids">Static clip ids</option>
                  <option value="all-video-clips">All video clips</option>
                </select>
              </label>
              {scheduleDraft.targetResolverKind === "static-clip-ids" ? (
                <label className="field workflow-field workflow-field--wide">
                  <span>Static clip ids (comma separated)</span>
                  <input
                    onChange={(event) =>
                      setScheduleDraft((current) => ({
                        ...current,
                        staticClipIds: event.target.value
                          .split(",")
                          .map((value) => value.trim())
                          .filter(Boolean)
                      }))
                    }
                    type="text"
                    value={scheduleDraft.staticClipIds.join(", ")}
                  />
                </label>
              ) : null}
            </div>

            <div className="button-row">
              <button
                className="secondary-button"
                disabled={!snapshot || !scheduleDraft.id || !scheduleDraft.name || !scheduleDraft.workflowProfileId}
                onClick={() =>
                  snapshot &&
                  onCreateWorkflowSchedule(
                    createWorkflowSchedulePayload(scheduleDraft, snapshot.directory)
                  )
                }
                type="button"
              >
                Create schedule
              </button>
              <button
                className="primary-button"
                disabled={!snapshot || !selectedSchedule}
                onClick={() =>
                  snapshot &&
                  selectedSchedule &&
                  onUpdateWorkflowSchedule(
                    selectedSchedule.id,
                    createWorkflowSchedulePayload(scheduleDraft, snapshot.directory)
                  )
                }
                type="button"
              >
                Update selected schedule
              </button>
              <button
                className="secondary-button"
                disabled={!selectedSchedule || !selectedSchedule.enabled}
                onClick={() => selectedSchedule && onPauseWorkflowSchedule(selectedSchedule.id)}
                type="button"
              >
                Pause
              </button>
              <button
                className="secondary-button"
                disabled={!selectedSchedule || selectedSchedule.enabled}
                onClick={() => selectedSchedule && onResumeWorkflowSchedule(selectedSchedule.id)}
                type="button"
              >
                Resume
              </button>
              <button
                className="secondary-button"
                disabled={!selectedSchedule}
                onClick={() => selectedSchedule && onDeleteWorkflowSchedule(selectedSchedule.id)}
                type="button"
              >
                Delete
              </button>
            </div>

            {(workflowSnapshot?.schedules ?? []).length ? (
              <div className="workflow-artifact-list">
                {(workflowSnapshot?.schedules ?? []).map((schedule) => (
                  <div className="workflow-artifact-row" key={schedule.id}>
                    <strong>{schedule.name}</strong>
                    <span>
                      {schedule.enabled ? "Enabled" : "Paused"} · next {schedule.nextRunAt ?? "not scheduled"} · last{" "}
                      {schedule.lastRunStatus ?? "never"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-inline">No local schedules configured yet.</div>
            )}
          </section>

          <section className="workflow-surface">
            <div className="workflow-surface__header">
              <div>
                <span className="meta-label">Candidate packages</span>
                <strong>{candidatePackages.length} reviewable candidates</strong>
              </div>
            </div>

            {candidatePackages.length ? (
              <div className="workflow-artifact-list">
                {candidatePackages.map((candidate: WorkflowCandidatePackage) => (
                  <div className="workflow-artifact-row" key={candidate.id}>
                    <div>
                      <strong>{candidate.title}</strong>
                      <span>
                        {candidate.label} · {(candidate.startUs / 1_000_000).toFixed(2)}s to{" "}
                        {(candidate.endUs / 1_000_000).toFixed(2)}s
                      </span>
                      <span className={candidateReviewToneClass(candidate.reviewStatus)}>
                        {humanizeCandidateReviewStatus(candidate.reviewStatus)}
                      </span>
                      <span>
                        Reviewed {formatTimestamp(candidate.reviewedAt)} · transcript{" "}
                        {candidate.transcriptId ?? "none"}
                      </span>
                      {candidate.reviewNotes ? <span>{candidate.reviewNotes}</span> : null}
                    </div>
                    <label className="field field--compact workflow-candidate-notes">
                      <span>Review notes</span>
                      <input
                        onChange={(event) =>
                          setCandidateReviewDrafts((current) => ({
                            ...current,
                            [candidate.id]: event.target.value
                          }))
                        }
                        placeholder="Optional review notes"
                        type="text"
                        value={candidateReviewDrafts[candidate.id] ?? ""}
                      />
                    </label>
                    <div className="button-row button-row--tight">
                      <button
                        className="secondary-button secondary-button--small"
                        onClick={() => onPreviewCandidatePackage(candidate.id)}
                        type="button"
                      >
                        Preview
                      </button>
                      <button
                        className="secondary-button secondary-button--small"
                        onClick={() =>
                          onReviewCandidatePackage(
                            candidate.id,
                            "shortlisted",
                            candidateReviewDrafts[candidate.id] || null
                          )
                        }
                        type="button"
                      >
                        Shortlist
                      </button>
                      <button
                        className="primary-button primary-button--small"
                        onClick={() =>
                          onReviewCandidatePackage(
                            candidate.id,
                            "approved",
                            candidateReviewDrafts[candidate.id] || null
                          )
                        }
                        type="button"
                      >
                        Approve
                      </button>
                      <button
                        className="secondary-button secondary-button--small"
                        onClick={() =>
                          onReviewCandidatePackage(
                            candidate.id,
                            "rejected",
                            candidateReviewDrafts[candidate.id] || null
                          )
                        }
                        type="button"
                      >
                        Reject
                      </button>
                      <button
                        className="secondary-button secondary-button--small"
                        onClick={() => onExportCandidatePackage(candidate.id)}
                        type="button"
                      >
                        Export
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-inline">
                Social candidate workflows will list reviewable packages here before export.
              </div>
            )}
          </section>

          <section className="workflow-surface">
            <div className="workflow-surface__header">
              <div>
                <span className="meta-label">Workflow audit</span>
                <strong>{recentAuditEvents.length} recent events</strong>
              </div>
            </div>

            {recentAuditEvents.length ? (
              <div className="workflow-artifact-list">
                {recentAuditEvents.map((event: WorkflowAuditEvent) => (
                  <div className="workflow-artifact-row" key={event.id}>
                    <div>
                      <strong>{event.message}</strong>
                      <span>
                        {event.kind} · {event.severity} · {formatTimestamp(event.createdAt)}
                      </span>
                      {event.candidatePackageId ? (
                        <span>Candidate package {event.candidatePackageId}</span>
                      ) : null}
                      {event.stepRunId ? <span>Step {event.stepRunId}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-inline">
                Workflow runs now emit machine-readable audit events for review, approvals, and
                artifacts.
              </div>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}
