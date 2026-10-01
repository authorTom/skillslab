// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SkillslabContentPackage",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "SkillslabContentPackage",
            targets: ["ContentPackagePlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        // The archive and copy logic, free of Capacitor so it can be tested
        // on its own.
        .target(
            name: "PackageReader",
            path: "ios/Sources/PackageReader"),
        .target(
            name: "ContentPackagePlugin",
            dependencies: [
                "PackageReader",
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/ContentPackagePlugin"),
        .testTarget(
            name: "PackageReaderTests",
            dependencies: ["PackageReader"],
            path: "ios/Tests/PackageReaderTests")
    ]
)
