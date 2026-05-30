import Foundation

final class AppConfig: ObservableObject {
    @Published var wsEndpoint: String {
        didSet { save() }
    }
    @Published var idToken: String {
        didSet { save() }
    }
    @Published var relayUrl: String {
        didSet { save() }
    }

    private let defaults = UserDefaults.standard

    init() {
        self.wsEndpoint = defaults.string(forKey: "autnio.wsEndpoint")
            ?? "wss://3cil79jtm9.execute-api.us-east-1.amazonaws.com/dev"
        self.idToken = defaults.string(forKey: "autnio.idToken") ?? "demo-token"
        self.relayUrl = defaults.string(forKey: "autnio.relayUrl")
            ?? "http://localhost:5174"
    }

    private func save() {
        defaults.set(wsEndpoint, forKey: "autnio.wsEndpoint")
        defaults.set(idToken, forKey: "autnio.idToken")
        defaults.set(relayUrl, forKey: "autnio.relayUrl")
    }

    var relayURLWithParams: URL? {
        var components = URLComponents(string: relayUrl)
        components?.queryItems = [
            URLQueryItem(name: "wsEndpoint", value: wsEndpoint),
            URLQueryItem(name: "idToken", value: idToken),
            URLQueryItem(name: "appMode", value: "macos"),
        ]
        return components?.url
    }
}
