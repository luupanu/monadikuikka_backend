#!lua name=library

--- Concat two tables without modifying the original tables.
-- @param t1 a table - Table 1.
-- @param t2 a table - Table 2.
-- @return Concatenated table.
local function concatTables(t1, t2)
    local t3 = {}

    for _, v in ipairs(t1) do
        table.insert(t3, v)
    end

    for _, v in ipairs(t2) do
        table.insert(t3, v)
    end

    return t3
end

--- Checks if table is empty.
-- @param t a table - Table
-- @return A boolean, true if table is empty.
local function isEmpty(t)
    return next(t) == nil
end

--- Scans Redis with SCAN.
-- @param match a string - MATCH parameter for SCAN.
-- @return A table containing the SCAN result.
local function scanDB(match)
    local cursor = '0'
    local result
    local t = {}
    local has = {}

    repeat
        cursor, result = unpack(redis.call('SCAN', cursor, 'MATCH', match))

        for _, v in ipairs(result) do
            -- checks for duplicates
            if has[v] == nil then
                has[v] = true
                table.insert(t, v)
            end
        end
    until cursor == '0'

    return t
end

--- Split a string at separator.
-- @param s a string - The string to split.
-- @param sep a string - The separator to split on.
-- @return A table of strings split on the separator.
local function split(s, sep)
    local t = {}
    local tail = s

    while true do
        local i = string.find(tail, sep)

        if i == nil then break end

        local head = string.sub(tail, 0, i - 1)
        tail = string.sub(tail, i + 1, #s)

        table.insert(t, head)
    end

    table.insert(t, tail)

    return t
end

--- Convert drone data from a table of ipairs to a table of pairs.
-- @param hgetall a table - The HGETALL result from Redis.
-- @return A table of drones with drone id as a key.
local function objectifyDrone(hgetall)
    local result = {}
    local nextkey

    for i, v in ipairs(hgetall) do
        if i % 2 == 1 then
            nextkey = v
        else
            if nextkey == 'closestDistance' then
                result[nextkey] = tonumber(v)
            elseif nextkey == 'trespassed' then
                result[nextkey] = v == 'true'
            else
                result[nextkey] = v
            end
        end
    end

    return result
end

--- Fetches all drone / pilot / position data from DB.
-- @return A table containing pairs of keys and values every other index.
local function getAllDronesWithPilotsAndPositions()
    local droneKeys = scanDB('drones:*')

    local drones = {}

    for _, key in ipairs(droneKeys) do
        local sep, id = unpack(split(key, ':'))

        local drone = redis.call('HGETALL', key)
        local pilot = redis.call('HGETALL', 'pilots:' .. id)
        local pos = redis.call('LRANGE', 'pos:' .. id, 0, -1)

        if not (isEmpty(pilot)) then
            table.insert(drone, 'pilot')
            drone = concatTables(drone, { pilot })
        end
        
        if not (isEmpty(pos)) then
            table.insert(drone, 'pos')
            drone = concatTables(drone, { pos })
        end

        table.insert(drones, drone)
    end

    return drones
end

--- Atomically updates the drone database with the given drone.
-- @param keys Not used.
-- @param args Contains all data for a single drone needed to update the DB:
-- @param args[1]  timestamp      - a string, timestamp in ISO 8601 format.
-- @param args[2]  unixTime       - a string, time since UNIX epoch.
-- @param args[3]  expireTime     - a string, when to expire the updated keys in seconds.
-- @param args[4]  id             - a string, drone id.
-- @param args[5]  positionX      - a string, drone x position.
-- @param args[6]  positionY      - a string, drone y position.
-- @param args[7]  distanceStr    - a string, distance to birdnest.
-- @param args[8]  trespassingStr - a string, 'true' or 'false' if the drone is currently trespassing.
-- @param args[9]  pilotId        - a string, id of the pilot.
-- @param args[10] firstName      - a string, first name of the pilot.
-- @param args[11] lastName       - a string, last name of the pilot.
-- @param args[12] phoneNumber    - a string, phone number of the pilot.
-- @param args[13] email          - a string, email of the pilot.
-- @return 1 to signify that the updating succeeded.
local function updateDrone(keys, args)
    local timestamp, unixTime, expireTime, id, positionX, positionY, distanceStr, trespassingStr, pilotId, firstName, lastName, phoneNumber, email = unpack(args)

    -- make proper value conversions
    local distance = tonumber(distanceStr)
    local trespassing = trespassingStr == 'true'

    -- get information we already have about this drone
    local prevObs = objectifyDrone(redis.call('HGETALL', string.format('drones:%s', id)))

    -- update
    --   1) closest distance if closer than previous
    --   2) timestamp when last seen
    --   3) trespassing if within restricted area
    local closestDistance = distance
    local lastSeen = timestamp
    local firstTrespassed
    local trespassed = trespassing

    if prevObs.closestDistance then
        closestDistance = distance < prevObs.closestDistance and distance or prevObs.closestDistance
    end

    if prevObs.trespassed then
        trespassed = trespassing and true or prevObs.trespassed
    end

    if not prevObs.firstTrespassed and trespassed then
        firstTrespassed = timestamp
    end

    -- atomic update
    redis.call('ZADD', 'timestamps', unixTime, timestamp)
    redis.call('LPUSH', string.format('pos:%s', id), string.format('%s %s %s', timestamp, positionX, positionY))
    redis.call('HSET', string.format('drones:%s', id),
        'id', id,
        'closestDistance', tostring(closestDistance),
        'lastSeen', lastSeen,
        'trespassed', tostring(trespassed)
    )

    if firstTrespassed then
        redis.call('HSET', string.format('drones:%s', id),
            'firstTrespassed', firstTrespassed
        )
    end

    if pilotId then
        redis.call('HSET', string.format('pilots:%s', id),
            'pilotId', pilotId,
            'firstName', firstName or '',
            'lastName', lastName or '',
            'phoneNumber', phoneNumber or '',
            'email', email or ''
        )
    end

    redis.call('EXPIRE', string.format('drones:%s', id), expireTime)
    redis.call('EXPIRE', string.format('pos:%s', id), expireTime)
    redis.call('EXPIRE', string.format('pilots:%s', id), expireTime)

    return 1
end

redis.register_function('getAllDronesWithPilotsAndPositions', getAllDronesWithPilotsAndPositions)
redis.register_function('updateDrone', updateDrone)
