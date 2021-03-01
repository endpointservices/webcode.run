import {checkRate, BURSTABLE_RATE_LIMIT} from './limits.mjs';

test('check fastconverge fails fast', () => {
  expect(checkRate("f1", {
    fastConverge: true,
    limit: 0.01
  }, 1)).toBe(true)

  expect(() => checkRate("f1", {
    fastConverge: true,
    limit_hz: 0.01
  }, 1)).toThrow();
});

test('BURSTABLE_RATE_LIMIT enabled after burst of 10', () => {
  for (let i = 0; i < 20; i++) {
    expect(checkRate("R1", BURSTABLE_RATE_LIMIT, 0)).toBe(true)
  }
  expect(() => checkRate("R1", BURSTABLE_RATE_LIMIT, 0)).toThrow()

  expect(checkRate("R1", BURSTABLE_RATE_LIMIT, 1.1)).toBe(true)
});
