/**
 * The heart of the system: a Redis Lua script that performs the entire
 * "can this user buy?" decision as ONE atomic operation.
 *
 * Redis executes each Lua script atomically - no other command (from any
 * client / any backend instance) runs while this script is in flight. That is
 * what lets us scale the API layer horizontally to N stateless nodes while
 * still guaranteeing global correctness: the single-threaded Redis core is the
 * serialization point.
 *
 * KEYS[1] = stock key   (integer string, the remaining units)
 * KEYS[2] = buyers key  (a SET of userIds who already secured a unit)
 * ARGV[1] = userId
 *
 * Return codes (integers, mapped to PurchaseOutcome in RedisInventoryStore):
 *    1  -> success            (unit reserved for this user)
 *    0  -> already_purchased  (user is already in the buyers set)
 *   -1  -> sold_out           (no stock left)
 *
 * Note: a naive application-level `if (stock > 0) stock--` CANNOT provide this
 * guarantee, because the check and the decrement are two separate round-trips
 * and many clients can pass the check before any of them decrements.
 */
export const PURCHASE_LUA = `
if redis.call('SISMEMBER', KEYS[2], ARGV[1]) == 1 then
  return 0
end
local stock = tonumber(redis.call('GET', KEYS[1]))
if stock == nil or stock <= 0 then
  return -1
end
redis.call('DECR', KEYS[1])
redis.call('SADD', KEYS[2], ARGV[1])
return 1
`;
