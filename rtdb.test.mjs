import {parseNS} from './rtdb.mjs';

test('parseNS (undefined)', async () => {
    expect(parseNS(undefined)).toEqual(undefined)
});

test('parseNS (happy)', async () => {
    expect(parseNS("tomlarkworthy|notebook;name")).toEqual({
        "namespace": "tomlarkworthy",
        "notebook": "notebook",
        "deploy": "name",
    })
});

test('parseNS (default)', async () => {
    expect(parseNS("tomlarkworthy|notebook")).toEqual({
        "namespace": "tomlarkworthy",
        "notebook": "notebook",
        "deploy": "default",
    })
});