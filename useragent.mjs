export const base = 'observablehq.com/@endpointservices/serverless-cells'
const pattern = /^observablehq.com\/@endpointservices\/serverless-cells(?: (?<mods>[^ ]*))?(?: (?<namespace>[^ ]*))?/
export function decode(useragent) {
    const match = useragent?.match(pattern)
    const mods = match?.groups['mods']
    return ({
        isExternalUA: !match,
        isTerminalUA: (mods && mods.includes('T')) || false
    });
}

export function encode({
    terminal = false
} = {}) {
    return `observablehq.com/@endpointservices/serverless-cells ${terminal ? 'T':''}`
}