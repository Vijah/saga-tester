import isEqual from 'lodash.isequal';

import PLACEHOLDER_ARGS from './PLACEHOLDER_ARGS';

function paramsMatch(params, args) {
  if (params === undefined) {
    return true;
  }
  return (
    params.every((arg, i) => {
      if (arg === PLACEHOLDER_ARGS.ANY) {
        return true;
      }
      if (arg === PLACEHOLDER_ARGS.TASK) {
        return args[1]['@@redux-saga/TASK'] !== undefined;
      }
      if (arg?.kind === '@@SagaTester__type__') {
        // eslint-disable-next-line valid-typeof
        return arg.type === typeof args[i];
      }
      if (arg?.kind === '@@SagaTester__fn__') {
        return arg.method(args[i]);
      }
      return isEqual(arg, args[i]);
    })
  );
}

export default paramsMatch;
