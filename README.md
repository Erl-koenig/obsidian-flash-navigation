# Flash Navigation for Obsidian

A powerful navigation plugin for Obsidian that lets you quickly jump to any visible text using search labels and enhanced character motions. Inspired by flash.nvim and similar tools.

![demo](demo.gif)

## ✨ Features

-   **🔍 Smart Search**: Type characters to highlight matching text throughout your document
-   **🏷️ Jump Labels**: Automatically assigns labels to matches for instant navigation
-   **⚡ Fast Navigation**: Jump to any visible location with a single keypress
-   **🎨 Customizable Appearance**: Fully customizable colors and styling
-   **📝 Precise Highlighting**: Only highlights the exact characters you've typed

## 🎬 How It Works

1. **Start Flash Mode**: Activate the plugin (default: `s` in Vim mode)
2. **Type to Search**: Start typing characters - matching text gets highlighted in cyan
3. **See Labels**: Jump labels appear next to matches (a, b, c, d, etc.)
4. **Jump**: Press any label character to instantly jump to that location
5. **Continue or Exit**: Keep typing to refine your search, or press `Escape` to exit

## 🚀 Installation

### From Obsidian Community Plugins

1. Open Obsidian Settings
2. Go to Community Plugins and disable Safe Mode
3. Click Browse and search for "Flash Navigation"
4. Install and enable the plugin

### Manual Installation

1. Download the latest release from GitHub
2. Extract the files to `VaultFolder/.obsidian/plugins/obsidian-flash-navigation/`
3. Reload Obsidian and enable the plugin in Settings

## ⚙️ Setup

### Basic Usage

Add a command to trigger flash navigation. You can use:

-   Command Palette: Search for "Start Flash Navigation"
-   Hotkey: Set a custom hotkey in Obsidian Settings > Hotkeys

### Vim Mode Setup (Recommended)

If you use Vim mode with the Vimrc plugin, add this to your `.obsidian.vimrc`:

```vim
" Unmap the default 's' command and remap to flash navigation
nunmap s
exmap flashNav obcommand flash-navigation:start-flash-navigation
nmap s :flashNav<CR>
```

## 🎮 Usage

### Navigation

-   **Start**: Trigger the flash navigation command
-   **Search**: Type any characters to find matches
-   **Jump**: Press a label character (a-z, A-Z, 0-9) to jump to that location
-   **Refine**: Continue typing to narrow down matches
-   **Exit**: Press `Escape` or `Backspace` until the search is empty

### Example Workflow

```
1. Press 's' to start flash mode
2. Type "hel" - all instances of "hel" get highlighted
3. See labels: hel[a]lo, hel[b]p, hel[c]icopter
4. Press 'a' to jump to "hello"
```

## 🎨 Customization

The plugin offers extensive customization options in Settings:

### Search Behavior

-   **Case Sensitive**: Toggle case-sensitive search
-   **Label Characters**: Customize which characters are used for labels. Any extra characters found are displayed as `?`

### Visual Styling

-   **Dim Color**: Color for non-matching text
-   **Match Color**: Color for highlighted matching text
-   **Match Font Weight**: Normal or bold for matches

### Label Styling

-   **Label Background Color**: Background color for jump labels
-   **Label Text Color**: Text color for jump labels
-   **Label Font Weight**: Normal or bold for labels

## 🎯 Default Settings

The plugin comes with the following defaults:

-   **Dim Color**: `rgba(128, 128, 128, 0.5)` - Subtle gray for non-matching text
-   **Match Color**: `rgb(0, 191, 255)` - Bright cyan for highlighted matches
-   **Label Background**: `#a3be8c` - Soft green background for labels
-   **Label Text**: `black` - High contrast text on labels

## 🗺️ Roadmap

Have a feature request? Open an issue on GitHub!

-   Visual feedback when typing characters
-   Replace the next character with the label for jumping instead of inserting it (avoids layout change)
-   Different behavior when scrolling (exit flash mode or load more labels)
-   Smart Theme Colors: Automatically use theme accent colors and adapt to light/dark mode
-   Performance: Optimize for large documents (10,000+ lines)
-   ...

## 🤝 Contributing

Contributions are welcome! Please feel free to:

-   Report bugs or request features via GitHub Issues
-   Submit pull requests for improvements
-   Share feedback and suggestions

## 🙏 Acknowledgments

-   Inspired by [flash.nvim](https://github.com/folke/flash.nvim) and [flash.vscode](https://github.com/cunbidun/flash.vscode)
-   Built for the [Obsidian](https://obsidian.md) community
-   Uses CodeMirror 6 decorations for precise text highlighting

## 📄 License

This project is licensed under the MIT License.

## Say Thanks 🙏

This plugin is developed by [Erl-koenig](https://github.com/Erl-koenig).

If you find this plugin helpful, consider supporting its development

[<img src="https://cdn.buymeacoffee.com/buttons/v2/default-violet.png" alt="BuyMeACoffee" width="100">](https://www.buymeacoffee.com/erlkoenig)

[![GitHub Sponsors](https://img.shields.io/github/sponsors/Erl-koenig?style=social)](https://github.com/sponsors/Erl-koenig)
