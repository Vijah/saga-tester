import debugTask from './debugTask';

const debugTaskValues = (tasks) => tasks.map(debugTask).join('\r\n');

export default debugTaskValues;
