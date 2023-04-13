/* istanbul ignore next */
function* foo() { /* */ }
const generatorPrototype = Object.getPrototypeOf(foo);
const generatorPrototypeName = generatorPrototype.name;
const isGenerator = (x) => typeof x === 'function' && (
  /* istanbul ignore next */ (generatorPrototypeName.length > 0 && Object.getPrototypeOf(x).name === generatorPrototypeName) ||
  /* istanbul ignore next */ (generatorPrototypeName.length === 0 && Object.getPrototypeOf(x) === generatorPrototype)
);

export default isGenerator;
