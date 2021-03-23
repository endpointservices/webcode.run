export const base = 'observablehq.com/@endpointservices/serverless-cells'
const pattern = /^observablehq.com\/@endpointservices\/serverless-cells(?: (?<mods>[^ ]*))?(?: (?<namespace>[^ ]*))?/
export function decode(useragent) {
    const match = useragent?.match(pattern)
    const mods = match?.groups['mods']
    return ({
        isExternalUA: !match,
        isOrchestratorUA: (mods && mods.includes('O')) || false,
        isTerminalUA: (mods && mods.includes('T')) || false
    });
}

export function encode({
    terminal = false,
    orchestrator = false,
} = {}) {
    return `observablehq.com/@endpointservices/serverless-cells ${terminal ? 'T':''}${orchestrator ? 'O':''}`
}