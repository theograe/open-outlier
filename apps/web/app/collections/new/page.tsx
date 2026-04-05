"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../../lib/api";
import { ChannelAvatar } from "../../../components/channel-avatar";

type CreatedCollection = { id: number };

type TrackedChannel = {
  id: string;
  name: string;
  handle: string | null;
  subscriberCount: number;
  thumbnailUrl: string | null;
  relationship: string;
};

type SuggestedChannel = {
  channelId: string;
  channelName: string;
  handle: string | null;
  subscriberCount: number;
  thumbnailUrl?: string | null;
};

type DiscoverChannelsResponse = {
  query: string;
  suggestions: SuggestedChannel[];
};

const steps = [
  { key: "setup", label: "Setup" },
  { key: "competitors", label: "Competitors" },
  { key: "expand", label: "Expand" },
] as const;

function formatCompactNumber(value?: number): string {
  if (!value) return "0";
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export default function NewCollectionPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [collectionId, setCollectionId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [niche, setNiche] = useState("");
  const [channel, setChannel] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [recommended, setRecommended] = useState<SuggestedChannel[]>([]);
  const [searchResults, setSearchResults] = useState<SuggestedChannel[]>([]);
  const [adjacentSuggestions, setAdjacentSuggestions] = useState<SuggestedChannel[]>([]);
  const [trackedChannels, setTrackedChannels] = useState<TrackedChannel[]>([]);
  const [creating, setCreating] = useState(false);
  const [searching, setSearching] = useState(false);
  const [expanding, setExpanding] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [pendingChannelIds, setPendingChannelIds] = useState<string[]>([]);
  const [error, setError] = useState("");

  const trackedIds = useMemo(() => new Set(trackedChannels.map((channelItem) => channelItem.id)), [trackedChannels]);

  async function loadTrackedChannels() {
    const channels = await apiFetch<TrackedChannel[]>("/api/tracked-channels");
    setTrackedChannels(channels);
    return channels;
  }

  async function discoverChannels(queryValue: string, limit = 18) {
    const response = await apiFetch<DiscoverChannelsResponse>("/api/tracked-channels/discover", {
      method: "POST",
      body: JSON.stringify({
        query: queryValue,
        limit,
      }),
    });

    return response.suggestions;
  }

  async function createBaseCollection() {
    if (!name.trim()) return;
    setCreating(true);
    setError("");

    try {
      const collection = await apiFetch<CreatedCollection>("/api/collections", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          niche: niche.trim() || null,
          primaryChannelInput: channel.trim() || null,
        }),
      });

      setCollectionId(collection.id);
      const currentTracked = await loadTrackedChannels();
      const queryValue = niche.trim() || channel.trim() || name.trim();
      const suggestions = queryValue ? await discoverChannels(queryValue, 18) : [];
      setRecommended(suggestions.filter((item) => !currentTracked.some((tracked) => tracked.id === item.channelId)));
      setStep(1);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create collection.");
    } finally {
      setCreating(false);
    }
  }

  async function addTrackedChannel(channelId: string) {
    if (trackedIds.has(channelId) || pendingChannelIds.includes(channelId)) {
      return;
    }

    setPendingChannelIds((current) => [...current, channelId]);
    setError("");

    try {
      await apiFetch("/api/tracked-channels", {
        method: "POST",
        body: JSON.stringify({
          channelId,
          relationship: "competitor",
        }),
      });
      await loadTrackedChannels();
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Failed to add channel.");
    } finally {
      setPendingChannelIds((current) => current.filter((id) => id !== channelId));
    }
  }

  async function searchChannels() {
    if (!searchQuery.trim()) {
      return;
    }

    setSearching(true);
    setError("");
    try {
      const suggestions = await discoverChannels(searchQuery.trim(), 20);
      setSearchResults(suggestions);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Failed to search channels.");
    } finally {
      setSearching(false);
    }
  }

  async function loadAdjacent() {
    setExpanding(true);
    setError("");
    try {
      const baseTerms = [
        niche.trim(),
        ...trackedChannels.slice(0, 4).map((channelItem) => channelItem.name),
      ].filter(Boolean);
      const queryValue = baseTerms.join(" ");
      const suggestions = queryValue ? await discoverChannels(queryValue, 36) : [];
      setAdjacentSuggestions(suggestions.filter((item) => !trackedIds.has(item.channelId)));
      setStep(2);
    } catch (expandError) {
      setError(expandError instanceof Error ? expandError.message : "Failed to load adjacent channels.");
    } finally {
      setExpanding(false);
    }
  }

  async function addVisibleAdjacent() {
    const candidates = adjacentSuggestions
      .filter((item) => !trackedIds.has(item.channelId))
      .slice(0, 20);

    for (const item of candidates) {
      await addTrackedChannel(item.channelId);
    }
  }

  async function finishSetup() {
    if (!collectionId) {
      return;
    }

    setFinishing(true);
    setError("");
    try {
      await apiFetch("/api/scan", {
        method: "POST",
      }).catch(() => undefined);
      router.push(`/collections/${collectionId}`);
    } catch (finishError) {
      setError(finishError instanceof Error ? finishError.message : "Failed to finish setup.");
    } finally {
      setFinishing(false);
    }
  }

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <div className="eyebrow">Collections</div>
          <h1 className="headline">Create a collection</h1>
          <div className="subtle">Add your channel, pick a handful of competitors, then let OpenOutlier widen the niche from there.</div>
        </div>
      </header>

      {error ? <section className="panel">{error}</section> : null}

      <section className="panel stack">
        <div className="wizard-steps">
          {steps.map((item, index) => (
            <div key={item.key} className={`wizard-step ${index === step ? "active" : index < step ? "done" : ""}`}>
              <span>{index + 1}</span>
              <strong>{item.label}</strong>
            </div>
          ))}
        </div>

        {step === 0 ? (
          <div className="stack">
            <div className="field">
              <span>Collection name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Editing ideas" />
            </div>
            <div className="field">
              <span>Your niche</span>
              <input value={niche} onChange={(event) => setNiche(event.target.value)} placeholder="English video editing tutorials" />
            </div>
            <div className="field">
              <span>Your YouTube channel</span>
              <input value={channel} onChange={(event) => setChannel(event.target.value)} placeholder="@yourchannel or youtube.com/@yourchannel" />
            </div>

            <div className="simple-toolbar">
              <button className="button" disabled={creating || !name.trim()} onClick={() => void createBaseCollection()}>
                {creating ? "Creating..." : "Continue"}
              </button>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="stack">
            <div className="onboarding-header-row">
              <div>
                <h2 className="connection-title">Pick your first competitors</h2>
                <div className="subtle">Add 5 to 10 strong channels in your niche. Browse will use these globally for tracked and adjacent discovery.</div>
              </div>
              <div className="pill">{trackedChannels.length} tracked</div>
            </div>

            <div className="simple-toolbar">
              <input
                className="search-input grow"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void searchChannels();
                  }
                }}
                placeholder="Search YouTube channels yourself"
              />
              <button className="button secondary" disabled={searching || !searchQuery.trim()} onClick={() => void searchChannels()}>
                {searching ? "Searching..." : "Search"}
              </button>
            </div>

            {recommended.length > 0 ? (
              <div className="stack">
                <div className="eyebrow">Recommended competitors</div>
                <div className="onboarding-channel-grid">
                  {recommended.map((item) => (
                    <article key={item.channelId} className="onboarding-channel-card">
                      <ChannelAvatar src={item.thumbnailUrl ?? null} alt={item.channelName} name={item.channelName} className="onboarding-channel-avatar" />
                      <div className="onboarding-channel-body">
                        <strong>{item.channelName}</strong>
                        <div className="subtle">{item.handle ?? ""}</div>
                        <div className="pill">{formatCompactNumber(item.subscriberCount)} subs</div>
                      </div>
                      <button
                        type="button"
                        className={`button secondary ${trackedIds.has(item.channelId) ? "is-success" : ""}`}
                        disabled={trackedIds.has(item.channelId) || pendingChannelIds.includes(item.channelId)}
                        onClick={() => void addTrackedChannel(item.channelId)}
                      >
                        {pendingChannelIds.includes(item.channelId) ? "Adding..." : trackedIds.has(item.channelId) ? "Tracked" : "Track"}
                      </button>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            {searchResults.length > 0 ? (
              <div className="stack">
                <div className="eyebrow">Search results</div>
                <div className="onboarding-channel-grid">
                  {searchResults.map((item) => (
                    <article key={item.channelId} className="onboarding-channel-card">
                      <ChannelAvatar src={item.thumbnailUrl ?? null} alt={item.channelName} name={item.channelName} className="onboarding-channel-avatar" />
                      <div className="onboarding-channel-body">
                        <strong>{item.channelName}</strong>
                        <div className="subtle">{item.handle ?? ""}</div>
                        <div className="pill">{formatCompactNumber(item.subscriberCount)} subs</div>
                      </div>
                      <button
                        type="button"
                        className={`button secondary ${trackedIds.has(item.channelId) ? "is-success" : ""}`}
                        disabled={trackedIds.has(item.channelId) || pendingChannelIds.includes(item.channelId)}
                        onClick={() => void addTrackedChannel(item.channelId)}
                      >
                        {pendingChannelIds.includes(item.channelId) ? "Adding..." : trackedIds.has(item.channelId) ? "Tracked" : "Track"}
                      </button>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="simple-toolbar">
              <button className="button secondary" onClick={() => setStep(0)}>Back</button>
              <button className="button" disabled={trackedChannels.length < 5 || expanding} onClick={() => void loadAdjacent()}>
                {expanding ? "Finding adjacent..." : "Continue"}
              </button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="stack">
            <div className="onboarding-header-row">
              <div>
                <h2 className="connection-title">Expand the niche</h2>
                <div className="subtle">These are adjacent creators OpenOutlier found from your niche and first tracked channels.</div>
              </div>
              <button className="button secondary" disabled={pendingChannelIds.length > 0} onClick={() => void addVisibleAdjacent()}>
                Add a batch
              </button>
            </div>

            <div className="onboarding-channel-grid">
              {adjacentSuggestions.map((item) => (
                <article key={item.channelId} className="onboarding-channel-card">
                  <ChannelAvatar src={item.thumbnailUrl ?? null} alt={item.channelName} name={item.channelName} className="onboarding-channel-avatar" />
                  <div className="onboarding-channel-body">
                    <strong>{item.channelName}</strong>
                    <div className="subtle">{item.handle ?? ""}</div>
                    <div className="pill">{formatCompactNumber(item.subscriberCount)} subs</div>
                  </div>
                  <button
                    type="button"
                    className={`button secondary ${trackedIds.has(item.channelId) ? "is-success" : ""}`}
                    disabled={trackedIds.has(item.channelId) || pendingChannelIds.includes(item.channelId)}
                    onClick={() => void addTrackedChannel(item.channelId)}
                  >
                    {pendingChannelIds.includes(item.channelId) ? "Adding..." : trackedIds.has(item.channelId) ? "Tracked" : "Track"}
                  </button>
                </article>
              ))}
            </div>

            <div className="simple-toolbar">
              <button className="button secondary" onClick={() => setStep(1)}>Back</button>
              <button className="button" disabled={finishing || !collectionId} onClick={() => void finishSetup()}>
                {finishing ? "Finishing..." : "Finish"}
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
