import { describe, it, expect } from 'vitest';
import { getMonthKey, formatMonth, escapeHtml } from '../js/utils.js';

describe('Frontend Utilities', () => {
    describe('getMonthKey', () => {
        it('should extract YYYY-MM from ISO date', () => {
            expect(getMonthKey('2026-05-04')).toBe('2026-05');
        });
        it('should return empty string for invalid date', () => {
            expect(getMonthKey('invalid')).toBe('');
            expect(getMonthKey('')).toBe('');
        });
    });

    describe('formatMonth', () => {
        it('should format YYYY-MM to Month YYYY', () => {
            expect(formatMonth('2026-05')).toBe('May 2026');
            expect(formatMonth('2026-01')).toBe('Jan 2026');
        });
    });

    describe('escapeHtml', () => {
        it('should escape HTML characters', () => {
            expect(escapeHtml('<script>alert("xss")</script>'))
                .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
        });
    });
});
