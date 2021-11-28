import {checkRate, OBSERVABLE_RATE_LIMIT, REQUEST_RATE_LIMIT} from './limits.mjs';
import createError from "http-errors";

test('createError works', () => {
  expect(() => {
    throw createError(400, "No");
  }).toThrow()
})

test('REQUEST_RATE_LIMIT enabled after burst of 100', async () => {
  for (let i = 0; i < 100; i++) {
    expect(await checkRate("R1", REQUEST_RATE_LIMIT)).toBe(true)
  }
  expect(checkRate("R1", REQUEST_RATE_LIMIT)).rejects.toThrow()
});

test('OBSERVABLE_RATE_LIMIT enabled after burst of 20', async () => {
  for (let i = 0; i < 20; i++) {
    expect(await checkRate("R1", OBSERVABLE_RATE_LIMIT)).toBe(true)
  }
  expect(checkRate("R1", OBSERVABLE_RATE_LIMIT)).rejects.toThrow()
});
