const { arrayToObject } = require('./utils');
const fs = require('fs');
const { createClient } = require('redis');

if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

const {
    DB_TIMESTAMPS_REMOVE_INTERVAL_SECONDS,
    REDIS_FUNCTIONS_FILE,
} = process.env;

/**
 * Connect to Redis server and load the custom Lua functions.
 * @async
 * @function connectToDB
 */
async function connectToDB() {
    await redis.connect();

    fs.readFile(REDIS_FUNCTIONS_FILE, (error, functionsFile) => {
        if (error) {
            return new Error('Could not read lua file for Redis functions');
        }

        redis.FUNCTION_LOAD(functionsFile.toString(), { REPLACE: true });
    });
}

/** Disconnect from Redis.
 *  @async
 *  @function disconnectFromDB
 */
async function disconnectFromDB() {
    await redis.quit();
}

/**
 * Get all drones mapped to pilots and positions from DB.
 * @async
 * @function getAllDronesWithPilotsAndPositions
 * @returns {Array} The drone data.
 */
async function getAllDronesWithPilotsAndPositions() {
    const result = await redis.FCALL('getAllDronesWithPilotsAndPositions');

    return massageDroneData(result);
}

/**
 * Gets latest timestamp.
 * @async
 * @function getLatestTimestamp
 * @returns {Array} First item is the latest timestamp, unless timestamps was empty.
 */
async function getLatestTimestamp() {
    const result = await redis.ZRANGE('timestamps', 0, 0, { REV: true });

    return result;
}

/**
 * Check if key exists in Redis DB.
 * @async
 * @function keyExists
 * @param {string} key
 * @returns {boolean} True if key exists.
 */
async function keyExists(key) {
    const result = await redis.EXISTS(key);

    return result > 0;
}

/**
 * Takes the data from Redis and maps it to JavaScript objects.
 * @async
 * @function massageDroneData
 * @param {Array} result - An array containing drone data from Redis comprised of strings of keys and values every other index.
 * @returns {Array} An array of JavaScript objects representing the drone data.
 */
function massageDroneData(result) {
    return result.map(res => {
        try {
            const drone = arrayToObject(res);

            if (drone.closestDistance) {
                drone.closestDistance = parseFloat(drone.closestDistance);
            }

            if (drone.pilot) {
                drone.pilot = arrayToObject(drone.pilot);
            }

            // map strings containing position information to objects
            // e.g. '2023-01-08T13:45:47.338Z 250000 500000'
            // =>   { timestamp: '2023-01-08T13:45:47.338Z', positionX: '250000', positionY: '500000' }
            if (drone.pos) {
                const pos = drone.pos.map(p => {
                    const [timestamp, positionX, positionY] = p.split(' ');

                    return { timestamp, positionX, positionY };
                });

                drone.pos = pos;
            }

            if (drone.trespassed) {
                drone.trespassed = drone.trespassed === 'true';
            }

            return drone;
        } catch (error) {
            console.error(error.message);
        }
    });
}

/**
 * Remove timestamp data that is older than n seconds.
 * @async
 * @function removeTimestampsSince
 * @param {number} expireTime - Expire time in seconds.
 * @returns {number} How many timestamps were deleted.
 */
async function removeTimestampsSince(expireTime) {
    const expireTimeInMs = expireTime * 1000;
    const now = Date.now();

    return await redis.ZREMRANGEBYSCORE('timestamps', '-inf', now - expireTimeInMs);
}

/**
 * Updates drone DB with a snapshot of new drone data.
 * @async
 * @function updateDroneDB
 * @param {Object} newReport - A parsed report of drone data as a JavaScript object.
 * @param {number} [expireTime=600] - The expire time in seconds for the drone data.
 * @returns {boolean} True if DB was updated. If false, the data of the report already existed in the DB.
 */
async function updateDroneDB(newReport, expireTime=600) {
    const { timestamp, unixTime } = newReport;

    // is this new data?
    const timestampExists = await redis.ZSCORE('timestamps', timestamp);

    // we should already have this data, don't update the DB
    if (timestampExists !== null) {
        console.log('- db.js: Timestamp of drone capture matches a previous capture. Did not update data.');

        return false;
    }

    // data is new, update DB
    for await (const drone of newReport.drones) {
        const { id, positionX, positionY, distance, trespassing } = drone;

        let args = [timestamp, unixTime, expireTime, id, positionX, positionY, distance, trespassing];

        // update pilot information if drone trespassed
        if (drone.pilot) {
            const { pilotId, firstName, lastName, phoneNumber, email } = drone.pilot;

            args = args.concat(pilotId, firstName, lastName, phoneNumber, email);
        }

        redis.FCALL('updateDrone', {
            arguments: args.map(arg => arg.toString()),
        });
    }

    return true;
}

// create redis client
const redis = createClient();

if (process.env.NODE_ENV !== 'test') {
    redis.on('error', (error) => console.log('Redis Client Error', error));

    // periodically remove timestamps
    setInterval(() => removeTimestampsSince(DB_TIMESTAMPS_REMOVE_INTERVAL_SECONDS), DB_TIMESTAMPS_REMOVE_INTERVAL_SECONDS * 1000);
}

module.exports = {
    connectToDB,
    disconnectFromDB,
    getAllDronesWithPilotsAndPositions,
    getLatestTimestamp,
    keyExists,
    redis,
    removeTimestampsSince,
    updateDroneDB
};
