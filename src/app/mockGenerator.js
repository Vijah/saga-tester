/* istanbul ignore next */
function* foo() { /* */ }
const GeneratorPrototypeName = Object.getPrototypeOf(foo).name;
const isGenerator = (x) => typeof x === 'function' && Object.getPrototypeOf(x).name === GeneratorPrototypeName;
const giveGeneratorAName = (generator) => (...args) => {
  const actualGenerator = generator(...args);
  actualGenerator.args = args;
  actualGenerator.name = generator.name;
  return actualGenerator;
};

function makeMockGenerator(arg) {
  if (typeof arg === 'string') {
    return (...args) => {
      const actualGenerator = foo(...args);
      actualGenerator.args = args;
      actualGenerator.name = arg;
      return actualGenerator;
    };
  }
  if (typeof arg === 'object' && !Array.isArray(arg)) {
    const wrappedObj = {};
    Object.keys(arg).forEach((k) => {
      if (!isGenerator(arg[k])) {
        wrappedObj[k] = arg[k];
      } else {
        wrappedObj[k] = giveGeneratorAName(arg[k]);
      }
    });
    return wrappedObj;
  }
  if (!isGenerator(arg)) {
    throw new Error(`Parameter of mockGenerator must either be a generator method, a string, or an object. Received ${arg}`);
  }
  return giveGeneratorAName(arg);
}

export default makeMockGenerator;
