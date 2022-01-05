import * as useragent from './useragent.mjs';
export const loopbreak = (req, res, next) => {
    if (req.config || req.cachedConfig) {
        const config  = req.config || req.cachedConfig;
        const {
            isExternalUA,
            isTerminalUA,
            isOrchestratorUA,
        } = useragent.decode(req.get('user-agent'));
        
        const isTerminal = config.modifiers.includes("terminal");
        const isOrchestrator = config.modifiers.includes("orchestrator");
        const isExternal = config.modifiers.includes("external") || (!isTerminal && !isOrchestrator);
        if (isOrchestratorUA && !isOrchestrator) {
            // Orchestrator cells can call other cells
        } else if (isOrchestratorUA && isOrchestrator) {
            return res.status(403).send("Orchestrator cells cannot call other orchestrator cells");
        } else if (!isExternalUA && isExternal) {
            return res.status(403).send("External Serverless Cells cannot be called by other Serverless Cells");
        } else if (isTerminalUA) {
            return res.status(403).send("Terminal Serverless Cells cannot call other Serverless Cells");
        } else if (isTerminal) {
            // Terminal cells can be called by anyone, but then they cannot propogate
        } else if (isExternalUA && (isExternal || isOrchestrator)) {
            // External Serverless cells can be called by external UAs
        } else if (req.url.startsWith('/observablehq.com/@endpointservices/embed/')) {
            // All requests to embed are allowed
        } else {
            const message = `Unexpected combination ${req.get('user-agent')} ${isTerminal} ${isOrchestrator} ${isExternal} ${JSON.stringify(req.cachedConfig)}`
            console.log(message);
            return res.status(403).send(message);
        }
    }
    next()
}
    