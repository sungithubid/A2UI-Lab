# 0011: Persisted plan decisions with direct choice confirmation

Status: accepted.

## Decision

Add a deterministic plan-decision scenario and additive LabChoice catalog component.
Agent emits semantic decision.required with candidate IDs, titles, descriptions and
recommendation flags. Options are data, not executable code. Frontend renders each
candidate as a confirmation button, plus a custom-input form directly inside option 3. Candidate
click confirms immediately; custom input requires an explicit submission inside the same option.
The input is visible immediately; scenario copy and interaction labels are English.

Use the existing persisted waiting_input lifecycle. Workers exit after asking;
server actions load the recorded candidate definitions and validate the chosen ID
or bounded custom text. Persist action receipt, resolved decision, locked original
card, result surface and final status atomically. Identical retries return the
original result; conflicting decisions fail. Replay never executes the action.

## Consequences

Pending choices survive restart without a migration or new runtime coordinator.
LabChoice snapshots retain options, selected ID and submitted custom text so reload
and replay reproduce the decision. Draft text remains client-local. Confirmed custom
input is stored locally and becomes subsequent model context, like user instructions.
The next turn is blocked until the choice resolves, and older-turn actions stay
read-only. The current Mock records a plan; it does not implement or execute it.
