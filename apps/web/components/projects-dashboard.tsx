"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

export type ProjectSummary = {
  id: number;
  name: string;
  niche: string | null;
  primaryChannelName: string | null;
  channelCount: number;
  referenceCount: number;
  previewThumbnailUrl: string | null;
};

export function ProjectsDashboard({ initialProjects = [], mode = "projects" }: { initialProjects?: ProjectSummary[]; mode?: "projects" | "collections" }) {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>(initialProjects);
  const [error, setError] = useState<string | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<number | null>(null);
  const singular = mode === "collections" ? "collection" : "project";
  const plural = mode === "collections" ? "Collections" : "Projects";
  const basePath = mode === "collections" ? "/collections" : "/projects";

  useEffect(() => {
    if (initialProjects.length > 0) {
      return;
    }
    void apiFetch<ProjectSummary[]>(mode === "collections" ? "/api/collections" : "/api/projects")
      .then(setProjects)
      .catch((fetchError) => setError(fetchError instanceof Error ? fetchError.message : `Failed to load ${plural.toLowerCase()}.`));
  }, [initialProjects, mode, plural]);

  async function deleteProject(projectId: number, projectName: string) {
    const confirmed = window.confirm(`Delete "${projectName}"? This will remove its saved videos from OpenOutlier.`);
    if (!confirmed) {
      return;
    }

    setDeletingProjectId(projectId);
    setError(null);

    try {
      await apiFetch(`${basePath}/${projectId}`, {
        method: "DELETE",
      });
      setProjects((current) => current.filter((project) => project.id !== projectId));
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : `Failed to delete ${singular}.`);
    } finally {
      setDeletingProjectId(null);
    }
  }

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <div className="eyebrow">{plural}</div>
          <h1 className="headline">{plural}</h1>
        </div>
        {mode === "collections" ? null : <Link className="button" href={`${basePath}/new`}>New project</Link>}
      </header>

      {error ? <section className="panel">{error}</section> : null}

      <section className="project-grid">
        {projects.map((project) => (
          <article key={project.id} className="project-card">
            <div className="project-card-actions">
              <button
                type="button"
                className="project-card-delete"
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void deleteProject(project.id, project.name);
                }}
                disabled={deletingProjectId === project.id}
                aria-label={`Delete ${project.name}`}
              >
                {deletingProjectId === project.id ? "…" : "Delete"}
              </button>
            </div>
            <Link href={`${basePath}/${project.id}`} className="project-card-link">
              {project.previewThumbnailUrl ? (
                <img src={project.previewThumbnailUrl} alt={project.name} className="project-card-preview" />
              ) : (
                <div className="project-card-preview project-card-preview-empty">
                  <span>No saved videos yet</span>
                </div>
              )}
              <div className="project-card-body">
                <div className="project-card-head">
                  <strong className="project-card-title">{project.name}</strong>
                  <span className="pill">{project.referenceCount} saved</span>
                </div>
              </div>
            </Link>
          </article>
        ))}

        <Link href={`${basePath}/new`} className="project-card project-card-new">
          <span className="project-plus">+</span>
          <strong>{mode === "collections" ? "New collection" : "New project"}</strong>
          {mode === "collections" ? null : <span className="subtle">Create a new niche tracker</span>}
        </Link>
      </section>

      {projects.length === 0 ? <section className="panel alt">No {plural.toLowerCase()} yet. Create one to get started.</section> : null}
    </div>
  );
}
