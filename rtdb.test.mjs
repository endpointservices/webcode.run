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

test('parseNS by id (default)', async () => {
    expect(parseNS("d|5c57cd3a4fb256d4")).toEqual({
        "notebook": "d/5c57cd3a4fb256d4",
        "deploy": "default",
    })
});
