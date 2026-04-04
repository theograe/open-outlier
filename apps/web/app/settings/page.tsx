"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";

type Provider = { id: number; name: string; provider: string; mode: string; model: string | null; isActive: number; hasApiKey: number };
type ImageSettings = { provider: string; configured: boolean; model: string };
type CharacterProfile = { id: number; name: string; description: string | null; faceSheetUrl: string | null; isDefault: boolean };

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [imageSettings, setImageSettings] = useState<ImageSettings | null>(null);
  const [profiles, setProfiles] = useState<CharacterProfile[]>([]);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("openai");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [embeddingsModel, setEmbeddingsModel] = useState("text-embedding-3-small");
  const [kieImageApiKey, setKieImageApiKey] = useState("");
  const [kieImageModel, setKieImageModel] = useState("nano-banana-2");
  const [profileName, setProfileName] = useState("");
  const [profileDescription, setProfileDescription] = useState("");
  const [profileFiles, setProfileFiles] = useState<FileList | null>(null);

  async function load() {
    const [settingsResponse, providerRows, imageSettingsResponse, profileRows] = await Promise.all([
      apiFetch<Record<string, unknown>>("/api/settings"),
      apiFetch<Provider[]>("/api/settings/llm-providers"),
      apiFetch<ImageSettings>("/api/settings/image-generation"),
      apiFetch<CharacterProfile[]>("/api/character-profiles"),
    ]);
    setSettings(settingsResponse);
    setProviders(providerRows);
    setImageSettings(imageSettingsResponse);
    setProfiles(profileRows);
    setEmbeddingsModel(String(settingsResponse.embeddingsModel ?? "text-embedding-3-small"));
    setKieImageModel(imageSettingsResponse.model);
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveProvider() {
    await apiFetch("/api/settings/llm-providers", {
      method: "POST",
      body: JSON.stringify({ name, provider, apiKey, model, setActive: true }),
    });
    setName("");
    setApiKey("");
    setModel("");
    await load();
  }

  async function saveEmbeddingSettings() {
    await apiFetch("/api/settings", {
      method: "PUT",
      body: JSON.stringify({ embeddingsModel }),
    });
    await load();
  }

  async function saveKieImageSettings() {
    await apiFetch("/api/settings/image-generation", {
      method: "PUT",
      body: JSON.stringify({ apiKey: kieImageApiKey, model: kieImageModel }),
    });
    setKieImageApiKey("");
    await load();
  }

  async function createProfile() {
    if (!profileName.trim() || !profileFiles?.length) return;
    const formData = new FormData();
    formData.append("name", profileName);
    formData.append("description", profileDescription);
    for (const file of Array.from(profileFiles)) {
      formData.append(file.name, file);
    }
    await apiFetch("/api/character-profiles", {
      method: "POST",
      body: formData,
    });
    setProfileName("");
    setProfileDescription("");
    setProfileFiles(null);
    await load();
  }

  async function setDefaultProfile(id: number) {
    await apiFetch(`/api/character-profiles/${id}/default`, { method: "POST" });
    await load();
  }

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <div className="eyebrow">Settings</div>
          <h1 className="headline">Local config and provider wiring</h1>
        </div>
      </header>

      <section className="panel">
        <div className="form-grid">
          <label className="field">
            <span>Embeddings model</span>
            <input value={embeddingsModel} onChange={(event) => setEmbeddingsModel(event.target.value)} />
          </label>
          <div className="field" style={{ alignSelf: "end" }}>
            <button className="button" onClick={() => void saveEmbeddingSettings()}>Save embeddings config</button>
          </div>
        </div>
        <pre style={{ marginTop: 18 }}>{JSON.stringify(settings, null, 2)}</pre>
      </section>

      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Kie Nano Banana 2 image generation</h2>
        <div className="form-grid">
          <label className="field">
            <span>Kie API key</span>
            <input value={kieImageApiKey} onChange={(event) => setKieImageApiKey(event.target.value)} placeholder="kie_..." />
          </label>
          <label className="field">
            <span>Kie model</span>
            <input value={kieImageModel} onChange={(event) => setKieImageModel(event.target.value)} placeholder="nano-banana-2" />
          </label>
          <div className="field" style={{ alignSelf: "end" }}>
            <button className="button" onClick={() => void saveKieImageSettings()}>Save image config</button>
          </div>
        </div>
        {imageSettings ? <div className="metrics" style={{ marginTop: 12 }}><span className="pill">{imageSettings.provider}</span><span className="pill">{imageSettings.configured ? "configured" : "not configured"}</span><span className="pill">{imageSettings.model}</span></div> : null}
      </section>

      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Character profiles</h2>
        <p className="subtle">Upload 3-6 face images from multiple angles. OpenOutlier will generate a neutral HD face sheet and reuse it for consistent thumbnails.</p>
        <div className="form-grid">
          <label className="field">
            <span>Profile name</span>
            <input value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder="Theo presenter" />
          </label>
          <label className="field">
            <span>Description</span>
            <input value={profileDescription} onChange={(event) => setProfileDescription(event.target.value)} placeholder="Neutral face, no glasses" />
          </label>
          <label className="field">
            <span>Face images</span>
            <input type="file" accept="image/*" multiple onChange={(event) => setProfileFiles(event.target.files)} />
          </label>
          <div className="field" style={{ alignSelf: "end" }}>
            <button className="button" onClick={() => void createProfile()}>Create profile + face sheet</button>
          </div>
        </div>

        <div className="list" style={{ marginTop: 18 }}>
          {profiles.map((profile) => (
            <div className="panel alt" key={profile.id}>
              <div className="list-row" style={{ borderBottom: 0, paddingBottom: 0 }}>
                <div>
                  <strong>{profile.name}</strong>
                  <div className="subtle">{profile.description ?? "No description"}</div>
                </div>
                <div className="metrics">
                  {profile.isDefault ? <span className="pill fire">default</span> : <button className="button secondary" onClick={() => void setDefaultProfile(profile.id)}>Make default</button>}
                </div>
              </div>
              {profile.faceSheetUrl ? (
                <div className="vision-board" style={{ marginTop: 12 }}>
                  <div className="vision-item">
                    <img src={profile.faceSheetUrl} alt={`${profile.name} face sheet`} />
                  </div>
                </div>
              ) : (
                <div className="subtle" style={{ marginTop: 12 }}>Face sheet not generated yet.</div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2 style={{ marginTop: 0 }}>LLM providers</h2>
        <div className="form-grid">
          <label className="field">
            <span>Name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="OpenAI local" />
          </label>
          <label className="field">
            <span>Provider</span>
            <select value={provider} onChange={(event) => setProvider(event.target.value)}>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="openrouter">OpenRouter</option>
            </select>
          </label>
          <label className="field">
            <span>Model</span>
            <input value={model} onChange={(event) => setModel(event.target.value)} placeholder="gpt-4.1-mini" />
          </label>
          <label className="field">
            <span>API key</span>
            <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-..." />
          </label>
          <div className="field" style={{ alignSelf: "end" }}>
            <button className="button" onClick={() => void saveProvider()}>Save provider</button>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="list">
          {providers.map((item) => (
            <div className="list-row" key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <div className="subtle">{item.provider} · {item.model ?? "default model"}</div>
              </div>
              <div className="metrics">
                <span className="pill">{item.mode}</span>
                <span className="pill">{item.hasApiKey ? "key configured" : "oauth placeholder"}</span>
                {item.isActive ? <span className="pill fire">active</span> : null}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
