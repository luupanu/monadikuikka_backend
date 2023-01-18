const {
    BIRDNEST_ORIGIN,
    BIRDNEST_PROTECTED_DISTANCE
} = require('./constants');

/**
 * Converts an array of interchanging keys and values to an object.
 * e.g. ['key', 'value'] => { 'key': 'value' }
 * @function arrayToObject
 * @param {Array} arr - The array to convert.
 * @returns {Object} The object to return.
 */
function arrayToObject(arr) {
    let nextKey;
    let obj = {};

    arr.forEach((keyOrVal, i) => {
        if (i % 2 === 0) {
            nextKey = keyOrVal;
        } else {
            obj[nextKey] = keyOrVal;
        }
    });

    return obj;
}

/**
 * Calculates distance from a 2D position to a 2D origin.
 * @function distanceToOrigin
 * @param {number} positionX - x coordinate.
 * @param {number} positionX - y coordinate.
 * @returns {number} Distance to origin.
 */
function distanceToOrigin(positionX, positionY) {
    return Math.sqrt(
        (positionX - BIRDNEST_ORIGIN.positionX) ** 2 +
        (positionY - BIRDNEST_ORIGIN.positionY) ** 2
    );
}

/**
 * Fetch with timeout. Aborts fetch if timeout reached.
 * https://developer.chrome.com/blog/abortable-fetch
 * @async
 * @function fetchWithTimeout
 * @param {string|Request} resource - an url or Resource to fetch from.
 * @param {Object} [options={}] Optional options for the fetch.
 * @returns {Promise|Response} A Promise that resolves to a Response object.
 */
async function fetchWithTimeout(resource, options = {}) {
    const { timeout = 2000 } = options;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(resource, {
        ...options,
        signal: controller.signal,
    });

    clearTimeout(id);

    return response;
}

/**
 * Calculates if coordinates are within a restricted area.
 * @function withinRestrictedArea
 * @param {number} positionX - x coordinate.
 * @param {number} positionY - y coordinate.
 * @returns {boolean} True if within restricted area.
 */
function withinRestrictedArea(positionX, positionY) {
    return distanceToOrigin(positionX, positionY) <= BIRDNEST_PROTECTED_DISTANCE;
}

module.exports = { arrayToObject, distanceToOrigin, fetchWithTimeout, withinRestrictedArea };
