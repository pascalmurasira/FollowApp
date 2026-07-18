import ActivityKit
import Foundation

@available(iOS 16.1, *)
struct FollowAppEventAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var capturedCount: Int
        var promiseCount: Int
        var updatedAt: Date

        init(capturedCount: Int, promiseCount: Int, updatedAt: Date = Date()) {
            self.capturedCount = max(0, capturedCount)
            self.promiseCount = max(0, promiseCount)
            self.updatedAt = updatedAt
        }
    }

    let eventID: String
    let eventName: String
}
