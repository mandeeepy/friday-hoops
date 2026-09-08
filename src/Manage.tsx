import { useState } from "react";
import {
  ArrowLeft,
  Check,
  Download,
  Plus,
  Upload,
  LockKeyhole,
} from "lucide-react";
import {
  categories,
  validateImport,
  type Player,
  type Import,
  type Game,
} from "../shared/model";
import { sampleImport } from "../shared/demo";
import { aggregate, gameRows } from "../shared/stats";
import { today } from "../shared/dates";
import { request } from "./api";
import { download } from "./App";
import { extractionGuide } from "../shared/instructions";
export default function Manage({
  demo,
  players,
  onClose,
  onPublish,
}: {
  demo: boolean;
  players: Player[];
  onClose: () => void;
  onPublish: () => void;
}) {
  const [token, setToken] = useState(
    sessionStorage.getItem("hoops-owner") || "",
  );
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [directory, setDirectory] = useState(players);
  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");
  const [edit, setEdit] = useState("");
  const [date, setDate] = useState(today());
  const [draft, setDraft] = useState<Import | null>(null);
  const [text, setText] = useState("");
  const [review, setReview] = useState<any>(null);
  const [revisions, setRevisions] = useState<any[]>([]);
  const [success, setSuccess] = useState("");
  const [restoring, setRestoring] = useState<any>(null);
  async function run(fn: () => Promise<void>) {
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function login() {
    run(async () => {
      const r = await request<{ token: string }>(
        "/auth/owner",
        { method: "POST", body: JSON.stringify({ code: password }) },
        "owner",
      );
      sessionStorage.setItem("hoops-owner", r.token);
      setToken(r.token);
      setPassword("");
      setDirectory(await request("/owner/players", {}, "owner"));
    });
  }
  function addPlayer() {
    run(async () => {
      if (!name.trim()) throw new Error("Enter a player name.");
      const p: Player = {
        id: edit || crypto.randomUUID(),
        name: name.trim(),
        aliases: aliases
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      };
      if (!demo)
        await request(
          "/owner/players",
          { method: "POST", body: JSON.stringify(p) },
          "owner",
        );
      setDirectory((ps) => [...ps.filter((x) => x.id !== p.id), p]);
      setName("");
      setAliases("");
      setEdit("");
      onPublish();
    });
  }
  function start() {
    const id = `friday-${date}`;
    const d: Import = {
      schema_version: 1,
      session: { id, date, label: "Friday run" },
      players: directory,
      games: [],
      unresolved: [],
    };
    setDraft(d);
    setReview(null);
  }
  function addGame() {
    if (!draft) return;
    const id = `${draft.session.id}-g${draft.games.length + 1}`;
    const g: Game = {
      id,
      label: `Game ${draft.games.length + 1}`,
      base_revision: 0,
      completed: false,
      scoring_complete: false,
      coverage: Object.fromEntries(
        categories.map((c) => [c, false]),
      ) as Game["coverage"],
      roster: [],
      events: [],
    };
    const d = { ...draft, games: [...draft.games, g] };
    setDraft(d);
    setText(JSON.stringify(d, null, 2));
  }
  function rosterChange(gi: number, p: Player, team: string) {
    if (!draft) return;
    const games = draft.games.map((g, i) =>
      i !== gi
        ? g
        : {
            ...g,
            roster: [
              ...g.roster.filter((r) => r.player_id !== p.id),
              ...(team
                ? [
                    {
                      id: p.id,
                      player_id: p.id,
                      team: team as "A" | "B",
                      outsider: false,
                    },
                  ]
                : []),
            ],
          },
    );
    const d = { ...draft, games };
    setDraft(d);
    setText(JSON.stringify(d, null, 2));
  }
  function outsider(gi: number, team: "A" | "B") {
    if (!draft) return;
    const games = draft.games.map((g, i) =>
      i !== gi
        ? g
        : {
            ...g,
            roster: [
              ...g.roster,
              {
                id: `outsider-${g.roster.filter((p) => p.outsider).length + 1}`,
                player_id: null,
                team,
                outsider: true,
              },
            ],
          },
    );
    const d = { ...draft, games };
    setDraft(d);
    setText(JSON.stringify(d, null, 2));
  }
  function validate() {
    run(async () => {
      const input = JSON.parse(text);
      const result = validateImport(input);
      setReview(result);
      if (!result.ok) return;
      if (!demo)
        setReview(
          await request(
            "/owner/imports/validate",
            { method: "POST", body: JSON.stringify(input) },
            "owner",
          ),
        );
    });
  }
  function publish() {
    run(async () => {
      if (demo)
        throw new Error(
          "Sample mode is a preview. Connect the backend and sign in as owner to publish real games.",
        );
      const result = await request<{ message: string }>(
        "/owner/imports/publish",
        { method: "POST", body: text },
        "owner",
      );
      setSuccess(result.message);
      setReview(null);
      onPublish();
    });
  }
  const valid = review?.ok ? (review.data as Import) : null;
  return (
    <>
      <div className="manage-heading">
        <div>
          <div className="eyebrow">OWNER WORKSPACE</div>
          <h1>Your Friday, on the record.</h1>
        </div>
        <button className="secondary" onClick={onClose}>
          <ArrowLeft size={16} />
          Dashboard
        </button>
      </div>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className="notice">
          <Check size={16} /> {success}
        </div>
      )}
      {!token && !demo ? (
        <section
          className="panel form-panel"
          style={{ maxWidth: 440, margin: "35px auto" }}
        >
          <LockKeyhole size={28} />
          <h2 style={{ marginTop: 18 }}>Manage your games</h2>
          <p>The owner credential is separate from your friends’ AI code.</p>
          <label>
            Owner passphrase
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") login();
              }}
            />
          </label>
          <button
            className="primary"
            disabled={busy || !password}
            onClick={login}
          >
            Unlock manager
          </button>
        </section>
      ) : (
        <>
          <div className="form-actions">
            <button
              className="secondary"
              onClick={() =>
                download(
                  "commentary-and-ai-instructions.md",
                  extractionGuide,
                  "text/markdown",
                )
              }
            >
              <Download size={16} />
              Commentary & AI instructions
            </button>
            <button
              className="secondary"
              onClick={() =>
                download(
                  "player-directory.json",
                  JSON.stringify(directory, null, 2),
                )
              }
            >
              Export player directory
            </button>
            <button
              className="secondary"
              onClick={() =>
                run(async () => {
                  const backup = demo
                    ? {
                        demo: true,
                        players: directory,
                        imports: [sampleImport()],
                      }
                    : await request("/owner/export", {}, "owner");
                  download(
                    "friday-hoops-backup.json",
                    JSON.stringify(backup, null, 2),
                  );
                })
              }
            >
              Download backup
            </button>
            {!demo && (
              <button
                className="text-button"
                onClick={() => {
                  sessionStorage.removeItem("hoops-owner");
                  setToken("");
                }}
              >
                Lock manager
              </button>
            )}
          </div>
          {demo && (
            <p className="notice">
              Sample workspace. Try creating rosters and validating files;
              changes here are temporary and cannot publish.
            </p>
          )}
          <div className="manage-grid">
            <div>
              <section className="panel form-panel">
                <div className="step-label">01 / YOUR PEOPLE</div>
                <h2>A familiar roster</h2>
                <p>Create names once. Reuse their IDs every Friday.</p>
                {directory.map((p) => (
                  <div className="directory-row" key={p.id}>
                    <span>
                      {p.name}
                      <small>{p.aliases.join(", ") || "No aliases"}</small>
                    </span>
                    <button
                      onClick={() => {
                        setEdit(p.id);
                        setName(p.name);
                        setAliases(p.aliases.join(", "));
                      }}
                    >
                      Edit
                    </button>
                  </div>
                ))}
                <label>
                  Player name
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={60}
                  />
                </label>
                <label>
                  Aliases, separated by commas
                  <input
                    value={aliases}
                    onChange={(e) => setAliases(e.target.value)}
                  />
                </label>
                <button
                  className="primary"
                  disabled={busy || !name.trim()}
                  onClick={addPlayer}
                >
                  {edit ? "Save player" : "Add player"}
                  <Plus size={15} />
                </button>
              </section>
              <section className="panel form-panel" style={{ marginTop: 20 }}>
                <div className="step-label">02 / SET THE TEAMS</div>
                <h2>Prepare a Friday</h2>
                <label>
                  Session date
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <button className="secondary" onClick={start}>
                  Start session draft
                </button>
                {draft && (
                  <>
                    <p style={{ marginTop: 15 }}>
                      Session ID: {draft.session.id}
                    </p>
                    {draft.games.map((g, i) => (
                      <div key={g.id} className="review-game">
                        <h3>{g.label}</h3>
                        {directory.map((p) => (
                          <div className="directory-row" key={p.id}>
                            <span>{p.name}</span>
                            <select
                              aria-label={`${g.label}: team for ${p.name}`}
                              value={
                                g.roster.find((r) => r.player_id === p.id)
                                  ?.team || ""
                              }
                              onChange={(e) =>
                                rosterChange(i, p, e.target.value)
                              }
                            >
                              <option value="">Sitting out</option>
                              <option value="A">Team A</option>
                              <option value="B">Team B</option>
                            </select>
                          </div>
                        ))}
                        {g.roster
                          .filter((p) => p.outsider)
                          .map((p) => (
                            <p className="outsider" key={p.id}>
                              {p.id} · Team {p.team}
                            </p>
                          ))}
                        <div className="form-actions">
                          <button onClick={() => outsider(i, "A")}>
                            + Outsider A
                          </button>
                          <button onClick={() => outsider(i, "B")}>
                            + Outsider B
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className="form-actions">
                      <button className="secondary" onClick={addGame}>
                        Add game
                      </button>
                      <button
                        className="secondary"
                        disabled={!draft.games.length}
                        onClick={() =>
                          download(
                            "friday-ai-input.json",
                            JSON.stringify(
                              {
                                instructions: extractionGuide,
                                template: draft,
                              },
                              null,
                              2,
                            ),
                          )
                        }
                      >
                        Export AI preparation pack
                      </button>
                    </div>
                  </>
                )}
              </section>
            </div>
            <div>
              <section className="panel form-panel">
                <div className="step-label">03 / UPLOAD & REVIEW</div>
                <h2>Turn commentary into a game.</h2>
                <p>
                  Give the preparation pack and your commentary to AI. Upload
                  its JSON here, resolve any questions, then publish.
                </p>
                <div className="upload-zone">
                  <Upload size={25} />
                  <strong style={{ display: "block", marginTop: 8 }}>
                    Upload a session JSON file
                  </strong>
                  <input
                    type="file"
                    accept=".json,application/json"
                    aria-label="Upload session JSON"
                    onChange={(e) =>
                      run(async () => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 1024 * 1024)
                          throw new Error("Files must be under 1 MB.");
                        setText(await file.text());
                        setReview(null);
                      })
                    }
                  />
                </div>
                <label>
                  Review or correct the JSON
                  <textarea
                    className="code-editor"
                    spellCheck={false}
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      setReview(null);
                    }}
                    placeholder="Your AI-generated game data appears here…"
                  />
                </label>
                <div className="form-actions">
                  <button
                    className="primary"
                    disabled={busy || !text}
                    onClick={validate}
                  >
                    Validate & preview
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      setText(JSON.stringify(sampleImport(), null, 2));
                      setReview(null);
                    }}
                  >
                    Load sample file
                  </button>
                  <button
                    className="text-button"
                    disabled={!text}
                    onClick={() => download("session-draft.json", text)}
                  >
                    Download draft
                  </button>
                </div>
                {review && (
                  <>
                    <h3>
                      {review.ok
                        ? "Ready for your review"
                        : "Needs a correction"}
                    </h3>
                    {review.errors?.length > 0 && (
                      <ul className="issues">
                        {review.errors.map((e: string, i: number) => (
                          <li key={i}>{e}</li>
                        ))}
                      </ul>
                    )}
                    {review.warnings?.length > 0 && (
                      <ul className="issues">
                        {review.warnings.map((e: string, i: number) => (
                          <li key={i}>{e}</li>
                        ))}
                      </ul>
                    )}
                    {valid &&
                      valid.games.map((g) => {
                        const rows = aggregate(
                          gameRows({
                            ...g,
                            date: valid.session.date,
                            session_id: valid.session.id,
                            revision: g.base_revision + 1,
                          }),
                          valid.players,
                        );
                        return (
                          <div className="review-game" key={g.id}>
                            <h3>{g.label}</h3>
                            <p>
                              {g.roster.filter((p) => !p.outsider).length}{" "}
                              tracked players · {g.events.length} plays ·{" "}
                              {g.base_revision
                                ? `Replaces revision ${g.base_revision}`
                                : "New game"}
                            </p>
                            <p>
                              {
                                review.changes?.find((c: any) => c.id === g.id)
                                  ?.description
                              }
                            </p>
                            <div className="review-grid">
                              {rows.map((s) => (
                                <div key={s.id}>
                                  {s.name}
                                  <strong>
                                    {s.points} PTS · {s.assists} AST ·{" "}
                                    {s.oppAtt.toFixed(1)} OPP A
                                  </strong>
                                </div>
                              ))}
                            </div>
                            <details>
                              <summary>Inspect roster and plays</summary>
                              <pre
                                style={{
                                  whiteSpace: "pre-wrap",
                                  fontSize: ".7rem",
                                  maxHeight: 260,
                                  overflow: "auto",
                                }}
                              >
                                {JSON.stringify(
                                  { roster: g.roster, events: g.events },
                                  null,
                                  2,
                                )}
                              </pre>
                            </details>
                          </div>
                        );
                      })}
                    {valid && (
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={publish}
                      >
                        <Check size={17} />
                        Publish reviewed games
                      </button>
                    )}
                  </>
                )}
              </section>
              <section className="panel form-panel" style={{ marginTop: 20 }}>
                <div className="step-label">04 / CORRECT & RESTORE</div>
                <h2>History you can recover</h2>
                <p>
                  Corrections use the game’s existing ID and current revision.
                  Restore creates a new revision; it never erases history.
                </p>
                <button
                  className="secondary"
                  onClick={() =>
                    run(async () =>
                      setRevisions(
                        demo
                          ? []
                          : await request("/owner/revisions", {}, "owner"),
                      ),
                    )
                  }
                >
                  Load revision history
                </button>
                {revisions.map((r) => (
                  <div
                    className="directory-row"
                    key={`${r.game_id}-${r.revision}`}
                  >
                    <span>
                      {r.label}
                      <small>
                        Revision {r.revision} · {r.published_at}
                      </small>
                    </span>
                    <button
                      onClick={() =>
                        run(async () => {
                          const pack = await request<Import>(
                            `/owner/games/${r.game_id}/export`,
                            {},
                            "owner",
                          );
                          setText(JSON.stringify(pack, null, 2));
                          setReview(null);
                          setSuccess(
                            "Current game loaded into the editor for correction.",
                          );
                        })
                      }
                    >
                      Edit current
                    </button>
                    <button onClick={() => setRestoring(r)}>Restore</button>
                  </div>
                ))}
                {restoring && (
                  <div className="notice">
                    Restore {restoring.label} revision {restoring.revision}?
                    This creates a new published revision.
                    <div className="form-actions">
                      <button
                        className="primary"
                        onClick={() =>
                          run(async () => {
                            const result = await request<{ message: string }>(
                              "/owner/restore",
                              {
                                method: "POST",
                                body: JSON.stringify({
                                  game_id: restoring.game_id,
                                  revision: restoring.revision,
                                  base_revision: restoring.current_revision,
                                }),
                              },
                              "owner",
                            );
                            setSuccess(result.message);
                            setRestoring(null);
                            setRevisions(
                              await request("/owner/revisions", {}, "owner"),
                            );
                            onPublish();
                          })
                        }
                      >
                        Restore this revision
                      </button>
                      <button onClick={() => setRestoring(null)}>Cancel</button>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </>
  );
}
