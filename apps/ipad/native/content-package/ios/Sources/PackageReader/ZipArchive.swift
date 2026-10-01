import Compression
import Foundation

/// One file in a zip, from its central directory record.
public struct ZipEntry {
    public let name: String
    let flags: UInt16
    let method: UInt16
    public let compressedSize: UInt64
    public let uncompressedSize: UInt64
    let localHeaderOffset: UInt64

    public var isDirectory: Bool { name.hasSuffix("/") }
}

/// A read-only zip reader that streams entries straight from disk, so a
/// multi-gigabyte package never has to fit in memory.
///
/// It reads the central directory (so entries written with data descriptors,
/// as Finder's Compress does, are fine), supports ZIP64, and extracts stored
/// and deflated entries. That covers packages from the CMS (stored) and
/// folders zipped by hand on a Mac or PC (deflated).
public final class ZipArchive {
    public let entries: [ZipEntry]
    private let handle: FileHandle
    private let fileSize: UInt64

    public init(url: URL) throws {
        handle = try FileHandle(forReadingFrom: url)
        do {
            fileSize = try handle.seekToEnd()
            entries = try ZipArchive.readCentralDirectory(handle, fileSize: fileSize)
        } catch {
            try? handle.close()
            throw error
        }
    }

    deinit {
        try? handle.close()
    }

    private static func readCentralDirectory(_ handle: FileHandle, fileSize: UInt64) throws -> [ZipEntry] {
        // The end record is 22 bytes plus a comment of up to 64 KB, and a
        // ZIP64 locator sits in the 20 bytes before it.
        let tailLength = min(fileSize, 22 + 65_535 + 20)
        guard tailLength >= 22 else { throw PackageError.notAPackage }
        try handle.seek(toOffset: fileSize - tailLength)
        let tail = try handle.readExactly(Int(tailLength))

        var end: Int?
        var i = tail.count - 22
        while i >= 0 {
            if tail.u32(i) == 0x0605_4b50 {
                end = i
                break
            }
            i -= 1
        }
        guard let eocd = end else { throw PackageError.notAPackage }

        var count = UInt64(tail.u16(eocd + 10))
        var cdSize = UInt64(tail.u32(eocd + 12))
        var cdOffset = UInt64(tail.u32(eocd + 16))

        if eocd >= 20, tail.u32(eocd - 20) == 0x0706_4b50 {
            let recordOffset = tail.u64(eocd - 20 + 8)
            guard recordOffset + 56 <= fileSize else { throw PackageError.damagedArchive }
            try handle.seek(toOffset: recordOffset)
            let record = try handle.readExactly(56)
            guard record.u32(0) == 0x0606_4b50 else { throw PackageError.damagedArchive }
            count = record.u64(32)
            cdSize = record.u64(40)
            cdOffset = record.u64(48)
        }

        guard cdOffset + cdSize <= fileSize, cdSize < 256 * 1024 * 1024 else { throw PackageError.damagedArchive }
        try handle.seek(toOffset: cdOffset)
        let cd = try handle.readExactly(Int(cdSize))

        var entries: [ZipEntry] = []
        entries.reserveCapacity(Int(min(count, 100_000)))
        var p = 0
        for _ in 0..<count {
            guard p + 46 <= cd.count, cd.u32(p) == 0x0201_4b50 else { throw PackageError.damagedArchive }
            let flags = cd.u16(p + 8)
            let method = cd.u16(p + 10)
            var compressed = UInt64(cd.u32(p + 20))
            var uncompressed = UInt64(cd.u32(p + 24))
            let nameLength = Int(cd.u16(p + 28))
            let extraLength = Int(cd.u16(p + 30))
            let commentLength = Int(cd.u16(p + 32))
            var offset = UInt64(cd.u32(p + 42))
            let nameStart = p + 46
            guard nameStart + nameLength + extraLength <= cd.count else { throw PackageError.damagedArchive }

            let nameData = cd.subdata(in: cd.startIndex + nameStart ..< cd.startIndex + nameStart + nameLength)
            let name = String(data: nameData, encoding: .utf8) ?? String(decoding: nameData, as: UTF8.self)

            // ZIP64 extended information: only the fields whose 32-bit value
            // is 0xFFFFFFFF are present, in this order.
            var e = nameStart + nameLength
            let extraEnd = e + extraLength
            while e + 4 <= extraEnd {
                let id = cd.u16(e)
                let size = Int(cd.u16(e + 2))
                var q = e + 4
                if id == 0x0001 {
                    if uncompressed == 0xFFFF_FFFF, q + 8 <= e + 4 + size { uncompressed = cd.u64(q); q += 8 }
                    if compressed == 0xFFFF_FFFF, q + 8 <= e + 4 + size { compressed = cd.u64(q); q += 8 }
                    if offset == 0xFFFF_FFFF, q + 8 <= e + 4 + size { offset = cd.u64(q); q += 8 }
                }
                e += 4 + size
            }

            entries.append(ZipEntry(
                name: name,
                flags: flags,
                method: method,
                compressedSize: compressed,
                uncompressedSize: uncompressed,
                localHeaderOffset: offset))
            p = nameStart + nameLength + extraLength + commentLength
        }
        return entries
    }

