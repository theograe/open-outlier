"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../../lib/api";
import { OutlierCard } from "../../components/outlier-card";
import { ChannelAvatar } from "../../components/channel-avatar";

type Video = {
  videoId: string;
  title: string;
  channelName: string;
  channelId?: string;
  channelMedianViews?: number;
  trackedInProject?: boolean;
  thumbnailUrl?: string | null;
  views: number;
  outlierScore: number;
  viewVelocity: number;
  scoreBand: string;
  contentType: string;
  channelSubscribers?: number;
  durationSeconds?: number;
  publishedAt?: string | null;
};

type Collection = {
  id: number;
  name: string;
};

type Channel = {
  id: string;
  name: string;
  handle: string | null;
  thumbnailUrl?: string | null;
};

type DiscoverWarning = {
  code: "YOUTUBE_QUOTA_EXCEEDED";
  message: string;
};
type DiscoverPayload = { videos: Video[]; total: number; warning?: DiscoverWarning };

type FilterState = {
  search: string;
  seedChannelId: string;
  includeAdjacent: boolean;
  contentType: "all" | "long" | "short";
  minScore: string;
  maxScore: string;
  minViews: string;
  maxViews: string;
  minSubscribers: string;
  maxSubscribers: string;
  minDurationSeconds: string;
  maxDurationSeconds: string;
  days: string;
  sort: "score" | "views" | "date" | "momentum" | "subscribers";
  limit: string;
};

const defaultFilters: FilterState = {
  search: "",
  seedChannelId: "",
  includeAdjacent: true,
  contentType: "long",
  minScore: "1",
  maxScore: "",
  minViews: "",
  maxViews: "",
  minSubscribers: "",
  maxSubscribers: "",
  minDurationSeconds: "",
  maxDurationSeconds: "",
  days: "365",
  sort: "momentum",
  limit: "50",
};

const ALL_TRACKED_CHANNELS = "__all_tracked__";

const publicationPresets = [
  { label: "7d", days: "7" },
  { label: "30d", days: "30" },
  { label: "90d", days: "90" },
  { label: "6m", days: "180" },
  { label: "1y", days: "365" },
  { label: "2y", days: "730" },
];

function buildSteppedValues(segments: Array<{ start: number; end: number; step: number }>): number[] {
  const values: number[] = [];
  for (const segment of segments) {
    for (let value = segment.start; value <= segment.end; value += segment.step) {
      if (values[values.length - 1] !== value) {
        values.push(value);
      }
    }
  }
  return values;
}

function formatFilterNumber(value: string, fallback: string): string {
  if (!value) return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(numeric);
}

