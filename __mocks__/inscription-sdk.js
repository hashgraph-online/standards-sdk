class InscriptionSDKMock {
  constructor() {}

  static async createWithAuth() {
    return new InscriptionSDKMock();
  }

  async startInscription() {
    throw new Error(
      'InscriptionSDK is mocked in standards-sdk tests; startInscription is not implemented.',
    );
  }

  async retrieveInscription() {
    throw new Error(
      'InscriptionSDK is mocked in standards-sdk tests; retrieveInscription is not implemented.',
    );
  }
}

exports.InscriptionSDK = InscriptionSDKMock;
