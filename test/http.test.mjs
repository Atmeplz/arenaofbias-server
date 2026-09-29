import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HttpError, createRouter, parseCookies } from '../server/http.mjs';

test('parseCookies skips malformed values and keeps valid cookies', () => {
  assert.deepEqual(parseCookies('first=hello%20world; broken=%E0%A4%A; last=yes'), { first: 'hello world', last: 'yes' });
});

test('malformed route parameter encoding returns a 400 error', () => {
  const router = createRouter();
  router.on('GET', '/api/works/:id', () => ({}));
  assert.throws(() => router.match('GET', '/api/works/%E0%A4%A'), (error) => error instanceof HttpError && error.status === 400);
});
