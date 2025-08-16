/**
 * Utility functions for safely handling topic ID properties that may use different naming conventions
 */

/**
 * Safely extracts topic ID from an inscription result object that may have either `topicId` or `topic_id`
 * @param inscription - The inscription result object
 * @returns The topic ID string or undefined if not found
 */
export function getTopicId(inscription: any): string | undefined {
  if (!inscription) return undefined;

  return inscription.topicId ?? inscription.topic_id;
}
