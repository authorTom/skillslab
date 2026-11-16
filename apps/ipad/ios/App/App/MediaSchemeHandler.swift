import Foundation
import UniformTypeIdentifiers
import WebKit
import Capacitor

/// The app's root view controller: Capacitor's, plus a `skillslab-media://`
/// scheme for playing videos from the installed content package.
class AppViewController: CAPBridgeViewController {
    override func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let config = super.webViewConfiguration(for: instanceConfiguration)
        config.setURLSchemeHandler(MediaSchemeHandler(), forURLScheme: MediaSchemeHandler.scheme)
        return config
    }
}

/// Serves files under Documents/content to the web view's media player.
///
/// Capacitor's own handler answers a byte-range request by reading the whole
/// range into memory on the main thread. The player asks for "from here to
/// the end of the file" whenever it starts, seeks or enters full screen, so
/// with a large video the UI froze and playback stuttered or stalled. This
/// handler reads on a background queue and streams the range in small chunks,
/// and stops reading as soon as WebKit cancels the request (as it does on
/// every seek).
final class MediaSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "skillslab-media"

    private static let chunkSize = 512 * 1024
    private let queue = DispatchQueue(label: "uk.skillslab.media", qos: .userInitiated, attributes: .concurrent)
    /// Tasks WebKit has stopped. Only touched on the main thread.
    private var stopped = Set<ObjectIdentifier>()

    private lazy var root: URL = {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        return documents.appendingPathComponent("content", isDirectory: true).standardizedFileURL
    }()

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url, let file = resolve(url) else {
            task.didFailWithError(URLError(.fileDoesNotExist))
            return
        }
        let range = task.request.value(forHTTPHeaderField: "Range")
        let id = ObjectIdentifier(task)
        queue.async { [weak self] in
            self?.serve(task, id: id, file: file, url: url, rangeHeader: range)
        }
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {
        stopped.insert(ObjectIdentifier(task))
    }

    /// The file a URL names, as long as it is inside the content folder.
    private func resolve(_ url: URL) -> URL? {
        let relative = url.path.drop(while: { $0 == "/" })
        guard !relative.isEmpty else { return nil }
        let file = root.appendingPathComponent(String(relative)).standardizedFileURL
        guard file.path.hasPrefix(root.path + "/") else { return nil }
        return file
    }

    // MARK: - Background queue

    private func serve(_ task: WKURLSchemeTask, id: ObjectIdentifier, file: URL, url: URL, rangeHeader: String?) {
        guard let handle = try? FileHandle(forReadingFrom: file),
              let size = (try? file.resourceValues(forKeys: [.fileSizeKey]))?.fileSize else {
            finish(task, id: id, error: URLError(.fileDoesNotExist))
            return
        }
        defer { try? handle.close() }

        var headers = [
            "Content-Type": UTType(filenameExtension: file.pathExtension)?.preferredMIMEType ?? "application/octet-stream",
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-cache",
        ]
        let start: Int
        let end: Int
        let status: Int

        if let rangeHeader {
            guard let range = Self.parseRange(rangeHeader, size: size) else {
                headers["Content-Range"] = "bytes */\(size)"
                headers["Content-Length"] = "0"
                if respond(task, id: id, url: url, status: 416, headers: headers) {
                    finish(task, id: id, error: nil)
                }
                return
            }
            (start, end, status) = (range.lowerBound, range.upperBound, 206)
            headers["Content-Range"] = "bytes \(start)-\(end)/\(size)"
        } else {
            (start, end, status) = (0, size - 1, 200)
        }
        headers["Content-Length"] = String(max(end - start + 1, 0))

        guard respond(task, id: id, url: url, status: status, headers: headers) else { return }

        var offset = start
        do {
            try handle.seek(toOffset: UInt64(start))
            while offset <= end {
                let length = min(Self.chunkSize, end - offset + 1)
                let data = try autoreleasepool { try handle.read(upToCount: length) } ?? Data()
                if data.isEmpty { break }
                // Waiting for each chunk to be handed over keeps only one in
                // memory, and lets a stop end the read straight away.
                guard send(task, id: id, data: data) else { return }
                offset += data.count
            }
            finish(task, id: id, error: nil)
        } catch {
            finish(task, id: id, error: error)
        }
    }

    /// `bytes=a-b`, `bytes=a-` and `bytes=-n`, clamped to the file. Nil when
    /// the range can't be satisfied.
    static func parseRange(_ header: String, size: Int) -> ClosedRange<Int>? {
        guard size > 0, header.hasPrefix("bytes=") else { return nil }
        // Multiple ranges aren't used by media players; serve the first.
        let spec = header.dropFirst("bytes=".count).split(separator: ",").first ?? ""
        let parts = spec.split(separator: "-", maxSplits: 1, omittingEmptySubsequences: false)
            .map { $0.trimmingCharacters(in: .whitespaces) }
        guard parts.count == 2 else { return nil }

        if parts[0].isEmpty {
            guard let suffix = Int(parts[1]), suffix > 0 else { return nil }
            return max(size - suffix, 0)...(size - 1)
        }
        guard let start = Int(parts[0]), start >= 0, start < size else { return nil }
        let end = parts[1].isEmpty ? size - 1 : min(Int(parts[1]) ?? (size - 1), size - 1)
        guard end >= start else { return nil }
        return start...end
    }

    // MARK: - Calls into WebKit, on the main thread

    /// Each of these returns false once the task has been stopped. WebKit
    /// throws if a stopped task is called, so every call checks first.

    private func respond(_ task: WKURLSchemeTask, id: ObjectIdentifier, url: URL, status: Int, headers: [String: String]) -> Bool {
        onMain {
            guard !self.stopped.contains(id) else {
                self.stopped.remove(id)
                return false
            }
            let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!
            task.didReceive(response)
            return true
        }
    }

    private func send(_ task: WKURLSchemeTask, id: ObjectIdentifier, data: Data) -> Bool {
        onMain {
            guard !self.stopped.contains(id) else {
                self.stopped.remove(id)
                return false
            }
            task.didReceive(data)
            return true
        }
    }

    private func finish(_ task: WKURLSchemeTask, id: ObjectIdentifier, error: Error?) {
        onMain {
            guard self.stopped.remove(id) == nil else { return }
            if let error {
                task.didFailWithError(error)
            } else {
                task.didFinish()
            }
        }
    }

    private func onMain<T>(_ work: () -> T) -> T {
        Thread.isMainThread ? work() : DispatchQueue.main.sync(execute: work)
    }
}
