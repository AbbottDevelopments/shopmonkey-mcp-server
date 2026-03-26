import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizePathParam, getDefaultLocationId } from '../client.js';
import { pickFields } from '../types/tools.js';

describe('sanitizePathParam', () => {
  it('encodes special characters', () => {
    assert.equal(sanitizePathParam('abc?foo=bar'), 'abc%3Ffoo%3Dbar');
  });

  it('encodes slashes to prevent path traversal', () => {
    assert.equal(sanitizePathParam('../../admin'), '..%2F..%2Fadmin');
  });

  it('encodes hash characters', () => {
    assert.equal(sanitizePathParam('abc#fragment'), 'abc%23fragment');
  });

  it('passes through normal IDs unchanged', () => {
    assert.equal(sanitizePathParam('abc123'), 'abc123');
  });

  it('handles UUIDs', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    assert.equal(sanitizePathParam(uuid), uuid);
  });
});

describe('pickFields', () => {
  it('picks only allowed fields', () => {
    const result = pickFields(
      { name: 'John', email: 'john@test.com', secret: 'hack' },
      ['name', 'email']
    );
    assert.deepEqual(result, { name: 'John', email: 'john@test.com' });
  });

  it('ignores undefined values', () => {
    const result = pickFields(
      { name: 'John', email: undefined },
      ['name', 'email']
    );
    assert.deepEqual(result, { name: 'John' });
  });

  it('preserves falsy values like 0 and empty string', () => {
    const result = pickFields(
      { count: 0, label: '', active: false },
      ['count', 'label', 'active']
    );
    assert.deepEqual(result, { count: 0, label: '', active: false });
  });

  it('returns empty object when no allowed fields present', () => {
    const result = pickFields({ secret: 'hack' }, ['name', 'email']);
    assert.deepEqual(result, {});
  });
});

describe('getDefaultLocationId', () => {
  const originalEnv = process.env.SHOPMONKEY_LOCATION_ID;

  after(() => {
    if (originalEnv !== undefined) {
      process.env.SHOPMONKEY_LOCATION_ID = originalEnv;
    } else {
      delete process.env.SHOPMONKEY_LOCATION_ID;
    }
  });

  it('returns undefined when not set', () => {
    delete process.env.SHOPMONKEY_LOCATION_ID;
    assert.equal(getDefaultLocationId(), undefined);
  });

  it('returns undefined when empty string', () => {
    process.env.SHOPMONKEY_LOCATION_ID = '';
    assert.equal(getDefaultLocationId(), undefined);
  });

  it('returns the value when set', () => {
    process.env.SHOPMONKEY_LOCATION_ID = 'loc-123';
    assert.equal(getDefaultLocationId(), 'loc-123');
  });
});
