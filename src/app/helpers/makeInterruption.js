import INTERRUPTION_TYPES from './INTERRUPTION_TYPES';
import __INTERRUPT__ from './__INTERRUPT__';

import debugShouldApply from './debugShouldApply';

function makeInterruption(currentTask, results, type, dependencies, debugConfig) {
  // eslint-disable-next-line no-param-reassign
  currentTask.interruption = { pending: results, kind: type, dependencies: type === INTERRUPTION_TYPES.GENERATOR && results === undefined ? dependencies : dependencies };
  if (debugShouldApply(currentTask, debugConfig)) {
    // eslint-disable-next-line no-console
    console.log(`INTERRUPT\ntask: ${currentTask.id}-${currentTask.name}, taskChildren: ${currentTask.children.map((t) => `${t.id}-${t.name}`).join(',')}, dependencies: ${dependencies}, interruptionType: ${type}\n`, 'pendingResults:', results);
  }
  return { value: __INTERRUPT__, origin: currentTask.id, dependencies, kind: type };
}

export default makeInterruption;
