#!/usr/bin/env node
// Audit which Kilo credential works. Run with:
//   node --env-file=.env.local scripts/audit-kilo-key.mjs
// Safe: prints only HTTP statuses and short error text, never the keys.

const candidates = ["AI_API_KEY", "KILOCODE_API_KEY", "KILO_API_KEY"];
const baseUrl =
  (process.env.AI_BASE_URL ||
    process.env.KILOCODE_BASE_URL ||
    process.env.KILO_BASE_URL ||
    "https://ai-gateway.kilo.ai/api/v1").replace(/\/$/, "");

console.log("Base URL:", baseUrl);
console.log("AI_BASE_URL set:", Boolean(process.env.AI_BASE_URL));
console.log("");

for (const name of candidates) {
  const key = (process.env[name] || "").trim();
  if (!key) {
    console.log(`${name}: MISSING`);
    continue;
  }

  // 1) Authenticated GET to /models (public endpoint; auth may be ignored).
  let modelsStatus = "n/a";
  let modelsDetail = "";
  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: { authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    modelsStatus = String(res.status);
    if (!res.ok) modelsDetail = (await res.text()).slice(0, 120);
  } catch (error) {
    modelsStatus = "error";
    modelsDetail = error instanceof Error ? error.message : String(error);
  }

  // 2) Minimal chat completion to truly validate the key.
  let chatStatus = "n/a";
  let chatDetail = "";
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "kilo-auto/free",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 4,
      }),
    });
    chatStatus = String(res.status);
    if (!res.ok) chatDetail = (await res.text()).slice(0, 160);
  } catch (error) {
    chatStatus = "error";
    chatDetail = error instanceof Error ? error.message : String(error);
  }

  console.log(`${name}: present (length ${key.length})`);
  console.log(`  GET  /models            -> ${modelsStatus}${modelsDetail ? " | " + modelsDetail : ""}`);
  console.log(`  POST /chat/completions  -> ${chatStatus}${chatDetail ? " | " + chatDetail : ""}`);
  console.log("");
}