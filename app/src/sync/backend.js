/*
 * The backend the sync store (./store.js) talks to: Supabase table user_data and rpc
 * put_user_data. Moved from the adapter inside web/js/auth.js.
 *
 *   createBackend(supabaseClient, { onAuthLost, getUserId, onUserSwitched })
 *     -> { fetchAll, put, remove, refreshAuth }
 *   onAuthLost()       the refresh token no longer works (the session ended); refreshAuth then
 *                      resolves false and the store holds its writes until flush()
 *   getUserId()        optional: the id of the user this cache belongs to (null to skip the check)
 *   onUserSwitched()   optional: another account is signed in on this browser; every request
 *                      then fails with status 409 so this user's cache is not sent with that token
 * Errors are Error objects with a numeric status (401 when the access token expired, 0 when the
 * request never got a status), the shape the store expects.
 */
function noop() {}

export function httpError(error, status) {
  const e = new Error((error && error.message) || 'Request failed.');
  e.status = typeof status === 'number' ? status : 0;
  return e;
}

/* the request never reached the server (supabase-js reports status 0) */
function isNetworkAuthError(error) {
  return !!error && !error.status && (error.name === 'AuthRetryableFetchError' || /fetch|network/i.test(String(error.message || '')));
}

export function createBackend(sb, opts) {
  opts = opts || {};
  const onAuthLost = typeof opts.onAuthLost === 'function' ? opts.onAuthLost : noop;
  const getUserId = typeof opts.getUserId === 'function' ? opts.getUserId : function () { return null; };
  const onUserSwitched = typeof opts.onUserSwitched === 'function' ? opts.onUserSwitched : noop;

  /* tabs share one stored session: when another tab signs in as someone else, this tab must
     not send its cache or queue with that user's token */
  async function assertSameUser() {
    const userId = getUserId();
    if (!userId) return;
    const r = await sb.auth.getSession();
    const s = r && r.data && r.data.session;
    if (s && s.user && s.user.id !== userId) {
      onUserSwitched();
      throw httpError({ message: 'Signed in as another user.' }, 409);
    }
  }

  return {
    fetchAll: async function () {
      await assertSameUser();
      const r = await sb.from('user_data').select('key, value, version');
      if (r.error) throw httpError(r.error, r.status);
      return r.data || [];
    },
    put: async function (key, value, expectedVersion) {
      await assertSameUser();
      const r = await sb.rpc('put_user_data', { p_key: key, p_value: value, p_expected_version: expectedVersion });
      if (r.error) throw httpError(r.error, r.status);
      const row = Array.isArray(r.data) ? r.data[0] : r.data;
      if (!row) throw httpError({ message: 'Empty reply from put_user_data.' }, r.status);
      return { ok: row.ok, version: row.version, value: row.value };
    },
    remove: async function (key) {
      await assertSameUser();
      const r = await sb.from('user_data').delete().eq('key', key);
      if (r.error) throw httpError(r.error, r.status);
    },
    refreshAuth: async function () {
      let r;
      try { r = await sb.auth.refreshSession(); } catch (e) { r = { error: e }; }
      if (!r.error && r.data && r.data.session) return true;
      /* a refresh that failed on the network or a server hiccup (supabase-js marks both
         retryable) is not an ended session: let the store back off and try again */
      if (isNetworkAuthError(r.error) || (r.error && r.error.name === 'AuthRetryableFetchError')) return true;
      onAuthLost();
      return false;
    }
  };
}
