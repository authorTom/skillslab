import Foundation

/// Why a request to the CMS server failed, in the terms the app explains to
/// whoever is setting up the iPad. The web view's fetch() only says "Load
/// failed", so the plugin repeats the request with URLSession, which uses the
/// same system trust store, and classifies the error it gets.
public enum ConnectionProblem: String {
    /// The certificate chains to a CA this iPad doesn't trust: usually an
    /// internal CA whose root hasn't been installed and trusted.
    case untrustedCertificate = "untrusted-certificate"
    /// The certificate has expired or isn't valid yet (or the clock is wrong).
    case certificateDate = "certificate-date"
    /// TLS failed for another reason, or the certificate was rejected by App
    /// Transport Security's requirements.
    case secureConnection = "secure-connection"
    case hostNotFound = "host-not-found"
    case cannotConnect = "cannot-connect"
    case timedOut = "timed-out"
    case offline = "offline"
    case other = "other"

    public static func classify(_ error: Error) -> ConnectionProblem {
        let error = error as NSError
        guard error.domain == NSURLErrorDomain else { return .other }
        switch error.code {
        case NSURLErrorServerCertificateUntrusted,
             NSURLErrorServerCertificateHasUnknownRoot:
            return .untrustedCertificate
        case NSURLErrorServerCertificateHasBadDate,
             NSURLErrorServerCertificateNotYetValid:
            return .certificateDate
        case NSURLErrorSecureConnectionFailed,
             NSURLErrorClientCertificateRejected,
             NSURLErrorClientCertificateRequired,
             NSURLErrorAppTransportSecurityRequiresSecureConnection:
            return .secureConnection
        case NSURLErrorCannotFindHost, NSURLErrorDNSLookupFailed:
            return .hostNotFound
        case NSURLErrorCannotConnectToHost, NSURLErrorNetworkConnectionLost:
            return .cannotConnect
        case NSURLErrorTimedOut:
            return .timedOut
        case NSURLErrorNotConnectedToInternet, NSURLErrorInternationalRoamingOff,
             NSURLErrorDataNotAllowed:
            return .offline
        default:
            return .other
        }
    }
}
