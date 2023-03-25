import debugPendingTasks from './debugPendingTasks';
import debugTask from './debugTask';

const debugBubbledTasks = (finishedTasks, pendingTasks) => {
  const finishedTasksLog = finishedTasks.map(debugTask).join('\r\n');
  const pendingTaskLog = debugPendingTasks(pendingTasks);
  return `-- TASKS TO BUBBLE:\r\n${finishedTasksLog}\r\n-- TREE:\r\n${pendingTaskLog}\r\n`;
};

export default debugBubbledTasks;
