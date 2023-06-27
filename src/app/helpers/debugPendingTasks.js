import debugTaskDependencies from './debugTaskDependencies';
import debugRecursivePendingTaskValue from './debugRecursivePendingTaskValue';

const debugPendingTasks = (tasks) => tasks.map((t) => {
  const header = debugTaskDependencies(tasks)(t);
  if (t.interruption === undefined || t.interruption.pending === undefined || t.interruption.resolved) {
    return `${header} (pending)`;
  }
  const value = debugRecursivePendingTaskValue(t.interruption.pending);
  const { channelId } = t.interruption;
  return `${header} ${value === 'Resolved' ? '(pending)' : `Partially resolved value${channelId != null ? ` (channel: ${channelId})` : ''}: \r\n${value}`}`;
}).join('\r\n');

export default debugPendingTasks;
