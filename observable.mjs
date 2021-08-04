
export const pattern = '(/regions/:region)?observablehq.com/((d/:id)|(:owner/:notebook))(;(:name))?(/:path(*))?';
export function decode(req) {

    const notebookURL = (req.params.id)
        ? `https://observablehq.com/embed/d/${req.params.id}`
        : `https://observablehq.com/embed/${req.params.owner}/${req.params.notebook}`;

    return {
        notebookURL: notebookURL,
        path: "/" + (req.params.path || ''),
        name: req.params.name || 'default',
    };
}