import { CapacitiesApiError, CapacitiesErrorCode, CapacitiesOAuthError } from '@capacities/api';
import { describe, expect, it } from 'vitest';
import { isAuthLoss, suggestsReconnect } from '../../src/app/session';

const api = (status: number, code: CapacitiesErrorCode | 'cap_unknown'): CapacitiesApiError =>
  new CapacitiesApiError(status, code, 'test');

describe('which failed loads sign out, and which offer Reconnect first', () => {
  it('treats a 401 and a failed token refresh as a lost connection', () => {
    expect(isAuthLoss(api(401, CapacitiesErrorCode.NotAuthenticated))).toBe(true);
    expect(isAuthLoss(new CapacitiesOAuthError('refresh failed'))).toBe(true);
  });

  it('does not sign out on refused access, outages or a dropped network', () => {
    expect(isAuthLoss(api(403, 'cap_unknown'))).toBe(false);
    expect(isAuthLoss(api(503, CapacitiesErrorCode.ServiceUnavailable))).toBe(false);
    expect(isAuthLoss(new TypeError('Failed to fetch'))).toBe(false);
  });

  it('leads with Reconnect for refused access or a missing scope', () => {
    expect(suggestsReconnect(api(403, 'cap_unknown'))).toBe(true);
    expect(suggestsReconnect(api(403, CapacitiesErrorCode.ScopeInsufficient))).toBe(true);
    expect(suggestsReconnect(new CapacitiesOAuthError('refresh failed'))).toBe(true);
  });

  it('leads with Try again for outages, rate limits and a dropped network', () => {
    expect(suggestsReconnect(api(500, CapacitiesErrorCode.ServerError))).toBe(false);
    expect(suggestsReconnect(api(429, CapacitiesErrorCode.RateLimitExceeded))).toBe(false);
    expect(suggestsReconnect(new TypeError('Failed to fetch'))).toBe(false);
  });
});
