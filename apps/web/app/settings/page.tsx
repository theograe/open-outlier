"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";

type SettingsResponse = {
  productName: string;
  youtubeApiKeyConfigured: boolean;
  apiKeyConfigured: boolean;
  openAiApiKeyConfigured: boolean;
};

type ScanStatus = {
  running: boolean;
  currentRun: null | {
    startedAt: string;
    progressCurrent: number;
    progressTotal: number;
    message: string;
  };
  lastRun: null | {
    status: string;
    completedAt: string | null;
    message: string | null;
  };
};

function ConnectionCard({
  label,
  description,
  ready,
  required = false,
}: {
  label: string;
  description: string;
  ready: boolean;
  required?: boolean;
}) {
  return (
    <div className="connection-card">
      <div className="connection-card-row">
        <strong>{label}</strong>
        <span className={`connection-status ${ready ? "ready" : "missing"}`}>{ready ? "Connected" : "Missing"}</span>
      </div>
      <div className="subtle">{description}</div>
      {required ? <div className="connection-required">Required</div> : <div className="connection-required optional">Optional</div>}
    </div>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanStarted, setScanStarted] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const [settingsResponse, scanStatusResponse] = await Promise.all([
      apiFetch<SettingsResponse>("/api/settings"),
      apiFetch<ScanStatus>("/api/scan/status"),
    ]);

    setSettings(settingsResponse);
    setScanStatus(scanStatusResponse);
  }

  useEffect(() => {
    void load();
  }, []);

  async function runScanNow() {
    setScanLoading(true);
    setScanStarted(false);
    setError("");

    try {
      await apiFetch("/api/scan", {
        method: "POST",
      });
      setScanStarted(true);
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to start scan.");
    } finally {
      setScanLoading(false);
    }
  }

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <div className="eyebrow">Settings</div>
          <h1 className="headline">Connect your local OpenOutlier setup</h1>
          <p className="subtle">Add your keys to `.env`, restart the app, and OpenOutlier will auto-scan on startup when your data is stale.</p>
        </div>
      </header>

      {error ? <section className="panel">{error}</section> : null}

      <section className="connection-grid">
        <ConnectionCard
          label="YouTube API"
          description="Used to pull channels, videos, and outlier data."
          ready={Boolean(settings?.youtubeApiKeyConfigured)}
          required
        />
        <ConnectionCard
          label="OpenAI API"
          description="Used for topic similarity when embeddings are enabled."
          ready={Boolean(settings?.openAiApiKeyConfigured)}
        />
        <ConnectionCard
          label="Local API auth"
          description="Only needed if you want to protect your local API for agents or external tools."
          ready={Boolean(settings?.apiKeyConfigured)}
        />
      </section>

      <section className="panel connection-panel">
        <div className="connection-panel-head">
          <div>
            <div className="eyebrow">Local setup</div>
            <h2 className="connection-title">Put keys in `.env`</h2>
          </div>
          <button
            type="button"
            className={`button ${scanStarted ? "is-success" : ""}`}
            onClick={() => void runScanNow()}
            disabled={scanLoading || scanStarted}
          >
            {scanLoading ? "Starting..." : scanStarted ? "Scan started" : "Run scan now"}
          </button>
        </div>
        <pre className="env-snippet">{`YOUTUBE_API_KEY=...
OPENAI_API_KEY=...`}</pre>
        <div className="subtle">Restart the app after editing `.env`. On startup, OpenOutlier will run a scan automatically if you already have tracked channels and the last completed scan is older than 24 hours.</div>
      </section>

      <section className="panel connection-panel">
        <div className="eyebrow">Scan status</div>
        <div className="connection-status-list">
          <div className="connection-status-item">
            <span className="subtle">Current</span>
            <strong>{scanStatus?.running ? scanStatus.currentRun?.message ?? "Running" : "Idle"}</strong>
          </div>
          <div className="connection-status-item">
            <span className="subtle">Last run</span>
            <strong>{scanStatus?.lastRun?.completedAt ? new Date(scanStatus.lastRun.completedAt).toLocaleString() : "No completed scan yet"}</strong>
          </div>
        </div>
      </section>
    </div>
  );
}
