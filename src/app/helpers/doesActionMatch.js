import END_TYPE from './END_TYPE';

const doesActionMatch = (action, pattern, matchEnd = true) => {
  if (matchEnd && action?.type === END_TYPE) {
    return true;
  }
  if (pattern === '*') {
    return action != null;
  }
  if (typeof pattern === 'function') {
    return pattern(action);
  }
  const listOfMatchers = Array.isArray(pattern) ? pattern : [pattern];
  const type = action.type.toString();
  return listOfMatchers.some((matcher) => (typeof matcher === 'string' ? matcher === type : matcher(action)));
};

export default doesActionMatch;
