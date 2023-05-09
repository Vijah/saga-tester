import __INTERRUPT__ from './__INTERRUPT__';
import INTERRUPTION_TYPES from './INTERRUPTION_TYPES';

import debugShouldApply from './debugShouldApply';

function makeInterruption(currentTask, results, type, dependencies, debugConfig) {
  if (![INTERRUPTION_TYPES.WAITING_FOR_CHILDREN].includes(type)) {
    // eslint-disable-next-line no-param-reassign
    currentTask.interruption = { pending: results, kind: type, dependencies };
  }
  if (debugShouldApply(currentTask, debugConfig)) {
    // eslint-disable-next-line no-console
    console.log(`INTERRUPT\ntask: ${currentTask.id}-${currentTask.name}, dependencies: ${dependencies}, interruptionType: ${type}\n`, 'pendingResults:', results);
  }
  return { value: __INTERRUPT__, origin: currentTask.id, dependencies, kind: type };
}

export default makeInterruption;
