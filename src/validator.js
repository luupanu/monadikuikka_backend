const {
    BIRDNEST_HEIGHT,
    BIRDNEST_WIDTH,
} = require('./constants');
const validator = require('validator');

/**
 * Validates data from birdnest API.
 * @function validateBirdnestData
 * @param {Object} capture - a JavaScript object.
 * @throws Will throw an error if data from API is not valid.
 */
function validateBirdnestData(capture) {
    const timestamp = capture['@_snapshotTimestamp'];

    if (typeof(timestamp) !== 'string' ||
        !validator.isISO8601(timestamp, { strict: true, strictSeparator: true }))
    {
        throw new Error(`Invalid timestamp '${timestamp}' from birdnest API`);
    }

    for (const drone of capture.drone) {
        const { serialNumber: id, positionX, positionY } = drone;

        if (typeof(id) !== 'string' ||
            !validator.isLength(id, { min: 13, max: 13 }) ||
            !id.startsWith('SN-') ||
            !validator.isAlphanumeric(id, 'en-US', { ignore: '-_' }))
        {
            throw new Error(`Invalid serial number '${id}' from birdnest API`);
        }

        if (typeof(positionX) !== 'number' ||
            typeof(positionY) !== 'number' ||
            !validator.isFloat(positionX + '', { min: 0, max: BIRDNEST_WIDTH }) ||
            !validator.isFloat(positionY + '', { min: 0, max: BIRDNEST_HEIGHT }))
        {
            throw new Error(`Invalid coordinates '${positionX} ${positionY}' for '${id}' from birdnest API`);
        }
    }
}

/**
 * Validates data from drone registry API.
 * @function validateDroneRegistryData
 * @param {Object} pilotData - a JavaScript object.
 * @throws Will throw an error if data from API is not valid.
 */
function validateDroneRegistryData(pilotData) {
    const { pilotId } = pilotData;

    if (typeof(pilotId) !== 'string' ||
        !validator.isLength(pilotId, { min: 12, max: 12 }) ||
        !pilotId.startsWith('P-') ||
        !validator.isAlphanumeric(pilotId, 'en-US', { ignore: '-_' }))
    {
        throw new Error(`Invalid pilotId '${pilotId}' from drone registry API`);
    }

    // don't validate any other pilot details for now
}

module.exports = { validateBirdnestData, validateDroneRegistryData };
