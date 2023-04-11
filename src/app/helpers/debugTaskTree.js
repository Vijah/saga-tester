import debugTaskDependencies from './debugTaskDependencies';

const debugTaskTree = (tasks) => tasks.map(debugTaskDependencies(tasks)).join('\r\n');

export default debugTaskTree;
