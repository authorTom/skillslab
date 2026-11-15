import Foundation
import XCTest
@testable import PackageReader

/// A key, payload and signature made by scripts/sign-release.mjs (the
/// server's signer) for a sample manifest, so this checks CryptoKit accepts
/// exactly what the server produces.
private enum SignedSample {
    static let publicKey = "unmD2Qhvxr7ymKPvI0V/+HBIMfo5cWyyJtMN+v/bO0Q="
    static let signature =
        "Cj/tn/arrVgQoO7Rs0rym7aIi9kaw7i3CHwlVIG+QAYCh9/BmyiCzPfcx5eZxOzMa8YBqzailmEyOoKyUpoQBQ=="
    static let payload = [
        "skillslab-content",
        "1",
        "1",
        "1794700000000-fixture",
        "1.0.0",
        "2026-11-15T12:00:00.000Z",
        "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
        "4096",
        "60303ae22b998861bce3b28f33eec1be758a213c86c93c076dbe9f558c11c752:1484"
    ].joined(separator: "\n")
}

final class SignatureVerifierTests: XCTestCase {
    func testAcceptsTheServersSignature() throws {
        XCTAssertTrue(try SignatureVerifier.verify(
            payload: SignedSample.payload, signature: SignedSample.signature, publicKey: SignedSample.publicKey))
    }

    func testRejectsATamperedPayload() throws {
        let tampered = SignedSample.payload.replacingOccurrences(of: ":1484", with: ":1485")
        XCTAssertFalse(try SignatureVerifier.verify(
            payload: tampered, signature: SignedSample.signature, publicKey: SignedSample.publicKey))
    }

    func testRejectsAnotherKeysSignature() throws {
        let otherKey = Data(repeating: 0x11, count: 32).base64EncodedString()
        XCTAssertFalse((try? SignatureVerifier.verify(
            payload: SignedSample.payload, signature: SignedSample.signature, publicKey: otherKey)) ?? false)
    }

    func testRejectsMalformedKeysAndSignatures() {
        XCTAssertThrowsError(try SignatureVerifier.verify(
            payload: SignedSample.payload, signature: SignedSample.signature, publicKey: "not base64")
        ) { XCTAssertEqual($0 as? SignatureVerifier.Failure, .badPublicKey) }
        XCTAssertThrowsError(try SignatureVerifier.verify(
            payload: SignedSample.payload, signature: "AAAA", publicKey: SignedSample.publicKey)
        ) { XCTAssertEqual($0 as? SignatureVerifier.Failure, .badSignature) }
    }
}
