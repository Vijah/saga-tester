/**
 * Test method which simulates an action and triggers the related saga method.
 * @param {*} saga   The saga to test
 * @param {*} action The action, whose 'type' attribute should match one of the saga effects.
 */
const triggerSagaWithAction = (saga, action) => {
  let takeLatestResult = saga.next();
  while (!takeLatestResult.done) {
    const types = [].concat(takeLatestResult.value.payload.args[0]);
    if (types.some((type) => type === '*' || type === action.type)) {
      return takeLatestResult.value.payload.args[1](action);
    }
    takeLatestResult = saga.next();
  }
  throw new Error(`Failed to trigger saga action with ${JSON.stringify(action)}`);
};

export default triggerSagaWithAction;
