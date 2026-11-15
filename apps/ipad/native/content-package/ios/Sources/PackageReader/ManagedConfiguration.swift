import Foundation

/// Settings an MDM pushes as managed app configuration, which iOS stores in
/// the app's user defaults under `com.apple.configuration.managed`.
///
/// Keys:
///   serverUrl          https:// address of the SkillsLab server
///   signingPublicKey   base64 Ed25519 public key that releases must be signed with
public enum ManagedConfiguration {
    public static let defaultsKey = "com.apple.configuration.managed"
    public static let keys = ["serverUrl", "signingPublicKey"]

    /// The known keys that are set to a non-empty string. Anything else in
    /// the configuration is ignored.
    public static func read(from defaults: UserDefaults = .standard) -> [String: String] {
        let config = defaults.dictionary(forKey: defaultsKey) ?? [:]
        var values: [String: String] = [:]
        for key in keys {
            if let value = (config[key] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
               !value.isEmpty {
                values[key] = value
            }
        }
        return values
    }
}
