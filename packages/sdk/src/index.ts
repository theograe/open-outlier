export type OpenOutlierClientOptions = {
  baseUrl: string;
  apiKey: string;
  fetch?: typeof fetch;
};

export type WorkflowMode = "auto" | "copilot" | "manual";
export type WorkflowStage = "source_discovery" | "reference_research" | "concept_adaptation" | "thumbnail_creation";

export type Project = {
  id: number;
  name: string;
  niche: string | null;
  status: string;
  primaryChannelId: string | null;
  primaryChannelName: string | null;
  sourceSetCount: number;
  referenceCount: number;
  workflowRunCount: number;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowRun = {
  id: number;
  projectId: number;
  sourceSetId: number | null;
  mode: WorkflowMode;
  status: string;
  currentStage: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export class OpenOutlierClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenOutlierClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetch ?? fetch;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "x-api-key": this.apiKey,
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    return response.json() as Promise<T>;
  }

  health() {
    return this.request<{ ok: boolean; service: string; timestamp: string }>("/api/health", { headers: {} });
  }

  listProjects() {
    return this.request<Project[]>("/api/projects");
  }

  createProject(input: {
    name: string;
    niche?: string | null;
    primaryChannelInput?: string | null;
    competitorSourceSetName?: string | null;
  }) {
    return this.request<Record<string, unknown>>("/api/projects", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  getProject(projectId: number) {
    return this.request<Record<string, unknown>>(`/api/projects/${projectId}`);
  }

  createSourceSet(projectId: number, input: { name: string; role?: string; discoveryMode?: string }) {
    return this.request<Record<string, unknown>>(`/api/projects/${projectId}/source-sets`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  getSourceSet(sourceSetId: number) {
    return this.request<Record<string, unknown>>(`/api/source-sets/${sourceSetId}`);
  }

  addChannelToSourceSet(sourceSetId: number, input: {
    channelUrl?: string;
    channelId?: string;
    handle?: string;
    relationship?: string;
  }) {
    return this.request<Record<string, unknown>>(`/api/source-sets/${sourceSetId}/channels`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  discoverChannels(sourceSetId: number, input: { query?: string; niche?: string; limit?: number; autoAttach?: boolean }) {
    return this.request<Record<string, unknown>>(`/api/source-sets/${sourceSetId}/discover`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  searchReferences(projectId: number, input: Record<string, unknown>) {
    return this.request<Record<string, unknown>>(`/api/projects/${projectId}/references/search`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  listReferences(projectId: number) {
    return this.request<Record<string, unknown>[]>(`/api/projects/${projectId}/references`);
  }

  saveReference(projectId: number, input: {
    sourceSetId?: number | null;
    videoId: string;
    kind?: string;
    notes?: string | null;
    tags?: string[];
  }) {
    return this.request<Record<string, unknown>>(`/api/projects/${projectId}/references`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  importReferenceVideo(projectId: number, input: { sourceSetId?: number | null; videoId?: string | null; videoUrl?: string | null }) {
    return this.request<Record<string, unknown>>(`/api/projects/${projectId}/references/import-video`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  listConcepts(projectId: number) {
    return this.request<Record<string, unknown>[]>(`/api/projects/${projectId}/concepts`);
  }

  generateConcept(projectId: number, input: { referenceIds?: number[]; context?: string; providerId?: number }) {
    return this.request<Record<string, unknown>>(`/api/projects/${projectId}/concepts/generate`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  generateThumbnail(projectId: number, input: {
    referenceIds?: number[];
    prompt?: string;
    context?: string;
    characterProfileId?: number | null;
    size?: "16:9" | "3:2" | "1:1" | "2:3";
  }) {
    return this.request<Record<string, unknown>>(`/api/projects/${projectId}/thumbnails/generate`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  listWorkflowRuns(projectId: number) {
    return this.request<WorkflowRun[]>(`/api/projects/${projectId}/workflow-runs`);
  }

  getWorkflowRun(workflowRunId: number) {
    return this.request<WorkflowRun>(`/api/workflow-runs/${workflowRunId}`);
  }

  createWorkflowRun(input: {
    projectId: number;
    sourceSetId?: number | null;
    mode?: WorkflowMode;
    targetNiche?: string | null;
    targetChannelId?: string | null;
    startStage?: WorkflowStage;
    stopAfterStage?: WorkflowStage | null;
    referenceIds?: number[];
    seedVideoId?: string | null;
    seedVideoUrl?: string | null;
    input?: Record<string, unknown>;
    runImmediately?: boolean;
  }) {
    return this.request<WorkflowRun>("/api/workflow-runs", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  runWorkflowAuto(input: {
    projectId: number;
    sourceSetId?: number | null;
    targetNiche?: string | null;
    targetChannelId?: string | null;
    startStage?: WorkflowStage;
    stopAfterStage?: WorkflowStage | null;
    referenceIds?: number[];
    seedVideoId?: string | null;
    seedVideoUrl?: string | null;
    input?: Record<string, unknown>;
  }) {
    return this.request<WorkflowRun>("/api/workflow-runs/run-auto", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  advanceWorkflowRun(workflowRunId: number, input?: Record<string, unknown>) {
    return this.request<WorkflowRun>(`/api/workflow-runs/${workflowRunId}/advance`, {
      method: "POST",
      body: JSON.stringify(input ?? {}),
    });
  }

  async runSeedVideoWorkflow(input: {
    projectId: number;
    sourceSetId?: number | null;
    seedVideoUrl: string;
    adaptationContext?: string;
    stopAfterStage?: WorkflowStage | null;
  }) {
    return this.runWorkflowAuto({
      projectId: input.projectId,
      sourceSetId: input.sourceSetId,
      seedVideoUrl: input.seedVideoUrl,
      stopAfterStage: input.stopAfterStage ?? "concept_adaptation",
      input: {
        adaptationContext: input.adaptationContext,
      },
    });
  }
}
