import END_TYPE from './END_TYPE';
import doesActionMatch from './doesActionMatch';

const doesChannelActionMatch = (channelAction, matcher, matchEnd = true) => (
  matcher?.takerId != null &&
  channelAction.takerId === matcher.takerId &&
  channelAction.channelId === matcher.channelId && (
    matcher.pattern == null ||
    (matchEnd && channelAction.event?.type === END_TYPE) ||
    doesActionMatch(channelAction.event, matcher.pattern, matchEnd)
  ));

export default doesChannelActionMatch;
