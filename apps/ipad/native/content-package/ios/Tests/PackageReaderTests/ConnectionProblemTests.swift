import Foundation
import XCTest
@testable import PackageReader

final class ConnectionProblemTests: XCTestCase {
    private func problem(_ code: Int) -> ConnectionProblem {
        ConnectionProblem.classify(NSError(domain: NSURLErrorDomain, code: code))
    }

    func testCertificateTrustFailuresAreTheirOwnProblem() {
        XCTAssertEqual(problem(NSURLErrorServerCertificateUntrusted), .untrustedCertificate)
        XCTAssertEqual(problem(NSURLErrorServerCertificateHasUnknownRoot), .untrustedCertificate)
        XCTAssertEqual(problem(NSURLErrorServerCertificateHasBadDate), .certificateDate)
        XCTAssertEqual(problem(NSURLErrorServerCertificateNotYetValid), .certificateDate)
        XCTAssertEqual(problem(NSURLErrorSecureConnectionFailed), .secureConnection)
        XCTAssertEqual(problem(NSURLErrorAppTransportSecurityRequiresSecureConnection), .secureConnection)
    }

    func testNetworkFailures() {
        XCTAssertEqual(problem(NSURLErrorCannotFindHost), .hostNotFound)
        XCTAssertEqual(problem(NSURLErrorCannotConnectToHost), .cannotConnect)
        XCTAssertEqual(problem(NSURLErrorTimedOut), .timedOut)
        XCTAssertEqual(problem(NSURLErrorNotConnectedToInternet), .offline)
    }

    func testAnythingElse() {
        XCTAssertEqual(problem(NSURLErrorBadURL), .other)
        XCTAssertEqual(ConnectionProblem.classify(NSError(domain: "Other", code: -1202)), .other)
        XCTAssertEqual(ConnectionProblem.untrustedCertificate.rawValue, "untrusted-certificate")
    }
}
