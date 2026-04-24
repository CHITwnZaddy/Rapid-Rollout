/**
 * Shared helper for the proposal-delete typed-confirmation gate.
 *
 * The user must type the phrase returned here verbatim to trigger deletion.
 * Both the client (to render the expected phrase in the dialog) and the
 * server action (to validate the submitted text) import from here so the
 * two sides can never drift.
 */
export function buildDeleteConfirmationPhrase(proposalName: string): string {
  return `DELETE ${proposalName}`;
}
