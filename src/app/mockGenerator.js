/* istanbul ignore next */
function* foo() { /* */ }
const generatorPrototype = Object.getPrototypeOf(foo);
const generatorPrototypeName = generatorPrototype.name;
const isGenerator = (x) => typeof x === 'function' && (
  /* istanbul ignore next */ (generatorPrototypeName.length > 0 && Object.getPrototypeOf(x).name === generatorPrototypeName) ||
  /* istanbul ignore next */ (generatorPrototypeName.length === 0 && Object.getPrototypeOf(x) === generatorPrototype)
);
const giveGeneratorAName = (generator, name) => {
  // eslint-disable-next-line func-names
  const result = function (...args) {
    const actualGenerator = generator(...args);
    actualGenerator.args = args;
    actualGenerator.name = generator.name;
    return actualGenerator;
  };
  Object.defineProperty(result, 'name', { value: name, writable: false });
  return result;
};

function makeMockGenerator(arg) {
  if (typeof arg === 'string') {
    // eslint-disable-next-line func-names
    const result = function (...args) {
      const actualGenerator = foo(...args);
      actualGenerator.args = args;
      actualGenerator.name = arg;
      return actualGenerator;
    };
    Object.defineProperty(result, 'name', { value: arg, writable: false });
    return result;
  }
  if (typeof arg === 'object' && !Array.isArray(arg)) {
    const wrappedObj = {};
    Object.keys(arg).forEach((k) => {
      if (!isGenerator(arg[k])) {
        wrappedObj[k] = arg[k];
      } else {
        wrappedObj[k] = giveGeneratorAName(arg[k], k);
      }
    });
    return wrappedObj;
  }
  if (!isGenerator(arg)) {
    throw new Error(`Parameter of mockGenerator must either be a generator method, a string, or an object. Received ${arg}`);
  }
  return giveGeneratorAName(arg, arg.name);
}

export default makeMockGenerator;
