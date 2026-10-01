import Capacitor
import Foundation
import PackageReader
import UIKit
import UniformTypeIdentifiers

/// An opened package and how to let go of it.
private final class OpenPackage {
    let source: PackageSource
    let url: URL
    let accessingScope: Bool
    /// A copy the system made for us (AirDrop, "Open in"), to delete once
    /// installed or dismissed. Never the user's own file.
    let ownedCopy: Bool

    init(source: PackageSource, url: URL, accessingScope: Bool, ownedCopy: Bool) {
        self.source = source
        self.url = url
        self.accessingScope = accessingScope
        self.ownedCopy = ownedCopy
    }

    func close() {
        if accessingScope { url.stopAccessingSecurityScopedResource() }
        if ownedCopy { try? FileManager.default.removeItem(at: url) }
    }
}

/// Installs content packages from files: the system file picker (USB drives,
/// Files, iCloud, network shares), files opened from AirDrop or another app,
/// and the app's own import folder. Copies stream to disk with every file's
/// size and SHA-256 checked against the manifest.
@objc(ContentPackagePlugin)
public class ContentPackagePlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate,
                                   UIAdaptivePresentationControllerDelegate {
    public let identifier = "ContentPackagePlugin"
    public let jsName = "ContentPackage"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "choose", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openInDocuments", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takeOpenedPackage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "install", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "verify", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "close", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "freeSpace", returnType: CAPPluginReturnPromise)
    ]

    private static let packageType = UTType("uk.skillslab.content-package")

    private let work = DispatchQueue(label: "uk.skillslab.content-package", qos: .userInitiated)
    private let lock = NSLock()
    private var packages: [String: OpenPackage] = [:]
    private var openedPackage: [String: Any]?
    private var cancelRequested = false
    private var pickCall: CAPPluginCall?

    private var documents: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    }

    override public func load() {
        NotificationCenter.default.addObserver(
            self, selector: #selector(handleOpenURL(_:)), name: .capacitorOpenURL, object: nil)
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    // MARK: Opening packages

    /// Open `url` as a package and describe it for the app, keeping it open
    /// until `close` (or another package replaces it).
    private func open(_ url: URL) throws -> [String: Any] {
        let accessing = url.startAccessingSecurityScopedResource()
        do {
            // For iCloud files, coordinated reading downloads them first.
            var coordinationError: NSError?
            var opened: PackageSource?
            var openError: Error?
            NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &coordinationError) { readURL in
                do { opened = try openPackageSource(at: readURL) } catch { openError = error }
            }
            if let openError { throw openError }
            if let coordinationError { throw coordinationError }
            guard let source = opened else { throw PackageError.notAPackage }

            let manifest = try source.readAll("manifest.json")
            guard let text = String(data: manifest, encoding: .utf8) else { throw PackageError.notAPackage }

            let id = UUID().uuidString
            lock.lock()
            packages[id] = OpenPackage(source: source, url: url, accessingScope: accessing, ownedCopy: isSystemCopy(url))
            lock.unlock()
            return ["id": id, "name": source.displayName, "manifest": text]
        } catch {
            if accessing { url.stopAccessingSecurityScopedResource() }
            throw error
        }
    }

    /// Files sent by AirDrop or "Open in" are copied into the app's
    /// Documents/Inbox or its temporary folder.
    private func isSystemCopy(_ url: URL) -> Bool {
        let path = url.standardizedFileURL.resolvingSymlinksInPath().path
        let inbox = documents.appendingPathComponent("Inbox").standardizedFileURL.resolvingSymlinksInPath().path
        let temp = FileManager.default.temporaryDirectory.standardizedFileURL.resolvingSymlinksInPath().path
        return path.hasPrefix(inbox + "/") || path.hasPrefix(temp + "/")
    }

    private func package(_ call: CAPPluginCall) -> OpenPackage? {
        guard let id = call.getString("id") else {
            call.reject("Missing package id")
            return nil
        }
        lock.lock()
        defer { lock.unlock() }
        guard let package = packages[id] else {
            call.reject("That package is no longer open. Choose it again.")
            return nil
        }
        return package
    }

    @objc func choose(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let presenter = self.bridge?.viewController, presenter.presentedViewController == nil else {
                call.reject("The file picker is already open.")
                return
            }
            // A call left over from a picker that went away unanswered.
            self.pickCall?.resolve(["cancelled": true])
            let types = [UTType.folder, UTType.zip, ContentPackagePlugin.packageType].compactMap { $0 }
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: types, asCopy: false)
            picker.delegate = self
            picker.allowsMultipleSelection = false
            picker.shouldShowFileExtensions = true
            self.pickCall = call
            presenter.present(picker, animated: true)
            picker.presentationController?.delegate = self
        }
    }

    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let call = pickCall, let url = urls.first else { return }
        pickCall = nil
        work.async {
            do {
                call.resolve(try self.open(url))
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        pickCall?.resolve(["cancelled": true])
        pickCall = nil
    }

    /// Swiping the picker's sheet away.
    public func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        pickCall?.resolve(["cancelled": true])
        pickCall = nil
    }

    /// Open a package folder already in Documents (the import folder).
    @objc func openInDocuments(_ call: CAPPluginCall) {
        guard let path = call.getString("path"), isSafeRelativePath(path) else {
            call.reject("Invalid path")
            return
        }
        let url = documents.appendingPathComponent(path)
        work.async {
            do {
                call.resolve(try self.open(url))
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    /// A package sent by AirDrop or opened from another app (Files' "Open
    /// in SkillsLab"). Kept until the app takes it, since it may arrive
    /// before the web view is listening.
    @objc func handleOpenURL(_ notification: Notification) {
        let object = notification.object as? [String: Any]
        guard let url = (object?["url"] as? URL) ?? (notification.object as? URL), url.isFileURL else { return }
        work.async {
            var info: [String: Any]
            do {
                info = try self.open(url)
            } catch {
                info = ["error": error.localizedDescription, "name": url.lastPathComponent]
            }
            self.lock.lock()
            if let previous = self.openedPackage?["id"] as? String {
                self.packages.removeValue(forKey: previous)?.close()
            }
            self.openedPackage = info
            self.lock.unlock()
            // Retained so a cold launch from AirDrop still reaches the app
            // once its listener is attached.
            self.notifyListeners("packageOpened", data: info, retainUntilConsumed: true)
        }
    }

    @objc func takeOpenedPackage(_ call: CAPPluginCall) {
        lock.lock()
        let info = openedPackage
        openedPackage = nil
        lock.unlock()
        call.resolve(info.map { ["package": $0] } ?? [:])
    }

    // MARK: Installing and checking

    private func fileSpecs(_ call: CAPPluginCall) -> [PackageFileSpec]? {
        guard let raw = call.getArray("files", JSObject.self) else {
            call.reject("Missing files")
            return nil
        }
        var specs: [PackageFileSpec] = []
        for item in raw {
            guard let path = item["path"] as? String, let bytes = (item["bytes"] as? NSNumber)?.uint64Value else {
                call.reject("Invalid file entry")
                return nil
            }
            specs.append(PackageFileSpec(path: path, bytes: bytes, sha256: item["sha256"] as? String))
        }
        return specs
    }

    private func directory(_ call: CAPPluginCall) -> URL? {
        guard let path = call.getString("directory"), isSafeRelativePath(path) else {
            call.reject("Invalid directory")
            return nil
        }
        return documents.appendingPathComponent(path)
    }

    private var isCancelled: Bool {
        lock.lock()
        defer { lock.unlock() }
        return cancelRequested
    }

    private func resetCancel() {
        lock.lock()
        cancelRequested = false
        lock.unlock()
    }

    /// Progress events, at most ten a second plus the final one.
    private func throttled(_ event: String) -> (InstallProgress) -> Void {
        var last = Date.distantPast
        return { [weak self] p in
            let now = Date()
            let finished = p.filesDone == p.filesTotal
            guard finished || now.timeIntervalSince(last) >= 0.1 else { return }
            last = now
            self?.notifyListeners(event, data: [
                "bytesDone": p.bytesDone, "bytesTotal": p.bytesTotal,
                "filesDone": p.filesDone, "filesTotal": p.filesTotal
            ])
        }
    }

    /// Copy files from an open package into a folder in Documents.
    @objc func install(_ call: CAPPluginCall) {
        guard let package = package(call), let files = fileSpecs(call), let destination = directory(call) else { return }
        resetCancel()
        work.async {
            do {
                try PackageInstaller.install(
                    from: package.source, files: files, into: destination,
                    isCancelled: { self.isCancelled }, progress: self.throttled("installProgress"))
                call.resolve()
            } catch PackageError.cancelled {
                call.reject("Cancelled", "CANCELLED")
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    /// Check files in a folder in Documents against their sizes and hashes.
    @objc func verify(_ call: CAPPluginCall) {
        guard let files = fileSpecs(call), let directory = directory(call) else { return }
        let checkHashes = call.getBool("checkHashes") ?? true
        let checkSizes = call.getBool("checkSizes") ?? true
        resetCancel()
        work.async {
            do {
                let problems = try PackageInstaller.verify(
                    files: files, in: directory, checkHashes: checkHashes, checkSizes: checkSizes,
                    isCancelled: { self.isCancelled }, progress: self.throttled("verifyProgress"))
                call.resolve(["problems": problems.map { ["path": $0.path, "problem": $0.problem.rawValue] }])
            } catch PackageError.cancelled {
                call.reject("Cancelled", "CANCELLED")
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        lock.lock()
        cancelRequested = true
        lock.unlock()
        call.resolve()
    }

    @objc func close(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else {
            call.resolve()
            return
        }
        lock.lock()
        let package = packages.removeValue(forKey: id)
        lock.unlock()
        // Wait for any copy still reading from it.
        work.async {
            package?.close()
            call.resolve()
        }
    }

    @objc func freeSpace(_ call: CAPPluginCall) {
        call.resolve(["bytes": availableSpace(at: documents) ?? 0])
    }
}
