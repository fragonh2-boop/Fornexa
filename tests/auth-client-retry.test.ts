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

test("a successfully loaded browser client remains cached", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;

  globalThis.fetch = async () => {
    attempts += 1;
    return new Response(
      JSON.stringify({
        url: "https://example.supabase.co",
        key: "public-anon-key-for-client-cache-test",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  try {
    const { createClient } = await import(`../lib/supabase/client.ts?cache=${Date.now()}`);
    const firstClient = await createClient();
    const secondClient = await createClient();

    assert.strictEqual(secondClient, firstClient);
    assert.equal(attempts, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
