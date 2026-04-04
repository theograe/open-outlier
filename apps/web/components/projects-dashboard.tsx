"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";

type ProjectSummary = {
  id: number;
  name: string;
  niche: string | null;
  status: string;
  primaryChannelId: string | null;
  primaryChannelName: string | null;
  sourceSetCount: number;
  referenceCount: number;
  workflowRunCount: number;
};

type ProjectDetail = {
  id: number;
  name: string;
  niche: string | null;
  primaryChannelId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  sourceSets: Array<{
    id: number;
    name: string;
    role: string;
    discoveryMode: string;
    backingListId: number | null;
    channelCount: number;
  }>;
  references: Array<{
    id: number;
    videoId: string;
    title: string;
    channelName: string;
    thumbnailUrl: string | null;
    outlierScore: number;
    kind: string;
    notes: string | null;
    tags: string[];
    createdAt: string;
  }>;
};

type SourceSetDetail = {
  id: number;
  projectId: number;
  backingListId: number | null;
  name: string;
  role: string;
  discoveryMode: string;
  channels: Array<{
    id: string;
    name: string;
    handle: string | null;
    subscriberCount: number | null;
    thumbnailUrl: string | null;
  }>;
};

type DiscoveryResult = {
  sourceSetId: number;
  query: string;
  suggestions: Array<{
    channelId: string;
    channelName: string;
    handle: string | null;
    subscriberCount: number;
    thumbnailUrl: string | null;
  }>;
  attachedCount: number;
};

type WorkflowRun = {
  id: number;
  status: string;
  currentStage: string;
  output: Record<string, unknown>;
  completedAt: string | null;
};

function conceptSummary(output: Record<string, unknown> | undefined) {
  const stage = output?.concept_adaptation;
  if (!stage || typeof stage !== "object") return null;
  const concept = (stage as Record<string, unknown>).concept;
  if (!concept || typeof concept !== "object") return null;
  return concept as Record<string, unknown>;
}

