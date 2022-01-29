
export const pattern = '(/regions/:region)?/observablehq.com((/d/:id)|(/@:owner/:notebook))(@(:version))?((;|%3B)(:name))?(/:path(*))?';
export function decode(req) {
    const notebook = req.params.id ? `d/${req.params.id}` : req.params.notebook
    let userURL = "/" + (req.params.path || '');
    const name = req.params.name || 'default';

    const endpointURL = 
        `/observablehq.com` + 
        `${req.params.id ? `/d/${req.params.id}`:`/@${req.params.owner}/${req.params.notebook}`}` + 
        `${req.params.version ? `@${req.params.version}`: ''}` + 
        `${req.params.name ? `;${req.params.name}` : ``}`;

    return {
        notebook,
        path: userURL,
        name: name,
        endpointURL,
        ...(req.params.owner && {namespace: req.params.owner}),
        ...(req.params.version && {version: req.params.version})
    };
}

export function parseEndpointURL(endpointURL) {
    const match = /\/(?<codehost>[^/]*)\/(?:d\/(?<id>[a-z0-9]+)|@(?<namespace>[a-z0-9]+)\/(?<notebook>[a-z0-9-]+))(?:@(?<version>[0-9]+))?(?:;(?<name>[^/]+))?/.exec(endpointURL);
    if (!match) return undefined;
    return {
        codehost: match.groups.codehost,
        id: match.groups.id,
        namespace: match.groups.namespace,
        notebook: match.groups.notebook,
        ...(match.groups.version && {version: Number.parseInt(match.groups.version)}),
        name: match.groups.name || 'default',
    };
}

export function notebookURL(req, {api_key = undefined} = {}) {
    const versionSuffix = req.params.version ? `@${req.params.version}` : '';
    const local = req.hostname === 'localhost';
    return api_key ? 
        (req.params.id)
        ? `https://webcode.run/observablehq.com/@endpointservices/embed/d/${req.params.id}${versionSuffix}?api_key=${api_key}`
        : `https://webcode.run/observablehq.com/@endpointservices/embed/@${req.params.owner}/${req.params.notebook}${versionSuffix}?api_key=${api_key}`:
        (req.params.id)
        ? `https://observablehq.com/embed/${req.params.id}${versionSuffix}`
        : `https://observablehq.com/embed/@${req.params.owner}/${req.params.notebook}${versionSuffix}`;
}

// Could the webbrowser page be running the supplied endpoint URL?
export function canHost(embedURL, endpointURL) {
    return endpointURL.replace('/observablehq.com/', '').includes(embedURL.replace('https://observablehq.com/embed/', '')) 
}

export function createCellRequest(req) {
    const hasBody = Object.keys(req.body).length !== 0;
    return {
        id: req.id,
        baseUrl: req.requestConfig.endpointURL,
        url: req.requestConfig.path,
        method: req.method,
        ...hasBody && {body: req.body.toString()},
        ...(req.cookies && {cookies: req.cookies}),
        query: req.query || {},
        headers: req.headers || {},
        ip: req.ip,
    };
}