/**
 * Prompt tag resolution utilities for the Prompt Randomizer feature.
 *
 * Tags are in format <tag_name> and are replaced with random selections
 * from corresponding prompt lists.
 */

/**
 * Extract all tag names from a prompt string.
 * Tags are in format <tag_name> where tag_name starts with a letter
 * and contains only letters, numbers, underscores, and dashes.
 *
 * @param {string} prompt - The prompt text potentially containing tags
 * @returns {string[]} - Array of unique tag names (lowercase, without angle brackets)
 */
export function extractTags(prompt) {
  if (!prompt) return [];

  // Match <tag_name> where tag_name is alphanumeric with underscores/dashes, starting with letter
  const tagPattern = /<([a-zA-Z][a-zA-Z0-9_-]*)>/g;
  const tags = new Set();
  let match;

  while ((match = tagPattern.exec(prompt)) !== null) {
    tags.add(match[1].toLowerCase());
  }

  return Array.from(tags);
}

/**
 * Validate that all tags in a prompt have corresponding lists.
 *
 * @param {string} prompt - The prompt text
 * @param {string[]} availableListNames - Array of valid list names (lowercase)
 * @returns {{ valid: boolean, invalidTags: string[] }}
 */
export function validateTags(prompt, availableListNames) {
  const tags = extractTags(prompt);
  const availableSet = new Set(availableListNames.map(n => n.toLowerCase()));
  const invalidTags = tags.filter(tag => !availableSet.has(tag));

  return {
    valid: invalidTags.length === 0,
    invalidTags
  };
}

/**
 * Resolve all tags in a prompt with random selections.
 * Each occurrence of a tag gets a different random selection.
 *
 * @param {string} prompt - The prompt text with tags
 * @param {Object} lists - Map of list name (lowercase) to items array
 * @returns {string} - The prompt with all tags replaced by random selections
 */
export function resolvePrompt(prompt, lists) {
  if (!prompt) return prompt;

  // Match <tag_name> pattern
  const tagPattern = /<([a-zA-Z][a-zA-Z0-9_-]*)>/g;

  return prompt.replace(tagPattern, (match, tagName) => {
    const lowerTagName = tagName.toLowerCase();
    const items = lists[lowerTagName];

    if (!items || items.length === 0) {
      // If no list found, leave the tag as-is
      return match;
    }

    // Select a random item
    const randomIndex = Math.floor(Math.random() * items.length);
    return items[randomIndex];
  });
}
