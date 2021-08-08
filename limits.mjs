import notebook from '@tomlarkworthy/rate-estimation-min'
import Observable from '@observablehq/runtime'

const module = new Observable.Runtime().module(notebook);
const rate_estimator = await module.value("rate_estimator");

const limiters = {};

export const BURSTABLE_RATE_LIMIT = {
    fastConverge: false, // So burst are allowed
    limit_hz: 2,         // Long term max rate
    forgetFactor: 0.45,  // 20 request needed to have problems
    initial_rate: 0,
};

export function checkRate(id, config, now_secs) {
    if (!limiters[id]) {
        limiters[id] = rate_estimator(config);
    }
    const limiter = limiters[id];

    // check
    const limiterAfterEvent = limiter.observeAtTime(now_secs);
    if (limiterAfterEvent.estimateRateAtTime(now_secs) > config.limit_hz) {
        // Fail
        throw new Error("Rate limit")
    } else {
        limiters[id] = limiterAfterEvent
        return true;
    }
}

export function limiter(req, res, next) {
    try {
        checkRate(req.ip,  BURSTABLE_RATE_LIMIT, Date.now() * 0.001);
    } catch (err) {
        console.log("IP Burstable limit hit");
        res.header('Retry-After', '2')
        return res.status(429).send("Burstable rate limit of 1 request per second per IP exceeded");
    }

    try {
        checkRate(req.url, BURSTABLE_RATE_LIMIT, Date.now() * 0.001);
    } catch (err) {
        console.log("URL Burstable limit hit");
        res.header('Retry-After', '2')
        return res.status(429).send("Burstable rate limit of 1 request per second per IP exceeded");
    }
    next()
}

