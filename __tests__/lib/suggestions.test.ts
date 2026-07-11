import { validateSuggestionInput, SuggestionInput } from "@/lib/suggestions";

describe("validateSuggestionInput", () => {
  const byPersonId = "giver-person-id";
  const forPersonId = "receiver-person-id";

  it("should pass with valid input", () => {
    const input: SuggestionInput = {
      forPersonId,
      name: "Book",
      note: "Fiction novel",
    };

    const result = validateSuggestionInput(input, byPersonId);
    expect(result.valid).toBe(true);
  });

  it("should pass with valid input without optional note", () => {
    const input: SuggestionInput = {
      forPersonId,
      name: "Book",
    };

    const result = validateSuggestionInput(input, byPersonId);
    expect(result.valid).toBe(true);
  });

  it("should fail when name is empty", () => {
    const input: SuggestionInput = {
      forPersonId,
      name: "",
    };

    const result = validateSuggestionInput(input, byPersonId);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBeDefined();
    }
  });

  it("should fail when name is whitespace only", () => {
    const input: SuggestionInput = {
      forPersonId,
      name: "   ",
    };

    const result = validateSuggestionInput(input, byPersonId);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBeDefined();
    }
  });

  it("should fail when forPersonId is missing", () => {
    const input: SuggestionInput = {
      forPersonId: "",
      name: "Book",
    };

    const result = validateSuggestionInput(input, byPersonId);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBeDefined();
    }
  });

  it("should fail with exact message when suggesting for self", () => {
    const input: SuggestionInput = {
      forPersonId: byPersonId,
      name: "Book",
    };

    const result = validateSuggestionInput(input, byPersonId);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe("You can't add a suggestion for yourself.");
    }
  });
});
