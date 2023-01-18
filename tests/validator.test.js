const {
    BIRDNEST_HEIGHT,
    BIRDNEST_WIDTH,
} = require('../src/constants');
const {
    validateBirdnestData,
    validateDroneRegistryData
} = require('../src/validator');

describe('validator tests', () => {
    const timestamp = '2023-01-17T07:18:04Z';
    const id = 'SN-trespassin';

    describe('birdnest API tests', () => {
        test('wrong timestamp causes an error', () => {
            const wrongTimestamps = [
                'blabla',
                '2023-01-17F07:18:04Z',
                '2023-01-17T07:18:04Å',
                '17-01-202300T07:18:04Z',
            ];

            for (const wrongTimestamp of wrongTimestamps) {
                expect(() => validateBirdnestData({ '@_snapshotTimestamp': wrongTimestamp })).toThrow(`Invalid timestamp '${wrongTimestamp}' from birdnest API`);
            }
        });

        test('wrong drone id causes an error', () => {
            const wrongIds = [
                'S-12312312f8a',
                'SN-123123aab',
                'SN-12312312f&',
            ];

            for (const wrongId of wrongIds) {
                expect(() => validateBirdnestData({
                    '@_snapshotTimestamp': timestamp,
                    drone: [{
                        serialNumber: wrongId,
                    }],
                })).toThrow(`Invalid serial number '${wrongId}' from birdnest API`);
            }
        });

        test('wrong position causes an error', () => {
            const wrongPositions = [
                { positionX: 0, positionY: -0.001 },
                { positionX: -0.001, positionY: 0 },
                { positionX: BIRDNEST_WIDTH, positionY: BIRDNEST_HEIGHT + 0.001 },
                { positionX: BIRDNEST_WIDTH + 0.001, positionY: BIRDNEST_HEIGHT },
            ];

            for (const wrongPos of wrongPositions) {
                const { positionX, positionY } = wrongPos;

                expect(() => validateBirdnestData({
                    '@_snapshotTimestamp': timestamp,
                    drone: [{
                        serialNumber: id,
                        ...wrongPos,
                    }],
                })).toThrow(`Invalid coordinates '${positionX} ${positionY}' for '${id}' from birdnest API`);
            }
        });

        test('correct capture goes through', () => {
            const positions = [
                { positionX: 0, positionY: 0 },
                { positionX: 0, positionY: BIRDNEST_HEIGHT },
                { positionX: BIRDNEST_WIDTH, positionY: 0 },
                { positionX: BIRDNEST_WIDTH, positionY: BIRDNEST_HEIGHT },
            ];

            for (const pos of positions) {
                expect(() => validateBirdnestData({
                    '@_snapshotTimestamp': timestamp,
                    drone: [{
                        serialNumber: id,
                        ...pos,
                    }],
                })).not.toThrow(Error);
            }
        });
    });

    describe('drone registry API tests', () => {
        test('wrong pilot id causes an error', () => {
            const wrongPilotIds = [
                'P-123456aab',
                'Px-123456aab',
                'P-123456aa&',
            ];

            for (const wrongPilotId of wrongPilotIds) {
                expect(() => validateDroneRegistryData({
                    pilotId: wrongPilotId,
                })).toThrow(`Invalid pilotId '${wrongPilotId}' from drone registry API`);
            }
        });
    });
});