import Foundation
import Security

struct Credential: Codable {
    let id: String
    let origin: String
    let username: String
    let password: String
    let createdAt: Double
    let updatedAt: Double
}

struct Request: Codable {
    let action: String
    let id: String?
    let credential: Credential?
}

struct Response: Codable {
    let ok: Bool
    let credentials: [Credential]?
    let error: String?
}

let service = "com.lukilabs.craft-agent.browser-passwords"
let vaultAccount = "vault"
let encoder = JSONEncoder()
let decoder = JSONDecoder()

func emit(_ response: Response, code: Int32 = 0) -> Never {
    let data = try! encoder.encode(response)
    FileHandle.standardOutput.write(data)
    exit(code)
}

func listCredentials() throws -> [Credential] {
    for synchronizable in [true, false] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: vaultAccount,
            kSecReturnData as String: true
        ]
        if synchronizable {
            query[kSecAttrSynchronizable as String] = true
            query[kSecUseDataProtectionKeychain as String] = true
        }
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound || (synchronizable && (status == errSecParam || status == errSecMissingEntitlement)) { continue }
        guard status == errSecSuccess else { throw NSError(domain: NSOSStatusErrorDomain, code: Int(status)) }
        guard let data = result as? Data else { return [] }
        return try decoder.decode([Credential].self, from: data)
    }
    return []
}

func writeVault(_ credentials: [Credential]) throws {
    for synchronizable in [true, false] {
        var deleteQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: vaultAccount
        ]
        if synchronizable {
            deleteQuery[kSecAttrSynchronizable as String] = true
            deleteQuery[kSecUseDataProtectionKeychain as String] = true
        }
        SecItemDelete(deleteQuery as CFDictionary)
    }
    let addQuery: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: service,
        kSecAttrAccount as String: vaultAccount,
        kSecAttrSynchronizable as String: true,
        kSecUseDataProtectionKeychain as String: true,
        kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlocked,
        kSecValueData as String: try encoder.encode(credentials)
    ]
    var status = SecItemAdd(addQuery as CFDictionary, nil)
    if status == errSecParam || status == errSecMissingEntitlement {
        var localQuery = addQuery
        localQuery.removeValue(forKey: kSecAttrSynchronizable as String)
        localQuery.removeValue(forKey: kSecUseDataProtectionKeychain as String)
        status = SecItemAdd(localQuery as CFDictionary, nil)
    }
    guard status == errSecSuccess else { throw NSError(domain: NSOSStatusErrorDomain, code: Int(status)) }
}

func save(_ credential: Credential) throws {
    var credentials = try listCredentials()
    if let index = credentials.firstIndex(where: { $0.id == credential.id || ($0.origin == credential.origin && $0.username == credential.username) }) {
        credentials[index] = credential
    } else {
        credentials.append(credential)
    }
    try writeVault(credentials)
}

func remove(_ id: String) throws {
    try writeVault(try listCredentials().filter { $0.id != id })
}

do {
    let input = FileHandle.standardInput.readDataToEndOfFile()
    let request = try decoder.decode(Request.self, from: input)
    switch request.action {
    case "list":
        emit(Response(ok: true, credentials: try listCredentials(), error: nil))
    case "save":
        guard let credential = request.credential else { throw NSError(domain: "BrowserKeychain", code: 1) }
        try save(credential)
        emit(Response(ok: true, credentials: nil, error: nil))
    case "delete":
        guard let id = request.id else { throw NSError(domain: "BrowserKeychain", code: 2) }
        try remove(id)
        emit(Response(ok: true, credentials: nil, error: nil))
    default:
        throw NSError(domain: "BrowserKeychain", code: 3)
    }
} catch {
    emit(Response(ok: false, credentials: nil, error: error.localizedDescription), code: 1)
}
