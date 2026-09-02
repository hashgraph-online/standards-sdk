import { describe, expect, test } from '@jest/globals';

import {
  isValidAdapterId,
  isValidComponentKey,
  isValidSignalId,
} from '../../src/hcs-25/identifiers';

describe('HCS-25 identifier namespacing', () => {
  describe('adapter identifiers', () => {
    test('accepts hyphen-separated lowercase segments', () => {
      expect(isValidAdapterId('availability')).toBe(true);
      expect(isValidAdapterId('erc8004-feedback')).toBe(true);
      expect(isValidAdapterId('huggingface-model-index')).toBe(true);
      expect(isValidAdapterId('a1-b2-c3')).toBe(true);
    });

    test('rejects empty, uppercase, whitespace, and malformed ids', () => {
      expect(isValidAdapterId('')).toBe(false);
      expect(isValidAdapterId('Availability')).toBe(false);
      expect(isValidAdapterId('availability uptime')).toBe(false);
      expect(isValidAdapterId('-availability')).toBe(false);
      expect(isValidAdapterId('availability-')).toBe(false);
      expect(isValidAdapterId('1availability')).toBe(false);
      expect(isValidAdapterId('availability--uptime')).toBe(false);
      expect(isValidAdapterId('availability.uptime')).toBe(false);
      expect(isValidAdapterId('availability_uptime')).toBe(false);
    });
  });

  describe('signal identifiers', () => {
    test('accepts dot-separated lowercase segments', () => {
      expect(isValidSignalId('availability.uptime')).toBe(true);
      expect(isValidSignalId('erc8004.feedback.rating')).toBe(true);
      expect(isValidSignalId('simple_evals.math_score')).toBe(true);
      expect(isValidSignalId('openrouter.evals.gpqa.diamond')).toBe(true);
    });

    test('rejects single-segment, empty-segment, and malformed ids', () => {
      expect(isValidSignalId('uptime')).toBe(false);
      expect(isValidSignalId('')).toBe(false);
      expect(isValidSignalId('.uptime')).toBe(false);
      expect(isValidSignalId('availability.')).toBe(false);
      expect(isValidSignalId('availability..uptime')).toBe(false);
      expect(isValidSignalId('Availability.Uptime')).toBe(false);
      expect(isValidSignalId('availability uptime')).toBe(false);
      expect(isValidSignalId('1availability.uptime')).toBe(false);
    });
  });

  describe('component keys', () => {
    test('accepts namespaced lowercase keys', () => {
      expect(isValidComponentKey('availability.uptime')).toBe(true);
      expect(isValidComponentKey('simple_evals.math')).toBe(true);
      expect(isValidComponentKey('erc8004-feedback.score')).toBe(true);
    });

    test('rejects whitespace and non-ASCII keys', () => {
      expect(isValidComponentKey('availability uptime')).toBe(false);
      expect(isValidComponentKey('availablity.üptime')).toBe(false);
      expect(isValidComponentKey('')).toBe(false);
      expect(isValidComponentKey('trustScores.total')).toBe(true);
    });
  });
});
