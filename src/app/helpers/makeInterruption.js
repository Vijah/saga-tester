import INTERRUPTION_TYPES from './INTERRUPTION_TYPES';
import __INTERRUPT__ from './__INTERRUPT__';

function makeInterruption(currentTask, results, type, dependencies) {
  // eslint-disable-next-line no-param-reassign
  currentTask.interruption = { pending: results, kind: type, dependencies: type === INTERRUPTION_TYPES.GENERATOR && results === undefined ? dependencies : dependencies };
  return { value: __INTERRUPT__, origin: currentTask.id, dependencies, kind: type };
}

export default makeInterruption;
