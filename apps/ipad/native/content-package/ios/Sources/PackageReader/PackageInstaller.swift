import CryptoKit
import Foundation

/// A file the manifest promises: its path in the package, size and SHA-256.
public struct PackageFileSpec: Equatable {
    public let path: String
    public let bytes: UInt64
    public let sha256: String?

    public init(path: String, bytes: UInt64, sha256: String?) {
        self.path = path
        self.bytes = bytes
        self.sha256 = sha256?.lowercased()
    }
}

public struct InstallProgress: Equatable {
    public var bytesDone: UInt64
    public let bytesTotal: UInt64
    public var filesDone: Int
    public let filesTotal: Int
}

public enum FileProblem: String {
    case missing
    case wrongSize = "size"
    case damaged
}

private func hex(_ digest: SHA256.Digest) -> String {
    digest.map { String(format: "%02x", $0) }.joined()
}

/// Free space for files the user asked for, on the volume holding `url`.
public func availableSpace(at url: URL) -> UInt64? {
    let values = try? url.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
    return values?.volumeAvailableCapacityForImportantUsage.map { UInt64(max(0, $0)) }
}

public enum PackageInstaller {
    /// Room left over after an install, so the iPad isn't filled to the brim.
    public static let spaceMargin: UInt64 = 200 * 1024 * 1024

    /// Copy `files` from `source` into `destination`, checking each one's
    /// size and SHA-256 as it is written. Nothing is copied unless every
    /// file is present at the expected size and there is room for them all.
    /// Each file is written beside its final name and moved into place only
    /// once verified, so a failure never leaves a bad file behind.
    public static func install(
        from source: PackageSource,
        files: [PackageFileSpec],
        into destination: URL,
        isCancelled: () -> Bool = { false },
        progress: (InstallProgress) -> Void = { _ in }
    ) throws {
        var seen = Set<String>()
        let files = files.filter { seen.insert($0.path).inserted }

        for file in files {
            guard isSafeRelativePath(file.path) else { throw PackageError.invalidPath(file.path) }
            guard let size = source.size(of: file.path) else { throw PackageError.missingFile(file.path) }
            guard size == file.bytes else { throw PackageError.incomplete(file.path) }
        }

        let total = files.reduce(UInt64(0)) { $0 + $1.bytes }
        let fm = FileManager.default
        try fm.createDirectory(at: destination, withIntermediateDirectories: true)
        if let free = availableSpace(at: destination), free < total + spaceMargin {
            throw PackageError.notEnoughSpace
        }

        var state = InstallProgress(bytesDone: 0, bytesTotal: total, filesDone: 0, filesTotal: files.count)
        progress(state)

        for file in files {
            let target = destination.appendingPathComponent(file.path)
            let partial = target.appendingPathExtension("partial")
            try fm.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
            try? fm.removeItem(at: partial)
            guard fm.createFile(atPath: partial.path, contents: nil),
                  let out = try? FileHandle(forWritingTo: partial) else {
                throw CocoaError(.fileWriteUnknown)
            }

            var hasher = SHA256()
            var written: UInt64 = 0
            do {
                try source.read(file.path, isCancelled: isCancelled) { data in
                    written += UInt64(data.count)
                    guard written <= file.bytes else { throw PackageError.incomplete(file.path) }
                    try out.write(contentsOf: data)
                    hasher.update(data: data)
                    state.bytesDone += UInt64(data.count)
                    progress(state)
                }
                try out.close()
                guard written == file.bytes else { throw PackageError.incomplete(file.path) }
                if let expected = file.sha256, hex(hasher.finalize()) != expected {
                    throw PackageError.damagedFile(file.path)
                }
                if fm.fileExists(atPath: target.path) { try fm.removeItem(at: target) }
                try fm.moveItem(at: partial, to: target)
            } catch {
                try? out.close()
                try? fm.removeItem(at: partial)
                throw error
            }
            state.filesDone += 1
            progress(state)
        }
    }

    /// Check installed files against their expected size (unless
    /// `checkSizes` is off, when the sizes on record can't be trusted) and,
    /// when `checkHashes` is set, their SHA-256. Returns each problem found.
    public static func verify(
        files: [PackageFileSpec],
        in directory: URL,
        checkHashes: Bool,
        checkSizes: Bool = true,
        isCancelled: () -> Bool = { false },
        progress: (InstallProgress) -> Void = { _ in }
    ) throws -> [(path: String, problem: FileProblem)] {
        let total = checkHashes ? files.reduce(UInt64(0)) { $0 + $1.bytes } : 0
        var state = InstallProgress(bytesDone: 0, bytesTotal: total, filesDone: 0, filesTotal: files.count)
        var problems: [(path: String, problem: FileProblem)] = []
        var finishedBytes: UInt64 = 0

        for file in files {
            if isCancelled() { throw PackageError.cancelled }
            defer {
                if checkHashes { finishedBytes += file.bytes }
                state.bytesDone = finishedBytes
                state.filesDone += 1
                progress(state)
            }
            guard isSafeRelativePath(file.path) else {
                problems.append((file.path, .missing))
                continue
            }
            let url = directory.appendingPathComponent(file.path)
            guard let size = (try? url.resourceValues(forKeys: [.fileSizeKey]))?.fileSize else {
                problems.append((file.path, .missing))
                continue
            }
            guard !checkSizes || UInt64(size) == file.bytes else {
                problems.append((file.path, .wrongSize))
                continue
            }
            guard checkHashes, let expected = file.sha256 else { continue }

            guard let handle = try? FileHandle(forReadingFrom: url) else {
                problems.append((file.path, .missing))
                continue
            }
            var hasher = SHA256()
            while true {
                if isCancelled() {
                    try? handle.close()
                    throw PackageError.cancelled
                }
                let chunk = try autoreleasepool { try handle.read(upToCount: 1 << 20) }
                guard let chunk, !chunk.isEmpty else { break }
                hasher.update(data: chunk)
                state.bytesDone += UInt64(chunk.count)
                progress(state)
            }
            try? handle.close()
            state.bytesDone = finishedBytes
            if hex(hasher.finalize()) != expected {
                problems.append((file.path, .damaged))
            }
        }
        return problems
    }
}