function formatDurationLabel(value: string, fallback: string): string {
  if (!value) return fallback;
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return fallback;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

type SliderFilterProps = {
  label: string;
  values: number[];
  lowValue: string;
  highValue: string;
  onLowChange: (value: string) => void;
  onHighChange: (value: string) => void;
  formatter: (value: string) => string;
};

function SliderFilter({
  label,
  values,
  lowValue,
  highValue,
  onLowChange,
  onHighChange,
  formatter,
}: SliderFilterProps) {
  const minIndex = 0;
  const maxIndex = values.length - 1;
  const findIndex = (value: string, fallback: number) => {
    if (value === "") return fallback;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    let bestIndex = fallback;
    let bestDistance = Number.POSITIVE_INFINITY;
    values.forEach((entry, index) => {
      const distance = Math.abs(entry - numeric);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    return bestIndex;
  };

  const lowIndex = Math.min(findIndex(lowValue, minIndex), maxIndex);
  const highIndex = Math.max(findIndex(highValue, maxIndex), lowIndex);
  const left = (lowIndex / maxIndex) * 100;
  const right = (highIndex / maxIndex) * 100;
  const thumbSize = 16;
  const thumbRadius = thumbSize / 2;
  const leftPosition = `calc(${thumbRadius}px + (${left} * (100% - ${thumbSize}px) / 100))`;
  const rightPosition = `calc(${thumbRadius}px + (${right} * (100% - ${thumbSize}px) / 100))`;

  const lowLabel = formatter(String(values[lowIndex] ?? values[0] ?? 0));
  const highLabel = formatter(String(values[highIndex] ?? values[maxIndex] ?? 0));

  return (
    <div className="range-filter">
      <div className="range-filter-head"><span>{label}</span><span className="subtle">-</span></div>
      <div className="range-track range-track-live">
        <div className="range-track-base" />
        <div className="range-track-active" style={{ left: leftPosition, right: `calc(100% - ${rightPosition})` }} />
        <span style={{ left: leftPosition }}>{lowLabel}</span>
        <span style={{ left: rightPosition }}>{highLabel}</span>
        <input
          type="range"
          min={minIndex}
          max={maxIndex}
          step={1}
          value={lowIndex}
          onChange={(event) => {
            const nextIndex = Math.min(Number(event.target.value), highIndex);
            const nextValue = values[nextIndex] ?? values[minIndex] ?? 0;
            onLowChange(nextIndex === minIndex ? "" : String(nextValue));
          }}
          className="range-slider range-slider-low"
        />
        <input
          type="range"
          min={minIndex}
          max={maxIndex}
          step={1}
          value={highIndex}
          onChange={(event) => {
            const nextIndex = Math.max(Number(event.target.value), lowIndex);
            const nextValue = values[nextIndex] ?? values[maxIndex] ?? 0;
            onHighChange(nextIndex === maxIndex ? "" : String(nextValue));
          }}
          className="range-slider range-slider-high"
        />
      </div>
    </div>
  );
}

const outlierSliderValues = buildSteppedValues([
  { start: 1, end: 10, step: 1 },
  { start: 15, end: 100, step: 5 },
  { start: 150, end: 1000, step: 50 },
]);

const viewsSliderValues = buildSteppedValues([
  { start: 0, end: 100000, step: 10000 },
  { start: 200000, end: 1000000, step: 100000 },
  { start: 2000000, end: 10000000, step: 1000000 },
  { start: 20000000, end: 100000000, step: 10000000 },
  { start: 200000000, end: 1000000000, step: 100000000 },
]);

const subscribersSliderValues = buildSteppedValues([
  { start: 0, end: 100000, step: 10000 },
  { start: 200000, end: 1000000, step: 100000 },
  { start: 2000000, end: 10000000, step: 1000000 },
  { start: 20000000, end: 100000000, step: 10000000 },
  { start: 150000000, end: 500000000, step: 50000000 },
]);

const durationSliderValues = buildSteppedValues([
  { start: 0, end: 600, step: 30 },
  { start: 900, end: 3600, step: 300 },
  { start: 4500, end: 10800, step: 900 },
  { start: 12600, end: 25200, step: 1800 },
]);

export default function DiscoverPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [total, setTotal] = useState(0);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [trackedChannels, setTrackedChannels] = useState<Channel[]>([]);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [searchDraft, setSearchDraft] = useState(defaultFilters.search);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState<DiscoverWarning | null>(null);
  const [pendingVideoIds, setPendingVideoIds] = useState<string[]>([]);
  const [savedVideoIds, setSavedVideoIds] = useState<string[]>([]);
  const [pendingChannelIds, setPendingChannelIds] = useState<string[]>([]);
  const [pendingDismissedVideoIds, setPendingDismissedVideoIds] = useState<string[]>([]);
  const [trackedChannelIds, setTrackedChannelIds] = useState<string[]>([]);
  const [saveModalVideo, setSaveModalVideo] = useState<Video | null>(null);
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const filterDropdownRef = useRef<HTMLDivElement | null>(null);
  const sourceDropdownRef = useRef<HTMLDivElement | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams({
      contentType: filters.contentType,
      minScore: filters.minScore || "0",
      sort: filters.sort,
      order: "desc",
      limit: filters.limit,
      days: filters.days,
    });

    if (filters.search) params.set("search", filters.search);
    if (!filters.seedChannelId) params.set("generalMode", "true");
    if (filters.seedChannelId === ALL_TRACKED_CHANNELS) params.set("trackedMode", "true");
    if (filters.seedChannelId && filters.seedChannelId !== ALL_TRACKED_CHANNELS) params.set("seedChannelId", filters.seedChannelId);
    if (filters.seedChannelId) params.set("includeAdjacent", String(filters.includeAdjacent));
    if (filters.minViews) params.set("minViews", filters.minViews);
    if (filters.maxViews) params.set("maxViews", filters.maxViews);
    if (filters.maxScore) params.set("maxScore", filters.maxScore);
    if (filters.minSubscribers) params.set("minSubscribers", filters.minSubscribers);
    if (filters.maxSubscribers) params.set("maxSubscribers", filters.maxSubscribers);
    if (filters.minDurationSeconds) params.set("minDurationSeconds", filters.minDurationSeconds);
    if (filters.maxDurationSeconds) params.set("maxDurationSeconds", filters.maxDurationSeconds);

    return params.toString();
  }, [filters]);

  const fetchDiscover = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    if (forceRefresh) {
      setRefreshing(true);
      setVideos([]);
      setTotal(0);
      setWarning(null);
    }
    setError("");

    const params = new URLSearchParams(query);
    if (forceRefresh) {
      params.set("forceRefresh", "true");
    }

    try {
      const discover = await apiFetch<DiscoverPayload>(`/api/discover/outliers?${params.toString()}`);
      setVideos(discover.videos);
      setTotal(discover.total);
      setWarning(discover.warning ?? null);
    } catch (fetchError) {
      setWarning(null);
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load outliers.");
    } finally {
      setLoading(false);
      if (forceRefresh) {
        setRefreshing(false);
      }
    }
  }, [query]);

  useEffect(() => {
    void Promise.all([
      apiFetch<Collection[]>("/api/collections"),
      apiFetch<Channel[]>("/api/tracked-channels"),
    ])
      .then(([collectionRows, channelRows]) => {
        setCollections(collectionRows);
        setTrackedChannels(channelRows);
        setTrackedChannelIds(channelRows.map((row) => row.id));
      })
      .catch((fetchError) => setError(fetchError instanceof Error ? fetchError.message : "Failed to load Browse."));
  }, []);

  useEffect(() => {
    void fetchDiscover(false);
  }, [fetchDiscover]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!filterDropdownRef.current?.contains(event.target as Node)) {
        setFiltersOpen(false);
      }
      if (!sourceDropdownRef.current?.contains(event.target as Node)) {
        setSourceMenuOpen(false);
      }
    }

    if (filtersOpen || sourceMenuOpen) {
      document.addEventListener("mousedown", handlePointerDown);
    }

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [filtersOpen, sourceMenuOpen]);

  function updateFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function submitSearch() {
    setFilters((current) => ({
      ...current,
      search: searchDraft.trim(),
    }));
    setFiltersOpen(false);
    setSourceMenuOpen(false);
  }

  async function saveToCollection(collectionId: number, video: Video) {
    setPendingVideoIds((current) => current.includes(video.videoId) ? current : [...current, video.videoId]);
    try {
      await apiFetch(`/api/collections/${collectionId}/references`, {
        method: "POST",
        body: JSON.stringify({
          videoId: video.videoId,
          kind: "outlier",
          tags: ["saved-from-browse"],
        }),
      });
      setSavedVideoIds((current) => current.includes(video.videoId) ? current : [...current, video.videoId]);
      setSaveModalVideo(null);
      setError("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save video.");
    } finally {
      setPendingVideoIds((current) => current.filter((id) => id !== video.videoId));
    }
  }

  async function createCollectionAndSave(video: Video) {
    if (!newCollectionName.trim()) {
      return;
    }
    setCreatingCollection(true);
    try {
      const created = await apiFetch<Collection>("/api/collections", {
        method: "POST",
        body: JSON.stringify({
          name: newCollectionName.trim(),
        }),
      });
      setCollections((current) => [created, ...current]);
      setNewCollectionName("");
      await saveToCollection(created.id, video);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to create collection.");
    } finally {
      setCreatingCollection(false);
    }
  }

  async function trackChannel(video: Video) {
    if (!video.channelId || trackedChannelIds.includes(video.channelId) || pendingChannelIds.includes(video.channelId)) {
      return;
    }

    setPendingChannelIds((current) => [...current, video.channelId!]);

    try {
      await apiFetch("/api/tracked-channels", {
        method: "POST",
        body: JSON.stringify({
          channelId: video.channelId,
          relationship: "competitor",
        }),
      });
      setTrackedChannelIds((current) => current.includes(video.channelId!) ? current : [...current, video.channelId!]);
      setTrackedChannels((current) => {
        if (current.some((item) => item.id === video.channelId)) return current;
        return [...current, { id: video.channelId!, name: video.channelName, handle: null }];
      });
      setVideos((current) => current.map((item) => item.channelId === video.channelId ? { ...item, trackedInProject: true } : item));
      setError("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to track channel.");
    } finally {
      setPendingChannelIds((current) => current.filter((id) => id !== video.channelId));
    }
  }

  async function dismissVideo(video: Video) {
    if (pendingDismissedVideoIds.includes(video.videoId)) {
      return;
    }

    setPendingDismissedVideoIds((current) => [...current, video.videoId]);

    try {
      await apiFetch("/api/discover/dismissed-videos", {
        method: "POST",
        body: JSON.stringify({
          videoId: video.videoId,
        }),
      });
      setVideos((current) => current.filter((item) => item.videoId !== video.videoId));
      setTotal((current) => Math.max(0, current - 1));
      if (saveModalVideo?.videoId === video.videoId) {
        setSaveModalVideo(null);
      }
      setError("");
    } catch (dismissError) {
      setError(dismissError instanceof Error ? dismissError.message : "Failed to hide video.");
    } finally {
      setPendingDismissedVideoIds((current) => current.filter((id) => id !== video.videoId));
    }
  }

  return (
    <div className="stack">
      <header className="simple-hero">
        <div>
          <div className="eyebrow">Browse</div>
          <h1 className="headline">Find outliers worth saving</h1>
        </div>
      </header>

      {error ? <section className="panel panel-error">{error}</section> : null}
      {warning ? <section className="panel panel-error">{warning.message}</section> : null}

      <section className="panel discover-shell">
        <div className="discover-mode-note">
          {filters.seedChannelId === ALL_TRACKED_CHANNELS
            ? `Browsing outliers shaped by all tracked channels${filters.includeAdjacent ? " and adjacent videos." : "."}`
            : filters.seedChannelId
            ? `Browsing outliers in the niche of ${trackedChannels.find((item) => item.id === filters.seedChannelId)?.name ?? "this channel"}${filters.includeAdjacent ? " and adjacent videos." : "."}`
            : "Browsing general YouTube outliers."}
        </div>

        <div className="discover-search discover-search-premium">
          <div
            className="filter-dropdown"
            ref={sourceDropdownRef}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={`discover-source-pill ${filters.seedChannelId ? "active" : ""}`}
              onClick={() => setSourceMenuOpen((current) => !current)}
            >
              {filters.seedChannelId ? (
                <>
                  <span className="discover-source-content">
                    <span className="discover-source-title">
                      {filters.seedChannelId === ALL_TRACKED_CHANNELS
                        ? "All tracked channels"
                        : trackedChannels.find((item) => item.id === filters.seedChannelId)?.name ?? "Tracked channel"}
                    </span>
                    <span className="discover-source-subtitle">
                      {filters.seedChannelId === ALL_TRACKED_CHANNELS ? "Tracked niche" : "Tracked channel"}
                    </span>
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    className="discover-source-clear"
                    aria-label="Clear selected channel"
                    onClick={(event) => {
                      event.stopPropagation();
                      updateFilter("seedChannelId", "");
                      setSourceMenuOpen(false);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        updateFilter("seedChannelId", "");
                        setSourceMenuOpen(false);
                      }
                    }}
                  >
                    ×
                  </span>
                  <span className="discover-source-caret">⌄</span>
                </>
              ) : (
                <>
                  <span className="discover-source-content">
                    <span className="discover-source-title">General</span>
                    <span className="discover-source-subtitle">Choose a source</span>
                  </span>
                  <span className="discover-source-caret">⌄</span>
                </>
              )}
            </button>
            {sourceMenuOpen ? (
              <div className="discover-project-menu">
                <button
                  type="button"
                  className={`discover-project-option ${filters.seedChannelId === "" ? "active" : ""}`}
                  onClick={() => {
                    updateFilter("seedChannelId", "");
                    setSourceMenuOpen(false);
                  }}
                >
                  General
                </button>
                {trackedChannels.length > 0 ? (
                  <button
                    type="button"
                    className={`discover-project-option ${filters.seedChannelId === ALL_TRACKED_CHANNELS ? "active" : ""}`}
                    onClick={() => {
                      updateFilter("seedChannelId", ALL_TRACKED_CHANNELS);
                      setSourceMenuOpen(false);
                    }}
                  >
                    All tracked channels
                  </button>
                ) : null}
                {trackedChannels.map((channel) => (
                  <button
                    key={channel.id}
                    type="button"
                    className={`discover-project-option ${filters.seedChannelId === channel.id ? "active" : ""}`}
                    onClick={() => {
                      updateFilter("seedChannelId", channel.id);
                      setSourceMenuOpen(false);
                    }}
                  >
                    <span className="discover-source-option">
                      <ChannelAvatar src={channel.thumbnailUrl ?? null} alt={channel.name} name={channel.name} className="discover-source-option-avatar" />
                      <span>
                        <strong>{channel.name}</strong>
                        <span className="subtle">{channel.handle ?? "Tracked channel"}</span>
                      </span>
                    </span>
                  </button>
                ))}
                {filters.seedChannelId ? (
                  <label className="discover-source-toggle">
                    <input
                      type="checkbox"
                      checked={filters.includeAdjacent}
                      onChange={(event) => updateFilter("includeAdjacent", event.target.checked)}
                    />
                    <span>Include adjacent videos</span>
                  </label>
                ) : null}
              </div>
            ) : null}
          </div>

          <form
            className="discover-search-form"
            onSubmit={(event) => {
              event.preventDefault();
              submitSearch();
            }}
          >
            <input
              className="search-input"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Search videos, topics, niche, or channels"
            />
            <div
              className="filter-dropdown"
              ref={filterDropdownRef}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="discover-filter-icon"
                aria-label="Open filters"
                onClick={() => setFiltersOpen((current) => !current)}
              >
                ≡
              </button>
              {filtersOpen ? (
                <div className="filter-dropdown-panel">
                  <div className="filter-panel-header">
                    <div>
                      <div className="eyebrow">Search Filters</div>
                      <h3 style={{ margin: "6px 0 0" }}>Refine this feed</h3>
                    </div>
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => setFilters((current) => ({
                        ...defaultFilters,
                        seedChannelId: current.seedChannelId,
                        includeAdjacent: current.includeAdjacent,
                        search: current.search,
                      }))}
                    >
                      Reset
                    </button>
                  </div>

                  <div className="filter-panel-grid">
                    <SliderFilter
                      label="Outlier Score"
                      values={outlierSliderValues}
                      lowValue={filters.minScore}
                      highValue={filters.maxScore}
                      onLowChange={(value) => updateFilter("minScore", value)}
                      onHighChange={(value) => updateFilter("maxScore", value)}
                      formatter={(value) => `${formatFilterNumber(value, "1")}x`}
                    />
                    <SliderFilter
                      label="Views"
                      values={viewsSliderValues}
                      lowValue={filters.minViews}
                      highValue={filters.maxViews}
                      onLowChange={(value) => updateFilter("minViews", value)}
                      onHighChange={(value) => updateFilter("maxViews", value)}
                      formatter={(value) => formatFilterNumber(value, "0")}
                    />
                    <SliderFilter
                      label="Subscribers"
                      values={subscribersSliderValues}
                      lowValue={filters.minSubscribers}
                      highValue={filters.maxSubscribers}
                      onLowChange={(value) => updateFilter("minSubscribers", value)}
                      onHighChange={(value) => updateFilter("maxSubscribers", value)}
                      formatter={(value) => formatFilterNumber(value, "0")}
                    />
                    <SliderFilter
                      label="Video Duration"
                      values={durationSliderValues}
                      lowValue={filters.minDurationSeconds}
                      highValue={filters.maxDurationSeconds}
                      onLowChange={(value) => updateFilter("minDurationSeconds", value)}
                      onHighChange={(value) => updateFilter("maxDurationSeconds", value)}
                      formatter={(value) => formatDurationLabel(value, "00:00")}
                    />
                    <div className="field">
                      <span>Video type</span>
                      <select value={filters.contentType} onChange={(event) => updateFilter("contentType", event.target.value as FilterState["contentType"])}>
                        <option value="long">No shorts</option>
                        <option value="all">All videos</option>
                        <option value="short">Shorts only</option>
                      </select>
                    </div>
                    <div className="field">
                      <span>Sort</span>
                      <select value={filters.sort} onChange={(event) => updateFilter("sort", event.target.value as FilterState["sort"])}>
                        <option value="momentum">Default</option>
                        <option value="score">Outlier Score</option>
                        <option value="views">View Count</option>
                        <option value="date">Upload Date</option>
                        <option value="subscribers">Subscribers</option>
                      </select>
                    </div>
                    <div className="field">
                      <span>Results</span>
                      <select value={filters.limit} onChange={(event) => updateFilter("limit", event.target.value)}>
                        <option value="50">50</option>
                        <option value="100">100</option>
                        <option value="150">150</option>
                      </select>
                    </div>
                    <div className="field field-span-full">
                      <span>Publication date</span>
                      <div className="filter-chip-row">
                        {publicationPresets.map((preset) => (
                          <button type="button" key={preset.days} className={`filter-chip ${filters.days === preset.days ? "active" : ""}`} onClick={() => updateFilter("days", preset.days)}>
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </form>
          <button
            type="button"
            className="button secondary"
            disabled={refreshing}
            onClick={() => {
              void fetchDiscover(true);
            }}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
          <span className="discover-results-text">{total.toLocaleString()} results</span>
        </div>
      </section>

      <section className="stack">
        {loading ? <section className="panel">Loading outliers...</section> : null}
        {!loading && videos.length === 0 ? (
          <section className="panel alt">
            <h3 style={{ marginTop: 0 }}>No matches yet</h3>
            <p className="subtle" style={{ marginBottom: 0 }}>Try a broader search, change your source channel, or widen the date range.</p>
          </section>
        ) : null}
        <div className="card-grid">
          {videos.map((video) => (
            <OutlierCard
              key={video.videoId}
              video={video}
              onOpenSave={(item) => setSaveModalVideo(item as Video)}
              onTrackChannel={(item) => {
                void trackChannel(item as Video);
              }}
              onDismiss={(item) => {
                void dismissVideo(item as Video);
              }}
              saveState={
                pendingVideoIds.includes(video.videoId)
                  ? "saving"
                  : savedVideoIds.includes(video.videoId)
                    ? "saved"
                    : "idle"
              }
              trackState={
                video.channelId && pendingChannelIds.includes(video.channelId)
                  ? "saving"
                  : video.channelId && trackedChannelIds.includes(video.channelId)
                    ? "saved"
                    : "idle"
              }
              dismissState={pendingDismissedVideoIds.includes(video.videoId) ? "saving" : "idle"}
              similarChannelsHref={video.channelId ? `/discover/channel/${video.channelId}` : undefined}
            />
          ))}
        </div>
      </section>

      {saveModalVideo ? (
        <div className="modal-backdrop" onClick={() => setSaveModalVideo(null)}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="eyebrow">Save video</div>
                <h3 style={{ margin: "6px 0 0" }}>{saveModalVideo.title}</h3>
              </div>
              <button type="button" className="button secondary" onClick={() => setSaveModalVideo(null)}>Close</button>
            </div>

            <div className="stack">
              <div className="field">
                <span>Create new collection</span>
                <div className="simple-toolbar">
                  <input
                    className="search-input grow"
                    value={newCollectionName}
                    onChange={(event) => setNewCollectionName(event.target.value)}
                    placeholder="Editing ideas"
                  />
                  <button
                    type="button"
                    className="button secondary"
                    disabled={creatingCollection || !newCollectionName.trim()}
                    onClick={() => void createCollectionAndSave(saveModalVideo)}
                  >
                    {creatingCollection ? "Creating..." : "Create + Save"}
                  </button>
                </div>
              </div>

              <div className="stack">
                <div className="eyebrow">Save to existing collection</div>
                <div className="save-collection-list">
                  {collections.map((collection) => (
                    <button
                      key={collection.id}
                      type="button"
                      className="save-collection-row"
                      disabled={pendingVideoIds.includes(saveModalVideo.videoId)}
                      onClick={() => void saveToCollection(collection.id, saveModalVideo)}
                    >
                      <span>{collection.name}</span>
                      <span>{pendingVideoIds.includes(saveModalVideo.videoId) ? "Saving..." : "Save"}</span>
                    </button>
                  ))}
                  {collections.length === 0 ? <div className="subtle">No collections yet. Create one above.</div> : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
