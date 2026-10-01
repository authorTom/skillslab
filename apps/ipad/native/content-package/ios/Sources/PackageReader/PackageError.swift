import Foundation

/// Problems with a package, worded for the person installing it.
public enum PackageError: LocalizedError, Equatable {
    case notAPackage
    case noManifest
    case damagedArchive
    case truncated
    case encrypted(String)
    case unsupportedCompression(String)
    case missingFile(String)
    case invalidPath(String)
    case incomplete(String)
    case damagedFile(String)
    case notEnoughSpace
    case cancelled

    public var errorDescription: String? {
        switch self {
        case .notAPackage:
            return "This isn’t a SkillsLab content package."
        case .noManifest:
            return "This doesn’t contain a SkillsLab content package (no manifest.json was found)."
        case .damagedArchive:
            return "The package file is damaged. Download or copy it again."
        case .truncated:
            return "The package file ended early. It may not have finished copying, or the drive was removed."
        case .encrypted(let name):
            return "\(name) is password-protected, so it can’t be installed."
        case .unsupportedCompression(let name):
            return "\(name) uses a kind of compression this app can’t read. Use the package downloaded from the CMS."
        case .missingFile(let name):
            return "The package is missing \(name)."
        case .invalidPath(let name):
            return "The package lists an invalid file path: \(name)."
        case .incomplete(let name):
            return "\(name) in the package is incomplete."
        case .damagedFile(let name):
            return "\(name) in the package is damaged: its contents don’t match the package manifest."
        case .notEnoughSpace:
            return "There isn’t enough free space on this iPad."
        case .cancelled:
            return "Cancelled."
        }
    }
}
