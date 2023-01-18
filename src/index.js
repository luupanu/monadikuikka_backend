const {
    connectToDB,
    disconnectFromDB,
    getAllDronesWithPilotsAndPositions,
    getLatestTimestamp,
    keyExists,
    updateDroneDB,
} = require('./db');
const {
    distanceToOrigin,
    fetchWithTimeout,
    withinRestrictedArea,
} = require('./utils');
const {
    validateBirdnestData,
    validateDroneRegistryData,
} = require('./validator');
const express = require('express');
const { createServer } = require('http');
const createError = require('http-errors');
const { XMLParser } = require('fast-xml-parser');
const { Server } = require('socket.io');

if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}
const {
    BIRDNEST_API,
    DRONE_REGISTRY_API,
    POLL_INTERVAL_MS,
    PORT,
    FRONTEND_URL,
} = process.env;

/**
 * Broadcast drone data through Socket.IO to all connected clients.
 * @async
 * @function broadcastDroneData
 * @param {Object} io - A Socket.IO Server
 * @param {string} timestamp - A timestamp in ISO 8601 format.
 */
async function broadcastDroneData(io, timestamp) {
    const dronesWithPilotsAndPositions = await getAllDronesWithPilotsAndPositions();

    if (dronesWithPilotsAndPositions.length > 0) {
        // broadcast data
        io.sockets.emit('update', timestamp, dronesWithPilotsAndPositions);
    }
}

/**
 * Send drone data through Socket.IO to a single client.
 * @async
 * @function sendDroneDataToClient
 * @param {Object} socketId - A Socket.IO socket id.
 * @param {string} timestamp - A timestamp in ISO 8601 format.
 */
async function sendDroneDataToClient(socketId, timestamp) {
    const dronesWithPilotsAndPositions = await getAllDronesWithPilotsAndPositions();

    if (dronesWithPilotsAndPositions.length > 0) {
        // send data to a single client
        io.to(socketId).emit('update', timestamp, dronesWithPilotsAndPositions);
    }
}

/**
 * Fetch data from birdnest API and parse the XML data to an Array of JavaScript objects.
 * @async
 * @function queryBirdnest
 * @param {number} [timeout=POLL_INTERVAL_MS] Aborts fetch if timeout (in milliseconds) reached.
 * @returns {Array} An array of JavaScript objects representing the drone data.
 */
async function queryBirdnest(timeout=POLL_INTERVAL_MS) {
    const data = await fetchWithTimeout(BIRDNEST_API, { method: 'GET', timeout })
        .then(response => {
            console.log(new Date(), 'Response from birdnest API', response.status);

            if (!response.ok) throw new createError(response.status);

            return response.text();
        })
        .catch(error => console.error(error.status, error.message))
        .then(XMLdata => parser.parse(XMLdata))
        .catch(error => console.error('Error parsing XML data:', error.message));

    return data;
}

/**
 * Fetch data from drone registry API.
 * @async
 * @function queryDroneRegistry
 * @param {string} id - The drone id.
 * @param {number} [timeout=POLL_INTERVAL_MS] Aborts fetch if timeout (in milliseconds) reached.
 * @returns {Array} An array of JavaScript objects representing the drone data.
 */
async function queryDroneRegistry(id, timeout=POLL_INTERVAL_MS) {
    const data = await fetchWithTimeout(`${DRONE_REGISTRY_API}/${id}`, { method: 'GET', timeout })
        .then(response => {
            console.log(new Date(), 'Response from drone registry API', response.status);

            if (!response.ok) throw new createError(response.status);

            return response.text();
        })
        .catch(error => console.error(error.status, error.message));

    return data;
}

/**
 * Maps drone data to JavaScript objects. Checks if drone if trespassing and calculates the distance to birdnest.
 * @function mapDrones
 * @param {Array} drones - An array of JavaScript drones from parsed XML.
 * @param {number} [timeout=POLL_INTERVAL_MS] Aborts fetch if timeout (in milliseconds) reached.
 * @returns {Array} An array of JavaScript objects representing the drone data.
 */
function mapDrones(drones) {
    return Promise.all(drones.map(async drone => {
        const newDrone = {
            id: drone.serialNumber,
            positionX: drone.positionX,
            positionY: drone.positionY,
            distance: distanceToOrigin(drone.positionX, drone.positionY),
            trespassing: withinRestrictedArea(drone.positionX, drone.positionY),
        };

        // get pilot information from drone registry if trespassing
        if (newDrone.trespassing) {
            const pilotInformationExists = await keyExists(`pilots:${drone.serialNumber}`);

            if (!pilotInformationExists) {
                const response = await queryDroneRegistry(drone.serialNumber);

                if (response) {
                    const { createdDt: _, ...pilot } = JSON.parse(response);

                    validateDroneRegistryData(pilot);

                    return {
                        ...newDrone,
                        pilot,
                    };
                }
            }
        }

        return newDrone;
    }));
}

/**
 * Polls birdnest data in regular intervals, asks DB to update and executes a callback function if DB was updated.
 * @function pollBirdnest
 * @param {number} interval - How often to poll data from API in milliseconds.
 * @param {function} callback - A callback function to call if DB was updated.
 * @param {number} [elapsedTime=0] Time in milliseconds elapsed since last poll.
 */
function pollBirdnest(interval, callback, elapsedTime=0) {
    setTimeout(async () => {
        const start = performance.now();
        const data = await queryBirdnest();

        if (data?.report) {
            try {
                const { capture } = data.report;

                validateBirdnestData(capture);

                const newReport = {
                    timestamp: capture['@_snapshotTimestamp'],
                    unixTime: Date.parse(capture['@_snapshotTimestamp']),
                    drones: await mapDrones(capture.drone),
                };

                const dbWasUpdated = await updateDroneDB(newReport);

                if (dbWasUpdated && callback) {
                    callback(newReport.timestamp);
                }

            } catch (error) {
                console.error(error.message);
            }
        }

        const elapsedTime = performance.now() - start;

        pollBirdnest(interval, callback, elapsedTime);

    }, interval - elapsedTime);
}

/**
 * Gracefully shutdown Socket.IO, database and http server.
 * @function shutdownServer
 */
function shutdownServer() {
    io.close();
    disconnectFromDB();
    httpServer.close();
}

// Cleanup before shutdown
process.on('SIGINT', () => {
    shutdownServer();

    process.exit(0);
});

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: FRONTEND_URL,
        methods: ['GET'],
    },
    serveClient: false,
});
const parser = new XMLParser({ ignoreAttributes: false });

// Serve static files
app.use(express.static('public'));

// Start server
httpServer.listen(PORT, () => {
    console.log(`\nServer listening at ${PORT}`);
});

io.on('connect', async (socket) => {
    // send latest data immediately to connecting client
    const timestamp = await getLatestTimestamp();

    sendDroneDataToClient(socket.id, timestamp);
});

// Connect to Redis and start polling
connectToDB().then(() => {
    console.log('Connected to redis.\n');

    pollBirdnest(POLL_INTERVAL_MS, timestamp => broadcastDroneData(io, timestamp));
});
