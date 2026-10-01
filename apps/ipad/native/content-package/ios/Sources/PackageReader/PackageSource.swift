import Foundation

/// A content package to install from: a folder (as exported by the CMS, or
/// unzipped by hand) or a single zip file (a .skillslab download).
/// Paths are relative to the package root, e.g. "assets/<sha256>.mp4".
public protocol PackageSource: AnyObject {
    /// The file or folder name, for display.
    var displayName: String { get }
    /// Size of a file in the package, or nil if it isn't there.
    func size(of path: String) -> UInt64?
    /// Stream a file's bytes to `sink`.
    func read(_ path: String, isCancelled: () -> Bool, to sink: (Data) throws -> Void) throws
}

extension PackageSource {
    /// Read a small file (the manifest) whole.
    public func readAll(_ path: String, limit: UInt64 = 32 * 1024 * 1024) throws -> Data {
        guard let size = size(of: path) else { throw PackageError.missingFile(path) }
        guard size <= limit else { throw PackageError.damagedArchive }
        var data = Data()
        try read(path, isCancelled: { false }) { data.append($0) }
        return data
    }
}

/// Reject absolute paths and any `..` component, so a package can never
/// name a file outside itself.
public func isSafeRelativePath(_ path: String) -> Bool {
    guard !path.isEmpty, !path.hasPrefix("/"), !path.contains("\\") else { return false }
    return !path.split(separator: "/", omittingEmptySubsequences: false).contains { $0 == ".." || $0 == "." || $0.isEmpty }
}

private let manifestName = "manifest.json"

/// Ignored when looking for the package inside a zip or folder.
private func isJunk(_ name: String) -> Bool {
    name.hasPrefix("__MACOSX/") || name.hasPrefix(".") || name.contains("/.")
}

public final class FolderSource: PackageSource {
    public let displayName: String
    private let root: URL

    /// Opens `url` as a package folder. If the folder doesn't hold a
    /// manifest but exactly one folder inside it does (the user picked the
    /// drive or the folder above the package), that one is used.
    public init(url: URL) throws {
        let fm = FileManager.default
        displayName = url.lastPathComponent
        if fm.fileExists(atPath: url.appendingPathComponent(manifestName).path) {
            root = url
            return
        }
        let children = (try? fm.contentsOfDirectory(at: url, includingPropertiesForKeys: [.isDirectoryKey],
                                                     options: [.skipsHiddenFiles])) ?? []
        let packages = children.filter { child in
            (try? child.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true
                && fm.fileExists(atPath: child.appendingPathComponent(manifestName).path)
        }
        guard packages.count == 1 else { throw PackageError.noManifest }
        root = packages[0]
    }

    private func url(for path: String) throws -> URL {
        guard isSafeRelativePath(path) else { throw PackageError.invalidPath(path) }
        return root.appendingPathComponent(path)
    }

    public func size(of path: String) -> UInt64? {
        guard let url = try? url(for: path),
              let values = try? url.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey]),
              values.isRegularFile == true else { return nil }
        return UInt64(values.fileSize ?? 0)
    }

    public func read(_ path: String, isCancelled: () -> Bool, to sink: (Data) throws -> Void) throws {
        let url = try url(for: path)
        guard let handle = try? FileHandle(forReadingFrom: url) else { throw PackageError.missingFile(path) }
        defer { try? handle.close() }
        while true {
            if isCancelled() { throw PackageError.cancelled }
            let chunk = try autoreleasepool { try handle.read(upToCount: 1 << 20) }
            guard let chunk, !chunk.isEmpty else { break }
            try sink(chunk)
        }
    }
}

public final class ZipSource: PackageSource {
    public let displayName: String
    private let archive: ZipArchive
    private let entries: [String: ZipEntry]

    /// The package may sit at the top of the zip (as the CMS builds it) or in
    /// one folder inside (as when a package folder is compressed in Finder).
    public init(url: URL) throws {
        displayName = url.lastPathComponent
        archive = try ZipArchive(url: url)
        let manifests = archive.entries
            .map(\.name)
            .filter { !isJunk($0) && ($0 == manifestName || $0.hasSuffix("/" + manifestName)) }
            .sorted { $0.count < $1.count }
        guard let manifest = manifests.first else { throw PackageError.noManifest }
        let prefix = String(manifest.dropLast(manifestName.count))
        var entries: [String: ZipEntry] = [:]
        for entry in archive.entries where !entry.isDirectory && entry.name.hasPrefix(prefix) {
            entries[String(entry.name.dropFirst(prefix.count))] = entry
        }
        self.entries = entries
    }

    public func size(of path: String) -> UInt64? {
        guard isSafeRelativePath(path) else { return nil }
        return entries[path]?.uncompressedSize
    }

    public func read(_ path: String, isCancelled: () -> Bool, to sink: (Data) throws -> Void) throws {
        guard isSafeRelativePath(path) else { throw PackageError.invalidPath(path) }
        guard let entry = entries[path] else { throw PackageError.missingFile(path) }
        try archive.extract(entry, isCancelled: isCancelled, to: sink)
    }
}

/// Opens a picked or opened file or folder as a package.
public func openPackageSource(at url: URL) throws -> PackageSource {
    let isDirectory = (try? url.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) ?? false
    return isDirectory ? try FolderSource(url: url) : try ZipSource(url: url)
}
