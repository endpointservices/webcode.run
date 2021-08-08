const cache = {};

const computeKey = (url, name) => `${url};${name}`

export const get = async (url, name) => cache[computeKey(url, name)]

export const set =  async (url, name, config) => cache[computeKey(url, name)] = config