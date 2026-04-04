"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";

type Board = { id: number; name: string; description: string | null; itemCount: number };
type BoardDetail = Board & { items: Array<{ id: number; title: string; thumbnailUrl: string | null; channelName: string }> };

export default function BoardsPage() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [selected, setSelected] = useState<BoardDetail | null>(null);
  const [name, setName] = useState("");

  async function load() {
    const rows = await apiFetch<Board[]>("/api/boards");
    setBoards(rows);
    if (rows[0]) {
      const detail = await apiFetch<BoardDetail>(`/api/boards/${rows[0].id}`);
      setSelected(detail);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createBoard() {
    await apiFetch("/api/boards", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    setName("");
    await load();
  }

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <div className="eyebrow">Boards</div>
          <h1 className="headline">Build visual swipe files from winning packaging</h1>
        </div>
      </header>

      <section className="panel">
        <div className="toolbar">
          <label className="field">
            <span>New board</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="High drama thumbnails" />
          </label>
          <div className="field" style={{ alignSelf: "end" }}>
            <button className="button" onClick={() => void createBoard()}>Create board</button>
          </div>
        </div>
      </section>

      <div className="grid-2">
        <section className="panel">
          <div className="list">
            {boards.map((board) => (
              <button key={board.id} className="list-row" style={{ background: "transparent", border: 0, color: "inherit" }} onClick={() => void apiFetch<BoardDetail>(`/api/boards/${board.id}`).then(setSelected)}>
                <span>{board.name}</span>
                <span className="pill">{board.itemCount} items</span>
              </button>
            ))}
          </div>
        </section>
        <section className="panel alt">
          <div className="eyebrow">Vision board</div>
          <h2>{selected?.name ?? "No board selected"}</h2>
          <div className="vision-board">
            {selected?.items.map((item) => (
              <div key={item.id} className="vision-item">
                {item.thumbnailUrl ? <img src={item.thumbnailUrl} alt={item.title} /> : <div className="thumb" style={{ aspectRatio: "16 / 9" }} />}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
