
// Adapter for Realtime Database
export const installRtdbRedirect = (app) => app.all("/.lp", async (req, res, next) => {
    // Parse ns param
    // https://webcode.run/.lp?start=t&ser=88616779&cb=1&v=5&ns=tomlarkworthy|notebook-name;ep
    const decoded = parseNS(req.query.ns);
    if (decoded) {
        req.url = `/observablehq.com/${decoded.namespace}/${decoded.notebook};${decoded.deploy}`;
        app.handle(req, res);
    } else {
        next()
    }
});

export const parseNS = (ns) => {
    const match = /([^|]*)\|([^;]*)(?:;(.*))?$/.exec(ns)
    if (!match) return undefined

    return {
        namespace: match[1],
        notebook: match[2],
        deploy: match[3] || "default"
    }
}
