/**
 * The atomic counterpart to `purchaseScript.ts`: releases one user's unit back
 * to stock as a single Redis-atomic step, so a concurrent double-revoke can
 * never refund twice and a revoke can never race an in-flight purchase for the
 * same user into an inconsistent stock count.
 *
 * KEYS[1] = stock key   (integer string, the remaining units)
 * KEYS[2] = buyers key  (a SET of userIds who already secured a unit)
 * ARGV[1] = userId
 *
 * Return codes (integers, mapped to RevokeOutcome in RedisInventoryStore):
 *    1  -> revoked    (user was a buyer; removed and stock incremented)
 *    0  -> not_found  (user was never a buyer; stock left untouched)
 */
export const REVOKE_LUA = `
if redis.call('SREM', KEYS[2], ARGV[1]) == 1 then
  redis.call('INCR', KEYS[1])
  return 1
end
return 0
`;
