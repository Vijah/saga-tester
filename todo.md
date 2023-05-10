--- 2.3.1, answer questions, test edge-cases

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
- If a put or putResolve with async logic (redux-thunk) throws, does the parent task throw and/or is cancelled as well?
- Does redux-saga support using a put or putResolve effect is inside a race or an all? 
- Don't forget TODOs in the code.

--- 2.3.0

TODO:
- implement actionChannel, as well as effect apis that receive channels
- implement flush

--- 2.2.0

TODO:
- implement setContext and getContext (children forks cannot modify the context of their parents unless by reference)

--- 2.1.0

TODO:
- implement cps
- allow defining the same matcher (e.g. same method same params) multiple times, to define multiple outputs or side effects for the same call (useful for sagas with infinite loops).
- add reducers, to run every time an action is dispatched, modifying the selectorConfig
- implement reducers so that put actions modify the selectorConfig.
- implement side-effects on: calls and actions, (sideEffects: [], and multipleSideEffects: [][], on: 'start', 'init', 'end').
