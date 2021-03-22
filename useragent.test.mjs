import * as useragent from './useragent.mjs';

test('Parse mods', () => {
    expect(useragent.decode(
        "observablehq.com/@endpointservices/serverless-cells T"
    )).toEqual({
        "isExternalUA": false,
        "isTerminalUA": true,
    })
});


test('Default mods', () => {
    expect(useragent.decode(
        "observablehq.com/@endpointservices/serverless-cells"
    )).toEqual({
        "isExternalUA": false,
        "isTerminalUA": false,
    })
});


test('External UA', () => {
    expect(useragent.decode(
        "chrome"
    )).toEqual({
        "isExternalUA": true,
        "isTerminalUA": false,
    })
});


test('Encode UA', () => {
    expect(useragent.decode(useragent.encode({
        terminal: true
    }))).toEqual({
        "isExternalUA": false,
        "isTerminalUA": true,
    })
});