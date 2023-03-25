import debugTaskChildren from './debugTaskChildren';
import debugRecursivePendingTaskValue from './debugRecursivePendingTaskValue';

const debugPendingTasks = (tasks) => tasks.map((t) => {
  const header = debugTaskChildren(t);
  if (t.interruption === undefined || t.interruption.pending === undefined || t.interruption.resolved) {
    return `${header} (pending)`;
  }
  const value = debugRecursivePendingTaskValue(t.interruption.pending);
  return `${header} ${value === 'Resolved' ? '(pending)' : `Partially resolved value: \r\n${value}`}`;
}).join('\r\n');

export default debugPendingTasks;
