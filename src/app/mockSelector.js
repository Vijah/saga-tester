function mockSelector(name) {
  const val = {};
  const formattedName = `mock-${name}`;
  val[formattedName] = formattedName;
  const fakeSelector = () => val;
  const fakeSelectorMaker = () => fakeSelector;
  const mock = jest.fn(fakeSelectorMaker);
  mock.resultFunc = () => formattedName;
  mock.recomputations = () => 0;
  mock.resetRecomputations = () => 0;
  return mock;
}

export default mockSelector;
