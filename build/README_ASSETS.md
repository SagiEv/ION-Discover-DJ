# NSIS Branding Assets

This folder contains placeholders and configurations for the Windows Installer (NSIS).
You will need to replace the placeholder images with your actual branding images.

## Required Assets

1. **installerSidebar.bmp**: Displayed on the left side of the installer wizard.
   - Recommended dimensions: 164x314 pixels.
   - Must be a BMP file.
2. **uninstallerSidebar.bmp**: Displayed on the left side of the uninstaller wizard.
   - Recommended dimensions: 164x314 pixels.
   - Must be a BMP file.

Currently, the build is configured to point to these files in `package.json`. Make sure you create valid `.bmp` files with these exact names before running `npm run build`, otherwise `electron-builder` will fail.
