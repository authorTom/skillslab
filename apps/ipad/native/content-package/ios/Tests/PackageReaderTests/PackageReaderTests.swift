import Foundation
import XCTest
@testable import PackageReader

final class PackageReaderTests: XCTestCase {
    private var temp: URL!

    override func setUpWithError() throws {
        temp = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: temp, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: temp)
    }

    private func fixture(_ base64: String, name: String = "package.zip") throws -> URL {
        let data = try XCTUnwrap(Data(base64Encoded: base64, options: .ignoreUnknownCharacters))
        let url = temp.appendingPathComponent(name)
        try data.write(to: url)
        return url
    }

    private var specs: [PackageFileSpec] {
        [
            PackageFileSpec(path: "catalogue.sqlite", bytes: Fixtures.catalogueBytes, sha256: Fixtures.catalogueSHA),
            PackageFileSpec(path: Fixtures.assetPath, bytes: Fixtures.assetBytes, sha256: Fixtures.assetSHA)
        ]
    }

    private func assertInstalls(_ base64: String, file: StaticString = #filePath, line: UInt = #line) throws {
        let source = try openPackageSource(at: try fixture(base64))
        let manifest = try JSONSerialization.jsonObject(with: try source.readAll("manifest.json")) as? [String: Any]
        XCTAssertEqual(manifest?["release_id"] as? String, "fixture", file: file, line: line)
        XCTAssertEqual(source.size(of: Fixtures.assetPath), Fixtures.assetBytes, file: file, line: line)

        let destination = temp.appendingPathComponent("staging")
        var last: InstallProgress?
        try PackageInstaller.install(from: source, files: specs, into: destination) { last = $0 }
        XCTAssertEqual(last?.bytesDone, Fixtures.catalogueBytes + Fixtures.assetBytes, file: file, line: line)
        XCTAssertEqual(last?.filesDone, 2, file: file, line: line)

        let problems = try PackageInstaller.verify(files: specs, in: destination, checkHashes: true)
        XCTAssertTrue(problems.isEmpty, "\(problems)", file: file, line: line)
    }

    func testInstallsFromTheCMSPackage() throws {
        try assertInstalls(Fixtures.stored)
    }

    func testInstallsFromAZip64Package() throws {
        try assertInstalls(Fixtures.zip64)
    }

    func testInstallsFromAFolderCompressedInFinder() throws {
        try assertInstalls(Fixtures.finder)
    }

    func testInstallsFromAnInfoZipArchive() throws {
        try assertInstalls(Fixtures.infozip)
    }

    func testInstallsFromAFolder() throws {
        // The user may pick the folder above the package, such as a USB drive.
        let drive = temp.appendingPathComponent("drive")
        let package = drive.appendingPathComponent("skillslab-v1.0")
        let zipSource = try ZipSource(url: try fixture(Fixtures.stored))
        try PackageInstaller.install(
            from: zipSource,
            files: specs + [PackageFileSpec(path: "manifest.json", bytes: zipSource.size(of: "manifest.json")!, sha256: nil)],
            into: package)

        let source = try openPackageSource(at: drive)
        XCTAssertTrue(source is FolderSource)
        try PackageInstaller.install(from: source, files: specs, into: temp.appendingPathComponent("staging"))
    }

    func testRejectsATruncatedFile() {
        XCTAssertThrowsError(try openPackageSource(at: try fixture(Fixtures.truncated))) { error in
            XCTAssertEqual(error as? PackageError, .notAPackage)
        }
    }

    func testRejectsAFolderWithoutAPackage() throws {
        let empty = temp.appendingPathComponent("empty")
        try FileManager.default.createDirectory(at: empty, withIntermediateDirectories: true)
        XCTAssertThrowsError(try openPackageSource(at: empty)) { error in
            XCTAssertEqual(error as? PackageError, .noManifest)
        }
    }

    func testLeavesNothingBehindWhenAFileIsDamaged() throws {
        let source = try openPackageSource(at: try fixture(Fixtures.stored))
        let destination = temp.appendingPathComponent("staging")
        let wrong = PackageFileSpec(path: Fixtures.assetPath, bytes: Fixtures.assetBytes, sha256: String(repeating: "0", count: 64))
        XCTAssertThrowsError(try PackageInstaller.install(from: source, files: [wrong], into: destination)) { error in
            XCTAssertEqual(error as? PackageError, .damagedFile(Fixtures.assetPath))
        }
        let left = FileManager.default.enumerator(atPath: destination.path)?.allObjects as? [String] ?? []
        XCTAssertEqual(left.filter { !$0.hasSuffix("assets") }, [])
    }

    func testChecksEveryFileIsThereBeforeCopying() throws {
        let source = try openPackageSource(at: try fixture(Fixtures.stored))
        let destination = temp.appendingPathComponent("staging")
        let missing = PackageFileSpec(path: "assets/missing.mp4", bytes: 10, sha256: nil)
        XCTAssertThrowsError(try PackageInstaller.install(from: source, files: specs + [missing], into: destination)) { error in
            XCTAssertEqual(error as? PackageError, .missingFile("assets/missing.mp4"))
        }
        XCTAssertFalse(FileManager.default.fileExists(atPath: destination.appendingPathComponent("catalogue.sqlite").path))
    }

    func testRefusesPathsOutsideThePackage() throws {
        let source = try openPackageSource(at: try fixture(Fixtures.stored))
        let escape = PackageFileSpec(path: "../outside", bytes: 1, sha256: nil)
        XCTAssertThrowsError(try PackageInstaller.install(from: source, files: [escape], into: temp)) { error in
            XCTAssertEqual(error as? PackageError, .invalidPath("../outside"))
        }
        XCTAssertFalse(isSafeRelativePath("/etc/passwd"))
        XCTAssertFalse(isSafeRelativePath("assets/../../x"))
        XCTAssertFalse(isSafeRelativePath("assets//x"))
        XCTAssertFalse(isSafeRelativePath(""))
        XCTAssertTrue(isSafeRelativePath(Fixtures.assetPath))
    }

    func testStopsWhenCancelled() throws {
        let source = try openPackageSource(at: try fixture(Fixtures.stored))
        XCTAssertThrowsError(try PackageInstaller.install(
            from: source, files: specs, into: temp.appendingPathComponent("staging"), isCancelled: { true })) { error in
            XCTAssertEqual(error as? PackageError, .cancelled)
        }
    }

    func testVerifyFindsMissingResizedAndDamagedFiles() throws {
        let source = try openPackageSource(at: try fixture(Fixtures.stored))
        let content = temp.appendingPathComponent("content")
        try PackageInstaller.install(from: source, files: specs, into: content)

        let asset = content.appendingPathComponent(Fixtures.assetPath)
        var bytes = try Data(contentsOf: asset)
        bytes[0] ^= 0xFF
        try bytes.write(to: asset)
        try Data("short".utf8).write(to: content.appendingPathComponent("catalogue.sqlite"))
        let gone = PackageFileSpec(path: "assets/gone.jpg", bytes: 5, sha256: nil)

        let problems = try PackageInstaller.verify(files: specs + [gone], in: content, checkHashes: true)
        XCTAssertEqual(problems.map(\.path), ["catalogue.sqlite", Fixtures.assetPath, "assets/gone.jpg"])
        XCTAssertEqual(problems.map(\.problem), [.wrongSize, .damaged, .missing])

        // A size-only check is quick and doesn't notice the flipped byte.
        let quick = try PackageInstaller.verify(files: specs, in: content, checkHashes: false)
        XCTAssertEqual(quick.map(\.problem), [.wrongSize])
    }
}
