--- 2.3.1, answer questions, test edge-cases

### Spawn, Fork, cancel and join edge cases 
- Given a spawned task that is joined, does the cancellation of the joiner lead to the cancellation of the spawned task, and vice versa?
- Given a spawned task that is joined, if the task throws, does it lead to the joiner receiving the error and needing to handle it?
---> (see 'should not bubble the error if it comes from a spawn effect')
--- Given a forked/spawned task that is joined, if the task throws and the error is subsequently handled, is the "result" of the task the error, or undefined?
---> (see 'should bubble up the error if an action inside an all effect or inside a fork is thrown' and the subsequent spawn test. Modify handleGeneratorError in accordance.)
- Does redux-saga support joining a task inside the "finally" segment of a task that has been cancelled?
---> (see the two previous referred unit tests)
- Do unjoined forked tasks cause the parent to throw?
--- If an unjoined forked task throws after the parent has finished (and therefore is waiting for the child to finish), does the parent fail (since it must be outside of any try-catch clause)?
--- If an unjoined fork throws and this leads to the parent throwing, do other children tasks cancel as a result, EVEN IF the parent catches the error, or ONLY IF the parent terminates as a result of throwing?

### putResolve edge cases
- If a put with async logic (redux-thunk) throws, does the executing generator throw and/or is cancelled as well?
- Does redux-saga support using a put or putResolve effect is inside a race or an all? 
---> (see 'should handle takeMaybe receiving END in a channel, or receiving a closed channel')

### high-level take (takeEvery, takeLatest, takeLeading, debounce, throttle) edge-cases
- Do the effects ignore END verbs, or are they cancelled by END, or are the generators run with END actions? The API Doc suggests it would cancel it (the user-implementation example uses a take effect, which would result in the cancellation of the task), but that could lead to counter-intuitive behavior (i.e. all sagas suddenly stopping). For instance, takeLeading would not consume an action frivolously, but debounce would. The real code is a fake generator function which does not explicitly look for cancellation; actual behavior is unclear.
- If a channel is used by multiple effects, one action should alternate triggering the first and second effects, leading to counter-intuitive behavior (e.g. debounce, throttle). Is this correct?
- Why do these effects not support multicastChannel? It seems like the most useful channel for these effects!

### take edge cases
- Doc is not clear whether takeMaybe receiving a closed channel should receive END, or rather receives undefined.

### Api Doc nitpicks
- Doc says the default channel() buffer is a buffer that remembers 10 elements, while the default buffer for eventChannel is no buffer. The default buffer is not specified in the API doc, but is specified in the "Advanced Concepts > Channels" section of the docs.
- Is there a reason why the "shape" of the api call([context, fnName], ...args) is not replicated for fork, spawn and cps in the API reference?
- Is there a reason why multicastChannel is not present in the API reference? The api take(channel, pattern) is not even present!
- Is there a reason why multicastChannel does not support flush and/or buffers?
- Is there a reason why putResolve does not have a documented api receiving a channel? Can put work with channels and redux-thunk style async actions?
- Is there a reason why the Api reference says a `fork` is used for each triggering of `takeLatest`, whereas a `spawn` is used for `takeEvery`, `takeLeading`, `throttle` and `debounce`? Is it an error, or are they different? `takeEvery` does not appear to use `spawn`, but `fork` if one looks at the code.

- Don't forget TODOs in the code.
