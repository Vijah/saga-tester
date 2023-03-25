import debugTaskChildren from './debugTaskChildren';

const debugTaskTree = (tasks) => tasks.map(debugTaskChildren).join('\r\n');

export default debugTaskTree;
