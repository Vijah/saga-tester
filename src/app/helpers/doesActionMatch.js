const doesActionMatch = (action, pattern) => {
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
