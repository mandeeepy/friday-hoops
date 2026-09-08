import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  Download,
  Filter,
  Info,
  MessageCircle,
  Search,
  Settings2,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  X,
  Zap,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";
import { demoGames, demoPlayers } from "../shared/demo";
import { aggregate, gameRows } from "../shared/stats";
import {
  range,
  prettyDate,
  shiftDate,
  today,
  type Period,
} from "../shared/dates";
import { request, qs, demoSnapshot, type Meta, type Snapshot } from "./api";
import type { Filters, Stats, Player, GameRecord } from "../shared/model";
const PlayerHistory = lazy(() => import("./PlayerHistory"));
const Manage = lazy(() => import("./Manage"));
const Chat = lazy(() => import("./Chat"));
const fnum = (n: number | null | undefined, digits = 1) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : new Intl.NumberFormat("en", { maximumFractionDigits: digits }).format(n);
const columns: { key: keyof Stats; name: string; help: string }[] = [
  { key: "points", name: "PTS", help: "Points scored" },
  { key: "twoMade", name: "2PM", help: "Two-pointers made" },
  { key: "twoAtt", name: "2PA", help: "Two-point attempts" },
  { key: "twoPct", name: "2P%", help: "Two-point percentage" },
  { key: "threeMade", name: "3PM", help: "Three-pointers made" },
  { key: "threeAtt", name: "3PA", help: "Three-point attempts" },
  { key: "threePct", name: "3P%", help: "Three-point percentage" },
  { key: "fgPct", name: "FG%", help: "Field goal percentage" },
  { key: "assists", name: "AST", help: "Assists" },
  { key: "oreb", name: "OREB", help: "Offensive rebounds" },
  { key: "turnovers", name: "TO", help: "Turnovers" },
  {
    key: "assistedPoints",
    name: "A.PTS",
    help: "Points from assisted baskets",
  },
  { key: "contribution", name: "CREATED", help: "Scored plus assisted points" },
  { key: "pps", name: "PPS", help: "Points per shot attempt" },
];
const defenseColumns: { key: keyof Stats; name: string; help: string }[] = [
  { key: "oppMade", name: "OPP M", help: "Weighted opponent makes" },
  { key: "oppAtt", name: "OPP A", help: "Weighted opponent attempts" },
  {
    key: "oppPct",
    name: "OPP FG%",
    help: "Weighted opponent field goal percentage",
  },
  { key: "deflections", name: "DEFL", help: "Deflections" },
  { key: "steals", name: "STL", help: "Steals" },
  { key: "blocks", name: "BLK", help: "Blocks" },
  { key: "dreb", name: "DREB", help: "Defensive rebounds" },
];
function parse() {
  const p = new URLSearchParams(location.hash.replace(/^#/, ""));
  return {
    tab: p.get("tab") || "offense",
    period: (p.get("period") || "week") as Period,
    from: p.get("from") || "",
    to: p.get("to") || "",
    players: p.get("players")?.split(",").filter(Boolean) || [],
    mode: (p.get("mode") === "per-game"
      ? "per-game"
      : "totals") as Filters["mode"],
    detail: p.get("player") || "",
    game: p.get("game") || "",
  };
}
export default function App() {
  const initial = useMemo(parse, []);
  const [tab, setTab] = useState(initial.tab);
  const [period, setPeriod] = useState<Period>(initial.period);
  const [filters, setFilters] = useState<Filters>({
    from: initial.from,
    to: initial.to,
    players: initial.players,
    mode: initial.mode,
  });
  const [meta, setMeta] = useState<Meta | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [demo, setDemo] = useState(
    new URLSearchParams(location.search).get("demo") === "1" ||
      (import.meta.env.PROD && !import.meta.env.VITE_API_URL),
  );
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [data, setData] = useState<Snapshot | null>(null);
  const [sort, setSort] = useState<string>("points");
  const [asc, setAsc] = useState(false);
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState(initial.detail);
  const [compare, setCompare] = useState("");
  const [gameId, setGameId] = useState(initial.game);
  const [game, setGame] = useState<GameRecord | null>(null);
  const [reload, setReload] = useState(0);
  const [pairAsc, setPairAsc] = useState(false);
  const [pairGames, setPairGames] = useState<string[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        let m: Meta, ps: Player[];
        if (demo) {
          m = {
            version: 1,
            updated_at: "2026-09-05T10:30:00Z",
            latest: "2026-09-04",
            earliest: "2026-08-07",
            players: 8,
            games: 20,
          };
          ps = demoPlayers;
        } else {
          [m, ps] = await Promise.all([
            request<Meta>("/meta"),
            request<Player[]>("/players"),
          ]);
        }
        if (cancelled) return;
        setMeta(m);
        setPlayers(ps);
        setFilters((f) =>
          f.from && f.to
            ? f
            : {
                ...f,
                ...range(period, m.latest || today(), m.earliest || today()),
              },
        );
        setStatus("ready");
        setError("");
      } catch (e) {
        if (!cancelled) {
          setStatus("error");
          setError((e as Error).message);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [demo, reload]);
  useEffect(() => {
    if (!filters.from || !filters.to || filters.from > filters.to || !meta)
      return;
    let cancel = false;
    setStatus("loading-data");
    (demo
      ? Promise.resolve(demoSnapshot(filters))
      : request<Snapshot>(`/snapshot?${qs(filters)}`)
    )
      .then(async (d) => {
        if (pairGames && !demo && filters.players.length === 2)
          d.games = await request<Snapshot["games"]>(
            `/games?${qs(filters)}&pair=1&limit=100`,
          );
        if (!cancel) {
          setData(d);
          setStatus("ready");
          setError("");
        }
      })
      .catch((e) => {
        if (!cancel) {
          setError(e.message);
          setStatus("error");
        }
      });
    return () => {
      cancel = true;
    };
  }, [filters, demo, meta, pairGames]);
  useEffect(() => {
    if (!filters.from) return;
    const p = new URLSearchParams({
      tab,
      period,
      ...filters,
      players: filters.players.join(","),
    });
    if (detail) p.set("player", detail);
    if (gameId) p.set("game", gameId);
    history.replaceState(
      null,
      "",
      `${location.pathname}${location.search}#${p}`,
    );
  }, [tab, period, filters, detail, gameId]);
  useEffect(() => {
    setGame(null);
    if (!gameId) return;
    let cancelled = false;
    (demo
      ? Promise.resolve(demoGames.find((g) => g.id === gameId) || null)
      : request<GameRecord>(`/games/${encodeURIComponent(gameId)}`)
    )
      .then((g) => {
        if (!cancelled) setGame(g);
      })
      .catch((e) => setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [gameId, demo]);
  useEffect(() => {
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setDetail("");
        setGameId("");
      }
    }
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, []);
  async function loadOlderGames() {
    if (!data || demo) return;
    try {
      const next = await request<Snapshot["games"]>(
        `/games?${qs(filters)}&limit=100&offset=${data.games.length}${pairGames ? "&pair=1" : ""}`,
      );
      setData((d) => (d ? { ...d, games: [...d.games, ...next] } : d));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function changeTab(next: string) {
    setTab(next);
    setSort(next === "defense" ? "steals" : "points");
    setAsc(false);
  }
  function choosePeriod(p: Period) {
    setPeriod(p);
    setPairGames(null);
    if (p !== "custom")
      setFilters((f) => ({
        ...f,
        ...range(p, meta?.latest || today(), meta?.earliest || today()),
      }));
  }
  const reset = () => {
    setFilters((f) => ({
      ...f,
      players: [],
      ...range("week", meta?.latest || today(), meta?.earliest || today()),
    }));
    setPeriod("week");
    setSearch("");
    setPairGames(null);
  };
  const filtered = (data?.stats || [])
    .filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const av =
          a[sort as keyof Stats] == null ? NaN : Number(a[sort as keyof Stats]),
        bv =
          b[sort as keyof Stats] == null ? NaN : Number(b[sort as keyof Stats]);
      return (
        (Number.isFinite(av)
          ? Number.isFinite(bv)
            ? asc
              ? av - bv
              : bv - av
            : -1
          : 1) || a.name.localeCompare(b.name)
      );
    });
  const totals = (key: keyof Stats) =>
    (data?.stats || []).reduce((n, s) => n + (Number(s[key]) || 0), 0);
  const tableCols = tab === "defense" ? defenseColumns : columns;
  const leader = filtered[0];
  const selected = data?.stats.find((s) => s.id === detail),
    comparison = data?.stats.find((s) => s.id === compare);
  const openPlayer = (id: string) => {
    setFilters((f) => ({
      ...f,
      players: f.players.includes(id) ? f.players : [...f.players, id],
    }));
    setDetail(id);
  };
  const chartClick = (entry: any) => {
    if (entry?.id) setFilters((f) => ({ ...f, players: [entry.id] }));
  };
  function downloadStats() {
    const cols = [...columns, ...defenseColumns];
    const csv = [
      ["Player", "Games", ...cols.map((c) => c.name)],
      ...filtered.map((s) => [
        s.name,
        s.games,
        ...cols.map((c) => fnum(s[c.key] as number | null)),
      ]),
    ]
      .map((row) =>
        row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(","),
      )
      .join("\n");
    download("friday-hoops-stats.csv", csv, "text/csv");
  }
  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="brand"
          onClick={() => changeTab("offense")}
          aria-label="Friday Hoops home"
        >
          <span className="brand-ball">◉</span>
          <span>
            FRIDAY<span className="orange">HOOPS</span>
            <small>THE FRIDAY RUN</small>
          </span>
        </button>
        <nav className="desktop-nav" aria-label="Main navigation">
          {[
            ["offense", "Offense", Activity],
            ["defense", "Defense", Shield],
            ["ai", "Ask AI", Sparkles],
          ].map(([key, label, Icon]: any) => (
            <button
              key={key}
              className={tab === key ? "active" : ""}
              onClick={() => changeTab(key)}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </nav>
        <button
          className="manage-button"
          aria-label="Manage data"
          onClick={() => setTab("manage")}
        >
          <Settings2 size={16} />
          <span>Manage data</span>
        </button>
      </header>
      {demo && (
        <div className="demo-strip">
          <span>
            <span className="status-dot" /> DEMO DATA · Fictional games to
            explore the dashboard
          </span>
          <button
            onClick={() => {
              setDemo(false);
              history.replaceState(null, "", location.pathname + location.hash);
              setData(null);
              setMeta(null);
            }}
          >
            Connect live data <ArrowUpRight size={14} />
          </button>
        </div>
      )}
      <main>
        {tab === "manage" ? (
          <Suspense fallback={<p>Loading manager…</p>}>
            <Manage
              demo={demo}
              players={players}
              onClose={() => changeTab("offense")}
              onPublish={() => setReload((r) => r + 1)}
            />
          </Suspense>
        ) : (
          <>
            <section className="page-heading">
              <div>
                <div className="eyebrow">
                  <span className="status-dot" /> YOUR GAME. IN NUMBERS.
                </div>
                <h1>
                  {tab === "offense"
                    ? "Make every play count."
                    : tab === "defense"
                      ? "The other half of the game."
                      : "Your stats. Just ask."}
                </h1>
                <p>
                  {tab === "offense"
                    ? "Buckets, ball movement, and the people you play with."
                    : tab === "defense"
                      ? "Contests, takeaways, and the work between the highlights."
                      : "Explore your Friday games with a little help from AI."}
                </p>
              </div>
              <div className="update">
                <span>LAST UPDATED</span>
                <strong>
                  {meta?.updated_at
                    ? new Date(meta.updated_at).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "Asia/Hong_Kong",
                      })
                    : "No published games"}
                </strong>
                <small>
                  Hong Kong time · Latest game{" "}
                  {meta?.latest ? prettyDate(meta.latest) : "—"}
                </small>
              </div>
            </section>
            <section className="filterbar" aria-label="Dashboard filters">
              <div className="period-switch">
                {(["week", "month", "year", "all", "custom"] as Period[]).map(
                  (p) => (
                    <button
                      key={p}
                      className={p === period ? "selected" : ""}
                      onClick={() => choosePeriod(p)}
                    >
                      {
                        {
                          week: "Week",
                          month: "Month",
                          year: "Year",
                          all: "All time",
                          custom: "Custom",
                        }[p]
                      }
                    </button>
                  ),
                )}
              </div>
              <div className="date-range">
                <CalendarDays size={16} />
                {period === "custom" ? (
                  <>
                    <input
                      type="date"
                      aria-label="Start date"
                      value={filters.from}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, from: e.target.value }))
                      }
                    />
                    <span>to</span>
                    <input
                      type="date"
                      aria-label="End date"
                      value={filters.to}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, to: e.target.value }))
                      }
                    />
                  </>
                ) : (
                  <>
                    <button
                      aria-label="Previous period"
                      onClick={() => {
                        const days =
                          period === "week"
                            ? 7
                            : period === "month"
                              ? new Date(
                                  filters.from.slice(0, 7) + "-01T00:00:00Z",
                                ).getUTCDate()
                              : 365;
                        const anchor =
                          period === "month"
                            ? shiftDate(filters.from, -1)
                            : shiftDate(filters.from, -days);
                        setFilters((f) => ({
                          ...f,
                          ...range(period, anchor, meta?.earliest || anchor),
                        }));
                      }}
                      disabled={period === "all"}
                    >
                      <ArrowLeft size={14} />
                    </button>
                    <span>
                      {filters.from && prettyDate(filters.from)} –{" "}
                      {filters.to && prettyDate(filters.to)}
                    </span>
                    <button
                      aria-label="Next period"
                      onClick={() =>
                        setFilters((f) => ({
                          ...f,
                          ...range(
                            period,
                            shiftDate(f.to, 1),
                            meta?.earliest || f.from,
                          ),
                        }))
                      }
                      disabled={period === "all"}
                    >
                      <ArrowRight size={14} />
                    </button>
                  </>
                )}
              </div>
              <select
                aria-label="Players filter"
                value={filters.players.length === 1 ? filters.players[0] : ""}
                onChange={(e) => {
                  setFilters((f) => ({
                    ...f,
                    players: e.target.value ? [e.target.value] : [],
                  }));
                  setPairGames(null);
                }}
              >
                <option value="">
                  {filters.players.length > 1
                    ? `${filters.players.length} selected players`
                    : "All players"}
                </option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Stat display mode"
                value={filters.mode}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    mode: e.target.value as Filters["mode"],
                  }))
                }
              >
                <option value="totals">Totals</option>
                <option value="per-game">Per game</option>
              </select>
              <button
                className="icon-button"
                title="Reset all filters"
                aria-label="Reset all filters"
                onClick={reset}
              >
                <X size={17} />
              </button>
            </section>
            {filters.from > filters.to && (
              <div className="notice error">
                Start date must be before end date.
              </div>
            )}
            {error && (
              <div className="notice error" role="alert">
                {error}{" "}
                <button onClick={() => setReload((r) => r + 1)}>Retry</button>
                {!demo && (
                  <button
                    onClick={() => {
                      setDemo(true);
                      history.replaceState(
                        null,
                        "",
                        location.pathname + "?demo=1" + location.hash,
                      );
                    }}
                  >
                    Explore sample games
                  </button>
                )}
              </div>
            )}
            {status === "loading" && !data ? (
              <div className="empty">Connecting to your court…</div>
            ) : tab === "ai" ? (
              <Suspense fallback={<p>Loading AI…</p>}>
                <Chat
                  filters={filters}
                  demo={demo}
                  onGame={setGameId}
                  onPlayers={(ids) => {
                    setFilters((f) => ({ ...f, players: ids }));
                    changeTab("offense");
                  }}
                />
              </Suspense>
            ) : data ? (
              <>
                {filters.players.length > 0 && (
                  <div className="filter-chips">
                    {filters.players.map((id) => (
                      <button
                        key={id}
                        onClick={() =>
                          setFilters((f) => ({
                            ...f,
                            players: f.players.filter((p) => p !== id),
                          }))
                        }
                      >
                        {players.find((p) => p.id === id)?.name || id}
                        <X size={13} />
                      </button>
                    ))}
                    <span>Filters apply to both tabs</span>
                  </div>
                )}
                <section className="kpi-grid">
                  {(tab === "offense"
                    ? [
                        {
                          title: "POINTS SCORED",
                          value: totals("points"),
                          label: `Across ${data.totalGames} games`,
                          Icon: Target,
                          color: "orange",
                        },
                        {
                          title: "ASSISTS",
                          value: totals("assists"),
                          label: `${fnum(totals("assistedPoints"))} assisted points`,
                          Icon: Zap,
                          color: "cyan",
                        },
                        {
                          title: "FIELD GOAL %",
                          value: data.shooting.fgAtt
                            ? (data.shooting.fgMade / data.shooting.fgAtt) * 100
                            : null,
                          label: `${fnum(data.shooting.fgMade)} made / ${fnum(data.shooting.fgAtt)} attempts`,
                          Icon: TrendingUp,
                          color: "white",
                          suffix: "%",
                        },
                      ]
                    : [
                        {
                          title: "STEALS",
                          value: totals("steals"),
                          label: "Possessions taken back",
                          Icon: Zap,
                          color: "cyan",
                        },
                        {
                          title: "BLOCKS",
                          value: totals("blocks"),
                          label: "Shots turned away",
                          Icon: Shield,
                          color: "orange",
                        },
                        {
                          title: "DEFENSIVE REBOUNDS",
                          value: totals("dreb"),
                          label: "Possessions secured",
                          Icon: Activity,
                          color: "white",
                        },
                      ]
                  ).map((k) => (
                    <article className="kpi" key={k.title}>
                      <div>
                        <span>
                          {k.title}
                          {filters.mode === "per-game" ? " · Σ PLAYER AVG" : ""}
                        </span>
                        <k.Icon size={20} className={k.color} />
                      </div>
                      <strong>
                        {fnum(k.value)}
                        {k.value !== null && "suffix" in k ? k.suffix : ""}
                      </strong>
                      <small>{k.label}</small>
                      <div className={`kpi-decoration ${k.color}`}>
                        <svg viewBox="0 0 130 36">
                          <path d="M0 30 L18 24 32 29 48 12 62 19 76 9 92 14 108 3 130 5" />
                        </svg>
                      </div>
                    </article>
                  ))}
                </section>
                <div className="section-title">
                  <h2>
                    {tab === "offense"
                      ? "Offensive leaders"
                      : "Defensive leaders"}
                    <span>{data.stats.length} PLAYERS</span>
                  </h2>
                  <button className="text-button" onClick={downloadStats}>
                    <Download size={15} />
                    Export CSV
                  </button>
                </div>
                <section className="panel leaderboard">
                  <div className="panel-tools">
                    <div className="search">
                      <Search size={16} />
                      <input
                        placeholder="Find a player"
                        aria-label="Find a player"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                    <div className="sort-control">
                      <span>Sort by</span>
                      <select
                        aria-label="Sort statistics"
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                      >
                        {[{ key: "games", name: "Games" }, ...tableCols].map(
                          (c) => (
                            <option key={c.key} value={c.key}>
                              {c.name}
                            </option>
                          ),
                        )}
                      </select>
                      <button
                        aria-label="Toggle sort direction"
                        onClick={() => setAsc(!asc)}
                      >
                        <ArrowDown
                          size={15}
                          style={{ transform: asc ? "rotate(180deg)" : "" }}
                        />
                      </button>
                    </div>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th className="sticky-name">PLAYER</th>
                          {[
                            { key: "games", name: "GP", help: "Games played" },
                            ...tableCols,
                          ].map((c) => (
                            <th key={c.key}>
                              <button
                                title={c.help}
                                onClick={() => {
                                  setSort(c.key);
                                  setAsc(sort === c.key ? !asc : false);
                                }}
                                className={sort === c.key ? "sorted" : ""}
                              >
                                {c.name}
                                {sort === c.key && (asc ? " ↑" : " ↓")}
                              </button>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((s, i) => (
                          <tr key={s.id}>
                            <td className="rank">
                              {String(i + 1).padStart(2, "0")}
                            </td>
                            <td className="sticky-name">
                              <button
                                className="player-name"
                                onClick={() => setDetail(s.id)}
                              >
                                <span className={`avatar a${i % 4}`}>
                                  {s.name
                                    .split(" ")
                                    .map((n) => n[0])
                                    .slice(0, 2)
                                    .join("")}
                                </span>
                                {s.name}
                                {s.incomplete && (
                                  <span title="Partial tracking">*</span>
                                )}
                              </button>
                            </td>
                            {[{ key: "games" }, ...tableCols].map((c) => (
                              <td
                                key={c.key}
                                className={
                                  sort === c.key ? "highlight-number" : ""
                                }
                              >
                                {fnum(
                                  s[c.key as keyof Stats] as number | null,
                                  c.key === "pps" ? 2 : 1,
                                )}
                                {c.key.includes("Pct") &&
                                s[c.key as keyof Stats] !== null
                                  ? "%"
                                  : ""}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mobile-players">
                    {filtered.map((s, i) => (
                      <button
                        key={s.id}
                        className="mobile-player"
                        onClick={() => setDetail(s.id)}
                      >
                        <span className="rank">{i + 1}</span>
                        <span className={`avatar a${i % 4}`}>
                          {s.name
                            .split(" ")
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join("")}
                        </span>
                        <span>
                          <strong>{s.name}</strong>
                          <small>
                            {s.games} games{s.incomplete ? " · Partial" : ""}
                          </small>
                        </span>
                        <span className="mobile-stat">
                          <strong>
                            {fnum(s[sort as keyof Stats] as number | null)}
                          </strong>
                          <small>
                            {tableCols.find((c) => c.key === sort)?.name ||
                              "GP"}
                          </small>
                        </span>
                        <ArrowUpRight size={16} />
                      </button>
                    ))}
                  </div>
                  {!filtered.length && (
                    <div className="empty">
                      No players in this range.{" "}
                      <button onClick={reset}>Reset filters</button>
                    </div>
                  )}
                  <div className="panel-foot">
                    <Info size={13} />
                    {filters.mode === "per-game"
                      ? "Averages include only games with complete tracking for each statistic."
                      : "Tap a player to explore their games. All counts come from recorded plays."}
                  </div>
                </section>
                <div className="charts-grid">
                  <section className="panel chart-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>
                          {tab === "offense"
                            ? "A hand in every bucket"
                            : "Defensive activity"}
                        </h2>
                        <p>
                          {tab === "offense"
                            ? "Points scored + points assisted"
                            : "Separate actions. No arbitrary overall rating."}
                        </p>
                      </div>
                      <BarChart3 size={18} />
                    </div>
                    <div className="legend">
                      <span>
                        <i className="orange-dot" />
                        {tab === "offense" ? "Scored" : "Steals"}
                      </span>
                      <span>
                        <i />
                        {tab === "offense" ? "Assisted" : "Blocks"}
                      </span>
                      {tab === "defense" && (
                        <span>
                          <i className="muted-dot" />
                          Deflections
                        </span>
                      )}
                    </div>
                    <div className="chart-box">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={filtered}
                          layout="vertical"
                          margin={{ left: 5, right: 22 }}
                        >
                          <CartesianGrid horizontal={false} stroke="#1d303c" />
                          <XAxis
                            type="number"
                            tick={{ fill: "#8a9ba8", fontSize: 12 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            type="category"
                            dataKey="name"
                            width={75}
                            tickFormatter={(v) => String(v).split(" ")[0]}
                            tick={{ fill: "#d5e3ed", fontSize: 13 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip contentStyle={tooltipStyle} />
                          <Bar
                            dataKey={tab === "offense" ? "points" : "steals"}
                            fill="#ff8743"
                            stackId="a"
                            barSize={22}
                            onClick={chartClick}
                            cursor="pointer"
                          />
                          <Bar
                            dataKey={
                              tab === "offense" ? "assistedPoints" : "blocks"
                            }
                            fill="#32d7ed"
                            stackId="a"
                            radius={[0, 4, 4, 0]}
                            onClick={chartClick}
                            cursor="pointer"
                          />
                          {tab === "defense" && (
                            <Bar
                              dataKey="deflections"
                              fill="#697e96"
                              stackId="a"
                              onClick={chartClick}
                            />
                          )}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="chart-note">
                      {tab === "offense"
                        ? "Individual contribution: assisted baskets also count for the scorer. Do not sum as team points."
                        : "Tap a bar to filter by player. A steal does not automatically count as a deflection."}
                    </p>
                  </section>
                  <section className="panel chart-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>
                          {tab === "offense"
                            ? "Find your rhythm"
                            : "Keep showing up"}
                        </h2>
                        <p>
                          {tab === "offense"
                            ? "Scoring across your Friday sessions"
                            : "Steals and blocks across Friday sessions"}
                        </p>
                      </div>
                      <TrendingUp size={18} />
                    </div>
                    <div className="legend">
                      <span>
                        <i />
                        {tab === "offense" ? "Points" : "Steals"}
                      </span>
                      <span>
                        <i className="orange-dot" />
                        {tab === "offense" ? "Assisted points" : "Blocks"}
                      </span>
                    </div>
                    <div className="chart-box">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={data.trends}
                          margin={{ left: -22, right: 14, top: 10 }}
                          onClick={(s: any) => {
                            if (s?.activeLabel) {
                              setPeriod("custom");
                              setFilters((f) => ({
                                ...f,
                                from: String(s.activeLabel),
                                to: String(s.activeLabel),
                              }));
                            }
                          }}
                        >
                          <defs>
                            <linearGradient
                              id="cyan-fill"
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="1"
                            >
                              <stop
                                offset="0%"
                                stopColor="#32d7ed"
                                stopOpacity={0.25}
                              />
                              <stop
                                offset="100%"
                                stopColor="#32d7ed"
                                stopOpacity={0}
                              />
                            </linearGradient>
                          </defs>
                          <CartesianGrid vertical={false} stroke="#1d303c" />
                          <XAxis
                            dataKey="date"
                            tickFormatter={(d) =>
                              prettyDate(d).replace(", 2026", "")
                            }
                            tick={{ fill: "#8a9ba8", fontSize: 12 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fill: "#8a9ba8", fontSize: 12 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip contentStyle={tooltipStyle} />
                          <Area
                            type="monotone"
                            dataKey={tab === "offense" ? "points" : "steals"}
                            stroke="#32d7ed"
                            strokeWidth={2.5}
                            fill="url(#cyan-fill)"
                            dot={{ r: 4 }}
                          />
                          <Area
                            type="monotone"
                            dataKey={
                              tab === "offense" ? "assistedPoints" : "blocks"
                            }
                            stroke="#ff8743"
                            strokeWidth={2}
                            fill="transparent"
                            dot={{ r: 3 }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="chart-note">
                      Tap a date to see the plays behind it. Choose Month or All
                      time to see your progress.
                    </p>
                  </section>
                </div>
                <div className="charts-grid lower">
                  <section className="panel chart-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>
                          {tab === "offense"
                            ? "Volume meets efficiency"
                            : "Every contest matters"}
                        </h2>
                        <p>
                          {tab === "offense"
                            ? "Attempts × points per shot"
                            : "Weighted attempts × opponent FG%"}
                        </p>
                      </div>
                      <Target size={18} />
                    </div>
                    <div className="chart-box">
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart
                          margin={{ top: 20, right: 28, bottom: 20, left: 0 }}
                        >
                          <CartesianGrid stroke="#1d303c" />
                          <XAxis
                            type="number"
                            dataKey={tab === "offense" ? "fgAtt" : "oppAtt"}
                            name="Attempts"
                            tick={{ fill: "#8a9ba8" }}
                            label={{
                              value: "Attempts",
                              position: "bottom",
                              fill: "#8a9ba8",
                            }}
                          />
                          <YAxis
                            type="number"
                            dataKey={tab === "offense" ? "pps" : "oppPct"}
                            name={
                              tab === "offense"
                                ? "Points per shot"
                                : "Opponent FG%"
                            }
                            tick={{ fill: "#8a9ba8" }}
                          />
                          <ZAxis range={[100, 100]} />
                          <Tooltip
                            contentStyle={tooltipStyle}
                            cursor={{ strokeDasharray: "3 3" }}
                          />
                          <Scatter
                            data={filtered.filter((s) =>
                              tab === "offense"
                                ? s.pps !== null
                                : s.oppPct !== null,
                            )}
                            name="Players"
                            fill="#32d7ed"
                            onClick={chartClick}
                          />
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="chart-note">
                      {tab === "offense"
                        ? "Points per shot = points ÷ field goal attempts. Small samples need context."
                        : `${data.coverage.assigned} of ${data.coverage.shots} recorded shots have defenders. ${data.coverage.partial ? "Opponent recording is partial. " : ""}Shared shots split equally.`}
                    </p>
                  </section>
                  {tab === "offense" ? (
                    <section className="panel connections">
                      <div className="panel-heading">
                        <div>
                          <h2>Better together</h2>
                          <p>Who shares your side of the court?</p>
                        </div>
                        <Users size={19} />
                      </div>
                      <div className="connection-toolbar">
                        <span>TEAMMATE CONNECTIONS</span>
                        <button onClick={() => setPairAsc(!pairAsc)}>
                          {pairAsc ? "Least together" : "Most together"}
                          <ChevronDown size={14} />
                        </button>
                      </div>
                      <div className="pair-list">
                        {[...data.pairs]
                          .sort((a, b) =>
                            pairAsc ? a.games - b.games : b.games - a.games,
                          )
                          .slice(0, 6)
                          .map((p) => (
                            <button
                              key={p.a + p.b}
                              onClick={() => {
                                setPairGames(p.game_ids);
                                setFilters((f) => ({
                                  ...f,
                                  players: [p.a, p.b],
                                }));
                              }}
                            >
                              <span>
                                {p.nameA.split(" ")[0]}{" "}
                                <span className="muted">+</span>{" "}
                                {p.nameB.split(" ")[0]}
                                <small>{p.sharedSessions} shared Fridays</small>
                              </span>
                              <strong>
                                {p.games}
                                <small>games</small>
                              </strong>
                              <ArrowUpRight size={16} />
                            </button>
                          ))}
                      </div>
                      <details className="heatmap">
                        <summary>Explore pairing matrix</summary>
                        <div className="table-scroll">
                          <table>
                            <thead>
                              <tr>
                                <th></th>
                                {players.map((p) => (
                                  <th key={p.id}>{p.name.split(" ")[0]}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {players.map((a) => (
                                <tr key={a.id}>
                                  <th>{a.name.split(" ")[0]}</th>
                                  {players.map((b) => {
                                    const p = data.pairs.find(
                                      (p) =>
                                        [p.a, p.b].includes(a.id) &&
                                        [p.a, p.b].includes(b.id),
                                    );
                                    return (
                                      <td key={b.id}>
                                        {a.id === b.id ? (
                                          "—"
                                        ) : p ? (
                                          <button
                                            title={`${a.name} + ${b.name}: ${p.games} games`}
                                            style={{
                                              background: `rgba(50,215,237,${0.06 + (p.games / Math.max(...data.pairs.map((p) => p.games), 1)) * 0.4})`,
                                            }}
                                            onClick={() => {
                                              setPairGames(p.game_ids);
                                              setFilters((f) => ({
                                                ...f,
                                                players: [a.id, b.id],
                                              }));
                                            }}
                                          >
                                            {p.games}
                                          </button>
                                        ) : (
                                          <span title="No shared Friday in this range">
                                            ·
                                          </span>
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                      <p className="chart-note">
                        A game counts once per pair. Zero means shared Fridays,
                        but never the same team.
                      </p>
                    </section>
                  ) : (
                    <section className="panel defense-explainer">
                      <Shield size={35} />
                      <h2>Give shared defense its credit.</h2>
                      <p>
                        Two defenders on a shot? Each gets half an attempt. If
                        it goes in, each gets half a make.
                      </p>
                      <div className="split-example">
                        <span>
                          Alex<strong>0.5</strong>
                        </span>
                        <span>+</span>
                        <span>
                          Sam<strong>0.5</strong>
                        </span>
                        <span>=</span>
                        <span>
                          Team<strong>1 shot</strong>
                        </span>
                      </div>
                      <p className="chart-note">
                        Unassigned matchups stay unknown. A lower opponent
                        percentage is context, not a complete measure of
                        defensive ability.
                      </p>
                    </section>
                  )}
                </div>
                <section className="panel game-list">
                  <div className="panel-heading">
                    <div>
                      <h2>
                        {pairGames ? "Games together" : "Behind the numbers"}
                      </h2>
                      <p>
                        Open a game to inspect its roster and recorded plays.
                      </p>
                    </div>
                    {pairGames && (
                      <button onClick={() => setPairGames(null)}>
                        Clear pair filter <X size={14} />
                      </button>
                    )}
                  </div>
                  {data.games
                    .filter((g) => !pairGames || pairGames.includes(g.id))
                    .map((g) => (
                      <button
                        className="game-row"
                        key={g.id}
                        onClick={() => setGameId(g.id)}
                      >
                        <span className="game-date">{prettyDate(g.date)}</span>
                        <strong>{g.label}</strong>
                        <span>
                          {g.score
                            ? `${g.score.A} – ${g.score.B}`
                            : "Score unavailable"}
                        </span>
                        <span className="game-status">
                          {g.completed ? "Completed" : "In progress"}
                          {Object.values(g.coverage).some((c) => !c)
                            ? " · Partial"
                            : ""}
                        </span>
                        <ArrowUpRight size={16} />
                      </button>
                    ))}
                  {!demo &&
                    data.games.length <
                      (pairGames?.length ?? data.totalGames) && (
                      <button
                        className="secondary"
                        style={{ margin: 20 }}
                        onClick={loadOlderGames}
                      >
                        Load older games
                      </button>
                    )}
                  {!data.games.length && (
                    <div className="empty">
                      No games yet. The owner can publish the first session in
                      Manage data.
                    </div>
                  )}
                </section>
              </>
            ) : null}
          </>
        )}
        <footer>
          <span className="footer-brand">
            FRIDAY<span className="orange">HOOPS</span>
          </span>
          <span>Every Friday. A little better.</span>
          <span>
            {demo ? "SAMPLE DATA" : `DATA VERSION ${meta?.version || 0}`} · HONG
            KONG TIME
          </span>
        </footer>
      </main>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {[
          ["offense", "Offense", Activity],
          ["defense", "Defense", Shield],
          ["ai", "Ask AI", Sparkles],
        ].map(([key, label, Icon]: any) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => changeTab(key)}
          >
            <Icon size={21} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {detail && (
        <Modal
          title={
            selected?.name ||
            players.find((p) => p.id === detail)?.name ||
            "Player"
          }
          onClose={() => {
            setDetail("");
            setCompare("");
          }}
        >
          <div className="detail-actions">
            <button
              onClick={() => {
                setFilters((f) => ({ ...f, players: [detail] }));
                setDetail("");
              }}
            >
              Filter dashboard to player <Filter size={15} />
            </button>
            <select
              aria-label="Compare with player"
              value={compare}
              onChange={(e) => {
                setCompare(e.target.value);
                if (e.target.value)
                  setFilters((f) => ({
                    ...f,
                    players: [detail, e.target.value],
                  }));
              }}
            >
              <option value="">Compare with…</option>
              {players
                .filter((p) => p.id !== detail)
                .map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </div>
          {selected ? (
            <>
              <p>
                {selected.games} games · {prettyDate(filters.from)} –{" "}
                {prettyDate(filters.to)}
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Statistic</th>
                      <th>{selected.name}</th>
                      {comparison && <th>{comparison.name}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {[...columns, ...defenseColumns].map((c) => (
                      <tr key={c.key}>
                        <th>{c.help}</th>
                        <td>{fnum(selected[c.key] as number | null)}</td>
                        {comparison && (
                          <td>{fnum(comparison[c.key] as number | null)}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Suspense fallback={<p>Loading game history…</p>}>
                <PlayerHistory
                  id={detail}
                  filters={filters}
                  demo={demo}
                  onGame={setGameId}
                />
              </Suspense>
              <h3>Teammates</h3>
              {data?.pairs
                .filter((p) => p.a === detail || p.b === detail)
                .map((p) => (
                  <div className="game-row" key={p.a + p.b}>
                    <span>{p.a === detail ? p.nameB : p.nameA}</span>
                    <strong>{p.games} games together</strong>
                  </div>
                ))}
            </>
          ) : (
            <div className="empty">No recorded statistics in this range.</div>
          )}
        </Modal>
      )}
      {gameId && (
        <Modal
          title={
            game ? `${game.label} · ${prettyDate(game.date)}` : "Loading game…"
          }
          onClose={() => setGameId("")}
        >
          {game && (
            <>
              <div className="rosters">
                {(["A", "B"] as const).map((team) => (
                  <div key={team}>
                    <h3>Team {team}</h3>
                    {game.roster
                      .filter((p) => p.team === team)
                      .map((p) => (
                        <p key={p.id} className={p.outsider ? "outsider" : ""}>
                          {p.outsider
                            ? "Outsider"
                            : players.find((x) => x.id === p.player_id)?.name ||
                              p.player_id}
                        </p>
                      ))}
                  </div>
                ))}
              </div>
              <p className="muted">
                Revision {game.revision} · {game.events.length} recorded plays
              </p>
              <div className="event-list">
                {game.events.map((e) => (
                  <div className="event-row" key={e.id}>
                    <span>{e.sequence}</span>
                    <div>
                      <strong>{nameFor(e.actor, game, players)}</strong>{" "}
                      {e.type === "shot"
                        ? `${e.made ? "made" : "missed"} a ${e.value}-pointer`
                        : e.type}
                      <small>
                        {e.assist
                          ? `Assist: ${nameFor(e.assist, game, players)}. `
                          : ""}
                        {e.defenders.length
                          ? `Defended by ${e.defenders.map((d) => nameFor(d, game, players)).join(" + ")}`
                          : ""}
                      </small>
                    </div>
                    {e.video_seconds !== undefined && (
                      <span>
                        {Math.floor(e.video_seconds / 60)}:
                        {String(Math.floor(e.video_seconds % 60)).padStart(
                          2,
                          "0",
                        )}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
const tooltipStyle = {
  background: "#102330",
  border: "1px solid #294151",
  borderRadius: 10,
  color: "#e9f3fa",
};
function nameFor(id: string, g: GameRecord, ps: Player[]) {
  const p = g.roster.find((p) => p.id === id);
  return p?.outsider
    ? "Outsider"
    : ps.find((x) => x.id === p?.player_id)?.name || id;
}
export function download(
  name: string,
  content: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const dialog = document.querySelector("[data-modal-last]") as HTMLElement;
    dialog?.focus();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function trap(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const dialogs = document.querySelectorAll('[role="dialog"]');
      const el = dialogs[dialogs.length - 1];
      const nodes = el?.querySelectorAll<HTMLElement>(
        'button,select,input,textarea,a[href],[tabindex="0"]',
      );
      if (!nodes?.length) return;
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", trap);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        data-modal-last
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button aria-label="Close dialog" onClick={onClose}>
            <X size={21} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
