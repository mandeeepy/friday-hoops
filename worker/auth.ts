import { hash, HttpError } from "./store";
export type Env = {
  DB: D1Database;
  OWNER_PASSPHRASE?: string;
  FRIEND_ACCESS_CODE?: string;
  DEEPSEEK_API_KEY?: string;
  ALLOWED_ORIGIN: string;
  AI_MONTHLY_USD: string;
  AI_FLASH_MODEL: string;
  AI_PRO_MODEL: string;
  AI_FLASH_INPUT_PRICE: string;
  AI_FLASH_OUTPUT_PRICE: string;
  AI_PRO_INPUT_PRICE: string;
  AI_PRO_OUTPUT_PRICE: string;
};
export async function throttle(
  db: D1Database,
  key: string,
  limit: number,
  seconds: number,
) {
  const now = Math.floor(Date.now() / 1000);
  const bucket = `${key}:${Math.floor(now / seconds)}`;
  const r: any = await db
    .prepare(
      "INSERT INTO limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
    )
    .bind(bucket, now + seconds)
    .first();
  if (r.count > limit)
    throw new HttpError(
      429,
      "Too many requests. Please wait before trying again.",
    );
}
export async function login(
  request: Request,
  env: Env,
  role: "owner" | "friend",
  body: any,
) {
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  await throttle(env.DB, `login:${role}:${await hash(ip)}`, 5, 60);
  const secret =
    role === "owner" ? env.OWNER_PASSPHRASE : env.FRIEND_ACCESS_CODE;
  if (!secret)
    throw new HttpError(
      503,
      `${role === "owner" ? "Owner" : "Friend"} access has not been configured yet.`,
    );
  const candidate = typeof body.code === "string" ? body.code : "";
  if ((await hash(candidate)) !== (await hash(secret)))
    throw new HttpError(401, "Incorrect access code.");
  const token = crypto.randomUUID() + crypto.randomUUID();
  const expires = Math.floor(Date.now() / 1000) + 8 * 3600;
  await env.DB.prepare(
    "INSERT INTO auth_sessions(token_hash,role,expires_at,secret_hash) VALUES(?,?,?,?)",
  )
    .bind(await hash(token), role, expires, await hash(secret))
    .run();
  return { token, expires_at: expires };
}
export async function authorize(
  request: Request,
  env: Env,
  role: "owner" | "friend",
) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer /, "");
  if (!token) throw new HttpError(401, "Please unlock access first.");
  const row: any = await env.DB.prepare(
    "SELECT * FROM auth_sessions WHERE token_hash=? AND expires_at>?",
  )
    .bind(await hash(token), Math.floor(Date.now() / 1000))
    .first();
  const secret =
    row?.role === "owner" ? env.OWNER_PASSPHRASE : env.FRIEND_ACCESS_CODE;
  if (
    !row ||
    row.role !== role ||
    !secret ||
    row.secret_hash !== (await hash(secret))
  )
    throw new HttpError(401, "Access expired. Please unlock again.");
  return row;
}
