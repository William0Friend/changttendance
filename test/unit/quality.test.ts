import { getEnrollmentRejectionMessage } from '../../src/recognition/quality';

describe('quality rejection message mapping', () => {
  test('returns specific message for faceTooSmall', () => {
    const fakeReport: any = { failedChecks: ['faceTooSmall'] };
    const msg = getEnrollmentRejectionMessage(fakeReport);
    expect(msg).toMatch(/Move closer to the camera/);
  });

  test('returns blur message when sharpness failed', () => {
    const fakeReport: any = { failedChecks: ['sharpness'] };
    const msg = getEnrollmentRejectionMessage(fakeReport);
    expect(msg).toMatch(/Image is blurry/);
  });
});
