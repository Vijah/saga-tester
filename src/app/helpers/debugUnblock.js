import debugTaskTree from './debugTaskTree';
import debugTaskValues from './debugTaskValues';

const debugUnblock = (tasksToRun, pendingTasks) => {
  const runningLog = debugTaskValues(tasksToRun);
  const dependencyTree = debugTaskTree(pendingTasks);
  return `-- UNBLOCKING:\r\n${runningLog}\r\n-- TREE:\r\n${dependencyTree}\r\n`;
};

export default debugUnblock;
