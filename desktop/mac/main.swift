// Splat Darkroom — native macOS shell.
// A thin WKWebView host: the UI lives in ~/Documents/Splat/app (so it can be updated
// without rebuilding), served through the darkroom:// scheme. Native side provides:
//   • darkroom://app/<path>            app files (html, luts, ...)
//   • darkroom://file/?path=<abs>      raw bytes of a user file (ply, splat, jpeg …)
//   • darkroom://decode/?path=<abs>&max=<px>
//        CoreImage decode → linear Rec.709 float16 RGBA (RAW/ProRAW via CIRAWFilter with
//        tone curve + local tone mapping off; HEIC/JPEG with HDR gain map expanded)
//   • message handler "native": open/save panels, library state, run scan pipeline.
import Cocoa
import WebKit
import CoreImage
import UniformTypeIdentifiers
import ImageIO
import AVFoundation

let home = FileManager.default.homeDirectoryForCurrentUser
let splatDir: URL = {
    if let p = ProcessInfo.processInfo.environment["SPLAT_HOME"] { return URL(fileURLWithPath: p) }
    return home.appendingPathComponent("Documents/Splat")
}()
let appDir = splatDir.appendingPathComponent("app")

// MARK: - Scheme handler -------------------------------------------------------------------

final class SchemeHandler: NSObject, WKURLSchemeHandler {
    private var stopped = Set<ObjectIdentifier>()
    private let lock = NSLock()
    private let ciContext = CIContext(options: [
        .workingColorSpace: CGColorSpace(name: CGColorSpace.extendedLinearSRGB)!,
        .cacheIntermediates: false,
    ])

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        DispatchQueue.global(qos: .userInitiated).async {
            let result: Result<(Data, String), Error>
            do { result = .success(try self.handle(url)) } catch { result = .failure(error) }
            DispatchQueue.main.async {
                self.lock.lock(); let gone = self.stopped.contains(ObjectIdentifier(task)); self.lock.unlock()
                if gone { return }
                switch result {
                case .success(let (data, mime)):
                    let resp = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1",
                        headerFields: ["Content-Type": mime, "Content-Length": "\(data.count)",
                                       "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store"])!
                    task.didReceive(resp); task.didReceive(data); task.didFinish()
                case .failure(let err):
                    let msg = Data(("error: " + err.localizedDescription).utf8)
                    let resp = HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1",
                        headerFields: ["Content-Type": "text/plain", "Access-Control-Allow-Origin": "*"])!
                    task.didReceive(resp); task.didReceive(msg); task.didFinish()
                }
            }
        }
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {
        lock.lock(); stopped.insert(ObjectIdentifier(task)); lock.unlock()
    }

    private func query(_ url: URL, _ name: String) -> String? {
        URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == name }?.value
    }

    private func handle(_ url: URL) throws -> (Data, String) {
        switch url.host ?? "" {
        case "app":
            var rel = url.path; if rel.hasPrefix("/") { rel.removeFirst() }
            if rel.isEmpty { rel = "index.html" }
            let f = appDir.appendingPathComponent(rel).standardizedFileURL
            guard f.path.hasPrefix(appDir.standardizedFileURL.path) else { throw err("bad path") }
            return (try Data(contentsOf: f), mime(f.pathExtension))
        case "file":
            guard let p = query(url, "path") else { throw err("no path") }
            let f = URL(fileURLWithPath: p)
            return (try Data(contentsOf: f), mime(f.pathExtension))
        case "decode":
            guard let p = query(url, "path") else { throw err("no path") }
            let maxDim = Int(query(url, "max") ?? "0") ?? 0
            return (try decode(path: p, maxDim: maxDim), "application/octet-stream")
        default:
            throw err("unknown host")
        }
    }

    private func err(_ s: String) -> NSError { NSError(domain: "darkroom", code: 1, userInfo: [NSLocalizedDescriptionKey: s]) }

    private func mime(_ ext: String) -> String {
        switch ext.lowercased() {
        case "html": return "text/html; charset=utf-8"
        case "js": return "text/javascript"
        case "css": return "text/css"
        case "json": return "application/json"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "svg": return "image/svg+xml"
        default: return "application/octet-stream"
        }
    }

    static let rawExts: Set<String> = ["dng","cr2","cr3","nef","nrw","arw","raf","orf","rw2","pef","srw","3fr","iiq","erf","rwl"]

    private func decode(path: String, maxDim: Int) throws -> Data {
        let u = URL(fileURLWithPath: path)
        var image: CIImage?
        var isRaw = false
        if SchemeHandler.rawExts.contains(u.pathExtension.lowercased()), let raw = CIRAWFilter(imageURL: u) {
            // scene-referred-ish: no tone curve boost, no local tone mapping (Smart HDR / ProRAW)
            raw.boostAmount = 0
            if raw.isLocalToneMapSupported { raw.localToneMapAmount = 0 }
            raw.extendedDynamicRangeAmount = 1
            image = raw.outputImage
            isRaw = true
        }
        if image == nil {
            var opts: [CIImageOption: Any] = [.applyOrientationProperty: true]
            if #available(macOS 14.0, *) { opts[.expandToHDR] = true }
            image = CIImage(contentsOf: u, options: opts)
        }
        guard var img = image else { throw err("could not decode \(u.lastPathComponent)") }
        img = img.transformed(by: CGAffineTransform(translationX: -img.extent.origin.x, y: -img.extent.origin.y))
        let w0 = img.extent.width, h0 = img.extent.height
        if maxDim > 0 && max(w0, h0) > CGFloat(maxDim) {
            let s = CGFloat(maxDim) / max(w0, h0)
            let f = CIFilter(name: "CILanczosScaleTransform")!
            f.setValue(img, forKey: kCIInputImageKey)
            f.setValue(s, forKey: kCIInputScaleKey)
            f.setValue(1.0, forKey: kCIInputAspectRatioKey)
            img = f.outputImage!
            img = img.transformed(by: CGAffineTransform(translationX: -img.extent.origin.x, y: -img.extent.origin.y))
        }
        let w = Int(img.extent.width.rounded(.down)), h = Int(img.extent.height.rounded(.down))
        guard w > 0, h > 0 else { throw err("empty image") }
        let rowBytes = w * 8
        var out = Data(count: 16 + rowBytes * h)
        out.withUnsafeMutableBytes { (p: UnsafeMutableRawBufferPointer) in
            let base = p.baseAddress!
            base.storeBytes(of: UInt32(0x31465244).littleEndian, as: UInt32.self)          // "DRF1"
            base.storeBytes(of: UInt32(w).littleEndian, toByteOffset: 4, as: UInt32.self)
            base.storeBytes(of: UInt32(h).littleEndian, toByteOffset: 8, as: UInt32.self)
            base.storeBytes(of: UInt32(isRaw ? 1 : 0).littleEndian, toByteOffset: 12, as: UInt32.self)
            ciContext.render(img, toBitmap: base + 16, rowBytes: rowBytes,
                             bounds: CGRect(x: 0, y: 0, width: w, height: h), format: .RGBAh,
                             colorSpace: CGColorSpace(name: CGColorSpace.extendedLinearSRGB)!)
        }
        return out
    }
}

