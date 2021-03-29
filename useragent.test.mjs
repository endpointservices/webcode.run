import * as useragent from './useragent.mjs';

test('Parse mods', () => {
    expect(useragent.decode(
        "observablehq.com/@endpointservices/serverless-cells T"
    )).toEqual({
        "isExternalUA": false,
        "isTerminalUA": true,
        "isOrchestratorUA": false,
    })
});


test('Default mods', () => {
    expect(useragent.decode(
        "observablehq.com/@endpointservices/serverless-cells"
    )).toEqual({
        "isExternalUA": false,
        "isTerminalUA": false,
        "isOrchestratorUA": false,
    })
});


test('External UA', () => {
    expect(useragent.decode(
        "chrome"
    )).toEqual({
        "isExternalUA": true,
        "isTerminalUA": false,
        "isOrchestratorUA": false,
    })
});


test('Encode UA', () => {
    expect(useragent.decode(useragent.encode({
        terminal: true,
        orchestrator: true
    }))).toEqual({
        "isExternalUA": false,
        "isTerminalUA": true,
        "isOrchestratorUA": true,
    })
});