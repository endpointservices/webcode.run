
export const pattern = '(/notebooks/:namespace/:notebook)(/deployments/:deploy)?(/secrets/:secretids)?(/cells/:cellids)?(/:user(*))?';
export function decode(req) {
    let query = ''
    let secretKeys = req.params.secretids ? (req.params.secretids).split(",").map(decodeURIComponent): [];
    let userURL = "/" + (req.params.user || '');
    if (req.params.cellids) {
        query = '?' + req.params.cellids.split(",").map(name => `cell=${name}`).join("&")
    }
    
    const notebookURL = (req.params.namespace == 'd' || req.params.namespace == 'thumbnail' 
        ? `https://observablehq.com/embed/${req.params.notebook}${query}`
        : `https://observablehq.com/embed/${req.params.namespace}/${req.params.notebook}${query}`);

    return {
        shard: `${req.params.namespace}/${req.params.notebook}`,
        notebookURL: notebookURL,
        userURL: userURL,
        notebook: req.params.notebook,
        secretKeys: secretKeys,
        deploy: req.params.deploy || 'default',
    };

}