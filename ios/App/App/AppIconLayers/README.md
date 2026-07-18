# FollowApp layered app icon

`FollowApp.icon` is the canonical Icon Composer package compiled by Xcode for
current Apple platforms. It mirrors the in-product `NudgeLogo`: one memory
bubble and one spark, rather than the older generic double-chat mark. The Xcode
target uses the `FollowApp` app-icon name and keeps the compatibility asset
catalog for older deployment paths.

The sibling SVG files are editable 1024×1024 sources. To rebuild the package in
Icon Composer, import them in numeric order:

1. `01-background.svg` as the opaque background.
2. `02-memory-bubble.svg` as the primary translucent foreground layer.
3. `03-memory-spark.svg` as the top specular layer.

Keep the supplied 1024×1024 canvas and let Icon Composer supply the system mask,
depth, translucency and appearance variants. Do not bake shadows, highlights or
rounded app-icon corners into the layers. `FollowApp-AppIcon.svg` is the flat
composite source used to generate the compatibility PNG on older systems.
