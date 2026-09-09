/**
 * Sentence-case check shared by every field the sentence-case-names rule
 * covers (spec name, input/output name, category, STRING_SELECT option keys).
 *
 * Semantics (see naming-and-style.md "Casing" section for the house-style
 * rationale):
 *   - The first character of the whole string must be an uppercase letter.
 *   - Every word (whitespace-separated) other than the first must be entirely
 *     lowercase.
 *   - The first word itself must also be lowercase after its first letter
 *     (so "Api", not "API"; "Task", not "TASK").
 *   - A word that is purely digits or merely CONTAINS a digit anywhere
 *     (e.g. "Sha256", "2xx", "non-2xx") is exempt from the lowercase check —
 *     mixed-case/digit tokens like hash names or status-code ranges are
 *     legitimate and shouldn't be forced into a shape that reads worse.
 *   - The exact token "helmut.cloud" is always exempt.
 *   - Anything in the rule's `allow` option is compared against the FULL
 *     string (not word-by-word) and passes outright if matched.
 */
export function isSentenceCase(value, allowList = []) {
    if (typeof value !== "string" || value.trim().length === 0) {
        return false;
    }
    if (allowList.includes(value)) {
        return true;
    }
    const words = value.trim().split(/\s+/);
    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        if (word === "helmut.cloud") continue;
        if (/\d/.test(word)) continue; // purely digits, or merely contains one
        if (i === 0) {
            if (!/^[A-Z]/.test(word)) return false;
            if (/[A-Z]/.test(word.slice(1))) return false;
        } else if (/[A-Z]/.test(word)) {
            return false;
        }
    }
    return true;
}
