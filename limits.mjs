import createError from "http-errors";
import LeakyBucket from 'leaky-bucket';

const limiters = {};
const configs = [];

export const REQUEST_RATE_LIMIT = 0;
configs[REQUEST_RATE_LIMIT] = {
    capacity: 20 * 5,
    interval: 1 * 5,
};

export const OBSERVABLE_RATE_LIMIT = 1;
configs[OBSERVABLE_RATE_LIMIT] = {
    capacity: 2 * 10,
    interval: 1 * 10,
};

export async function checkRate(id, config) {
    if (!limiters[config]) limiters[config] = {};
    if (!limiters[config][id]) {
        limiters[config][id] = new LeakyBucket(configs[config]);
    }
    const limiter = limiters[config][id];

    // check
    await limiter.throttle();
    return true;
}

export async function requestLimiter(req, res, next) {
    try {
        await checkRate(req.ip,  REQUEST_RATE_LIMIT);
    } catch (err) {
        console.log("IP Burstable limit hit");
        return res.status(429).send("Burstable rate limit of 1 request per second per IP exceeded");
    }

    try {
        await checkRate(req.url, REQUEST_RATE_LIMIT);
    } catch (err) {
        console.log("URL Burstable limit hit");
        return res.status(429).send("Burstable rate limit of 1 request per second per URL exceeded");
    }
    next()
}