// MARK: - Web view with native file drops ----------------------------------------------------

final class DarkroomWebView: WKWebView {
    var onDropPaths: (([String]) -> Void)?
    override func draggingEntered(_ sender: NSDraggingInfo) -> NSDragOperation { .copy }
    override func draggingUpdated(_ sender: NSDraggingInfo) -> NSDragOperation { .copy }
    override func performDragOperation(_ sender: NSDraggingInfo) -> Bool {
        let urls = sender.draggingPasteboard.readObjects(forClasses: [NSURL.self],
                    options: [.urlReadingFileURLsOnly: true]) as? [URL] ?? []
        if urls.isEmpty { return super.performDragOperation(sender) }
        onDropPaths?(urls.map { $0.path }); return true
    }
}

// MARK: - App ------------------------------------------------------------------------------

final class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
    var window: NSWindow!
    var web: DarkroomWebView!
    var running: [Int: Process] = [:]
    var buffers: [String: Data] = [:]          // streamed export pixels, keyed by job
    var videos: [String: VideoJob] = [:]

    func applicationDidFinishLaunching(_ n: Notification) {
        let cfg = WKWebViewConfiguration()
        cfg.setURLSchemeHandler(SchemeHandler(), forURLScheme: "darkroom")
        cfg.userContentController.add(self, name: "native")
        cfg.preferences.setValue(true, forKey: "developerExtrasEnabled")
        cfg.websiteDataStore = .default()
        web = DarkroomWebView(frame: .zero, configuration: cfg)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.setValue(false, forKey: "drawsBackground")
        web.onDropPaths = { [weak self] paths in self?.emit("drop", paths) }

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1500, height: 940),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
                          backing: .buffered, defer: false)
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.title = "Splat Darkroom"
        window.appearance = NSAppearance(named: .darkAqua)
        window.backgroundColor = NSColor(calibratedWhite: 0.07, alpha: 1)
        window.minSize = NSSize(width: 1000, height: 640)
        window.contentView = web
        _ = window.setFrameAutosaveName("SplatDarkroomMain")
        if !window.setFrameUsingName("SplatDarkroomMain") { window.center() }
        window.makeKeyAndOrderFront(nil)
        buildMenu()
        load()
    }

    func load() {
        web.load(URLRequest(url: URL(string: "darkroom://app/index.html")!))
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ s: NSApplication) -> Bool { true }
    func applicationWillTerminate(_ n: Notification) { running.values.forEach { $0.terminate() } }

    // Menu -----------------------------------------------------------------------------------
    func buildMenu() {
        let main = NSMenu()
        func item(_ t: String, _ a: Selector?, _ k: String, _ m: NSEvent.ModifierFlags = .command) -> NSMenuItem {
            let i = NSMenuItem(title: t, action: a, keyEquivalent: k); i.keyEquivalentModifierMask = m; return i
        }
        func cmdItem(_ t: String, _ k: String, _ cmd: String, _ m: NSEvent.ModifierFlags = .command) -> NSMenuItem {
            let i = item(t, #selector(menuCmd(_:)), k, m); i.representedObject = cmd; return i
        }
        let appMenu = NSMenu()
        appMenu.addItem(item("About Splat Darkroom", #selector(NSApplication.orderFrontStandardAboutPanel(_:)), ""))
        appMenu.addItem(.separator())
        appMenu.addItem(item("Hide Splat Darkroom", #selector(NSApplication.hide(_:)), "h"))
        appMenu.addItem(item("Quit Splat Darkroom", #selector(NSApplication.terminate(_:)), "q"))
        let a = NSMenuItem(); a.submenu = appMenu; main.addItem(a)

        let file = NSMenu(title: "File")
        file.addItem(cmdItem("Import Photos…", "o", "import"))
        file.addItem(cmdItem("Open 3D Scan…", "o", "openScan", [.command, .shift]))
        file.addItem(cmdItem("New Scan from Capture…", "n", "newScan", [.command, .shift]))
        file.addItem(.separator())
        file.addItem(cmdItem("Export…", "e", "export"))
        let f = NSMenuItem(); f.submenu = file; main.addItem(f)

        let edit = NSMenu(title: "Edit")
        edit.addItem(cmdItem("Undo", "z", "undo"))
        edit.addItem(cmdItem("Redo", "z", "redo", [.command, .shift]))
        edit.addItem(.separator())
        edit.addItem(item("Cut", #selector(NSText.cut(_:)), "x"))
        edit.addItem(item("Copy", #selector(NSText.copy(_:)), "c"))
        edit.addItem(item("Paste", #selector(NSText.paste(_:)), "v"))
        edit.addItem(cmdItem("Select All", "a", "selectAll"))
        let e = NSMenuItem(); e.submenu = edit; main.addItem(e)

        let view = NSMenu(title: "View")
        view.addItem(item("Reload Darkroom", #selector(reloadUI), "r"))
        view.addItem(item("Enter Full Screen", #selector(NSWindow.toggleFullScreen(_:)), "f", [.command, .control]))
        let v = NSMenuItem(); v.submenu = view; main.addItem(v)

        let help = NSMenu(title: "Help")
        help.addItem(cmdItem("Check for Updates…", "u", "update", [.command, .shift]))
        help.addItem(cmdItem("Keyboard Shortcuts", "/", "shortcuts"))
        let h = NSMenuItem(); h.submenu = help; main.addItem(h)
        NSApp.mainMenu = main
    }
    @objc func reloadUI() { web.reloadFromOrigin() }
    @objc func menuCmd(_ s: NSMenuItem) { emit("menu", s.representedObject as? String ?? "") }

    // Bridge ---------------------------------------------------------------------------------
    func emit(_ event: String, _ payload: Any) {
        guard let d = try? JSONSerialization.data(withJSONObject: ["event": event, "data": payload]),
              let s = String(data: d, encoding: .utf8) else { return }
        web.evaluateJavaScript("window.__native && window.__native.event(\(s))", completionHandler: nil)
    }
    func resolve(_ id: Int, _ value: Any?, error: String? = nil) {
        var o: [String: Any] = ["id": id]
        if let v = value { o["value"] = v }
        if let e = error { o["error"] = e }
        guard let d = try? JSONSerialization.data(withJSONObject: o), let s = String(data: d, encoding: .utf8) else { return }
        web.evaluateJavaScript("window.__native && window.__native.resolve(\(s))", completionHandler: nil)
    }

    func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) {
        guard let body = m.body as? [String: Any], let cmd = body["cmd"] as? String else { return }
        let id = body["id"] as? Int ?? 0
        switch cmd {
        case "open":
            let p = NSOpenPanel()
            p.allowsMultipleSelection = body["multiple"] as? Bool ?? true
            p.canChooseDirectories = body["dirs"] as? Bool ?? false
            p.canChooseFiles = body["files"] as? Bool ?? true
            if let exts = body["exts"] as? [String], !exts.isEmpty {
                p.allowedContentTypes = exts.compactMap { UTType(filenameExtension: $0) }
            }
            if let t = body["title"] as? String { p.message = t }
            if let dir = body["dir"] as? String { p.directoryURL = URL(fileURLWithPath: dir) }
            p.beginSheetModal(for: window) { r in
                self.resolve(id, r == .OK ? p.urls.map { $0.path } : [])
            }
        case "save":
            let p = NSSavePanel()
            p.nameFieldStringValue = body["name"] as? String ?? "Untitled.jpg"
            if let dir = body["dir"] as? String { p.directoryURL = URL(fileURLWithPath: dir) }
            p.canCreateDirectories = true
            p.beginSheetModal(for: window) { r in
                guard r == .OK, let url = p.url else { self.resolve(id, nil); return }
                let b64 = (body["base64"] as? String) ?? ""
                if let data = Data(base64Encoded: b64) {
                    do { try data.write(to: url); self.resolve(id, url.path) }
                    catch { self.resolve(id, nil, error: error.localizedDescription) }
                } else { self.resolve(id, nil, error: "bad data") }
            }
        case "writeFile":   // silent write (e.g. batch export into a chosen folder)
            let path = body["path"] as? String ?? ""
            try? FileManager.default.createDirectory(at: URL(fileURLWithPath: path).deletingLastPathComponent(), withIntermediateDirectories: true)
            if let data = Data(base64Encoded: body["base64"] as? String ?? "") {
                do { try data.write(to: URL(fileURLWithPath: path)); resolve(id, path) }
                catch { resolve(id, nil, error: error.localizedDescription) }
            } else { resolve(id, nil, error: "bad data") }
        case "pickSave":     // choose a destination only; pixels are streamed afterwards
            let p = NSSavePanel()
            p.nameFieldStringValue = body["name"] as? String ?? "Untitled.tif"
            if let dir = body["dir"] as? String { p.directoryURL = URL(fileURLWithPath: dir) }
            p.canCreateDirectories = true
            p.beginSheetModal(for: window) { r in self.resolve(id, r == .OK ? p.url?.path : nil) }
        case "pickFolder":
            let p = NSOpenPanel(); p.canChooseFiles = false; p.canChooseDirectories = true; p.canCreateDirectories = true
            p.prompt = "Export Here"
            if let dir = body["dir"] as? String { p.directoryURL = URL(fileURLWithPath: dir) }
            p.beginSheetModal(for: window) { r in self.resolve(id, r == .OK ? p.url?.path : nil) }
        case "chunk":        // append base64 bytes to an export buffer
            let job = body["job"] as? String ?? ""
            if let d = Data(base64Encoded: body["base64"] as? String ?? "") { buffers[job, default: Data()].append(d); resolve(id, buffers[job]!.count) }
            else { resolve(id, nil, error: "bad chunk") }
        case "writeImage":
            let job = body["job"] as? String ?? ""
            let data = buffers.removeValue(forKey: job) ?? Data()
            do { resolve(id, try writeImage(data: data, body: body)) }
            catch { resolve(id, nil, error: error.localizedDescription) }
        case "videoBegin":
            do {
                let v = try VideoJob(path: body["path"] as? String ?? "", w: body["w"] as? Int ?? 1920, h: body["h"] as? Int ?? 1080, fps: body["fps"] as? Int ?? 30)
                let job = UUID().uuidString; videos[job] = v; resolve(id, job)
            } catch { resolve(id, nil, error: error.localizedDescription) }
        case "videoFrame":
            guard let v = videos[body["job"] as? String ?? ""], let d = Data(base64Encoded: body["base64"] as? String ?? "") else { resolve(id, nil, error: "no job"); return }
            v.append(jpeg: d) { ok in self.resolve(id, ok) }
        case "videoEnd":
            guard let v = videos.removeValue(forKey: body["job"] as? String ?? "") else { resolve(id, nil, error: "no job"); return }
            v.finish { path in self.resolve(id, path) }
        case "loadState":
            let f = splatDir.appendingPathComponent("library.json")
            resolve(id, (try? String(contentsOf: f, encoding: .utf8)) ?? "")
        case "saveState":
            let f = splatDir.appendingPathComponent("library.json")
            try? (body["json"] as? String ?? "").write(to: f, atomically: true, encoding: .utf8)
            resolve(id, true)
        case "reveal":
            if let p = body["path"] as? String { NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: p)]) }
            resolve(id, true)
        case "info":
            resolve(id, ["splatDir": splatDir.path, "appDir": appDir.path, "home": home.path, "native": 3,
                         "icloud": home.appendingPathComponent("Library/Mobile Documents/com~apple~CloudDocs").path,
                         "version": Bundle.main.infoDictionary?["CFBundleShortVersionString"] ?? "1"])
        case "listDir":
            let p = body["path"] as? String ?? ""
            let items = (try? FileManager.default.contentsOfDirectory(atPath: p)) ?? []
            resolve(id, items.sorted())
        case "stat":         // sizes of files (folders: total of their contents)
            let fm = FileManager.default
            var out: [[String: Any]] = []
            for p in (body["paths"] as? [String] ?? []) {
                var isDir: ObjCBool = false
                guard fm.fileExists(atPath: p, isDirectory: &isDir) else { out.append(["path": p, "size": -1]); continue }
                var size: Int64 = 0
                if isDir.boolValue {
                    if let en = fm.enumerator(at: URL(fileURLWithPath: p), includingPropertiesForKeys: [.fileSizeKey]) {
                        for case let u as URL in en { size += Int64((try? u.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0) }
                    }
                } else { size = Int64(((try? fm.attributesOfItem(atPath: p))?[.size] as? NSNumber)?.int64Value ?? 0) }
                let m = ((try? fm.attributesOfItem(atPath: p))?[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0
                out.append(["path": p, "size": size, "dir": isDir.boolValue, "mtime": m])
            }
            resolve(id, out)
        case "trash":        // move files to the Trash (recoverable)
            var n = 0
            for p in (body["paths"] as? [String] ?? []) { if (try? FileManager.default.trashItem(at: URL(fileURLWithPath: p), resultingItemURL: nil)) != nil { n += 1 } }
            resolve(id, n)
        case "update":       // run Splat/update.sh (check | apply); reports its output
            let mode = body["mode"] as? String ?? "check"
            let proc = Process(); proc.executableURL = URL(fileURLWithPath: "/bin/bash")
            proc.arguments = [splatDir.appendingPathComponent("update.sh").path, mode]
            var e = ProcessInfo.processInfo.environment
            e["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"; proc.environment = e
            proc.currentDirectoryURL = splatDir
            let pipe = Pipe(); proc.standardOutput = pipe; proc.standardError = pipe
            proc.terminationHandler = { p in
                let out = String(decoding: pipe.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
                DispatchQueue.main.async { self.resolve(id, ["code": Int(p.terminationStatus), "out": out]) }
            }
            do { try proc.run() } catch { resolve(id, nil, error: error.localizedDescription) }
        case "relaunch":
            let path = Bundle.main.bundlePath
            let p = Process(); p.executableURL = URL(fileURLWithPath: "/bin/sh")
            p.arguments = ["-c", "sleep 1; open \"\(path)\""]
            try? p.run(); resolve(id, true)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { NSApp.terminate(nil) }
        case "runPipeline":
            runPipeline(id: id, input: body["input"] as? String ?? "", env: body["env"] as? [String: String] ?? [:])
        case "cancelPipeline":
            running[body["job"] as? Int ?? -1]?.terminate(); resolve(id, true)
        default:
            resolve(id, nil, error: "unknown command \(cmd)")
        }
    }

    func runPipeline(id: Int, input: String, env: [String: String]) {
        let script = splatDir.appendingPathComponent("splat.sh").path
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/bin/bash")
        proc.arguments = [script, input]
        var e = ProcessInfo.processInfo.environment
        e["PATH"] = "\(splatDir.path)/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        e["VIEWER"] = "0"
        for (k, v) in env { e[k] = v }
        proc.environment = e
        proc.currentDirectoryURL = splatDir
        let pipe = Pipe()
        proc.standardOutput = pipe; proc.standardError = pipe
        pipe.fileHandleForReading.readabilityHandler = { h in
            let d = h.availableData
            if d.isEmpty { return }
            let s = String(decoding: d, as: UTF8.self)
            DispatchQueue.main.async { self.emit("pipelineLog", ["job": id, "text": s]) }
        }
        proc.terminationHandler = { p in
            pipe.fileHandleForReading.readabilityHandler = nil
            DispatchQueue.main.async {
                self.running[id] = nil
                let name = URL(fileURLWithPath: input).deletingPathExtension().lastPathComponent
                let ply = splatDir.appendingPathComponent("scans/\(name)/\(name).ply").path
                let ok = FileManager.default.fileExists(atPath: ply)
                self.resolve(id, ["code": Int(p.terminationStatus), "ply": ok ? ply : ""])
            }
        }
        do { try proc.run(); running[id] = proc; emit("pipelineStarted", ["job": id]) }
        catch { resolve(id, nil, error: error.localizedDescription) }
    }

    // WK UI: <input type=file> fallback, JS alerts
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let p = NSOpenPanel(); p.allowsMultipleSelection = parameters.allowsMultipleSelection
        p.canChooseDirectories = parameters.allowsDirectories
        p.beginSheetModal(for: window) { r in completionHandler(r == .OK ? p.urls : nil) }
    }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = NSAlert(); a.messageText = message; a.beginSheetModal(for: window) { _ in completionHandler() }
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = NSAlert(); a.messageText = message; a.addButton(withTitle: "OK"); a.addButton(withTitle: "Cancel")
        a.beginSheetModal(for: window) { r in completionHandler(r == .alertFirstButtonReturn) }
    }
    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let a = NSAlert(); a.messageText = prompt; a.addButton(withTitle: "OK"); a.addButton(withTitle: "Cancel")
        let f = NSTextField(frame: NSRect(x: 0, y: 0, width: 280, height: 24)); f.stringValue = defaultText ?? ""; a.accessoryView = f
        a.beginSheetModal(for: window) { r in completionHandler(r == .alertFirstButtonReturn ? f.stringValue : nil) }
    }
    func webView(_ webView: WKWebView, decidePolicyFor a: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let u = a.request.url, u.scheme == "http" || u.scheme == "https" {
            NSWorkspace.shared.open(u); decisionHandler(.cancel); return
        }
        decisionHandler(.allow)
    }
}



// MARK: - Image export (16-bit TIFF / JPEG / HEIC / PNG, Display P3, source metadata kept) ----

enum ExportError: Error, LocalizedError { case bad(String); var errorDescription: String? { if case .bad(let s) = self { return s }; return nil } }

extension AppDelegate {
    func writeImage(data: Data, body: [String: Any]) throws -> String {
        let w = body["w"] as? Int ?? 0, h = body["h"] as? Int ?? 0, bits = body["bits"] as? Int ?? 8
        let path = body["path"] as? String ?? ""
        let fmt = (body["fmt"] as? String ?? "jpeg").lowercased(), q = body["quality"] as? Double ?? 0.95
        let p3 = (body["space"] as? String ?? "p3") == "p3"
        let bpc = bits == 16 ? 2 : 1
        guard w > 0, h > 0, data.count == w * h * 4 * bpc else { throw ExportError.bad("pixel buffer size mismatch (\(data.count) vs \(w*h*4*bpc))") }
        let cs = CGColorSpace(name: p3 ? CGColorSpace.displayP3 : CGColorSpace.sRGB)!
        var info = CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue)
        if bits == 16 { info.insert(CGBitmapInfo(rawValue: CGImageByteOrderInfo.order16Little.rawValue)) }
        guard let prov = CGDataProvider(data: data as CFData),
              let img = CGImage(width: w, height: h, bitsPerComponent: 8 * bpc, bitsPerPixel: 32 * bpc, bytesPerRow: w * 4 * bpc,
                                space: cs, bitmapInfo: info, provider: prov, decode: nil, shouldInterpolate: false, intent: .defaultIntent)
        else { throw ExportError.bad("could not build image") }
        let type: UTType = fmt == "tiff" ? .tiff : fmt == "png" ? .png : fmt == "heic" ? .heic : .jpeg
        let url = URL(fileURLWithPath: path)
        guard let dest = CGImageDestinationCreateWithURL(url as CFURL, type.identifier as CFString, 1, nil) else { throw ExportError.bad("cannot write \(type.identifier)") }
        var props: [CFString: Any] = [:]
        // carry over camera metadata (EXIF, GPS, TIFF make/model, IPTC) from the original
        if let src = body["source"] as? String, !src.isEmpty, let isrc = CGImageSourceCreateWithURL(URL(fileURLWithPath: src) as CFURL, nil),
           let meta = CGImageSourceCopyPropertiesAtIndex(isrc, 0, nil) as? [CFString: Any] {
            for k in [kCGImagePropertyExifDictionary, kCGImagePropertyGPSDictionary, kCGImagePropertyIPTCDictionary, kCGImagePropertyExifAuxDictionary] { if let v = meta[k] { props[k] = v } }
            var tiff = (meta[kCGImagePropertyTIFFDictionary] as? [CFString: Any]) ?? [:]
            tiff[kCGImagePropertyTIFFOrientation] = 1
            props[kCGImagePropertyTIFFDictionary] = tiff
            if var exif = props[kCGImagePropertyExifDictionary] as? [CFString: Any] {
                exif[kCGImagePropertyExifPixelXDimension] = w; exif[kCGImagePropertyExifPixelYDimension] = h
                props[kCGImagePropertyExifDictionary] = exif
            }
        }
        props[kCGImagePropertyOrientation] = 1
        var tiff = (props[kCGImagePropertyTIFFDictionary] as? [CFString: Any]) ?? [:]
        tiff[kCGImagePropertyTIFFSoftware] = "Splat Darkroom"
        if let a = body["artist"] as? String { tiff[kCGImagePropertyTIFFArtist] = a }
        if fmt == "tiff" { tiff[kCGImagePropertyTIFFCompression] = 5 }   // LZW
        props[kCGImagePropertyTIFFDictionary] = tiff
        if fmt == "jpeg" || fmt == "heic" { props[kCGImageDestinationLossyCompressionQuality] = q }
        CGImageDestinationAddImage(dest, img, props as CFDictionary)
        guard CGImageDestinationFinalize(dest) else { throw ExportError.bad("write failed") }
        return path
    }
}

// MARK: - Orbit video (H.264 / HEVC .mov from streamed JPEG frames) ----------------------------

final class VideoJob {
    let writer: AVAssetWriter, input: AVAssetWriterInput, adaptor: AVAssetWriterInputPixelBufferAdaptor
    let w: Int, h: Int, fps: Int32; var n: Int64 = 0; let path: String
    let ci = CIContext()
    init(path: String, w: Int, h: Int, fps: Int) throws {
        self.path = path; self.w = w; self.h = h; self.fps = Int32(fps)
        try? FileManager.default.removeItem(atPath: path)
        writer = try AVAssetWriter(outputURL: URL(fileURLWithPath: path), fileType: .mov)
        input = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.hevc, AVVideoWidthKey: w, AVVideoHeightKey: h,
            AVVideoColorPropertiesKey: [AVVideoColorPrimariesKey: AVVideoColorPrimaries_P3_D65,
                                        AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
                                        AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2],
            AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: w * h * 12]])
        input.expectsMediaDataInRealTime = false
        adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey as String: w, kCVPixelBufferHeightKey as String: h])
        writer.add(input)
        guard writer.startWriting() else { throw writer.error ?? ExportError.bad("cannot start video") }
        writer.startSession(atSourceTime: .zero)
    }
    func append(jpeg: Data, done: @escaping (Bool) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            while !self.input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.005) }
            guard let img = CIImage(data: jpeg), let pool = self.adaptor.pixelBufferPool else { DispatchQueue.main.async { done(false) }; return }
            var pb: CVPixelBuffer?; CVPixelBufferPoolCreatePixelBuffer(nil, pool, &pb)
            guard let buf = pb else { DispatchQueue.main.async { done(false) }; return }
            self.ci.render(img, to: buf, bounds: CGRect(x: 0, y: 0, width: self.w, height: self.h), colorSpace: CGColorSpace(name: CGColorSpace.displayP3))
            let ok = self.adaptor.append(buf, withPresentationTime: CMTime(value: self.n, timescale: self.fps)); self.n += 1
            DispatchQueue.main.async { done(ok) }
        }
    }
    func finish(done: @escaping (String?) -> Void) {
        input.markAsFinished()
        writer.finishWriting { DispatchQueue.main.async { done(self.writer.status == .completed ? self.path : nil) } }
    }
}

// MARK: - Launch ---------------------------------------------------------------------------

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.activate(ignoringOtherApps: true)
app.run()
