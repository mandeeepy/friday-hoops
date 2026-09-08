import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { demoGames } from "../shared/demo";
import { gameRows } from "../shared/stats";
import { prettyDate } from "../shared/dates";
import { request, qs } from "./api";
import type { Filters, StatRow } from "../shared/model";
export default function PlayerHistory({
  id,
  filters,
  demo,
  onGame,
}: {
  id: string;
  filters: Filters;
  demo: boolean;
  onGame: (id: string) => void;
}) {
  const [rows, setRows] = useState<StatRow[]>([]),
    [error, setError] = useState(""),
    [more, setMore] = useState(false);
  async function load(offset = 0) {
    try {
      const result = demo
        ? demoGames
            .filter((g) => g.date >= filters.from && g.date <= filters.to)
            .flatMap(gameRows)
            .filter((r) => r.player_id === id)
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(offset, offset + 100)
        : await request<StatRow[]>(
            `/players/${id}/history?${qs(filters)}&offset=${offset}`,
          );
      setRows((r) => (offset ? [...r, ...result] : result));
      setMore(result.length === 100);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    setRows([]);
    load();
  }, [id, filters.from, filters.to, demo]);
  return (
    <>
      <h3>Game-by-game progress</h3>
      {error && <p role="alert">{error}</p>}
      <div className="legend">
        <span>
          <i />
          Points
        </span>
        <span>
          <i className="orange-dot" />
          Assisted points
        </span>
      </div>
      <div className="chart-box">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={[...rows]
              .reverse()
              .map((r) => ({ ...r.values, date: r.date, game_id: r.game_id }))}
            onClick={(s: any) => {
              const item = s?.activePayload?.[0]?.payload;
              if (item?.game_id) onGame(item.game_id);
            }}
          >
            <CartesianGrid stroke="#203442" />
            <XAxis
              dataKey="date"
              tickFormatter={(v) => prettyDate(v)}
              tick={{ fill: "#91abba", fontSize: 12 }}
            />
            <YAxis tick={{ fill: "#91abba", fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                background: "#102633",
                border: "1px solid #355060",
                color: "white",
              }}
            />
            <Line dataKey="points" stroke="#35d5e9" strokeWidth={2} />
            <Line dataKey="assistedPoints" stroke="#ff8845" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {rows.map((r) => (
        <button
          className="game-row"
          key={r.game_id}
          onClick={() => onGame(r.game_id)}
        >
          <span>{prettyDate(r.date)}</span>
          <strong>
            {r.values.points} PTS · {r.values.assists} AST
          </strong>
          <span>
            {Object.values(r.coverage).every(Boolean) ? "Complete" : "Partial"}
          </span>
        </button>
      ))}
      {more && (
        <button className="secondary" onClick={() => load(rows.length)}>
          Load older games
        </button>
      )}
    </>
  );
}
