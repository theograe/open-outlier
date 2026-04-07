export type OpenOutlierClientOptions = {
  baseUrl: string;
  apiKey?: string;
  fetch?: typeof fetch;
};

export type Collection = {
  id: number;
  name: string;
  niche: string | null;
  status: string;
  primaryChannelId: string | null;
  primaryChannelName: string | null;
  channelCount: number;
  referenceCount: number;
  createdAt: string;
  updatedAt: string;
};

export class OpenOutlierClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenOutlierClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey ?? "";
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

  listCollections() {
    return this.request<Collection[]>("/api/collections");
  }

  createCollection(input: {
    name: string;
    niche?: string | null;
    primaryChannelInput?: string | null;
  }) {
    return this.request<Record<string, unknown>>("/api/collections", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  getCollection(collectionId: number) {
    return this.request<Record<string, unknown>>(`/api/collections/${collectionId}`);
  }

  listTrackedChannels() {
    return this.request<Record<string, unknown>[]>("/api/tracked-channels");
  }

  addTrackedChannel(input: {
    channelUrl?: string;
    channelId?: string;
    handle?: string;
    relationship?: string;
  }) {
    return this.request<Record<string, unknown>>("/api/tracked-channels", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  discoverTrackedChannels(input: { query?: string; niche?: string; limit?: number; autoAttach?: boolean }) {
    return this.request<Record<string, unknown>>("/api/tracked-channels/discover", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  listReferences(collectionId: number) {
    return this.request<Record<string, unknown>[]>(`/api/collections/${collectionId}/references`);
  }

  saveReference(collectionId: number, input: {
    videoId: string;
    kind?: string;
    notes?: string | null;
    tags?: string[];
  }) {
    return this.request<Record<string, unknown>>(`/api/collections/${collectionId}/references`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  removeReference(collectionId: number, referenceId: number) {
    return this.request<void>(`/api/collections/${collectionId}/references/${referenceId}`, {
      method: "DELETE",
    });
  }

  async exportCollection(collectionId: number, format: "json" | "csv" = "json") {
    const response = await this.fetchImpl(`${this.baseUrl}/api/collections/${collectionId}/export?format=${format}`, {
      headers: {
        ...(this.apiKey ? { "x-api-key": this.apiKey } : {}),
      },
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    if (format === "json") {
      return response.json() as Promise<Record<string, unknown>>;
    }

    return response.text();
  }

  importReferenceVideo(collectionId: number, input: { videoId?: string | null; videoUrl?: string | null }) {
    return this.request<Record<string, unknown>>(`/api/collections/${collectionId}/references/import-video`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  listProjects() {
    return this.listCollections();
  }

  createProject(input: { name: string; niche?: string | null; primaryChannelInput?: string | null }) {
    return this.createCollection(input);
  }

  getProject(projectId: number) {
    return this.getCollection(projectId);
  }

  listProjectChannels() {
    return this.listTrackedChannels();
  }

  addChannelToProject(_projectId: number, input: { channelUrl?: string; channelId?: string; handle?: string; relationship?: string }) {
    return this.addTrackedChannel(input);
  }

  discoverChannels(_projectId: number, input: { query?: string; niche?: string; limit?: number; autoAttach?: boolean }) {
    return this.discoverTrackedChannels(input);
  }

  searchReferences(collectionId: number, input: Record<string, unknown>) {
    return this.request<Record<string, unknown>>(`/api/collections/${collectionId}/references/search`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  triggerScan(listId?: number) {
    return this.request<Record<string, unknown>>("/api/scan", {
      method: "POST",
      body: JSON.stringify(listId ? { listId } : {}),
    });
  }

  getScanStatus() {
    return this.request<Record<string, unknown>>("/api/scan/status");
  }
}
