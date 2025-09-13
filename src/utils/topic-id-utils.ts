/**
 * Utility functions for safely handling topic ID properties that may use different naming conventions
 */

/**
 * Safely extracts topic ID from an inscription result object that may have either `topicId` or `topic_id`
 * @param inscription - The inscription result object
 * @returns The topic ID string or undefined if not found
 */
type TopicIdCarrier =
  | { topicId?: string; topic_id?: string }
  | Record<string, unknown>
  | null
  | undefined;

export function getTopicId(inscription: unknown): string | undefined {
  if (!inscription || typeof inscription !== 'object') return undefined;
  const obj = inscription as TopicIdCarrier;
  const direct =
    (obj as { topicId?: string }).topicId ||
    (obj as { topic_id?: string }).topic_id;
  if (typeof direct === 'string' && direct.trim()) return direct;
  const rec = obj as Record<string, unknown>;
  const t1 = rec['topicId'];
  if (typeof t1 === 'string' && t1.trim()) return t1;
  const t2 = rec['topic_id'];
  if (typeof t2 === 'string' && t2.trim()) return t2;
  return undefined;
}
