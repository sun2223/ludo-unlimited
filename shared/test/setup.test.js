import test from 'node:test';
import assert from 'node:assert/strict';
import { COLORS } from '../index.js';
test('four distinct seats', () => assert.equal(new Set(COLORS).size, 4));
