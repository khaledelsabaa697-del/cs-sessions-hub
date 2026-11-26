import { buildModelPlan, runModelFallback, nextJobState, buildGradePatch, isPendingSubmissionStatus } from "../src/lib/grading/fallback-core.ts";
import { parseKiloCatalog } from "../src/lib/grading/catalog-core.ts";

let passed = 0;
let failed = 0;
function assert(name, condition, extra = "") {
  if (condition) {
    passed += 1;
    console.log("PASS", name);
  } else {
    failed += 1;
    console.log("FAIL", name, extra);
  }
}

const freeA = { id: "a", displayName: "A", provider: "x", isFree: true, supportsJsonMode: true, available: true, contextLength: 100, maxCompletionTokens: 1000, pricingPrompt: 0, pricingCompletion: 0 };
const freeB = { id: "b", displayName: "B", provider: "y", isFree: true, supportsJsonMode: true, available: true, contextLength: 200, maxCompletionTokens: 1000, pricingPrompt: 0, pricingCompletion: 0 };
const freeC = { id: "c", displayName: "C", provider: "z", isFree: true, supportsJsonMode: false, available: true, contextLength: 50, maxCompletionTokens: 1000, pricingPrompt: 0, pricingCompletion: 0 };
const paid = { id: "paid", displayName: "Paid", provider: "p", isFree: false, supportsJsonMode: true, available: true, contextLength: 999, maxCompletionTokens: 1000, pricingPrompt: 1, pricingCompletion: 2 };
const unavailable = { id: "gone", displayName: "Gone", provider: "g", isFree: true, supportsJsonMode: true, available: false, contextLength: 10, maxCompletionTokens: 1000, pricingPrompt: 0, pricingCompletion: 0 };

// Test 1: paid model never in auto plan
const planAuto = buildModelPlan({ mode: "auto_free", preferredModel: null, allowPaid: false, models: [freeA, freeB, paid, unavailable], cooldowns: {}, maxModels: 6 });
assert("paid excluded from auto plan", !planAuto.some((m) => m.id === "paid"));
assert("unavailable excluded", !planAuto.some((m) => m.id === "gone"));
assert("auto plan has free models", planAuto.length === 2);

// Test 2: manual free tries preferred first
const planManual = buildModelPlan({ mode: "manual_free", preferredModel: "b", allowPaid: false, models: [freeA, freeB, freeC], cooldowns: {}, maxModels: 6 });
assert("preferred first", planManual[0].id === "b");

// Test 3: cooldown removes model
const planCooldown = buildModelPlan({ mode: "manual_free", preferredModel: "b", allowPaid: false, models: [freeA, freeB], cooldowns: { b: Date.now() + 60_000 }, maxModels: 6 });
assert("cooled preferred skipped", !planCooldown.some((m) => m.id === "b"));

// Test 4: fallback 429 then success
const calls429 = [];
const result429 = await runModelFallback({
  plan: [freeA, freeB],
  attempt: async (model) => {
    calls429.push(model.id);
    if (model.id === "a") return { ok: false, error: { code: "rateLimited", message: "429", retryAfterSeconds: 10 } };
    return { ok: true, value: { score: 42 } };
  },
  recordFailure: async () => {},
  now: () => Date.now(),
  sleep: async () => {},
});
assert("429 fallback succeeds", result429.ok === true && result429.model.id === "b");
assert("429 fallback used b", result429.value.score === 42);
assert("429 calls both", calls429.join(",") === "a,b");

// Test 5: first two fail, third succeeds
const result3 = await runModelFallback({
  plan: [freeA, freeB, freeC],
  attempt: async (model) => {
    if (model.id === "a" || model.id === "b") return { ok: false, error: { code: "api", message: "500" } };
    return { ok: true, value: { score: 7 } };
  },
  recordFailure: async () => {},
  sleep: async () => {},
});
assert("third succeeds", result3.ok === true && result3.model.id === "c");

// Test 6: all rate limited
const resultAll = await runModelFallback({
  plan: [freeA, freeB],
  attempt: async () => ({ ok: false, error: { code: "rateLimited", message: "429" } }),
  recordFailure: async () => {},
  sleep: async () => {},
});
assert("all rate limited", resultAll.ok === false && resultAll.allRateLimited === true);

