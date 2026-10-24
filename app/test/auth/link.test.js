import { COPY } from '../../src/auth/copy.js';
import { readLink, routeForLink, cleanLocation, safeNext } from '../../src/auth/link.js';

test('copy is exact', () => {
  expect(COPY.wrong).toBe('Wrong username or password.');
  expect(COPY.recovery).toBe('If that account exists, we sent an email.');
  expect(COPY.rate).toBe('Too many attempts. Try again in a few minutes.');
});

test('routeForLink', () => {
  expect(routeForLink(readLink('#access_token=x&type=signup', ''))).toMatchObject({ path: '/login', msg: 'Email verified. You can log in now.' });
  expect(routeForLink(readLink('#access_token=x&type=recovery', ''))).toMatchObject({ path: '/reset' });
  expect(routeForLink(readLink('#error_code=otp_expired', ''))).toMatchObject({ path: '/forgot', msg: 'This link has expired or was already used. Request a new one.' });
  expect(routeForLink(readLink('#splits', ''))).toBe(null);
});

test('readLink reads the hash and the query, error before type', () => {
  expect(readLink('', '?type=signup')).toEqual({ type: 'signup', errorCode: '' });
  expect(readLink('#error=access_denied', '')).toEqual({ type: '', errorCode: 'access_denied' });
  expect(routeForLink(readLink('#error_code=otp_expired&type=signup', ''))).toMatchObject({ path: '/forgot' });
  expect(routeForLink(readLink('', ''))).toBe(null);
});

test('cleanLocation drops auth link parts and keeps a plain section anchor', () => {
  expect(cleanLocation({ path: '/', query: {}, hash: '#splits' })).toBe(null);
  expect(cleanLocation({ path: '/', query: {}, hash: '#access_token=x&type=magiclink' })).toEqual({ path: '/', query: {}, hash: '', replace: true });
  expect(cleanLocation({ path: '/log', query: { code: 'c', from: 'x' }, hash: '' })).toEqual({ path: '/log', query: { from: 'x' }, hash: '', replace: true });
});

test('safeNext only follows same-site paths', () => {
  expect(safeNext('/activity/sample_32?from=log')).toBe('/activity/sample_32?from=log');
  expect(safeNext('//evil.example')).toBe('/');
  expect(safeNext('https://evil.example')).toBe('/');
  expect(safeNext(undefined)).toBe('/');
});
