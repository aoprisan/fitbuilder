import UIKit
import UniformTypeIdentifiers

/// "Share to Gym Log" — takes the text shared from another app (Claude's reply
/// to a Fuel meal estimate or menu plan) and hands it to the main app through
/// its `gymlog-share://` URL scheme. AppDelegate reloads the web view with
/// `?text=…`, the same entry point the PWA share target and the Android intent
/// use, and Fuel opens with the reply read. No UI, no App Group, nothing stored.
@objc(ShareViewController)
final class ShareViewController: UIViewController {

    private var handled = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard !handled else { return }
        handled = true
        loadSharedText { [weak self] text in
            DispatchQueue.main.async { self?.forward(text) }
        }
    }

    /// The first plain-text (or, failing that, URL) attachment, joined with the item's own text.
    private func loadSharedText(_ done: @escaping (String?) -> Void) {
        let items = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
        let providers = items.flatMap { $0.attachments ?? [] }
        let textType = UTType.plainText.identifier
        let urlType = UTType.url.identifier

        if let provider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(textType) }) {
            provider.loadItem(forTypeIdentifier: textType, options: nil) { item, _ in
                if let s = item as? String { return done(s) }
                if let d = item as? Data { return done(String(data: d, encoding: .utf8)) }
                if let u = item as? URL { return done(try? String(contentsOf: u, encoding: .utf8)) }
                done(nil)
            }
            return
        }
        if let provider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(urlType) }) {
            provider.loadItem(forTypeIdentifier: urlType, options: nil) { item, _ in
                done((item as? URL)?.absoluteString)
            }
            return
        }
        done(items.compactMap { $0.attributedContentText?.string }.first)
    }

    private func forward(_ text: String?) {
        guard let text = text?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else {
            return finish()
        }
        var components = URLComponents()
        components.scheme = "gymlog-share"
        components.host = "fuel"
        components.queryItems = [URLQueryItem(name: "text", value: text)]
        guard let url = components.url, openHostApp(url) else {
            // Couldn't reach the app: leave the reply on the clipboard so
            // Fuel's "Paste reply" still works.
            UIPasteboard.general.string = text
            return finish()
        }
        finish()
    }

    /// Extensions have no `UIApplication.shared`, and `open(_:options:)` is
    /// marked unavailable to them at compile time. The application object is
    /// still in the responder chain, so find it and call
    /// `openURL:options:completionHandler:` through the runtime — the route
    /// that keeps working on iOS 18 (the old one-argument `openURL:` is a no-op).
    private func openHostApp(_ url: URL) -> Bool {
        let selector = NSSelectorFromString("openURL:options:completionHandler:")
        guard let appClass = NSClassFromString("UIApplication") else { return false }
        var responder: UIResponder? = self
        while let r = responder {
            if r.isKind(of: appClass), r.responds(to: selector) {
                typealias OpenURL = @convention(c) (AnyObject, Selector, NSURL, NSDictionary, AnyObject?) -> Void
                let open = unsafeBitCast(r.method(for: selector), to: OpenURL.self)
                open(r, selector, url as NSURL, NSDictionary(), nil)
                return true
            }
            responder = r.next
        }
        return false
    }

    private func finish() {
        extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }
}
