import { useState } from "react";
import { ArrowUp, Sparkles, LockKeyhole } from "lucide-react";
import { request } from "./api";
import type { Filters } from "../shared/model";
type Answer = {
  answer: string;
  range: { from: string; to: string };
  games: { id: string; label: string }[];
  players: string[];
  table?: { player: string; value: number }[];
  remaining_usd?: number;
};
export default function Chat({
  filters,
  demo,
  onGame,
  onPlayers,
}: {
  filters: Filters;
  demo: boolean;
  onGame: (id: string) => void;
  onPlayers: (ids: string[]) => void;
}) {
  const [model, setModel] = useState("flash");
  const [question, setQuestion] = useState("");
  const [code, setCode] = useState("");
  const [unlocked, setUnlocked] = useState(
    !!sessionStorage.getItem("hoops-friend"),
  );
  const [messages, setMessages] = useState<
    { role: "user" | "assistant"; text: string; data?: Answer }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  async function unlock() {
    setError("");
    setBusy(true);
    try {
      const r = await request<{ token: string }>("/auth/friend", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      sessionStorage.setItem("hoops-friend", r.token);
      setUnlocked(true);
      setCode("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function ask(q = question) {
    if (!q.trim() || busy) return;
    if (demo) {
      setError(
        "AI connects to your published games after the backend and DeepSeek key are configured. Sample mode never sends a paid request.",
      );
      return;
    }
    if (!unlocked) {
      setError("Enter your friend access code to ask a question.");
      return;
    }
    setBusy(true);
    setError("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setQuestion("");
    try {
      const result = await request<Answer>("/ai", {
        method: "POST",
        body: JSON.stringify({ question: q, model, filters }),
      });
      setMessages((m) => [
        ...m,
        { role: "assistant", text: result.answer, data: result },
      ]);
      if (result.remaining_usd !== undefined)
        setRemaining(result.remaining_usd);
    } catch (e) {
      setError((e as Error).message);
      setQuestion(q);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="chat-layout">
      <aside className="panel chat-sidebar">
        <h2>Your courtside analyst</h2>
        <div className="model-switch" aria-label="AI model">
          <button
            className={model === "flash" ? "active" : ""}
            onClick={() => setModel("flash")}
          >
            V4 Flash
          </button>
          <button
            className={model === "pro" ? "active" : ""}
            onClick={() => setModel("pro")}
          >
            V4 Pro
          </button>
        </div>
        <p>
          {model === "flash"
            ? "Quick answers to your game-day questions."
            : "More reasoning for deeper comparisons."}
        </p>
        <span className="budget-pill">
          {remaining === null
            ? "$5 shared monthly allowance"
            : `$${remaining.toFixed(2)} allowance remaining`}
        </span>
        <p style={{ marginTop: 24 }}>A few places to start</p>
        {[
          "Who scored the most in the last two weeks?",
          "Who has the most assisted points?",
          "Which teammates play together the least?",
          "Compare the top defenders this month.",
        ].map((q) => (
          <button key={q} className="suggestion" onClick={() => setQuestion(q)}>
            {q}
          </button>
        ))}
        {!demo && !unlocked && (
          <div style={{ marginTop: 20 }}>
            <label style={{ fontSize: ".8rem" }}>
              <LockKeyhole size={14} /> Friend access code
              <input
                style={{ width: "100%", marginTop: 10 }}
                type="password"
                autoComplete="current-password"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") unlock();
                }}
              />
            </label>
            <button
              className="primary"
              style={{ marginTop: 10, width: "100%" }}
              disabled={busy || !code}
              onClick={unlock}
            >
              Unlock AI
            </button>
          </div>
        )}
        {unlocked && (
          <button
            className="text-button"
            onClick={() => {
              sessionStorage.removeItem("hoops-friend");
              setUnlocked(false);
            }}
          >
            Lock AI on this device
          </button>
        )}
      </aside>
      <section className="panel chat-main">
        <div className="chat-messages" aria-live="polite">
          {!messages.length && (
            <div className="chat-welcome">
              <Sparkles size={35} />
              <h2>There’s a story in your stats.</h2>
              <p>
                Ask about a player, a Friday, or a connection. Every answer
                starts with your recorded games.
              </p>
            </div>
          )}
          {messages.map((m, i) => (
            <div className={`message ${m.role}`} key={i}>
              {m.text}
              {m.data && (
                <>
                  <small>
                    {m.data.range.from} – {m.data.range.to} ·{" "}
                    {m.data.games.length} source games
                  </small>
                  {m.data.table && (
                    <table>
                      <tbody>
                        {m.data.table.map((r, i) => (
                          <tr key={i}>
                            <th>{r.player}</th>
                            <td>{r.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <div className="sources">
                    {m.data.players.length > 0 && (
                      <button onClick={() => onPlayers(m.data!.players)}>
                        View matching players
                      </button>
                    )}
                    {m.data.games.map((g) => (
                      <button key={g.id} onClick={() => onGame(g.id)}>
                        {g.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
          {busy && <p>Checking the recorded games…</p>}
        </div>
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        <form
          className="chat-input"
          onSubmit={(e) => {
            e.preventDefault();
            ask();
          }}
        >
          <textarea
            aria-label="Ask about your games"
            placeholder="Ask about your games…"
            value={question}
            maxLength={2000}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask();
              }
            }}
          />
          <button
            aria-label="Send question"
            disabled={busy || !question.trim()}
          >
            <ArrowUp size={22} />
          </button>
        </form>
        <p className="chat-disclaimer">
          Read-only answers · Dates follow your filters unless your question
          specifies otherwise · AI can make mistakes
        </p>
      </section>
    </div>
  );
}
