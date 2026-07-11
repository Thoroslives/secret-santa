export interface SuggestionInput {
  forPersonId: string;
  name: string;
  note?: string;
  named?: boolean;
}

export function validateSuggestionInput(
  input: SuggestionInput,
  byPersonId: string
): { valid: true } | { valid: false; error: string } {
  // Check if forPersonId is missing or empty
  if (!input.forPersonId || input.forPersonId.trim().length === 0) {
    return { valid: false, error: "forPersonId is required" };
  }

  // Check if name is missing, empty, or whitespace only
  if (!input.name || input.name.trim().length === 0) {
    return { valid: false, error: "Name is required" };
  }

  // Check if suggesting for self
  if (input.forPersonId === byPersonId) {
    return { valid: false, error: "You can't add a suggestion for yourself." };
  }

  return { valid: true };
}
