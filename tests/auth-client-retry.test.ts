import assert from "node:assert/strict";
import test from "node:test";

test("a transient browser-client load failure is retried in the same tab", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;

  globalThis.fetch = async () => {
    attempts += 1;
    throw new TypeError("temporary network failure");
  };

  try {
    const { createClient } = await import(`../lib/supabase/client.ts?retry=${Date.now()}`);
    await assert.rejects(createClient(), /temporary network failure/);
    await assert.rejects(createClient(), /temporary network failure/);
    assert.equal(attempts, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
