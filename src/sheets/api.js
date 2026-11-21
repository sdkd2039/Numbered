// خدمة الجداول: مصادقة مستقلة وواجهات D1 محمية.
import { json } from "../shared/http.js";

const SESSION_TTL = 60 * 60 * 24 * 14;
const PBKDF2_ITERATIONS = 210000;
const encoder = new TextEncoder();

function b64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function fromB64(value) {
  return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
}
function randomToken(bytes = 32) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return b64(data).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function digest(value) {
  const out = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(out)].map(x => x.toString(16).padStart(2, "0")).join("");
}
async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromB64(salt), iterations: PBKDF2_ITERATIONS }, key, 256);
  return b64(new Uint8Array(bits));
}
async function verifyPassword(password, salt, expected) {
  const actual = await passwordHash(password, salt);
  if (actual.length !== expected.length) return false;
  const a = fromB64(actual), b = fromB64(expected);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
async function bodyJSON(request) {
  try { return await request.json(); } catch { return null; }
}
function fail(message, status = 400) { return json({ success: false, message }, status); }
function validName(value, max = 80) { return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max; }
function validPassword(value) { return typeof value === "string" && value.length >= 12 && value.length <= 128; }
function bearer(request) {
  const value = request.headers.get("Authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}
async function userFor(request, env) {
  const token = bearer(request);
  if (!token || token.length > 256) return null;
  const tokenHash = await digest(token);
  const now = Math.floor(Date.now() / 1000);
  const row = await env.SHEETS_DB.prepare(
    "SELECT u.id, u.username, u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.is_active=1"
  ).bind(tokenHash, now).first();
  if (!row) return null;
  await env.SHEETS_DB.prepare("UPDATE sessions SET last_seen_at=? WHERE token_hash=?").bind(now, tokenHash).run();
  return row;
}
async function logEdit(db, user, action, workbookId = null, sheetId = null, details = {}) {
  await db.prepare("INSERT INTO edit_log (id,user_id,workbook_id,sheet_id,action,details_json) VALUES (?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), user.id, workbookId, sheetId, action, JSON.stringify(details)).run();
}
async function authRoute(request, env, url) {
  const db = env.SHEETS_DB;
  if (!db) return fail("خدمة الجداول غير مربوطة بقاعدة D1 باسم SHEETS_DB.", 503);
  if (url.pathname === "/api/sheets/auth/bootstrap" && request.method === "POST") {
    const input = await bodyJSON(request);
    if (!input || !validName(input.username, 40) || !validPassword(input.password) || typeof input.bootstrapSecret !== "string")
      return fail("أدخل اسم مستخدم وكلمة مرور من 12 حرفًا على الأقل ورمز التهيئة.");
    if (!env.SHEETS_BOOTSTRAP_SECRET || input.bootstrapSecret !== env.SHEETS_BOOTSTRAP_SECRET)
      return fail("رمز التهيئة غير صحيح.", 403);
    const count = await db.prepare("SELECT COUNT(*) AS n FROM users").first();
    if (Number(count?.n || 0) > 0) return fail("تم إنشاء حساب الإدارة مسبقًا؛ لا يمكن إعادة التهيئة.", 409);
    const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
    const hash = await passwordHash(input.password, salt);
    const id = crypto.randomUUID();
    const created = await db.prepare("INSERT INTO users (id,username,password_hash,password_salt,role,is_active) SELECT ?,?,?,?,'admin',1 WHERE NOT EXISTS (SELECT 1 FROM users)")
      .bind(id, input.username.trim(), hash, salt).run();
    if (!created.meta?.changes) return fail("تم إنشاء حساب الإدارة مسبقًا؛ لا يمكن إعادة التهيئة.", 409);
    return json({ success: true, message: "تم إنشاء حساب الإدارة. سجّل الدخول الآن." }, 201);
  }
  if (url.pathname === "/api/sheets/auth/login" && request.method === "POST") {
    const input = await bodyJSON(request);
    if (!input || !validName(input.username, 40) || typeof input.password !== "string") return fail("بيانات الدخول غير مكتملة.");
    const usernameKey = (await digest(input.username.trim().toLowerCase())).slice(0, 64);
    const now = Math.floor(Date.now() / 1000);
    await db.prepare("DELETE FROM login_attempts WHERE attempted_at<?").bind(now - 86400).run();
    const attempts = await db.prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE username_key=? AND attempted_at>? AND succeeded=0")
      .bind(usernameKey, now - 900).first();
    if (Number(attempts?.n || 0) >= 8) return fail("محاولات كثيرة. انتظر 15 دقيقة ثم حاول مجددًا.", 429);
    const user = await db.prepare("SELECT id,username,password_hash,password_salt,is_active FROM users WHERE username=?")
      .bind(input.username.trim()).first();
    const ok = !!user && user.is_active === 1 && await verifyPassword(input.password, user.password_salt, user.password_hash);
    await db.prepare("INSERT INTO login_attempts (username_key,succeeded) VALUES (?,?)").bind(usernameKey, ok ? 1 : 0).run();
    if (!ok) return fail("اسم المستخدم أو كلمة المرور غير صحيحة.", 401);
    const token = randomToken(32);
    const tokenHash = await digest(token);
    const sessionId = crypto.randomUUID();
    await db.prepare("INSERT INTO sessions (id,user_id,token_hash,expires_at) VALUES (?,?,?,?)")
      .bind(sessionId, user.id, tokenHash, now + SESSION_TTL).run();
    return json({ success: true, token, expiresAt: now + SESSION_TTL, user: { id: user.id, username: user.username } });
  }
  return null;
}
async function handleAuthenticated(request, env, url, user) {
  const db = env.SHEETS_DB;
  const path = url.pathname;
  if (path === "/api/sheets/auth/logout" && request.method === "POST") {
    const token = bearer(request);
    await db.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await digest(token)).run();
    return json({ success: true });
  }
  if (path === "/api/sheets/workbooks" && request.method === "GET") {
    const result = await db.prepare("SELECT id,title,created_at,updated_at FROM workbooks WHERE created_by=? ORDER BY updated_at DESC")
      .bind(user.id).all();
    return json({ success: true, workbooks: result.results || [] });
  }
  if (path === "/api/sheets/workbooks" && request.method === "POST") {
    const input = await bodyJSON(request);
    if (!input || !validName(input.title, 120)) return fail("اسم الجدول مطلوب (حتى 120 حرفًا).");
    const workbookId = crypto.randomUUID(), sheetId = crypto.randomUUID(), title = input.title.trim();
    await db.batch([
      db.prepare("INSERT INTO workbooks (id,title,created_by) VALUES (?,?,?)").bind(workbookId, title, user.id),
      db.prepare("INSERT INTO sheets (id,workbook_id,title,position) VALUES (?,?,?,0)").bind(sheetId, workbookId, "ورقة 1"),
      db.prepare("INSERT INTO edit_log (id,user_id,workbook_id,sheet_id,action,details_json) VALUES (?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), user.id, workbookId, sheetId, "workbook.create", JSON.stringify({ title }))
    ]);
    return json({ success: true, workbook: { id: workbookId, title }, sheet: { id: sheetId, title: "ورقة 1" } }, 201);
  }
  let match = path.match(/^\/api\/sheets\/workbooks\/([0-9a-f-]{36})\/sheets$/i);
  if (match && request.method === "GET") {
    const workbook = await db.prepare("SELECT id FROM workbooks WHERE id=? AND created_by=?").bind(match[1], user.id).first();
    if (!workbook) return fail("الجدول غير موجود.", 404);
    const rows = await db.prepare("SELECT id,title,position,row_count,column_count,created_at,updated_at FROM sheets WHERE workbook_id=? ORDER BY position,id")
      .bind(match[1]).all();
    return json({ success: true, sheets: rows.results || [] });
  }
  if (match && request.method === "POST") {
    const input = await bodyJSON(request);
    if (!input || !validName(input.title, 100)) return fail("اسم الورقة مطلوب.");
    const workbook = await db.prepare("SELECT id FROM workbooks WHERE id=? AND created_by=?").bind(match[1], user.id).first();
    if (!workbook) return fail("الجدول غير موجود.", 404);
    const position = await db.prepare("SELECT COALESCE(MAX(position),-1)+1 AS p FROM sheets WHERE workbook_id=?").bind(match[1]).first();
    const id = crypto.randomUUID();
    await db.prepare("INSERT INTO sheets (id,workbook_id,title,position) VALUES (?,?,?,?)")
      .bind(id, match[1], input.title.trim(), Number(position?.p || 0)).run();
    await logEdit(db, user, "sheet.create", match[1], id, { title: input.title.trim() });
    return json({ success: true, sheet: { id, title: input.title.trim() } }, 201);
  }
  match = path.match(/^\/api\/sheets\/sheets\/([0-9a-f-]{36})\/cells$/i);
  if (match && request.method === "GET") {
    const sheet = await db.prepare("SELECT s.id,s.workbook_id FROM sheets s JOIN workbooks w ON w.id=s.workbook_id WHERE s.id=? AND w.created_by=?")
      .bind(match[1], user.id).first();
    if (!sheet) return fail("الورقة غير موجودة.", 404);
    const rows = await db.prepare("SELECT row_index,column_index,value,formula,style_json,updated_at FROM cells WHERE sheet_id=? ORDER BY row_index,column_index LIMIT 10000")
      .bind(match[1]).all();
    return json({ success: true, cells: rows.results || [] });
  }
  if (match && request.method === "PUT") {
    const input = await bodyJSON(request);
    if (!input || !Array.isArray(input.cells) || input.cells.length > 300) return fail("أرسل مصفوفة خلايا لا تتجاوز 300 خلية في الطلب.");
    const sheet = await db.prepare("SELECT s.id,s.workbook_id FROM sheets s JOIN workbooks w ON w.id=s.workbook_id WHERE s.id=? AND w.created_by=?")
      .bind(match[1], user.id).first();
    if (!sheet) return fail("الورقة غير موجودة.", 404);
    const statements = [];
    for (const cell of input.cells) {
      if (!cell || typeof cell !== "object" || Array.isArray(cell)) return fail("صيغة إحدى الخلايا غير صالحة.");
      if (!Number.isInteger(cell.row) || cell.row < 0 || cell.row > 9999 || !Number.isInteger(cell.column) || cell.column < 0 || cell.column > 199)
        return fail("إحداثيات إحدى الخلايا غير صالحة.");
      const value = cell.value == null ? null : String(cell.value).slice(0, 10000);
      const formula = cell.formula == null ? null : String(cell.formula).slice(0, 10000);
      const style = cell.style && typeof cell.style === "object" ? JSON.stringify(cell.style).slice(0, 2000) : "{}";
      statements.push(db.prepare(
        "INSERT INTO cells (id,sheet_id,row_index,column_index,value,formula,style_json,updated_by) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(sheet_id,row_index,column_index) DO UPDATE SET value=excluded.value,formula=excluded.formula,style_json=excluded.style_json,updated_by=excluded.updated_by,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')"
      ).bind(crypto.randomUUID(), match[1], cell.row, cell.column, value, formula, style, user.id));
    }
    if (statements.length) {
      statements.push(db.prepare("INSERT INTO edit_log (id,user_id,workbook_id,sheet_id,action,details_json) VALUES (?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), user.id, sheet.workbook_id, match[1], "cells.update", JSON.stringify({ count: input.cells.length })));
      await db.batch(statements);
    }
    return json({ success: true, saved: input.cells.length });
  }
  match = path.match(/^\/api\/sheets\/workbooks\/([0-9a-f-]{36})$/i);
  if (match && request.method === "DELETE") {
    const result = await db.prepare("DELETE FROM workbooks WHERE id=? AND created_by=?").bind(match[1], user.id).run();
    if (!result.meta?.changes) return fail("الجدول غير موجود.", 404);
    await logEdit(db, user, "workbook.delete", null, null, { workbookId: match[1] });
    return json({ success: true });
  }
  return fail("مسار الجداول غير موجود.", 404);
}

export async function handleSheets(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/sheets/")) return null;
  if (!env.SHEETS_DB) return fail("قاعدة الجداول غير مربوطة باسم SHEETS_DB.", 503);
  try {
    const auth = await authRoute(request, env, url);
    if (auth) return auth;
    const user = await userFor(request, env);
    if (!user) return fail("يلزم تسجيل الدخول إلى الجداول.", 401);
    return await handleAuthenticated(request, env, url, user);
  } catch (error) {
    console.error("Sheets API error", error);
    return fail("حدث خطأ أثناء معالجة طلب الجداول.", 500);
  }
}
