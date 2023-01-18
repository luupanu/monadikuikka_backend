const {
    BIRDNEST_ORIGIN,
    BIRDNEST_PROTECTED_DISTANCE,
} = require('../src/constants');
const {
    arrayToObject,
    distanceToOrigin,
    withinRestrictedArea
} = require('../src/utils');

describe('utils tests', () => {
    test('arrayToObject() works', () => {
        const arr = ['key', 'value', 'anotherKey', 'anotherValue'];

        const result = arrayToObject(arr);

        expect(result).toEqual({
            'key': 'value',
            'anotherKey' : 'anotherValue',
        });
    });

    test('distanceToOrigin() is calculated correctly', () => {
        const distanceToCorners = Math.sqrt(BIRDNEST_ORIGIN.positionX ** 2 + BIRDNEST_ORIGIN.positionY ** 2);

        expect(distanceToOrigin(0, 0)).toEqual(distanceToCorners);
        expect(distanceToOrigin(0, 500000)).toEqual(distanceToCorners);
        expect(distanceToOrigin(500000, 0)).toEqual(distanceToCorners);
        expect(distanceToOrigin(500000, 500000)).toEqual(distanceToCorners);
        expect(distanceToOrigin(BIRDNEST_ORIGIN.positionX, BIRDNEST_ORIGIN.positionY)).toEqual(0);
    });

    test('withinRestrictedArea() is calculated correctly', () => {
        expect(withinRestrictedArea(BIRDNEST_ORIGIN.positionX, BIRDNEST_ORIGIN.positionY - BIRDNEST_PROTECTED_DISTANCE - 0.001)).toEqual(false);
        expect(withinRestrictedArea(BIRDNEST_ORIGIN.positionX, BIRDNEST_ORIGIN.positionY + BIRDNEST_PROTECTED_DISTANCE + 0.001)).toEqual(false);
        expect(withinRestrictedArea(BIRDNEST_ORIGIN.positionX - BIRDNEST_PROTECTED_DISTANCE - 0.001, BIRDNEST_ORIGIN.positionY)).toEqual(false);
        expect(withinRestrictedArea(BIRDNEST_ORIGIN.positionX + BIRDNEST_PROTECTED_DISTANCE + 0.001, BIRDNEST_ORIGIN.positionY)).toEqual(false);
        expect(withinRestrictedArea(BIRDNEST_ORIGIN.positionX, BIRDNEST_ORIGIN.positionY - BIRDNEST_PROTECTED_DISTANCE)).toEqual(true);
        expect(withinRestrictedArea(BIRDNEST_ORIGIN.positionX, BIRDNEST_ORIGIN.positionY + BIRDNEST_PROTECTED_DISTANCE)).toEqual(true);
        expect(withinRestrictedArea(BIRDNEST_ORIGIN.positionX - BIRDNEST_PROTECTED_DISTANCE, BIRDNEST_ORIGIN.positionY)).toEqual(true);
        expect(withinRestrictedArea(BIRDNEST_ORIGIN.positionX + BIRDNEST_PROTECTED_DISTANCE, BIRDNEST_ORIGIN.positionY)).toEqual(true);
        expect(withinRestrictedArea(BIRDNEST_ORIGIN.positionX, BIRDNEST_ORIGIN.positionY)).toEqual(true);
    });
});