// Test 7: fatal 401 stops and never touches second model
const callsFatal = [];
const resultFatal = await runModelFallback({
  plan: [freeA, freeB],
  attempt: async (model) => {
    callsFatal.push(model.id);
    return { ok: false, error: { code: "auth", message: "401", fatal: true } };
  },
  recordFailure: async () => {},
  sleep: async () => {},
});
assert("fatal stops chain", callsFatal.join(",") === "a" && resultFatal.reason === "fatal");

// Test 8: paid model never selected in fallback sequence for auto/manual free
const planPaid = buildModelPlan({ mode: "manual_free", preferredModel: "paid", allowPaid: true, models: [freeA, paid], cooldowns: {}, maxModels: 6 });
assert("paid not in manual free plan", !planPaid.some((m) => !m.isFree));

// Test 9: manual_paid puts paid first but keeps free fallback
const planManualPaid = buildModelPlan({ mode: "manual_paid", preferredModel: "paid", allowPaid: true, models: [freeA, paid], cooldowns: {}, maxModels: 6 });
assert("manual_paid first is paid", planManualPaid[0].id === "paid");
assert("manual_paid keeps free fallback", planManualPaid.some((m) => m.id === "a"));

// Test 10: no models
const resultNone = await runModelFallback({
  plan: [],
  attempt: async () => ({ ok: true, value: {} }),
  recordFailure: async () => {},
  sleep: async () => {},
});
assert("no models reason", resultNone.reason === "no_models");

// Test 11: nextJobState retry
const d1 = nextJobState({ attempts: 1, maxAttempts: 3, allRateLimited: true, gatewayBusy: false, earliestCooldownAt: Date.now() + 1_000_000, now: Date.now() });
assert("rate limited retry", d1.status === "pending_retry" && d1.delayMs >= 600_000);
const d2 = nextJobState({ attempts: 3, maxAttempts: 3, allRateLimited: false, gatewayBusy: false, now: Date.now() });
assert("max attempts failed", d2.status === "failed");

// Test 12: buildGradePatch does not overwrite teacher score
const patch = buildGradePatch({
  aiScore: 5,
  feedbackEn: "ok",
  feedbackAr: "ok",
  issues: [],
  rubricScores: [],
  actualModel: "m",
  selectedModel: "m",
  provider: "p",
  attempts: 1,
  durationMs: 10,
  promptTokens: 1,
  completionTokens: 1,
  cost: 0,
  fallbackUsed: false,
  existingFinalScore: 9,
  currentStatus: "graded",
  gradedBy: "teacher",
  nowIso: "2026-01-01T00:00:00.000Z",
});
assert("teacher final preserved", patch.final_score === undefined && patch.status === undefined);

// Test 13: idempotent patch same values
const patch2 = buildGradePatch({
  aiScore: 5,
  feedbackEn: "ok",
  feedbackAr: "ok",
  issues: [],
  rubricScores: [],
  actualModel: "m",
  selectedModel: "m",
  provider: "p",
  attempts: 1,
  durationMs: 10,
  promptTokens: 1,
  completionTokens: 1,
  cost: 0,
  fallbackUsed: false,
  existingFinalScore: null,
  currentStatus: "queued",
  gradedBy: null,
  nowIso: "2026-01-01T00:00:00.000Z",
});
assert("first grade sets status graded", patch2.status === "graded" && patch2.final_score === 5);

// Test 14: catalog filtering
const payload = {
  data: [
    { id: "free1", name: "Free 1", isFree: true, architecture: { output_modalities: ["text"] }, pricing: { prompt: "0", completion: "0" }, supported_parameters: ["response_format"] },
    { id: "paid1", name: "Paid 1", isFree: false, architecture: { output_modalities: ["text"] }, pricing: { prompt: "0.001", completion: "0.002" }, supported_parameters: [] },
    { id: "zero-unmarked", name: "Zero", isFree: false, architecture: { output_modalities: ["text"] }, pricing: { prompt: "0", completion: "0" }, supported_parameters: [] },
    { id: "image-model", name: "Image", isFree: true, architecture: { output_modalities: ["image"] }, pricing: { prompt: "0", completion: "0" }, supported_parameters: [] },
  ],
};
const models = parseKiloCatalog(payload);
assert("catalog keeps 3 text models", models.length === 3);
assert("catalog free count 1", models.filter((m) => m.isFree).length === 1);
assert("paid model has pricing", models.find((m) => m.id === "paid1")?.pricingPrompt === 0.001);

// Test 15: pending status helper
assert("queued is pending", isPendingSubmissionStatus("queued"));
assert("graded not pending", !isPendingSubmissionStatus("graded"));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);