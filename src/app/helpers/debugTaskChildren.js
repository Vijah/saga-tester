import debugTaskHeader from './debugTaskHeader';

const debugTaskChildren = (t) => `${debugTaskHeader(t)} Children: [${t.children.map((c) => c.id).join(',')}]`;

export default debugTaskChildren;
