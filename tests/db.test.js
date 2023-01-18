const {
    connectToDB,
    disconnectFromDB,
    getAllDronesWithPilotsAndPositions,
    keyExists,
    redis,
    removeTimestampsSince,
    updateDroneDB
} = require('../db');
const {
    distanceToOrigin,
    withinRestrictedArea
} = require('../utils');

beforeAll(() => {
    connectToDB();
});

afterEach(() => {
    redis.FLUSHDB();
});

afterAll(() => {
    disconnectFromDB();
});

describe('db tests', () => {
    const firstTimestamp = '2023-01-11T13:58:02.472Z';
    const secondTimestamp = '2023-01-11T13:58:04.472Z';

    const notTrespassing = {
        id: 'SN-nottrespas',
        positionX: 250000,
        positionY: 149999,
        distance: 100001,
    };

    const trespassing = {
        id: 'SN-trespassin',
        positionX: 250000,
        positionY: 250000,
        distance: 0,
        pilot: {
            pilotId: 'testpilot',
            firstName: 'test',
            lastName: 'pilot',
            phoneNumber: '+123123',
            email: 'example@example.com',
        },
    };

    const trespassingLater = {
        id: 'SN-nottrespas',
        positionX: 250000,
        positionY: 150000,
        distance: 100000,
        pilot: {
            pilotId: 'testpilot2',
            firstName: 'testName',
            lastName: 'testLast',
            phoneNumber: '+456456',
            email: 'hehe@example.com',
        },
    };

    const firstReport = {
        timestamp: firstTimestamp,
        unixTime: Date.parse(firstTimestamp),
        drones: [
            {
                id: notTrespassing.id,
                positionX: notTrespassing.positionX,
                positionY: notTrespassing.positionY,
                distance: distanceToOrigin(notTrespassing.positionX, notTrespassing.positionY),
                trespassing: withinRestrictedArea(notTrespassing.positionX, notTrespassing.positionY),
            },
            {
                id: trespassing.id,
                positionX: trespassing.positionX,
                positionY: trespassing.positionY,
                distance: distanceToOrigin(trespassing.positionX, trespassing.positionY),
                trespassing: withinRestrictedArea(trespassing.positionX, trespassing.positionY),
                pilot: trespassing.pilot,
            },
        ],
    };

    const secondReport = {
        timestamp: secondTimestamp,
        unixTime: Date.parse(secondTimestamp),
        drones: [
            {
                id: trespassingLater.id,
                positionX: trespassingLater.positionX,
                positionY: trespassingLater.positionY,
                distance: distanceToOrigin(trespassingLater.positionX, trespassingLater.positionY),
                trespassing: withinRestrictedArea(trespassingLater.positionX, trespassingLater.positionY),
                pilot: trespassingLater.pilot,
            }
        ]
    };

    const compareIds = (a, b) => {
        return a.id < b.id ? -1 : 0;
    };

    describe('getAllDronesWithPilotsAndPositions()', () => {
        test('returns drones with pilots and positions', async () => {
            await updateDroneDB(firstReport);
            const firstResult = await getAllDronesWithPilotsAndPositions();

            expect(firstResult.sort(compareIds)).toEqual([
                {
                    closestDistance: notTrespassing.distance,
                    id: notTrespassing.id,
                    lastSeen: firstReport.timestamp,
                    pos: [{
                        timestamp: firstReport.timestamp,
                        positionX: `${notTrespassing.positionX}`,
                        positionY: `${notTrespassing.positionY}`,
                    }],
                    trespassed: false,
                },
                {
                    closestDistance: trespassing.distance,
                    firstTrespassed: firstTimestamp,
                    id: trespassing.id,
                    lastSeen: firstReport.timestamp,
                    pilot: trespassing.pilot,
                    pos: [{
                        timestamp: firstReport.timestamp,
                        positionX: `${trespassing.positionX}`,
                        positionY: `${trespassing.positionY}`,
                    }],
                    trespassed: true,
                },
            ]);

            await updateDroneDB(secondReport);
            const secondResult = await getAllDronesWithPilotsAndPositions();

            expect(secondResult.sort(compareIds)).toEqual([
                {
                    closestDistance: trespassingLater.distance,
                    firstTrespassed: secondTimestamp,
                    id: trespassingLater.id,
                    lastSeen: secondReport.timestamp,
                    pilot: trespassingLater.pilot,
                    pos: [{
                        timestamp: secondReport.timestamp,
                        positionX: `${trespassingLater.positionX}`,
                        positionY: `${trespassingLater.positionY}`,
                    },
                    {
                        timestamp: firstReport.timestamp,
                        positionX: `${notTrespassing.positionX}`,
                        positionY: `${notTrespassing.positionY}`,
                    }],
                    trespassed: true,
                },
                {
                    closestDistance: trespassing.distance,
                    firstTrespassed: firstTimestamp,
                    id: trespassing.id,
                    lastSeen: firstReport.timestamp,
                    pilot: trespassing.pilot,
                    pos: [{
                        timestamp: firstReport.timestamp,
                        positionX: `${trespassing.positionX}`,
                        positionY: `${trespassing.positionY}`,
                    }],
                    trespassed: true,
                },
            ]);
        });
    });

    describe('keyExists()', () => {
        test('finds correct key', async () => {
            await redis.SET('correct key', 'any value');

            const result = await keyExists('correct key');

            expect(result).toBe(true);
        });

        test('does not find wrong key', async () => {
            const result = await keyExists('wrong key');

            expect(result).toBe(false);
        });
    });

    describe('removeTimeStampsSince()', () => {
        test('removes multiple timestamps', async () => {
            await redis.ZADD('timestamps', {
                score: `${firstReport.unixTime}`,
                value: `${firstReport.timestamp}`
            });
            await redis.ZADD('timestamps', {
                score: `${secondReport.unixTime}`,
                value: `${secondReport.timestamp}`
            });

            const result = await removeTimestampsSince(0);
            const timestamps = await redis.ZRANGE_WITHSCORES('timestamps', 0, -1, {
                REV: true,
            });

            expect(result).toBe(2);
            expect(timestamps).toEqual([]);
        });
    });

    describe('updateDroneDB()', () => {
        test('fails if timestamp is not new', async () => {
            await redis.ZADD('timestamps', {
                score: `${firstReport.unixTime}`,
                value: `${firstReport.timestamp}`
            });

            const result = await updateDroneDB(firstReport);
            const keys = await redis.KEYS('*');

            expect(result).toBe(false);
            expect(keys).toEqual(['timestamps']);
        });

        test('creates a non-trespassing drone successfully', async () => {
            const result = await updateDroneDB(firstReport);
            const drone = await redis.HGETALL(`drones:${notTrespassing.id}`);
            const pos = await redis.LRANGE(`pos:${notTrespassing.id}`, 0, -1);
            const timestamps = await redis.ZRANGE_WITHSCORES('timestamps', 0, 0, {
                REV: true,
            });

            expect(result).toBe(true);
            expect(drone).toEqual({
                closestDistance: `${notTrespassing.distance}`,
                id: notTrespassing.id,
                lastSeen: firstReport.timestamp,
                trespassed: 'false',
            });
            expect(pos).toEqual([`${firstReport.timestamp} ${notTrespassing.positionX} ${notTrespassing.positionY}`]);
            expect(timestamps).toEqual([{ score: firstReport.unixTime, value: firstReport.timestamp}]);
        });

        test('creates a trespassing drone successfully', async () => {
            const result = await updateDroneDB(firstReport);
            const drone = await redis.HGETALL(`drones:${trespassing.id}`);
            const pos = await redis.LRANGE(`pos:${trespassing.id}`, 0, -1);
            const pilot = await redis.HGETALL(`pilots:${trespassing.id}`);
            const timestamps = await redis.ZRANGE_WITHSCORES('timestamps', 0, -1, {
                REV: true,
            });

            expect(result).toBe(true);
            expect(drone).toEqual({
                closestDistance: `${trespassing.distance}`,
                firstTrespassed: firstTimestamp,
                id: trespassing.id,
                lastSeen: firstReport.timestamp,
                trespassed: 'true',
            });
            expect(pilot).toEqual(trespassing.pilot);
            expect(pos).toEqual([`${firstReport.timestamp} ${trespassing.positionX} ${trespassing.positionY}`]);
            expect(timestamps).toEqual([{ score: firstReport.unixTime, value: firstReport.timestamp}]);
        });

        test('previously not-trespassed drone is updated', async () => {
            await updateDroneDB(firstReport);
            const result = await updateDroneDB(secondReport);
            const drone = await redis.HGETALL(`drones:${trespassingLater.id}`);
            const pos = await redis.LRANGE(`pos:${trespassingLater.id}`, 0, -1);
            const pilot = await redis.HGETALL(`pilots:${trespassingLater.id}`);
            const timestamps = await redis.ZRANGE_WITHSCORES('timestamps', 0, -1, {
                REV: true,
            });

            expect(result).toBe(true);
            expect(drone).toEqual({
                closestDistance: `${trespassingLater.distance}`,
                firstTrespassed: secondTimestamp,
                id: trespassingLater.id,
                lastSeen: secondReport.timestamp,
                trespassed: 'true',
            });
            expect(pilot).toEqual(trespassingLater.pilot);
            expect(pos).toEqual([
                `${secondReport.timestamp} ${trespassingLater.positionX} ${trespassingLater.positionY}`,
                `${firstReport.timestamp} ${notTrespassing.positionX} ${notTrespassing.positionY}`,
            ]);
            expect(timestamps).toEqual([
                { score: secondReport.unixTime, value: secondReport.timestamp },
                { score: firstReport.unixTime, value: firstReport.timestamp },
            ]);
        });
    });
});