export function ProjectsDashboard() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectDetail | null>(null);
  const [selectedSourceSet, setSelectedSourceSet] = useState<SourceSetDetail | null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryResult | null>(null);
  const [latestWorkflow, setLatestWorkflow] = useState<WorkflowRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [projectName, setProjectName] = useState("");
  const [projectNiche, setProjectNiche] = useState("");
  const [primaryChannelInput, setPrimaryChannelInput] = useState("");
  const [channelInput, setChannelInput] = useState("");
  const [discoveryQuery, setDiscoveryQuery] = useState("");
  const [sourceSetName, setSourceSetName] = useState("");
  const [seedVideoUrl, setSeedVideoUrl] = useState("");
  const [adaptationContext, setAdaptationContext] = useState("");

  const selectedSourceSetId = selectedSourceSet?.id ?? selectedProject?.sourceSets[0]?.id ?? null;

  async function hydrateProject(projectId: number) {
    const detail = await apiFetch<ProjectDetail>(`/api/projects/${projectId}`);
    setSelectedProject(detail);
    const sourceSetId = detail.sourceSets[0]?.id;
    if (sourceSetId) {
      setSelectedSourceSet(await apiFetch<SourceSetDetail>(`/api/source-sets/${sourceSetId}`));
    } else {
      setSelectedSourceSet(null);
    }
    setDiscovery(null);
  }

  async function loadProjects(preferredProjectId?: number) {
    setLoading(true);
    setError(null);
    try {
      const rows = await apiFetch<ProjectSummary[]>("/api/projects");
      setProjects(rows);
      const targetId = preferredProjectId ?? selectedProject?.id ?? rows[0]?.id;
      if (targetId) {
        await hydrateProject(targetId);
      } else {
        setSelectedProject(null);
        setSelectedSourceSet(null);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load projects.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProjects();
  }, []);

  async function createProject() {
    if (!projectName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const project = await apiFetch<ProjectDetail>("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name: projectName.trim(),
          niche: projectNiche.trim() || null,
          primaryChannelInput: primaryChannelInput.trim() || null,
        }),
      });
      setProjectName("");
      setProjectNiche("");
      setPrimaryChannelInput("");
      await loadProjects(project.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create project.");
    } finally {
      setLoading(false);
    }
  }

  async function createSourceSet() {
    if (!selectedProject || !sourceSetName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await apiFetch(`/api/projects/${selectedProject.id}/source-sets`, {
        method: "POST",
        body: JSON.stringify({
          name: sourceSetName.trim(),
          role: "competitors",
        }),
      });
      setSourceSetName("");
      await hydrateProject(selectedProject.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create source set.");
    } finally {
      setLoading(false);
    }
  }

  async function addChannelToSourceSet(rawInput: string) {
    if (!selectedSourceSet || !rawInput.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const payload = rawInput.startsWith("@")
        ? { handle: rawInput }
        : rawInput.includes("youtube.com")
          ? { channelUrl: rawInput }
          : { channelId: rawInput };
      await apiFetch(`/api/source-sets/${selectedSourceSet.id}/channels`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setChannelInput("");
      setSelectedSourceSet(await apiFetch<SourceSetDetail>(`/api/source-sets/${selectedSourceSet.id}`));
      await loadProjects(selectedProject?.id);
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Failed to add channel.");
    } finally {
      setLoading(false);
    }
  }

  async function discoverChannels() {
    if (!selectedSourceSet) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<DiscoveryResult>(`/api/source-sets/${selectedSourceSet.id}/discover`, {
        method: "POST",
        body: JSON.stringify({
          query: discoveryQuery.trim() || selectedProject?.niche || undefined,
          limit: 8,
          autoAttach: false,
        }),
      });
      setDiscovery(result);
    } catch (discoverError) {
      setError(discoverError instanceof Error ? discoverError.message : "Failed to discover channels.");
    } finally {
      setLoading(false);
    }
  }

  async function attachSuggestedChannel(channelId: string) {
    await addChannelToSourceSet(channelId);
    if (discovery) {
      setDiscovery({
        ...discovery,
        suggestions: discovery.suggestions.filter((suggestion) => suggestion.channelId !== channelId),
      });
    }
  }

  async function runSeedWorkflow() {
    if (!selectedProject || !selectedSourceSetId || !seedVideoUrl.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const workflow = await apiFetch<WorkflowRun>("/api/workflow-runs/run-auto", {
        method: "POST",
        body: JSON.stringify({
          projectId: selectedProject.id,
          sourceSetId: selectedSourceSetId,
          seedVideoUrl: seedVideoUrl.trim(),
          stopAfterStage: "concept_adaptation",
          input: {
            adaptationContext: adaptationContext.trim() || selectedProject.niche || "Adapt this outlier for the target niche and generate titles plus thumbnail direction.",
          },
        }),
      });
      setLatestWorkflow(workflow);
      await hydrateProject(selectedProject.id);
    } catch (workflowError) {
      setError(workflowError instanceof Error ? workflowError.message : "Failed to run workflow.");
    } finally {
      setLoading(false);
    }
  }

  const selectedSummary = useMemo(
    () => projects.find((project) => project.id === selectedProject?.id) ?? null,
    [projects, selectedProject?.id],
  );

  const latestConcept = conceptSummary(latestWorkflow?.output);

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <div className="eyebrow">Projects</div>
          <h1 className="headline">Run OpenOutlier like a workflow engine</h1>
          <p className="subtle">Projects and source sets are the new control plane for agent-driven research, adaptation, and thumbnail creation.</p>
        </div>
      </header>

      {error ? <section className="panel" style={{ borderColor: "rgba(255, 127, 102, 0.4)", color: "#ffd7d0" }}>{error}</section> : null}

      <section className="panel">
        <div className="form-grid">
          <label className="field">
            <span>Project name</span>
            <input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Editing Ideas Lab" />
          </label>
          <label className="field">
            <span>Niche</span>
            <input value={projectNiche} onChange={(event) => setProjectNiche(event.target.value)} placeholder="English editing education" />
          </label>
          <label className="field">
            <span>Primary channel</span>
            <input value={primaryChannelInput} onChange={(event) => setPrimaryChannelInput(event.target.value)} placeholder="@yourchannel or youtube.com/@yourchannel" />
          </label>
          <div className="field" style={{ alignSelf: "end" }}>
            <button className="button" disabled={loading} onClick={() => void createProject()}>Create project</button>
          </div>
        </div>
      </section>

      <div className="grid-2" style={{ gridTemplateColumns: "minmax(0, 1.15fr) minmax(320px, 0.85fr)" }}>
        <section className="panel">
          <div className="list">
            {projects.map((project) => (
              <button
                key={project.id}
                className="list-row"
                style={{ background: "transparent", border: 0, color: "inherit", textAlign: "left" }}
                onClick={() => void hydrateProject(project.id)}
              >
                <div>
                  <strong>{project.name}</strong>
                  <div className="subtle">{project.niche ?? "No niche yet"}</div>
                </div>
                <div className="metrics">
                  <span className="pill">{project.sourceSetCount} sets</span>
                  <span className="pill">{project.referenceCount} refs</span>
                </div>
              </button>
            ))}
            {projects.length === 0 && !loading ? <div className="subtle">Create your first project to start tracking channels and running workflows.</div> : null}
          </div>
        </section>

        <section className="panel alt">
          <div className="eyebrow">Selected project</div>
          <h2 style={{ marginTop: 8 }}>{selectedProject?.name ?? "Choose a project"}</h2>
          {selectedProject ? (
            <div className="stack">
              <div className="metrics">
                <span className="pill">{selectedSummary?.status ?? selectedProject.status}</span>
                {selectedProject.niche ? <span className="pill">{selectedProject.niche}</span> : null}
                {selectedSummary?.primaryChannelName ? <span className="pill">Primary: {selectedSummary.primaryChannelName}</span> : null}
              </div>

              <label className="field">
                <span>Create another source set</span>
                <div className="toolbar">
                  <input value={sourceSetName} onChange={(event) => setSourceSetName(event.target.value)} placeholder="Short-form editors" />
                  <button className="button secondary" disabled={loading} onClick={() => void createSourceSet()}>Add set</button>
                </div>
              </label>

              <div className="metrics">
                {selectedProject.sourceSets.map((sourceSet) => (
                  <button
                    key={sourceSet.id}
                    className={`filter-chip ${selectedSourceSet?.id === sourceSet.id ? "active" : ""}`}
                    onClick={() => void apiFetch<SourceSetDetail>(`/api/source-sets/${sourceSet.id}`).then(setSelectedSourceSet)}
                  >
                    {sourceSet.name} ({sourceSet.channelCount})
                  </button>
                ))}
              </div>

              {selectedSourceSet ? (
                <div className="stack">
                  <div className="panel">
                    <div className="eyebrow">Source set</div>
                    <h3 style={{ marginTop: 8 }}>{selectedSourceSet.name}</h3>
                    <div className="toolbar">
                      <label className="field">
                        <span>Add channel URL, handle, or ID</span>
                        <input value={channelInput} onChange={(event) => setChannelInput(event.target.value)} placeholder="@creator or https://youtube.com/@creator" />
                      </label>
                      <div className="field" style={{ alignSelf: "end" }}>
                        <button className="button" disabled={loading} onClick={() => void addChannelToSourceSet(channelInput)}>Add channel</button>
                      </div>
                    </div>
                    <div className="toolbar" style={{ marginTop: 10 }}>
                      <label className="field">
                        <span>Discover competitors automatically</span>
                        <input value={discoveryQuery} onChange={(event) => setDiscoveryQuery(event.target.value)} placeholder={selectedProject.niche ?? "premiere pro tutorials"} />
                      </label>
                      <div className="field" style={{ alignSelf: "end" }}>
                        <button className="button secondary" disabled={loading} onClick={() => void discoverChannels()}>Find channels</button>
                      </div>
                    </div>
                    <div className="list" style={{ marginTop: 14 }}>
                      {selectedSourceSet.channels.map((channel) => (
                        <div key={channel.id} className="list-row">
                          <div>
                            <strong>{channel.name}</strong>
                            <div className="subtle">{channel.handle ?? channel.id}</div>
                          </div>
                          <span className="pill">{Number(channel.subscriberCount ?? 0).toLocaleString()} subs</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {discovery ? (
                    <div className="panel">
                      <div className="eyebrow">Suggestions</div>
                      <h3 style={{ marginTop: 8 }}>Channels for “{discovery.query}”</h3>
                      <div className="list">
                        {discovery.suggestions.map((channel) => (
                          <div key={channel.channelId} className="list-row">
                            <div>
                              <strong>{channel.channelName}</strong>
                              <div className="subtle">{channel.handle ?? channel.channelId}</div>
                            </div>
                            <div className="metrics">
                              <span className="pill">{channel.subscriberCount.toLocaleString()} subs</span>
                              <button className="button secondary" disabled={loading} onClick={() => void attachSuggestedChannel(channel.channelId)}>Track</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="subtle">This project does not have a source set yet.</div>
              )}
            </div>
          ) : (
            <div className="subtle">Select a project to manage sources, references, and workflow runs.</div>
          )}
        </section>
      </div>

      {selectedProject ? (
        <div className="grid-2" style={{ gridTemplateColumns: "minmax(0, 1.1fr) minmax(320px, 0.9fr)" }}>
          <section className="panel">
            <div className="eyebrow">Agent runner</div>
            <h2 style={{ marginTop: 8 }}>Start from one reference video</h2>
            <p className="subtle">This is the shortest path for an external agent: ingest a single YouTube video, adapt it for the niche, and return final ideas, titles, and thumbnail direction.</p>
            <div className="form-grid">
              <label className="field filter-span-2">
                <span>Seed video URL</span>
                <input value={seedVideoUrl} onChange={(event) => setSeedVideoUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=..." />
              </label>
              <label className="field filter-span-2">
                <span>Adaptation context</span>
                <textarea rows={4} value={adaptationContext} onChange={(event) => setAdaptationContext(event.target.value)} placeholder="Adapt this for editing educators who want high-CTR service-led content." />
              </label>
              <div className="field" style={{ alignSelf: "end" }}>
                <button className="button" disabled={loading} onClick={() => void runSeedWorkflow()}>Run workflow</button>
              </div>
            </div>

            {latestConcept ? (
              <div className="panel alt" style={{ marginTop: 16 }}>
                <div className="eyebrow">Latest concept run</div>
                <div className="subtle" style={{ marginTop: 8 }}>Workflow #{latestWorkflow?.id} • {latestWorkflow?.status}</div>
                {"idea" in latestConcept ? <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(latestConcept.idea, null, 2)}</pre> : null}
                {"titles" in latestConcept ? <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(latestConcept.titles, null, 2)}</pre> : null}
                {"thumbnailBrief" in latestConcept ? <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(latestConcept.thumbnailBrief, null, 2)}</pre> : null}
              </div>
            ) : null}
          </section>

          <section className="panel alt">
            <div className="eyebrow">Recent references</div>
            <h2 style={{ marginTop: 8 }}>Saved inspiration</h2>
            <div className="list">
              {selectedProject.references.map((reference) => (
                <div key={reference.id} className="list-row">
                  <div>
                    <strong>{reference.title}</strong>
                    <div className="subtle">{reference.channelName}</div>
                  </div>
                  <div className="metrics">
                    <span className="pill">{reference.outlierScore.toFixed(1)}x</span>
                    <a className="button secondary" href={`https://youtube.com/watch?v=${reference.videoId}`} target="_blank" rel="noreferrer">Open</a>
                  </div>
                </div>
              ))}
              {selectedProject.references.length === 0 ? <div className="subtle">No references yet. Run a workflow or save outliers from Discover.</div> : null}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
