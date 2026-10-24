# Twitch Smooth Scroll

A lightweight Chrome/Chromium extension that smoothly follows new Twitch chat messages.

- Author: **Tenkayro**
- Manifest V3
- Compatible with the native Twitch chat and 7TV
- Automatically pauses when you scroll up in chat
- Does not modify messages, emotes, badges, or the 7TV DOM
- Supports automatic and manual language selection

## Installation

1. Open `chrome://extensions/` in Chrome.
2. Enable **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select this project directory.
5. Reload any Twitch tabs that were already open.

Use the extension icon to enable or disable smooth scrolling, adjust its speed, and select a language.

> If Twitch ToolKit is installed at the same time, disable its own **Smooth Scrolling** option to prevent two scroll animations from competing with each other.

## Creating a release

Install the development dependencies once:

```bash
npm install
```

Start the interactive release workflow:

```bash
npm run release
```

The terminal interface supports Patch, Minor, Major, and custom `X.Y.Z` versions. It validates the extension, runs the tests, updates the manifest and npm metadata, and creates a clean archive at:

```text
release/twitch-smooth-scroll-vVERSION.zip
```

Only files required by the extension are included in the archive. Tests, development dependencies, Git data, source release scripts, and previous releases are excluded.

## Publishing a GitHub Release

The release workflow can also:

1. Create a version commit.
2. Push the current branch.
3. Create a `vX.Y.Z` Git tag and GitHub Release.
4. Generate release notes automatically.
5. Upload the extension ZIP as a release asset.
6. Mark the release as the latest version.

Before publishing to GitHub:

- Install the GitHub CLI (`gh`).
- Sign in with `gh auth login`.
- Commit or stash all existing changes.
- Ensure the current branch has an upstream and is fully synchronized.

The workflow stops before changing the version if these checks fail.

## Technical notes

The scrolling concept and short linear animation were derived from the locally provided Twitch ToolKit version. This extension contains only the smooth-scrolling functionality and uses its own chat-container detection designed for Twitch navigation and 7TV compatibility.
