// Placeholder entrypoint so the Supabase CLI can start; Task 3 replaces it.
Deno.serve(() => new Response(JSON.stringify({ error: "not_implemented" }), { status: 501, headers: { "content-type": "application/json" } }));
