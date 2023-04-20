import debugPendingTasks from './debugPendingTasks';
import debugTask from './debugTask';

const debugBubbledTasks = (finishedTasks, pendingTasks) => {
  const finishedTasksLog = finishedTasks.map(debugTask).join('\r\n');
  const pendingTaskLog = debugPendingTasks(pendingTasks);
  const prefix = finishedTasks.some((t) => t['@@redux-saga/TASK'] !== true) ? 'ACTIONS' : 'TASKS';
  return `-- ${prefix} TO BUBBLE:\r\n${finishedTasksLog}\r\n-- TREE:\r\n${pendingTaskLog}\r\n`;
};

export default debugBubbledTasks;
