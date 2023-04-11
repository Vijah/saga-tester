import debugTaskHeader from './debugTaskHeader';
import getDependencies from './getDependencies';

const debugTaskDependencies = (pendingTasks) => (t) => `${debugTaskHeader(t)} Dependencies: [${getDependencies(t, pendingTasks).join(',')}]`;

export default debugTaskDependencies;
