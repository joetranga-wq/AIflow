import { describe, it, expect } from 'vitest';
import { tryParseJson } from '../runAiflow.mts';

describe('tryParseJson', () => {
  it('returns plain text when input is empty or non-JSON', () => {
    expect(tryParseJson('')).toBe('');
    expect(tryParseJson('hello world')).toBe('hello world');
  });

  it('parses a simple JSON string', () => {
    const input = '{"foo":"bar","count":1}';
    const result = tryParseJson(input);

    expect(result).toEqual({ foo: 'bar', count: 1 });
  });

  it('parses JSON wrapped in ```json fences', () => {
    const input = '```json\n{"foo":"bar"}\n```';
    const result = tryParseJson(input);

    expect(result).toEqual({ foo: 'bar' });
  });

  it('falls back to original text when JSON is invalid', () => {
    const input = '{invalid json}';
    const result = tryParseJson(input);

    expect(result).toBe(input);
  });
});
