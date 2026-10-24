import { createBackend } from '../../src/sync/backend.js';

/* a stand-in for the supabase-js client: records calls, answers with the queued replies */
function fakeClient(replies) {
  const calls = [];
  const r = Object.assign({
    select: { data: [], error: null, status: 200 },
    rpc: { data: [{ ok: true, version: 1, value: null }], error: null, status: 200 },
    del: { error: null, status: 204 },
    session: { data: { session: { user: { id: 'u1' } } } },
    refresh: { data: { session: {} }, error: null }
  }, replies || {});
  return {
    calls,
    from(table) {
      return {
        select(cols) { calls.push(['select', table, cols]); return Promise.resolve(r.select); },
        delete() {
          return { eq(col, val) { calls.push(['delete', table, col, val]); return Promise.resolve(r.del); } };
        }
      };
    },
    rpc(name, args) { calls.push(['rpc', name, args]); return Promise.resolve(r.rpc); },
    auth: {
      getSession() { return Promise.resolve(r.session); },
      refreshSession() {
        if (r.refresh instanceof Error) return Promise.reject(r.refresh);
        return Promise.resolve(r.refresh);
      }
    }
  };
}

test('fetchAll reads key, value and version from user_data', async () => {
  const rows = [{ key: 'w150.meta', value: { v: 1 }, version: 3 }];
  const sb = fakeClient({ select: { data: rows, error: null, status: 200 } });
  const be = createBackend(sb);
  expect(await be.fetchAll()).toEqual(rows);
  expect(sb.calls).toEqual([['select', 'user_data', 'key, value, version']]);
});

test('errors carry the HTTP status, 401 included', async () => {
  const sb = fakeClient({ select: { data: null, error: { message: 'JWT expired' }, status: 401 } });
  const be = createBackend(sb);
  await expect(be.fetchAll()).rejects.toMatchObject({ status: 401, message: 'JWT expired' });
});

test('put calls put_user_data and returns { ok, version, value }', async () => {
  const sb = fakeClient({ rpc: { data: [{ ok: false, version: 7, value: [1] }], error: null, status: 200 } });
  const be = createBackend(sb);
  expect(await be.put('w150.sessions', [2], 6)).toEqual({ ok: false, version: 7, value: [1] });
  expect(sb.calls).toEqual([['rpc', 'put_user_data', { p_key: 'w150.sessions', p_value: [2], p_expected_version: 6 }]]);
});

test('put with an empty reply throws', async () => {
  const be = createBackend(fakeClient({ rpc: { data: [], error: null, status: 200 } }));
  await expect(be.put('w150.meta', {}, null)).rejects.toThrow('Empty reply from put_user_data.');
});

test('remove deletes the row by key', async () => {
  const sb = fakeClient();
  await createBackend(sb).remove('w150.breaks');
  expect(sb.calls).toEqual([['delete', 'user_data', 'key', 'w150.breaks']]);
});

test('refreshAuth: success and retryable failures return true, an ended session calls onAuthLost', async () => {
  let lost = 0;
  const onAuthLost = () => { lost++; };
  expect(await createBackend(fakeClient(), { onAuthLost }).refreshAuth()).toBe(true);
  const net = Object.assign(new Error('Failed to fetch'), { name: 'AuthRetryableFetchError' });
  expect(await createBackend(fakeClient({ refresh: net }), { onAuthLost }).refreshAuth()).toBe(true);
  expect(await createBackend(fakeClient({ refresh: { data: { session: null }, error: { name: 'AuthRetryableFetchError', status: 502, message: 'Bad gateway' } } }), { onAuthLost }).refreshAuth()).toBe(true);
  expect(lost).toBe(0);
  expect(await createBackend(fakeClient({ refresh: { data: { session: null }, error: { name: 'AuthApiError', status: 400, message: 'Invalid Refresh Token' } } }), { onAuthLost }).refreshAuth()).toBe(false);
  expect(lost).toBe(1);
});

test('a request made while another user is signed in fails and reports the switch', async () => {
  let switched = 0;
  const sb = fakeClient({ session: { data: { session: { user: { id: 'u2' } } } } });
  const be = createBackend(sb, { getUserId: () => 'u1', onUserSwitched: () => { switched++; } });
  await expect(be.put('w150.meta', {}, 1)).rejects.toMatchObject({ status: 409 });
  expect(switched).toBe(1);
  expect(sb.calls).toEqual([]);
});
