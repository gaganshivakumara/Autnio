import SwiftUI
import WebKit

struct RelayWebView: NSViewRepresentable {
    let url: URL?

    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        return WKWebView(frame: .zero, configuration: config)
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {
        guard let url else { return }
        if nsView.url != url {
            nsView.load(URLRequest(url: url))
        }
    }
}
