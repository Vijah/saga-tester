import debugTaskHeader from './debugTaskHeader';
import getDependencies from './getDependencies';

const debugTaskDependencies = (pendingTasks) => (t) => {
  const taskHeader = debugTaskHeader(t);
  const dependencies = getDependencies(t, pendingTasks).map((d) => {
    if (d?.__channelDependency === true) {
      if (d?.pattern == null) { return `channel ${d.channelId}`; }
      return `channel ${d.channelId}:${d.pattern}`;
    }
    return d;
  }).join(',');

  return `${taskHeader} Dependencies: [${dependencies}]`;
};

export default debugTaskDependencies;
