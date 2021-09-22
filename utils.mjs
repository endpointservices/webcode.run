
// Thanks you trincot!
// https://stackoverflow.com/a/44072329/862295
// A wonderful peice of code contralises all promises in a nexted object to the root.
export function promiseRecursive(obj) {
    const getPromises = obj =>
      Object.keys(obj).reduce(
        (acc, key) =>
          Object(obj[key]) !== obj[key]
            ? acc
            : acc.concat(
                typeof obj[key].then === "function"
                  ? [[obj, key]]
                  : getPromises(obj[key])
              ),
        []
      );
    const all = getPromises(obj);
    return Promise.all(all.map(([obj, key]) => obj[key])).then(
      responses => (
        all.forEach(([obj, key], i) => (obj[key] = responses[i])), obj
      )
    );
  }