
export const pattern = '(/regions/:region)?/observablehq.com((/d/:id)|(/@:owner/:notebook))(@(:version))?(;(:name))?(/:path(*))?';
export function decode(req) {

    const versionSuffix = req.params.version ? `@${req.params.version}` : ''
    const notebookURL = (req.params.id)
        ? `https://observablehq.com/embed/${req.params.id}${versionSuffix}`
        : `https://observablehq.com/embed/@${req.params.owner}/${req.params.notebook}${versionSuffix}`;

    const notebook = req.params.id ? `d/${req.params.id}` : req.params.notebook
    let userURL = "/" + (req.params.path || '');
    const name = req.params.name || 'default';

    const baseURL = 
        `/observablehq.com` + 
        `${req.params.id ? `/d/${req.params.id}`:`/@${req.params.owner}/${req.params.notebook}`}` + 
        `${req.params.version ? `@${req.params.version}`: ''}` + 
        `${req.params.name ? `;${req.params.name}` : ``}`;

    return {
        notebookURL: notebookURL,
        notebook,
        path: userURL,
        name: name,
        baseURL,
        ...(req.params.owner && {namespace: req.params.owner}),
        ...(req.params.version && {version: req.params.version})
    };
}

export function createCellRequest(req) {
    const hasBody = Object.keys(req.body).length !== 0;
    return {
        baseUrl: req.requestConfig.baseURL,
        url: req.requestConfig.path,
        method: req.method,
        ...hasBody && {body: req.body.toString()},
        ...(req.cookies && {cookies: req.cookies}),
        query: req.query,
        headers: req.headers,
        ip: req.ip,
    };
}