    /// Stream an entry's uncompressed bytes to `sink`, in chunks.
    public func extract(_ entry: ZipEntry, chunkSize: Int = 1 << 20, isCancelled: () -> Bool = { false },
                        to sink: (Data) throws -> Void) throws {
        if entry.flags & 0x1 != 0 { throw PackageError.encrypted(entry.name) }
        guard entry.method == 0 || entry.method == 8 else { throw PackageError.unsupportedCompression(entry.name) }

        guard entry.localHeaderOffset + 30 <= fileSize else { throw PackageError.damagedArchive }
        try handle.seek(toOffset: entry.localHeaderOffset)
        let local = try handle.readExactly(30)
        guard local.u32(0) == 0x0403_4b50 else { throw PackageError.damagedArchive }
        let dataStart = entry.localHeaderOffset + 30 + UInt64(local.u16(26)) + UInt64(local.u16(28))
        guard dataStart + entry.compressedSize <= fileSize else { throw PackageError.damagedArchive }
        try handle.seek(toOffset: dataStart)

        var remaining = entry.compressedSize
        if entry.method == 0 {
            while remaining > 0 {
                if isCancelled() { throw PackageError.cancelled }
                let data = try autoreleasepool { try handle.readExactly(Int(min(UInt64(chunkSize), remaining))) }
                try sink(data)
                remaining -= UInt64(data.count)
            }
            return
        }

        // Zip's deflate is raw DEFLATE, which is what Compression calls zlib.
        // The filter is finished before this returns, so `sink` never
        // outlives the call.
        try withoutActuallyEscaping(sink) { sink in
            var sinkError: Error?
            let filter = try OutputFilter(.decompress, using: .zlib, bufferCapacity: chunkSize) { data in
                guard let data, sinkError == nil else { return }
                do { try sink(data) } catch { sinkError = error }
            }
            while remaining > 0 {
                if isCancelled() { throw PackageError.cancelled }
                let data = try autoreleasepool { try handle.readExactly(Int(min(UInt64(chunkSize), remaining))) }
                try filter.write(data)
                if let sinkError { throw sinkError }
                remaining -= UInt64(data.count)
            }
            try filter.finalize()
            if let sinkError { throw sinkError }
        }
    }
}

extension FileHandle {
    /// Read exactly `count` bytes, or throw: a short read means a truncated
    /// file (or a USB drive pulled out mid-copy).
    func readExactly(_ count: Int) throws -> Data {
        var data = Data()
        data.reserveCapacity(count)
        while data.count < count {
            guard let chunk = try read(upToCount: count - data.count), !chunk.isEmpty else {
                throw PackageError.truncated
            }
            data.append(chunk)
        }
        return data
    }
}

extension Data {
    func u16(_ offset: Int) -> UInt16 {
        let i = startIndex + offset
        return UInt16(self[i]) | UInt16(self[i + 1]) << 8
    }

    func u32(_ offset: Int) -> UInt32 {
        let i = startIndex + offset
        return UInt32(self[i]) | UInt32(self[i + 1]) << 8 | UInt32(self[i + 2]) << 16 | UInt32(self[i + 3]) << 24
    }

    func u64(_ offset: Int) -> UInt64 {
        UInt64(u32(offset)) | UInt64(u32(offset + 4)) << 32
    }
}
