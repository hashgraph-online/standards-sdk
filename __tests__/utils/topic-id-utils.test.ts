import { getTopicId } from '../../src/utils/topic-id-utils';

describe('getTopicId', () => {
  test('should return topicId when present', () => {
    const inscription = { topicId: '0.0.123' };
    expect(getTopicId(inscription)).toBe('0.0.123');
  });

  test('should return topic_id when present', () => {
    const inscription = { topic_id: '0.0.456' };
    expect(getTopicId(inscription)).toBe('0.0.456');
  });

  test('should prefer topicId over topic_id when both are present', () => {
    const inscription = { topicId: '0.0.123', topic_id: '0.0.456' };
    expect(getTopicId(inscription)).toBe('0.0.123');
  });

  test('should handle string access via bracket notation', () => {
    const inscription = { topicId: '0.0.789' };
    expect(getTopicId(inscription)).toBe('0.0.789');
  });

  test('should return undefined for null input', () => {
    expect(getTopicId(null)).toBeUndefined();
  });

  test('should return undefined for undefined input', () => {
    expect(getTopicId(undefined)).toBeUndefined();
  });

  test('should return undefined for non-object input', () => {
    expect(getTopicId('string')).toBeUndefined();
    expect(getTopicId(123)).toBeUndefined();
    expect(getTopicId(true)).toBeUndefined();
  });

  test('should return undefined when topicId is empty string', () => {
    const inscription = { topicId: '' };
    expect(getTopicId(inscription)).toBeUndefined();
  });

  test('should return undefined when topicId is whitespace only', () => {
    const inscription = { topicId: '   ' };
    expect(getTopicId(inscription)).toBeUndefined();
  });

  test('should return undefined when topic_id is empty string', () => {
    const inscription = { topic_id: '' };
    expect(getTopicId(inscription)).toBeUndefined();
  });

  test('should return undefined when topic_id is whitespace only', () => {
    const inscription = { topic_id: '   ' };
    expect(getTopicId(inscription)).toBeUndefined();
  });

  test('should return undefined when neither topicId nor topic_id exist', () => {
    const inscription = { otherField: 'value' };
    expect(getTopicId(inscription)).toBeUndefined();
  });

  test('should handle non-string values gracefully', () => {
    const inscription = { topicId: 123 };
    expect(getTopicId(inscription)).toBeUndefined();
  });

  test('should handle empty object', () => {
    expect(getTopicId({})).toBeUndefined();
  });

  test('should use bracket notation when direct property access fails', () => {
    const target = { topicId: '0.0.123' };
    const inscription = new Proxy(target, {
      get(target, prop) {
        if (prop === 'topicId' || prop === 'topic_id') {
          return undefined;
        }
        return target[prop as keyof typeof target];
      },
    });
    expect(getTopicId(inscription)).toBe('0.0.123');
  });

  test('should use bracket notation for topic_id when direct property access fails', () => {
    const target = { topic_id: '0.0.456' };
    const inscription = new Proxy(target, {
      get(target, prop) {
        if (prop === 'topicId' || prop === 'topic_id') {
          return undefined;
        }
        return target[prop as keyof typeof target];
      },
    });
    expect(getTopicId(inscription)).toBe('0.0.456');
  });

  test('should handle prototype-less objects', () => {
    const inscription = Object.create(null);
    inscription['otherField'] = 'value';
    expect(getTopicId(inscription)).toBeUndefined();
  });
});
