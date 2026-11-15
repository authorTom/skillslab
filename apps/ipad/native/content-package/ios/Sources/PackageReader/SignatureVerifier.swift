import CryptoKit
import Foundation

/// Ed25519 verification of a release manifest's signature, with CryptoKit so
/// it works on every iOS version the app supports. The web view's WebCrypto
/// only gained Ed25519 in iOS 17.
///
/// The payload is built by `signingPayload` in src/data/signature.ts, the
/// same bytes the server signs (src/lib/offline/signing.mjs at the repo root).
public enum SignatureVerifier {
    public enum Failure: Error, Equatable {
        case badPublicKey
        case badSignature
    }

    /// True when `signature` (base64, 64 bytes) is valid for `payload` under
    /// `publicKey` (base64, the raw 32-byte Ed25519 key).
    public static func verify(payload: String, signature: String, publicKey: String) throws -> Bool {
        guard let keyBytes = Data(base64Encoded: publicKey), keyBytes.count == 32,
              let key = try? Curve25519.Signing.PublicKey(rawRepresentation: keyBytes) else {
            throw Failure.badPublicKey
        }
        guard let signatureBytes = Data(base64Encoded: signature), signatureBytes.count == 64 else {
            throw Failure.badSignature
        }
        return key.isValidSignature(signatureBytes, for: Data(payload.utf8))
    }
}
