import Foundation
import XCTest
@testable import PackageReader

final class ManagedConfigurationTests: XCTestCase {
    private var defaults: UserDefaults!
    private let suite = "ManagedConfigurationTests"

    override func setUp() {
        defaults = UserDefaults(suiteName: suite)
        defaults.removePersistentDomain(forName: suite)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suite)
    }

    func testReadsTheKnownKeys() {
        defaults.set([
            "serverUrl": " https://skillslab.trust.internal ",
            "signingPublicKey": "unmD2Qhvxr7ymKPvI0V/+HBIMfo5cWyyJtMN+v/bO0Q=",
            "somethingElse": "ignored"
        ], forKey: ManagedConfiguration.defaultsKey)
        XCTAssertEqual(ManagedConfiguration.read(from: defaults), [
            "serverUrl": "https://skillslab.trust.internal",
            "signingPublicKey": "unmD2Qhvxr7ymKPvI0V/+HBIMfo5cWyyJtMN+v/bO0Q="
        ])
    }

    func testIgnoresEmptyAndNonStringValues() {
        defaults.set(["serverUrl": "", "signingPublicKey": 42], forKey: ManagedConfiguration.defaultsKey)
        XCTAssertEqual(ManagedConfiguration.read(from: defaults), [:])
    }

    func testIsEmptyOnAnUnmanagedDevice() {
        XCTAssertEqual(ManagedConfiguration.read(from: defaults), [:])
    }
}
